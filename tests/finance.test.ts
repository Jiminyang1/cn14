import { expect, test } from 'vitest';
import * as E from '../src/engine';
import { fpow } from '../src/engine/fmath';

function household() {
  E.birth(5000, { headless: true });
  const life = E.S;
  life.age = 40; life.indep = true; life.school = null;
  life.loc = E.cityLoc('HA', '郑州'); life.home = { ...life.loc };
  life.fam.mom.alive = false; life.fam.dad.alive = false;
  life.fam.partner = null; life.fam.married = false; life.fam.kids = []; life.fam.sibs = [];
  life.flags = { inherited: 1 }; life.famMoney = 0; life.famDebt = 0;
  life.house = { city: life.loc.city, p: life.loc.p, v: 1000000, paid: 1000000, at: 30 };
  life.loans = []; life.hpf = 0; life.hpfOn = false; life.hpK = 1;
  life.job = 'clerk'; life.jobY = 15; life.wageK = 1; life.wageK0 = undefined;
  life.wageK *= 120000 / E.wageRate();
  life.money = 100000; life.debt = 0;
  return life;
}

function checkStatement(bill: E.MonthlyStatement) {
  const expected = bill.opening + bill.events + bill.transfers + bill.income + bill.depositInterest
    - bill.living - bill.children - bill.rent - bill.mortgage - bill.debtRepaid - bill.discretionary - (bill.savingsSpend || 0);
  expect(bill.closing).toBeCloseTo(expected, 6);
  expect(bill.closing).toBeGreaterThanOrEqual(0);
}

test('cash balances do not set income-based consumption, only the savings draw', () => {
  const bills = [100000, 1000000].map(cash => {
    household().money = cash;
    E.moneyMonth(1);
    checkStatement(E.S.statement);
    return E.S.statement;
  });
  const base = (bill: E.MonthlyStatement) => bill.living + bill.children + bill.discretionary;
  expect(base(bills[0])).toBeCloseTo(base(bills[1]), 8);
  // 在职动用积蓄每年 2%，按发了这个月工资、付完开销以后的现金算：10 万出头，每月约 170 元
  expect(bills[0].savingsSpend).toBeGreaterThan(100000 * E.DRAW_WORK / 12);
  expect(bills[0].savingsSpend).toBeLessThan(110000 * E.DRAW_WORK / 12);
  expect(bills[1].savingsSpend).toBeGreaterThan(bills[0].savingsSpend * 9);
});

test('savings draw rises with age, flattens above 20 times local income and skips when income falls short', () => {
  const inc = 50000;
  expect(E.savingsDraw(1e6, inc, E.drawRate(70, true), 1e9)).toBeCloseTo(1e6 * 0.03 / 12, 6);
  expect(E.savingsDraw(1e6, inc, E.drawRate(80, true), 1e9)).toBeCloseTo(1e6 * 0.04 / 12, 6);
  expect(E.savingsDraw(1e6, inc, E.drawRate(90, true), 1e9)).toBeCloseTo(1e6 * 0.05 / 12, 6);
  // 超过当地人均收入 20 倍（100 万）的部分每年只花 1.5%
  expect(E.savingsDraw(3e6, inc, 0.03, 1e9)).toBeCloseTo((1e6 * 0.03 + 2e6 * 0.015) / 12, 6);
  // 只花留够周转金以后的现金；收入不够日常开销的，额外花的扣掉缺口
  expect(E.savingsDraw(1e6, inc, 0.03, 1000)).toBe(1000);
  expect(E.savingsDraw(1e6, inc, 0.03, 1e9, 1e6 * 0.03 / 12)).toBe(0);
});

test('higher pensions improve cash flow instead of being spent in full', () => {
  const changes = [24000, 120000].map(pension => {
    const life = household();
    life.age = 70; life.job = 'retired'; life.pension = pension; life.lifestyle = 1; life.money = 1000000;
    E.moneyMonth(1);
    checkStatement(life.statement);
    return life.money - 1000000;
  });
  expect(changes[1] - changes[0]).toBeGreaterThan(7000);
  expect(changes[1]).toBeGreaterThan(0);
});

