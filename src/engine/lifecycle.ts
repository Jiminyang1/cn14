// 一生的推进：出生、每年的安排（事件、抉择、里程碑）、逐步推进、年初年末的结算，以及同一秒出生的同伴。
import type { Life } from './types';

import { CAUSE, DIAG, deathProb, milestone, pickCause } from './mortality';
import { CROSS_PROV, LABOR_OUT, NATION, PROVS, REGION_OF } from './data';
import { DEC, dueDecisions } from './content/decisions';
import { EVENTS, EVMAP } from './content/events';
import { FOCUS, applyFocus, autoFocus, focusList } from './focus';
import { JOBS, RESID_PENSION, isWorking, mainJob, retire, retireAge } from './career';
import { S, setS } from './state';
import { SIB, UR, boyOf, family, newSib, olderSibSexes, planNextSib } from './family';
import { addDoc, log, out } from './journal';
import { carer, famHouseInit, famWealthInit, familyIncomeInit, makeParent, setParentJob } from './parents';
import { chance, clamp, gauss, ri, rnd, wpick } from './rng';
import { cityLoc, migrantCity, moveTo, placeInc, placeName } from './place';
import { die, illYear } from './health';
import { drift, eff } from './stats';
import { finances } from './finance';
import { loveQueue, loveYear } from './romance';
import { makeName } from './names';

// ===== 出生 =====
export function birth(seed, opts: { year?: number; headless?: boolean } = {}) {
  setS(<Life>{
    v: 1, seed, rs: seed | 0, age: 0, t: 0, birthYear: opts.year || 2026, birthMonth: 1,
    st: {}, flags: {}, done: {}, recent: [], log: [], years: [], queue: [], fT: {}, notes: [], places: [], jobs: [],
    stats: { maxMoney: 0 }, phase: 'life', money: 0, income: 0, job: null, jobY: 0, wageK: 1,
    school: null, schoolEnd: null, edu: 0, house: null, focus: null, pending: null, headless: !!opts.headless,
  });
  S.birthMonth = ri(1, 12);
  const p = wpick(PROVS.map(x => [x, x.b]));
  S.born = p.id;
  S.rural = !chance(p.u / 100);
  S.order = wpick([[1, NATION.order[0]], [2, NATION.order[1]], [3, NATION.order[2]]]); // 你是第几个孩子（孩次结构，国家统计局）
  S.sex = boyOf(S.order) ? 'M' : 'F'; // 分孩次出生性别比
  let eth = '汉族', r = rnd();
  for (const [e, sh] of p.eth) { if (r < sh) { eth = e; break; } r -= sh; }
  S.eth = eth;
  const L = cityLoc(p.id);
  if (S.rural) L.kind = 'rural';
  S.loc = L; S.home = { ...L }; S.places = [L.city];
  const nm = makeName(S.sex, eth);
  S.name = nm.full; S.surname = nm.sur;

  // 父母：和你本人同一套「学历 → 职业 → 工资」逻辑生成；家境由他们的收入反推（js/parents.js）
  // 哥哥姐姐：相邻两个孩子差几岁随机抽；妈妈生第一个孩子时至少 20 岁
  const gaps = []; for (let i = 1; i < S.order; i++) gaps.push(Math.max(1, Math.round(gauss(...SIB.gap[i]))));
  const span = gaps.reduce((a, b) => a + b, 0);
  const momAge = Math.round(clamp(Math.max(gauss(...SIB.momAge[UR()][S.order]), span + 20 + Math.max(0, gauss(1, 2))), 19, 45));
  S.fam = {
    mom: makeParent('F', momAge, S.rural, p.id),
    dad: makeParent('M', Math.round(clamp(momAge + gauss(2.5, 2.5), 20, 55)), S.rural, p.id),
    sibs: [], partner: null, married: false, kids: [], dating: null,
  };
  S.indep = false;
  S.famMoney = 0; // 出生后在 planYear 之前设置
  S.flags.solo = chance(S.sex === 'M' ? 0.045 : 0.015); // 有些人一辈子没有结婚（2020年普查45–49岁未婚：男4.4%、女1.3%）
  const sexes = olderSibSexes(S.order - 1);
  let age = span;
  for (let i = 0; i < S.order - 1; i++) { S.fam.sibs.push({ rel: sexes[i] === 'M' ? '哥哥' : '姐姐', sex: sexes[i], age }); age -= gaps[i]; }
  planNextSib();

  // 留守 / 随迁
  // 夫妻常常一起外出打工
  if (S.fam.dad.jk === 'migrant' && S.rural && S.fam.mom.jk !== 'migrant' && chance(0.6)) setParentJob(S.fam.mom, 'migrant');
  const dm = S.fam.dad.jk === 'migrant', mm = S.fam.mom.jk === 'migrant';
  // 2024 年义务教育阶段：随迁子女 1309 万（外省迁入 47%、本省外县 53%），农村留守儿童 858 万（统计年鉴 21-12）
  if (dm && mm) {
    // 随迁子女里外省迁入占 47%，高于外出农民工整体的跨省比例 38.3%；按地区比例同步放大
    if (chance(0.6)) { S.flags.mig = 1; moveTo(migrantCity(chance(Math.min(0.9, CROSS_PROV[REGION_OF[p.id] || 'west'] * 0.47 / 0.383)))); }
    else { S.flags.lb = 'both'; S.flags.carer = chance(0.7) ? '奶奶' : '外婆'; }
  } else if ((dm || mm) && LABOR_OUT.has(p.id)) S.flags.lb = 'one';

  S.st = {
    hl: clamp(gauss(76, 7) - (S.rural ? 2 : 0), 30, 98),
    h: clamp(gauss(62, 6), 30, 90),
    kn: clamp(gauss(48, 10), 10, 90), // 家境的影响在建档后补上
    so: clamp(gauss(55, 7), 25, 85),
  };
  familyIncomeInit(); // 家境由父母收入决定
  S.st.kn = clamp(S.st.kn + (S.q - 3) * 3 + (Math.max(S.fam.mom.edu, S.fam.dad.edu) - 4) * 1.5, 10, 90); // 家境、父母学历
  famHouseInit();
  famWealthInit(); // 家里原有的积蓄和欠款
  log(birthText(), 'birth');
  addDoc('birth', '出生登记表', [['姓名', S.name], ['性别', S.sex === 'M' ? '男' : '女'], ['民族', S.eth], ['出生日期', `${S.birthYear}年${S.birthMonth}月`], ['出生地', placeName()], ['户籍', S.rural ? '农村' : '城镇']]);
  planYear();
  return S;
}
export function birthText() {
  const f = S.fam;
  const order = S.order === 1 ? '你是家里第一个孩子' : `你上面有${f.sibs.map(s => s.rel).join('和')}`;
  const where = S.flags.mig ? `出生在${placeName()}。你的户口在${placeName(S.home)}，爸妈在这里打工` : `出生在${placeName()}`;
  return `${S.birthYear}年${S.birthMonth}月，你${where}，是个${S.sex === 'M' ? '男孩' : '女孩'}。${order}。`;
}

