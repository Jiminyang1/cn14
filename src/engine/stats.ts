// 四项状态（健康 hl、幸福 h、学识 kn、人际 so）的变化。

import { S } from './state';
import { clamp } from './rng';
import { placeInc } from './place';
import { JOBS, isWorking } from './career';
import { MONTHS, approachPerMonth } from './monthly';
import { pz } from './personality';
import { focusH } from './focus';
import { changeMoney, liquidBalance } from './accounts';
import { POOR_HURT, POOR_LONG, TIERS } from './budget';

export function eff(o) {
  for (const k in o) {
    if (k === 'money') { if (S.indep === false) S.famMoney += o.money; else changeMoney(o.money); }
    // 学识：越高越难再提高（边际递减）
    else if (k === 'kn' && o.kn > 0) S.st.kn = clamp(S.st.kn + o.kn * (1 - S.st.kn / 115), 0, 100);
    else S.st[k] = clamp(S.st[k] + o[k], 0, 100);
  }
}
// 每年向目标值靠拢的比例：健康 0.18、幸福 0.25、人际 0.12（估计），换算成每月：目标不变时一年后的结果和原来一样
const K_HL = approachPerMonth(0.18), K_H = approachPerMonth(0.25), K_SO = approachPerMonth(0.12);
// 性格对目标值的影响（每个标准差）：成年人幸福的标准差约 8，敏感 −2.5、外向 +1.2、认真 +0.8 约等于 β −0.3 / +0.15 / +0.1（Anglim 2020、Schimmack 2022）；
// 外向、随和的人人际高一些；认真的人健康习惯好一些。见 docs/personality/PLAN.md
const persH = () => -2.5 * pz('n') + 1.2 * pz('e') + 0.8 * pz('c') + 0.4 * pz('a');
const persSo = () => 2.5 * pz('e') + 1.0 * pz('a');
// 幸福的目标值：成年人大多落在 65–85 之间，顶到 100 的很少，过得好坏才看得出来。
// 每年持续的东西（格子、婚姻、孩子、收入、失业）都只抬高或压低目标值，不往幸福上直接加——每年直接加 x，目标只拉回四分之一，
// 等于把目标抬高 4x，几年下来谁都顶到 100。一次性的事（升职、旅游、被骗）还是直接加减，过几年慢慢回到目标，这就是起伏。
// 格子：每格按 FOCUS 的 h 乘 H_FOCUS（两格都放爱好约 +14、两格都放工作约 −6）；职业：职业表的 h 乘 H_JOB（原来每年直接加一半，折成目标值一样大）；
// 未成年人心事少，目标高 H_KID。人际大多在 85 以上，按 70 算起，免得它把幸福一起抬满
const H_BASE = 47, H_FOCUS = 1.5, H_JOB = 2, H_KID = 8;
// ===== 目标值 =====
// 拆成三个函数，月底结算（drift）和界面上的「状态」（status.ts）都从这里取；status.ts 把同样的式子拆成一项一项（tests/status.test.ts 核对加起来一样）
const kidsN = () => { let n = 0; for (const k of S.fam.kids) if (k.alive) n++; return n; };
// 过的什么日子（budget.ts 的档位）：经济独立以前看父母家，以后看自己的小家。长期拮据的，幸福再低 3、健康再低 2
export const tierNow = () => TIERS[(S.indep !== false ? S.statement?.tier : S.parentTier) ?? 1] || TIERS[1];
export const poorLongNow = () => ((S.indep !== false ? S.poorM : S.famPoorM) || 0) >= POOR_LONG ? 1 : 0;
/** 健康的目标值 */
export function hlTarget() {
  const a = S.age, T = tierNow(), poorLong = poorLongNow();
  // 中风留下残疾（content/decisions.ts 的治疗抉择里设 flags.disabled）：健康的目标值一直低 10（估计；残疾后的死亡风险经 deathProb 的健康倍数升高），幸福低 4
  const dis = S.flags.disabled ? 1 : 0;
  const hardship = S.statement && S.statement.shortfall > 0 ? 3 : 0;
  return hlExp(a) + (S.q - 3) * 1.5 + T.hl - poorLong * 2 + (liquidBalance() < 0 && a >= 22 ? -3 : 0) + (S.flags.smoke ? -6 : 0) + (S.flags.ill ? -20 : 0) - dis * 10 - hardship + 0.8 * pz('c');
}
/** 幸福的目标值 */
export function hTarget() {
  const st = S.st, f = S.fam, a = S.age, T = tierNow(), poorLong = poorLongNow(), dis = S.flags.disabled ? 1 : 0;
  // 成年以后还要和当地人比收入（relInc），比日子的档位轻一些
  const rel = T.h - poorLong * 3 + (a < 18 ? 0 : (S.relInc || 0) * 0.4);
  const debt = a >= 22 && liquidBalance() < -placeInc() ? 7 : 0;
  // 成年以后和爸妈亲不亲（actions.ts 的亲疏，常回家看看就亲）：最亲 +3，很疏远 −5
  const par = a >= 18 && (f.mom.alive || f.dad.alive) ? ((S.close?.par ?? 70) - 60) * 0.08 : 0;
  return H_BASE + H_FOCUS * focusH() + rel + par + (f.married && f.partner && f.partner.alive ? 5 : 0) + Math.min(6, kidsN() * 3) + (st.so - 70) * 0.2 + (st.hl - 60) * 0.15 + (a < 18 ? H_KID : 0)
    + (isWorking() ? (JOBS[S.job].h || 0) * H_JOB : 0)
    - debt - (S.flags.lb && a < 16 ? 6 : 0) - (S.job === 'seeking' ? 6 : 0) - dis * 4 + persH();
}
/** 人际的目标值 */
export function soTarget() {
  const f = S.fam, a = S.age;
  return 50 + (f.married ? 8 : 0) + Math.min(9, kidsN() * 3) + (S.flags.lb && a < 16 ? -4 : 0) + (a > 75 ? -6 : 0) + persSo();
}
export { persH, persSo, H_BASE, H_FOCUS, H_JOB, H_KID, K_HL, K_H, K_SO };

