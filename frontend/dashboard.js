// Load Mapbox token securely from window.CONFIG
mapboxgl.accessToken = window.CONFIG?.MAPBOX_TOKEN || '';

const API_BASE = 'http://localhost:5000';

// 5 Verified real utility-scale solar farms in Arizona
const BUILDINGS = [
  {
    id: "SF001",
    label: "Agua Caliente Solar Project",
    address: "Yuma County, Arizona",
    coordinates: [-113.5000, 32.9667],
    t_roof: 66.1,
    ghi: 950,
    wind_speed: 2.0,
    albedo: 0.12,
    rated_kw: 290000,
    risk: 97,
    roof_type: "Ground-mount flat panel",
    install_year: 2014,
    operator: "First Solar / NRG Energy"
  },
  {
    id: "SF002", 
    label: "Solana Generating Station",
    address: "Gila Bend, Arizona",
    coordinates: [-112.9670, 32.9170],
    t_roof: 64.5,
    ghi: 935,
    wind_speed: 2.5,
    albedo: 0.13,
    rated_kw: 250000,
    risk: 94,
    roof_type: "Parabolic trough CSP",
    install_year: 2013,
    operator: "Atlantica Sustainable"
  },
  {
    id: "SF003",
    label: "Arlington Valley Solar Energy",
    address: "Arlington, Arizona",
    coordinates: [-112.9000, 33.3500],
    t_roof: 62.0,
    ghi: 910,
    wind_speed: 3.0,
    albedo: 0.15,
    rated_kw: 125000,
    risk: 88,
    roof_type: "Fixed-tilt ground mount",
    install_year: 2013,
    operator: "LS Power"
  },
  {
    id: "SF004",
    label: "Red Rock Solar Project",
    address: "Pinal County, Arizona",
    coordinates: [-111.8200, 32.7500],
    t_roof: 58.0,
    ghi: 880,
    wind_speed: 3.5,
    albedo: 0.18,
    rated_kw: 60000,
    risk: 75,
    roof_type: "Single-axis tracker",
    install_year: 2020,
    operator: "AES Corporation"
  },
  {
    id: "SF005",
    label: "Hyder Solar Project",
    address: "Hyder, Arizona",
    coordinates: [-113.9000, 32.9800],
    t_roof: 51.0,
    ghi: 840,
    wind_speed: 4.0,
    albedo: 0.22,
    rated_kw: 200000,
    risk: 61,
    roof_type: "Fixed-tilt ground mount",
    install_year: 2022,
    operator: "Canadian Solar"
  }
];

let selectedBuilding = BUILDINGS[0];
let currentBuilding = null;
let currentMetrics = null;
let currentInterventions = null;
let map = null;
let markerElementsMap = {};

// Global store for live FortyGuard data
window.LIVE_FORTYGUARD_DATA = null;

// Helper: Get marker color based on risk (Emerald, Amber, Crimson)
function getRiskColor(riskScore) {
  if (riskScore > 80) return '#EF4444'; // Crimson Red
  if (riskScore >= 60) return '#F59E0B'; // Amber Yellow
  return '#10B981'; // Emerald Green
}

// Money formatting helper
function formatMoney(n) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
  return '$' + n.toFixed(0);
}

