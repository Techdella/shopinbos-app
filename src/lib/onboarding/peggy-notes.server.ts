import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { PEGGY_NOTE_PREFIX, PEGGY_NOTE_SOURCE, readPeggyNote, type PeggyNote } from "./peggy-notes";

// Peggy's call notes (always in English): what she noted during a "Call Peggy" call and the summary she saves at the
// end, plus ElevenLabs' own post-call summary when its webhook is set up. Kept per person in OnboardingResponse
// (source "peggy_call", one row per note, question key "peggy_call:<time>:<id>"), so no new table is needed.
// The team reads them in the admin portal (components/admin/PeggyCallNotes.tsx).

export async function savePeggyNote(input: { userId: string; role: string; text: string; kind: PeggyNote["kind"]; conversationId?: string | null; via?: PeggyNote["via"] }) {
  const now = new Date();
  const answer = { text: input.text.slice(0, 4000), kind: input.kind, via: input.via ?? "peggy", ...(input.conversationId ? { conversationId: input.conversationId.slice(0, 80) } : {}) };
  await db.onboardingResponse.create({
    data: {
      id: randomUUID(),
      userId: input.userId,
      accountType: input.role,
      questionKey: `${PEGGY_NOTE_PREFIX}${now.getTime()}:${randomUUID().slice(0, 8)}`,
      answer: answer as Prisma.InputJsonValue,
      source: PEGGY_NOTE_SOURCE,
    },
  });
}

/** A person's call notes, newest first. */
export async function peggyNotes(userId: string, take = 50): Promise<PeggyNote[]> {
  const rows = await db.onboardingResponse
    .findMany({ where: { userId, source: PEGGY_NOTE_SOURCE }, orderBy: { createdAt: "desc" }, take, select: { id: true, answer: true, createdAt: true } })
    .catch(() => []);
  return rows.map(readPeggyNote).filter((note): note is PeggyNote => note !== null);
}

export interface TeamPeggyNote extends PeggyNote {
  userId: string;
  role: string;
  who: string;
  /** Their admin page (seller, supplier or delivery partner), when they have one. */
  href: string | null;
}

/** Everyone's Peggy notes for Admin › Peggy notes, newest first (summaries left out unless asked for). */
export async function allPeggyNotes(options: { take?: number; summaries?: boolean } = {}): Promise<TeamPeggyNote[]> {
  const rows = await db.onboardingResponse
    .findMany({
      where: { source: PEGGY_NOTE_SOURCE },
      orderBy: { createdAt: "desc" },
      take: Math.min(options.take ?? 200, 500),
      select: { id: true, answer: true, createdAt: true, userId: true, accountType: true },
    })
    .catch(() => []);
  const ids = [...new Set(rows.map((row) => row.userId))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }).catch(() => []) : [];
  const names = new Map(users.map((user) => [user.id, user.name || user.email || "Someone"]));
  const [stores, suppliers, partners] = ids.length
    ? await Promise.all([
        db.store.findMany({ where: { userId: { in: ids } }, select: { id: true, userId: true } }).catch(() => []),
        db.supplier.findMany({ where: { userId: { in: ids } }, select: { id: true, userId: true } }).catch(() => []),
        db.logisticsPartner.findMany({ where: { userId: { in: ids } }, select: { id: true, userId: true } }).catch(() => []),
      ])
    : [[], [], []];
  const hrefs = new Map<string, string>([
    ...stores.map((row) => [row.userId, `/admin/sellers/${row.id}`] as [string, string]),
    ...suppliers.map((row) => [row.userId, `/admin/suppliers/${row.id}`] as [string, string]),
    ...partners.map((row) => [row.userId, `/admin/logistics-partners/${row.id}`] as [string, string]),
  ]);
  return rows
    .map((row) => {
      const note = readPeggyNote(row);
      return note ? { ...note, userId: row.userId, role: row.accountType, who: names.get(row.userId) ?? "Someone", href: hrefs.get(row.userId) ?? null } : null;
    })
    .filter((note): note is TeamPeggyNote => note !== null && (options.summaries || note.kind === "note"));
}
