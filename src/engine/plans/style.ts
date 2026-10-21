// 生活方式（持续的计划，plans.ts）：照常花（按收入和家里几口人，budget.ts）、省着过（过当地普通人家的日子；照常本来就比这省的，再少花四分之一）、过好一点（照常的一倍三）。
// 不直接加减幸福：按实际花的钱（budget.ts 的 liveFx）影响幸福、人际、健康的目标值和离婚风险（stats.ts 的 drift），选项上用箭头标出来。
// 所以收入高的人省着过能存下一大截，日子从宽裕落到普通；本来就普通的人家省着过就成了拮据，长期这样伤身体。
// 没设过、自动的人生都是「照常」
import { S } from '../state';
import { TIERS, liveFx } from '../budget';
import { definePlan } from '../plans';
import { myLiving } from '../finance';

/** 和照常比，幸福、人际、健康差多少（budget.ts 的 liveFx）；差得太少的不算。计划页上画成箭头 */
export function styleFx(k: string): Record<string, number> {
  if (k === 'normal') return {};
  const a = liveFx(myLiving(k).x), b = liveFx(myLiving('normal').x), out: Record<string, number> = {};
  for (const s of ['h', 'so', 'hl'] as const) { const d = a[s] - b[s]; if (Math.abs(d) >= 0.5) out[s] = d; }
  return out;
}
const sub = (k: string) => () => TIERS[myLiving(k).tier].n;

definePlan('style', {
  n: '生活方式', g: 'life',
  d: () => `日常开销，照常是「${TIERS[myLiving('normal').tier].n}」`,
  ok: () => !!S.indep && S.age >= 18,
  opts: [
    { k: 'save', label: '省着过', sub: sub('save') },
    { k: 'normal', label: '照常', sub: sub('normal') },
    { k: 'more', label: '过好一点', sub: sub('more') },
  ],
  def: () => 'normal',
  say: k => k === 'save' ? '决定省着过日子：能不下馆子就不下，衣服穿旧了再买。' : k === 'more' ? '决定对自己好一点：想吃的吃，想买的买。' : '日子照常过。',
});
