// Scoped CSS for the 2026 themes' product page. Container queries on the `.bq` root (BOUTIQUE_CSS), so builder phone
// previews lay out like real phones. Layout comes from data-layout / data-gallery on .bq-pdp2.

export const PDP_CSS = `
.bq-pdp2{--pdp-gap:20px}
.bq-pdp2-main{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--pdp-gap)}
/* One column that never grows past the screen: the tab row and long words scroll or wrap inside it. */
.bq-pdp2-blocks{display:grid;grid-template-columns:minmax(0,1fr)}
.bq-pdp2-blocks > *{min-width:0}
.bq-pdp2-media,.bq-pdp2-info{min-width:0}
.bq-pdp2-gal{display:grid;gap:10px}
.bq-pdp2-viewer{position:relative}
.bq-pdp2-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;border-radius:var(--bq-card-radius);overscroll-behavior-x:contain}
.bq-pdp2-track::-webkit-scrollbar,.bq-pdp2-thumbs::-webkit-scrollbar{display:none}
.bq-pdp2-slide{flex:0 0 100%;scroll-snap-align:center;aspect-ratio:var(--pdp-ratio,1/1);position:relative;overflow:hidden;background:var(--bq-placeholder);border:0;padding:0;margin:0;display:block;width:100%}
.bq-pdp2-slide img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .25s ease}
.bq-pdp2-slide iframe,.bq-pdp2-slide video{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;object-fit:contain}
.bq-pdp2-thumbs{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
.bq-pdp2-thumb{flex:0 0 64px;height:64px;position:relative;overflow:hidden;padding:0;cursor:pointer;background:var(--bq-placeholder);border-radius:min(var(--bq-card-radius),10px);border:2px solid transparent}
.bq-pdp2-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.bq-pdp2[data-gallery="slider"] .bq-pdp2-thumbs{display:none}
.bq-pdp2-stack{display:none}
.bq-pdp2-row{display:flex;flex-wrap:wrap;align-items:center}
.bq-pdp2-trust{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.bq-pdp2-sticky{display:flex}
.bq-pdp2-details{max-width:880px}
.bq-pdp2-acc summary{list-style:none;cursor:pointer}
.bq-pdp2-acc summary::-webkit-details-marker{display:none}
.bq-pdp2-acc[open] .bq-pdp2-chev{transform:rotate(180deg)}
.bq-pdp2-chev{transition:transform .2s}
.bq-pdp2-reviews{display:grid;grid-template-columns:minmax(0,1fr);gap:24px}
.bq-pdp2-reviews p{overflow-wrap:anywhere}
@media (hover:hover) and (pointer:fine){
  .bq-pdp2-zoom{cursor:zoom-in}
  .bq-pdp2-zoom:hover img{transform:scale(1.9);transform-origin:var(--zx,50%) var(--zy,50%)}
}
@container bq (min-width: 760px){
  .bq-pdp2{--pdp-gap:48px}
  .bq-pdp2-main{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:start}
  .bq-pdp2-buy{position:sticky;top:96px}
  .bq-pdp2-trust{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
  .bq-pdp2-sticky{display:none !important}
  .bq-pdp2-reviews{grid-template-columns:minmax(0,300px) minmax(0,1fr);gap:48px}
  .bq-pdp2-dots{display:none !important}
  .bq-pdp2[data-gallery="slider"] .bq-pdp2-dots{display:flex !important}
  .bq-pdp2[data-gallery="thumbs-left"] .bq-pdp2-gal{grid-template-columns:76px minmax(0,1fr);align-items:start}
  .bq-pdp2[data-gallery="thumbs-left"] .bq-pdp2-thumbs{order:-1;flex-direction:column;max-height:640px;overflow-y:auto}
  .bq-pdp2[data-gallery="thumbs-left"] .bq-pdp2-thumb{flex:0 0 auto;width:76px;height:92px}
  .bq-pdp2[data-gallery="thumbs-bottom"] .bq-pdp2-thumb{flex:0 0 76px;height:76px}
  /* Gallery stack: every photo down the page beside a sticky buying panel. */
  .bq-pdp2[data-layout="gallery-stack"] .bq-pdp2-main{grid-template-columns:minmax(0,1.45fr) minmax(0,1fr)}
  .bq-pdp2[data-layout="gallery-stack"] .bq-pdp2-gal{display:none}
  .bq-pdp2[data-layout="gallery-stack"] .bq-pdp2-stack{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .bq-pdp2[data-layout="gallery-stack"] .bq-pdp2-stack > :first-child{grid-column:1 / -1}
  .bq-pdp2[data-layout="gallery-stack"] .bq-pdp2-stack .bq-pdp2-slide{border-radius:var(--bq-card-radius)}
  /* Editorial: one big photo across the page, the story centred below. */
  .bq-pdp2[data-layout="editorial"] .bq-pdp2-main{grid-template-columns:minmax(0,1fr);gap:36px}
  .bq-pdp2[data-layout="editorial"] .bq-pdp2-slide{aspect-ratio:16/8}
  .bq-pdp2[data-layout="editorial"] .bq-pdp2-buy{position:static;max-width:680px;margin:0 auto;text-align:center}
  .bq-pdp2[data-layout="editorial"] .bq-pdp2-row{justify-content:center}
  .bq-pdp2[data-layout="editorial"] .bq-pdp2-details{margin:0 auto}
  /* Compact: a smaller photo that stays put, a wide panel for many options. */
  .bq-pdp2[data-layout="compact"] .bq-pdp2-main{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:36px}
  .bq-pdp2[data-layout="compact"] .bq-pdp2-slide{aspect-ratio:1/1}
  .bq-pdp2[data-layout="compact"] .bq-pdp2-media{position:sticky;top:96px}
  .bq-pdp2[data-layout="compact"] .bq-pdp2-buy{position:static}
}
.bq-pdp2-lightbox{position:fixed;inset:0;z-index:80;background:rgba(10,10,10,.94);display:flex;flex-direction:column}
.bq-pdp2-lightbox .bq-pdp2-track{flex:1;border-radius:0}
.bq-pdp2-lightbox .bq-pdp2-slide{aspect-ratio:auto;height:100%;background:transparent}
.bq-pdp2-lightbox .bq-pdp2-slide img{object-fit:contain}
@media (prefers-reduced-motion: reduce){.bq-pdp2 *{transition:none !important}}
`;
