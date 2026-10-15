const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const pg = await b.newPage({ viewport: { width: +(process.env.W||1440), height: 1000 } });
  for (const v of process.argv.slice(3)) {
    await pg.goto('http://localhost:8099/V-' + v + '.dc.html', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(1500);
    const out = await pg.evaluate(() => {
      const site = document.querySelector('.site');
      const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
      return { html: site ? site.outerHTML : document.body.innerHTML, css };
    });
    fs.writeFileSync(`${process.argv[2]}/${v}.html`, out.html);
    if (v === 'home') fs.writeFileSync(`${process.argv[2]}/site.css`, out.css);
    console.log(v, out.html.length);
  }
  await b.close();
})();
