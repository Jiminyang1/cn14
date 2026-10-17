// 校准：money（你自己的钱）。运行：npm run calib -- money [N]
// · 36 岁存款中位数（目标约 29 万，见 DATA.md「模拟结果与目标的对照」），按出生城乡分
// · 22–59 岁在职者的税前工资（wageRate，不含个体户、销售的年度波动）：城镇单位工作（有单位交职工社保的）对照统计局 2025 年城镇单位平均工资
//   （非私营 129,441 元、私营 71,590 元，research/income.json）；各职业的平均税前、到手和税负
// · 储蓄率：22–59 岁在职者按 finance.ts 的公式算出的储蓄率，按家庭到手收入加权（参考：全国居民储蓄率约 32%）。不含「开销不低于当地最低生活」的下限
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { JOBS, birth, runHeadlessYear, wageRate } from './lib';
const N = +process.argv[3] || 3000;

const result = (() => {
  const m36 = { all: [], urban: [], rural: [] }, job = {}, grp = { stable: [0, 0], unit: [0, 0], all: [0, 0] };
  let errs = 0, srN = 0, srD = 0;
  for (let i = 0; i < N; i++) {
    try {
      birth(1000 + i * 7, { headless: true }); const L = E.S, rural = L.rural; let g = 0;
      while (L.phase === 'life' && g++ < 70 && L.age < 60) {
        runHeadlessYear(); if (L.phase !== 'life') break;
        if (L.age === 36) { m36.all.push(L.money); m36[rural ? 'rural' : 'urban'].push(L.money); }
        const J = JOBS[L.job];
        if (L.age >= 22 && L.age < 60 && J && J.m > 0) {
          const w = wageRate(), n = E.myPay ? E.myPay(w).net : w;
          const x = job[J.n] || (job[J.n] = { n: 0, w: 0, net: 0 }); x.n++; x.w += w; x.net += n;
          const unit = E.unitInsured ? E.unitInsured(L.job) : !E.RESID_PENSION_JOBS.has(L.job) && L.job !== 'boss';
          grp.all[0]++; grp.all[1] += w;
          if (unit && L.loc.kind !== 'rural') { grp.unit[0]++; grp.unit[1] += w; }
          if (J.stable) { grp.stable[0]++; grp.stable[1] += w; }
          const mate = L.fam.married && L.fam.partner && L.fam.partner.alive ? L.fam.partner : null;
          const hh = E.myPay ? (L.net || 0) + (mate ? E.matePay(mate, L.income).net : 0) : L.income * (1 - (L.hpfOn ? L.hpfRate : 0)) + (mate ? mate.inc : 0);
          if (hh > 0) { srN += hh * E.clamp(E.SAVE_BASE + 0.15 * Math.log(hh / (mate ? 2 : 1) / E.placeInc()), -0.2, 0.55); srD += hh; }
        }
      }
    } catch (e) { errs++; if (errs < 4) console.log('ERR', e.stack.split('\n').slice(0, 3).join(' | ')); }
  }
  const med = a => { a = a.slice().sort((x, y) => x - y); return Math.round(a[Math.floor(a.length / 2)] / 100) * 100; };
  const avg = ([n, s]) => Math.round(s / n);
  const jobs = Object.fromEntries(Object.entries(job).sort((a, b) => b[1].n - a[1].n).map(([k, x]) => [k, `税前 ${Math.round(x.w / x.n)}  到手 ${Math.round(x.net / x.n)}（${(x.net / x.w * 100).toFixed(0)}%）  ${x.n} 人年`]));
  return { errs, money36: { all: med(m36.all), urban: med(m36.urban), rural: med(m36.rural) }, wage: { 在职全部: avg(grp.all), 城镇单位工作: avg(grp.unit), 机关事业单位: avg(grp.stable) }, 储蓄率: (srN / srD * 100).toFixed(1) + '%', jobs };
})();
console.log(JSON.stringify(result, null, 1));
