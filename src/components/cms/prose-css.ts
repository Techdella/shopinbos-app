// Typography for CMS rich text, shared by the editor and the storefront so a post looks the same in both.
// Colours come from CSS variables: the storefront sets them from the store's theme tokens, the editor from
// the app palette.
//   --cms-ink, --cms-muted, --cms-accent, --cms-accent-text, --cms-border, --cms-soft, --cms-radius, --cms-heading-font

export const CMS_PROSE_CSS = `
.cms-prose{color:var(--cms-ink,#16141F);font-size:17px;line-height:1.7;overflow-wrap:anywhere}
.cms-prose>*:first-child{margin-top:0}
.cms-prose p{margin:0 0 1.05em}
.cms-prose h1,.cms-prose h2,.cms-prose h3,.cms-prose h4,.cms-prose h5{font-family:var(--cms-heading-font,inherit);line-height:1.2;letter-spacing:-.01em;margin:1.6em 0 .55em;font-weight:700}
.cms-prose h1{font-size:1.9em}.cms-prose h2{font-size:1.55em}.cms-prose h3{font-size:1.28em}.cms-prose h4,.cms-prose h5{font-size:1.1em}
.cms-prose a{color:var(--cms-accent,#E8590C);text-decoration:underline;text-underline-offset:3px}
.cms-prose ul,.cms-prose ol{margin:0 0 1.05em;padding-left:1.4em}
.cms-prose ul{list-style:disc}.cms-prose ol{list-style:decimal}
.cms-prose li{margin:.25em 0}.cms-prose li>p{margin:0}
.cms-prose blockquote{margin:1.4em 0;padding:.2em 0 .2em 1.1em;border-left:3px solid var(--cms-accent,#E8590C);color:var(--cms-muted,#5D5A6B);font-style:italic}
.cms-prose code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;background:var(--cms-soft,#F4F2F8);padding:.12em .35em;border-radius:6px}
.cms-prose pre{background:#16141F;color:#F4F2F8;padding:16px 18px;border-radius:14px;overflow-x:auto;margin:1.3em 0;font-size:14px;line-height:1.55}
.cms-prose pre code{background:none;padding:0;color:inherit}
.cms-prose hr{border:0;border-top:1px solid var(--cms-border,#E7E4EF);margin:2em 0}
.cms-prose img{max-width:100%;height:auto;border-radius:var(--cms-radius,14px);display:block}
.cms-prose figure{margin:1.5em 0}.cms-prose figcaption{font-size:.85em;color:var(--cms-muted,#5D5A6B);margin-top:.5em;text-align:center}
.cms-prose .cms-embed,.cms-prose div[data-youtube-video]{position:relative;padding-top:56.25%;margin:1.5em 0;border-radius:var(--cms-radius,14px);overflow:hidden;background:#000}
.cms-prose .cms-embed iframe,.cms-prose div[data-youtube-video] iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.cms-prose .cms-video-file video,.cms-prose video[data-cms-video]{display:block;width:100%;max-height:640px;border-radius:var(--cms-radius,14px);background:#000}
.cms-prose .cms-table,.cms-prose .tableWrapper{overflow-x:auto;margin:1.4em 0}
.cms-prose table{border-collapse:collapse;width:100%;font-size:.92em;table-layout:auto}
.cms-prose th,.cms-prose td{border:1px solid var(--cms-border,#E7E4EF);padding:8px 12px;text-align:left;vertical-align:top;min-width:64px}
.cms-prose th{background:var(--cms-soft,#F4F2F8);font-weight:700}
.cms-prose th p,.cms-prose td p{margin:0}
.cms-prose .cms-callout{margin:1.4em 0;padding:14px 18px;border-radius:var(--cms-radius,14px);border:1px solid var(--cms-border,#E7E4EF);background:var(--cms-soft,#F4F2F8)}
.cms-prose .cms-callout>*:last-child{margin-bottom:0}
.cms-prose .cms-callout-tip{background:#EAF7F1;border-color:#BFE6D3}
.cms-prose .cms-callout-success{background:#E9F7EC;border-color:#B9E2C2}
.cms-prose .cms-callout-warning{background:#FDF3DF;border-color:#F3D9A4}
.cms-prose .cms-button-row{margin:1.4em 0}
.cms-prose .cms-button,.cms-prose .cms-ed-button{display:inline-flex;align-items:center;min-height:46px;padding:0 22px;border-radius:999px;background:var(--cms-accent,#16141F);color:var(--cms-accent-text,#fff)!important;font-weight:700;text-decoration:none!important;font-style:normal}
.cms-prose .cms-button-outline,.cms-prose .cms-ed-button[data-variant=outline]{background:transparent;color:var(--cms-ink,#16141F)!important;border:1.5px solid currentColor}
.cms-prose .cms-product,.cms-prose .cms-ed-product{display:flex;gap:14px;align-items:center;margin:1.4em 0;padding:12px;border:1px solid var(--cms-border,#E7E4EF);border-radius:var(--cms-radius,14px);text-decoration:none!important;color:inherit!important;max-width:460px}
.cms-prose .cms-product img,.cms-prose .cms-ed-product img{width:72px;height:72px;object-fit:cover;border-radius:10px;flex-shrink:0}
.cms-prose .cms-product span,.cms-prose .cms-ed-product span{display:flex;flex-direction:column;gap:2px;min-width:0}
.cms-prose .cms-product strong{font-size:.98em}
.cms-prose [style*="text-align:center"],.cms-prose [style*="text-align: center"]{text-align:center}
@media (max-width:640px){.cms-prose{font-size:16px}.cms-prose h2{font-size:1.4em}}
`;
