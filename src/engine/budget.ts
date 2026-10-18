// 生活开销：你自己和父母家用同一套规则。
// 一家人一个月的日常开销（吃穿、交通、教育、看病……；房租、房贷另算）＝ 当地每人日常开销 × √（收入相当于当地几个人的 × 家里算几个人）。
// 意思是：家里算的人越多花得越多；收入越高花得越多，但花掉的比例越低（钱多的人家多存一些）。
// 照这样算，全国城镇一般的人家日常开销约是到手收入的一半，京沪这样收入高的地方三四成；一个人过、两口子、有孩子、退休，比例各不一样：
// 两口子都上班最能存钱，有了孩子钱就紧了，只有一个人挣钱的更紧。
// 收入每年过生日的时候看一次（加上存款能贴补的一点）；收入一下子少了，日子也是慢慢紧下来的。
// 档位（拮据……富足）是这一家每个人花的钱相当于当地的几倍。档位高低影响幸福和健康，日子长期紧巴巴的伤得更重（stats.ts 的 drift）。
import { MONTHS } from './monthly';
import { planOf } from './plans';

// from：每人花的钱达到当地每人日常开销的几倍算这一档；h、hl：过这样的日子，幸福、健康的目标值高低多少（以最常见的小康为零：钱多了幸福加得越来越少）
export const TIERS = [
  { n: '拮据', from: 0, h: -9, hl: -2 },
  { n: '普通', from: 0.9, h: -3, hl: 0 },
  { n: '小康', from: 1.35, h: 0, hl: 0.5 },
  { n: '宽裕', from: 1.9, h: 2, hl: 1 },
  { n: '富足', from: 2.7, h: 3, hl: 1 },
];
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
// 生活方式（plans/style.ts）：照常花的几倍
export const STYLE_K: Record<string, number> = { save: 0.75, normal: 1, more: 1.3 };
export const styleK = () => STYLE_K[planOf('style') || 'normal'] || 1;

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
/** 一个月的日常开销。q：收入相当于当地几个人的；c：当地每人日常开销（一年）；k：生活方式 */
export const livingCost = (q: number, c: number, size: number, k = 1) =>
  Math.max(c / MONTHS * LIVE_K * Math.sqrt(Math.max(0, q) * size) * k, floorCost(c, size));
/** 一个月花了 spend，算哪一档 */
export function tierOf(spend: number, c: number, size: number) {
  const x = spend / (c / MONTHS * size);
  for (let i = TIERS.length - 1; i > 0; i--) if (x >= TIERS[i].from) return i;
  return 0;
}
/** 拮据的月份：拮据的月份加一，不拮据的月份减二（日子缓过来了，慢慢就忘了） */
export const poorStep = (n: number | undefined, t: number) => t === 0 ? (n || 0) + 1 : Math.max(0, (n || 0) - 2);
