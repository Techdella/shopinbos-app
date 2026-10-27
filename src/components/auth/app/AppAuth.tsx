"use client";

// Sign up and sign in (Prototype 10). One page for phones and computers: a white column with the form, and on wide
// screens the dark green AuthShowcasePanel beside it.
//
// Screens: welcome (phone-only front door with Peggy's hello clip) → details (role, phone or email) → code
// ("Check your WhatsApp" / "Check your messages" / "Check your email", from the channel the server really used) →
// name (brand-new accounts only: "Number confirmed · What should we call you?") → ready (new sellers: "Welcome to
// Shopinbos, {name}" with Rex's hello clip and a filling bar, then Rex's first run at /onboarding).
//
// Phone codes go on WhatsApp when the server has it switched on (GET /api/auth/otp → { whatsapp }), with SMS as the
// fallback; "No WhatsApp on this number? Send it by SMS" forces SMS. The wording only promises WhatsApp when it is
// available, and the code screen follows the channel the server reports.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { LanguagePicker } from "@/components/i18n/LanguagePicker";
import { useT } from "@/components/i18n/I18nProvider";
import { SupportRequestPanel } from "@/components/support/SupportRequestPanel";
import { MascotVideo } from "@/components/brand/MascotVideo";
import { roleDestination, type AuthRole } from "@/lib/brand";
import { portalLoginPath, portalOnboardingPath, portalSignupPath } from "@/lib/portal-routes";
import intentRouting from "@/lib/intent-routing";
import { themeLibraryEntry } from "@/lib/store-templates/theme-library";
import { safeNextPath } from "@/lib/auth/route-access";
import { asAccountRole, asSignupRole, withPortalNote } from "@/lib/auth/role-rules";
import { DEFAULT_DIAL_COUNTRY, DIAL_COUNTRIES, formatE164, isValidEmail, splitE164, OTP_LENGTH, OTP_RESEND_SECONDS, toE164, type DialCountry } from "@shared/phone";
import { CodeInput, GoogleMark, Mascot, Notice, PillButton, TextInput, Wordmark } from "@/components/app-ui";
import { AuthShowcasePanel } from "./AuthShowcasePanel";
import {
  AuthApiError,
  fetchWhatsAppCodes,
  friendlyNetworkError,
  ensureSessionSaved,
  navigateAfterAuth,
  sendCode,
  signInWithGoogle,
  signInWithPassword,
  syncSession,
  verifyCode,
  type CodeChannel,
  type CodeTarget,
  type SignupRole,
} from "./auth-api";
import "./auth-showcase.css";
import { supportWhatsApp } from "@/lib/support-contact";

const { extractIntentParams, getContinuationPath } = intentRouting;

type Mode = "login" | "signup";
type Screen = "welcome" | "details" | "code" | "name" | "ready";
type Method = "phone" | "email";

const SIGNUP_ROLES: SignupRole[] = ["seller", "supplier", "logistics_partner"];
/** The picture on each "What do you do?" card. */
const ROLE_ICON = { seller: "shop", supplier: "box", logistics_partner: "truck" } as const satisfies Record<SignupRole, "shop" | "box" | "truck">;

/**
 * /signup and /login show "What do you do?" (seller, supplier, delivery partner) first, unless the link already
 * says: the supplier and delivery pages, ?role=, a marketing-site intent (?intent=add_product&productSlug=…, which
 * is a seller), a ?next= page, or a message to show (an expired session, a sign-in link error, a sign-up clash).
 */
function roleAlreadyClear(role: AuthRole, params: URLSearchParams) {
  if (role !== "seller") return true;
  return ["role", "intent", "productSlug", "supplierSlug", "logisticsSlug", "next", "redirect", "error", "conflict", "reason", "signedOut"].some((key) => params.has(key));
}

/** How long "Welcome to Shopinbos, {name}" shows before Rex's first run. */
const READY_MS = 3200;

function buildNextUrl(role: AuthRole, mode: Mode, searchParams: URLSearchParams) {
  // Same-site paths only, so a crafted ?next= can't bounce someone to another site after they sign in.
  const explicitNext = safeNextPath(searchParams.get("next") ?? searchParams.get("redirect"));
  if (explicitNext) return explicitNext;
  if (mode === "login" || role === "admin") return getContinuationPath({ role, ...extractIntentParams(searchParams) });
  if (role !== "seller") return portalOnboardingPath(role);
  const url = new URL("/onboarding", window.location.origin);
  url.searchParams.set("role", role);
  for (const [key, value] of Object.entries(extractIntentParams(searchParams))) {
    if (value) url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

/** Banner title for intents that don't name a product (template, plan, delivery partner…). */
function intentHeadline(params: URLSearchParams) {
  const intent = params.get("intent");
  const theme = intent === "template" ? themeLibraryEntry(params.get("template")) : null;
  if (theme) return `Your store, in the ${theme.name} look`;
  if (intent === "plan" && params.get("plan")) return "We saved the plan you picked";
  if (intent === "book_delivery") return "We saved the delivery partner you picked";
  if (intent === "import") return "Import products from China";
  return "We saved where you were";
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  function start() {
    setSeconds(OTP_RESEND_SECONDS);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSeconds((value) => {
        if (value <= 1 && timer.current) clearInterval(timer.current);
        return Math.max(0, value - 1);
      });
    }, 1000);
  }
  return { seconds, start };
}

