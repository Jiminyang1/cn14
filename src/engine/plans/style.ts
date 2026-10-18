// 生活方式（持续的计划，plans.ts）：照常花（按收入和家里几口人，budget.ts）、省着过（照常的七成半）、过好一点（照常的一倍三）。
// 不直接加减幸福：花得多少换成了档位（拮据……富足），档位再影响幸福和健康（stats.ts 的 drift）。
// 所以日子宽裕的人省着过不疼不痒，本来就普通的人家省着过就成了拮据，长期这样伤身体。
// 没设过、自动的人生都是「照常」
import { S } from '../state';
import { STYLE_K, TIERS } from '../budget';
import { definePlan } from '../plans';
import { myLiving } from '../finance';
import { wan } from '../format';

/** 按生活方式 k 过：每月约多少、算哪一档 */
const sub = (k: string) => () => { const v = myLiving(STYLE_K[k]); return `每月约${wan(v.cost)} · ${TIERS[v.tier].n}`; };

definePlan('style', {
  n: '生活方式', g: 'life',
  d: () => `日常开销，房租房贷另算。照现在的收入和家里几口人，照常过是「${TIERS[myLiving(1).tier].n}」的日子；过得越紧越不开心，长期拮据伤身体`,
  ok: () => !!S.indep && S.age >= 18,
  opts: [
    { k: 'save', label: '省着过', sub: sub('save') },
    { k: 'normal', label: '照常', sub: sub('normal') },
    { k: 'more', label: '过好一点', sub: sub('more') },
  ],
  def: () => 'normal',
  say: k => k === 'save' ? '决定省着过日子：能不下馆子就不下，衣服穿旧了再买。' : k === 'more' ? '决定对自己好一点：想吃的吃，想买的买。' : '日子照常过。',
});
