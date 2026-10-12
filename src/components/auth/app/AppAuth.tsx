"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SupportRequestPanel } from "@/components/support/SupportRequestPanel";
import { roleDestination, roleLabel, type AuthRole } from "@/lib/brand";
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

const ROLE_COPY: Record<SignupRole, RoleCopy> = {
  seller: {
    tab: "I sell",
    title: "Start your shop",
    sub: "Rex will have your store ready in a few minutes. You can go live before you add a bank account.",
    next: [
      "Rex asks what you sell and how it should feel",
      "You pick a logo, colours and a template",
      "Add your first products from photos",
      "Share your link and take orders",
    ],
  },
  supplier: {
    tab: "I supply shops",
    title: "Supply shops across Nigeria",
    sub: "List your stock once. Sellers order wholesale or dropship, and you ship straight to their customers.",
    next: ["Tell us what you supply and where", "Add products with photos and prices", "Get verified so shops trust you", "Take wholesale and dropship orders"],
  },
  logistics_partner: {
    tab: "I deliver",
    title: "Deliver for Shopinbos shops",
    sub: "Get delivery jobs from shops near you. Set your areas and prices; we send you the bookings.",
    next: ["Tell us where you deliver", "Set your prices and vehicles", "Get verified", "Accept bookings and get paid"],
  },
};

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
  const searchParams = useSearchParams();
  const desktop = useIsDesktop();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const nextUrl = useMemo(() => buildNextUrl(role, mode, params), [role, mode, params]);
  const isAdmin = role === "admin";
  const signupRole: SignupRole = isAdmin ? "seller" : role;
  const copy = ROLE_COPY[signupRole];
  const productSlug = params.get("productSlug");
  const intentProduct = useIntentProduct(productSlug);
  const hasIntent = Boolean(params.get("intent") || productSlug || params.get("supplierSlug") || params.get("logisticsSlug"));
  const callbackError = params.get("error");

  const [screen, setScreen] = useState<Screen>(mode === "signup" && !hasIntent ? "welcome" : "details");
  const [method, setMethod] = useState<Method>(isAdmin || params.get("method") === "email" ? "email" : "phone");
  const [emailMode, setEmailMode] = useState<"code" | "password">(isAdmin ? "password" : "code");
  const [via, setVia] = useState<"whatsapp" | "sms">("whatsapp");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState<DialCountry>(DEFAULT_DIAL_COUNTRY);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [target, setTarget] = useState<CodeTarget | null>(null);
  const [busy, setBusy] = useState<null | "send" | "verify" | "password" | "google">(null);
  const [error, setError] = useState<string | null>(
    callbackError === "confirmation_failed" || callbackError === "missing_confirmation_code" ? "That sign-in link has expired. Please try again." : null,
  );
  const [info, setInfo] = useState<string | null>(
    params.get("reason") === "expired"
      ? "For your security, you've been logged out after a while. Log in again to carry on."
      : params.get("signedOut") === "all"
        ? "You've been logged out on all your devices."
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
      setError(`This account already belongs to a ${roleLabel(syncedRole).toLowerCase()}. Log in to that portal instead.`);
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
      setError("Tell us your name so Rex knows what to call you.");
      return;
    }
    let nextTarget: CodeTarget;
    if (method === "phone") {
      const e164 = toE164(phone, country);
      if (!e164) {
        setError(`Enter your ${country.name} phone number, like ${country.example}.`);
        return;
      }
      nextTarget = { kind: "phone", phone: e164, via };
    } else {
      if (!isValidEmail(email)) {
        setError("Enter a valid email address.");
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
      setError("Enter your email and password.");
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
      <Wordmark />
      <div className="relative flex flex-1 items-center justify-center">
        <Mascot name="rex" className="h-[260px] w-[260px]" />
        <span className="absolute right-0 top-10 rounded-[20px_20px_4px_20px] bg-white px-3.5 py-2.5 text-[14px] font-bold shadow-[0_10px_30px_-12px_rgba(22,20,31,0.3)]">
          Hi, I&apos;m Rex. I build shops.
        </span>
      </div>
      <h1 className="m-0 text-[38px] font-extrabold leading-[1.02] tracking-[-1px]">Your shop, live in 10 minutes</h1>
      <p className="mb-[22px] mt-2.5 leading-[1.5] text-app-ink-soft">Tell Rex what you sell. Sell on your own link, WhatsApp and Instagram. Free to start.</p>
      <PillButton onClick={() => { chooseMethod("phone"); goTo("details"); }}>Start with my phone number</PillButton>
      <PillButton tone="white" size="md" className="mt-2.5" onClick={() => { chooseMethod("email"); goTo("details"); }}>
        Use email instead
      </PillButton>
      <Link href={switchHref} className="mt-1.5 grid min-h-[44px] place-items-center text-[15px] font-bold text-app-ink no-underline">
        I already have a shop
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
            {ROLE_COPY[item].tab}
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
            {mode === "signup" ? "After you sign up, Rex adds this to your store. You don't need to buy stock." : "After you log in, we'll take you straight back to this product."}
          </>
        ) : (
          <>
            <div className="text-[15px] font-bold text-app-ink">We saved where you were</div>
            After you {mode === "signup" ? "sign up" : "log in"}, we&apos;ll take you right back to it.
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
        { value: "phone", label: "Phone" },
        { value: "email", label: "Email" },
      ]}
    />
  );

  const nameField = mode === "signup" && (
    <div className="mb-5">
      <FieldLabel htmlFor="auth-name">Your name</FieldLabel>
      <TextInput id="auth-name" autoComplete="name" placeholder="Adaeze Okafor" value={fullName} onChange={(event) => setFullName(event.target.value)} />
    </div>
  );

  const phoneFields = (
    <>
      <FieldLabel htmlFor="auth-phone">{mode === "signup" ? "Phone number" : "Your phone number"}</FieldLabel>
      <PhoneInput id="auth-phone" country={country} onCountry={setCountry} value={phone} onChange={setPhone} autoFocus={desktop && mode === "login"} />
      <p className="mt-3 flex items-start gap-2 text-[13px] leading-[1.45] text-app-ink-soft">
        <span className="mt-0.5 text-app-success"><Icon name="whatsapp" size={15} /></span>
        {via === "whatsapp" ? "We'll send a 6-digit code on WhatsApp, or by SMS if you don't have WhatsApp." : "We'll send a 6-digit code by SMS."}
      </p>
    </>
  );

  const emailFields = (
    <>
      <FieldLabel htmlFor="auth-email">Email</FieldLabel>
      <TextInput id="auth-email" type="email" autoComplete="email" placeholder="you@yourshop.com" value={email} onChange={(event) => setEmail(event.target.value)} />
      {mode === "login" && emailMode === "password" && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="auth-password">Password</FieldLabel>
            <Link href={`/forgot-password?role=${role}`} className="mb-2 text-[13px] font-bold text-app-ink-soft no-underline hover:text-app-ink">
              Forgot password?
            </Link>
          </div>
          <TextInput id="auth-password" type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
      )}
      {mode === "signup" && <p className="mt-3 text-[13px] leading-[1.45] text-app-ink-soft">We&apos;ll email you a 6-digit code. No password needed.</p>}
    </>
  );

  const usingPassword = mode === "login" && method === "email" && emailMode === "password";
  const primaryLabel = usingPassword
    ? "Log in"
    : method === "phone"
      ? via === "whatsapp" ? "Send me a code on WhatsApp" : "Send me a code by SMS"
      : "Email me a code";

  const secondaryLinks = (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[14px] font-bold text-app-ink-soft">
      {method === "phone" ? (
        <>
          <button type="button" className="hover:text-app-ink" onClick={() => chooseMethod("email")}>Use email instead</button>
          <span className="h-4 w-px bg-app-line" aria-hidden />
          <button type="button" className="hover:text-app-ink" onClick={() => setVia(via === "whatsapp" ? "sms" : "whatsapp")}>
            {via === "whatsapp" ? "Get the code by SMS" : "Use WhatsApp instead"}
          </button>
        </>
      ) : (
        <>
          {!isAdmin && <button type="button" className="hover:text-app-ink" onClick={() => chooseMethod("phone")}>Use my phone instead</button>}
          {mode === "login" && (
            <>
              {!isAdmin && <span className="h-4 w-px bg-app-line" aria-hidden />}
              <button type="button" className="hover:text-app-ink" onClick={() => { resetMessages(); setEmailMode(emailMode === "code" ? "password" : "code"); }}>
                {emailMode === "code" ? "Use my password" : "Email me a code instead"}
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
        <span className="h-px flex-1 bg-app-line" /> or <span className="h-px flex-1 bg-app-line" />
      </div>
      <PillButton tone="white" size="md" className="w-full" onClick={() => void google()} busy={busy === "google"} disabled={Boolean(busy)}>
        <GoogleMark /> Continue with Google
      </PillButton>
    </>
  );

  const terms = mode === "signup" && (
    <p className="mt-5 text-center text-[12px] leading-[1.5] text-app-ink-soft">
      By continuing you agree to the Shopinbos{" "}
      <a href="https://shopinbos.com/terms" className="text-app-ink-soft underline">terms</a> and{" "}
      <a href="https://shopinbos.com/privacy" className="text-app-ink-soft underline">privacy policy</a>, including how we handle your data under the NDPA.
    </p>
  );

  const heading = mode === "signup" ? (desktop ? copy.title : role === "seller" ? "Create your account" : `Create your ${roleLabel(role).toLowerCase()} account`) : isAdmin ? "Admin sign in" : "Welcome back";
  const subheading = mode === "signup"
    ? desktop ? copy.sub : null
    : isAdmin ? "Use your approved admin account." : `Log in to your ${role === "seller" ? "shop" : `${roleLabel(role).toLowerCase()} portal`} with the phone or email you signed up with.`;

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
      {error && <div className="mt-5"><Notice>{error}{/couldn't find an account/i.test(error) && mode === "login" && <> <Link href={switchHref} className="font-bold text-app-danger underline">Create a shop</Link></>}</Notice></div>}
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
            <PillButton type="submit" className="w-full" busy={busy === "send" || busy === "password"}>{mode === "signup" ? "Send code" : primaryLabel}</PillButton>
          </div>
        </>
      )}
    </form>
  );

  const destinationLabel = target?.kind === "phone" ? `${target.via === "whatsapp" ? "WhatsApp" : "SMS"} on ${formatE164(target.phone)}` : target?.email ?? "";

  const codeForm = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submitCode();
      }}
    >
      <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">Enter the code</h1>
      <p className="mb-6 mt-2 text-app-ink-soft">
        We sent it to {destinationLabel}.{mode === "login" ? " No code? Check it's the one you signed up with." : ""}
      </p>
      <CodeInput value={code} onChange={setCode} onComplete={(value) => void submitCode(value)} disabled={busy === "verify"} />
      <div className="mt-4 text-[14px] text-app-ink-soft">
        {countdown.seconds > 0 ? (
          <>Didn&apos;t get it? Resend in 0:{String(countdown.seconds).padStart(2, "0")}</>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2 font-bold">
            <button type="button" className="text-app-ink" onClick={() => target && void deliverCode(target)} disabled={Boolean(busy)}>Resend code</button>
            {target?.kind === "phone" && target.via === "whatsapp" && (
              <button type="button" className="text-app-ink" onClick={() => { setVia("sms"); void deliverCode({ ...target, via: "sms" }); }} disabled={Boolean(busy)}>
                Send it by SMS instead
              </button>
            )}
          </div>
        )}
      </div>
      {error && <div className="mt-5"><Notice>{error}</Notice></div>}
      {desktop ? (
        <PillButton type="submit" tone="accent" size="md" className="mt-8 w-full" busy={busy === "verify"} disabled={code.length !== OTP_LENGTH}>Verify</PillButton>
      ) : (
        <div className="fixed inset-x-0 bottom-0 px-[22px] pb-[22px]">
          <PillButton type="submit" className="w-full" busy={busy === "verify"} disabled={code.length !== OTP_LENGTH}>Verify</PillButton>
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
          {activeScreen === "details" && (
            <Link href={switchHref} className="text-[14px] font-bold text-app-ink no-underline">
              {mode === "signup" ? "Log in" : "Create a shop"}
            </Link>
          )}
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
          <a href="https://shopinbos.com" aria-label="Shopinbos home"><Wordmark className="h-[20px]" /></a>
          <div className="flex items-center gap-5">
            <span className="text-[14px] text-app-ink-soft">{mode === "signup" ? "Already have a shop?" : "New to Shopinbos?"}</span>
            <Link href={switchHref} className="rounded-full bg-app-accent px-4 py-2.5 text-[14px] font-bold text-white no-underline hover:brightness-95">
              {mode === "signup" ? "Log in" : isAdmin ? "Back to app" : "Start your shop"}
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
  return (
    <>
      <div className="mb-6 text-[13px] font-extrabold uppercase tracking-[0.08em]">What happens next</div>
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
  const lines: Record<AuthRole, ReactNode> = {
    seller: "Peggy kept an eye on your shop while you were away. Your orders, chats and payouts are waiting.",
    supplier: "Your products, quote requests and wholesale orders are where you left them.",
    logistics_partner: "Your bookings, coverage and payouts are where you left them.",
    admin: "Approvals, reviews and marketplace operations.",
  };
  return (
    <div className="flex items-center gap-5">
      <Mascot name="peggy-wave" className="h-[120px] w-[120px]" />
      <div>
        <div className="text-[22px] font-extrabold tracking-[-0.3px]">Good to see you again</div>
        <p className="mb-0 mt-2 max-w-[400px] leading-[1.55] text-app-ink-soft">{lines[role]}</p>
      </div>
    </div>
  );
}

const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");

/** Compact "Stuck? Talk to us" for phone layouts and the password screens; opens the same support panel. */
export function StuckLink({ className = "" }: { className?: string }) {
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
        <span className="min-w-0 flex-1"><span className="font-extrabold">Stuck? Talk to us.</span> A real person replies, in English or Pidgin.</span>
        <Icon name="arrow" size={16} />
      </button>
      <SupportRequestPanel open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

// "Stuck?" opens the support panel (a real ticket with the team), with email/WhatsApp kept as a fallback link.
function HelpCard() {
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
          <span className="block font-extrabold">Stuck? Talk to us.</span>
          A real person replies, in English or Pidgin.
        </span>
        <Icon name="arrow" size={18} />
      </button>
      <p className="m-0 mt-3 px-2 text-[13px] text-app-ink-soft">
        or email{" "}
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
