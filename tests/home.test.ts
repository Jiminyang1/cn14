import { expect, test } from 'vitest';
import * as E from '../src/engine';

// 一个 50 岁、待业、欠着钱的人：出生在河南周口，现在住在郑州
function life() {
  E.birth(5000, { headless: true });
  const L = E.S;
  L.age = 50; L.indep = true; L.school = null; L.job = 'seeking';
  L.home = E.cityLoc('HA', '周口'); L.loc = E.cityLoc('HA', '郑州');
  L.fam.married = false; L.fam.partner = null; L.fam.kids = [];
  L.flags = {}; L.house = null; L.loans = []; L.money = 0; L.debt = 50000;
  return L;
}
const moveChoice = () => E.DEC.tight.build().choices.find(c => c.k === 'move');

test('living in the hometown county counts as being at home', () => {
  const L = life();
  expect(E.awayFromHome()).toBe(true);
  L.loc = E.cityLoc('HA', E.homeCounty());
  expect(E.awayFromHome()).toBe(false);
  expect(moveChoice()).toBeUndefined();
});

test('a tight month offers going home only to people without a house where they live', () => {
  const L = life();
  expect(moveChoice()?.label).toBe('回老家周口');
  L.house = { city: '郑州', p: 'HA', v: 800000, paid: 800000, at: 40 };
  expect(moveChoice()).toBeUndefined();
  // 房子在别处的，仍然可以搬回自己的房子
  L.house = { city: '洛阳', p: 'HA', v: 500000, paid: 500000, at: 40 };
  expect(moveChoice()?.label).toBe('搬回洛阳自己的房子住');
});
