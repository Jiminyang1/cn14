// 实时画面的各种住处：农村院子、县城老小区、城里的楼、大城市高楼、城中村出租屋、大学宿舍、养老院、医院。
// 每个函数画背景和道具（人由 world.ts 的 drawWorld 统一画），地面都从第 30 行开始，人的脚踩在第 48 行左右。
import { C, Pix, disc, hash, line, man, scrawl } from './pix';
import { WEAR, acUnit, awning, bike, bins, cabbages, chili, coal, corn, dog, dress, firewood, ground, lamp, laundry, paperCut, smoke, snowCap, vat } from './kit';
import type { View } from './world';

const W = 96;

/** 门上贴的东西：春节红春联 + 横批 + 灯笼；结婚贴喜字；家里有人去世贴白对联 */
export function door(p: Pix, x: number, y: number, w: number, h: number, v: View, t: number, lamps: [number, number][]) {
  if (v.props.mourning) { p.rect(x - 2, y, 2, h, C.white); p.rect(x + w, y, 2, h, C.white); return; }
  if (v.festival === 'spring' || v.props.wedding) {
    p.rect(x - 2, y, 2, h, C.red); p.rect(x + w, y, 2, h, C.red); p.rect(x, y - 2, w, 2, C.red);
    for (const [lx, ly] of lamps) disc(p, lx, ly + ((t + lx) % 2), 2, C.redLt);
  }
  if (v.props.wedding) { p.rect(x + 2, y + 3, w - 4, w - 4, C.red); scrawl(p, x + 3, y + 4, 1, w - 6, C.gold, 9); }
}

export function yardHome(p: Pix, v: View, t: number) {
  const { season } = v, snow = season === 'winter';
  for (let x = 0; x < W; x++) { const h = 8 + Math.round(3 * Math.sin(x / 8) + 2 * Math.sin(x / 3)); p.rect(x, 30 - h, 1, h, snow ? '#b9c2bf' : season === 'autumn' ? '#a39272' : C.leaf); }
  ground(p, 30, snow ? '#e9e6df' : '#c9a873');
  if (snow) snowCap(p, 0, 30, W, 1);
  // 院墙
  p.rect(52, 27, 44, 10, '#a8706a'); p.rect(52, 26, 44, 1, '#6e665c'); for (let j = 29; j < 37; j += 3) for (let i = 53 + (j % 2) * 2; i < 96; i += 5) p.rect(i, j, 4, 1, '#94605a');
  if (snow) snowCap(p, 52, 26, 44);
  // 烟囱和炊烟、砖房、瓦顶
  p.rect(42, 5, 3, 7, '#94605a'); p.rect(41, 5, 5, 1, '#6e665c'); smoke(p, 43, 3, t, season === 'summer' ? 2 : 4);
  p.rect(6, 16, 46, 22, '#a8706a'); for (let j = 18; j < 38; j += 3) for (let i = 6 + (j % 2) * 2; i < 52; i += 5) p.rect(i, j, 4, 1, '#94605a');
  for (let k = 0; k < 6; k++) p.rect(4 + k, 15 - k, 50 - k * 2, 1, '#5b524a');
  if (snow) { snowCap(p, 5, 13, 48, 2); snowCap(p, 7, 10, 44); }
  p.rect(22, 24, 9, 14, C.wood); p.rect(24, 26, 5, 10, '#6e4626');
  p.rect(10, 22, 8, 7, C.white); p.rect(11, 23, 6, 5, C.glass); p.rect(36, 22, 8, 7, C.white); p.rect(37, 23, 6, 5, C.glass);
  if (v.props.demolish) { for (let a = 0; a < 40; a++) p.px(Math.round(46 + 4 * Math.cos(a / 40 * 2 * Math.PI)), Math.round(22 + 4 * Math.sin(a / 40 * 2 * Math.PI)), C.red); scrawl(p, 44, 20, 1, 5, C.red, 3); }
  if (season === 'autumn' || snow) { corn(p, 46, 16, 8); corn(p, 3, 17, 6); }
  if (season === 'autumn') chili(p, 19, 18, 9);
  if (v.festival === 'spring') { paperCut(p, 14, 25); paperCut(p, 40, 25); }
  door(p, 22, 24, 9, 14, v, t, [[14, 18], [40, 18]]);
  // 墙根：柴火垛、水缸；冬天码着白菜和蜂窝煤，其他时候大黄狗趴在墙边
  firewood(p, 55, 37, 10, 6); vat(p, 66, 37, snow);
  if (snow) { cabbages(p, 76, 37, 5); coal(p, 86, 37, 3, 4); } else dog(p, 75, 37, t);
  if (season === 'spring') for (let j = 50; j < 54; j += 2) for (let i = 72; i < 95; i += 3) { p.px(i, j, C.greenLt); p.px(i + 1, j - 1, C.leaf); }
  if (season === 'summer') { line(p, 52, 20, 84, 20, C.grayLt); laundry(p, 58, 20, t, 9); laundry(p, 70, 20, t + 3, 9); }
  if (season === 'autumn') { p.rect(70, 49, 24, 4, C.gold); for (let i = 70; i < 94; i += 2) p.px(i + ((i >> 1) % 2), 50 + ((i >> 2) % 3), C.goldDk); }
  // 中秋：门口的小桌上摆着月饼
  if (v.festival === 'midautumn') { p.rect(56, 40, 12, 2, C.wood); p.rect(57, 42, 1, 4, C.wood); p.rect(66, 42, 1, 4, C.wood); for (const mx of [58, 61, 64]) { p.rect(mx, 38, 3, 2, '#d9a066'); p.px(mx + 1, 38, '#b8803e'); } }
  // 两只鸡在院子里啄米
  for (const [k, x0] of [[0, 62], [1, 74]] as const) { const x = x0 + Math.round(Math.sin((t + k * 5) / 6) * 4), peck = (t + k) % 4 === 0 ? 1 : 0; p.rect(x, 44, 4, 3, C.white); p.rect(x + 3, 42 + peck, 2, 2, C.white); p.px(x + 5, 43 + peck, C.gold); p.px(x + 4, 41 + peck, C.red); p.px(x + 1, 47, C.gold); p.px(x + 3, 47, C.gold); }
}

