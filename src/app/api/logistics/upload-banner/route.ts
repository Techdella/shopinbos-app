import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(["logistics_partner"], "/logistics/login");
    const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("banner") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const { uploadFileServer } = await import("@/lib/supabase/storage.server");
    const { publicUrl } = await uploadFileServer("logistics-banners", file, `banners/${partner.id}/${file.name}`);

    await db.logisticsPartner.update({ where: { id: partner.id }, data: { bannerUrl: publicUrl } });
    return NextResponse.json({ url: publicUrl });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
