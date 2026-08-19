function addHeatmapLayer(map, buildings) {
  const features = buildings.map(b => ({
    type: 'Feature',
    properties: {
      risk: b.risk,
      weight: b.risk / 100,
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
      'heatmap-intensity': 1.5,
      'heatmap-color': [
        'interpolate', ['linear'],
        ['heatmap-density'],
        0,   'rgba(30,64,175,0)',
        0.15,'rgba(59,130,246,0.5)',
        0.35,'rgba(34,197,94,0.7)',
        0.55,'rgba(234,179,8,0.8)',
        0.75,'rgba(249,115,22,0.9)',
        1,   'rgba(239,68,68,1)'
      ],
      'heatmap-radius': [
        'interpolate', ['linear'],
        ['zoom'],
        4, 60,
        7, 120,
        10, 200
      ],
      'heatmap-opacity': 0.75
    }
  });
}
