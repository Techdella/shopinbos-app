import { z } from "zod";

export const ProviderNameSchema = z.enum(["africastalking", "sendchamp"]);

export const SmsRouteSchema = z.enum(["dnd", "non_dnd", "international"]);

export const NotificationChannelSchema = z.enum(["sms", "voice", "whatsapp"]);

export const NotificationConfigSchema = z.object({
  provider: ProviderNameSchema,
  senderName: z.string().min(1).max(11).optional(),
  smsRoute: SmsRouteSchema.default("non_dnd"),
  enabledChannels: z.array(NotificationChannelSchema).min(1),
  events: z.object({
    orderPlaced: z.boolean().default(false),
    orderShipped: z.boolean().default(false),
    orderDelivered: z.boolean().default(false),
    paymentConfirmed: z.boolean().default(false),
    otpVerification: z.boolean().default(false),
  }).default({
    orderPlaced: false,
    orderShipped: false,
    orderDelivered: false,
    paymentConfirmed: false,
    otpVerification: false,
  }),
});

export const SendSmsSchema = z.object({
  to: z.array(z.string().min(1)).min(1).max(100),
  message: z.string().min(1).max(1600),
  senderName: z.string().max(11).optional(),
  route: SmsRouteSchema.optional(),
});

export const SendVoiceSchema = z.object({
  to: z.array(z.string().min(1)).min(1).max(50),
  message: z.string().min(1).max(500),
});

export const SendWhatsAppSchema = z.object({
  to: z.array(z.string().min(1)).min(1).max(100),
  message: z.string().min(1).max(4096),
});

export const SendOtpSchema = z.object({
  to: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(50)]).transform((value) => (Array.isArray(value) ? value : [value])),
  length: z.number().int().min(4).max(8).optional(),
  expiry: z.number().int().min(1).max(30).optional(),
});

export const VerifyOtpSchema = z.object({
  pinId: z.string().min(1),
  code: z.string().min(1).max(10),
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;
export type SendSmsInput = z.infer<typeof SendSmsSchema>;
export type SendVoiceInput = z.infer<typeof SendVoiceSchema>;
export type SendWhatsAppInput = z.infer<typeof SendWhatsAppSchema>;
export type SendOtpInput = z.infer<typeof SendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
