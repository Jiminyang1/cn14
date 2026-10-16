// 开发用：/?pixel 一页看完所有像素插画。每张一个会动的大图，加一条逐帧胶片（每两拍取一帧），可切深浅色、暂停。
import { useState } from 'react';
import { ALT, PixCanvas } from './Photo';
import { SCENES, type SceneCtx, type SceneId } from './pixel/scenes';

const VARIANTS: Partial<Record<SceneId, [string, SceneCtx][]>> = {
  birth: [['城市', { rural: false, seed: 3 }], ['农村', { rural: true, seed: 3 }]],
};
const FRAMES = Array.from({ length: 8 }, (_, i) => i * 2);

export function PixelGallery() {
  const [dark, setDark] = useState(false);
  const [paused, setPaused] = useState(false);
  const theme = (d: boolean) => { setDark(d); document.documentElement.dataset.theme = d ? 'dark' : 'light'; };
  return (
    <div className="wrap pix-gallery">
      <h2>像素插画 <span className="small muted">开发用预览 · 共 {Object.keys(SCENES).length} 张</span></h2>
      <div className="seg sm">
        <button className={dark ? '' : 'on'} onClick={() => theme(false)}>浅色</button>
        <button className={dark ? 'on' : ''} onClick={() => theme(true)}>深色</button>
        <button className={paused ? 'on' : ''} onClick={() => setPaused(p => !p)}>{paused ? '已暂停' : '暂停'}</button>
      </div>
      {(Object.keys(SCENES) as SceneId[]).map(id => (VARIANTS[id] || [['男', { sex: 'M', seed: 2 }], ['女', { sex: 'F', seed: 2 }]] as [string, SceneCtx][]).map(([vn, ctx]) => (
        <section key={id + vn} className="pix-row">
          <h4>{id} <span className="small muted">{ALT[id]} · {vn}</span></h4>
          <div className="pix-row-body">
            <figure className="pix-photo"><PixCanvas id={id} ctx={ctx} t={paused ? 0 : undefined} /></figure>
            <div className="pix-strip">{FRAMES.map(t => <div key={t}><PixCanvas id={id} ctx={ctx} t={t} /><small>t={t}</small></div>)}</div>
          </div>
        </section>
      )))}
    </div>
  );
}
