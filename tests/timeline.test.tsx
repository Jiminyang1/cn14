import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { birth, S } from '../src/engine';
import { Timeline } from '../src/ui/Life';

function timeline(age: number) {
  birth(5000, { headless: true });
  S.age = age;
  S.log = [];
  for (let year = 0; year <= age; year++) S.log.unshift({ a: year, y: 2026 + year, m: 6, t: `第${year}岁记录`, k: 'ev', f: null });
  return renderToStaticMarkup(<Timeline />);
}

test('timeline initially renders only the most recent three age years without removing stored events', () => {
  const html = timeline(8);
  for (const age of [8, 7, 6]) expect(html).toContain(`第${age}岁记录`);
  for (const age of [5, 4, 3, 2, 1, 0]) expect(html).not.toContain(`第${age}岁记录`);
  expect(html).toContain('加载更早6年');
  expect(html).toContain('还有 6 年记录未加载');
  expect(S.log).toHaveLength(9);
  const next = timeline(9);
  expect(next).toContain('第9岁记录');
  expect(next).not.toContain('第6岁记录');
});

test('young lives show all available years without an unnecessary load button', () => {
  const html = timeline(2);
  for (const age of [2, 1, 0]) expect(html).toContain(`第${age}岁记录`);
  expect(html).not.toContain('加载更早');
});

test('timeline loads only the remaining years when fewer than six are available', () => {
  const html = timeline(6);
  expect(html).toContain('加载更早4年');
  expect(html).toContain('还有 4 年记录未加载');
});