// 1. Initialize Mapbox Map
function initMap() {
  const token = window.CONFIG?.MAPBOX_TOKEN || '';
  const isPlaceholder = !token || token.includes('YOUR_MAPBOX_TOKEN_HERE');

  mapboxgl.accessToken = token;

  if (isPlaceholder) {
    const mapContainer = document.getElementById('map');
    if (mapContainer && !mapContainer.querySelector('.mapbox-token-banner')) {
      const banner = document.createElement('div');
      banner.className = 'mapbox-token-banner';
      banner.style.cssText = 'position: absolute; top: 16px; left: 16px; right: 16px; z-index: 100; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(245, 158, 11, 0.4); color: #FEF3C7; padding: 12px 18px; border-radius: 12px; font-size: 13px; font-weight: 500; backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4); display: flex; align-items: center; gap: 10px;';
      banner.innerHTML = '<span>⚠️</span><span><strong>Mapbox token required.</strong> Copy <code>config.example.js</code> to <code>config.js</code> and insert your public key.</span>';
      mapContainer.appendChild(banner);
    }
  }

  try {
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-112.5000, 33.0000],
      zoom: 7,
      minZoom: 5,
      maxZoom: 14
    });
    window.mapInstance = map;

    // Add navigation controls (zoom in/out buttons)
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('error', (e) => {
      // Quiet mapbox tile authorization errors for placeholder tokens
    });

    // Hover popup for solar farms
    const hoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: 'solar-hover-popup'
    });

    map.on('load', () => {
      // 1. Add heatmap layer first
      if (typeof addHeatmapLayer === 'function') {
        addHeatmapLayer(map, BUILDINGS);
      }

      // 2. Add dot markers on top
      BUILDINGS.forEach(b => {
        const el = document.createElement('div');
        el.className = 'custom-marker';

        const riskVal = b.risk !== undefined ? b.risk : b.risk_score;
        if (riskVal > 80) {
          el.style.backgroundColor = '#ef4444';
          el.classList.add('marker-pulse-high');
        } else if (riskVal > 60) {
          el.style.backgroundColor = '#f97316';
        } else {
          el.style.backgroundColor = '#22c55e';
        }

        const bId = b.id || b.building_id;
        const coords = b.coordinates || [b.lng, b.lat];

        new mapboxgl.Marker(el)
          .setLngLat(coords)
          .addTo(map);

        markerElementsMap[bId] = el;

        // Hover popup: Farm name, capacity in MW, risk score
        el.addEventListener('mouseenter', () => {
          const capacityMw = (b.rated_kw / 1000).toFixed(0) + ' MW';
          const riskColor = riskVal > 80 ? '#ef4444' : (riskVal >= 60 ? '#f59e0b' : '#10b981');
          hoverPopup.setLngLat(coords)
            .setHTML(`
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; line-height: 1.4;">
                <div style="font-weight: 700; font-size: 13px; color: #f8fafc; margin-bottom: 3px;">${b.label}</div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 11px; color: #94a3b8;">
                  <span>⚡ <strong>${capacityMw}</strong></span>
                  <span style="color: ${riskColor}; font-weight: 700;">Risk: ${riskVal}</span>
                </div>
              </div>
            `)
            .addTo(map);
        });

        el.addEventListener('mouseleave', () => {
          hoverPopup.remove();
        });

        el.addEventListener('click', () => {
          analyzeBuilding(b);
        });
      });

      if (selectedBuilding) {
        highlightMarker(selectedBuilding.id || selectedBuilding.building_id);
      }
    });
  } catch (err) {
    console.warn('Mapbox initialization fallback:', err);
  }
}

// Highlight selected marker
function highlightMarker(buildingId) {
  Object.keys(markerElementsMap).forEach(id => {
    if (id === buildingId) {
      markerElementsMap[id].classList.add('active-marker');
    } else {
      markerElementsMap[id].classList.remove('active-marker');
    }
  });
}