// ===== 年度计划 =====
export const MILESTONES = [1, 5, 15, 30, 50, 65, 80, 90, 100];
export const REFLECT = {
  15: '这个孩子15岁了。你15岁的时候，在为什么事情烦恼？',
  30: '30岁的这个人，和30岁的你（或将来的你），过的日子像吗？',
  50: '如果能回到某一年重新选一次，这个人会选哪一年？你呢？',
  70: '这一生里，哪些是这个人自己选的，哪些是出生那一刻就决定了的？',
};
export function planYear() {
  yearStart();
  if (S.phase !== 'life') return;
  S.queue = []; S.fT = {};
  const n = S.age < 6 ? 2 : 3, used = new Set();
  for (let i = 0; i < n; i++) {
    const id = chooseEvent(used);
    if (id) { used.add(id); S.queue.push({ at: 0.1 + (i + rnd() * 0.8) / n * 0.8, type: 'ev', id }); }
  }
  dueDecisions().slice(0, 2).forEach((id, i) => S.queue.push({ at: 0.3 + i * 0.3 + rnd() * 0.1, type: 'dec', id }));
  loveQueue();
  if (MILESTONES.includes(S.age)) S.queue.push({ at: 0.02, type: 'ms' });
  if (!S.headless && REFLECT[S.age]) S.queue.push({ at: 0.92, type: 'ref' });
  S.queue.sort((a, b) => a.at - b.at);
  if (S.focus && !(FOCUS[S.focus] && FOCUS[S.focus].ok())) S.focus = null;
  if (!S.focus && focusList().length) S.focus = autoFocus();
}
// 「平静的一段时间」：给低权重事件一个参照，避免总有事情发生
export const QUIET_W = a => a < 18 ? 1.5 : 5;
export function chooseEvent(used) {
  const w: [string | null, number][] = [[null, QUIET_W(S.age)]];
  for (const ev of EVENTS) {
    if (S.age < ev.a[0] || S.age > ev.a[1] || used.has(ev.id)) continue;
    if (ev.once && S.done[ev.id] != null) continue;
    if (ev.gap && S.done[ev.id] != null && S.age - S.done[ev.id] < ev.gap) continue;
    if (ev.c && !ev.c()) continue;
    let wt = typeof ev.w === 'function' ? ev.w() : (ev.w == null ? 1 : ev.w);
    if (S.recent.includes(ev.id)) wt *= 0.1;
    if (wt > 0) w.push([ev.id, wt]);
  }
  return wpick(w);
}

