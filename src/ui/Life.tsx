// 一生：页头（档案号、播放控制）；左栏 一、基本情况 二、体检与鉴定；中栏 三、本年度时间安排 四、大事记；
// 右栏 五、我的经济 六、收支账本，底下是材料目录 / 同批建档 / 一生曲线。手机上是单栏，下面用五个标签切换。
import { memo, useEffect, useRef, useState } from 'react';
import { FOCUS, PLANS, S, focusMore, calYear, carer, focusList, planOpt, plansShown, slotN, type LogEntry, type MonthlyStatement } from '../engine';
import { SPEEDS, game } from '../game/controller';
import { Modal } from './Modal';
import { LogPic } from './Photo';
import { YearProgress } from './Progress';
import { RunId } from './RunId';
import { VersionTag } from './Version';
import { ActionsButton, PendingFloat } from './Actions';
import { YearHost, openYear, perMonth, yearFx } from './Year';
import { Account, ArchiveTabs, Basic, Body, FamilySec } from './Sidebar';
import { TimelineFinance, statementAge } from './Finance';
import { cnNum, fileNo } from './util';

// ===== 页头：档案号、播放控制（▶、倍速、快进）、更多（自动抉择、离开）；「行动」在三、计划上 =====
function Menu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', off, true);
    return () => document.removeEventListener('click', off, true);
  }, [open]);
  return (
    <div className="menu-w" ref={box}>
      <button className="ctl ghost" type="button" aria-label="更多" aria-expanded={open} onClick={() => setOpen(o => !o)}>···</button>
      {open && <div className="menu" role="menu">
        <label className="chk m-auto" title="开着的时候，抉择会按这个人的性格替你选"><input type="checkbox" checked={!!S.auto} onChange={e => game.setAuto(e.target.checked)} /> 自动抉择</label>
        {import.meta.env.DEV && <button type="button" onClick={() => game.exportRun()}>下载这一局的日志</button>}
        <button type="button" onClick={() => game.quit()}>离开（会保存）</button>
        <RunId />
      </div>}
    </div>
  );
}

const PauseIcon = () => <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true"><rect width="3.5" height="12" /><rect x="6.5" width="3.5" height="12" /></svg>;
const PlayIcon = () => <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor" aria-hidden="true"><path d="M0 0l11 6-11 6z" /></svg>;

function Header() {
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(game.speed) + 1) % SPEEDS.length];
  return (
    <header className="lhead">
      <span className="brand-s">14亿分之<span>1</span></span>
      <span className="ftab"><b>人生档案</b><span className="mono">{fileNo(S)}</span></span>
      <span className="lid">立档 {S.birthYear}.{String(S.birthMonth).padStart(2, '0')}</span>
      <div className="ctrls">
        <button className={'ctl' + (game.paused ? ' on' : '')} type="button" aria-label={game.paused ? '继续' : '暂停'} title="暂停/继续" onClick={() => game.togglePause()}>{game.paused ? <PlayIcon /> : <PauseIcon />}</button>
        <div className="spd">{SPEEDS.map(v => <button key={v} type="button" className={'ctl mono' + (game.speed === v ? ' on' : '')} onClick={() => game.setSpeed(v)}>{v}×</button>)}</div>
        <button className="ctl mono spd1" type="button" aria-label={`速度 ${game.speed} 倍，点一下换成 ${nextSpeed} 倍`} onClick={() => game.setSpeed(nextSpeed)}>{game.speed}×</button>
        <button className={'ctl primary' + (game.ff ? ' on' : '')} type="button" title="快进到下一件人生大事（升学、结婚、生子、亲人离世……）；遇到要你决定的事也会停下" onClick={() => game.fastForward()}>快进</button>
      </div>
      <VersionTag />
      <Menu />
    </header>
  );
}

