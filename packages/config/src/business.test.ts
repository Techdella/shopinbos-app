import { describe, expect, it } from 'vitest';
import { business, RESERVED_SUBDOMAINS, type ConfigValue } from './business';

function collect(node: unknown, path: string[] = [], out: [string, ConfigValue<unknown>][] = []) {
  if (node && typeof node === 'object' && 'status' in node && 'value' in node) {
    out.push([path.join('.'), node as ConfigValue<unknown>]);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collect(v, [...path, k], out);
  }
  return out;
}

describe('business config', () => {
  const entries = collect(business);

  it('has entries', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  it('confirmed values are never null', () => {
    for (const [path, v] of entries) {
      if (v.status === 'CONFIRMED') expect(v.value, path).not.toBeNull();
    }
  });

  it('kobo values are integers', () => {
    for (const [path, v] of entries) {
      if (/Kobo$/.test(path) && typeof v.value === 'number') {
        expect(Number.isInteger(v.value), path).toBe(true);
      }
    }
  });

  it('COD limit is ₦50,000', () => {
    expect(business.cod.maxKobo.value).toBe(5_000_000);
  });

  it('reserves system subdomains', () => {
    expect(RESERVED_SUBDOMAINS).toContain('app');
    expect(RESERVED_SUBDOMAINS).toContain('api');
  });
});
