// 重放必须和原局完全一致：模拟一个随机操作的玩家（随机步长推进、改重心、开关自动抉择、手动或自动选、中途刷新读档），
// 只记下输入，再从种子重放，最终状态必须逐字节相同。
import { expect, test } from 'vitest';
import * as E from '../src/engine';
import { applyInput, replay } from '../src/game/replay';
import { newRun, type Input } from '../src/game/runlog';

// 玩家自己的随机数（和引擎的分开）
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const stable = (v: unknown) => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);

function play(seed: number) {
  const r = lcg(seed ^ 0x5bd1e995);
  E.newLife(seed); E.S.auto = false;
  let L = E.S;
  const run = newRun(seed, 'test');
  const input = (inp: Input) => { run.inputs.push(inp); applyInput(inp); };
  // 模拟刷新页面：回到存档（人生和输入记录一起存的），从那里继续
  const reload = () => {
    const sv = JSON.parse(JSON.stringify({ life: L, inputs: run.inputs }));
    E.setS(sv.life); L = E.S; run.inputs = sv.inputs;
  };
  for (let guard = 0; L.phase === 'life' && guard < 200000; guard++) {
    const P = L.pending, here = { a: L.age, t: L.t };
    if (P && P.type === 'dec') {
      // 和 controller.autoChoice 一样：这个弹窗已经抽过签就沿用，不重抽
      const last = run.inputs[run.inputs.length - 1];
      let auto = last && last.type === 'draw' && last.id === P.id && last.a === here.a && last.t === here.t ? last.k : null;
      if (!auto && (L.auto || r() < 0.3)) { auto = E.autoPick(P.d); input({ ...here, type: 'draw', id: P.id, k: auto }); }
      if (auto && r() < 0.2) { reload(); continue; } // 抽完签、还没选就刷新了
      const ok = P.d.choices.filter(c => !c.off);
      const k = auto && r() < 0.7 ? auto : ok[Math.floor(r() * ok.length)].k;
      input({ ...here, type: 'decide', id: P.id, k });
    } else if (P) input({ ...here, type: 'reflect', text: '' });
    else if (r() < 0.04 && E.focusList().length) { const l = E.focusList(); input({ ...here, type: 'focus', k: l[Math.floor(r() * l.length)] }); }
    else if (r() < 0.01) input({ ...here, type: 'auto', on: !L.auto });
    else if (r() < 0.005) reload();
    else E.tick(0.001 + r() * 0.3);
  }
  return { run, life: L };
}

test('replay reproduces interactive lives exactly', () => {
  // 个别人生在还没有任何输入之前就结束了（比如不满一岁夭折），这样的也照样核对；只要求大多数人生确实有输入
  let withInputs = 0;
  for (let i = 0; i < 30; i++) {
    const { run, life } = play((7777 + i * 104729) | 0);
    if (life.cashflow) expect(life.statements).toHaveLength(life.cashflow.months);
    if (run.inputs.length) withInputs++;
    const want = stable(life);
    const got = stable(replay(run));
    expect(got === want, `seed ${run.seed}`).toBe(true);
  }
  expect(withInputs).toBeGreaterThanOrEqual(25);
});
