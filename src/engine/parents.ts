// 父母：和你本人同一套「学历 → 职业 → 工资」逻辑生成（直接生成为成年人，不从出生模拟）。
// 家境（收入五等份第几档）由父母的实际收入反推，而不是先随机定档。
// 也包括父母的收入、退休、住房和出生时家里的积蓄与欠款。

import { fexp } from './fmath';
import { EDU_NAT, QUINT } from './real.generated';
import { EDU_WAGE, JOBS, RESID_PENSION_JOBS, expCurve, retireAgeOf } from './career';
import { FAM_REPAY } from './household';
import { PBY } from './data';
import { S } from './state';
import { chance, gauss, pick, ri, rnd, wpick } from './rng';
import { cityLoc, hpCounty, migrantCity, placeHp, placeName, wageBase } from './place';
import { rural } from './content/events';

export function carer() { return S.flags.lb === 'both' ? S.flags.carer : '妈妈'; }
// 父母能拿出的钱：按家境对应的城乡收入五等份组人均可支配收入（统计年鉴 6-7 / 6-12，2024）× 积蓄年数（估计）
// ===== 父母的家：收入、养老金、住房 =====
// 退休年龄和你本人、配偶用同一条规则（career.ts 的 retireAgeOf）
export const parentRetired = (p, male) => p.age >= retireAgeOf(male ? 'M' : 'F', p.jk);
// 父母的年收入：在职按工资公式（js/parents.js 的 parentWage），退休后领所在省的养老金人均水平
export function parentIncome(who) {
  const p = S.fam[who], male = who === 'dad';
  if (!p.alive) return 0;
  const hp = PBY[S.home.p];
  if (parentRetired(p, male)) return RESID_PENSION_JOBS.has(p.jk) ? (hp.penR || 2950) : (hp.penE || 45903);
  return parentWage(p) * PARENT_DISP;
}
// 家里的房子（出生时决定）：城镇按家境决定是否有自有住房，农村是自建房；随迁家庭在城里租房，老家有自建房
export function famHouseInit() {
  const own = [0.6, 0.75, 0.88, 0.95, 0.99][S.q - 1];
  if (S.rural) S.famHouse = { type: 'self', v: Math.round(hpCounty(PBY[S.home.p]) * 0.5 * 120 / 1e3) * 1e3, where: placeName(S.home) };
  else if (chance(own)) S.famHouse = { type: 'own', v: Math.round(placeHp(S.home) * 90 * (0.7 + S.q * 0.12) / 1e3) * 1e3, where: S.home.city };
  else S.famHouse = { type: 'rent', v: 0, where: S.home.city };
}
// 出生时家里的钱：积蓄和欠款分开记。参数按以下锚点校准（research/household_wealth.json）：
// · 金融资产中位数：CHFS 2011 城镇 16,500 元、农村 3,000 元，按收入增长折算到现在约城镇 4.6 万、农村 8,500 元
// · 有负债的家庭：CHFS 2011 城镇 35%、农村 40%；农村民间借贷 43.8%（2013）；城镇有房贷 43.4%（人民银行 2019）
// · 负债 ÷ 收入：农村 1.47、城镇 1.25（CHFS 2019）
// save：积蓄约为全家年收入的几倍（中位数，按家境 1–5 档）；debtP：有欠款的概率；debt：欠款约为全家年收入的几倍（中位数）
export const WEALTH0 = {
  rural: { save: [0.015, 0.045, 0.08, 0.13, 0.27], debtP: [0.48, 0.44, 0.4, 0.36, 0.3], debt: [1.35, 1.5, 1.6, 1.75, 1.9], why: ['盖房子', '看病', '办婚事、彩礼', '做生意'] },
  urban: { save: [0.04, 0.1, 0.21, 0.38, 0.77], debtP: [0.3, 0.4, 0.45, 0.5, 0.45], debt: [1.0, 1.4, 1.7, 2.0, 2.2], why: ['房贷', '房贷', '车贷和消费贷', '做生意'] },
};
export const DEBT_CAP = { 车贷和消费贷: 15e4, 看病: 40e4, '办婚事、彩礼': 35e4, 盖房子: 60e4 };
export function famWealthInit() {
  const W = WEALTH0[S.rural ? 'rural' : 'urban'], q = S.q - 1;
  const hhInc = famIncome() * (S.famSize || 3 + S.fam.sibs.length);
  const save = hhInc * W.save[q] * fexp(gauss(0, 1.0)); // 积蓄分布很偏：少数家庭存得很多
  let debt = 0;
  if (chance(W.debtP[q])) {
    debt = hhInc * W.debt[q] * fexp(gauss(0, 0.6));
    S.famDebtWhy = pick(W.why);
    // 租房的家庭没有房贷
    if (S.famDebtWhy === '房贷' && (!S.famHouse || S.famHouse.type !== 'own')) S.famDebtWhy = '车贷和消费贷';
    // 各类借款的上限（估计）：车贷和消费贷十几万，看病几十万，彩礼和办婚事几十万，农村盖房几十万；房贷、做生意不设上限
    const cap = DEBT_CAP[S.famDebtWhy];
    if (cap) debt = Math.min(debt, cap * (0.6 + 0.4 * rnd()));
  }
  S.famMoney = Math.round(save / 100) * 100;
  S.famDebt = S.famDebt0 = Math.round(debt / 100) * 100;
  // 房贷还剩 10–25 年；其他借款（盖房、看病、亲戚借款）用家里每年省下的钱还，年限按欠款和收入估算（只用于显示，每年重算）
  S.famDebtYears = !debt ? 0 : S.famDebtWhy === '房贷' ? ri(10, 25) : Math.min(99, Math.ceil(debt / Math.max(1, (parentIncome('mom') + parentIncome('dad')) * FAM_REPAY[S.rural ? 'rural' : 'urban'][q])));
}
export const FAM_HOUSE_N = { self: '农村自建房', own: '自有住房', rent: '租房住', gone: '已由子女继承' };
// 父母家庭当下的人均可支配收入：父母的工资或养老金合计 ÷ 家里还靠他们生活的人数
export const parentsPerCap = () => { const f = S.fam, n = (f.mom.alive ? 1 : 0) + (f.dad.alive ? 1 : 0) + (S.indep === false ? 1 + f.sibs.filter(x => x.age < 18).length : 0); return n ? (parentIncome('mom') + parentIncome('dad')) / n : 0; };
// 出生时的家庭人均可支配收入：由父母收入算出（familyIncomeInit）
export const famIncome = () => S.famPC != null ? S.famPC : QUINT[S.rural ? "rural" : "urban"][S.q - 1];
// 父母能帮多少：家里实际攒下的钱，最多拿出六成
export const parentsHelp = () => (S.fam.mom.alive || S.fam.dad.alive) ? Math.max(0, (S.famMoney || 0) * 0.6) : 0;
export const PEDU = {
  rural: { 1: 0.07, 2: 0.5, 3: 0.12, 4: 0.12, 5: 0.12, 6: 0.06, 7: 0.01 },
  urban: { 1: 0.02, 2: 0.22, 3: 0.14, 4: 0.12, 5: 0.22, 6: 0.24, 7: 0.04 },
};
// 校准系数：使出生时城镇、农村家庭人均可支配收入的中位数对上统计局 2025 年数据（城镇 51,115 元、农村 20,711 元）
export const PARENT_K = { urban: 1.08, rural: 0.715 };
export const PARENT_DISP = 0.9; // 工资 → 可支配收入（扣个税、社保，估计）

