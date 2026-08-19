const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  console.log('--- 1. INITIAL LOAD STATE ---');
  let bName = await page.$eval('#building-name', el => el.textContent);
  let riskBadge = await page.$eval('#risk-score-badge', el => el.textContent);
  let monthlyLoss = await page.$eval('#monthly-loss-display', el => el.textContent);
  let effLoss = await page.$eval('#efficiency-loss-display', el => el.textContent);
  let panelTemp = await page.$eval('#panel-temp-display', el => el.textContent);
  let simAfterTemp = await page.$eval('#sim-after-temp', el => el.textContent);
  let simSavedDiff = await page.$eval('#sim-saved-diff', el => el.textContent);

  console.log('Building Name:', bName);
  console.log('Risk Badge:', riskBadge);
  console.log('Monthly Loss:', monthlyLoss);
  console.log('Efficiency Loss:', effLoss);
  console.log('Panel Temp:', panelTemp);
  console.log('Sim After Temp:', simAfterTemp);
  console.log('Sim Saved Diff:', simSavedDiff);

  console.log('\n--- 2. MARKER CLICK (Building #2: 88 W Jefferson St) ---');
  const markers = await page.$$('.custom-marker');
  console.log(`Found ${markers.length} markers`);

  if (markers.length > 1) {
    await markers[1].click();
    await new Promise(r => setTimeout(r, 1000));

    bName = await page.$eval('#building-name', el => el.textContent);
    riskBadge = await page.$eval('#risk-score-badge', el => el.textContent);
    monthlyLoss = await page.$eval('#monthly-loss-display', el => el.textContent);
    effLoss = await page.$eval('#efficiency-loss-display', el => el.textContent);
    panelTemp = await page.$eval('#panel-temp-display', el => el.textContent);

    console.log('Selected Building Name:', bName);
    console.log('Updated Risk Badge:', riskBadge);
    console.log('Updated Monthly Loss:', monthlyLoss);
    console.log('Updated Efficiency Loss:', effLoss);
    console.log('Updated Panel Temp:', panelTemp);
  }

  console.log('\n--- 3. SLIDER INTERACTION (Misting Intensity -> 0.6) ---');
  await page.evaluate(() => {
    const mistingSlider = document.getElementById('slider-misting');
    mistingSlider.value = 0.6;
    mistingSlider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 1000));

  const afterTemp = await page.$eval('#sim-after-temp', el => el.textContent);
  const tempDiff = await page.$eval('#sim-temp-diff', el => el.textContent);
  const savedDiff = await page.$eval('#sim-saved-diff', el => el.textContent);
  const paybackMisting = await page.$eval('#payback-misting', el => el.textContent);

  console.log('New Cell Temp:', afterTemp);
  console.log('Temp Drop:', tempDiff);
  console.log('Recovered USD:', savedDiff);
  console.log('Payback Misting:', paybackMisting);

  console.log('\n--- 4. FORECAST CHART & ROI ALLOCATION ---');
  const hasPlotly = await page.evaluate(() => {
    const chart = document.getElementById('forecast-chart');
    return chart && chart.data && chart.data.length > 0;
  });
  console.log('Plotly Forecast Chart Rendered:', hasPlotly);

  const roiItemsCount = await page.evaluate(() => {
    return document.querySelectorAll('.roi-item').length;
  });
  console.log(`ROI Recommendations List Rendered (${roiItemsCount} items)`);

  await browser.close();
})();