interface IntentProduct {
  name: string;
  price: number | null;
  image: string | null;
}

function useIntentProduct(productSlug: string | null) {
  const [product, setProduct] = useState<IntentProduct | null>(null);
  useEffect(() => {
    if (!productSlug) return;
    let cancelled = false;
    fetch(`/api/v1/public/products/${encodeURIComponent(productSlug)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { name?: string; images?: unknown; suggestedRetailPrice?: number | string | null; wholesalePrice?: number | string | null } } | null) => {
        if (cancelled || !body?.data?.name) return;
        const images = Array.isArray(body.data.images) ? body.data.images.filter((item): item is string => typeof item === "string") : [];
        const price = Number(body.data.suggestedRetailPrice ?? body.data.wholesalePrice ?? NaN);
        setProduct({ name: body.data.name, price: Number.isFinite(price) ? price : null, image: images[0] ?? null });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [productSlug]);
  return product;
}

/** Can phone codes go by WhatsApp? null while asking the server. */
function useWhatsAppCodes(enabled: boolean) {
  const [available, setAvailable] = useState<boolean | null>(enabled ? null : false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void fetchWhatsAppCodes().then((value) => live && setAvailable(value));
    return () => {
      live = false;
    };
  }, [enabled]);
  return available;
}

/** 🇳🇬 from "NG". */
function flagOf(code: string) {
  return code.toUpperCase().replace(/[A-Z]/g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
}

/** +234 803 ••• 790: enough to recognise the number, not enough to read it over a shoulder. */
function maskedPhone(e164: string) {
  const pretty = formatE164(e164);
  const parts = pretty.split(" ");
  if (parts.length < 4) return pretty;
  return [...parts.slice(0, 2), "•••", ...parts.slice(3)].join(" ");
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function AppAuth({ role, mode }: { role: AuthRole; mode: Mode }) {
  const t = useT("auth", "common");
  const searchParams = useSearchParams();
  const desktop = useIsDesktop();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const nextUrl = useMemo(() => buildNextUrl(role, mode, params), [role, mode, params]);
  const isAdmin = role === "admin";
  const signupRole: SignupRole = isAdmin ? "seller" : role;
  const productSlug = params.get("productSlug");
  const intentProduct = useIntentProduct(productSlug);
  const hasIntent = Boolean(params.get("intent") || productSlug || params.get("supplierSlug") || params.get("logisticsSlug"));
  const callbackError = params.get("error");
  const whatsapp = useWhatsAppCodes(!isAdmin);
  // ?role=supplier (or logistics_partner) on /signup or /login belongs on that portal's own page.
  const paramRole = asSignupRole(params.get("role"));
  const movingTo = role === "seller" && paramRole && paramRole !== "seller"
    ? (() => {
        const rest = new URLSearchParams(params);
        rest.delete("role");
        const path = mode === "signup" ? portalSignupPath(paramRole) : portalLoginPath(paramRole);
        return rest.toString() ? `${path}?${rest}` : path;
      })()
    : null;
  useEffect(() => {
    if (movingTo) window.location.replace(movingTo);
  }, [movingTo]);
  // "What do you do?" first, unless the page or link already says (admins never see it).
  const [picked, setPicked] = useState(() => isAdmin || roleAlreadyClear(role, params));

  /** "This email already has a seller account. Log in, or use a different email for your supplier business." */
  function conflictMessage(existing: AuthRole, via: "email" | "phone") {
    return t(via === "phone" ? "conflict.phone" : "conflict.email", {
      account: t(`conflict.account.${existing}`),
      business: t(`conflict.business.${signupRole}`),
    });
  }
  const conflictParam = asAccountRole(params.get("conflict"));

  const [screen, setScreen] = useState<Screen>(mode === "signup" && !hasIntent ? "welcome" : "details");
  const [method, setMethod] = useState<Method>(isAdmin || params.get("method") === "email" ? "email" : "phone");
  const [emailMode, setEmailMode] = useState<"code" | "password">(isAdmin ? "password" : "code");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState<DialCountry>(DEFAULT_DIAL_COUNTRY);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [target, setTarget] = useState<CodeTarget | null>(null);
  const [channel, setChannel] = useState<CodeChannel>("sms");
  // After a code is accepted for a brand-new account: the session waits here while they type their name.
  const [pending, setPending] = useState<{ accessToken: string | null; phone?: string } | null>(null);
  const [busy, setBusy] = useState<null | "send" | "sms" | "verify" | "password" | "google" | "name">(null);
  const [error, setError] = useState<string | null>(() =>
    callbackError === "confirmation_failed" || callbackError === "missing_confirmation_code"
      ? t("error.linkExpired")
      : conflictParam && conflictParam !== role
        ? conflictMessage(conflictParam, params.get("via") === "phone" ? "phone" : "email")
        : null,
  );
  const [info, setInfo] = useState<string | null>(
    params.get("reason") === "expired"
      ? t("info.expired")
      : params.get("reason") === "removed" && isAdmin
        ? "You're no longer on the Shopinbos admin team. Ask an owner if that's a mistake."
        : params.get("signedOut") === "all"
        ? t("info.signedOutAll")
        : null,
  );
  const countdown = useCountdown();
  // The kind of account this email or phone already has, after a sign-up on another portal's page.
  const [conflictRole, setConflictRole] = useState<AuthRole | null>(conflictParam && conflictParam !== role ? conflictParam : null);
  // Told before any code is sent: "no account yet, sign up first" on log in, "already used, log in" on sign up.
  const [nextStep, setNextStep] = useState<null | "signup" | "login">(null);

  // The shopinbos.com hero form passes the typed WhatsApp number as #phone=+234…, and the "Sign up now" / "Log in"
  // button under "no account" / "already used" passes #phone= or #email= with carry=1 (a fragment, so it never
  // reaches a server log). Prefill it once, then drop it from the address bar. Carried over, the form opens straight
  // away with the same role: they already chose it on the other page.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    // A raw "+" (the hero form's #phone=+234…) reads as a space here.
    const phoneValue = hash.get("phone")?.trim().replace(/^\+?/, "+") ?? null;
    const emailValue = hash.get("email");
    if (!phoneValue && !emailValue) return;
    const split = phoneValue ? splitE164(phoneValue) : null;
    if (split) {
      setCountry(split.country);
      setPhone(split.national);
      setMethod("phone");
    } else if (emailValue && isValidEmail(emailValue)) {
      setEmail(emailValue);
      setMethod("email");
      setEmailMode("code");
    }
    if (hash.get("carry") === "1" && (split || emailValue)) {
      setPicked(true);
      setScreen("details");
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  // Computers have room for the form straight away; the welcome screen is the phone-sized front door.
  const activeScreen = desktop && screen === "welcome" ? "details" : screen;

  function resetMessages() {
    setError(null);
    setInfo(null);
    setConflictRole(null);
    setNextStep(null);
  }

  function goTo(nextScreen: Screen) {
    resetMessages();
    setScreen(nextScreen);
  }

  function chooseMethod(next: Method) {
    resetMessages();
    setMethod(next);
  }

  async function finishWithToken(accessToken: string | null, signedUpPhone?: string, name = fullName) {
    // A browser that blocks cookies drops the session: say so here, rather than bouncing back to log in.
    if (accessToken) await ensureSessionSaved();
    const syncedRole = accessToken
      ? await syncSession(accessToken, {
          role,
          fullName: name.trim() || undefined,
          phone: signedUpPhone,
          source: mode === "signup" ? "signup" : undefined,
        })
      : null;
    if (mode === "signup" && syncedRole && syncedRole !== role && !isAdmin) {
      // This email or phone already has another kind of account. Nothing about it was changed; say so plainly.
      setError(conflictMessage(syncedRole, target?.kind === "phone" || (!target && signedUpPhone) ? "phone" : "email"));
      setConflictRole(syncedRole);
      setScreen("details");
      setBusy(null);
      return;
    }
    let destination = nextUrl || roleDestination(role);
    if (syncedRole && syncedRole !== role) {
      // Logged in on another portal's page: open their own portal (never block them), with a note saying why.
      setInfo(t(`portal.opening.${syncedRole}`));
      destination = withPortalNote(roleDestination(syncedRole), role);
    }
    // A new seller sees "Welcome to Shopinbos, {name}" while Rex gets ready, then Rex's first run.
    if (mode === "signup" && role === "seller" && destination.startsWith("/onboarding")) {
      setScreen("ready");
      await new Promise((resolve) => setTimeout(resolve, READY_MS));
    }
    await navigateAfterAuth(destination);
  }

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    resetMessages();
    let nextTarget: CodeTarget;
    if (method === "phone") {
      const e164 = toE164(phone, country);
      if (!e164) {
        setError(t("error.phone", { country: country.name, example: country.example }));
        return;
      }
      nextTarget = { kind: "phone", phone: e164, via: whatsapp ? "whatsapp" : "sms" };
    } else {
      if (!isValidEmail(email)) {
        setError(t("error.email"));
        return;
      }
      nextTarget = { kind: "email", email: email.trim().toLowerCase() };
    }
    await deliverCode(nextTarget);
  }

  async function deliverCode(nextTarget: CodeTarget, kind: "send" | "sms" = "send") {
    setBusy(kind);
    resetMessages();
    try {
      const used = await sendCode(nextTarget, {
        create: mode === "signup",
        profile: mode === "signup" ? { role: signupRole } : undefined,
      });
      setTarget(nextTarget);
      setChannel(used);
      setCode("");
      setScreen("code");
      countdown.start();
    } catch (sendError) {
      if (!explainAccount(sendError, nextTarget.kind)) setError(friendlyNetworkError(sendError));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Log in with an email or phone that has no account → "You need to sign up first"; sign up with one that already
   * has an account → "Log in instead" (or, for another kind of account, the usual "This number already has a
   * supplier account" message). Both come back before any code is sent. false when the error is something else.
   */
  function explainAccount(failure: unknown, via: "email" | "phone") {
    if (!(failure instanceof AuthApiError)) return false;
    if (failure.code === "NO_ACCOUNT" && mode === "login") {
      setError(t(via === "phone" ? "noAccount.phone" : "noAccount.email"));
      if (!isAdmin) setNextStep("signup");
      return true;
    }
    if (failure.code === "ACCOUNT_EXISTS" && mode === "signup") {
      if (failure.role && failure.role !== role && !isAdmin) {
        setError(conflictMessage(failure.role, via));
        setConflictRole(failure.role);
      } else {
        setError(t(via === "phone" ? "exists.phone" : "exists.email"));
        setNextStep("login");
      }
      return true;
    }
    return false;
  }

  async function submitCode(value = code) {
    if (!target || value.length !== OTP_LENGTH || busy) return;
    resetMessages();
    setBusy("verify");
    try {
      const result = await verifyCode(target, value);
      const signedUpPhone = target.kind === "phone" ? target.phone : undefined;
      if (result.needsName) {
        // Brand-new account: ask what to call them before the account row (and shop) is made with their name.
        if (result.accessToken) await ensureSessionSaved();
        setPending({ accessToken: result.accessToken, phone: signedUpPhone });
        setBusy(null);
        setScreen("name");
        return;
      }
      await finishWithToken(result.accessToken, signedUpPhone);
    } catch (verifyError) {
      setError(friendlyNetworkError(verifyError));
      setBusy(null);
    }
  }

  async function submitName(event: FormEvent) {
    event.preventDefault();
    resetMessages();
    if (!fullName.trim()) {
      setError(t("error.needName"));
      return;
    }
    setBusy("name");
    try {
      await finishWithToken(pending?.accessToken ?? null, pending?.phone, fullName);
    } catch (nameError) {
      setError(friendlyNetworkError(nameError));
      setBusy(null);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    resetMessages();
    if (!isValidEmail(email) || !password) {
      setError(t("error.emailPassword"));
      return;
    }
    setBusy("password");
    try {
      const accessToken = await signInWithPassword(email.trim().toLowerCase(), password);
      await finishWithToken(accessToken);
    } catch (signInError) {
      if (!explainAccount(signInError, "email")) setError(friendlyNetworkError(signInError));
      setBusy(null);
    }
  }

  async function google() {
    resetMessages();
    setBusy("google");
    try {
      await signInWithGoogle(role, nextUrl, mode);
    } catch (googleError) {
      setError(friendlyNetworkError(googleError));
      setBusy(null);
    }
  }

  const intentQuery = new URLSearchParams(extractIntentParams(params) as Record<string, string>).toString();
  const switchHref = (() => {
    const path = mode === "login" ? portalSignupPath(role) : portalLoginPath(role);
    return intentQuery ? `${path}?${intentQuery}` : path;
  })();
  // The "Sign up now" / "Log in" link under "no account" or "already used": the other page, with the same phone or
  // email filled in (as #phone= / #email=, which never reach a server log).
  const carryOverHref = (() => {
    const carried = new URLSearchParams({ carry: "1" });
    if (method === "email" && isValidEmail(email)) carried.set("email", email.trim().toLowerCase());
    else if (method === "phone" && toE164(phone, country)) carried.set("phone", toE164(phone, country)!);
    else return switchHref;
    return `${switchHref}#${carried}`;
  })();

  // ── Pieces ─────────────────────────────────────────────────────────────────

  // "Sign up as a supplier · Not a supplier? Change": the chosen role, always in sight on the form.
  function changeRole() {
    resetMessages();
    setScreen(mode === "signup" && !hasIntent ? "welcome" : "details");
    setPicked(false);
  }
  const changeLabel = t(`change.${signupRole}`);
  const changeClass = "inline-flex min-h-[44px] items-center text-[14px] font-bold text-app-ink underline decoration-app-ink/30 underline-offset-4 hover:decoration-app-ink";
  const roleBadge = !isAdmin && (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-2 rounded-full bg-app-peach px-3 py-1.5 text-[13.5px] font-bold text-app-ink">
        <Icon name={ROLE_ICON[signupRole]} size={16} /> {t(`card.${signupRole}.title`)}
      </span>
      {role === "seller" ? (
        <button type="button" onClick={changeRole} className={changeClass}>{changeLabel}</button>
      ) : (
        <Link href={mode === "signup" ? "/signup" : "/login"} className={changeClass}>{changeLabel}</Link>
      )}
    </div>
  );

  // Step one on /signup and /login: three big cards. Seller carries on right here; supplier and delivery partner
  // go to their own pages (/supplier/signup, /logistics/login…).
  const roleChooser = (
    <div>
      {!desktop && <MascotVideo clip="peggy-hello" size={112} decorative className="-ml-3 mb-1" />}
      <h1 className="m-0 text-[32px] font-extrabold leading-[1.08] tracking-[-0.9px] lg:text-[40px]">
        {mode === "signup" ? t("choose.titleSignup") : t("choose.titleLogin")}
      </h1>
      <p className="mb-0 mt-3 text-[16px] leading-[1.55] text-app-ink-soft">
        {mode === "signup" ? t("choose.subSignup") : t("choose.subLogin")}
      </p>
      <nav aria-label={t("roles.aria")} className="mt-7 grid gap-3">
        {SIGNUP_ROLES.map((item) => {
          const cardClass = "flex min-h-[92px] w-full items-center gap-4 rounded-[22px] border border-app-line bg-white p-4 text-left text-app-ink no-underline transition hover:border-app-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink/20 sm:p-5";
          const inside = (
            <>
              <span className="grid h-[56px] w-[56px] shrink-0 place-items-center rounded-[18px] bg-app-peach text-app-accent">
                <Icon name={ROLE_ICON[item]} size={26} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[18px] font-extrabold leading-tight">{t(`card.${item}.title`)}</span>
                <span className="mt-1 block text-[14.5px] leading-[1.4] text-app-ink-soft">{t(`card.${item}.line`)}</span>
              </span>
              <Icon name="arrow" size={18} />
            </>
          );
          if (item === "seller") {
            return (
              <button key={item} type="button" className={cardClass} onClick={() => { resetMessages(); setScreen("details"); setPicked(true); }}>
                {inside}
              </button>
            );
          }
          return (
            <Link key={item} href={mode === "signup" ? portalSignupPath(item) : portalLoginPath(item)} className={cardClass}>
              {inside}
            </Link>
          );
        })}
      </nav>
      <p className="mb-0 mt-6 text-center text-[15px] text-app-ink-soft">
        {mode === "signup" ? t("choose.haveAccount") : t("header.new")}{" "}
        <Link href={mode === "signup" ? "/login" : "/signup"} className="font-bold text-app-ink underline decoration-app-ink/30 underline-offset-4 hover:decoration-app-ink">
          {mode === "signup" ? t("logIn") : t("choose.createAccount")}
        </Link>
      </p>
    </div>
  );

  const intentBanner = hasIntent && (
    <div className="mb-6 flex items-center gap-3 rounded-[20px] bg-app-peach p-3">
      {intentProduct?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={intentProduct.image} alt="" className="h-[52px] w-[52px] shrink-0 rounded-[14px] object-cover" />
      ) : (
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] bg-white text-app-accent">
          <Icon name="bag" size={22} />
        </span>
      )}
      <div className="min-w-0 text-[13px] leading-[1.35] text-app-ink-soft">
        {intentProduct ? (
          <>
            <div className="truncate text-[15px] font-bold text-app-ink">
              {intentProduct.name}
              {intentProduct.price ? ` · ₦${intentProduct.price.toLocaleString("en-NG")}` : ""}
            </div>
            {mode === "signup" ? t("intent.signupProduct") : t("intent.loginProduct")}
          </>
        ) : (
          <>
            <div className="text-[15px] font-bold text-app-ink">{intentHeadline(params)}</div>
            {mode === "signup" ? t("intent.backSignup") : t("intent.backLogin")}
          </>
        )}
      </div>
    </div>
  );

  const phoneFields = (
    <>
      <label htmlFor="auth-phone" className="mb-2 block text-[14px] font-bold">{t("field.yourPhone")}</label>
      <div className="flex h-[56px] items-center rounded-[14px] border border-app-line-strong/70 bg-white focus-within:border-app-ink focus-within:ring-2 focus-within:ring-app-ink/10">
        <div className="relative flex h-full shrink-0 items-center gap-2 border-r border-app-line pl-4 pr-3 text-[15px] font-bold">
          <select
            aria-label={t("field.country")}
            value={country.code}
            onChange={(event) => setCountry(DIAL_COUNTRIES.find((item) => item.code === event.target.value) ?? country)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {DIAL_COUNTRIES.map((item) => (
              <option key={item.code} value={item.code}>{item.name} ({item.dial})</option>
            ))}
          </select>
          <span aria-hidden>{flagOf(country.code)}</span>
          {country.dial}
        </div>
        <input
          id="auth-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={desktop}
          placeholder={country.example}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="h-full min-w-0 flex-1 rounded-r-[14px] bg-transparent px-4 text-[17px] outline-none placeholder:text-app-ink-faint"
        />
      </div>
      <p className="mb-0 mt-2.5 text-[13px] leading-[1.45] text-app-ink-soft">{whatsapp ? t("field.whatsappNote") : t("field.smsNote")}</p>
    </>
  );

  const emailFields = (
    <>
      <label htmlFor="auth-email" className="mb-2 block text-[14px] font-bold">{t("field.yourEmail")}</label>
      <TextInput id="auth-email" type="email" autoComplete="email" autoFocus={desktop} placeholder="you@yourshop.com" value={email} onChange={(event) => setEmail(event.target.value)} />
      {usingPasswordFor(mode, method, emailMode) && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label htmlFor="auth-password" className="mb-2 block text-[14px] font-bold">{t("field.password")}</label>
            <Link href={`/forgot-password?role=${role}`} className="mb-2 text-[13px] font-bold text-app-ink-soft no-underline hover:text-app-ink">
              {t("field.forgot")}
            </Link>
          </div>
          <TextInput id="auth-password" type="password" autoComplete="current-password" placeholder={t("field.passwordPlaceholder")} value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
      )}
      <p className="mb-0 mt-2.5 text-[13px] leading-[1.45] text-app-ink-soft">{t("field.emailNote")}</p>
    </>
  );

  const usingPassword = usingPasswordFor(mode, method, emailMode);
  const fieldEmpty = method === "phone" ? !phone.trim() : !email.trim() || (usingPassword && !password);
  const primaryLabel = usingPassword
    ? t("logIn")
    : method === "phone"
      ? whatsapp === null ? t("sendCode") : whatsapp ? t("send.whatsapp") : t("sendSms")
      : t("emailCode");

  const errorBox = error && (
    <div className="mt-5">
      <Notice>
        {error}
        {nextStep && <> <a href={carryOverHref} className="font-bold text-app-danger underline">{nextStep === "signup" ? t("noAccount.signUp") : t("logIn")}</a></>}
        {conflictRole && <> <Link href={portalLoginPath(conflictRole)} className="font-bold text-app-danger underline">{t("logIn")}</Link></>}
      </Notice>
    </div>
  );
  const infoBox = info && <div className="mt-5"><Notice tone="info">{info}</Notice></div>;

  const heading = isAdmin ? t("heading.admin") : t(`as.${mode}.${signupRole}`);
  const subheading = mode === "signup"
    ? signupRole === "seller" ? t("start.sub") : t(`role.${signupRole}.sub`)
    : isAdmin ? t("sub.admin") : t(`sub.login.${signupRole}`);

  const detailsForm = (
    <form onSubmit={usingPassword ? submitPassword : requestCode} noValidate>
      {intentBanner}
      {mode === "login" && !isAdmin && !desktop && (
        // Returning sellers: Peggy waves hello (on computers she waves from the panel instead).
        <MascotVideo clip="peggy-hello" size={124} decorative className="-ml-3 mb-2" />
      )}
      {roleBadge}
      <h1 className="m-0 text-[32px] font-extrabold leading-[1.08] tracking-[-0.9px] lg:text-[40px]">{heading}</h1>
      <p className="mb-0 mt-3 text-[16px] leading-[1.55] text-app-ink-soft">{subheading}</p>
      <div className="mt-7">{method === "phone" ? phoneFields : emailFields}</div>
      {errorBox}
      {infoBox}
      <PillButton
        type="submit"
        tone="accent"
        className="mt-6 w-full"
        busy={busy === "send" || busy === "password"}
        disabled={Boolean(busy) || fieldEmpty}
      >
        {method === "phone" && whatsapp ? <Icon name="whatsapp" size={19} /> : null}
        {primaryLabel}
      </PillButton>

      {!isAdmin && (
        <>
          <div className="my-5 flex items-center gap-3 text-[13px] text-app-ink-faint">
            <span className="h-px flex-1 bg-app-line" /> {t("or")} <span className="h-px flex-1 bg-app-line" />
          </div>
          <PillButton tone="white" size="md" className="w-full" onClick={() => chooseMethod(method === "phone" ? "email" : "phone")}>
            {method === "phone" ? t("useEmail") : t("usePhone")}
          </PillButton>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[14px] font-bold text-app-ink-soft">
            {method === "email" && mode === "login" && (
              <button type="button" className="min-h-[40px] hover:text-app-ink" onClick={() => { resetMessages(); setEmailMode(emailMode === "code" ? "password" : "code"); }}>
                {emailMode === "code" ? t("usePassword") : t("emailCodeInstead")}
              </button>
            )}
            <button type="button" className="inline-flex min-h-[40px] items-center gap-2 hover:text-app-ink disabled:opacity-60" onClick={() => void google()} disabled={Boolean(busy)}>
              <GoogleMark /> {t("google")}
            </button>
          </div>
        </>
      )}
      {isAdmin && method === "email" && (
        <div className="mt-4 text-center text-[14px] font-bold text-app-ink-soft">
          <button type="button" className="min-h-[40px] hover:text-app-ink" onClick={() => { resetMessages(); setEmailMode(emailMode === "code" ? "password" : "code"); }}>
            {emailMode === "code" ? t("usePassword") : t("emailCodeInstead")}
          </button>
        </div>
      )}

      <p className="mb-0 mt-6 text-center text-[15px] text-app-ink-soft">
        {mode === "signup" ? t("header.haveShop") : isAdmin ? null : t("header.new")}{" "}
        <Link href={switchHref} className="font-bold text-app-ink underline decoration-app-ink/30 underline-offset-4 hover:decoration-app-ink">
          {mode === "signup" ? t("logIn") : isAdmin ? t("header.backToApp") : t("header.startShop")}
        </Link>
      </p>
      {!usingPassword && (
        <p className="mb-0 mt-3 text-balance text-center text-[13px] leading-[1.5] text-app-ink-faint">
          <span className="mr-1.5 inline-block align-[-2px]"><Icon name="lock" size={13} /></span>{t("lockLine")}
        </p>
      )}
    </form>
  );

  const destination = target?.kind === "phone" ? maskedPhone(target.phone) : target?.email ?? "";
  const codeTitle = channel === "whatsapp" ? t("code.titleWhatsapp") : channel === "email" ? t("code.titleEmail") : t("code.titleSms");
  const codeSent = channel === "whatsapp"
    ? t("code.sentWhatsapp", { length: OTP_LENGTH, destination })
    : channel === "email"
      ? t("code.sentEmail", { length: OTP_LENGTH, destination })
      : t("code.sentSms", { length: OTP_LENGTH, destination });
  const minutes = Math.floor(countdown.seconds / 60);
  const askAgainIn = `${minutes}:${String(countdown.seconds % 60).padStart(2, "0")}`;

  const codeForm = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submitCode();
      }}
    >
      <button type="button" onClick={() => goTo("details")} className="mb-5 inline-flex min-h-[40px] items-center gap-1.5 text-[15px] font-bold text-app-ink-soft hover:text-app-ink">
        <Icon name="arrowLeft" size={16} /> {t("code.change")}
      </button>
      <h1 className="m-0 text-[32px] font-extrabold leading-[1.08] tracking-[-0.9px] lg:text-[40px]">{codeTitle}</h1>
      <p className="mb-7 mt-3 text-[16px] leading-[1.55] text-app-ink-soft">
        {codeSent}{mode === "login" ? ` ${t("code.checkSame")}` : ""}
      </p>
      <div className="max-w-[400px]">
        <CodeInput value={code} onChange={setCode} onComplete={(value) => void submitCode(value)} disabled={busy === "verify"} />
      </div>
      {errorBox}
      <PillButton type="submit" tone="accent" className="mt-6 w-full" busy={busy === "verify"} disabled={code.length !== OTP_LENGTH || Boolean(busy)}>
        {t("code.continue")} <Icon name="arrow" size={18} />
      </PillButton>
      <div className="mt-5 grid gap-2 text-[14.5px] text-app-ink-soft">
        {countdown.seconds > 0 ? (
          <p className="m-0">{t("code.askAgainIn")} <strong className="text-app-ink">{askAgainIn}</strong>.</p>
        ) : (
          <p className="m-0">
            <button type="button" className="min-h-[36px] font-bold text-app-ink underline decoration-app-ink/30 underline-offset-4" onClick={() => target && void deliverCode(target)} disabled={Boolean(busy)}>
              {t("code.sendNew")}
            </button>
          </p>
        )}
        {target?.kind === "phone" && channel === "whatsapp" && (
          <p className="m-0">
            {t("code.noWhatsapp")}{" "}
            <button
              type="button"
              className="min-h-[36px] font-bold text-app-ink underline decoration-app-ink/30 underline-offset-4 disabled:opacity-60"
              disabled={Boolean(busy)}
              onClick={() => void deliverCode({ kind: "phone", phone: target.phone, via: "sms" }, "sms")}
            >
              {busy === "sms" ? t("code.sending") : t("code.sendSms")}
            </button>
          </p>
        )}
      </div>
    </form>
  );

  const nameForm = (
    <form onSubmit={submitName} noValidate>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-app-success-tint px-3 py-1.5 text-[13px] font-bold text-app-success">
        <Icon name="check" size={14} strokeWidth={2.4} /> {target?.kind === "email" ? t("name.confirmedEmail") : t("name.confirmedPhone")}
      </span>
      <h1 className="m-0 mt-3 text-[32px] font-extrabold leading-[1.08] tracking-[-0.9px] lg:text-[40px]">{t("name.title")}</h1>
      <p className="mb-7 mt-3 text-[16px] leading-[1.55] text-app-ink-soft">{t("name.sub")}</p>
      <label htmlFor="auth-name" className="mb-2 block text-[14px] font-bold">{t("field.name")}</label>
      <TextInput id="auth-name" autoComplete="given-name" autoFocus placeholder="Adaeze" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={80} />
      {errorBox}
      <PillButton type="submit" tone="accent" className="mt-6 w-full" busy={busy === "name"} disabled={Boolean(busy) || !fullName.trim()}>
        {t("name.go")} <Icon name="arrow" size={18} />
      </PillButton>
      <p className="mb-0 mt-5 text-[12.5px] leading-[1.55] text-app-ink-faint">
        {t("terms.before")}{" "}
        <a href="https://shopinbos.com/terms" className="text-app-ink-soft underline">{t("terms.terms")}</a> {t("terms.and")}{" "}
        <a href="https://shopinbos.com/privacy" className="text-app-ink-soft underline">{t("terms.privacy")}</a>{t("name.termsAfter")}
      </p>
    </form>
  );

  const readyName = firstName(fullName);
  const ready = (
    <div aria-live="polite">
      <MascotVideo clip="rex-hello" size={desktop ? 150 : 132} decorative className="-ml-3 mb-4" />
      <h1 className="m-0 text-[32px] font-extrabold leading-[1.08] tracking-[-0.9px] lg:text-[40px]">
        {readyName ? t("ready.title", { name: readyName }) : t("ready.titleNoName")}
      </h1>
      <p className="mb-7 mt-3 text-[16px] leading-[1.55] text-app-ink-soft">{t("ready.sub")}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-app-line" role="progressbar" aria-label={t("ready.progress")}>
        <div className="sb-auth-fill h-full w-full rounded-full bg-app-ink" style={{ "--sb-fill-ms": `${READY_MS}ms` } as CSSProperties} />
      </div>
    </div>
  );

  // ?role=supplier on /signup: on the way to /supplier/signup.
  if (movingTo) return <div className="min-h-dvh bg-white" />;

  // ── Phone front door ───────────────────────────────────────────────────────

  if (picked && activeScreen === "welcome") {
    return (
      <div className="app-wash flex min-h-dvh flex-col px-[22px] pb-[30px] pt-[22px] font-app text-app-ink">
        <div className="flex items-center justify-between gap-3">
          <Wordmark />
          <LanguagePicker variant="globe" />
        </div>
        <div className="relative flex flex-1 items-center justify-center py-4">
          <MascotVideo clip="peggy-hello" size={230} decorative className="max-h-[38dvh] max-w-[38dvh]" />
          <span className="absolute right-0 top-4 max-w-[200px] rounded-[20px_20px_4px_20px] bg-white px-3.5 py-2.5 text-[14px] font-bold shadow-[0_10px_30px_-12px_rgba(22,20,31,0.3)]">
            {t("welcome.peggyBubble")}
          </span>
        </div>
        <div className="mt-2">{roleBadge}</div>
        <h1 className="m-0 text-[36px] font-extrabold leading-[1.04] tracking-[-1px]">{heading}</h1>
        <p className="mb-[22px] mt-2.5 leading-[1.5] text-app-ink-soft">{subheading}</p>
        <PillButton tone="accent" onClick={() => { chooseMethod("phone"); goTo("details"); }}>{t("welcome.startPhone")}</PillButton>
        <PillButton tone="white" size="md" className="mt-2.5" onClick={() => { chooseMethod("email"); goTo("details"); }}>
          {t("useEmail")}
        </PillButton>
        <Link href={switchHref} className="mt-1.5 grid min-h-[44px] place-items-center text-[15px] font-bold text-app-ink no-underline">
          {t("welcome.haveShop")}
        </Link>
      </div>
    );
  }

  // ── Page ───────────────────────────────────────────────────────────────────

  let body: ReactNode = picked ? detailsForm : roleChooser;
  if (activeScreen === "code") body = codeForm;
  if (activeScreen === "name") body = nameForm;
  if (activeScreen === "ready") body = ready;

  return (
    <div className="min-h-dvh bg-white font-app text-app-ink lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-4 lg:p-4">
      <div className="flex min-h-dvh flex-col px-5 pb-6 pt-5 sm:px-10 lg:min-h-[calc(100dvh-32px)] lg:px-12 lg:pt-7 xl:px-16">
        <header className="flex items-center justify-between gap-3">
          <a href="https://shopinbos.com" aria-label={t("homeAria")} className="shrink-0"><Wordmark className="h-[18px] lg:h-[20px]" /></a>
          <HelpLink />
        </header>
        <main className="flex flex-1 items-start pb-10 pt-8 sm:pt-12 lg:items-center lg:py-10">
          <div className="w-full max-w-[440px]">{body}</div>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px] text-app-ink-faint">
          <span>{t("footer.copyright", { year: String(new Date().getFullYear()) })}</span>
          <span className="flex items-center gap-4">
            <a href="https://shopinbos.com/privacy" className="underline underline-offset-2 hover:text-app-ink">{t("footer.privacy")}</a>
            <a href="https://shopinbos.com/terms" className="underline underline-offset-2 hover:text-app-ink">{t("footer.terms")}</a>
            <LanguagePicker variant="globe" />
          </span>
        </footer>
      </div>
      <AuthShowcasePanel who={mode === "login" ? "peggy" : "rex"} />
    </div>
  );
}