export function pickParentEdu(rural, pid) {
  const base = PEDU[rural ? 'rural' : 'urban'], hi = (PBY[pid].eduHi || EDU_NAT) / EDU_NAT;
  return +wpick(Object.entries(base).map(([e, w]) => [e, +e >= 5 ? w * hi : w]));
}
export function pickParentJob(edu, rural, female) {
  if (female && chance(rural ? 0.18 : 0.12)) return 'home';
  if (rural) {
    if (edu <= 2) return wpick({ migrant: 5, farmer: 3, build: female ? 0.3 : 2, factory: 1.5, shop: 1, driver: female ? 0 : 0.8 });
    if (edu <= 4) return wpick({ migrant: 3, factory: 2, skilled: 1.5, shop: 1.5, sales: 1, farmer: 1, driver: female ? 0 : 1 });
    return wpick({ clerk: 3, teacher: 1.5, nurse: female ? 1.5 : 0.2, sales: 1.5, civil: 1, skilled: 1, migrant: 1 });
  }
  if (edu <= 2) return wpick({ factory: 3, rider: female ? 0.3 : 2, driver: female ? 0.2 : 1.5, shop: 2, sales: 1.5, build: female ? 0 : 1 });
  if (edu <= 4) return wpick({ sales: 2.5, clerk: 2, skilled: 2, factory: 1.5, shop: 1.5, nurse: female ? 1.2 : 0.1, driver: female ? 0 : 1, rider: female ? 0.2 : 1 });
  return wpick({ clerk: 4, engineer: female ? 1 : 2, teacher: 1.5, sales: 1.5, civil: 1, doctor: 0.5, nurse: female ? 1 : 0.1, tech: 0.8, boss: 0.6 });
}
export const parentJobName = (jk, rural) => jk === 'migrant' ? '外出务工' : jk === 'farmer' ? '务农' : jk === 'home' ? (rural ? '在家务农带孩子' : '全职在家') : JOBS[jk].n;
export function setParentJob(p, jk) { p.jk = jk; p.job = parentJobName(jk, S.rural); }