// ===== 推进 =====
export function tick(dtYears) {
  if (!S || S.phase !== 'life' || S.pending) return;
  const nt = S.t + dtYears;
  while (S.queue.length && S.queue[0].at <= nt) {
    const e = S.queue.shift();
    S.t = e.at;
    fire(e);
    if (S.pending || S.phase !== 'life') return;
  }
  S.t = Math.min(nt, 1);
  if (S.focus) S.fT[S.focus] = (S.fT[S.focus] || 0) + dtYears;
  if (S.t >= 1) endYear();
}
export function fire(e) {
  if (e.type === 'ev') {
    const ev = EVMAP[e.id];
    if (!ev || (ev.c && !ev.c())) return;
    S.done[ev.id] = S.age;
    S.recent = [ev.id, ...S.recent].slice(0, 8);
    out(ev.run());
  } else if (e.type === 'dec') openDec(e.id);
  else if (e.type === 'ms') milestone();
  else if (e.type === 'ref') S.pending = { type: 'ref', q: REFLECT[S.age] };
}
export function openDec(id) {
  const D = DEC[id]; if (!D) return;
  const d = D.build(); if (!d) return;
  S.done['dec_' + id] = S.age;
  if (S.headless) { resolveDec(id, d, autoPick(d)); return; }
  S.pending = { type: 'dec', id, d };
}
export function autoPick(d) { return wpick(d.choices.filter(c => !c.off).map(c => [c.k, c.w == null ? 1 : c.w])); }
export function resolveDec(id, d, k) {
  const c = d.choices.find(x => x.k === k) || { label: k.startsWith('apply:') ? '填报志愿：' + JSON.parse(k.slice(6)).apps.map(a => d.ctx.cands[a.i].name).join('、') : k };
  S.pending = null;
  log(`${d.title} —— ${c.label}`, 'choice');
  out(DEC[id].apply(k, d.ctx || {}));
}
export function runHeadlessYear() {
  while (S.phase === 'life' && S.queue.length) fire(S.queue.shift());
  if (S.phase === 'life') endYear();
}

