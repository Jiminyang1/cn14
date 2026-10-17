// 场景素材：背景、家具、道具、拿在手上的东西。新场景尽量用这里的东西拼，一张图十几行就能写完。
// 约定：画布 96×54；feet 是脚踩的那一行；颜色从 C（pix.ts）和这里的 WEAR 取，少写裸的色值。
// 写完用 `npm run pixel -- 场景名` 出图看效果，不用开浏览器。
import { C, Pix, disc, hash, line, scrawl, type Look, type Pt } from './pix';

const W = 96;


// ===== 衣服配色：dress(WEAR.blue, WEAR.pants) 拼出一身 =====
export const WEAR = {
  blue: { top: '#5a7fb0', topSh: '#476b9b' },
  brown: { top: '#a37f48', topSh: '#8a6a3a' },
  green: { top: '#7fa36a', topSh: '#5d8a4e' },
  red: { top: '#c0453a', topSh: '#9e3328' },
  pink: { top: C.pink, topSh: '#cf8584' },
  white: { top: C.white, topSh: '#d8cfbd' },
  gray: { top: '#7f8a96', topSh: '#6a7682' },
  suit: { top: C.suit, topSh: C.suitSh, bottom: C.suit, bottomSh: C.suitSh },
  school: { top: C.white, topSh: '#d8cfbd', bottom: C.blue, bottomSh: '#1f3a60', shoe: C.white },
  pants: { bottom: C.grayDk, bottomSh: '#4a423b' },
  jeans: { bottom: C.blue, bottomSh: '#1f3a60' },
  old: { hair: C.hairGray },
};
export const dress = (...parts: Partial<Look>[]) => Object.assign({ top: WEAR.blue.top }, ...parts) as Look;

// ===== 站位：人画在哪一行，脚才正好踩在 feet 上 =====
export const ROWS = { adult: 22, child: 14, sit: 20 };
export const stand = (feet: number, k: keyof typeof ROWS = 'adult') => feet - ROWS[k] + 1;

// ===== 背景 =====
/** 天空：从上到下几种颜色，交界处用棋盘格过渡 */
export const SKY = { day: [C.skyLt, C.sky], dusk: ['#d99a86', '#e9b48a', '#f2cf9c'], night: ['#1e2833', '#2f3b55'] };
export function sky(p: Pix, h: number, look: keyof typeof SKY = 'day') {
  const cs = SKY[look], band = Math.ceil(h / cs.length);
  cs.forEach((c, i) => p.rect(0, i * band, W, band, c));
  for (let i = 1; i < cs.length; i++) p.dither(0, i * band - 1, W, 2, cs[i - 1], cs[i]);
  p.rect(0, h, W, 0, cs[0]);
}
/** 室内：墙、墙裙（可选）、地面 */
export function room(p: Pix, o: { wall: string; floorY: number; floor: string; trim?: { y: number; color: string; line?: string }; lines?: { color: string; step: number; dir?: 'h' | 'v' } }) {
  p.rect(0, 0, W, o.floorY, o.wall);
  if (o.trim) { p.rect(0, o.trim.y, W, o.floorY - o.trim.y, o.trim.color); if (o.trim.line) p.rect(0, o.trim.y, W, 1, o.trim.line); }
  ground(p, o.floorY, o.floor, o.lines);
}
/** 地面（室外的路、操场也用它） */
export function ground(p: Pix, y: number, color: string, lines?: { color: string; step: number; dir?: 'h' | 'v' }) {
  p.rect(0, y, W, 54 - y, color);
  if (!lines) return;
  if (lines.dir === 'v') for (let x = 0; x < W; x += lines.step) p.rect(x, y, 1, 54 - y, lines.color);
  else for (let yy = y + 3; yy < 54; yy += lines.step) p.rect(0, yy, W, 1, lines.color);
}
/** 慢慢往右飘的云 */
export function clouds(p: Pix, t: number, list: [number, number][] = [[10, 6], [62, 9]]) {
  for (const [cx, cy] of list) { const x = (cx + (t >> 1)) % 110 - 10; p.rect(x, cy, 9, 2, C.white); p.rect(x + 2, cy - 1, 4, 1, C.white); }
}
/** 树：按季节换叶子。春天开花、夏天浓绿、秋天黄红、冬天只剩树枝 */
export function tree(p: Pix, x: number, feet: number, r = 5, season: Season = 'summer') {
  p.rect(x, feet - 15, 2, 16, C.wood);
  if (season === 'winter') {
    for (const [dx, dy, l] of [[-1, -17, 4], [2, -18, 4], [0, -21, 3]] as const) line(p, x + 1, feet - 14, x + dx + (dx < 0 ? -l : dx > 1 ? l : 0), feet + dy, C.wood);
    return;
  }
  const L = LEAF[season];
  disc(p, x + 1, feet - 19, r, L[0]); disc(p, x - 1, feet - 17, Math.max(2, r - 2), L[1]);
  if (L[2]) for (let k = 0; k < r * 2; k++) p.px(x + 1 + Math.round((hash(x, k) - 0.5) * r * 1.8), feet - 19 + Math.round((hash(k, x) - 0.5) * r * 1.8), L[2]);
}

