// 关键节点的像素插画：出生、高考、结婚、买房。每张 96×54，按需要读一点当前人生的信息（城乡、性别）。
// t 是动画的第几拍（每拍 250ms），会动的东西各自按自己的节奏取 t。所有场景可以在开发时打开 /?pixel 一起看。
import { C, Pix, baby, bob, glyphs, hanzi, hash, line, man, person, woman, type Pose } from './pix';

export const W = 96, H = 54;
export type SceneId = 'birth' | 'gaokao' | 'wedding' | 'house' | 'date' | 'grad' | 'train' | 'layoff' | 'nursery' | 'ward' | 'oldage'
  | 'demolish' | 'kidhome' | 'sibloan' | 'heritage' | 'layofflist' | 'retire';
export interface SceneCtx { rural?: boolean; sex?: 'M' | 'F'; seed?: number }

const disc = (p: Pix, cx: number, cy: number, r: number, c: string) => {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) p.px(cx + x, cy + y, c);
};

// ---------- 出生：产科病房 ----------
function birth(o: SceneCtx, t: number) {
  const p = new Pix(W, H), s = o.seed || 1;
  // 墙：上半奶白，下半医院常见的灰绿墙裙
  p.rect(0, 0, W, 32, C.cream);
  p.rect(0, 32, W, 1, '#8fa58a'); p.rect(0, 33, W, 9, '#b9c9b0');
  p.rect(0, 42, W, 12, '#d8cdb8');
  for (let x = 3; x < W; x += 8) p.rect(x, 42, 1, 12, '#c4b79f');
  for (let y = 47; y < H; y += 5) p.rect(0, y, W, 1, '#c4b79f');
  // 窗外：农村是山和田，城市是楼
  p.rect(9, 5, 26, 22, C.white); p.rect(10, 6, 24, 20, C.sky);
  if (o.rural) {
    for (let x = 10; x < 34; x++) {
      const h = 7 + Math.round(3 * Math.sin(x / 3.5));
      p.rect(x, 26 - h, 1, h, C.leaf);
      p.rect(x, 22, 1, 4, (x % 3) ? C.greenLt : C.leaf);
    }
  } else {
    for (let x = 10, k = 0; x < 34; k++) {
      const bw = 3 + Math.floor(hash(s, k) * 4), bh = 6 + Math.floor(hash(s + 9, k) * 12);
      p.rect(x, 26 - bh, bw, bh, k % 2 ? C.glass : '#93a9b6');
      for (let j = 28 - bh; j < 25; j += 3) for (let i = x + 1; i < x + bw - 1; i += 2) if (hash(i, j) < 0.3) p.px(i, j, C.sun);
      x += bw + 1;
    }
  }
  p.rect(21, 6, 1, 20, C.white); p.rect(10, 15, 24, 1, C.white);
  p.rect(8, 26, 28, 2, C.grayLt);
  // 墙上的红十字
  p.rect(64, 5, 7, 7, C.white); p.rect(67, 6, 1, 5, C.red); p.rect(65, 8, 5, 1, C.red);
  // 暖水瓶
  p.rect(28, 36, 3, 8, C.red); p.rect(28, 38, 3, 1, C.gold); p.rect(28, 35, 3, 1, C.grayDk); p.px(29, 34, C.grayDk);
  // 床头
  p.rect(84, 20, 5, 25, C.grayLt); p.rect(84, 20, 5, 1, C.gray); p.rect(88, 20, 1, 25, C.gray);
  // 妈妈坐在床上，抱着你
  // 妈妈时不时低头看你，轻轻晃着你
  const mp: Pose = { t, ph: 0, nod: (t >> 3) % 3 === 1 ? 1 : 0 }, md = bob(mp);
  woman(p, 74, 15, { top: '#b7cfdc', topSh: '#93b2c6' }, mp);
  baby(p, 76 + [0, 1, 0, -1][(t >> 1) % 4] * ((t >> 4) % 2), 23 + md);
  // 被子和床架
  p.rect(47, 30, 38, 7, C.white); p.rect(47, 30, 38, 1, '#e4dccb'); p.rect(47, 33, 38, 1, '#9fb7cc'); p.rect(47, 36, 38, 1, '#ddd3c0');
  p.rect(46, 37, 43, 2, C.gray);
  for (const x of [48, 82]) { p.rect(x, 39, 1, 5, C.gray); p.rect(x - 1, 44, 3, 1, C.grayDk); }
  // 爸爸举着手机在录
  const dp: Pose = { t, ph: 1, lean: t % 8 < 2 ? 1 : 0 }, dd = bob(dp);
  man(p, 34, 22, { top: '#5a7fb0', topSh: '#476b9b', bottom: C.grayDk, bottomSh: '#4a423b' }, dp);
  p.rect(43, 30 + dd, 1, 5, '#5a7fb0'); p.px(43, 29 + dd, C.skin); p.rect(43, 26 + dd, 3, 3, C.ink); p.px(44, 27 + dd, C.glass);
  if ((t >> 1) % 2) p.px(45, 26 + dd, C.redLt); // 录像的红点
  if (t % 8 === 0) { // 拍照的闪光
    p.px(44, 27 + dd, C.white);
    for (const [x, y] of [[47, 27], [48, 27], [47, 25], [48, 24], [47, 29], [48, 30], [46, 24], [46, 30]]) p.px(x, y + dd, x === 48 ? C.sun : C.white);
  }
  return p;
}

// ---------- 高考：考点门外 ----------
function gaokao(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 24, C.sky); p.dither(0, 6, W, 3, C.sky, C.skyLt); p.rect(0, 0, W, 6, C.skyLt);
  disc(p, 86, 6, 3, C.sun);
  // 教学楼
  p.rect(0, 11, W, 28, '#e9dcc0'); p.rect(0, 11, W, 2, C.kraftDk);
  for (let x = 3; x < W; x += 8) for (let y = 16; y < 36; y += 7) { p.rect(x, y, 4, 4, C.glass); p.rect(x, y, 4, 1, '#6a8494'); }
  p.rect(38, 3, 20, 8, '#e9dcc0'); p.rect(38, 3, 20, 1, C.kraftDk);
  disc(p, 48, 7, 2, C.white); p.px(48, 6, C.ink); p.px(48, 7, C.ink); p.px(49, 7, C.ink);
  // 地面
  p.rect(0, 39, W, 15, '#cfc3ab');
  for (let x = 0; x < W; x += 6) p.rect(x, 46, 4, 1, '#bfb298');
  // 校门和红横幅
  for (const x of [26, 66]) { p.rect(x, 15, 4, 31, '#b8a27a'); p.rect(x + 3, 15, 1, 31, '#9c8762'); p.rect(x - 1, 45, 6, 1, '#8b7756'); }
  p.rect(26, 14, 44, 2, '#9c8762');
  p.rect(30, 17, 36, 6, C.red); p.rect(30, 22, 36, 1, C.redDk);
  glyphs(p, 33, 18, 8, C.gold, 7);
  // 树
  p.rect(11, 27, 3, 17, C.wood);
  disc(p, 12, 22, 7, C.leaf); disc(p, 8, 25, 4, C.green); disc(p, 16, 20, 4, C.greenLt);
  // 走进考场的你（背影，蓝白校服，透明笔袋）
  const me = { top: C.white, topSh: '#d8cfbd', bottom: C.blue, bottomSh: '#1f3a60', shoe: C.white, hair: C.hair };
  // 一步一步往里走
  const sp: Pose = { t, back: true, walk: true }, sd = bob(sp);
  person(p, o.sex, 43, 23, me, sp);
  p.rect(43, 32 + sd, 1, 4, C.blueLt); p.rect(52, 32 + sd, 1, 4, C.blueLt);
  const hy = (o.sex === 'F' ? 35 : 37) + sd;
  p.rect(52, hy, 3, 3, '#c3d8da'); p.px(53, hy + 1, C.ink);
  // 门外等着的爸妈：妈妈穿绿旗袍（“旗开得胜”），举着向日葵
  // 妈妈把向日葵（“一举夺魁”）举过头顶，来回挥
  const mp: Pose = { t, ph: 2, long: true, arms: 'L', lean: (t >> 3) % 2 ? -1 : 0 }, md = bob(mp);
  woman(p, 73, 25, { top: '#3c7a52', topSh: '#2e6040', shoe: C.ink }, mp);
  const sw = [0, 1, 0, -1][(t >> 1) % 4];
  p.rect(73, 24 + md, 1, 4, C.leaf); p.px(73 + sw, 23 + md, C.leaf);
  for (const [dx, dy] of [[-1, -1], [0, -2], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]]) p.px(73 + sw + dx, 20 + md + dy, C.gold);
  p.px(73 + sw, 20 + md, C.wood);
  // 爸爸一直在扇扇子
  const fp: Pose = { t, ph: 4 };
  man(p, 84, 24, { top: '#c0453a', topSh: '#9e3328', bottom: C.grayDk, bottomSh: '#4a423b' }, fp);
  const fy = (t % 2 ? 31 : 33) + bob(fp);
  p.rect(92, fy, 4, 3, C.white); p.rect(92, fy + 2, 4, 1, '#ddd3c0'); p.rect(93, fy + 3, 1, 38 - fy - 3, C.wood);
  return p;
}

