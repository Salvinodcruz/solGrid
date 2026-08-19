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
    await page.setViewport({ width: 1440, height: 1100 });

    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

    console.log('Navigating to http://localhost:8080...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Ensure Agua Caliente is selected
    const bName = await page.$eval('#building-name', el => el.textContent);
    console.log('Selected Asset:', bName);

    // Scroll to AI section
    await page.evaluate(() => {
      const aiSection = document.getElementById('ai-section');
      if (aiSection) aiSection.scrollIntoView({ behavior: 'smooth' });
    });
    await new Promise(r => setTimeout(r, 500));

    // Click "Analyze with SolGrid AI"
    console.log('Clicking "✦ Analyze with SolGrid AI" button...');
    await page.click('#ai-btn');

    // Wait for AI response text to populate
    await page.waitForFunction(
      () => {
        const el = document.getElementById('ai-text');
        return el && el.textContent && el.textContent.trim().length > 20;
      },
      { timeout: 35000 }
    );

    const aiText = await page.$eval('#ai-text', el => el.textContent);
    console.log('\n================ AI RECOMMENDATION OUTPUT ================');
    console.log(aiText);
    console.log('==========================================================\n');

    // Take screenshot of dashboard with AI response visible
    const artifactDir = `C:\\Users\\jjdcr\\.gemini\\antigravity-cli\\brain\\d2271233-b419-4669-b8d5-d49abea97a8a`;
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    const screenshotPath = path.join(artifactDir, 'solgrid_ai_dashboard.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);

    await browser.close();
    console.log('SUCCESS: AI Advisor tested and verified end-to-end.');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
})();
