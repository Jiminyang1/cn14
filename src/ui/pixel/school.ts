// 上学路上的几个关口：幼儿园、小学、初中、高中、职高、大学、读研。配在人生纪录里对应的那一条旁边。
// 和 scenes.ts 一样：96×54，t 是第几拍（每拍 250ms）。
import { C, Pix, bob, child, digits, disc, hash, line, man, person, scrawl, woman, type Pose } from './pix';
import type { SceneCtx } from './scenes';
import { WEAR, banner, clouds, dress, ground, hold, sky, stand, tree } from './kit';

const W = 96, H = 54;
const UNIFORM = { top: C.white, topSh: '#d8cfbd', bottom: C.blue, bottomSh: '#1f3a60', shoe: C.white };

/** 一面迎风飘的红旗：左边贴着旗杆，每一列上下错开一点 */
function flag(p: Pix, x: number, y: number, t: number, w = 10, h = 7) {
  for (let i = 0; i < w; i++) {
    const dy = Math.round(Math.sin((i - t) / 2) * (i / w) * 1.5);
    p.rect(x + i, y + dy, 1, h, C.red);
  }
  p.px(x + 2, y + 1 + Math.round(Math.sin((2 - t) / 2) * 0.3), C.gold);
  for (const [i, j] of [[4, 0], [5, 1], [5, 3], [4, 4]]) p.px(x + i, y + j + Math.round(Math.sin((i - t) / 2) * (i / w) * 1.5), C.gold);
}

// ---------- 幼儿园：第一天抱着门框哭 ----------
function kinder(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 44, '#f3e3c3'); p.rect(0, 30, W, 14, '#bfd8c8'); p.rect(0, 30, W, 1, '#9fbfac');
  p.rect(0, 44, W, 10, '#d9a066'); for (let x = 0; x < W; x += 8) p.rect(x, 44, 1, 10, '#c48a52');
  // 彩旗
  for (let x = 0; x < W; x += 6) { const c = [C.redLt, C.gold, C.blueLt, C.greenLt][(x / 6) % 4]; for (let j = 0; j < 3; j++) p.rect(x + j, 2 + j, 5 - j * 2, 1, c); }
  // 窗户：农村的幼儿园在镇上，窗外停着黄色校车
  p.rect(36, 8, 22, 15, C.white); p.rect(37, 9, 20, 13, C.sky);
  if (o.rural) { p.rect(38, 15, 18, 6, C.gold); p.rect(39, 16, 4, 2, C.glass); p.rect(44, 16, 4, 2, C.glass); p.rect(49, 16, 4, 2, C.glass); p.px(41, 21, C.ink); p.px(53, 21, C.ink); }
  else disc(p, 52, 13, 2, C.sun);
  p.rect(46, 9, 1, 13, C.white);
  // 墙上的画
  for (const [x, c] of [[64, C.redLt], [72, C.greenLt], [80, C.blueLt]] as const) { p.rect(x, 10, 6, 7, C.white); disc(p, x + 3, 13, 1, c); }
  // 门
  p.rect(2, 12, 14, 32, C.woodLt); p.rect(3, 13, 12, 31, '#e8c99a'); p.px(13, 28, C.wood);
  // 滑梯：一个小朋友滑下来
  p.rect(84, 26, 2, 18, C.red); p.rect(90, 26, 2, 18, C.red); for (let y = 29; y < 44; y += 3) p.rect(84, y, 8, 1, C.red);
  p.rect(84, 25, 8, 2, C.gold);
  line(p, 83, 27, 64, 43, C.gold, 2);
  const s = (t % 10) / 10, sx = Math.round(84 - s * 18), sy = Math.round(13 + s * 16);
  child(p, sx - 4, sy, { top: C.greenLt, topSh: C.leaf, bottom: C.blue }, { t, ph: 3, arms: 'both' });
  // 老师在招手
  woman(p, 30, 22, { top: C.pink, topSh: '#cf8584', bottom: C.blue }, { t, ph: 1, arms: (t >> 1) % 2 ? 'R' : undefined });
  // 你抱着门框哭，眼泪一滴一滴往下掉；送你来的大人站在门口
  person(p, o.sex === 'F' ? 'F' : 'M', 4, 22, { top: '#8a6a3a', topSh: '#735a30', bottom: C.grayDk }, { t, ph: 2 });
  const kp: Pose = { t, ph: 0, arms: 'L' };
  child(p, 15, 30, { top: o.sex === 'F' ? C.pink : C.blueLt, topSh: o.sex === 'F' ? '#cf8584' : '#476b9b', bottom: C.blue }, { ...kp, girl: o.sex === 'F' });
  const d = bob(kp), ty = 34 + (t % 4);
  p.px(17, ty + d, '#9fd3f0'); p.px(20, 34 + ((t + 2) % 4) + d, '#9fd3f0');
  // 地上的积木
  for (let k = 0; k < 3; k++) p.rect(50 + k * 4, 40, 3, 4, [C.redLt, C.gold, C.blueLt][k]);
  if ((t >> 2) % 2) p.rect(54, 36, 3, 4, C.greenLt);
  return p;
}

