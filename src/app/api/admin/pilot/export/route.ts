import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { csvCell } from "@/lib/website-leads/pure";
import { APPLICANT_STATUS_LABELS, AVAILABILITY_LABELS, DEVICE_LABELS, PILOT_ROLE_NAME, type ApplicantStatus, type PilotRole } from "@/lib/pilot/pure";
import { PilotNotReady, getProgram } from "@/lib/pilot/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/pilot/export?id=: everyone invited to a pilot, with their reply, as CSV.
export const GET = withAdmin(async (req: NextRequest) => {
  try {
    const program = await getProgram(req.nextUrl.searchParams.get("id") ?? "");
    if (!program) return apiError("NOT_FOUND", "Pilot not found.", 404);
    const head = ["Status", "Role", "Name", "Email", "Phone", "Business", "City", "What they do", "Devices", "Time", "Note", "Invited", "Invited by", "Replied", "Told"];
    const lines = program.applicants.map((a) =>
      [
        APPLICANT_STATUS_LABELS[a.status as ApplicantStatus] ?? a.status,
        PILOT_ROLE_NAME[a.role as PilotRole] ?? a.role,
        a.name,
        a.email,
        a.phone,
        a.businessName,
        a.city,
        a.businessType,
        a.devices.map((d) => DEVICE_LABELS[d as keyof typeof DEVICE_LABELS] ?? d).join("; "),
        a.availability ? AVAILABILITY_LABELS[a.availability as keyof typeof AVAILABILITY_LABELS] ?? a.availability : "",
        a.note,
        a.invitedAt?.toISOString(),
        a.inviteError ? `not sent: ${a.inviteError}` : a.inviteChannel,
        a.appliedAt?.toISOString(),
        a.notifiedAt?.toISOString(),
      ]
        .map(csvCell)
        .join(","),
    );
    return new NextResponse([head.map(csvCell).join(","), ...lines].join("\r\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pilot-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  } catch (error) {
    if (error instanceof PilotNotReady) return apiError("NOT_READY", error.message, 503);
    throw error;
  }
});
