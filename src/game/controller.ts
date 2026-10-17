// 游戏控制器：在 React 之外推进模拟（requestAnimationFrame），管理速度、暂停、存档、局日志和页面切换。
// 引擎直接修改当前人生对象 S，所以 React 组件通过 useGame() 订阅一个版本号，版本号变了就重新读 S。
// 会影响模拟结果的操作（抉择、改重心、开关自动抉择）一律先记进局日志，再通过 applyInput 生效，这样每一局都能精确重放。
import { useSyncExternalStore } from 'react';
import { CAUSE, S, autoPick, leOf, lifeLine, lifeTags, newLife, placeName, setS, tick, type Life, type Pending } from '../engine';
import { sink } from './devsink';
import { applyInput } from './replay';
import { newRun, pushEvent, type Input, type RunLog } from './runlog';
import { clearSave, keepRun, loadPast, loadSave, savePast, writeSave } from './storage';

export type Screen = 'home' | 'birth' | 'life' | 'end';
// 节奏：1× 时一年 60 秒，各地一样（活到平均寿命约 70–85 分钟，不算做抉择的时间）。
// 小时候也不自动加快；想快就用倍速和快进
export const YEAR_SEC = 60;
export const yearSecOf = (_L: Life) => YEAR_SEC;
// 活到这个人的预期寿命大约要几分钟（出生登记表上显示）
const lifeMinOf = (L: Life) => Math.round(leOf(L.born, L.sex, L.rural) * YEAR_SEC / 60);
export const SPEEDS = [1, 2, 4, 8, 16];
export type FF = false | 'big' | 'dec';
// 人生大事（journal.ts 的 major）：「下一件大事」停在这里；正常速度下画面在这里停一会儿，让人看清楚（只是界面停，不影响模拟）
const MAJOR_HOLD = 2200; // 毫秒
let holdUntil = 0;
const RENDER_MS = 120;   // 推进中界面最多每 120 毫秒刷新一次
const END_DELAY = 1500;  // 离世后停留在时间线上的时间
export const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const listeners = new Set<() => void>();
let version = 0;
let lastEmit = 0;
function emit() { version++; lastEmit = performance.now(); for (const f of listeners) f(); }
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

// ===== 局日志 =====
let run: RunLog | null = null;
// 随机数只应该在引擎调用里消耗；两次引擎调用之间如果变了，说明界面上有代码动了它（会让重放对不上）
let lastRs: number | null = null;
function engine<T>(what: string, fn: () => T): T {
  if (S && lastRs != null && S.rs !== lastRs) event('warn', { message: `随机数在引擎之外被改动了（${what} 之前）` });
  try { return fn(); } finally { lastRs = S ? S.rs : null; }
}
function event(type: string, data: Record<string, unknown> = {}) {
  if (!run) return;
  sink.event(run.id, pushEvent(run, { type, a: S?.age, t: S?.t, ...data }));
}
// 记下一条输入并让它生效
function input(inp: Input) {
  run.inputs.push(inp);
  sink.event(run.id, { at: new Date().toISOString(), ...inp, type: 'input:' + inp.type });
  engine(inp.type, () => applyInput(inp));
}
const here = () => ({ a: S.age, t: S.t });


