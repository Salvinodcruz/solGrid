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
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

    console.log('Navigating to http://localhost:8080...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const artifactDir = `C:\\Users\\jjdcr\\.gemini\\antigravity-cli\\brain\\ee38460c-361b-4cce-b260-b1e6cb9e8d69`;
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    const screenshotPath = path.join(artifactDir, 'solgrid_dashboard.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot successfully saved to:', screenshotPath);

    console.log('--- CONSOLE LOGS ---');
    consoleLogs.forEach(log => {
      if (!log.includes('mapbox.com') && !log.includes('401')) {
        console.log(log);
      }
    });

    await browser.close();
  } catch (err) {
    console.error('Puppeteer error:', err);
    process.exit(1);
  }
})();
