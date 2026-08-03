// Replace with your Mapbox public token
mapboxgl.accessToken = 'pk.YOUR_MAPBOX_TOKEN_HERE';

const API_BASE = 'http://localhost:5000';

// 5 Demo buildings centered in Phoenix AZ
const DEMO_BUILDINGS = [
  {
    building_id: "B001",
    label: "1234 N Central Ave",
    lat: 33.4484,
    lng: -112.0740,
    risk_score: 97,
    t_roof: 64.0,
    ghi: 950,
    wind_speed: 0.5,
    albedo: 0.10,
    rated_kw: 500
  },
  {
    building_id: "B002",
    label: "88 W Jefferson St",
    lat: 33.4510,
    lng: -112.0680,
    risk_score: 91,
    t_roof: 58.5,
    ghi: 950,
    wind_speed: 1.8,
    albedo: 0.25,
    rated_kw: 350
  },
  {
    building_id: "B003",
    label: "400 E Van Buren St",
    lat: 33.4455,
    lng: -112.0710,
    risk_score: 78,
    t_roof: 52.0,
    ghi: 950,
    wind_speed: 2.6,
    albedo: 0.45,
    rated_kw: 250
  },
  {
    building_id: "B004",
    label: "2 N Central Ave",
    lat: 33.4530,
    lng: -112.0750,
    risk_score: 65,
    t_roof: 45.5,
    ghi: 950,
    wind_speed: 3.2,
    albedo: 0.65,
    rated_kw: 180
  },
  {
    building_id: "B005",
    label: "777 S 16th St",
    lat: 33.4470,
    lng: -112.0660,
    risk_score: 45,
    t_roof: 39.0,
    ghi: 950,
    wind_speed: 4.0,
    albedo: 0.80,
    rated_kw: 100
  }
];

let selectedBuilding = DEMO_BUILDINGS[0];
let map = null;
let markerElementsMap = {};

// Helper: Get marker color based on risk
function getRiskColor(riskScore) {
  if (riskScore > 80) return '#ef4444'; // Red
  if (riskScore >= 60) return '#f59e0b'; // Amber
  return '#22c55e'; // Green
}

// Animated count-up for numbers
function animateCountUp(element, targetVal, duration = 800) {
  if (!element) return;
  const startVal = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = progress * (2 - progress); // Ease out quad
    const currentVal = Math.round(startVal + easeProgress * (targetVal - startVal));
    element.textContent = '$' + currentVal.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = '$' + Math.round(targetVal).toLocaleString();
    }
  }

  requestAnimationFrame(update);
}

// 1. Initialize Mapbox Map
function initMap() {
  try {
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-112.0740, 33.4484], // Phoenix (lng, lat)
      zoom: 13
    });

    // Handle token or map load errors gracefully
    map.on('error', (e) => {
      // Quiet mapbox tile authorization errors for placeholder tokens
    });

    map.on('load', () => {
      if (typeof addHeatmapLayer === 'function') {
        addHeatmapLayer(map, DEMO_BUILDINGS);
      }
    });
  } catch (err) {
    console.warn('Mapbox initialization fallback:', err);
  }

  // Add 5 demo building markers
  DEMO_BUILDINGS.forEach(b => {
    const el = document.createElement('div');
    el.className = 'custom-marker';
    const color = getRiskColor(b.risk_score);
    
    el.style.backgroundColor = color;
    el.style.width = '22px';
    el.style.height = '22px';
    el.style.borderRadius = '50%';
    el.style.border = '2px solid #ffffff';
    el.style.boxShadow = `0 0 10px ${color}`;
    el.style.cursor = 'pointer';
    el.title = `${b.label} (Risk: ${b.risk_score})`;

    if (map) {
      new mapboxgl.Marker(el)
        .setLngLat([b.lng, b.lat])
        .addTo(map);
    }

    markerElementsMap[b.building_id] = el;

    el.addEventListener('click', () => {
      analyzeBuilding(b);
    });
  });
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

