import "server-only";
import crypto from "node:crypto";
import type { BusinessRegistration, Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { billingEmail } from "@/lib/auth/billing-email";
import { notify, notifyAdmins } from "@/lib/notifications/notify.server";
import { initializePaystackTransaction, refundPaystackTransaction, verifyPaystackTransaction, paidKobo } from "@/lib/paystack";
import { paystackSecretReady } from "@shared/checkout-payments";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { naira } from "@shared/onboarding";
import { cacVasCall, cacVasError, cacVasReady } from "@/lib/cac-vas.server";
import { readPrivateFile, removePrivateFile, uploadPrivateFile } from "@/lib/supabase/storage.server";
import { approveCacDocFromRegistration } from "@/lib/kyb/verify-cac.server";
import { registrationOpenFor } from "./launch.server";
import {
  REGISTRATION_FILES,
  REGISTRATION_REFERENCE_PREFIX,
  cleanRegistrationForm,
  readNameCheck,
  readPreCheck,
  readRegistrationStatus,
  registrationFormProblems,
  registrationPayload,
  type NameCheck,
  type RegistrationFile,
  type RegistrationForm,
} from "@shared/business-registration";

// Registering a business name with CAC through Shopinbos, paid first (like buying a domain, src/lib/domains):
//
//   name check (free) → details + files → CAC's pre-check → pending_payment → Paystack → completeRegistrationPayment
//   (callback, webhook or cron, any order, any number of times) → verified → paid → ONE caller moves it to
//   submitting → filed with CAC → submitted. CAC is never called to file without a verified payment. If CAC refuses
//   the filing outright, the payment is refunded (refunded, or refund_failed for the team).
//
// Every 10 minutes /api/cron/business-registrations files paid applications and reads CAC's status (each one at most
// every 25 minutes): approved (BN number, certificate; the files are deleted, and a supplier's or partner's CAC
// document is approved) or queried (the owner answers in the app, which goes back to CAC as an update).
//
// A filing is never sent twice: one that got no answer (timeout, crash) may have reached CAC, so it stays
// "submitting" and the team checks the VAS portal; only a clear "not taken" (5xx, 429, our key or balance) is retried.

export type RegistrationRole = "seller" | "supplier" | "logistics_partner";

const PURPOSE = "business_name_registration";
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const FILE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

export class RegistrationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "RegistrationError";
  }
}

/**
 * Switched on by an admin (Admin › Settings › Launches), or this account is one of its testers, and the CAC VAS key
 * and Paystack are both set.
 */
export async function registrationEnabled(userId?: string | null) {
  return cacVasReady() && paystackSecretReady(process.env.PAYSTACK_SECRET_KEY) && (await registrationOpenFor(userId));
}

export async function registrationPrice() {
  return (await getPriceBook())["business.bn_registration"];
}

export function registrationPage(role: string) {
  return role === "supplier" ? "/supplier/register-business" : role === "logistics_partner" ? "/logistics/register-business" : "/home/register-business";
}

function plainError(error: unknown) {
  return (error instanceof Error ? error.message : String(error ?? "unknown error")).slice(0, 400);
}

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

