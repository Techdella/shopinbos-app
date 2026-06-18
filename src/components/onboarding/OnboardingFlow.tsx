"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { MascotFigure } from "@/components/brand/MascotFigure";
import { Icon, type IconName } from "@/components/ui/Icon";
import { roleDestination, roleLabel, type AuthRole } from "@/lib/brand";
import intentRouting from "@/lib/intent-routing";
import type { StoreOnboardingMemory } from "@/lib/onboarding-memory";
import { westAfricaCountries, deliveryScopeOptions, type DeliveryScope } from "@/lib/data/west-africa";

type OnboardingRole = Exclude<AuthRole, "admin">;
type BuildPath = "rex" | "template" | "migrate";
type RexBuildStatus = "idle" | "building" | "ready" | "error";

interface InitialUser {
  name: string | null;
  city: string | null;
  country: string | null;
}

interface RexStoreConfig {
  name: string;
  slug: string;
  tagline: string;
  heroHeadline: string;
  heroSubline: string;
  heroCtaText: string;
  palette: {
    heroBg: string;
    heroText: string;
    accent: string;
    ctaBg: string;
    ctaText: string;
    paperBg: string;
  };
  fontStyle: "fraunces" | "grotesk";
  navLinks: string[];
  products: Array<{ name: string; subtitle: string; price: string; color: string; imageUrl?: string }>;
  changed: string[];
}

interface LogisticsCoverageZone {
  name: string;
  country: string;
  region: string;
  scope: DeliveryScope;
  service: string;
  basePrice: number;
  active: boolean;
  demandSignal?: string;
  polygon?: Array<[number, number]>;
}

interface OnboardingFlowProps {
  initialUser?: InitialUser | null;
  forcedRole?: OnboardingRole;
}

const ONBOARDING_CHAT_MEMORY_KEY = "shopinbos-onboarding-chat";
const sellerStepsTotal = 10;

const sellerTemplates = [
  {
    id: "heritage",
    name: "Heritage",
    meta: "Fashion - minimal - 7 pages",
    palette: ["#f2c8b4", "#d4a574", "#6b4a2c", "#faf7f1"],
    headline: "Hand-stitched in Kano. Made to walk.",
    accent: "#e86a4f",
  },
  {
    id: "glow",
    name: "Glow House",
    meta: "Beauty - soft - 6 pages",
    palette: ["#f7cfc7", "#fff4ea", "#b14a8a", "#2b1815"],
    headline: "Skin that speaks glow.",
    accent: "#b14a8a",
  },
  {
    id: "market",
    name: "Market Bold",
    meta: "Food - bold - 5 pages",
    palette: ["#d96808", "#111111", "#f4eadc", "#f2a93b"],
    headline: "Good food. Delivered hot.",
    accent: "#d96808",
  },
  {
    id: "electro",
    name: "Electro",
    meta: "Electronics - sharp - 6 pages",
    palette: ["#4036a6", "#1c2370", "#f4f7ff", "#5ecdbf"],
    headline: "Upgrade your world.",
    accent: "#4036a6",
  },
];

const categoryOptions = [
  "Fashion & clothing",
  "Beauty & skincare",
  "Food & groceries",
  "Electronics & gadgets",
  "Home & living",
  "Kids & baby",
  "Health & wellness",
  "Other",
];

const languageOptions = ["English", "Pidgin", "Yoruba", "Hausa", "Igbo", "French", "Swahili"];

const DEFAULT_REX_STORE_CONFIG: RexStoreConfig = {
  name: "Your Store",
  slug: "your-store",
  tagline: "Quality products, delivered.",
  heroHeadline: "Tell Rex what you sell.",
  heroSubline: "He will build your shop in real time.",
  heroCtaText: "Shop now",
  palette: {
    heroBg: "#0E2A38",
    heroText: "#FAF7F1",
    accent: "#73D8C8",
    ctaBg: "#73D8C8",
    ctaText: "#0E2A38",
    paperBg: "#FAF7F1",
  },
  fontStyle: "fraunces",
  navLinks: ["Shop", "Collections", "About", "Contact"],
  products: [
    { name: "Starter Product", subtitle: "Ready to edit", price: "NGN 0", color: "#2E7E78" },
    { name: "Second Product", subtitle: "Ready to edit", price: "NGN 0", color: "#F2A93B" },
    { name: "Third Product", subtitle: "Ready to edit", price: "NGN 0", color: "#6B4F8A" },
  ],
  changed: [],
};

function getRoleFromSearch(searchParams: URLSearchParams): OnboardingRole {
  const role = searchParams.get("role");
  if (role === "supplier" || role === "logistics_partner") return role;
  return "seller";
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "your-store";
}

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "";
}

function selectedTemplate(templateId: string) {
  return sellerTemplates.find((template) => template.id === templateId) ?? sellerTemplates[0];
}

