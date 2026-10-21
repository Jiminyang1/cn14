// 主界面「岔路口」上面那一行标签：活着的时候不先下「没离开过家乡」「带着债走」这种要走完才算数的结论
import { expect, test } from 'vitest';
import * as E from '../src/engine';

test('live tags leave out end-only tags until the life is over', () => {
  let seen = 0;
  for (const seed of [11, 2024, 31337, 777, 90210]) {
    E.birth(seed, { headless: true });
    const L = E.S;
    while (L.phase === 'life') {
      E.runHeadlessYear();
      if (L.phase !== 'life') break;
      const ks = E.liveTags(L).map(t => t.k);
      expect(ks).not.toContain('home');
      expect(ks).not.toContain('debt');
      seen += ks.length;
    }
    expect(E.liveTags(L).map(t => t.k)).toEqual(E.lifeTags(L).map(t => t.k));
  }
  expect(seen).toBeGreaterThan(0);
});