// ---------- 结婚：红墙、囍字、灯笼 ----------
const XI = [
  '...#.....#.....',
  '###############',
  '...#.....#.....',
  '.#####...#####.',
  '...............',
  '.#####...#####.',
  '.#...#...#...#.',
  '.#####...#####.',
  '.#...#...#...#.',
  '###############',
  '...............',
  '.#####...#####.',
  '.#...#...#...#.',
  '.#####...#####.',
];
const LANTERN = [
  '..GGGG..',
  '.LLLLLL.',
  'LLlLLlLL',
  'LLlLLlLL',
  'LLlLLlLL',
  'LLlLLlLL',
  '.LLLLLL.',
  '..GGGG..',
  '...gg...',
  '...gg...',
  '..g..g..',
];
function wedding(o: SceneCtx, t: number) {
  const p = new Pix(W, H), s = o.seed || 1;
  p.rect(0, 0, W, 42, C.red);
  for (let x = 2; x < W; x += 6) p.rect(x, 0, 1, 42, C.redDk);
  p.rect(38, 3, 21, 18, C.redDk);
  p.sprite(XI, { '#': C.gold }, 41, 5);
  // 灯笼左右摇，两只错开半拍
  [8, 80].forEach((x, i) => {
    const dx = [0, 1, 0, -1][((t >> 1) + i * 2) % 4];
    p.rect(x + 3, 0, 1, 2, C.gold); p.px(x + 3 + dx, 2, C.gold);
    p.sprite(LANTERN, { G: C.gold, g: C.goldDk, L: C.redLt, l: C.red }, x + dx, 3);
  });
  // 地板和红地毯
  p.rect(0, 42, W, 12, C.woodLt);
  for (let y = 45; y < H; y += 4) p.rect(0, y, W, 1, C.wood);
  p.rect(28, 42, 40, 12, '#a3231a'); p.rect(28, 42, 1, 12, C.gold); p.rect(67, 42, 1, 12, C.gold);
  // 新郎
  // 两个人时不时侧过头看对方
  const look = (t >> 3) % 2;
  const gp: Pose = { t, ph: 0, lean: look }, gd = bob(gp);
  man(p, 36, 21, { top: C.suit, topSh: C.suitSh, bottom: C.suit, bottomSh: C.suitSh, hair: C.hair }, gp);
  p.rect(40, 29 + gd, 2, 3, C.white); p.px(40, 30 + gd, C.red); p.px(41, 30 + gd, C.red); p.px(38, 30 + gd, C.redLt);
  // 新娘：白纱、头纱、捧花
  const bp: Pose = { t, ph: 2, long: true, lean: -look }, bd = bob(bp);
  p.rect(50 - look, 22 + bd, 12, 13, '#ebe3d3'); p.rect(49 - look, 26 + bd, 1, 9, '#ebe3d3'); p.rect(62 - look, 26 + bd, 1, 9, '#ebe3d3');
  woman(p, 51, 21, { top: C.white, topSh: '#ddd3c0', shoe: C.white }, bp);
  p.px(54 - look, 21 + bd, C.white); p.px(55 - look, 21 + bd, C.white);
  for (const [x, y, c] of [[54, 33, C.redLt], [55, 33, C.pink], [56, 33, C.redLt], [55, 32, C.red], [54, 34, C.leaf], [56, 34, C.leaf]] as const) p.px(x, y + bd, c);
  // 牵着手
  p.px(47, 34, C.skin); p.px(48, 34, C.skin); p.px(49, 34, C.skin);
  // 彩纸往下飘，落到地上再从顶上出来
  for (let k = 0; k < 26; k++) {
    const v = hash(s + 7, k) < 0.3 ? 2 : 1;
    const y = (Math.floor(hash(s + 3, k) * 42) + t * v) % 42;
    const x = Math.floor(hash(s, k) * W) + Math.round(Math.sin((t + k * 3) / 3));
    if (x > 34 && x < 64 && y > 18) continue;
    p.px(x, y, hash(s + 5, k) < 0.5 ? C.gold : C.pinkLt);
  }
  return p;
}

