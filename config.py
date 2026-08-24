"""Central configuration for SolGrid Thermal Sync."""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"

load_dotenv(BASE_DIR / ".env")

# Location: Phoenix, AZ
LAT = 33.4484
LON = -112.0740
CITY = "Phoenix"
STATE = "AZ"

# Panel thermal + electrical characteristics
NOCT = 45                 # Nominal Operating Cell Temperature (C)
PANEL_EFFICIENCY = 0.20   # rated module efficiency
PANEL_CAPACITY_KW = 250    # installed DC capacity (kW)
TEMP_COEFFICIENT = -0.004 # efficiency loss per C above STC
STC_TEMP = 25             # standard test condition temp (C)



# API credentials
FORTYGUARD_API_KEY = os.getenv("FORTYGUARD_API_KEY")
NREL_API_KEY = os.getenv("NREL_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# API endpoints
FORTYGUARD_URL = "https://api.fortyguard.com/v1/environmental-parameters"
NREL_URL = "https://developer.nrel.gov/api/solar/solar_resource/v1.json"

# Data artifacts
RAW_FORTYGUARD_PATH = DATA_DIR / "raw_fortyguard.json"
PROCESSED_FORTYGUARD_PATH = DATA_DIR / "processed_fortyguard.json"
RAW_NREL_PATH = DATA_DIR / "raw_nrel.json"
DATASET_PATH = DATA_DIR / "phoenix_solar_dataset.csv"

# Add these for the demo scenario
DEMO_BUILDING_NAME = "1234 N Central Ave, Phoenix AZ"
DEMO_ROOF_AREA_SQM = 2000        # ~21,500 sq ft — realistic for 250 kW
ELECTRICITY_RATE_USD = 0.14      # Arizona commercial rate is closer to $0.14
