// 校准：evrate。每种随机事件、每种抉择的发生率（每 100 人年几次），按年龄段分开；以及中考、高考、毕业落在公历几月、几岁。
// 用无界面的人生（抉择自动做掉）。运行：npm run calib -- evrate [N]
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { DEC, EVENTS, birth, calMonth, runHeadlessYear } from './lib';
const N = +process.argv[3] || 4000;
const bands = [[0, 5], [6, 14], [15, 22], [23, 35], [36, 59], [60, 79], [80, 120]];
const bandOf = a => bands.findIndex(([lo, hi]) => a >= lo && a <= hi);
const ev = {}, dec = {}, py = bands.map(() => 0), evBand = bands.map(() => 0), decBand = bands.map(() => 0);
const when = {}; // 抉择 → { '公历月': 次数 }、{ '年龄': 次数 }
for (const e of EVENTS) {
  const run = e.run;
  e.run = () => { ev[e.id] = (ev[e.id] || 0) + 1; evBand[bandOf(E.S.age)]++; return run(); };
}
for (const id in DEC) {
  const apply = DEC[id].apply;
  DEC[id].apply = (k, c) => {
    dec[id] = (dec[id] || 0) + 1; decBand[bandOf(E.S.age)]++;
    if (['zhongkao', 'gaokao', 'graduate', 'vocgrad'].includes(id)) {
      const w = (when[id] ||= { m: {}, a: {} });
      w.m[calMonth()] = (w.m[calMonth()] || 0) + 1; w.a[E.S.age] = (w.a[E.S.age] || 0) + 1;
    }
    return apply(k, c);
  };
}
let years = 0;
for (let i = 0; i < N; i++) {
  birth(5000 + i * 7, { headless: true });
  const L = E.S;
  for (let g = 0; L.phase === 'life' && g < 130; g++) { py[bandOf(L.age)]++; years++; runHeadlessYear(); }
}
const per = (x, n) => +(x / n * 100).toFixed(2);
const sorted = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, per(v, years)]));
const pctOf = o => { const n = Object.values(o).reduce((a, b) => a + b, 0); return Object.entries(o).map(([k, v]) => `${k}:${(v / n * 100).toFixed(0)}%`).join(' '); };
console.log(JSON.stringify({
  N, personYears: years,
  perYearByBand: Object.fromEntries(bands.map(([lo, hi], i) => [`${lo}-${hi}`, { 事件: (evBand[i] / py[i]).toFixed(3), 抉择: (decBand[i] / py[i]).toFixed(3) }])),
  eventsPer100PY: sorted(ev),
  decisionsPer100PY: sorted(dec),
  schoolWhen: Object.fromEntries(Object.entries(when).map(([id, w]) => [id, { 公历月: pctOf(w.m), 年龄: pctOf(w.a) }])),
}, null, 1));
