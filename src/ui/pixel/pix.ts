// 像素画：在一张小网格上画矩形和精灵，再按原尺寸画到 canvas 上，用 CSS 放大（image-rendering: pixelated）。
// 只用于界面展示，不碰引擎的随机数（见 README「peek()」那一段）；需要的“随机”用 hash()。

export type Pal = Record<string, string>;

export class Pix {
  d: (string | null)[];
  constructor(public w: number, public h: number) { this.d = new Array(w * h).fill(null); }
  px(x: number, y: number, c: string) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
  }
  /** 棋盘格过渡：两种颜色交错 */
  dither(x: number, y: number, w: number, h: number, a: string, b: string) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, (i + j) % 2 ? a : b);
  }
  /** 精灵：每行一个字符串，'.' 透明，其余字符按调色板取色 */
  sprite(rows: string[], pal: Pal, x: number, y: number, flip = false) {
    rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        const c = pal[r[i]];
        if (c) this.px(flip ? x + r.length - 1 - i : x + i, y + j, c);
      }
    });
  }
  /** 整张图换个色调（黄昏、夜里）：每种颜色只算一次；keep 里的颜色（灯、亮着的窗）保持原样 */
  grade(fn: (rgb: [number, number, number]) => [number, number, number], keep: Set<string> = new Set()) {
    const memo = new Map<string, string>();
    this.d = this.d.map(c => {
      if (!c || keep.has(c)) return c;
      let v = memo.get(c);
      if (!v) {
        const [r, g, b] = fn([parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
        v = '#' + [r, g, b].map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
        memo.set(c, v);
      }
      return v;
    });
  }
  draw(cv: HTMLCanvasElement) {
    cv.width = this.w; cv.height = this.h;
    const g = cv.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, this.w, this.h);
    this.d.forEach((c, k) => { if (c) { g.fillStyle = c; g.fillRect(k % this.w, (k / this.w) | 0, 1, 1); } });
  }
}

/** 确定性的伪随机：同样的输入总是同样的画面 */
export const hash = (a: number, b = 0) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ===== 调色板：贴近「档案袋」的暖色，像一张旧照片 =====
export const C = {
  ink: '#2a231c', white: '#f6efe0', cream: '#efe4cc', paper: '#e2c99c', kraft: '#caa673', kraftDk: '#a37f48',
  skin: '#e9b98c', skinSh: '#c98f62', hair: '#2b2018', hairGray: '#9b9188',
  red: '#b6271d', redLt: '#d9493a', redDk: '#8e1d16', gold: '#e0b04f', goldDk: '#b8862e',
  blue: '#2a4a78', blueLt: '#5a7fb0', sky: '#9fc0d0', skyLt: '#c3d8da', glass: '#7f9aab',
  green: '#3c6a48', greenLt: '#7fa36a', leaf: '#5d8a4e',
  gray: '#8a8075', grayLt: '#c7c2b8', grayDk: '#5b524a', wood: '#8a5a32', woodLt: '#a87444',
  pink: '#e6a1a0', pinkLt: '#f2c6c0', suit: '#34323a', suitSh: '#24222a', sun: '#f0c75a',
};

// ===== 人物：正面站立，10×22。h 头发 s 皮肤 S 阴影 e 眼睛 c 上衣 C 上衣暗面 p 下装 k 鞋 =====
const MAN = [
  '...hhhh...',
  '..hhhhhh..',
  '..hhhhhh..',
  '..hssssh..',
  '..sesses..',
  '..ssssss..',
  '...ssss...',
  '....SS....',
  '.cccccccC.',
  'ccccccccCC',
  'ccccccccCC',
  'ccccccccCC',
  'ccccccccCC',
  'ccccccccCC',
  's.ccccCC.s',
  '..ppppPP..',
  '..ppppPP..',
  '..pp..PP..',
  '..pp..PP..',
  '..pp..PP..',
  '..pp..PP..',
  '..kk..kk..',
];
const WOMAN = [
  '...hhhh...',
  '..hhhhhh..',
  '.hhhhhhhh.',
  '.hhsssshh.',
  '.hsessesh.',
  '.hssssssh.',
  '.h.ssss.h.',
  '.hh.SS.hh.',
  '.hccccccC.',
  'ccccccccCC',
  'ccccccccCC',
  'ccccccccCC',
  's.ccccCC.s',
  '..ccccCC..',
  '..ccccCC..',
  '.cccccCCC.',
  '.cccccCCC.',
  'ccccccCCCC',
  '..ss..SS..',
  '..ss..SS..',
  '..ss..SS..',
  '..kk..kk..',
];