/** CAC's verdict on a proposed name: available and within its naming rules. Free. */
export async function checkBusinessName(proposedName: string, lineOfBusiness: string, userId?: string | null): Promise<NameCheck> {
  if (!(await registrationEnabled(userId))) throw new RegistrationError("disabled", "Business registration isn't switched on yet.", 503);
  const name = proposedName.trim().replace(/\s+/g, " ").slice(0, 120);
  if (name.split(" ").length < 2) throw new RegistrationError("invalid", "Use at least two words, e.g. \"Ada Fabrics Ventures\".");
  const body = { proposedName: name, lineOfBusiness: lineOfBusiness.trim() || "General Merchandise" };
  let answer: { status: number; json: unknown };
  try {
    // The advanced check (₦50 from the VAS wallet) also compares against similar names; the basic one is free.
    answer = await cacVasCall("/api/vas/engine/pre/bn-compliance?advanceCheck=true", { body, timeoutMs: 20_000 });
    if (answer.status === 403 || answer.status === 402) {
      console.error("[business registration] advanced name check refused, using the basic one:", answer.status, cacVasError(answer.json));
      answer = await cacVasCall("/api/vas/engine/pre/bn-compliance", { body, timeoutMs: 20_000 });
    }
  } catch (error) {
    console.error("[business registration] name check: CAC didn't answer", error instanceof Error ? error.message : error);
    throw new RegistrationError("unavailable", "CAC isn't answering just now. Try again in a minute.", 503);
  }
  const check = answer.status >= 200 && answer.status < 300 ? readNameCheck(answer.json) : null;
  if (check) return check;
  const reason = cacVasError(answer.json);
  // Full answer in the logs (search "[business registration]"), so the team sees exactly what CAC said.
  console.error("[business registration] name check failed", answer.status, reason, JSON.stringify(answer.json ?? null).slice(0, 800));
  if (answer.status === 401 || answer.status === 403 || answer.status === 402) {
    await notifyAdmins({
      event: "account.update",
      type: "system",
      priority: "critical",
      title: "CAC VAS refused a business name check",
      description: `CAC answered ${answer.status}${reason ? `: ${reason}` : ""}. ${answer.status === 401 ? "CAC rejects the key on both production and staging: copy the API key again from vas.cac.gov.ng → Api Configuration (no quotes or spaces), update CAC_VAS_API_KEY in Vercel and redeploy." : "Top up the VAS wallet, or ask CAC to enable business name services on the account."}`,
      link: "/admin",
      dedupeKey: `bizreg-vas-namecheck:${answer.status}:${new Date().toISOString().slice(0, 13)}`,
    }).catch(() => null);
    throw new RegistrationError("unavailable", "Business name checks are paused while we sort out our CAC account. Try again later; our team has been told.", 503);
  }
  throw new RegistrationError("unavailable", "We couldn't check the name with CAC just now. Try again in a minute.", 503);
}