export function flatHome(p: Pix, v: View, t: number) {
  const { season } = v, snow = season === 'winter', dorm = v.home === 'dorm';
  ground(p, 30, snow ? '#e9e6df' : '#cfc3ab');
  if (snow) snowCap(p, 0, 30, W, 1);
  // 楼：大城市更高、偏灰蓝；宿舍楼是红砖
  const wall = dorm ? '#b9806a' : v.big ? '#d6d9d6' : '#e6dcc8', shade = dorm ? '#a06a58' : v.big ? '#c3c8c6' : '#d3c6ac';
  p.rect(4, 0, 56, 38, wall); p.rect(56, 0, 4, 38, shade);
  for (let j = 3; j < 30; j += 7) for (let i = 7; i < 54; i += 9) { p.rect(i, j, 6, 4, hash(i, j) < 0.3 ? '#f2e6b8' : C.glass); p.rect(i - 1, j + 4, 8, 1, C.grayLt); if (snow) snowCap(p, i - 1, j + 4, 8); }
  for (let j = 3; j < 25; j += 7) for (let i = 7; i < 54; i += 9) {
    const r = hash(i * 3, j);
    if (r < 0.35 && !dorm) { acUnit(p, i + 1, j + 5, t + i, season === 'summer'); if (snow) snowCap(p, i + 1, j + 5, 5); }
    else if (r < 0.6 && !snow) laundry(p, i - 1, j + 5, t + j, 8);
  }
  p.rect(26, 30, 10, 8, C.grayDk); p.rect(27, 31, 8, 7, '#7f9aab');
  door(p, 27, 31, 8, 7, v, t, [[22, 28], [40, 28]]);
  if (!dorm) { awning(p, 8, 30, 15); p.rect(9, 34, 13, 4, C.glass); p.rect(9, 34, 13, 1, C.white); }
  p.rect(62, 36, 30, 3, C.grayLt); for (let i = 64; i < 90; i += 3) p.px(i, 35, season === 'spring' ? C.pinkLt : season === 'summer' ? C.redLt : season === 'autumn' ? C.gold : C.white);
  bins(p, 84, 38); lamp(p, 93, 47, 18);
  bike(p, 70, 47, C.gold); bike(p, 78, 47, C.blueLt);
  if (v.festival === 'midautumn') for (const i of [16, 34, 43]) disc(p, i, 1, 1, C.redLt);
  // 时不时有骑电动车的外卖员从楼下经过：走的是人身后那条路（车轮在第 41 行），所以会被站在前面的人挡住，不会从人身上穿过去
  const rx = 104 - (t * 3) % 160;
  if (rx > -14 && rx < W) {
    man(p, rx, 21, dress({ top: C.gold, topSh: C.goldDk }, WEAR.pants, { hair: C.gold }), { sit: true, t });
    p.rect(rx - 2, 38, 14, 2, C.grayDk); p.rect(rx + 8, 34, 4, 4, C.gold); for (const wx of [rx - 1, rx + 10]) p.rect(wx, 40, 3, 2, C.ink);
  }
}


