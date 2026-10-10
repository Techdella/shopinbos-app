import { describe, expect, it } from 'vitest';
import { isValidStoreSlug, resolveHost } from './hosts';

const root = 'shopinbos.com';

describe('resolveHost', () => {
  it.each([
    ['app.shopinbos.com', { kind: 'app' }],
    ['api.shopinbos.com', { kind: 'app' }],
    ['shopinbos.com', { kind: 'app' }],
    ['localhost:3000', { kind: 'app' }],
    ['shopinbos-git-x.vercel.app', { kind: 'app' }],
    ['adaeze.shopinbos.com', { kind: 'store', slug: 'adaeze' }],
    ['Adaeze.Shopinbos.com.', { kind: 'store', slug: 'adaeze' }],
    ['adaeze.localhost:3000', { kind: 'store', slug: 'adaeze' }],
    ['admin.shopinbos.com', { kind: 'reserved', subdomain: 'admin' }],
    ['www.shopinbos.com', { kind: 'reserved', subdomain: 'www' }],
    ['www.adaezestudio.com', { kind: 'custom', hostname: 'www.adaezestudio.com' }],
    ['a.b.shopinbos.com', { kind: 'custom', hostname: 'a.b.shopinbos.com' }],
  ])('%s', (host, expected) => {
    expect(resolveHost(host, root)).toEqual(expected);
  });
});

describe('isValidStoreSlug', () => {
  it.each(['adaeze', 'kemi-closet', 'shop123'])('accepts %s', (s) =>
    expect(isValidStoreSlug(s)).toBe(true),
  );
  it.each(['ab', 'api', 'admin', '-bad', 'bad-', 'two--dashes', 'Upper', 'a_b'])(
    'rejects %s',
    (s) => expect(isValidStoreSlug(s)).toBe(false),
  );
});
