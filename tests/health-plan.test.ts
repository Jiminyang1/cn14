// 健康：健身、定期体检两个持续的计划，戒烟这个一次性的行动（plans/health.ts）
import { expect, test } from 'vitest';
import * as E from '../src/engine';

function adult(seed = 5000) {
  E.birth(seed, { headless: true });
  const L = E.S;
  L.headless = false; L.auto = false;
  L.age = 45; L.month = 0; L.indep = true; L.school = null;
  L.flags = {}; L.plans = {}; L.money = 200000; L.debt = 0; L.tightM = 0;
  L.st.hl = 60; L.st.h = 60;
  L.phase = 'life'; L.death = null; L.pending = null; L.queue = [];
  return L;
}

test('gym: charges every month and raises health; stops when cash runs out', () => {
  const L = adult();
  expect(E.planOf('gym')).toBe('none'); // 玩家没设过：不去
  E.setPlan('gym', 'gym');
  const c = E.PLANS.gym.opts.find(o => o.k === 'gym')!.monthly!();
  expect(c).toBeGreaterThan(50); expect(c).toBeLessThan(1000);
  const m0 = L.money, hl0 = L.st.hl, h0 = L.st.h;
  for (let i = 0; i < 12; i++) E.plansMonth();
  expect(L.money).toBeCloseTo(m0 - 12 * c, 6);
  expect(L.st.hl).toBeGreaterThan(hl0 + 1);
  expect(L.st.h).toBeGreaterThan(h0);
  // 钱不够：停掉，回到「不去」，时间线上写一句
  L.money = 0;
  E.plansMonth();
  expect(L.plans!.gym).toBe('none');
  expect(L.log[0].t).toContain('健身先停了');
});

test('auto lives pick by circumstance; players default to none', () => {
  const L = adult();
  L.pers = { ...(L.pers as any), z: { ...(L.pers as any)?.z, c: 1.5 } } as any;
  expect(E.planOf('checkup')).toBe('none');
  expect(E.planOf('gym')).toBe('none');
  L.headless = true;
  expect(E.planOf('checkup')).toBe('yearly');
  expect(E.planOf('gym')).toBe('gym');
  L.money = 0; // 手头紧了
  expect(E.planOf('checkup')).toBe('none');
  expect(E.planOf('gym')).toBe('none');
  L.money = 200000; L.age = 30;
  expect(E.planOf('checkup')).toBe('none');
});

test('checkup: a major illness found at a checkup is marked early', () => {
  const L = adult();
  expect(E.illHook.early!('cancer')).toBeNull();
  E.setPlan('checkup', 'yearly');
  expect(E.illHook.early!('cancer')).toContain('体检的时候发现得早');
  // 硬推到容易出事的处境，直到确诊一次大病
  L.st.hl = 1;
  let ill = null;
  for (let i = 0; i < 20000 && !ill; i++) {
    L.age = 70; L.phase = 'life'; L.death = null; L.flags.ill = null;
    E.healthMonth(0);
    ill = L.flags.ill;
  }
  expect(ill).toBeTruthy();
  expect(ill!.early).toBe(1);
  expect(L.log[0].t).toContain('体检的时候发现得早');
});

test('checkup: found early, treatment survives clearly more often', () => {
  const surv = (early: boolean) => {
    const L = adult(6000);
    let ok = 0;
    for (let i = 0; i < 1500; i++) {
      L.phase = 'life'; L.death = null; L.money = 1e7;
      L.flags.ill = early ? { k: 'cancer', at: 55, am: 0, mo: 0, treat: 'local', early: 1 } : { k: 'cancer', at: 55, am: 0, mo: 0, treat: 'local' };
      let dead = false;
      for (let m = 0; m < E.ILL_SURVIVE_MO && L.flags.ill; m++) if (E.illMonth()) { dead = true; break; }
      if (!dead) ok++;
    }
    return ok / 1500;
  };
  const a = surv(false), b = surv(true);
  expect(b).toBeGreaterThan(a + 0.15);
});

test('quit smoking: only shown to smokers, gone once it works', () => {
  const L = adult();
  expect(E.actsShown()).not.toContain('quitSmoke');
  L.flags.smoke = 1;
  expect(E.actsShown()).toContain('quitSmoke');
  expect(E.actState('quitSmoke').ok).toBe(true);
  let tries = 0;
  while (L.flags.smoke && tries < 50) {
    expect(E.doAct('quitSmoke')).toBe(true);
    expect(E.doAct('quitSmoke')).toBe(false); // 一年一次
    tries++; L.age++;
  }
  expect(L.flags.smoke).toBe(0);
  expect(E.actsShown()).not.toContain('quitSmoke');
});