async function dataUrl(file: Blob) {
  const type = file.type === "image/jpg" ? "image/jpeg" : file.type || "image/jpeg";
  return `data:${type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
}

function checkFiles(files: Partial<Record<RegistrationFile, File | null>>, required = true) {
  const problems: Record<string, string> = {};
  for (const key of REGISTRATION_FILES) {
    const file = files[key];
    if (!file || file.size === 0) {
      if (required) problems[key] = "Required";
      continue;
    }
    if (!FILE_TYPES.has(file.type)) problems[key] = "Use a JPG or PNG picture";
    else if (file.size > MAX_FILE_BYTES) problems[key] = "Use a picture under 3 MB";
  }
  return problems;
}

/**
 * Checks the form and files (ours, then CAC's pre-check), stores the files privately, and opens the Paystack checkout.
 * Throws RegistrationError with field problems the form can show.
 */
export async function startBusinessRegistration(input: {
  user: { id: string; email: string | null; role: RegistrationRole };
  form: unknown;
  files: Partial<Record<RegistrationFile, File | null>>;
  callbackUrl: string;
}) {
  if (!(await registrationEnabled(input.user.id))) throw new RegistrationError("disabled", "Business registration isn't switched on yet.", 503);
  const form = cleanRegistrationForm(input.form);
  const problems: Record<string, string> = { ...registrationFormProblems(form), ...checkFiles(input.files) };
  // One application per name at a time: paid, with CAC, or paid for in the last hour.
  const open = await db.businessRegistration.findFirst({
    where: {
      userId: input.user.id,
      proposedName: { equals: form.proposedName, mode: "insensitive" },
      OR: [{ status: { in: ["paid", "submitting", "submitted", "queried", "answering", "approved"] } }, { status: "pending_payment", createdAt: { gt: new Date(Date.now() - 60 * 60_000) } }],
    },
    select: { status: true },
  });
  if (open) {
    throw new RegistrationError("duplicate", open.status === "pending_payment" ? "You started paying for this name a moment ago. Finish that payment, or try again in an hour." : open.status === "approved" ? "This name is already registered to you." : "This name is already with CAC. Follow it below.", 409);
  }
  if (Object.keys(problems).length) throw new RegistrationError("invalid", "Check the highlighted fields.", 400, problems);

  const nameCheck = await checkBusinessName(form.proposedName, form.lineOfBusiness, input.user.id);
  if (!nameCheck.canProceed) {
    throw new RegistrationError("name_refused", nameCheck.advice[0] ?? "CAC won't accept this name. Try another.", 400, { proposedName: nameCheck.advice[0] ?? "Try another name" });
  }

  const files = Object.fromEntries(await Promise.all(REGISTRATION_FILES.map(async (key) => [key, await dataUrl(input.files[key]!)]))) as Record<RegistrationFile, string>;
  const pre = await cacVasCall("/api/vas/engine/pre/bn/validation", { body: registrationPayload(form, files) });
  if (pre.status < 200 || pre.status >= 300) {
    console.error("[business registration] pre-check failed", pre.status, cacVasError(pre.json));
    throw new RegistrationError("unavailable", "We couldn't check your details with CAC just now. Try again in a minute.", 503);
  }
  const preProblems = readPreCheck(pre.json);
  if (Object.keys(preProblems).length) {
    throw new RegistrationError("cac_invalid", "CAC flagged some details. Fix them and try again.", 400, Object.fromEntries(Object.entries(preProblems).map(([key, messages]) => [key, messages.join(". ")])));
  }

  const filePaths: Record<string, string> = {};
  for (const key of REGISTRATION_FILES) filePaths[key] = (await uploadPrivateFile(`business-registrations/${input.user.id}`, input.files[key]!)).path;

  const amountNgn = await registrationPrice();
  const email = billingEmail(input.user);
  const row = await db.businessRegistration.create({
    data: {
      userId: input.user.id,
      role: input.user.role,
      proposedName: form.proposedName,
      lineOfBusiness: form.lineOfBusiness,
      form: asJson(form),
      filePaths: asJson(filePaths),
      nameCheck: asJson(nameCheck),
      amountNgn,
      reference: `${REGISTRATION_REFERENCE_PREFIX}${crypto.randomUUID()}`,
      status: "pending_payment",
      payerEmail: email,
    },
  });
  try {
    const payment = await initializePaystackTransaction({
      email,
      amountKobo: amountNgn * 100,
      reference: row.reference,
      callbackUrl: input.callbackUrl,
      metadata: { purpose: PURPOSE, user_id: input.user.id, registration_id: row.id, business_name: form.proposedName },
    });
    return { authorizationUrl: payment.authorization_url!, reference: row.reference, amountNgn };
  } catch (error) {
    await db.businessRegistration.updateMany({ where: { id: row.id, status: "pending_payment" }, data: { status: "payment_failed", error: plainError(error) } });
    throw new RegistrationError("checkout_failed", "We couldn't open the payment page. Try again in a minute.", 502);
  }
}

/**
 * Checks Paystack's record against the row (amount, purpose, account), then marks it paid. A charge that went through
 * but doesn't match this application is never kept: it's refunded.
 */
async function recordVerifiedPayment(row: BusinessRegistration) {
  const verified = await verifyPaystackTransaction(row.reference);
  if (verified.status !== "success") throw new RegistrationError("not_paid", "Paystack hasn't confirmed this payment.");
  const metadata = verified.metadata ?? {};
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { id: true, email: true } });
  const customer = verified.customer?.email?.toLowerCase() ?? "";
  const allowed = new Set([user ? billingEmail(user) : "", row.payerEmail?.toLowerCase() ?? ""].filter(Boolean));
  const mismatch =
    verified.currency !== "NGN" || paidKobo(verified) !== row.amountNgn * 100
      ? "the amount paid wasn't the registration price"
      : verified.reference !== row.reference || metadata.purpose !== PURPOSE || metadata.user_id !== row.userId || metadata.registration_id !== row.id
        ? "the payment details didn't match this application"
        : !user || !customer || !allowed.has(customer)
          ? "the payment came from a different account"
          : null;
  if (mismatch) {
    await refundRegistration(row.id, `We couldn't use this payment: ${mismatch}.`, ["pending_payment", "payment_failed"]);
    throw new RegistrationError("payment_mismatch", "This payment didn't match the application, so it was refunded.");
  }
  await db.businessRegistration.updateMany({ where: { id: row.id, status: { in: ["pending_payment", "payment_failed"] } }, data: { status: "paid", paidAt: new Date(), error: null } });
}

/**
 * Finishes a paid checkout: verifies, then (fileNow) files with CAC. Idempotent: callback, webhook and cron can all
 * call it. The webhook passes fileNow false (Paystack wants a quick answer): the callback or the cron files it.
 */