// ---------- 买房：小区、塔吊、手里的钥匙 ----------
function tower(p: Pix, x: number, y: number, w: number, h: number, seed: number, from = 0) {
  p.rect(x, y, w, h, '#e6dcc8'); p.rect(x + w - 3, y, 3, h, '#d3c6ac'); p.rect(x, y, w, 1, C.kraftDk);
  for (let j = y + 3 + from; j < y + h - 3; j += 4) for (let i = x + 2; i < x + w - 3; i += 4) p.rect(i, j, 2, 2, hash(seed + i, j) < 0.14 ? C.sun : C.glass);
}
function house(o: SceneCtx, t: number) {
  const p = new Pix(W, H), s = o.seed || 1;
  p.rect(0, 0, W, 46, C.sky); p.dither(0, 22, W, 6, C.skyLt, C.sky); p.rect(0, 28, W, 18, C.skyLt);
  for (const [cx, cy] of [[12, 7], [74, 11]]) { p.rect(cx, cy, 9, 2, C.white); p.rect(cx + 2, cy - 1, 4, 1, C.white); }
  tower(p, 3, 16, 20, 31, s);
  tower(p, 62, 18, 19, 29, s + 2);
  // 中间那栋还在盖：顶上是脚手架
  tower(p, 29, 12, 24, 35, s + 1, 4);
  p.rect(29, 6, 24, 6, C.skyLt);
  for (let x = 29; x < 53; x += 4) p.rect(x, 6, 1, 7, C.gray);
  p.rect(29, 6, 24, 1, C.gray); p.rect(29, 9, 24, 1, C.gray);
  // 塔吊
  // 塔吊：吊臂绕塔身转，侧面看就是一会儿伸长、一会儿缩短、转到另一边（每两拍转 1/16 圈）
  for (let y = 0; y < 12; y++) { p.px(46, y, C.gold); p.px(47, y, y % 2 ? C.goldDk : C.gold); }
  const cs = Math.cos(((t >> 1) % 16) * Math.PI / 8);
  const tip = 47 + Math.round(cs * 24), tail = 47 - Math.round(cs * 12);
  const x0 = Math.min(tip, tail), x1 = Math.max(tip, tail);
  p.rect(x0, 1, x1 - x0 + 1, 1, C.gold); for (let x = x0 + 1; x < x1; x += 2) p.px(x, 2, C.goldDk);
  p.rect(tail - 2, 2, 4, 2, C.grayDk); p.rect(45, 2, 4, 3, C.blueLt);
  const hx = 47 + Math.round(cs * 20);
  p.rect(hx, 3, 1, 10, C.ink); p.rect(hx - 1, 13, 3, 2, C.grayDk);
  // 楼上挂的红条幅
  p.rect(32, 15, 4, 18, C.red);
  for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (hash(k + 40, j * 2 + i) < 0.75) p.px(33 + i, 17 + k * 4 + j, C.gold);
  // 绿化和路
  p.rect(0, 46, W, 3, C.greenLt); for (let x = 1; x < W; x += 5) disc(p, x, 46, 1, C.leaf);
  p.rect(0, 49, W, 5, C.grayLt); for (let x = 2; x < W; x += 8) p.rect(x, 51, 4, 1, C.white);
  // 你，拿着钥匙
  const me = { top: '#5a7fb0', topSh: '#476b9b', bottom: C.grayDk, bottomSh: '#4a423b' };
  // 隔一会儿把钥匙举起来晃一晃
  const up = (t >> 2) % 3 === 0;
  const hp: Pose = { t, arms: up ? 'R' : undefined }, hd = bob(hp);
  person(p, o.sex, 84, 27, me, hp);
  const ky = (up ? 27 - (t % 2) : o.sex === 'F' ? 34 : 36) + hd;
  p.rect(93, ky, 3, 3, C.gold); p.px(94, ky + 1, C.skyLt); p.rect(94, ky + 3, 1, 3, C.gold); p.px(95, ky + 5, C.gold);
  return p;
}



// ---------- 心动 / 相亲：傍晚湖边的长椅 ----------
const HEART = ['.r.r.', 'rrrrr', '.rrr.', '..r..'];
function date(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 31, '#e9b48a'); p.rect(0, 0, W, 8, '#d99a86'); p.dither(0, 8, W, 3, '#d99a86', '#e9b48a');
  p.dither(0, 21, W, 4, '#f2cf9c', '#e9b48a'); p.rect(0, 25, W, 6, '#f2cf9c');
  disc(p, 70, 29, 5, '#f7d36e');
  p.rect(0, 29, W, 2, '#6f7d5a'); for (let x = 0; x < W; x += 3) p.px(x + (x % 2), 28, '#6f7d5a');
  // 湖面，夕阳的倒影一闪一闪
  p.rect(0, 31, W, 8, '#9fb7c4');
  for (let j = 0; j < 4; j++) for (let i = 0; i < 10; i++) if (hash(i + (t >> 1) * 13, j) < 0.4) p.px(65 + i - j, 32 + j * 2, '#f2cf9c');
  p.rect(0, 39, W, 15, C.greenLt); p.dither(0, 39, W, 2, C.leaf, C.greenLt);
  p.rect(0, 49, W, 5, '#d8c39b');
  // 路灯
  p.rect(84, 12, 1, 37, C.grayDk); p.rect(82, 9, 5, 3, C.ink); p.rect(83, 12, 3, 1, '#f7d36e');
  // 长椅：靠背在人后面，椅面挡住腿
  p.rect(33, 32, 31, 2, C.woodLt); p.rect(33, 35, 31, 1, C.woodLt); p.rect(34, 32, 1, 15, C.wood); p.rect(62, 32, 1, 15, C.wood);
  // 两个人慢慢靠过去，又不好意思地坐直
  const lean = (t >> 3) % 2;
  man(p, 38, 25, { top: '#5a7fb0', topSh: '#476b9b', bottom: C.grayDk, bottomSh: '#4a423b' }, { sit: true, t, ph: 0, lean });
  woman(p, 50, 25, { top: '#e6a1a0', topSh: '#cf8584', bottom: C.blue }, { sit: true, t, ph: 2, lean: -lean });
  p.rect(33, 40, 31, 2, C.wood); p.rect(35, 42, 1, 5, C.wood); p.rect(61, 42, 1, 5, C.wood);
  // 两颗心慢慢往上飘
  [0, 7].forEach((off, k) => {
    const ph = (t + off) % 14;
    if (ph < 12) p.sprite(HEART, { r: k ? C.pink : C.redLt }, 46 + Math.round(Math.sin((t + off) / 2)), 22 - ph);
  });
  return p;
}

// ---------- 毕业：学位帽抛上天 ----------
function grad(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 36, C.sky); p.rect(0, 0, W, 5, C.skyLt); p.dither(0, 5, W, 2, C.skyLt, C.sky);
  // 礼堂：三角楣、柱廊
  for (let j = 0; j < 6; j++) p.rect(48 - j * 6, 3 + j, j * 12 + 1, 1, '#e9dcc0');
  p.rect(14, 9, 69, 27, '#e9dcc0'); p.rect(14, 9, 69, 2, C.kraftDk);
  for (let x = 18; x < 80; x += 8) { p.rect(x + 3, 14, 5, 18, '#c9b48f'); p.rect(x, 12, 3, 22, C.white); p.rect(x + 2, 12, 1, 22, '#ddd3c0'); }
  p.rect(12, 33, 73, 3, C.grayLt);
  p.rect(0, 36, W, 18, C.greenLt); p.dither(0, 36, W, 2, C.leaf, C.greenLt);
  // 五个毕业生，帽子轮流往上抛
  const hood = [C.blueLt, C.redLt, C.gold, C.blueLt, C.redLt];
  [6, 24, 43, 62, 80].forEach((x, k) => {
    const gown = { top: '#2b2a33', topSh: '#1e1d25', bottom: '#2b2a33', bottomSh: '#1e1d25', hair: k === 3 ? '#4a3426' : C.hair };
    // 帽子刚抛出去的那几拍举着双手
    const ph = (t + k * 3) % 12, cy = 29 - Math.round(16 * Math.sin(Math.PI * ph / 12));
    const gp: Pose = { t, ph: k, long: true, arms: ph >= 1 && ph <= 4 ? 'both' : undefined };
    if (k % 2) woman(p, x, 31, gown, gp); else man(p, x, 31, gown, gp);
    p.rect(x + 1, 39 + bob(gp), 8, 1, hood[k]);
    p.rect(x + 2, cy, 6, 1, C.ink); p.rect(x + 3, cy + 1, 4, 1, C.ink); p.px(x + 7, cy + 1, C.gold); p.px(x + 7, cy + 2, C.gold);
  });
  return p;
}