// ---------- 小学：开学第一天 ----------
function primary(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  if (o.rural) {
    // 农村：走半个小时的山路去村里的小学
    p.rect(0, 0, W, 54, C.skyLt); p.rect(0, 0, W, 10, C.sky); p.dither(0, 10, W, 3, C.sky, C.skyLt);
    disc(p, 14, 10, 4, C.sun);
    for (let x = 0; x < W; x++) { const h = 16 + Math.round(6 * Math.sin(x / 9) + 3 * Math.sin(x / 4)); p.rect(x, 54 - h - 10, 1, h + 10, C.leaf); }
    for (let x = 0; x < W; x++) { const h = 10 + Math.round(4 * Math.sin(x / 7 + 2)); p.rect(x, 54 - h, 1, h, C.greenLt); }
    // 山顶的小学：白墙、红旗
    p.rect(66, 18, 18, 9, C.white); p.rect(65, 16, 20, 2, C.redDk); for (let x = 68; x < 82; x += 4) p.rect(x, 21, 2, 3, C.glass);
    p.rect(87, 8, 1, 19, C.gray); flag(p, 88, 8, t, 7, 5);
    // 山路
    for (let k = 0; k < 40; k++) { const x = 6 + k * 1.6, y = 50 - k * 0.55 + Math.sin(k / 3) * 2; p.rect(Math.round(x), Math.round(y), 3, 1, '#c9a873'); }
    // 鸟
    for (let k = 0; k < 3; k++) { const x = (t * 2 + k * 30) % 110 - 10, y = 6 + k * 3; p.px(x, y, C.ink); p.px(x + 1, y + 1, C.ink); p.px(x + 2, y, C.ink); }
    // 背着新书包的你
    const kp: Pose = { t, back: true, walk: true };
    child(p, 30, 30, { top: C.redLt, topSh: C.red, bottom: C.blue }, { ...kp, girl: o.sex === 'F' });
    p.rect(31, 36 + bob(kp), 6, 5, C.blueLt); p.rect(31, 36 + bob(kp), 6, 1, C.blue);
    return p;
  }
  p.rect(0, 0, W, 40, C.sky); p.rect(0, 0, W, 6, C.skyLt);
  // 教学楼和校门
  p.rect(0, 14, W, 26, '#f0e3c8'); p.rect(0, 14, W, 2, C.redLt);
  for (let x = 4; x < W; x += 9) for (let y = 19; y < 36; y += 7) p.rect(x, y, 5, 4, C.glass);
  p.rect(22, 18, 4, 26, '#d9c7a6'); p.rect(70, 18, 4, 26, '#d9c7a6');
  p.rect(20, 14, 56, 13, C.white); p.rect(20, 14, 56, 1, C.redLt); p.rect(20, 26, 56, 1, C.redLt);
  scrawl(p, 23, 15, 4, 11, C.red, 5);
  // 旗杆
  p.rect(85, 2, 1, 38, C.gray); flag(p, 86, 3, t);
  p.rect(0, 40, W, 14, '#cfc3ab'); for (let x = 0; x < W; x += 6) p.rect(x, 46, 4, 1, '#bfb298');
  // 门口拍照的家长，手机一闪
  for (const [k, x] of [[0, 2], [1, 76]] as const) {
    const hp: Pose = { t, ph: k * 2, arms: 'R' };
    person(p, k ? 'M' : 'F', x, 30, { top: k ? '#5a7fb0' : '#c0453a', topSh: k ? '#476b9b' : '#9e3328', bottom: C.grayDk }, hp);
    p.rect(x + 9, 32 + bob(hp), 2, 3, C.ink);
    if ((t + k * 3) % 6 === 0) for (const [dx, dy] of [[2, 0], [3, -1], [2, 2], [0, -1]]) p.px(x + 9 + dx, 33 + dy + bob(hp), C.white);
  }
  // 背着大书包走进校门的小朋友
  [[36, 1], [48, 0], [58, 1]].forEach(([x, g], k) => {
    const kp: Pose = { t, ph: k, back: true, walk: true };
    child(p, x, 36, { top: [C.redLt, C.blueLt, C.greenLt][k], topSh: C.gray, bottom: C.blue }, { ...kp, girl: !!g });
    p.rect(x + 1, 42 + bob(kp), 6, 6, [C.pink, C.gold, C.blueLt][k]);
  });
  return p;
}

