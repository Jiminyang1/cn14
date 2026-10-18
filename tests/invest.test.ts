// 理财（plans/invest.ts）：行情只看公历年份；买了基金跟着涨跌；换回银行全部变回现金；余额不会变负；现金不够会卖出补上
import { expect, test } from 'vitest';
import * as E from '../src/engine';
import { fpow } from '../src/engine/fmath';

// 一个 40 岁、经济独立的人，每月开销 5000 元（半年 3 万）
function adult(money: number) {
  E.birth(5000, { headless: true });
  const L = E.S;
  L.age = 40; L.month = 0; L.indep = true; L.school = null;
  L.money = money; L.debt = 0; L.inv = undefined; L.plans = {};
  L.statement = { year: E.calYear(), month: E.calMonth(), opening: money, closing: money, events: 0, transfers: 0, income: 8000,
    incomeDetails: { personal: 8000, partner: 0, rehire: 0 }, tier: 2, living: 4000, plans: 0, rent: 1000, mortgage: 0, mortgageHpf: 0,
    mortgageInterest: 0, debtRepaid: 0, depositInterest: 0, debtInterest: 0, shortfall: 0, arrears: 0, debt: 0 } as E.MonthlyStatement;
  return L;
}
const total = () => E.S.money + (E.S.inv ? E.S.inv.w + E.S.inv.f : 0);

test('行情按公历年份确定：两次调用一样，真实年份照搬，未来的年份落在真实的 21 年里', () => {
  for (let y = 1990; y < 2200; y++) {
    expect(E.fundRet(y)).toBe(E.fundRet(y));
    expect(E.wealthRet(y)).toBe(E.wealthRet(y));
    expect(E.wealthRet(y)).toBeGreaterThanOrEqual(0.02);
    expect(E.wealthRet(y)).toBeLessThanOrEqual(0.03);
    const m = E.mktYear(y);
    expect(m).toBeGreaterThanOrEqual(2005); expect(m).toBeLessThanOrEqual(2025);
  }
  expect(E.fundRet(2012)).toBeCloseTo(0.076, 9);
  expect(E.fundRet(2007)).toBeCloseTo(1.616 * 0.6, 9); // 极端年份打六折
  // 2026 年起每 21 年一轮，一轮里正好把真实的 21 年各走一遍
  for (const s of [2026, 2047, 2068, 2089]) {
    const seen = new Set(Array.from({ length: 21 }, (_, i) => E.mktYear(s + i)));
    expect(seen.size).toBe(21);
  }
});

test('买了基金以后，一年下来按这一年的行情涨跌', () => {
  const L = adult(1000000);
  E.setPlan('invest', 'fund');
  E.investYear('fund');
  // 留够半年生活费（3 万），其余三成买基金
  expect(L.inv.f).toBeCloseTo((1000000 - 30000) * 0.3, 6);
  expect(total()).toBeCloseTo(1000000, 6);
  const f0 = L.inv.f, y = E.calYear();
  for (let m = 0; m < 12; m++) { L.month = 0; E.investMonth('fund'); } // 同一个公历年里过 12 个月
  expect(L.inv.f).toBeCloseTo(f0 * fpow(1 + E.fundRet(y), 1 / 12) ** 12, 4);
  expect(L.inv.f / f0).toBeCloseTo(1 + E.fundRet(y), 6);
  expect(L.inv.gf).toBeCloseTo(L.inv.f - f0, 4);
});

test('换回全存银行，理财和基金全部卖回现金', () => {
  const L = adult(800000);
  E.investYear('wealth');
  expect(L.inv.w).toBeGreaterThan(0);
  E.investMonth('fund'); // 当月换成基金：理财卖掉，买基金
  expect(L.inv.w).toBe(0); expect(L.inv.f).toBeGreaterThan(0);
  const want = L.money + L.inv.f * fpow(1 + E.fundRet(E.calYear()), 1 / 12); // 这个月的行情算完再卖
  E.investMonth('bank');
  expect(L.inv.w).toBe(0); expect(L.inv.f).toBe(0);
  expect(L.money).toBeCloseTo(want, 4);
});

test('余额不会变负：大进大出、换来换去、长年下跌', () => {
  const L = adult(500000);
  const ks = ['bank', 'wealth', 'fund'];
  for (let i = 0; i < 600; i++) {
    L.month = i % 12; if (L.month === 0) L.age++;
    if (i % 37 === 0) L.money += 200000;
    if (i % 53 === 0) E.changeMoney(-150000);
    const k = ks[(i * 7) % 3];
    if (L.month === 0) E.investYear(k); else E.investMonth(k);
    expect(L.money).toBeGreaterThanOrEqual(0);
    expect(L.inv?.w ?? 0).toBeGreaterThanOrEqual(0);
    expect(L.inv?.f ?? 0).toBeGreaterThanOrEqual(0);
  }
  expect(L.inv).toBeTruthy();
});

test('现金不够或者有欠款时，先卖理财、再卖基金补上', () => {
  const L = adult(0);
  L.inv = { w: 20000, f: 500000, gw: 0, gf: 0, x: 1, cw: 0, cf: 0, k: 'fund', a: L.age };
  L.debt = 50000;
  E.investMonth('fund');
  expect(L.inv.w).toBe(0);                        // 理财先卖光
  expect(L.money).toBeGreaterThanOrEqual(50000);   // 够还欠款
  expect(L.money - L.debt).toBeGreaterThanOrEqual(5000 * 3 - 1); // 外加三个月的开销
  expect(L.inv.f).toBeLessThan(500000 * 1.1);
  expect(L.inv.f).toBeGreaterThan(0);
  // 卖光了也不够：余额是 0，不是负数
  const M = adult(0);
  M.inv = { w: 1000, f: 2000, gw: 0, gf: 0, x: 1, cw: 0, cf: 0, k: 'fund', a: M.age };
  M.debt = 100000;
  E.investMonth('fund');
  expect(M.inv.w).toBe(0); expect(M.inv.f).toBe(0);
  expect(M.money).toBeGreaterThan(2900);
});

test('自动的人生按处境选，玩家没设过是全存银行', () => {
  const L = adult(20000);
  L.headless = false; L.auto = false;
  expect(E.planOf('invest')).toBe('bank');
  L.auto = true; L.money = 5000000; L.pers = { ...(L.pers || {}), z: { e: 0, n: 0, c: 0, a: 0, r: 1 } } as any;
  expect(E.planOf('invest')).toBe('fund');
  L.pers.z.r = -1;
  expect(E.planOf('invest')).toBe('wealth');
  L.money = 20000;
  expect(E.planOf('invest')).toBe('bank');
  expect(E.netWorth()).toBeGreaterThan(0);
});
