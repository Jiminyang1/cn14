// 界面上共用的小工具。
import type { Life } from '../engine';

export const QW = ['最贫困', '不太宽裕', '中等收入', '比较富裕', '最富裕'];
export const dots = (q: number) => '●'.repeat(q) + '○'.repeat(5 - q);
export const sexW = (s: string) => s === 'M' ? '男' : '女';
export const fileNo = (L: Life) => `${L.birthYear}-${String(Math.abs(L.seed) % 1000000).padStart(6, '0')}`;
// 中文数字（年龄用）：15 → 十五，100 → 一百，105 → 一百零五
const CN = '零一二三四五六七八九';
export function cnNum(n: number): string {
  if (n < 10) return CN[n];
  if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '');
  if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
  const r = n % 100;
  return CN[Math.floor(n / 100)] + '百' + (r ? (r < 10 ? '零' + CN[r] : r < 20 ? '一' + cnNum(r) : cnNum(r)) : '');
}
