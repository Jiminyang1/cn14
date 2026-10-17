// 夹在表格上的一张像素“照片”，右下角是旧相机那种橙色日期。画面每 250ms 走一拍；系统设了“减少动态效果”就停在第一拍。
import { useEffect, useRef, useState } from 'react';
import { S, type Pending } from '../engine';
import { hash } from './pixel/pix';
import { H, SCENES, W, type SceneCtx, type SceneId } from './pixel/scenes';

export const TICK_MS = 250;

/** 抉择 id → 插画 */
const DEC_SCENE: Record<string, SceneId> = {
  gaokao: 'gaokao', marry: 'wedding', house: 'house', romance: 'date', graduate: 'grad', vocgrad: 'grad',
  bigcity: 'train', crisis: 'layoff', baby: 'nursery', illness: 'ward', parentcare: 'oldage', oldcare: 'oldage',
  demolish: 'demolish', kidhome: 'kidhome', sibloan: 'sibloan', heritage: 'heritage', layofflist: 'layofflist', retireplan: 'retire',
};
/** 这个抉择配哪张图；画的是谁（父母生病时画父母） */
export function decScene(P: Pending): { id: SceneId; sex?: 'M' | 'F' } | null {
  if (P.type !== 'dec' || !DEC_SCENE[P.id]) return null;
  return { id: DEC_SCENE[P.id], sex: P.id === 'parentcare' ? (P.d.ctx?.who === 'mom' ? 'F' : 'M') : undefined };
}

export const ALT: Record<SceneId, string> = {
  birth: '产房里，妈妈抱着刚出生的你', gaokao: '考点门外', wedding: '婚礼', house: '新楼盘', date: '傍晚的湖边长椅',
  grad: '毕业典礼', train: '高铁站台', layoff: '雨里抱着纸箱走出写字楼', nursery: '夜里的婴儿床', ward: '病房', oldage: '午后的摇椅',
  demolish: '老房子墙上的“拆”字和挖掘机', kidhome: '售楼处的沙盘前', sibloan: '夜里的饭桌', heritage: '堂屋里的遗像和香',
  layofflist: '会议室里，HR 手上的名单', retire: '“光荣退休”欢送会',
};

/** 每 TICK_MS 加一；不动或者系统要求减少动效时一直是 0 */
export function useTick(on = true) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const iv = setInterval(() => setT(n => n + 1), TICK_MS);
    return () => clearInterval(iv);
  }, [on]);
  return t;
}

/** 画一张场景；给了 t 就停在那一拍 */
export function PixCanvas({ id, ctx, t: still }: { id: SceneId; ctx: SceneCtx; t?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tick = useTick(still == null);
  const t = still ?? tick;
  const key = JSON.stringify(ctx);
  useEffect(() => { if (ref.current) SCENES[id](ctx, t).draw(ref.current); }, [id, key, t]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={W} height={H} role="img" aria-label={ALT[id]} />;
}

function stamp(id: SceneId) {
  const y = id === 'birth' ? S.birthYear : S.birthYear + S.age;
  const m = id === 'birth' ? S.birthMonth : id === 'gaokao' ? 6 : 1 + Math.floor(hash(S.seed, y) * 12);
  const d = id === 'gaokao' ? 7 : 1 + Math.floor(hash(S.seed + m, y) * 28);
  return `’${String(y % 100).padStart(2, '0')} ${m} ${d}`;
}

export function Photo({ id, sex }: { id: SceneId; sex?: 'M' | 'F' }) {
  return (
    <figure className="pix-photo">
      <PixCanvas id={id} ctx={{ rural: S.loc.kind === 'rural', sex: sex || S.sex, seed: S.seed }} />
      <span className="pix-date">{stamp(id)}</span>
    </figure>
  );
}
