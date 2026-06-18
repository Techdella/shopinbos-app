"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MascotFigure } from "@/components/brand/MascotFigure";
import { Icon, type IconName } from "@/components/ui/Icon";
import { getPublicEnv, hasSupabaseBrowserEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { roleDestination, roleLabel, type AuthRole, mascotPaths } from "@/lib/brand";
import { portalLoginPath, portalOnboardingPath, portalSignupPath } from "@/lib/portal-routes";
import intentRouting from "@/lib/intent-routing";

interface AuthExperienceProps {
  role: AuthRole;
  mode: "login" | "signup";
}

interface RoleProfile {
  icon: IconName;
  label: string;
  short: string;
  headline: { login: string; signup: string };
  subtitle: { login: string; signup: string };
  setup: string[];
  aiMemory: string[];
  accent: string;
  businessLabel: string;
  businessPlaceholder: string;
}

const { extractIntentParams, getContinuationPath, sanitizeNextPath } = intentRouting;

const roleProfiles: Record<AuthRole, RoleProfile> = {
  seller: {
    icon: "store",
    label: "Seller",
    short: "Build and run your storefront.",
    headline: {
      login: "Welcome back to your store.",
      signup: "Start building your online store.",
    },
    subtitle: {
      login: "Sign in to pick up your products, orders, payments, and store setup.",
      signup: "Create your account, then Rex will help shape your store step by step.",
    },
    setup: ["Products", "Orders", "Payments", "Delivery"],
    aiMemory: ["Your shop name", "What you sell", "How it should feel", "What to launch first"],
    accent: "var(--color-mint)",
    businessLabel: "Store name",
    businessPlaceholder: "e.g. Chioma's Collections",
  },
  supplier: {
    icon: "box",
    label: "Supplier",
    short: "List inventory for sellers.",
    headline: {
      login: "Welcome back to your supplier portal.",
      signup: "Join the marketplace as a supplier.",
    },
    subtitle: {
      login: "Sign in to manage your products, quotes, orders, and payouts.",
      signup: "Create your account, then Rex will help you get ready for buyers.",
    },
    setup: ["Products", "Quotes", "Orders", "Payouts"],
    aiMemory: ["Your business name", "What you supply", "Who buys from you", "What to finish first"],
    accent: "var(--color-amber)",
    businessLabel: "Business name",
    businessPlaceholder: "e.g. Lagos Beauty Wholesale",
  },
  logistics_partner: {
    icon: "truck",
    label: "Logistics",
    short: "Publish coverage and delivery services.",
    headline: {
      login: "Welcome back to your logistics dashboard.",
      signup: "Partner with us for logistics.",
    },
    subtitle: {
      login: "Sign in to manage your routes, coverage, pricing, and bookings.",
      signup: "Create your account, then Rex will help you set up your delivery profile.",
    },
    setup: ["Coverage", "Bookings", "Pricing", "Payouts"],
    aiMemory: ["Where you deliver", "What services you offer", "Your starting prices", "What to finish first"],
    accent: "var(--color-plum)",
    businessLabel: "Company name",
    businessPlaceholder: "e.g. SwiftLane Logistics",
  },
  admin: {
    icon: "lock",
    label: "Admin",
    short: "Review marketplace operations.",
    headline: {
      login: "Welcome back to the admin control panel.",
      signup: "Admin access is invite-only.",
    },
    subtitle: {
      login: "Sign in with an approved admin account.",
      signup: "Admin accounts are created by trusted operations only.",
    },
    setup: ["Approvals", "Reviews", "Categories", "Settings"],
    aiMemory: ["What needs review", "Who is waiting", "What changed", "What to handle first"],
    accent: "var(--color-navy)",
    businessLabel: "Workspace",
    businessPlaceholder: "Shopinbos Admin",
  },
};

function buildNextUrl(role: AuthRole, mode: "login" | "signup", searchParams: URLSearchParams) {
  const explicitNext = sanitizeNextPath(searchParams.get("next") ?? searchParams.get("redirect"), getPublicEnv().appUrl);
  if (explicitNext) {
    return explicitNext;
  }

  if (mode === "login" || role === "admin") {
    return getContinuationPath({
      role,
      ...extractIntentParams(searchParams),
    });
  }

  if (role === "supplier") {
    return portalOnboardingPath("supplier");
  }
  if (role === "logistics_partner") {
    return portalOnboardingPath("logistics_partner");
  }

  const base = new URL("/onboarding", getPublicEnv().appUrl);
  base.searchParams.set("role", role);
  const intentParams = extractIntentParams(searchParams);
  for (const [key, value] of Object.entries(intentParams)) {
    if (value) {
      base.searchParams.set(key, value);
    }
  }

  return `${base.pathname}${base.search}`;
}

function buildAuthCallbackUrl(role: AuthRole, nextUrl: string) {
  const callbackUrl = new URL("/auth/callback", getPublicEnv().appUrl);
  callbackUrl.searchParams.set("role", role);
  callbackUrl.searchParams.set("next", nextUrl);
  return callbackUrl.toString();
}

async function syncSessionToApp(
  token: string,
  payload: { role: AuthRole; fullName?: string; businessName?: string; phone?: string; source?: "signup" },
) {
  const response = await fetch("/api/auth/sync-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { data?: { role?: AuthRole } } | null;
  return body?.data?.role ?? null;
}

async function navigateTo(url: string) {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const maxAttempts = 5;
    for (let i = 0; i < maxAttempts; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  window.location.href = url;
}

export function AuthExperience({ role, mode }: AuthExperienceProps) {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loginMethod, setLoginMethod] = useState<"password" | "code">("password");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [signupAwaitingConfirmation, setSignupAwaitingConfirmation] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  function startResendCooldown() {
    setResendCooldown(60);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendCooldown((seconds) => {
        if (seconds <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  }

  const previewMode = !hasSupabaseBrowserEnv();
  const nextUrl = useMemo(() => buildNextUrl(role, mode, new URLSearchParams(searchParams.toString())), [mode, role, searchParams]);
  const roleText = roleLabel(role);
  const profile = roleProfiles[role];
  const intent = searchParams.get("intent");
  const productSlug = searchParams.get("productSlug");
  const supplierSlug = searchParams.get("supplierSlug");
  const logisticsSlug = searchParams.get("logisticsSlug");
  const hasQueuedIntent = Boolean(intent || productSlug || supplierSlug || logisticsSlug);

  const sideMascot =
    mode === "login"
      ? { src: mascotPaths.peggy[2], alt: "Peggy mascot" }
      : { src: mascotPaths.rex[2], alt: "Rex mascot" };
  const mobileMascot =
    mode === "login"
      ? { src: mascotPaths.peggy[1], alt: "Peggy mascot" }
      : { src: mascotPaths.rex[1], alt: "Rex mascot" };

  const inputClass =
    "w-full rounded-[14px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[14px] outline-none transition focus:border-[var(--color-mint)]";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      if (previewMode) {
        setError("Sign in is not available in this preview yet. Please try the live Shopinbos app.");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError("We could not open sign in right now. Please try again.");
        return;
      }

      if (mode === "login" && loginMethod === "password") {
        if (!email || !password) {
          setError("Enter your email and password.");
          return;
        }

        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
          return;
        }

        const syncedRole = data.session?.access_token
          ? await syncSessionToApp(data.session.access_token, { role })
          : null;
        if (syncedRole && syncedRole !== role) {
          setError(`This account is registered as ${roleLabel(syncedRole)}. Use the ${roleLabel(syncedRole)} login route instead.`);
          return;
        }
        const loginDest = nextUrl || roleDestination(role);
        navigateTo(loginDest);
        return;
      }

      if (mode === "login" && loginMethod === "code" && otpStep === "email") {
        if (!email) {
          setError("Please enter your email.");
          return;
        }
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (otpError) {
          setError(otpError.message);
          return;
        }
        setOtpStep("code");
        setMessage(`We sent a 6-digit sign-in code to ${email}.`);
        startResendCooldown();
        return;
      }

      if (mode === "login" && loginMethod === "code" && otpStep === "code") {
        if (!otpCode || otpCode.length < 6) {
          setError("Enter the 6-digit code from your email.");
          return;
        }
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token: otpCode,
          type: "email",
        });
        if (verifyError) {
          setError(verifyError.message);
          return;
        }
        const syncedRole = data.session?.access_token
          ? await syncSessionToApp(data.session.access_token, { role })
          : null;
        if (syncedRole && syncedRole !== role) {
          setError(`This account is registered as ${roleLabel(syncedRole)}. Use the ${roleLabel(syncedRole)} login route instead.`);
          return;
        }
        const loginDest = nextUrl || roleDestination(role);
        navigateTo(loginDest);
        return;
      }

      if (!email || !password) {
        setError("Email and password are required.");
        return;
      }

      if (signupAwaitingConfirmation) {
        if (!otpCode || otpCode.length < 6) {
          setError("Enter the confirmation code from your email.");
          return;
        }

        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token: otpCode,
          type: "signup",
        });
        if (verifyError) {
          setError(verifyError.message);
          return;
        }

        const syncedRole = data.session?.access_token
          ? await syncSessionToApp(data.session.access_token, {
              role,
              fullName,
              businessName,
              phone,
              source: "signup",
            })
          : null;
        if (syncedRole && syncedRole !== role) {
          setError(`This email is already registered as ${roleLabel(syncedRole)}. Use the ${roleLabel(syncedRole)} login route instead.`);
          return;
        }

        setMessage("Email confirmed. Taking you to the next step.");
        navigateTo(nextUrl);
        return;
      }

      const emailRedirectTo = buildAuthCallbackUrl(role, nextUrl);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            role,
            full_name: fullName,
            business_name: businessName,
            phone,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.session?.access_token) {
        const syncedRole = await syncSessionToApp(data.session.access_token, {
          role,
          fullName,
          businessName,
          phone,
          source: "signup",
        });
        if (syncedRole && syncedRole !== role) {
          setError(`This email is already registered as ${roleLabel(syncedRole)}. Use the ${roleLabel(syncedRole)} login route instead.`);
          return;
        }
        setMessage("Account created. Rex is preparing your onboarding memory now.");
        navigateTo(nextUrl);
        return;
      }

      setSignupAwaitingConfirmation(true);
      setOtpCode("");
      setMessage("Check your email to confirm it, then sign in to continue onboarding.");
      startResendCooldown();
    });
  }

  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-navy)]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_520px]">
        <section className="flex items-center justify-center px-6 py-8 sm:px-10 lg:px-14">
          <div className="w-full max-w-[520px]">
            <BrandLogo theme="dark" priority className="mb-7 w-[180px]" />

            <div className="relative mb-7 overflow-hidden rounded-[24px] border lg:hidden" style={{ borderColor: "rgb(14 42 56 / 0.08)", background: "linear-gradient(180deg, rgb(230 247 243 / 0.88), rgb(244 241 234 / 1))" }}>
              <div className="relative px-5 pt-5">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-teal-deep)]">
                {mode === "login" ? "Welcome back" : "Let's begin"}
                </div>
                <h2 className="mt-3 font-display text-[28px] font-semibold leading-none text-[var(--color-navy)]">
                  {mode === "login" ? "Your portal is ready when you are." : "Rex will help with the next step."}
                </h2>
                <p className="mt-3 text-[14px] leading-6 text-[var(--color-muted)]">
                  {mode === "login" ? "Sign in and we will take you where you were headed." : "Answer a few simple questions and keep moving."}
                </p>
              </div>
              <div className="relative flex justify-center px-2 pt-2">
                <MascotFigure
                  src={mobileMascot.src}
                  alt={mobileMascot.alt}
                  priority
                  className="w-[92%] max-w-[390px] drop-shadow-[0_24px_44px_rgb(14_42_56_/_0.16)]"
                />
              </div>
            </div>

            <div className="mb-7">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-teal-deep)]">
                {mode === "login" ? `${roleText} sign in` : `${roleText} sign up`}
              </p>
              <h1 className="m-0 font-display text-[36px] font-semibold leading-tight text-[var(--color-navy)]">
                {profile.headline[mode]}
              </h1>
              <p className="mt-3 text-[15px] leading-7 text-[var(--color-muted)]">{profile.subtitle[mode]}</p>
            </div>

            {hasQueuedIntent && (
              <div
                className="mb-6 rounded-[18px] border px-4 py-3"
                style={{
                  background: "rgb(115 216 200 / 0.08)",
                  borderColor: "rgb(115 216 200 / 0.3)",
                }}
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-teal-deep)]">
                  After sign in
                </div>
                <p className="mb-0 mt-2 text-[14px] leading-6 text-[var(--color-navy)]">
                  We will take you right back to what you were doing.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" suppressHydrationWarning>
              {mode === "signup" && !signupAwaitingConfirmation && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block" suppressHydrationWarning>
                      <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Full name</span>
                      <input
                        autoComplete="name"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="e.g. Chioma Eze"
                        className={inputClass}
                        suppressHydrationWarning
                      />
                    </label>
                    <label className="block" suppressHydrationWarning>
                      <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Phone number</span>
                      <input
                        autoComplete="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="+234 801 234 5678"
                        className={inputClass}
                      />
                    </label>
                  </div>

                  <label className="block" suppressHydrationWarning>
                    <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">
                      {profile.businessLabel} <span className="font-normal opacity-60">(optional)</span>
                    </span>
                    <input
                      autoComplete="organization"
                      value={businessName}
                      onChange={(event) => setBusinessName(event.target.value)}
                      placeholder={profile.businessPlaceholder}
                      className={inputClass}
                    />
                  </label>
                </>
              )}

              {mode === "login" && loginMethod === "password" && (
                <>
                  <label className="block" suppressHydrationWarning>
                    <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Email</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@shop.com"
                      className={inputClass}
                      suppressHydrationWarning
                    />
                  </label>
                  <label className="block" suppressHydrationWarning>
                    <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Password</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Your password"
                      className={inputClass}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod("code");
                      setOtpStep("email");
                      setOtpCode("");
                      setError(null);
                      setMessage(null);
                    }}
                    className="w-fit text-[13px] font-semibold text-[var(--color-teal-deep)]"
                  >
                    Email me a sign-in code instead
                  </button>
                </>
              )}

              {mode === "login" && loginMethod === "code" && otpStep === "email" && (
                <>
                  <label className="block" suppressHydrationWarning>
                    <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Email</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@shop.com"
                      className={inputClass}
                      suppressHydrationWarning
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod("password");
                      setOtpStep("email");
                      setOtpCode("");
                      setError(null);
                      setMessage(null);
                    }}
                    className="w-fit text-[13px] font-semibold text-[var(--color-teal-deep)]"
                  >
                    Use my password instead
                  </button>
                </>
              )}

              {mode === "login" && loginMethod === "code" && otpStep === "code" && (
                <>
                  <div
                    className="rounded-[16px] border px-4 py-3 text-[13px] leading-6"
                    style={{
                      background: "rgb(115 216 200 / 0.08)",
                      borderColor: "rgb(115 216 200 / 0.3)",
                      color: "var(--color-teal-deep)",
                    }}
                  >
                    We sent a 6-digit code to <strong>{email}</strong>. Check your inbox.
                  </div>
                  <label className="block" suppressHydrationWarning>
                    <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Sign-in code</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="w-full rounded-[14px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-center font-mono text-[22px] tracking-[0.22em] outline-none focus:border-[var(--color-mint)]"
                      suppressHydrationWarning
                    />
                  </label>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => { setOtpStep("email"); setOtpCode(""); setMessage(null); setError(null); }}
                      className="text-[13px] text-[var(--color-muted)] underline"
                    >
                      Use a different email
                    </button>
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || isPending}
                      onClick={async () => {
                        setError(null);
                        const supabase = getSupabaseBrowserClient();
                        if (!supabase) return;
                        const { error: resendError } = await supabase.auth.signInWithOtp({
                          email,
                          options: { shouldCreateUser: false },
                        });
                        if (resendError) {
                          setError(resendError.message);
                          return;
                        }
                        setMessage("New code sent. Check your inbox.");
                        startResendCooldown();
                      }}
                      className="text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ color: resendCooldown > 0 ? "var(--color-muted)" : "var(--color-teal-deep)" }}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                    </button>
                  </div>
                </>
              )}

              {mode === "signup" && !signupAwaitingConfirmation && (
                <>
                  <label className="block" suppressHydrationWarning>
                    <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Email</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@shop.com"
                      className={inputClass}
                      suppressHydrationWarning
                    />
                  </label>
                  <label className="block" suppressHydrationWarning>
                    <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Password</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Minimum 8 characters"
                      className={inputClass}
                    />
                  </label>
                </>
              )}

              {mode === "signup" && signupAwaitingConfirmation && (
                <>
                  <div
                    className="rounded-[16px] border px-4 py-3 text-[13px] leading-6"
                    style={{
                      background: "rgb(115 216 200 / 0.08)",
                      borderColor: "rgb(115 216 200 / 0.3)",
                      color: "var(--color-teal-deep)",
                    }}
                  >
                    We sent a confirmation email to <strong>{email}</strong>. Enter the code below, or open the confirmation link from the same email.
                  </div>
                  <label className="block" suppressHydrationWarning>
                    <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Confirmation code</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="w-full rounded-[14px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-center font-mono text-[22px] tracking-[0.22em] outline-none focus:border-[var(--color-mint)]"
                      suppressHydrationWarning
                    />
                  </label>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setSignupAwaitingConfirmation(false);
                        setOtpCode("");
                        setMessage(null);
                        setError(null);
                      }}
                      className="text-[13px] text-[var(--color-muted)] underline"
                    >
                      Edit account details
                    </button>
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || isPending}
                      onClick={async () => {
                        setError(null);
                        const supabase = getSupabaseBrowserClient();
                        if (!supabase) return;
                        const { error: resendError } = await supabase.auth.resend({
                          type: "signup",
                          email,
                          options: { emailRedirectTo: buildAuthCallbackUrl(role, nextUrl) },
                        });
                        if (resendError) {
                          setError(resendError.message);
                          return;
                        }
                        setMessage("New confirmation email sent. Check your inbox.");
                        startResendCooldown();
                      }}
                      className="text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ color: resendCooldown > 0 ? "var(--color-muted)" : "var(--color-teal-deep)" }}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
                    </button>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-full border-0 px-5 py-3 text-[14px] font-semibold text-[var(--color-navy)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: "var(--color-mint)" }}
              >
                {isPending ? (
                  "Please wait..."
                ) : mode === "login" ? (
                  loginMethod === "password" ? (
                    <>
                      <Icon name="lock" size={15} />
                      Sign in
                    </>
                  ) : otpStep === "email" ? (
                    <>
                      <Icon name="send" size={15} />
                      Send sign-in code
                    </>
                  ) : (
                    <>
                      <Icon name="lock" size={15} />
                      Sign in with code
                    </>
                  )
                ) : signupAwaitingConfirmation ? (
                  <>
                    <Icon name="lock" size={15} />
                    Confirm email
                  </>
                ) : (
                  <>
                    <Icon name="sparkle" size={15} />
                    Create account and meet Rex
                  </>
                )}
              </button>
            </form>

            {(error || message) && (
              <div
                className="mt-4 rounded-[16px] border px-4 py-3 text-[13px] leading-6"
                style={{
                  background: error ? "rgb(232 106 79 / 0.08)" : "rgb(115 216 200 / 0.08)",
                  borderColor: error ? "rgb(232 106 79 / 0.26)" : "rgb(115 216 200 / 0.26)",
                  color: error ? "var(--color-coral)" : "var(--color-teal-deep)",
                }}
              >
                {error ?? message}
              </div>
            )}

            {role !== "admin" && (
              <div className="mt-6 text-[14px] text-[var(--color-muted)]">
                {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
                <Link
                  href={mode === "login" ? signupHrefForRole(role) : loginHrefForRole(role)}
                  className="font-semibold text-[var(--color-teal-deep)] no-underline"
                >
                  {mode === "login" ? "Register here" : "Sign in here"}
                </Link>
              </div>
            )}
          </div>
        </section>

        <aside
          className="relative hidden overflow-hidden lg:flex lg:flex-col"
          style={{
            background: "linear-gradient(180deg, rgb(230 247 243 / 0.9) 0%, rgb(244 241 234 / 1) 54%, rgb(255 255 255 / 0.96) 100%)",
          }}
        >
          <div className="relative px-10 pt-12">
            <div className="max-w-[390px]">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-teal-deep)]">
                {mode === "login" ? "Good to see you" : "We will keep it simple"}
              </div>
              <h2 className="mt-4 font-display text-[42px] font-semibold leading-none text-[var(--color-navy)]">
                {mode === "login" ? `${profile.label} portal, right this way.` : "A few answers, then Rex takes it from there."}
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-[var(--color-muted)]">
                {mode === "login"
                  ? "Enter your email, use the code we send, and you will land where you were headed."
                  : "Tell us the basics now. You can polish the details once you are inside."}
              </p>
            </div>

            <div className="mt-7 grid gap-3">
              {profile.aiMemory.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-[16px] border bg-white px-4 py-3" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: "rgb(115 216 200 / 0.16)", color: "var(--color-teal-deep)" }}>
                    <Icon name="check" size={15} color="currentColor" />
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--color-navy)]">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mt-auto flex flex-1 items-end justify-center overflow-hidden px-0 pb-0">
            <div className="absolute inset-x-0 bottom-0 h-[190px] bg-[linear-gradient(180deg,_transparent_0%,_rgb(244_241_234_/_0.34)_40%,_rgb(244_241_234_/_0.86)_100%)]" />
            <div className="absolute bottom-10 left-10 right-10 rounded-[28px] border bg-[rgb(14_42_56_/_0.92)] px-5 py-4 text-white shadow-[0_24px_60px_rgb(14_42_56_/_0.18)]" style={{ borderColor: "rgb(115 216 200 / 0.22)" }}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[14px]" style={{ background: "rgb(115 216 200 / 0.14)", color: "var(--color-mint)" }}>
                  <Icon name={profile.icon} size={19} color="currentColor" />
                </span>
                <div>
                  <div className="text-[13px] font-semibold">{roleText} portal</div>
                  <div className="text-[12px]" style={{ color: "rgb(250 247 241 / 0.68)" }}>
                    {profile.setup.join(", ")}
                  </div>
                </div>
              </div>
            </div>
            <MascotFigure
              src={sideMascot.src}
              alt={sideMascot.alt}
              priority
              className="relative z-10 w-[96%] max-w-[760px] drop-shadow-[0_42px_74px_rgb(14_42_56_/_0.2)]"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function signupHrefForRole(role: AuthRole) {
  return portalSignupPath(role);
}

function loginHrefForRole(role: AuthRole) {
  return portalLoginPath(role);
}