// ===== 三、本年度时间安排 =====
// 6–17 岁 1 格、18 岁起 2 格（engine/focus.ts）。点一格展开选项，选完收起；两格可以放同一件事（全力投入，第二格打折）
export const FOCUS_C: Record<string, string> = { study: 'var(--kn)', play: 'var(--h)', friends: 'var(--so)', sport: 'var(--hl)', work: 'var(--ink2)', love: '#C2557A', family: 'var(--kraft)', hobby: '#2F8C8C', rest: '#7C9A5E' };
const STAT_N: Record<string, string> = { h: '幸福', hl: '健康', kn: '学识', so: '人际' };
const STAT_C: Record<string, string> = { h: 'var(--h)', hl: 'var(--hl)', kn: 'var(--kn)', so: 'var(--so)' };
// 选项旁边的箭头：这一项让哪几项状态升（↑）或降（↓）
const Arrows = ({ k }: { k: string }) => <span className="fx">{(Object.entries(FOCUS[k].e) as [string, number][]).map(([st, v]) =>
  <span key={st} style={{ color: STAT_C[st] }}>{STAT_N[st]}{v > 0 ? '↑' : '↓'}</span>)}</span>;
function FocusPlan() {
  const l = focusList(), n = slotN(), slots = S.slots || [];
  const [open, setOpen] = useState<number | null>(null);
  if (!l.length || !n) return (
    <section className="pg plan">
      <div className="sec"><span className="no">三</span><h3>本年度时间安排</h3></div>
      <p className="plan-d" style={{ margin: 0 }}>还小，由{carer()}带着。</p>
    </section>
  );
  const at = open != null && open < n ? open : null;
  if (S.indep && S.age >= 18) return <YearPlan />;
  return (
    <section className="pg plan">
      <div className="sec"><span className="no">三</span><h3>本年度时间安排</h3><small>{n > 1 ? '两格 · 可以放同一件事' : '一格'} · 随时可改</small></div>
      <div className="slots">
        {Array.from({ length: n }, (_, i) => {
          const k = slots[i];
          return <button key={i} type="button" className={'slot' + (at === i ? ' on' : '')} aria-expanded={at === i} style={{ '--c': k ? FOCUS_C[k] : 'var(--muted)' } as React.CSSProperties}
            aria-label={`${n > 1 ? `第${i ? '二' : '一'}格` : '今年的重心'}：${k ? FOCUS[k].n : '空'}，点一下修改`} onClick={() => setOpen(at === i ? null : i)}>
            {n > 1 && <span className="slot-n">{i ? '二' : '一'}</span>}<i /><span className="slot-v">{k ? FOCUS[k].n : '—'}</span>
            {k && <span className="slot-more">{focusMore(k)}</span>}<span className="slot-edit" aria-hidden="true">改</span>
          </button>;
        })}
      </div>
      {at != null && <div className="picks" role="radiogroup" aria-label={n > 1 ? `第${at ? '二' : '一'}格放在哪里` : '今年的重心放在哪里'}>
        {l.map(k => <button key={k} type="button" role="radio" aria-checked={slots[at] === k} className={'pick' + (slots[at] === k ? ' on' : '')} title={FOCUS[k].d}
          style={{ '--c': FOCUS_C[k] } as React.CSSProperties} onClick={() => { game.setSlot(at, k); setOpen(null); }}>
          <span className="pick-h"><i />{FOCUS[k].n}{n > 1 && slots[at ? 0 : 1] === k && <small>（全力投入）</small>}<Arrows k={k} /></span>
          <span className="pick-d">{focusMore(k)}</span>
        </button>)}
      </div>}
    </section>
  );
}

