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
const sit = (rows: string[], leg: string) => [...rows.slice(0, 16), leg, leg, leg, '..kk..kk..'];

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
function figure(p: Pix, base: string[], hand: number, x: number, y: number, look: Look, o: Pose) {
  let rows = o.back ? back(base) : base;
  const t = tick(o);
  if (o.arms) for (const col of o.arms === 'both' ? [0, 9] : [o.arms === 'L' ? 0 : 9]) {
    rows = rows.map((r, j) => j >= 9 && j <= hand ? setc(r, col, '.') : j >= 4 && j <= 8 ? setc(r, col, col ? 'C' : 'c') : j === 3 ? setc(r, col, 's') : r);
  }
  if (o.t != null && !o.back && t % 13 === 0) rows = rows.map((r, j) => j === 4 ? r.replace(/e/g, 'S') : r);
  if (o.walk) {
    const n = rows.length, up = t % 2 ? [6, 7] : [2, 3];
    rows = rows.map((r, j) => j === n - 2 ? up.reduce((s, i) => setc(s, i, 'k'), r) : j === n - 1 ? up.reduce((s, i) => setc(s, i, '.'), r) : r);
  }
  const P = pal(look), dy = bob(o);
  // 先画下半身，再画（可能往下沉了一格的）上半身盖在上面
  for (const upper of [false, true]) rows.forEach((r, j) => {
    if ((j <= hand) !== upper) return;
    const ox = j <= 7 ? o.lean || 0 : 0, oy = upper ? dy + (j <= 7 ? o.nod || 0 : 0) : 0;
    for (let i = 0; i < r.length; i++) if (P[r[i]]) p.px(x + i + ox, y + j + oy, P[r[i]]);
  });
}
export function man(p: Pix, x: number, y: number, o: Look, opt: Pose = {}) {
  figure(p, opt.sit ? sit(MAN, '..pp..PP..') : MAN, 14, x, y, o, opt);
}
export function woman(p: Pix, x: number, y: number, o: Look, opt: Pose = {}) {
  let r = WOMAN;
  if (opt.long) r = long(r);
  if (opt.sit) r = sit(r, opt.long ? '..ccccCC..' : '..ss..SS..');
  figure(p, r, 12, x, y, o, opt);
}
/** 按性别画一个人 */
export const person = (p: Pix, sex: 'M' | 'F' | undefined, x: number, y: number, o: Look, opt: Pose = {}) =>
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
