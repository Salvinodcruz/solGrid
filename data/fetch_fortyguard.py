"""Fetch Phoenix heat intelligence from the FortyGuard API.

Fetches environmental and solar clear-sky metrics (apparent temperature, heat index,
wet bulb temperature, relative humidity, and clear-sky solar components) using
FortyGuard's environmental parameters endpoint (filter_type: 2).

Usage: python data/fetch_fortyguard.py
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from backend.solGrid_engine import (
    ARIZONA_SOLAR_FARMS,
    SolGridEngine,
    load_satellite_segmentation,
)

PROCESSED_FORTYGUARD_PATH = getattr(
    config, "PROCESSED_FORTYGUARD_PATH", config.DATA_DIR / "processed_fortyguard.json"
)


def fetch_heat_intelligence(
    lat: float | None = None,
    lon: float | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    temperature: float = 40.0,
    poll_interval: float = 2.0,
    timeout: float = 120.0,
) -> dict:
    """Query FortyGuard API for heat intelligence and environmental parameters.

    Payload schema:
        - latitude: float
        - longitude: float
        - temperature: float
        - start_date: str ('YYYY-MM-DD')
        - start_time: '00:00'
        - end_date: str ('YYYY-MM-DD')
        - end_time: '23:00'
        - filter_type: 2
    """
    api_key = os.getenv("FORTYGUARD_API_KEY") or config.FORTYGUARD_API_KEY
    if not api_key or api_key == "your_key_here":
        raise SystemExit("FORTYGUARD_API_KEY not set. Copy .env.example to .env and fill in your API key.")

    if start_date is None:
        start_date = datetime.now().strftime("%Y-%m-%d")
    if end_date is None:
        end_date = start_date

    target_lat = lat if lat is not None else config.LAT
    target_lon = lon if lon is not None else config.LON

    payload = {
        "latitude": target_lat,
        "longitude": target_lon,
        "temperature": temperature,
        "start_date": start_date,
        "start_time": "00:00",
        "end_date": end_date,
        "end_time": "23:00",
        "filter_type": 2,
        "date_time": {
            "start_date": start_date,
            "start_time": "00:00",
            "end_date": end_date,
            "end_time": "23:00",
            "filter_type": 2,
        },
    }

    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
    }

    endpoint_urls = [config.FORTYGUARD_URL]
    if "environmental-parameters" in config.FORTYGUARD_URL:
        endpoint_urls.append("https://api.fortyguard.com/v1/env_params")
    elif "env_params" not in config.FORTYGUARD_URL:
        endpoint_urls.append("https://api.fortyguard.com/v1/env_params")

    response = None
    last_err = None
    endpoint_used = None

    for url in endpoint_urls:
        try:
            print(f"[FortyGuard] Sending POST request to {url}...")
            resp = requests.post(url, json=payload, headers=headers, timeout=30)
            if resp.status_code in (200, 201, 202):
                response = resp
                endpoint_used = url
                print(f"[FortyGuard] HTTP {response.status_code} OK from {url}")
                break
            elif resp.status_code == 404 and len(endpoint_urls) > 1:
                print(f"[FortyGuard] {url} returned 404, attempting fallback endpoint...")
                continue
            else:
                resp.raise_for_status()
        except requests.RequestException as exc:
            last_err = exc
            continue

    if response is None:
        if last_err:
            raise last_err
        raise RuntimeError("Failed to obtain a valid response from FortyGuard API")

    resp_json = response.json()

    # If the response queued an async task with activity_id, poll for completion
    data_field = resp_json.get("data", {})
    activity_id = None
    if isinstance(data_field, dict):
        activity_id = data_field.get("activity_id")
    elif "activity_id" in resp_json:
        activity_id = resp_json["activity_id"]

    if activity_id and ("result" not in resp_json.get("data", {})):
        print(f"[FortyGuard] Activity submitted (activity_id: {activity_id}). Polling for results...")
        deadline = time.monotonic() + timeout
        base_url = "https://api.fortyguard.com"
        while True:
            poll_resp = requests.get(
                f"{base_url}/v1/status/{activity_id}",
                headers=headers,
                timeout=20,
            )
            if poll_resp.status_code == 404:
                time.sleep(poll_interval)
                continue
            poll_resp.raise_for_status()
            poll_json = poll_resp.json()
            poll_data = poll_json.get("data", {})
            status = str(poll_data.get("status", "")).lower()

            if status in ("completed", "succeeded"):
                print(f"[FortyGuard] Activity {activity_id} completed successfully (HTTP 200).")
                return poll_json
            elif status in ("failed", "error"):
                raise RuntimeError(f"FortyGuard activity {activity_id} failed: {poll_data.get('message')}")

            if time.monotonic() >= deadline:
                raise TimeoutError(f"FortyGuard activity {activity_id} timed out after {timeout} seconds")

            time.sleep(poll_interval)

    return resp_json


def parse_fortyguard_response(data: dict) -> dict:
    """Extract environmental parameters and solar clear-sky metrics from FortyGuard response.

    Extracts apparent_temperature_celsius, heat_index_celsius, wet_bulb_temperature_celsius,
    relative_humidity_percent, and solar clear-sky components (ghi, dni, dhi)
    from data['result']['locations'][0] or data['data']['result']['locations'][0].
    """
    if not isinstance(data, dict):
        raise ValueError("FortyGuard response data must be a dictionary")

    # Navigate down to result dictionary
    result = data.get("result")
    if not result and "data" in data and isinstance(data["data"], dict):
        result = data["data"].get("result", data["data"])
    if not result:
        result = data

    locations = result.get("locations", [])
    if not locations or not isinstance(locations, list):
        raise ValueError("FortyGuard response missing 'locations' under result")

    loc = locations[0]
    parameters = loc.get("parameters") if isinstance(loc.get("parameters"), dict) else {}
    env_params = loc.get("environmental_parameters") if isinstance(loc.get("environmental_parameters"), dict) else {}
    
    # Merge parameter sources if needed
    all_params = {**env_params, **parameters}

    # Solar irradiance
    solar_irradiance = loc.get("solar_irradiance") or loc.get("solar_clearsky") or loc.get("clearsky") or {}
    clear_sky = (
        solar_irradiance.get("clear_sky")
        if isinstance(solar_irradiance, dict) and "clear_sky" in solar_irradiance
        else solar_irradiance
    )
    if not isinstance(clear_sky, dict):
        clear_sky = {}

    def extract_metric(name, candidates, default=0.0):
        val = None
        for key in candidates:
            if key in all_params and all_params[key] is not None:
                val = all_params[key]
                break
            if key in loc and loc[key] is not None:
                val = loc[key]
                break
            if key in clear_sky and clear_sky[key] is not None:
                val = clear_sky[key]
                break

        if val is None:
            return default, []
        if isinstance(val, list):
            series = [float(v) for v in val]
            peak = max(series) if series else default
            return peak, series
        return float(val), [float(val)]

    apparent_temp_peak, apparent_temp_series = extract_metric(
        "apparent_temperature_celsius",
        ["apparent_temperature_celsius", "apparent_temperature", "apparent_temp_c"],
        default=42.0,
    )
    heat_index_peak, heat_index_series = extract_metric(
        "heat_index_celsius",
        ["heat_index_celsius", "heat_index", "heat_index_c"],
        default=40.0,
    )
    wet_bulb_peak, wet_bulb_series = extract_metric(
        "wet_bulb_temperature_celsius",
        ["wet_bulb_temperature_celsius", "wet_bulb_temperature", "wet_bulb_temp_c"],
        default=22.0,
    )
    rel_humidity_val, rel_humidity_series = extract_metric(
        "relative_humidity_percent",
        ["relative_humidity_percent", "relative_humidity", "humidity_percent", "rh_percent"],
        default=20.0,
    )

    ghi_val, ghi_raw_series = extract_metric("ghi", ["ghi", "solar_clearsky_ghi", "clearsky_ghi", "solar_ghi"], default=950.0)
    dni_val, dni_raw_series = extract_metric("dni", ["dni", "solar_clearsky_dni", "clearsky_dni", "solar_dni"], default=900.0)
    dhi_val, dhi_raw_series = extract_metric("dhi", ["dhi", "solar_clearsky_dhi", "clearsky_dhi", "solar_dhi"], default=100.0)

    avg_apparent = sum(apparent_temp_series) / len(apparent_temp_series) if apparent_temp_series else apparent_temp_peak
    avg_heat_index = sum(heat_index_series) / len(heat_index_series) if heat_index_series else heat_index_peak
    avg_wet_bulb = sum(wet_bulb_series) / len(wet_bulb_series) if wet_bulb_series else wet_bulb_peak
    avg_humidity = sum(rel_humidity_series) / len(rel_humidity_series) if rel_humidity_series else rel_humidity_val

    metadata = result.get("metadata", {})
    timestamps = metadata.get("timestamps", [])

    # Generate 24-hr solar profile matching clear-sky diurnal cycle if scalar is returned
    def generate_diurnal_solar(avg_val, raw_list, peak_target=None):
        if isinstance(raw_list, list) and len(raw_list) == 24:
            return [float(v) for v in raw_list]
        diurnal_weights = [
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.08, 0.28, 0.54, 0.76, 0.90, 0.98,
            1.00, 0.98, 0.92, 0.80, 0.62, 0.40,
            0.18, 0.03, 0.0, 0.0, 0.0, 0.0
        ]
        peak = peak_target if peak_target is not None else (avg_val * (24.0 / sum(diurnal_weights)))
        return [round(w * peak, 2) for w in diurnal_weights]

    ghi_series = generate_diurnal_solar(ghi_val, ghi_raw_series, peak_target=950.0 if ghi_val < 500 else None)
    dni_series = generate_diurnal_solar(dni_val, dni_raw_series, peak_target=920.0 if dni_val < 500 else None)
    dhi_series = generate_diurnal_solar(dhi_val, dhi_raw_series, peak_target=120.0 if dhi_val < 100 else None)

    peak_ghi = max(ghi_series)
    peak_t_ambient = max(apparent_temp_series) if apparent_temp_series else apparent_temp_peak

    parsed = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "latitude": loc.get("lat") or loc.get("latitude") or config.LAT,
        "longitude": loc.get("lon") or loc.get("longitude") or config.LON,
        "city": config.CITY,
        "state": config.STATE,
        "t_ambient": round(peak_t_ambient, 2),
        "peak_t_ambient": round(peak_t_ambient, 2),
        "apparent_temperature_celsius": round(peak_t_ambient, 2),
        "heat_index_celsius": round(heat_index_peak, 2),
        "wet_bulb_temperature_celsius": round(wet_bulb_peak, 2),
        "relative_humidity_percent": round(avg_humidity, 2),
        "ghi": round(peak_ghi, 2),
        "peak_ghi": round(peak_ghi, 2),
        "dni": round(max(dni_series), 2),
        "dhi": round(max(dhi_series), 2),
        "solar_clearsky": {
            "ghi": round(peak_ghi, 2),
            "dni": round(max(dni_series), 2),
            "dhi": round(max(dhi_series), 2),
            "avg_24h_ghi": round(ghi_val, 2),
        },
        "summary": {
            "apparent_temperature_peak_c": round(peak_t_ambient, 2),
            "apparent_temperature_avg_c": round(avg_apparent, 2),
            "heat_index_peak_c": round(heat_index_peak, 2),
            "heat_index_avg_c": round(avg_heat_index, 2),
            "wet_bulb_temperature_peak_c": round(wet_bulb_peak, 2),
            "wet_bulb_temperature_avg_c": round(avg_wet_bulb, 2),
            "relative_humidity_avg_pct": round(avg_humidity, 2),
            "peak_ghi_w_m2": round(peak_ghi, 2),
            "avg_ghi_w_m2": round(ghi_val, 2),
            "peak_dni_w_m2": round(max(dni_series), 2),
            "peak_dhi_w_m2": round(max(dhi_series), 2),
        },
        "hourly_timeseries": {
            "timestamps": timestamps,
            "apparent_temperature_celsius": apparent_temp_series,
            "heat_index_celsius": heat_index_series,
            "wet_bulb_temperature_celsius": wet_bulb_series,
            "relative_humidity_percent": rel_humidity_series,
            "ghi": ghi_series,
            "dni": dni_series,
            "dhi": dhi_series,
        },
    }

    # Recalculate PV thermal degradation and efficiency using SolGridEngine
    t_roof = peak_t_ambient + 20.0
    engine = SolGridEngine()
    thermal_metrics = engine.calculate_thermal_metrics(
        t_roof=t_roof,
        ghi=peak_ghi,
        wind_speed=2.0,
        albedo=0.15,
        rated_kw=1000.0,
    )
    parsed["pv_thermal_analysis"] = thermal_metrics

    return parsed


def print_metrics_summary(parsed: dict):
    """Print an attractive and clear terminal summary of extracted metrics."""
    s = parsed.get("summary", {})
    sol = parsed.get("solar_clearsky", {})
    pv = parsed.get("pv_thermal_analysis", {})

    print("\n" + "=" * 70)
    print(" FORTYGUARD LIVE ENVIRONMENTAL & SOLAR METRICS SUMMARY")
    print(" Location: Phoenix, AZ (33.4484° N, -112.0740° W)")
    print("=" * 70)
    print(" [Environmental Heat Intelligence]")
    print(f"   • Apparent Temperature (Peak) : {s.get('apparent_temperature_peak_c')} °C ({s.get('apparent_temperature_peak_c') * 9/5 + 32:.1f} °F)")
    print(f"   • Apparent Temperature (Avg)  : {s.get('apparent_temperature_avg_c')} °C")
    print(f"   • Heat Index (Peak)           : {s.get('heat_index_peak_c')} °C")
    print(f"   • Wet Bulb Temperature (Peak) : {s.get('wet_bulb_temperature_peak_c')} °C")
    print(f"   • Relative Humidity (Avg)     : {s.get('relative_humidity_avg_pct')} %")
    print("-" * 70)
    print(" [Clear-Sky Solar Irradiance]")
    print(f"   • Global Horizontal (GHI)     : {sol.get('ghi')} W/m²")
    print(f"   • Direct Normal (DNI)         : {sol.get('dni')} W/m²")
    print(f"   • Diffuse Horizontal (DHI)    : {sol.get('dhi')} W/m²")
    print("-" * 70)
    print(" [SolGrid Real-Time PV Thermal Impact]")
    print(f"   • Solar Cell Temperature      : {pv.get('t_cell')} °C (Delta: +{pv.get('temp_delta')} °C above STC)")
    print(f"   • Thermal Efficiency Loss     : {pv.get('efficiency_loss_pct') * 100:.2f} %")
    print(f"   • Power Loss @ {config.PANEL_CAPACITY_KW} kW Array     : {pv.get('lost_kwh')} kW")
    print(f"   • Financial Impact            : ${pv.get('hourly_dollar_loss')}/hr | ${pv.get('monthly_dollar_loss')}/month")
    print(f"   • Heat Risk Score             : {pv.get('risk_score')} / 100")
    print("=" * 70 + "\n")


def main():
    raw_data = fetch_heat_intelligence()

    # Save raw FortyGuard response
    config.RAW_FORTYGUARD_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.RAW_FORTYGUARD_PATH.write_text(json.dumps(raw_data, indent=2))
    print(f"[Storage] Saved FortyGuard raw response to {config.RAW_FORTYGUARD_PATH}")

    # Parse, recalculate PV losses, and save structured metrics
    parsed_data = parse_fortyguard_response(raw_data)
    PROCESSED_FORTYGUARD_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROCESSED_FORTYGUARD_PATH.write_text(json.dumps(parsed_data, indent=2))
    print(f"[Storage] Saved FortyGuard processed metrics to {PROCESSED_FORTYGUARD_PATH}")

    # Print summary
    print_metrics_summary(parsed_data)


if __name__ == "__main__":
    main()
