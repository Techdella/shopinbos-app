import "server-only";
import { db } from "@/lib/db/client";
import { aiAllowanceToday, meterAiCharged, refundAi } from "@/lib/ai/usage";
import { creditBalance, liveCreditPrices } from "@/lib/ai/credits.server";
import { getOpenAIClient } from "@/lib/ai/client";
import { generateImage } from "@/lib/ai/images";
import { planBuild, photoSlotsFor, type BuildBudget, type BuildMode, type BuildPlan } from "@/lib/ai/rex/build-plan";
import { inspirationPrompt, type Inspiration } from "@/lib/ai/rex/inspiration";
import { applyStudioPlan, loadStudioStore, runStudioEdit, type StudioEditResult } from "@/lib/ai/rex/studio-edit.server";
import { applyRexStudioPlan, parseRexStudioPlan } from "@/lib/ai/rex/studio-plan";
import { saveStudioDraft, settingsOf, studioApplyContext, studioDraft, versionsOf } from "@/lib/ai/rex/studio.server";
import { isLibraryTheme, themeLibraryEntry } from "@/lib/store-templates/theme-library";
import type { StoreEditorSnapshot } from "@/lib/store-templates";

// The steps of Rex's full store build after the design (POST /api/ai/build-store): what the seller can afford
// (GET /api/ai/build-store/plan), writing every page (POST …/pages) and the photos (POST …/photos). Each step is
// its own request so the Studio can show real progress and no single request runs past the time limit.

const SAMPLE_TAG = "rex-sample";

export async function buildBudget(userId: string): Promise<BuildBudget> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { aiCredits: true } });
  const [allowance, balance, prices] = await Promise.all([aiAllowanceToday(userId, user?.aiCredits), creditBalance(userId), liveCreditPrices()]);
  const leftOf = (kind: "build" | "text" | "image") => {
    const row = allowance?.find((entry) => entry.kind === kind);
    return row ? Math.max(0, row.limit - row.used) : 0;
  };
  return {
    left: { build: leftOf("build"), text: leftOf("text"), image: leftOf("image") },
    balance,
    costs: { build: prices.costs.build, text: prices.costs.text, image: prices.costs.image },
  };
}

/** Photo spots before a build: banner, story, and the sample products Rex will add (a store with none gets up to six). */
export async function photoSlotsBeforeBuild(userId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  if (!store) return photoSlotsFor(6);
  const [products, samplesWithout] = await Promise.all([
    db.storeProduct.count({ where: { storeId: store.id, status: { not: "archived" } } }),
    db.storeProduct.count({ where: { storeId: store.id, tags: { has: SAMPLE_TAG }, images: { isEmpty: true } } }),
  ]);
  return photoSlotsFor(products === 0 ? 6 : samplesWithout);
}

export async function planFor(userId: string, mode: BuildMode): Promise<{ plan: BuildPlan; budget: BuildBudget; imagesOn: boolean }> {
  const [budget, slots] = await Promise.all([buildBudget(userId), photoSlotsBeforeBuild(userId)]);
  const imagesOn = Boolean(getOpenAIClient());
  const plan = planBuild(budget, mode, imagesOn ? slots : 0);
  return { plan, budget, imagesOn };
}

/**
 * Moves the draft onto a library theme before Rex writes the design into it (the seller's pick, or the theme Rex
 * chose from their inspiration). Words, extra pages and page titles carry over; nothing else is touched.
 */
export async function switchDraftTheme(userId: string, themeId: string) {
  if (!isLibraryTheme(themeId)) return false;
  const store = await loadStudioStore(userId);
  if (!store) return false;
  const { draft } = studioDraft(store);
  if (draft.templateId === themeId) return false;
  const applied = applyRexStudioPlan(draft, { reply: "", theme: themeId, tokens: null, pages: [], ops: [] }, await studioApplyContext(store));
  if (!applied.themeChanged) return false;
  await saveStudioDraft(store, applied.snapshot, versionsOf(store));
  return true;
}

const FILL_REQUEST = `FULL BUILD, final pass. Finish every page of this store so it is ready for shoppers:
- Every page in the draft (home, shop, collections, product, about, questions, contact and any other) gets real words in every section that is empty or still has template placeholder text, in the store's own voice, for its real business and customers.
- Every page gets a "metaTitle" (under 60 characters, with the store name) and a "metaDescription" (under 155 characters) in "pages".
- Make sure there is an About us page with a story section that tells the business's story, and a Questions page with a "faq" section (leave answers about delivery, payment and returns empty so they fill from the store's settings).
- The home page: keep the headline already there unless it's a placeholder; make sure it has a story section and a newsletter section.
- Use as many ops as you need (up to 20). Don't change the theme or colours.
- Never invent reviews, prices, discounts, delivery times, awards or customer numbers.`;

