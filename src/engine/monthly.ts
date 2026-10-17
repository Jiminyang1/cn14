// 按月推进的基础：一年 12 个月，以及把按年的参数换算成按月的工具。
// 一个「年龄年」从生日那个月开始：S.month = 0 是生日那个月，11 是下一个生日的前一个月；S.t 是这一年过了多少（0–1），第 m 个月从 m/12 开始。
import { fpow } from './fmath';
import { S } from './state';

export const MONTHS = 12;

/** 第 m 个月（0–11）在这一年里的起点；第 12 个月的起点就是这一年的终点 1 */
export const monthStart = (m: number) => m / MONTHS;
/** 第 m 个月里的一个位置，frac（0–1）是这个月过了多少 */
export const posIn = (m: number, frac: number) => (m + Math.min(0.999, Math.max(0, frac))) / MONTHS;

/** 年度概率 p 换算成每月概率：状态不变时，12 个月累计正好是 p */
export const perMonth = (p: number) => p <= 0 ? 0 : p >= 1 ? 1 : 1 - fpow(1 - p, 1 / MONTHS);
/** 每年向目标值靠拢的比例 k（x += (目标 − x) × k）换算成每月：目标不变时，一年后的结果相同 */
export const approachPerMonth = perMonth;
/** 每年一次的正态波动（标准差 sd）换算成每月：12 个月独立波动加起来，方差和原来一年一次相同 */
export const sdPerMonth = (sd: number) => sd / Math.sqrt(MONTHS);

/** 第 m 个月是公历几月（1–12） */
export const calMonth = (m = S.month) => ((S.birthMonth - 1 + m) % MONTHS) + 1;
/** 第 m 个月是公历哪一年 */
export const calYear = (m = S.month) => S.birthYear + S.age + (S.birthMonth - 1 + m >= MONTHS ? 1 : 0);
/** 公历 cm 月（1–12）是这一年的第几个月（0–11） */
export const monthOfCal = (cm: number) => (((cm - S.birthMonth) % MONTHS) + MONTHS) % MONTHS;