/** 健康、幸福、人际向各自的目标值靠拢一个月（目标按这个月月底的状态算） */
export function drift() {
  const st = S.st;
  const own = S.indep !== false, T = tierNow(), poorLong = poorLongNow();
  // 拮据的日子每年还直接扣一些（自己当家的才扣；孩子只看目标值，家境差的孩子不开心，但不至于压垮）
  if (own && T === TIERS[0]) { st.h = clamp(st.h - POOR_HURT.h * (1 + poorLong) / MONTHS, 0, 100); st.hl = clamp(st.hl - POOR_HURT.hl * (1 + poorLong) / MONTHS, 1, 100); }
  st.hl = clamp(st.hl + (hlTarget() - st.hl) * K_HL, 1, 100);
  st.h = clamp(st.h + (hTarget() - st.h) * K_H, 0, 100);
  st.so = clamp(st.so + (soTarget() - st.so) * K_SO, 0, 100);
}
export const hlExp = a => clamp(90 - Math.max(0, a - 22) * 0.8, 15, 90);

// ===== 每个月月底 =====
/** 身体：上了年纪学识慢慢下降（每年 0.3），工作对健康的影响（每年为职业表里的一半；对幸福的影响在 drift 的目标值里）。每月记 1/12，看这个月月底在不在工作 */
export function bodyMonth(m: number) {
  void m;
  const st = S.st;
  if (S.age >= 68 && st.kn > 25) st.kn -= 0.3 / MONTHS;
  if (isWorking()) { const J = JOBS[S.job]; st.hl = clamp(st.hl + (J.hl || 0) * 0.5 / MONTHS, 0, 100); }
}
/** 健康、幸福、人际每月向各自的目标值靠拢 */
export function driftMonth(m: number) {
  void m;
  drift();
}