export async function completeRegistrationPayment(reference: string, options: { fileNow?: boolean } = {}) {
  let row = await db.businessRegistration.findUnique({ where: { reference } });
  if (!row) throw new RegistrationError("not_found", "Registration not found.", 404);
  if (row.status === "pending_payment" || row.status === "payment_failed") {
    await recordVerifiedPayment(row);
    row = (await db.businessRegistration.findUnique({ where: { id: row.id } }))!;
  }
  if (row.status === "paid" && options.fileNow !== false) await fileWithCac(row);
  return (await db.businessRegistration.findUnique({ where: { id: row.id } }))!;
}

async function loadFiles(row: Pick<BusinessRegistration, "filePaths">, keys: readonly string[]) {
  const paths = (row.filePaths && typeof row.filePaths === "object" ? row.filePaths : {}) as Record<string, string>;
  const files: Record<string, string> = {};
  for (const key of keys) if (paths[key]) files[key] = await dataUrl(await readPrivateFile(paths[key]));
  return files;
}

/** Files a paid application with CAC. Only the caller that moves it paid → submitting sends it. */
async function fileWithCac(row: BusinessRegistration) {
  const claimed = await db.businessRegistration.updateMany({ where: { id: row.id, status: "paid" }, data: { status: "submitting" } });
  if (claimed.count !== 1) return;
  let files: Record<RegistrationFile, string>;
  try {
    files = (await loadFiles(row, REGISTRATION_FILES)) as Record<RegistrationFile, string>;
  } catch (error) {
    // Nothing was sent: back to paid, the cron tries again.
    await db.businessRegistration.update({ where: { id: row.id }, data: { status: "paid", error: `Couldn't read the pictures: ${plainError(error)}` } });
    return;
  }
  let status = 0;
  let json: unknown = null;
  try {
    ({ status, json } = await cacVasCall("/api/vas/engine/pre/business-name", { body: registrationPayload(row.form as unknown as RegistrationForm, files), timeoutMs: 60_000 }));
  } catch (error) {
    // No answer: CAC may have it. Never send it again on our own; the team checks the VAS portal.
    await db.businessRegistration.update({ where: { id: row.id }, data: { error: `No answer from CAC while filing (${plainError(error)}). Check the VAS portal before filing again.` } });
    await notifyAdmins({ event: "account.update", type: "system", priority: "critical", title: "Check a business registration on the VAS portal", description: `${row.proposedName} (${row.reference}) was paid and sent to CAC, but CAC didn't answer. Look it up on vas.cac.gov.ng; don't file it again if it's there.`, link: "/admin", dedupeKey: `bizreg-unknown:${row.id}` }).catch(() => null);
    return;
  }
  const data = (json && typeof json === "object" ? (json as { data?: { transactionRef?: unknown } }).data : null) ?? null;
  const transactionRef = typeof data?.transactionRef === "string" && data.transactionRef.trim() ? data.transactionRef.trim() : null;
  if (status >= 200 && status < 300 && transactionRef) {
    await db.businessRegistration.update({ where: { id: row.id }, data: { status: "submitted", transactionRef, submittedAt: new Date(), error: null } });
    await tellOwner(row, `submitted:${row.id}`, "success", `${row.proposedName} is with CAC`, "We've filed your business name with CAC. It usually takes a few working days; we'll tell you as soon as they answer.");
    return;
  }
  const reason = cacVasError(json) || `CAC answered ${status}`;
  if (status === 400 || status === 422) {
    // CAC refused the application itself (its validation): nothing was filed, so the payment goes back.
    await refundRegistration(row.id, `CAC didn't accept the application: ${reason}.`);
    return;
  }
  // Our side (key, VAS balance, rate limit) or CAC down: back to paid for the cron, and the team is told.
  await db.businessRegistration.update({ where: { id: row.id }, data: { status: "paid", error: reason.slice(0, 400) } });
  console.error(`[business registration] filing ${row.id} failed: ${status} ${reason}`);
  if (status === 401 || status === 403) {
    await notifyAdmins({ event: "account.update", type: "system", priority: "critical", title: "CAC VAS refused a paid business registration", description: `${row.proposedName}: ${reason}. Check the VAS key and wallet balance; it retries every 30 minutes.`, link: "/admin", dedupeKey: `bizreg-vas:${row.id}` }).catch(() => null);
  }
}

