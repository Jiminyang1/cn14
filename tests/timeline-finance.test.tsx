import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TimelineFinance, statementAge } from '../src/ui/Finance';
import type { MonthlyStatement } from '../src/engine';
import * as E from '../src/engine';

test('financial records belong to birthday years rather than calendar years', () => {
  const month = (year: number, value: number) => ({ year, month: value } as MonthlyStatement);
  expect(statementAge(month(2054, 4), 2026, 4)).toBe(28);
  expect(statementAge(month(2055, 3), 2026, 4)).toBe(28);
  expect(statementAge(month(2055, 4), 2026, 4)).toBe(29);
  expect(statementAge(month(2055, 1), 2026, 1)).toBe(29);
  expect(statementAge(month(2055, 11), 2026, 12)).toBe(28);
});

test('year-end reports stay brief and only appear after the year ends', () => {
  const bills: MonthlyStatement[] = [{
    year: 2055, month: 2, opening: 100000, closing: 85000,
    income: 10000, events: -20000, transfers: 0, depositInterest: 0,
    tier: 1, living: 4000, rent: 0, mortgage: 1000,
    mortgageInterest: 200, mortgageHpf: 0, debtRepaid: 0, debtInterest: 0,
    shortfall: 0, arrears: 0, debt: 0,
  }];
  const original = JSON.stringify(bills);
  const html = renderToStaticMarkup(<TimelineFinance bills={bills} completed />);
  expect(html).toContain('年终小结');
  expect(html).toContain('现金减少1.5万元');
  expect(html).not.toContain('到手收入');
  expect(html).not.toContain('生活与还款');
  expect(html).not.toContain('statement-body');
  expect(html).not.toContain('<details open');
  expect(JSON.stringify(bills)).toBe(original);
  expect(renderToStaticMarkup(<TimelineFinance bills={bills} completed={false} />)).toBe('');
  expect(renderToStaticMarkup(<TimelineFinance bills={[]} completed />)).toBe('');
});

test('the year-end summary names where big money came from or went', () => {
  E.birth(4242, { headless: true });
  E.S.moves = [
    { a: 58, y: 2084, m: 7, t: '退休提取公积金', x: 1080000 },
    { a: 58, y: 2085, m: 3, t: '女儿的陪嫁', x: -333000 },
    { a: 57, y: 2083, m: 5, t: '买房', x: -1400000 },
  ];
  const bills: MonthlyStatement[] = [{
    year: 2084, month: 7, opening: 100000, closing: 850000, income: 10000, events: 1080000, transfers: 0, depositInterest: 0,
    tier: 2, living: 8000, rent: 0, mortgage: 0, mortgageInterest: 0, mortgageHpf: 0, debtRepaid: 0, debtInterest: 0, shortfall: 0, arrears: 0, debt: 0,
  }];
  const html = renderToStaticMarkup(<TimelineFinance bills={bills} completed age={58} />);
  expect(html).toContain('其中退休提取公积金 +108万元，女儿的陪嫁 −33.3万元');
  expect(html).not.toContain('买房'); // 别的年份的不算
});
