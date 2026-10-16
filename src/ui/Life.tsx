// 一生：顶部的姓名和年龄、本年度计划、时间线、侧栏、底部播放条。
import { memo } from 'react';
import { EDU_LV, FOCUS, S, carer, focusList, placeName, statusLabel, type LogEntry } from '../engine';
import { SPEEDS, game } from '../game/controller';
import { Modal } from './Modal';
import { Companions, Curve, Docs, FamilyCards, Vitals } from './Sidebar';
import { fileNo, sexW } from './util';

function Header() {
  const status = statusLabel();
  const study = S.school ? '在读' + S.school : S.age < 6 ? '学龄前' : EDU_LV[S.edu];
  return (
    <header className="lhead">
      <div className="who">
        <span className="mono small muted">档案号 {fileNo(S)}</span>
        <b>{S.name}</b>
        <span className="small muted">{sexW(S.sex)} · {S.eth} · 现居{placeName(S.loc)} · {study}{status && !S.school && S.age >= 16 ? ' · ' + status.split(' · ')[0] : ''}</span>
      </div>
      <div className="agebig"><b>{S.age}</b><span>岁</span><small>{S.birthYear + S.age}年</small></div>
    </header>
  );
}

function FocusPlan() {
  const l = focusList();
  if (!l.length) return (
    <div className="sheet plan">
      <h4>本年度计划</h4>
      <p className="small muted" style={{ margin: 0 }}>还是个孩子，正由{carer()}带着长大。六岁以后，可以决定每一年把时间花在哪里。这段时间会自动加快。</p>
    </div>
  );
  return (
    <div className="sheet plan">
      <h4>本年度计划 · 这一年主要把时间花在哪里（随时可改，年底按时间比例结算）</h4>
      <div className="plan-opts">
        {l.map(k => <button key={k} className={S.focus === k ? 'on' : ''} title={FOCUS[k].d} onClick={() => game.setFocus(k)}>{FOCUS[k].n}<small>{FOCUS[k].d}</small></button>)}
      </div>
    </div>
  );
}

// 时间线：最新的在上面；同一岁的几条只在第一条显示年龄。记录一旦写下就不再变，所以按对象缓存
const Entry = memo(({ e, same }: { e: LogEntry; same: boolean }) => (
  <div className={`tl ${e.k}${same ? ' same' : ''}`}>
    <span className="ag">{e.a}</span>
    <p>{e.t}{e.f && <span className="f">{e.f}</span>}</p>
  </div>
));
function Timeline() {
  const log = S.log, n = log.length;
  // 用「第几条记录」做 key（从出生往后数），新记录插在最上面时旧的不用重建
  return <div className="timeline">{log.map((e, i) => <Entry key={n - i} e={e} same={i > 0 && log[i - 1].a === e.a} />)}</div>;
}

function Dock() {
  return (
    <nav className="dock">
      <div className="dock-prog"><i style={{ width: (S.t * 100).toFixed(1) + '%' }} /></div>
      <div className="dock-row">
        <button className="dbtn" title="暂停/继续" onClick={() => game.togglePause()}>{game.paused ? '▶' : '❚❚'}</button>
        <div className="seg sm">{SPEEDS.map(v => <button key={v} className={game.speed === v ? 'on' : ''} onClick={() => game.setSpeed(v)}>{v}×</button>)}</div>
        <button className="dbtn wide" onClick={() => game.fastForward()}>快进到下一个抉择</button>
        <label className="toggle"><input type="checkbox" checked={!!S.auto} onChange={e => game.setAuto(e.target.checked)} /> 自动抉择</label>
        <button className="dbtn ghost" onClick={() => game.quit()}>离开</button>
      </div>
    </nav>
  );
}

export function Life() {
  return <>
    <Header />
    <main className="lbody">
      <section className="col-time"><FocusPlan /><Timeline /></section>
      <aside className="col-side">
        <Vitals />
        <FamilyCards />
        <Docs />
        <div className="sheet"><h4 className="sheet-title">一生曲线 <span className="muted small">幸福 · 健康</span></h4><Curve /></div>
        <div className="sheet"><h4 className="sheet-title">同一秒建档的人 <span className="muted small">此刻，同样的年纪</span></h4><Companions /></div>
      </aside>
    </main>
    <Dock />
    <Modal />
  </>;
}
