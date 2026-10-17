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