// 经济独立以后：三 只列出现在怎么过（两格 + 持续的计划），点「调整」在「这一年」里改
const PLAN_N: Record<string, string> = { style: '过日子', gym: '健身', checkup: '体检', invest: '钱放在' };
const PLAN_I = (k: string) => { const i = Object.keys(PLAN_N).indexOf(k); return i < 0 ? 99 : i; };
function YearPlan() {
  const n = slotN(), slots = (S.slots || []).slice(0, n);
  const same = n > 1 && slots[0] && slots[0] === slots[1];
  const fx = yearFx(), pm = perMonth();
  const plans = plansShown().sort((p, q) => PLAN_I(p) - PLAN_I(q));
  const STATS = [['hl', '健康'], ['h', '幸福'], ['so', '人际'], ['kn', '学识']] as const;
  const num = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v * 10) / 10);
  return (
    <section className="pg plan year-plan">
      <div className="sec"><span className="no">三</span><h3>计划</h3><span className="yp-acts"><ActionsButton /><button type="button" className="ctl" onClick={() => openYear('plan')}>调整</button></span></div>
      <button type="button" className="yp" onClick={() => openYear('plan')} aria-label="打开计划">
        <span className="yp-k">时间</span>
        <span className="yp-v yp-time">
          {(same ? [slots[0]] : slots).map((k, i) => <span key={i} className="yp-slot" style={{ '--c': k ? FOCUS_C[k] : 'var(--muted)' } as React.CSSProperties}><i /><b>{k ? FOCUS[k].n : '—'}</b>{same && <em>两格</em>}</span>)}
        </span>
        <span className="yp-k">花钱</span>
        <span className="yp-v yp-money">
          {plans.map(k => { const o = planOpt(k); return o && <span key={k}><em>{PLAN_N[k] || PLANS[k].n}</em>{o.label.replace(/^办张健身卡，?常去$/, '办卡常去').replace(/^每年全面/, '每年')}</span>; })}
        </span>
        <span className="yp-k">一年</span>
        <span className="yp-v yp-out">
          {STATS.map(([k, t]) => Math.round(fx[k] * 10) !== 0 && <span key={k} className={fx[k] > 0 ? 'money-up' : 'neg'}>{t} {num(fx[k])}</span>)}
          <span className="yp-left">每月 <b className={'mono ' + (pm.left >= 0 ? 'money-up' : 'neg')}>{(pm.left >= 0 ? '+' : '−') + Math.abs(Math.round(pm.left)).toLocaleString('zh-CN')}</b></span>
        </span>
      </button>
    </section>
  );
}

// ===== 四、大事记 =====
// 记录一旦写下就不再变，所以按对象缓存；只有之后新出现的记录才淡入
// 人生的几个关口（上幼儿园、上小学……）配一张像素小照片：当年的会动，往年的不动
const Entry = memo(({ e, anim, live }: { e: LogEntry; anim: boolean; live: boolean }) => {
  const kind = (e.pic ? 'big' : e.k) + (e.x ? ' major' : '');
  // 抉择写成「标题 —— 选项」：标题前盖一个「定」
  const dec = e.k === 'choice' ? e.t.split(' —— ') : null;
  return (
    <div className={`tl ${kind}${anim ? ' new' : ''}`}>
      <span className="t">{e.m}月</span>
      <div className="tx">
        <div>
          <p>{dec && dec.length === 2 ? <><span className="chop">定</span><span className="dec-t">{dec[0]}</span>{dec[1]}</> : e.t}</p>
          {e.f && <span className="f">{e.f}</span>}
        </div>
        {e.pic && <LogPic id={e.pic} live={live} />}
      </div>
    </div>
  );
});
type YearItems = [LogEntry, number][];
// 一个年龄年从生日那个月开始，常常跨两个公历年：标题写这一年的记录实际落在哪几年（当年再算上现在这一年），如「2043–44」
function yearSpan(items: YearItems, bills: MonthlyStatement[], now: number) {
  let y0 = now || Infinity, y1 = now || -Infinity;
  for (const [e] of items) { y0 = Math.min(y0, e.y); y1 = Math.max(y1, e.y); }
  for (const bill of bills) { y0 = Math.min(y0, bill.year); y1 = Math.max(y1, bill.year); }
  if (y0 === Infinity) return '';
  return y0 === y1 ? `${y0}` : `${y0} – ${Math.floor(y0 / 100) === Math.floor(y1 / 100) ? String(y1 % 100).padStart(2, '0') : y1}`;
}
const YearGroup = memo(({ a, items, bills, current, now, initial }: { a: number; items: YearItems; bills: MonthlyStatement[]; current: boolean; now: number; initial: number }) => (
  <div className="yr">
    <div className="yr-h">
      <b>{cnNum(a)}岁</b><small>{yearSpan(items, bills, now)}</small>
      {current && <YearProgress className="yr-prog" title="这一年过了多少" />}
    </div>
    <TimelineFinance bills={bills} completed={a < S.age} age={a} />
    {items.map(([e, k]) => <Entry key={k} e={e} anim={k > initial} live={current} />)}
  </div>
), (p, q) => p.a === q.a && p.current === q.current && p.now === q.now && p.initial === q.initial && p.items.length === q.items.length
  && p.bills.length === q.bills.length && p.bills[p.bills.length - 1] === q.bills[q.bills.length - 1]);