// ---------- 县城的老小区：六层的砖混楼，阳台装着防盗网，楼顶一排太阳能热水器；楼下老人下象棋 ----------
export function townHome(p: Pix, v: View, t: number) {
  const { season } = v, snow = season === 'winter';
  ground(p, 30, snow ? '#e9e6df' : '#cfc3ab');
  if (snow) snowCap(p, 0, 30, W, 1);
  // 楼顶的太阳能热水器
  for (const x of [8, 26, 44]) { for (let i = 0; i < 10; i += 2) line(p, x + i, 6, x + i + 3, 2, '#8f969a'); p.rect(x + 2, 1, 9, 2, C.white); }
  p.rect(2, 6, 60, 32, '#ece2cf'); p.rect(58, 6, 4, 32, '#d8ccb4'); p.rect(2, 6, 60, 1, '#b8ad9a');
  for (let j = 9; j < 34; j += 5) {
    p.rect(2, j + 4, 56, 1, '#d8ccb4');                                    // 每层之间的腰线
    for (let i = 5; i < 56; i += 10) {
      if (i > 24 && i < 36) continue;                                      // 中间是楼梯间
      p.rect(i, j, 7, 3, hash(i, j) < 0.25 ? '#f2e6b8' : C.glass);
      for (let b = i; b < i + 7; b += 2) p.rect(b, j - 1, 1, 5, '#8a8075'); // 防盗网
      if (snow) snowCap(p, i, j - 1, 7);
      else if (hash(i + 1, j) < 0.3) laundry(p, i, j + 3, t + i, 7);
    }
  }
  p.rect(26, 9, 8, 25, '#d8ccb4'); for (let j = 11; j < 33; j += 5) p.rect(28, j, 4, 2, C.glass); // 楼梯间的窗
  p.rect(27, 31, 6, 7, '#5b524a'); p.rect(26, 29, 8, 2, C.grayDk); scrawl(p, 28, 29, 1, 2, C.white, 4);
  door(p, 27, 31, 6, 7, v, t, [[23, 28], [37, 28]]);
  // 楼下停着罩着雨衣的电动车
  for (const x of [4, 13]) { p.rect(x, 35, 7, 3, C.blueLt); p.rect(x + 1, 33, 4, 2, C.blueLt); p.rect(x, 38, 2, 2, C.ink); p.rect(x + 5, 38, 2, 2, C.ink); }
  // 树下，一个老人对着石桌上的象棋
  // （站在后排，脚在第 40 行，和前面的一家人分开）
  man(p, 76, 21, dress(WEAR.brown, WEAR.pants, WEAR.old), { sit: true, t, ph: 5, nod: (t >> 3) % 3 === 0 ? 1 : 0 });
  p.rect(86, 34, 9, 2, '#a9a299'); p.rect(89, 36, 2, 4, '#8f8a82'); for (let i = 87; i < 94; i += 2) p.px(i, 33, (i >> 1) % 2 ? C.red : C.ink);
}

// ---------- 城中村：两栋楼几乎贴在一起（握手楼），头顶一团乱电线，楼下是小店的招牌 ----------
export function rentalHome(p: Pix, v: View, t: number) {
  const { season } = v, snow = season === 'winter';
  ground(p, 38, snow ? '#d8d6d0' : '#9a948a');
  p.rect(30, 46, 20, 2, '#7f8a96');                                       // 地上的一摊积水
  for (const [x0, w, c, sh] of [[0, 40, '#c9bfae', '#b8ad9a'], [56, 40, '#bfb5a3', '#aaa08e']] as const) {
    p.rect(x0, 0, w, 38, c); p.rect(x0 === 0 ? 38 : 56, 0, 2, 38, sh);
    for (let j = 2; j < 24; j += 6) for (let i = x0 + 3; i < x0 + w - 4; i += 9) {
      p.rect(i, j, 5, 4, hash(i, j) < 0.3 ? '#f2e6b8' : '#6a7884'); for (let b = i; b < i + 5; b += 2) p.rect(b, j, 1, 4, '#5b524a');
      if (hash(i + 2, j) < 0.35) acUnit(p, i, j + 4, t + i, season === 'summer');
      else if (!snow && hash(i + 5, j) < 0.5) { p.rect(i - 2, j + 5, 9, 1, C.grayDk); laundry(p, i - 2, j + 5, t + j, 9); }
    }
  }
  // 头顶的电线
  for (let k = 0; k < 5; k++) for (let x = 30; x < 66; x++) { const y = 6 + k * 3 + Math.round(((x - 48) ** 2) / (60 + k * 30)) - 4; p.px(x, y, C.ink); }
  // 小店的招牌（红底黄字、蓝底白字）和门面
  p.rect(2, 26, 34, 6, C.red); scrawl(p, 5, 27, 4, 4, C.gold, 11, { gap: 3 });
  p.rect(60, 26, 32, 6, C.blue); scrawl(p, 63, 27, 4, 4, C.white, 12, { gap: 3 });
  p.rect(4, 32, 30, 6, '#3e3832'); p.rect(62, 32, 28, 6, '#3e3832'); p.rect(6, 33, 8, 3, (t >> 2) % 2 ? '#f2e6b8' : '#e0b04f');
  door(p, 42, 30, 12, 8, v, t, [[38, 26], [57, 26]]);
  for (const x of [8, 70, 80]) { p.rect(x, 41, 8, 3, C.grayDk); p.rect(x + 1, 39, 4, 2, C.redLt); p.rect(x, 44, 2, 2, C.ink); p.rect(x + 6, 44, 2, 2, C.ink); }
}