export const game = {
  screen: 'home' as Screen,
  pref: { len: 75 },       // 活到平均寿命大约几分钟（出生时按这个人的预期寿命算，出生登记表上显示）
  speed: 1,
  paused: false,
  ff: false as FF,     // 快进：到下一件大事 / 到下一个抉择
  yearSec: 45,         // 一年对应多少秒（出生时按平均寿命算）
  ended: false,        // 已经进入结局流程
  get run() { return run; },

  bornNow() {
    const old = loadSave(); // 没跑完的上一局要被覆盖了：先留一份
    if (old && old.life.phase === 'life') keepRun({ run: { ...old.run, events: [...old.run.events, { at: new Date().toISOString(), type: 'abandoned' }] }, life: old.life });
    const seed = (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) | 0;
    run = newRun(seed, VERSION);
    engine('newLife', () => newLife(seed));
    this.yearSec = yearSecOf(S); this.pref = { len: lifeMinOf(S) };
    this.speed = 1; S.auto = false;
    event('start', { yearSec: this.yearSec, ua: navigator.userAgent });
    this.show('birth');
  },
  startLife() {
    this.ended = false; this.paused = false; this.ff = false;
    this.show('life');
    this.save();
  },
  resume() {
    const sv = loadSave(); if (!sv) return;
    setS(sv.life);
    run = sv.run;
    lastRs = S.rs;
    this.speed = sv.ui.speed; this.yearSec = yearSecOf(S);
    event('resume', { version: VERSION });
    this.startLife();
  },
  quit() { event('quit'); this.save(); this.paused = true; this.show('home'); },
  togglePause() { this.paused = !this.paused; event(this.paused ? 'pause' : 'play'); emit(); },
  setSpeed(v: number) { this.speed = v; event('speed', { v }); emit(); },
  fastForward(to: 'big' | 'dec') { this.ff = to; this.paused = false; event('ff', { to }); emit(); },
  setAuto(on: boolean) { input({ ...here(), type: 'auto', on }); emit(); },
  setFocus(k: string) { input({ ...here(), type: 'focus', k }); emit(); },

  /** 自动抉择要选哪个。抽签会消耗随机数，所以每个弹窗只抽一次，并记成一条输入（和存档一起保存，刷新后不会重抽） */
  autoChoice(P: Pending): string {
    if (P.type !== 'dec') return '';
    const lastIn = run.inputs[run.inputs.length - 1];
    if (lastIn && lastIn.type === 'draw' && lastIn.id === P.id && lastIn.a === S.age && lastIn.t === S.t) return lastIn.k;
    const k = engine('autoPick', () => autoPick(P.d));
    input({ ...here(), type: 'draw', id: P.id, k });
    this.save(); // 抽签改变了随机数状态：马上和输入记录一起存下来
    return k;
  },
  /** 抉择结算（弹窗里盖完章以后调用） */
  decide(k: string) {
    const P = S.pending; if (!P || P.type !== 'dec') return;
    input({ ...here(), type: 'decide', id: P.id, k });
    this.afterModal();
  },
  /** 自述：写下的话记进这一生 */
  reflect(text: string) {
    const P = S.pending; if (!P || P.type !== 'ref') return;
    input({ ...here(), type: 'reflect', text });
    this.afterModal();
  },
  afterModal() {
    this.save(); emit();
    if (S.phase === 'end') this.finish();
  },

  save() {
    if (!S || S.headless || !run) return;
    if (S.phase === 'life') writeSave(S, { speed: this.speed }, run);
    sink.snapshot(run, S);
  },
  show(s: Screen) { this.screen = s; window.scrollTo(0, 0); emit(); },
  finish() {
    if (this.ended) return;
    this.ended = true;
    const d = S.death;
    event('end', { age: d.age, cause: d.cause });
    clearSave();
    keepRun({ run, life: S });
    sink.snapshot(run, S);
    savePast([{ name: S.name, place: placeName(S.home), y0: S.birthYear, y1: d.year, age: d.age, cause: CAUSE[d.cause], tags: lifeTags(S).map(t => t.k), line: lifeLine(S) }, ...loadPast()]);
    setTimeout(() => this.show('end'), END_DELAY);
  },
  /** 结局页：最后想说的话 */
  saveLastWords(text: string) {
    if (!text) return;
    const past = loadPast();
    if (past[0]) { past[0].words = text; savePast(past); }
  },
  /** 下载这一局的日志（局 ID、种子、输入、事件、完整状态），反馈问题时附上 */
  exportRun() {
    if (!run || !S) return;
    const blob = new Blob([JSON.stringify({ run, life: S }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cn14-${run.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

// ===== 每一帧都要更新的东西（进度条）=====
// 界面每 RENDER_MS 才重绘一次，进度条要是跟着重绘就会一格一格地跳；所以它们直接挂在主循环上，每帧改一次样式
const frameFns = new Set<() => void>();
export function onFrame(f: () => void) { frameFns.add(f); return () => { frameFns.delete(f); }; }

// ===== 主循环 =====
let last = 0;
function loop(ts: number) {
  const dt = Math.min(0.25, last ? (ts - last) / 1000 : 0);
  last = ts;
  if (game.screen === 'life' && S && S.phase === 'life' && !game.paused && !S.pending && ts >= holdUntil) {
    const sp = game.speed * (game.ff ? 40 : 1);
    const age0 = S.age, n0 = S.log.length, statement0 = S.statement;
    engine('tick', () => tick(dt * sp / game.yearSec));
    const majorNow = S.log.slice(0, S.log.length - n0).some(e => e.x);
    if (majorNow && game.ff === 'big') { game.ff = false; emit(); }
    if (majorNow && !game.ff && game.speed <= 4) holdUntil = ts + MAJOR_HOLD;
    if (S.age !== age0 || S.statement !== statement0) game.save();
    if (S.pending) { game.ff = false; emit(); }
    else if (S.phase !== 'life') { emit(); game.finish(); } // tick 里离世了
    else if (ts - lastEmit > RENDER_MS) emit();
  }
  for (const f of frameFns) f();
  requestAnimationFrame(loop);
}
let started = false;
export function startLoop() {
  if (started) return;
  started = true;
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
  // 报错记进当前这一局的日志，并立刻存一次
  const onError = (message: string, stack?: string) => { event('error', { message, stack, screen: game.screen }); game.save(); };
  window.addEventListener('error', e => onError(e.message, e.error && e.error.stack));
  window.addEventListener('unhandledrejection', e => onError(String(e.reason && e.reason.message || e.reason), e.reason && e.reason.stack));
}

/** 订阅游戏状态；返回的版本号只用来触发重新渲染 */
export const useGame = () => useSyncExternalStore(subscribe, () => version);
export const hasSave = () => { const sv = loadSave(); return sv && sv.life.phase === 'life' ? sv.life : null; };
