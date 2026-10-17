// 弹窗：抉择单（含高考填报志愿）与自述。选定后在那一行盖一个「已定」章，再结算。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { S, TIER_N, calMonth, calYear, majorP, majorsOf, type Decision, type Pending } from '../engine';
import { game } from '../game/controller';
import { Photo, decScene } from './Photo';
import { fileNo } from './util';

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

const pad2 = (n: number) => String(n).padStart(2, '0');
const when = () => `${calYear()}.${pad2(calMonth())} · ${S.age} 周岁`;

/** 抉择单的头：栏目字、标题、日期；正文和附注，有配图的话放在右边 */
function Head({ k, title, children, photo }: { k: string; title: string; children?: ReactNode; photo?: ReactNode }) {
  return <>
    <div className="ds-h"><span className="k">{k}</span><h3 id="ds-title">{title}</h3><span className="meta">{when()}</span></div>
    <div className="ds-body"><div>{children}</div>{photo}</div>
  </>;
}
function Body({ d }: { d: Decision }) {
  return <>
    <p>{d.body}</p>
    {d.card && <div className="pcard">{d.card.map(([k, v], i) => <div key={i} className="row"><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>}
    {d.fact && <p className="fact"><b>附注</b>{d.fact}</p>}
  </>;
}

/** 选项：一行一个，选中的那一行盖章 */
function Choice({ n, on, picked, disabled, onClick, children }: { n: number; on: boolean; picked: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={on ? 'pick' : undefined} aria-pressed={on} disabled={disabled} onClick={onClick}>
      <span className="n">{pad2(n)}</span><span>{children}</span>
      {picked ? <span className="seal stamp-in">已定</span> : <span />}
    </button>
  );
}

function AutoFoot() {
  return (
    <div className="ds-foot">
      <span>{S.auto ? '自动抉择中…' : '选定后记入档案，不能更改。'}</span>
      <label className="chk"><input type="checkbox" checked={!!S.auto} onChange={e => game.setAuto(e.target.checked)} /> 之后自动抉择</label>
    </div>
  );
}

function DecisionSheet({ P, photo }: { P: Extract<Pending, { type: 'dec' }>; photo: ReactNode }) {
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
    <Head k="抉择" title={d.title} photo={photo}><Body d={d} /></Head>
    <div className="ds-ask"><b>请选择一项</b><span>点一下即盖章生效</span></div>
    <div className="choices">
      {d.choices.map((c, i) => (
        <Choice key={c.k} n={i + 1} on={on === c.k} picked={picked === c.k} disabled={c.off} onClick={() => choose(c.k)}>
          <span className="lb">{c.label}</span>{c.sub && <small>{c.sub}</small>}
        </Choice>
      ))}
    </div>
    <AutoFoot />
  </>;
}

// 填报志愿：从冲/稳/保里按顺序勾选最多 3 个学校，每个学校选一个专业，再决定是否服从调剂
function Zhiyuan({ P, photo }: { P: Extract<Pending, { type: 'dec' }>; photo: ReactNode }) {
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
  const rest = d.choices.filter(x => x.k !== 'apply');
  return <>
    <Head k="志愿" title={d.title} photo={photo}><p>{d.body}</p>{d.fact && <p className="fact"><b>附注</b>{d.fact}</p>}</Head>
    {c.cands.length ? <>
      <p className="note-line" style={{ marginTop: 16 }}>按顺序勾选最多 3 个志愿（平行志愿：分数优先，按你填的顺序投档）。每个学校选一个专业。热门专业要求更高。</p>
      <div className="zy">{group('冲')}{group('稳')}{group('保')}</div>
      <label className="chk" style={{ marginTop: 10 }}><input type="checkbox" checked={adjust} onChange={e => setAdjust(e.target.checked)} /> 服从专业调剂（不服从的话，专业没录上会被退档）</label>
    </> : <p style={{ marginTop: 12 }}>你的分数够不上任何学校。</p>}
    <div className="ds-ask"><b>请选择一项</b><span>点一下即盖章生效</span></div>
    <div className="choices">
      {c.cands.length > 0 && <Choice n={1} on={!!picked?.startsWith('apply:')} picked={!!picked?.startsWith('apply:')} disabled={!order.length} onClick={submit}>
        <span className="lb">提交志愿</span><small>{order.length ? `已填 ${order.length} 个志愿` : '先勾选至少一个学校'}</small>
      </Choice>}
      {rest.map((x, i) => (
        <Choice key={x.k} n={i + (c.cands.length ? 2 : 1)} on={picked === x.k} picked={picked === x.k} onClick={() => choose(x.k)}>
          <span className="lb">{x.label}</span>{x.sub && <small>{x.sub}</small>}
        </Choice>
      ))}
    </div>
    <AutoFoot />
  </>;
}

function Reflect({ q }: { q: string }) {
  const [text, setText] = useState('');
  return <>
    <Head k="自述" title="停一停"><p>{q}</p><p className="note-line">想一想就好。愿意的话，留一行字，它会被记进这一生的档案。</p></Head>
    <textarea style={{ marginTop: 14 }} maxLength={300} placeholder="写点什么（可以不写）" value={text} onChange={e => setText(e.target.value)} />
    <div className="ds-foot"><span>只保存在这个浏览器里。</span><button className="stamp-btn" type="button" onClick={() => game.reflect(text.trim())}>继续</button></div>
  </>;
}

export function Modal() {
  const P = S.pending;
  if (!P) return null;
  const scene = decScene(P);
  const photo = scene ? <Photo {...scene} /> : null;
  const body = P.type === 'ref' ? <Reflect q={P.q} />
    : P.d.form === 'zhiyuan' && !S.auto ? <Zhiyuan P={P} photo={photo} />
    : <DecisionSheet P={P} photo={photo} />;
  // 第几份抉择单：已经做过的抉择数 + 1（只读日志，不碰随机数）
  const no = S.log.reduce((n, e) => n + (e.k === 'choice' ? 1 : 0), 0) + 1;
  // key：每个新的抉择重新挂载，状态不会串
  return (
    <div className="modal">
      <div className="ds" key={P.type === 'dec' ? P.id + S.age : 'ref' + S.age}>
        <span className="ftab"><b>{P.type === 'ref' ? '自述页' : '抉择单'}</b><span className="mono">No. {fileNo(S)}{P.type === 'dec' ? ` · 第 ${pad2(no)} 份` : ''}</span></span>
        <div className="ds-sheet" role="dialog" aria-modal="true" aria-labelledby="ds-title">{body}</div>
      </div>
    </div>
  );
}
