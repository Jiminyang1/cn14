// 界面上共用的小工具。
import type { Life } from '../engine';

export const QW = ['最贫困', '不太宽裕', '中等收入', '比较富裕', '最富裕'];
export const dots = (q: number) => '●'.repeat(q) + '○'.repeat(5 - q);
export const sexW = (s: string) => s === 'M' ? '男' : '女';
export const fileNo = (L: Life) => `${L.birthYear}-${String(Math.abs(L.seed) % 1000000).padStart(6, '0')}`;
