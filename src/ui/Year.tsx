// 「这一年」：行动单和账本合成一张。左边是手头的钱和分类：做点什么（这一年怎么过、家人、生活……）、看看账（账本、父母家）；
// 右边一次只看一类。页头「行动」、三「调整」、五「看账本」都打开这一张，各自停在对应的一页。
// 打开时暂停，关上以后保持暂停（和抉择单一样，想好了玩家自己按 ▶）
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ACTS, FOCUS, PLANS, Q_WORD, S, TIERS, actState, actsShown, anyParent, closeWord, focusList, focusMore, kidClose, kidsAlive, liquidBalance,
  monthlyPay, myLiving, parClose, partnerPay, planOf, planOpt, plansShown, slotN, slotW, wan, type MonthlyStatement,
} from '../engine';
import { game } from '../game/controller';
import { famLine } from './Sidebar';
import { dots } from './util';
import './year.css';

// ===== 打开、关上（页头、三、五共用一张） =====
let openTab: string | null = null;
const ls = new Set<() => void>();
const ping = () => ls.forEach(f => f());
export function openYear(tab = 'plan') { openTab = tab; ping(); }
function closeYear() { openTab = null; ping(); }
const useOpenTab = () => useSyncExternalStore(f => { ls.add(f); return () => { ls.delete(f); }; }, () => openTab);
/** 挂在一生页面上：有人打开时才显示 */
export function YearHost() {
  const tab = useOpenTab();
  if (!tab || S.phase !== 'life' || !S.indep) return null;
  return <YearSheet key={tab} tab0={tab} />;
}

const GROUPS = [['kin', '家人'], ['life', '生活'], ['health', '健康'], ['money', '理财'], ['study', '学习']] as const;
const STAT = [['hl', '健康'], ['h', '幸福'], ['so', '人际'], ['kn', '学识']] as const;
const STAT_N: Record<string, string> = { h: '幸福', hl: '健康', kn: '学识', so: '人际' };
const arrows = (e?: Record<string, number>) => e ? Object.entries(e).filter(([, v]) => v).map(([k, v]) => STAT_N[k] + (v > 0 ? '↑' : '↓')).join(' ') : '';
const yuan = (x: number) => Math.round(x).toLocaleString('zh-CN');
const signed = (x: number) => (Math.round(x) > 0 ? '+' : Math.round(x) < 0 ? '−' : '') + yuan(Math.abs(x));
const bills = (): MonthlyStatement[] => S.statements?.length ? S.statements : S.statement ? [S.statement] : [];

/** 照现在的设置过，一个月进多少、花多少、剩多少（按最近一次结算的收入和住房，生活开销按现在选的档） */
function perMonth() {
  const bill = S.statement, f = S.fam, mate = f.married && f.partner?.alive ? f.partner : null;
  const income = bill ? bill.income : monthlyPay().net + ((S.flags.rehire?.inc || 0) + (mate ? partnerPay(mate).net : 0)) / 12;
  const live = myLiving(planOf('style') || 'normal').cost;
  const other = plansShown().filter(k => k !== 'style').reduce((t, k) => t + (planOpt(k)?.monthly?.() || 0), 0);
  const rent = bill ? bill.rent : 0, loan = bill ? bill.mortgage : 0;
  return { income, live, other, rent, loan, left: income - live - other - rent - loan };
}
/** 这一年对体检与鉴定的影响（一整年的量）：格子 + 持续的计划 */
function yearFx() {
  const fx: Record<string, number> = { hl: 0, h: 0, kn: 0, so: 0 };
  for (const k of new Set(S.slots || [])) if (k && FOCUS[k]) for (const [st, v] of Object.entries(FOCUS[k].e)) fx[st] += (v as number) * slotW(k);
  for (const k of plansShown()) { const e = planOpt(k)?.e; if (e) for (const [st, v] of Object.entries(e)) fx[st] += v as number; }
  return fx;
}