// ---------- 去大城市：高铁站台，列车驶过 ----------
function train(o: SceneCtx, t: number) {
  const p = new Pix(W, H), L = 140;
  p.rect(0, 0, W, 40, '#d6dedd');
  for (let x = 0, k = 0; x < W; k++) { const bw = 5 + Math.floor(hash(9, k) * 6), bh = 8 + Math.floor(hash(4, k) * 14); p.rect(x, 30 - bh, bw, bh, '#b8c6cb'); x += bw + 1; }
  // 雨棚
  p.rect(0, 0, W, 4, C.grayDk);
  for (let x = 0; x < W; x += 8) for (let j = 0; j < 4; j++) { p.px(x + j, 4 + j, C.gray); p.px(x + 7 - j, 4 + j, C.gray); }
  // 轨道
  p.rect(0, 33, W, 6, C.gray); p.rect(0, 34, W, 1, C.grayLt); p.rect(0, 37, W, 1, C.grayLt);
  // 列车从右往左开过去，开出画面再从右边进来
  const x0 = W - (t * 5) % (L + W + 60);
  for (let j = 0; j < 16; j++) { const st = x0 + Math.max(0, 6 - j); p.rect(st, 17 + j, x0 + L - st, 1, C.white); }
  p.rect(x0 + 2, 19, 5, 3, '#2f4a66');
  p.rect(x0 + 9, 21, L - 11, 3, '#2f4a66');
  for (let x = x0 + 14; x < x0 + L; x += 6) p.rect(x, 21, 1, 3, C.white);
  for (let x = x0 + 46; x < x0 + L; x += 46) p.rect(x, 18, 1, 15, C.grayLt);
  p.rect(x0 + 2, 27, L - 2, 1, C.blue); p.rect(x0 + 1, 28, L - 1, 1, C.blueLt);
  p.rect(x0 + 3, 32, L - 3, 2, C.grayDk);
  // 站名牌（橙色字的 LED）
  p.rect(8, 6, 26, 7, C.ink); glyphs(p, 10, 8, 6, '#ff9a3c', 3);
  // 柱子在车前面
  p.rect(74, 4, 5, 35, C.grayLt); p.rect(78, 4, 1, 35, C.gray);
  // 站台、安全线
  p.rect(0, 39, W, 15, '#d8cdb8'); p.rect(0, 39, W, 1, C.grayLt); p.dither(0, 41, W, 2, C.gold, '#d8cdb8');
  for (let x = 4; x < W; x += 12) p.rect(x, 44, 1, 10, '#c4b79f');
  // 你，背着包、拖着箱子
  const me = { top: '#c0453a', topSh: '#9e3328', bottom: C.blue, bottomSh: '#1f3a60' };
  // 列车开过的时候转头去看
  const tp: Pose = { t, back: true, lean: x0 < 60 && x0 > -L + 20 ? -1 : 0 }, td = bob(tp);
  person(p, o.sex, 30, 31, me, tp);
  p.rect(32, 40 + td, 6, 5, C.kraftDk); p.rect(32, 40 + td, 6, 1, C.kraft);
  p.rect(42, 42, 5, 9, C.blueLt); p.rect(42, 42, 5, 1, '#476b9b'); p.rect(44, 39, 1, 3, C.grayDk); p.px(42, 51, C.ink); p.px(46, 51, C.ink);
  return p;
}

// ---------- 35 岁被裁：雨里抱着纸箱 ----------
function layoff(o: SceneCtx, t: number) {
  const p = new Pix(W, H), s = o.seed || 1;
  p.rect(0, 0, W, 42, '#5b6a78'); p.rect(0, 0, W, 6, '#4a5763'); p.dither(0, 6, W, 3, '#4a5763', '#5b6a78');
  // 写字楼：还有不少灯亮着
  p.rect(8, 2, 50, 40, '#7d8a96'); p.rect(54, 2, 4, 40, '#6a7682');
  for (let j = 5; j < 33; j += 4) for (let i = 11; i < 53; i += 5) p.rect(i, j, 3, 2, hash(i, j) < 0.45 ? C.sun : '#3e4a55');
  p.rect(64, 12, 26, 30, '#6e7b87');
  for (let j = 15; j < 38; j += 4) for (let i = 66; i < 88; i += 5) p.rect(i, j, 3, 2, hash(i + 3, j) < 0.3 ? C.sun : '#3e4a55');
  p.rect(25, 34, 14, 8, '#9fb7c4'); p.rect(25, 34, 14, 1, C.grayDk); p.rect(31, 34, 1, 8, C.grayDk);
  // 湿漉漉的地面，倒影在晃
  p.rect(0, 42, W, 12, '#4e5a63');
  for (let i = 11; i < 53; i += 5) if (hash(i, 9) < 0.5) p.rect(i + ((t >> 1) % 2), 44 + Math.floor(hash(i, 3) * 6), 2, 1, '#8a7a4a');
  p.rect(64, 48, 16, 2, '#6a7884');
  const r = t % 4; p.rect(72 - r * 2, 48 + (r % 2), r * 4 + 1, 1, '#9fb7c4');
  // 你，抱着纸箱（里面一盆绿萝、一个相框）
  // 低着头，一步一步往外走
  const lp: Pose = { t, walk: true, nod: 1 }, ld = bob(lp);
  person(p, o.sex, 44, 25, { top: '#d8d4cc', topSh: '#bdb8ae', bottom: C.grayDk, bottomSh: '#3e3832' }, lp);
  p.px(46, 35 + ld, C.leaf); p.px(47, 34 + ld, C.leaf); p.px(48, 35 + ld, C.greenLt); p.rect(51, 34 + ld, 2, 2, C.woodLt);
  p.rect(43, 36 + ld, 12, 6, C.kraft); p.rect(43, 36 + ld, 12, 1, C.kraftDk); p.rect(42, 38 + ld, 1, 2, C.skin); p.rect(55, 38 + ld, 1, 2, C.skin);
  // 雨
  for (let k = 0; k < 70; k++) {
    const y = (Math.floor(hash(s + 1, k) * 60) + t * 6) % 60 - 4;
    const x = (Math.floor(hash(s, k) * W) + W - Math.floor(y / 4)) % W;
    p.px(x, y, '#a9b9c4'); p.px(x, y + 1, '#a9b9c4'); p.px(x - 1, y + 2, '#8c9ea9');
  }
  return p;
}

