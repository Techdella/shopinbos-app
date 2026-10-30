import { NextRequest } from "next/server";
import { z } from "zod";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { isPhone } from "@shared/cart-checkout";
import { checkLink, liveStore, publicActionLimited, tablesMissing } from "@/lib/pay-together/common.server";
import { startPartPayment, startPlan } from "@/lib/pay-together/instalments.server";
import { joinAjoGroup, startAjoContribution } from "@/lib/pay-together/ajo.server";
import { joinGroupBuy, startGroupPayLink } from "@/lib/pay-together/group-buy.server";
import { createPhoneChallenge, phoneVerifySecret, PHONE_CODE_RESEND_SECONDS } from "@/lib/commerce/phone-verify";
import { checkoutPhone, phoneCodeSendLimited, phoneVerificationAvailable, sendPhoneCode } from "@/lib/commerce/phone-verify.server";
import { db } from "@/lib/db/client";
import { featureOnForStore } from "@/lib/pay-together/common.server";

// The storefront's other ways to buy (pilots pay_small_small, ajo, group_buy; each follows the SHOP OWNER's switch,
// checked in src/lib/pay-together). POST { action, … } → { data: { authorizationUrl, accessCode, reference } } for a
// payment (the browser goes to Paystack; the payment is split straight to the seller's bank), or { data: … } for the
// phone code. Limited per IP (shared across servers). Storefront text is English, like the rest of the store.
//
//   plan.start   start a Pay small small plan (part 1 now)
//   plan.pay     pay the next part (needs the plan link's token)
//   ajo.code     text a phone code to join an ajo group
//   ajo.join     join an ajo group (verified phone, rules accepted, week 1 now)
//   ajo.pay      pay this week's contribution (member link token)
//   group.join   join or start a group buy (₦50 card check, refunded at once)
//   group.pay    pay a group buy after a card couldn't be charged (member link token, within 2 hours)

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Address = z.object({
  street: z.string().trim().min(1, "Enter your street address.").max(200),
  city: z.string().trim().min(1, "Enter your area or city.").max(100),
  state: z.string().trim().max(80).optional(),
  landmark: z.string().trim().max(160).optional(),
});
const Buyer = {
  buyerName: z.string().trim().min(2, "Enter your full name.").max(120),
  buyerEmail: z.string().trim().email("Enter a valid email address.").max(200),
  buyerPhone: z.string().trim().max(40).refine((value) => isPhone(value), "Enter a phone number with 7 to 15 digits."),
  address: Address,
};
const Id = z.string().min(1).max(64);

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan.start"), productId: Id, variantId: Id.optional(), quantity: z.number().int().min(1).max(5).default(1), weeks: z.number().int(), autopay: z.boolean().default(false), ...Buyer }),
  z.object({ action: z.literal("plan.pay"), planId: Id, token: z.string().max(64) }),
  z.object({ action: z.literal("ajo.code"), groupId: Id, phone: z.string().max(40), via: z.enum(["whatsapp", "sms"]).optional() }),
  z.object({ action: z.literal("ajo.join"), groupId: Id, phoneToken: z.string().max(2000).optional(), acceptRules: z.boolean(), autopay: z.boolean().default(false), ...Buyer }),
  z.object({ action: z.literal("ajo.pay"), groupId: Id, memberId: Id, token: z.string().max(64) }),
  z.object({ action: z.literal("group.join"), productId: Id, groupId: Id.optional(), variantId: Id.optional(), ...Buyer }),
  z.object({ action: z.literal("group.pay"), groupId: Id, memberId: Id, token: z.string().max(64) }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const respond = (response: Parameters<typeof withCors>[1]) => {
    const res = withCors(req, response, CORS);
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
  if (await publicActionLimited(req.headers, "storefront", 30)) return respond(apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429));
  const { slug } = await params;
  const store = await liveStore(slug);
  if (!store) return respond(apiError("NOT_FOUND", "Store not found", 404));
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return respond(apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your details and try again."));
  const input = parsed.data;
  const ref = { id: store.id, slug: store.slug, customDomain: store.customDomain, name: store.name };
  const buyer = (data: { buyerName: string; buyerEmail: string; buyerPhone: string }) => ({ name: data.buyerName, email: data.buyerEmail, phone: checkoutPhone(data.buyerPhone) ?? data.buyerPhone });
  const answer = (result: { ok: true } | { ok: false; error: string; code?: string }, data?: unknown) =>
    result.ok ? respond(ok(data ?? result)) : respond(apiError("code" in result && result.code ? result.code : "BAD_REQUEST", result.error));

  try {
    switch (input.action) {
      case "plan.start": {
        // Starting things costs a Paystack call: a tighter limit.
        if (await publicActionLimited(req.headers, "start", 10)) return respond(apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429));
        const result = await startPlan(ref, { productId: input.productId, variantId: input.variantId, quantity: input.quantity, weeks: input.weeks, buyer: buyer(input), address: input.address, autopay: input.autopay });
        return answer(result);
      }
      case "plan.pay": {
        if (!checkLink("plan", input.planId, input.token)) return respond(apiError("NOT_FOUND", "This link isn't valid.", 404));
        return answer(await startPartPayment(ref, input.planId));
      }
      case "ajo.code": {
        const phone = checkoutPhone(input.phone);
        if (!phone) return respond(apiError("BAD_REQUEST", "Enter a phone number with 7 to 15 digits."));
        const group = await db.ajoGroup.findFirst({ where: { id: input.groupId, storeId: store.id, status: "forming" }, select: { id: true } });
        // Codes are only sent for a real, open group of a shop in the pilot (never "text any number from any store").
        if (!group || !(await featureOnForStore(store.id, "ajo"))) return respond(apiError("NOT_FOUND", "This group isn't taking members.", 404));
        if (!phoneVerificationAvailable()) return respond(ok({ required: false }));
        const secret = phoneVerifySecret();
        if (!secret) return respond(apiError("UNAVAILABLE", "We can't send codes right now. Try again later.", 503));
        const limited = await phoneCodeSendLimited(req.headers, phone);
        if (limited) return respond(apiError("RATE_LIMITED", limited, 429));
        const { code, sent } = await sendPhoneCode({ phone, storeName: store.name, via: input.via });
        if (!sent.ok) return respond(apiError("SEND_FAILED", "We couldn't send a code to this number. Check it and try again.", 502));
        const { challenge, expiresAt } = createPhoneChallenge({ phone, storeId: store.id, code }, secret);
        return respond(ok({ required: true, challenge, channel: sent.channel, expiresAt, resendAfter: PHONE_CODE_RESEND_SECONDS }));
      }
      case "ajo.join": {
        if (await publicActionLimited(req.headers, "start", 10)) return respond(apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429));
        const result = await joinAjoGroup(ref, input.groupId, { name: input.buyerName, phone: input.buyerPhone, email: input.buyerEmail, address: input.address, phoneToken: input.phoneToken, acceptRules: input.acceptRules, autopay: input.autopay });
        return answer(result);
      }
      case "ajo.pay": {
        if (!checkLink("ajo", input.memberId, input.token)) return respond(apiError("NOT_FOUND", "This link isn't valid.", 404));
        return answer(await startAjoContribution(ref, input.groupId, input.memberId));
      }
      case "group.join": {
        if (await publicActionLimited(req.headers, "start", 10)) return respond(apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429));
        return answer(await joinGroupBuy(ref, { productId: input.productId, groupId: input.groupId, variantId: input.variantId, buyer: buyer(input), address: input.address }));
      }
      case "group.pay": {
        if (!checkLink("group", input.memberId, input.token)) return respond(apiError("NOT_FOUND", "This link isn't valid.", 404));
        return answer(await startGroupPayLink(ref, input.groupId, input.memberId));
      }
    }
  } catch (error) {
    if (tablesMissing(error)) return respond(apiError("NOT_READY", "This isn't available yet.", 503));
    console.error(`[together] ${input.action} failed`, error);
    return respond(apiError("INTERNAL_ERROR", "Something went wrong. Try again in a moment.", 500));
  }
}
