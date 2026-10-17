// 生活方式（持续的计划，plans.ts）：在自动定的档位（budget.ts 的 TIERS，每年按收入和存款定）上省一档或松一档。
// 省着过：多存钱，日子紧一点（幸福每年 −2）；过好一点：花得多、存得少，日子舒服一点（幸福每年 +2）。
// 没设过、自动的人生都是「照常」，和原来一样
import { S } from '../state';
import { clamp } from '../rng';
import { TIERS } from '../budget';
import { definePlan, planOf } from '../plans';

const OFF: Record<string, number> = { save: -1, normal: 0, more: 1 };
/** 生活方式让档位挪几档 */
export const styleOff = () => OFF[planOf('style') || 'normal'] || 0;
/** 这个月实际按哪一档花：自动的档位加上生活方式 */
export const liveTier = () => clamp((S.tier ?? 1) + styleOff(), 0, TIERS.length - 1);

definePlan('style', {
  n: '生活方式', g: 'life',
  d: () => `按收入，现在过的是「${TIERS[S.tier ?? 1].n}」的日子`,
  ok: () => !!S.indep && S.age >= 18,
  opts: [
    { k: 'save', label: '省着过', sub: () => `按「${TIERS[clamp((S.tier ?? 1) - 1, 0, TIERS.length - 1)].n}」花，多存钱`, e: { h: -2 } },
    { k: 'normal', label: '照常', sub: () => `按「${TIERS[S.tier ?? 1].n}」花` },
    { k: 'more', label: '过好一点', sub: () => `按「${TIERS[clamp((S.tier ?? 1) + 1, 0, TIERS.length - 1)].n}」花，存得少`, e: { h: 2 } },
  ],
  def: () => 'normal',
  say: k => k === 'save' ? '决定省着过日子：能不下馆子就不下，衣服穿旧了再买。' : k === 'more' ? '决定对自己好一点：想吃的吃，想买的买。' : '日子照常过。',
});
