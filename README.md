# SolGrid Thermal Sync

> **AI-powered thermal intelligence for utility-scale solar farms**  
> Team SonShield · FortyGuard Hackathon 2026

Solar panels lose ~0.4% output per °C above 25°C. At a 290 MW farm 
in Arizona, a 25% heat-driven efficiency loss equals **$20.7M/year 
in silent revenue drain**. SolGrid converts FortyGuard's hyperlocal 
ambient temperature data into real-time financial intelligence — 
then tells operators exactly which intervention pays back fastest.

---

## Live Demo

🔗 **[Live dashboard →](http://localhost:8000)**  
*(Deploy link will be added before submission)*

---

## What it does

**1. Live thermal modeling**  
Ingests FortyGuard's real-time ambient temperature and solar 
irradiance, runs it through the Faiman wind-corrected NOCT model 
to estimate actual panel cell temperature — not the air temperature 
a weather app reports.

**2. Financial loss quantification**  
Every degree of thermal loss becomes a dollar figure. At Agua 
Caliente (290 MW), the dashboard shows $1.73M/month and $20.7M/year 
lost to heat — numbers an asset manager can act on.

**3. What-If Thermal Simulator**  
Interactive sliders let operators simulate interventions — reflective 
coating, misting, forced ventilation — and see the recovered revenue 
and payback period update in real time.

**4. Anomaly detection**  
Isolation Forest flags which farms in a portfolio are losing 
abnormally more than expected given their conditions — without 
anyone manually checking each site.

**5. Groq AI Thermal Advisor**  
One-click AI analysis powered by Llama 3.1 via Groq. Provides root 
cause breakdown, quick wins under $500k, best ROI investment, and 
a one-sentence executive summary — specific to each farm's live data.

**6. 7-Day Efficiency Forecast**  
Prophet time-series model forecasts upcoming heat-driven efficiency 
dips so operators can schedule maintenance proactively.

**7. Portfolio ROI Optimizer**  
Greedy knapsack algorithm allocates a capital budget across a 
portfolio — ranking interventions by payback months so operators 
spend money where it recovers fastest.

---

## ML stack

| Model | Purpose | Result |
|---|---|---|
| XGBoost regression | Panel cell temperature prediction | MAE 0.32°C vs NOCT baseline ~3°C |
| Isolation Forest | Anomaly detection across portfolio | Flags outlier farms automatically |
| Facebook Prophet | 7-day efficiency forecast | Seasonal + weekly patterns learned |

Physics baseline: **Faiman wind-corrected NOCT model**  
`T_cell = T_roof + ((NOCT-20)/800) × GHI × wind_factor`

---

## Tech stack

| Layer | Tools |
|---|---|
| Data | FortyGuard Environmental API, NREL Solar Resource API |
| ML | XGBoost, Prophet, Isolation Forest, scikit-learn |
| Backend | Flask, flask-cors, python-dotenv |
| AI advisor | Groq API (Llama 3.1 8B) |
| Frontend | Mapbox GL JS, Plotly.js |
| Visualization | Plotly, Matplotlib |
| Tooling | Jupyter, joblib, pandas, numpy |

---

## Hackathon tracks

- **Track 2 — Future Buildings & Energy**: Retrofit ROI calculator 
  linking FortyGuard temperature reduction to energy savings
- **Track 5 — Model Designing**: Faiman + XGBoost + Prophet + 
  Isolation Forest pipeline
- **Track 6 — Agentic Track**: Groq AI advisor autonomously 
  generates engineering recommendations from live sensor data

---

## Project structure

```
solGrid/
├── backend/
│   ├── app.py                 # Flask server & endpoints
│   ├── routes.py              # API routes & handlers
│   ├── solGrid_engine.py      # Thermal modeling + knapsack ROI
│   └── solar_detector.py      # Satellite panel detection
├── frontend/
│   ├── index.html             # Dark-mode operations dashboard
│   ├── dashboard.js           # Charts, sliders, simulator UI
│   ├── heatmap.js             # Mapbox thermal overlay
│   ├── style.css              # Custom styling
│   └── config.js              # Frontend configuration
├── data/
│   ├── build_dataset.py       # 8,760-hour synthetic dataset builder
│   ├── fetch_fortyguard.py    # FortyGuard API client
│   └── fetch_nrel.py          # NREL NSRDB solar data
├── models/
│   ├── xgboost_panel_temp.pkl # Trained cell temp model
│   └── prophet_forecast.pkl   # 7-day Prophet forecaster
├── notebooks/                 # Model training & validation
└── reports/                   # Visualizations & figures
```

---

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Server status + engine info |
| POST | `/analyze` | Full thermal analysis for a farm |
| POST | `/simulate` | What-If intervention simulation |
| POST | `/portfolio` | Multi-farm anomaly detection + ROI |
| GET | `/forecast` | 7-day efficiency forecast |
| POST | `/ai-recommend` | Groq AI thermal advisor |
| POST | `/lookup-farm` | Solar farm lookup by name |

---

## Install & run

```bash
pip install -r requirements.txt
cp .env.example .env   # add your API keys

# Start backend
python backend/app.py

# Start frontend (separate terminal)
cd frontend && python -m http.server 8000
```

Open `http://localhost:8000`

---

## API keys needed

- `FORTYGUARD_API_KEY` — FortyGuard Environmental API
- `NREL_API_KEY` — NREL Solar Resource Data
- `GROQ_API_KEY` — Groq Cloud (Llama 3.1 8B for AI advisor)

---

*Built by SonShield for the FortyGuard Hackathon 2026*
