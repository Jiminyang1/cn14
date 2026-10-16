// 游戏控制器：在 React 之外推进模拟（requestAnimationFrame），管理速度、暂停、存档和页面切换。
// 引擎直接修改当前人生对象 S，所以 React 组件通过 useGame() 订阅一个版本号，版本号变了就重新读 S。
import { useSyncExternalStore } from 'react';
import { CAUSE, S, log, newLife, placeName, resolveDec, setS, tick } from '../engine';
import { clearSave, loadPast, loadPref, loadSave, savePast, savePref, writeSave } from './storage';

export type Screen = 'home' | 'birth' | 'life' | 'end';
export const LENS: [number, string][] = [[10, '10 分钟'], [25, '25 分钟'], [45, '45 分钟']];
export const SPEEDS = [1, 2, 4, 8, 16];
const RENDER_MS = 120;   // 推进中界面最多每 120 毫秒刷新一次
const END_DELAY = 1500;  // 离世后停留在时间线上的时间

const listeners = new Set<() => void>();
let version = 0;
let lastEmit = 0;
function emit() { version++; lastEmit = performance.now(); for (const f of listeners) f(); }
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export const game = {
  screen: 'home' as Screen,
  pref: loadPref(),
  speed: 1,
  paused: false,
  ff: false,           // 快进到下一个抉择
  yearSec: 18.75,      // 一年对应多少秒
  ended: false,        // 已经进入结局流程

  setLen(len: number) { this.pref = { ...this.pref, len }; savePref(this.pref); emit(); },
  bornNow() {
    const seed = (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) | 0;
    newLife(seed);
    this.yearSec = this.pref.len * 60 / 80;
    this.speed = 1; S.auto = false;
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
    this.speed = sv.ui.speed; this.yearSec = sv.ui.yearSec;
    this.startLife();
  },
  quit() { this.save(); this.paused = true; this.show('home'); },
  togglePause() { this.paused = !this.paused; emit(); },
  setSpeed(v: number) { this.speed = v; emit(); },
  fastForward() { this.ff = true; this.paused = false; emit(); },
  setAuto(on: boolean) { S.auto = on; emit(); },
  setFocus(k: string) { S.focus = k; emit(); },

  /** 抉择结算（弹窗里盖完章以后调用） */
  decide(k: string) {
    const P = S.pending; if (!P || P.type !== 'dec') return;
    resolveDec(P.id, P.d, k);
    this.closeModal();
  },
  /** 自述：写下的话记进这一生 */
  reflect(text: string) {
    const P = S.pending; if (!P || P.type !== 'ref') return;
    if (text) { S.notes.push({ a: S.age, q: P.q, t: text }); log(`你写下：“${text}”`, 'note'); }
    this.closeModal();
  },
  closeModal() {
    S.pending = null;
    this.save(); emit();
    if (S.phase === 'end') this.finish();
  },

  save() { if (S && !S.headless && S.phase === 'life') writeSave(S, { speed: this.speed, yearSec: this.yearSec }); },
  show(s: Screen) { this.screen = s; window.scrollTo(0, 0); emit(); },
  finish() {
    if (this.ended) return;
    this.ended = true;
    clearSave();
    const d = S.death;
    savePast([{ name: S.name, place: placeName(S.home), y0: S.birthYear, y1: d.year, age: d.age, cause: CAUSE[d.cause] }, ...loadPast()]);
    setTimeout(() => this.show('end'), END_DELAY);
  },
  /** 结局页：最后想说的话 */
  saveLastWords(text: string) {
    if (!text) return;
    const past = loadPast();
    if (past[0]) { past[0].words = text; savePast(past); }
  },
};

// ===== 主循环 =====
let last = 0;
function loop(ts: number) {
  const dt = Math.min(0.25, last ? (ts - last) / 1000 : 0);
  last = ts;
  if (game.screen === 'life' && S && S.phase === 'life' && !game.paused && !S.pending) {
    const sp = game.speed * (S.age < 6 ? 3 : 1) * (game.ff ? 40 : 1);
    const age0 = S.age;
    tick(dt * sp / game.yearSec);
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
}

/** 订阅游戏状态；返回的版本号只用来触发重新渲染 */
export const useGame = () => useSyncExternalStore(subscribe, () => version);
export const hasSave = () => { const sv = loadSave(); return sv && sv.life.phase === 'life' ? sv.life : null; };
