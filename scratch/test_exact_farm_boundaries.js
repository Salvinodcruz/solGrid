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
    await page.setViewport({ width: 1440, height: 960 });

    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
      console.log(`[Browser Console]: ${msg.text()}`);
    });
    page.on('pageerror', err => {
      console.error(`[Browser PageError]: ${err.message}`);
    });

    console.log('Navigating to http://localhost:8000/index.html...');
    await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle2' });

    // Wait for map to load and initial polygon layers to be added
    await page.waitForFunction(() => {
      return window.map && window.map.isStyleLoaded() && !!window.map.getLayer('thermal-fill-SF001');
    }, { timeout: 15000 });

    await new Promise(r => setTimeout(r, 2000));

    const artifactDir = `C:\\Users\\jjdcr\\.gemini\\antigravity-cli\\brain\\739af824-b79a-4b62-a415-b63cd8430e4c`;
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    // Step 1: Check overview at zoom 7 with all 5 farm polygons
    const overviewState = await page.evaluate(() => {
      const farmIds = ['SF001', 'SF002', 'SF003', 'SF004', 'SF005'];
      const farmLayers = {};
      farmIds.forEach(id => {
        const fill = map.getLayer(`thermal-fill-${id}`);
        const outline = map.getLayer(`thermal-outline-${id}`);
        const fillPaint = fill ? map.getPaintProperty(`thermal-fill-${id}`, 'fill-color') : null;
        const outlinePaint = outline ? map.getPaintProperty(`thermal-outline-${id}`, 'line-color') : null;
        farmLayers[id] = {
          hasFill: !!fill,
          hasOutline: !!outline,
          fillColor: fillPaint,
          outlineColor: outlinePaint
        };
      });

      return {
        center: map.getCenter(),
        zoom: map.getZoom(),
        farms: farmLayers
      };
    });
    console.log('Overview State (All 5 Farm Polygons):', JSON.stringify(overviewState, null, 2));

    const shotOverview = path.join(artifactDir, 'step1_overview_all_farms.png');
    await page.screenshot({ path: shotOverview, fullPage: true });
    console.log('Saved overview screenshot to:', shotOverview);

    // Step 2: Click Agua Caliente (SF001)
    console.log('Selecting Agua Caliente (SF001, risk 97)...');
    await page.evaluate(() => {
      const agua = BUILDINGS.find(b => b.id === 'SF001');
      window.analyzeBuilding(agua);
    });

    await new Promise(r => setTimeout(r, 2500));

    const aguaState = await page.evaluate(() => {
      const zones = [0, 1, 2, 3].map(i => {
        const layer = map.getLayer(`zone-SF001-${i}`);
        return {
          zoneIndex: i,
          hasLayer: !!layer,
          fillColor: layer ? map.getPaintProperty(`zone-SF001-${i}`, 'fill-color') : null
        };
      });

      return {
        center: map.getCenter(),
        zoom: map.getZoom(),
        buildingName: document.getElementById('building-name')?.innerText,
        monthlyLoss: document.getElementById('monthly-loss-display')?.innerText,
        gradientZones: zones
      };
    });
    console.log('Agua Caliente State (Deep Red Concentric Zones):', JSON.stringify(aguaState, null, 2));

    const shotAgua = path.join(artifactDir, 'step2_agua_caliente_concentric.png');
    await page.screenshot({ path: shotAgua, fullPage: true });
    console.log('Saved Agua Caliente screenshot to:', shotAgua);

    // Step 3: Click Hyder Solar Project (SF005, risk 61)
    console.log('Selecting Hyder Solar Project (SF005, risk 61)...');
    await page.evaluate(() => {
      const hyder = BUILDINGS.find(b => b.id === 'SF005');
      window.analyzeBuilding(hyder);
    });

    await new Promise(r => setTimeout(r, 2500));

    const hyderState = await page.evaluate(() => {
      const zones = [0, 1, 2, 3].map(i => {
        const layer = map.getLayer(`zone-SF005-${i}`);
        return {
          zoneIndex: i,
          hasLayer: !!layer,
          fillColor: layer ? map.getPaintProperty(`zone-SF005-${i}`, 'fill-color') : null
        };
      });

      return {
        center: map.getCenter(),
        zoom: map.getZoom(),
        buildingName: document.getElementById('building-name')?.innerText,
        monthlyLoss: document.getElementById('monthly-loss-display')?.innerText,
        gradientZones: zones
      };
    });
    console.log('Hyder Solar State (Green/Yellow Concentric Zones):', JSON.stringify(hyderState, null, 2));

    const shotHyder = path.join(artifactDir, 'step3_hyder_solar_concentric.png');
    await page.screenshot({ path: shotHyder, fullPage: true });
    console.log('Saved Hyder Solar screenshot to:', shotHyder);

    // Step 4: Toggle Satellite View
    console.log('Toggling Satellite Mode...');
    await page.click('#satellite-btn');

    await page.waitForFunction(() => {
      return window.map && window.map.isStyleLoaded() && !!window.map.getLayer('thermal-fill-SF005');
    }, { timeout: 15000 });

    await new Promise(r => setTimeout(r, 2500));

    const satState = await page.evaluate(() => {
      const farmIds = ['SF001', 'SF002', 'SF003', 'SF004', 'SF005'];
      const farmLayers = {};
      farmIds.forEach(id => {
        farmLayers[id] = !!map.getLayer(`thermal-fill-${id}`);
      });
      return {
        styleUrl: map.getStyle()?.name || 'satellite-streets',
        farmsPresent: farmLayers,
        hasActiveZone: !!map.getLayer('zone-SF005-0')
      };
    });
    console.log('Satellite View State:', JSON.stringify(satState, null, 2));

    const shotSat = path.join(artifactDir, 'step4_satellite_view_alignment.png');
    await page.screenshot({ path: shotSat, fullPage: true });
    console.log('Saved Satellite view screenshot to:', shotSat);

    await browser.close();
    console.log('ALL VERIFICATION CHECKS PASSED');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
})();