// ===== 四季和天气（游戏的时间以月为单位，所以只有季节，没有早晚） =====
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
/** 游戏里第几个月 → 季节（北半球，3–5 月春） */
export const seasonOf = (month: number): Season => (['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'] as Season[])[((month - 1) % 12 + 12) % 12];
const LEAF: Record<Exclude<Season, 'winter'>, string[]> = {
  spring: ['#8fb87a', C.greenLt, C.pinkLt],      // 嫩绿，点缀花
  summer: [C.leaf, C.green],
  autumn: ['#d9893a', '#c0453a', C.gold],
};
/** 天气层：春天飘花瓣、秋天落叶、冬天下雪；rain 时下雨（任何季节） */
export function weather(p: Pix, season: Season, t: number, o: { rain?: boolean; seed?: number; n?: number } = {}) {
  const s = o.seed ?? 7;
  if (o.rain) {
    for (let k = 0; k < (o.n ?? 60); k++) { const y = (Math.floor(hash(s + 1, k) * 60) + t * 6) % 60 - 4, x = (Math.floor(hash(s, k) * W) + W - Math.floor(y / 4)) % W; p.px(x, y, '#a9b9c4'); p.px(x, y + 1, '#a9b9c4'); p.px(x - 1, y + 2, '#8c9ea9'); }
    return;
  }
  if (season === 'summer') return;
  const n = o.n ?? (season === 'winter' ? 40 : 14), speed = season === 'winter' ? 1 : 1;
  for (let k = 0; k < n; k++) {
    const y = (Math.floor(hash(s + 3, k) * 54) + Math.floor(t * speed * (0.6 + hash(s + 4, k) * 0.8))) % 54;
    const x = (Math.floor(hash(s + 5, k) * W) + Math.round(Math.sin((t + k * 5) / 4) * 2) + W) % W;
    if (season === 'winter') p.px(x, y, C.white);
    else if (season === 'spring') p.px(x, y, k % 3 ? C.pinkLt : C.white);
    else { p.px(x, y, k % 2 ? '#d9893a' : '#c0453a'); if (k % 3 === 0) p.px(x + 1, y, '#d9893a'); }
  }
}
/** 积雪：在一段平面（屋顶、地面、窗台）的上沿铺一层白 */
export function snowCap(p: Pix, x: number, y: number, w: number, deep = 1) {
  for (let i = 0; i < w; i++) p.rect(x + i, y - (hash(x + i, y) < 0.3 ? 1 : 0), 1, deep, C.white);
}
/** 季节的整体色调：画完整张图再调。冬天偏冷偏灰，秋天偏暖；keep 里的颜色（灯、亮着的窗）不变 */
export function seasonGrade(p: Pix, season: Season, keep: string[] = []) {
  const K = new Set([C.sun, '#f7d36e', '#f2e6b8', C.white, ...keep]);
  if (season === 'winter') p.grade(([r, g, b]) => { const m = (r + g + b) / 3; return [r * 0.8 + m * 0.12 - 4, g * 0.84 + m * 0.12, b * 0.9 + m * 0.1 + 10]; }, K);
  if (season === 'autumn') p.grade(([r, g, b]) => [r * 1.03 + 6, g * 0.98, b * 0.88], K);
}
/** 窗户：view 决定窗外是什么 */
export function win(p: Pix, x: number, y: number, w: number, h: number, view: 'day' | 'night' | 'hills' | 'city' = 'day', t = 0) {
  p.rect(x, y, w, h, C.white);
  const ix = x + 1, iy = y + 1, iw = w - 2, ih = h - 2;
  p.rect(ix, iy, iw, ih, view === 'night' ? '#2f3b55' : C.sky);
  if (view === 'night') for (let k = 0; k < 4; k++) if (hash(k, t >> 1) < 0.7) p.px(ix + 1 + Math.floor(hash(k, 3) * (iw - 2)), iy + 1 + Math.floor(hash(k, 4) * (ih - 2)), '#f2e6b8');
  if (view === 'hills') for (let i = 0; i < iw; i++) { const hh = Math.round(ih * 0.4 + 2 * Math.sin(i / 3)); p.rect(ix + i, iy + ih - hh, 1, hh, C.leaf); }
  if (view === 'city') for (let i = 0, k = 0; i < iw; k++) { const bw = 3 + Math.floor(hash(k, 1) * 3), bh = Math.floor(ih * (0.3 + hash(k, 2) * 0.5)); p.rect(ix + i, iy + ih - bh, Math.min(bw, iw - i), bh, '#93a9b6'); i += bw + 1; }
  p.rect(x + Math.floor(w / 2), y, 1, h, C.white);
}
/** 红底横幅，上面 n 个“字”（笔画块，不画真的汉字），居中放在 cx */
export function banner(p: Pix, cx: number, y: number, n: number, o: { bg?: string; fg?: string; seed?: number } = {}) {
  const w = n * 13 + 4, x = Math.round(cx - w / 2);
  p.rect(x, y, w, 15, o.bg || C.red); p.rect(x, y + 14, w, 1, C.redDk);
  scrawl(p, x + 3, y + 2, n, 11, o.fg || C.gold, o.seed ?? n);
  return { x, w };
}
/** 顶上一条随风起伏的彩带 */
export function streamer(p: Pix, y: number, t: number) {
  for (let x = 0; x < W; x += 2) p.px(x, y + Math.round(2 * Math.sin((x + t) / 4)), x % 6 < 2 ? C.redLt : x % 6 < 4 ? C.gold : C.blueLt);
}
/** 往下飘的彩纸；只画在 from 以下 */
export function confetti(p: Pix, seed: number, t: number, o: { n?: number; bottom?: number; from?: number } = {}) {
  const n = o.n ?? 14, bottom = o.bottom ?? 40, from = o.from ?? 0;
  for (let k = 0; k < n; k++) { const y = (Math.floor(hash(seed, k) * bottom) + t) % bottom, x = Math.floor(hash(seed + 2, k) * W); if (y > from) p.px(x, y, k % 2 ? C.gold : C.pinkLt); }
}
/** 迎风飘的红旗：左边贴着旗杆 */
export function flag(p: Pix, x: number, y: number, t: number, w = 10, h = 7) {
  const wave = (i: number) => Math.round(Math.sin((i - t) / 2) * (i / w) * 1.5);
  for (let i = 0; i < w; i++) p.rect(x + i, y + wave(i), 1, h, C.red);
  p.px(x + 2, y + 1, C.gold);
  for (const [i, j] of [[4, 0], [5, 1], [5, 3], [4, 4]]) p.px(x + i, y + j + wave(i), C.gold);
}

