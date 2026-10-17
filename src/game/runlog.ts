// 每一局的日志：局 ID、种子、代码版本、玩家的所有输入（用来精确重放），以及排查用的事件（读档、报错……）。
// 输入记录和存档同时保存，所以两者总是对得上；事件只增不减。

/** 会影响模拟结果的玩家输入，记下发生时的年龄 a 和这一年的进度 t */
export type Input = { a: number; t: number } & (
  | { type: 'draw'; id: string; k: string }   // 弹窗为自动抉择抽了一次签（消耗随机数），k 是抽中的选项
  | { type: 'decide'; id: string; k: string }
  | { type: 'slot'; i: number; k: string | null } // 改第 i 格（focus.ts 的 setSlot）
  | { type: 'auto'; on: boolean }
  | { type: 'reflect'; text: string }
);
/** 不影响模拟结果、只用来排查的事件 */
export interface RunEvent { at: string; a?: number; t?: number; type: string; [k: string]: unknown }

export interface RunLog {
  id: string;
  seed: number;
  version: string;      // 代码版本（git commit，有未提交的改动时带 -dirty）
  startedAt: string;
  inputs: Input[];
  events: RunEvent[];
}

const MAX_EVENTS = 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** 局 ID：开始时间 + 种子（36 进制），例如 20261016-1532-k3x9q1 */
export function runId(seed: number, d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${(seed >>> 0).toString(36)}`;
}
export const seedOfRunId = (id: string) => parseInt(id.split('-').pop(), 36) | 0;

export function newRun(seed: number, version: string): RunLog {
  return { id: runId(seed), seed, version, startedAt: new Date().toISOString(), inputs: [], events: [] };
}

export function pushEvent(run: RunLog, ev: { type: string; [k: string]: unknown }): RunEvent {
  const e = { at: new Date().toISOString(), ...ev };
  run.events.push(e);
  if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
  return e;
}
