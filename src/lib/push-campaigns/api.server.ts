import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { adminRoleOf } from "@/lib/admin-team/service.server";
import type { AuthUser } from "@/lib/auth/types";
import { PUSH_BODY_MAX, PUSH_TITLE_MAX, parseAudience, resolvePushLink } from "@shared/push-campaigns";
import { PushCampaignError, type Admin, type CampaignInput } from "./campaigns.server";

// Shared by the /api/admin/push routes: body validation and errors in the CLAUDE.md shape.

const Body = z.object({
  title: z.string().trim().min(1, "Write a title.").max(PUSH_TITLE_MAX, `Keep the title to ${PUSH_TITLE_MAX} characters.`),
  body: z.string().trim().min(1, "Write the message.").max(PUSH_BODY_MAX, `Keep the message to ${PUSH_BODY_MAX} characters.`),
  linkKey: z.string().max(40).default("home"),
  customPath: z.string().max(300).optional().nullable(),
  audience: z.unknown(),
  urgent: z.boolean().default(false),
});

export async function readJson(req: NextRequest): Promise<{ data: unknown } | { error: NextResponse }> {
  try {
    return { data: await req.json() };
  } catch {
    return { error: apiError("BAD_REQUEST", "Invalid JSON body", 400) };
  }
}

export function parseCampaignInput(raw: unknown): { data: CampaignInput } | { error: NextResponse } {
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return { error: apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the form", 422) };
  const link = resolvePushLink({ linkKey: parsed.data.linkKey, customPath: parsed.data.customPath });
  if (!link) return { error: apiError("VALIDATION_ERROR", "Pick a screen, or type a web path that starts with / (like /home/orders).", 422) };
  const audience = parseAudience(parsed.data.audience);
  if ("error" in audience) return { error: apiError("VALIDATION_ERROR", audience.error, 422) };
  return { data: { title: parsed.data.title, body: parsed.data.body, linkKey: link.linkKey, link: link.link, appLink: link.appLink, audience: audience.audience, urgent: parsed.data.urgent } };
}

export async function adminOf(user: AuthUser): Promise<Admin> {
  return { id: user.id, name: user.name, email: user.email, adminRole: await adminRoleOf(user.id) };
}

export function pushError(error: unknown) {
  if (error instanceof PushCampaignError) return apiError(error.code, error.message, error.status);
  console.error("[push-center]", error);
  return apiError("INTERNAL_ERROR", "Something went wrong. Try again.", 500);
}
