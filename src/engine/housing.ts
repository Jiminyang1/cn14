// 住房公积金与房贷：账户缴存、商业贷款 / 公积金贷款 / 组合贷、按月等额本息还款、提前还款、断供。
// 规则参数集中在 LOAN_RULES；来源见 research/housing_loans.json。

import { fexp, fpow } from './fmath';
import { PBY } from './data';
import { S } from './state';
import { addDoc, log, logLater } from './journal';
import { chance, gauss } from './rng';
import { cityLoc, hpCounty, placeHp, placeInc } from './place';
import { isWorking, retireAge } from './career';
import { parentsHelp } from './parents';
import { wan } from './format';
import { MONTHS } from './monthly';
import { wageRate } from './finance';

declare module './types' {
  interface Loan { mo?: number }   // 还剩几个月（loanMonth）
  interface Life { hpK?: number }  // 这一年房价每月的涨跌倍数（houseMonth）
}

// 回老家买房：北京、上海、天津没有“县城”，按那座城市本身的房价算；其他地方按县城房价
export function hometownHouse() {
  const muni = ['BJ', 'SH', 'TJ'].includes(S.home.p);
  const per = muni ? placeHp(cityLoc(S.home.p, PBY[S.home.p].cities[0])) : hpCounty(PBY[S.home.p]);
  return { price: Math.round(per * 90 / 1e4) * 1e4, where: muni ? `回${S.home.city}买一套` : '在老家县城买一套', city: muni ? S.home.city : `${PBY[S.home.p].n}老家的县城` };
}
export const LOAN_RULES = {
  comRate: 0.031,              // 商业贷款：新发放个人住房贷款加权平均利率约 3.1%（5 年期 LPR 3.5%）
  hpfRate: 0.026,              // 公积金贷款：首套 5 年以上 2.6%（2025-05 起）
  hpfDeposit: 0.015,           // 公积金账户存款利率 1.5%
  downCom: 0.15,               // 商贷最低首付 15%（2024-09 起）
  downHpf: 0.2,                // 公积金贷款首付按 20%（各地不一）
  hpfMinYears: 1,              // 多数城市要求连续缴存 6–12 个月
  balanceMult: 15,             // 可贷额度 ≈ 账户余额 × 倍数（只有少数城市核实，粗略）
  comMaxAge: 70,               // 商贷：借款人年龄 + 年限 ≤ 70
  comMaxTerm: 40,              // 商贷最长 40 年（2026-08-28 起）
  hpfAgeOverRetire: 5,         // 公积金贷款：还到退休后 5 年，一般不超过 68 岁
  hpfMaxAge: 68,
  maxTerm: 30,                 // 公积金贷款最长 30 年
  dti: 0.5,                    // 月供不超过月收入的 50%（全部负债不超过 60%）
  // 公积金贷款最高额度（元）：single 个人，couple 夫妻都缴存；kids 多孩家庭上浮比例
  caps: {
    北京: { single: 1200000, couple: 2400000, kids: 400000 },
    上海: { single: 1200000, couple: 2400000, kidsK: 1.2 },
    深圳: { single: 700000, couple: 1300000, kidsK: 1.7 },
    广州: { single: 1000000, couple: 2000000, kidsK: 1.5 },
    杭州: { single: 900000, couple: 1800000, kidsK: 1.5 },
    成都: { single: 800000, couple: 1200000 },
    武汉: { single: 1200000, couple: 1500000 },
    西安: { single: 900000, couple: 1200000, kidsK: 1.2 },
    南宁: { single: 900000, couple: 900000 },
    郑州: { single: 1200000, couple: 1200000, kidsK: 1.2 },
    济南: { single: 900000, couple: 1300000 },
  },
  capCapital: { single: 800000, couple: 1200000 },  // 其他省会（按已核实省会的中间水平估计）
  capTypical: { single: 500000, couple: 800000 },   // 普通地级市、县城（参考广东地级市）
  rentDraw: 0.6,               // 租房提取：每年可取房租的一部分
  forecloseK: 0.74,            // 法拍成交价约为评估价的 74%（2025 年约 11.3 万套住宅法拍成交）
};

// 哪些工作有公积金：[有公积金的概率, 单位和个人各自的缴存比例]
// 公积金覆盖：2024 年实缴职工 1.76 亿，约占城镇就业的 37%（各职业的比例为估计，按总覆盖率校准）
export const HPF_JOB = {
  civil: [1, 0.12], teacher: [0.98, 0.12], doctor: [0.98, 0.12], nurse: [0.9, 0.1],
  tech: [0.9, 0.12], engineer: [0.7, 0.08], clerk: [0.45, 0.07], sales: [0.25, 0.05],
  skilled: [0.35, 0.05], factory: [0.2, 0.05], migrant: [0.04, 0.05], build: [0.02, 0.05],
  boss: [0.15, 0.05], shop: [0, 0], rider: [0, 0], driver: [0, 0], farmer: [0, 0],
};
export function hpfStart(job) {
  const r = HPF_JOB[job];
  const on = !!r && chance(r[0]);
  if (!on) {
    if (S.hpfOn && S.hpf > 0) logLater(`新单位不交公积金，你的公积金账户封存了。余额${wan(S.hpf)}还在，照样计息，买房、租房还能提取。`);
    S.hpfOn = false; S.hpfY = 0; return;
  }
  if (!S.hpfOn) { S.hpfY = 0; if (S.hpf > 0) logLater('新单位交公积金，封存的账户恢复缴存了。连续缴存的年数从头算。'); } // 断缴后重新计算连续缴存年数
  S.hpfOn = true; S.hpfRate = r[1];
}