function YearSheet({ tab0 }: { tab0: string }) {
  const [tab, setTab] = useState(tab0);
  useEffect(() => {
    if (!game.paused) game.togglePause(); // 走正式的暂停：页头跟着变成 ▶，局日志里也记一笔
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeYear(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  const pm = perMonth();
  const acts = actsShown();
  const groups = GROUPS.filter(([g]) => acts.some(k => ACTS[k].g === g)).map(([g, n]) => {
    const st = acts.filter(k => ACTS[k].g === g).map(actState), ok = st.filter(x => x.ok).length;
    return { g, n, ok, r: ok ? '' : st.some(x => x.why === '手头的钱不够') ? '钱不够' : '做过了' };
  });
  const last = S.statement;
  const nav = (k: string, label: string, right?: React.ReactNode, badge?: number) =>
    <button key={k} type="button" role="tab" aria-selected={tab === k} className={'yr-nb' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
      {label}{badge ? <span className="yr-n">{badge}</span> : right != null && <span className="yr-r">{right}</span>}
    </button>;
  return (
    <div className="modal yr-modal" onClick={e => { if (e.target === e.currentTarget) closeYear(); }}>
      <div className="yr-win">
        <div className="yr-top"><span className="ftab"><b>这一年</b><span className="mono">{S.age} 岁</span></span><span className="yr-paused">时间已暂停</span></div>
        <div className="yr-dlg" role="dialog" aria-label="这一年">
          <aside className="yr-side">
            <div className="yr-cash">
              <span>手头</span>
              <b className="mono">{yuan(S.money)}<i>元</i></b>
              <small>每月剩 <span className={'mono ' + (pm.left >= 0 ? 'up' : 'dn')}>{signed(pm.left)}</span>{S.debt > 0 ? <> · <span className="dn">欠 {wan(S.debt)}</span></> : ' · 没有欠款'}</small>
            </div>
            <nav className="yr-nav" role="tablist" aria-label="这一年">
              <div className="yr-grp-n">
                <div className="yr-ng"><span>做点什么</span></div>
                {nav('plan', '这一年怎么过')}
                {groups.map(x => nav(x.g, x.n, x.r, x.ok))}
              </div>
              <div className="yr-grp-n see">
                <div className="yr-ng"><span>看看账</span></div>
                {nav('book', '账本', last ? <span className="mono">{signed(last.closing - last.opening)}</span> : '')}
                {anyParent() && nav('par', '父母家', closeWord(parClose()))}
              </div>
            </nav>
          </aside>
          <section className="yr-main">
            <button type="button" className="yr-x" aria-label="关上，游戏保持暂停" onClick={closeYear}>×</button>
            {tab === 'plan' ? <PlanPage pm={pm} />
              : tab === 'book' ? <BookPage />
              : tab === 'par' ? <ParPage go={() => setTab('kin')} />
              : <ActPage g={tab} title={GROUPS.find(x => x[0] === tab)?.[1] || ''} />}
          </section>
        </div>
      </div>
    </div>
  );
}

// ===== 这一年怎么过：时间格子 + 持续的计划，右边是照这样过的结果 =====
function PlanPage({ pm }: { pm: ReturnType<typeof perMonth> }) {
  const n = slotN(), slots = S.slots || [], l = focusList();
  const ORDER = ['style', 'gym', 'checkup'];
  const spend = plansShown().filter(k => PLANS[k].g !== 'money').sort((p, q) => (ORDER.indexOf(p) + 99) % 99 - (ORDER.indexOf(q) + 99) % 99), save = plansShown().filter(k => PLANS[k].g === 'money');
  const fx = yearFx();
  const out = pm.live + pm.other + pm.rent + pm.loan, base = Math.max(pm.income, out, 1);
  const seg: [string, number, string][] = ([['过日子', pm.live, 'var(--kraft)'], ['房租', pm.rent, '#8FA9C9'], ['房贷', pm.loan, '#8FA9C9'], ['计划', pm.other, 'var(--so)'], ['剩下', Math.max(0, pm.left), 'var(--good)']] as [string, number, string][]).filter(x => x[1] >= 1);
  const opt = (k: string) => {
    const P = PLANS[k], cur = planOf(k);
    return <div key={k} className="yr-row">
      <span className="yr-rk">{P.n === '生活方式' ? '过日子' : P.n === '定期体检' ? '体检' : P.n === '理财' ? '钱放在' : P.n}</span>
      <div className="yr-seg" role="radiogroup" aria-label={P.n}>
        {P.opts.map(o => {
          const m = k === 'style' ? myLiving(o.k).cost : o.monthly?.() || 0, a = arrows(o.e);
          return <button key={o.k} type="button" role="radio" aria-checked={cur === o.k} className={cur === o.k ? 'on' : ''} title={o.sub?.()}
            onClick={() => { if (cur !== o.k) game.plan(k, o.k); }}>
            {o.label.replace(/^办张健身卡，?常去$/, '办卡常去').replace(/^每年全面/, '每年')}{(m > 0 || a) && <i>{[m > 0 && yuan(m), a].filter(Boolean).join(' · ')}</i>}
          </button>;
        })}
      </div>
    </div>;
  };
  return <>
    <div className="yr-hd"><h3>这一年怎么过</h3></div>
    <div className="yr-cols">
      <div>
        {n > 0 && <div className="yr-grp">
          <div className="yr-gt">时间</div>
          {Array.from({ length: n }, (_, i) => <div key={i} className="yr-row">
            <span className="yr-rk">{n > 1 ? `第${i ? '二' : '一'}格` : '重心'}</span>
            <div className="yr-seg7" role="radiogroup" aria-label={`第${i ? '二' : '一'}格`} style={{ gridTemplateColumns: `repeat(${l.length}, minmax(0, 1fr))` }}>
              {l.map(k => <button key={k} type="button" role="radio" aria-checked={slots[i] === k} className={slots[i] === k ? 'on' : ''} title={FOCUS[k].d} onClick={() => game.setSlot(i, k)}>{FOCUS[k].n}</button>)}
            </div>
            {slots[i] && focusMore(slots[i]) && <p className="yr-why">{focusMore(slots[i])}</p>}
          </div>)}
        </div>}
        {spend.length > 0 && <div className="yr-grp"><div className="yr-gt">花钱</div>{spend.map(opt)}</div>}
        {save.length > 0 && <div className="yr-grp"><div className="yr-gt">存钱</div>{save.map(opt)}</div>}
      </div>
      <aside className="yr-res">
        <h4>这样过，每个月</h4>
        <div className={'yr-big mono ' + (pm.left >= 0 ? 'up' : 'dn')}>{signed(pm.left)}<i>元</i></div>
        <div className="yr-bar">{seg.map(([k, v, c]) => <u key={k} style={{ width: (v / base * 100) + '%', background: c }} />)}</div>
        <div className="yr-leg">{seg.map(([k, v, c]) => <div key={k}><i style={{ background: c }} /><span>{k}</span><b className="mono">{yuan(v)}</b></div>)}</div>
        <p className="yr-sm">到手 {yuan(pm.income)} · 一年后约 {wan(Math.max(0, S.money + pm.left * 12))}</p>
        {TIERS[myLiving(planOf('style') || 'normal').tier] && <p className="yr-sm">过日子算「{TIERS[myLiving(planOf('style') || 'normal').tier].n}」</p>}
        <h4 style={{ marginTop: 18 }}>一年下来</h4>
        <div className="yr-fx">{STAT.map(([k, n]) => {
          const v = Math.round(fx[k] * 10) / 10;
          return <div key={k}><span>{n}</span><b className={'mono ' + (v > 0 ? 'up' : v < 0 ? 'dn' : '')}>{v > 0 ? '+' : v < 0 ? '−' : ''}{Math.abs(v)}</b></div>;
        })}</div>
      </aside>
    </div>
  </>;
}

// ===== 一次性的行动：一类一页 =====
function ActPage({ g, title }: { g: string; title: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const keys = actsShown().filter(k => ACTS[k].g === g);
  const doIt = (k: string) => { const n0 = S.log.length; game.act(k); setSaid(S.log.length > n0 ? S.log[0].t : null); };
  const kids = kidsAlive().filter(k => k.age >= 18);
  return <>
    <div className="yr-hd"><h3>{title}</h3></div>
    <div className={g === 'kin' ? 'yr-cols' : ''}>
      <div>
        {keys.map(k => {
          const A = ACTS[k], st = actState(k), short = st.why === '手头的钱不够' ? st.cost - liquidBalance() : 0;
          return <div key={k} className={'yr-act' + (st.ok ? '' : ' off')}>
            <div><b>{A.n}</b><span>{A.d()}</span>
              {A.fx && <span className="yr-afx">{A.fx().map(t => <em key={t} className={/[+↑]/.test(t) ? 'up' : /[−↓]/.test(t) ? 'dn' : undefined}>{t}</em>)}</span>}</div>
            <div className="yr-am"><span className="mono">{st.cost > 0 ? '约 ' + wan(st.cost) : '不花钱'}</span>
              {!st.ok && <small className={short > 0 ? 'dn' : undefined}>{short > 0 ? `还差 ${wan(short)}` : st.why === '今年已经做过了' ? '今年做过了' : st.why}</small>}</div>
            <button type="button" className="yr-go" disabled={!st.ok} onClick={() => doIt(k)}>去做</button>
          </div>;
        })}
        {said && <p className="yr-said">{said}</p>}
      </div>
      {g === 'kin' && <aside className="yr-res">
        {anyParent() && <><h4>和爸妈</h4><div className="yr-close">{closeWord(parClose())}</div><div className="yr-meter"><u style={{ width: parClose() + '%' }} /></div></>}
        {kids.map((k, i) => <div key={i} style={{ marginTop: 14 }}><h4>和{k.name}</h4><div className="yr-close">{closeWord(kidClose(k))}</div><div className="yr-meter"><u style={{ width: kidClose(k) + '%' }} /></div></div>)}
      </aside>}
    </div>
  </>;
}

// ===== 账本：每年年底的存款走势 + 近 12 个月，点一个月看明细 =====
function BookPage() {
  const all = bills();
  const recent = all.slice(-12);
  const [sel, setSel] = useState(recent.length - 1);
  if (!all.length) return <><div className="yr-hd"><h3>账本</h3></div><p className="yr-sm" style={{ marginTop: 12 }}>—</p></>;
  const b = recent[Math.min(sel, recent.length - 1)];
  // 每年最后一张账单的期末现金
  const ends = new Map<number, number>();
  for (const x of all) ends.set(x.year, x.closing);
  const ys = [...ends.keys()], vs = [...ends.values()], top = Math.max(1, ...vs);
  const W = 470, H = 150, X = (i: number) => 44 + (ys.length > 1 ? i / (ys.length - 1) : 0.5) * (W - 54), Y = (v: number) => 128 - v / top * 112;
  const step = Math.max(1, Math.ceil(ys.length / 8));
  const ch = recent.map(x => x.closing - x.opening), mx = Math.max(1, ...ch.map(v => Math.abs(v)));
  // 这个月的明细：收入拆开写谁挣的；「其他」拆成事件（大笔的写出名目）、家里往来、利息；为 0 的不写
  const inc = b.incomeDetails, mv = (S.moves || []).filter(x => x.y === b.year && x.m === b.month);
  const evLeft = b.events - mv.reduce((t, x) => t + x.x, 0);
  type Line = [string, number, boolean?]; // 名目、金额、是不是缩进的分项
  const lines: Line[] = [['到手', b.income]];
  if (inc) {
    const parts: [string, number][] = [['本人', inc.personal], ['配偶', inc.partner], ['返聘', inc.rehire], ['低保', inc.aid || 0]];
    const shown = parts.filter(([, v]) => Math.round(v) !== 0);
    if (shown.length > 1) for (const [k, v] of shown) lines.push([k, v, true]);
  }
  lines.push([`过日子（${TIERS[b.tier ?? 1]?.n || ''}）`, -b.living], ['持续的计划', -(b.plans || 0)], ['房租', -b.rent], ['房贷', -b.mortgage], ['还欠款', -b.debtRepaid]);
  for (const x of mv) lines.push([x.t, x.x]);
  lines.push([mv.length ? '其他事件' : '事件', evLeft], ['家里往来', b.transfers], ['利息', b.depositInterest]);
  const rows = lines.filter(([, v]) => Math.round(v) !== 0);
  const notes: string[] = [];
  if (b.mortgageHpf > 1) notes.push(`公积金另付房贷 ${yuan(b.mortgageHpf)}`);
  if (b.mortgageInterest > 1) notes.push(`房贷利息 ${yuan(b.mortgageInterest)}，计入贷款`);
  if (b.debtInterest > 1) notes.push(`欠款利息 ${yuan(b.debtInterest)}`);
  // 这个月时间线上发生的事（不算日常片段）
  const said = S.log.filter(e => e.y === b.year && e.m === b.month && e.k !== 'day').slice(0, 3);
  return <>
    <div className="yr-hd"><h3>账本</h3><span className="yr-s">共 {all.length} 个月</span></div>
    <div className="yr-cols">
      <div>
        <div className="yr-gt">存款<small>每年年底</small></div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="每年年底的现金" className="yr-trend">
          {[0, .5, 1].map(f => <g key={f}><line x1="34" x2={W} y1={Y(top * f)} y2={Y(top * f)} /><text x="0" y={Y(top * f) + 4}>{f ? wan(top * f) : '0'}</text></g>)}
          <polyline points={vs.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')} />
          {ys.map((y, i) => (i % step === 0 || i === ys.length - 1) && <text key={y} className="x" x={X(i)} y={H - 2} textAnchor="middle">{String(y).slice(2)}</text>)}
        </svg>
        <div className="yr-gt" style={{ marginTop: 14 }}>每月<small>近 {recent.length} 个月</small></div>
        <div className="yr-mb" role="radiogroup" aria-label="近几个月的结余">
          {recent.map((x, i) => {
            const v = ch[i];
            return <button key={i} type="button" role="radio" aria-checked={i === sel} className={'yr-mc' + (i === sel ? ' on' : '')} title={`${x.year}年${x.month}月 ${signed(v)}`} onClick={() => setSel(i)}>
              <span className="pos"><u style={{ height: v > 0 ? (v / mx * 100) + '%' : 0 }} /></span>
              <span className="neg"><u style={{ height: v < 0 ? (-v / mx * 100) + '%' : 0 }} /></span>
              <small>{x.month}月</small>
            </button>;
          })}
        </div>
      </div>
      <aside className="yr-res">
        <h4>{b.year} 年 {b.month} 月</h4>
        <div className={'yr-big mono ' + (b.closing >= b.opening ? 'up' : 'dn')}>{signed(b.closing - b.opening)}<i>元</i></div>
        <div className="yr-sl-w">
          <div className="yr-sl sub"><span>月初现金</span><b className="mono">{yuan(b.opening)}</b></div>
          {rows.map(([k, v, sub], i) => <div key={i} className={'yr-sl' + (sub ? ' sub' : '')}><span>{k}</span><b className={'mono ' + (v > 0 && !sub ? 'up' : '')}>{signed(v)}</b></div>)}
          <div className="yr-sl tot"><span>月底现金</span><b className="mono">{yuan(b.closing)}</b></div>
        </div>
        {notes.map(t => <p key={t} className="yr-sm">{t}</p>)}
        {b.debt > 1 && <p className="yr-sm dn">月底欠 {yuan(b.debt)}</p>}
        {b.arrears > 1 && <p className="yr-sm dn">房贷逾期 {yuan(b.arrears)}</p>}
        {b.shortfall > 1 && <p className="yr-sm dn">缺口 {yuan(b.shortfall)}</p>}
        {said.length > 0 && <div className="yr-said-m">{said.map((e, i) => <p key={i}>{e.k === 'choice' ? e.t.replace(/[？?]? —— /, '：') : e.t}</p>)}</div>}
      </aside>
    </div>
  </>;
}

// ===== 父母家 =====
function ParPage({ go }: { go: () => void }) {
  const f = S.fam, H = S.famHouse;
  const ages = (['dad', 'mom'] as const).filter(w => f[w].alive).map(w => f[w].age);
  return <>
    <div className="yr-hd"><h3>父母家</h3>{H?.where && <span className="yr-s">{H.where}</span>}</div>
    <div className="yr-kp4">
      <div><span>家境</span><b className="dots">{dots(S.q)}</b><small>{Q_WORD[S.q]}</small></div>
      <div><span>爸妈</span><b>{ages.length === 2 && ages[0] === ages[1] ? `都 ${ages[0]} 岁` : ages.join(' · ') + ' 岁'}</b></div>
      <div><span>存款</span><b className={'mono' + ((S.famMoney || 0) < 0 ? ' dn' : '')}>{wan(S.famMoney || 0)}</b>{S.famDebt > 0 && <small className="dn">欠 {wan(S.famDebt)}</small>}</div>
      <div><span>和你</span><b>{closeWord(parClose())}</b></div>
    </div>
    <p className="yr-line">{famLine()}</p>
    {S.flags.supportY > 0 && <p className="yr-line">你每年给他们寄生活费，累计约 {wan(S.stats.support || 0)}。</p>}
    <button type="button" className="yr-link" onClick={go}>回家看看 · 给爸妈钱 ›</button>
  </>;
}
