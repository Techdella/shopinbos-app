// Wordy sections on the phone go behind an ⓘ (InfoTip in apps/mobile/src/components/ui.tsx): one short line at most
// stays on screen and the explanation opens in a compact sheet. Warnings about money, errors, consent and status stay
// visible. These tests read the source, like the other phone tests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];

const ui = app("components/ui.tsx");
const infoTip = ui.slice(ui.indexOf("export function InfoTip"), ui.indexOf("export function WithTip"));

test("InfoTip: a 44px ⓘ button called More info that opens a sheet with a title, the text and an optional Learn more", () => {
  assert.ok(infoTip.length > 200, "InfoTip is in ui.tsx");
  assert.match(infoTip, /accessibilityLabel=\{t\("tip\.more"\)\}/);
  assert.match(infoTip, /width: 44, height: 44/);
  assert.match(infoTip, /<AppIcon name="info"/);
  assert.match(infoTip, /<Modal visible=\{open\} transparent/);
  // Closed with a tap outside (the scrim), the ✕ or Android Back.
  assert.match(infoTip, /accessibilityLabel=\{t\("close"\)\} onPress=\{\(\) => setOpen\(false\)\} style=\{\[StyleSheet\.absoluteFill/);
  assert.match(infoTip, /onRequestClose=\{\(\) => setOpen\(false\)\}/);
  assert.match(infoTip, /learnMore\.label \?\? t\("tip\.learnMore"\)/);
  assert.match(app("components/icons.tsx"), /\binfo: \(\) =>/);
});

test("InfoTip follows light and dark mode: theme colours only, no fixed hex", () => {
  assert.doesNotMatch(infoTip, /#[0-9A-Fa-f]{3,8}\b/);
  for (const token of ["colors.scrim", "colors.surface", "colors.grab", "colors.mintTint", "colors.forest", "colors.inkSoft"]) assert.ok(infoTip.includes(token), token);
});

test("tip words are in all five languages", () => {
  for (const lang of LANGS) {
    for (const key of ["tip.more", "tip.learnMore"]) assert.ok(CATALOGS.m_ui[lang][key], `m_ui ${lang} ${key}`);
  }
});

test("labels, notices, section titles and screens can carry a tip", () => {
  assert.match(ui, /export function Label\(\{ children, tip \}/);
  assert.match(ui, /export function Notice\(\{ tone = "error", children, tip \}/);
  assert.match(app("components/kit.tsx"), /export function SectionTitle\(\{ children, action, style, tip \}/);
  assert.match(app("components/Screen.tsx"), /tip\?: string;/);
  assert.match(app("components/SupplierKit.tsx"), /export function FlowFrame\(\{ step, onBack, title, sub, tip,/);
});

test("the busiest screens moved their explainers into tips", () => {
  const wallet = app("app/wallet.tsx");
  assert.match(wallet, /<InfoTip testID="wallet-tip" title=\{t\("w\.getPaid"\)\} text=\{view\.fee \? t\("w\.fee"/);
  assert.doesNotMatch(wallet, /<Small>\{t\("w\.sub"\)\}<\/Small>/);
  const product = app("app/product/[id].tsx");
  assert.match(product, /tip=\{\{ text: t\("edit\.photosSub"\) \}\}/);
  assert.match(product, /<SwitchRow title=\{t\("stock\.keepSelling"\)\} tip=\{t\("stock\.keepSellingSub"\)\}/);
  assert.match(app("app/logistics/level.tsx"), /tip=\{\{ title: t\("lvl\.interstateTitle"\), text: t\("lvl\.interstateGated"\) \}\}/);
  assert.match(app("app/logistics/pay-on-delivery.tsx"), /<InfoTip title=\{words\("pod\.howItWorks"/);
  assert.match(app("app/rider/link.tsx"), /tip=\{t\("link\.sub"\)\}/);
  assert.match(app("components/MoneyOwedCard.tsx"), /tip=\{\{ text: t\("owed\.sub", \{ days: PAY_WITHIN_DAYS \}\) \}\}/);
});

test("warnings stay on screen: paused money, failed checks and the claim deadline", () => {
  const owed = app("components/MoneyOwedCard.tsx");
  assert.match(owed, /\{owed\.pausedAt \? <Notice>\{t\("owed\.paused"\)\}<\/Notice> : null\}/);
  assert.match(owed, /t\("claim\.promptShort", \{ days: CLAIM_WITHIN_DAYS \}\)/);
  const wallet = app("app/wallet.tsx");
  assert.match(wallet, /<Notice tone="info">\{t\("w\.review"\)\}<\/Notice>/);
  assert.match(wallet, /<Notice>\{t\("w\.failed", \{ reason: view\.settlement\.error \}\)\}<\/Notice>/);
});

test("every short line added for a tip is in all five languages and at most about 60 letters in English", () => {
  const short = [
    ["wallet", "claim.promptShort"], ["m_products", "list.preorderBarShort"], ["m_products", "list.stockHintShort"], ["m_orders", "list.emptyBodyShort"],
    ["m_find", "product.dropshipShort"], ["marketplace", "trust.nearbyShort"], ["bulkAdd", "pick.subShort"], ["m_partner", "moneyCard.noteShort"],
    ["m_partner", "lvl.interstateShort"], ["m_partner", "cashScreen.subShort"], ["m_rider", "link.subShort"], ["m_supplier", "money.howItMovesShort"],
    ["supplier", "agr.subShort"], ["m_onboarding", "pay.bankLaterShort"], ["marketplace", "ws.subShort"], ["m_paylinks", "bio.subShort"],
  ];
  for (const [ns, key] of short) {
    for (const lang of LANGS) assert.ok(CATALOGS[ns][lang][key], `${ns} ${lang} ${key}`);
    assert.ok(CATALOGS[ns].en[key].replace(/\{\w+\}/g, "Name").length <= 62, `${ns} ${key} is short`);
  }
});