// ---------- 要孩子：夜里的婴儿床，床铃在转 ----------
function nursery(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 42, '#cdbf9f'); p.rect(0, 33, W, 9, '#b9a77f'); p.rect(0, 33, W, 1, '#a39065');
  p.rect(0, 42, W, 12, C.woodLt); for (let y = 45; y < H; y += 4) p.rect(0, y, W, 1, C.wood);
  // 窗外：月亮和眨眼的星星
  p.rect(7, 5, 24, 21, C.white); p.rect(8, 6, 22, 19, '#2f3b55');
  disc(p, 23, 11, 3, '#f2e6b8'); disc(p, 25, 10, 2, '#2f3b55');
  for (const [k, x, y] of [[0, 11, 9], [1, 15, 15], [2, 10, 20], [3, 19, 21], [4, 27, 19], [5, 14, 7]]) if (hash(k, t >> 1) < 0.6) p.px(x, y, '#f2e6b8');
  p.rect(18, 6, 1, 19, C.white); p.rect(8, 15, 22, 1, C.white);
  // 台灯的光
  p.dither(76, 20, 14, 14, '#ddd0b0', '#cdbf9f');
  p.rect(78, 34, 11, 8, C.wood); p.rect(78, 34, 11, 1, C.woodLt);
  p.rect(81, 27, 5, 4, '#f2cf9c'); p.rect(83, 31, 1, 3, C.grayDk);
  // 爸妈站在床边看
  // 爸妈探着头往床里看；爸爸时不时伸手逗一下床铃
  woman(p, 20, 21, { top: '#e6a1a0', topSh: '#cf8584', bottom: C.blue }, { t, ph: 0, lean: (t >> 3) % 2, nod: (t >> 3) % 2 });
  man(p, 30, 20, { top: '#7fa36a', topSh: '#5d8a4e', bottom: C.grayDk, bottomSh: '#4a423b' }, { t, ph: 2, lean: 1, arms: (t >> 2) % 4 === 1 ? 'R' : undefined });
  // 婴儿床
  p.rect(41, 33, 27, 5, C.white);
  baby(p, 52 + ((t >> 1) % 6 === 0 ? 1 : 0), 31, '#c3d8da', '#9fb7c4');
  p.rect(40, 28, 29, 1, C.woodLt); p.rect(40, 38, 29, 1, C.woodLt);
  for (let x = 40; x < 69; x += 3) p.rect(x, 29, 1, 9, C.woodLt);
  p.rect(40, 39, 1, 4, C.wood); p.rect(68, 39, 1, 4, C.wood);
  // 床铃：三个小挂件绕一圈，转到后面的颜色暗一些、画在后面
  p.rect(67, 9, 1, 19, C.white); p.rect(54, 9, 14, 1, C.white); p.px(54, 10, C.white);
  const toys = [0, 1, 2].map(k => { const a = t * Math.PI / 8 + k * 2 * Math.PI / 3; return { k, x: 54 + Math.round(9 * Math.cos(a)), z: Math.sin(a) }; }).sort((a, b) => a.z - b.z);
  const col = [[C.gold, C.goldDk], [C.pink, '#c98787'], [C.blueLt, '#476b9b']];
  for (const { k, x, z } of toys) {
    const c = col[k][z < 0 ? 1 : 0], y = z < 0 ? 16 : 17;
    for (let j = 11; j < y; j++) p.px(x, j, '#e4dccb');
    if (k === 0) { p.px(x, y, c); p.px(x - 1, y + 1, c); p.px(x, y + 1, c); p.px(x + 1, y + 1, c); p.px(x, y + 2, c); }
    else p.rect(x - 1, y, 2 + (k === 2 ? 1 : 0), 2, c);
  }
  return p;
}

// ---------- 生病：病房，心电图在走，输液在滴 ----------
const ECG = [0, 0, 0, 0, 0, -1, 0, 0, 1, -5, 3, 0, 0, 0, -1, -1, 0, 0, 0, 0];
function ward(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 32, '#e3e6dc'); p.rect(0, 32, W, 1, '#8fa58a'); p.rect(0, 33, W, 9, '#a9bfb4');
  p.rect(0, 42, W, 12, '#d8cdb8'); for (let x = 3; x < W; x += 8) p.rect(x, 42, 1, 12, '#c4b79f');
  // 监护仪：绿线从左往右扫，扫过的地方慢慢变暗
  p.rect(8, 5, 24, 15, C.grayDk); p.rect(10, 7, 18, 9, '#14231c'); p.rect(19, 20, 1, 22, C.gray); p.rect(16, 42, 7, 1, C.grayDk);
  const cur = (t * 2) % 18;
  for (let i = 0; i < 18; i++) {
    const age = (cur - i + 18) % 18;
    if (age > 13) continue;
    p.px(10 + i, 12 + ECG[(i + 4) % 20], age < 4 ? '#6fe08a' : '#2f7a4a');
  }
  p.rect(29, 8, 2, 2, (t >> 1) % 2 ? C.redLt : '#5a1f1a'); p.rect(28, 12, 3, 2, '#6fe08a');
  // 输液架、吊瓶、滴管里的水滴
  p.rect(74, 3, 1, 40, C.grayLt); p.rect(70, 3, 9, 1, C.grayLt); p.rect(72, 44, 5, 1, C.gray);
  p.rect(71, 5, 5, 7, '#dfe9ec'); p.rect(71, 8, 5, 4, '#c3d8da');
  p.rect(72, 13, 3, 4, '#eef3f3'); p.px(73, 13 + (t % 3), C.blueLt);
  for (let k = 0; k < 15; k++) p.px(73 - Math.round(k * 0.9), 17 + k, '#c7d0d2');
  // 病床上的你
  p.rect(84, 22, 5, 22, C.grayLt); p.rect(88, 22, 1, 22, C.gray);
  p.rect(34, 27, 10, 5, C.white);
  // 大多数时候闭着眼，偶尔睁开看一眼
  const awake = (t >> 2) % 5 === 2;
  p.rect(37, 25, 6, 2, C.hair); p.rect(37, 27, 6, 3, C.skin); p.px(38, 28, awake ? C.ink : C.skinSh); p.px(41, 28, awake ? C.ink : C.skinSh);
  if (o.sex === 'F') { p.rect(36, 26, 1, 4, C.hair); p.rect(43, 26, 1, 4, C.hair); }
  p.rect(36, 30, 49, 7, '#b7cfdc'); p.rect(36, 30, 49, 1, '#d0e0e8'); p.rect(36, 34, 49, 1, '#93b2c6');
  if ((t >> 2) % 2) p.rect(44, 29, 10, 1, '#d0e0e8'); // 呼吸时被子一起一伏
  p.rect(34, 37, 55, 2, C.gray);
  for (const x of [36, 82]) { p.rect(x, 39, 1, 5, C.gray); p.rect(x - 1, 44, 3, 1, C.grayDk); }
  // 陪床的家人
  woman(p, 46, 21, { top: C.kraftDk, topSh: '#8a6a3a', bottom: C.grayDk, hair: '#4a3426' }, { back: true, t, ph: 1, lean: (t >> 3) % 2 ? -1 : 0 });
  return p;
}