test('expenses and explicit borrowing keep cash separate from debt', () => {
  const life = household(); life.money = 100;
  E.changeMoney(-500);
  expect(life.money).toBe(0); expect(life.debt).toBe(400);
  E.changeMoney(1000);
  expect(E.liquidBalance()).toBe(600);
  expect(E.borrowMoney(1000, 700)).toBe(300);
  expect(life.money).toBe(1300); expect(life.debt).toBe(700);
  expect(E.repayDebt(2000)).toBe(700);
  expect(life.money).toBe(600); expect(life.debt).toBe(0);
});

test('an unfunded mortgage accrues arrears instead of reducing principal', () => {
  const life = household(); life.money = 0; life.job = 'seeking';
  life.loans = [{ kind: 'com', bal: 100000, rate: 0.031, years: 20, pay: E.annualPay(100000, 0.031, 20) }];
  E.moneyMonth(1);
  expect(life.loans[0].bal).toBeCloseTo(100000 * (1 + 0.031 / 12), 6);
  expect(E.loanArrears()).toBeGreaterThan(0);
  expect(life.statement.mortgage).toBe(0);
  expect(life.statement.shortfall).toBeGreaterThan(0);
  checkStatement(life.statement);
});

test('funded mortgage amortizes exactly, including arrears recovery and zero interest', () => {
  for (const rate of [0, 0.031]) {
    const life = household();
    const payment = rate ? E.annualPay(100000, rate, 20) : 5000;
    life.loans = [{ kind: 'com', bal: 100000, rate, years: 20, pay: payment }];
    const missed = E.loanMonth(0);
    expect(missed.arrears).toBeGreaterThan(0);
    let paid = 0, interest = missed.interest;
    for (let month = 1; month <= 240 && life.loans.length; month++) {
      const result = E.loanMonth(1000000);
      paid += result.cash + result.hpf; interest += result.interest;
      expect(result.arrears).toBeLessThan(0.01);
    }
    expect(life.loans).toHaveLength(0);
    expect(paid - interest).toBeCloseTo(100000, 5);
  }
});

test('housing fund payments use their own balance and cash statements reconcile', () => {
  const life = household(); life.hpf = 10000;
  life.loans = [{ kind: 'com', bal: 100000, rate: 0.031, years: 20, pay: E.annualPay(100000, 0.031, 20) }];
  E.moneyMonth(1);
  expect(life.statement.mortgage).toBe(0);
  expect(life.statement.mortgageHpf).toBeGreaterThan(0);
  checkStatement(life.statement);
  E.eff({ money: -2000 });
  E.moneyMonth(2);
  expect(life.statement.events).toBe(-2000);
  checkStatement(life.statement);
});

test('rent shortages are owed and discretionary spending does not borrow', () => {
  const life = household(); life.money = 0; life.house = null; life.job = 'seeking';
  E.moneyMonth(1);
  expect(life.money).toBe(0); expect(life.debt).toBeGreaterThan(0);
  expect(life.statement.discretionary).toBe(0);
  expect(life.statement.rent).toBe(0);
  checkStatement(life.statement);
});

test('a care home fee covers board instead of being charged on top of basic living', () => {
  const bills = [undefined, 'home'].map(where => {
    const life = household(); life.age = 82; life.job = 'retired'; life.pension = 60000; life.money = 200000;
    life.house = null; life.flags.oldLive = where as 'home' | undefined;
    E.moneyMonth(1); checkStatement(life.statement);
    return life.statement;
  });
  expect(bills[0].living).toBeGreaterThan(0);
  expect(bills[1].living).toBe(0);
  expect(bills[1].rent).toBeCloseTo(E.placeInc(E.S.loc) * E.CARE_K / 12, 6);
});

test('frugal living spends less on basics until the debt is cleared', () => {
  const bills = [0, 1].map(frugal => {
    const life = household(); life.flags.frugal = frugal; life.debt = 50000; life.money = 0;
    E.moneyMonth(1); checkStatement(life.statement);
    return life.statement.living;
  });
  expect(bills[1]).toBeCloseTo(bills[0] * E.FRUGAL_K, 6);
  const life = household(); life.flags.frugal = 1; life.debt = 0; life.money = 100000;
  E.moneyMonth(1);
  expect(life.flags.frugal).toBe(0);
});

