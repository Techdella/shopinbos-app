import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { withLogistics } from "@/lib/auth/middleware";
import { generateImage, ImageUnavailableError } from "@/lib/ai/images";
import { meterAiCharged, refundAi } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

// Rex makes a wide banner for the partner's public page and saves it as the banner.
export const POST = withLogistics(async (_req, { user }) => {
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true, displayName: true, city: true, vehicleTypes: true } });
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  const metered = await meterAiCharged(user.id, "image");
  if (metered.blocked) return metered.blocked;
  // A failed picture is given back (the credits and the day's cap).
  const giveBack = () => refundAi(user.id, "image", 1, metered.credits);

  const city = partner.city || "Lagos";
  const vehicles = partner.vehicleTypes?.length ? partner.vehicleTypes.join(", ") : "delivery bikes and vans";
  const prompt = `Wide photographic banner for "${partner.displayName}", a delivery company in ${city}, Nigeria. ${vehicles} on a busy, sunny ${city} street, riders in branded jackets, warm golden-hour light, clean professional look. Leave calm space on the left for text. No words, letters or logos in the image.`;

  try {
    const url = await generateImage({ prompt, size: "1536x1024", path: `banners/${user.id}/${Date.now()}` });
    await db.logisticsPartner.update({ where: { id: partner.id }, data: { bannerUrl: url } });
    return NextResponse.json({ url });
  } catch (error) {
    await giveBack();
    const status = error instanceof ImageUnavailableError ? 503 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't make the banner" }, { status });
  }
});
