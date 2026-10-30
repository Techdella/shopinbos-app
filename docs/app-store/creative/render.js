const {chromium}=require('playwright');const fs=require('fs');
// Usage, from the repo root: node docs/app-store/creative/render.js <scratch dir with a/rex-1.png and a/peggy-3.png (cropped from public/brand/mascots)> <out dir>
// Then convert the PNGs to JPG (no alpha) for App Store Connect.
const S=process.argv[2], OUT=process.argv[3];
const base=fs.readFileSync(__dirname+'/page.html','utf8').replace('REX','file://'+S+'/a/rex-1.png').replace('PEG','file://'+S+'/a/peggy-3.png');
// u = 1% of height-ish unit; all positions as fractions of W/H
const variants={
 'header-3840x1646':{w:3840,h:1646,u:24,l:'7%',cw:'44%',
  css:`#glow{width:1700px;height:1700px;left:52%;top:-6%}#ring{width:1500px;height:1500px;left:56%;top:8%}#lime{width:900px;height:900px;right:-260px;bottom:-560px}
  #rex{height:1200px;left:56%;top:17%}#peg{height:780px;left:76.5%;top:38%}
  #c1{left:49%;top:16%}#c2{left:80%;top:12%}#c3{left:48%;top:74%}`},
 'search-results-3840x2560':{w:3840,h:2560,u:34,l:'7%',cw:'46%',
  css:`#glow{width:2400px;height:2400px;left:46%;top:-10%}#ring{width:2100px;height:2100px;left:52%;top:10%}#lime{width:1300px;height:1300px;right:-400px;bottom:-800px}
  #rex{height:1500px;left:53%;top:25%}#peg{height:980px;left:76%;top:42%}
  #c1{left:52%;top:13%}#c2{left:78%;top:20%}#c3{left:51%;top:80%}`},
};
(async()=>{const b=await chromium.launch();
for(const [name,v] of Object.entries(variants)){
 const p=await b.newPage({viewport:{width:v.w,height:v.h}});
 const html=base.replace('</style>',`:root{--w:${v.w}px;--h:${v.h}px;--u:${v.u}px;--l:${v.l};--cw:${v.cw}}${v.css}</style>`);
 fs.writeFileSync(OUT+'/'+name+'.html',html);
 await p.goto('file://'+OUT+'/'+name+'.html');await p.waitForTimeout(500);
 await p.screenshot({path:OUT+'/'+name+'.png'});await p.close();}
await b.close();})();
