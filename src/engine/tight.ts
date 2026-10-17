// 手头紧了：欠款还不上、或者付不起基本开销的时候，人会想办法——卖房、换小房子、搬去和子女住、向子女开口、回老家、
// 再出去干活、节衣缩食、申请低保，或者先扛着。抉择本身（标题、选项）在 content/decisions.ts 的 tight，这里是规则和之后每个月的后续。
// 原来（b2eb735 以前）只有房贷断供会弹出抉择；看病透支、房租和养老院付不起欠下的钱，玩家没有任何办法，只能挂在账上滚利息，
// 死时欠着钱的人里四成名下还有房、八成有在世的子女。
import { S } from './state';
import { log } from './journal';
import { wan } from './format';
import { MONTHS } from './monthly';
import { repayDebt } from './accounts';

declare module './types' {
  interface Life {
    tightM?: number;  // 连续几个月手头紧（付不起基本开销，或者欠款还在涨）；tightMonth 记
    kidAdv?: number;  // 子女垫付了多少，还没从他们每月给的钱里扣回来
  }
  interface Flags {
    frugal?: number;  // 节衣缩食：欠款还清以前，基本生活少花一些
    dibao?: number;   // 领着低保（每月重新看还符不符合条件）
  }
}

// 连续 TIGHT_M 个月手头紧才弹出（一次看病、一笔意外开销，下个月工资一到就还上的不算）；欠款太少的也不算
export const TIGHT_M = 3, TIGHT_DEBT_K = 0.1; // 欠款至少是当地人均可支配收入的一成（估计）
/** 月底：这个月手头紧不紧。shortfall：付不起的基本生活和房租；prevDebt：上个月月底的欠款 */
export function tightMonth(shortfall: number, prevDebt: number) {
  const tight = shortfall > 1 || (S.debt || 0) > prevDebt + 1;
  S.tightM = tight ? (S.tightM || 0) + 1 : 0;
}
export const tightDue = (inc: number) => (S.tightM || 0) >= TIGHT_M && ((S.debt || 0) >= inc * TIGHT_DEBT_K || !!S.statement?.shortfall);

// ===== 节衣缩食 =====
// 基本生活再省两成（估计：吃得简单些、不添衣服、能不出门就不出门），欠款还清、不再付不起开销以后恢复
export const FRUGAL_K = 0.8;
export const frugalK = () => S.flags.frugal ? FRUGAL_K : 1;
export function frugalEnd() {
  if (!S.flags.frugal || (S.debt || 0) > 1 || S.statement?.shortfall) return;
  S.flags.frugal = 0;
  log('欠的钱终于还清了，不用再一分钱掰成两半花。', 'good');
}

// ===== 低保 =====
// 城乡最低生活保障：家庭人均收入低于当地低保标准、没有房产、存款不多的，按差额补到标准。
// 2025 年 5 月底全国城乡低保平均标准每人每月 799.7 元、594.9 元（民政部例行发布会）；
// 存款的门槛各地不同（多在 6–24 个月的低保金之间），取 12 个月（估计）。住农村的按农村标准
export const DIBAO_M = { city: 799.7, rural: 594.9 };
export const DIBAO_ASSET_Y = 1;
export const dibaoStdY = () => (S.loc.kind === 'rural' ? DIBAO_M.rural : DIBAO_M.city) * MONTHS;
/** 一家 size 口人、每月到手 incM：符不符合低保的条件 */
export const dibaoOK = (incM: number, size: number) =>
  !S.house && !(S.inheritedHomes && S.inheritedHomes.length) && S.money < dibaoStdY() * size * DIBAO_ASSET_Y && incM * MONTHS < dibaoStdY() * size;
/** 月底：领着低保的，这个月补多少（按差额补到标准）；不再符合条件的停发 */
export function dibaoMonth(incM: number, size: number) {
  if (!S.flags.dibao) return 0;
  if (!dibaoOK(incM, size)) { S.flags.dibao = 0; log('收入、存款超过了低保的标准，低保停了。', 'ev'); return 0; }
  return dibaoStdY() * size / MONTHS - incM;
}

// ===== 子女 =====
// 成年子女每人每年给的钱（按当地消费水平估计，最多算两个）。退休以后的收入里一直有这一项（finance.ts 的 retireMonthly）
export function kidSupportY(cons: number) {
  let grown = 0;
  for (const k of S.fam.kids) if (k.alive && k.age >= 25) grown++;
  return grown ? cons * 0.35 * Math.min(2, grown) : 0;
}
export const grownKids = () => S.fam.kids.some(k => k.alive && k.age >= 25);
// 向子女开口：子女先拿出最多三年的生活费帮你还债（估计），之后每月给你的钱先扣回这笔，扣完照常给
export const KID_ADV_Y = 3;
export function askKids(cons: number) {
  const x = Math.min(S.debt || 0, kidSupportY(cons) * KID_ADV_Y);
  S.money += x; S.kidAdv = (S.kidAdv || 0) + x;
  repayDebt(x);
  return x;
}
/** 这个月子女给的钱（supportM）里扣回多少垫付 */
export function kidAdvMonth(supportM: number) {
  if (!(S.kidAdv > 0)) return 0;
  const x = Math.min(supportM, S.kidAdv);
  S.kidAdv -= x;
  if (S.kidAdv < 1) { S.kidAdv = 0; log('子女当初垫的钱，从每月给你的钱里扣完了。', 'ev'); }
  return x;
}

// ===== 找爸妈要钱 =====
// 刚工作、没找到工作、行情不好的年轻人，最常见的出路是父母贴补。钱从父母的账上真实转过来（S.famMoney），父母的积蓄、将来的遗产跟着变少。
// 父母最多拿出自己现金的一半（PAR_SHARE，估计），够还清欠款、再垫上三个月的基本生活为止；父母自己也欠着钱、没有余钱的不能选
export const PAR_SHARE = 0.5, PAR_AGE = 45; // 45 岁以后父母多已年迈，不再向他们要钱（估计）
export const parentsCan = () => (S.fam.mom.alive || S.fam.dad.alive) && S.age < PAR_AGE && S.famMoney * PAR_SHARE >= 1000 && !(S.famDebt > 0);
export function askParents(cons: number) {
  const x = Math.min((S.debt || 0) + cons / 4, S.famMoney * PAR_SHARE);
  S.famMoney -= x; S.money += x;
  repayDebt(x);
  return x;
}

// ===== 换小房子 =====
// 卖掉现在的房子，在同一座城市换一套便宜一些的（约六成的价钱，估计：面积小一些、地段偏一些），差价拿来还债、过日子；只在没有房贷时可选
export const DOWNSIZE_K = 0.6, SELL_K = 0.95;
export function downsize() {
  const h = S.house, got = h.v * SELL_K, nv = h.v * DOWNSIZE_K;
  S.money += got - nv;
  S.house = { ...h, v: nv, paid: nv, at: S.age };
  repayDebt(got - nv);
  return got - nv;
}
export const tightText = () => `手上现金${wan(S.money)}${S.debt > 0 ? `，欠着${wan(S.debt)}` : ''}`;