// 2. Load Live FortyGuard Data (GET /live)
async function loadLiveData() {
  try {
    const res = await fetch(`${API_BASE}/live`);
    if (!res.ok) {
      console.warn('Live data not currently available on server');
      return;
    }

    const liveData = await res.json();
    window.LIVE_FORTYGUARD_DATA = liveData;

    // FIX 5: Update navbar subtitle
    const navbarBadge = document.getElementById('navbar-badge');
    if (navbarBadge) {
      navbarBadge.innerHTML = '🟢 LIVE — Arizona Solar Belt | FortyGuard 2026';
      navbarBadge.classList.add('live-active');
    }

    // FIX 3: Update and show Live Data Banner
    const banner = document.getElementById('live-data-banner');
    if (banner) {
      banner.classList.remove('hidden');
      const peakAmb = liveData.peak_t_ambient || liveData.apparent_temperature_celsius || 46.1;
      const peakGhi = liveData.peak_ghi || liveData.ghi || 950;
      const roofTemp = liveData.t_roof || (peakAmb + 20);

      document.getElementById('live-banner-temp').textContent = `${peakAmb}°C`;
      document.getElementById('live-banner-ghi').textContent = `${peakGhi} W/m²`;
      document.getElementById('live-banner-roof').textContent = `${roofTemp}°C`;
    }

    // Update SF001 (Agua Caliente Solar Project) with live values
    BUILDINGS[0].t_ambient = liveData.peak_t_ambient || liveData.apparent_temperature_celsius || 46.1;
    BUILDINGS[0].t_roof = liveData.t_roof || (BUILDINGS[0].t_ambient + 20.0);
    BUILDINGS[0].ghi = liveData.peak_ghi || liveData.ghi || 950.0;
    BUILDINGS[0].rated_kw = 290000;
    BUILDINGS[0].wind_speed = 2.0;
    BUILDINGS[0].albedo = 0.12;
    BUILDINGS[0].risk = Math.round(liveData.risk_score || liveData.pv_thermal_analysis?.risk_score || 97);
    BUILDINGS[0].is_live = true;

    // If SF001 is currently selected, trigger update
    if (selectedBuilding && (selectedBuilding.id === 'SF001' || selectedBuilding.id === 'B001' || selectedBuilding.building_id === 'SF001')) {
      analyzeBuilding(BUILDINGS[0]);
    }
  } catch (err) {
    console.error('Error loading live FortyGuard data:', err);
  }
}

