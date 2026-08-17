"""Fetch Phoenix heat intelligence from the FortyGuard API.

Run this on Aug 3 once you have your API key.

Usage: python data/fetch_fortyguard.py
"""

import json
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config


def fetch_heat_intelligence():
    if not config.FORTYGUARD_API_KEY:
        raise SystemExit("FORTYGUARD_API_KEY not set. Copy .env.example to .env and fill it in.")

    payload = {
        "latitude": config.LAT,
        "longitude": config.LON,
        "city": config.CITY,
        "state": config.STATE,
    }
    headers = {
        "api-key": os.getenv("FORTYGUARD_API_KEY"),
        "Content-Type": "application/json",
    }

    response = requests.post(config.FORTYGUARD_URL, json=payload, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()


def main():
    data = fetch_heat_intelligence()
    config.RAW_FORTYGUARD_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.RAW_FORTYGUARD_PATH.write_text(json.dumps(data, indent=2))
    print(f"Saved FortyGuard response to {config.RAW_FORTYGUARD_PATH}")


if __name__ == "__main__":
    main()