export function makeParent(sex, age, rural, pid) {
  const edu = pickParentEdu(rural, pid);
  const p: any = { sex, age, edu, alive: true, startAge: edu >= 7 ? 25 : edu >= 6 ? 22 : edu >= 5 ? 21 : edu >= 3 ? 18 : 16 };
  setParentJob(p, pickParentJob(edu, rural, sex === 'F'));
  // 个人系数：学历溢价（与你本人同一张表）× 个人差异；父母一代的差异放大一些，包含工时、奖金、兼职等（估计）
  p.k = fexp(gauss(0, 0.65)) * EDU_WAGE[edu];
  return p;
}
// 父母在哪里挣钱：外出务工在打工城市（省会、沿海大城市为主）；农村家庭里有单位工作的，在本地级市的城区；其余在家里所在地
export function parentWorkLoc(p) {
  if (p.jk === 'migrant') {
    // 随迁：父母在你出生时所在的城市打工（第一次调用在出生时，记下那座城市；之后你搬走、回老家中考，他们不跟着变）
    if (S.flags.mig) return p.wloc || (p.wloc = { ...S.loc });
    // 夫妻都在外打工时，一般在同一座城市
    const o = p === S.fam.dad ? S.fam.mom : S.fam.dad;
    return p.wloc || (p.wloc = o.jk === 'migrant' && o.wloc ? o.wloc : migrantCity());
  }
  if (S.rural && p.jk !== 'farmer' && p.jk !== 'home') return p.wloc || (p.wloc = cityLoc(S.home.p, S.home.city));
  return S.home;
}
// 工龄系数：前 5 年从 0.75 涨到 1.0，之后每年 +2%，最高 1.1；50 岁以后每年 −1%（和你本人相同）
export const workExpK = p => expCurve(Math.max(0, p.age - p.startAge), p.age);
// 一个人在职时的年收入：工资基数 × 职业系数 × 个人系数 × 工龄系数 × 校准系数（父母、对象和你本人用同一套公式）
export function wageOf(p, L, K = 1) {
  const J = JOBS[p.jk];
  if (!J || !J.m || !p.alive) return 0;
  return wageBase(L) * J.m * p.k * workExpK(p) * K;
}
export const parentWage = p => wageOf(p, parentWorkLoc(p), PARENT_K[S.rural ? 'rural' : 'urban']);
// 家境：父母税后收入 ÷ 家庭人口，落在城镇或农村收入五等份的哪一档（档与档之间取相邻两组平均数的几何中点）
export function quintOf(pc, rural) {
  const Q = QUINT[rural ? 'rural' : 'urban'];
  let q = 1;
  for (let i = 0; i < 4; i++) if (pc > Math.sqrt(Q[i] * Q[i + 1])) q = i + 2;
  return q;
}
// 同住的老人：农村大多和爷爷奶奶住在一起（估计约七成），城镇少一些（约两成）；老人有一点养老金或务农收入
export function familyIncomeInit() {
  const f = S.fam;
  f.gp = chance(S.rural ? 0.7 : 0.2) ? 2 : 0;
  S.famSize = 3 + f.sibs.length + f.gp;
  const gpInc = f.gp ? f.gp * (S.rural ? (PBY[S.home.p].penR || 2950) * 1.5 : (PBY[S.home.p].penE || 45903) * 0.6) : 0;
  S.famPC = ((parentWage(f.dad) + parentWage(f.mom)) * PARENT_DISP + gpInc) / S.famSize;
  S.q = quintOf(S.famPC, S.rural);
}
