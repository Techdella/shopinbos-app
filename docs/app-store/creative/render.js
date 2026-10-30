// Makes the App Store creative assets (App Store Connect › the version › Header / Search Results) from the HTML pages
// next to this file. Run from the repo root after changing a page or the screenshots:
//   node docs/app-store/creative/render.js            images and videos
//   node docs/app-store/creative/render.js images     images only
// Images are RGB PNGs (Apple rejects alpha channels). Videos are H.264 MP4 at 30 fps with a silent audio track; the
// pages loop seamlessly, so each video is exactly one loop, stepped frame by frame for smooth motion.
const { chromium } = require('playwright');
const { execFileSync, spawn } = require('child_process');
const path = require('path');

const IMAGES = [
  ['header.html', 3840, 1646, 'header-3840x1646.png'],
  ['search-results.html', 3840, 2560, 'search-results-3840x2560.png'],
];
const VIDEOS = [
  // page, width, height, seconds (one loop), output
  ['header-video.html', 3840, 1646, 12, 'header-3840x1646.mp4'],
  ['search-results-video.html', 1920, 1280, 13.5, 'search-results-1920x1280.mp4'],
];
const FPS = 30;
const out = (name) => path.join(__dirname, name);

async function open(browser, page, width, height) {
  const tab = await browser.newPage({ viewport: { width, height } });
  await tab.goto('file://' + out(page));
  await tab.waitForLoadState('networkidle');
  return tab;
}

async function image(browser, [page, width, height, name]) {
  const tab = await open(browser, page, width, height);
  await tab.screenshot({ path: out(name) });
  await tab.close();
  execFileSync('python3', ['-c', `from PIL import Image
im = Image.open(${JSON.stringify(out(name))}).convert('RGB')
im.save(${JSON.stringify(out(name))})
if ${JSON.stringify(name)} == 'search-results-3840x2560.png':
    im.resize((1920, 1280), Image.LANCZOS).save(${JSON.stringify(out('search-results-1920x1280.png'))})`]);
  console.log(name);
}

async function video(browser, [page, width, height, seconds, name]) {
  const tab = await open(browser, page, width, height);
  await tab.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  const ffmpeg = spawn('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-map', '0:v', '-map', '1:a', '-shortest',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out(name),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => ffmpeg.on('close', (code) => (code ? reject(new Error(name)) : resolve())));
  const frames = Math.round(seconds * FPS);
  for (let i = 0; i < frames; i++) {
    await tab.evaluate((ms) => document.getAnimations().forEach((a) => { a.currentTime = ms; }), (i * 1000) / FPS);
    const jpg = await tab.screenshot({ type: 'jpeg', quality: 95 });
    if (!ffmpeg.stdin.write(jpg)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
  }
  ffmpeg.stdin.end();
  await done;
  await tab.close();
  console.log(name);
}

(async () => {
  const browser = await chromium.launch();
  for (const spec of IMAGES) await image(browser, spec);
  if (process.argv[2] !== 'images') for (const spec of VIDEOS) await video(browser, spec);
  await browser.close();
})();
