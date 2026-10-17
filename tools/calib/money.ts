// 校准：money（一生的存款）。运行：npm run calib -- money [N]
// 各年龄存款的分布（活着的人）、离世时的存款、一生中存款超过 1000 万的比例和来源、欠款、个人工资系数、退休时的公积金。
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
import { birth, mainJob, runHeadlessYear } from './lib';
const N = +process.argv[3] || 3000;
const AGES = [25, 30, 36, 40, 50, 60, 65, 70, 80, 90];

const q = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const w = x => Number.isFinite(x) ? (x / 1e4).toFixed(1) + '万' : '-';
const at = {}, atU = {}, atR = {}, wk = { 30: [], 50: [] }, death = [], deathAge = [];
let rich = 0, richInh = 0, deep = 0, debtEnd = 0, hpfLeft = 0, retired = 0, errs = 0, inhN = 0;
const richJob = {}, jobN = {}, t0 = Date.now();
for (let i = 0; i < N; i++) {
  try {
    birth(5000 + i * 11, { headless: true });
    const L = E.S; let g = 0, minM = 0, retHpf = null;
    while (L.phase === 'life' && g++ < 130) {
      const wasRet = L.job === 'retired';
      runHeadlessYear();
      if (L.phase !== 'life') break;
      if (!wasRet && L.job === 'retired') { retired++; retHpf = L.hpf || 0; }
      if (L.money < minM) minM = L.money;
      if (AGES.includes(L.age)) {
        (at[L.age] = at[L.age] || []).push(L.money);
        const o = L.rural ? atR : atU; (o[L.age] = o[L.age] || []).push(L.money);
      }
      if (wk[L.age] && E.isWorking()) wk[L.age].push(L.wageK);
    }
    death.push(L.money); deathAge.push(L.death.age);
    if (retHpf > 1000) hpfLeft++;
    if (L.money < 0) debtEnd++;
    if (minM < -10 * E.placeInc(L.loc)) deep++;
    if (L.stats.inherit) inhN++;
    const mj = mainJob(L) || '(无)'; jobN[mj] = (jobN[mj] || 0) + 1;
    if (L.stats.maxMoney > 1e7) { rich++; richJob[mj] = (richJob[mj] || 0) + 1; if ((L.stats.inherit || 0) > 3e6) richInh++; }
  } catch (e) { errs++; if (errs < 4) console.log('ERR', e.stack.split('\n').slice(0, 3).join(' | ')); }
}
const n = death.length;
console.log(`${n} 个人生，报错 ${errs}，耗时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒；平均寿命 ${(deathAge.reduce((a, b) => a + b, 0) / n).toFixed(1)}`);
console.log('年龄  人数   p25      中位数    p75      p90      p99     （城镇中位 / 农村中位）');
for (const a of AGES) { const x = at[a] || []; console.log(`${a}岁  ${String(x.length).padStart(5)}  ${[0.25, 0.5, 0.75, 0.9, 0.99].map(p => w(q(x, p)).padStart(8)).join(' ')}   ${w(q(atU[a] || [], 0.5))} / ${w(q(atR[a] || [], 0.5))}`); }
console.log(`离世时存款：中位 ${w(q(death, 0.5))}，p90 ${w(q(death, 0.9))}，p99 ${w(q(death, 0.99))}；离世时欠款 ${(debtEnd / n * 100).toFixed(1)}%`);
console.log(`一生中存款超过 1000 万：${(rich / n * 100).toFixed(2)}%（其中继承超过 300 万的 ${richInh}）；一生中欠款超过当地 10 年收入：${(deep / n * 100).toFixed(2)}%；继承过遗产 ${(inhN / n * 100).toFixed(0)}%`);
console.log('千万的人主要职业：' + Object.entries(richJob).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}（占该职业 ${(v / jobN[k] * 100).toFixed(1)}%）`).join('，'));
console.log(`个人工资系数（在职）中位数：30 岁 ${q(wk[30], 0.5)?.toFixed(2)}，50 岁 ${q(wk[50], 0.5)?.toFixed(2)}，50 岁 p90 ${q(wk[50], 0.9)?.toFixed(2)}`);
console.log(`退休那年公积金还有余额（年底）：${(hpfLeft / Math.max(1, retired) * 100).toFixed(0)}% 的退休者`);
