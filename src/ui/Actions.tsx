// 「三、计划」上的「行动」按钮（打开「这一年」，ui/Year.tsx）和抉择单收起来以后浮着的「等待抉择」
import { ACTS, S, actState, actsShown } from '../engine';
import { game } from '../game/controller';
import { openYear } from './Year';
import './actions.css';

/** 抉择单收起来以后，浮在页面上的「等待抉择」：游戏停着，点它回去选 */
export function PendingFloat() {
  const P = S.pending;
  if (!P || P.type !== 'dec' || game.hidden !== game.pendingKey()) return null;
  return <button className="pend-float" type="button" onClick={() => game.showDec()}>
    <span className="pend-k">等待抉择</span><b>{P.d.title.replace(/[？?]$/, '')}</b>
  </button>;
}

/** 「三、计划」上的「行动」：经济独立以后才有。打开「这一年」，停在第一类还有事能做的行动上 */
export function ActionsButton() {
  if (!S.indep || S.age < 18 || S.phase !== 'life') return null;
  const ok = actsShown().filter(k => actState(k).ok);
  const first = ok.length ? ACTS[ok[0]].g : 'plan';
  return <button className="ctl act-btn" type="button" onClick={() => openYear(first === 'money' ? 'money' : first)}>行动{ok.length > 0 && <span className="act-n">{ok.length}</span>}</button>;
}