/** The writing pass: every page's words and search titles, as one new version of the draft. */
export async function writeEveryPage(userId: string, inspiration: Inspiration | null): Promise<StudioEditResult | null> {
  const store = await loadStudioStore(userId);
  if (!store) return null;
  const themeName = inspiration?.themeId ? themeLibraryEntry(inspiration.themeId)?.name ?? null : null;
  return runStudioEdit(store, {
    // Words only here: the pictures were for the design step.
    message: `${FILL_REQUEST}${inspirationPrompt(inspiration ? { ...inspiration, screenshots: [], links: inspiration.links.map((link) => ({ ...link, imageUrl: null })) } : null, themeName)}`,
    label: "Wrote every page",
  });
}

interface PhotoJob {
  key: string;
  prompt: string;
  size: "1536x1024" | "1024x1024";
  apply: { type: "section"; page: string; sectionId: string; kind: string } | { type: "product"; id: string };
  label: string;
}

const NO_TEXT = "No text, words, letters, logos or watermarks.";

/**
 * What to photograph. The banner and story picture are always made fresh, so a rebuilt or restyled store never
 * keeps the old look's pictures (the previous ones stay in the draft's versions, so undo brings them back).
 * A quick build makes the banner and the first product only.
 */
function photoJobs(draft: StoreEditorSnapshot, context: { name: string; about: string; heroPrompt: string | null; storyPrompt: string | null }, products: Array<{ id: string; name: string; description: string | null }>, mode: BuildMode) {
  const jobs: PhotoJob[] = [];
  const home = draft.pages.find((page) => page.pageType === "home");
  const hero = home?.sections.find((section) => section.kind === "hero-split" && section.visible !== false);
  if (home && hero) {
    jobs.push({
      key: "hero",
      prompt: `${context.heroPrompt ?? `A bright, premium lifestyle photo for the online store "${context.name}": ${context.about}`}. Wide banner composition with calm space on one side. ${NO_TEXT}`,
      size: "1536x1024",
      apply: { type: "section", page: "home", sectionId: hero.id, kind: hero.kind },
      label: "Made the homepage banner photo",
    });
  }
  const storyPage = [home, draft.pages.find((page) => page.pageType === "about")].find((page) => page?.sections.some((section) => (section.kind === "story-split" || section.kind === "about-section") && section.visible !== false));
  const story = storyPage?.sections.find((section) => (section.kind === "story-split" || section.kind === "about-section") && section.visible !== false);
  if (mode === "full" && storyPage && story) {
    jobs.push({
      key: "story",
      prompt: `${context.storyPrompt ?? `A warm, real-feeling photo behind the scenes of "${context.name}" (${context.about}): hands at work, the workshop or the products being prepared, African setting`}. ${NO_TEXT}`,
      size: "1024x1024",
      apply: { type: "section", page: storyPage.pageType, sectionId: story.id, kind: story.kind },
      label: "Made the story photo",
    });
  }
  for (const product of mode === "quick" ? products.slice(0, 1) : products) {
    const name = product.name.replace(/\s*\(sample\)\s*$/i, "");
    const detail = product.description?.split(". Sample product")[0]?.trim();
    jobs.push({
      key: `product-${product.id}`,
      prompt: `Clean studio product photo of ${name}${detail ? ` (${detail})` : ""} for the online store "${context.name}". Soft natural light, plain light background, the whole product in frame. ${NO_TEXT}`,
      size: "1024x1024",
      apply: { type: "product", id: product.id },
      label: `Made a photo for ${name}`,
    });
  }
  return jobs;
}

async function inBatches<T>(tasks: Array<() => Promise<T>>, size: number) {
  const results: PromiseSettledResult<T>[] = [];
  for (let index = 0; index < tasks.length; index += size) {
    results.push(...(await Promise.allSettled(tasks.slice(index, index + size).map((task) => task()))));
  }
  return results;
}

export interface PhotosResult {
  made: number;
  skipped: number;
  changes: string[];
  notes: string[];
  edit: StudioEditResult | null;
}

/**
 * The photo pass: banner, story and sample-product photos, as many as `maxPhotos`, the allowance and the credits
 * allow (re-planned here, never trusted from the browser). Free photos are metered first, then the paid ones, and
 * a photo the image service fails to make is given back (allowance and credits).
 */
