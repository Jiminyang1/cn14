// 你自己的账：经济独立、每个月的收入和开销。

import { fexp, flog, fpow } from './fmath';
import { JOBS, RESID_PENSION_JOBS, expK, wageMonth } from './career';
import { PBY } from './data';
import { S } from './state';
import { clamp, gauss } from './rng';
import { familyMoneyMonth } from './household';
import { HPF_JOB, houseMonth, hpfMonth, loanMonth, plusMonth, rentDraw } from './housing';
import { log } from './journal';
import { NAT_URBAN_INC, placeCons, placeHp, placeInc, wageBase } from './place';
import { wan } from './format';
import { MONTHS } from './monthly';
import { turnsMonth } from './turns';
import { partnerLoc } from './romance';
import { dedOf, netOf, penBase, type DedRow, type NetPay } from './tax';
import type { Partner } from './types';

declare module './types' {
  interface Life {
    incLuck?: { a: number; z: number }; // 这一年个体户、销售、小老板的收入运气（几岁那年抽的、标准正态值）
    uiY?: number;   // 失业保险缴费年数（上一次领失业保险金以后重新算）
    uiM?: number;   // 还能领几个月失业保险金
    uiOn?: boolean; // 这一段待业已经办了领取
    net?: number;   // 现在的年收入（到手）：这个月到手的钱 × 12（S.income 是税前）
  }
}

// 经济独立：开始工作（或毕业/辍学后离开学校）才有自己的账户；之前钱的进出都算家里的。
// · 父母都已经去世的：家里账上剩下的钱（遗产扣掉这些年的生活费、学费）转给你；
// · 上学时借的助学贷款（household.ts 的 stuDebt，只有学费的缺口）转到你名下；家里别的欠款留在父母账上
export function goIndep() {
  if (S.indep !== false) return;
  S.indep = true; S.indepAt = S.age;
  const f = S.fam;
  if (!f.mom.alive && !f.dad.alive && S.famMoney > 0) {
    const x = S.famMoney; S.money += x; S.famMoney = 0;
    log(`开始自己过日子了。父母留下的钱这些年由亲戚帮着管，供你吃穿上学，剩下的${wan(x)}交到了你手里。`, 'ev');
  }
  if (S.stuDebt > 0) { S.money -= S.stuDebt; log(`开始工作时，身上还背着${wan(S.stuDebt)}的助学贷款。`, 'ev'); S.stuDebt = 0; }
}
// 储蓄率模型的参数（见 moneyMonth）。SAVE_BASE：收入正好是当地人均水平的人存下的比例。
// 收入改成扣掉五险一金、个税以后的到手（tax.ts）以后，0.2 → 0.24：使在职者按公式算出的储蓄率（按家庭到手收入加权）仍约 32%，和全国居民储蓄率一致
// （公式里比的是当地人均可支配收入，原来代入的是只扣了公积金的税前工资；npm run calib -- money）。
// 工资对齐统计局以后（DATA.md「工资」）0.24 → 0.265：加权储蓄率 29.7% → 32.3%（统计局 2025 年全国居民 32.0%）
export const SAVE_BASE = 0.265;
// 财富效应：在职时，存款多的家庭花得也多，每年多花存款的 WEALTH_MPC（估计；发达国家的研究多在 2%–5%，中国家庭偏低）。
// 存款利息照样进账，所以存款本身每年净减约 1.5 个百分点，免得一辈子只进不出
export const WEALTH_MPC = 0.06;
// 退休以后：不再按储蓄率存钱，收入（养老金、子女给的、配偶的收入）全部花掉，再每年花掉存款的 RET_DRAW（估计；常说的「4% 法则」，
// 中国老人留钱给子女、防病的动机强，取 4% 到 5% 之间）。看病、住养老院的钱另算
export const RET_DRAW = 0.05;
// 欠着钱的时候：至少拿出收入的 DEBT_SR 还债，日常开销可以压到平时下限的 DEBT_FLOOR（估计）。
// 工资对齐统计局以后（DATA.md「工资」）0.25 → 0.35、八成 → 0.65：收入低了，按原来的比例还债，欠款几年都还不完，
// 买过房的人里后来急着卖房、被法拍的从约 8% 升到约 11%；调了以后约 9%
export const DEBT_SR = 0.35, DEBT_FLOOR = 0.65;
// 相对收入（幸福的目标值里用，stats.ts）：家庭到手收入（结了婚除以 1.6）÷（当地人均可支配收入 × REL_REF）。
// 幸福的目标值是按原来偏高的工资调的（25–59 岁 relInc 平均约 5.4）；工资对齐统计局以后平均降到约 3.9，离婚多了约一个百分点。
// 参照点乘 0.84，使平均回到约 5.4，不改变幸福、恋爱、离婚的校准
export const REL_REF = 0.84;
// 存款年利息约 1.5%，欠款（多是信用卡、网贷、亲戚的钱）约 4%：换算成每月复利。
// 欠款超过当地 DEBT_FREEZE 年人均收入的部分不再计息：欠到这个份上已经还不上，亲戚的钱不再算利息，网贷、信用卡逾期后起诉的，法院只支持有限的利息（估计）
const SAVE_INT_M = fpow(1.015, 1 / MONTHS), DEBT_INT_M = fpow(1.04, 1 / MONTHS);
export const DEBT_FREEZE = 3;

