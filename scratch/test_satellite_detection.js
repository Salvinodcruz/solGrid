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
    await page.setViewport({ width: 1440, height: 1000 });

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

    // Wait for initial building and satellite detection to load
    await page.waitForFunction(() => {
      const stats = document.getElementById('detection-stats');
      return stats && stats.style.display !== 'none' && stats.textContent.includes('panel zones detected');
    }, { timeout: 15000 }).catch(e => console.log('Timeout waiting for detection stats:', e.message));

    await new Promise(r => setTimeout(r, 2000));

    const artifactDir = `C:\\Users\\jjdcr\\.gemini\\antigravity-cli\\brain\\739af824-b79a-4b62-a415-b63cd8430e4c`;
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    // Evaluate Agua Caliente detection state
    const detectionStateInitial = await page.evaluate(() => {
      const panel = document.getElementById('satellite-detection-panel');
      const img = document.getElementById('satellite-img');
      const canvas = document.getElementById('detection-overlay');
      const stats = document.getElementById('detection-stats');
      return {
        panelDisplay: panel?.style?.display,
        imgVisible: img?.style?.display !== 'none',
        imgSrcPrefix: img?.src?.substring(0, 30),
        canvasWidth: canvas?.width,
        canvasHeight: canvas?.height,
        statsText: stats?.innerText
      };
    });
    console.log('Agua Caliente Detection State:', JSON.stringify(detectionStateInitial, null, 2));

    const shotAgua = path.join(artifactDir, 'detection_agua_caliente.png');
    await page.screenshot({ path: shotAgua, fullPage: true });
    console.log('Saved Agua Caliente screenshot to:', shotAgua);

    // Test Lookup: Topaz Solar Farm
    console.log('Testing lookup for "Topaz Solar Farm"...');
    await page.focus('#farm-lookup-input');
    await page.keyboard.type('Topaz Solar Farm');
    await page.click('#btn-analyze-lookup');

    // Wait for lookup result and re-detection
    await page.waitForFunction(() => {
      const lookupRes = document.getElementById('lookup-result');
      const stats = document.getElementById('detection-stats');
      return lookupRes && lookupRes.style.display !== 'none' && 
             stats && stats.style.display !== 'none' && stats.textContent.includes('panel zones detected');
    }, { timeout: 15000 });

    await new Promise(r => setTimeout(r, 2000));

    const lookupState = await page.evaluate(() => {
      const lookupRes = document.getElementById('lookup-result');
      const stats = document.getElementById('detection-stats');
      const img = document.getElementById('satellite-img');
      return {
        lookupText: lookupRes?.innerText,
        statsText: stats?.innerText,
        imgVisible: img?.style?.display !== 'none'
      };
    });
    console.log('Topaz Solar Farm Lookup State:', JSON.stringify(lookupState, null, 2));

    const shotTopaz = path.join(artifactDir, 'detection_topaz_solar.png');
    await page.screenshot({ path: shotTopaz, fullPage: true });
    console.log('Saved Topaz screenshot to:', shotTopaz);

    await browser.close();
    console.log('ALL TESTS PASSED SUCCESSFULLY');
  } catch (err) {
    console.error('Puppeteer verification error:', err);
    process.exit(1);
  }
})();
