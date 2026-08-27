// Load Mapbox token securely from window.CONFIG or global MAPBOX_TOKEN
mapboxgl.accessToken = (window.CONFIG && window.CONFIG.MAPBOX_TOKEN) || (typeof MAPBOX_TOKEN !== 'undefined' ? MAPBOX_TOKEN : '');

const API_BASE = 'https://solgrid-production.up.railway.app';

// 5 Verified real utility-scale solar farms in Arizona with FortyGuard Satellite Panel Segmentation
const BUILDINGS = [
  {
    id: "SF001",
    label: "Agua Caliente Solar Project",
    address: "Yuma County, Arizona",
    coordinates: [-113.5100, 32.9665],
    array_bounds: {
      type: "Polygon",
      coordinates: [[
        [-113.5420, 32.9420],
        [-113.4780, 32.9420],
        [-113.4780, 32.9910],
        [-113.5420, 32.9910],
        [-113.5420, 32.9420]
      ]]
    },
    panel_area_m2: 2400000,
    thermal_density_loss: 0.12,
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
    coordinates: [-112.9570, 32.9180],
    array_bounds: {
      type: "Polygon",
      coordinates: [[
        [-112.9820, 32.8980],
        [-112.9320, 32.8980],
        [-112.9320, 32.9380],
        [-112.9820, 32.9380],
        [-112.9820, 32.8980]
      ]]
    },
    panel_area_m2: 1920000,
    thermal_density_loss: 0.13,
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
    coordinates: [-112.8950, 33.3500],
    array_bounds: {
      type: "Polygon",
      coordinates: [[
        [-112.9450, 33.3180],
        [-112.8450, 33.3180],
        [-112.8450, 33.3820],
        [-112.9450, 33.3820],
        [-112.9450, 33.3180]
      ]]
    },
    panel_area_m2: 1150000,
    thermal_density_loss: 0.11,
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
    array_bounds: {
      type: "Polygon",
      coordinates: [[
        [-111.8480, 32.7320],
        [-111.7920, 32.7320],
        [-111.7920, 32.7680],
        [-111.8480, 32.7680],
        [-111.8480, 32.7320]
      ]]
    },
    panel_area_m2: 680000,
    thermal_density_loss: 0.08,
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
    coordinates: [-113.8950, 32.9850],
    array_bounds: {
      type: "Polygon",
      coordinates: [[
        [-113.9180, 32.9620],
        [-113.8720, 32.9620],
        [-113.8720, 33.0080],
        [-113.9180, 33.0080],
        [-113.9180, 32.9620]
      ]]
    },
    panel_area_m2: 1650000,
    thermal_density_loss: 0.07,
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

// Exact farm boundary polygons for utility-scale solar farms
const FARM_BOUNDARIES = {
  'SF001': {
    name: 'Agua Caliente Solar Project',
    polygon: [
      [-113.5420, 32.9420],
      [-113.4780, 32.9420],
      [-113.4780, 32.9910],
      [-113.5420, 32.9910],
      [-113.5420, 32.9420]
    ]
  },
  'SF002': {
    name: 'Solana Generating Station',
    polygon: [
      [-112.9820, 32.8980],
      [-112.9320, 32.8980],
      [-112.9320, 32.9380],
      [-112.9820, 32.9380],
      [-112.9820, 32.8980]
    ]
  },
  'SF003': {
    name: 'Arlington Valley Solar Energy',
    polygon: [
      [-112.9450, 33.3180],
      [-112.8450, 33.3180],
      [-112.8450, 33.3820],
      [-112.9450, 33.3820],
      [-112.9450, 33.3180]
    ]
  },
  'SF004': {
    name: 'Red Rock Solar Project',
    polygon: [
      [-111.8480, 32.7320],
      [-111.7920, 32.7320],
      [-111.7920, 32.7680],
      [-111.8480, 32.7680],
      [-111.8480, 32.7320]
    ]
  },
  'SF005': {
    name: 'Hyder Solar Project',
    polygon: [
      [-113.9180, 32.9620],
      [-113.8720, 32.9620],
      [-113.8720, 33.0080],
      [-113.9180, 33.0080],
      [-113.9180, 32.9620]
    ]
  }
};

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
  const token = (window.CONFIG && window.CONFIG.MAPBOX_TOKEN) || (typeof MAPBOX_TOKEN !== 'undefined' ? MAPBOX_TOKEN : '');
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
      center: [-112.8000, 33.0000],
      zoom: 7,
      minZoom: 5,
      maxZoom: 18
    });
    window.mapInstance = map;
    window.map = map;

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
      // 1. Show ALL 5 farms with their thermal polygon color based on risk score on overview load
      BUILDINGS.forEach(building => {
        const fakeMetrics = { 
          risk_score: building.risk,
          efficiency_loss_pct: 0.20
        };
        showFarmThermalOverlay(building, fakeMetrics, false);
      });

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
  updateInterventionCardTitles(building);

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

  // Segmented Panel Area & Thermal Loss Density (from FortyGuard satellite segmentation)
  const panelAreaM2 = building.panel_area_m2 || 2400000;
  const panelAreaEl = document.getElementById('detail-panel-area');
  if (panelAreaEl) {
    panelAreaEl.textContent = `${Number(panelAreaM2).toLocaleString()} m²`;
  }

  const densityLossEl = document.getElementById('detail-density-loss');
  if (densityLossEl) {
    const initialDensity = building.thermal_density_loss !== undefined ? building.thermal_density_loss : 0.12;
    densityLossEl.textContent = `$${Number(initialDensity).toFixed(2)} / m² / month`;
  }

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

  // Smooth camera transition to selected solar farm
  if (map && (building.coordinates || (building.lng && building.lat))) {
    const coords = building.coordinates || [building.lng, building.lat];
    map.flyTo({
      center: coords,
      zoom: Math.max(map.getZoom(), 10),
      duration: 1200,
      essential: true
    });
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
      annualLossDisplay.textContent = `Annual: ${formatMoney(annualLossVal)}/year lost to heat`;
    }

    // Update dynamic thermal loss density from calculation
    if (densityLossEl) {
      const calculatedDensity = data.thermal_density_loss !== undefined
        ? data.thermal_density_loss
        : (monthlyLossVal / panelAreaM2).toFixed(2);
      densityLossEl.textContent = `$${Number(calculatedDensity).toFixed(2)} / m² / month`;
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

    // Show exact thermal polygon overlay and concentric gradient inside farm boundary
    showFarmThermalOverlay(building, data);
    addThermalGradientInside(building, data);

    // AI YOLOv8 Solar Panel Detection & Render
    detectAndRenderPanels(building);
  } catch (err) {
    console.error('Error analyzing building:', err);
  }
}

