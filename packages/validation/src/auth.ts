import { z } from 'zod';
import { phoneSchema } from './phone';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }));

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

const oneOf = (v: { phone?: string; email?: string }) =>
  (v.phone === undefined) !== (v.email === undefined);
const pick = <T extends { phone?: string; email?: string }>({ phone, email, ...rest }: T) =>
  phone !== undefined ? { ...rest, phone } : { ...rest, email: email as string };

/** Sign in with a phone (WhatsApp code, SMS fallback) or an email code. No passwords. */
export const otpStartSchema = z
  .object({ phone: phoneSchema.optional(), email: emailSchema.optional() })
  .strict()
  .refine(oneOf, { message: 'Enter a phone number or an email address' })
  .transform(pick);
export type OtpStartInput = { phone: string } | { email: string };

export const otpVerifySchema = z
  .object({ phone: phoneSchema.optional(), email: emailSchema.optional(), code: otpCodeSchema })
  .strict()
  .refine(oneOf, { message: 'Enter a phone number or an email address' })
  .transform(pick);
export type OtpVerifyInput = ({ phone: string } | { email: string }) & { code: string };

export const sessionDto = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number().int(),
});
export type SessionDto = z.infer<typeof sessionDto>;

export const deviceRegisterSchema = z
  .object({
    app: z.enum(['SELLER', 'RIDERS', 'PARTNERS']),
    platform: z.enum(['IOS', 'ANDROID', 'WEB']),
    expoPushToken: z.string().min(10).max(255),
  })
  .strict();
export type DeviceRegisterInput = z.infer<typeof deviceRegisterSchema>;
