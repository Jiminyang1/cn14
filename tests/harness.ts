// 金标准快照：用固定 seed 跑完整的人生，把最终状态做成哈希。
// 重构前后对同一组 seed 必须得到完全一样的结果。
import { createHash } from 'node:crypto';

export const HEADLESS_SEEDS = Array.from({ length: 200 }, (_, i) => (1000 + i * 7919) | 0);
export const MAIN_SEEDS = Array.from({ length: 20 }, (_, i) => (424242 + i * 104729) | 0);

const stable = (v: any): string => {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined && typeof v[k] !== 'function').map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v) ?? 'null';
};
const hash = (o: any) => createHash('sha256').update(stable(o)).digest('hex').slice(0, 16);
const brief = (L: any) => ({ name: L.name, born: L.born, age: L.age, cause: L.death && L.death.cause, edu: L.edu, money: Math.round(L.money) || 0 }); // || 0：-0 写进 JSON 会变成 0，比较时对不上

// api: { birth, runHeadlessYear, newLife, tick, resolveDec, autoPick, getS }
export function runAll(api: any) {
  const out: { headless: Record<string, any>; main: Record<string, any> } = { headless: {}, main: {} };
  for (const seed of HEADLESS_SEEDS) {
    api.birth(seed, { headless: true });
    const L = api.getS();
    let g = 0;
    while (L.phase === 'life' && g++ < 130) api.runHeadlessYear();
    out.headless[seed] = { h: hash(L), ...brief(L) };
  }
  // 有界面的人生：模拟 UI 的推进方式（小步 tick，遇到抉择自动选，遇到自述直接跳过）
  for (const seed of MAIN_SEEDS) {
    api.newLife(seed);
    const L = api.getS();
    L.yearSec = 18.75; L.speed = 1; L.auto = false;
    let g = 0;
    while (L.phase === 'life' && g++ < 50000) {
      const P = L.pending;
      if (P && P.type === 'dec') api.resolveDec(P.id, P.d, api.autoPick(P.d));
      else if (P) L.pending = null;
      else api.tick(0.37);
    }
    out.main[seed] = { h: hash(L), ...brief(L) };
  }
  return out;
}