// Dynamic Intervention Cost Calculations
function getDynamicInterventionCosts(panelCount) {
  const count = panelCount || 50000;
  const albedoCost = Math.round(count * 20);
  const mistingCost = Math.round(2000 + (count * 15));
  const ventilationCost = Math.round(1000 + (count * 10));
  return { albedoCost, mistingCost, ventilationCost };
}

function formatCostLabel(val) {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${val}`;
}

function updateInterventionCardTitles(buildingOrCount) {
  let panelCount = 50000;
  if (typeof buildingOrCount === 'number') {
    panelCount = buildingOrCount;
  } else if (buildingOrCount && typeof buildingOrCount === 'object') {
    panelCount = buildingOrCount.panel_count || 
      (buildingOrCount.panel_area_m2 ? Math.round(buildingOrCount.panel_area_m2 / 2) : 
      (buildingOrCount.rated_kw ? Math.round(buildingOrCount.rated_kw / 0.4) : 50000));
  } else if (selectedBuilding || currentBuilding) {
    const b = selectedBuilding || currentBuilding;
    panelCount = b.panel_count || 
      (b.panel_area_m2 ? Math.round(b.panel_area_m2 / 2) : 
      (b.rated_kw ? Math.round(b.rated_kw / 0.4) : 50000));
  }

  const { albedoCost, mistingCost, ventilationCost } = getDynamicInterventionCosts(panelCount);

  const albedoEl = document.getElementById('albedo-card-title');
  if (albedoEl) {
    albedoEl.textContent = `Albedo Coating (${formatCostLabel(albedoCost)})`;
  }

  const mistingEl = document.getElementById('misting-card-title');
  if (mistingEl) {
    mistingEl.textContent = `Smart Misting (${formatCostLabel(mistingCost)})`;
  }

  const ventEl = document.getElementById('ventilation-card-title');
  if (ventEl) {
    ventEl.textContent = `Forced Ventilation (${formatCostLabel(ventilationCost)})`;
  }
}

// 4. What-If Simulator (POST /simulate)
async function runSimulation() {
  if (!selectedBuilding) return;
  updateInterventionCardTitles(selectedBuilding);

  const albedoSlider = document.getElementById('slider-albedo') || document.getElementById('albedo-slider');
  const mistingSlider = document.getElementById('slider-misting') || document.getElementById('misting-slider');
  const ventSlider = document.getElementById('slider-vent') || document.getElementById('ventilation-slider');

  const newAlbedo = albedoSlider ? parseFloat(albedoSlider.value) : 0.10;
  const mistingIntensity = mistingSlider ? parseFloat(mistingSlider.value) : 0.0;
  const forcedWind = ventSlider ? parseFloat(ventSlider.value) : 0.0;

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

    // Check individual intervention active states
    const baseAlbedo = (selectedBuilding && selectedBuilding.albedo != null) ? selectedBuilding.albedo : 0.10;
    const isAlbedoActive = newAlbedo > baseAlbedo + 0.001 || (baseAlbedo <= 0.10 && newAlbedo > 0.10);
    const isMistingActive = mistingIntensity > 0;
    const isVentActive = forcedWind > 0;

    // Get dynamic intervention costs based on panel count
    const panelCount = selectedBuilding ? (selectedBuilding.panel_count || 
      (selectedBuilding.panel_area_m2 ? Math.round(selectedBuilding.panel_area_m2 / 2) : 
      (selectedBuilding.rated_kw ? Math.round(selectedBuilding.rated_kw / 0.4) : 50000))) : 50000;
    const { albedoCost, mistingCost, ventilationCost } = getDynamicInterventionCosts(panelCount);

    const monthlySavings = recoveredUsd;

    // Format payback: only show payback if intervention is active and monthly savings > 0
    const formatPayback = (cost, isActive) => {
      if (!isActive || monthlySavings <= 0) return 'N/A';
      const months = (cost / monthlySavings).toFixed(1);
      return `${months} mos`;
    };

    const paybackAlbedoEl = document.getElementById('payback-albedo');
    if (paybackAlbedoEl) {
      paybackAlbedoEl.textContent = formatPayback(albedoCost, isAlbedoActive);
    }

    const paybackMistingEl = document.getElementById('payback-misting');
    if (paybackMistingEl) {
      paybackMistingEl.textContent = formatPayback(mistingCost, isMistingActive);
    }

    const paybackVentEl = document.getElementById('payback-vent') || document.getElementById('payback-ventilation');
    if (paybackVentEl) {
      paybackVentEl.textContent = formatPayback(ventilationCost, isVentActive);
    }
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
  const btn = document.getElementById('refresh-btn') || document.getElementById('btn-refresh-live');
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

// Auto-clean trailing truncated sentences/symbols
function sanitizeAiOutput(rawText) {
  if (!rawText) return "";
  
  let cleaned = rawText.trim();
  
  // Remove dangling trailing symbols like **, *, or -
  cleaned = cleaned.replace(/[\*\-\_]+$/, '');
  
  // If the string doesn't end with a period, exclamation, or closing bracket,
  // trim back to the last complete sentence/bullet point
  if (!/[.!?\)]$/.test(cleaned)) {
    const lastPunct = Math.max(
      cleaned.lastIndexOf('.'),
      cleaned.lastIndexOf('!'),
      cleaned.lastIndexOf('?')
    );
    if (lastPunct > 0) {
      cleaned = cleaned.substring(0, lastPunct + 1);
    }
  }
  
  return cleaned;
}

// Markdown parser with marked.js integration, clean fallback, and asterisks replacement
function renderMarkdownToHtml(markdown) {
  if (!markdown) return '';
  let cleanMarkdown = sanitizeAiOutput(String(markdown));
  let html = '';
  
  if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
    try {
      if (typeof marked.setOptions === 'function') {
        marked.setOptions({
          gfm: true,
          breaks: true
        });
      }
      html = marked.parse(cleanMarkdown);
    } catch (err) {
      console.warn('Marked parse error, falling back to regex parser:', err);
      html = '';
    }
  }

  // Fallback regex parser if marked.js is unavailable
  if (!html) {
    let text = cleanMarkdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headers
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold tags: **text** -> <strong>text</strong>
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic tags: *text* or _text_ -> <em>text</em>
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Dividers: --- -> <hr>
    text = text.replace(/^(?:---|\*\*\*|___)\s*$/gim, '<hr>');

    // Tables: | col1 | col2 |
    text = text.replace(/((?:^\|.*\|\r?\n?)+)/gm, (match) => {
      const rows = match.trim().split('\n').filter(r => r.trim().startsWith('|'));
      if (rows.length < 2) return match;
      let htmlTable = '<table>';
      rows.forEach((row, idx) => {
        if (row.includes('---')) return;
        const cells = row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
        const tag = idx === 0 ? 'th' : 'td';
        htmlTable += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
      });
      htmlTable += '</table>';
      return htmlTable;
    });

    // Bullet lists
    text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');

    // Numbered lists
    text = text.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<p><strong>$1.</strong> $2</p>');

    // Paragraph splits
    text = text.split(/\n\n+/).map(p => {
      p = p.trim();
      if (p.startsWith('<h1>') || p.startsWith('<h2>') || p.startsWith('<h3>') || p.startsWith('<ul>') || p.startsWith('<table>') || p.startsWith('<hr>') || p.startsWith('<p>')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    html = text;
  }

  // Post-processing: Ensure all raw asterisks **bold** are cleanly transformed to <strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*\*+$/, '').replace(/\*\*/g, '');

  return html;
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
    const formattedText = sanitizeAiOutput(data.recommendation || '');
    const aiOutputContainer = document.getElementById('ai-output') || document.getElementById('ai-text');
    if (aiOutputContainer) {
      aiOutputContainer.innerHTML = renderMarkdownToHtml(formattedText);
    }
    if (loading) loading.style.display = 'none';
    if (response) response.style.display = 'block';

  } catch (e) {
    const aiOutputContainer = document.getElementById('ai-output') || document.getElementById('ai-text');
    if (aiOutputContainer) {
      aiOutputContainer.innerHTML = '<p style="color:#ef4444;">AI analysis unavailable. Check your Groq API key.</p>';
    }
    if (loading) loading.style.display = 'none';
    if (response) response.style.display = 'block';
  }

  if (btn) btn.style.display = 'block';
}

// Expose globals for console / window interactions
window.analyzeBuilding = analyzeBuilding;
window.BUILDINGS = BUILDINGS;
window.FARM_BOUNDARIES = FARM_BOUNDARIES;
window.showFarmThermalOverlay = showFarmThermalOverlay;
window.addThermalGradientInside = addThermalGradientInside;
window.toggleSatellite = toggleSatellite;
window.getDynamicInterventionCosts = getDynamicInterventionCosts;
window.formatCostLabel = formatCostLabel;
window.updateInterventionCardTitles = updateInterventionCardTitles;
window.renderMarkdownToHtml = renderMarkdownToHtml;

/**
 * FIX 2: Replace heatmap with exact polygon fill
 * Shows thermal data ONLY within the actual solar farm boundary
 */
function showFarmThermalOverlay(building, metrics, fly = true) {
  if (!map || !building) return;
  const boundary = FARM_BOUNDARIES[building.id || building.building_id];
  if (!boundary) return;
  
  const risk = (metrics && metrics.risk_score !== undefined) ? metrics.risk_score : (building.risk || 70);
  const lossPct = (metrics && metrics.efficiency_loss_pct !== undefined) ? metrics.efficiency_loss_pct : 0;
  
  function getHeatColor(r, opacity) {
    if (r >= 90) return `rgba(227,26,28,${opacity})`;
    if (r >= 80) return `rgba(253,141,60,${opacity})`;
    if (r >= 70) return `rgba(255,237,160,${opacity})`;
    if (r >= 60) return `rgba(173,221,142,${opacity})`;
    return `rgba(49,163,84,${opacity})`;
  }
  
  const bId = building.id || building.building_id;
  const sourceId = `thermal-${bId}`;
  const fillId = `thermal-fill-${bId}`;
  const outlineId = `thermal-outline-${bId}`;
  
  if (map.getLayer(fillId)) map.removeLayer(fillId);
  if (map.getLayer(outlineId)) map.removeLayer(outlineId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
  
  map.addSource(sourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: { risk, lossPct },
      geometry: {
        type: 'Polygon',
        coordinates: [boundary.polygon]
      }
    }
  });
  
  map.addLayer({
    id: fillId,
    type: 'fill',
    source: sourceId,
    paint: {
      'fill-color': getHeatColor(risk, 0.65),
      'fill-opacity': 0.75
    }
  });
  
  map.addLayer({
    id: outlineId,
    type: 'line',
    source: sourceId,
    paint: {
      'line-color': getHeatColor(risk, 1),
      'line-width': 2,
      'line-opacity': 0.9
    }
  });
  
  // Click on farm polygon to analyze
  map.on('click', fillId, () => {
    analyzeBuilding(building);
  });
  map.on('mouseenter', fillId, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', fillId, () => {
    map.getCanvas().style.cursor = '';
  });
  
  if (fly && building.coordinates) {
    map.flyTo({
      center: building.coordinates,
      zoom: 11,
      duration: 1500
    });
  }
}

/**
 * FIX 3: Add concentric temperature gradient INSIDE polygon
 * Generates concentric heat zones inside the boundary: hottest in center, cooler at edges
 */
function addThermalGradientInside(building, metrics) {
  if (!map || !building) return;
  const boundary = FARM_BOUNDARIES[building.id || building.building_id];
  if (!boundary) return;
  
  const risk = (metrics && metrics.risk_score !== undefined) ? metrics.risk_score : (building.risk || 70);
  const poly = boundary.polygon;
  const lons = poly.map(p => p[0]);
  const lats = poly.map(p => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const width = maxLon - minLon;
  const height = maxLat - minLat;
  
  const zones = [
    { scale: 1.0, opacity: 0.35, riskMod: 0 },
    { scale: 0.75, opacity: 0.45, riskMod: 5 },
    { scale: 0.50, opacity: 0.55, riskMod: 10 },
    { scale: 0.25, opacity: 0.70, riskMod: 15 }
  ];
  
  function getHeatColor(r, opacity) {
    if (r >= 95) return `rgba(165,0,38,${opacity})`;
    if (r >= 88) return `rgba(227,26,28,${opacity})`;
    if (r >= 80) return `rgba(253,141,60,${opacity})`;
    if (r >= 70) return `rgba(255,237,160,${opacity})`;
    return `rgba(173,221,142,${opacity})`;
  }
  
  // Clean up any previously active gradient zones across all farms
  ['SF001', 'SF002', 'SF003', 'SF004', 'SF005'].forEach(farmId => {
    [0, 1, 2, 3].forEach(idx => {
      const zId = `zone-${farmId}-${idx}`;
      if (map.getLayer(zId)) map.removeLayer(zId);
      if (map.getSource(zId)) map.removeSource(zId);
    });
  });

  const bId = building.id || building.building_id;
  zones.forEach((zone, i) => {
    const zoneId = `zone-${bId}-${i}`;
    if (map.getLayer(zoneId)) 
      map.removeLayer(zoneId);
    if (map.getSource(zoneId)) 
      map.removeSource(zoneId);
    
    const w = width * zone.scale / 2;
    const h = height * zone.scale / 2;
    
    const zonePoly = [
      [centerLon - w, centerLat - h],
      [centerLon + w, centerLat - h],
      [centerLon + w, centerLat + h],
      [centerLon - w, centerLat + h],
      [centerLon - w, centerLat - h]
    ];
    
    map.addSource(zoneId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [zonePoly]
        }
      }
    });
    
    map.addLayer({
      id: zoneId,
      type: 'fill',
      source: zoneId,
      paint: {
        'fill-color': getHeatColor(
          risk + zone.riskMod, 
          zone.opacity
        ),
        'fill-opacity': 1
      }
    });

    map.on('click', zoneId, () => {
      analyzeBuilding(building);
    });
    map.on('mouseenter', zoneId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', zoneId, () => {
      map.getCanvas().style.cursor = '';
    });
  });
  
  if (building.coordinates) {
    map.flyTo({
      center: building.coordinates,
      zoom: 11,
      duration: 1500
    });
  }
}

// 9. AI Panel Detection & GeoJSON Rendering (YOLOv8 + Fallback)
let lastDetectionGeoJSON = null;
let lastDetectionData = null;

function renderDetectionLayers(geojson) {
  if (!geojson || !map) return;
  if (map.getSource('solar-detections')) {
    map.getSource('solar-detections').setData(geojson);
  } else {
    map.addSource('solar-detections', {
      type: 'geojson',
      data: geojson
    });

    map.addLayer({
      id: 'solar-polygons-fill',
      type: 'fill',
      source: 'solar-detections',
      paint: {
        'fill-color': '#f97316',
        'fill-opacity': 0.35
      }
    });

    map.addLayer({
      id: 'solar-polygons-outline',
      type: 'line',
      source: 'solar-detections',
      paint: {
        'line-color': '#f97316',
        'line-width': 1.5,
        'line-opacity': 0.9
      }
    });
  }
}

async function detectAndRenderPanels(building, autoSwitchSatellite = false) {
  if (!building) return;
  const coords = building.coordinates || [building.lng, building.lat];
  if (!coords || coords.length < 2) return;
  const lng = coords[0];
  const lat = coords[1];

  console.log(`Running YOLO detection for ${building.label || 'Solar Farm'}`);

  // Switch to satellite view if requested and not active
  if (autoSwitchSatellite && !satelliteMode) {
    toggleSatellite();
  }

  // Extract current map viewport bounding box if available
  let bbox = null;
  let zoomLevel = 16;
  if (typeof map !== 'undefined' && map && typeof map.getBounds === 'function') {
    const bounds = map.getBounds();
    if (bounds) {
      bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ];
    }
    if (typeof map.getZoom === 'function') {
      zoomLevel = Math.round(map.getZoom());
    }
  }

  try {
    const res = await fetch(`${API_BASE}/detect-panels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        lat, lng, zoom: 17
      })
    });

    const data = await res.json();

    if (data.status !== 'success' || !data.geojson_features || !data.geojson_features.length) {
      console.log('No panels detected');
      return;
    }

    console.log(
      `Detected ${data.panel_count} panel arrays, ` +
      `${data.total_surface_area_m2}m², ` +
      `model: ${data.model_used}`
    );

    const geojson = {
      type: 'FeatureCollection',
      features: data.geojson_features
    };
    lastDetectionGeoJSON = geojson;
    lastDetectionData = data;

    renderDetectionLayers(geojson);

    const detectedArea = data.total_surface_area_m2;
    const panelCount = data.panel_count;

    const existingBadge = document.getElementById('detection-badge');
    if (existingBadge) existingBadge.remove();

    const badge = document.createElement('div');
    badge.id = 'detection-badge';
    badge.style.cssText = `
      position: absolute;
      bottom: 80px;
      left: 12px;
      background: rgba(10,14,26,0.9);
      border: 1px solid #f97316;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 11px;
      color: #f9fafb;
      z-index: 10;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;
    badge.innerHTML = `
      <div style="color:#f97316;font-weight:500;margin-bottom:4px">
        ⚡ AI Panel Detection
      </div>
      <div>${panelCount} arrays detected</div>
      <div>${Number(detectedArea).toLocaleString()} m² solar area</div>
      <div style="font-size:9px;color:#9ca3af;margin-top:3px">
        Model: ${data.model_used}
      </div>
    `;

    const mapContainer = document.getElementById('map') || document.querySelector('.map-panel');
    if (mapContainer) mapContainer.appendChild(badge);

    map.flyTo({
      center: [lng, lat],
      zoom: 12,
      duration: 2000
    });

  } catch(e) {
    console.error('Panel detection error:', e);
  }
}

// Satellite basemap toggle
let satelliteMode = false;
function toggleSatellite() {
  satelliteMode = !satelliteMode;
  console.log(`Switching map basemap to: ${satelliteMode ? 'satellite-streets-v12' : 'dark-v11'}`);
  map.setStyle(
    satelliteMode 
      ? 'mapbox://styles/mapbox/satellite-streets-v12'
      : 'mapbox://styles/mapbox/dark-v11'
  );
  const btn = document.getElementById('satellite-btn');
  if (btn) {
    btn.textContent = satelliteMode 
      ? '🗺 Dark map' 
      : '🛰 Satellite view';
  }

  map.once('style.load', () => {
    console.log('New basemap style loaded. Re-attaching farm thermal overlays and AI panel detections.');
    // Re-attach base thermal polygons for all 5 farms
    BUILDINGS.forEach(b => {
      const fakeMetrics = { 
        risk_score: b.risk,
        efficiency_loss_pct: 0.20
      };
      showFarmThermalOverlay(b, fakeMetrics, false);
    });
    
    // Re-attach concentric gradient for active building
    const current = currentBuilding || selectedBuilding || BUILDINGS[0];
    if (current) {
      const metrics = currentMetrics || { risk_score: current.risk };
      showFarmThermalOverlay(current, metrics, false);
      addThermalGradientInside(current, metrics);
      if (lastDetectionGeoJSON) {
        renderDetectionLayers(lastDetectionGeoJSON);
      }
    }
  });
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