// ---------- 晚年：午后的摇椅、挂钟、一杯茶、一只猫 ----------
function oldage(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 42, '#e8d9b8'); p.rect(0, 34, W, 8, '#d6c39b'); p.rect(0, 34, W, 1, '#bfa77a');
  p.rect(0, 42, W, 12, C.woodLt); for (let y = 45; y < H; y += 4) p.rect(0, y, W, 1, C.wood);
  // 窗和斜照进来的阳光
  p.rect(5, 5, 22, 24, C.white); p.rect(6, 6, 20, 22, C.sky); p.rect(6, 20, 20, 8, C.greenLt); p.rect(15, 6, 1, 22, C.white); p.rect(6, 16, 20, 1, C.white);
  for (let y = 29; y < H; y++) { const a = 8 + Math.round((y - 29) * 0.7); for (let x = a; x < a + 20; x++) if ((x + y) % 2) p.px(x, y, y < 42 ? '#efe4c8' : '#c08a56'); }
  // 挂钟，钟摆来回
  p.rect(43, 4, 11, 23, C.wood); p.rect(43, 4, 11, 1, C.woodLt);
  disc(p, 48, 8, 3, C.cream); p.px(48, 7, C.ink); p.px(48, 6, C.ink); p.px(49, 8, C.ink);
  p.rect(45, 13, 7, 12, '#5b3a1f');
  const sw = [-2, -1, 0, 1, 2, 1, 0, -1][t % 8];
  p.px(48, 13, C.gold); p.px(48, 14, C.gold); p.px(48 + Math.round(sw / 2), 15, C.gold); p.px(48 + Math.round(sw / 2), 16, C.gold);
  p.px(48 + sw, 17, C.gold); p.px(48 + sw, 18, C.gold); p.rect(47 + sw, 19, 3, 3, C.gold);
  // 墙上的全家福
  p.rect(60, 8, 14, 10, C.wood); p.rect(61, 9, 12, 8, C.cream);
  for (const [x, c] of [[63, C.blueLt], [66, C.redLt], [69, C.greenLt]] as const) { p.rect(x, 11, 2, 2, C.hair); p.rect(x, 13, 2, 3, c); }
  // 地毯和猫，猫尾巴甩一甩
  p.rect(30, 47, 26, 4, '#b35a4a'); p.rect(30, 47, 26, 1, '#c97a62');
  p.rect(37, 44, 8, 3, '#d9893a'); p.rect(44, 42, 3, 3, '#d9893a'); p.px(44, 41, '#d9893a'); p.px(46, 41, '#d9893a'); p.px(45, 43, C.ink);
  if ((t >> 2) % 2) { p.px(36, 45, '#d9893a'); p.px(35, 44, '#d9893a'); } else { p.px(36, 46, '#d9893a'); p.px(35, 46, '#d9893a'); }
  // 摇椅：靠背和人一起前后摇（上半身左右挪一格），底下的弧形腿不动
  const r = [0, 1, 0, -1][(t >> 1) % 4];
  p.rect(59 + r, 22, 14, 18, C.wood); p.rect(60 + r, 23, 12, 16, C.woodLt);
  // 摇着摇着就打起了瞌睡，头一点一点
  const doze = (t >> 3) % 3 === 2;
  person(p, o.sex, 61 + r, 24, { top: '#a37f48', topSh: '#8a6a3a', bottom: C.grayDk, bottomSh: '#3e3832', hair: C.hairGray }, { sit: true, t, nod: doze ? 1 + (t % 2) : 0 });
  p.rect(58, 39, 16, 2, C.wood); p.rect(60, 41, 1, 4, C.wood); p.rect(71, 41, 1, 4, C.wood);
  p.rect(56, 45, 20, 1, C.wood); p.px(55, 44, C.wood); p.px(76, 44, C.wood);
  // 茶几和冒着热气的茶
  p.rect(80, 36, 12, 2, C.wood); p.rect(81, 38, 1, 6, C.wood); p.rect(90, 38, 1, 6, C.wood);
  p.rect(84, 33, 3, 3, C.white); p.px(87, 34, C.white);
  for (let k = 0; k < 3; k++) p.px(85 + [0, 1, 0, -1][(t + k) % 4], 32 - ((t + k * 2) % 6), '#fbf6ea');
  return p;
}

// ---------- 拆迁：墙上画着红圈“拆”，挖掘机在拆隔壁 ----------
function demolishScene(o: SceneCtx, t: number) {
  const p = new Pix(W, H), s = o.seed || 1;
  p.rect(0, 0, W, 44, '#e8dcc0'); p.rect(0, 0, W, 10, '#d9c7a6'); p.dither(0, 10, W, 3, '#d9c7a6', '#e8dcc0');
  // 远处已经盖起来的新楼
  for (const [x, w, h] of [[50, 9, 26], [61, 7, 32], [70, 10, 22], [84, 8, 28]]) { p.rect(x, 44 - h, w, h, '#c9c3b8'); for (let j = 47 - h; j < 40; j += 3) p.rect(x + 2, j, w - 4, 1, '#b8b2a6'); }
  // 老房子：砖墙、破窗，墙上刷白的一块写着红圈“拆”
  p.rect(3, 17, 46, 27, '#9a8f84');
  for (let j = 19; j < 44; j += 3) for (let i = 3 + (j % 2) * 2; i < 49; i += 5) p.rect(i, j, 4, 1, '#8a7f74');
  p.rect(1, 13, 50, 4, '#5b524a'); p.rect(3, 12, 46, 1, '#4a423b');
  for (const x of [7, 38]) { p.rect(x, 21, 7, 8, '#3e3832'); p.rect(x, 21, 7, 1, C.grayLt); p.px(x + 2, 23, '#6a7884'); }
  p.rect(18, 20, 17, 17, '#e9e3d6');
  for (let a = 0; a < 64; a++) { const x = Math.round(26 + 7 * Math.cos(a / 64 * 2 * Math.PI)), y = Math.round(28 + 7 * Math.sin(a / 64 * 2 * Math.PI)); p.rect(x, y, 1, 1, C.red); }
  hanzi(p, '拆', 21, 23, 11, C.red);
  // 拆了一半的废墟
  for (let k = 0; k < 120; k++) { const x = 50 + Math.floor(hash(s, k) * 30), h = 9 - Math.abs(x - 64) * 0.5; const y = 44 - Math.floor(hash(s + 1, k) * Math.max(1, h)); p.px(x, y, ['#9a8f84', '#8a7f74', C.gray, '#b36a4a'][k % 4]); }
  // 地面
  p.rect(0, 44, W, 10, '#b8a98c'); for (let x = 2; x < W; x += 7) p.px(x, 47 + (x % 3), '#a39272');
  // 挖掘机：动臂一抬一落，斗子落下时扬起灰
  const ph = [0, 1, 2, 3, 3, 2, 1, 0][(t >> 1) % 8];
  p.rect(66, 44, 24, 4, C.grayDk); for (let x = 68; x < 89; x += 4) p.rect(x, 45, 2, 2, C.gray);
  p.rect(68, 36, 18, 8, C.gold); p.rect(68, 42, 18, 2, C.goldDk); p.rect(79, 29, 7, 7, C.gold); p.rect(80, 30, 5, 4, '#7f9aab');
  const ex = 59, ey = 23 + ph, bx = 55, by = 31 + ph * 3;
  line(p, 70, 36, ex, ey, C.goldDk, 2); line(p, ex, ey, bx, by, C.gold, 2);
  p.rect(bx - 2, by + 1, 4, 3, C.grayDk); p.px(bx - 2, by + 4, C.grayDk); p.px(bx, by + 4, C.grayDk);
  if (ph >= 2) for (let k = 0; k < 7; k++) p.px(bx - 4 + Math.floor(hash(t, k) * 9), by + 2 - Math.floor(hash(t + 9, k) * (ph * 2)), '#d6cbb5');
  // 站在门口看的爸妈
  const pa: Pose = { t, ph: 0 }, ma: Pose = { t, ph: 2, nod: (t >> 3) % 2 };
  man(p, 6, 32, { top: '#6a7682', topSh: '#56616c', bottom: C.grayDk, hair: C.hairGray }, pa);
  woman(p, 30, 32, { top: '#a37f48', topSh: '#8a6a3a', bottom: '#4a423b', hair: '#6b6158' }, ma);
  return p;
}