export interface Look { hair?: string; top: string; topSh?: string; bottom?: string; bottomSh?: string; shoe?: string; skin?: string }
const pal = (o: Look): Pal => ({
  h: o.hair || C.hair, s: o.skin || C.skin, S: C.skinSh, e: C.ink,
  c: o.top, C: o.topSh || o.top, p: o.bottom || C.blue, P: o.bottomSh || o.bottom || C.blue, k: o.shoe || C.ink,
});
/** 背影：脸和眼睛换成头发 */
const back = (rows: string[]) => rows.map((r, j) => j < 7 ? r.replace(/[se]/g, 'h') : r);
/** 长裙：腿换成裙摆 */
const long = (rows: string[]) => rows.map((r, j) => j >= 18 && j <= 20 ? '.cccccCCC.' : r);
/** 坐着：正面看，腿短一截（前面通常有椅面挡着），共 20 行 */
const sit = (rows: string[], leg: string, upto = 16) => [...rows.slice(0, upto), leg, leg, leg, '..kk..kk..'];

export interface Pose {
  back?: boolean; sit?: boolean; long?: boolean;
  /** 给了 t 人就是活的：上半身一起一伏（呼吸）、时不时眨眼；ph 让同一张图里的几个人错开节奏 */
  t?: number; ph?: number;
  walk?: boolean;               // 原地迈步，左右脚轮流抬起
  arms?: 'L' | 'R' | 'both';    // 举起手（画面左边 / 右边 / 两只）
  lean?: number;                // 头往左右歪几格
  nod?: number;                 // 头往下低几格（打瞌睡）
}
const tick = (o: Pose) => (o.t ?? 0) + (o.ph ?? 0) * 3;
/** 这一拍上半身往下沉了几格。场景里贴在身上的东西（手机、花束、纸箱……）要加上它，才跟得上人 */
export const bob = (o: Pose) => o.t == null ? 0 : o.walk ? tick(o) % 2 : (tick(o) >> 2) % 2;

const setc = (r: string, i: number, c: string) => r.slice(0, i) + c + r.slice(i + 1);
/** hand：手在第几行（男 14、女 12），这一行以上算上半身 */
/** 画完一个人以后，这一拍他身上几个点在哪：手里拿的东西、头上戴的东西挂在这些点上，呼吸、举手、点头都会跟着动 */
export interface Pt { x: number; y: number }
export interface Body { head: Pt; eyes: Pt; handL: Pt; handR: Pt; chest: Pt; feet: number; w: number }
/** shape：眼睛在第几行、头有几行（小孩的头更靠上） */
function figure(p: Pix, base: string[], hand: number, x: number, y: number, look: Look, o: Pose, shape = { eye: 4, head: 7 }): Body {
  let rows = o.back ? base.map((r, j) => j < shape.head ? r.replace(/[se]/g, 'h') : r) : base;
  const w = base[0].length;
  const t = tick(o);
  if (o.arms) for (const col of o.arms === 'both' ? [0, w - 1] : [o.arms === 'L' ? 0 : w - 1]) {
    const sh = shape.head + 1; // 肩膀那一行
    rows = rows.map((r, j) => j > sh && j <= hand ? setc(r, col, '.') : j >= sh - 4 && j <= sh ? setc(r, col, col ? 'C' : 'c') : j === sh - 5 ? setc(r, col, 's') : r);
  }
  if (o.t != null && !o.back && t % 13 === 0) rows = rows.map((r, j) => j === shape.eye ? r.replace(/e/g, 'S') : r);
  if (o.walk) {
    const n = rows.length, up = t % 2 ? [6, 7] : [2, 3];
    rows = rows.map((r, j) => j === n - 2 ? up.reduce((s, i) => setc(s, i, 'k'), r) : j === n - 1 ? up.reduce((s, i) => setc(s, i, '.'), r) : r);
  }
  const P = pal(look), dy = bob(o);
  // 先画下半身，再画（可能往下沉了一格的）上半身盖在上面
  for (const upper of [false, true]) rows.forEach((r, j) => {
    if ((j <= hand) !== upper) return;
    const ox = j <= shape.head ? o.lean || 0 : 0, oy = upper ? dy + (j <= shape.head ? o.nod || 0 : 0) : 0;
    for (let i = 0; i < r.length; i++) if (P[r[i]]) p.px(x + i + ox, y + j + oy, P[r[i]]);
  });
  const up = (side: 'L' | 'R') => o.arms === 'both' || o.arms === side;
  const hy = y + hand + dy, ry = y + shape.head + 1 - 5 + dy, hx = Math.floor(w / 2) - 1;
  const lean = o.lean || 0, nod = o.nod || 0;
  return {
    head: { x: x + hx + lean, y: y + dy + nod }, eyes: { x: x + hx + lean, y: y + shape.eye + dy + nod },
    handL: { x, y: up('L') ? ry : hy }, handR: { x: x + w - 1, y: up('R') ? ry : hy },
    chest: { x: x + hx, y: y + shape.head + 3 + dy }, feet: y + rows.length - 1, w,
  };
}
export function man(p: Pix, x: number, y: number, o: Look, opt: Pose = {}): Body {
  return figure(p, opt.sit ? sit(MAN, '..pp..PP..') : MAN, 14, x, y, o, opt);
}
export function woman(p: Pix, x: number, y: number, o: Look, opt: Pose = {}): Body {
  let r = WOMAN;
  if (opt.long) r = long(r);
  if (opt.sit) r = sit(r, opt.long ? '..ccccCC..' : '..ss..SS..');
  return figure(p, r, 12, x, y, o, opt);
}
// ===== 小孩：8×14 =====
const BOY = [
  '..hhhh..',
  '.hhhhhh.',
  '.hssssh.',
  '.sesses.',
  '.ssssss.',
  '..ssss..',
  '.cccccC.',
  'ccccccCC',
  'ccccccCC',
  's.cccC.s',
  '..ppPP..',
  '..pp.PP.',
  '..pp.PP.',
  '..kk.kk.',
];
const GIRL = BOY.map((r, j) => j >= 1 && j <= 4 ? 'h' + r.slice(1, 7) + 'h' : j === 10 || j === 11 ? '.ccccCC.' : r).map((r, j) => j === 12 ? '..ss.SS.' : r);
/** 一个小孩；girl 时扎两个小辫、穿裙子 */
export function child(p: Pix, x: number, y: number, o: Look, opt: Pose & { girl?: boolean } = {}): Body {
  return figure(p, opt.girl ? GIRL : BOY, 9, x, y, o, opt, { eye: 3, head: 5 });
}

