// 一生：顶部的姓名和年龄、本年度计划、时间线、侧栏、底部播放条。
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { EDU_LV, FOCUS, S, calMonth, calYear, carer, focusList, persWords, placeName, shownZ, statusLabel, type LogEntry } from '../engine';
import { SPEEDS, game } from '../game/controller';
import './day.css';
import { Modal } from './Modal';
import { LiveScene, LogPic } from './Photo';
import { YearProgress } from './Progress';
import { RunId } from './RunId';
import { Companions, Curve, Docs, FamilyCards, Vitals } from './Sidebar';
import { fileNo, sexW } from './util';

function Header() {
  const status = statusLabel();
  const study = S.school ? '在读' + S.school : S.age < 6 ? '学龄前' : EDU_LV[S.edu];
  const pw = S.pers && S.age >= 3 ? persWords(shownZ(), 2) : [];
  return (
    <header className="lhead">
      <div className="who">
        <div className="who-1">
          <b>{S.name}</b>
          <span className="small muted">{sexW(S.sex)} · {S.eth} · 现居{placeName(S.loc)} · {study}{status && !S.school && S.age >= 16 ? ' · ' + status.split(' · ')[0] : ''}{pw.length ? ' · ' + pw.join('、') : ''}</span>
        </div>
        <div className="who-2"><span className="mono small muted">档案号 {fileNo(S)}</span><RunId /></div>
      </div>
      <div className="agebig"><b>{S.age}</b><span>岁</span><small>{calYear()}年{calMonth()}月 · 1年≈{Math.round(game.yearSec)}秒</small></div>
    </header>
  );
}

// 今年的重心：一排小按钮，下面一行说明当前选的那一项
function FocusPlan() {
  const l = focusList();
  if (!l.length) return (
    <div className="sheet plan">
      <p className="plan-d"><b className="plan-h">今年的重心</b>还是个孩子，正由{carer()}带着长大。六岁起可以选每一年把时间花在哪里；这段时间可以用 8× 快进。</p>
    </div>
  );
  const cur = S.focus && FOCUS[S.focus];
  return (
    <div className="sheet plan">
      <div className="plan-row">
        <b className="plan-h" title="这一年主要把时间花在哪里。随时可改，每个月按花在各项上的时间结算">今年的重心</b>
        <div className="plan-chips" role="radiogroup" aria-label="今年的重心">
          {l.map(k => <button key={k} role="radio" aria-checked={S.focus === k} className={S.focus === k ? 'on' : ''} title={FOCUS[k].d} onClick={() => game.setFocus(k)}>{FOCUS[k].n}</button>)}
        </div>
      </div>
      <p className="plan-d">{cur ? cur.d + '。' : '选一项。'}随时可改，每个月按花在各项上的时间结算。</p>
    </div>
  );
}

// 人生纪录：放在一张单独滚动的卡片里，按年分组，最新的在上面，每一年的标题在滚动时吸顶。
// 记录一旦写下就不再变，所以按对象缓存
// 只有之后新出现的记录才淡入；打开页面、读档时已有的几百条直接显示
// 人生的几个关口（上幼儿园、上小学……）配一张像素小照片：当年的会动，往年的不动
const Entry = memo(({ e, anim, live }: { e: LogEntry; anim: boolean; live: boolean }) => (
  <div className={`tl ${e.k}${anim ? ' new' : ''}`}>
    <p>{e.t}{e.f && <span className="f">{e.f}</span>}</p>
    {e.pic && <LogPic id={e.pic} live={live} />}
  </div>
));
// 一年的记录。往年的记录不会再变，所以只在条数、是不是当年变了的时候才重绘：
// 记录再多，每次刷新也只重绘当年这一组
type YearItems = [LogEntry, number][];
const YearGroup = memo(({ a, items, current, initial }: { a: number; items: YearItems; current: boolean; initial: number }) => (
  <div className="yr">
    <div className="yr-h">
      <b>{a}岁</b><small>{S.birthYear + a}年</small>
      {current && <YearProgress className="yr-prog" title="这一年过了多少" />}
    </div>
    <div className="timeline">{items.map(([e, k]) => <Entry key={k} e={e} anim={k > initial} live={current} />)}</div>
  </div>
), (p, q) => p.a === q.a && p.current === q.current && p.initial === q.initial && p.items.length === q.items.length);

function Timeline() {
  const box = useRef<HTMLDivElement>(null);
  const prevH = useRef(0);
  const [away, setAway] = useState(false);
  const log = S.log, n = log.length;
  // 打开页面时已经有的记录（按序号），它们不淡入
  const initial = useRef(0);
  if (!initial.current) initial.current = n;
  // 按年龄分组；用「第几条记录」做 key（从出生往后数），新记录插在最上面时旧的不用重建
  const years: { a: number; items: YearItems }[] = [];
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
        {years.map(y => <YearGroup key={y.a} a={y.a} items={y.items} current={y.a === S.age && S.phase === 'life'} initial={initial.current} />)}
      </div>
      {away && <button className="tl-latest" type="button" onClick={() => { if (box.current) box.current.scrollTop = 0; setAway(false); }}>↑ 回到最新</button>}
    </section>
  );
}

// 右栏：分成几个标签页，不再从上到下堆一长串
const TABS = [['now', '概况'], ['docs', '证件'], ['cmp', '对照']] as const;
type Tab = typeof TABS[number][0];
const TAB_KEY = 'cn14.tab';
function SideTabs() {
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem(TAB_KEY) as Tab) || 'now'; } catch { return 'now'; } });
  const pick = (k: Tab) => { setTab(k); try { localStorage.setItem(TAB_KEY, k); } catch { /* 存不了也没关系 */ } };
  // 证件标签上提示有几份新证件（上次看证件以后发的）
  const docsN = (S.docs || []).length;
  const seen = useRef(docsN);
  if (tab === 'docs') seen.current = docsN;
  const fresh = docsN - seen.current;
  return (
    <aside className="col-side">
      <LiveScene />
      <div className="side-tabs" role="tablist">
        {TABS.map(([k, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pick(k)}>
            {n}{k === 'docs' && fresh > 0 && <i className="tab-badge" aria-label={`${fresh} 份新证件`}>{fresh}</i>}
          </button>
        ))}
      </div>
      {tab === 'now' && <><Vitals /><FamilyCards /></>}
      {tab === 'docs' && <Docs />}
      {tab === 'cmp' && <>
        <div className="sheet"><h4 className="sheet-title">一生曲线 <span className="muted small">幸福 · 健康</span></h4><Curve /></div>
        <div className="sheet"><h4 className="sheet-title">同一秒建档的人 <span className="muted small">此刻，同样的年纪</span></h4><Companions /></div>
      </>}
    </aside>
  );
}

function Dock() {
  return (
    <nav className="dock">
      <YearProgress className="dock-prog" />
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
      <SideTabs />
    </main>
    <Dock />
    <Modal />
  </div>;
}
