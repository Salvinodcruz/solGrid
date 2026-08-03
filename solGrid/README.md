# SolGrid Thermal Sync

Quantifies how much revenue a solar installation loses to panel heat — and ranks the cheapest ways to win it back.

**Team:** SonShield
**Built for:** FortyGuard — Building the World's Temperature AI

## Why

Solar panels lose roughly 0.4% of their efficiency for every degree above 25°C. In Phoenix, cell temperatures routinely exceed 65°C, which means operators quietly lose double-digit percentages of generation on the hottest, highest-demand days. SolGrid puts a dollar figure on that loss and tells you which mitigation pays for itself fastest.

## Tech stack

- **Data:** FortyGuard Heat Intelligence API, NREL Solar Resource API
- **Modeling:** pandas, numpy, scikit-learn, XGBoost, Prophet
- **Backend:** Flask, flask-cors
- **Visualization:** Plotly
- **Tooling:** Jupyter, joblib, python-dotenv

## Install

```bash
cd solGrid
pip install -r requirements.txt
cp .env.example .env   # then fill in your API keys
```

## Run

```bash
python data/fetch_fortyguard.py   # pull Phoenix heat data
python data/fetch_nrel.py         # pull Phoenix solar resource data
python data/build_dataset.py      # merge into data/phoenix_solar_dataset.csv
```

Then use the backend modules:

```python
from backend.thermal_model import predict_cell_temp
from backend.calculator import efficiency_loss, dollar_loss, rank_interventions

t_cell = predict_cell_temp({"t_ambient": 42, "irradiance": 950, "wind_speed": 3})
loss_pct = efficiency_loss(t_cell)
rank_interventions(dollar_loss(loss_pct, hours=730))
```

## Project structure

```
solGrid/
├── config.py                  # central settings + API keys
├── requirements.txt
├── data/
│   ├── fetch_fortyguard.py    # FortyGuard heat intelligence
│   ├── fetch_nrel.py          # NREL solar resource
│   └── build_dataset.py       # merge + compute thermal losses
├── backend/
│   ├── thermal_model.py       # NOCT baseline, XGBoost-ready
│   └── calculator.py          # loss economics + intervention ranking
└── models/                    # trained model artifacts
```

## Hackathon tracks

- **Temperature intelligence** — models panel cell temperature from ambient heat and irradiance
- **Climate & energy resilience** — targets grid losses during peak-heat, peak-demand hours
- **B2B SaaS** — operator-facing dashboard with ROI-ranked interventions
