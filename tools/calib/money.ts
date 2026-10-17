// 校准：money（一生的存款）。运行：npm run calib -- money [N]
// 各年龄存款的分布（活着的人）、离世时的存款、一生中存款超过 1000 万的比例和来源、欠款、个人工资系数、退休时的公积金。
// 税前和到手（tax.ts）：22–59 岁在职者的税前工资（wageRate，不含个体户、销售的年度波动），城镇单位工作（有单位交职工社保的）对照统计局 2025 年
// 城镇单位平均工资（非私营 129,441 元、私营 71,590 元，research/income.json）；各职业的平均税前、到手；储蓄率公式算出的储蓄率，
// 按家庭到手收入加权（参考：全国居民储蓄率约 32%；不含「开销不低于当地最低生活」的下限）。
// 模拟里在六个大城市（北京、上海、深圳、广州、杭州、成都）工作的人远多于现实（城镇单位工作约 45%，现实约 15%，估计），
// 所以另算一个「按现实的大城市比例重新加权」的平均：大城市 15%、其余 85%（各职业同样；程序员集中在大城市，按一半算，估计）。
// 起薪：第一份工作干满一年那个生日的税前月薪（约相当于麦可思「毕业半年后」）；年龄段：城镇单位工作的税前月薪
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
const pay = {}, grp = { stable: [0, 0], unit: [0, 0], all: [0, 0] }; let srN = 0, srD = 0;
// 按是不是在大城市分两格累计，算重新加权的平均：[其他 n, 其他 和, 大城市 n, 大城市 和]
const BIGW = 0.15, BIGJ = { 互联网公司程序员: 0.5 }, cell = {}, two = (k, big, v) => { const c = cell[k] || (cell[k] = [0, 0, 0, 0]); c[big ? 2 : 0]++; c[big ? 3 : 1] += v; };
const rew = k => { const c = cell[k], w = BIGJ[k] ?? BIGW; if (!c) return NaN; if (!c[2]) return c[1] / c[0]; if (!c[0]) return c[3] / c[2]; return (1 - w) * c[1] / c[0] + w * c[3] / c[2]; };
// 每年生日那一刻记一次：税前、到手、储蓄率
function payYear(L) {
  const J = E.JOBS[L.job];
  if (!(L.age >= 22 && L.age < 60 && J && J.m > 0)) return;
  const w = E.wageRate(), net = E.myPay(w).net;
  const x = pay[J.n] || (pay[J.n] = { n: 0, w: 0, net: 0 }); x.n++; x.w += w; x.net += net;
  const big = L.loc.kind === 'big';
  grp.all[0]++; grp.all[1] += w; two(J.n, big, w); two('all', big, w);
  if (E.unitInsured(L.job) && L.loc.kind !== 'rural') { grp.unit[0]++; grp.unit[1] += w; two('unit', big, w); two('age' + Math.floor(Math.min(L.age, 59) / 5) * 5, big, w / 12); }
  if (J.stable) { grp.stable[0]++; grp.stable[1] += w; two('stable', big, w); }
  const mate = L.fam.married && L.fam.partner && L.fam.partner.alive ? L.fam.partner : null;
  const hh = (L.net || 0) + (mate ? E.matePay(mate, L.income).net : 0);
  if (hh > 0) { srN += hh * E.clamp(E.SAVE_BASE + 0.15 * Math.log(hh / (mate ? 2 : 1) / E.placeInc()), -0.2, 0.55); srD += hh; }
}
for (let i = 0; i < N; i++) {
  try {
    birth(5000 + i * 11, { headless: true });
    const L = E.S; let g = 0, minM = 0, retHpf = null, first = false;
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
      payYear(L);
      // 第一份工作干满一年：税前月薪，按学历
      if (!first && L.age <= 30 && E.isWorking() && L.jobY === 1) { first = true; two('start' + Math.max(4, Math.min(7, L.edu)), L.loc.kind === 'big', E.wageRate() / 12); }
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
const avg = ([k, t]) => Math.round(t / k);
console.log(`税前工资（22–59 岁在职）：全部 ${avg(grp.all)}，城镇单位工作 ${avg(grp.unit)}（统计局 2025：非私营 129,441、私营 71,590），机关事业单位 ${avg(grp.stable)}`);
const r = k => Math.round(rew(k));
console.log(`按现实的大城市比例（15%）重新加权：全部 ${r('all')}，城镇单位工作 ${r('unit')}（统计局按就业人数加权约 94,000，见 DATA.md「工资」），机关事业单位 ${r('stable')}；各职业 ` + Object.keys(pay).sort((a, b) => pay[b].n - pay[a].n).map(k => `${k} ${r(k)}`).join('，'));
console.log(`起薪（第一份工作满一年时的税前月薪，重新加权）：高中及以下 ${r('start4')}，大专 ${r('start5')}，本科 ${r('start6')}，硕士 ${r('start7')}（麦可思 2025 届毕业半年后：本科 6,435、高职 4,882）`);
console.log('城镇单位工作的税前月薪（重新加权）：' + [20, 25, 30, 35, 40, 45, 50, 55].map(a => `${a === 20 ? 22 : a}–${a + 4}岁 ${r('age' + a)}`).join('，'));
console.log('各职业 税前 / 到手：' + Object.entries(pay).sort((a, b) => b[1].n - a[1].n).map(([k, x]) => `${k} ${Math.round(x.w / x.n)} / ${Math.round(x.net / x.n)}（${(x.net / x.w * 100).toFixed(0)}%）`).join('，'));
console.log(`储蓄率（公式，按家庭到手收入加权）：${(srN / srD * 100).toFixed(1)}%（全国居民储蓄率约 32%）`);
