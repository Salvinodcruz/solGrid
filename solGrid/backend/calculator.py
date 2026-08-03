"""Efficiency loss, revenue loss, and intervention ranking."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import ELECTRICITY_RATE_USD, PANEL_CAPACITY_KW, STC_TEMP, TEMP_COEFFICIENT

INTERVENTIONS = [
    {
        "name": "Reflective roof coating",
        "description": "High-albedo coating on surrounding roof surface to cut reflected and re-radiated heat load on the array.",
        "est_cost_usd": 15000,
        "saving_share": 0.18,
    },
    {
        "name": "Smart water misting",
        "description": "Sensor-triggered evaporative misting on panel undersides during peak-heat windows.",
        "est_cost_usd": 12000,
        "saving_share": 0.25,
    },
    {
        "name": "Panel spacing adjustment",
        "description": "Increased row and mount clearance to improve convective airflow behind modules.",
        "est_cost_usd": 8000,
        "saving_share": 0.10,
    },
]


def efficiency_loss(t_cell):
    """Fractional efficiency lost to heat above STC (0.18 == 18%)."""
    return max(0, abs(TEMP_COEFFICIENT) * (t_cell - STC_TEMP))


def dollar_loss(eff_loss, capacity_kw=None, rate=None, peak_hours=6):
    """Monthly USD of generation lost at the given fractional efficiency loss."""
    if capacity_kw is None:
        capacity_kw = PANEL_CAPACITY_KW
    if rate is None:
        rate = ELECTRICITY_RATE_USD
    return capacity_kw * eff_loss * peak_hours * rate * 30


def rank_interventions(monthly_loss_usd):
    """Rank interventions by payback period, fastest first."""
    ranked = []
    for item in INTERVENTIONS:
        monthly_saving = monthly_loss_usd * item["saving_share"]
        payback = item["est_cost_usd"] / monthly_saving if monthly_saving else float("inf")
        ranked.append({
            "name": item["name"],
            "description": item["description"],
            "est_cost_usd": round(float(item["est_cost_usd"]), 2),
            "monthly_saving_usd": round(monthly_saving, 2),
            "payback_months": round(payback, 2),
        })

    ranked.sort(key=lambda x: x["payback_months"])
    for rank, entry in enumerate(ranked, start=1):
        entry["roi_rank"] = rank
    return ranked
