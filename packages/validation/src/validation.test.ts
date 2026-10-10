import { describe, expect, it } from 'vitest';
import { formatPhoneNg, maskPhone, normalizePhone, otpStartSchema, otpVerifySchema } from './index';

describe('normalizePhone', () => {
  it.each([
    ['0803 123 4567', '+2348031234567'],
    ['8031234567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['+234 803-123-4567', '+2348031234567'],
    ['07061234567', '+2347061234567'],
    ['09121234567', '+2349121234567'],
    ['+447700900123', '+447700900123'],
  ])('%s → %s', (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it.each(['', '123', '0603 123 4567', '+234123', 'abc', '0803123456'])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('phone display', () => {
  it('formats and masks', () => {
    expect(formatPhoneNg('+2348031234567')).toBe('0803 123 4567');
    expect(maskPhone('+2348031234567')).toBe('+234 ••• ••• 4567');
  });
});

describe('otp schemas', () => {
  it('normalises phone on start', () => {
    expect(otpStartSchema.parse({ phone: '0803 123 4567' })).toEqual({ phone: '+2348031234567' });
  });
  it('lowercases email', () => {
    expect(otpStartSchema.parse({ email: ' Ada@Example.com ' })).toEqual({
      email: 'ada@example.com',
    });
  });
  it('rejects both or neither', () => {
    expect(otpStartSchema.safeParse({}).success).toBe(false);
    expect(otpStartSchema.safeParse({ phone: '08031234567', email: 'a@b.co' }).success).toBe(false);
  });
  it('requires a 6-digit code', () => {
    expect(otpVerifySchema.safeParse({ phone: '08031234567', code: '12345' }).success).toBe(false);
    expect(otpVerifySchema.safeParse({ phone: '08031234567', code: '123456' }).success).toBe(true);
  });
});

describe('otp schema messages', () => {
  it('gives a plain message for a bad phone', () => {
    const r = otpStartSchema.safeParse({ phone: '123' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Enter a valid phone number, like 0803 123 4567');
  });
  it('keeps the code on verify', () => {
    expect(otpVerifySchema.parse({ email: 'a@b.co', code: '123456' })).toEqual({
      email: 'a@b.co',
      code: '123456',
    });
  });
});