// ---------- 给孩子买婚房：售楼处的沙盘 ----------
function kidhomeScene(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 42, '#efe4cc'); p.rect(0, 42, W, 12, '#d8cdb8');
  for (let y = 45; y < H; y += 3) p.rect(0, y, W, 1, '#e4dacb');
  // 落地窗外的楼
  p.rect(3, 3, 40, 30, C.grayLt); p.rect(4, 4, 38, 28, C.sky);
  for (const [x, w, h] of [[6, 7, 18], [15, 8, 24], [25, 7, 15], [34, 7, 21]]) { p.rect(x, 32 - h, w, h, '#e6dcc8'); for (let j = 34 - h; j < 30; j += 3) for (let i = x + 1; i < x + w - 1; i += 2) p.px(i, j, C.glass); }
  p.rect(23, 4, 1, 28, C.grayLt);
  // 红色横幅
  p.rect(50, 5, 40, 6, C.red); glyphs(p, 52, 6, 9, C.gold, 21);
  // 人：你和老伴、孩子和对象，售楼员在指沙盘
  const sp: Pose = { t, ph: 5, arms: (t >> 2) % 2 ? 'L' : undefined };
  man(p, 84, 20, { top: C.suit, topSh: C.suitSh, bottom: C.suit, hair: C.hair }, sp);
  const card = (t >> 2) % 3 === 0, yp: Pose = { t, ph: 0, arms: card ? 'R' : undefined };
  person(p, o.sex, 8, 21, { top: '#8a6a3a', topSh: '#735a30', bottom: C.grayDk, hair: '#6b6158' }, yp);
  if (card) { p.rect(17, 21 + bob(yp), 4, 3, C.gold); p.px(18, 22 + bob(yp), C.goldDk); }
  person(p, o.sex === 'F' ? 'M' : 'F', 20, 21, { top: '#5a7f6a', topSh: '#4a6a58', bottom: '#4a423b', hair: '#6b6158' }, { t, ph: 2 });
  man(p, 58, 20, { top: '#5a7fb0', topSh: '#476b9b', bottom: C.grayDk }, { t, ph: 1, lean: -((t >> 3) % 2) });
  woman(p, 69, 21, { top: '#e6a1a0', topSh: '#cf8584', bottom: C.blue }, { t, ph: 3, lean: -((t >> 3) % 2) });
  // 沙盘挡住大家的腿，小楼的灯一闪一闪
  p.rect(32, 34, 50, 2, C.white); p.rect(32, 36, 50, 6, C.woodLt); p.rect(32, 41, 50, 1, C.wood);
  p.rect(33, 32, 48, 2, '#cfe0c4');
  for (let i = 0; i < 9; i++) {
    const x = 35 + i * 5, h = 3 + Math.floor(hash(i, 7) * 7);
    p.rect(x, 33 - h, 3, h, '#f6efe0'); p.rect(x + 2, 33 - h, 1, h, '#ddd3c0');
    if (hash(i, t >> 1) < 0.5) p.px(x + 1, 33 - h + 1 + (i % 2), C.sun);
  }
  return p;
}

// ---------- 兄弟姐妹来借钱：夜里的饭桌 ----------
function sibloanScene(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 42, '#cdbf9f'); p.rect(0, 30, W, 12, '#b9a77f'); p.rect(0, 30, W, 1, '#a39065');
  p.rect(0, 42, W, 12, C.woodLt); for (let y = 45; y < H; y += 4) p.rect(0, y, W, 1, C.wood);
  // 窗外是夜
  p.rect(4, 6, 18, 16, C.white); p.rect(5, 7, 16, 14, '#2f3b55'); p.rect(12, 7, 1, 14, C.white); p.px(8, 10, '#f2e6b8'); p.px(17, 15, '#f2e6b8');
  // 挂历
  p.rect(78, 6, 11, 14, C.white); p.rect(78, 6, 11, 3, C.red);
  for (let j = 11; j < 19; j += 2) for (let i = 79; i < 88; i += 2) p.px(i, j, j === 13 && i === 83 ? C.red : C.gray);
  // 吊灯来回晃，灯光跟着晃
  const sw = [0, 1, 1, 0, 0, -1, -1, 0][t % 8], lx = 48 + sw;
  p.dither(lx - 14, 14, 28, 22, '#ddd0b0', '#cdbf9f');
  line(p, 48, 0, lx, 9, C.ink);
  p.rect(lx - 4, 10, 9, 2, C.green); p.rect(lx - 5, 12, 11, 2, C.green); p.rect(lx - 2, 14, 5, 1, '#f7d36e');
  // 你和兄弟姐妹面对面坐着；对方说着说着就比划起来
  const sp: Pose = { sit: true, t, ph: 2, arms: (t >> 2) % 3 === 1 ? 'L' : undefined };
  for (const x of [26, 61]) { p.rect(x + 1, 38, 8, 2, C.wood); p.rect(x + 2, 40, 1, 5, C.wood); p.rect(x + 7, 40, 1, 5, C.wood); }
  person(p, o.sex, 26, 22, { top: '#5a7fb0', topSh: '#476b9b', bottom: C.grayDk }, { sit: true, t, ph: 0, nod: (t >> 3) % 2 });
  man(p, 61, 22, { top: '#a37f48', topSh: '#8a6a3a', bottom: '#4a423b' }, sp);
  // 饭桌、两杯茶冒着热气、一盘花生
  p.rect(28, 36, 42, 2, C.wood); p.rect(28, 38, 42, 1, '#6e4626'); p.rect(31, 39, 2, 9, C.wood); p.rect(65, 39, 2, 9, C.wood);
  for (const cx of [38, 58]) {
    p.rect(cx, 33, 3, 3, C.white);
    for (let k = 0; k < 2; k++) p.px(cx + 1 + [0, 1, 0, -1][(t + k * 2) % 4], 31 - ((t + k * 3) % 5), '#efe6d2');
  }
  p.rect(45, 34, 8, 2, C.white); p.px(47, 33, C.woodLt); p.px(49, 33, C.woodLt); p.px(48, 33, C.wood);
  return p;
}

// ---------- 老房子怎么分：堂屋里的遗像和香 ----------
function heritageScene(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 44, '#e8d9b8'); p.rect(0, 32, W, 12, '#6e4626'); p.rect(0, 32, W, 1, '#5b3a1f');
  p.rect(0, 44, W, 10, '#a59a8a'); for (let x = 0; x < W; x += 12) p.rect(x, 44, 1, 10, '#958a7a');
  // 白色挽联
  for (const x of [8, 84]) { p.rect(x, 4, 4, 28, C.white); for (let j = 6; j < 30; j += 4) p.rect(x + 1, j, 2, 2, C.gray); }
  // 遗像：黑框、黑纱
  for (const [x, hair] of [[30, C.hairGray], [54, '#b5aca2']] as const) {
    p.rect(x, 6, 12, 15, C.ink); p.rect(x + 1, 7, 10, 13, '#cfcac2');
    p.rect(x + 3, 9, 6, 3, hair); p.rect(x + 3, 11, 6, 5, '#b9b1a6'); p.px(x + 4, 13, '#6e665c'); p.px(x + 7, 13, '#6e665c');
    p.rect(x + 2, 17, 8, 3, '#8a8378');
    p.rect(x + 4, 4, 4, 2, C.ink); p.px(x + 3, 5, C.ink); p.px(x + 8, 5, C.ink);
  }
  // 供桌、香炉、蜡烛
  p.rect(22, 26, 52, 3, '#5b3a1f'); p.rect(24, 29, 2, 15, '#4a2e18'); p.rect(70, 29, 2, 15, '#4a2e18');
  p.rect(45, 22, 6, 4, '#a37f48'); p.rect(44, 22, 8, 1, '#8a6a3a');
  for (const [k, x] of [[0, 46], [1, 48], [2, 50]]) {
    p.rect(x, 17, 1, 5, '#b36a4a'); p.px(x, 16, (t + k) % 3 ? C.redLt : C.sun);
    for (let j = 0; j < 4; j++) p.px(x + [0, 1, 1, 0, -1, -1][(t + j + k * 2) % 6], 14 - j * 2 - ((t + k) % 2), '#cfc8bc');
  }
  for (const x of [26, 68]) { p.rect(x, 20, 2, 6, C.red); p.px(x, 18 + (t % 2), C.sun); p.px(x + 1, 19, (t >> 1) % 2 ? '#ff9a3c' : C.sun); p.px(x, 19, '#ff9a3c'); }
  // 兄弟姐妹（背影，戴孝）
  const mourn = { top: C.white, topSh: '#ddd3c0', bottom: C.ink };
  man(p, 22, 32, { ...mourn, hair: C.hair }, { back: true, t, ph: 0 });
  person(p, o.sex, 43, 32, { ...mourn, hair: C.hair }, { back: true, t, ph: 2, nod: (t >> 3) % 2 });
  woman(p, 64, 32, { ...mourn, hair: '#3a2a20' }, { back: true, t, ph: 4, lean: (t >> 4) % 2 ? -1 : 0 });
  return p;
}

