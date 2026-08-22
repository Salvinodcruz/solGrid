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
      const txt = msg.text();
      consoleLogs.push(`[${msg.type()}] ${txt}`);
      console.log(`[Browser Console]: ${txt}`);
    });
    page.on('pageerror', err => {
      console.error(`[Browser PageError]: ${err.message}`);
    });

    console.log('Navigating to http://localhost:8000/index.html...');
    await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle2' });
    
    // Wait for FortyGuard tiles to finish loading
    await page.waitForFunction(() => {
      const src = window.map?.getSource('fortyguard-tiles');
      return !!src && !!src._data?.features?.length;
    }, { timeout: 15000 }).catch(() => console.log('Timeout waiting for initial tiles'));

    await new Promise(r => setTimeout(r, 2000));

    const artifactDir = `C:\\Users\\jjdcr\\.gemini\\antigravity-cli\\brain\\52c7f121-b6dc-4412-80c9-3b831aa3a22f`;
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    const stateBefore = await page.evaluate(() => {
      const tilesSource = map?.getSource('fortyguard-tiles');
      const heatLayer = map?.getLayer('fortyguard-heat-layer');
      return {
        center: map?.getCenter(),
        zoom: map?.getZoom(),
        hasTilesSource: !!tilesSource,
        hasHeatLayer: !!heatLayer,
        tileCount: tilesSource?._data?.features?.length,
        sampleProps: tilesSource?._data?.features?.[0]?.properties
      };
    });
    console.log('Map State (Initial):', JSON.stringify(stateBefore, null, 2));

    const screenshotDarkPath = path.join(artifactDir, 'solgrid_dark_view.png');
    await page.screenshot({ path: screenshotDarkPath, fullPage: true });
    console.log('Dark view screenshot successfully saved to:', screenshotDarkPath);

    // Check Satellite toggle button
    const btnTextBefore = await page.evaluate(() => document.getElementById('satellite-btn')?.textContent?.trim());
    console.log('Satellite button before click:', btnTextBefore);

    console.log('Clicking #satellite-btn...');
    await page.click('#satellite-btn');
    
    // Give style time to initiate loading
    await new Promise(r => setTimeout(r, 1000));

    // Wait for style reload and tiles re-attachment
    await page.waitForFunction(() => {
      return window.map?.isStyleLoaded() && 
             !!window.map?.getSource('fortyguard-tiles') && 
             !!window.map?.getLayer('fortyguard-heat-layer');
    }, { timeout: 15000 }).catch(() => console.log('Timeout waiting for sat tiles'));

    await new Promise(r => setTimeout(r, 2000));

    const btnTextAfter = await page.evaluate(() => document.getElementById('satellite-btn')?.textContent?.trim());
    console.log('Satellite button after click:', btnTextAfter);

    const stateAfterSat = await page.evaluate(() => {
      const tilesSource = map?.getSource('fortyguard-tiles');
      const heatLayer = map?.getLayer('fortyguard-heat-layer');
      return {
        center: map?.getCenter(),
        zoom: map?.getZoom(),
        hasTilesSource: !!tilesSource,
        hasHeatLayer: !!heatLayer,
        tileCount: tilesSource?._data?.features?.length,
        sampleProps: tilesSource?._data?.features?.[0]?.properties
      };
    });
    console.log('Map State (After Satellite Toggle):', JSON.stringify(stateAfterSat, null, 2));

    const screenshotSatPath = path.join(artifactDir, 'solgrid_satellite_view.png');
    await page.screenshot({ path: screenshotSatPath, fullPage: true });
    console.log('Satellite view screenshot successfully saved to:', screenshotSatPath);

    await browser.close();
    console.log('VERIFICATION COMPLETE');
  } catch (err) {
    console.error('Puppeteer error:', err);
    process.exit(1);
  }
})();