// 等额本息：每年还款额（按月计算后 ×12）
export function annualPay(principal, rate, years) {
  if (principal <= 0 || years <= 0) return 0;
  const r = rate / 12, n = years * 12;
  return principal * r / (1 - fpow(1 + r, -n)) * 12;
}
export const totalInterest = (principal, rate, years) => annualPay(principal, rate, years) * years - principal;

export function hpfCap(L, couple) {
  const c = LOAN_RULES.caps[L.city] || (L.kind === 'capital' || L.kind === 'big' ? LOAN_RULES.capCapital : LOAN_RULES.capTypical);
  const base = couple ? c.couple : c.single;
  const multi = S.fam.kids.filter(k => k.alive).length >= 2;
  return multi ? (c.kids ? base + c.kids : base * (c.kidsK || 1)) : base;
}
export const partnerHpf = () => !!(S.fam.married && S.fam.partner && S.fam.partner.alive && S.fam.partner.hpf);
// 买房审核看的家庭年收入：你在上班时按工资（wageRate，不含个体户、销售这一年的收入运气，免得在运气特别好的一年批下还不起的贷款），否则按现在的收入（养老金、失业保险金）
export const hhIncome = () => (isWorking() ? wageRate() : S.income) + (S.fam.married && S.fam.partner && S.fam.partner.alive ? S.fam.partner.inc : 0);

// 给一套房算出几种贷款方案
export function loanPlans(price, L) {
  const R = LOAN_RULES, inc = hhIncome(), cash = S.money + parentsHelp() + (S.hpf || 0); // 有欠款时先抵扣
  const comYears = Math.max(5, Math.min(R.comMaxTerm, R.comMaxAge - S.age));
  const hpfYears = Math.max(5, Math.min(R.maxTerm, retireAge() + R.hpfAgeOverRetire - S.age, R.hpfMaxAge - S.age));
  const plans = [];
  const mk = (kind, label, down, parts) => {
    const pay = parts.reduce((t, p) => t + annualPay(p.bal, p.rate, p.years), 0);
    const interest = parts.reduce((t, p) => t + totalInterest(p.bal, p.rate, p.years), 0);
    const why = pay > inc * R.dti ? `月供${wan(pay / 12)}，超过家庭收入的一半，银行不批` : cash < down ? `首付${wan(down)}，加上爸妈帮忙和公积金也凑不齐` : '';
    plans.push({ kind, label, down, parts, pay, interest, off: !!why, why });
  };
  // 纯商贷
  // 首付：手上的钱留出半年收入应急，其余尽量多付（不超过五成），月供就少一些
  const spare = Math.max(0, cash - placeInc() * 0.5);
  const downOf = min => Math.max(price * min, Math.min(price * 0.5, spare));
  const comDown = downOf(R.downCom);
  mk('com', '商业贷款', comDown, [{ kind: 'com', bal: price - comDown, rate: R.comRate, years: comYears }]);
  // 公积金：需要连续缴存满一定年限
  if (S.hpfOn && (S.hpfY || 0) >= R.hpfMinYears) {
    const need = price - downOf(R.downHpf);
    const cap = Math.min(hpfCap(L, partnerHpf()), (S.hpf || 0) * R.balanceMult);
    if (cap >= need) mk('hpf', '公积金贷款', price - need, [{ kind: 'hpf', bal: need, rate: R.hpfRate, years: hpfYears }]);
    else if (cap > 0) mk('combo', '组合贷（公积金＋商贷）', price - need, [
      { kind: 'hpf', bal: cap, rate: R.hpfRate, years: hpfYears },
      { kind: 'com', bal: need - cap, rate: R.comRate, years: comYears },
    ]);
  }
  return plans;
}
export const planSub = p => p.off ? p.why : `首付${wan(p.down)}，月供约${wan(p.pay / 12)}，${p.parts[0].years}年共付利息约${wan(p.interest)}`;
export const bestPlan = plans => plans.filter(p => !p.off).sort((a, b) => a.pay - b.pay)[0] || null;

// 买下：首付先用公积金余额，再用爸妈的钱，最后是自己的存款（不够时就是欠亲戚的钱）
export function buyHouse(price, L, plan) {
  let down = plan.down;
  const fromHpf = Math.min(S.hpf || 0, down); S.hpf -= fromHpf; down -= fromHpf;
  const help = Math.min(parentsHelp(), down); down -= help; S.famMoney -= help;
  S.money -= down;
  S.house = { city: L.city, p: L.p, v: price, paid: price, at: S.age };
  S.loans = plan.parts.map(p => ({ ...p, pay: annualPay(p.bal, p.rate, p.years) }));
  addDoc('house', '房产证', [['坐落', L.city], ['面积', '约90平方米'], ['价格', wan(price)], ['贷款', plan.parts.map(p => `${p.kind === 'hpf' ? '公积金' : '商贷'}${wan(p.bal)}`).join(' + ')]]);
  return { fromHpf, help };
}