function usingPasswordFor(mode: Mode, method: Method, emailMode: "code" | "password") {
  return mode === "login" && method === "email" && emailMode === "password";
}

const SUPPORT_WHATSAPP = supportWhatsApp();

/** "Need help? Chat on WhatsApp" (or "Talk to us", which opens the support panel when no WhatsApp line is set). */
function HelpLink() {
  const t = useT("auth");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[14px] text-app-ink-soft">
      <Icon name="info" size={16} />
      <span className="hidden sm:inline">{t("help.need")}</span>
      {SUPPORT_WHATSAPP ? (
        <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="font-bold text-app-ink underline underline-offset-4">
          {t("help.whatsapp")}
        </a>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="min-h-[40px] font-bold text-app-ink underline underline-offset-4">
          {t("help.talk")}
        </button>
      )}
      <SupportRequestPanel open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Compact "Stuck? Talk to us" for the password screens; opens the same support panel (email as a fallback). */
export function StuckLink({ className = "" }: { className?: string }) {
  const t = useT("auth");
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-3 rounded-[18px] border border-app-line bg-white px-4 py-3 text-left text-[14px] leading-[1.45] text-app-ink hover:border-app-line-strong"
      >
        <Mascot name="peggy" className="h-10 w-10 shrink-0" alt="" />
        <span className="min-w-0 flex-1"><span className="font-extrabold">{t("stuck.title")}</span> {t("stuck.sub")}</span>
        <Icon name="arrow" size={16} />
      </button>
      <p className="m-0 mt-2 px-2 text-[13px] text-app-ink-soft">
        {t("stuck.orEmail")}{" "}
        <a href="mailto:support@shopinbos.com" className="font-semibold text-app-ink underline-offset-2 hover:underline">support@shopinbos.com</a>
      </p>
      <SupportRequestPanel open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
