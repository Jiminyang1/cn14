// 游戏控制器：在 React 之外推进模拟（requestAnimationFrame），管理速度、暂停、存档、局日志和页面切换。
// 引擎直接修改当前人生对象 S，所以 React 组件通过 useGame() 订阅一个版本号，版本号变了就重新读 S。
// 会影响模拟结果的操作（抉择、改重心、开关自动抉择）一律先记进局日志，再通过 applyInput 生效，这样每一局都能精确重放。
import { useSyncExternalStore } from 'react';
import { CAUSE, S, autoPick, newLife, placeName, setS, tick, type Pending } from '../engine';
import { sink } from './devsink';
import { applyInput } from './replay';
import { newRun, pushEvent, runId, type Input, type RunLog } from './runlog';
import { clearSave, keepRun, loadPast, loadSave, savePast, writeSave } from './storage';

export type Screen = 'home' | 'birth' | 'life' | 'end';
// 节奏：1× 时一年 30 秒（按平均寿命约 40 分钟，不算做抉择的时间）。快不快由倍速和快进决定，不再让玩家开局选
export const YEAR_SEC = 30;
export const SPEEDS = [1, 2, 4, 8];
export type FF = false | 'big' | 'dec';
// 「下一件大事」：遇到这些类型的记录就停（日常、里程碑不算）
const BIG_KINDS = new Set(['ev', 'good', 'bad', 'loss', 'choice', 'death']);
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
  pref: { len: Math.round(80 * YEAR_SEC / 60) }, // 活到平均寿命大约几分钟（出生登记表上显示）
  speed: 1,
  paused: false,
  ff: false as FF,     // 快进：到下一件大事 / 到下一个抉择
  yearSec: YEAR_SEC,   // 一年对应多少秒
  ended: false,        // 已经进入结局流程
  get run() { return run; },

  bornNow() {
    const old = loadSave(); // 没跑完的上一局要被覆盖了：先留一份
    if (old && old.run && old.life.phase === 'life') keepRun({ run: { ...old.run, events: [...old.run.events, { at: new Date().toISOString(), type: 'abandoned' }] }, life: old.life });
    const seed = (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) | 0;
    run = newRun(seed, VERSION);
    engine('newLife', () => newLife(seed));
    this.yearSec = YEAR_SEC;
    this.speed = 1; S.auto = false;
    event('start', { yearSec: YEAR_SEC, ua: navigator.userAgent });
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
    run = sv.run || newRun(sv.life.seed, VERSION, { id: runId(sv.life.seed), incomplete: true });
    lastRs = S.rs;
    this.speed = SPEEDS.includes(sv.ui.speed) ? sv.ui.speed : SPEEDS[SPEEDS.length - 1]; this.yearSec = YEAR_SEC; // 旧存档里的一年长度不再沿用
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
    if (S.phase === 'life') writeSave(S, { speed: this.speed, yearSec: this.yearSec }, run);
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
    savePast([{ name: S.name, place: placeName(S.home), y0: S.birthYear, y1: d.year, age: d.age, cause: CAUSE[d.cause] }, ...loadPast()]);
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

// ===== 主循环 =====
let last = 0;
function loop(ts: number) {
  const dt = Math.min(0.25, last ? (ts - last) / 1000 : 0);
  last = ts;
  if (game.screen === 'life' && S && S.phase === 'life' && !game.paused && !S.pending) {
    const sp = game.speed * (S.age < 6 ? 3 : 1) * (game.ff ? 40 : 1);
    const age0 = S.age, n0 = S.log.length;
    engine('tick', () => tick(dt * sp / game.yearSec));
    if (game.ff === 'big' && S.log.slice(0, S.log.length - n0).some(e => BIG_KINDS.has(e.k))) { game.ff = false; emit(); }
    if (S.age !== age0) game.save();
    if (S.pending) { game.ff = false; emit(); }
    else if (S.phase !== 'life') { emit(); game.finish(); } // tick 里离世了
    else if (ts - lastEmit > RENDER_MS) emit();
  }
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