// ===== 各个年龄段：从成人的模板删几行得到，画风一致 =====
const drop = (rows: string[], js: number[]) => rows.filter((_, j) => !js.includes(j));
// 青少年：躯干、腿各短两行（10×18）
const TEEN_M = drop(MAN, [10, 12, 17, 19]), TEEN_F = drop(WOMAN, [10, 14, 16, 19]);
// 老人：没有脖子（头缩在肩膀里，看着有点驼背），腿短一行（10×20）
const OLD_M = drop(MAN, [7, 19]), OLD_F = drop(WOMAN, [7, 19]);
// 学步的小孩（7×10）
const TODDLER = [
  '.hhhhh.',
  'hhssshh',
  'ssesess',
  '.sssss.',
  '.ccccC.',
  'cccccCC',
  's.ccC.s',
  '.ppppp.',
  '.pp.pp.',
  '.kk.kk.',
];
export type Stage = 'baby' | 'toddler' | 'child' | 'teen' | 'adult' | 'old';
export const stageOf = (age: number): Stage => age < 1 ? 'baby' : age < 4 ? 'toddler' : age < 12 ? 'child' : age < 18 ? 'teen' : age < 65 ? 'adult' : 'old';
/** 每个年龄段的身高（行数），站位用：y = feet − 身高 + 1 */
export const HEIGHT: Record<Stage, number> = { baby: 6, toddler: 10, child: 14, teen: 18, adult: 22, old: 20 };
/** 按年龄画一个人：婴儿是襁褓，学步、小孩、青少年、成人、老人（80 岁以后拄拐）。feet 是脚踩的那一行 */
export function personAt(p: Pix, sex: 'M' | 'F' | undefined, age: number, x: number, feet: number, look: Look, opt: Pose = {}): Body {
  const st = stageOf(age), y = feet - HEIGHT[st] + 1, F = sex === 'F';
  if (st === 'baby') {
    baby(p, x, y, F ? C.pinkLt : '#c3d8da', F ? C.pink : '#9fb7cc');
    const c = { x: x + 2, y: y + 1 };
    return { head: c, eyes: c, handL: { x, y: y + 3 }, handR: { x: x + 5, y: y + 3 }, chest: { x: x + 2, y: y + 3 }, feet, w: 6 };
  }
  if (st === 'toddler') return figure(p, TODDLER, 6, x, y, look, opt, { eye: 2, head: 3 });
  if (st === 'child') return child(p, x, y, look, { ...opt, girl: F });
  if (st === 'teen') return figure(p, opt.sit ? sit(F ? TEEN_F : TEEN_M, F ? '..ss..SS..' : '..pp..PP..', 14) : F ? TEEN_F : TEEN_M, F ? 11 : 12, x, y, look, opt);
  if (st === 'adult') return F ? woman(p, x, y, look, opt) : man(p, x, y, look, opt);
  const L = { ...look, hair: look.hair || (age >= 80 ? '#e4e0d8' : C.hairGray) };
  const rows = F ? OLD_F : OLD_M, hand = F ? 11 : 13;
  const b = figure(p, opt.sit ? sit(rows, F ? '..ss..SS..' : '..pp..PP..', hand + 2) : rows, hand, x, y, L, opt, { eye: 4, head: 6 });
  if (age >= 80 && !opt.sit && opt.arms !== 'R' && opt.arms !== 'both') { p.rect(b.handR.x + 1, b.handR.y, 1, feet - b.handR.y + 1, C.wood); p.px(b.handR.x, b.handR.y, C.wood); } // 拐杖
  return b;
}

