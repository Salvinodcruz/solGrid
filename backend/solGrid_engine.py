"""Unified thermal, anomaly, and ROI engine for SolGrid Thermal Sync."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    ELECTRICITY_RATE_USD,
    NOCT,
    PANEL_CAPACITY_KW,
    STC_TEMP,
    TEMP_COEFFICIENT,
)

# Maximum roof surface temperature elevation above ambient for a pure black roof (albedo=0) at peak GHI (1000 W/m2).
# For a dark commercial roof (albedo ~ 0.15-0.20) at peak daylight (high GHI), this gives a ~19-21 C offset (within 15-25 C).
ROOF_THERMAL_OFFSET_MAX_C = 25.0

# A unit rise in roof albedo drops roof surface temperature by this much.
# Published cool-roof measurements land in the 10-20 C/unit range.
ALBEDO_COOLING_C_PER_UNIT = 12.0

# Full-intensity evaporative misting drops roof temperature by this much.
MISTING_MAX_COOLING_C = 8.0

PEAK_HOURS_PER_DAY = 6
DAYS_PER_MONTH = 30

ANOMALY_FEATURES = ["risk_score", "loss_pct", "t_roof"]

INTERVENTION_COSTS = {
    "albedo_coating": 15000.0,
    "misting_system": 12000.0,
    "forced_ventilation": 5000.0,
}

ROI_OPTIONS = [
    {"type": "reflective_coating", "cost": 15000.0, "saving_share": 0.18},
    {"type": "smart_misting", "cost": 12000.0, "saving_share": 0.25},
    {"type": "panel_spacing", "cost": 8000.0, "saving_share": 0.10},
]


def _payback(cost, monthly_saving):
    if monthly_saving <= 0:
        return float("inf")
    return cost / monthly_saving


class SolGridEngine:
    def __init__(self):
        self.noct = NOCT
        self.temp_coefficient = TEMP_COEFFICIENT
        self.stc_temp = STC_TEMP
        self.panel_capacity_kw = PANEL_CAPACITY_KW
        self.electricity_rate_usd = ELECTRICITY_RATE_USD
        self.isolation_forest = None
        self.baseline_risk_median = None

    def calculate_thermal_offset(self, ghi, albedo):
        """Dynamic conversion offset: scales with solar irradiance (GHI) and roof material absorptivity (1 - albedo).

        - For dark commercial roofs (albedo ~ 0.15-0.20) during peak daylight (high GHI ~ 1000 W/m2),
          thermal_offset is roughly 15 C to 25 C hotter than ambient.
        - When GHI is 0 (nighttime), thermal_offset is 0 C (t_roof roughly equals t_ambient).
        """
        ghi_norm = max(0.0, float(ghi)) / 1000.0
        absorptivity = max(0.0, min(1.0, 1.0 - float(albedo)))
        return absorptivity * ghi_norm * ROOF_THERMAL_OFFSET_MAX_C

    def calculate_roof_temp(self, t_ambient, ghi, albedo):
        """Dynamic conversion step: t_roof = t_ambient + thermal_offset."""
        return float(t_ambient) + self.calculate_thermal_offset(ghi, albedo)

    def calculate_thermal_metrics(self, t_ambient=None, ghi=0.0, wind_speed=0.0, albedo=0.2, rated_kw=250.0, t_roof=None):
        """Thermal loss, cell temperature, and revenue impact via the Faiman wind-corrected NOCT model.

        Takes t_ambient as the base input, calculates t_roof dynamically based on GHI and albedo,
        and then calculates t_cell and financial losses.
        """
        ghi = float(ghi)
        albedo = float(albedo)
        wind_speed = float(wind_speed)
        rated_kw = float(rated_kw)

        thermal_offset = self.calculate_thermal_offset(ghi, albedo)

        if t_ambient is not None:
            t_ambient = float(t_ambient)
            t_roof = t_ambient + thermal_offset
        elif t_roof is not None:
            t_roof = float(t_roof)
            t_ambient = t_roof - thermal_offset
        else:
            raise ValueError("Either t_ambient or t_roof must be provided")

        wind_factor = 9.5 / (5.7 + 3.8 * max(float(wind_speed), 0.1))
        t_cell = t_roof + ((self.noct - 20) / 800.0) * ghi * wind_factor
        temp_delta = max(0.0, t_cell - 25.0)
        loss_pct = temp_delta * abs(self.temp_coefficient)

        expected_kwh = rated_kw * (ghi / 1000.0)
        lost_kwh = expected_kwh * loss_pct
        hourly_dollar_loss = lost_kwh * self.electricity_rate_usd
        monthly_dollar_loss = hourly_dollar_loss * PEAK_HOURS_PER_DAY * DAYS_PER_MONTH
        annual_dollar_loss = monthly_dollar_loss * 12.0

        risk_score = min(100.0, (
            0.45 * min(t_roof / 65.0, 1.0)
            + 0.40 * min(loss_pct / 0.20, 1.0)
            + 0.15 * (1.0 - albedo)
        ) * 100)

        return {
            "t_ambient": round(t_ambient, 2),
            "thermal_offset": round(thermal_offset, 2),
            "t_roof": round(t_roof, 2),
            "ghi": round(ghi, 2),
            "wind_speed": round(float(wind_speed), 2),
            "albedo": round(albedo, 2),
            "rated_kw": round(rated_kw, 2),
            "wind_factor": round(wind_factor, 2),
            "t_cell": round(t_cell, 2),
            "temp_delta": round(temp_delta, 2),
            "loss_pct": round(loss_pct, 4),
            "efficiency_loss_pct": round(loss_pct, 4),
            "expected_kwh": round(expected_kwh, 2),
            "lost_kwh": round(lost_kwh, 2),
            "hourly_dollar_loss": round(hourly_dollar_loss, 2),
            "monthly_dollar_loss": round(monthly_dollar_loss, 2),
            "annual_dollar_loss": round(annual_dollar_loss, 2),
            "annual_loss_usd": round(annual_dollar_loss, 2),
            "risk_score": round(risk_score, 2),
        }

    def simulate_intervention(self, t_ambient=None, ghi=0.0, wind_speed=0.0, albedo=0.2, rated_kw=250.0,
                              new_albedo=None, misting_intensity=0.0, forced_wind=0.0, t_roof=None):
        """Compare baseline thermal metrics against a stacked intervention scenario.

        Takes t_ambient as base input, calculates baseline t_roof, applies intervention offsets
        (albedo coating, misting, ventilation), and computes post-intervention metrics.
        """
        print(f"[SolGridEngine] simulate_intervention received rated_kw: {rated_kw}")
        albedo = float(albedo)
        ghi = float(ghi)
        wind_speed = float(wind_speed)
        rated_kw = float(rated_kw)
        misting_intensity = min(1.0, max(0.0, float(misting_intensity)))
        forced_wind = max(0.0, float(forced_wind))

        before = self.calculate_thermal_metrics(
            t_ambient=t_ambient, ghi=ghi, wind_speed=wind_speed, albedo=albedo, rated_kw=rated_kw, t_roof=t_roof
        )
        base_t_ambient = before["t_ambient"]
        base_t_roof = before["t_roof"]

        adj_albedo = albedo if new_albedo is None else float(new_albedo)
        offset_before = before["thermal_offset"]
        offset_after = self.calculate_thermal_offset(ghi, adj_albedo)
        albedo_cooling = max(0.0, offset_before - offset_after)
        misting_cooling = misting_intensity * MISTING_MAX_COOLING_C

        adj_t_roof = base_t_roof - albedo_cooling - misting_cooling
        adj_wind_speed = wind_speed + forced_wind

        after = self.calculate_thermal_metrics(
            t_ambient=base_t_ambient,
            ghi=ghi,
            wind_speed=adj_wind_speed,
            albedo=adj_albedo,
            rated_kw=rated_kw,
            t_roof=adj_t_roof,
        )

        temp_drop_c = before["t_cell"] - after["t_cell"]
        monthly_recovered_usd = before["monthly_dollar_loss"] - after["monthly_dollar_loss"]

        applied = []
        if albedo_cooling > 0:
            applied.append("albedo_coating")
        if misting_cooling > 0:
            applied.append("misting_system")
        if forced_wind > 0:
            applied.append("forced_ventilation")

        payback_months = {}
        for name, cost in INTERVENTION_COSTS.items():
            months = _payback(cost, monthly_recovered_usd)
            payback_months[name] = None if months == float("inf") else round(months, 2)

        return {
            "before": before,
            "after": after,
            "interventions_applied": applied,
            "albedo_cooling_c": round(albedo_cooling, 2),
            "misting_cooling_c": round(misting_cooling, 2),
            "forced_wind_added_ms": round(forced_wind, 2),
            "roof_temp_drop_c": round(base_t_roof - adj_t_roof, 2),
            "temp_drop_c": round(temp_drop_c, 2),
            "loss_pct_reduction": round(before["loss_pct"] - after["loss_pct"], 4),
            "monthly_recovered_usd": round(monthly_recovered_usd, 2),
            "annual_recovered_usd": round(monthly_recovered_usd * 12, 2),
            "payback_months": payback_months,
        }

    def train_anomaly_detector(self, df):
        """Fit an IsolationForest on synthetic Phoenix baselines plus the real rows.

        Baselines are generated by pushing realistic Phoenix summer inputs through
        calculate_thermal_metrics, so the "normal" envelope matches the distribution
        the engine actually produces rather than a hand-picked one.
        """
        rng = np.random.default_rng(42)
        rows = []
        for _ in range(200):
            metrics = self.calculate_thermal_metrics(
                t_ambient=rng.uniform(32.0, 44.0),
                ghi=950.0,
                wind_speed=rng.uniform(1.0, 4.5),
                albedo=rng.uniform(0.15, 0.80),
                rated_kw=rng.uniform(100.0, 500.0),
            )
            rows.append({key: metrics[key] for key in ANOMALY_FEATURES})
        synthetic = pd.DataFrame(rows)

        # Only above-median-risk outliers count as anomalies; a building that is
        # unusual because it runs cool is not a problem worth flagging.
        self.baseline_risk_median = float(synthetic["risk_score"].median())

        real = pd.DataFrame(df)[ANOMALY_FEATURES].astype(float)
        combined = pd.concat([synthetic, real], ignore_index=True)

        model = IsolationForest(contamination=0.1, random_state=42)
        model.fit(combined)
        self.isolation_forest = model
        return model

    def detect_anomalies(self, df):
        """Flag thermal underperformers, returning rows ranked by risk score."""
        if self.isolation_forest is None:
            self.train_anomaly_detector(df)

        out = pd.DataFrame(df).copy()
        features = out[ANOMALY_FEATURES].astype(float)
        out["anomaly_score"] = self.isolation_forest.predict(features)
        out["is_anomaly"] = (
            (out["anomaly_score"] == -1)
            & (out["risk_score"] > self.baseline_risk_median)
        )
        return out.sort_values("risk_score", ascending=False).reset_index(drop=True)

    def optimize_roi(self, buildings_df, available_budget):
        """Greedily allocate a fixed budget to the best-payback intervention per building."""
        available_budget = float(available_budget)
        candidates = []

        for _, row in pd.DataFrame(buildings_df).iterrows():
            monthly_loss = float(row["monthly_dollar_loss"])

            best = None
            for option in ROI_OPTIONS:
                monthly_saving = monthly_loss * option["saving_share"]
                annual_saving = monthly_saving * 12
                ratio = annual_saving / option["cost"]
                scored = {
                    "building_id": row["building_id"],
                    "type": option["type"],
                    "cost": option["cost"],
                    "monthly_saving": round(monthly_saving, 2),
                    "annual_saving": round(annual_saving, 2),
                    "roi_ratio": round(ratio, 4),
                    "payback_months": _payback(option["cost"], monthly_saving),
                    "is_anomaly": bool(row.get("is_anomaly", False)),
                }
                if best is None or scored["roi_ratio"] > best["roi_ratio"]:
                    best = scored
            candidates.append(best)

        candidates.sort(key=lambda c: c["payback_months"])

        allocated = []
        total_spent = 0.0
        total_monthly_recovered = 0.0
        for candidate in candidates:
            if total_spent + candidate["cost"] > available_budget:
                continue
            total_spent += candidate["cost"]
            total_monthly_recovered += candidate["monthly_saving"]
            payback = candidate["payback_months"]
            allocated.append({
                **candidate,
                "payback_months": None if payback == float("inf") else round(payback, 2),
            })

        return {
            "allocated": allocated,
            "total_spent": round(total_spent, 2),
            "remaining_budget": round(available_budget - total_spent, 2),
            "total_monthly_recovered": round(total_monthly_recovered, 2),
            "total_annual_recovered": round(total_monthly_recovered * 12, 2),
            "buildings_funded": len(allocated),
            "buildings_skipped": len(candidates) - len(allocated),
        }

    def calculate_live_pv_metrics(self, data=None, rated_kw=None, albedo=0.20, wind_speed=2.0):
        """Recalculate PV panel thermal degradation and real-time efficiency from processed FortyGuard data."""
        import json
        from pathlib import Path
        import config

        if data is None:
            path = getattr(config, "PROCESSED_FORTYGUARD_PATH", config.DATA_DIR / "processed_fortyguard.json")
            if not Path(path).exists():
                raise FileNotFoundError(f"Processed FortyGuard data not found at {path}. Run data/fetch_fortyguard.py first.")
            data = json.loads(Path(path).read_text(encoding="utf-8"))

        kw = float(rated_kw if rated_kw is not None else self.panel_capacity_kw)
        t_amb = float(data.get("apparent_temperature_celsius") or data.get("t_ambient", 40.0))
        ghi = float(data.get("ghi") or (data.get("solar_clearsky", {}).get("ghi", 950.0)))

        live_metrics = self.calculate_thermal_metrics(
            t_ambient=t_amb,
            ghi=ghi,
            wind_speed=wind_speed,
            albedo=albedo,
            rated_kw=kw,
        )

        hourly_series = data.get("hourly_timeseries", {})
        hourly_profiles = []
        if "apparent_temperature_celsius" in hourly_series and "timestamps" in hourly_series:
            temps = hourly_series["apparent_temperature_celsius"]
            times = hourly_series["timestamps"]
            for ts, t in zip(times, temps):
                h_metrics = self.calculate_thermal_metrics(
                    t_ambient=t,
                    ghi=ghi,
                    wind_speed=wind_speed,
                    albedo=albedo,
                    rated_kw=kw,
                )
                hourly_profiles.append({
                    "timestamp": ts,
                    "apparent_temperature_celsius": t,
                    "t_cell": h_metrics["t_cell"],
                    "efficiency_loss_pct": h_metrics["efficiency_loss_pct"],
                    "hourly_dollar_loss": h_metrics["hourly_dollar_loss"],
                    "risk_score": h_metrics["risk_score"],
                })

        return {
            "source": "FortyGuard Environmental API",
            "last_updated": data.get("timestamp"),
            "location": {
                "city": data.get("city", config.CITY),
                "state": data.get("state", config.STATE),
                "latitude": data.get("latitude", config.LAT),
                "longitude": data.get("longitude", config.LON),
            },
            "environmental_parameters": {
                "apparent_temperature_celsius": data.get("apparent_temperature_celsius"),
                "heat_index_celsius": data.get("heat_index_celsius"),
                "wet_bulb_temperature_celsius": data.get("wet_bulb_temperature_celsius"),
                "relative_humidity_percent": data.get("relative_humidity_percent"),
            },
            "solar_clearsky": data.get("solar_clearsky", {"ghi": ghi}),
            "pv_thermal_analysis": live_metrics,
            "hourly_profiles": hourly_profiles,
        }

    def rank_interventions(self, monthly_loss_usd, rated_kw):
        mw = rated_kw / 1000

        interventions = [
            {
                "name": "Utility Reflective Coating Program",
                "description": "High-albedo coating across all "
                              "panel surfaces and inter-row ground. "
                              "Reduces site thermal load.",
                "est_cost_usd": round(mw * 8500),
                "monthly_saving_pct": 0.18,
                "type": "coating"
            },
            {
                "name": "Automated Misting Grid",
                "description": "Evaporative cooling grid across "
                              "panel rows, activated 10am-4pm. "
                              "Reduces cell temp by 6-10C.",
                "est_cost_usd": round(mw * 12000),
                "monthly_saving_pct": 0.25,
                "type": "misting"
            },
            {
                "name": "Smart Panel Tilt Optimization",
                "description": "AI-driven tilt angle adjustment "
                              "to maximize inter-row airflow "
                              "during peak heat hours.",
                "est_cost_usd": round(mw * 3500),
                "monthly_saving_pct": 0.10,
                "type": "tilt"
            },
            {
                "name": "Perimeter Windbreak Planting",
                "description": "Strategic vegetation to reduce "
                              "thermal load naturally. "
                              "15-20 year compounding benefit.",
                "est_cost_usd": round(mw * 5000),
                "monthly_saving_pct": 0.08,
                "type": "vegetation"
            }
        ]

        for i in interventions:
            monthly_saving = monthly_loss_usd * i["monthly_saving_pct"]
            i["monthly_saving_usd"] = round(monthly_saving, 2)
            i["annual_saving_usd"] = round(monthly_saving * 12, 2)
            i["payback_months"] = round(
                i["est_cost_usd"] / monthly_saving, 1
            ) if monthly_saving > 0 else 999
            i["payback_years"] = round(i["payback_months"] / 12, 1)
            i["roi_5yr"] = round(
                (monthly_saving * 60 - i["est_cost_usd"]) /
                i["est_cost_usd"] * 100, 1
            )

        return sorted(interventions, 
                      key=lambda x: x["payback_months"])