// ===== 家具 =====
export function table(p: Pix, x: number, y: number, w: number, o: { top?: string; leg?: string; h?: number } = {}) {
  const leg = o.leg || C.grayLt, h = o.h ?? 6;
  p.rect(x, y, w, 2, o.top || C.white); p.rect(x + 1, y + 2, 1, h, leg); p.rect(x + w - 2, y + 2, 1, h, leg);
}
export function stool(p: Pix, x: number, y: number, c = C.wood) { p.rect(x + 1, y, 8, 2, c); p.rect(x + 2, y + 2, 1, 4, c); p.rect(x + 7, y + 2, 1, 4, c); }
/** 一缕往上飘的热气 */
export function steam(p: Pix, x: number, y: number, t: number, color = '#fbf6ea', n = 2) {
  for (let k = 0; k < n; k++) p.px(x + [0, 1, 0, -1][(t + k * 2) % 4], y - ((t + k * 3) % 5), color);
}
export function cup(p: Pix, x: number, y: number, t: number, steamColor?: string) { p.rect(x, y, 3, 3, C.white); p.px(x + 3, y + 1, C.white); steam(p, x + 1, y - 1, t, steamColor); }
export function cake(p: Pix, x: number, y: number, t: number) {
  p.rect(x, y, 10, 5, '#f2cf9c'); p.rect(x, y, 10, 1, C.white); p.rect(x + 4, y - 3, 1, 3, C.redLt); p.px(x + 4, y - 4 + (t % 2), C.sun);
}

