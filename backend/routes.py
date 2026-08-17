"""API routes for SolGrid Thermal Sync."""

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
from flask import Blueprint, jsonify, request

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.solGrid_engine import SolGridEngine
from config import CITY, STATE

bp = Blueprint("api", __name__)
engine = SolGridEngine()

VERSION = "1.0.0"

# Phoenix August profile, stands in until Prophet lands in Phase 3.
FORECAST_DAYS = [
    {"t_ambient": 42.0, "t_roof": 62.2, "loss_pct": 15.8, "action": "Run misting through the 12:00-16:00 peak window."},
    {"t_ambient": 43.0, "t_roof": 63.5, "loss_pct": 17.1, "action": "Pre-cool the array at 10:00 and hold misting until 17:00."},
    {"t_ambient": 44.5, "t_roof": 65.0, "loss_pct": 18.9, "action": "Peak heat day: run full misting plus forced ventilation all afternoon."},
    {"t_ambient": 43.8, "t_roof": 64.1, "loss_pct": 18.2, "action": "Maintain full cooling and defer any rooftop maintenance."},
    {"t_ambient": 41.5, "t_roof": 60.8, "loss_pct": 15.1, "action": "Standard misting schedule; verify nozzle pressure before noon."},
    {"t_ambient": 39.5, "t_roof": 57.4, "loss_pct": 13.6, "action": "Reduced misting is sufficient; good window for panel cleaning."},
    {"t_ambient": 38.0, "t_roof": 56.2, "loss_pct": 13.0, "action": "Lowest-stress day of the week; schedule inspections and repairs."},
]


def risk_level(loss_pct):
    """Classify a percentage-point thermal loss (e.g. 15.8 for 15.8%)."""
    if loss_pct < 8:
        return "low"
    if loss_pct <= 14:
        return "moderate"
    return "high"


def _thermal_args(body):
    """Pull and validate thermal inputs from a request body.
    
    Accepts t_ambient as the base input (or t_roof as fallback), along with ghi, wind_speed, albedo, and rated_kw.
    """
    if body.get("t_ambient") is None and body.get("t_roof") is None:
        raise ValueError("missing required field(s): t_ambient (or t_roof)")

    required = ["ghi", "wind_speed", "albedo", "rated_kw"]
    missing = [key for key in required if body.get(key) is None]
    if missing:
        raise ValueError(f"missing required field(s): {', '.join(missing)}")

    try:
        args = {key: float(body[key]) for key in required}
        if body.get("t_ambient") is not None:
            args["t_ambient"] = float(body["t_ambient"])
        if body.get("t_roof") is not None:
            args["t_roof"] = float(body["t_roof"])
        return args
    except (TypeError, ValueError):
        raise ValueError("thermal inputs must all be numeric")


def _optional_float(body, key):
    if body.get(key) is None:
        return None
    try:
        return float(body[key])
    except (TypeError, ValueError):
        raise ValueError(f"{key} must be numeric")


@bp.get("/health")
def health():
    return jsonify({
        "project": "SolGrid Thermal Sync",
        "version": VERSION,
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "engine": {
            "loaded": True,
            "anomaly_detector_trained": engine.isolation_forest is not None,
            "panel_capacity_kw": engine.panel_capacity_kw,
            "electricity_rate_usd": engine.electricity_rate_usd,
        },
    })


@bp.post("/analyze")
def analyze():
    body = request.get_json(silent=True) or {}
    try:
        args = _thermal_args(body)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    metrics = engine.calculate_thermal_metrics(**args)
    return jsonify({
        **metrics,
        "monthly_loss_usd": metrics["monthly_dollar_loss"],
        "building_id": body.get("building_id"),
        "label": body.get("label"),
    })


@bp.post("/simulate")
def simulate():
    body = request.get_json(silent=True) or {}
    try:
        args = _thermal_args(body)
        new_albedo = _optional_float(body, "new_albedo")
        misting_intensity = _optional_float(body, "misting_intensity") or 0.0
        forced_wind = _optional_float(body, "forced_wind") or 0.0
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    result = engine.simulate_intervention(
        **args,
        new_albedo=new_albedo,
        misting_intensity=misting_intensity,
        forced_wind=forced_wind,
    )
    return jsonify({
        **result,
        "building_id": body.get("building_id"),
        "label": body.get("label"),
    })


@bp.post("/portfolio")
def portfolio():
    body = request.get_json(silent=True) or {}
    buildings = body.get("buildings")
    if not isinstance(buildings, list) or not buildings:
        return jsonify({"error": "buildings must be a non-empty array"}), 400

    try:
        budget = float(body.get("budget", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "budget must be numeric"}), 400

    rows = []
    for index, building in enumerate(buildings):
        try:
            args = _thermal_args(building)
        except ValueError as exc:
            return jsonify({"error": f"buildings[{index}]: {exc}"}), 400
        metrics = engine.calculate_thermal_metrics(**args)
        rows.append({
            "building_id": building.get("building_id", f"B{index + 1:03d}"),
            "label": building.get("label"),
            **metrics,
        })

    scored = engine.detect_anomalies(pd.DataFrame(rows))
    allocation = engine.optimize_roi(scored, budget)

    total_loss = float(scored["monthly_dollar_loss"].sum())
    anomaly_count = int(scored["is_anomaly"].sum())

    return jsonify({
        "buildings": scored.to_dict(orient="records"),
        "roi_allocation": allocation,
        "portfolio_summary": {
            "building_count": len(rows),
            "total_monthly_loss_usd": round(total_loss, 2),
            "total_monthly_recoverable_usd": allocation["total_monthly_recovered"],
            "total_annual_recoverable_usd": allocation["total_annual_recovered"],
            "anomaly_count": anomaly_count,
            "budget": round(budget, 2),
            "budget_spent": allocation["total_spent"],
            "budget_remaining": allocation["remaining_budget"],
            "mean_risk_score": round(float(scored["risk_score"].mean()), 2),
        },
    })


@bp.get("/forecast")
def forecast():
    today = date.today()
    days = []
    for offset, entry in enumerate(FORECAST_DAYS):
        day = today + timedelta(days=offset)
        days.append({
            "day_name": day.strftime("%A"),
            "date": day.isoformat(),
            "predicted_t_ambient": entry.get("t_ambient", 42.0),
            "predicted_t_roof": entry["t_roof"],
            "predicted_loss_pct": entry["loss_pct"],
            "risk_level": risk_level(entry["loss_pct"]),
            "recommended_action": entry["action"],
        })

    return jsonify({
        "location": f"{CITY}, {STATE}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "horizon_days": len(days),
        "forecast": days,
    })
