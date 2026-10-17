// 生活开销：分档。你自己和父母家用同一套规则。
// 一家人一个月的生活开销 = 当地人均月消费 × 家里人数 × 档位倍数。孩子按半个人算（还小的少一些、读大学的多一些）。
// 档位看这家人一个月的收入（加上存款能贴补的一点），在当地算什么水平；每年过生日的时候定一次，日子过好过坏都看得出来。
// 可选消费、孩子的单独开销、动用积蓄这些细项先不做：以后有了玩家主动花钱的玩法、孩子的系统，再从这里分出去。
import { MONTHS } from './monthly';

// k：开销是当地人均消费的几倍；from：收入达到当地人均消费的几倍，才过得上这一档（每一档刚够上的时候都还能存下一成多）
export const TIERS = [
  { n: '拮据', k: 0.85, from: 0 },
  { n: '普通', k: 1.05, from: 1.15 },
  { n: '小康', k: 1.45, from: 1.6 },
  { n: '宽裕', k: 2.05, from: 2.3 },
  { n: '富足', k: 3.0, from: 3.4 },
];
// 存款也撑着日子：每年按存款的 6% 算进收入（存款多的人家花得也多，钱不会只攒不花）
const SAVE_USE = 0.06;

/** 家里算几个人：大人 1 个；孩子 6 岁前 0.35、18 岁前 0.5、读大学 0.6 */
export const familySize = (adults: number, children: number[]) =>
  Math.max(1, adults + children.reduce((t, a) => t + (a < 6 ? 0.35 : a < 18 ? 0.5 : 0.6), 0));

/** 这一年过哪一档。inc：一个月的收入；cash：存款；cons：当地人均消费（一年）；size：几个人。
 *  prev：上一年的档。退了休、收入少了，日子也很难一下子降两档（攒的钱拿来撑着） */
export function tierOf(inc: number, cash: number, cons: number, size: number, prev?: number, retired = false) {
  const ratio = (inc + Math.max(0, cash) * SAVE_USE / MONTHS) / (cons / MONTHS * size);
  let t = 0;
  for (let i = TIERS.length - 1; i >= 0; i--) if (ratio >= TIERS[i].from) { t = i; break; }
  if (retired && prev != null) t = Math.max(t, prev - 1);
  return t;
}
/** 这一档一个月要花多少 */
export const tierCost = (t: number, cons: number, size: number) => cons / MONTHS * size * TIERS[t].k;