// ===== 拿在手上的东西：传 man()/woman()/child() 返回的身体点位 =====
export const hold = {
  /** 一束花，抱在胸前 */
  flowers(p: Pix, b: { chest: Pt }) {
    const { x, y } = b.chest;
    for (const [dx, dy, c] of [[-1, 1, C.redLt], [0, 0, C.pink], [1, 1, C.redLt], [0, 2, C.red], [2, 0, C.gold], [-1, 3, C.leaf], [1, 3, C.leaf], [0, 4, C.leaf]] as const) p.px(x + dx, y + dy, c);
  },
  /** 一张卡片 / 证书 / 银行卡 */
  card(p: Pix, h: Pt, color = C.red, mark = C.gold) { p.rect(h.x, h.y - 3, 4, 3, color); p.px(h.x + 1, h.y - 2, mark); },
  /** 举着手机；flash 时闪一下 */
  phone(p: Pix, h: Pt, flash = false) {
    p.rect(h.x, h.y - 3, 2, 3, C.ink);
    if (flash) for (const [dx, dy] of [[2, -2], [3, -3], [2, 0], [0, -4]]) p.px(h.x + dx, h.y + dy, C.white);
  },
  /** 拎着的包 */
  bag(p: Pix, h: Pt, color = C.blueLt, w = 4, hh = 5) { p.rect(h.x - Math.floor(w / 2), h.y, w, hh, color); },
  /** 地上拖着的行李箱 */
  suitcase(p: Pix, x: number, feet: number, color = C.gold) { p.rect(x, feet - 8, 5, 8, color); p.rect(x + 1, feet - 10, 1, 2, C.grayDk); p.px(x, feet, C.ink); p.px(x + 4, feet, C.ink); },
};
export { line };

// ===== 生活细节：农村院子 =====
/** 烟囱冒的烟，一团团往上飘、慢慢散开 */
export function smoke(p: Pix, x: number, y: number, t: number, n = 4) {
  for (let k = 0; k < n; k++) {
    const ph = (t + k * 3) % 12, yy = y - ph, xx = x + Math.round(Math.sin((t + k * 4) / 3) * (ph / 4));
    const c = ph < 5 ? '#a9a299' : '#c4beb4'; p.rect(xx, yy, ph < 8 ? 2 : 1, ph < 8 ? 2 : 1, c);
  }
}
/** 屋檐下挂的一串玉米（金黄，顶上扎着干叶子） */
export function corn(p: Pix, x: number, y: number, len = 7) {
  p.rect(x, y, 3, 1, '#a39272');
  for (let j = 1; j <= len; j++) { p.px(x, y + j, j % 2 ? C.gold : C.goldDk); p.px(x + 1, y + j, C.gold); p.px(x + 2, y + j, j % 2 ? C.goldDk : C.gold); }
}
/** 墙上挂的一串红辣椒 */
export function chili(p: Pix, x: number, y: number, len = 8) { p.px(x + 1, y, '#a39272'); for (let j = 1; j <= len; j++) { p.px(x + (j % 2), y + j, j % 3 ? C.red : C.redLt); } }
/** 一垛柴火：横着码的木头，截面是浅色的圈 */
export function firewood(p: Pix, x: number, feet: number, w = 10, h = 6) {
  p.rect(x, feet - h + 1, w, h, '#8f7d63');
  for (let j = 0; j < h; j += 2) for (let i = (j / 2) % 2; i < w; i += 2) p.px(x + i, feet - h + 1 + j, '#d9c7a6');
}
/** 水缸；冬天水面结冰 */
export function vat(p: Pix, x: number, feet: number, frozen = false) {
  p.rect(x + 1, feet - 6, 6, 7, '#4a4540'); p.rect(x, feet - 6, 8, 1, '#6e665c'); p.rect(x + 2, feet - 6, 4, 1, frozen ? C.white : '#7f9aab'); p.rect(x + 2, feet - 3, 4, 1, '#3a3632');
}
/** 冬储大白菜，一棵棵码起来 */
export function cabbages(p: Pix, x: number, feet: number, n = 4) {
  for (let k = 0; k < n; k++) { const cx = x + (k % 3) * 3 + (k >= 3 ? 1 : 0), cy = feet - 2 - (k >= 3 ? 2 : 0); p.rect(cx, cy, 3, 3, '#dfe9c8'); p.px(cx + 1, cy, '#8fb87a'); p.px(cx, cy + 1, '#8fb87a'); }
}
/** 蜂窝煤，一摞摞 */
export function coal(p: Pix, x: number, feet: number, stacks = 3, h = 4) {
  for (let s = 0; s < stacks; s++) for (let j = 0; j < h; j++) { p.rect(x + s * 3, feet - j, 3, 1, j % 2 ? '#3a3632' : '#4a4540'); p.px(x + s * 3 + 1, feet - j, '#6e665c'); }
}
/** 窗花：窗户中间一个红色的小剪纸 */
export function paperCut(p: Pix, cx: number, cy: number) { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [0, 0]]) p.px(cx + dx, cy + dy, dx || dy ? C.red : C.redLt); }
/** 趴在地上的大黄狗，尾巴摇一摇 */
export function dog(p: Pix, x: number, feet: number, t: number) {
  const c = '#d9a066', d = '#b8803e';
  p.rect(x + 2, feet - 2, 7, 3, c); p.rect(x + 8, feet - 4, 3, 3, c); p.px(x + 8, feet - 5, d); p.px(x + 10, feet - 5, d); p.px(x + 10, feet - 3, C.ink); p.px(x + 11, feet - 2, C.ink);
  p.rect(x + 2, feet, 7, 1, d);
  if ((t >> 1) % 2) { p.px(x + 1, feet - 2, c); p.px(x, feet - 3, c); } else { p.px(x + 1, feet - 1, c); p.px(x, feet - 1, c); }
}

