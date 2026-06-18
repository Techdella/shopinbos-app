import "server-only";
import { Resend } from "resend";
import type { SendResult } from "./types";

const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;

export interface EmailOptions {
  to: string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  success: boolean;
  id?: string;
  message?: string;
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL ?? "Shopinbos <noreply@shopinbos.com>";

export async function sendEmail(options: EmailOptions): Promise<EmailSendResult> {
  const resend = getResendClient();
  if (!resend) {
    return { success: false, message: "Resend API key not configured" };
  }

  const { data, error } = await resend.emails.send({
    from: options.from ?? DEFAULT_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    replyTo: options.replyTo,
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, id: data?.id };
}

export async function sendOrderConfirmationEmail(
  to: string,
  orderNumber: string,
  storeName: string,
  items: { name: string; qty: number; price: string }[],
  total: string,
): Promise<EmailSendResult> {
  const itemsHtml = items.map(
    (item) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${item.name} × ${item.qty}</td><td style="text-align:right;padding:8px 0;border-bottom:1px solid #eee">${item.price}</td></tr>`,
  ).join("");

  return sendEmail({
    to: [to],
    subject: `Order confirmed — ${orderNumber}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="font-size:20px;margin:0 0 8px">Thank you for your order!</h2>
        <p style="color:#666;margin:0 0 20px">Your order <strong>${orderNumber}</strong> from <strong>${storeName}</strong> is confirmed.</p>
        <table style="width:100%;border-collapse:collapse">${itemsHtml}</table>
        <div style="margin-top:16px;text-align:right;font-weight:700;font-size:18px">Total: ${total}</div>
        <p style="color:#888;font-size:13px;margin-top:24px">We'll send you a shipping update soon.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
): Promise<EmailSendResult> {
  return sendEmail({
    to: [to],
    subject: "Reset your Shopinbos password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="font-size:18px;margin:0 0 12px">Reset your password</h2>
        <p style="color:#555;line-height:1.6">Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#195754;color:white;text-decoration:none;border-radius:8px;margin:16px 0;font-weight:600">Reset password</a>
        <p style="color:#999;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPayoutNotification(
  to: string,
  amount: string,
  status: "paid" | "pending" | "failed",
): Promise<EmailSendResult> {
  const statusColors: Record<string, string> = {
    paid: "#059669",
    pending: "#D97706",
    failed: "#DC2626",
  };

  return sendEmail({
    to: [to],
    subject: `Payout ${status} — ${amount}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="font-size:18px;margin:0 0 8px">Payout ${status === "paid" ? "completed" : status === "pending" ? "processing" : "failed"}</h2>
        <p style="color:#555">Amount: <strong style="font-size:20px;color:${statusColors[status]}">${amount}</strong></p>
        <p style="color:#888;font-size:13px;margin-top:16px">Status: <span style="color:${statusColors[status]};font-weight:600">${status.toUpperCase()}</span></p>
      </div>
    `,
  });
}

export async function sendSellerNotification(
  to: string,
  notification: { title: string; description: string; type?: string },
): Promise<EmailSendResult> {
  return sendEmail({
    to: [to],
    subject: notification.title,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <p style="color:#333;line-height:1.6;font-size:15px">${notification.description}</p>
        <p style="color:#999;font-size:12px;margin-top:24px">Shopinbos · ${notification.type ?? "notification"}</p>
      </div>
    `,
  });
}

export async function addContactToAudience(
  email: string,
  firstName?: string,
  lastName?: string,
): Promise<{ success: boolean; message?: string }> {
  if (!RESEND_AUDIENCE_ID) {
    return { success: false, message: "Resend audience ID not configured" };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: false, message: "Resend API key not configured" };
  }

  const { data, error } = await resend.contacts.create({
    email,
    firstName,
    lastName,
    audienceId: RESEND_AUDIENCE_ID,
  });

  if (error) return { success: false, message: error.message };
  return { success: true };
}
