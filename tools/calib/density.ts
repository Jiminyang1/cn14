// 校准：density。每个年龄段每年有几件事、几个抉择、几条日常，有几成年份一件事都没有。运行：npm run calib -- density [N]
// 用有界面的人生（含日常、自动抉择）
import * as E from './lib';
const N = +process.argv[3] || 300;
const bands = [[0, 5], [6, 14], [15, 22], [23, 35], [36, 59], [60, 79], [80, 120]];
const agg = bands.map(() => ({ years: 0, ev: 0, choice: 0, day: 0, empty: 0 }));
const perEvent: Record<string, number> = {}, perDec: Record<string, number> = {};
let lifeYears = 0;
for (let i = 0; i < N; i++) {
  E.newLife((31337 + i * 104729) | 0);
  const L = E.S;
  for (let g = 0; L.phase === 'life' && g < 80000; g++) {
    const P = L.pending;
    if (P && P.type === 'dec') { perDec[P.id] = (perDec[P.id] || 0) + 1; E.resolveDec(P.id, P.d, E.autoPick(P.d)); } else if (P) L.pending = null; else E.tick(0.37);
  }
  lifeYears += L.age + 1;
  for (const id in L.done) if (!id.startsWith('dec_')) perEvent[id] = (perEvent[id] || 0) + 1;
  const byAge: Record<number, string[]> = {};
  for (const e of L.log) (byAge[e.a] ||= []).push(e.k);
  for (let a = 0; a < L.age; a++) {
    const b = bands.findIndex(([lo, hi]) => a >= lo && a <= hi), x = agg[b], ks = byAge[a] || [];
    x.years++;
    const ev = ks.filter(k => ['ev', 'good', 'bad', 'loss'].includes(k)).length, ch = ks.filter(k => k === 'choice').length, d = ks.filter(k => k === 'day').length;
    x.ev += ev; x.choice += ch; x.day += d; if (ev + ch + d === 0) x.empty++;
  }
}
const f = (v: number, n: number) => (v / n).toFixed(2);
const out = { perYear: Object.fromEntries(bands.map(([lo, hi], i) => [`${lo}-${hi}`, { 事件: f(agg[i].ev, agg[i].years), 抉择: f(agg[i].choice, agg[i].years), 日常: f(agg[i].day, agg[i].years), 空白年份: (agg[i].empty / agg[i].years * 100).toFixed(0) + '%' }])),
  // 每 100 人年里每种抉择弹出几次（S.done 只记最后一次，抉择用弹出次数）
  decisionsPer100PersonYears: Object.fromEntries(Object.entries(perDec).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / lifeYears * 100).toFixed(2)])) };
console.log(JSON.stringify(out, null, 1));
