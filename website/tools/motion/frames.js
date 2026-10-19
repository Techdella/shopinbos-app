const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2], fps = 30, total = 17200;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await pg.goto('file://' + dir + '/index.html'); await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(500);
  require('fs').mkdirSync(dir + '/f', { recursive: true });
  for (let i = 0; i * 1000 / fps <= total; i++) {
    await pg.evaluate(ms => window.seek(ms), i * 1000 / fps);
    await pg.screenshot({ path: `${dir}/f/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  await b.close();
})();
