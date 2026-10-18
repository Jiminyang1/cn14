import { expect, test } from 'vitest';
import * as E from '../src/engine';
import { nowM } from '../src/engine/calendar';

function single20() {
  E.birth(4242);
  const life = E.S;
  life.age = 20; life.auto = false;
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

test('staying single: asked at 30, then every five years until 50', () => {
  const life = single20();
  life.school = null; life.fam.partner = null;
  const asked = (age: number) => { life.age = age; return E.yearDecisions().includes('single'); };
  expect(asked(29)).toBe(false);
  expect(asked(30)).toBe(true);
  life.flags.singleAt = 30;
  expect(asked(34)).toBe(false);
  expect(asked(35)).toBe(true);
  life.flags.singleAt = 50;
  expect(asked(55)).toBe(false);
  // 说了不打算结婚的不再问
  life.flags.singleAt = 35; life.flags.noWed = 1;
  expect(asked(40)).toBe(false);
});

test('one hard flaw is enough for their family to object, whatever else you have', () => {
  const life = single20();
  life.age = 27; life.school = null; life.job = 'seeking'; life.house = { city: life.loc.city, p: life.loc.p, v: 1e6, paid: 1e6, at: 26 } as any;
  const p = E.makePartner('friends');
  p.age = 27; p.home = life.home.p; p.rural = life.home.kind === 'rural'; p.q = life.q;
  expect(E.theirWhys(p).some(w => w.k === 'house')).toBe(true);
  expect(E.theirPar(p)).toBe(-1);
});

test('love line: the one picked at a blind date who said no is named as such', () => {
  const life = single20();
  life.loves = [{ name: '乙', sex: 'F', at: 28, how: 'blind', kind: 'missed', with: '甲' }];
  expect(E.loveLine(life).find(r => r.name === '乙')?.t).toContain('甲没答应');
  life.loves.push({ name: '甲', sex: 'F', at: 28, how: 'blind', kind: 'love' });
  expect(E.loveLine(life).find(r => r.name === '乙')?.t).not.toContain('没答应');
});