export function Timeline() {
  const box = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [oldestLoadedAge, setOldestLoadedAge] = useState<number | null>(null);
  const minimumAge = Math.max(0, Math.min(S.age - 2, oldestLoadedAge ?? S.age - 2));
  const log = S.log, n = log.length;
  const bills = S.statements?.length ? S.statements : S.statement ? [S.statement] : [];
  // 打开页面时已经有的记录（按序号），它们不淡入
  const initial = useRef(0);
  if (!initial.current) initial.current = n;
  // 按年龄分组；用「第几条记录」做 key（从出生往后数），新记录插在最上面时旧的不用重建
  const groups = new Map<number, { a: number; items: YearItems; bills: MonthlyStatement[] }>();
  const older = new Set<number>();
  const group = (age: number) => {
    if (!groups.has(age)) groups.set(age, { a: age, items: [], bills: [] });
    return groups.get(age);
  };
  log.forEach((e, i) => {
    if (e.a < minimumAge) older.add(e.a);
    else group(e.a).items.push([e, n - i]);
  });
  for (const bill of bills) {
    const age = statementAge(bill, S.birthYear, S.birthMonth);
    if (age < minimumAge) older.add(age);
    else group(age).bills.push(bill);
  }
  if (S.phase === 'life') group(S.age);
  const years = [...groups.values()].sort((first, second) => second.a - first.a);
  const olderAges = [...older].sort((first, second) => second - first);
  const nextCount = Math.min(6, olderAges.length);
  return (
    <section className="pg tl-card" data-m="log">
      <div className="sec">
        <span className="no">四</span><h3>大事记</h3><small>共 {n} 条</small>
      </div>
      <div className="tl-scroll" ref={box} onScroll={event => setScrolled(event.currentTarget.scrollTop > 8)}>
        {years.map(y => { const cur = y.a === S.age && S.phase === 'life'; return <YearGroup key={y.a} a={y.a} items={y.items} bills={y.bills} current={cur} now={cur ? calYear() : 0} initial={initial.current} />; })}
        {nextCount > 0 && <button className="tl-more" type="button" onClick={() => setOldestLoadedAge(olderAges[nextCount - 1])}>
          加载更早{nextCount}年<small>还有 {olderAges.length} 年记录未加载</small>
        </button>}
      </div>
      <button className={'tl-top' + (scrolled ? ' visible' : '')} type="button" onClick={() => { if (box.current) box.current.scrollTop = 0; }}>↑ 回到最新</button>
    </section>
  );
}

// ===== 手机上的标签 =====
const MTABS = [['log', '大事记'], ['body', '体检'], ['home', '家与钱'], ['doc', '材料'], ['peer', '同批']] as const;
type MTab = typeof MTABS[number][0];

export function Life() {
  const [mtab, setMtab] = useState<MTab>('log');
  return <div className={'life-app m-' + mtab}>
    <Header />
    <main className="lbody">
      <div className="col col-l"><Basic /><Body m="body" /></div>
      <div className="col col-c"><FocusPlan /><Timeline /></div>
      <nav className="mtabs" role="tablist">
        {MTABS.map(([k, n]) => <button key={k} type="button" role="tab" aria-selected={mtab === k} className={mtab === k ? 'on' : ''} onClick={() => setMtab(k)}>{n}</button>)}
      </nav>
      <div className="col col-r"><Account m="home" /><FamilySec m="home" /><ArchiveTabs mtab={mtab} /></div>
    </main>
    <Modal />
    <YearHost />
    <PendingFloat />
  </div>;
}
