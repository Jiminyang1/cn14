// 校准：pers（性格）。运行：npm run calib -- pers [N]
// 看四件事：各轴的均值和标准差；相隔 1 年、10 年、童年到成年的相关；性格和幸福、人际的相关；离婚、32 岁未婚按性格分组的比例。
// 目标见 docs/personality/PLAN.md：成年后 1 年约 0.9、10 年约 0.6、8→30 岁约 0.3；敏感和幸福约 −0.3、外向和人际约 +0.3（大五元分析的量级）。
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth, runHeadlessYear } from './lib';
const N = +process.argv[3] || 3000;
const AX = E.AX;

const mean = x => x.reduce((a, b) => a + b, 0) / x.length;
const sd = x => { const m = mean(x); return Math.sqrt(mean(x.map(v => (v - m) ** 2))); };
const cor = (x, y) => { const mx = mean(x), my = mean(y); let s = 0; for (let i = 0; i < x.length; i++) s += (x[i] - mx) * (y[i] - my); return s / x.length / sd(x) / sd(y); };

const at = {}; // 年龄 → 每个人的 z、幸福、人际、健康
const keep = [8, 18, 30, 31, 40, 45, 60];
for (const a of keep) at[a] = [];
const div = { lo: [0, 0], mid: [0, 0], hi: [0, 0] }, single32 = { lo: [0, 0], mid: [0, 0], hi: [0, 0] };
const tier = v => v < -0.5 ? 'lo' : v > 0.5 ? 'hi' : 'mid';
let words = 0, wn = 0;
for (let i = 0; i < N; i++) {
  birth(1000 + i * 7, { headless: true }); const L = E.S; let g = 0;
  const rec = {};
  let n30 = null;
  while (L.phase === 'life' && g++ < 130) {
    runHeadlessYear(); if (L.phase !== 'life') break;
    if (at[L.age]) rec[L.age] = { z: { ...L.pers.z }, h: L.st.h, so: L.st.so, hl: L.st.hl };
    if (L.age === 30) { n30 = { ...L.pers.z }; const w = E.persWords(E.shownZ(L), 2).length; words += w; wn++; }
    if (L.age === 32 && n30) { const t = tier(n30.e); single32[t][0]++; if (!L.fam.married && !L.flags.divorced && !L.flags.widowed) single32[t][1]++; }
  }
  for (const a of keep) if (rec[a]) at[a].push({ id: i, ...rec[a] });
  if (n30 && L.age >= 60) { const t = tier(n30.n - n30.a - n30.c); div[t][0]++; if (L.flags.divorced) div[t][1]++; }
}
const pair = (a, b, x) => { const A = new Map(at[a].map(r => [r.id, r])); const xs = [], ys = []; for (const r of at[b]) { const q = A.get(r.id); if (q) { xs.push(q.z[x]); ys.push(r.z[x]); } } return cor(xs, ys); };
const out = {};
out['30岁 均值±标准差'] = Object.fromEntries(AX.map(x => [x, mean(at[30].map(r => r.z[x])).toFixed(2) + '±' + sd(at[30].map(r => r.z[x])).toFixed(2)]));
out['相隔1年（30→31）'] = Object.fromEntries(AX.map(x => [x, pair(30, 31, x).toFixed(2)]));
out['相隔10年（30→40）'] = Object.fromEntries(AX.map(x => [x, pair(30, 40, x).toFixed(2)]));
out['童年到成年（8→30）'] = Object.fromEntries(AX.map(x => [x, pair(8, 30, x).toFixed(2)]));
out['相隔30年（30→60）'] = Object.fromEntries(AX.map(x => [x, pair(30, 60, x).toFixed(2)]));
for (const a of [18, 45]) {
  const R = at[a];
  out[a + '岁 和幸福的相关'] = Object.fromEntries(AX.map(x => [x, cor(R.map(r => r.z[x]), R.map(r => r.h)).toFixed(2)]));
  out[a + '岁 和人际的相关'] = Object.fromEntries(AX.map(x => [x, cor(R.map(r => r.z[x]), R.map(r => r.so)).toFixed(2)]));
}
out['30岁时显示几个词（平均）'] = (words / wn).toFixed(2);
const pct = o => Object.fromEntries(Object.entries(o).map(([k, [n, d]]) => [k, `${(100 * d / n).toFixed(1)}%（${n}人）`]));
out['离婚过（活到60岁；按 敏感−随和−认真 分组）'] = pct(div);
out['32岁未婚（按外向分组）'] = pct(single32);
console.log(JSON.stringify(out, null, 1));
