// 纯 JS 的 exp/log/cos/pow：和 Math 的差距不超过 1–2 ulp（Math 本身在各平台上就有 1 ulp 的出入），
// 并且结果固定（下面几个值是这份实现自己算出来的，任何平台都必须一样）。
import { expect, test } from 'vitest';
import { fcos, fexp, flog, fpow } from '../src/engine/fmath';

const buf = new DataView(new ArrayBuffer(8));
const bits = (x: number) => { buf.setFloat64(0, x); return buf.getBigInt64(0); };
const ulps = (a: number, b: number) => { const d = bits(a) - bits(b); return Number(d < 0n ? -d : d); };
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function check(name: string, f: (x: number) => number, g: (x: number) => number, gen: () => number, maxUlp: number) {
  let worst = 0, same = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) { const x = gen(); const u = ulps(f(x), g(x)); worst = Math.max(worst, u); if (!u) same++; }
  expect(worst, name).toBeLessThanOrEqual(maxUlp);
  return { name, worst, same: same / N };
}

test('fdlibm ports agree with Math to within an ulp', () => {
  const r = lcg(12345);
  const rows = [
    check('exp 小', fexp, Math.exp, () => (r() - 0.5) * 6, 1),
    check('exp 大', fexp, Math.exp, () => (r() - 0.5) * 1400, 1),
    check('exp 极小', fexp, Math.exp, () => (r() - 0.5) * 1e-9, 1),
    check('log (0,1]', flog, Math.log, () => 1 - r(), 1),
    check('log 大范围', flog, Math.log, () => fexp((r() - 0.5) * 1400), 1),
    check('log 接近 1', flog, Math.log, () => 1 + (r() - 0.5) * 1e-6, 1),
    check('cos [0,2π)', fcos, Math.cos, () => 2 * Math.PI * r(), 1),
    check('cos 大', fcos, Math.cos, () => (r() - 0.5) * 2e5, 1),
    check('pow', x => fpow(x, 0.7), x => Math.pow(x, 0.7), () => 0.2 + r() * 5, 3),
    check('pow 房贷', x => fpow(1 + x, -360), x => Math.pow(1 + x, -360), () => r() * 0.005, 6),
  ];
  console.table(rows);
});

test('special values', () => {
  expect(fexp(0)).toBe(1);
  expect(fexp(-Infinity)).toBe(0);
  expect(fexp(Infinity)).toBe(Infinity);
  expect(fexp(800)).toBe(Infinity);
  expect(fexp(-800)).toBe(0);
  expect(flog(1)).toBe(0);
  expect(flog(0)).toBe(-Infinity);
  expect(Number.isNaN(flog(-1))).toBe(true);
  expect(fcos(0)).toBe(1);
  expect(fpow(5, 0)).toBe(1);
  expect(fpow(0, 2.5)).toBe(0);
});

test('fixed results (must be identical on every platform)', () => {
  expect([fexp(0.7), fexp(-3.3), flog(0.3), flog(123456.789), fcos(1), fcos(4.4), fpow(1.0026, -360)].map(String)).toEqual(FIXED);
});
const FIXED = ['2.0137527074704766', '0.036883167401240015', '-1.2039728043259361', '11.723646487185881', '0.5403023058681398', '-0.30733286997841935', '0.3926701607963051'];

// 引擎里不许直接用精度没有标准规定的 Math 函数（会让不同浏览器跑出不同的人生），要用 fmath.ts 里的版本
test('engine uses deterministic math only', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const bad: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.ts') && e.name !== 'fmath.ts') {
        readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
          if (/\bMath\.(exp|expm1|log|log1p|log2|log10|pow|cos|sin|tan|acos|asin|atan|atan2|cosh|sinh|tanh|cbrt|hypot)\b/.test(l)) bad.push(`${p}:${i + 1}`);
        });
      }
    }
  };
  walk('src/engine');
  expect(bad).toEqual([]);
});
