// 父母：和你本人同一套「学历 → 职业 → 工资」逻辑生成（直接生成为成年人，不从出生模拟）。
// 家境（收入五等份第几档）由父母的实际收入反推，而不是先随机定档。

// 父母一代（约 1985–2001 年出生）的学历分布（估计，参考 2020 年人口普查 25–39 岁人口）
// 学历编号与 EDU_LV 一致：1 小学 2 初中 3 高中 4 中专/职高 5 大专 6 本科 7 硕士
import { EDU_NAT, QUINT } from './real.generated';
import { EDU_WAGE, JOBS, S, chance, cityLoc, gauss, migrantCity, wageBase, wpick } from './engine';
import { PBY } from './data';

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
  p.k = Math.exp(gauss(0, 0.65)) * EDU_WAGE[edu];
  return p;
}
// 父母在哪里挣钱：外出务工在打工城市（省会、沿海大城市为主）；农村家庭里有单位工作的，在本地级市的城区；其余在家里所在地
export function parentWorkLoc(p) {
  if (p.jk === 'migrant') {
    if (S.flags.mig) return S.loc;
    // 夫妻都在外打工时，一般在同一座城市
    const o = p === S.fam.dad ? S.fam.mom : S.fam.dad;
    return p.wloc || (p.wloc = o.jk === 'migrant' && o.wloc ? o.wloc : migrantCity());
  }
  if (S.rural && p.jk !== 'farmer' && p.jk !== 'home') return p.wloc || (p.wloc = cityLoc(S.home.p, S.home.city));
  return S.home;
}
// 工龄系数：前 5 年从 0.75 涨到 1.0，之后每年 +2%，最高 1.1；50 岁以后每年 −1%（和你本人相同）
export const workExpK = p => { const y = Math.max(0, p.age - p.startAge); return (y <= 5 ? 0.75 + 0.05 * y : Math.min(1.1, 1 + 0.02 * (y - 5))) * (p.age > 50 ? Math.max(0.8, 1 - 0.01 * (p.age - 50)) : 1); };
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
