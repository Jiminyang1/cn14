// 你自己的账：经济独立、每个月的收入和开销。

import { fexp, flog, fpow } from './fmath';
import { JOBS, RESID_PENSION_JOBS, expK } from './career';
import { PBY } from './data';
import { S } from './state';
import { clamp, gauss } from './rng';
import { familyMoneyMonth } from './household';
import { houseMonth, hpfMonth, loanMonth, plusMonth, rentDraw } from './housing';
import { log } from './journal';
import { placeCons, placeHp, placeInc, wageBase } from './place';
import { wan } from './format';
import { MONTHS } from './monthly';
import { turnsMonth } from './turns';

declare module './types' {
  interface Life { incLuck?: { a: number; z: number } } // 这一年个体户、销售、小老板的收入运气（几岁那年抽的、标准正态值）
}

// 经济独立：开始工作（或毕业/辍学后离开学校）才有自己的账户；之前钱的进出都算家里的
export function goIndep() {
  if (S.indep !== false) return;
  S.indep = true; S.indepAt = S.age;
  if (S.famMoney < 0 && S.flags.stuLoan) { S.money += S.famMoney; S.famMoney = 0; log(`开始工作时，身上还背着${wan(-S.money)}的助学贷款。`, 'ev'); }
}
export const SAVE_BASE = 0.2;
// 存款年利息约 1.5%，欠款（多是信用卡、网贷、亲戚的钱）约 4%：换算成每月复利
const SAVE_INT_M = fpow(1.015, 1 / MONTHS), DEBT_INT_M = fpow(1.04, 1 / MONTHS);

// ===== 每个月月底 =====
/** 钱：你自己和父母家的收支、房贷、公积金，每月结算一个月的量。
 *  工资按这个月月底的工作发：年中换工作、被裁员、找到工作、退休，都从那个月起按新的状态算（一个月之内不再细分） */
