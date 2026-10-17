import { fpow } from './fmath';
import { MONTHS } from './monthly';

export interface BudgetInput {
  consumption: number;
  income: number;
  adults: number;
  retiredAdults: number;
  children: number[];
  lifestyle?: number;
  retirementLifestyle?: number;
}

export function livingBudget(input: BudgetInput) {
  const unit = input.consumption / MONTHS;
  const adults = Math.max(0, input.adults - input.retiredAdults * 0.1);
  const children = input.children.reduce((total, age) => total + (age < 6 ? 0.35 : age < 18 ? 0.5 : 0.6), 0);
  const size = Math.max(1, input.adults + children);
  const ratio = Math.max(0.25, input.income / Math.max(1, unit * size));
  const target = Math.max(0.55 * fpow(ratio, 0.9), (input.retirementLifestyle || 0) * 0.85);
  const lifestyle = input.lifestyle == null ? target : input.lifestyle + (target - input.lifestyle) * 0.08;
  return {
    living: unit * 0.55 * adults,
    children: unit * children,
    discretionary: unit * size * Math.max(0.1, lifestyle),
    lifestyle,
  };
}

// 动用积蓄的花销（本人和父母共用）：除了按收入定的日常和可选消费，手里的积蓄多了也会花掉一些——旅游、换车装修、帮衬子女、
// 看病保健、人情往来。参考 1in8b 的 drawOf：当地人均可支配收入 DRAW_K 倍以内的积蓄每年花 rate，超出的部分只花 DRAW_HI。
// rate 按年龄和是否退休（drawRate）：在职 2%；退休后 75 岁前、75–84 岁、85 岁以后 3% / 4% / 5%
// （估计；常说的「4% 法则」上下，越老花得越多：看病、请护工、留给子女的提前给。1in8b 用 4% / 6% / 8%，在这里老人积蓄见底得太快，
// 之后的养老院费用都记成欠款）。校准见 docs/finance.md「动用积蓄」
// 只从留够周转金以后的现金里出，不会因此借钱；欠着钱的时候，多余的现金先拿去还债，也就不会动用积蓄。
// 收入不够日常开销（基本生活、房租或养老院、房贷）的，本来就在用积蓄填这个缺口，额外花的要扣掉缺口（gap）：
// 养老金一年两三万、住养老院的老人本来就在吃老本，不再额外多花。
// 原来（2026-10-17 重构后）开销完全不看积蓄，退休后养老金花不完、再加利息，一生存款超过 1000 万的人生有 6.8%，离世时中位数 135 万
export const DRAW_K = 20, DRAW_HI = 0.015, DRAW_WORK = 0.02, RET_DRAW = [0.03, 0.04, 0.05];
export const drawRate = (age: number, retired: boolean) => !retired ? DRAW_WORK : RET_DRAW[age < 75 ? 0 : age < 85 ? 1 : 2];
/** 这个月动用积蓄花多少：cash 是现在的现金，inc 是当地人均可支配收入（一年），spare 是留够周转金以后可以花的现金，
 *  gap 是这个月收入不够日常开销的部分（够的话是 0） */
export function savingsDraw(cash: number, inc: number, rate: number, spare: number, gap = 0) {
  const W = Math.max(0, cash), K = inc * DRAW_K;
  return Math.min(Math.max(0, spare), Math.max(0, (rate * Math.min(W, K) + DRAW_HI * Math.max(0, W - K)) / MONTHS - Math.max(0, gap)));
}
