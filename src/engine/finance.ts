// 你自己的账：经济独立、每个月的收入和开销。

import { fexp, flog, fpow } from './fmath';
import { JOBS, RESID_PENSION_JOBS, expK } from './career';
import { PBY } from './data';
import { S } from './state';
import { clamp, gauss } from './rng';
import { familyMoneyMonth } from './household';
import { HPF_JOB, houseMonth, hpfMonth, loanMonth, plusMonth, rentDraw } from './housing';
import { log } from './journal';
import { placeCons, placeHp, placeInc, wageBase } from './place';
import { partnerLoc } from './romance';
import { wan } from './format';
import { MONTHS } from './monthly';
import { turnsMonth } from './turns';
import { dedOf, netOf, penBase, type DedRow, type NetPay } from './tax';
import type { Partner } from './types';

declare module './types' {
  interface Life {
    incLuck?: { a: number; z: number } // 这一年个体户、销售、小老板的收入运气（几岁那年抽的、标准正态值）
    net?: number                        // 现在的年收入（到手）：这个月到手的钱 × 12（S.income 是税前）
  }
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
  const f = S.fam, mate = f.married && f.partner && f.partner.alive ? f.partner : null;
  // 工资是税前的：先算这个月的税前工资（折成一年），扣掉五险、公积金个人部分和个税（tax.ts），到手的钱进存款，公积金进公积金账户
  let gross = 0, net = 0, hpfOwn = 0;
  if (working) {
    const w = H.wb * J.m * S.wageK * expK() * incomeLuck(J.v); // 一年的税前工资，即 wageRate() × 提成系数
    const pay = myPay(w, mate);
    gross += w / MONTHS; net += pay.net / MONTHS; hpfOwn = pay.hpf / MONTHS;
    penMonth(penBase(w, S.job, S.loc.p) / MONTHS);
    if (m === MONTHS - 1) S.jobY++; // 工龄按年记：这一年最后一个月还在上班就加一年
  }
  if (S.job === 'retired') {
    // 养老金免个税；子女赡养：成年子女每人每年给一些（按当地消费水平估计）
    let grown = 0;
    for (const k of f.kids) if (k.alive && S.age - k.bornAt >= 25) grown++;
    const x = ((S.pension || 0) + (grown ? H.cons * 0.35 * Math.min(2, grown) : 0)) / MONTHS;
    gross += x; net += x;
  }
  S.income = Math.round(gross * MONTHS); // 现在的年收入（税前，这个月 × 12）
  S.net = Math.round(net * MONTHS);      // 到手
  const P = H.inc;
  const mp = mate ? matePay(mate, working ? gross * MONTHS : 0) : null;
  let hh = net;
  hpfMonth(hpfOwn, working, mp ? mp.hpf / MONTHS : 0); // 你和配偶个人缴的公积金（已经从到手里扣掉了），单位再缴同样多
  if (mp) hh += mp.net / MONTHS;
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
// 只交城乡居民养老保险的职业（务农、打零工、个体户……）不算。每个月在岗记一个月（w 是这个月的缴费基数：本人工资限在社平工资的 60%–300%，
// 小老板按灵活就业 60% 档，见 tax.ts 的 penBase）：y、s 加 1/12 年，r 加这个月缴费基数折成一整年后的倍数 × 1/12，所以 r ÷ y 仍是平均倍数
export function penMonth(w: number) {
  if (RESID_PENSION_JOBS.has(S.job)) return;
  const pv = PBY[S.loc.p], P = S.pen || (S.pen = { y: 0, r: 0, s: 0 });
  P.y = plusMonth(P.y); P.r += w / (pv.incU || pv.inc); if (JOBS[S.job].stable) P.s = plusMonth(P.s);
}
// 当前工作的年薪（税前，不含个体户、销售的年度波动）
export const wageRate = () => { const J = JOBS[S.job]; return J && J.m ? wageBase() * J.m * S.wageK * expK() : 0; };
/** 这一年的提成系数（个体户、销售、小老板的收入运气）：这一年已经抽过就是那个倍数，还没抽（或者这行没有波动）是 1。不消耗随机数，界面可以用 */
export const incLuckNow = () => { const J = JOBS[S.job]; return J && J.v && S.incLuck && S.incLuck.a === S.age ? fexp(J.v * S.incLuck.z) : 1; };
/** 夫妻俩谁的税前工资高（配偶退休、没有工作时是 0） */
const mateGross = (mate: Partner | null) => mate && !mate.retired && mate.jk ? mate.inc : 0;
/** 你的工资明细（一年）：w 是税前年薪。夫妻都有工资时孩子的扣除各扣一半，住房的扣除由工资高的那个扣 */
export function myPay(w = wageRate() * incLuckNow(), mate: Partner | null = S.fam.married && S.fam.partner && S.fam.partner.alive ? S.fam.partner : null, rows?: DedRow[]): NetPay {
  const mg = mateGross(mate);
  return netOf(w, { jk: S.job, p: S.loc.p, hpf: S.hpfOn ? S.hpfRate : 0, ded: dedOf(null, true, mg > 0 && w > 0, w >= mg, rows) });
}
/** 配偶的收入明细（一年）：在职按税前工资扣五险一金、个税；退休以后的养老金免税。myW 是你的税前年薪 */
export function matePay(p: Partner, myW: number, rows?: DedRow[]): NetPay {
  const g = mateGross(p);
  if (!g) return netOf(p.inc || 0, { jk: 'retired', p: S.loc.p });
  return netOf(g, { jk: p.jk, p: S.loc.p, hpf: p.hpf && HPF_JOB[p.jk] ? HPF_JOB[p.jk][1] : 0, ded: dedOf(p, true, myW > 0, g > myW, rows) });
}
/** 对方的收入明细（界面显示「税前 X，到手 Y」用）：配偶同 matePay；恋爱对象只算对方自己的扣除（孩子、住房不算），在对方工作的省份参保 */
export function partnerPay(p: Partner, rows?: DedRow[]): NetPay {
  const f = S.fam;
  if (p === f.partner && f.married) return matePay(p, wageRate() * incLuckNow(), rows);
  if (!p.jk || p.retired) return netOf(p.inc || 0, { jk: 'retired', p: S.loc.p });
  return netOf(p.inc, { jk: p.jk, p: partnerLoc(p).p, hpf: p.hpf && HPF_JOB[p.jk] ? HPF_JOB[p.jk][1] : 0, ded: dedOf(p, false, false, false, rows) });
}
