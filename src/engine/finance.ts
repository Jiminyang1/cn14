// 你自己的账：经济独立、每个月的收入和开销。

import { fexp, fpow } from './fmath';
import { JOBS, RESID_PENSION_JOBS, expK, wageMonth } from './career';
import { PBY } from './data';
import { S } from './state';
import { clamp, gauss } from './rng';
import { familyMoneyMonth } from './household';
import { HPF_JOB, houseMonth, hpfMonth, loanMonth, plusMonth, rentDraw } from './housing';
import { log } from './journal';
import { NAT_URBAN_INC, placeCons, placeHp, placeInc, wageBase } from './place';
import { wan } from './format';
import { MONTHS, calMonth, calYear } from './monthly';
import { turnsMonth } from './turns';
import { partnerLoc } from './romance';
import { dedOf, netOf, penBase, type DedRow, type NetPay } from './tax';
import type { Partner } from './types';
import { changeMoney, repayDebt } from './accounts';
import { livingBudget } from './budget';

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
    const x = S.famMoney; changeMoney(x); S.famMoney = 0;
    log(`开始自己过日子了。父母留下的钱这些年由亲戚帮着管，供你吃穿上学，剩下的${wan(x)}交到了你手里。`, 'ev');
  }
  if (S.stuDebt > 0) { S.debt = (S.debt || 0) + S.stuDebt; log(`开始工作时，身上还背着${wan(S.stuDebt)}的助学贷款。`, 'ev'); S.stuDebt = 0; }
}
export const REL_REF = 0.84;
const SAVE_INT_M = fpow(1.015, 1 / MONTHS), DEBT_INT_M = fpow(1.04, 1 / MONTHS);

// ===== 每个月月底 =====
/** 钱：你自己和父母家的收支、房贷、公积金，每月结算一个月的量。
 *  工资按这个月月底的工作发：年中换工作、被裁员、找到工作、退休，都从那个月起按新的状态算（一个月之内不再细分） */