// ===== 年初：入学、退休、孩子长大 =====
export function yearStart() {
  const a = S.age, f = S.fam;
  if (S.flags.nextSib === a && f.mom.alive) newSib();
  if (a === 3) {
    if (chance(S.loc.kind === 'rural' ? 0.85 : 0.96)) log(S.loc.kind === 'rural' ? '上了镇上的幼儿园，每天坐校车来回。' : '上幼儿园了。第一天你抱着门框哭，第二天就交到了朋友。', 'ev');
    else log(`没有上幼儿园，每天跟着${carer()}在家附近转。`, 'ev');
  }
  if (a === 6) { S.school = '小学'; S.schoolEnd = 12; log(S.loc.kind === 'rural' ? '背上新书包，走半个小时的山路去村里的小学。' : '上小学了。开学第一天，门口挤满了拍照的家长。', 'ev'); }
  if (a === 12 && S.school === '小学') { S.school = '初中'; S.schoolEnd = 15; S.edu = 1; log(S.loc.kind === 'rural' ? '小学毕业，去镇上读初中。' : '小学毕业，上了初中。', 'ev'); }
  if (isWorking() && a >= retireAge()) retire();
  if (S.job === 'farmer' && a >= 72 && !S.flags.farmStop) { S.flags.farmStop = 1; S.job = 'retired'; S.pension = RESID_PENSION; log('年纪大了，地种不动了，交给了亲戚。', 'ev'); }
  for (const k of f.kids) {
    if (!k.alive) continue;
    k.age = a - k.bornAt;
    if (k.age === 6) log(`${k.name}上小学了。`, 'ev');
    if (k.age === 18) {
      const t = wpick([['考上了一所不错的本科', 0.25 + S.q * 0.06 + (S.edu >= 6 ? 0.2 : 0)], ['考上了大专', 0.5], ['没有继续读书，出去工作了', 0.25 - S.q * 0.03]]);
      k.path = t; log(`${k.name}参加了高考，${t}。`, 'ev');
    }
    if (k.age >= 23 && k.age <= 38 && !k.married && chance(0.11)) { k.married = 1; log(`${k.name}结婚了。`, 'good'); eff({ h: 4, money: -placeInc() * 0.3 }); }
    if (k.married && (k.gk || 0) < 2 && k.age <= 42 && chance(0.12)) { k.gk = (k.gk || 0) + 1; S.flags.grandkids = (S.flags.grandkids || 0) + 1; log(`你当上了${S.sex === 'M' ? '爷爷' : '奶奶'}（或${S.sex === 'M' ? '外公' : '外婆'}）。${k.name}的孩子出生了。`, 'good'); eff({ h: 6, so: 4 }); }
  }
}

// ===== 年末结算 =====
export function endYear() {
  const a = S.age, st = S.st;
  applyFocus();
  if (a >= 68 && st.kn > 25) st.kn -= 0.3;
  if (isWorking()) { const J = JOBS[S.job]; st.hl = clamp(st.hl + (J.hl || 0) * 0.5, 0, 100); st.h = clamp(st.h + (J.h || 0) * 0.5, 0, 100); }
  finances();
  family();
  loveYear();
  if (S.phase !== 'life') return;
  drift();
  S.years.push({ a, h: Math.round(st.h), hl: Math.round(st.hl), m: Math.round(S.money), s: statusLabel() });
  if (S.flags.ill && S.flags.ill.treat) { if (illYear()) return; }
  else if (!S.flags.ill && chance(deathProb())) {
    const k = pickCause();
    if (['cancer', 'heart', 'stroke', 'liver', 'resp'].includes(k) && a >= 35 && chance(0.55)) {
      S.flags.ill = { k, at: a };
      addDoc('ill', '诊断书', [['诊断', CAUSE[k]], ['日期', `${S.birthYear + a}年`]]);
      log(DIAG[k], 'bad');
    } else { die(k); return; }
  } else if (S.flags.ill && !S.flags.ill.treat && a > S.flags.ill.at + 1) { die(S.flags.ill.k); return; }
  S.age++; S.t = 0;
  if (S.age >= 110) { die('old'); return; }
  planYear();
}
export function statusLabel() {
  if (S.age < 3) return '婴儿';
  if (S.age < 6) return '幼儿';
  if (S.school) return `读${S.school}`;
  if (S.job) return S.job === 'retired' ? '退休' : `${JOBS[S.job].n} · ${S.loc.city}`;
  return '';
}

// ===== 同一秒出生的人 =====
export function runCompanion(seed) {
  const keep = S;
  try {
    birth(seed, { headless: true });
    const c = S;
    const tr = [];
    let guard = 0;
    while (c.phase === 'life' && guard++ < 130) { tr[c.age] = statusLabel(); runHeadlessYear(); }
    return summarizeCompanion(c, tr);
  } finally {
    setS(keep);
  }
}
function summarizeCompanion(c, tr) {
  return {
    name: c.name, sex: c.sex, eth: c.eth, born: c.born, place: placeName(c.home), rural: c.rural, q: c.q,
    death: c.death, edu: c.edu, job: mainJob(c), married: c.fam.married, kids: c.fam.kids.length, places: c.places, tr,
  };
}
export function newLife(seed) {
  birth(seed);
  const me = S;
  me.comps = [1, 2, 3, 4].map(i => runCompanion((seed * 31 + i * 7919) | 0));
  setS(me);
  return me;
}