// ===== 每个月月底 =====
/** 钱：你自己和父母家的收支、房贷、公积金，每月结算一个月的量。
 *  工资按这个月月底的工作发：年中换工作、被裁员、找到工作、退休，都从那个月起按新的状态算（一个月之内不再细分） */
export function moneyMonth(m: number) {
  familyMoneyMonth(m);
  if (S.indep === false && S.job && !S.school && S.age >= 15) goIndep();
  if (S.indep === false || S.age < 15) return;
  const J = JOBS[S.job], H = here(), working = !!(J && J.m > 0);
  const f = S.fam, mate = f.married && f.partner && f.partner.alive ? f.partner : null;
  // 工资是税前的：先算这个月的税前工资（折成一年），扣掉五险、公积金个人部分和个税（tax.ts），到手的钱进存款，公积金进公积金账户
  let gross = 0, net = 0, hpfOwn = 0, myW = 0;
  if (working) {
    wageMonth(); // 比同龄同行多涨的工资慢慢回落（career.ts）
    myW = H.wb * J.m * S.wageK * expK() * incomeLuck(J.v); // 一年的税前工资，即 wageRate() × 收入运气
    const pay = myPay(myW, mate);
    gross += myW / MONTHS; net += pay.net / MONTHS; hpfOwn = pay.hpf / MONTHS;
    penMonth(penBase(myW, S.job, S.loc.p) / MONTHS);
    if (J.stable || J.priv) S.uiY = plusMonth(S.uiY); // 有单位的工作交失业保险（和 career.ts 的 hire 设 empIns 的条件一样）
    if (m === MONTHS - 1) S.jobY++; // 工龄按年记：这一年最后一个月还在上班就加一年
  }
  const ui = uiMonth(); // 失业保险金免个税
  gross += ui; net += ui;
  if (S.job === 'retired') {
    const x = retireMonthly(H.cons); // 养老金免个税，子女给的钱也不交税
    gross += x; net += x;
  }
  S.income = Math.round(gross * MONTHS); // 现在的年收入（税前，这个月 × 12）
  S.net = Math.round(net * MONTHS);      // 到手
  const P = H.inc, mp = mate ? matePay(mate, myW) : null;
  let hh = net;
  hpfMonth(hpfOwn, working, mp ? mp.hpf / MONTHS : 0); // 你和配偶个人缴的公积金（已经从到手里扣掉了），单位再缴同样多
  if (mp) hh += mp.net / MONTHS;
  // 房贷先算：背着房贷的家庭会压缩日常开销（但不低于当地最低生活水平）
  const mort = loanMonth();
  houseMonth(m);
  let cost = 0;
  const retired = S.job === 'retired', debt = S.money <= 0;
  const adult = working || S.job === 'seeking' || S.job === 'retired' || S.job === 'home';
  if (adult) {
    // 储蓄率模型：全国居民储蓄率 ≈ (可支配收入 − 消费) ÷ 可支配收入 ≈ 32%（2025）。
    // 收入越高于当地水平，存得越多；但开销不低于当地人均消费（最低生活）。储蓄率按年化的收入（这个月 × 12）算，和按年结算时含义相同。
    // 在职时另按存款多花一点（财富效应，WEALTH_MPC）；欠着钱时至少拿 DEBT_SR 还债、开销压到下限的 DEBT_FLOOR
    const adults = mate ? 2 : 1, cons = H.cons, save = debt ? 0 : S.money;
    const per = hh * MONTHS / adults;
    let sr = retired ? 0 : per > 0 ? clamp(SAVE_BASE + 0.15 * flog(per / P), -0.2, 0.55) : 0;
    if (debt) sr = Math.max(sr, DEBT_SR);
    const spend = hh * (1 - sr) - mort * 0.6 + save * (retired ? RET_DRAW : WEALTH_MPC) / MONTHS;
    let extra = 0;
    // 养孩子：人均消费里已经摊进了一部分孩子的开销，这里只加额外的教育、看护支出
    for (const k of f.kids) if (k.alive && k.age < 22) extra += cons * 0.25 / MONTHS;
    // 在城里租房的人，房租比当地平均水平多出一块（统计里的居住支出多为自有住房折算）；欠着钱的人租便宜的房子（合租、城中村），按六成算（估计）
    // 老了住进养老院：每月的费用代替房租；搬去和子女同住：不付房租
    const ownHere = S.house && S.house.city === S.loc.city;
    if (S.flags.oldLive === 'home') extra += P * 0.5 / MONTHS;
    else if (!ownHere && S.loc.kind !== 'rural' && S.flags.oldLive !== 'kid' && !S.flags.grandHelp) { const rent = H.hp * 45 * 0.018 * 0.6 * (debt ? 0.6 : 1) / MONTHS; extra += rent - rentDraw(rent); }
    const floor = cons * adults * (retired ? 0.6 : 0.9) * (debt ? DEBT_FLOOR : 1) / MONTHS;
    // 退休以后：收入全部花掉，再花存款的 RET_DRAW，房租、养老院也从这里面出（不够时不低于最低生活 + 房租，但只花到存款用完为止）；
    // 没了积蓄、欠着钱（多是看病）就借不到钱了：自己的开销最多花到收入的 1 − DEBT_SR，剩下的拿去还债；不够的由子女、亲戚和低保兜底，不再记成自己的欠款
    if (retired) { cost = Math.max(spend, Math.min(floor + extra, hh + save)); if (debt) cost = Math.min(cost, Math.max(0, hh) * (1 - DEBT_SR)); }
    else cost = Math.max(spend, floor) + extra;
  }
  cost += mort;
  turnsMonth(m); // 返聘的工资、候鸟的开销（turns.ts）
  S.money += hh - cost;
  if (S.money > 0) S.money *= SAVE_INT_M;
  else if (S.money < 0) S.money -= Math.min(-S.money, DEBT_FREEZE * P) * (DEBT_INT_M - 1);
  S.relInc = clamp((hh * MONTHS / (f.married ? 1.6 : 1) / (P * REL_REF) - 1) * 6, -10, 10);
  if (S.money > S.stats.maxMoney) S.stats.maxMoney = S.money;
}
// ===== 失业保险金 =====
// 《失业保险条例》第14、17条：缴费满 1 年、非本人意愿中断就业的可以领；缴费 1–5 年最长 12 个月、5–10 年 18 个月、10 年以上 24 个月；
// 重新就业后再失业的，缴费时间重新计算，上次没领完的月数可以合并，最长 24 个月。
// 金额：2024 年全国月人均 1,898 元（人社部统计公报），各地按最低工资的八到九成定，地区差距比收入差距小：
// 按所在省城镇人均可支配收入相对全国的 0.5 次方调整（估计；北京约 2,470 元/月，实际 2,000–2,400 元）。
// 简化：只要待业、交过失业保险就领，不区分是不是自己辞职（游戏里待业多是被裁、公司倒闭、没考上）
export const UI_YEAR = 1898 * 12;
export const uiEntitle = (y = S.uiY || 0) => y >= 10 ? 24 : y >= 5 ? 18 : y >= 1 ? 12 : 0;
/** 现在失业的话最长能领几个月（裁员抉择的卡片可以用它） */
export const uiMonths = () => S.flags.empIns ? Math.min(24, (S.uiM || 0) + uiEntitle()) : 0;
export const uiPay = () => { const pv = PBY[S.loc.p]; return UI_YEAR * fpow((pv.incU || pv.inc) / NAT_URBAN_INC, 0.5); };
/** 这个月的失业保险金：待业的第一个月办领取，之后每月发一次，领满为止 */
function uiMonth() {
  if (S.job !== 'seeking') { S.uiOn = false; return 0; }
  if (!S.uiOn) {
    S.uiOn = true; S.uiM = uiMonths(); S.uiY = 0;
    if (S.uiM) log(`办了失业登记，开始领失业保险金：每月约${Math.round(uiPay() / MONTHS / 10) * 10}元，最多领${S.uiM}个月。`, 'ev', '《失业保险条例》第17条：缴费1–5年最长领12个月，5–10年18个月，10年以上24个月。2024年全国月人均1,898元');
  }
  if (!(S.uiM > 0)) return 0;
  S.uiM--;
  return uiPay() / MONTHS;
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
// 抽的是标准正态值 z，倍数是 exp(v·z − v²/2)：对数正态的均值正好是 1，这一行多年平均的收入就是 JOBS 里的倍数
// （原来是 exp(v·z)，均值 exp(v²/2)：小老板被放大到 ×1.28、个体户 ×1.20）。年中换到另一种波动的行当，沿用这一年的运气
function incomeLuck(v: number) {
  if (!v) return 1;
  const L = S.incLuck && S.incLuck.a === S.age ? S.incLuck : (S.incLuck = { a: S.age, z: gauss(0, 1) });
  return fexp(v * L.z - v * v / 2);
}
/** 这一年已经抽好的收入运气倍数（界面显示用，不消耗随机数；这一年还没抽过就是 1） */
export function incomeLuckNow(v = (JOBS[S.job] || {} as any).v) {
  return v && S.incLuck && S.incLuck.a === S.age ? fexp(v * S.incLuck.z - v * v / 2) : 1;
}
// 职工养老保险的缴费记录：交了几年（y）、每年工资相对当地城镇人均可支配收入的倍数之和（r）、其中在机关事业单位的年数（s）。
// 只交城乡居民养老保险的职业（务农、打零工、个体户……）不算。每个月在岗记一个月（w 是这个月的缴费基数：本人工资限在社平工资的 60%–300%，
// 小老板按灵活就业 60% 档，见 tax.ts 的 penBase）：y、s 加 1/12 年，r 加这个月缴费基数折成一整年后的倍数 × 1/12，所以 r ÷ y 仍是平均倍数
export function penMonth(w: number) {
  if (RESID_PENSION_JOBS.has(S.job)) return;
  const pv = PBY[S.loc.p], P = S.pen || (S.pen = { y: 0, r: 0, s: 0 });
  P.y = plusMonth(P.y); P.r += w / (pv.incU || pv.inc); if (JOBS[S.job].stable) P.s = plusMonth(P.s);
}
// 退休以后每月的收入：养老金，加上成年子女每人每年给的一些（按当地消费水平估计）
function retireMonthly(cons: number) {
  let grown = 0;
  for (const k of S.fam.kids) if (k.alive && k.age >= 25) grown++;
  return ((S.pension || 0) + (grown ? cons * 0.35 * Math.min(2, grown) : 0)) / MONTHS;
}
/** 界面用：这个月的收入，税前（gross）和到手（net），不消耗随机数。上班的是工资（含销售的提成系数、个体户和小老板的生意系数），扣五险一金、个税；
 *  退休的是养老金加成年子女给的；待业的是失业保险金（都不交税）。和 moneyMonth 里记进 S.income / S.net 的同一套算法（那两个是上个月月底的 × 12），不含配偶的收入、返聘 */
export function monthlyPay(): { gross: number; net: number } {
  const J = JOBS[S.job];
  if (J && J.m) { const p = myPay(); return { gross: p.gross / MONTHS, net: p.net / MONTHS }; }
  const x = S.job === 'retired' ? retireMonthly(here().cons)
    : S.job === 'seeking' && S.flags.empIns && (S.uiOn ? S.uiM > 0 : uiMonths() > 0) ? uiPay() / MONTHS : 0;
  return { gross: x, net: x };
}
/** 这个月到手的钱（侧栏「月收入」） */
export const monthlyIncome = () => monthlyPay().net;
// 当前工作的年薪（税前，不含个体户、销售的年度波动）
export const wageRate = () => { const J = JOBS[S.job]; return J && J.m ? wageBase() * J.m * S.wageK * expK() : 0; };
/** 夫妻俩谁的税前工资高（配偶退休、没有工作时是 0） */
const mateGross = (mate: Partner | null) => mate && !mate.retired && mate.jk ? mate.inc : 0;
const marriedMate = () => S.fam.married && S.fam.partner && S.fam.partner.alive ? S.fam.partner : null;
/** 你的工资明细（一年）：w 是税前年薪（默认是现在的工资 × 这一年的收入运气）。夫妻都有工资时孩子的扣除各扣一半，住房的扣除由工资高的那个扣 */
export function myPay(w = wageRate() * incomeLuckNow(), mate: Partner | null = marriedMate(), rows?: DedRow[]): NetPay {
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
  if (p === f.partner && f.married) return matePay(p, wageRate() * incomeLuckNow(), rows);
  if (!p.jk || p.retired) return netOf(p.inc || 0, { jk: 'retired', p: S.loc.p });
  return netOf(p.inc, { jk: p.jk, p: partnerLoc(p).p, hpf: p.hpf && HPF_JOB[p.jk] ? HPF_JOB[p.jk][1] : 0, ded: dedOf(p, false, false, false, rows) });
}
