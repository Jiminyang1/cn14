// 夹在表格上的一张像素“照片”，右下角是旧相机那种橙色日期。画面每 250ms 走一拍；系统设了“减少动态效果”就停在第一拍。
import { useEffect, useRef, useState } from 'react';
import { S, type Pending } from '../engine';
import { hash } from './pixel/pix';
import { H, SCENES, W, type SceneCtx, type SceneId } from './pixel/scenes';
import { drawWorld, viewOf, type View } from './pixel/world';
import { dissolve, type Pix } from './pixel/pix';

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
  kinder: '幼儿园第一天，抱着门框哭', primary: '开学第一天', middle: '周一升旗', high: '晚自习，黑板上的高考倒计时',
  voc: '职高车间里的车床', uni: '大学新生报到', master: '深夜的实验室', newyear: '年夜饭，窗外放烟花',
  ages: '同一个人从婴儿到老', yard: '家门口，随季节变化',
};

/** 每 TICK_MS 加一；不动或者系统要求减少动效时一直是 0 */
export function useTick(on = true) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const iv = setInterval(() => { if (!document.hidden) setT(n => n + 1); }, TICK_MS); // 页面看不见时不走
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

/** 人生纪录里配的小照片。只有当年的那几张会动，往年的停在第一拍 */
export function LogPic({ id, live }: { id: string; live: boolean }) {
  if (!(id in SCENES)) return null; // 旧存档或改过名的场景
  return (
    <figure className="pix-photo pix-log">
      <PixCanvas id={id as SceneId} ctx={{ rural: S.rural, sex: S.sex, seed: S.seed }} t={live ? undefined : 0} />
    </figure>
  );
}

export function Photo({ id, sex }: { id: SceneId; sex?: 'M' | 'F' }) {
  return (
    <figure className="pix-photo">
      <PixCanvas id={id} ctx={{ rural: S.loc.kind === 'rural', sex: sex || S.sex, seed: S.seed }} />
      <span className="pix-date">{stamp(id)}</span>
    </figure>
  );
}

// ===== 实时画面：这一刻家里是什么样（右栏顶上） =====
const ROLE_N: Record<string, string> = { me: '你', mom: '妈妈', dad: '爸爸', grandma: '奶奶', grandpa: '爷爷', sib: '兄弟姐妹', partner: '爱人', kid: '孩子', mate: '室友' };
const SEASON_N = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const HOME_N: Record<View['home'], string> = { yard: '农村的院子', town: '县城的老小区', flat: '楼下', rental: '城中村的出租屋', dorm: '宿舍楼下', nursing: '养老院', hospital: '医院' };
/** 给读屏用的一句话 */
export function describeView(v: View) {
  const who = v.people.map(r => ROLE_N[r.role]).filter((x, i, a) => a.indexOf(x) === i).join('、');
  return `${HOME_N[v.home]}，${v.month}月（${SEASON_N[v.season]}）${v.festival === 'spring' ? '，过年' : v.festival === 'midautumn' ? '，中秋' : ''}。在家的有：${who}${v.away ? '；爸妈在外地，正在视频' : ''}。`;
}
const MOVE_TICKS = 10;   // 搬家转场：约 2.5 秒溶解到新家
const BOX_MONTHS = 3;    // 搬家后门口的纸箱留几个月
export function LiveScene() {
  const ref = useRef<HTMLCanvasElement>(null);
  const t = useTick();
  const v = viewOf(S);
  // 搬家（住处的类型或城市变了）：从上一张画面像素溶解过来，门口堆几个月纸箱
  const mv = useRef<{ key: string; last: Pix | null; from: Pix | null; at: number; month: number }>({ key: '', last: null, from: null, at: 0, month: -99 });
  const key = `${v.home}|${S.loc.city}`, nowM = S.age * 12 + (S.month || 0), m = mv.current;
  if (m.key && m.key !== key) { m.from = m.last; m.at = t; if (!['hospital', 'nursing', 'dorm'].includes(v.home)) m.month = nowM; }
  m.key = key;
  if (nowM - m.month < BOX_MONTHS) v.props.boxes = true;
  useEffect(() => {
    if (!ref.current) return;
    let pic = drawWorld(v, t);
    m.last = pic;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches; // 不动的时候直接换，不做转场
    if (m.from && !still && t - m.at < MOVE_TICKS) pic = dissolve(m.from, pic, (t - m.at) / MOVE_TICKS);
    pic.draw(ref.current);
  });
  return (
    <figure className="pix-photo pix-live">
      <canvas ref={ref} width={W} height={H} role="img" aria-label={describeView(v)} />
      <figcaption>{v.month}月 · {SEASON_N[v.season]}{v.festival === 'spring' ? ' · 过年' : v.festival === 'midautumn' ? ' · 中秋' : ''}</figcaption>
    </figure>
  );
}
