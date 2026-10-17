// 一生的推进：出生、每年的安排（事件、抉择、里程碑）、逐步推进、年初年末的结算，以及同一秒出生的同伴。
import type { Life } from './types';

import { CAUSE, milestone } from './mortality';
import { CROSS_PROV, LABOR_OUT, NATION, PROVS, REGION_OF } from './data';
import { DEC } from './content/decisions';
import { fireDaily } from './content/daily';
import { EVMAP } from './content/events';
import { focusMonth } from './focus';
import { JOBS, isWorking, mainJob, retire, retireAge } from './career';
import { S, setS } from './state';
import { SIB, UR, boyOf, familyMonth, kidsYearStart, olderSibSexes, planNextSib, sibYearStart } from './family';
import { addDoc, log, out } from './journal';
import { MONTHS, monthStart } from './monthly';
import { planMonth, planYearSchedule, scheduleYearStart } from './schedule';
import { famHouseInit, famWealthInit, familyIncomeInit, makeParent, setParentJob } from './parents';
import { chance, clamp, gauss, ri, rnd, wpick } from './rng';
import { cityLoc, migrantCity, moveTo, placeInc, placeName } from './place';
import { die, healthMonth } from './health';
import { bodyMonth, driftMonth } from './stats';
import { moneyMonth } from './finance';
import { kinYear } from './kin';
import { turnsYear } from './turns';
import { loveMonth } from './romance';
import { makeName } from './names';
import { persInit, persWords, persYear, shape, shownZ, tiltW, whyOf } from './personality';

