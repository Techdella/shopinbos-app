const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  for (const [src, out, label] of JSON.parse(process.argv[2])) {
    const p = await b.newPage();
    await p.goto('file://' + path.resolve(src), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-family:monospace;font-size:7px;color:#6E6E68;padding:0 16mm;display:flex;justify-content:space-between;letter-spacing:.08em"><span>SHOPINBOS · ${label}</span><span>app.shopinbos.com · <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>` });
  }
  await b.close();
})();
