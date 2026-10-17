// 四项状态（健康 hl、幸福 h、学识 kn、人际 so）的变化。

import { S } from './state';
import { clamp } from './rng';
import { placeInc } from './place';
import { JOBS, isWorking } from './career';
import { MONTHS, approachPerMonth } from './monthly';
import { pz } from './personality';
import { changeMoney, liquidBalance } from './accounts';

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
/** 健康、幸福、人际向各自的目标值靠拢一个月（目标按这个月月底的状态算） */
export function drift() {
  const st = S.st, f = S.fam, a = S.age;
  let kids = 0; for (const k of f.kids) if (k.alive) kids++;
  // 中风留下残疾（content/decisions.ts 的治疗抉择里设 flags.disabled）：健康的目标值一直低 10（估计；残疾后的死亡风险经 deathProb 的健康倍数升高），幸福低 4
  const dis = S.flags.disabled ? 1 : 0;
  const hardship = S.statement && S.statement.shortfall > 0 ? 3 : 0;
  const hT = hlExp(a) + (S.q - 3) * 1.5 + (liquidBalance() < 0 && a >= 22 ? -3 : 0) + (S.flags.smoke ? -6 : 0) + (S.flags.ill ? -20 : 0) - dis * 10 - hardship + 0.8 * pz('c');
  st.hl = clamp(st.hl + (hT - st.hl) * K_HL, 1, 100);
  const rel = a < 18 ? (S.q - 3) * 2.5 : (S.relInc || 0);
  const debt = a >= 22 && liquidBalance() < -placeInc() ? 7 : 0;
  const hpT = 56 + rel + (f.married && f.partner && f.partner.alive ? 5 : 0) + Math.min(6, kids * 3) + (st.so - 50) * 0.25 + (st.hl - 60) * 0.15
    - debt - (S.flags.lb && a < 16 ? 6 : 0) - (S.job === 'seeking' ? 6 : 0) - dis * 4 + persH();
  st.h = clamp(st.h + (hpT - st.h) * K_H, 0, 100);
  const soT = 50 + (f.married ? 8 : 0) + Math.min(9, kids * 3) + (S.flags.lb && a < 16 ? -4 : 0) + (a > 75 ? -6 : 0) + persSo();
  st.so = clamp(st.so + (soT - st.so) * K_SO, 0, 100);
}
export const hlExp = a => clamp(90 - Math.max(0, a - 22) * 0.8, 15, 90);

// ===== 每个月月底 =====
/** 身体：上了年纪学识慢慢下降（每年 0.3），工作对健康和幸福的影响（每年为职业表里的一半）。每月记 1/12，看这个月月底在不在工作 */
export function bodyMonth(m: number) {
  void m;
  const st = S.st;
  if (S.age >= 68 && st.kn > 25) st.kn -= 0.3 / MONTHS;
  if (isWorking()) { const J = JOBS[S.job]; st.hl = clamp(st.hl + (J.hl || 0) * 0.5 / MONTHS, 0, 100); st.h = clamp(st.h + (J.h || 0) * 0.5 / MONTHS, 0, 100); }
}
/** 健康、幸福、人际每月向各自的目标值靠拢 */
export function driftMonth(m: number) {
  void m;
  drift();
}