test('minimum living allowance tops household income up to the local standard and stops when no longer eligible', () => {
  const life = household(); life.house = null; life.money = 0; life.job = 'retired'; life.pension = 3000; life.age = 75;
  life.fam.kids = []; life.flags.dibao = 1;
  E.moneyMonth(1); checkStatement(life.statement);
  expect(life.statement.incomeDetails.aid).toBeCloseTo(E.DIBAO_M.city - 3000 / 12, 6);
  expect(life.statement.income).toBeCloseTo(E.DIBAO_M.city, 6);
  life.pension = 60000;
  E.moneyMonth(2);
  expect(life.flags.dibao).toBe(0);
  expect(life.statement.incomeDetails.aid).toBeUndefined();
});

test('money from parents and children is transferred, not created', () => {
  const life = household(); life.debt = 30000; life.money = 0; life.fam.mom.alive = true; life.famMoney = 200000; life.famDebt = 0; life.age = 25;
  const x = E.askParents(E.placeCons());
  expect(x).toBeGreaterThan(30000);
  expect(life.famMoney).toBeCloseTo(200000 - x, 6);
  expect(life.debt).toBe(0);
  expect(life.money + life.famMoney).toBeCloseTo(200000 - 30000, 6);
  // 子女垫付的，从他们以后每月给的钱里扣回
  const old = household(); old.age = 75; old.job = 'retired'; old.pension = 24000; old.debt = 10000; old.money = 0;
  old.fam.kids = [{ name: '甲', sex: 'M', bornAt: 30, bornM: 360, age: 45, alive: true }];
  const lent = E.askKids(E.placeCons());
  expect(lent).toBe(10000); expect(old.kidAdv).toBe(10000); expect(old.debt).toBe(0);
  const support = E.kidSupportY(E.placeCons()) / 12;
  E.moneyMonth(1);
  expect(old.kidAdv).toBeCloseTo(10000 - support, 6);
  expect(old.statement.income).toBeCloseTo(24000 / 12, 6);
});

test('the tight-money decision offers only the ways out that fit the situation', () => {
  const keys = () => E.DEC.tight.build().choices.filter(c => !c.off).map(c => c.k);
  const young = household(); young.age = 25; young.house = null; young.debt = 20000; young.money = 0;
  young.fam.mom.alive = true; young.famMoney = 100000; young.famDebt = 0; young.statement = undefined;
  expect(keys()).toEqual(expect.arrayContaining(['parents', 'frugal', 'hold']));
  expect(keys()).not.toContain('sell'); expect(keys()).not.toContain('kids');
  const old = household(); old.age = 66; old.job = 'retired'; old.pension = 20000; old.debt = 20000; old.money = 0;
  old.fam.kids = [{ name: '甲', sex: 'F', bornAt: 28, bornM: 336, age: 44, alive: true }];
  expect(keys()).toEqual(expect.arrayContaining(['sell', 'downsize', 'kids', 'ask', 'work', 'frugal', 'hold']));
  expect(keys()).not.toContain('parents'); expect(keys()).not.toContain('dibao'); // 有房的不能申请低保
});

test('parents pay mortgages from their actual funds while employed', () => {
  const balances = [0, 500000].map(mortgage => {
    const life = household();
    for (const parent of [life.fam.mom, life.fam.dad]) {
      parent.alive = true; parent.age = 45; parent.jk = 'farmer';
    }
    life.famMoney = 100000; life.famDebt = mortgage; life.famDebtWhy = '房贷'; life.famDebtYears = 20;
    life.famHouse = { type: 'own', v: 1000000 };
    E.familyMoneyMonth(1);
    return life.famMoney;
  });
  // 付掉的月供也少动用了这部分积蓄（在职每年 2%）
  expect(balances[0] - balances[1]).toBeCloseTo(E.annualPay(500000, 0.031, 20) / 12 * (1 - E.DRAW_WORK / 12) * fpow(1.015, 1 / 12), 5);
});

