// HyperLogLog sketches for "Unique visitors" on /home/analytics/traffic (and Peggy's store_traffic_report).
// Pure, no imports, so tests/store-traffic.test.mjs runs it directly.
//
// A sketch is 2^p small registers (p = 12: 4,096 registers, about 1.6% standard error). Each visitor is a 64-bit
// hash (computed on the server from the browser's random token, the store id and a server secret, see
// src/lib/analytics/visitor-sketch.server.ts); the hash only picks a register and a rank and is then thrown away,
// so a sketch holds no visitor id, no token and no hash. Sketches merge register by register (max), so the
// unique visitors of any range of days is the estimate of the merged daily sketches: a person who visits on
// five days counts once.
//
// The estimate uses Otmar Ertl's improved estimator ("New cardinality estimation algorithms for HyperLogLog
// sketches", 2017): accurate from a handful of visitors to millions with no bias tables.

export const HLL_PRECISION = 12;
const VERSION = 1;
const DENSE = 0;
const SPARSE = 1;

export interface HllSketch {
  p: number;
  registers: Uint8Array;
}

export function createSketch(p = HLL_PRECISION): HllSketch {
  if (!Number.isInteger(p) || p < 4 || p > 16) throw new Error("HyperLogLog precision must be 4 to 16");
  return { p, registers: new Uint8Array(1 << p) };
}

/**
 * Adds one item given its 64-bit hash (at least 8 bytes, big-endian). Returns true when the sketch changed
 * (so a caller can skip writing it back).
 */
export function addHash(sketch: HllSketch, hash: Uint8Array): boolean {
  if (hash.length < 8) throw new Error("HyperLogLog needs a 64-bit hash");
  const { p, registers } = sketch;
  const hi = ((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0;
  const lo = ((hash[4] << 24) | (hash[5] << 16) | (hash[6] << 8) | hash[7]) >>> 0;
  const index = hi >>> (32 - p);
  // The other 64 - p bits: the rest of hi, then lo. The rank is their leading zeros + 1 (at most 64 - p + 1).
  const rest = (hi << p) >>> 0;
  const rank = rest !== 0 ? Math.clz32(rest) + 1 : 32 - p + Math.clz32(lo) + 1;
  if (rank <= registers[index]) return false;
  registers[index] = rank;
  return true;
}

/** Register-wise max of `from` into `into` (same precision). Returns `into`. */
export function mergeInto(into: HllSketch, from: HllSketch): HllSketch {
  if (into.p !== from.p) throw new Error("Can't merge HyperLogLog sketches of different precision");
  const a = into.registers;
  const b = from.registers;
  for (let i = 0; i < a.length; i += 1) if (b[i] > a[i]) a[i] = b[i];
  return into;
}

/** A new sketch holding the union of all of them (an empty sketch for none). */
export function mergeSketches(sketches: Iterable<HllSketch>, p = HLL_PRECISION): HllSketch {
  const out = createSketch(p);
  for (const sketch of sketches) if (sketch.p === p) mergeInto(out, sketch);
  return out;
}

function sigma(x: number) {
  if (x === 1) return Infinity;
  let y = 1;
  let z = x;
  let previous: number;
  do {
    x *= x;
    previous = z;
    z += x * y;
    y += y;
  } while (z !== previous);
  return z;
}

function tau(x: number) {
  if (x === 0 || x === 1) return 0;
  let y = 1;
  let z = 1 - x;
  let previous: number;
  do {
    x = Math.sqrt(x);
    previous = z;
    y *= 0.5;
    z -= (1 - x) ** 2 * y;
  } while (z !== previous);
  return z / 3;
}

/** The estimated number of distinct items, rounded. 0 for an empty sketch. */
export function estimate(sketch: HllSketch): number {
  const { p, registers } = sketch;
  const m = registers.length;
  const q = 64 - p;
  const counts = new Array<number>(q + 2).fill(0);
  for (let i = 0; i < m; i += 1) counts[Math.min(registers[i], q + 1)] += 1;
  if (counts[0] === m) return 0;
  let z = m * tau(1 - counts[q + 1] / m);
  for (let k = q; k >= 1; k -= 1) z = 0.5 * (z + counts[k]);
  z += m * sigma(counts[0] / m);
  const alpha = 1 / (2 * Math.log(2));
  return Math.round((alpha * m * m) / z);
}

// ─── Storage ──────────────────────────────────────────────────────────────────
// [version, p, mode] then either every register (dense) or (index hi, index lo, rank) for each set register
// (sparse), whichever is shorter. A small store's day is a few dozen bytes; a busy one tops out at 4 KB.

export function serializeSketch(sketch: HllSketch): Uint8Array {
  const { p, registers } = sketch;
  let set = 0;
  for (let i = 0; i < registers.length; i += 1) if (registers[i]) set += 1;
  if (set * 3 < registers.length) {
    const out = new Uint8Array(3 + set * 3);
    out.set([VERSION, p, SPARSE]);
    let at = 3;
    for (let i = 0; i < registers.length; i += 1) {
      if (!registers[i]) continue;
      out[at] = i >>> 8;
      out[at + 1] = i & 0xff;
      out[at + 2] = registers[i];
      at += 3;
    }
    return out;
  }
  const out = new Uint8Array(3 + registers.length);
  out.set([VERSION, p, DENSE]);
  out.set(registers, 3);
  return out;
}

/** A stored sketch, or null when the bytes aren't one (wrong version, precision or length). */
export function deserializeSketch(bytes: Uint8Array | null | undefined): HllSketch | null {
  if (!bytes || bytes.length < 3 || bytes[0] !== VERSION) return null;
  const p = bytes[1];
  if (p < 4 || p > 16) return null;
  const sketch = createSketch(p);
  const m = sketch.registers.length;
  const max = 64 - p + 1;
  if (bytes[2] === DENSE) {
    if (bytes.length !== 3 + m) return null;
    for (let i = 0; i < m; i += 1) sketch.registers[i] = Math.min(bytes[3 + i], max);
    return sketch;
  }
  if (bytes[2] !== SPARSE || (bytes.length - 3) % 3 !== 0) return null;
  for (let at = 3; at < bytes.length; at += 3) {
    const index = (bytes[at] << 8) | bytes[at + 1];
    if (index >= m) return null;
    sketch.registers[index] = Math.max(sketch.registers[index], Math.min(bytes[at + 2], max));
  }
  return sketch;
}
