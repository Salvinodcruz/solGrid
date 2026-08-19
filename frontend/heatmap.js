/**
 * SolGrid Heatmap & Satellite Polygon Thermal Overlay
 * FortyGuard Satellite Panel Segmentation Integration
 */

function addSatellitePanelPolygons(map, buildings) {
  if (!map || !buildings) return;

  const features = buildings
    .filter(b => b.array_bounds)
    .map(b => {
      // Calculate cell temperature if not already computed
      const ghi = b.ghi || 950.0;
      const windSpeed = b.wind_speed || 2.0;
      const windFactor = 9.5 / (5.7 + 3.8 * Math.max(windSpeed, 0.1));
      const tRoof = b.t_roof || 60.0;
      const tCell = b.t_cell !== undefined
        ? Number(b.t_cell)
        : Math.round((tRoof + ((45 - 20) / 800.0) * ghi * windFactor) * 10) / 10;

      return {
        type: 'Feature',
        id: b.id || b.building_id,
        properties: {
          id: b.id || b.building_id,
          label: b.label,
          address: b.address,
          rated_kw: b.rated_kw,
          panel_area_m2: b.panel_area_m2,
          thermal_density_loss: b.thermal_density_loss,
          t_roof: tRoof,
          t_cell: tCell,
          risk: b.risk !== undefined ? b.risk : b.risk_score,
          operator: b.operator || '',
          install_year: b.install_year || ''
        },
        geometry: b.array_bounds
      };
    });

  const geojson = {
    type: 'FeatureCollection',
    features: features
  };

  // If source already exists, update data dynamically
  if (map.getSource('satellite-panels')) {
    map.getSource('satellite-panels').setData(geojson);
    return;
  }

  // 1. Add GeoJSON source for satellite panel polygons
  map.addSource('satellite-panels', {
    type: 'geojson',
    data: geojson
  });

  // 2. Add 'panel-fills' fill layer over exact satellite footprint
  // Color scale:
  //   < 50°C (Cell Temp): #22c55e (Green)
  //   50°C - 62°C:        #f97316 (Orange)
  //   > 62°C:             #ef4444 (Red / Critical Heat Stress)
  // Fill opacity: 0.65
  map.addLayer({
    id: 'panel-fills',
    type: 'fill',
    source: 'satellite-panels',
    paint: {
      'fill-color': [
        'case',
        ['>', ['get', 't_cell'], 62], '#ef4444',
        ['>=', ['get', 't_cell'], 50], '#f97316',
        '#22c55e'
      ],
      'fill-opacity': 0.65
    }
  });

  // 3. Add 'panel-borders' line layer (Cyan Tech Glow)
  map.addLayer({
    id: 'panel-borders',
    type: 'line',
    source: 'satellite-panels',
    paint: {
      'line-color': '#00f3ff',
      'line-width': 2,
      'line-dasharray': [2, 1]
    }
  });

  // Click polygon to select and analyze building
  map.on('click', 'panel-fills', (e) => {
    if (e.features && e.features.length > 0) {
      const featureId = e.features[0].properties.id;
      const targetBuilding = buildings.find(b => (b.id || b.building_id) === featureId);
      if (targetBuilding && typeof window.analyzeBuilding === 'function') {
        window.analyzeBuilding(targetBuilding);
      }
    }
  });

  // Interactive cursor for panel polygons
  map.on('mouseenter', 'panel-fills', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'panel-fills', () => {
    map.getCanvas().style.cursor = '';
  });
}

function addHeatmapLayer(map, buildings) {
  const features = buildings.map(b => ({
    type: 'Feature',
    properties: {
      risk: b.risk !== undefined ? b.risk : b.risk_score,
      weight: (b.risk !== undefined ? b.risk : b.risk_score) / 100,
      label: b.label,
      rated_kw: b.rated_kw
    },
    geometry: {
      type: 'Point',
      coordinates: b.coordinates
    }
  }));

  const geojson = {
    type: 'FeatureCollection',
    features: features
  };

  if (map.getSource('farms-heat')) {
    map.getSource('farms-heat').setData(geojson);
    return;
  }

  map.addSource('farms-heat', {
    type: 'geojson',
    data: geojson
  });

  map.addLayer({
    id: 'farms-heat-layer',
    type: 'heatmap',
    source: 'farms-heat',
    paint: {
      'heatmap-weight': [
        'interpolate', ['linear'],
        ['get', 'weight'],
        0, 0, 1, 1
      ],
      'heatmap-intensity': 1.2,
      'heatmap-color': [
        'interpolate', ['linear'],
        ['heatmap-density'],
        0,   'rgba(30,64,175,0)',
        0.15,'rgba(59,130,246,0.35)',
        0.35,'rgba(34,197,94,0.5)',
        0.55,'rgba(234,179,8,0.65)',
        0.75,'rgba(249,115,22,0.8)',
        1,   'rgba(239,68,68,0.9)'
      ],
      'heatmap-radius': [
        'interpolate', ['linear'],
        ['zoom'],
        4, 50,
        7, 100,
        10, 160
      ],
      'heatmap-opacity': 0.6
    }
  });
}
