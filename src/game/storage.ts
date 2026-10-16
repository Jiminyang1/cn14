// 浏览器本地存储：当前这一生的存档、偏好、过过的人生。
import type { Life } from '../engine';

const SAVE_KEY = 'cn14.save', PREF_KEY = 'cn14.pref', PAST_KEY = 'cn14.past';

function get<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) as string); } catch { return null; }
}
function set(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 存储满了或被禁用：不影响游戏 */ }
}
function del(k: string) {
  try { localStorage.removeItem(k); } catch { /* 同上 */ }
}

// ===== 存档 =====
// 格式 2：{ format: 2, life, ui }。格式 1（重构前）直接把整个人生对象存在根上，界面状态也混在里面。
export interface UiPrefs { speed: number; yearSec: number }
export interface Save { life: Life; ui: UiPrefs }
const SAVE_FORMAT = 2;
const UI_FIELDS = ['speed', 'yearSec', 'paused', 'ff', 'dirty'];

export function loadSave(): Save | null {
  const raw = get<any>(SAVE_KEY);
  if (!raw) return null;
  if (raw.format === SAVE_FORMAT) return raw;
  if (raw.phase) { // 格式 1
    const ui = { speed: raw.speed || 1, yearSec: raw.yearSec || 18.75 };
    const life = { ...raw };
    for (const k of UI_FIELDS) delete life[k];
    return { life, ui };
  }
  return null;
}
export const writeSave = (life: Life, ui: UiPrefs) => set(SAVE_KEY, { format: SAVE_FORMAT, life, ui });
export const clearSave = () => del(SAVE_KEY);

// ===== 偏好：一生的长度（分钟） =====
export interface Pref { len: number }
export const loadPref = (): Pref => Object.assign({ len: 25 }, get<Pref>(PREF_KEY) || {});
export const savePref = (p: Pref) => set(PREF_KEY, p);

// ===== 过过的人生 =====
export interface PastLife { name: string; place: string; y0: number; y1: number; age: number; cause: string; words?: string }
export const loadPast = (): PastLife[] => get<PastLife[]>(PAST_KEY) || [];
export const savePast = (past: PastLife[]) => set(PAST_KEY, past.slice(0, 30));
