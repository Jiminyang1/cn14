// 开发用：/?docs 用一个种子跑完一整个人生（抉择自动选），把这一生拿到的所有证件摊开看，也能打开证件夹。
import { useMemo, useState } from 'react';
import { S, autoPick, newLife, resolveDec, tick } from '../engine';
import { DocFolder, DocTimeline, DocView, openDoc } from './Docs';

function runLife(seed: number) {
  newLife(seed);
  const L = S;
  L.auto = false;
  let g = 0;
  while (L.phase === 'life' && g++ < 60000) {
    const P = L.pending;
    if (P && P.type === 'dec') resolveDec(P.id, P.d, autoPick(P.d));
    else if (P) L.pending = null;
    else tick(0.37);
  }
  return L;
}

export function DocGallery() {
  const q = new URLSearchParams(location.search);
  const [seed, setSeed] = useState(+(q.get('docs') || 0) || 424242);
  const L = useMemo(() => runLife(seed), [seed]);
  const docs = L.docs || [];
  return (
    <div className="dgal">
      <div className="dgal-bar">
        <h2 style={{ margin: 0 }}>证件 <span className="small muted">开发用预览 · 种子 {seed} · {L.name} · 享年 {L.age} 岁 · {docs.length} 份</span></h2>
        <button className="btn" onClick={() => setSeed(s => s + 104729)}>换一个人生</button>
        <button className="btn" onClick={() => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark'; }}>深浅色</button>
      </div>
      <DocTimeline />
      <div className="dgal-grid">
        {docs.map((d, i) => <div key={seed + '-' + i}><h5>{String(i + 1).padStart(2, '0')} · {d.title} · {d.y}.{d.m} · {d.a} 岁 <button className="btn" style={{ padding: '0 6px', fontSize: 11 }} onClick={() => openDoc(i)}>证件夹</button></h5><DocView d={d} /></div>)}
      </div>
      <DocFolder />
    </div>
  );
}
