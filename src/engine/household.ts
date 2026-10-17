// 父母家里的账：每月的结余、还欠款、供孩子上学、父母去世后的遗产。

import { fpow } from './fmath';
import { LOAN_RULES } from './housing';
import { MONTHS, monthOfCal } from './monthly';
import { S } from './state';
import { log } from './journal';
import { parentIncome, parentRetired } from './parents';
import { placeCons } from './place';
import { wan } from './format';

declare module './types' {
  interface Life { famDebtM?: number }      // 父母的房贷还剩几个月（famDebtMonth）
  interface Flags { supportA?: number }     // 上一次贴补父母生活费是几岁那年（supportY 每年只记一次）
}

// 家庭每年的结余：家庭人均可支配收入 × 3 口人 × 储蓄率（按家境），减去孩子上学的开销
// 家庭净储蓄率（扣掉盖房、人情、看病等大额开销后，估计）；2024 年农村居民（收入−消费）÷收入约 17%，城镇约 34%
export const FAM_SAVE = [0.02, 0.04, 0.06, 0.1, 0.15];
// 有非房贷的欠款（盖房、看病、办婚事、做生意，多是向亲戚借的，一般不算利息）时，家里先还债、不再存钱，每年能拿出收入的这么多（按家境，估计）。
// 参考：2024 年（收入 − 消费）÷ 收入，农村约 17%，城镇约 34%。欠得越多、家里越穷，还得越久。
export const FAM_REPAY = { rural: [0.06, 0.1, 0.14, 0.18, 0.25], urban: [0.1, 0.16, 0.22, 0.28, 0.35] };
export const SCHOOL_COST = { 高中: 3000, 职高: 2000, 复读: 6000, 大专: 18000, 本科: 20000, 硕士: 22000 };
// 年利率换算成每月：存款约 1.5%；欠款大多是房贷或向亲戚借的，平均按约 2% 计（估计）
const SAVE_INT_M = fpow(1.015, 1 / MONTHS), DEBT_INT_M = fpow(1.02, 1 / MONTHS);
// 每月：父母的收入、结余、还欠款、子女补贴，都按一个月的量（一年的 1/12）记。
// 学费在开学那个月（公历 9 月）一次交一学年的，和实际交学费的时间一样；那个月家里拿不出钱，就办助学贷款
export function familyMoneyMonth(m: number) {
  const f = S.fam, mom = f.mom.alive, dad = f.dad.alive;
  if (!mom && !dad) { inherit(); return; }
  // 收入：在职按职业分摊的工资，退休后是养老金（parentIncome 对已去世的人是 0）
  const inc = (parentIncome('mom') + parentIncome('dad')) / MONTHS;
  const working = (mom && !parentRetired(f.mom, false)) || (dad && !parentRetired(f.dad, true));
  // 开销：还有人在上班时，按家境的净储蓄率存钱；都退休以后，按当地消费水平的七成算老人的生活费（估计），再加看病
  const mortgage = S.famDebtWhy === '房贷';
  const ill = (mom && f.mom.ill ? 1 : 0) + (dad && f.dad.ill ? 1 : 0);
  // 还在还其他欠款的时候，家里省下的钱先拿去还债，不再往存款里放
  let net = working ? (S.famDebt > 0 && !mortgage ? 0 : inc * FAM_SAVE[S.q - 1]) : inc - placeCons(S.home) * 0.7 * ((mom ? 1 : 0) + (dad ? 1 : 0)) / MONTHS;
  if (ill) net -= placeCons(S.home) * 0.3 * ill / MONTHS;
  S.famMoney += net;
  if (S.famDebt > 0) famDebtMonth(inc, working, mortgage);
  if (S.indep === false && S.school && m === monthOfCal(9)) {
    const fee = (SCHOOL_COST[S.school] || 0) * (S.flags.uni && S.flags.uni.tier === 'minban' && S.school === '本科' ? 2.2 : 1);
    S.famMoney -= fee;
    if (S.famMoney < 0 && ['大专', '本科', '硕士'].includes(S.school) && !S.flags.stuLoan) {
      S.flags.stuLoan = 1;
      log('家里拿不出学费和生活费，你申请了生源地信用助学贷款。', 'ev', '国家助学贷款：本专科学生每人每年最高 2 万元，在读期间免息');
    }
  }
  // 父母都不上班以后，存款花光了，由已经工作的子女补贴生活费（兄弟姐妹一起分摊）；父母还在上班时，欠款由他们自己慢慢还
  // supportY 记的是贴补了几年（每个年龄年记一次）
  if (S.indep && S.famMoney < 0 && !working) {
    const share = -S.famMoney / (1 + f.sibs.length);
    S.money -= share; S.famMoney = 0;
    S.stats.support = (S.stats.support || 0) + share;
    if (S.flags.supportA !== S.age) {
      S.flags.supportA = S.age; S.flags.supportY = (S.flags.supportY || 0) + 1;
      if (S.flags.supportY === 1) log(S.flags.parWithMe ? `父母的积蓄花完了，养老金不够用。他们跟你住在一起，生活开销由你来出，这个月多花了${wan(share)}。` : `父母的积蓄花完了，养老金不够用。你开始每个月给他们寄生活费，这个月寄了${wan(share)}。`, 'ev', '2024 年城乡居民养老金人均每年约 2,950 元，城镇职工约 4.6 万元（中国统计年鉴 24-26、24-27）');
    }
  }
  S.famMoney *= S.famMoney > 0 ? SAVE_INT_M : DEBT_INT_M;
}
// 父母还欠款（每月一期；inc 是这个月的收入）：
// · 房贷：按商贷利率等额本息，每月从工资里扣（家里照常存钱）；父母都退休后从存款里扣。还剩几个月记在 famDebtM，famDebtYears 跟着取整（界面显示用）
// · 其他借款：用家里每月省下的钱还（见 FAM_REPAY），不计利息；父母都退休后，有存款就先拿存款还清
export function famDebtMonth(inc, working, mortgage) {
  const before = S.famDebt;
  let pay;
  if (mortgage) {
    if (S.famDebtM == null) S.famDebtM = Math.max(1, S.famDebtYears || 1) * MONTHS;
    const r = LOAN_RULES.comRate / MONTHS, n = Math.max(1, S.famDebtM), owe = S.famDebt * (1 + r);
    pay = n > 1 ? Math.min(owe, S.famDebt * r / (1 - fpow(1 + r, -n))) : owe;
    S.famDebt = owe - pay; S.famDebtM = n - 1; S.famDebtYears = Math.ceil(S.famDebtM / MONTHS);
    if (!working) S.famMoney -= pay;
  } else if (working) {
    pay = Math.min(S.famDebt, inc * FAM_REPAY[S.rural ? 'rural' : 'urban'][S.q - 1]);
    S.famDebt -= pay;
    S.famDebtYears = pay > 0 ? Math.ceil(S.famDebt / (pay * MONTHS)) : 99;
  } else {
    pay = Math.min(S.famDebt, Math.max(0, S.famMoney));
    S.famDebt -= pay; S.famMoney -= pay; S.famDebtYears = S.famDebt > 0 ? 99 : 0;
  }
  if (S.famDebt < 100) {
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
  if (S.indep && S.fam.sibs.length && S.famHouse && S.famHouse.v > 0) { S.flags.heirDue = 1; return; }
  inheritSplit(1);
}
/** 你能分到多少：存款平分，房子按 houseK 倍的平分份额（0 = 房子让给别人，1 = 平分，n = 房子全归你）。欠款先用存款抵，不够再用房子抵；子女不承担超出遗产的债务 */
export function heirShares(houseK = 1) {
  const n = 1 + S.fam.sibs.length, H = S.famHouse || { v: 0 };
  const cash = (S.famMoney || 0) - (S.famDebt || 0), house = Math.max(0, (H.v || 0) + Math.min(0, cash));
  return { n, cash: Math.max(0, cash), house, share: Math.max(0, cash) / n + house / n * houseK };
}
export function inheritSplit(houseK, quiet = false) {
  S.flags.inherited = 1; S.flags.heirDue = 0;
  const H = S.famHouse || { v: 0 }, { share } = heirShares(houseK);
  S.famDebt = 0; S.famMoney = 0; S.famHouse = { ...H, type: 'gone', v: 0 } as any;
  if (share < 1000) return 0;
  if (S.indep === false) { S.famMoney = share; return share; }
  S.money += share; S.stats.inherit = share;
  if (!quiet) log(`父母都走了。${H.v ? '老房子和' : ''}存款${S.fam.sibs.length ? `由兄弟姐妹${1 + S.fam.sibs.length}人分了，` : '都留给了你，'}你分到约${wan(share)}。`, 'ev');
  return share;
}
