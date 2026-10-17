// 父母家里的账：每月的结余、还欠款、供孩子上学、父母去世后的遗产。

import { fpow } from './fmath';
import { LOAN_RULES, annualPay } from './housing';
import { MONTHS, monthOfCal } from './monthly';
import { S } from './state';
import { log } from './journal';
import { parentIncome, parentRetired } from './parents';
import { placeCons, placeHp, placeInc } from './place';
import { wan } from './format';
import { sibsAlive } from './family';
import { drawRate, livingBudget, savingsDraw } from './budget';
import { changeMoney } from './accounts';

declare module './types' {
  interface Life {
    famDebtM?: number;  // 父母的房贷还剩几个月（famDebtMonth）
    stuDebt?: number;   // 助学贷款余额：只有学费、生活费的缺口，按每年的上限借；经济独立时转到你自己名下（finance.ts 的 goIndep）
  }
  interface Flags { supportA?: number }     // 上一次贴补父母生活费是几岁那年（supportY 每年只记一次）
}
// 还在世的兄弟姐妹有几个（分遗产、分摊父母的生活费）
const sibsN = () => sibsAlive().length;

// 有非房贷的欠款（盖房、看病、办婚事、做生意，多是向亲戚借的，一般不算利息）时，每年计划拿出收入的这么多还债（按家境，估计）。
// 参考：2024 年（收入 − 消费）÷ 收入，农村约 17%，城镇约 34%。欠得越多、家里越穷，还得越久。
export const FAM_REPAY = { rural: [0.06, 0.1, 0.14, 0.18, 0.25], urban: [0.1, 0.16, 0.22, 0.28, 0.35] };
export const SCHOOL_COST = { 高中: 3000, 职高: 2000, 复读: 6000, 大专: 18000, 本科: 20000, 硕士: 22000 };
// 生源地信用助学贷款每人每年的上限：2023 年秋季学期起，全日制本专科生 2 万元、研究生 2.5 万元（财政部、教育部、人民银行、金融监管总局）
export const STU_LOAN_CAP = { 大专: 20000, 本科: 20000, 硕士: 25000 };
// 父母都不在了、你还没经济独立：亲戚（多是祖父母、叔伯姑姨）抚养。生活费从遗产里出，每年约当地人均消费的一半（估计）；
// 遗产花完以后由亲戚和孤儿基本生活费兜底（2024 年社会散居孤儿平均约每月 1,500 元，民政部），不记成欠款
const ORPHAN_COST = 0.5;
// 年利率换算成每月：存款约 1.5%；欠款大多是房贷或向亲戚借的，平均按约 2% 计（估计）
const SAVE_INT_M = fpow(1.015, 1 / MONTHS), DEBT_INT_M = fpow(1.02, 1 / MONTHS);
// 每月：父母的收入、结余、还欠款、子女补贴，都按一个月的量（一年的 1/12）记。
// 学费在开学那个月（公历 9 月）一次交一学年的，和实际交学费的时间一样；那个月家里拿不出钱，就办助学贷款
export function familyMoneyMonth(m: number) {
  const f = S.fam, mom = f.mom.alive, dad = f.dad.alive;
  if (!mom && !dad) { inherit(); orphanMonth(m); return; }
  // 收入：在职按职业分摊的工资，退休后是养老金（parentIncome 对已去世的人是 0）
  const inc = (parentIncome('mom') + parentIncome('dad')) / MONTHS;
  const working = (mom && !parentRetired(f.mom, false)) || (dad && !parentRetired(f.dad, true));
  const mortgage = S.famDebtWhy === '房贷';
  const ill = (mom && f.mom.ill ? 1 : 0) + (dad && f.dad.ill ? 1 : 0);
  const children = f.sibs.filter(child => child.alive && child.age < 18).map(child => child.age);
  if (S.indep === false && S.age < 18) children.push(S.age);
  if (!working && S.parentRetirementLifestyle == null) S.parentRetirementLifestyle = S.parentLifestyle;
  const budget = livingBudget({ consumption: placeCons(S.home), income: inc,
    adults: Number(mom) + Number(dad),
    retiredAdults: Number(mom && parentRetired(f.mom, false)) + Number(dad && parentRetired(f.dad, true)),
    children, lifestyle: S.parentLifestyle, retirementLifestyle: S.parentRetirementLifestyle });
  S.parentLifestyle = budget.lifestyle;
  const rent = S.famHouse?.type === 'rent' ? placeHp(S.home) * 45 * 0.018 * 0.6 / MONTHS : 0;
  const essential = budget.living + budget.children + rent + placeCons(S.home) * 0.3 * ill / MONTHS;
  S.famMoney += inc - essential;
  if (S.indep === false && S.school && m === monthOfCal(9)) payTuition();
  if (S.famDebt > 0) famDebtMonth(inc, working, mortgage);
  const optional = Math.min(budget.discretionary, Math.max(0, S.famMoney - essential));
  S.famMoney -= optional;
  // 父母也会动用积蓄（和你自己一样，budget.ts 的 savingsDraw）：按年纪大的那一位算，都退休以后按退休的档
  const elder = Math.max(mom ? f.mom.age : 0, dad ? f.dad.age : 0);
  S.famMoney -= savingsDraw(S.famMoney, placeInc(S.home), drawRate(elder, !working), S.famMoney - essential, essential - inc);
  // 父母都不上班以后，存款花光了，由已经工作的子女补贴生活费（还在世的兄弟姐妹一起分摊）；父母还在上班时，欠款由他们自己慢慢还
  // supportY 记的是贴补了几年（每个年龄年记一次）
  if (S.indep && S.famMoney < 0 && !working) {
    const share = -S.famMoney / (1 + sibsN());
    const paid = Math.min(S.money, share);
    changeMoney(-paid); S.famMoney += paid + share * sibsN();
    S.stats.support = (S.stats.support || 0) + paid;
    if (paid > 0 && S.flags.supportA !== S.age) {
      S.flags.supportA = S.age; S.flags.supportY = (S.flags.supportY || 0) + 1;
      if (S.flags.supportY === 1) log(S.flags.parWithMe ? `父母的积蓄花完了，养老金不够用。他们跟你住在一起，这个月你贴补了${wan(paid)}。` : `父母的积蓄花完了，养老金不够用。你开始给他们寄生活费，这个月寄了${wan(paid)}。`, 'ev');
    }
  }
  S.famMoney *= S.famMoney > 0 ? SAVE_INT_M : DEBT_INT_M;
}
// 交一学年的学费和生活费（开学那个月）：家里的钱不够时，缺口用助学贷款补，每年不超过上限；超出上限的部分仍是家里的欠款。
// 只有缺口才算助学贷款（家里别的欠款，比如办婚事借的，不算）
function payTuition() {
  const fee = (SCHOOL_COST[S.school] || 0) * (S.flags.uni && S.flags.uni.tier === 'minban' && S.school === '本科' ? 2.2 : 1);
  S.famMoney -= fee;
  const cap = STU_LOAN_CAP[S.school];
  if (S.famMoney < 0 && cap) {
    const x = Math.min(-S.famMoney, fee, cap);
    S.famMoney += x; S.stuDebt = (S.stuDebt || 0) + x;
    if (!S.flags.stuLoan) {
      S.flags.stuLoan = 1;
      log(`家里拿不出学费和生活费，你申请了生源地信用助学贷款，这一学年借了${wan(x)}。`, 'ev', '国家助学贷款：2023 年起本专科学生每人每年最高 2 万元、研究生 2.5 万元，在读期间免息');
    }
  }
}
// 父母都不在了、你还没经济独立的月份：生活费、学费从遗产（famMoney）里出。钱不够时：大学的学费用助学贷款，其余由亲戚兜底，家里的钱不记成负数
function orphanMonth(m: number) {
  if (S.indep !== false) {
    // 已经独立以后，还有钱进到家里的账上（例如拆迁款）：按还在世的兄弟姐妹平分，你那一份转进存款
    if (S.flags.inherited && S.famMoney > 0) { changeMoney(S.famMoney / (1 + sibsN())); S.famMoney = 0; }
    return;
  }
  if (S.famMoney > 0) S.famMoney = Math.max(0, S.famMoney - placeCons(S.home) * ORPHAN_COST / MONTHS);
  if (S.school && m === monthOfCal(9)) payTuition();
  if (S.famMoney < 0) S.famMoney = 0;
  S.famMoney *= SAVE_INT_M;
}
export function famDebtMonth(inc, working, mortgage) {
  const before = S.famDebt;
  let pay = 0;
  if (mortgage) {
    if (S.famDebtM == null) S.famDebtM = Math.max(1, S.famDebtYears || 1) * MONTHS;
    const interest = S.famDebt * LOAN_RULES.comRate / MONTHS;
    const due = S.famDebtM > 1 ? annualPay(S.famDebt, LOAN_RULES.comRate, S.famDebtM / MONTHS) / MONTHS : S.famDebt + interest;
    pay = Math.min(due, Math.max(0, S.famMoney));
    S.famDebt = Math.max(0, S.famDebt + interest - pay);
    S.famDebtM = Math.max(0, S.famDebtM - 1); S.famDebtYears = Math.ceil(S.famDebtM / MONTHS);
  } else {
    const allowance = working ? inc * FAM_REPAY[S.rural ? 'rural' : 'urban'][S.q - 1] : Math.max(0, S.famMoney);
    pay = Math.min(S.famDebt, allowance, Math.max(0, S.famMoney));
    S.famDebt -= pay;
    S.famDebtYears = pay > 0 ? Math.ceil(S.famDebt / (pay * MONTHS)) : 99;
  }
  S.famMoney -= pay;
  if (S.famDebt < 0.01) {
    S.famDebt = 0; S.famDebtYears = 0; S.famDebtM = 0;
    if (S.famDebt0 >= 1e4) log(famDebtPaidText(), 'ev');
  }
  return before - S.famDebt;
}
export function famDebtPaidText() {
  const w = S.famDebtWhy, d = wan(S.famDebt0);
  if (w === '房贷') return '家里的房贷还清了。';
  if (w === '车贷和消费贷') return `家里的车贷和消费贷（当初${d}）还清了。`;
  const how = { 盖房子: '盖房子借的', 看病: '看病借的', '办婚事、彩礼': '办婚事、出彩礼借的', 做生意: '做生意欠下的' }[w] || '借的';
  return `家里当年${how}${d}，这一年终于还清了。`;
}
// 父母都去世以后：存款和房子由兄弟姐妹分。有兄弟姐妹、又有老房子的，先商量怎么分（抉择 heritage），没有的直接平分
export function inherit() {
  if (S.flags.inherited) return;
  if (S.indep && sibsN() && S.famHouse && S.famHouse.v > 0) { S.flags.heirDue = 1; return; }
  inheritSplit(1);
}
/** 你能分到多少：存款平分，房子按 houseK 倍的平分份额（0 = 房子让给别人，1 = 平分，n = 房子全归你）。欠款先用存款抵，不够再用房子抵；子女不承担超出遗产的债务 */
export function heirShares(houseK = 1) {
  const n = 1 + sibsN(), H = S.famHouse || { v: 0 };
  const cash = (S.famMoney || 0) - (S.famDebt || 0), house = Math.max(0, (H.v || 0) + Math.min(0, cash));
  return { n, cash: Math.max(0, cash), house, share: Math.max(0, cash) / n + house / n * houseK };
}
export function inheritSplit(houseK, quiet = false, sell = false) {
  S.flags.inherited = 1; S.flags.heirDue = 0;
  const home = S.famHouse || { v: 0 };
  const estate = heirShares(houseK);
  const property = estate.house / estate.n * houseK;
  const cash = estate.cash / estate.n + (sell ? property * 0.95 : 0);
  const total = cash + (sell ? 0 : property);
  S.famDebt = 0; S.famMoney = 0; S.famHouse = { ...home, type: 'gone', v: 0 } as any;
  if (!sell && property > 0) {
    (S.inheritedHomes ||= []).push({ city: S.home.city, p: S.home.p, v: property, share: houseK / estate.n });
  }
  if (S.indep === false) S.famMoney = cash;
  else changeMoney(cash);
  S.stats.inherit = (S.stats.inherit || 0) + total;
  if (!quiet && total > 0) log(`父母都走了。你继承了存款${wan(cash)}${!sell && property > 0 ? `和价值约${wan(property)}的房产权益，房子还没有卖` : ''}。${S.indep === false ? '现金由亲戚代管，供你吃穿上学。' : ''}`, 'ev');
  return total;
}
