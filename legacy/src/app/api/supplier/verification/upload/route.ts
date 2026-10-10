import { NextRequest, NextResponse } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { uploadVerificationDoc, deleteVerificationDoc } from "@/app/actions/verification";
import type { AuthUser } from "@/lib/auth/types";

export const POST = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const docType = formData.get("docType") as string;

    if (!file || !docType) {
      return NextResponse.json({ success: false, error: "Missing file or docType" }, { status: 400 });
    }

    const uploadForm = new FormData();
    uploadForm.append("file", file);

    const result = await uploadVerificationDoc("supplier", docType as any, uploadForm);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
});

export const DELETE = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  try {
    const { docId } = await req.json();
    const result = await deleteVerificationDoc("supplier", docId);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
});