// ---------- 初中：周一升旗 ----------
function middle(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 30, C.sky); p.rect(0, 0, W, 5, C.skyLt);
  p.rect(0, 18, W, 12, '#f0e3c8'); for (let x = 3; x < W; x += 7) p.rect(x, 21, 4, 3, C.glass);
  // 操场：红跑道、绿草地
  p.rect(0, 30, W, 24, '#b35a4a'); p.rect(0, 34, W, 20, C.greenLt); for (let y = 31; y < 34; y += 2) p.rect(0, y, W, 1, '#d9b0a4');
  // 旗杆和升旗台；国旗一点一点升上去，到顶停一会儿
  p.rect(40, 32, 16, 3, C.grayLt); p.rect(47, 2, 2, 30, C.gray); p.px(47, 1, C.gold); p.px(48, 1, C.gold);
  const ph = t % 24, fy = ph < 14 ? 26 - ph * 1.6 : 4;
  flag(p, 49, Math.round(fy), t);
  // 两个升旗手
  man(p, 36, 12, { ...UNIFORM, top: C.white }, { t, ph: 1, arms: ph < 14 ? 'R' : undefined });
  // 一排排的同学（背影），少先队员敬礼
  for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
    const x = 4 + k * 15 + (r ? 7 : 0), y = 32 + r * 6;
    if (x > 86) continue;
    const sp: Pose = { t, ph: k + r * 3, back: true, arms: ph >= 14 && (k + r) % 3 === 0 ? 'R' : undefined };
    if ((k + r) % 2) woman(p, x, y, UNIFORM, sp); else man(p, x, y, UNIFORM, sp);
  }
  return p;
}

