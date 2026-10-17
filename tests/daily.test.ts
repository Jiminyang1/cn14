// 日常只写时间线，不影响模拟：同一批人生开着日常和关掉日常各跑一遍，去掉日常留下的东西以后，状态必须逐位相同。
import { expect, test } from 'vitest';
import * as E from '../src/engine';

const stable = (v: unknown) => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
function run(seed: number) {
  E.newLife(seed);
  const L = E.S;
  for (let g = 0; L.phase === 'life' && g < 50000; g++) {
    const P = L.pending;
    if (P && P.type === 'dec') E.resolveDec(P.id, P.d, E.autoPick(P.d)); else if (P) L.pending = null; else E.tick(0.29);
  }
  return L;
}
const strip = (L: E.Life) => ({ ...L, rs2: undefined, dayDone: undefined, log: L.log.filter(e => e.k !== 'day'), queue: L.queue.filter(q => q.type !== 'day') });

test('daily entries do not change any life', () => {
  let days = 0, years = 0;
  for (let i = 0; i < 40; i++) {
    const seed = (24680 + i * 104729) | 0;
    E.DAILY.on = true; const a = run(seed);
    E.DAILY.on = false; const b = run(seed);
    E.DAILY.on = true;
    expect(stable(strip(a)) === stable(b), `seed ${seed}`).toBe(true);
    days += a.log.filter(e => e.k === 'day').length; years += a.age + 1;
  }
  // 日常是底色：平均每年一两条（太少显得空，太多就淹没了大事，见 AGENTS.md「轻重」）
  expect(days / years).toBeGreaterThan(1.2);
  expect(days / years).toBeLessThan(3);
});