/** Refunds a paid application CAC refused. Only the caller that moves it to failed sends the refund. */
async function refundRegistration(id: string, reason: string, from: string[] = ["paid", "submitting"]) {
  const claimed = await db.businessRegistration.updateMany({ where: { id, status: { in: from } }, data: { status: "failed", error: reason.slice(0, 400) } });
  if (claimed.count !== 1) return;
  const row = (await db.businessRegistration.findUnique({ where: { id } }))!;
  try {
    await refundPaystackTransaction(row.reference);
    await db.businessRegistration.update({ where: { id }, data: { status: "refunded" } });
    await tellOwner(row, `refunded:${id}`, "warning", "We couldn't file your business name", `${reason} We've sent your ${naira(row.amountNgn)} back to your card or account. It can take a few days to show.`);
  } catch (error) {
    await db.businessRegistration.update({ where: { id }, data: { status: "refund_failed", error: `${reason} Refund failed: ${plainError(error)}`.slice(0, 500) } });
    await tellOwner(row, `refund_failed:${id}`, "critical", "We couldn't file your business name", `${reason} Our team will send your ${naira(row.amountNgn)} back within 2 working days. You don't need to do anything.`);
    await notifyAdmins({ event: "account.update", type: "system", priority: "critical", title: "Refund needed: business registration", description: `${row.proposedName} (${row.reference}): ${naira(row.amountNgn)} must be refunded by hand.`, link: "/admin", dedupeKey: `bizreg-refund:${id}` }).catch(() => null);
  }
}

/** Reads CAC's status for a filed application and acts on it. */
export async function refreshRegistration(row: BusinessRegistration) {
  if (!row.transactionRef || !["submitted", "queried"].includes(row.status)) return row;
  const { status, json } = await cacVasCall(`/api/vas/portal/user/status/${encodeURIComponent(row.transactionRef)}`, { method: "GET", timeoutMs: 15_000 });
  if (status < 200 || status >= 300) {
    await db.businessRegistration.update({ where: { id: row.id }, data: { checkedAt: new Date(), error: (cacVasError(json) || `CAC answered ${status}`).slice(0, 400) } });
    return row;
  }
  const state = readRegistrationStatus(json);
  if (state.status === "approved" && state.rcNumber) {
    const updated = await db.businessRegistration.update({ where: { id: row.id }, data: { status: "approved", rcNumber: state.rcNumber, approvedAt: new Date(), checkedAt: new Date(), queries: [], error: null } });
    await removeFiles(row);
    if (row.role === "supplier" || row.role === "logistics_partner") {
      const form = row.form as unknown as RegistrationForm;
      await approveCacDocFromRegistration(row.role, row.userId, { rcNumber: state.rcNumber, name: state.entityName ?? row.proposedName, address: [form.companyStreetNumber, form.companyAddress, form.companyCity, form.companyState].filter(Boolean).join(", "), registeredAt: state.registeredAt });
    }
    await tellOwner(row, `approved:${row.id}`, "success", `${state.entityName ?? row.proposedName} is registered`, `CAC approved your business name. Your number is BN ${state.rcNumber}. Download your certificate from the registration page.`);
    return updated;
  }
  if (state.status === "queried") {
    // Just answered: CAC still shows the queries it raised before the answer. Only newer ones count.
    const newest = Math.max(0, ...state.queries.map((q) => (q.date ? Date.parse(q.date) || 0 : 0)));
    const stale = row.status === "submitted" && row.answeredAt && (newest ? newest <= row.answeredAt.getTime() : Date.now() - row.answeredAt.getTime() < 6 * 60 * 60_000);
    if (stale) return db.businessRegistration.update({ where: { id: row.id }, data: { checkedAt: new Date() } });
    const fresh = row.status !== "queried";
    // Only if nobody changed it meanwhile (an answer going in moves it to answering/submitted).
    const moved = await db.businessRegistration.updateMany({ where: { id: row.id, status: row.status, updatedAt: row.updatedAt }, data: { status: "queried", queries: asJson(state.queries), checkedAt: new Date() } });
    if (moved.count === 1 && fresh) await tellOwner(row, `queried:${row.id}:${newest || Date.now()}`, "warning", "CAC asked for changes", `CAC needs a few changes to ${row.proposedName}: ${state.queries.map((q) => q.comment).slice(0, 2).join(" ")} Open the registration page to answer.`);
    return (await db.businessRegistration.findUnique({ where: { id: row.id } }))!;
  }
  return db.businessRegistration.update({ where: { id: row.id }, data: { checkedAt: new Date() } });
}