// ---------- 高中：晚自习，黑板上写着高考倒计时 ----------
function high(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 54, '#e3dfd2'); p.rect(0, 40, W, 14, '#b9b4aa');
  // 黑板
  p.rect(2, 6, 70, 22, '#2f4a3a'); p.rect(1, 5, 72, 1, C.wood); p.rect(1, 28, 72, 2, C.wood);
  scrawl(p, 5, 10, 3, 11, C.white, 6);
  // 倒计时每两秒少一天
  const left = 100 - ((t >> 3) % 100);
  digits(p, left, 45, 13, C.gold); scrawl(p, 46 + String(left).length * 4, 10, 1, 11, C.white, 7);
  p.rect(4, 24, 64, 1, '#5d7a68');
  // 窗外是夜，日光灯有一根在闪
  p.rect(76, 6, 18, 18, C.white); p.rect(77, 7, 16, 16, '#2f3b55'); p.px(80, 10, '#f2e6b8'); p.px(89, 15, '#f2e6b8'); p.rect(85, 7, 1, 16, C.white);
  p.rect(14, 1, 20, 2, C.white); p.rect(56, 1, 20, 2, (t % 7) === 0 ? '#cfcac2' : C.white);
  // 吊扇在转
  const a = t * Math.PI / 4;
  for (let k = 0; k < 2; k++) { const c = Math.cos(a + k * Math.PI / 2) * 7, s = Math.sin(a + k * Math.PI / 2) * 2; line(p, Math.round(48 - c), Math.round(3 - s), Math.round(48 + c), Math.round(3 + s), C.grayDk); }
  p.rect(47, 2, 3, 2, C.gray);
  // 同学们埋在书堆后面；有人在打瞌睡
  for (let k = 0; k < 4; k++) {
    const x = 4 + k * 23, sp: Pose = { sit: true, back: true, t, ph: k, nod: k === 2 && (t >> 3) % 2 ? 2 : 0 };
    person(p, k % 2 ? 'F' : 'M', x, 28, UNIFORM, sp);
    for (let j = 0; j < 4; j++) p.rect(x + 10, 38 - j * 2, 6, 2, [C.redLt, C.blueLt, C.gold, C.greenLt][(j + k) % 4]);
    p.rect(x - 2, 40, 20, 2, C.woodLt);
  }
  return p;
}

// ---------- 职高：车间里的车床 ----------
function voc(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 54, '#cfd2cc'); p.rect(0, 42, W, 12, '#8f9289'); p.dither(0, 42, W, 2, '#a3a69c', '#8f9289');
  for (let x = 6; x < W; x += 22) { p.rect(x, 4, 14, 8, C.skyLt); p.rect(x + 7, 4, 1, 8, C.gray); }
  // 工具板
  p.rect(70, 16, 22, 14, '#b8a27a'); for (let x = 72; x < 90; x += 4) { p.rect(x, 18, 1, 8, C.grayDk); p.rect(x - 1, 18, 3, 2, C.grayDk); }
  // 车床：主轴一转一转，切削的地方火花四溅
  p.rect(20, 28, 44, 12, '#5a7f6a'); p.rect(20, 28, 44, 1, '#7fa38c'); p.rect(22, 40, 4, 4, '#3e5a4a'); p.rect(58, 40, 4, 4, '#3e5a4a');
  p.rect(22, 20, 10, 8, '#4a6a58');
  p.rect(32, 22, 4, 4, (t % 2) ? C.grayLt : C.gray); p.rect(36, 23, 14, 2, C.grayLt);
  p.rect(48, 24, 4, 4, C.grayDk);
  for (let k = 0; k < 6; k++) { const a = hash(t, k) * Math.PI, r = 2 + Math.floor(hash(k, t) * 5); p.px(Math.round(48 + Math.cos(a) * r), Math.round(24 - Math.sin(a) * r), k % 2 ? C.sun : '#ff9a3c'); }
  // 穿蓝色工装、戴护目镜的你；师傅在旁边指点
  const sp: Pose = { t, ph: 0 };
  person(p, o.sex, 52, 20, { top: '#2a4a78', topSh: '#1f3a60', bottom: '#2a4a78', bottomSh: '#1f3a60' }, sp);
  p.rect(53, 24 + bob(sp), 8, 1, C.grayDk);
  man(p, 4, 20, { top: C.white, topSh: '#d8cfbd', bottom: C.grayDk, hair: C.hairGray }, { t, ph: 2, arms: (t >> 2) % 2 ? 'R' : undefined });
  return p;
}

