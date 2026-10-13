"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { LanguagePicker } from "@/components/i18n/LanguagePicker";
import { useT } from "@/components/i18n/I18nProvider";
import { SupportRequestPanel } from "@/components/support/SupportRequestPanel";
import { roleDestination, type AuthRole } from "@/lib/brand";
import { getPublicEnv } from "@/lib/env";
import { portalLoginPath, portalOnboardingPath, portalSignupPath } from "@/lib/portal-routes";
import intentRouting from "@/lib/intent-routing";
import { safeNextPath } from "@/lib/auth/route-access";
import { DEFAULT_DIAL_COUNTRY, formatE164, isValidEmail, OTP_LENGTH, OTP_RESEND_SECONDS, toE164, type DialCountry } from "@shared/phone";
import {
  BackButton,
  CodeInput,
  cx,
  FieldLabel,
  GoogleMark,
  Mascot,
  Notice,
  PhoneInput,
  PillButton,
  Segmented,
  TextInput,
  Wordmark,
} from "@/components/app-ui";
import {
  friendlyNetworkError,
  navigateAfterAuth,
  sendCode,
  signInWithGoogle,
  signInWithPassword,
  syncSession,
  verifyCode,
  type CodeTarget,
  type SignupRole,
} from "./auth-api";

const { extractIntentParams, getContinuationPath } = intentRouting;

type Mode = "login" | "signup";
type Screen = "welcome" | "details" | "code";
type Method = "phone" | "email";

interface RoleCopy {
  tab: string;
  title: string;
  sub: string;
  next: string[];
}

type AuthT = ReturnType<typeof useT<["auth", "common"]>>;

function roleCopy(t: AuthT, role: SignupRole): RoleCopy {
  return {
    tab: t(`role.${role}.tab`),
    title: t(`role.${role}.title`),
    sub: t(`role.${role}.sub`),
    next: [t(`role.${role}.next1`), t(`role.${role}.next2`), t(`role.${role}.next3`), t(`role.${role}.next4`)],
  };
}

const SIGNUP_ROLES: SignupRole[] = ["seller", "supplier", "logistics_partner"];

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