// ===== 生活细节：城里楼下 =====
/** 外墙上的空调外机；夏天滴水 */
export function acUnit(p: Pix, x: number, y: number, t: number, drip = false) {
  p.rect(x, y, 5, 3, '#e8e4dc'); p.rect(x + 1, y + 1, 2, 1, '#a9b0b4'); p.px(x + 4, y + 3, '#a9b0b4');
  if (drip) p.px(x + 4, y + 4 + (t % 4), '#9fb7c4');
}
/** 阳台晾的衣服，随风轻轻摆 */
export function laundry(p: Pix, x: number, y: number, t: number, w = 7) {
  p.rect(x, y, w, 1, C.grayLt);
  const cs = [C.redLt, C.white, C.blueLt, C.gold, C.pinkLt];
  for (let i = 1; i < w - 1; i += 2) { const sw = (t + i) % 6 < 3 ? 0 : 1; p.rect(x + i + sw, y + 1, 1, 2 + (i % 3 === 0 ? 1 : 0), cs[(x + i) % cs.length]); }
}
/** 小店门口的条纹雨棚 */
export function awning(p: Pix, x: number, y: number, w: number) { for (let i = 0; i < w; i++) p.rect(x + i, y, 1, 3, Math.floor(i / 2) % 2 ? C.white : C.redLt); p.rect(x, y + 3, w, 1, C.redDk); }
/** 共享单车 */
export function bike(p: Pix, x: number, feet: number, color = C.gold) {
  for (const cx of [x + 1, x + 6]) { p.px(cx, feet - 2, C.ink); p.px(cx - 1, feet - 1, C.ink); p.px(cx + 1, feet - 1, C.ink); p.px(cx, feet, C.ink); }
  line(p, x + 1, feet - 1, x + 4, feet - 3, color); line(p, x + 4, feet - 3, x + 6, feet - 1, color); p.rect(x + 3, feet - 4, 3, 1, color); p.px(x + 6, feet - 4, C.ink);
}
/** 分类垃圾桶 */
export function bins(p: Pix, x: number, feet: number) { for (const [k, c] of [[0, C.green], [1, C.grayDk], [2, C.blue]] as const) { p.rect(x + k * 4, feet - 5, 3, 6, c); p.rect(x + k * 4, feet - 5, 3, 1, C.grayLt); } }
/** 路灯 */
export function lamp(p: Pix, x: number, feet: number, h = 20) { p.rect(x, feet - h, 1, h + 1, C.grayDk); p.rect(x - 2, feet - h, 4, 2, C.grayDk); p.rect(x - 1, feet - h + 2, 2, 1, '#f2e6b8'); }