// ---------- 大学：新生报到 ----------
function uni(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  sky(p, 42); clouds(p, t);
  // 石头校门和横幅
  p.rect(14, 12, 8, 30, '#d6cbb5'); p.rect(74, 12, 8, 30, '#d6cbb5'); p.rect(12, 10, 72, 3, '#bfb298');
  banner(p, 48, 13, 5);
  tree(p, 4, 41); tree(p, 90, 41);
  ground(p, 42, '#cfc3ab', { color: '#bfb298', step: 5 });
  // 穿红马甲的志愿者在招手
  person(p, o.sex === 'F' ? 'M' : 'F', 62, stand(43), dress({ top: C.redLt, topSh: C.red }, WEAR.pants), { t, ph: 3, arms: (t >> 1) % 2 ? 'R' : undefined });
  // 你拖着箱子，爸妈拎着大包小包跟在后面
  const me = person(p, o.sex, 40, stand(42), dress(WEAR.blue, WEAR.jeans), { t, walk: true });
  hold.suitcase(p, me.handR.x + 1, 42);
  const dad = man(p, 22, stand(42), dress(WEAR.brown, WEAR.pants), { t, ph: 1, walk: true });
  hold.bag(p, dad.handL);
  const mom = woman(p, 30, stand(43), dress(WEAR.green, { bottom: '#4a423b' }), { t, ph: 2, walk: true });
  hold.bag(p, mom.handR, C.pink, 4, 4);
  return p;
}

// ---------- 读研：深夜的实验室，屏幕上的代码一行行往上滚 ----------
function master(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 54, '#3e4a55'); p.rect(0, 40, W, 14, '#2f3840');
  // 窗外城市的灯
  p.rect(4, 6, 24, 18, '#5b6a78'); p.rect(5, 7, 22, 16, '#1e2833');
  for (let k = 0; k < 14; k++) p.px(6 + Math.floor(hash(k, 1) * 20), 12 + Math.floor(hash(k, 2) * 10), hash(k, t >> 3) < 0.7 ? C.sun : '#5b6a78');
  // 书架
  p.rect(74, 6, 18, 30, C.wood); for (let y = 8; y < 34; y += 7) for (let x = 75; x < 91; x += 2) p.rect(x, y, 1, 5, [C.redLt, C.blueLt, C.gold, C.greenLt, C.white][(x + y) % 5]);
  // 台灯的光
  p.dither(30, 18, 34, 22, '#55626e', '#3e4a55');
  p.rect(58, 14, 6, 3, C.gold); line(p, 60, 17, 56, 30, C.grayLt); p.rect(54, 30, 5, 2, C.grayLt);
  // 显示器：代码一行行往上滚
  p.rect(36, 16, 20, 14, C.ink); p.rect(37, 17, 18, 12, '#14231c'); p.rect(45, 30, 2, 3, C.grayDk); p.rect(42, 33, 8, 1, C.grayDk);
  for (let j = 0; j < 6; j++) {
    const n = j + (t >> 1), w = 3 + Math.floor(hash(n, 5) * 12), ind = Math.floor(hash(n, 9) * 3) * 2;
    p.rect(38 + ind, 18 + j * 2, Math.min(w, 16 - ind), 1, ['#6fe08a', '#86a6d6', '#e0b04f', '#d38ab0'][n % 4]);
  }
  if (t % 2) p.px(38 + 2, 28, C.white);
  // 桌子、咖啡、一摞论文
  p.rect(26, 34, 44, 2, C.woodLt); p.rect(28, 36, 2, 10, C.wood); p.rect(66, 36, 2, 10, C.wood);
  p.rect(60, 30, 3, 4, C.white); p.px(63, 31, C.white);
  for (let k = 0; k < 2; k++) p.px(61 + [0, 1, 0, -1][(t + k) % 4], 28 - ((t + k * 2) % 5), '#9aa6b0');
  for (let j = 0; j < 4; j++) p.rect(28, 32 - j, 7, 1, j % 2 ? C.white : '#e4dccb');
  // 你，背对着坐在屏幕前
  person(p, o.sex, 38, 26, { top: '#7f8a96', topSh: '#6a7682', bottom: C.grayDk }, { sit: true, back: true, t, nod: (t >> 4) % 3 === 2 ? 1 : 0 });
  return p;
}

export const SCHOOL_SCENES = { kinder, primary, middle, high, voc, uni, master };
