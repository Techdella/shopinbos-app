import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getCurrentAppUser } from "@/lib/server-auth";
import { sendEmail } from "@/lib/notifications/resend";
import { sendSms } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resolveContactUserId(contactId: string): Promise<string | null> {
  const supplier = await db.supplier.findUnique({
    where: { id: contactId },
    select: { userId: true },
  });
  if (supplier) return supplier.userId;

  const logistics = await db.logisticsPartner.findUnique({
    where: { id: contactId },
    select: { userId: true },
  });
  if (logistics) return logistics.userId;

  const user = await db.user.findFirst({
    where: {
      id: contactId,
      role: { in: ["seller", "supplier", "logistics_partner"] },
    },
    select: { id: true },
  });
  if (user) return user.id;

  return null;
}

async function findOrCreateConversation(userId: string, contactUserId: string) {
  const ids = [userId, contactUserId].sort();
  const existing = await db.conversation.findUnique({
    where: { participant1Id_participant2Id: { participant1Id: ids[0], participant2Id: ids[1] } },
  });
  if (existing) return existing;

  return db.conversation.create({
    data: { participant1Id: ids[0], participant2Id: ids[1] },
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function notifyMessageRecipient(input: {
  senderName: string;
  recipientUserId: string;
  text: string;
}) {
  const recipient = await db.user.findUnique({
    where: { id: input.recipientUserId },
    select: { id: true, email: true, phone: true, role: true },
  });
  if (!recipient) return;

  const preference = await db.notificationPreference.findUnique({
    where: {
      userId_eventKey_category: {
        userId: recipient.id,
        eventKey: "message_received",
        category: "marketplace",
      },
    },
  });

  const inApp = preference?.inApp ?? true;
  const email = preference?.email ?? false;
  const sms = preference?.sms ?? false;
  const title = `New message from ${input.senderName}`;
  const description = input.text.length > 140 ? `${input.text.slice(0, 137)}...` : input.text;

  if (inApp) {
    await db.notification.create({
      data: {
        userId: recipient.id,
        type: "marketplace",
        title,
        description,
        link: recipient.role === "supplier" ? "/supplier/dashboard?messages=1" : "/marketplace?messages=1",
      },
    });
  }

  if (email && recipient.email) {
    await sendEmail({
      to: [recipient.email],
      subject: title,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h2>
          <p style="color:#555;line-height:1.6">${escapeHtml(input.text)}</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Shopinbos marketplace message</p>
        </div>
      `,
    }).catch(() => null);
  }

  if (sms && recipient.phone) {
    await sendSms({
      to: [recipient.phone],
      message: `Shopinbos: ${title}. ${description}`,
      senderName: process.env.SENDCHAMP_SENDER_NAME ?? "Shopinbos",
    }).catch(() => null);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: contactId } = await params;
  const contactUserId = await resolveContactUserId(contactId);
  if (!contactUserId) {
    return NextResponse.json({ messages: [] });
  }

  const conversation = await db.conversation.findFirst({
    where: {
      OR: [
        { participant1Id: user.id, participant2Id: contactUserId },
        { participant1Id: contactUserId, participant2Id: user.id },
      ],
    },
  });

  if (!conversation) {
    return NextResponse.json({ messages: [] });
  }

  await db.message.updateMany({
    where: { conversationId: conversation.id, senderId: contactUserId, read: false },
    data: { read: true },
  });

  const messages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      text: true,
      senderId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      from: m.senderId === user.id ? "me" : m.senderId,
      text: m.text,
      id: m.id,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: contactId } = await params;
  const contactUserId = await resolveContactUserId(contactId);
  if (!contactUserId) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as { text?: string };
  if (!body.text?.trim()) {
    return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  }

  const conversation = await findOrCreateConversation(user.id, contactUserId);

  const message = await db.message.create({
    data: {
      conversationId: conversation.id,
      senderId: user.id,
      text: body.text.trim(),
    },
  });

  await notifyMessageRecipient({
    senderName: user.name,
    recipientUserId: contactUserId,
    text: message.text,
  });

  return NextResponse.json({
    message: { id: message.id, text: message.text, from: "me", sent: true, createdAt: message.createdAt.toISOString() },
  });
}
