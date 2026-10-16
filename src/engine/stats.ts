// 四项状态（健康 hl、幸福 h、学识 kn、人际 so）的变化。

import { S } from './state';
import { clamp } from './rng';
import { placeInc } from './place';

export function eff(o) {
  for (const k in o) {
    if (k === 'money') { if (S.indep === false) S.famMoney += o.money; else S.money += o.money; }
    // 学识：越高越难再提高（边际递减）
    else if (k === 'kn' && o.kn > 0) S.st.kn = clamp(S.st.kn + o.kn * (1 - S.st.kn / 115), 0, 100);
    else S.st[k] = clamp(S.st[k] + o[k], 0, 100);
  }
}
export function drift() {
  const st = S.st, f = S.fam, a = S.age;
  const kids = f.kids.filter(k => k.alive).length;
  const hT = hlExp(a) + (S.q - 3) * 1.5 + (S.money < 0 && a >= 22 ? -3 : 0) + (S.flags.smoke ? -6 : 0) + (S.flags.ill ? -20 : 0);
  st.hl = clamp(st.hl + (hT - st.hl) * 0.18, 1, 100);
  const rel = a < 18 ? (S.q - 3) * 2.5 : (S.relInc || 0);
  const debt = a >= 22 && S.money < -placeInc() ? 7 : 0;
  const hpT = 56 + rel + (f.married && f.partner && f.partner.alive ? 5 : 0) + Math.min(6, kids * 3) + (st.so - 50) * 0.25 + (st.hl - 60) * 0.15
    - debt - (S.flags.lb && a < 16 ? 6 : 0) - (S.job === 'seeking' ? 6 : 0);
  st.h = clamp(st.h + (hpT - st.h) * 0.25, 0, 100);
  const soT = 50 + (f.married ? 8 : 0) + Math.min(9, kids * 3) + (S.flags.lb && a < 16 ? -4 : 0) + (a > 75 ? -6 : 0);
  st.so = clamp(st.so + (soT - st.so) * 0.12, 0, 100);
}
export const hlExp = a => clamp(90 - Math.max(0, a - 22) * 0.8, 15, 90);
