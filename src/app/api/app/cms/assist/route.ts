import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { ASSIST_TASKS, assistWriting } from "@/lib/cms/ai.server";
import { sellerStore } from "@/lib/cms/server";
import { aiOff, cmsFailure, noStore } from "../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/app/cms/assist — "Ask Rex" inside the rich text editor: a new section, the next part, or a rewrite of
// the selection. Returns Markdown, which the editor turns into blocks.
const Body = z.object({
  task: z.enum(ASSIST_TASKS),
  instruction: z.string().trim().max(1500).default(""),
  selection: z.string().max(8000).default(""),
  before: z.string().max(6000).default(""),
  title: z.string().max(200).default(""),
  collection: z.string().max(80).default("blog"),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return noStore();
  try {
    const body = Body.parse(await req.json().catch(() => ({})));
    if (body.task === "write" && !body.instruction) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Tell Rex what to write" } }, { status: 422 });
    if (["improve", "shorten", "expand"].includes(body.task) && !body.selection.trim()) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Select the text for Rex to rework" } }, { status: 422 });
    if (!aiConfigured()) return aiOff();
    const limited = await meterAi(user.id, "text");
    if (limited) return limited;
    return NextResponse.json({ data: { markdown: await assistWriting(store.id, store.name, body) } });
  } catch (error) {
    return cmsFailure(error);
  }
});
