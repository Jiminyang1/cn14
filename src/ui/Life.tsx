// 一生：顶部的姓名和年龄、本年度计划、时间线、侧栏、底部播放条。
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { EDU_LV, FOCUS, S, carer, focusList, placeName, statusLabel, type LogEntry } from '../engine';
import { SPEEDS, game } from '../game/controller';
import './day.css';
import { Modal } from './Modal';
import { RunId } from './RunId';
import { Companions, Curve, Docs, FamilyCards, Vitals } from './Sidebar';
import { fileNo, sexW } from './util';

function Header() {
  const status = statusLabel();
  const study = S.school ? '在读' + S.school : S.age < 6 ? '学龄前' : EDU_LV[S.edu];
  return (
    <header className="lhead">
      <div className="who">
        <div className="who-1">
          <b>{S.name}</b>
          <span className="small muted">{sexW(S.sex)} · {S.eth} · 现居{placeName(S.loc)} · {study}{status && !S.school && S.age >= 16 ? ' · ' + status.split(' · ')[0] : ''}</span>
        </div>
        <div className="who-2"><span className="mono small muted">档案号 {fileNo(S)}</span><RunId /></div>
      </div>
      <div className="agebig"><b>{S.age}</b><span>岁</span><small>{S.birthYear + S.age}年 · 1年≈{Math.round(game.yearSec)}秒</small></div>
    </header>
  );
}

function FocusPlan() {
  const l = focusList();
  if (!l.length) return (
    <div className="sheet plan">
      <h4>本年度计划</h4>
      <p className="small muted" style={{ margin: 0 }}>还是个孩子，正由{carer()}带着长大。六岁以后，可以决定每一年把时间花在哪里。这段时间可以用 8× 快进。</p>
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

// 人生纪录：放在一张单独滚动的卡片里，按年分组，最新的在上面，每一年的标题在滚动时吸顶。
// 记录一旦写下就不再变，所以按对象缓存
const Entry = memo(({ e }: { e: LogEntry }) => (
  <div className={`tl ${e.k}`}>
    <p>{e.t}{e.f && <span className="f">{e.f}</span>}</p>
  </div>
));
function Timeline() {
  const box = useRef<HTMLDivElement>(null);
  const prevH = useRef(0);
  const [away, setAway] = useState(false);
  const log = S.log, n = log.length;
  // 按年龄分组；用「第几条记录」做 key（从出生往后数），新记录插在最上面时旧的不用重建
  const years: { a: number; items: [LogEntry, number][] }[] = [];
  log.forEach((e, i) => {
    const last = years[years.length - 1];
    if (last && last.a === e.a) last.items.push([e, n - i]); else years.push({ a: e.a, items: [[e, n - i]] });
  });
  if (S.phase === 'life' && (!years.length || years[0].a !== S.age)) years.unshift({ a: S.age, items: [] }); // 这一年还没有记录
  // 往下翻着看旧记录时，上面插进新记录不要把正在看的内容顶走
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    if (el.scrollTop > 8 && prevH.current) el.scrollTop += el.scrollHeight - prevH.current;
    prevH.current = el.scrollHeight;
  }, [n]);
  return (
    <section className="sheet tl-card">
      <h4 className="sheet-title">人生纪录 <span className="muted small">{n} 条 · 最新的在上面</span></h4>
      <div className="tl-scroll" ref={box} onScroll={e => setAway(e.currentTarget.scrollTop > 40)}>
        {years.map(y => (
          <div className="yr" key={y.a}>
            <div className="yr-h">
              <b>{y.a}岁</b><small>{S.birthYear + y.a}年</small>
              {y.a === S.age && S.phase === 'life' && <i className="yr-prog" title="这一年过了多少"><u style={{ width: (S.t * 100).toFixed(1) + '%' }} /></i>}
            </div>
            <div className="timeline">{y.items.map(([e, k]) => <Entry key={k} e={e} />)}</div>
          </div>
        ))}
      </div>
      {away && <button className="tl-latest" type="button" onClick={() => { if (box.current) box.current.scrollTop = 0; setAway(false); }}>↑ 回到最新</button>}
    </section>
  );
}

function Dock() {
  return (
    <nav className="dock">
      <div className="dock-prog"><i style={{ width: (S.t * 100).toFixed(1) + '%' }} /></div>
      <div className="dock-row">
        <button className="dbtn" title="暂停/继续" onClick={() => game.togglePause()}>{game.paused ? '▶' : '❚❚'}</button>
        <div className="seg sm">{SPEEDS.map(v => <button key={v} className={game.speed === v ? 'on' : ''} onClick={() => game.setSpeed(v)}>{v}×</button>)}</div>
        <button className={'dbtn wide' + (game.ff === 'big' ? ' on' : '')} title="快进，直到发生一件大事（日常不算）" onClick={() => game.fastForward('big')}>下一件大事</button>
        <button className={'dbtn wide' + (game.ff === 'dec' ? ' on' : '')} title="快进，直到要你做决定" onClick={() => game.fastForward('dec')}>下一个抉择</button>
        <label className="toggle"><input type="checkbox" checked={!!S.auto} onChange={e => game.setAuto(e.target.checked)} /> 自动抉择</label>
        {import.meta.env.DEV && <button className="dbtn" title="下载这一局的日志" onClick={() => game.exportRun()}>日志</button>}
        <button className="dbtn ghost" onClick={() => game.quit()}>离开</button>
      </div>
    </nav>
  );
}

export function Life() {
  return <div className="life-app">
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
  </div>;
}
