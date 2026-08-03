const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  const failedRequests = [];
  page.on('requestfailed', req => {
    failedRequests.push(`${req.url()} - ${req.failure().errorText}`);
  });
  page.on('response', res => {
    if (res.status() >= 400) {
      failedRequests.push(`${res.url()} - HTTP ${res.status()}`);
    }
  });

  await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Failed requests count:', failedRequests.length);
  failedRequests.forEach(f => console.log('  Failed:', f));

  await browser.close();
})();