export async function addBuildPhotos(userId: string, maxPhotos: number, mode: BuildMode = "full"): Promise<PhotosResult> {
  const notes: string[] = [];
  const store = await loadStudioStore(userId);
  if (!store) return { made: 0, skipped: 0, changes: [], notes: ["Set up your store first."], edit: null };
  if (!getOpenAIClient()) {
    return { made: 0, skipped: 0, changes: [], notes: ["Photos were skipped: image generation needs an OpenAI key (OPENAI_API_KEY). The store uses colour blocks until you add photos."], edit: null };
  }
  const { draft } = studioDraft(store);
  const settings = settingsOf(store) as Record<string, unknown>;
  const rexDraft = (settings.rexDraft && typeof settings.rexDraft === "object" ? settings.rexDraft : {}) as Record<string, unknown>;
  const plan = (rexDraft.plan && typeof rexDraft.plan === "object" ? rexDraft.plan : {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 600) : null);

  const samples = await db.storeProduct.findMany({
    where: { storeId: store.id, tags: { has: SAMPLE_TAG }, images: { isEmpty: true }, status: { not: "archived" } },
    orderBy: { createdAt: "asc" },
    take: 6,
    select: { id: true, name: true, description: true },
  });
  const all = photoJobs(draft, { name: store.name, about: store.description ?? "", heroPrompt: text(plan.heroImagePrompt), storyPrompt: text(plan.storyImagePrompt) }, samples, mode);

  const budget = await buildBudget(userId);
  const affordable = planBuild({ ...budget, left: { ...budget.left, build: 1, text: 1 } }, mode, all.length);
  const jobs = all.slice(0, Math.max(0, Math.min(maxPhotos, affordable.photos)));
  const skipped = all.length - jobs.length;
  if (!jobs.length) {
    return { made: 0, skipped, changes: [], notes: skipped ? ["Photos were skipped: today's picture allowance and your AI credits are used up."] : [], edit: null };
  }

  // Free photos, then paid ones (a single metered call for all would charge credits for the free ones too). Each
  // batch remembers what it cost, so failed photos can be given back.
  const free = Math.min(jobs.length, affordable.freePhotos);
  const batches: Array<{ units: number; credits: number }> = [];
  for (const units of [free, jobs.length - free]) {
    if (units <= 0) continue;
    const metered = await meterAiCharged(userId, "image", units);
    if (metered.blocked) break;
    batches.push({ units, credits: metered.credits });
  }
  const run = jobs.slice(0, batches.reduce((sum, batch) => sum + batch.units, 0));
  if (run.length < jobs.length) notes.push("Some photos were skipped: today's picture allowance and your AI credits ran out.");

  const stamp = Date.now();
  const results = await inBatches(
    run.map((job) => () => generateImage({ prompt: job.prompt, size: job.size, path: `generated/${userId}/rex-build-${job.key}-${stamp}` })),
    4,
  );

  const ops: Array<Record<string, unknown>> = [];
  const changes: string[] = [];
  let made = 0;
  for (const [index, result] of results.entries()) {
    const job = run[index]!;
    if (result.status === "rejected") {
      console.error("[rex/full-build] photo failed", job.key, result.reason);
      continue;
    }
    made += 1;
    if (job.apply.type === "product") {
      await db.storeProduct.update({ where: { id: job.apply.id }, data: { images: [result.value] } }).catch(() => null);
      changes.push(job.label);
    } else {
      ops.push({ action: "update", page: job.apply.page, kind: job.apply.kind, sectionId: job.apply.sectionId, imageUrl: result.value, summary: job.label });
    }
  }
  const failed = run.length - made;
  if (failed > 0) {
    // Give the failed photos back, the paid ones first (they cost the seller credits).
    let left = failed;
    let refunded = 0;
    for (const batch of [...batches].reverse()) {
      const units = Math.min(left, batch.units);
      if (units <= 0) break;
      const credits = Math.round((batch.credits / batch.units) * units);
      await refundAi(userId, "image", units, credits);
      refunded += credits;
      left -= units;
    }
    notes.push(
      `${failed} photo${failed === 1 ? "" : "s"} couldn't be made just now, so those spots use colour blocks.${refunded ? ` Your ${refunded} AI credit${refunded === 1 ? " was" : "s were"} given back.` : " Your picture allowance was given back."}`,
    );
  }

  let edit: StudioEditResult | null = null;
  const parsed = ops.length ? parseRexStudioPlan({ reply: "", ops }) : null;
  if (parsed) {
    const fresh = await loadStudioStore(userId);
    if (fresh) edit = await applyStudioPlan(fresh, parsed, "Added photos");
    changes.unshift(...(edit?.changes ?? []));
  }
  return { made, skipped: skipped + (jobs.length - run.length), changes, notes, edit };
}
