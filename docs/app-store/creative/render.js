// Makes the App Store creative assets (App Store Connect › the version › Header / Search Results) from
// header.html and search-results.html. Run from the repo root after changing either page or the screenshots:
//   node docs/app-store/creative/render.js
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');

const PAGES = [
  ['header.html', 3840, 1646, 'header-3840x1646'],
  ['search-results.html', 3840, 2560, 'search-results-3840x2560'],
];

(async () => {
  const browser = await chromium.launch();
  for (const [page, width, height, name] of PAGES) {
    const tab = await browser.newPage({ viewport: { width, height } });
    await tab.goto('file://' + path.join(__dirname, page));
    await tab.waitForLoadState('networkidle');
    const png = path.join(__dirname, name + '.png');
    await tab.screenshot({ path: png });
    await tab.close();
    // Apple rejects alpha channels: save as RGB JPEG.
    execFileSync('python3', ['-c', `from PIL import Image
im = Image.open(${JSON.stringify(png)}).convert('RGB')
im.save(${JSON.stringify(png.replace(/\.png$/, '.jpg'))}, quality=92)
if ${JSON.stringify(name)} == 'search-results-3840x2560':
    im.resize((1920, 1280), Image.LANCZOS).save(${JSON.stringify(path.join(__dirname, 'search-results-1920x1280.jpg'))}, quality=92)
import os; os.remove(${JSON.stringify(png)})`]);
  }
  await browser.close();
})();
