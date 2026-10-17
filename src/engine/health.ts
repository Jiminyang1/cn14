// 大病：治疗、医保报销、存活，以及死亡。

import { CAUSE, DIAG, deathProb, pickCause } from './mortality';
import { JOBS } from './career';
import { S } from './state';
import { chance } from './rng';
import { eff } from './stats';
import { addDoc, log } from './journal';
import { MONTHS, calMonth, calYear, perMonth } from './monthly';

declare module './types' {
  // am：确诊在第几个月（年龄 × 12 + 月份，下同）；mo：开始治疗以后过了几个月
  interface Illness { am?: number; mo?: number }
  interface Death { month?: number }                // 离世是公历几月（year 是公历哪一年）
}
/** 这一生的第几个月：年龄 × 12 + 这一年的第几个月 */
export const lifeMonth = (m = S.month) => S.age * MONTHS + m;

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
// 治疗按月判定：上面的年死亡率按 perMonth 换成每月；复查、吃药的钱从第二年起每月记 1/12；治满 5 年（60 个月）算挺过来。
// 原来按年时，治疗从年中开始，到年底才第一次判定，5 次判定实际只覆盖约 4.6 年；按月以后是完整的 5 年
export const ILL_SURVIVE_MO = 60;
// 确诊了却一直没有开始治疗（抉择没来得及做）：约一年后离世
export const ILL_UNTREATED_MO = 12;
export function illMonth() {
  const il = S.flags.ill;
  il.mo++;
  const p = (ILL[il.k] || ILL.cancer).die[il.treat] * (S.rural && il.k === 'cancer' ? 1.15 : 1);
  if (il.mo > MONTHS && il.treat !== 'none') S.money -= oop(il.k, il.treat) * 0.3 / MONTHS; // 之后每年复查、吃药，按月记
  if (chance(perMonth(p))) { die(il.k); return true; }
  if (il.mo >= ILL_SURVIVE_MO && il.treat !== 'none') { S.flags.ill = null; S.flags.survivor = 1; log('复查结果一直稳定。医生说，可以算是挺过来了。', 'good'); eff({ h: 8 }); }
  return false;
}
export function die(k) {
  S.phase = 'end'; S.pending = null; S.queue = [];
  // 长到 110 岁（endYear 里）离世时已经过了生日，S.month 也已经归零
  S.death = { age: S.age, cause: k, year: calYear(), month: calMonth() };
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
const MAJOR = ['cancer', 'heart', 'stroke', 'liver', 'resp'];
/** 生病和死亡，每个月判定一次（年概率按 perMonth 换算）：在治疗中的按治疗结果算；没生病的按生命表判定会不会出事（大病先确诊、给一次治疗的机会）；
 *  确诊了却一直没开始治疗的，约一年后离世。返回这个月是否离世 */
export function healthMonth(m: number): boolean {
  const a = S.age, il = S.flags.ill;
  if (il) {
    if (il.treat) { if (illMonth()) return true; }
    else if (lifeMonth(m) - (il.am ?? il.at * MONTHS + MONTHS - 1) >= ILL_UNTREATED_MO) { die(il.k); return true; }
    // 生病期间（治疗中，或确诊后还没决定怎么治）：大病本身的风险之外，其他死因照常存在（否则高龄时确诊反而更安全）
    if (chance(perMonth(deathProb()))) { die(pickCause()); return true; }
    return false;
  }
  if (chance(perMonth(deathProb()))) {
    const k = pickCause();
    if (MAJOR.includes(k) && a >= 35 && chance(0.55)) {
      S.flags.ill = { k, at: a, am: lifeMonth(m), mo: 0 };
      addDoc('ill', '诊断书', [['诊断', CAUSE[k]], ['日期', `${calYear(m)}年${calMonth(m)}月`]]);
      log(DIAG[k], 'bad');
      return false;
    }
    die(k); return true;
  }
  return false;
}
