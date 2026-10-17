// 浏览器本地存储：当前这一生的存档、偏好、过过的人生。
import type { Life } from '../engine';
import type { RunLog } from './runlog';

const SAVE_KEY = 'cn14.save', PREF_KEY = 'cn14.pref', PAST_KEY = 'cn14.past', RUNS_KEY = 'cn14.runs';

function get<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) as string); } catch { return null; }
}
function set(k: string, v: unknown): boolean {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } // 存储满了或被禁用：不影响游戏
}
function del(k: string) {
  try { localStorage.removeItem(k); } catch { /* 同上 */ }
}

// ===== 存档 =====
// { format, life, ui, run }（run 是这一局的日志，和人生同时保存，所以总是对得上）。
// 不做旧存档的兼容：人生对象的结构变了就把 SAVE_FORMAT 加一，格式不同的存档直接当作没有
export interface UiPrefs { speed: number }
export interface Save { life: Life; ui: UiPrefs; run: RunLog }
const SAVE_FORMAT = 5; // 3：加了性格；4：审查修复（孩子按月算年龄、兄弟姐妹会去世、助学贷款单独记账……）；5：个税和五险一金（2026-10-16）

export function loadSave(): Save | null {
  const raw = get<any>(SAVE_KEY);
  return raw && raw.format === SAVE_FORMAT ? raw : null;
}
export const writeSave = (life: Life, ui: UiPrefs, run: RunLog) => set(SAVE_KEY, { format: SAVE_FORMAT, life, ui, run });
export const clearSave = () => del(SAVE_KEY);

// ===== 偏好：一生的长度（分钟） =====
export interface Pref { len: number }
export const loadPref = (): Pref => Object.assign({ len: 25 }, get<Pref>(PREF_KEY) || {});
export const savePref = (p: Pref) => set(PREF_KEY, p);

// ===== 过过的人生 =====
export interface PastLife { name: string; place: string; y0: number; y1: number; age: number; cause: string; words?: string }
export const loadPast = (): PastLife[] => get<PastLife[]>(PAST_KEY) || [];
export const savePast = (past: PastLife[]) => set(PAST_KEY, past.slice(0, 30));

// ===== 最近几局的完整日志（排查用：结束的、或被新的一局覆盖掉的） =====
export interface RunRecord { run: RunLog; life: Life }
const MAX_RUNS = 20;
export const loadRuns = (): RunRecord[] => get<RunRecord[]>(RUNS_KEY) || [];
export function keepRun(rec: RunRecord) {
  let runs = [rec, ...loadRuns().filter(r => r.run.id !== rec.run.id)].slice(0, MAX_RUNS);
  // 存不下就丢掉最旧的，直到存得下
  while (runs.length && !set(RUNS_KEY, runs)) runs = runs.slice(0, -1);
}
