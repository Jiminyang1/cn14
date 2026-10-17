// 行动单：玩家主动做的事（engine/actions.ts）。点页头的「行动」打开，打开时游戏暂停；关上以后仍然暂停，让玩家停下来想一想，想好了自己按 ▶ 继续。
// 什么都不做也可以：行动都是可选的
// 分两栏：家人（回家看看、给爸妈钱、给孩子钱、旅行）、生活（买车、装修、报班考证）。每项写清做什么、花多少、今年还能做几次；
// 做不了的写原因。做完一件，下面写出时间线上记下的那句话
import { useEffect, useState } from 'react';
import { ACTS, S, actState, actsShown, closeWord, parClose, wan, anyParent } from '../engine';
import { game } from '../game/controller';
import './actions.css';

const GROUPS = [['kin', '家人'], ['life', '生活']] as const;

/** 页头上的「待定」：抉择单收起来以后，点它再打开 */
export function PendingButton() {
  const P = S.pending;
  if (!P || P.type !== 'dec' || game.hidden !== game.pendingKey()) return null;
  return <button className="ctl primary pend-btn" type="button" title="这件事还没定，游戏停着" onClick={() => game.showDec()}>待定：{P.d.title.replace(/[？?]$/, '')}</button>;
}

/** 页头上的按钮：经济独立以后才有 */
export function ActionsButton() {
  const [open, setOpen] = useState(false);
  if (!S.indep || S.age < 18 || S.phase !== 'life') return null;
  const n = actsShown().filter(k => actState(k).ok).length;
  return <>
    <button className="ctl act-btn" type="button" title="自己安排的事：回家看看、给家人钱、旅行、买车……" onClick={() => setOpen(true)}>
      行动{n > 0 && <span className="act-n">{n}</span>}
    </button>
    {open && <ActionsSheet onClose={() => setOpen(false)} />}
  </>;
}

function ActionsSheet({ onClose }: { onClose: () => void }) {
  const [said, setSaid] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!game.paused) game.togglePause(); // 走正式的暂停：页头的按钮跟着变成 ▶，局日志里也记一笔
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 关上以后保持暂停，想好了玩家自己按 ▶
  const close = () => onClose();
  const keys = actsShown();
  const doIt = (k: string) => { const n0 = S.log.length; game.act(k); setSaid(S.log.length > n0 ? S.log[0].t : null); setDone(d => d + 1); };
  return (
    <div className="modal" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="ds acts" role="dialog" aria-label="行动">
        <span className="ftab"><b>行动单</b><span className="mono">{S.age}岁这一年</span></span>
        <div className="ds-sheet">
          <button type="button" className="ds-x" aria-label="关上" title="关上，游戏保持暂停" onClick={close}>×</button>
          <div className="ds-h"><span className="k">行动</span><h3>这一年做点什么</h3><span className="meta">手头 {wan(S.money)}</span></div>
          {anyParent() && <p className="acts-note">和{S.fam.mom.alive && S.fam.dad.alive ? '爸妈' : S.fam.mom.alive ? '妈妈' : '爸爸'}：{closeWord(parClose())}。常回家、给钱，会越来越亲；不管不问，几年就疏远了。</p>}
          {GROUPS.map(([g, title]) => {
            const ks = keys.filter(k => ACTS[k].g === g);
            if (!ks.length) return null;
            return <div key={g} className="acts-g">
              <h4>{title}</h4>
              {ks.map(k => {
                const A = ACTS[k], st = actState(k);
                return <div key={k} className={'act' + (st.ok ? '' : ' off')}>
                  <div className="act-t"><b>{A.n}</b><small>{A.d()}</small></div>
                  <div className="act-m"><span>约{wan(st.cost)}</span><small>{st.ok ? (A.max > 1 ? `今年还能${st.left}次` : '一年一次') : st.why}</small></div>
                  <button type="button" className="ctl primary" disabled={!st.ok} onClick={() => doIt(k)}>去做</button>
                </div>;
              })}
            </div>;
          })}
          {said && <p className="acts-said">{said}</p>}
          <div className="acts-foot"><small>都是可选的，什么都不做也行。关上以后游戏保持暂停，想好了按 ▶ 继续。</small><button type="button" className="btn" onClick={close}>{done ? '好了' : '什么都不做'}</button></div>
        </div>
      </div>
    </div>
  );
}
