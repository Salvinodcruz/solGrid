const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const errors = [];
    const consoleLogs = [];
    page.on('console', msg => {
      const txt = msg.text();
      consoleLogs.push(`[${msg.type()}] ${txt}`);
      if (msg.type() === 'error' && !txt.includes('favicon')) {
        errors.push(txt);
      }
    });

    page.on('pageerror', err => {
      errors.push(err.toString());
    });

    console.log('Navigating to http://localhost:8080...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2', timeout: 15000 });

    // Wait for map load
    await new Promise(r => setTimeout(r, 3000));

    // Evaluate map state at zoom 7
    const mapStateZoom7 = await page.evaluate(() => {
      const m = window.mapInstance;
      if (!m) return { error: 'Map instance not found' };
      return {
        zoom: m.getZoom(),
        center: m.getCenter(),
        maxZoom: m.getMaxZoom(),
        minZoom: m.getMinZoom(),
        styleLoaded: m.isStyleLoaded(),
        hasHeatmapSource: !!m.getSource('farms-heat'),
        hasHeatmapLayer: !!m.getLayer('farms-heat-layer'),
        heatmapPaint: m.getLayer('farms-heat-layer') ? {
          color: m.getPaintProperty('farms-heat-layer', 'heatmap-color'),
          radius: m.getPaintProperty('farms-heat-layer', 'heatmap-radius'),
          intensity: m.getPaintProperty('farms-heat-layer', 'heatmap-intensity'),
          opacity: m.getPaintProperty('farms-heat-layer', 'heatmap-opacity')
        } : null
      };
    });

    console.log('=== MAP STATE AT ZOOM 7 ===');
    console.log(JSON.stringify(mapStateZoom7, null, 2));

    const markerCount = await page.$$eval('.custom-marker', els => els.length);
    console.log('Dot Markers on top of map:', markerCount);

    const artifactDir = 'C:\\Users\\jjdcr\\.gemini\\antigravity-cli\\brain\\d2271233-b419-4669-b8d5-d49abea97a8a';
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    // Take zoom 7 screenshot
    const screenshotPath7 = path.join(artifactDir, 'heatmap_zoom_7.png');
    await page.screenshot({ path: screenshotPath7 });
    console.log('Screenshot at zoom 7 saved to:', screenshotPath7);

    // Zoom into zoom 12
    console.log('Zooming in to zoom 12...');
    await page.evaluate(() => {
      const m = window.mapInstance;
      m.setZoom(12);
    });
    await new Promise(r => setTimeout(r, 2000));

    const mapStateZoom12 = await page.evaluate(() => {
      const m = window.mapInstance;
      return {
        zoom: m.getZoom(),
        center: m.getCenter(),
        styleLoaded: m.isStyleLoaded(),
        hasHeatmapLayer: !!m.getLayer('farms-heat-layer')
      };
    });
    console.log('=== MAP STATE AT ZOOM 12 ===');
    console.log(JSON.stringify(mapStateZoom12, null, 2));

    const screenshotPath12 = path.join(artifactDir, 'heatmap_zoom_12.png');
    await page.screenshot({ path: screenshotPath12 });
    console.log('Screenshot at zoom 12 saved to:', screenshotPath12);

    console.log('=== CONSOLE ERRORS ===');
    console.log(errors.length > 0 ? errors : 'No console errors detected.');

    await browser.close();
    console.log('SUCCESS: All heatmap verification checks completed.');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
})();