// ---------- 裁员名单：会议室里，HR 手上拿着名单 ----------
function layofflistScene(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 44, '#e6e2da'); p.rect(0, 44, W, 10, '#a9a49a'); p.dither(0, 44, W, 2, '#b9b4aa', '#a9a49a');
  // 玻璃隔断外面是工位：显示器一闪一闪，有一个工位已经空了，桌上放着纸箱
  p.rect(2, 4, 62, 28, '#cfd8da'); p.rect(2, 4, 62, 1, C.gray); p.rect(2, 31, 62, 1, C.gray);
  for (let x = 2; x < 64; x += 20) p.rect(x, 4, 1, 28, C.gray);
  for (const [k, x] of [[0, 6], [1, 20], [2, 34], [3, 48]] as const) {
    p.rect(x, 24, 12, 2, C.grayLt);
    if (k === 2) { p.rect(x + 3, 20, 6, 4, C.kraft); p.rect(x + 3, 20, 6, 1, C.kraftDk); continue; }
    p.rect(x + 4, 17, 6, 5, C.ink); p.rect(x + 5, 18, 4, 3, hash(k, t >> 1) < 0.2 ? '#9fc0d0' : '#5a7fb0');
    p.rect(x + 1, 18 + ((t + k) % 4 === 0 ? 1 : 0), 3, 3, C.hair); p.rect(x + 1, 21, 3, 3, ['#7fa36a', '#c0453a', '#5a7fb0', '#a37f48'][k]);
  }
  // 挂钟
  disc(p, 82, 10, 4, C.white); p.px(82, 10, C.ink); p.px(82, 8, C.ink); p.px(82, 7, C.ink);
  const sx = [0, 1, 2, 1, 0, -1, -2, -1][t % 8], sy = [-3, -2, 0, 2, 3, 2, 0, -2][t % 8]; p.px(82 + sx, 10 + sy, C.red);
  // HR 坐在对面，名单时不时拿起来看一眼
  const hp: Pose = { sit: true, t, ph: 3, arms: (t >> 2) % 3 === 0 ? 'R' : undefined };
  woman(p, 58, 22, { top: C.suit, topSh: C.suitSh, bottom: C.suit, hair: '#3a2a20' }, hp);
  if (hp.arms) { p.rect(67, 19 + bob(hp), 5, 7, C.white); for (let j = 21; j < 25; j++) p.rect(68, j + bob(hp), 3, 1, C.gray); }
  // 会议桌，桌上一杯水、一叠纸
  p.rect(24, 36, 54, 2, C.white); p.rect(24, 38, 54, 1, C.grayLt); p.rect(27, 39, 2, 7, C.gray); p.rect(73, 39, 2, 7, C.gray);
  p.rect(60, 33, 3, 3, '#c3d8da'); p.rect(44, 35, 8, 1, C.white);
  if (!hp.arms) { p.rect(64, 34, 6, 2, C.white); p.px(65, 34, C.red); }
  // 你，背对着我们坐着，低着头
  for (const x of [30]) { p.rect(x + 1, 40, 8, 2, C.grayDk); p.rect(x + 2, 42, 1, 4, C.grayDk); p.rect(x + 7, 42, 1, 4, C.grayDk); }
  person(p, o.sex, 30, 26, { top: '#5a7fb0', topSh: '#476b9b', bottom: C.grayDk }, { sit: true, back: true, t, nod: (t >> 3) % 2 });
  return p;
}

// ---------- 退休：欢送会，红横幅“光荣退休” ----------
function retireScene(o: SceneCtx, t: number) {
  const p = new Pix(W, H), s = o.seed || 1;
  p.rect(0, 0, W, 42, '#efe4cc'); p.rect(0, 42, W, 12, '#d8cdb8'); for (let y = 45; y < H; y += 3) p.rect(0, y, W, 1, '#cbbfa8');
  // 横幅
  p.rect(18, 2, 60, 15, C.red); p.rect(18, 16, 60, 1, C.redDk);
  '光荣退休'.split('').forEach((ch, i) => hanzi(p, ch, 22 + i * 13, 3, 13, C.gold, false)); // 13px 常规字重在这个尺寸最清楚
  // 彩带
  for (let x = 0; x < W; x += 2) { const y = 1 + Math.round(2 * Math.sin((x + t) / 4)); p.px(x, y, x % 6 < 2 ? C.redLt : x % 6 < 4 ? C.gold : C.blueLt); }
  // 桌上的蛋糕
  p.rect(66, 34, 24, 2, C.white); p.rect(67, 36, 1, 6, C.grayLt); p.rect(88, 36, 1, 6, C.grayLt);
  p.rect(72, 29, 10, 5, '#f2cf9c'); p.rect(72, 29, 10, 1, C.white); p.rect(76, 26, 1, 3, C.redLt); p.px(76, 25 + (t % 2), C.sun);
  // 同事们鼓掌（手一上一下）
  const mates: [number, string, 'M' | 'F'][] = [[4, '#7fa36a', 'F'], [15, '#5a7fb0', 'M'], [58, '#a37f48', 'M'], [84, '#c0453a', 'F']];
  mates.forEach(([x, top, sx], k) => person(p, sx, x, 22 + (k % 2), { top, topSh: top, bottom: C.grayDk }, { t, ph: k, arms: (t + k) % 2 ? 'both' : undefined }));
  // 退休的你：抱着花，手里是红色的退休证
  const me: Pose = { t, ph: 5 }, d = bob(me);
  person(p, o.sex, 36, 21, { top: C.suit, topSh: C.suitSh, bottom: C.suit, hair: C.hairGray }, me);
  for (const [x, y, c] of [[38, 30, C.redLt], [39, 29, C.pink], [40, 30, C.redLt], [39, 31, C.red], [41, 29, C.gold], [38, 32, C.leaf], [40, 32, C.leaf], [39, 33, C.leaf]] as const) p.px(x, y + d, c);
  p.rect(43, 31 + d, 4, 3, C.red); p.px(44, 32 + d, C.gold);
  // 掉下来的彩纸
  for (let k = 0; k < 14; k++) { const y = (Math.floor(hash(s, k) * 40) + t) % 40, x = Math.floor(hash(s + 2, k) * W); if (y > 16) p.px(x, y, k % 2 ? C.gold : C.pinkLt); }
  return p;
}

export const SCENES: Record<SceneId, (o: SceneCtx, t: number) => Pix> = {
  birth, gaokao, wedding, house, date, grad, train, layoff, nursery, ward, oldage,
  demolish: demolishScene, kidhome: kidhomeScene, sibloan: sibloanScene, heritage: heritageScene,
  layofflist: layofflistScene, retire: retireScene,
};