// ---------- 养老院：一排矮楼、草坪和长椅，有老人在打太极 ----------
export function nursingHome(p: Pix, v: View, t: number) {
  const { season } = v, snow = season === 'winter';
  ground(p, 30, snow ? '#e9e6df' : season === 'autumn' ? '#b8a46a' : C.greenLt);
  p.rect(0, 40, W, 3, '#d8cdb8');                                         // 小路
  p.rect(0, 10, 62, 22, '#f0ece2'); p.rect(0, 8, 64, 2, C.green); p.rect(0, 31, 62, 1, '#d8d2c6');
  if (snow) snowCap(p, 0, 8, 64, 2);
  for (let i = 3; i < 58; i += 9) { p.rect(i, 14, 7, 6, C.glass); p.rect(i, 14, 7, 1, C.white); p.rect(i, 23, 7, 6, C.glass); }
  p.rect(26, 23, 10, 9, '#9fb7c4'); p.rect(25, 19, 12, 3, C.green); scrawl(p, 26, 19, 3, 2, C.white, 13);
  door(p, 26, 23, 10, 9, v, t, [[22, 20], [40, 20]]);
  p.rect(0, 33, 62, 1, C.grayLt); for (let x = 2; x < 62; x += 6) p.rect(x, 33, 1, 3, C.grayLt); // 扶手
  // 长椅
  p.rect(66, 38, 14, 2, C.woodLt); p.rect(66, 35, 14, 1, C.woodLt); p.rect(67, 40, 1, 3, C.wood); p.rect(78, 40, 1, 3, C.wood);
  // 打太极的老人：两手慢慢抬起、放下
  const arms = (['both', undefined, 'L', undefined, 'R', undefined] as const)[(t >> 2) % 6];
  man(p, 84, 22, dress({ top: C.white, topSh: '#ddd3c0' }, { bottom: C.white, bottomSh: '#ddd3c0' }, { hair: '#e4e0d8' }), { t, ph: 3, arms });
}

// ---------- 医院：白楼、楼顶的红十字、门口的救护车（顶灯一闪一闪） ----------
export function hospitalHome(p: Pix, v: View, t: number) {
  const { season } = v, snow = season === 'winter';
  ground(p, 30, snow ? '#e9e6df' : '#cfd2cc');
  p.rect(2, 4, 62, 34, '#eef0ee'); p.rect(60, 4, 4, 34, '#d6dad6'); p.rect(2, 14, 62, 1, '#9fb7cc');
  p.rect(26, 0, 12, 10, C.white); p.rect(31, 1, 2, 8, C.red); p.rect(28, 4, 8, 2, C.red);
  if (snow) snowCap(p, 2, 4, 62);
  for (let j = 16; j < 30; j += 6) for (let i = 5; i < 58; i += 8) p.rect(i, j, 5, 3, C.glass);
  p.rect(22, 31, 20, 7, '#9fb7c4'); p.rect(31, 31, 1, 7, C.white); p.rect(20, 28, 24, 3, C.red); scrawl(p, 24, 28, 3, 2, C.white, 14, { gap: 6 });
  door(p, 22, 31, 20, 7, { ...v, festival: null }, t, []); // 医院门口不贴春联
  // 救护车
  p.rect(66, 36, 26, 9, C.white); p.rect(66, 39, 26, 2, C.red); p.rect(86, 37, 5, 3, C.glass); p.rect(72, 37, 3, 1, C.red); p.rect(73, 36, 1, 3, C.red);
  p.rect(74, 34, 4, 2, t % 2 ? C.red : C.blueLt);
  for (const x of [69, 86]) { p.rect(x, 45, 3, 2, C.ink); }
}
