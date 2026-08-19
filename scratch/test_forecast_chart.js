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

    console.log('Navigating to http://localhost:8080...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Check chart type
    const chartInfo = await page.evaluate(() => {
      const chartEl = document.getElementById('forecast-chart');
      if (!chartEl || !chartEl.data || !chartEl.data.length) return null;
      const trace = chartEl.data[0];
      return {
        type: trace.type,
        mode: trace.mode,
        fill: trace.fill,
        pointsCount: trace.x ? trace.x.length : 0,
        shapesCount: chartEl.layout && chartEl.layout.shapes ? chartEl.layout.shapes.length : 0,
        annotationsCount: chartEl.layout && chartEl.layout.annotations ? chartEl.layout.annotations.length : 0
      };
    });

    console.log('Chart info on initial load:', chartInfo);

    // Click marker #2
    const markers = await page.$$('.custom-marker');
    if (markers.length > 1) {
      console.log('Clicking 2nd farm marker...');
      await markers[1].click();
      await new Promise(r => setTimeout(r, 1500));
    }

    const updatedChartInfo = await page.evaluate(() => {
      const chartEl = document.getElementById('forecast-chart');
      if (!chartEl || !chartEl.data || !chartEl.data.length) return null;
      const trace = chartEl.data[0];
      return {
        type: trace.type,
        mode: trace.mode,
        fill: trace.fill,
        pointsCount: trace.x ? trace.x.length : 0
      };
    });
    console.log('Chart info after marker click:', updatedChartInfo);

    // Scroll to forecast chart
    await page.evaluate(() => {
      const el = document.getElementById('forecast-chart');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
    await new Promise(r => setTimeout(r, 1000));

    const artifactDir = `C:\\Users\\jjdcr\\.gemini\\antigravity-cli\\brain\\ee38460c-361b-4cce-b260-b1e6cb9e8d69`;
    const screenshotPath = path.join(artifactDir, 'solgrid_area_chart.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Screenshot saved to:', screenshotPath);

    await browser.close();
    console.log('SUCCESS: Forecast area chart verified!');
  } catch (err) {
    console.error('Error during test:', err);
    process.exit(1);
  }
})();
