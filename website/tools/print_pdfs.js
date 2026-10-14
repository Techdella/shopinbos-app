const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
(async () => {
  const work = process.argv[2];
  const only = process.argv[3];
  const man = JSON.parse(fs.readFileSync(work + '/manifest.json', 'utf8'));
  fs.mkdirSync(work + '/pdf', { recursive: true }); fs.mkdirSync(work + '/covers', { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const pg = await b.newPage();
  const header = (t) => `<div style="width:100%;font-family:sans-serif;font-size:7.5pt;color:#9C98A8;padding:0 18mm;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact"><span style="font-weight:700;color:#16141F">Shopinbos</span><span>${t.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span></div>`;
  const footer = `<div style="width:100%;font-family:sans-serif;font-size:7.5pt;color:#9C98A8;padding:0 18mm;display:flex;justify-content:space-between"><span>shopinbos.com</span><span>Page <span class="pageNumber"></span></span></div>`;
  for (const m of man) {
    if (only && m.slug !== only) continue;
    await pg.goto('file://' + m.base + '-body.html', { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready);
    await pg.pdf({ path: m.base + '-body.pdf', format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: header(m.title.length > 70 ? m.title.slice(0, 68) + '…' : m.title), footerTemplate: footer, margin: { top: '24mm', bottom: '22mm', left: '18mm', right: '18mm' } });
    const bodyPages = (fs.readFileSync(m.base + '-body.pdf', 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    const total = bodyPages + 2;
    const cov = fs.readFileSync(m.base + '-cover.html', 'utf8').replace('PAGES_LABEL', `${total} pages · PDF`);
    fs.writeFileSync(m.base + '-cover.final.html', cov);
    await pg.goto('file://' + m.base + '-cover.final.html', { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready);
    await pg.pdf({ path: m.base + '-cover.pdf', format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    await pg.setViewportSize({ width: 794, height: 1123 });
    await pg.screenshot({ path: `${work}/covers/${m.slug}.png`, clip: { x: 0, y: 0, width: 794, height: 1123 } });
    await pg.goto('file://' + m.base + '-back.html', { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready);
    await pg.pdf({ path: m.base + '-back.pdf', format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    execFileSync('pdfunite', [m.base + '-cover.pdf', m.base + '-body.pdf', m.base + '-back.pdf', `${work}/pdf/${m.slug}.pdf`]);
    m.pages = total; m.size = fs.statSync(`${work}/pdf/${m.slug}.pdf`).size;
    console.log(m.slug, total, 'pages', Math.round(m.size / 1024) + 'KB');
  }
  fs.writeFileSync(work + '/manifest.json', JSON.stringify(man, null, 1));
  await b.close();
})();
