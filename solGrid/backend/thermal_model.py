"""Cell temperature modeling."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import NOCT


def noct_baseline(t_ambient, irradiance):
    """Cell temperature (C) from the NOCT model."""
    return t_ambient + ((NOCT - 20) / 800) * irradiance


def predict_cell_temp(features):
    """Predict cell temperature (C) from a feature dict."""
    # TODO: swap in trained XGBoost model after Phase 2
    return noct_baseline(features["t_ambient"], features["irradiance"])
