"""Fetch Phoenix solar resource data from the NREL Solar Resource API.

Usage: python data/fetch_nrel.py
"""

import json
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config


def fetch_solar_resource():
    if not config.NREL_API_KEY:
        raise SystemExit("NREL_API_KEY not set. Copy .env.example to .env and fill it in.")

    params = {
        "api_key": config.NREL_API_KEY,
        "lat": config.LAT,
        "lon": config.LON,
    }

    response = requests.get(config.NREL_URL, params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def main():
    data = fetch_solar_resource()
    config.RAW_NREL_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.RAW_NREL_PATH.write_text(json.dumps(data, indent=2))
    print(f"Saved NREL response to {config.RAW_NREL_PATH}")


if __name__ == "__main__":
    main()
