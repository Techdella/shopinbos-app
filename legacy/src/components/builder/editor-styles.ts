export const EDITOR_CSS = `
.sbi-editor *,.sbi-editor *::before,.sbi-editor *::after{box-sizing:border-box}
.sbi-editor{
  --navy:#0F1F3D;--navy2:#1A3260;--navy3:#243F78;
  --teal:#0D9488;--teal2:#14B8A8;--teal3:#CCFBF1;
  --coral:#F97316;--coral2:#FB923C;
  --w:#fff;--g50:#F9FAFB;--g100:#F3F4F6;--g200:#E5E7EB;
  --g300:#D1D5DB;--g400:#9CA3AF;--g500:#6B7280;--g600:#4B5563;
  --g700:#374151;--g800:#1F2937;
  --font:'Space Grotesk',system-ui,sans-serif;
  --serif:'Fraunces',Georgia,serif;
  --r:8px;--r2:4px;--r3:12px;
  --sh:0 1px 3px rgba(0,0,0,.1);--shm:0 4px 16px rgba(0,0,0,.14);--shl:0 12px 40px rgba(0,0,0,.18);
  --topH:52px;--sbW:264px;--rpW:300px;
  position:fixed;inset:0;z-index:500;overflow:hidden;
  font-family:var(--font);color:var(--g800);font-size:14px;background:var(--g100);
  line-height:1.5;
}
.sbi-editor button,.sbi-editor input,.sbi-editor select,.sbi-editor textarea{font-family:var(--font)}
.sbi-editor ::-webkit-scrollbar{width:5px;height:5px}
.sbi-editor ::-webkit-scrollbar-thumb{background:var(--g200);border-radius:10px}

/* TOPBAR */
.sbi-editor .e-topbar{position:absolute;top:0;left:0;right:0;height:var(--topH);background:var(--navy);display:flex;align-items:center;padding:0 10px;z-index:30;gap:6px;border-bottom:1px solid var(--navy2)}
.sbi-editor .tb-logo{display:flex;align-items:center;gap:8px;color:#fff;font-weight:700;font-size:14px;padding-right:12px;border-right:1px solid var(--navy2);flex-shrink:0;white-space:nowrap;cursor:pointer;background:none;border-top:none;border-left:none;border-bottom:none}
.sbi-editor .tb-logo:hover{opacity:.85}
.sbi-editor .tb-logo-img{width:118px!important;height:auto!important;display:block;flex-shrink:0}
.sbi-editor .tb-logo-label{color:var(--g200);font-size:12px;font-weight:700;letter-spacing:.02em}
.sbi-editor .tb-store{color:var(--g400);font-size:12px;padding:0 12px;border-right:1px solid var(--navy2);flex-shrink:0;white-space:nowrap;overflow:hidden;max-width:200px;text-overflow:ellipsis}
.sbi-editor .tb-store strong{color:var(--g200)}
.sbi-editor .tb-mid{flex:1;display:flex;align-items:center;justify-content:center;gap:4px}
.sbi-editor .tb-dev{width:30px;height:28px;border-radius:var(--r2);border:1px solid transparent;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--g400);transition:.15s}
.sbi-editor .tb-dev:hover,.sbi-editor .tb-dev.on{background:var(--navy2);color:#fff;border-color:var(--navy3)}
.sbi-editor .tb-dev svg{width:15px;height:15px}
.sbi-editor .tb-div{width:1px;height:18px;background:var(--navy2);margin:0 4px;flex-shrink:0}
.sbi-editor .pg-wrap{position:relative}
.sbi-editor .pg-sel{background:var(--navy2);border:1px solid var(--navy3);color:#fff;border-radius:var(--r2);padding:5px 24px 5px 9px;font-size:12px;cursor:pointer;appearance:none;min-width:140px}
.sbi-editor .pg-sel:focus{outline:none;border-color:var(--teal)}
.sbi-editor .pg-arr{position:absolute;right:7px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--g400);font-size:10px}
.sbi-editor .tb-right{display:flex;align-items:center;gap:5px;flex-shrink:0}
.sbi-editor .tbtn{height:28px;padding:0 11px;border-radius:var(--r2);font-size:12px;font-weight:500;cursor:pointer;border:1px solid transparent;display:flex;align-items:center;gap:5px;transition:.15s;white-space:nowrap;background:transparent}
.sbi-editor .tbtn svg{width:13px;height:13px;flex-shrink:0}
.sbi-editor .tbtn-ghost{color:var(--g300);border-color:var(--navy2)}.sbi-editor .tbtn-ghost:hover{background:var(--navy2);color:#fff}
.sbi-editor .tbtn-teal{background:var(--teal);color:#fff;border-color:var(--teal)}.sbi-editor .tbtn-teal:hover{background:var(--teal2)}
.sbi-editor .tbtn-coral{background:var(--coral);color:#fff;border-color:var(--coral)}.sbi-editor .tbtn-coral:hover{background:var(--coral2)}
.sbi-editor .tbtn:disabled{opacity:.5;cursor:not-allowed}

/* LAYOUT */
.sbi-editor .e-layout{position:absolute;top:var(--topH);left:0;right:0;bottom:0;display:flex;overflow:hidden;min-height:0}

/* SIDEBAR */
.sbi-editor .e-sidebar{width:var(--sbW);background:#fff;border-right:1px solid var(--g200);display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;transition:width .22s,opacity .22s;position:relative;z-index:10}
.sbi-editor .e-sidebar.collapsed{width:0;opacity:0;pointer-events:none}
.sbi-editor .sb-tabs{display:flex;border-bottom:1px solid var(--g200);flex-shrink:0}
.sbi-editor .sb-tab{flex:1;padding:9px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:center;cursor:pointer;color:var(--g400);border-bottom:2px solid transparent;transition:.15s;background:none;border-top:none;border-left:none;border-right:none}
.sbi-editor .sb-tab.on{color:var(--teal);border-bottom-color:var(--teal)}
.sbi-editor .sb-tab:hover:not(.on){color:var(--g600)}
.sbi-editor .sb-pane{display:none;flex:1;overflow:hidden;flex-direction:column}
.sbi-editor .sb-pane.on{display:flex}
.sbi-editor .sbh{padding:10px 12px 7px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--g500);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.sbi-editor .sbh-add{width:22px;height:22px;border-radius:3px;background:var(--teal);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1}
.sbi-editor .sbh-add:hover{background:var(--teal2)}
.sbi-editor .pg-list{flex:1;overflow-y:auto;padding:3px 6px 8px}
.sbi-editor .pg-row{display:flex;align-items:center;gap:7px;padding:7px 8px;border-radius:var(--r2);cursor:pointer;transition:.15s;margin-bottom:1px}
.sbi-editor .pg-row:hover{background:var(--g50)}
.sbi-editor .pg-row.on{background:var(--teal3)}
.sbi-editor .pg-row.muted{cursor:default;opacity:.82}
.sbi-editor .pg-row.muted:hover{background:transparent}
.sbi-editor .pg-row.on .pg-name{color:var(--teal);font-weight:600}
.sbi-editor .pg-ico{width:26px;height:26px;background:var(--g100);border-radius:var(--r2);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--g500)}
.sbi-editor .pg-ico svg{width:13px;height:13px}
.sbi-editor .pg-row.on .pg-ico{background:rgba(13,148,136,.12);color:var(--teal)}
.sbi-editor .pg-meta{flex:1;min-width:0}
.sbi-editor .pg-name{font-size:12px;color:var(--g700);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sbi-editor .pg-status{font-size:10px;color:var(--g400)}
.sbi-editor .pg-status.live{color:var(--teal)}
.sbi-editor .pg-group{margin:4px 0 8px}
.sbi-editor .pg-group-head{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 5px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--g500)}
.sbi-editor .pg-help{display:grid;place-items:center;width:16px;height:16px;border-radius:50%;border:1px solid var(--g200);font-size:10px;color:var(--g400);background:#fff}
.sbi-editor .pg-group-empty{margin:0 8px 6px;padding:9px;border:1px dashed var(--g200);border-radius:var(--r2);font-size:11px;line-height:1.45;color:var(--g400);background:var(--g50)}
.sbi-editor .pg-chip{border:1px solid var(--g200);border-radius:999px;padding:2px 6px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--g400);background:#fff}
.sbi-editor .pg-empty{margin:6px 8px 12px;padding:13px;border:1px dashed rgba(13,148,136,.28);border-radius:var(--r2);background:rgba(13,148,136,.05)}
.sbi-editor .pg-empty-title{font-size:12px;font-weight:800;color:var(--g800);margin-bottom:4px}
.sbi-editor .pg-empty p{margin:0 0 10px;font-size:11px;line-height:1.5;color:var(--g500)}
.sbi-editor .pg-empty-btn{width:100%;border:none;border-radius:var(--r2);padding:7px 9px;margin-top:5px;background:var(--teal);color:#fff;font-size:11px;font-weight:800;cursor:pointer}
.sbi-editor .pg-empty-btn.ghost{background:#fff;color:var(--teal);border:1px solid rgba(13,148,136,.22)}
.sbi-editor .pg-more{opacity:0;padding:3px 5px;cursor:pointer;color:var(--g400);font-size:13px;border-radius:3px;background:none;border:none;line-height:1}
.sbi-editor .pg-row:hover .pg-more{opacity:1}
.sbi-editor .pg-more:hover{background:var(--g200)}
.sbi-editor .sb-divider{border-top:1px solid var(--g100);margin:4px 6px 2px}
.sbi-editor .el-search-wrap{padding:8px 10px;flex-shrink:0;position:relative}
.sbi-editor .el-search{width:100%;padding:6px 10px 6px 30px;border:1px solid var(--g200);border-radius:var(--r2);font-size:12px;background:var(--g50)}
.sbi-editor .el-search:focus{outline:none;border-color:var(--teal)}
.sbi-editor .el-search-ico{position:absolute;left:18px;top:50%;transform:translateY(-50%);color:var(--g400);pointer-events:none;display:flex}
.sbi-editor .el-search-ico svg{width:13px;height:13px}
.sbi-editor .el-scroll{flex:1;overflow-y:auto;padding:0 8px 12px}
.sbi-editor .el-cat{font-size:10px;font-weight:700;color:var(--g400);text-transform:uppercase;letter-spacing:.5px;padding:10px 2px 5px}
.sbi-editor .el-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:2px}
.sbi-editor .el-item{border:1px solid var(--g200);border-radius:var(--r2);padding:10px 6px;cursor:grab;transition:.15s;background:#fff;text-align:center;display:flex;flex-direction:column;align-items:center;gap:5px;user-select:none}
.sbi-editor .el-item:hover{border-color:var(--teal);background:var(--teal3);transform:translateY(-1px);box-shadow:var(--sh)}
.sbi-editor .el-item:active{cursor:grabbing}
.sbi-editor .el-item:hover .el-ico,.sbi-editor .el-item:hover .el-lbl{color:var(--teal)}
.sbi-editor .el-ico{width:22px;height:22px;display:flex;align-items:center;justify-content:center;color:var(--g500)}
.sbi-editor .el-ico svg{width:15px;height:15px}
.sbi-editor .el-lbl{font-size:10px;color:var(--g600);font-weight:500}
.sbi-editor .lyr-scroll{flex:1;overflow-y:auto;padding:4px 6px}
.sbi-editor .lyr-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:var(--r2);cursor:pointer;font-size:11px;color:var(--g700);transition:.15s}
.sbi-editor .lyr-item:hover{background:var(--g50)}
.sbi-editor .lyr-item.on{background:var(--teal3);color:var(--teal)}
.sbi-editor .lyr-item svg{width:12px;height:12px;flex-shrink:0;color:var(--g400)}
.sbi-editor .lyr-item.on svg{color:var(--teal)}
.sbi-editor .lyr-vis{margin-left:auto;opacity:.4;color:var(--g500);background:none;border:none;cursor:pointer;padding:2px;display:flex;align-items:center}
.sbi-editor .lyr-item:hover .lyr-vis,.sbi-editor .lyr-item.on .lyr-vis{opacity:1}
.sbi-editor .lyr-vis svg{width:13px;height:13px}

/* CANVAS */
.sbi-editor .e-canvas-area{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;min-height:0}
.sbi-editor .e-canvas-bar{background:#fff;border-bottom:1px solid var(--g200);padding:6px 12px;display:flex;align-items:center;gap:7px;flex-shrink:0;height:40px}
.sbi-editor .zg{display:flex;align-items:center;gap:3px}
.sbi-editor .zb{width:22px;height:22px;border-radius:var(--r2);border:1px solid var(--g200);background:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:var(--g600);line-height:1}
.sbi-editor .zb:hover{background:var(--g50)}
.sbi-editor .zv{font-size:11px;min-width:34px;text-align:center;font-weight:600;color:var(--g700);cursor:pointer}
.sbi-editor .zv:hover{color:var(--teal)}
.sbi-editor .cb-wrap{display:flex;align-items:center;gap:5px;font-size:12px;flex:1;overflow:hidden}
.sbi-editor .cb-pg{color:var(--g500);cursor:pointer;background:none;border:none;font-family:var(--font);font-size:12px;padding:0;white-space:nowrap}
.sbi-editor .cb-pg:hover{color:var(--teal)}
.sbi-editor .cb-sep{color:var(--g300)}
.sbi-editor .cb-sec{color:var(--g700);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sbi-editor .sv-dot{font-size:11px;color:var(--g400);margin-left:auto;display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0}
.sbi-editor .sv-ind{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.sbi-editor .e-canvas-scroll{flex:1;overflow:auto;padding:12px;display:flex;align-items:flex-start;justify-content:center;background:#eef2f7;min-height:0}
.sbi-editor .e-canvas-frame{background:#fff;box-shadow:0 18px 60px rgba(15,31,61,.14),0 0 0 1px rgba(15,31,61,.07);border-radius:12px;width:100%;min-height:calc(100% - 24px);transition:width .28s;position:relative;overflow:visible;padding:0;margin:0 auto 56px}
.sbi-editor .e-canvas-frame.desktop{padding:0}
.sbi-editor .e-canvas-frame.tablet{width:768px;min-height:100%;flex-shrink:0}
.sbi-editor .e-canvas-frame.mobile{width:390px;min-height:100%;flex-shrink:0}
.sbi-editor .sec-wrap{position:relative;cursor:pointer}
.sbi-editor .sec-wrap::after{content:'';position:absolute;inset:0;border:2px solid transparent;pointer-events:none;z-index:10;transition:.12s;border-radius:1px}
.sbi-editor .sec-wrap:hover::after{border-color:rgba(13,148,136,.3)}
.sbi-editor .sec-wrap.sel::after{border-color:var(--teal)}
.sbi-editor .sec-lbl{position:absolute;top:0;left:0;background:var(--teal);color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:0 0 4px 0;z-index:11;opacity:0;transition:.12s;pointer-events:none;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
.sbi-editor .sec-wrap:hover .sec-lbl,.sbi-editor .sec-wrap.sel .sec-lbl{opacity:1}
.sbi-editor .sec-bar{position:absolute;top:-34px;left:0;background:var(--navy);border-radius:var(--r2);display:flex;gap:2px;padding:3px;z-index:12;opacity:0;pointer-events:none;box-shadow:var(--shm);transition:.15s}
.sbi-editor .sec-wrap.sel .sec-bar{opacity:1;pointer-events:all}
.sbi-editor .sca{width:26px;height:26px;border-radius:3px;background:transparent;border:none;color:var(--g300);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.1s;font-size:11px}
.sbi-editor .sca svg{width:12px;height:12px}
.sbi-editor .sca:hover{background:var(--navy2);color:#fff}
.sbi-editor .sca.del:hover{background:#7f1d1d;color:#fca5a5}
.sbi-editor .sca-div{width:1px;height:16px;background:var(--navy3);margin:0 2px;align-self:center}
.sbi-editor .add-between{height:20px;display:flex;align-items:center;justify-content:center;position:relative;z-index:9}
.sbi-editor .add-line{width:100%;height:2px;background:var(--teal);opacity:0;transition:.15s;border-radius:1px}
.sbi-editor .add-dot{position:absolute;width:22px;height:22px;border-radius:50%;background:var(--teal);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;opacity:0;transition:.15s;cursor:pointer;box-shadow:var(--sh);border:none;font-weight:300}
.sbi-editor .add-between:hover .add-line,.sbi-editor .add-between:hover .add-dot{opacity:1}
.sbi-editor .add-dot:hover{background:var(--teal2)}

/* CANVAS EMPTY STATE */
.sbi-editor .canvas-empty{padding:72px 40px;text-align:center}
.sbi-editor .canvas-empty-icon{width:52px;height:52px;border-radius:12px;background:var(--g100);border:1px solid var(--g200);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;color:var(--g400)}
.sbi-editor .canvas-empty-icon svg{width:24px;height:24px}
.sbi-editor .canvas-empty h3{font-family:var(--serif);font-size:26px;color:var(--navy);margin-bottom:8px}
.sbi-editor .canvas-empty p{font-size:13px;color:var(--g500);margin:0 auto 28px;max-width:560px}
.sbi-editor .canvas-empty-opts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:760px;margin:0 auto}
.sbi-editor .ce-opt{border:1px solid var(--g200);border-radius:var(--r);padding:18px 14px;cursor:pointer;transition:.15s;background:#fff;text-align:center;display:flex;flex-direction:column;align-items:center}
.sbi-editor .ce-opt:hover{border-color:var(--teal);background:var(--teal3);transform:translateY(-1px);box-shadow:var(--sh)}
.sbi-editor .ce-opt-icon{width:32px;height:32px;border-radius:8px;background:var(--g100);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;color:var(--g500);transition:.15s}
.sbi-editor .ce-opt-icon svg{width:16px;height:16px}
.sbi-editor .ce-opt:hover .ce-opt-icon{background:rgba(13,148,136,.12);color:var(--teal)}
.sbi-editor .ce-opt-lbl{font-size:12px;font-weight:700;color:var(--g800);margin-bottom:3px}
.sbi-editor .ce-opt:hover .ce-opt-lbl,.sbi-editor .ce-opt:hover .ce-opt-sub{color:var(--teal)}
.sbi-editor .ce-opt-sub{font-size:11px;color:var(--g500);line-height:1.45}
.sbi-editor .canvas-checklist{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:760px;margin:22px auto 0}
.sbi-editor .canvas-checklist span{border:1px solid var(--g200);background:#fff;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:600;color:var(--g600)}

/* PANEL TOGGLES */
.sbi-editor .ptog{position:absolute;top:50%;transform:translateY(-50%);width:14px;height:44px;background:#fff;border:1px solid var(--g200);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:15;color:var(--g400);transition:background .15s;font-size:10px;line-height:1}
.sbi-editor .ptog:hover{background:var(--g50);color:var(--g700)}
.sbi-editor .ltog{border-radius:0 var(--r2) var(--r2) 0;transition:left .22s}
.sbi-editor .rtog{border-radius:var(--r2) 0 0 var(--r2);transition:right .22s}

/* RIGHT PANEL */
.sbi-editor .e-right-panel{width:var(--rpW);background:#fff;border-left:1px solid var(--g200);display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;transition:width .22s,opacity .22s;position:relative;z-index:10}
.sbi-editor .e-right-panel.collapsed{width:0;opacity:0;pointer-events:none}
.sbi-editor .rp-hd{padding:12px 14px 10px;border-bottom:1px solid var(--g200);flex-shrink:0}
.sbi-editor .rp-title{font-size:13px;font-weight:700;color:var(--g800)}
.sbi-editor .rp-sub{font-size:11px;color:var(--g500);margin-top:1px}
.sbi-editor .rp-tabs{display:flex;border-bottom:1px solid var(--g200);flex-shrink:0}
.sbi-editor .rp-tab{flex:1;padding:8px 3px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:center;cursor:pointer;color:var(--g400);border-bottom:2px solid transparent;transition:.15s;background:none;border-top:none;border-left:none;border-right:none}
.sbi-editor .rp-tab.on{color:var(--teal);border-bottom-color:var(--teal)}
.sbi-editor .rp-body{flex:1;overflow-y:auto}
.sbi-editor .rps{padding:12px 14px;border-bottom:1px solid var(--g100)}
.sbi-editor .rpst{font-size:10px;font-weight:700;color:var(--g400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.sbi-editor .rf{margin-bottom:9px}
.sbi-editor .rl{font-size:11px;font-weight:500;color:var(--g600);margin-bottom:3px;display:block}
.sbi-editor .ri{width:100%;padding:6px 9px;border:1px solid var(--g200);border-radius:var(--r2);font-size:12px;color:var(--g700);background:#fff}
.sbi-editor .ri:focus{outline:none;border-color:var(--teal)}
.sbi-editor .rtx{width:100%;padding:7px 9px;border:1px solid var(--g200);border-radius:var(--r2);font-size:12px;resize:vertical;min-height:65px;color:var(--g700);background:#fff}
.sbi-editor .rtx:focus{outline:none;border-color:var(--teal)}
.sbi-editor .rsel{width:100%;padding:6px 9px;border:1px solid var(--g200);border-radius:var(--r2);font-size:12px;color:var(--g700);background:#fff}
.sbi-editor .rbg{display:flex;border:1px solid var(--g200);border-radius:var(--r2);overflow:hidden}
.sbi-editor .rbgb{flex:1;padding:6px;border:none;background:#fff;cursor:pointer;color:var(--g500);font-size:11px;display:flex;align-items:center;justify-content:center;transition:.15s;font-family:var(--font)}
.sbi-editor .rbgb:not(:last-child){border-right:1px solid var(--g200)}
.sbi-editor .rbgb.on,.sbi-editor .rbgb:hover{background:var(--teal3);color:var(--teal)}
.sbi-editor .rr-row{display:flex;align-items:center;gap:6px}
.sbi-editor .rr{flex:1;accent-color:var(--teal)}
.sbi-editor .rr-v{font-size:11px;color:var(--g500);min-width:30px;text-align:right}
.sbi-editor .rcsw{width:28px;height:26px;border-radius:var(--r2);border:1px solid var(--g200);cursor:pointer;flex-shrink:0;padding:1px}
.sbi-editor .rp-btn-add{width:100%;padding:7px;border-radius:var(--r2);border:1px solid var(--g200);background:#fff;cursor:pointer;font-size:12px;color:var(--g600);transition:.15s;display:flex;align-items:center;justify-content:center;gap:5px;font-family:var(--font);margin-top:5px}
.sbi-editor .rp-btn-add:hover{border-color:var(--teal);color:var(--teal);background:var(--teal3)}
.sbi-editor .rp-empty{padding:36px 16px;text-align:center;color:var(--g400)}
.sbi-editor .rp-empty svg{width:36px;height:36px;margin-bottom:10px;opacity:.4}
.sbi-editor .var-grid{display:grid;grid-template-columns:1fr;gap:7px}
.sbi-editor .var-card{border:1px solid var(--g200);border-radius:var(--r2);background:#fff;padding:8px 9px;text-align:left;cursor:pointer;transition:.15s;font-family:var(--font);display:grid;gap:2px}
.sbi-editor .var-card:hover,.sbi-editor .var-card.on{border-color:var(--teal);background:var(--teal3)}
.sbi-editor .var-name{font-size:12px;font-weight:700;color:var(--g700);text-transform:capitalize}
.sbi-editor .var-hint{font-size:10px;line-height:1.4;color:var(--g500)}
.sbi-editor .var-card.on .var-name,.sbi-editor .var-card:hover .var-name{color:var(--teal)}
.sbi-editor .guide-card{border:1px solid var(--g200);border-radius:var(--r);background:var(--g50);padding:10px;margin-bottom:10px}
.sbi-editor .guide-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--teal);margin-bottom:4px}
.sbi-editor .guide-card p{font-size:11px;line-height:1.55;color:var(--g600);margin:0}

/* PREVIEW */
.sbi-editor .pv-screen{position:absolute;inset:0;z-index:40;background:#f0f2f5;display:flex;flex-direction:column}
.sbi-editor .pv-content{flex:1;overflow:auto;background:#fff;padding:20px 0}
.sbi-editor .pv-bar{background:var(--navy);height:46px;display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0}
.sbi-editor .pv-url{flex:1;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:4px 14px;font-size:12px;color:rgba(255,255,255,.7);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbi-editor .pv-content{flex:1;overflow:auto;background:#f0f2f5}

/* BLOG CMS */
.sbi-editor .blog-screen{position:absolute;inset:0;z-index:40;background:var(--g50);display:flex;flex-direction:column}
.sbi-editor .cms-top{background:var(--navy);height:50px;display:flex;align-items:center;padding:0 14px;gap:8px;flex-shrink:0;border-bottom:1px solid var(--navy2)}
.sbi-editor .cms-body{flex:1;display:flex;overflow:hidden}
.sbi-editor .cms-sb{width:256px;background:#fff;border-right:1px solid var(--g200);display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.sbi-editor .cms-sbh{padding:12px 14px;border-bottom:1px solid var(--g200);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.sbi-editor .cms-sbh-t{font-size:13px;font-weight:700;color:var(--navy)}
.sbi-editor .cms-list{flex:1;overflow-y:auto;padding:5px 6px}
.sbi-editor .cms-post{padding:9px 10px;border-radius:var(--r2);cursor:pointer;transition:.15s;margin-bottom:2px;border:1px solid transparent}
.sbi-editor .cms-post:hover{background:var(--g50)}
.sbi-editor .cms-post.on{background:var(--teal3);border-color:rgba(13,148,136,.2)}
.sbi-editor .cms-pt{font-size:12px;font-weight:600;color:var(--g800);margin-bottom:2px;line-height:1.3}
.sbi-editor .cms-pm{font-size:10px;color:var(--g400)}
.sbi-editor .cms-badge{display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;margin-top:3px}
.sbi-editor .cms-badge.pub{background:var(--teal3);color:var(--teal)}
.sbi-editor .cms-badge.draft{background:var(--g100);color:var(--g500)}
.sbi-editor .cms-main{flex:1;overflow-y:auto;padding:28px 32px}
.sbi-editor .cms-wrap{max-width:720px;margin:0 auto}
.sbi-editor .cms-title-in{width:100%;padding:9px 0;font-size:24px;font-family:var(--serif);font-weight:600;color:var(--navy);border:none;border-bottom:2px solid var(--g200);background:transparent;outline:none;margin-bottom:18px}
.sbi-editor .cms-title-in:focus{border-bottom-color:var(--teal)}
.sbi-editor .cms-meta-row{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.sbi-editor .cms-mf{flex:1;min-width:110px}
.sbi-editor .cms-ml{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--g500);margin-bottom:3px;display:block}
.sbi-editor .cms-mi{width:100%;padding:6px 9px;border:1px solid var(--g200);border-radius:var(--r2);font-size:12px;background:#fff;color:var(--g700)}
.sbi-editor .cms-mi:focus{outline:none;border-color:var(--teal)}
.sbi-editor .cms-featimg{width:100%;height:156px;border:2px dashed var(--g200);border-radius:var(--r);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;cursor:pointer;margin-bottom:18px;background:var(--g50);transition:.15s;color:var(--g400)}
.sbi-editor .cms-featimg svg{width:28px;height:28px;opacity:.5}
.sbi-editor .cms-featimg:hover{border-color:var(--teal);background:var(--teal3);color:var(--teal)}
.sbi-editor .cms-featimg-lbl{font-size:12px}
.sbi-editor .cms-toolbar{display:flex;gap:2px;padding:5px 7px;border:1px solid var(--g200);border-bottom:none;border-radius:var(--r2) var(--r2) 0 0;background:var(--g50);flex-wrap:wrap;align-items:center}
.sbi-editor .cms-tb{width:27px;height:25px;border:1px solid transparent;border-radius:3px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--g600);font-size:11px;font-weight:600;transition:.12s;font-family:var(--font)}
.sbi-editor .cms-tb svg{width:13px;height:13px}
.sbi-editor .cms-tb:hover{background:var(--g200);color:var(--g800)}
.sbi-editor .cms-tbsep{width:1px;height:16px;background:var(--g200);margin:0 2px}
.sbi-editor .cms-content{width:100%;min-height:300px;padding:12px;border:1px solid var(--g200);border-radius:0 0 var(--r2) var(--r2);font-size:14px;line-height:1.75;color:var(--g700);resize:vertical;background:#fff;font-family:var(--font)}
.sbi-editor .cms-content:focus{outline:none}
.sbi-editor .cms-card{background:#fff;border-radius:var(--r);border:1px solid var(--g200);padding:16px;margin-bottom:14px}
.sbi-editor .cms-card-title{font-size:12px;font-weight:700;color:var(--g700);margin-bottom:10px}
.sbi-editor .seo-preview{background:var(--g50);border-radius:var(--r2);padding:10px;margin-top:7px;font-size:11px}
.sbi-editor .seo-t{color:#1a0dab;font-size:14px;margin-bottom:2px}
.sbi-editor .seo-u{color:#006621;margin-bottom:2px}
.sbi-editor .seo-d{color:var(--g600);line-height:1.4}

/* MODALS */
.sbi-editor .ovl{position:absolute;inset:0;background:rgba(0,0,0,.48);z-index:100;display:none;align-items:center;justify-content:center;padding:20px}
.sbi-editor .ovl.on{display:flex}
.sbi-editor .modal{background:#fff;border-radius:14px;box-shadow:var(--shl);width:100%;display:flex;flex-direction:column;max-height:88vh}
.sbi-editor .mhd{padding:18px 22px 14px;border-bottom:1px solid var(--g200);display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0}
.sbi-editor .mtitle{font-size:17px;font-weight:700;color:var(--g800);font-family:var(--serif)}
.sbi-editor .msub{font-size:12px;color:var(--g500);margin-top:2px}
.sbi-editor .mx{width:28px;height:28px;border-radius:var(--r2);border:1px solid var(--g200);background:#fff;cursor:pointer;color:var(--g500);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sbi-editor .mx:hover{background:var(--g100)}
.sbi-editor .mx svg{width:13px;height:13px}
.sbi-editor .mbody{flex:1;overflow-y:auto;padding:18px 22px}
.sbi-editor .mfoot{padding:14px 22px;border-top:1px solid var(--g200);display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-shrink:0}
.sbi-editor .mbtn{height:34px;padding:0 16px;border-radius:var(--r2);font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;transition:.15s;font-family:var(--font)}
.sbi-editor .mbtn-ghost{background:#fff;color:var(--g600);border-color:var(--g200)}.sbi-editor .mbtn-ghost:hover{background:var(--g50)}
.sbi-editor .mbtn-t{background:var(--teal);color:#fff}.sbi-editor .mbtn-t:hover{background:var(--teal2)}
.sbi-editor .mbtn-c{background:var(--coral);color:#fff}.sbi-editor .mbtn-c:hover{background:var(--coral2)}
.sbi-editor .mbtn:disabled{opacity:.5;cursor:not-allowed}
.sbi-editor .sp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sbi-editor .sp-card{border:1px solid var(--g200);border-radius:var(--r);overflow:hidden;cursor:pointer;transition:.15s;background:#fff}
.sbi-editor .sp-card:hover{border-color:var(--teal);transform:translateY(-2px);box-shadow:var(--sh)}
.sbi-editor .sp-thumb{height:64px;display:flex;align-items:center;justify-content:center;background:var(--g50);color:var(--g400)}
.sbi-editor .sp-thumb svg{width:22px;height:22px}
.sbi-editor .sp-info{padding:7px 9px;border-top:1px solid var(--g100)}
.sbi-editor .sp-name{font-size:11px;font-weight:700;color:var(--g700)}
.sbi-editor .pub-steps{display:flex;align-items:center;margin-bottom:22px}
.sbi-editor .pub-step{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1}
.sbi-editor .pub-step-d{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid var(--g200);color:var(--g400)}
.sbi-editor .pub-step.done .pub-step-d{background:var(--teal);border-color:var(--teal);color:#fff}
.sbi-editor .pub-step.cur .pub-step-d{border-color:var(--teal);color:var(--teal)}
.sbi-editor .pub-step-l{font-size:10px;color:var(--g500)}
.sbi-editor .pub-step.done .pub-step-l{color:var(--teal)}
.sbi-editor .pub-connector{flex:1;height:2px;background:var(--g200);margin-top:-18px}
.sbi-editor .pub-connector.done{background:var(--teal)}
.sbi-editor .pub-url-b{background:var(--g50);border:1px solid var(--g200);border-radius:var(--r2);padding:9px 12px;display:flex;align-items:center;gap:8px;margin-bottom:12px}
.sbi-editor .pub-url-t{flex:1;font-size:12px;color:var(--teal);font-family:monospace;word-break:break-all}
.sbi-editor .pub-cp{padding:3px 10px;border:1px solid var(--g200);border-radius:var(--r2);font-size:11px;cursor:pointer;background:#fff;color:var(--g600);font-family:var(--font);white-space:nowrap}
.sbi-editor .pub-cp:hover{border-color:var(--teal);color:var(--teal)}

/* CONTEXT MENU */
.sbi-editor .ctx-menu{position:fixed;background:#fff;border:1px solid var(--g200);border-radius:var(--r2);box-shadow:var(--shm);z-index:200;min-width:158px;padding:4px;display:none}
.sbi-editor .ctx-menu.on{display:block}
.sbi-editor .ctx-item{padding:7px 10px;font-size:12px;cursor:pointer;border-radius:3px;color:var(--g700);display:flex;align-items:center;gap:8px;transition:.1s;background:none;border:none;width:100%;text-align:left;font-family:var(--font)}
.sbi-editor .ctx-item svg{width:13px;height:13px;flex-shrink:0}
.sbi-editor .ctx-item:hover{background:var(--g50)}
.sbi-editor .ctx-item.red{color:#dc2626}.sbi-editor .ctx-item.red:hover{background:#fee2e2}
.sbi-editor .ctx-sep{height:1px;background:var(--g100);margin:3px 0}

/* REX AI */
.sbi-editor .rex-btn{position:absolute;bottom:20px;right:20px;z-index:50;width:46px;height:46px;border-radius:50%;background:var(--navy);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(15,31,61,.4),0 0 0 3px rgba(13,148,136,.2);transition:.2s}
.sbi-editor .rex-btn:hover{transform:scale(1.06)}
.sbi-editor .rex-btn svg{width:19px;height:19px}
.sbi-editor .rex-panel{position:absolute;bottom:20px;right:20px;width:356px;z-index:50;display:none;flex-direction:column;background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.16),0 0 0 1px rgba(0,0,0,.05);overflow:hidden;height:480px}
.sbi-editor .rex-panel.on{display:flex}
.sbi-editor .rex-hd{background:linear-gradient(135deg,var(--navy),var(--navy2));padding:12px 14px;display:flex;align-items:center;gap:9px;flex-shrink:0}
.sbi-editor .rex-av{width:34px;height:34px;border-radius:9px;background:var(--teal2);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--navy)}
.sbi-editor .rex-av svg{width:17px;height:17px}
.sbi-editor .rex-nm{color:#fff;font-weight:700;font-size:13px}
.sbi-editor .rex-st{color:var(--teal2);font-size:10px;display:flex;align-items:center;gap:4px;margin-top:2px}
.sbi-editor .rex-d{width:5px;height:5px;border-radius:50%;background:var(--teal2)}
.sbi-editor .rex-xb{width:26px;height:26px;border-radius:5px;background:rgba(255,255,255,.1);border:none;cursor:pointer;color:var(--g300);display:flex;align-items:center;justify-content:center;margin-left:auto}
.sbi-editor .rex-xb:hover{background:rgba(255,255,255,.2)}
.sbi-editor .rex-xb svg{width:13px;height:13px}
.sbi-editor .rex-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.sbi-editor .rmsg{display:flex;flex-direction:column;gap:3px;max-width:92%}
.sbi-editor .rmsg.ai{align-self:flex-start}
.sbi-editor .rmsg.usr{align-self:flex-end}
.sbi-editor .rbub{padding:8px 11px;border-radius:11px;font-size:12px;line-height:1.55}
.sbi-editor .rmsg.ai .rbub{background:var(--g100);color:var(--g800);border-radius:3px 11px 11px 11px}
.sbi-editor .rmsg.usr .rbub{background:var(--navy);color:#fff;border-radius:11px 3px 11px 11px}
.sbi-editor .rtime{font-size:9px;color:var(--g400);padding:0 3px}
.sbi-editor .rmsg.usr .rtime{text-align:right}
.sbi-editor .rex-typing{display:flex;gap:3px;padding:8px 11px;background:var(--g100);border-radius:3px 11px 11px 11px;width:fit-content}
.sbi-editor .rtd{width:5px;height:5px;border-radius:50%;background:var(--g400);animation:sbi-pulse 1.2s ease-in-out infinite}
.sbi-editor .rtd:nth-child(2){animation-delay:.2s}
.sbi-editor .rtd:nth-child(3){animation-delay:.4s}
@keyframes sbi-pulse{0%,80%,100%{opacity:.3;transform:scale(.85)}40%{opacity:1;transform:scale(1)}}
.sbi-editor .rex-qs{padding:6px 10px;border-top:1px solid var(--g100);display:flex;gap:4px;flex-wrap:wrap;flex-shrink:0}
.sbi-editor .rex-q{padding:4px 9px;border-radius:20px;border:1px solid var(--g200);background:#fff;font-size:10px;cursor:pointer;color:var(--g600);transition:.15s;font-family:var(--font);white-space:nowrap}
.sbi-editor .rex-q:hover{border-color:var(--teal);color:var(--teal);background:var(--teal3)}
.sbi-editor .rex-in{padding:8px 10px;border-top:1px solid var(--g200);display:flex;gap:6px;align-items:flex-end;flex-shrink:0}
.sbi-editor .rex-ta{flex:1;padding:7px 9px;border:1px solid var(--g200);border-radius:8px;font-size:12px;font-family:var(--font);resize:none;max-height:80px;min-height:32px;color:var(--g700)}
.sbi-editor .rex-ta:focus{outline:none;border-color:var(--teal)}
.sbi-editor .rex-sb{width:32px;height:32px;border-radius:8px;background:var(--teal);border:none;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:.15s}
.sbi-editor .rex-sb svg{width:14px;height:14px}
.sbi-editor .rex-sb:hover{background:var(--teal2)}
.sbi-editor .rex-sb:disabled{opacity:.5;cursor:not-allowed}

/* TOAST */
.sbi-editor .toast{position:absolute;bottom:80px;left:50%;transform:translateX(-50%) translateY(6px);background:var(--g800);color:#fff;padding:8px 16px;border-radius:var(--r);font-size:12px;z-index:9999;opacity:0;transition:all .22s;pointer-events:none;white-space:nowrap}
.sbi-editor .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.sbi-editor .toast.ok{background:var(--teal)}

/* STORE SECTION STYLES — image placeholders use .img-ph */
.sbi-editor .img-ph{background:linear-gradient(135deg,#f3f4f6,#e5e7eb);display:flex;align-items:center;justify-content:center;color:#9ca3af}
.sbi-editor .img-ph svg{width:22px;height:22px}
.sbi-editor .s-nav{background:#fff;border-bottom:1px solid #e5e7eb;padding:0 40px;display:flex;align-items:center;height:64px;gap:24px}
.sbi-editor .s-logo{font-family:var(--serif);font-size:20px;color:var(--navy);font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sbi-editor .s-nav-links{display:flex;gap:22px;flex-shrink:0}
.sbi-editor .s-nav-link{font-size:13px;color:#374151;cursor:pointer;font-weight:500;text-decoration:none;transition:.15s}
.sbi-editor .s-nav-link:hover{color:var(--teal)}
.sbi-editor .s-nav-acts{display:flex;align-items:center;gap:8px;flex-shrink:0}
.sbi-editor .s-cart-btn{display:flex;align-items:center;gap:6px;background:var(--navy);color:#fff;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:none;font-family:var(--font)}
.sbi-editor .s-cart-btn svg{width:14px;height:14px}
.sbi-editor .s-search-btn{width:32px;height:32px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#6b7280}
.sbi-editor .s-search-btn svg{width:14px;height:14px}
.sbi-editor .s-hero{background:linear-gradient(135deg,var(--navy) 0%,var(--navy2) 55%,#0e4f57 100%);padding:72px 40px;display:flex;align-items:center;gap:48px;min-height:440px}
.sbi-editor .s-hero-text{flex:1}
.sbi-editor .s-hero-badge{color:var(--teal2);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px}
.sbi-editor .s-hero-h{font-family:var(--serif);font-size:46px;line-height:1.08;color:#fff;margin-bottom:16px}
.sbi-editor .s-hero-h em{font-style:italic;color:var(--teal2)}
.sbi-editor .s-hero-p{color:rgba(255,255,255,.72);font-size:15px;line-height:1.65;margin-bottom:26px;max-width:440px}
.sbi-editor .s-hero-btns{display:flex;gap:10px;flex-wrap:wrap}
.sbi-editor .sbtn-c{background:var(--coral);color:#fff;padding:11px 22px;border-radius:7px;font-weight:600;font-size:13px;cursor:pointer;border:none;transition:.15s;white-space:nowrap;font-family:var(--font)}
.sbi-editor .sbtn-c:hover{background:var(--coral2)}
.sbi-editor .sbtn-o{background:transparent;color:#fff;padding:11px 22px;border-radius:7px;font-weight:600;font-size:13px;cursor:pointer;border:1.5px solid rgba(255,255,255,.3);transition:.15s;white-space:nowrap;font-family:var(--font)}
.sbi-editor .sbtn-o:hover{border-color:rgba(255,255,255,.6)}
.sbi-editor .s-hero-img{width:290px;height:310px;border-radius:12px;background:rgba(255,255,255,.07);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;flex-shrink:0;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.25)}
.sbi-editor .s-hero-img svg{width:38px;height:38px}
.sbi-editor .s-hero-img-lbl{font-size:11px;letter-spacing:.5px;text-transform:uppercase}
.sbi-editor .s-trust{padding:18px 40px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;gap:28px;align-items:center;justify-content:center;flex-wrap:wrap}
.sbi-editor .s-trust-i{display:flex;align-items:center;gap:7px;font-size:12px;color:#4b5563;font-weight:500}
.sbi-editor .s-trust-i svg{width:14px;height:14px;color:var(--teal);flex-shrink:0}
.sbi-editor .s-sec{padding:52px 40px}
.sbi-editor .s-sec.alt{background:#f9fafb}
.sbi-editor .s-title{font-family:var(--serif);font-size:32px;color:var(--navy);text-align:center;margin-bottom:6px}
.sbi-editor .s-sub{text-align:center;color:#6b7280;font-size:14px;margin-bottom:32px}
.sbi-editor .s-prods{display:grid;gap:14px}
.sbi-editor .s-prods.c4{grid-template-columns:repeat(4,1fr)}
.sbi-editor .s-prods.c3{grid-template-columns:repeat(3,1fr)}
.sbi-editor .s-prods.c2{grid-template-columns:repeat(2,1fr)}
.sbi-editor .s-card{border-radius:9px;overflow:hidden;background:#fff;border:1px solid #e5e7eb;cursor:pointer;transition:.2s}
.sbi-editor .s-card:hover{box-shadow:0 6px 20px rgba(0,0,0,.08);transform:translateY(-2px)}
.sbi-editor .s-card-img{height:180px}
.sbi-editor .s-card-info{padding:12px}
.sbi-editor .s-card-name{font-weight:600;font-size:13px;color:#1f2937;margin-bottom:4px}
.sbi-editor .s-card-sale{display:inline-block;background:#fee2e2;color:#b91c1c;font-size:9px;font-weight:700;padding:2px 6px;border-radius:20px;margin-bottom:4px}
.sbi-editor .s-card-price{font-size:15px;font-weight:700;color:var(--teal)}
.sbi-editor .s-card-old{font-size:11px;color:#9ca3af;text-decoration:line-through;margin-left:5px}
.sbi-editor .s-banner{background:linear-gradient(135deg,var(--coral),#dc2626);padding:52px 40px;text-align:center;color:#fff}
.sbi-editor .s-banner-h{font-family:var(--serif);font-size:36px;margin-bottom:10px}
.sbi-editor .s-banner-p{font-size:14px;opacity:.88;margin-bottom:22px}
.sbi-editor .s-revs{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.sbi-editor .s-rev{background:#fff;border-radius:9px;padding:16px;border:1px solid #e5e7eb}
.sbi-editor .s-rev-stars{display:flex;gap:2px;margin-bottom:7px}
.sbi-editor .s-rev-stars svg{width:12px;height:12px;fill:#f97316;color:#f97316}
.sbi-editor .s-rev-txt{font-size:13px;color:#374151;line-height:1.6;margin-bottom:10px;font-style:italic}
.sbi-editor .s-rev-name{font-size:12px;font-weight:600;color:var(--navy)}
.sbi-editor .s-rev-loc{font-size:10px;color:#9ca3af}
.sbi-editor .s-nl{background:var(--navy);padding:48px 40px;text-align:center}
.sbi-editor .s-nl h2{font-family:var(--serif);font-size:28px;color:#fff;margin-bottom:8px}
.sbi-editor .s-nl p{color:rgba(255,255,255,.65);margin-bottom:20px;font-size:14px}
.sbi-editor .s-nl-f{display:flex;gap:8px;max-width:380px;margin:0 auto}
.sbi-editor .s-nl-i{flex:1;padding:10px 13px;border:1px solid rgba(255,255,255,.2);border-radius:7px;background:rgba(255,255,255,.1);color:#fff;font-size:13px;font-family:var(--font)}
.sbi-editor .s-nl-i::placeholder{color:rgba(255,255,255,.35)}
.sbi-editor .s-footer{background:var(--navy);color:rgba(255,255,255,.65);padding:40px 40px 22px}
.sbi-editor .s-footer-g{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:28px;margin-bottom:22px}
.sbi-editor .s-footer-logo{font-family:var(--serif);font-size:18px;color:#fff;margin-bottom:8px}
.sbi-editor .s-footer-tag{font-size:12px;line-height:1.65}
.sbi-editor .s-footer-ht{font-weight:700;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.sbi-editor .s-footer-lnk{font-size:12px;display:block;padding:2px 0;cursor:pointer;transition:.15s}
.sbi-editor .s-footer-lnk:hover{color:var(--teal2)}
.sbi-editor .s-footer-btm{border-top:1px solid rgba(255,255,255,.08);padding-top:14px;display:flex;justify-content:space-between;font-size:11px;flex-wrap:wrap;gap:6px}
.sbi-editor .s-shop-hd{padding:32px 40px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb}
.sbi-editor .s-shop-h1{font-family:var(--serif);font-size:28px;color:var(--navy);margin-bottom:4px}
.sbi-editor .s-shop-body{padding:22px 40px;display:flex;gap:22px}
.sbi-editor .s-shop-sb{width:200px;flex-shrink:0}
.sbi-editor .s-filter-g{margin-bottom:16px}
.sbi-editor .s-filter-t{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin-bottom:7px}
.sbi-editor .s-filter-o{display:flex;align-items:center;gap:7px;padding:3px 0;font-size:12px;color:#374151;cursor:pointer}
.sbi-editor .s-filter-o input{accent-color:var(--teal)}
.sbi-editor .s-shop-prods{flex:1}
.sbi-editor .s-shop-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.sbi-editor .s-shop-cnt{font-size:12px;color:#6b7280}
.sbi-editor .s-prod-body{padding:32px 40px;display:flex;gap:40px}
.sbi-editor .s-prod-gallery{flex:1;max-width:460px}
.sbi-editor .s-prod-main{height:340px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;border:1px solid #e5e7eb}
.sbi-editor .s-prod-thumbs{display:flex;gap:7px}
.sbi-editor .s-prod-thumb{width:62px;height:62px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid transparent;transition:.15s}
.sbi-editor .s-prod-thumb.on{border-color:var(--teal)}
.sbi-editor .s-prod-info{flex:1}
.sbi-editor .s-prod-h{font-family:var(--serif);font-size:25px;color:var(--navy);margin-bottom:8px;line-height:1.2}
.sbi-editor .s-prod-price-row{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.sbi-editor .s-prod-price{font-size:22px;font-weight:700;color:var(--teal)}
.sbi-editor .s-prod-old{font-size:15px;color:#9ca3af;text-decoration:line-through}
.sbi-editor .s-prod-desc{font-size:13px;color:#4b5563;line-height:1.7;margin-bottom:18px}
.sbi-editor .s-prod-opts{margin-bottom:14px}
.sbi-editor .s-opt-l{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin-bottom:6px}
.sbi-editor .s-opt-bs{display:flex;gap:6px;flex-wrap:wrap}
.sbi-editor .s-opt-b{padding:5px 12px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px;cursor:pointer;font-family:var(--font);transition:.15s;background:#fff}
.sbi-editor .s-opt-b:hover,.sbi-editor .s-opt-b.on{border-color:var(--teal);color:var(--teal);background:var(--teal3)}
.sbi-editor .s-prod-qty{display:flex;align-items:center;border:1px solid #e5e7eb;border-radius:6px;width:fit-content;margin-bottom:14px;overflow:hidden}
.sbi-editor .s-qty-b{width:32px;height:32px;background:#f9fafb;border:none;cursor:pointer;font-size:16px;color:#4b5563;display:flex;align-items:center;justify-content:center;font-weight:300}
.sbi-editor .s-qty-v{width:40px;text-align:center;font-size:13px;font-weight:600;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;height:32px;display:flex;align-items:center;justify-content:center}
.sbi-editor .s-atc{width:100%;padding:12px;background:var(--navy);color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:7px;font-family:var(--font)}
.sbi-editor .s-byn{width:100%;padding:12px;background:var(--teal);color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font)}
.sbi-editor .s-about-hero{background:linear-gradient(135deg,var(--navy),var(--navy2));padding:68px 40px;text-align:center;color:#fff}
.sbi-editor .s-about-hero h1{font-family:var(--serif);font-size:40px;margin-bottom:12px}
.sbi-editor .s-about-hero p{font-size:14px;opacity:.75;max-width:560px;margin:0 auto}
.sbi-editor .s-about-story{padding:52px 40px;display:flex;gap:40px;align-items:center}
.sbi-editor .s-about-img{width:360px;height:260px;border-radius:12px;background:linear-gradient(135deg,#fdf2e9,#f8c8a0);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#c97c3f}
.sbi-editor .s-about-img svg{width:52px;height:52px;opacity:.6}
.sbi-editor .s-team-g{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.sbi-editor .s-team-c{background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;text-align:center;padding:20px 14px}
.sbi-editor .s-team-av{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--teal3),var(--teal2));margin:0 auto 10px;display:flex;align-items:center;justify-content:center;color:var(--teal)}
.sbi-editor .s-team-av svg{width:26px;height:26px}
.sbi-editor .s-team-nm{font-weight:700;font-size:13px;color:var(--navy);margin-bottom:2px}
.sbi-editor .s-team-rl{font-size:11px;color:#6b7280}
.sbi-editor .s-ct-body{padding:52px 40px;display:flex;gap:40px}
.sbi-editor .s-ct-left{flex:1}
.sbi-editor .s-ct-info{display:flex;flex-direction:column;gap:11px;margin-top:16px}
.sbi-editor .s-ct-item{display:flex;align-items:center;gap:10px;font-size:13px;color:#374151}
.sbi-editor .s-ct-item svg{width:14px;height:14px;color:var(--teal);flex-shrink:0}
.sbi-editor .s-ct-form{flex:1;background:#f9fafb;border-radius:10px;padding:22px;border:1px solid #e5e7eb}
.sbi-editor .s-frow{display:flex;gap:9px}
.sbi-editor .s-fld{margin-bottom:12px;flex:1}
.sbi-editor .s-fld label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;display:block;margin-bottom:4px}
.sbi-editor .s-fld input,.sbi-editor .s-fld textarea{width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-family:var(--font);background:#fff}
.sbi-editor .s-fld textarea{min-height:80px;resize:vertical}
.sbi-editor .s-blog-hd{padding:40px 40px 24px;text-align:center;background:#f9fafb;border-bottom:1px solid #e5e7eb}
.sbi-editor .s-blog-hd h1{font-family:var(--serif);font-size:34px;color:var(--navy);margin-bottom:7px}
.sbi-editor .s-blog-g{padding:32px 40px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.sbi-editor .s-blog-card{border-radius:10px;overflow:hidden;background:#fff;border:1px solid #e5e7eb;cursor:pointer;transition:.2s}
.sbi-editor .s-blog-card:hover{box-shadow:0 6px 20px rgba(0,0,0,.08);transform:translateY(-2px)}
.sbi-editor .s-bc-img{height:140px}
.sbi-editor .s-bc-body{padding:14px}
.sbi-editor .s-bc-cat{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--teal);margin-bottom:5px}
.sbi-editor .s-bc-title{font-family:var(--serif);font-size:15px;color:var(--navy);margin-bottom:6px;line-height:1.3}
.sbi-editor .s-bc-ex{font-size:12px;color:#6b7280;line-height:1.55;margin-bottom:8px}
.sbi-editor .s-bc-meta{font-size:11px;color:#9ca3af;display:flex;gap:9px}
`;
