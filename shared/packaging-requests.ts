// "Make my packaging for me" (/home/labels/request): what a seller tells the Shopinbos team (and later our branding
// partners) when they want custom packaging, labels or a brand pack made and printed. Validated on the server.

import { z } from "zod";
import { PACK_FORMATS, PRODUCT_TYPES } from "./packaging.ts";

export const PACKAGING_SERVICES = ["design", "print", "brand_identity", "photography", "barcode_registration"] as const;
export type PackagingService = (typeof PACKAGING_SERVICES)[number];

export const PACKAGING_SERVICE_LABEL: Record<PackagingService, string> = {
  design: "Packaging design",
  print: "Printing and delivery",
  brand_identity: "Full brand pack (logo, colours, labels)",
  photography: "Product photography",
  barcode_registration: "Barcode (GS1) and NAFDAC guidance",
};

export const PACKAGING_REQUEST_STATUSES = ["new", "quoted", "in_progress", "done", "cancelled"] as const;
export type PackagingRequestStatus = (typeof PACKAGING_REQUEST_STATUSES)[number];

export const PACKAGING_REQUEST_STATUS_LABEL: Record<PackagingRequestStatus, string> = {
  new: "New",
  quoted: "Quote sent",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

const text = (max: number) => z.string().trim().max(max);
const ownUrl = z.string().trim().max(2000).regex(/^https:\/\/\S+$/, "Use pictures from your media library");

export const PackagingRequestSchema = z.object({
  designId: z.string().max(64).nullable().optional(),
  productName: text(120).min(2, "Name the product"),
  productType: z.enum(PRODUCT_TYPES),
  packType: z.enum([...PACK_FORMATS, "other"] as [string, ...string[]]),
  quantity: z.number().int().min(1, "How many pieces?").max(10_000_000),
  size: text(120).nullable().optional(),
  budget: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  services: z.array(z.enum(PACKAGING_SERVICES)).max(PACKAGING_SERVICES.length).default([]),
  details: text(3000).min(10, "Tell us a bit more about what you want"),
  referenceUrls: z.array(ownUrl).max(8).default([]),
  contactName: text(120).min(2, "Add your name"),
  contactPhone: z.string().trim().min(7, "Add a phone number").max(30),
  contactEmail: z.string().trim().email("Check the email").max(200).nullable().optional(),
});
export type PackagingRequestInput = z.infer<typeof PackagingRequestSchema>;

export const PackagingRequestUpdateSchema = z.object({
  status: z.enum(PACKAGING_REQUEST_STATUSES).optional(),
  adminNotes: text(4000).nullable().optional(),
});
