// 大病：治疗、医保报销、存活，以及死亡。

import { CAUSE, DIAG, deathProb, pickCause } from './mortality';
import { JOBS } from './career';
import { S } from './state';
import { chance } from './rng';
import { eff } from './stats';
import { addDoc, log } from './journal';
import { MONTHS } from './monthly';

// ===== 大病：存活、费用、医保（来源见 research/health.json） =====
// 每年死亡概率按 5 年生存率换算：癌症全国 43.7%（城市 46.7%、农村 33.6%，国家癌症中心 2019–2021）；
// 去三甲约为平均的 1.1 倍、本地医院约 0.8 倍（按城乡差距推算，估计）；不治疗约为 0.2 倍。
// 心梗：院内死亡约 4%，出院后一年约 2.8%；脑卒中：一年死亡 3.3%–13.4%，13%–33% 留下较重残疾。
export const ILL = {
  cancer: { die: { big: 0.135, local: 0.19, none: 0.38 }, cost: { big: 120000, local: 55000, none: 10000 } },
  heart: { die: { big: 0.04, local: 0.06, none: 0.2 }, cost: { big: 50000, local: 25000, none: 5000 } },
  stroke: { die: { big: 0.05, local: 0.09, none: 0.2 }, cost: { big: 50000, local: 25000, none: 5000 }, disable: 0.25 },
  liver: { die: { big: 0.15, local: 0.2, none: 0.4 }, cost: { big: 60000, local: 35000, none: 8000 } },
  resp: { die: { big: 0.07, local: 0.09, none: 0.16 }, cost: { big: 20000, local: 10000, none: 3000 } },
};
// 医保：职工医保（正式工作）还是城乡居民医保。住院费用的实际报销比例（含目录外自费）：
// 肺癌研究里职工约 49%、居民约 37%；居民医保在三级医院的目录内报销比例（61.7%）明显低于基层（79.4%）；异地就医再低一些。
export const empIns = () => !!(S.hpfOn || S.flags.empIns || (JOBS[S.job] && (JOBS[S.job].stable || JOBS[S.job].priv)));
export function reimburse(where) {
  const emp = empIns();
  let r = emp ? (where === 'big' ? 0.47 : 0.55) : (where === 'big' ? 0.33 : 0.45);
  if (where === 'big' && S.loc.kind !== 'big' && S.loc.kind !== 'capital') r -= 0.08; // 异地就医
  return { r: Math.max(0.2, r), emp };
}
export const oop = (k, where) => Math.round(ILL[k].cost[where] * (1 - reimburse(where).r) / 1e3) * 1e3;
export function illYear() {
  const il = S.flags.ill;
  il.y = (il.y || 0) + 1;
  const p = (ILL[il.k] || ILL.cancer).die[il.treat] * (S.rural && il.k === 'cancer' ? 1.15 : 1);
  if (il.y > 1 && il.treat !== 'none') S.money -= oop(il.k, il.treat) * 0.3; // 之后每年复查、吃药
  if (chance(p)) { die(il.k); return true; }
  if (il.y >= 5 && il.treat !== 'none') { S.flags.ill = null; S.flags.survivor = 1; log('复查结果一直稳定。医生说，可以算是挺过来了。', 'good'); eff({ h: 8 }); }
  return false;
}
export function die(k) {
  S.phase = 'end'; S.pending = null; S.queue = [];
  S.death = { age: S.age, cause: k, year: S.birthYear + S.age };
  log(deathText(k), 'death');
}
export function deathText(k) {
  const a = S.age;
  if (a === 0) return k === 'perinatal' ? '出生后没多久，你因为早产并发症离开了这个世界。' : `还不满一岁，你因为${CAUSE[k]}离开了这个世界。`;
  if (k === 'suicide') return `${a}岁那年，你在长久的痛苦里结束了自己的生命。`;
  if (k === 'old') return `${a}岁，你在睡梦中安静地走了。`;
  return `${a}岁，你因为${CAUSE[k]}离开了这个世界。`;
}

// ===== 每个月月底 =====
/** 生病和死亡：在治疗中的按治疗结果算；没生病的按生命表判定会不会出事（大病先确诊、给一次治疗的机会）；
 *  确诊了却没开始治疗的，一年多以后离世。返回这个月是否离世。兼容模式：一年判定一次，在第 12 个月 */
export function healthMonth(m: number): boolean {
  if (m !== MONTHS - 1) return false;
  const a = S.age;
  // 大病治疗期间：大病本身的风险之外，其他死因照常存在（否则高龄时确诊反而更安全）
  if (S.flags.ill && S.flags.ill.treat) { if (illYear()) return true; if (chance(deathProb())) { die(pickCause()); return true; } return false; }
  if (!S.flags.ill && chance(deathProb())) {
    const k = pickCause();
    if (['cancer', 'heart', 'stroke', 'liver', 'resp'].includes(k) && a >= 35 && chance(0.55)) {
      S.flags.ill = { k, at: a };
      addDoc('ill', '诊断书', [['诊断', CAUSE[k]], ['日期', `${S.birthYear + a}年`]]);
      log(DIAG[k], 'bad');
      return false;
    }
    die(k); return true;
  }
  if (S.flags.ill && !S.flags.ill.treat && a > S.flags.ill.at + 1) { die(S.flags.ill.k); return true; }
  return false;
}
