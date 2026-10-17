import { S } from './state';

export const liquidBalance = () => S.money - (S.debt || 0);

export function changeMoney(amount: number) {
  const next = S.money + amount;
  S.money = Math.max(0, next);
  if (next < 0) S.debt = (S.debt || 0) - next;
}

export function repayDebt(amount: number) {
  const paid = Math.min(Math.max(0, amount), S.money, S.debt || 0);
  S.money -= paid;
  S.debt = Math.max(0, (S.debt || 0) - paid);
  return paid;
}

export function borrowMoney(amount: number, limit: number) {
  const borrowed = Math.min(Math.max(0, amount), Math.max(0, limit - (S.debt || 0)));
  S.money += borrowed;
  S.debt = (S.debt || 0) + borrowed;
  return borrowed;
}
