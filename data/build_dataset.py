"""Merge FortyGuard + NREL raw responses into the modeling dataset.

Usage: python data/build_dataset.py
"""

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun",
          "jul", "aug", "sep", "oct", "nov", "dec"]


def load_fortyguard():
    raw = json.loads(config.RAW_FORTYGUARD_PATH.read_text())
    records = raw.get("data") or raw.get("results") or raw
    df = pd.DataFrame(records)
    df = df.rename(columns={
        "time": "timestamp",
        "datetime": "timestamp",
        "temperature": "t_ambient",
        "temp_c": "t_ambient",
        "wind": "wind_speed",
    })
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df


def load_nrel_monthly_ghi():
    """NREL solar_resource returns monthly average GHI in kWh/m2/day."""
    raw = json.loads(config.RAW_NREL_PATH.read_text())
    monthly = raw["outputs"]["avg_ghi"]["monthly"]
    # Spread daily insolation over ~8 peak-sun hours to approximate W/m2.
    return {i + 1: (monthly[m] * 1000) / 8 for i, m in enumerate(MONTHS)}


def build():
    df = load_fortyguard()
    ghi_by_month = load_nrel_monthly_ghi()

    df["irradiance"] = df["timestamp"].dt.month.map(ghi_by_month)
    if "wind_speed" not in df.columns:
        df["wind_speed"] = 0.0

    df["t_cell"] = df["t_ambient"] + ((config.NOCT - 20) / 800) * df["irradiance"]
    df["efficiency_loss"] = config.TEMP_COEFFICIENT * (df["t_cell"] - config.STC_TEMP).clip(lower=0)
    df["dollar_loss"] = (
        abs(df["efficiency_loss"])
        * config.PANEL_CAPACITY_KW
        * config.ELECTRICITY_RATE_USD
    )

    config.DATASET_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.DATASET_PATH, index=False)
    print(f"Wrote {len(df)} rows to {config.DATASET_PATH}")
    return df


if __name__ == "__main__":
    build()
