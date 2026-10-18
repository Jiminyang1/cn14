// 此刻的状态（engine/status.ts）：拆出来的每一项加起来，必须和月底结算用的目标值一样
import { expect, test } from 'vitest';
import * as E from '../src/engine';

const sum = (xs: { v: number }[]) => xs.reduce((t, x) => t + x.v, 0);

test('status terms add up to the targets drift() uses, all through several lives', () => {
  let checked = 0;
  for (const seed of [11, 2024, 31337, 777, 90210]) {
    E.birth(seed, { headless: true });
    const L = E.S;
    let g = 0;
    while (L.phase === 'life' && g++ < 110) {
      E.runHeadlessYear();
      if (L.phase !== 'life') break;
      const T = E.targetTerms();
      expect(sum(T.hl)).toBeCloseTo(E.hlTarget(), 9);
      expect(sum(T.h)).toBeCloseTo(E.hTarget(), 9);
      expect(sum(T.so)).toBeCloseTo(E.soTarget(), 9);
      E.statusNow(); // 不报错
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(200);
});

test('status lists smoking and points to quitting', () => {
  E.birth(5000, { headless: true });
  const L = E.S;
  L.age = 40; L.indep = true; L.flags = { smoke: 1 } as any;
  const s = E.statusNow().find(e => e.k === 'smoke');
  expect(s?.t.hl).toBe(-6);
  expect(s?.act).toBe('quitSmoke');
});