function StepHeader({
  step,
  total,
  label,
  time,
  onSave,
}: {
  step: number;
  total: number;
  label: string;
  time?: string;
  onSave: () => void;
}) {
  return (
    <div className="onb-step-header">
      <BrandLogo className="w-[132px]" priority />
      <div className="onb-progress">
        <div className="onb-progress-track">
          <div className="onb-progress-fill" style={{ width: `${(step / total) * 100}%` }} />
        </div>
        <span>
          Step {step} of {total} - {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {time && <span className="hidden text-[11.5px] font-semibold text-[var(--ink-500)] sm:inline">~{time}</span>}
        <button type="button" onClick={onSave} className="btn btn-ghost btn-sm">
          Save & exit
        </button>
      </div>
    </div>
  );
}

function SellerPillSteps({ step }: { step: number }) {
  const items = [
    { label: "Meet Rex", max: 1 },
    { label: "Set up shop", max: 3 },
    { label: "Build", max: 5 },
    { label: "Connect", max: 8 },
    { label: "Go live", max: 10 },
  ];

  return (
    <div className="steps hidden lg:flex">
      {items.map((item, index) => {
        const active = step <= item.max && (index === 0 || step > items[index - 1].max);
        const done = step > item.max;
        return (
          <div key={item.label} className={`s ${active ? "on" : ""} ${done ? "done" : ""}`}>
            <span className="n">{done ? <Icon name="check" size={11} /> : index + 1}</span>
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="inp"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{ fontFamily: mono ? "var(--font-mono)" : undefined }}
      />
    </label>
  );
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-[12.5px] leading-5 text-[var(--ink-700)]">
          <Icon name="check" size={14} color="var(--teal-700)" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function StorePhonePreview({
  template,
  storeName,
  builtStore,
}: {
  template: (typeof sellerTemplates)[number];
  storeName: string;
  builtStore?: RexStoreConfig | null;
}) {
  const name = builtStore?.name || storeName || "sahel sole";
  const headline = builtStore?.heroHeadline || template.headline;
  const heroBg = builtStore?.palette.heroBg || template.palette[0];
  const heroText = builtStore?.palette.heroText || "#3a2614";
  const accent = builtStore?.palette.accent || template.accent;
  const products = builtStore?.products?.length ? builtStore.products : DEFAULT_REX_STORE_CONFIG.products;

  return (
    <div className="phone-mini">
      <div className="screen">
        <div className="flex h-6 items-center justify-between px-3 text-[10px] font-semibold" style={{ background: heroBg, color: heroText }}>
          <span>9:41</span>
          <span>oo o</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ background: heroBg, color: heroText }}>
          <Icon name="list" size={16} color="currentColor" />
          <div className="font-display text-[15px] font-semibold italic">{name.toLowerCase()}</div>
          <Icon name="bag" size={16} color="currentColor" />
        </div>
        <div className="px-5 py-7" style={{ background: `linear-gradient(180deg, ${heroBg}, ${accent})`, color: heroText }}>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] opacity-80">{template.meta.split(" - ")[0]} - Shopinbos</div>
          <div className="font-display text-[30px] leading-none tracking-normal">{headline.split("\n")[0]}</div>
          <button type="button" className="mt-5 rounded-full bg-white px-4 py-2 text-[11px] font-semibold text-[var(--ink-900)]">
            Shop now
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 bg-[var(--paper)] p-4">
          {products.slice(0, 4).map((product, index) => (
            <div key={`${product.name}-${index}`} className="rounded-[12px] border border-[var(--ink-100)] bg-white p-2">
              <div className="mb-2 h-16 rounded-[9px]" style={{ background: product.color }} />
              <div className="truncate text-[11px] font-semibold text-[var(--ink-900)]">{product.name}</div>
              <div className="mt-0.5 truncate text-[9.5px] text-[var(--ink-500)]">{product.price}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  active,
  onClick,
}: {
  template: (typeof sellerTemplates)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card text-left transition-transform hover:-translate-y-0.5"
      style={{ padding: 0, overflow: "hidden", borderColor: active ? "var(--teal-400)" : "var(--ink-100)", boxShadow: active ? "var(--shd-pop)" : "var(--shd-xs)" }}
    >
      <div className="grid h-36 grid-cols-2 gap-1 p-3" style={{ background: template.palette[3] }}>
        {template.palette.map((color) => (
          <div key={color} className="rounded-[8px]" style={{ background: color }} />
        ))}
      </div>
      <div className="p-4">
        <div className="font-display text-[22px] font-normal leading-tight text-[var(--ink-900)]">{template.name}</div>
        <div className="mt-1 text-[12px] text-[var(--ink-500)]">{template.meta}</div>
        {active && (
          <span className="badge badge-mint mt-3">
            <span className="badge-dot" />
            Selected
          </span>
        )}
      </div>
    </button>
  );
}

function RoleTopBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <BrandLogo className="w-[132px]" />
      <div className="text-[13px] font-semibold text-[var(--ink-500)]">
        Step {step} of {total}
      </div>
    </div>
  );
}

export function OnboardingFlow({ initialUser, forcedRole }: OnboardingFlowProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { extractIntentParams, getContinuationPath } = intentRouting;
  const role = useMemo(
    () => forcedRole ?? getRoleFromSearch(new URLSearchParams(searchParams.toString())),
    [forcedRole, searchParams],
  );

  const [step, setStep] = useState(1);
  const [preferredName, setPreferredName] = useState(initialUser?.name ?? "");
  const [city, setCity] = useState(initialUser?.city ?? "Lagos");
  const [country, setCountry] = useState(initialUser?.country ?? "Nigeria");
  const [businessDescription, setBusinessDescription] = useState(
    "I make handmade leather sandals in Kano, using locally tanned hides. Mostly women's slip-ons in earth tones.",
  );
  const [storeName, setStoreName] = useState("");
  const [category, setCategory] = useState("Fashion & clothing");
  const [selectedCurrency, setSelectedCurrency] = useState("NGN Naira");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["English", "Pidgin"]);
  const [buildPath, setBuildPath] = useState<BuildPath>("rex");
  const [templateId, setTemplateId] = useState("heritage");
  const [documentNotes, setDocumentNotes] = useState("");
  const [documentNames, setDocumentNames] = useState<string[]>([]);
  const [rexBuildStatus, setRexBuildStatus] = useState<RexBuildStatus>("idle");
  const [rexBuildMessage, setRexBuildMessage] = useState("");
  const [rexBuildStore, setRexBuildStore] = useState<RexStoreConfig | null>(null);
  const [rexReply, setRexReply] = useState("");
  const [rexTweak, setRexTweak] = useState("");
  const [isRexThinking, setIsRexThinking] = useState(false);
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const storeCreatedRef = useRef(false);

  const sellerTotal = sellerStepsTotal;
  const roleTotal = 5;
  const total = role === "seller" ? sellerTotal : roleTotal;
  const roleText = roleLabel(role);
  const template = selectedTemplate(templateId);
  const resolvedStoreName = storeName.trim() || (role === "logistics_partner" ? "" : "Sahel Sole");
  const storeSlug = slugify(resolvedStoreName);
  const first = firstName(preferredName) || (role === "seller" ? "Aisha" : "Bukola");
  const intentParams = extractIntentParams(searchParams);

  const sellerBaseSteps = ["Meet Rex", "Name your store", "What you sell", "Build path"];
  const sellerSteps = [
    ...sellerBaseSteps,
    buildPath === "rex" ? "Build with Rex" : "Choose template",
    "Add products",
    "Set up payments",
    "Pick logistics",
    "Domain",
    "Launch",
  ];

  useEffect(() => {
    const saved = window.localStorage.getItem(ONBOARDING_CHAT_MEMORY_KEY);
    if (!saved) return;
    try {
      const memory = JSON.parse(saved) as Partial<StoreOnboardingMemory> & {
        step?: number;
        buildPath?: BuildPath;
        rexBuildStatus?: RexBuildStatus;
        rexBuildMessage?: string;
        rexBuildStore?: RexStoreConfig | null;
      };
      if (memory.role && memory.role !== role) return;
      if (typeof memory.step === "number") setStep(Math.min(memory.step, role === "seller" ? sellerStepsTotal : roleTotal));
      if (typeof memory.preferredName === "string") setPreferredName(memory.preferredName);
      if (typeof memory.city === "string") setCity(memory.city);
      if (typeof memory.category === "string") setCategory(memory.category);
      if (typeof memory.businessDescription === "string") setBusinessDescription(memory.businessDescription);
      if (typeof memory.storeName === "string") setStoreName(memory.storeName);
      if (typeof memory.templateId === "string") setTemplateId(memory.templateId);
      if (memory.buildPath === "rex" || memory.buildPath === "template" || memory.buildPath === "migrate") setBuildPath(memory.buildPath);
      if (Array.isArray(memory.documentNames)) setDocumentNames(memory.documentNames);
      if (typeof memory.documentNotes === "string") setDocumentNotes(memory.documentNotes);
      if (memory.rexBuildStatus) setRexBuildStatus(memory.rexBuildStatus);
      if (typeof memory.rexBuildMessage === "string") setRexBuildMessage(memory.rexBuildMessage);
      if (memory.rexBuildStore) setRexBuildStore(memory.rexBuildStore);
    } catch {
      // Ignore stale local onboarding state.
    }
  }, [role, roleTotal]);

  function buildOnboardingMemory(patch: Partial<StoreOnboardingMemory> = {}): StoreOnboardingMemory {
    return {
      version: 1,
      role,
      step,
      preferredName,
      city,
      category,
      businessDescription,
      storeName: resolvedStoreName,
      templateId,
      destination: "builder",
      buildPath: buildPath === "migrate" ? "template" : buildPath,
      documentNotes,
      documentNames,
      completed: step >= total,
      updatedAt: new Date().toISOString(),
      ...patch,
    };
  }

  useEffect(() => {
    const memory = {
      ...buildOnboardingMemory(),
      rexBuildStatus,
      rexBuildMessage,
      rexBuildStore,
    };
    window.localStorage.setItem(ONBOARDING_CHAT_MEMORY_KEY, JSON.stringify(memory));
  }, [role, step, preferredName, city, category, businessDescription, storeName, templateId, buildPath, documentNotes, documentNames, rexBuildStatus, rexBuildMessage, rexBuildStore]);

  async function readApiError(response: Response, fallback: string) {
    const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    return data?.error?.message ?? fallback;
  }

  async function syncOnboardingMemoryToStore(
    patch: Partial<StoreOnboardingMemory> = {},
    storePatch: Record<string, unknown> = {},
  ) {
    if (role !== "seller") return;
    const memory = buildOnboardingMemory(patch);
    const response = await fetch("/api/app/store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...storePatch, brandSettings: { onboardingMemory: memory } }),
    });
    if (!response.ok) throw new Error(await readApiError(response, "Could not save onboarding progress."));
  }

  function storeProfilePatch() {
    return {
      name: resolvedStoreName,
      country,
      city,
      onboardingState: buildPath === "template" ? "BUILDING_TEMPLATE" : "BUILDING_REX",
    };
  }

  async function ensureStore(name = resolvedStoreName) {
    if (role !== "seller" || !name.trim()) return;
    const response = await fetch("/api/app/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), country, city }),
    });
    if (!response.ok) throw new Error(await readApiError(response, "Could not create your store yet."));
    storeCreatedRef.current = true;
    await syncOnboardingMemoryToStore({ storeName: name.trim() }, storeProfilePatch());
  }

  function buildRexStoreSeed(): RexStoreConfig {
    return {
      ...DEFAULT_REX_STORE_CONFIG,
      name: resolvedStoreName,
      slug: storeSlug,
      heroHeadline: template.headline,
      heroSubline: businessDescription || DEFAULT_REX_STORE_CONFIG.heroSubline,
      palette: {
        heroBg: template.palette[0],
        heroText: template.palette[2],
        accent: template.accent,
        ctaBg: template.accent,
        ctaText: "#FAF7F1",
        paperBg: template.palette[3],
      },
      changed: ["name", "template", "palette", "hero"],
    };
  }

  function saveRexBuilderMemory(store: RexStoreConfig) {
    window.localStorage.setItem(
      "shopinbos-builder-progress",
      JSON.stringify({
        mode: "rex",
        store,
        onboardingMemory: buildOnboardingMemory({ buildPath: "rex", step: 5 }),
      }),
    );
  }

  async function buildStoreWithRex(tweak = "") {
    setBuildPath("rex");
    setRexBuildStatus("building");
    setRexBuildMessage("");
    setRexBuildStore(null);

    const seed = buildRexStoreSeed();
    try {
      await ensureStore(resolvedStoreName);
      const prompt = [businessDescription, tweak.trim() ? `Requested tweak: ${tweak.trim()}` : ""].filter(Boolean).join("\n\n");
      const response = await fetch("/api/ai/store-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          store: seed,
          brandContext: {
            category,
            businessDescription: prompt,
            documentNotes,
          },
          templateContext: {
            templateId: template.id,
            templateName: template.name,
            layoutFamily: template.meta,
          },
          currentDocNames: documentNames,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Rex could not start the store build."));
      if (!response.body) throw new Error("Rex did not return a build stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalStore: RexStoreConfig | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type?: string; text?: string; data?: Partial<RexStoreConfig>; message?: string };
          if (event.type === "token" && event.text) setRexBuildMessage((current) => `${current}${event.text}`);
          if (event.type === "store" && event.data) {
            finalStore = { ...seed, ...event.data };
            setRexBuildStore(finalStore);
          }
          if (event.type === "error") throw new Error(event.message ?? "Rex could not build the store.");
        }
      }

      const builtStore = finalStore ?? seed;
      setRexBuildStore(builtStore);
      saveRexBuilderMemory(builtStore);
      setRexBuildStatus("ready");
      setRexBuildMessage((current) => current || "Rex built a first draft with storefront copy, navigation, products, and launch-ready sections.");
      setRexTweak("");
      await syncOnboardingMemoryToStore({ buildPath: "rex", step: 5 });
    } catch (error) {
      const fallback = seed;
      setRexBuildStore(fallback);
      saveRexBuilderMemory(fallback);
      setRexBuildStatus("error");
      setRexBuildMessage(error instanceof Error ? error.message : "Rex could not build this store right now.");
    }
  }

  async function askRexAI() {
    setIsRexThinking(true);
    try {
      const response = await fetch("/api/ai/onboarding-rex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: businessDescription,
          memory: buildOnboardingMemory(),
          documentNames,
          documentText: documentNotes,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Rex could not read that yet."));
      const data = (await response.json().catch(() => null)) as { reply?: string; memoryPatch?: Partial<StoreOnboardingMemory> } | null;
      if (data?.memoryPatch?.category) setCategory(data.memoryPatch.category);
      if (data?.memoryPatch?.businessDescription) setBusinessDescription(data.memoryPatch.businessDescription);
      setRexReply(data?.reply ?? "Got it. I will use this to shape the store name, template, products, and launch checklist.");
    } catch (error) {
      setRexReply(error instanceof Error ? error.message : "Rex could not respond right now.");
    } finally {
      setIsRexThinking(false);
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRexReply("Voice recording is not available in this browser. You can type the details instead.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setRexReply("I could not access the microphone. Check browser permissions or type the details instead.");
      return;
    }
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const formData = new FormData();
      formData.append("audio", new Blob(audioChunksRef.current, { type: "audio/webm" }), "rex-onboarding.webm");
      try {
        const response = await fetch("/api/ai/transcribe", { method: "POST", body: formData });
        if (!response.ok) throw new Error(await readApiError(response, "Rex could not transcribe the recording."));
        const data = (await response.json().catch(() => null)) as { text?: string } | null;
        if (data?.text) setBusinessDescription(data.text);
      } catch (error) {
        setRexReply(error instanceof Error ? error.message : "Rex could not transcribe the recording.");
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  function handleDocUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setDocumentNames(files.map((file) => file.name));
    setDocumentNotes(files.map((file) => `[${file.name}: uploaded for Rex to remember during setup]`).join("\n"));
  }

  function saveAndExit() {
    void syncOnboardingMemoryToStore().catch((error) => {
      setRexReply(error instanceof Error ? error.message : "Could not save progress.");
    });
    router.push(role === "seller" ? "/home" : roleDestination(role));
  }

  async function finishOnboarding() {
    const destination = getContinuationPath({
      role,
      ...intentParams,
    });
    if (role === "seller") {
      await ensureStore(resolvedStoreName);
      await syncOnboardingMemoryToStore(
        { step: total, completed: true },
        {
          onboardingState: "LIVE",
          firstDashboardVisitComplete: true,
          status: "active",
        },
      );
    } else {
      await syncOnboardingMemoryToStore({ step: total, completed: true });
    }
    router.push(destination || (role === "seller" ? "/home" : roleDestination(role)));
  }

  async function submitLogisticsOnboarding(payload: {
    zones: LogisticsCoverageZone[];
    vehicleTypes: string[];
    deliveryTypes: string[];
    basePrice: number;
    estimatedSpeed: string;
    completed?: boolean;
  }) {
    const activeZones = payload.zones.filter((zone) => zone.active);
    await fetch("/api/logistics/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country,
        city,
        description: businessDescription,
        coverageZones: activeZones.map((zone) => zone.name),
        coverageMap: {
          zones: payload.zones,
          depot: `${city || "Lagos"} depot`,
          updatedBy: "onboarding",
        },
        vehicleTypes: payload.vehicleTypes,
        deliveryTypes: payload.deliveryTypes,
        pricingModel: "fixed",
        basePrice: payload.basePrice,
        estimatedSpeed: payload.estimatedSpeed,
        completed: payload.completed ?? true,
      }),
    }).catch(() => null);
    if (payload.completed ?? true) {
      await finishOnboarding();
      return;
    }
    await syncOnboardingMemoryToStore({ step: total, completed: false });
    router.push("/logistics/onboarding?saved=1");
  }

  async function goNext(storePatch: Record<string, unknown> = {}) {
    setIsSavingProgress(true);
    try {
      await syncOnboardingMemoryToStore({ step: Math.min(step + 1, total) }, storePatch);
      setStep((current) => Math.min(current + 1, total));
    } catch (error) {
      setRexReply(error instanceof Error ? error.message : "Could not save progress.");
    } finally {
      setIsSavingProgress(false);
    }
  }

  function goBack() {
    setStep((current) => Math.max(current - 1, 1));
  }

  if (role === "logistics_partner") {
    return (
      <LogisticsOnboardingStage
        roleText={roleText}
        step={step}
        total={total}
        onBack={goBack}
        onNext={async () => { setStep((current) => Math.min(current + 1, total)); }}
        onSubmit={submitLogisticsOnboarding}
      />
    );
  }

  return (
    <div className="stage">
      {step === 1 ? (
        <div className="flex h-full flex-col overflow-auto bg-[var(--canvas)] px-7 py-6">
          <div className="mb-8 flex items-center justify-between">
            <BrandLogo className="w-[140px]" priority />
            <SellerPillSteps step={1} />
            <div className="text-[13px] text-[var(--ink-500)]">Step 1 of {sellerStepsTotal} - ~2 min</div>
          </div>
          <div className="mx-auto grid min-h-[calc(100vh-128px)] max-w-[1120px] grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <div className="chip on mb-5">
                <Icon name="sparkle" size={12} color="var(--teal-700)" />
                Rex is your store builder
              </div>
              <h1 className="m-0 font-display text-[56px] font-normal leading-none tracking-normal text-[var(--ink-900)] lg:text-[64px]">
                Hi {first}.<br />
                <span className="italic text-[var(--teal-700)]">I'm Rex.</span>
              </h1>
              <p className="mt-5 max-w-[500px] text-[17px] leading-7 text-[var(--ink-600)]">
                Tell me what you sell in one sentence. I'll pick a template, write the copy, draw a logo, and seed three products you can edit.
              </p>

              <div className="card mt-8 max-w-[540px]" style={{ padding: 18, borderRadius: 18, boxShadow: "var(--shd-md)" }}>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--ink-500)]">Tell Rex what you sell</div>
                <textarea
                  className="ta"
                  rows={3}
                  value={businessDescription}
                  onChange={(event) => setBusinessDescription(event.target.value)}
                  style={{ border: "none", padding: 0, fontSize: 17, fontFamily: "var(--font-display)", lineHeight: 1.3, resize: "none" }}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[var(--ink-150)] pt-3">
                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--ink-500)]">
                    <label className="btn-link cursor-pointer">
                      <Icon name="image" size={13} /> Add a sketch or sample photo
                      <input type="file" className="sr-only" multiple onChange={handleDocUpload} />
                    </label>
                    <button type="button" onClick={() => void toggleRecording()} className="btn-link">
                      <Icon name="phone" size={13} /> {isRecording ? "Stop recording" : "Say it instead"}
                    </button>
                  </div>
                  <button type="button" onClick={() => { void askRexAI(); void goNext(storeProfilePatch()); }} className="btn btn-mint" disabled={isSavingProgress}>
                    {isSavingProgress ? "Saving..." : "Build my shop"} <Icon name="sparkle" size={13} />
                  </button>
                </div>
              </div>

              <div className="mt-5 flex max-w-[540px] flex-wrap gap-2">
                <span className="self-center text-[11.5px] text-[var(--ink-500)]">or try:</span>
                {[
                  "I sell skincare made with shea butter in Accra",
                  "I run a food truck and take Lagos orders online",
                  "I import home electronics and ship from Aba",
                ].map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setBusinessDescription(prompt)} className="chip">
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative min-h-[520px]">
              <div className="relative text-center">
                <MascotFigure role="seller" variant={0} className="mx-auto w-[360px]" priority />
                <div className="mx-auto -mt-5 max-w-[350px] rounded-[18px] border border-[var(--ink-100)] bg-[var(--paper)] px-5 py-4 text-left shadow-[var(--shd-md)]">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--teal-700)]">Rex - drafting</div>
                  <div className="text-[14px] leading-6 text-[var(--ink-800)]">
                    Got it. I'm thinking warm earth palette, handcraft serif, and three product pages built around your story.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {["palette", "typography", "three products"].map((item) => (
                      <span key={item} className="chip on text-[11px]">
                        <Icon name="check" size={11} />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <StepHeader step={step} total={sellerTotal} label={sellerSteps[Math.min(step - 1, sellerSteps.length - 1)]} time={step === 3 ? "pick one" : step >= 7 ? "1 min" : "2 min"} onSave={saveAndExit} />
          {step === 2 && (
            <div className="flex flex-1 justify-center overflow-auto bg-[var(--canvas)] px-7 py-9">
              <div className="w-full max-w-[660px]">
                <div className="onb-kicker">Step 2 - About your business</div>
                <h1 className="onb-title">What should we call your shop?</h1>
                <p className="onb-sub">You can change any of this later. Rex is suggesting names based on what you told us.</p>
                <div className="card mt-7" style={{ padding: 24 }}>
                  <TextField label="Business name" value={storeName} onChange={setStoreName} placeholder="Sahel Sole" />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="self-center text-[11px] text-[var(--ink-500)]">Rex suggests:</span>
                    {["Sahel Sole", "Kano Step", "Atelier 12 Walk"].map((name) => (
                      <button key={name} type="button" onClick={() => setStoreName(name)} className={`chip ${resolvedStoreName === name ? "on" : ""}`}>
                        {name}
                      </button>
                    ))}
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
                    <TextField label="Shop URL" value={storeSlug} onChange={(value) => setStoreName(value.replace(/-/g, " "))} mono />
                    <div className="field">
                      <span className="label">&nbsp;</span>
                      <div className="inp flex items-center font-mono text-[13px] text-[var(--ink-500)]">.shopinbos.shop</div>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11.5px] text-[var(--success)]">
                    <Icon name="check" size={12} />
                    Available - you can connect a custom domain later.
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <TextField label="Country" value={country} onChange={setCountry} />
                    <TextField label="City" value={city} onChange={setCity} />
                  </div>
                  <div className="field mt-5">
                    <span className="label">Product category</span>
                    <div className="flex flex-wrap gap-1.5">
                      {categoryOptions.map((option) => (
                        <button key={option} type="button" onClick={() => setCategory(option)} className={`chip ${category === option ? "on" : ""}`}>
                          {option}
                        </button>
                      ))}
                    </div>
                    <div className="help">Rex uses this to pick the first template, product structure, and launch checklist.</div>
                  </div>
                  <div className="field mt-5">
                    <span className="label">Settlement currency</span>
                    <div className="flex flex-wrap gap-1.5">
                      {["NGN Naira", "GHS Cedi", "KES Shilling", "ZAR Rand", "USD"].map((currency, index) => (
                        <button key={currency} type="button" className={`chip ${index === 0 ? "on" : ""}`}>
                          {currency}
                        </button>
                      ))}
                    </div>
                    <div className="help">You cannot change this after your first sale. We'll auto-FX customer prices into NGN.</div>
                  </div>
                  <div className="field mt-5">
                    <span className="label">Languages your shop will serve</span>
                    <div className="flex flex-wrap gap-1.5">
                      {languageOptions.map((language, index) => (
                        <button key={language} type="button" className={`chip ${index < 2 ? "on" : ""}`}>
                          {language}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <StepActions
                  onBack={goBack}
                  onNext={async () => {
                    try {
                      await ensureStore(resolvedStoreName);
                      await goNext(storeProfilePatch());
                    } catch (error) {
                      setRexReply(error instanceof Error ? error.message : "Could not create your store yet.");
                    }
                  }}
                  nextLabel="Continue"
                  disabled={isSavingProgress}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-1 justify-center overflow-auto bg-[linear-gradient(180deg,#f5faf7,var(--canvas))] px-7 py-8">
              <div className="w-full max-w-[1180px]">
                <div className="mb-8 text-center">
                  <div className="onb-kicker">Step 3 - Build your shop</div>
                  <h1 className="onb-title text-center">How do you want to <em className="text-[var(--teal-700)]">start?</em></h1>
                  <p className="onb-sub mx-auto max-w-[580px]">Three ways to get your storefront live. You can switch later - nothing is locked in.</p>
                </div>
                <div className="grid gap-[18px] lg:grid-cols-3">
                  <PathCard
                    featured
                    icon="sparkle"
                    title="Let Rex build it"
                    eyebrow="Build completely with Rex"
                    body="Tell Rex what you sell in one sentence. He picks a template, writes the copy, draws a logo, and seeds 3 starter products."
                    items={["Branded storefront in about 10 minutes", "AI-generated logo, palette, and copy", "3 starter products you can edit", "Pidgin, Yoruba, and Hausa copy options", "Re-roll any section by typing a tweak"]}
                    action="Build with Rex"
                    onClick={() => { setBuildPath("rex"); setStep(4); }}
                  />
                  <PathCard
                    icon="palette"
                    title="Pick a template"
                    eyebrow="Start from a template"
                    body="Browse mobile-first themes. Pick one and Rex adapts the copy and palette to match your brand voice."
                    items={["See the exact layout before you commit", "Filter by industry, vibe, complexity", "Rex still writes brand copy", "Swap visual identity any time", "Live phone, tablet, and desktop preview"]}
                    action="Browse templates"
                    onClick={() => { setBuildPath("template"); setStep(4); }}
                  />
                  <PathCard
                    icon="download"
                    title="Migrate from elsewhere"
                    eyebrow="Import what you already have"
                    body="Already selling on Shopify, Woo, Etsy, or Instagram? Import your products and Rex rebuilds the brand on top."
                    items={["Shopify or Woo CSV import", "Etsy listing scrape", "Instagram catalog handoff", "Rex adapts to your existing brand", "Keeps customer and order history"]}
                    action="Import my shop"
                    onClick={() => { setBuildPath("migrate"); setStep(4); }}
                  />
                </div>
                <div className="mt-8 text-center text-[12.5px] text-[var(--ink-500)]">
                  Not sure? Most sellers go with Rex and switch templates later if they want a different look.
                </div>
                <div className="mt-6 border-t border-[var(--ink-100)] pt-6 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      void finishOnboarding();
                    }}
                    className="text-[13px] font-semibold text-[var(--ink-400)] underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--ink-600)]"
                  >
                    Skip setup — go to my dashboard instead
                  </button>
                  <div className="mt-1 text-[11.5px] text-[var(--ink-400)]">
                    You can build your store later from the store builder.
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && buildPath === "rex" && (
            <div className="flex flex-1 items-center justify-center overflow-auto bg-[linear-gradient(180deg,#f5faf7,var(--canvas))] px-7 py-8">
              <div className="w-full max-w-[780px] text-center">
                <MascotFigure role="seller" variant={0} className="mx-auto mb-6 w-[120px]" />
                <h1 className="onb-title text-center">Tell me what you sell.<br /><em className="text-[var(--teal-700)]">In one sentence.</em></h1>
                <p className="onb-sub mx-auto max-w-[540px]">The more specific, the better. Where you make it, who it's for, what makes it different. I'll do the rest.</p>
                <div className="card mt-8 text-left" style={{ padding: 24, boxShadow: "var(--shd-lg)" }}>
                  <textarea
                    className="ta"
                    rows={4}
                    value={businessDescription}
                    onChange={(event) => setBusinessDescription(event.target.value)}
                    style={{ border: "none", padding: 0, fontSize: 19, fontFamily: "var(--font-display)", lineHeight: 1.4, resize: "none" }}
                  />
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[var(--ink-150)] pt-4">
                    <div className="flex flex-wrap gap-4 text-[11.5px] text-[var(--ink-500)]">
                      <label className="btn-link cursor-pointer">
                        <Icon name="image" size={13} /> Add a sample photo
                        <input type="file" className="sr-only" multiple onChange={handleDocUpload} />
                      </label>
                      <button type="button" onClick={() => void askRexAI()} className="btn-link" disabled={isRexThinking}>
                        <Icon name="wand" size={13} /> {isRexThinking ? "Rex is thinking..." : "Pick a brand voice"}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStep(5);
                        void buildStoreWithRex();
                      }}
                      className="btn btn-mint btn-lg"
                      disabled={rexBuildStatus === "building"}
                    >
                      {rexBuildStatus === "building" ? "Building..." : "Build my shop"} <Icon name="sparkle" size={14} />
                    </button>
                  </div>
                </div>
                {rexReply && <div className="mx-auto mt-4 max-w-[640px] rounded-[14px] border border-[var(--teal-200)] bg-[var(--teal-50)] px-4 py-3 text-left text-[13px] leading-6 text-[var(--ink-700)]">{rexReply}</div>}
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <span className="self-center text-[11px] text-[var(--ink-500)]">or try one of these:</span>
                  {["Shea body butter, made in Accra, women 25-35", "Lagos food truck - jollof bowls for delivery", "Coffee roaster, beans from Ethiopia, sell in Nairobi"].map((prompt) => (
                    <button key={prompt} type="button" onClick={() => setBusinessDescription(prompt)} className="chip">
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && buildPath !== "rex" && (
            <TemplateGalleryStep templateId={templateId} setTemplateId={setTemplateId} setBuildPath={setBuildPath} goBack={goBack} goNext={goNext} disabled={isSavingProgress} />
          )}

          {step === 5 && (
            <div className="grid flex-1 gap-6 overflow-auto bg-[var(--canvas)] px-7 py-7 xl:grid-cols-[1fr_380px]">
              <div>
                <div className="onb-kicker">Step 5 - Polish</div>
                <h1 className="onb-title">Want to tweak anything?</h1>
                <p className="onb-sub">Type a change. Rex will re-roll the section. You can keep going forever - or continue.</p>
                <div className="card mt-5 overflow-hidden p-0">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ink-100)] bg-[var(--ink-50)] px-4 py-3">
                    <div className="flex gap-1.5">
                      {["Phone", "Tablet", "Desktop"].map((view, index) => (
                        <button key={view} type="button" className={`btn btn-sm ${index === 0 ? "btn-soft" : "btn-ghost"}`}>
                          {view}
                        </button>
                      ))}
                    </div>
                    <div className="font-mono text-[12px] text-[var(--ink-500)]">{storeSlug}.shopinbos.shop</div>
                    <button type="button" onClick={() => void buildStoreWithRex()} className="btn btn-ghost btn-sm" disabled={rexBuildStatus === "building"}>
                      <Icon name="refresh" size={12} /> {rexBuildStatus === "building" ? "Regenerating" : "Regenerate all"}
                    </button>
                  </div>
                  <div className="grid min-h-[520px] place-items-center bg-[var(--ink-50)] p-8">
                    <StorePhonePreview template={template} storeName={resolvedStoreName} builtStore={rexBuildStore} />
                  </div>
                </div>
              </div>
              <aside className="space-y-4">
                <div className="card">
                  <div className="mb-4 flex items-start gap-3">
                    <ChipAvatar mascot="rex" size={42} />
                    <div>
                      <div className="text-[14px] font-semibold text-[var(--ink-900)]">
                        {rexBuildStatus === "ready" ? "Rex built your first draft." : rexBuildStatus === "error" ? "Rex needs another try." : "Rex is building your store."}
                      </div>
                      <div className="mt-1 text-[12px] leading-5 text-[var(--ink-500)]">
                        {rexBuildStatus === "building" ? "Generating copy, sections, products, and a storefront config." : rexBuildMessage || "Your selected template and prompt are shaping the preview."}
                      </div>
                    </div>
                  </div>
                  {["Brand story", "Template fit", "Product seed", "Launch checklist"].map((item, index) => {
                    const done = rexBuildStatus === "ready" || (rexBuildStatus === "building" && index < 2);
                    return (
                      <div key={item} className="flex items-center justify-between border-t border-[var(--ink-100)] py-3">
                        <span className="text-[13px] font-semibold text-[var(--ink-800)]">{item}</span>
                        <span className={`badge ${done ? "badge-success" : rexBuildStatus === "error" && index === 1 ? "badge-warn" : "badge-soft"}`}>
                          {done ? "Done" : "Waiting"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="card">
                  <div className="mb-2 text-[13px] font-semibold text-[var(--ink-900)]">Ask Rex to tweak it</div>
                  <textarea
                    className="ta"
                    rows={4}
                    value={rexTweak}
                    onChange={(event) => setRexTweak(event.target.value)}
                    placeholder="Make it more premium, add a wholesale section, use warmer copy..."
                  />
                  <button
                    type="button"
                    onClick={() => void buildStoreWithRex(rexTweak)}
                    className="btn btn-mint mt-3 w-full justify-center"
                    disabled={rexBuildStatus === "building"}
                  >
                    {rexBuildStatus === "building" ? "Applying..." : "Apply tweak"} <Icon name="sparkle" size={13} />
                  </button>
                </div>
                <StepActions onBack={goBack} onNext={goNext} nextLabel="Continue" disabled={isSavingProgress} />
              </aside>
            </div>
          )}

          {step === 6 && <ProductsStep onBack={goBack} onNext={goNext} disabled={isSavingProgress} />}
          {step === 7 && <PaymentsStep onBack={goBack} onNext={goNext} disabled={isSavingProgress} />}
          {step === 8 && <LogisticsPickStep onBack={goBack} onNext={goNext} disabled={isSavingProgress} />}
          {step === 9 && <DomainStep slug={storeSlug} onBack={goBack} onNext={goNext} disabled={isSavingProgress} />}
          {step === 10 && (
            <LaunchStep
              slug={storeSlug}
              template={template}
              storeName={resolvedStoreName}
              builtStore={rexBuildStore}
              onDashboard={finishOnboarding}
            />
          )}
        </>
      )}
    </div>
  );
}

function StepActions({
  onBack,
  onNext,
  nextLabel,
  disabled = false,
}: {
  onBack: () => void;
  onNext: () => Promise<void> | void;
  nextLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="btn btn-ghost" disabled={disabled}>
        Back
      </button>
      <button type="button" onClick={() => void onNext()} className="btn btn-mint btn-lg" disabled={disabled}>
        {disabled ? "Saving..." : nextLabel} <Icon name="arrow" size={14} />
      </button>
    </div>
  );
}

function PathCard({
  featured,
  icon,
  title,
  eyebrow,
  body,
  items,
  action,
  onClick,
}: {
  featured?: boolean;
  icon: IconName;
  title: string;
  eyebrow: string;
  body: string;
  items: string[];
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="card relative overflow-hidden p-0" style={{ borderColor: featured ? "var(--teal-400)" : "var(--ink-100)", boxShadow: featured ? "var(--shd-pop)" : "var(--shd-xs)" }}>
      {featured && <div className="absolute right-3 top-3 z-10 rounded-full bg-[var(--teal-700)] px-2.5 py-1 text-[10px] font-bold tracking-[0.04em] text-white">RECOMMENDED</div>}
      <div className="relative grid aspect-[16/10] place-items-center overflow-hidden bg-[linear-gradient(170deg,var(--teal-100),var(--teal-200)_70%,var(--teal-300))]">
        {featured ? <MascotFigure role="seller" variant={0} className="w-[150px]" /> : <Icon name={icon} size={72} color={featured ? "var(--teal-700)" : "var(--ink-700)"} />}
        <div className="absolute bottom-3 left-3 rounded-full bg-[var(--paper)] px-3 py-1 text-[11px] font-bold text-[var(--teal-800)] shadow-[var(--shd-sm)]">{eyebrow}</div>
      </div>
      <div className="p-[22px]">
        <div className="font-display text-[24px] font-normal leading-tight text-[var(--ink-900)]">{title}</div>
        <p className="mb-4 mt-2 text-[13.5px] leading-6 text-[var(--ink-600)]">{body}</p>
        <FeatureList items={items} />
        <button type="button" onClick={onClick} className={`btn btn-lg mt-5 w-full justify-center ${featured ? "btn-mint" : "btn-soft"}`}>
          {action} <Icon name={featured ? "sparkle" : "arrow"} size={14} />
        </button>
      </div>
    </div>
  );
}

function TemplateGalleryStep({
  templateId,
  setTemplateId,
  setBuildPath,
  goBack,
  goNext,
  disabled = false,
}: {
  templateId: string;
  setTemplateId: (id: string) => void;
  setBuildPath: (path: BuildPath) => void;
  goBack: () => void;
  goNext: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const template = selectedTemplate(templateId);
  return (
    <div className="grid flex-1 gap-6 overflow-auto bg-[var(--canvas)] px-7 py-7 xl:grid-cols-[1fr_380px]">
      <div>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="onb-kicker">Step 4 - Pick a template</div>
            <h1 className="onb-title">200+ templates - filtered to fit you.</h1>
            <p className="onb-sub">Choose one and Rex will stretch it to fit your brand voice, product category, and country.</p>
          </div>
          <button type="button" onClick={() => setBuildPath("rex")} className="btn btn-ghost btn-sm">
            <Icon name="sparkle" size={13} /> Use Rex instead
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {["All", "Fashion", "Beauty", "Food", "Electronics", "Home"].map((filter, index) => (
            <button key={filter} type="button" className={`chip ${index === 0 ? "on" : ""}`}>
              {filter}
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {sellerTemplates.map((item) => (
            <TemplateCard key={item.id} template={item} active={templateId === item.id} onClick={() => setTemplateId(item.id)} />
          ))}
        </div>
        <StepActions onBack={goBack} onNext={goNext} nextLabel="Use this template" disabled={disabled} />
      </div>
      <aside className="space-y-4">
        <div className="card grid place-items-center bg-[var(--ink-50)]">
          <StorePhonePreview template={template} storeName={template.name} />
        </div>
        <div className="card bg-[linear-gradient(160deg,var(--teal-50),var(--paper))]">
          <div className="flex gap-3">
            <ChipAvatar mascot="rex" size={42} />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--teal-700)]">Rex will adapt</div>
              <div className="mt-1 text-[13px] leading-6 text-[var(--ink-700)]">
                I will keep the layout, then rewrite the hero, palette, product seed, policies, and launch checklist around your store.
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ProductsStep({ onBack, onNext, disabled = false }: { onBack: () => void; onNext: () => Promise<void> | void; disabled?: boolean }) {
  const cards = [
    { icon: "store" as IconName, title: "Marketplace", sub: "Add dropship-ready stock - no inventory cost.", featured: true, bullets: ["Verified suppliers", "Peggy writes descriptions", "Margins 40-65%"], cta: "Browse products" },
    { icon: "box" as IconName, title: "Add your own", sub: "Upload products you already stock or make.", bullets: ["Photos", "Variants", "Inventory alerts"], cta: "Add product" },
    { icon: "upload" as IconName, title: "Import CSV", sub: "Bring products from Shopify, Woo, or a spreadsheet.", bullets: ["Bulk upload", "Smart cleanup", "Rex maps fields"], cta: "Import file" },
  ];
  return (
    <div className="flex flex-1 justify-center overflow-auto bg-[var(--canvas)] px-7 py-8">
      <div className="w-full max-w-[1060px]">
        <div className="onb-kicker">Step 6 - Products</div>
        <h1 className="onb-title">Add products your way.</h1>
        <p className="onb-sub">Rex seeded placeholder products. Replace them with your real ones, import a list, or start with marketplace stock.</p>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <div key={card.title} className="card" style={{ borderColor: card.featured ? "var(--teal-400)" : "var(--ink-100)", boxShadow: card.featured ? "var(--shd-pop)" : "var(--shd-xs)" }}>
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-[12px]" style={{ background: card.featured ? "var(--teal-100)" : "var(--ink-75)", color: card.featured ? "var(--teal-700)" : "var(--ink-700)" }}>
                <Icon name={card.icon} size={20} />
              </div>
              <div className="font-display text-[22px] font-normal text-[var(--ink-900)]">{card.title}</div>
              <p className="mt-2 text-[13px] leading-6 text-[var(--ink-600)]">{card.sub}</p>
              <FeatureList items={card.bullets} />
              <button type="button" className={`btn mt-4 w-full justify-center ${card.featured ? "btn-mint" : "btn-ghost"}`}>
                {card.cta} <Icon name="arrow" size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="card mt-4 flex flex-wrap items-center gap-4 bg-[linear-gradient(120deg,var(--teal-50),var(--paper))]">
          <ChipAvatar mascot="peggy" size={42} />
          <div className="flex-1 text-[13px] leading-6 text-[var(--ink-700)]">
            <strong>Peggy:</strong> Most sellers start with 2-3 of their own products plus 4-6 dropship picks. That gives you a full shop on day one with less capital tied up.
          </div>
        </div>
        <StepActions onBack={onBack} onNext={onNext} nextLabel="Continue to payments" disabled={disabled} />
      </div>
    </div>
  );
}

function PaymentsStep({ onBack, onNext, disabled = false }: { onBack: () => void; onNext: () => Promise<void> | void; disabled?: boolean }) {
  return (
    <div className="flex flex-1 justify-center overflow-auto bg-[var(--canvas)] px-7 py-8">
      <div className="w-full max-w-[720px]">
        <div className="onb-kicker">Step 7 - Payouts</div>
        <h1 className="onb-title">Where should we send your money?</h1>
        <p className="onb-sub">We'll deposit your settled balance to this bank account every morning. No payment provider setup needed; Shopinbos handles checkout.</p>
        <div className="card mt-6" style={{ padding: 24 }}>
          <TextField label="Account holder name (must match)" value="Aisha Funke Bello" onChange={() => null} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="field">
              <span className="label">Bank</span>
              <div className="sel">
                <span className="grid h-6 w-6 place-items-center rounded-[5px] bg-[#f15928] text-[11px] font-bold text-white">GT</span>
                <span className="flex-1">Guaranty Trust Bank</span>
                <Icon name="chevDown" size={14} />
              </div>
            </div>
            <TextField label="Account number" value="0123 4567 89" onChange={() => null} mono />
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11.5px] text-[var(--success)]">
            <Icon name="check" size={12} />
            Verified: AISHA FUNKE BELLO
          </div>
          <hr className="hr" />
          <div className="field">
            <span className="label">Payout schedule</span>
            <div className="flex flex-wrap gap-1.5">
              {["Daily - 6am", "Weekly - Friday", "Manual"].map((item, index) => (
                <button key={item} type="button" className={`chip ${index === 0 ? "on" : ""}`}>
                  {item}
                </button>
              ))}
            </div>
            <div className="help">Pro tip: daily payouts keep your cash flow tight.</div>
          </div>
        </div>
        <div className="card mt-4 bg-[var(--teal-50)]" style={{ borderColor: "var(--teal-200)" }}>
          <div className="flex gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-white text-[var(--teal-700)]">
              <Icon name="lock" size={20} />
            </div>
            <div>
              <div className="onb-card-kicker">How payouts work</div>
              <div className="mt-1 text-[13.5px] leading-6 text-[var(--ink-800)]">
                Buyers pay through Shopinbos. We handle cards, transfers, local wallets, and cross-border checkout. The money settles to your bank the next morning.
              </div>
            </div>
          </div>
        </div>
        <StepActions onBack={onBack} onNext={onNext} nextLabel="Save bank & continue" disabled={disabled} />
      </div>
    </div>
  );
}

function LogisticsPickStep({ onBack, onNext, disabled = false }: { onBack: () => void; onNext: () => Promise<void> | void; disabled?: boolean }) {
  const couriers = [
    { name: "Swift Riders", detail: "12 bikes - 2 vans", coverage: "Yaba - Ikeja - Lekki Ph 1", rating: "4.7", onTime: "92%", price: "from NGN 900", selected: true },
    { name: "Kwik Lagos", detail: "40 bikes", coverage: "All Lagos zones", rating: "4.5", onTime: "88%", price: "from NGN 1,200" },
    { name: "GIG Express", detail: "Vans - trucks", coverage: "Cross-country - 38 cities", rating: "4.6", onTime: "94%", price: "from NGN 2,200" },
  ];
  return (
    <div className="flex flex-1 justify-center overflow-auto bg-[var(--canvas)] px-7 py-8">
      <div className="w-full max-w-[1080px]">
        <div className="onb-kicker">Step 8 - Delivery</div>
        <h1 className="onb-title">Who'll deliver your orders?</h1>
        <p className="onb-sub">Top-rated couriers in Lagos. Pick a default - you can mix per order later. Peggy can pick automatically too.</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {couriers.map((courier, index) => (
            <div key={courier.name} className="card relative" style={{ borderColor: courier.selected ? "var(--teal-400)" : "var(--ink-100)", boxShadow: courier.selected ? "var(--shd-pop)" : "var(--shd-xs)" }}>
              {courier.selected && <div className="absolute right-3 top-3 rounded-full bg-[var(--teal-700)] px-2.5 py-1 text-[10px] font-bold text-white">DEFAULT</div>}
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-[12px] bg-[var(--teal-100)] text-[var(--teal-700)]">
                  <Icon name="truck" size={22} />
                </div>
                <div>
                  <div className="text-[14.5px] font-semibold text-[var(--ink-900)]">{courier.name}</div>
                  <div className="text-[11px] text-[var(--ink-500)]">{courier.detail}</div>
                </div>
              </div>
              <div className="mb-3 text-[12px] text-[var(--ink-700)]">{courier.coverage}</div>
              <div className="mb-3 grid grid-cols-3 gap-2 rounded-[10px] bg-[var(--ink-50)] px-3 py-2">
                <MetricMini label="Rating" value={`* ${courier.rating}`} />
                <MetricMini label="On-time" value={courier.onTime} />
                <MetricMini label="From" value={courier.price} />
              </div>
              <button type="button" className={`btn btn-sm w-full justify-center ${courier.selected ? "btn-mint" : "btn-ghost"}`}>
                {courier.selected ? "Selected" : "Make default"}
              </button>
            </div>
          ))}
        </div>
        <div className="card mt-4 flex flex-wrap items-center gap-4 bg-[linear-gradient(120deg,var(--teal-50),var(--paper))]">
          <ChipAvatar mascot="peggy" size={40} />
          <div className="flex-1 text-[13px] leading-6">
            <strong>Peggy:</strong> I can auto-pick a courier per order based on package size, address, and current dispatch times.
          </div>
          <span className="chip on">Auto-pick on</span>
        </div>
        <StepActions onBack={onBack} onNext={onNext} nextLabel="Continue" disabled={disabled} />
      </div>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--ink-500)]">{label}</div>
      <strong className="text-[12px]">{value}</strong>
    </div>
  );
}

function DomainStep({ slug, onBack, onNext, disabled = false }: { slug: string; onBack: () => void; onNext: () => Promise<void> | void; disabled?: boolean }) {
  return (
    <div className="flex flex-1 justify-center overflow-auto bg-[var(--canvas)] px-7 py-10">
      <div className="w-full max-w-[700px]">
        <div className="onb-kicker">Step 9 - Domain</div>
        <h1 className="onb-title">Use your own domain?</h1>
        <p className="onb-sub">
          Skip this step to keep <code className="rounded bg-[var(--ink-100)] px-1.5 py-0.5 font-mono text-[13px]">{slug}.shopinbos.shop</code>. Or attach a domain you already own.
        </p>
        <div className="card mt-7" style={{ padding: 24, borderColor: "var(--teal-400)", boxShadow: "var(--shd-pop)" }}>
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-[9px] bg-[var(--teal-100)] text-[var(--teal-800)]">
              <Icon name="globe" size={17} />
            </div>
            <div>
              <div className="text-[14.5px] font-semibold text-[var(--ink-900)]">Connect a custom domain</div>
              <div className="text-[12px] text-[var(--ink-500)]">You own it elsewhere - point DNS to us</div>
            </div>
          </div>
          <TextField label="Your domain" value="" onChange={() => null} placeholder={`${slug}.com or shop.${slug}.com`} mono />
          <div className="mt-4 grid grid-cols-[30px_1fr] gap-2 rounded-[10px] bg-[var(--ink-50)] px-4 py-3 text-[12.5px] leading-6 text-[var(--ink-700)]">
            <Icon name="info" size={15} color="var(--info)" />
            <div>
              After we verify, add this DNS record at your registrar:
              <br />
              <code className="mt-1 inline-block rounded bg-white px-2 py-1 font-mono text-[11.5px]">CNAME - @ - stores.shopinbos.com</code>
            </div>
          </div>
        </div>
        <div className="card mt-4 text-center text-[13px] text-[var(--ink-600)]">
          Or use the free Shopinbos subdomain - <code className="font-mono text-[var(--teal-700)]">{slug}.shopinbos.shop</code>.
        </div>
        <StepActions onBack={onBack} onNext={onNext} nextLabel="Save & continue" disabled={disabled} />
      </div>
    </div>
  );
}

function LaunchStep({
  slug,
  template,
  storeName,
  builtStore,
  onDashboard,
}: {
  slug: string;
  template: (typeof sellerTemplates)[number];
  storeName: string;
  builtStore: RexStoreConfig | null;
  onDashboard: () => Promise<void> | void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto bg-[linear-gradient(180deg,var(--teal-50),var(--canvas)_70%)] px-7 py-10">
      <div className="relative w-full max-w-[780px] text-center">
        <MascotFigure role="seller" variant={0} className="mx-auto mb-3 w-[170px]" />
        <h1 className="m-0 font-display text-[54px] font-normal leading-none tracking-normal text-[var(--ink-900)]">
          Your shop is <em className="text-[var(--teal-700)]">live.</em>
        </h1>
        <div className="mb-7 mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--teal-300)] bg-white px-4 py-2 font-mono text-[14px] text-[var(--teal-800)] shadow-[var(--shd-sm)]">
          <Icon name="globe" size={14} />
          {slug}.shopinbos.shop
          <Icon name="link" size={12} />
        </div>
        <div className="mx-auto mb-5 max-w-[360px]">
          <StorePhonePreview template={template} storeName={storeName} builtStore={builtStore} />
        </div>
        <div className="card mb-5 text-left">
          <div className="onb-card-kicker mb-3 text-center">Quick wins - do these first</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { icon: "instagram" as IconName, label: "Share your shop", body: "On Instagram story and WhatsApp status" },
              { icon: "whatsapp" as IconName, label: "Connect WhatsApp Business", body: "Take orders from chat" },
              { icon: "megaphone" as IconName, label: "Sync Instagram catalog", body: "Turn photos into shoppable posts" },
              { icon: "sparkle" as IconName, label: "Set up Peggy's daily brief", body: "Wake up to a sales summary" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 rounded-[10px] bg-[var(--ink-50)] px-3 py-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-[9px] bg-[var(--teal-100)] text-[var(--teal-700)]">
                  <Icon name={item.icon} size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-[var(--ink-900)]">{item.label}</div>
                  <div className="truncate text-[11px] text-[var(--ink-500)]">{item.body}</div>
                </div>
                <Icon name="chevron" size={14} color="var(--ink-400)" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-center gap-2">
          <button type="button" className="btn btn-ghost btn-lg">
            <Icon name="eye" size={15} /> Visit my shop
          </button>
          <button type="button" onClick={() => void onDashboard()} className="btn btn-mint btn-lg">
            Go to dashboard <Icon name="arrow" size={15} />
          </button>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-[12.5px] text-[var(--ink-500)]">
          <ChipAvatar mascot="peggy" size={26} /> Peggy is keeping an eye on things. Talk to her any time.
        </div>
      </div>
    </div>
  );
}

function LogisticsOnboardingStage({
  roleText,
  step,
  total,
  onBack,
  onNext,
  onSubmit,
}: {
  roleText: string;
  step: number;
  total: number;
  onBack: () => void;
  onNext: () => Promise<void>;
  onSubmit: (payload: {
    zones: LogisticsCoverageZone[];
    vehicleTypes: string[];
    deliveryTypes: string[];
    basePrice: number;
    estimatedSpeed: string;
    completed?: boolean;
  }) => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("Lagos");
  const [country, setCountry] = useState("Nigeria");
  const [zones, setZones] = useState<LogisticsCoverageZone[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([]);
  const [deliveryTypes, setDeliveryTypes] = useState<string[]>([]);
  const [basePrice, setBasePrice] = useState(900);
  const [estimatedSpeed, setEstimatedSpeed] = useState("");
  const [newZoneCountry, setNewZoneCountry] = useState("");
  const [newZoneRegion, setNewZoneRegion] = useState("");
  const [newZoneScope, setNewZoneScope] = useState<DeliveryScope>("intrastate");
  const [newZonePrice, setNewZonePrice] = useState(900);

  useEffect(() => {
    fetch("/api/logistics/onboarding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setCompanyName(data.displayName || data.companyName || "");
        setDescription(data.description || "");
        setCity(data.city || "Lagos");
        setCountry(data.country || "Nigeria");

        const mapZones = data.coverageMap?.zones;
        if (Array.isArray(mapZones) && mapZones.length > 0) {
          setZones(mapZones);
        } else if (Array.isArray(data.coverageZones)) {
          const bp = data.basePrice || 900;
          setZones(data.coverageZones.map((name: string) => ({ name, country: data.country || "Nigeria", region: "", scope: "intrastate" as DeliveryScope, service: "Same-day", basePrice: bp, active: true })));
        }

        if (Array.isArray(data.vehicleTypes) && data.vehicleTypes.length > 0) setVehicleTypes(data.vehicleTypes);
        if (Array.isArray(data.deliveryTypes) && data.deliveryTypes.length > 0) setDeliveryTypes(data.deliveryTypes);
        if (data.basePrice) setBasePrice(data.basePrice);
        if (data.estimatedSpeed) setEstimatedSpeed(data.estimatedSpeed);
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveProgress(completed = false) {
    setSaving(true);
    try {
      const activeZones = zones.filter((z) => z.active);
      const response = await fetch("/api/logistics/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country,
          city,
          description,
          coverageZones: activeZones.map((z) => z.name),
          coverageMap: { zones, depot: `${city} depot`, updatedBy: "onboarding" },
          vehicleTypes,
          deliveryTypes,
          pricingModel: "fixed",
          basePrice,
          estimatedSpeed,
          completed,
        }),
      });
      if (!response.ok) throw new Error("Could not save progress.");
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    await saveProgress(false);
    await onNext();
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const activeZones = zones.filter((z) => z.active);
      const lowestBasePrice = activeZones.reduce((lowest, z) => Math.min(lowest, z.basePrice), basePrice);
      await saveProgress(true);
      await onSubmit({
        zones,
        vehicleTypes,
        deliveryTypes,
        basePrice: lowestBasePrice,
        estimatedSpeed: estimatedSpeed || (deliveryTypes.includes("express") ? "45-90 minutes in active zones" : "Same-day in active zones"),
        completed: true,
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleZone(name: string) {
    setZones((prev) => prev.map((z) => (z.name === name ? { ...z, active: !z.active } : z)));
  }

  function addZone() {
    if (!newZoneCountry || !newZoneRegion || newZonePrice <= 0) return;
    const scopeLabel = deliveryScopeOptions.find((o) => o.value === newZoneScope)?.label || newZoneScope;
    const zoneName = `${newZoneRegion} (${scopeLabel})`;
    const exists = zones.some((z) => z.region === newZoneRegion && z.country === newZoneCountry && z.scope === newZoneScope);
    if (exists) return;
    setZones((prev) => [...prev, {
      name: zoneName,
      country: newZoneCountry,
      region: newZoneRegion,
      scope: newZoneScope,
      service: "Same-day",
      basePrice: newZonePrice,
      active: true,
    }]);
  }

  function removeZone(name: string) {
    setZones((prev) => prev.filter((z) => z.name !== name));
  }

  function toggleList(value: string, setter: (next: string[]) => void, current: string[]) {
    setter(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  }

  if (loading) {
    return (
      <div className="stage bg-[var(--canvas)] px-7 py-6">
        <RoleTopBar step={step} total={total} />
        <div className="flex items-center justify-center py-20 text-[var(--ink-500)]">Loading your profile...</div>
      </div>
    );
  }

  const isLastStep = step === total;
  const activeZoneCount = zones.filter((z) => z.active).length;

  return (
    <div className="stage bg-[var(--canvas)] px-7 py-6">
      <RoleTopBar step={step} total={total} />
      <div className="mx-auto w-full max-w-[680px]">
        {step === 1 && (
          <div>
            <h1 className="onb-title">Tell us about your company</h1>
            <p className="onb-sub">Sellers will see this info when requesting quotes.</p>
            <div className="card mt-6 space-y-4">
              <div className="field">
                <label className="label">Company name</label>
                <input className="inp" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Swift Riders Logistics" />
              </div>
              <div className="field">
                <label className="label">City</label>
                <input className="inp" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Lagos" />
              </div>
              <div className="field">
                <label className="label">Country</label>
                <select className="inp" value={country} onChange={(e) => setCountry(e.target.value)}>
                  <option value="">Select a country</option>
                  {westAfricaCountries.map((c) => (
                    <option key={c.code} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">About your business</label>
                <textarea className="ta" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell sellers what makes your delivery service reliable..." />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button type="button" onClick={onBack} className="btn btn-ghost">Back</button>
              <button type="button" onClick={handleNext} className="btn btn-mint btn-lg" disabled={saving || !companyName.trim()}>
                {saving ? "Saving..." : "Continue"} <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 className="onb-title">Where do you operate?</h1>
            <p className="onb-sub">Select the country, region, and delivery scope for each zone you cover.</p>

            <div className="card mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="field">
                  <label className="label">Country</label>
                  <select
                    className="inp"
                    value={newZoneCountry}
                    onChange={(e) => {
                      setNewZoneCountry(e.target.value);
                      setNewZoneRegion("");
                    }}
                  >
                    <option value="">Select country</option>
                    {westAfricaCountries.map((c) => (
                      <option key={c.code} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Region / State</label>
                  <select
                    className="inp"
                    value={newZoneRegion}
                    onChange={(e) => setNewZoneRegion(e.target.value)}
                    disabled={!newZoneCountry}
                  >
                    <option value="">Select region</option>
                    {westAfricaCountries
                      .find((c) => c.name === newZoneCountry)
                      ?.regions.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label className="label">Delivery scope</label>
                <div className="flex flex-wrap gap-2">
                  {deliveryScopeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNewZoneScope(opt.value)}
                      className={`chip ${newZoneScope === opt.value ? "on" : ""}`}
                      title={opt.description}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[11px] text-[var(--ink-500)]">
                  {deliveryScopeOptions.find((o) => o.value === newZoneScope)?.description}
                </div>
              </div>

              <div className="flex items-end gap-3">
                <div className="field flex-1">
                  <label className="label">Base price (NGN)</label>
                  <input
                    className="inp"
                    type="number"
                    value={newZonePrice}
                    onChange={(e) => setNewZonePrice(Number(e.target.value))}
                    min={0}
                    step={100}
                    placeholder="e.g. 1200"
                  />
                </div>
                <button
                  type="button"
                  onClick={addZone}
                  className="btn btn-mint"
                  disabled={!newZoneCountry || !newZoneRegion || newZonePrice <= 0}
                  style={{ marginBottom: 1 }}
                >
                  <Icon name="plus" size={13} /> Add zone
                </button>
              </div>
            </div>

            {zones.length > 0 && (
              <div className="card mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[var(--ink-900)]">Your zones ({zones.length})</span>
                </div>
                {zones.map((zone, i) => (
                  <div key={`${zone.country}-${zone.region}-${zone.scope}`} className="flex items-center gap-3 border-t border-[var(--ink-100)] py-2.5 first:border-t-0">
                    <button type="button" onClick={() => toggleZone(zone.name)} className={`flex h-5 w-5 items-center justify-center rounded-full border-2 shrink-0 ${zone.active ? "border-[var(--teal-600)] bg-[var(--teal-600)]" : "border-[var(--ink-300)]"}`}>
                      {zone.active && <Icon name="check" size={11} color="white" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-semibold text-[var(--ink-900)]">{zone.region}</span>
                        <span className="chip text-[10px]">{zone.country}</span>
                        <span className="chip on text-[10px]">{deliveryScopeOptions.find((o) => o.value === zone.scope)?.label || zone.scope}</span>
                      </div>
                      <div className="text-[11.5px] text-[var(--ink-500)]">
                        ₦{zone.basePrice.toLocaleString()} · {zone.service}
                      </div>
                    </div>
                    <button type="button" onClick={() => removeZone(zone.name)} className="btn btn-ghost btn-sm text-[var(--rose-600)] shrink-0">
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {zones.length > 0 && (
              <div className="mt-3 rounded-[12px] bg-[var(--teal-50)] px-4 py-3 text-[12px] text-[var(--teal-800)]">
                <strong>{activeZoneCount}</strong> of {zones.length} zones active
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button type="button" onClick={onBack} className="btn btn-ghost">Back</button>
              <button type="button" onClick={handleNext} className="btn btn-mint btn-lg" disabled={saving || activeZoneCount === 0}>
                {saving ? "Saving..." : "Continue"} <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 className="onb-title">Your fleet & services</h1>
            <p className="onb-sub">Select what vehicles you use and what delivery options you offer.</p>
            <div className="card mt-6 space-y-5">
              <div>
                <div className="label mb-2">Vehicle types</div>
                <div className="flex flex-wrap gap-2">
                  {["bike", "van", "truck"].map((vehicle) => (
                    <button key={vehicle} type="button" onClick={() => toggleList(vehicle, setVehicleTypes, vehicleTypes)} className={`chip ${vehicleTypes.includes(vehicle) ? "on" : ""}`}>
                      {vehicle}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="label mb-2">Delivery types</div>
                <div className="flex flex-wrap gap-2">
                  {["same_day", "express", "next_day", "bulk"].map((delivery) => (
                    <button key={delivery} type="button" onClick={() => toggleList(delivery, setDeliveryTypes, deliveryTypes)} className={`chip ${deliveryTypes.includes(delivery) ? "on" : ""}`}>
                      {delivery.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button type="button" onClick={onBack} className="btn btn-ghost">Back</button>
              <button type="button" onClick={handleNext} className="btn btn-mint btn-lg" disabled={saving || vehicleTypes.length === 0 || deliveryTypes.length === 0}>
                {saving ? "Saving..." : "Continue"} <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h1 className="onb-title">Set your pricing</h1>
            <p className="onb-sub">Define your base rate and estimated delivery speed. You can adjust these later.</p>
            <div className="card mt-6 space-y-4">
              <div className="field">
                <label className="label">Base price (NGN)</label>
                <input className="inp" type="number" value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} min={0} step={100} placeholder="e.g. 900" />
              </div>
              <div className="field">
                <label className="label">Estimated delivery speed</label>
                <input className="inp" value={estimatedSpeed} onChange={(e) => setEstimatedSpeed(e.target.value)} placeholder="e.g. Same-day within Lagos" />
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {["Same-day in active zones", "45-90 minutes in active zones", "Next-day within city", "2-3 business days"].map((s) => (
                    <button key={s} type="button" onClick={() => setEstimatedSpeed(s)} className="chip text-[11px]">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button type="button" onClick={onBack} className="btn btn-ghost">Back</button>
              <button type="button" onClick={handleNext} className="btn btn-mint btn-lg" disabled={saving || basePrice <= 0}>
                {saving ? "Saving..." : "Continue"} <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <h1 className="onb-title">Review & submit</h1>
            <p className="onb-sub">Check everything looks right before submitting for admin review.</p>
            <div className="card mt-6 space-y-3">
              <div className="flex justify-between border-b border-[var(--ink-100)] pb-2 text-[13px]">
                <span className="text-[var(--ink-500)]">Company</span>
                <span className="font-semibold">{companyName}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--ink-100)] pb-2 text-[13px]">
                <span className="text-[var(--ink-500)]">Location</span>
                <span className="font-semibold">{city}, {country}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--ink-100)] pb-2 text-[13px]">
                <span className="text-[var(--ink-500)]">Active zones</span>
                <span className="font-semibold">{activeZoneCount} of {zones.length}</span>
              </div>
              {zones.filter((z) => z.active).length > 0 && (
                <div className="border-b border-[var(--ink-100)] pb-2">
                  <div className="text-[11px] text-[var(--ink-500)] mb-1.5">Zone details</div>
                  {zones.filter((z) => z.active).map((z) => (
                    <div key={z.name} className="flex items-center gap-2 text-[12px] py-1">
                      <span className="font-semibold text-[var(--ink-800)]">{z.region}</span>
                      <span className="chip text-[9px]">{z.country}</span>
                      <span className="chip on text-[9px]">{deliveryScopeOptions.find((o) => o.value === z.scope)?.label || z.scope}</span>
                      <span className="ml-auto font-display">₦{z.basePrice.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between border-b border-[var(--ink-100)] pb-2 text-[13px]">
                <span className="text-[var(--ink-500)]">Vehicles</span>
                <span className="font-semibold">{vehicleTypes.join(", ") || "None"}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--ink-100)] pb-2 text-[13px]">
                <span className="text-[var(--ink-500)]">Delivery types</span>
                <span className="font-semibold">{deliveryTypes.map((d) => d.replace("_", " ")).join(", ") || "None"}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--ink-100)] pb-2 text-[13px]">
                <span className="text-[var(--ink-500)]">Base price</span>
                <span className="font-semibold">₦{basePrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--ink-500)]">Est. speed</span>
                <span className="font-semibold">{estimatedSpeed || "—"}</span>
              </div>
            </div>
            {description && (
              <div className="card mt-3">
                <div className="text-[12px] text-[var(--ink-500)]">About</div>
                <p className="mt-1 text-[13px]">{description}</p>
              </div>
            )}
            <div className="mt-3 rounded-[12px] bg-[var(--amber-50)] px-4 py-3 text-[12px] text-[var(--amber-800)]">
              Once submitted, an admin will review your profile. You will be notified when your account is verified and ready to accept bookings.
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button type="button" onClick={onBack} className="btn btn-ghost">Back</button>
              <button type="button" onClick={handleSubmit} className="btn btn-mint btn-lg" disabled={saving}>
                {saving ? "Submitting..." : "Submit for admin review"} <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