async function removeFiles(row: Pick<BusinessRegistration, "filePaths">) {
  const paths = (row.filePaths && typeof row.filePaths === "object" ? Object.values(row.filePaths as Record<string, string>) : []).filter(Boolean);
  await Promise.allSettled(paths.map((path) => removePrivateFile(path)));
  return paths.length;
}

/**
 * The owner's answer to CAC's queries: only the fields they changed (and any new pictures) go back to CAC as an
 * update. The application is then with CAC again.
 */
export async function answerRegistrationQuery(input: { userId: string; id: string; form: unknown; files: Partial<Record<RegistrationFile | "supportingDoc", File | null>> }) {
  const row = await db.businessRegistration.findFirst({ where: { id: input.id, userId: input.userId } });
  if (!row || row.status !== "queried" || !row.transactionRef) throw new RegistrationError("not_queried", "This application isn't waiting on changes.", 409);
  const before = row.form as unknown as RegistrationForm;
  const changed = cleanRegistrationForm({ ...before, ...(input.form && typeof input.form === "object" ? input.form : {}) });
  const problems: Record<string, string> = { ...registrationFormProblems(changed), ...checkFiles(input.files, false) };
  const supporting = input.files.supportingDoc;
  if (supporting && supporting.size > 0 && (!FILE_TYPES.has(supporting.type) || supporting.size > MAX_FILE_BYTES)) problems.supportingDoc = "Use a JPG or PNG under 3 MB";
  if (Object.keys(problems).length) throw new RegistrationError("invalid", "Check the highlighted fields.", 400, problems);

  const update: Record<string, string> = {};
  for (const [key, value] of Object.entries(changed)) if (value !== (before as unknown as Record<string, string>)[key]) update[key === "proposedName" ? "proposedOption1" : key] = value;
  const newFiles: Partial<Record<string, File>> = {};
  for (const key of [...REGISTRATION_FILES, "supportingDoc"] as const) {
    const file = input.files[key];
    if (file && file.size > 0) {
      newFiles[key] = file;
      update[key] = await dataUrl(file);
    }
  }
  if (!Object.keys(update).length) throw new RegistrationError("nothing_changed", "Change what CAC asked about, then send it back.");

  // One answer at a time: claim it, store the new pictures, then send.
  const claimed = await db.businessRegistration.updateMany({ where: { id: row.id, status: "queried" }, data: { status: "answering" } });
  if (claimed.count !== 1) throw new RegistrationError("not_queried", "Your changes are already on their way to CAC.", 409);
  const paths = { ...((row.filePaths ?? {}) as Record<string, string>) };
  const replaced: string[] = [];
  try {
    for (const [key, file] of Object.entries(newFiles)) {
      if (paths[key]) replaced.push(paths[key]);
      paths[key] = (await uploadPrivateFile(`business-registrations/${row.userId}`, file!)).path;
    }
  } catch (error) {
    await db.businessRegistration.update({ where: { id: row.id }, data: { status: "queried" } });
    throw new RegistrationError("upload_failed", "We couldn't save the new pictures. Try again.", 503);
  }
  let status = 0;
  let json: unknown = null;
  try {
    ({ status, json } = await cacVasCall("/api/vas/engine/pre/query", { body: { transactionRef: row.transactionRef, ...update }, timeoutMs: 60_000 }));
  } catch {
    status = 0;
  }
  if (status < 200 || status >= 300) {
    console.error("[business registration] query answer failed", status, cacVasError(json));
    await db.businessRegistration.update({ where: { id: row.id }, data: { status: "queried" } });
    throw new RegistrationError("unavailable", cacVasError(json) || "CAC didn't take the changes just now. Try again in a minute.", status >= 500 || status === 0 ? 503 : 400);
  }
  await Promise.allSettled(replaced.map((path) => removePrivateFile(path)));
  return db.businessRegistration.update({
    where: { id: row.id },
    data: { status: "submitted", form: asJson(changed), proposedName: changed.proposedName, lineOfBusiness: changed.lineOfBusiness, filePaths: asJson(paths), queries: [], answeredAt: new Date(), error: null },
  });
}

