// 「怎么算的」弹出卡片：点小 i 打开，点 ×、点别处、按 Esc 或滚动页面时关闭。手机上从底部弹出。
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { buildTip, type Term, type Tip } from './tips';

interface Open { key: string; anchor: HTMLElement; tip: Tip }
let open: Open | null = null;
const listeners = new Set<() => void>();
const set = (o: Open | null) => { open = o; for (const f of listeners) f(); };
const useOpen = () => useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f); }; }, () => open);
const isMobile = () => window.matchMedia('(max-width: 640px)').matches;

/** 数字旁边的小 i；k 形如 "famQuint" 或 "parentInc:dad" */
export function Ib({ k }: { k: string }) {
  const cur = useOpen();
  const shown = !!cur && cur.key === k;
  return (
    <button
      className={'ib' + (shown ? ' shown' : '')} type="button" aria-label="怎么算的"
      onClick={e => {
        e.stopPropagation(); e.preventDefault();
        if (shown) return set(null);
        const tip = buildTip(k);
        if (tip) set({ key: k, anchor: e.currentTarget, tip });
      }}
    >i</button>
  );
}

const TermView = ({ x }: { x: Term }) => typeof x === 'string'
  ? <span className="tp-op">{x}</span>
  : <span className="tp-t"><b>{x.v}</b><small>{x.l}</small></span>;

export function TipLayer() {
  const cur = useOpen();
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!cur) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node) && !(e.target as Element).closest('.ib')) set(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') set(null); };
    const onScroll = () => { if (!isMobile()) set(null); };
    document.addEventListener('click', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('click', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  }, [cur]);

  // 放在图标下方，放不下就放上方；不超出屏幕左右
  useLayoutEffect(() => {
    if (!cur || !box.current || isMobile()) { setPos(null); return; }
    const r = cur.anchor.getBoundingClientRect(), w = box.current.offsetWidth, h = box.current.offsetHeight, vw = document.documentElement.clientWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - w - 8);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    setPos({ left, top });
  }, [cur]);

  if (!cur) return null;
  const t = cur.tip;
  return (
    <div className="tip" role="dialog" ref={box} style={pos ? { left: pos.left, top: pos.top } : undefined}>
      <div className="tp-h"><span>{t.title}</span><button className="tp-x" type="button" aria-label="关闭" onClick={() => set(null)}>×</button></div>
      {t.expr && <div className="tp-eq">{t.expr.map((x, i) => <TermView key={i} x={x} />)}<span className="tp-op">=</span><span className="tp-res">{t.result}</span></div>}
      {t.big && <div className="tp-big">{t.big}</div>}
      {t.math && <div className="tp-math">{t.math}</div>}
      {t.rows && t.rows.length > 0 && <dl className="tp-rows">{t.rows.map(([k, v], i) => <Row key={i} k={k} v={v} />)}</dl>}
      {t.notes && t.notes.length > 0 && <ul className="tp-notes">{t.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {t.src && <p className="tp-src">{t.src}</p>}
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => <><dt>{k}</dt><dd>{v}</dd></>;
