// 校准：stats（各年龄段的平均健康、幸福、人际、学识，以及恋爱中的平均感情）。运行：npm run calib -- stats [N]
// 没有外部目标：用来对照按月结算前后是否接近（改造前的输出见 docs/monthly/baseline/stats.txt）。每年生日那一刻取一次。
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth, runHeadlessYear } from './lib';
const N = +process.argv[3] || 3000;

const result = (() => {
  const bins = [0, 6, 12, 18, 25, 35, 45, 55, 65, 75, 85], lab = i => bins[i] + (bins[i + 1] ? '-' + (bins[i + 1] - 1) : '+');
  const A = bins.map(() => ({ n: 0, hl: 0, h: 0, so: 0, kn: 0, ln: 0, love: 0 }));
  for (let i = 0; i < N; i++) {
    birth(1000 + i * 7, { headless: true }); const L = E.S; let g = 0;
    while (L.phase === 'life' && g++ < 130) {
      runHeadlessYear(); if (L.phase !== 'life') break;
      let b = 0; while (b + 1 < bins.length && L.age >= bins[b + 1]) b++;
      const s = A[b]; s.n++; s.hl += L.st.hl; s.h += L.st.h; s.so += L.st.so; s.kn += L.st.kn;
      if (L.fam.dating) { s.ln++; s.love += L.fam.dating.love; }
    }
  }
  const r = {};
  A.forEach((s, i) => { r[lab(i)] = `hl ${(s.hl / s.n).toFixed(1)}  h ${(s.h / s.n).toFixed(1)}  so ${(s.so / s.n).toFixed(1)}  kn ${(s.kn / s.n).toFixed(1)}` + (s.ln ? `  love ${(s.love / s.ln).toFixed(1)}` : ''); });
  return r;
})();
console.log(JSON.stringify(result, null, 1));
