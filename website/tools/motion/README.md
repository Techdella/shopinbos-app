# 15-second motion graphic (home page video)

`shopinbos-15s.html` is the animation (CSS keyframes, `window.seek(ms)` jumps to any moment).
Render: `node frames.js <this folder>` (Playwright) writes `f/0000.jpg…` at 30 fps, then
`ffmpeg -framerate 30 -i f/%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 26 -movflags +faststart -an shopinbos-15s.mp4`
and copy it to `themes/shopinbos/assets/video/`. (frames.js opens `index.html`: copy or rename the HTML first.)
