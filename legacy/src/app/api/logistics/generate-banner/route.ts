import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

export async function POST() {
  try {
    const user = await requireRole(["logistics_partner"], "/logistics/login");
    const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    const city = partner.city || "Lagos";
    const displayName = partner.displayName;

    const prompt = `Professional logistics company banner for "${displayName}" in ${city}. A delivery van on a modern city street, warm golden hour lighting, clean and professional look, 1200x400 pixels, text overlay area on the left.`;

    const pingResult = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        messages: [{ role: "user", content: "Generate a banner image: " + prompt }],
      }),
    }).catch(() => null);

    if (!pingResult || !pingResult.ok) {
      const placeholderUrl = `https://placehold.co/1200x400/3a4ba6/white?text=${encodeURIComponent(displayName + " · " + city)}`;
      await db.logisticsPartner.update({ where: { id: partner.id }, data: { bannerUrl: placeholderUrl } });
      return NextResponse.json({ url: placeholderUrl, note: "Rex AI unavailable — placeholder generated" });
    }

    return NextResponse.json({ url: null, note: "AI generation is not fully set up. Placeholder not applied." });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
