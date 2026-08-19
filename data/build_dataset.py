"""Build modeling dataset from FortyGuard processed heat and solar intelligence.

Uses processed_fortyguard.json as the primary data source.
Extracts peak hours (indices 10-16, representing 10:00 to 16:00) for GHI and temperature,
calculating peak_ghi, peak_t_ambient, and t_roof = peak_t_ambient + 20.

Usage: python data/build_dataset.py
"""

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from backend.solGrid_engine import SolGridEngine


def load_processed_fortyguard():
    """Load FortyGuard processed intelligence from processed_fortyguard.json."""
    if not config.PROCESSED_FORTYGUARD_PATH.exists():
        raise FileNotFoundError(
            f"{config.PROCESSED_FORTYGUARD_PATH} not found. Run python data/fetch_fortyguard.py first."
        )
    return json.loads(config.PROCESSED_FORTYGUARD_PATH.read_text(encoding="utf-8"))


def build():
    data = load_processed_fortyguard()
    hourly = data.get("hourly_timeseries", {})

    timestamps = hourly.get("timestamps", [])
    t_ambient_list = hourly.get("apparent_temperature_celsius", [])
    ghi_list = hourly.get("ghi", [])
    dni_list = hourly.get("dni", [])
    dhi_list = hourly.get("dhi", [])
    rh_list = hourly.get("relative_humidity_percent", [])
    hi_list = hourly.get("heat_index_celsius", [])
    wb_list = hourly.get("wet_bulb_temperature_celsius", [])

    # If hourly series missing, create defaults
    if not t_ambient_list:
        t_ambient_list = [float(data.get("apparent_temperature_celsius", 42.0))] * 24
    if not ghi_list:
        ghi_list = [float(data.get("ghi", 950.0))] * 24

    # Extract peak hours only (indices 10 to 16 inclusive: 10am to 4pm)
    peak_slice = slice(10, 17)
    peak_t_ambient_slice = t_ambient_list[peak_slice] if len(t_ambient_list) >= 17 else t_ambient_list
    peak_ghi_slice = ghi_list[peak_slice] if len(ghi_list) >= 17 else ghi_list

    peak_ghi = float(max(peak_ghi_slice))
    peak_t_ambient = float(max(peak_t_ambient_slice))
    t_roof = peak_t_ambient + 20.0  # Standard roof surface offset for dark commercial roof

    print(f"[build_dataset] Peak Ambient Temp (10am-4pm) : {peak_t_ambient:.2f} °C")
    print(f"[build_dataset] Peak GHI (10am-4pm)          : {peak_ghi:.2f} W/m²")
    print(f"[build_dataset] Roof Surface Temp (t_roof)    : {t_roof:.2f} °C")

    engine = SolGridEngine()

    # Build dataset rows for peak hours (and 24-hr profile)
    rows = []
    num_hours = max(len(timestamps), len(t_ambient_list), 24)
    for i in range(num_hours):
        ts = timestamps[i] if i < len(timestamps) else f"2026-08-18T{i:02d}:00:00-07:00"
        t_amb = t_ambient_list[i] if i < len(t_ambient_list) else peak_t_ambient
        ghi_val = ghi_list[i] if i < len(ghi_list) else peak_ghi
        dni_val = dni_list[i] if i < len(dni_list) else 0.0
        dhi_val = dhi_list[i] if i < len(dhi_list) else 0.0
        rh_val = rh_list[i] if i < len(rh_list) else 20.0
        hi_val = hi_list[i] if i < len(hi_list) else t_amb
        wb_val = wb_list[i] if i < len(wb_list) else 20.0

        is_peak_hour = (10 <= i <= 16)
        roof_temp = t_amb + 20.0 if is_peak_hour else (t_amb + (20.0 * (ghi_val / max(peak_ghi, 1.0))))

        metrics = engine.calculate_thermal_metrics(
            t_roof=roof_temp,
            ghi=ghi_val,
            wind_speed=2.0,
            albedo=0.15,
            rated_kw=config.PANEL_CAPACITY_KW,
        )

        rows.append({
            "timestamp": ts,
            "hour": i,
            "is_peak_hour": is_peak_hour,
            "t_ambient": round(t_amb, 2),
            "t_roof": round(roof_temp, 2),
            "ghi": round(ghi_val, 2),
            "dni": round(dni_val, 2),
            "dhi": round(dhi_val, 2),
            "relative_humidity_percent": round(rh_val, 2),
            "heat_index_celsius": round(hi_val, 2),
            "wet_bulb_temperature_celsius": round(wb_val, 2),
            "t_cell": metrics["t_cell"],
            "temp_delta": metrics["temp_delta"],
            "efficiency_loss": metrics["efficiency_loss_pct"],
            "lost_kwh": metrics["lost_kwh"],
            "dollar_loss": metrics["hourly_dollar_loss"],
            "risk_score": metrics["risk_score"],
        })

    df = pd.DataFrame(rows)
    config.DATASET_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.DATASET_PATH, index=False)
    print(f"Wrote {len(df)} rows to {config.DATASET_PATH}")
    return df


if __name__ == "__main__":
    build()
