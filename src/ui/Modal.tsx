// 弹窗：抉择（含高考填报志愿）与自述。选定后盖一个章，再结算。
import { useEffect, useRef, useState } from 'react';
import { S, TIER_N, majorP, majorsOf, type Decision, type Pending } from '../engine';
import { game } from '../game/controller';

const STAMP_MS = 420;            // 盖章动画
const AUTO_SHOW_MS = 900;        // 自动抉择：先停一下，再标出选项
const AUTO_PICK_MS = 700;        // 标出以后再结算

/** 盖章并结算：返回 [已选的 k, 选择函数] */
function useChoose(): [string | null, (k: string) => void] {
  const [picked, setPicked] = useState<string | null>(null);
  const busy = useRef(false);
  const choose = (k: string) => {
    if (busy.current) return;
    busy.current = true;
    setPicked(k);
    setTimeout(() => game.decide(k), STAMP_MS);
  };
  return [picked, choose];
}

function Head({ d, kicker }: { d: Decision; kicker: string }) {
  return <>
    <p className="kicker">{kicker}</p><h3>{d.title}</h3><p>{d.body}</p>
    {d.card && <div className="acct pcard">{d.card.map(([k, v], i) => <div key={i}><span>{k}</span><b>{v}</b></div>)}</div>}
    {d.fact && <p className="fact">{d.fact}</p>}
  </>;
}

function DecisionSheet({ P }: { P: Extract<Pending, { type: 'dec' }> }) {
  const d = P.d;
  const [picked, choose] = useChoose();
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!S.auto) return;
    const k = game.autoChoice(P); // 同一个弹窗只抽一次，抽过会记进局日志
    let t2: number;
    const t1 = window.setTimeout(() => { setHint(k); t2 = window.setTimeout(() => choose(k), AUTO_PICK_MS); }, AUTO_SHOW_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [P]); // eslint-disable-line react-hooks/exhaustive-deps
  const on = picked || hint;
  return <>
    <Head d={d} kicker={`${S.birthYear + S.age}年 · ${S.age}岁 · 抉择`} />
    <div className="choices">
      {d.choices.map(c => (
        <button key={c.k} className={on === c.k ? 'pick' : undefined} disabled={c.off} onClick={() => choose(c.k)}>
          {c.label}{c.sub && <small>{c.sub}</small>}
        </button>
      ))}
    </div>
    {S.auto && <p className="small muted" style={{ marginTop: 10 }}>自动抉择中…</p>}
    {picked && <div className="seal stamp-in">已 定</div>}
  </>;
}

// 填报志愿：从冲/稳/保里按顺序勾选最多 3 个学校，每个学校选一个专业，再决定是否服从调剂
function Zhiyuan({ P }: { P: Extract<Pending, { type: 'dec' }> }) {
  const d = P.d, c = d.ctx;
  const [order, setOrder] = useState<number[]>([]);
  const [majors, setMajors] = useState<Record<number, string>>(() => Object.fromEntries(c.cands.map((u, i) => [i, majorsOf(u)[0].n])));
  const [adjust, setAdjust] = useState(true);
  const [picked, choose] = useChoose();
  const pc = (p: number) => p >= 0.9 ? '很稳' : p >= 0.6 ? '较稳' : p >= 0.35 ? '有希望' : '冲一冲';
  const toggle = (i: number, checked: boolean) => setOrder(o => checked ? (o.length >= 3 ? o : [...o, i]) : o.filter(x => x !== i));
  const submit = () => choose('apply:' + JSON.stringify({ apps: order.map(i => ({ i, major: majors[i] })), adjust }));
  const group = (g: string) => {
    const rows = c.cands.map((u, i) => [u, i]).filter(([u]) => u.group === g);
    if (!rows.length) return null;
    return <div key={g}><h4 className="zy-g">{g}</h4>{rows.map(([u, i]) => {
      const k = order.indexOf(i);
      return (
        <div key={i} className={'zy-row' + (k >= 0 ? ' on' : '')}>
          <label>
            <input type="checkbox" checked={k >= 0} onChange={e => toggle(i, e.target.checked)} />
            <span className="zy-ord">{k >= 0 ? `第${k + 1}志愿 ` : ''}</span>
            <b>{u.name}</b> <span className="tag">{TIER_N[u.tier]}</span><br />
            <small>{u.city} · {u.prov === S.home.p ? '本省' : '外省'}{u.fee ? ' · 学费高' : ''} · 录取把握 {Math.round(u.p * 100)}%（{pc(u.p)}）</small>
          </label>
          <select value={majors[i]} onChange={e => setMajors(m => ({ ...m, [i]: e.target.value }))}>
            {majorsOf(u).map(m => <option key={m.n} value={m.n}>{m.n}{m.heat < 0.8 ? '·热' : m.heat > 1.2 ? '·冷' : ''} {Math.round(majorP(c.rank, u, m) * 100)}%</option>)}
          </select>
        </div>
      );
    })}</div>;
  };
  return <>
    <p className="kicker">{S.age}岁 · 高考</p><h3>{d.title}</h3><p>{d.body}</p>{d.fact && <p className="fact">{d.fact}</p>}
    {c.cands.length ? <>
      <p className="small muted">按顺序勾选最多 3 个志愿（平行志愿：分数优先，按你填的顺序投档）。每个学校选一个专业。热门专业要求更高。</p>
      <div className="zy">{group('冲')}{group('稳')}{group('保')}</div>
      <label className="toggle" style={{ marginTop: 8 }}><input type="checkbox" checked={adjust} onChange={e => setAdjust(e.target.checked)} /> 服从专业调剂（不服从的话，专业没录上会被退档）</label>
    </> : <p>你的分数够不上任何学校。</p>}
    <div className="choices" style={{ marginTop: 12 }}>
      {c.cands.length > 0 && <button className={'primary-choice' + (picked?.startsWith('apply:') ? ' pick' : '')} disabled={!order.length} onClick={submit}>提交志愿</button>}
      {d.choices.filter(x => x.k !== 'apply').map(x => (
        <button key={x.k} className={picked === x.k ? 'pick' : undefined} onClick={() => choose(x.k)}>{x.label}{x.sub && <small>{x.sub}</small>}</button>
      ))}
    </div>
    {picked && <div className="seal stamp-in">已 定</div>}
  </>;
}

function Reflect({ q }: { q: string }) {
  const [text, setText] = useState('');
  return <>
    <p className="kicker">{S.birthYear + S.age}年 · {S.age}岁 · 自述</p><h3>{q}</h3>
    <p className="small muted">想一想就好。愿意的话，留一行字，它会被记在这一生里。</p>
    <textarea maxLength={300} placeholder="写点什么（可以不写）" value={text} onChange={e => setText(e.target.value)} />
    <div className="apply-actions"><button className="stamp-btn" onClick={() => game.reflect(text.trim())}>继续</button></div>
  </>;
}

export function Modal() {
  const P = S.pending;
  if (!P) return null;
  // key：每个新的抉择重新挂载，状态不会串
  const body = P.type === 'ref' ? <Reflect q={P.q} />
    : P.d.form === 'zhiyuan' && !S.auto ? <Zhiyuan P={P} />
    : <DecisionSheet P={P} />;
  return <div className="modal"><div className="sheet form-sheet" key={P.type === 'dec' ? P.id + S.age : 'ref' + S.age}>{body}</div></div>;
}