// 3. Analyze Building (POST /analyze)
async function analyzeBuilding(building) {
  selectedBuilding = building;
  const bId = building.id || building.building_id;
  highlightMarker(bId);

  // Update card static details immediately
  document.getElementById('building-name').textContent = building.label;

  const addressEl = document.getElementById('building-address');
  if (addressEl) {
    addressEl.textContent = building.address ? `Address: ${building.address}` : '';
  }

  document.getElementById('detail-building-id').textContent = bId;
  const capacityMw = (building.rated_kw / 1000).toFixed(0) + " MW";
  document.getElementById('detail-capacity').textContent = capacityMw;

  const operatorEl = document.getElementById('detail-operator');
  if (operatorEl) {
    operatorEl.textContent = building.operator || '--';
  }

  const roofTypeEl = document.getElementById('detail-roof-type');
  if (roofTypeEl) {
    roofTypeEl.textContent = building.roof_type || '--';
  }

  const installYearEl = document.getElementById('detail-install-year');
  if (installYearEl) {
    installYearEl.textContent = building.install_year || '--';
  }

  document.getElementById('detail-roof-temp').textContent = `${building.t_roof}°C`;
  document.getElementById('detail-albedo').textContent = building.albedo;

  // Live badge and ambient/GHI details (FIX 3)
  const liveBadge = document.getElementById('live-data-badge');
  const ambientEl = document.getElementById('detail-ambient-temp');
  const ghiEl = document.getElementById('detail-ghi');

  if ((bId === 'SF001' || bId === 'B001') && window.LIVE_FORTYGUARD_DATA) {
    if (liveBadge) liveBadge.classList.remove('hidden');
    const liveAmb = building.t_ambient || window.LIVE_FORTYGUARD_DATA.peak_t_ambient || 46.1;
    const liveGhi = building.ghi || window.LIVE_FORTYGUARD_DATA.peak_ghi || 950;
    if (ambientEl) ambientEl.textContent = `${liveAmb}°C`;
    if (ghiEl) ghiEl.textContent = `${liveGhi} W/m²`;
  } else {
    if (liveBadge) liveBadge.classList.add('hidden');
    const calcAmb = building.t_ambient || (building.t_roof - 20).toFixed(1);
    if (ambientEl) ambientEl.textContent = `${calcAmb}°C`;
    if (ghiEl) ghiEl.textContent = `${building.ghi} W/m²`;
  }

  // Update Risk Score Badge
  const riskBadge = document.getElementById('risk-score-badge');
  const risk = building.risk !== undefined ? building.risk : building.risk_score;
  riskBadge.textContent = `Risk: ${Math.round(risk)}`;
  riskBadge.className = 'badge risk-badge ' + (risk > 80 ? 'high' : risk >= 60 ? 'mid' : 'low');

  // Reset simulator slider defaults for building
  const albedoSlider = document.getElementById('slider-albedo');
  albedoSlider.min = "0.10";
  albedoSlider.value = Math.max(0.10, building.albedo);
  document.getElementById('val-albedo').textContent = albedoSlider.value;

  document.getElementById('slider-misting').value = 0.0;
  document.getElementById('val-misting').textContent = '0.0';

  document.getElementById('slider-vent').value = 0.0;
  document.getElementById('val-vent').textContent = '0.0 m/s';

  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(building)
    });
    if (!res.ok) throw new Error('Analyze endpoint failed');

    const data = await res.json();
    currentBuilding = building;
    currentMetrics = data;
    currentInterventions = data.recommendations;

    const aiResponse = document.getElementById('ai-response');
    const aiBtn = document.getElementById('ai-btn');
    const aiLoading = document.getElementById('ai-loading');
    if (aiResponse) aiResponse.style.display = 'none';
    if (aiBtn) aiBtn.style.display = 'block';
    if (aiLoading) aiLoading.style.display = 'none';

    // Update Monthly & Annual Loss (formatted $M / $k with countup animation)
    const monthlyLossVal = data.monthly_loss_usd || data.monthly_dollar_loss || 0;
    const annualLossVal = data.annual_loss_usd || data.annual_dollar_loss || (monthlyLossVal * 12);

    const monthlyLossDisplay = document.getElementById('monthly-loss-display');
    if (monthlyLossDisplay) {
      monthlyLossDisplay.textContent = formatMoney(monthlyLossVal);
      monthlyLossDisplay.classList.remove('loss-countup');
      void monthlyLossDisplay.offsetWidth; // Reflow for animation
      monthlyLossDisplay.classList.add('loss-countup');
    }

    const annualLossDisplay = document.getElementById('annual-loss-display');
    if (annualLossDisplay) {
      annualLossDisplay.textContent = `Annual: ${formatMoney(annualLossVal)} lost to heat`;
    }

    // Update Efficiency Loss % & kW lost alongside & Panel Temperature
    const effLoss = data.efficiency_loss_pct !== undefined ? data.efficiency_loss_pct : (data.loss_pct || 0);
    const lost_kw = building.rated_kw * effLoss;

    const effDisplay = document.getElementById('efficiency-loss-display');
    if (effDisplay) {
      effDisplay.textContent = (effLoss * 100).toFixed(1) + "%";
    }

    const kwLossDisplay = document.getElementById('kw-loss-display');
    if (kwLossDisplay) {
      kwLossDisplay.textContent = `${Math.round(lost_kw).toLocaleString()} kW lost at peak`;
    }

    document.getElementById('panel-temp-display').textContent = `${data.t_cell}°C`;
    if (data.t_roof) {
      document.getElementById('detail-roof-temp').textContent = `${data.t_roof}°C`;
    }

    // Trigger initial simulation call with reset sliders
    runSimulation();

    // Reload forecast chart on asset selection
    fetch(`${API_BASE}/forecast`)
      .then(r => r.json())
      .then(fData => {
        if (fData.forecast) {
          renderForecastChart(fData.forecast);
        }
      })
      .catch(fErr => console.error('Error reloading forecast:', fErr));
  } catch (err) {
    console.error('Error analyzing building:', err);
  }
}

