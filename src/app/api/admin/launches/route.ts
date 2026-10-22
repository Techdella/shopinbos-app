import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withAdmin } from "@/lib/auth/middleware";
import { REGISTRATION_LAUNCH_KEY, RegistrationLaunchError, getRegistrationLaunch, registrationReadiness, setRegistrationLaunch } from "@/lib/business-registration/launch.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin › Launches: features that stay hidden until the team switches them on (owners and admins only).
//   GET  → { data: { businessRegistration: { live, changedAt, announcementId, ready: { cacVas, paystack }, history } } }
//   POST { feature: "business_registration", live, announce?, note? } → { data: { launch, announced } }
//        The first switch-on emails every seller, supplier and delivery partner (unless announce is false).

const bodySchema = z.object({
  feature: z.literal("business_registration"),
  live: z.boolean(),
  announce: z.boolean().optional(),
  note: z.string().trim().max(500).optional().nullable(),
});

async function view() {
  const [launch, history] = await Promise.all([
    getRegistrationLaunch(),
    db.platformSettingChange.findMany({
      where: { key: REGISTRATION_LAUNCH_KEY },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, after: true, note: true, createdAt: true, changedBy: { select: { name: true, email: true } } },
    }),
  ]);
  return { businessRegistration: { ...launch, ready: registrationReadiness(), history } };
}

export const GET = withAdmin(async () => NextResponse.json({ data: await view() }));

export const POST = withAdmin(async (req: NextRequest, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Say which feature and whether it's on." } }, { status: 400 });
  try {
    const result = await setRegistrationLaunch(parsed.data, { userId: user.id });
    return NextResponse.json({ data: { ...result, view: await view() } });
  } catch (error) {
    if (error instanceof RegistrationLaunchError) return NextResponse.json({ error: { code: "NOT_READY", message: error.message } }, { status: error.status });
    console.error("[admin launches] couldn't change the switch", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Couldn't save that. Try again." } }, { status: 500 });
  }
});