export function moneyMonth(m: number) {
  const opening = S.statement?.closing ?? S.money;
  const events = S.money - opening;
  const beforeFamily = S.money;
  familyMoneyMonth(m);
  if (S.indep === false && S.job && !S.school && S.age >= 15) goIndep();
  if (S.indep === false || S.age < 15) return;
  let transfers = S.money - beforeFamily;
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
    if (m === MONTHS - 1) { S.jobY++; if (J.v) luckLog(J.v, myW); } // 工龄按年记：这一年最后一个月还在上班就加一年
    S.empY = plusMonth(S.empY); // 在本单位的年数按月记
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
  const beforeHpf = S.money;
  hpfMonth(hpfOwn, working, mp ? mp.hpf / MONTHS : 0);
  transfers += S.money - beforeHpf;
  const lateLife = turnsMonth(m);
  const hh = net + (mp ? mp.net / MONTHS : 0) + lateLife.income;
  changeMoney(hh);
  houseMonth(m);
  if (S.job === 'retired' && (!mate || mate.retired) && S.retirementLifestyle == null) S.retirementLifestyle = S.lifestyle;
  const budget = livingBudget({ consumption: H.cons, income: hh, adults: mate ? 2 : 1,
    retiredAdults: Number(S.job === 'retired') + Number(!!mate?.retired),
    children: f.kids.filter(child => child.alive && child.age < 22).map(child => child.age), lifestyle: S.lifestyle,
    retirementLifestyle: S.retirementLifestyle });
  S.lifestyle = budget.lifestyle;
  const basic = budget.living + budget.children;
  const basicPaid = Math.min(S.money, basic);
  S.money -= basicPaid;
  const living = basic ? basicPaid * budget.living / basic : 0;
  const children = basicPaid - living;
  const ownHere = S.house && S.house.city === S.loc.city;
  const rentDue = S.flags.oldLive === 'home' ? P * 0.5 / MONTHS
    : !ownHere && S.loc.kind !== 'rural' && S.flags.oldLive !== 'kid' && !S.flags.grandHelp ? H.hp * 45 * 0.018 * 0.6 / MONTHS : 0;
  const rentHpf = rentDraw(rentDue);
  changeMoney(rentHpf); transfers += rentHpf;
  const rent = Math.min(S.money, rentDue);
  changeMoney(-rentDue);
  const mortgage = loanMonth(S.money);
  S.money -= mortgage.cash;
  const debtInterest = (S.debt || 0) * (DEBT_INT_M - 1);
  S.debt = (S.debt || 0) + debtInterest;
  const reserve = basic + rentDue;
  const debtRepaid = repayDebt(Math.max(0, S.money - reserve));
  const discretionary = Math.min(budget.discretionary + lateLife.cost, Math.max(0, S.money - reserve));
  S.money -= discretionary;
  const depositInterest = S.money * (SAVE_INT_M - 1);
  S.money += depositInterest;
  const previous = S.statement;
  S.statement = { year: calYear(m), month: calMonth(m), opening, closing: S.money, events, transfers, income: hh,
    incomeDetails: { personal: net, partner: mp ? mp.net / MONTHS : 0, rehire: lateLife.income },
    living, children, discretionary, rent, mortgage: mortgage.cash, mortgageInterest: mortgage.interest,
    mortgageHpf: mortgage.hpf, debtRepaid, depositInterest, debtInterest,
    shortfall: basic - basicPaid + rentDue - rent, arrears: mortgage.arrears, debt: S.debt };
  if (!S.headless) {
    const history = S.statements ||= previous ? [previous] : [];
    const last = history[history.length - 1];
    if (last?.year === S.statement.year && last.month === S.statement.month) history[history.length - 1] = S.statement;
    else history.push(S.statement);
  }
  const totals = S.cashflow ||= { months: 0, income: 0, spending: 0, mortgage: 0, debtRepaid: 0 };
  totals.months++; totals.income += hh; totals.spending += living + children + discretionary + rent;
  totals.mortgage += mortgage.cash; totals.debtRepaid += debtRepaid;
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
// 抽的是标准正态值 z，倍数是 exp(v·z − v²/2)（原来是 exp(v·z)，均值 exp(v²/2)：小老板被放大到 ×1.28、个体户 ×1.20）。年中换到另一种波动的行当，沿用这一年的运气。
// z 限在 ±LUCK_Z 以内（估计）：原来不封顶，小老板偶尔抽到 ×10（一年税前一百六十多万），存款一年翻倍，时间线上却什么都没有。
// 封顶以后最多约 小老板 ×3.2、个体户 ×2.8、销售 ×1.9，最少约 ×0.2、×0.26、×0.47；再除以封顶后的均值（luckMean），这一行多年平均的收入仍是 JOBS 里的倍数。
// 倍数到 LUCK_LOG 以上的年份，在这一年最后一个月写进时间线（moneyMonth）
export const LUCK_Z = 2, LUCK_LOG = 1.8;
const luckMeans = new Map<number, number>();
// exp(v·clamp(z) − v²/2) 的均值：在 [−8, 8] 上按 0.001 的步长数值积分（每种 v 只算一次；只用加减乘除和 fexp，各环境结果相同）
function luckMean(v: number) {
  let k = luckMeans.get(v);
  if (k == null) {
    k = 0;
    for (let i = -8000; i <= 8000; i++) { const z = i / 1000; k += fexp(-z * z / 2 + v * clamp(z, -LUCK_Z, LUCK_Z) - v * v / 2); }
    k = k / 1000 / Math.sqrt(2 * Math.PI);
    luckMeans.set(v, k);
  }
  return k;
}
export const luckOf = (v: number, z: number) => fexp(v * clamp(z, -LUCK_Z, LUCK_Z) - v * v / 2) / luckMean(v);
function incomeLuck(v: number) {
  if (!v) return 1;
  const L = S.incLuck && S.incLuck.a === S.age ? S.incLuck : (S.incLuck = { a: S.age, z: gauss(0, 1) });
  return luckOf(v, L.z);
}
/** 这一年已经抽好的收入运气倍数（界面显示用，不消耗随机数；这一年还没抽过就是 1） */
export function incomeLuckNow(v = (JOBS[S.job] || {} as any).v) {
  return v && S.incLuck && S.incLuck.a === S.age ? luckOf(v, S.incLuck.z) : 1;
}
// 收入运气特别好的一年：在这一年最后一个月写一条（w 是这个月按一年算的税前收入）
function luckLog(v: number, w: number) {
  const k = incomeLuckNow(v);
  if (k < LUCK_LOG) return;
  log(S.job === 'sales' ? `这一年业绩特别好，提成拿了不少，税前收入约${wan(w)}，差不多是平常年份的${k.toFixed(1)}倍。`
    : `这一年生意特别好，税前赚了约${wan(w)}，差不多是平常年份的${k.toFixed(1)}倍。`, 'good');
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