// 3. Analyze Building (POST /analyze)
async function analyzeBuilding(building) {
  selectedBuilding = building;
  highlightMarker(building.building_id);

  // Update card static details immediately
  document.getElementById('building-name').textContent = building.label;
  document.getElementById('detail-building-id').textContent = building.building_id;
  document.getElementById('detail-capacity').textContent = `${building.rated_kw} kW`;
  document.getElementById('detail-roof-temp').textContent = `${building.t_roof}°C`;
  document.getElementById('detail-albedo').textContent = building.albedo;

  // Update Risk Score Badge
  const riskBadge = document.getElementById('risk-score-badge');
  const risk = building.risk_score;
  riskBadge.textContent = `Risk: ${Math.round(risk)}`;
  riskBadge.className = 'badge risk-badge ' + (risk > 80 ? 'high' : risk >= 60 ? 'mid' : 'low');

  // Reset simulator slider defaults for building
  const albedoSlider = document.getElementById('slider-albedo');
  albedoSlider.value = Math.max(0.15, building.albedo);
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

    // Update Monthly Loss (animated count up)
    const lossDisplay = document.getElementById('monthly-loss-display');
    animateCountUp(lossDisplay, data.monthly_loss_usd);

    // Update Efficiency Loss % & Panel Temperature
    document.getElementById('efficiency-loss-display').textContent = `${data.loss_pct}%`;
    document.getElementById('panel-temp-display').textContent = `${data.t_cell}°C`;

    // Trigger initial simulation call with reset sliders
    runSimulation();
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

    // New panel temp & temp drop
    const afterTCell = data.after ? data.after.t_cell : '--';
    document.getElementById('sim-new-temp').textContent = `${afterTCell}°C`;
    document.getElementById('sim-temp-drop').textContent = `-${data.temp_drop_c}°C drop`;

    // Monthly recovered USD
    const recoveredUsd = Math.max(0, data.monthly_recovered_usd);
    document.getElementById('sim-recovered-usd').textContent = `$${recoveredUsd.toLocaleString()} / mo`;

    // Payback months
    const pb = data.payback_months || {};
    document.getElementById('payback-albedo').textContent = pb.albedo_coating != null ? `${pb.albedo_coating} mos` : 'N/A';
    document.getElementById('payback-misting').textContent = pb.misting_system != null ? `${pb.misting_system} mos` : 'N/A';
    document.getElementById('payback-vent').textContent = pb.forced_ventilation != null ? `${pb.forced_ventilation} mos` : 'N/A';
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
async function loadForecast() {
  try {
    const res = await fetch(`${API_BASE}/forecast`);
    if (!res.ok) throw new Error('Forecast endpoint failed');

    const data = await res.json();
    const forecastList = data.forecast || [];

    const xDays = forecastList.map(item => item.day_name);
    const yLoss = forecastList.map(item => item.predicted_loss_pct);
    const barColors = forecastList.map(item => {
      if (item.risk_level === 'high') return '#ef4444';
      if (item.risk_level === 'moderate') return '#f59e0b';
      return '#22c55e';
    });

    const plotData = [{
      x: xDays,
      y: yLoss,
      type: 'bar',
      marker: {
        color: barColors,
        border: { width: 0 }
      },
      hovertemplate: '<b>%{x}</b><br>Loss: %{y:.1f}%<extra></extra>'
    }];

    const layout = {
      title: {
        text: '7-Day Efficiency Forecast — Phoenix AZ',
        font: { color: '#f9fafb', size: 14, family: 'Inter' }
      },
      paper_bgcolor: '#111827',
      plot_bgcolor: '#111827',
      margin: { l: 40, r: 20, t: 40, b: 35 },
      xaxis: {
        tickfont: { color: '#9ca3af', family: 'Inter' },
        gridcolor: '#1f2937'
      },
      yaxis: {
        title: { text: 'Loss %', font: { color: '#9ca3af', size: 11 } },
        tickfont: { color: '#9ca3af', family: 'Inter' },
        gridcolor: '#1f2937'
      }
    };

    const config = { responsive: true, displayModeBar: false };

    Plotly.newPlot('forecast-chart', plotData, layout, config);
  } catch (err) {
    console.error('Error loading forecast:', err);
  }
}

// 6. ROI Section (POST /portfolio)
async function loadPortfolioROI() {
  const container = document.getElementById('roi-list');
  try {
    const payload = {
      buildings: DEMO_BUILDINGS,
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
    DEMO_BUILDINGS.forEach(b => { buildingMap[b.building_id] = b.label; });

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

// Page initialization
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupSliders();
  loadForecast();
  loadPortfolioROI();

  // Select initial building
  analyzeBuilding(DEMO_BUILDINGS[0]);
});
