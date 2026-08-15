"""Smoke test: exercise all five SolGrid endpoints and assert demo-readiness."""

import json
import sys

import requests

BASE = "http://127.0.0.1:5000"

DEMO = {
    "t_roof": 62.5,
    "ghi": 950,
    "wind_speed": 1.2,
    "albedo": 0.15,
    "rated_kw": 1000,
    "label": "1234 N Central Ave",
}

PORTFOLIO = {
    "buildings": [
        {"building_id": "B001", "label": "1234 N Central Ave", "t_roof": 64.0, "ghi": 950, "wind_speed": 1.2, "albedo": 0.15, "rated_kw": 1000},
        {"building_id": "B002", "label": "88 W Jefferson St", "t_roof": 58.5, "ghi": 950, "wind_speed": 1.8, "albedo": 0.25, "rated_kw": 350},
        {"building_id": "B003", "label": "4501 E Camelback Rd", "t_roof": 52.0, "ghi": 950, "wind_speed": 2.6, "albedo": 0.45, "rated_kw": 250},
        {"building_id": "B004", "label": "770 S Mill Ave", "t_roof": 45.5, "ghi": 950, "wind_speed": 3.2, "albedo": 0.65, "rated_kw": 180},
        {"building_id": "B005", "label": "2020 N 7th St", "t_roof": 39.0, "ghi": 950, "wind_speed": 4.0, "albedo": 0.80, "rated_kw": 100},
    ],
    "budget": 50000,
}

results = {}
failures = []


def show(title, payload):
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")
    print(json.dumps(payload, indent=2))


def check(name, actual, threshold, comparison=">"):
    ok = actual > threshold if comparison == ">" else actual >= threshold
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {name}: {actual} {comparison} {threshold}")
    if not ok:
        failures.append(f"{name} = {actual}, expected {comparison} {threshold}")


# 1. health
r = requests.get(f"{BASE}/health", timeout=10)
r.raise_for_status()
results["health"] = r.json()
show("1. GET /health", results["health"])

# 2. analyze
r = requests.post(f"{BASE}/analyze", json=DEMO, timeout=10)
r.raise_for_status()
results["analyze"] = r.json()
show("2. POST /analyze", results["analyze"])

# 3. simulate, all three interventions stacked
sim_body = {**DEMO, "new_albedo": 0.75, "misting_intensity": 0.6, "forced_wind": 2.0}
r = requests.post(f"{BASE}/simulate", json=sim_body, timeout=10)
r.raise_for_status()
results["simulate"] = r.json()
show("3. POST /simulate (albedo 0.75 + misting 0.6 + forced wind 2.0)", results["simulate"])

# 4. portfolio
r = requests.post(f"{BASE}/portfolio", json=PORTFOLIO, timeout=30)
r.raise_for_status()
results["portfolio"] = r.json()
show("4. POST /portfolio (5 buildings, $50,000 budget)", results["portfolio"])

# 5. forecast
r = requests.get(f"{BASE}/forecast", timeout=10)
r.raise_for_status()
results["forecast"] = r.json()
show("5. GET /forecast", results["forecast"])

# assertions
print(f"\n{'=' * 70}\nASSERTIONS\n{'=' * 70}")
check("analyze monthly_loss_usd", results["analyze"]["monthly_loss_usd"], 2000)
check("simulate monthly_recovered_usd", results["simulate"]["monthly_recovered_usd"], 400)
check("simulate temp_drop_c", results["simulate"]["temp_drop_c"], 5)

anomalies = results["portfolio"]["portfolio_summary"]["anomaly_count"]
ok = 1 <= anomalies <= 2
print(f"  [{'PASS' if ok else 'FAIL'}] portfolio anomaly_count: {anomalies} in range 1-2")
if not ok:
    failures.append(f"anomaly_count = {anomalies}, expected 1-2")

print(f"\n{'=' * 70}")
if failures:
    print(f"{len(failures)} ASSERTION FAILURE(S):")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("ALL 5 ENDPOINTS OK, ALL ASSERTIONS PASSED")
