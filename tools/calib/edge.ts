// 边界检查：edge。运行：npm run calib -- edge [每种策略的局数]
// 用几种极端的玩法（总选第一个 / 最后一个 / 随机选项，固定某个重心）跑完整的一生（和真实游玩一样逐个弹出抉择），
// 每年检查一遍不该出现的状态，最后列出每种问题出现了几局、举一个例子（种子和年龄），以及各玩法的结果对比。
// @ts-nocheck —— 统计用的一次性脚本，不做类型检查
import * as E from './lib';
const N = +process.argv[3] || 500;

const DEC_POL = {
  auto: d => E.autoPick(d),
  first: d => d.choices.find(c => !c.off).k,
  last: d => [...d.choices].reverse().find(c => !c.off).k,
  random: d => { const c = d.choices.filter(c => !c.off); return c[Math.floor(Math.random() * c.length)].k; },
};
const FOCUS_POL = {
  auto: null,
  study_work: ['study', 'work', 'rest'],
  rest: ['rest', 'sport', 'play'],
  play: ['play', 'hobby'],
  love: ['love', 'friends', 'play'],
  family: ['family', 'friends', 'play'],
};

const BAD_TEXT = /undefined|NaN|null|Infinity|\[object/;
const issues = {};
let POL = '';
function flag(kind, L, extra = '') {
  kind = `[${POL}] ${kind}`;
  const x = issues[kind] || (issues[kind] = { n: 0, lives: new Set(), ex: '' });
  x.n++;
  if (!x.lives.has(L.seed) && !x.ex) x.ex = `seed ${L.seed} ${L.age}岁 ${extra}`.slice(0, 200);
  x.lives.add(L.seed);
}
const fin = v => v == null || Number.isFinite(v);

function checkYear(L, st) {
  const nums = { money: L.money, famMoney: L.famMoney, famDebt: L.famDebt, hpf: L.hpf, income: L.income, pension: L.pension, wageK: L.wageK, ...L.st };
  for (const k in nums) if (!fin(nums[k])) flag('数值不是有限数：' + k, L, String(nums[k]));
  for (const k of ['hl', 'h', 'kn', 'so']) if (L.st[k] < 0 || L.st[k] > 100) flag('状态越界：' + k, L, L.st[k]);
  for (const l of L.loans || []) if (!fin(l.bal) || !fin(l.pay) || l.bal < 0) flag('房贷数值异常', L, JSON.stringify(l));
  if ((L.loans || []).some(l => l.bal > 1) && !L.house) flag('有房贷但没有房子', L);
  const working = E.isWorking.call ? (() => { const keep = E.S; return !!(L.job && E.JOBS[L.job] && E.JOBS[L.job].m > 0); })() : false;
  if (working && L.age < 15) flag('15岁以前在工作', L, L.job);
  if (working && L.age >= 75) flag('75岁以后还在工作', L, L.job);
  if (L.job === 'retired' && !L.pension) flag('退休了但没有养老金', L);
  if (L.school && L.schoolEnd != null && L.schoolEnd < L.birthYear + L.age - 1) flag('上学过了毕业年份还没毕业', L, `${L.school} end ${L.schoolEnd}`); // schoolEnd：毕业那年的公历年份（calendar.ts）
  if (L.school && L.age > 32) flag('32岁以后还在上学', L, L.school);
  if (L.job === 'seeking') { st.seekY++; if (st.seekY === 4) flag('连续4年以上待业', L, `civilRetry ${L.flags.civilRetry}`); } else st.seekY = 0;
  if (L.age >= 40 && !L.job && !L.school) flag('40岁以后没有任何职业状态', L);
  if (L.age >= 25 && L.indep === false && !L.school) flag('25岁以后还没有经济独立', L, `job ${L.job} school ${L.school}`);
  const f = L.fam;
  if (f.married && !f.partner) flag('已婚但没有配偶', L);
  if (f.married && f.partner && !f.partner.alive) flag('已婚但配偶已去世', L);
  if (f.dating && f.dating.age < 18) flag('恋爱对象未满18岁', L, f.dating.age);
  if (f.dating && f.married) flag('已婚还在恋爱', L);
  for (const p of [f.mom, f.dad]) if (p.alive && p.age > 112) flag('父母活过112岁', L, p.age);
  if (f.mom.alive && f.mom.age - L.age < 15) flag('妈妈比你大不到15岁', L);
  for (const k of f.kids) {
    if (k.bornAt < 18) flag('18岁前有孩子', L, k.bornAt);
    const wifeAge = L.sex === 'F' ? k.bornAt : f.partner ? f.partner.age - (L.age - k.bornAt) : null;
    if (wifeAge != null && wifeAge > 45 && k.bornAt === L.age) flag('母亲45岁以后生孩子', L, wifeAge);
  }
  const P = E.placeInc(L.loc);
  if (L.money < -20 * P) flag('负债超过当地20年收入', L, `money ${Math.round(L.money)} inc ${Math.round(P)}`);
  if (L.age >= 85 && L.money < -3 * P) flag('85岁以后负债超过3年收入', L, `money ${Math.round(L.money)}`);
  if (L.house && L.loans && L.loans.length && L.age >= 85) flag('85岁以后还在还房贷', L);
  if (L.fam.sibs.some(s => s.age < 0)) flag('兄弟姐妹年龄为负', L);
  if (L.school === '复读') { st.redo++; if (st.redo === 3) flag('复读了3年以上', L); }
  if (L.job === 'seeking' && L.age >= E.retireAgeOf(L.sex, L.flags.lastJob || 'clerk')) flag('到了退休年龄还在待业（没有养老金）', L);
  if (!f.mom.alive && !f.dad.alive && L.age < 18 && !st.orphan) { st.orphan = 1; flag('18岁前父母双亡', L, `famMoney ${Math.round(L.famMoney)}`); }
  if (L.job === 'retired' && !st.retChecked) {
    st.retChecked = 1;
    const yrs = {}; L.jobs.forEach((j, i) => { const end = L.jobs[i + 1] ? L.jobs[i + 1].age : L.age; yrs[j.job] = (yrs[j.job] || 0) + end - j.age; });
    const empY = Object.entries(yrs).filter(([j]) => !E.RESID_PENSION_JOBS.has(j) && E.JOBS[j]?.m > 0).reduce((t, [, y]) => t + y, 0);
    const residNow = L.pension < 10000;
    if (residNow && empY >= 15) flag('交了15年以上职工社保，退休却只领城乡居民养老金', L, `职工岗位${empY}年（引擎记录实际缴费${L.pen ? L.pen.y : 0}年），最后 ${L.jobs[L.jobs.length - 1].job}，养老金 ${Math.round(L.pension)}`);
  }
  if (L.job === 'retired' && !L.house && L.loc.kind !== 'rural' && L.flags.oldLive !== 'kid') st.retRent++;
}

function checkDec(L, id, d) {
  const live = d.choices.filter(c => !c.off);
  if (!live.length) flag('抉择所有选项都不可选：' + id, L);
  const txt = [d.title, d.body, d.fact, ...(d.card || []).flat(), ...d.choices.flatMap(c => [c.label, c.sub])].filter(x => x != null).join('|');
  if (BAD_TEXT.test(txt)) flag('抉择文字里有异常值：' + id, L, txt.match(/.{0,30}(undefined|NaN|null|Infinity|\[object).{0,10}/)?.[0]);
}

function runLife(seed, dp, fp) {
  E.birth(seed);
  const L = E.S;
  L.auto = !fp;
  const st = { seekY: 0, decs: {}, redo: 0, retRent: 0 };
  let guard = 0;
  while (L.phase === 'life' && guard++ < 20000) {
    if (L.t === 0 && fp) { const k = fp.find(k => E.FOCUS[k].ok()); if (k && k !== L.focus) E.setFocus(k); }
    const age = L.age;
    E.tickTo(1);
    if (L.pending && L.pending.type === 'dec') {
      const { id, d } = L.pending;
      checkDec(L, id, d);
      st.decs[id] = (st.decs[id] || 0) + 1;
      let k;
      try { k = DEC_POL[dp](d); } catch (e) { flag('选不出选项：' + id, L); k = d.choices[0].k; }
      const P0 = E.placeInc(L.loc);
      if ((id === 'marry' && k === 'yes' || id === 'baby' && k === 'yes') && L.money < -3 * P0) flag(`负债超过3年收入时${id === 'marry' ? '结婚' : '生孩子'}`, L, `money ${Math.round(L.money)}`);
      E.resolveDec(id, d, k);
      E.tickTo(L.t);
      continue;
    }
    if (L.pending) { L.pending = null; continue; }
    if (L.age !== age || L.phase !== 'life') checkYear(L, st);
  }
  if (guard >= 20000) flag('推进卡住了', L);
  for (const e of L.log) if (BAD_TEXT.test(e.t) || (e.f && BAD_TEXT.test(e.f))) { flag('时间线文字里有异常值', L, e.t.slice(0, 80)); break; }
  for (const doc of L.docs || []) for (const r of doc.rows) if (BAD_TEXT.test(String(r[1]))) { flag('证件里有异常值：' + doc.title, L, r.join(':')); break; }
  const P = E.placeInc(L.loc);
  if (st.retRent >= 10) flag('（信息）退休后在城里租房10年以上', L, `${st.retRent}年 ${L.loc.city}`);
  if (L.flags.widowed != null) flag('（信息）丧偶' + (L.fam.partner && L.fam.partner.alive ? '后再婚' : '后没再婚'), L, `丧偶 ${L.flags.widowed}岁`);
  return { age: L.death.age, maxM: L.stats.maxMoney / P, endM: L.money / P, edu: L.edu, tier: L.flags.tier, kids: L.fam.kids.length, ever: !!(L.fam.partner || L.flags.divorced), jobs: L.jobs.length, house: !!L.house, h: L.years.length ? L.years.reduce((t, y) => t + y.h, 0) / L.years.length : 0, cause: L.death.cause };
}

const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const rows = [];
const combos = [...Object.keys(DEC_POL).map(d => [d, 'auto']), ...Object.keys(FOCUS_POL).filter(f => f !== 'auto').map(f => ['auto', f])];
let errs = 0;
for (const [dp, fpk] of combos) {
  const R = [];
  POL = dp + '/' + fpk;
  for (let i = 0; i < N; i++) {
    const seed = (20000 + i * 7919) | 0;
    try { R.push(runLife(seed, dp, FOCUS_POL[fpk])); }
    catch (e) { errs++; flag('报错：' + String(e.message).slice(0, 60), E.S || { seed, age: '?' }, e.stack.split('\n')[1]); }
  }
  rows.push({
    抉择: dp, 重心: fpk, 寿命: mean(R.map(r => r.age)).toFixed(1), 平均幸福: mean(R.map(r => r.h)).toFixed(1),
    '财富峰值(年收入倍)': med(R.map(r => r.maxM)).toFixed(1), '离世时存款(倍)': med(R.map(r => r.endM)).toFixed(1),
    '离世时负债%': (R.filter(r => r.endM < 0).length / R.length * 100).toFixed(0),
    '本科+%': (R.filter(r => r.edu >= 6).length / R.length * 100).toFixed(0), '985/211%': (R.filter(r => r.tier === 'top' || r.tier === '211').length / R.length * 100).toFixed(1),
    '结过婚%': (R.filter(r => r.ever).length / R.length * 100).toFixed(0), 孩子: mean(R.map(r => r.kids)).toFixed(2), '有房%': (R.filter(r => r.house).length / R.length * 100).toFixed(0), 工作数: mean(R.map(r => r.jobs)).toFixed(1),
  });
}
console.table(rows);
console.log(`\n每种玩法 ${N} 局，报错 ${errs} 次。发现的问题（出现次数 / 涉及局数 / 例子）：`);
for (const [k, x] of Object.entries(issues).sort((a, b) => b[1].lives.size - a[1].lives.size)) console.log(`- ${k}：${x.n} 次 / ${x.lives.size} 局 / ${x.ex}`);
