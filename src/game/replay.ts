// 重放：用同样的种子和同样的输入，重新跑出一模一样的一生。
// applyInput 是真实游玩（controller.ts）和重放共用的唯一入口，保证两边做的事完全相同。
import { S, autoPick, doAct, log, newLife, resolveDec, setPlan, setSlot, tickTo, type Life } from '../engine';
import type { Input, RunLog } from './runlog';

export class ReplayError extends Error {}

/** 把一条输入作用到当前人生上。replaying：重放时抽签要真的抽一次（真实游玩时抽签已经在记录之前做过了） */
export function applyInput(inp: Input, replaying = false) {
  const P = S.pending;
  if (inp.type === 'draw' || inp.type === 'decide') {
    if (!P || P.type !== 'dec' || P.id !== inp.id) throw new ReplayError(`${inp.a}岁：记录里是抉择 ${inp.id}，当前${P ? '弹出的是 ' + (P.type === 'dec' ? P.id : '自述') : '没有抉择'}`);
    if (inp.type === 'draw') {
      if (replaying) {
        const k = autoPick(P.d);
        if (k !== inp.k) throw new ReplayError(`${inp.a}岁：抉择 ${inp.id} 的自动抽签记录是 ${inp.k}，重放抽到 ${k}`);
      }
    } else {
      resolveDec(P.id, P.d, inp.k);
      S.pending = null;
    }
  } else if (inp.type === 'slot') setSlot(inp.i, inp.k);
  else if (inp.type === 'act') doAct(inp.k);
  else if (inp.type === 'plan') setPlan(inp.k, inp.v);
  else S.auto = inp.on;
  // 输入可能在当前进度上排了新的事件（比如滑档后的下一个抉择）：马上处理，这样它和下一条输入的先后是确定的
  tickTo(S.t);
}

/** 推进到 a 岁、这一年的进度 t；遇到抉择或离世就停 */
function reach(a: number, t: number) {
  for (let guard = 0; S.phase === 'life' && !S.pending && (S.age < a || (S.age === a && S.t < t)); guard++) {
    if (guard > 1e5) throw new ReplayError('推进不动了');
    tickTo(S.age < a ? 1 : t);
  }
}

export interface ReplayOptions {
  /** 停在这个位置（没跑完的局：停在记录下来的最后状态）；不给就跑到离世 */
  stopAt?: { a: number; t: number };
  /** 只跑到这个年龄（排查某一年用） */
  untilAge?: number;
}

/** 从头重放一局，返回重放出来的人生（同时也是当前的 S） */
export function replay(run: RunLog, opts: ReplayOptions = {}): Life {
  newLife(run.seed);
  S.auto = false;
  const limit = opts.untilAge ?? Infinity;
  for (const [i, inp] of run.inputs.entries()) {
    if (inp.a >= limit) { reach(limit, 0); return S; }
    reach(inp.a, inp.t);
    if (S.age !== inp.a || S.t !== inp.t) {
      const where = S.phase !== 'life' ? `已经在 ${S.age} 岁离世` : S.pending ? `${S.age} 岁弹出了没有记录的抉择 ${S.pending.type === 'dec' ? S.pending.id : '自述'}` : `停在 ${S.age} 岁 ${S.t}`;
      throw new ReplayError(`第 ${i + 1} 条输入（${inp.a} 岁 ${inp.type}）对不上：${where}`);
    }
    applyInput(inp, true);
  }
  const stop = opts.stopAt;
  if (stop && stop.a < limit) { reach(stop.a, stop.t); return S; }
  for (let guard = 0; S.phase === 'life' && S.age < limit; guard++) {
    if (S.pending) throw new ReplayError(`${S.age} 岁弹出了没有记录的抉择 ${S.pending.type === 'dec' ? S.pending.id : '自述'}`);
    if (guard > 1e5) throw new ReplayError('推进不动了');
    tickTo(1);
  }
  return S;
}
