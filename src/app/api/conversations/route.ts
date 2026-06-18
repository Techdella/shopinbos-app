import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentAppUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Contact {
  id: string;
  name: string;
  type: "seller" | "supplier" | "logistics_partner";
  lastMessage?: string;
  unread?: number;
  lastMessageAt?: string;
}

export async function GET() {
  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  const contactsMap = new Map<string, Contact>();

  async function addUserContact(contactUser: { id: string; name: string; role: string }) {
    const lastMsg = await db.message.findFirst({
      where: {
        conversation: {
          OR: [
            { participant1Id: userId, participant2Id: contactUser.id },
            { participant1Id: contactUser.id, participant2Id: userId },
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      select: { text: true, createdAt: true },
    });

    const unreadCount = await db.message.count({
      where: {
        conversation: {
          OR: [
            { participant1Id: userId, participant2Id: contactUser.id },
            { participant1Id: contactUser.id, participant2Id: userId },
          ],
        },
        senderId: contactUser.id,
        read: false,
      },
    });

    contactsMap.set(contactUser.id, {
      id: contactUser.id,
      name: contactUser.name,
      type: contactUser.role === "logistics_partner" ? "logistics_partner" : contactUser.role === "seller" ? "seller" : "supplier",
      lastMessage: lastMsg?.text ?? undefined,
      unread: unreadCount,
      lastMessageAt: lastMsg?.createdAt.toISOString(),
    });
  }

  if (user.role === "supplier") {
    const supplier = await db.supplier.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (supplier) {
      const [quoteSellers, orderSellers, conversations] = await Promise.all([
        db.supplierQuoteRequest.findMany({
          where: { supplierId: supplier.id },
          distinct: ["sellerId"],
          select: { seller: { select: { id: true, name: true, role: true } } },
          take: 50,
        }),
        db.wholesaleOrder.findMany({
          where: { supplierId: supplier.id },
          distinct: ["sellerId"],
          select: { seller: { select: { id: true, name: true, role: true } } },
          take: 50,
        }),
        db.conversation.findMany({
          where: { OR: [{ participant1Id: user.id }, { participant2Id: user.id }] },
          select: {
            participant1: { select: { id: true, name: true, role: true } },
            participant2: { select: { id: true, name: true, role: true } },
          },
          take: 50,
        }),
      ]);

      const sellerUsers = [
        ...quoteSellers.map((row) => row.seller),
        ...orderSellers.map((row) => row.seller),
        ...conversations.map((row) => row.participant1.id === user.id ? row.participant2 : row.participant1),
      ].filter((contact) => contact.id !== user.id && contact.role === "seller");

      for (const seller of sellerUsers) {
        if (!contactsMap.has(seller.id)) await addUserContact(seller);
      }
    }

    const contacts = Array.from(contactsMap.values()).sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return 0;
    });

    return NextResponse.json({ contacts });
  }

  const suppliers = await db.supplier.findMany({
    where: { status: "active", verificationStatus: "verified" },
    select: { id: true, displayName: true, userId: true },
    take: 50,
  });

  for (const s of suppliers) {
    const contactId = s.id;
    const lastMsg = await db.message.findFirst({
      where: {
        conversation: {
          OR: [
            { participant1Id: user.id, participant2Id: s.userId },
            { participant1Id: s.userId, participant2Id: user.id },
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      select: { text: true, createdAt: true, read: true },
    });

    const unreadCount = lastMsg && !lastMsg.read
      ? await db.message.count({
          where: {
            conversation: {
              OR: [
                { participant1Id: user.id, participant2Id: s.userId },
                { participant1Id: s.userId, participant2Id: user.id },
              ],
            },
            senderId: s.userId,
            read: false,
          },
        })
      : 0;

    contactsMap.set(contactId, {
      id: contactId,
      name: s.displayName,
      type: "supplier",
      lastMessage: lastMsg?.text ?? undefined,
      unread: unreadCount,
      lastMessageAt: lastMsg?.createdAt.toISOString(),
    });
  }

  const logisticsPartners = await db.logisticsPartner.findMany({
    where: { status: "active", verificationStatus: "verified" },
    select: { id: true, displayName: true, userId: true },
    take: 50,
  });

  for (const l of logisticsPartners) {
    if (contactsMap.has(l.id)) continue;
    const contactId = l.id;
    const lastMsg = await db.message.findFirst({
      where: {
        conversation: {
          OR: [
            { participant1Id: user.id, participant2Id: l.userId },
            { participant1Id: l.userId, participant2Id: user.id },
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      select: { text: true, createdAt: true, read: true },
    });

    const unreadCount = lastMsg && !lastMsg.read
      ? await db.message.count({
          where: {
            conversation: {
              OR: [
                { participant1Id: user.id, participant2Id: l.userId },
                { participant1Id: l.userId, participant2Id: user.id },
              ],
            },
            senderId: l.userId,
            read: false,
          },
        })
      : 0;

    contactsMap.set(contactId, {
      id: contactId,
      name: l.displayName,
      type: "logistics_partner",
      lastMessage: lastMsg?.text ?? undefined,
      unread: unreadCount,
      lastMessageAt: lastMsg?.createdAt.toISOString(),
    });
  }

  const contacts = Array.from(contactsMap.values()).sort((a, b) => {
    if (a.lastMessageAt && b.lastMessageAt) return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return 0;
  });

  return NextResponse.json({ contacts });
}