// 4. What-If Simulator (POST /simulate)
async function runSimulation() {
  if (!selectedBuilding) return;

  const newAlbedo = parseFloat(document.getElementById('slider-albedo').value);
  const mistingIntensity = parseFloat(document.getElementById('slider-misting').value);
  const forcedWind = parseFloat(document.getElementById('slider-vent').value);

  const payload = {
    ...selectedBuilding,
    new_albedo: newAlbedo,
    misting_intensity: mistingIntensity,
    forced_wind: forcedWind
  };

  try {
    const res = await fetch(`${API_BASE}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Simulate endpoint failed');

    const data = await res.json();

    // Compute and display Before / After comparison
    const beforeTCell = data.before ? Number(data.before.t_cell).toFixed(2) : '--';
    const afterTCell = data.after ? Number(data.after.t_cell).toFixed(2) : '--';
    const beforeLoss = data.before ? Math.round(data.before.monthly_dollar_loss || data.before.monthly_loss_usd || 0) : 0;
    const afterLoss = data.after ? Math.round(data.after.monthly_dollar_loss || data.after.monthly_loss_usd || 0) : 0;
    const tempDrop = (data.temp_drop_c != null ? data.temp_drop_c : (data.before && data.after ? (data.before.t_cell - data.after.t_cell) : 0)).toFixed(1);
    const recoveredUsd = Math.max(0, Math.round(data.monthly_recovered_usd != null ? data.monthly_recovered_usd : (beforeLoss - afterLoss)));

    const beforeTempEl = document.getElementById('sim-before-temp');
    if (beforeTempEl) beforeTempEl.textContent = `${beforeTCell}°C`;

    const afterTempEl = document.getElementById('sim-after-temp');
    if (afterTempEl) afterTempEl.textContent = `${afterTCell}°C`;

    const tempDiffEl = document.getElementById('sim-temp-diff');
    if (tempDiffEl) tempDiffEl.textContent = `(-${tempDrop}°C)`;

    const beforeLossEl = document.getElementById('sim-before-loss');
    if (beforeLossEl) beforeLossEl.textContent = `$${beforeLoss.toLocaleString()}/mo`;

    const afterLossEl = document.getElementById('sim-after-loss');
    if (afterLossEl) afterLossEl.textContent = `$${afterLoss.toLocaleString()}/mo`;

    const savedDiffEl = document.getElementById('sim-saved-diff');
    if (savedDiffEl) savedDiffEl.textContent = `(+$${recoveredUsd.toLocaleString()} saved)`;

    // Payback months
    const pb = data.payback_months || {};
    const formatPayback = (val) => {
      if (val == null) return 'N/A';
      if (val < 0.1) return '< 0.1 mos';
      if (val < 1.0) return `${val.toFixed(1)} mos`;
      return `${Math.round(val)} mos`;
    };
    document.getElementById('payback-albedo').textContent = formatPayback(pb.albedo_coating);
    document.getElementById('payback-misting').textContent = formatPayback(pb.misting_system);
    document.getElementById('payback-vent').textContent = formatPayback(pb.forced_ventilation);
  } catch (err) {
    console.error('Error running simulation:', err);
  }
}

// Bind slider listeners
function setupSliders() {
  const albedoSlider = document.getElementById('slider-albedo');
  const mistingSlider = document.getElementById('slider-misting');
  const ventSlider = document.getElementById('slider-vent');

  albedoSlider.addEventListener('input', (e) => {
    document.getElementById('val-albedo').textContent = e.target.value;
    runSimulation();
  });

  mistingSlider.addEventListener('input', (e) => {
    document.getElementById('val-misting').textContent = e.target.value;
    runSimulation();
  });

  ventSlider.addEventListener('input', (e) => {
    document.getElementById('val-vent').textContent = `${e.target.value} m/s`;
    runSimulation();
  });
}

// 5. Forecast Section (GET /forecast)
function renderForecastChart(forecastData) {
  const days = forecastData.map(d => d.day_name);
  const losses = forecastData.map(d => 
    parseFloat(d.predicted_loss_pct));
  const colors = losses.map(l => 
    l > 14 ? '#ef4444' : l > 8 ? '#f97316' : '#22c55e');

  const trace = {
    x: days,
    y: losses,
    type: 'scatter',
    mode: 'lines+markers',
    fill: 'tozeroy',
    fillcolor: 'rgba(249,115,22,0.15)',
    line: {
      color: '#f97316',
      width: 2.5,
      shape: 'spline',
      smoothing: 0.8
    },
    marker: {
      color: colors,
      size: 8,
      line: { color: 'white', width: 1.5 }
    },
    hovertemplate: 
      '<b>%{x}</b><br>' +
      'Loss: %{y:.1f}%<br>' +
      '<extra></extra>'
  };

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    margin: { t: 10, r: 20, b: 40, l: 45 },
    xaxis: {
      tickfont: { color: '#6b7280', size: 11 },
      gridcolor: '#1f2937',
      linecolor: '#1f2937',
      showgrid: false
    },
    yaxis: {
      tickfont: { color: '#6b7280', size: 11 },
      gridcolor: '#1f2937',
      ticksuffix: '%',
      range: [0, 25],
      showgrid: true,
      gridcolor: 'rgba(31,41,55,0.8)'
    },
    shapes: [
      {
        type: 'line',
        x0: 0, x1: 1,
        xref: 'paper',
        y0: 14, y1: 14,
        line: { color: '#ef4444', 
                width: 1, 
                dash: 'dot' }
      },
      {
        type: 'line', 
        x0: 0, x1: 1,
        xref: 'paper',
        y0: 8, y1: 8,
        line: { color: '#f97316', 
                width: 1, 
                dash: 'dot' }
      }
    ],
    annotations: [
      {
        x: 1, y: 14,
        xref: 'paper',
        text: 'High risk',
        font: { color: '#ef4444', size: 10 },
        showarrow: false,
        xanchor: 'right'
      },
      {
        x: 1, y: 8,
        xref: 'paper', 
        text: 'Moderate',
        font: { color: '#f97316', size: 10 },
        showarrow: false,
        xanchor: 'right'
      }
    ],
    hoverlabel: {
      bgcolor: '#1f2937',
      bordercolor: '#f97316',
      font: { color: '#f9fafb', size: 12 }
    }
  };

  const config = {
    displayModeBar: false,
    responsive: true
  };

  Plotly.newPlot('forecast-chart', 
                 [trace], layout, config);
}

async function loadForecast() {
  try {
    const res = await fetch(`${API_BASE}/forecast`);
    if (!res.ok) throw new Error('Forecast endpoint failed');

    const data = await res.json();
    if (data.forecast) {
      renderForecastChart(data.forecast);
    }
  } catch (err) {
    console.error('Error loading forecast:', err);
  }
}

// 6. ROI Section (POST /portfolio)
async function loadPortfolioROI() {
  const container = document.getElementById('roi-list');
  try {
    const payload = {
      buildings: BUILDINGS.map(b => ({
        building_id: b.id || b.building_id,
        label: b.label,
        t_roof: b.t_roof,
        ghi: b.ghi,
        wind_speed: b.wind_speed,
        albedo: b.albedo,
        rated_kw: b.rated_kw,
        risk_score: b.risk !== undefined ? b.risk : b.risk_score
      })),
      budget: 50000
    };

    const res = await fetch(`${API_BASE}/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Portfolio endpoint failed');

    const data = await res.json();
    const allocated = (data.roi_allocation && data.roi_allocation.allocated) || [];

    if (allocated.length === 0) {
      container.innerHTML = '<div class="loading-spinner">No interventions allocated for this budget.</div>';
      return;
    }

    // Helper map for building name lookup
    const buildingMap = {};
    BUILDINGS.forEach(b => { buildingMap[b.id || b.building_id] = b.label; });

    container.innerHTML = allocated.map((item, idx) => {
      const buildingName = buildingMap[item.building_id] || item.label || item.building_id;
      const formattedType = (item.type || '').replace('_', ' ');
      const formattedCost = '$' + item.cost.toLocaleString();
      const formattedSaving = '$' + Math.round(item.monthly_saving).toLocaleString() + '/mo';
      const payback = item.payback_months ? `${item.payback_months} mos` : 'N/A';

      return `
        <div class="roi-item">
          <div class="roi-left">
            <span class="roi-rank">#${idx + 1}</span>
            <div class="roi-info">
              <span class="roi-bname">${buildingName}</span>
              <span class="roi-itype">${formattedType}</span>
            </div>
          </div>
          <div class="roi-right">
            <div class="roi-stat">
              <span class="roi-stat-label">CapEx Cost</span>
              <span class="roi-stat-val text-primary">${formattedCost}</span>
            </div>
            <div class="roi-stat">
              <span class="roi-stat-label">Monthly Recovery</span>
              <span class="roi-stat-val success-text">+${formattedSaving}</span>
            </div>
            <div class="roi-stat">
              <span class="roi-stat-label">Payback</span>
              <span class="roi-stat-val text-primary">${payback}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading portfolio ROI:', err);
    container.innerHTML = '<div class="loading-spinner">Error loading capital allocation portfolio.</div>';
  }
}

// 7. FIX 4: Refresh Live Data Button Handler
function setupRefreshButton() {
  const btn = document.getElementById('btn-refresh-live');
  const btnText = document.getElementById('refresh-btn-text');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (btn.classList.contains('loading')) return;

    btn.classList.add('loading');
    if (btnText) btnText.textContent = 'Querying FortyGuard...';

    try {
      const res = await fetch(`${API_BASE}/refresh-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error(`Refresh failed: ${res.statusText}`);

      await loadLiveData();
      await loadPortfolioROI();
      await loadForecast();

      if (btnText) btnText.textContent = '🟢 Data Synced!';
      setTimeout(() => {
        if (btnText) btnText.textContent = 'Refresh Live Data';
        btn.classList.remove('loading');
      }, 2000);
    } catch (err) {
      console.error('Failed to refresh FortyGuard live data:', err);
      if (btnText) btnText.textContent = '⚠️ Refresh Failed';
      setTimeout(() => {
        if (btnText) btnText.textContent = 'Refresh Live Data';
        btn.classList.remove('loading');
      }, 3000);
    }
  });
}

// 8. AI Thermal Recommendation (POST /ai-recommend)
async function getAIRecommendation() {
  if (!currentBuilding || !currentMetrics) {
    alert('Please select a solar farm first');
    return;
  }

  const btn = document.getElementById('ai-btn');
  const loading = document.getElementById('ai-loading');
  const response = document.getElementById('ai-response');

  if (btn) btn.style.display = 'none';
  if (loading) loading.style.display = 'flex';
  if (response) response.style.display = 'none';

  try {
    const res = await fetch(
      `${API_BASE}/ai-recommend`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_label: currentBuilding.label,
          rated_kw: currentBuilding.rated_kw,
          monthly_loss_usd: currentMetrics.monthly_loss_usd || currentMetrics.monthly_dollar_loss || 0,
          annual_loss_usd: (currentMetrics.monthly_loss_usd || currentMetrics.monthly_dollar_loss || 0) * 12,
          t_cell: currentMetrics.t_cell,
          efficiency_loss_pct: currentMetrics.efficiency_loss_pct !== undefined ? currentMetrics.efficiency_loss_pct : (currentMetrics.loss_pct || 0),
          risk_score: currentMetrics.risk_score !== undefined ? currentMetrics.risk_score : (currentBuilding.risk || 0)
        })
      }
    );

    const data = await res.json();
    const aiText = document.getElementById('ai-text');
    if (aiText) {
      aiText.textContent = data.recommendation;
    }
    if (loading) loading.style.display = 'none';
    if (response) response.style.display = 'block';

  } catch (e) {
    const aiText = document.getElementById('ai-text');
    if (aiText) {
      aiText.textContent = 'AI analysis unavailable. Check your Groq API key.';
    }
    if (loading) loading.style.display = 'none';
    if (response) response.style.display = 'block';
  }

  if (btn) btn.style.display = 'block';
}

// Page initialization
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupSliders();
  setupRefreshButton();
  loadForecast();
  loadPortfolioROI();

  // Load FortyGuard Live Feed and select initial building
  loadLiveData();
  analyzeBuilding(BUILDINGS[0]);
});