export function moneyMonth(m: number) {
  familyMoneyMonth(m);
  if (S.indep === false && S.job && !S.school && S.age >= 15) goIndep();
  if (S.indep === false) return;
  if (S.age < 16) return;
  const J = JOBS[S.job], H = here(), working = !!(J && J.m > 0);
  let inc = 0, hpfOwn = 0;
  if (working) {
    const w = H.wb * J.m * S.wageK * expK() * incomeLuck(J.v) / MONTHS; // 即 wageRate()
    inc += w; penMonth(w);
    if (S.hpfOn) hpfOwn = w * S.hpfRate;
    if (m === MONTHS - 1) S.jobY++; // 工龄按年记：这一年最后一个月还在上班就加一年
  }
  const f = S.fam;
  if (S.job === 'retired') {
    inc += (S.pension || 0) / MONTHS;
    // 子女赡养：成年子女每人每年给一些（按当地消费水平估计）
    let grown = 0;
    for (const k of f.kids) if (k.alive && S.age - k.bornAt >= 25) grown++;
    if (grown) inc += H.cons * 0.35 * Math.min(2, grown) / MONTHS;
  }
  S.income = Math.round(inc * MONTHS); // 现在的年收入（这个月的收入 × 12）
  const P = H.inc, mate = f.married && f.partner && f.partner.alive ? f.partner : null;
  let hh = inc;
  hh -= hpfMonth(hpfOwn, working); // 个人缴的公积金从工资里扣
  if (mate) hh += mate.inc / MONTHS;
  // 房贷先算：背着房贷的家庭会压缩日常开销（但不低于当地最低生活水平）
  const mort = loanMonth();
  houseMonth(m);
  let cost = 0;
  const adult = working || S.job === 'seeking' || S.job === 'retired' || S.job === 'home';
  if (adult) {
    // 储蓄率模型：全国居民储蓄率 ≈ (可支配收入 − 消费) ÷ 可支配收入 ≈ 32%（2025）。
    // 收入越高于当地水平，存得越多；但开销不低于当地人均消费（最低生活）。储蓄率按年化的收入（这个月 × 12）算，和按年结算时含义相同
    const adults = mate ? 2 : 1;
    const per = hh * MONTHS / adults;
    const sr = per > 0 ? clamp(SAVE_BASE + 0.15 * flog(per / P), -0.2, 0.55) : 0;
    const cons = H.cons;
    cost = Math.max(hh * (1 - sr) - mort * 0.6, cons * adults * (S.job === 'retired' ? 0.6 : 0.9) / MONTHS);
    // 养孩子：人均消费里已经摊进了一部分孩子的开销，这里只加额外的教育、看护支出
    for (const k of f.kids) if (k.alive && k.age < 22) cost += cons * 0.25 / MONTHS;
    // 在城里租房的人，房租比当地平均水平多出一块（统计里的居住支出多为自有住房折算）
    // 老了住进养老院：每月的费用代替房租；搬去和子女同住：不付房租
    const ownHere = S.house && S.house.city === S.loc.city;
    if (S.flags.oldLive === 'home') cost += P * 0.5 / MONTHS;
    else if (!ownHere && S.loc.kind !== 'rural' && S.flags.oldLive !== 'kid' && !S.flags.grandHelp) { const rent = H.hp * 45 * 0.018 * 0.6 / MONTHS; cost += rent - rentDraw(rent); }
  }
  cost += mort;
  turnsMonth(m); // 返聘的工资、候鸟的开销（turns.ts）
  S.money += hh - cost;
  S.money *= S.money > 0 ? SAVE_INT_M : DEBT_INT_M;
  S.relInc = clamp((hh * MONTHS / (f.married ? 1.6 : 1) / P - 1) * 6, -10, 10);
  if (S.money > S.stats.maxMoney) S.stats.maxMoney = S.money;
}
// 当地的收入、消费、房价、工资基数只取决于在哪里（地点数据是常量）：每月都要用，按地点缓存，只省掉重复计算，结果完全相同
let hereKey: { p: string; city: string; kind: string } = null, hereVal: { inc: number; cons: number; hp: number; wb: number } = null;
function here() {
  const L = S.loc, k = hereKey;
  if (!k || k.p !== L.p || k.city !== L.city || k.kind !== L.kind) {
    hereKey = { p: L.p, city: L.city, kind: L.kind };
    hereVal = { inc: placeInc(L), cons: placeCons(L), hp: placeHp(L), wb: wageBase(L) };
  }
  return hereVal;
}
// 个体户、销售、小老板的收入一年好一年坏：每年抽一次（这一年第一个干这类工作的月份，通常就是第 0 个月），这一年每个月都乘同一个倍数。
// 抽的是标准正态值，乘上这一行的波动 v（和原来按年的 gauss(0, v) 是同一个分布）；年中换到另一种波动的行当，沿用这一年的运气
function incomeLuck(v: number) {
  if (!v) return 1;
  const L = S.incLuck && S.incLuck.a === S.age ? S.incLuck : (S.incLuck = { a: S.age, z: gauss(0, 1) });
  return fexp(v * L.z);
}
// 职工养老保险的缴费记录：交了几年（y）、每年工资相对当地城镇人均可支配收入的倍数之和（r）、其中在机关事业单位的年数（s）。
// 只交城乡居民养老保险的职业（务农、打零工、个体户……）不算。每个月在岗记一个月（w 是这个月的工资）：y、s 加 1/12 年，r 加这个月工资折成一整年后的倍数 × 1/12，所以 r ÷ y 仍是平均倍数
export function penMonth(w: number) {
  if (RESID_PENSION_JOBS.has(S.job)) return;
  const pv = PBY[S.loc.p], P = S.pen || (S.pen = { y: 0, r: 0, s: 0 });
  P.y = plusMonth(P.y); P.r += w / (pv.incU || pv.inc); if (JOBS[S.job].stable) P.s = plusMonth(P.s);
}
// 当前工作的年薪（不含个体户、销售的年度波动）
export const wageRate = () => { const J = JOBS[S.job]; return J && J.m ? wageBase() * J.m * S.wageK * expK() : 0; };
