// 行动单：玩家主动做的事（engine/actions.ts）。点页头的「行动」打开，打开时游戏暂停，关上恢复原来的状态。
// 分两栏：家人（回家看看、给爸妈钱、给孩子钱、旅行）、生活（买车、装修、报班考证）。每项写清做什么、花多少、今年还能做几次；
// 做不了的写原因。做完一件，下面写出时间线上记下的那句话
import { useEffect, useRef, useState } from 'react';
import { ACTS, S, actState, actsShown, closeWord, parClose, wan, anyParent } from '../engine';
import { game } from '../game/controller';
import './actions.css';

const GROUPS = [['kin', '家人'], ['life', '生活']] as const;

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
  const wasPaused = useRef(game.paused);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    game.paused = true;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { game.paused = wasPaused.current; onClose(); };
  const keys = actsShown();
  const doIt = (k: string) => { const n0 = S.log.length; game.act(k); setSaid(S.log.length > n0 ? S.log[0].t : null); };
  return (
    <div className="modal" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="ds acts" role="dialog" aria-label="行动">
        <span className="ftab"><b>行动单</b><span className="mono">{S.age}岁这一年</span></span>
        <div className="ds-sheet">
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
          <div className="acts-foot"><button type="button" className="btn" onClick={close}>好了</button></div>
        </div>
      </div>
    </div>
  );
}