/** 按性别画一个人 */
export const person = (p: Pix, sex: 'M' | 'F' | undefined, x: number, y: number, o: Look, opt: Pose = {}): Body =>
  sex === 'F' ? woman(p, x, y, o, opt) : man(p, x, y, o, opt);

/** 襁褓里的婴儿，6×6 */
export function baby(p: Pix, x: number, y: number, wrap = C.pinkLt, wrapSh = C.pink) {
  p.sprite([
    '.RRRR.',
    'RssssR',
    'RSssSr',
    'rssssr',
    'rRRRrr',
    '.rrrr.',
  ], { R: wrap, r: wrapSh, s: C.skin, S: C.skinSh }, x, y);
}

/** 用小色块代替横幅上的字，远看像一行字 */
export function glyphs(p: Pix, x: number, y: number, n: number, c: string, seed: number) {
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (hash(seed + k, j * 3 + i) < 0.62 || (i === 1 && j === 1)) p.px(x + k * 4 + i, y + j, c);
  }
}

/** 一条粗细为 w 的直线 */
export function line(p: Pix, x0: number, y0: number, x1: number, y1: number, c: string, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
    p.rect(x, y, w, w, c);
  }
}

/** 远看像字的笔画块（横幅、黑板、墙上的字都用它，不画真的汉字）：每个字横两三笔、竖一两笔，
 *  同样的 seed 每次画出来一样。n 个字，每个 size×size，字距 gap；bold 时笔画两格粗 */
export function scrawl(p: Pix, x: number, y: number, n: number, size: number, c: string, seed = 1, o: { gap?: number; bold?: boolean } = {}) {
  const gap = o.gap ?? 2, th = o.bold ? 2 : 1, cl = (v: number) => Math.max(0, Math.min(size - th, v));
  for (let k = 0; k < n; k++) {
    const x0 = x + k * (size + gap), r = (i: number) => hash(seed * 31 + k, i);
    const span = (i: number): [number, number] => { const a = Math.floor(r(i) * size * 0.35), b = size - Math.floor(r(i + 1) * size * 0.35); return [a, Math.max(a + 3, b)]; };
    const hs = 2 + (r(0) < 0.5 ? 1 : 0), vs = 1 + (r(1) < 0.6 ? 1 : 0);
    for (let j = 0; j < hs; j++) { const row = cl(Math.round((j + 0.5) * size / hs + (r(10 + j) - 0.5) * 2)); const [a, b] = span(20 + j * 2); p.rect(x0 + a, y + row, b - a, th, c); }
    for (let j = 0; j < vs; j++) { const col = cl(Math.round((j + 0.5) * size / vs + (r(40 + j) - 0.5) * 3)); const [a, b] = span(50 + j * 2); p.rect(x0 + col, y + a, th, b - a, c); }
    // 有的字再加一撇或一点，免得每个字都长得像“井”
    if (r(60) < 0.55) { const sx = cl(Math.floor(size * (0.3 + r(61) * 0.5))), len = Math.floor(size * 0.4); for (let d = 0; d < len; d++) p.rect(x0 + cl(sx - d), y + cl(Math.floor(size * 0.5) + d), th, 1, c); }
    if (r(62) < 0.45) p.rect(x0 + cl(Math.floor(size * (0.2 + r(63) * 0.6))), y, th, 2, c);
  }
}

/** 3×5 的小数字，用来写倒计时之类 */
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
export function digits(p: Pix, n: number | string, x: number, y: number, c: string) {
  String(n).split('').forEach((d, k) => { const g = DIGITS[+d]; if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') p.px(x + k * 4 + (i % 3), y + Math.floor(i / 3), c); });
}

/** 实心圆 */
export const disc = (p: Pix, cx: number, cy: number, r: number, c: string) => {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) p.px(cx + x, cy + y, c);
};

/** 两张图之间的像素溶解：k 从 0 到 1，b 的像素按固定的随机顺序一点点盖住 a（搬家时的转场） */
export function dissolve(a: Pix, b: Pix, k: number) {
  const out = new Pix(a.w, a.h);
  out.d = b.d.map((c, i) => hash(i, 7) < k ? c : a.d[i]);
  return out;
}
