import { expect, test } from 'vitest';
import * as E from '../src/engine';
import { nowM } from '../src/engine/calendar';

function single20() {
  E.birth(4242);
  const life = E.S;
  life.age = 20; life.auto = false; life.flags.solo = false;
  life.fam.married = false; life.fam.dating = null; life.cand = null;
  return life;
}

test('saying "not now" stops new romances for a while, and picking the love focus ends it early', () => {
  const life = single20();
  life.slots = ['study', 'work'];
  const d = E.DEC.romance;
  life.cand = E.makePartner('school');
  life.school = null;
  d.apply('later');
  expect(life.flags.noLove).toBe(nowM() + 12);
  for (let i = 0; i < 11; i++) E.loveMonth(0);
  expect(life.cand).toBeNull();
  // 改回「恋爱」重心：又想谈了，标记清掉，照常认识人
  life.slots = ['love', 'work'];
  for (let i = 0; i < 200 && !life.cand; i++) E.loveMonth(0);
  expect(life.flags.noLove).toBeUndefined();
  expect(life.cand).not.toBeNull();
});

test('choosing love once does not make meeting people easier for the rest of the life', () => {
  const life = single20();
  life.slots = ['love', 'work'];
  expect(E.loveNow()).toBe(true);
  life.slots = ['work', 'hobby'];
  expect(E.loveNow()).toBe(false);
  expect(life.flags).not.toHaveProperty('loveBoost');
});

test('slots: two of the same count 1.6, and each slot raises its domain', () => {
  const life = single20();
  life.slots = ['love', 'love'];
  expect(E.slotW('love')).toBeCloseTo(1.6);
  expect(E.domK('love')).toBeCloseTo(1 + E.DOM_K * 1.6);
  life.slots = ['work', 'hobby'];
  expect(E.slotW('love')).toBe(0);
  expect(E.domK('love')).toBe(1);
  expect(E.domK('leisure')).toBeCloseTo(1 + E.DOM_K);
});