// ===== 出生 =====
export function birth(seed, opts: { year?: number; headless?: boolean } = {}) {
  setS(<Life>{
    seed, rs: seed | 0, age: 0, t: 0, birthYear: opts.year || 2026, birthMonth: 1,
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
  persInit(); // 性格（只用第三条随机数流）
  if (S.flags.lb === 'both') shape({ n: 0.15, e: -0.05 }); // 父母都外出的留守儿童：敏感一些（方向有研究支持，幅度是估计）
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
// 自述（「写点什么」）：暂时关闭。改成 true 即可恢复，界面部分（ui/Modal.tsx 的 Reflect）保留着
export const ENABLE_REFLECT = false;
export const REFLECT = {
  15: '这个孩子15岁了。你15岁的时候，在为什么事情烦恼？',
  30: '30岁的这个人，和30岁的你（或将来的你），过的日子像吗？',
  50: '如果能回到某一年重新选一次，这个人会选哪一年？你呢？',
  70: '这一生里，哪些是这个人自己选的，哪些是出生那一刻就决定了的？',
};
export function planYear() {
  yearStart();
  if (S.phase !== 'life') return;
  S.month = 0;
  planYearSchedule();
  planMonth(0);
}
// ===== 推进 =====
// 推进 dtYears 年（一年 = 1）。遇到需要玩家决定的抉择就停下。
export const tick = (dtYears: number) => tickTo(Math.min(S.t + dtYears, 1));
// 推进到这一年的进度 t（0–1）。结果只取决于在哪些时刻做了什么（抉择、改重心），与每一步走多远（帧率、倍速）无关，所以可以精确重放。
// 按月推进：每跨过一个月的边界，先触发这个月里排到的事，再做这个月的结算（endMonth）；第 12 个月结算完就是一年的结束
export function tickTo(t: number) {
  if (!S || S.phase !== 'life' || S.pending) return;
  const target = Math.min(t, 1);
  for (;;) {
    const m = S.month, end = monthStart(m + 1), upto = Math.min(target, end);
    while (S.queue.length && S.queue[0].at <= upto) {
      const e = S.queue.shift();
      S.t = e.at;
      fire(e);
      if (S.pending || S.phase !== 'life') return;
    }
    if (target < end) { S.t = Math.max(S.t, target); return; }
    S.t = end;
    endMonth(m);
    if (S.phase !== 'life') return;
    if (m === MONTHS - 1) { endYear(); return; }
    S.month = m + 1;
    planMonth(S.month);
  }
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
  else if (e.type === 'ref' && ENABLE_REFLECT) S.pending = { type: 'ref', q: REFLECT[S.age] };
  else if (e.type === 'day') fireDaily(e.id);
}
export function openDec(id) {
  const D = DEC[id]; if (!D) return;
  const d = D.build(); if (!d) return;
  S.done['dec_' + id] = S.age;
  if (S.headless) { resolveDec(id, d, autoPick(d)); return; }
  S.pending = { type: 'dec', id, d };
}
// 自动抉择：按选项的权重抽，权重再乘上性格的倾向（tilt）。性格把选中的那一项抬高了不少时，记下理由（resolveDec 写在记录下面）
export function autoPick(d) {
  const cs = d.choices.filter(c => !c.off), w0 = cs.map(c => c.w == null ? 1 : c.w), w = cs.map((c, i) => w0[i] * tiltW(c.tilt));
  const k = wpick(cs.map((c, i) => [c.k, w[i]]));
  if (S.pers) {
    const i = cs.findIndex(c => c.k === k), s0 = w0.reduce((a, b) => a + Math.max(0, b), 0), s1 = w.reduce((a, b) => a + Math.max(0, b), 0);
    const t = i >= 0 && s1 > 0 && w0[i] > 0 ? whyOf(cs[i].tilt, (w[i] / s1) / (w0[i] / s0)) : null;
    d.why = t ? { k, t } : undefined;
  }
  return k;
}
export function resolveDec(id, d, k) {
  const c = d.choices.find(x => x.k === k) || { label: k.startsWith('apply:') ? '填报志愿：' + JSON.parse(k.slice(6)).apps.map(a => d.ctx.cands[a.i].name).join('、') : k };
  S.pending = null;
  log(`${d.title} —— ${c.label}`, 'choice', d.why && d.why.k === k ? d.why.t : null);
  out(DEC[id].apply(k, d.ctx || {}));
}
// 无界面的人生（同伴、校准）一次跑完一年：和有界面时一样按月推进、记下每件事发生在什么时候，只是抉择会被自动做掉
export function runHeadlessYear() { tickTo(1); }

// ===== 生日那个月：一年的开始 =====
// 顺序和原来的「年初」一样：弟弟妹妹出生 → 家里的大事 → 返聘、候鸟 → 入学、退休 → 孩子长大
export function yearStart() {
  sibYearStart();
  kinYear();
  turnsYear();
  scheduleYearStart();
  kidsYearStart();
}

// ===== 年末结算 =====
// 每个月月底的结算，各领域的钩子都在自己的文件里。顺序很重要（和原来的年末结算一致）：
// 重心 → 身体 → 钱 → 家人 → 恋爱 → 健康幸福的变化 → 记一笔一生曲线 → 生病和死亡
function endMonth(m: number) {
  focusMonth(m);
  bodyMonth(m);
  moneyMonth(m);
  familyMonth(m);
  loveMonth(m);
  if (S.phase !== 'life') return;
  driftMonth(m);
  if (m === MONTHS - 1) S.years.push({ a: S.age, h: Math.round(S.st.h), hl: Math.round(S.st.hl), m: Math.round(S.money), s: statusLabel() });
  healthMonth(m);
}
// 第 12 个月结算完：长一岁，排下一年
export function endYear() {
  S.age++; S.t = 0;
  if (S.age >= 110) { die('old'); return; }
  persYear();
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
    death: c.death, edu: c.edu, job: mainJob(c), married: c.fam.married || c.flags.widowed != null, kids: c.fam.kids.length, places: c.places, tr,
    pw: c.pers ? persWords(shownZ(c), 2) : undefined,
  };
}
export function newLife(seed) {
  birth(seed);
  const me = S;
  me.comps = [1, 2, 3, 4].map(i => runCompanion((seed * 31 + i * 7919) | 0));
  setS(me);
  return me;
}