/** The certificate PDF for an approved registration (CAC sends a file or base64). */
export async function registrationCertificate(userId: string, id: string): Promise<{ pdf: Buffer; name: string } | null> {
  const row = await db.businessRegistration.findFirst({ where: { id, userId, status: "approved" } });
  if (!row?.rcNumber || !row.transactionRef) return null;
  const { status, json } = await cacVasCall("/api/vas/engine/certificate", { body: { rcNumber: row.rcNumber, transactionRef: row.transactionRef }, timeoutMs: 60_000 });
  if (status < 200 || status >= 300) {
    console.error("[business registration] certificate failed", status, cacVasError(json));
    return null;
  }
  const data = json && typeof json === "object" ? (json as { data?: unknown }).data : null;
  const candidates = [data, ...(data && typeof data === "object" ? Object.values(data as Record<string, unknown>) : [])];
  const base64 = candidates.find((value): value is string => typeof value === "string" && value.replace(/^data:[^,]+,/, "").length > 200);
  if (!base64) return null;
  return { pdf: Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64"), name: `${row.proposedName.replace(/[^a-z0-9]+/gi, "-")}-BN-${row.rcNumber}.pdf` };
}

/** The owner's applications, newest first, without files or Paystack details. */
export async function listRegistrations(userId: string) {
  const rows = await db.businessRegistration.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 });
  return rows.map(publicRegistration);
}

export function publicRegistration(row: BusinessRegistration) {
  return {
    id: row.id,
    proposedName: row.proposedName,
    lineOfBusiness: row.lineOfBusiness,
    status: row.status,
    amountNgn: row.amountNgn,
    rcNumber: row.rcNumber,
    queries: Array.isArray(row.queries) ? (row.queries as Array<{ field: string; comment: string; date: string | null }>) : [],
    form: row.form as unknown as RegistrationForm,
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
  };
}
export type PublicRegistration = ReturnType<typeof publicRegistration>;

/** Every 30 minutes: finish payments, retry filings CAC didn't take yet, and read CAC's answer on the rest. */
export async function runRegistrationChecks(now = new Date()) {
  const result = { paid: 0, filed: 0, checked: 0, failed: 0 };
  if (!cacVasReady()) return result;
  const minutes = (n: number) => new Date(now.getTime() - n * 60_000);
  const unpaid = await db.businessRegistration.findMany({ where: { status: { in: ["pending_payment"] }, createdAt: { lt: minutes(10), gt: minutes(2 * 24 * 60) } }, take: 10 });
  for (const row of unpaid) {
    await completeRegistrationPayment(row.reference, { fileNow: false }).then(() => (result.paid += 1)).catch(() => undefined);
  }
  // A couple per run, so a slow CAC never runs the job out of time mid-filing. Rows stuck in "submitting" are never
  // refiled here (CAC may have them): the team was told when the filing got no answer.
  const toFile = await db.businessRegistration.findMany({ where: { status: "paid" }, orderBy: { paidAt: "asc" }, take: 2 });
  for (const row of toFile) {
    await fileWithCac(row).then(() => (result.filed += 1)).catch(() => (result.failed += 1));
  }
  const filed = await db.businessRegistration.findMany({ where: { status: { in: ["submitted", "queried"] }, OR: [{ checkedAt: null }, { checkedAt: { lt: minutes(25) } }] }, orderBy: { checkedAt: { sort: "asc", nulls: "first" } }, take: 15 });
  for (const row of filed) {
    await refreshRegistration(row).then(() => (result.checked += 1)).catch(() => (result.failed += 1));
  }
  return result;
}

async function tellOwner(row: Pick<BusinessRegistration, "userId" | "role">, key: string, priority: "success" | "warning" | "critical" | "info", title: string, description: string) {
  const link = registrationPage(row.role);
  await notify({ userId: row.userId, event: "account.update", type: "system", priority, title, description, link, actionLabel: "Open", actionUrl: link, email: "transactional", dedupeKey: `bizreg:${key}`.slice(0, 190) }).catch((error) =>
    console.error("[business registration] could not notify", error),
  );
}