test('retirement keeps established consumption habits when pension income falls', () => {
  const life = household();
  life.age = 70; life.job = 'retired'; life.pension = 24000;
  life.lifestyle = 3; life.money = 1000000;
  for (let month = 0; month < 120; month++) E.moneyMonth(month % 12);
  expect(life.lifestyle).toBeGreaterThanOrEqual(3 * 0.85);
  expect(life.statement.living + life.statement.discretionary).toBeGreaterThan(life.statement.income);
  expect(life.money).toBeLessThan(1000000);
  checkStatement(life.statement);
});

test('parents cannot pay down a mortgage using an empty account', () => {
  const life = household(); life.indep = false; life.age = 10; life.school = null;
  for (const parent of [life.fam.mom, life.fam.dad]) {
    parent.alive = true; parent.age = 80; parent.jk = 'farmer';
  }
  life.famMoney = 0; life.famDebt = 500000; life.famDebtWhy = '房贷'; life.famDebtYears = 20;
  life.famHouse = { type: 'own', v: 1000000 };
  E.familyMoneyMonth(1);
  expect(life.famDebt).toBeGreaterThan(500000);
  expect(life.money).toBe(100000);
});

test('inherited property remains an asset until explicitly sold', () => {
  const life = household(); life.flags.inherited = 0;
  life.famHouse = { type: 'own', v: 1000000, where: '郑州' }; life.famMoney = 20000;
  E.inheritSplit(1, true);
  expect(life.money).toBe(120000);
  expect(E.inheritedValue()).toBe(1000000);
  const worth = E.netWorth();
  expect(E.sellInherited(0)).toBe(950000);
  expect(E.inheritedValue()).toBe(0);
  expect(E.netWorth()).toBe(worth - 50000);
});

test('estate liabilities are settled before inheritance without duplicating assets', () => {
  const life = household(); life.flags.inherited = 0;
  life.famHouse = { type: 'own', v: 1000000 }; life.famMoney = 20000; life.famDebt = 120000;
  E.inheritSplit(1, true);
  expect(life.money).toBe(100000); expect(E.inheritedValue()).toBe(900000);
  E.inherit();
  expect(E.inheritedValue()).toBe(900000);
});

test('monthly statements reconcile throughout complete simulated lives', () => {
  for (let seed = 5000; seed < 5012; seed++) {
    E.birth(seed, { headless: true });
    for (let month = 0; E.S.phase === 'life' && month < 1400; month++) {
      E.tick(1 / 12);
      expect(Number.isFinite(E.S.money)).toBe(true);
      expect(E.S.money).toBeGreaterThanOrEqual(0);
      expect(E.S.debt || 0).toBeGreaterThanOrEqual(0);
      if (E.S.statement) checkStatement(E.S.statement);
    }
    expect(E.S.phase).toBe('end');
  }
});

test('monthly history preserves earlier statements and survives a saved-game round trip', () => {
  const life = household(); life.headless = false;
  E.moneyMonth(0);
  const first = JSON.parse(JSON.stringify(life.statement));
  E.changeMoney(-1500);
  E.moneyMonth(1);
  expect(life.statements).toHaveLength(2);
  expect(life.statements[0]).toEqual(first);
  expect(life.statements[1].events).toBe(-1500);
  expect(life.statements[1].incomeDetails.personal).toBe(life.statements[1].income);
  E.setS(JSON.parse(JSON.stringify(life)));
  E.moneyMonth(2);
  expect(E.S.statements).toHaveLength(3);
  expect(E.S.statements[0]).toEqual(first);
  expect(E.S.statements[2].opening).toBe(E.S.statements[1].closing);
  for (const bill of E.S.statements) checkStatement(bill);
});

test('existing saves retain their last statement when monthly history starts', () => {
  const life = household(); life.headless = false;
  E.moneyMonth(0);
  const previous = life.statement;
  delete life.statements;
  E.moneyMonth(1);
  expect(life.statements).toHaveLength(2);
  expect(life.statements[0]).toEqual(previous);
  expect(life.statements[1].opening).toBe(previous.closing);
});
