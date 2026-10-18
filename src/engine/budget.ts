// 生活开销：你自己和父母家用同一套规则。
// 一家人一个月的日常开销（吃穿、交通、教育、看病……；房租、房贷另算）＝ 当地每人日常开销 × √（收入相当于当地几个人的 × 家里算几个人）。
// 意思是：家里算的人越多花得越多；收入越高花得越多，但花掉的比例越低（钱多的人家多存一些）。
// 照这样算，全国城镇一般的人家日常开销约是到手收入的一半，京沪这样收入高的地方三四成；一个人过、两口子、有孩子、退休，比例各不一样：
// 两口子都上班最能存钱，有了孩子钱就紧了，只有一个人挣钱的更紧。
// 收入每年过生日的时候看一次（加上存款能贴补的一点）；收入一下子少了，日子也是慢慢紧下来的。
// 档位（拮据……富足）是这一家每个人花的钱相当于当地的几倍，只是个说法。
// 过得好坏的增减益（liveFx）按实际花的钱连续变化：多花一点就好一点，省一点就差一点，生活方式的每个选项都看得出来（stats.ts 的 drift、离婚风险）。
// 日子长期紧巴巴的伤得更重。
import { MONTHS } from './monthly';
import { planOf } from './plans';
import { clamp } from './rng';
import { flog } from './fmath';

const LN2 = flog(2);

// from：每人花的钱达到当地每人日常开销的几倍算这一档
export const TIERS = [
  { n: '拮据', from: 0 },
  { n: '普通', from: 0.9 },
  { n: '小康', from: 1.35 },
  { n: '宽裕', from: 1.9 },
  { n: '富足', from: 2.7 },
];
// 过得好坏的增减益：每人实际花的钱是当地每人日常开销的 x 倍，以一般人家的 LIVE_MID 为零，按 log2(x / LIVE_MID) 算。
// 往下陡、往上缓：省掉的是吃穿和人情往来，多花的是锦上添花。h、so、hl：幸福、人际、健康的目标值；div：离婚风险的倍数（为钱吵架）
export const LIVE_MID = 1.5;
const FX = { h: [11, 16, -14, 10], so: [8, 9, -10, 6], hl: [4, 5, -5, 3] }; // 往下每翻一倍、往上每翻一倍，下限、上限
export function liveFx(x: number) {
  const l = flog(Math.max(0.3, x) / LIVE_MID) / LN2;
  const f = (k: keyof typeof FX) => { const [dn, up, lo, hi] = FX[k]; return clamp(l < 0 ? l * dn : l * up, lo, hi); };
  return { h: f('h'), so: f('so'), hl: f('hl'), div: l < 0 ? 1 - 0.5 * l : 1 - Math.min(0.15, 0.15 * l) };
}
// 一家三口算 2.4 个人，比人头少，所以照常过的时候每个「算的人」要比当地人均花得多一些（估计：让一般的人家花掉的比例对上全国的平均）
export const LIVE_K = 1.2;
// 存款也撑着日子：每年按存款的 4% 算进收入（存款多的人家花得也多，钱不会只攒不花）
const SAVE_USE = 0.04;
// 吃穿的底线：每人至少花当地日常开销的六成，再穷也省不过这条线
export const FLOOR = 0.6;
// 收入少了，日子每年最多紧一成半（习惯了的日子不会一下子变）
const HABIT = 0.85;
// 拮据的月份（大致连续）攒到这么多，就是「长期拮据」：幸福、健康再低一截
export const POOR_LONG = 36;
// 拮据不只是目标值低：每年还直接扣掉这么多幸福、健康（吃不好、为钱发愁、小病拖着），长期拮据的翻倍（stats.ts 的 drift）
export const POOR_HURT = { h: 4, hl: 1.5 };
// 生活方式（plans/style.ts）。照常、过好一点：照常花的几倍。
// 省着过不按收入打折：过当地普通人家的日子（每人花当地日常开销的 SAVE_LV 倍，在「普通」这一档中间），收入再高也是这个数——
// 一个月挣三万的人省着过，就是和当地一般人一样过，不是照样宽裕。照常过本来就比这还省的人家，再紧一紧，少花 SAVE_CUT
export const STYLE_K: Record<string, number> = { normal: 1, more: 1.3 };
export const SAVE_LV = 1.1, SAVE_CUT = 0.25;
export const styleOf = () => planOf('style') || 'normal';

/** 家里算几个人：第一个大人 1，别的大人各 0.6（住在一起很多东西共用）；孩子 6 岁前 0.5，上学的 0.8（学费、课外班、生活费） */
export const familySize = (adults: number, children: number[]) =>
  Math.max(1, 1 + 0.6 * Math.max(0, adults - 1) + children.reduce((t, a) => t + (a < 6 ? 0.5 : 0.8), 0));

/** 这一年的收入相当于当地几个人的。inc：一个月的收入；cash：存款；y0：当地人均收入（一年）；prev：上一年的 */
export function incUnits(inc: number, cash: number, y0: number, prev?: number) {
  const q = (inc + Math.max(0, cash) * SAVE_USE / MONTHS) / (y0 / MONTHS);
  return prev != null ? Math.max(q, prev * HABIT) : q;
}
/** 吃穿的底线（一个月）。c：当地每人日常开销（一年） */
export const floorCost = (c: number, size: number) => c / MONTHS * size * FLOOR;
/** 一个月的日常开销。q：收入相当于当地几个人的；c：当地每人日常开销（一年）；style：生活方式（plans/style.ts） */
export function livingCost(q: number, c: number, size: number, style = 'normal') {
  const usual = c / MONTHS * LIVE_K * Math.sqrt(Math.max(0, q) * size);
  const v = style === 'save' ? Math.min(c / MONTHS * size * SAVE_LV, usual * (1 - SAVE_CUT)) : usual * (STYLE_K[style] || 1);
  return Math.max(v, floorCost(c, size));
}
/** 一个月花了 spend，每人是当地每人日常开销的几倍 */
export const liveX = (spend: number, c: number, size: number) => spend / (c / MONTHS * size);
/** 一个月花了 spend，算哪一档 */
export function tierOf(spend: number, c: number, size: number) {
  const x = liveX(spend, c, size);
  for (let i = TIERS.length - 1; i > 0; i--) if (x >= TIERS[i].from) return i;
  return 0;
}
/** 拮据的月份：拮据的月份加一，不拮据的月份减二（日子缓过来了，慢慢就忘了） */
export const poorStep = (n: number | undefined, t: number) => t === 0 ? (n || 0) + 1 : Math.max(0, (n || 0) - 2);
