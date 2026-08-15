/**
 * Heatmap layer logic for SolGrid Thermal Sync
 */

function addHeatmapLayer(map, buildings) {
  if (!map || typeof map.addSource !== 'function') return;

  const geojson = {
    type: 'FeatureCollection',
    features: buildings.map(b => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [b.lng, b.lat]
      },
      properties: {
        risk_score: b.risk_score || b.risk || 50,
        label: b.label
      }
    }))
  };

  const sourceId = 'thermal-heatmap-source';
  const layerId = 'thermal-heatmap-layer';

  if (map.getSource(sourceId)) {
    map.getSource(sourceId).setData(geojson);
  } else {
    map.addSource(sourceId, {
      type: 'geojson',
      data: geojson
    });
  }

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: 'heatmap',
      source: sourceId,
      maxzoom: 18,
      paint: {
        // Increase heatmap weight based on risk_score (0 - 100)
        'heatmap-weight': [
          'interpolate',
          ['linear'],
          ['get', 'risk_score'],
          0, 0,
          100, 1
        ],
        // Intensity scaling by zoom level
        'heatmap-intensity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 1,
          15, 3
        ],
        // Color scale: blue (low) -> yellow (mid) -> red (high)
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0,0,255,0)',
          0.2, 'rgba(37, 99, 235, 0.6)',   // Blue (low)
          0.5, 'rgba(234, 179, 8, 0.8)',   // Yellow (mid)
          0.8, 'rgba(249, 115, 22, 0.9)',  // Orange
          1, 'rgba(239, 68, 68, 1)'        // Red (high)
        ],
        // Radius of influence: 60px
        'heatmap-radius': 60,
        // Opacity
        'heatmap-opacity': 0.75
      }
    });
  }
}
