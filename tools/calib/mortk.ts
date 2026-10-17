// 校准：mortk。运行：npm run calib -- mortk [N]
// 找 MORT_K，使模拟的男女平均寿命对上 LE_TARGET（大病确诊后治愈会带走一部分死亡，所以要放大 35 岁以后的死亡率）
// @ts-nocheck
import * as E from './lib';
const N = +process.argv[3] || 4000;
function e0(sex) {
  let t = 0, n = 0;
  for (let i = 0; i < N * 2 && n < N; i++) {
    E.birth(1000 + i * 7, { headless: true }); const L = E.S;
    if (L.sex !== sex) continue;
    let g = 0; while (L.phase === 'life' && g++ < 130) E.runHeadlessYear();
    t += L.death.age; n++;
  }
  return t / n;
}
for (const sx of ['M', 'F']) {
  let lo = 1, hi = 2.5;
  for (let it = 0; it < 8; it++) { E.MORT_K[sx] = (lo + hi) / 2; if (e0(sx) > E.LE_TARGET[sx]) lo = E.MORT_K[sx]; else hi = E.MORT_K[sx]; }
  E.MORT_K[sx] = (lo + hi) / 2;
  console.log(sx, 'MORT_K', E.MORT_K[sx].toFixed(3), 'e0', e0(sx).toFixed(2), 'target', E.LE_TARGET[sx]);
}