export function AppAuth({ role, mode }: { role: AuthRole; mode: Mode }) {
  const t = useT("auth", "common");
  const searchParams = useSearchParams();
  const desktop = useIsDesktop();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const nextUrl = useMemo(() => buildNextUrl(role, mode, params), [role, mode, params]);
  const isAdmin = role === "admin";
  const signupRole: SignupRole = isAdmin ? "seller" : role;
  const copy = roleCopy(t, signupRole);
  const productSlug = params.get("productSlug");
  const intentProduct = useIntentProduct(productSlug);
  const hasIntent = Boolean(params.get("intent") || productSlug || params.get("supplierSlug") || params.get("logisticsSlug"));
  const callbackError = params.get("error");

  const [screen, setScreen] = useState<Screen>(mode === "signup" && !hasIntent ? "welcome" : "details");
  const [method, setMethod] = useState<Method>(isAdmin || params.get("method") === "email" ? "email" : "phone");
  const [emailMode, setEmailMode] = useState<"code" | "password">(isAdmin ? "password" : "code");
  // Phone codes go by SMS (the Supabase Send SMS hook, /api/webhooks/supabase-sms); there is no WhatsApp code path.
  const via = "sms" as const;
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState<DialCountry>(DEFAULT_DIAL_COUNTRY);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [target, setTarget] = useState<CodeTarget | null>(null);
  const [busy, setBusy] = useState<null | "send" | "verify" | "password" | "google">(null);
  const [error, setError] = useState<string | null>(
    callbackError === "confirmation_failed" || callbackError === "missing_confirmation_code" ? t("error.linkExpired") : null,
  );
  const [info, setInfo] = useState<string | null>(
    params.get("reason") === "expired"
      ? t("info.expired")
      : params.get("signedOut") === "all"
        ? t("info.signedOutAll")
        : null,
  );
  const countdown = useCountdown();

  // Desktop has room for the form straight away; the welcome screen is the phone-sized front door.
  const activeScreen = desktop && screen === "welcome" ? "details" : screen;

  function resetMessages() {
    setError(null);
    setInfo(null);
  }

  function goTo(nextScreen: Screen) {
    resetMessages();
    setScreen(nextScreen);
  }

  function chooseMethod(next: Method) {
    resetMessages();
    setMethod(next);
  }

  async function finishWithToken(accessToken: string | null, signedUpPhone?: string) {
    const syncedRole = accessToken
      ? await syncSession(accessToken, {
          role,
          fullName: fullName.trim() || undefined,
          phone: signedUpPhone,
          source: mode === "signup" ? "signup" : undefined,
        })
      : null;
    if (mode === "signup" && syncedRole && syncedRole !== role && !isAdmin) {
      setError(t(`error.otherRole.${syncedRole}`));
      setBusy(null);
      return;
    }
    const explicitNext = safeNextPath(params.get("next") ?? params.get("redirect"));
    const destination = syncedRole && syncedRole !== role && !explicitNext ? roleDestination(syncedRole) : nextUrl || roleDestination(role);
    await navigateAfterAuth(destination);
  }

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    resetMessages();
    if (mode === "signup" && !fullName.trim()) {
      setError(t("error.needName"));
      return;
    }
    let nextTarget: CodeTarget;
    if (method === "phone") {
      const e164 = toE164(phone, country);
      if (!e164) {
        setError(t("error.phone", { country: country.name, example: country.example }));
        return;
      }
      nextTarget = { kind: "phone", phone: e164, via };
    } else {
      if (!isValidEmail(email)) {
        setError(t("error.email"));
        return;
      }
      nextTarget = { kind: "email", email: email.trim().toLowerCase() };
    }
    await deliverCode(nextTarget);
  }

  async function deliverCode(nextTarget: CodeTarget) {
    setBusy("send");
    try {
      await sendCode(nextTarget, {
        create: mode === "signup",
        profile: mode === "signup" ? { fullName: fullName.trim(), role: signupRole } : undefined,
      });
      setTarget(nextTarget);
      setCode("");
      setScreen("code");
      countdown.start();
    } catch (sendError) {
      setError(friendlyNetworkError(sendError));
    } finally {
      setBusy(null);
    }
  }

  async function submitCode(value = code) {
    if (!target || value.length !== OTP_LENGTH || busy) return;
    resetMessages();
    setBusy("verify");
    try {
      const accessToken = await verifyCode(target, value);
      await finishWithToken(accessToken, target.kind === "phone" ? target.phone : undefined);
    } catch (verifyError) {
      setError(friendlyNetworkError(verifyError));
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
      setError(friendlyNetworkError(signInError));
      setBusy(null);
    }
  }

  async function google() {
    resetMessages();
    setBusy("google");
    try {
      await signInWithGoogle(role, nextUrl);
    } catch (googleError) {
      setError(friendlyNetworkError(googleError));
      setBusy(null);
    }
  }

  const switchHref = (() => {
    const query = new URLSearchParams(extractIntentParams(params) as Record<string, string>).toString();
    const path = mode === "login" ? portalSignupPath(role) : portalLoginPath(role);
    return query ? `${path}?${query}` : path;
  })();

  // ── Screens ────────────────────────────────────────────────────────────────

  const welcome = (
    <div className="app-wash flex min-h-dvh flex-col px-[22px] pb-[30px] pt-[22px]">
      <div className="flex items-center justify-between gap-3">
        <Wordmark />
        <LanguagePicker variant="globe" />
      </div>
      <div className="relative flex flex-1 items-center justify-center">
        <Mascot name="rex" mood="wave" className="h-[260px] w-[260px]" />
        <span className="absolute right-0 top-10 rounded-[20px_20px_4px_20px] bg-white px-3.5 py-2.5 text-[14px] font-bold shadow-[0_10px_30px_-12px_rgba(22,20,31,0.3)]">
          {t("welcome.bubble")}
        </span>
      </div>
      <h1 className="m-0 text-[38px] font-extrabold leading-[1.02] tracking-[-1px]">{t("welcome.title")}</h1>
      <p className="mb-[22px] mt-2.5 leading-[1.5] text-app-ink-soft">{t("welcome.sub")}</p>
      <PillButton onClick={() => { chooseMethod("phone"); goTo("details"); }}>{t("welcome.startPhone")}</PillButton>
      <PillButton tone="white" size="md" className="mt-2.5" onClick={() => { chooseMethod("email"); goTo("details"); }}>
        {t("useEmail")}
      </PillButton>
      <Link href={switchHref} className="mt-1.5 grid min-h-[44px] place-items-center text-[15px] font-bold text-app-ink no-underline">
        {t("welcome.haveShop")}
      </Link>
    </div>
  );

  const roleTabs = mode === "signup" && !isAdmin && (
    <div className="mb-6 flex flex-wrap gap-1 rounded-full bg-app-canvas p-1">
      {SIGNUP_ROLES.map((item) => {
        const query = new URLSearchParams(extractIntentParams(params) as Record<string, string>).toString();
        const href = query ? `${portalSignupPath(item)}?${query}` : portalSignupPath(item);
        const on = item === role;
        return (
          <Link
            key={item}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cx("rounded-full px-4 py-2.5 text-[14px] font-bold no-underline transition", on ? "bg-app-ink text-white" : "text-app-ink hover:bg-white")}
          >
            {t(`role.${item}.tab`)}
          </Link>
        );
      })}
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
            <div className="text-[15px] font-bold text-app-ink">{t("intent.saved")}</div>
            {mode === "signup" ? t("intent.backSignup") : t("intent.backLogin")}
          </>
        )}
      </div>
    </div>
  );

  const methodTabs = !isAdmin && (
    <Segmented
      className={cx("mb-6", desktop && "bg-app-canvas")}
      value={method}
      onChange={chooseMethod}
      options={[
        { value: "phone", label: t("method.phone") },
        { value: "email", label: t("method.email") },
      ]}
    />
  );

  const nameField = mode === "signup" && (
    <div className="mb-5">
      <FieldLabel htmlFor="auth-name">{t("field.name")}</FieldLabel>
      <TextInput id="auth-name" autoComplete="name" placeholder="Adaeze Okafor" value={fullName} onChange={(event) => setFullName(event.target.value)} />
    </div>
  );

  const phoneFields = (
    <>
      <FieldLabel htmlFor="auth-phone">{mode === "signup" ? t("field.phone") : t("field.yourPhone")}</FieldLabel>
      <PhoneInput id="auth-phone" country={country} onCountry={setCountry} value={phone} onChange={setPhone} autoFocus={desktop && mode === "login"} />
      <p className="mt-3 flex items-start gap-2 text-[13px] leading-[1.45] text-app-ink-soft">
        <span className="mt-0.5 text-app-success"><Icon name="message" size={15} /></span>
        {t("field.smsNote")}
      </p>
    </>
  );

  const emailFields = (
    <>
      <FieldLabel htmlFor="auth-email">{t("method.email")}</FieldLabel>
      <TextInput id="auth-email" type="email" autoComplete="email" placeholder="you@yourshop.com" value={email} onChange={(event) => setEmail(event.target.value)} />
      {mode === "login" && emailMode === "password" && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="auth-password">{t("field.password")}</FieldLabel>
            <Link href={`/forgot-password?role=${role}`} className="mb-2 text-[13px] font-bold text-app-ink-soft no-underline hover:text-app-ink">
              {t("field.forgot")}
            </Link>
          </div>
          <TextInput id="auth-password" type="password" autoComplete="current-password" placeholder={t("field.passwordPlaceholder")} value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
      )}
      {mode === "signup" && <p className="mt-3 text-[13px] leading-[1.45] text-app-ink-soft">{t("field.emailNote")}</p>}
    </>
  );

  const usingPassword = mode === "login" && method === "email" && emailMode === "password";
  const primaryLabel = usingPassword
    ? t("logIn")
    : method === "phone"
      ? t("sendSms")
      : t("emailCode");

  const secondaryLinks = (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[14px] font-bold text-app-ink-soft">
      {method === "phone" ? (
        <>
          <button type="button" className="hover:text-app-ink" onClick={() => chooseMethod("email")}>{t("useEmail")}</button>
        </>
      ) : (
        <>
          {!isAdmin && <button type="button" className="hover:text-app-ink" onClick={() => chooseMethod("phone")}>{t("usePhone")}</button>}
          {mode === "login" && (
            <>
              {!isAdmin && <span className="h-4 w-px bg-app-line" aria-hidden />}
              <button type="button" className="hover:text-app-ink" onClick={() => { resetMessages(); setEmailMode(emailMode === "code" ? "password" : "code"); }}>
                {emailMode === "code" ? t("usePassword") : t("emailCodeInstead")}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );

  const googleButton = !isAdmin && (
    <>
      <div className="my-5 flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.12em] text-app-ink-faint">
        <span className="h-px flex-1 bg-app-line" /> {t("or")} <span className="h-px flex-1 bg-app-line" />
      </div>
      <PillButton tone="white" size="md" className="w-full" onClick={() => void google()} busy={busy === "google"} disabled={Boolean(busy)}>
        <GoogleMark /> {t("google")}
      </PillButton>
    </>
  );

  const terms = mode === "signup" && (
    <p className="mt-5 text-center text-[12px] leading-[1.5] text-app-ink-soft">
      {t("terms.before")}{" "}
      <a href="https://shopinbos.com/terms" className="text-app-ink-soft underline">{t("terms.terms")}</a> {t("terms.and")}{" "}
      <a href="https://shopinbos.com/privacy" className="text-app-ink-soft underline">{t("terms.privacy")}</a>{t("terms.after")}
    </p>
  );

  const heading = mode === "signup" ? (desktop ? copy.title : role === "supplier" || role === "logistics_partner" ? t(`heading.signupRole.${role}`) : t("heading.signup")) : isAdmin ? t("heading.admin") : t("heading.welcomeBack");
  const subheading = mode === "signup"
    ? desktop ? copy.sub : null
    : role === "admin" ? t("sub.admin") : t(`sub.login.${role}`);

  const detailsForm = (
    <form onSubmit={usingPassword ? submitPassword : requestCode} noValidate>
      {desktop && roleTabs}
      {intentBanner}
      <h1 className={cx("m-0 font-extrabold tracking-[-0.6px]", desktop ? "text-[32px] leading-[1.1]" : "text-[30px] leading-[1.1]")}>{heading}</h1>
      {subheading && <p className="mb-0 mt-2 leading-[1.55] text-app-ink-soft">{subheading}</p>}
      <div className="mt-6">
        {methodTabs}
        {nameField}
        {method === "phone" ? phoneFields : emailFields}
      </div>
      {error && <div className="mt-5"><Notice>{error}{/couldn't find an account/i.test(error) && mode === "login" && <> <Link href={switchHref} className="font-bold text-app-danger underline">{t("createShop")}</Link></>}</Notice></div>}
      {info && <div className="mt-5"><Notice tone="info">{info}</Notice></div>}
      {desktop && (
        <>
          <PillButton type="submit" tone="accent" size="md" className="mt-6 w-full" busy={busy === "send" || busy === "password"}>{primaryLabel}</PillButton>
          {secondaryLinks}
          {googleButton}
          {terms}
        </>
      )}
      {!desktop && (
        <>
          {secondaryLinks}
          {googleButton}
          <div className="h-28" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-app-canvas via-app-canvas to-transparent px-[22px] pb-[22px] pt-6">
            {terms && <div className="mb-3 [&>p]:mt-0 [&>p]:text-left">{terms}</div>}
            <PillButton type="submit" className="w-full" busy={busy === "send" || busy === "password"}>{mode === "signup" ? t("sendCode") : primaryLabel}</PillButton>
          </div>
        </>
      )}
    </form>
  );

  const destinationLabel = target?.kind === "phone" ? t("code.smsOn", { phone: formatE164(target.phone) }) : target?.email ?? "";

  const codeForm = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submitCode();
      }}
    >
      <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">{t("code.title")}</h1>
      <p className="mb-6 mt-2 text-app-ink-soft">
        {t("code.sentTo", { destination: destinationLabel })}{mode === "login" ? ` ${t("code.checkSame")}` : ""}
      </p>
      <CodeInput value={code} onChange={setCode} onComplete={(value) => void submitCode(value)} disabled={busy === "verify"} />
      <div className="mt-4 text-[14px] text-app-ink-soft">
        {countdown.seconds > 0 ? (
          <>{t("code.resendIn", { seconds: String(countdown.seconds).padStart(2, "0") })}</>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2 font-bold">
            <button type="button" className="text-app-ink" onClick={() => target && void deliverCode(target)} disabled={Boolean(busy)}>{t("code.resend")}</button>
          </div>
        )}
      </div>
      {error && <div className="mt-5"><Notice>{error}</Notice></div>}
      {desktop ? (
        <PillButton type="submit" tone="accent" size="md" className="mt-8 w-full" busy={busy === "verify"} disabled={code.length !== OTP_LENGTH}>{t("code.verify")}</PillButton>
      ) : (
        <div className="fixed inset-x-0 bottom-0 px-[22px] pb-[22px]">
          <PillButton type="submit" className="w-full" busy={busy === "verify"} disabled={code.length !== OTP_LENGTH}>{t("code.verify")}</PillButton>
        </div>
      )}
    </form>
  );

  // ── Layouts ────────────────────────────────────────────────────────────────

  if (!desktop) {
    if (activeScreen === "welcome") return <div className="font-app text-app-ink">{welcome}</div>;
    return (
      <div className="min-h-dvh bg-app-canvas px-[22px] pb-6 pt-[22px] font-app text-app-ink">
        <div className="mb-6 flex items-center justify-between">
          <BackButton
            onClick={() => {
              if (activeScreen === "code") goTo("details");
              else if (mode === "signup" && !hasIntent) goTo("welcome");
              else window.history.length > 1 ? window.history.back() : (window.location.href = getPublicEnv().appUrl);
            }}
          />
          <div className="flex items-center gap-3">
            {activeScreen === "details" && (
              <Link href={switchHref} className="text-[14px] font-bold text-app-ink no-underline">
                {mode === "signup" ? t("logIn") : t("createShop")}
              </Link>
            )}
            <LanguagePicker variant="globe" />
          </div>
        </div>
        {activeScreen === "code" ? codeForm : detailsForm}
        {activeScreen === "details" && <StuckLink className="mt-8 pb-24" />}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-app-canvas font-app text-app-ink">
      <header className="border-b border-app-line bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1136px] items-center justify-between px-6">
          <a href="https://shopinbos.com" aria-label={t("homeAria")}><Wordmark className="h-[20px]" /></a>
          <div className="flex items-center gap-5">
            <LanguagePicker variant="globe" />
            <span className="text-[14px] text-app-ink-soft">{mode === "signup" ? t("header.haveShop") : t("header.new")}</span>
            <Link href={switchHref} className="rounded-full bg-app-accent px-4 py-2.5 text-[14px] font-bold text-white no-underline hover:brightness-95">
              {mode === "signup" ? t("logIn") : isAdmin ? t("header.backToApp") : t("header.startShop")}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-[1136px] grid-cols-[minmax(0,552px)_minmax(0,1fr)] gap-14 px-6 py-14">
        <section className="rounded-[28px] border border-app-line bg-white p-8">
          {activeScreen === "code" && (
            <div className="mb-6">
              <BackButton onClick={() => goTo("details")} />
            </div>
          )}
          {activeScreen === "code" ? codeForm : detailsForm}
        </section>
        <aside className="pt-4">
          {mode === "signup" ? <WhatHappensNext steps={copy.next} /> : <LoginAside role={role} />}
          <HelpCard />
        </aside>
      </main>
    </div>
  );
}

function WhatHappensNext({ steps }: { steps: string[] }) {
  const t = useT("auth");
  return (
    <>
      <div className="mb-6 text-[13px] font-extrabold uppercase tracking-[0.08em]">{t("next.title")}</div>
      <ol className="m-0 grid list-none gap-5 p-0">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-4 text-[17px] font-semibold">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-app-line bg-white text-[14px] font-extrabold">{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </>
  );
}

function LoginAside({ role }: { role: AuthRole }) {
  const t = useT("auth");
  const lines: Record<AuthRole, ReactNode> = {
    seller: t("aside.seller"),
    supplier: t("aside.supplier"),
    logistics_partner: t("aside.logistics_partner"),
    admin: t("aside.admin"),
  };
  return (
    <div className="flex items-center gap-5">
      <Mascot name="peggy-wave" className="h-[120px] w-[120px]" />
      <div>
        <div className="text-[22px] font-extrabold tracking-[-0.3px]">{t("aside.title")}</div>
        <p className="mb-0 mt-2 max-w-[400px] leading-[1.55] text-app-ink-soft">{lines[role]}</p>
      </div>
    </div>
  );
}

const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");

/** Compact "Stuck? Talk to us" for phone layouts and the password screens; opens the same support panel. */
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
      <SupportRequestPanel open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

// "Stuck?" opens the support panel (a real ticket with the team), with email/WhatsApp kept as a fallback link.
function HelpCard() {
  const t = useT("auth");
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-10">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-4 rounded-[24px] bg-app-forest px-6 py-6 text-left text-[15px] leading-[1.5] text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-app-forest/30"
      >
        <Mascot name="peggy" className="h-14 w-14 shrink-0" alt="" />
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">{t("stuck.title")}</span>
          {t("stuck.sub")}
        </span>
        <Icon name="arrow" size={18} />
      </button>
      <p className="m-0 mt-3 px-2 text-[13px] text-app-ink-soft">
        {t("stuck.orEmail")}{" "}
        <a href="mailto:support@shopinbos.com" className="font-semibold text-app-ink underline-offset-2 hover:underline">support@shopinbos.com</a>
        {SUPPORT_WHATSAPP ? (
          <>
            {" "}·{" "}
            <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-app-ink underline-offset-2 hover:underline">WhatsApp</a>
          </>
        ) : null}
      </p>
      <SupportRequestPanel open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