// ===== 每月结算 =====
// 按月累计的年数（公积金连续缴存年数、养老保险缴费年数）：每次加一个月，落在 1/12 的整数倍上，
// 免得 12 个 1/12 加起来差一点不到 1（交满 15 年的判断就会差一个月）
export const plusMonth = (y = 0) => Math.round((y + 1 / MONTHS) * MONTHS) / MONTHS;
// 公积金账户的年利率换算成每月
const HPF_DEP_M = fpow(1 + LOAN_RULES.hpfDeposit, 1 / MONTHS);
// 配偶的公积金缴存比例（估计，取常见的 7%）
const PARTNER_HPF_RATE = 0.07;
// own：这个月个人缴的部分（这个月月底在缴公积金的单位上班才有，见 finance.ts），单位再缴同样多。
// 配偶的公积金也记在家庭账户里：配偶没退休、单位交公积金时，个人和单位各缴一份。返回这个月个人缴的部分（你和配偶的），从家庭收入里扣
export function hpfMonth(own = 0, working = isWorking()) {
  if (S.hpf) S.hpf *= HPF_DEP_M;
  let dep = own * 2;
  if (own > 0 && S.hpfOn) S.hpfY = plusMonth(S.hpfY);
  if (!working && S.job !== 'student') S.hpfOn = false;
  const mateOn = partnerHpf() && !S.fam.partner.retired;
  if (mateOn) { const o = S.fam.partner.inc * PARTNER_HPF_RATE / MONTHS; dep += o * 2; own += o; }
  S.hpf = (S.hpf || 0) + dep;
  // 你已经退休（退休时已销户提取，见 career.ts 的 retire）、配偶也不再缴了：配偶账户里的钱同样提取出来，转进存款
  if (S.job === 'retired' && !mateOn && S.hpf > 0) { S.money += S.hpf; S.hpf = 0; }
  return own;
}
// 还房贷（每月一期，等额本息，月利率 = 年利率 ÷ 12，和 annualPay 一样）：先用公积金余额（还贷提取），不够的从存款里出。返回从存款里付的钱。
// l.mo 是还剩几个月；l.years 跟着取整（界面显示「还剩几年」、提前还款时重算月供用）。
// 每月按剩下的本金和月数重算月供：没有提前还款时就是同一个数；提前还款后（content/decisions.ts 按整年数重算 l.pay）也正好在剩下的月数里还完
export function loanMonth() {
  if (!S.loans || !S.loans.length) return 0;
  let fromCash = 0;
  for (const l of S.loans) {
    if (l.bal <= 0) continue;
    if (l.mo == null) l.mo = Math.round(l.years * MONTHS);
    const r = l.rate / MONTHS, owe = l.bal * (1 + r);
    const pay = l.mo > 1 ? Math.min(owe, l.bal * r / (1 - fpow(1 + r, -l.mo))) : owe;
    l.bal = Math.max(0, owe - pay);
    l.mo--; l.years = Math.ceil(l.mo / MONTHS);
    if (l.mo > 0) l.pay = pay * MONTHS;
    else l.bal = 0;
    const fromHpf = Math.min(S.hpf || 0, pay);
    S.hpf -= fromHpf;
    fromCash += pay - fromHpf;
  }
  S.loans = S.loans.filter(l => l.bal > 1);
  if (!S.loans.length) log('房贷终于还完了。', 'good');
  return fromCash;
}
// 租房提取：没有在这座城市买房的人，可以取出一部分公积金付房租（rent 是这个月的房租）
export function rentDraw(rent) {
  if (!S.hpf || rent <= 0) return 0;
  const x = Math.min(S.hpf, rent * LOAN_RULES.rentDraw);
  S.hpf -= x;
  return x;
}
// 房价每年随机波动（没有方向性假设）：每年在第 0 个月抽一次这一年的涨跌，摊到 12 个月
export function houseMonth(m: number) {
  if (m === 0) S.hpK = S.house ? fexp(gauss(0, 0.04) / MONTHS) : 1;
  if (S.house && S.hpK) S.house.v *= S.hpK;
}
export const loanBal = () => (S.loans || []).reduce((t, l) => t + l.bal, 0);
export const loanPayY = () => (S.loans || []).reduce((t, l) => t + (l.bal > 0 ? l.pay : 0), 0);
// 断供：房子被法拍，按市价打折卖掉，还不清的部分仍然是欠款
export function foreclose(k = LOAN_RULES.forecloseK) {
  const got = S.house.v * k;
  S.money += got - loanBal();
  S.loans = []; S.house = null; S.flags.badCredit = S.age; S.flags.heldOn = 0;
  return got;
}
export function sellHouse(k = 0.95) {
  const got = S.house.v * k;
  S.money += got - loanBal();
  S.loans = []; S.house = null; S.flags.heldOn = 0;
  return got;
}
