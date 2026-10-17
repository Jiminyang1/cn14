// 实时像素面板的雏形：画面由这一生的状态决定（城乡、季节、家里人的年龄），不是固定的一幕。
// ages：同一个人从婴儿到老的样子；yard：家门口，随季节变化。
import { C, Pix, disc, hash, line, personAt, type Look } from './pix';
import { WEAR, acUnit, awning, bike, bins, cabbages, chili, coal, corn, dog, dress, firewood, ground, lamp, laundry, paperCut, seasonGrade, sky, smoke, snowCap, tree, vat, weather, type Season } from './kit';
import { man } from './pix';
import type { SceneCtx } from './scenes';

const W = 96, H = 54;

/** 按年龄挑一身衣服：小孩穿得鲜艳，上学穿校服，老人穿深色 */
export function outfit(age: number, sex: 'M' | 'F' | undefined, season: Season = 'summer'): Look {
  const F = sex === 'F';
  const base = age < 4 ? (F ? WEAR.pink : WEAR.green) : age < 12 ? (F ? WEAR.red : WEAR.blue) : age < 18 ? WEAR.school : age < 65 ? (F ? WEAR.pink : WEAR.blue) : WEAR.brown;
  const coat = season === 'winter' ? (F ? { top: '#8e1d16', topSh: '#6e1610' } : { top: '#3e4a55', topSh: '#2f3840' }) : {}; // 冬天穿棉袄
  return dress(base, age >= 12 && age < 18 ? {} : WEAR.pants, coat);
}

// ---------- 同一个人，从婴儿到老 ----------
function ages(o: SceneCtx, t: number) {
  const p = new Pix(W, H);
  p.rect(0, 0, W, 44, '#efe4cc'); ground(p, 44, '#d8cdb8', { color: '#cbbfa8', step: 3 });
  [[0, 3], [2, 11], [7, 20], [15, 30], [32, 43], [70, 58], [86, 74]].forEach(([age, x], k) =>
    personAt(p, o.sex, age, x, 44, outfit(age, o.sex), { t, ph: k }));
  return p;
}

// ---------- 家门口：农村的砖房小院，城里的楼下 ----------
function yard(o: SceneCtx, t: number) {
  const p = new Pix(W, H), season = o.season || 'summer', snow = season === 'winter', me = o.age ?? 16;
  sky(p, 30);
  if (o.rural) {
    // 远山、砖房、瓦顶
    for (let x = 0; x < W; x++) { const h = 8 + Math.round(3 * Math.sin(x / 8) + 2 * Math.sin(x / 3)); p.rect(x, 30 - h, 1, h, season === 'winter' ? '#b9c2bf' : season === 'autumn' ? '#a39272' : C.leaf); }
    ground(p, 30, season === 'winter' ? '#e9e6df' : '#c9a873');
    if (snow) snowCap(p, 0, 30, W, 1);
    // 院墙
    p.rect(52, 27, 44, 10, '#a8706a'); p.rect(52, 26, 44, 1, '#6e665c'); for (let j = 29; j < 37; j += 3) for (let i = 53 + (j % 2) * 2; i < 96; i += 5) p.rect(i, j, 4, 1, '#94605a');
    if (snow) snowCap(p, 52, 26, 44);
    // 烟囱和炊烟
    p.rect(42, 5, 3, 7, '#94605a'); p.rect(41, 5, 5, 1, '#6e665c'); smoke(p, 43, 3, t, season === 'summer' ? 2 : 4);
    p.rect(6, 16, 46, 22, '#a8706a'); for (let j = 18; j < 38; j += 3) for (let i = 6 + (j % 2) * 2; i < 52; i += 5) p.rect(i, j, 4, 1, '#94605a');
    for (let k = 0; k < 6; k++) p.rect(4 + k, 15 - k, 50 - k * 2, 1, '#5b524a');
    if (snow) { snowCap(p, 5, 13, 48, 2); snowCap(p, 7, 10, 44); }
    p.rect(22, 24, 9, 14, C.wood); p.rect(24, 26, 5, 10, '#6e4626');
    p.rect(10, 22, 8, 7, C.white); p.rect(11, 23, 6, 5, C.glass); p.rect(36, 22, 8, 7, C.white); p.rect(37, 23, 6, 5, C.glass);
    // 秋冬屋檐下挂玉米，秋天墙上挂辣椒；冬天窗户贴窗花
    if (season === 'autumn' || snow) { corn(p, 46, 16, 8); corn(p, 3, 17, 6); }
    if (season === 'autumn') chili(p, 19, 18, 9);
    if (snow) { paperCut(p, 14, 25); paperCut(p, 40, 25); }
    // 墙根：柴火垛、水缸；冬天码着白菜和蜂窝煤，其他时候大黄狗趴在墙边
    firewood(p, 55, 37, 10, 6); vat(p, 66, 37, snow);
    if (snow) { cabbages(p, 76, 37, 5); coal(p, 86, 37, 3, 4); } else dog(p, 75, 37, t);
    // 春天前院种菜，夏天拉绳晾衣服，秋天地上晒玉米
    if (season === 'spring') for (let j = 50; j < 54; j += 2) for (let i = 72; i < 95; i += 3) { p.px(i, j, C.greenLt); p.px(i + 1, j - 1, C.leaf); }
    if (season === 'summer') { line(p, 52, 20, 84, 20, C.grayLt); laundry(p, 58, 20, t, 9); laundry(p, 70, 20, t + 3, 9); }
    if (season === 'autumn') { p.rect(70, 49, 24, 4, C.gold); for (let i = 70; i < 94; i += 2) p.px(i + ((i >> 1) % 2), 50 + ((i >> 2) % 3), C.goldDk); }
    // 过年（冬天）门口贴春联、挂灯笼
    if (snow) { p.rect(20, 24, 2, 14, C.red); p.rect(31, 24, 2, 14, C.red); p.rect(22, 22, 9, 2, C.red); disc(p, 14, 18 + (t % 2), 2, C.redLt); disc(p, 40, 18 + ((t + 1) % 2), 2, C.redLt); }
    // 两只鸡在院子里啄米
    for (const [k, x0] of [[0, 62], [1, 74]] as const) { const x = x0 + Math.round(Math.sin((t + k * 5) / 6) * 4), peck = (t + k) % 4 === 0 ? 1 : 0; p.rect(x, 44, 4, 3, C.white); p.rect(x + 3, 42 + peck, 2, 2, C.white); p.px(x + 5, 43 + peck, C.gold); p.px(x + 4, 41 + peck, C.red); p.px(x + 1, 47, C.gold); p.px(x + 3, 47, C.gold); }
  } else {
    // 城里：一栋居民楼、楼下的小花坛
    ground(p, 30, season === 'winter' ? '#e9e6df' : '#cfc3ab');
    if (snow) snowCap(p, 0, 30, W, 1);
    p.rect(4, 0, 56, 38, '#e6dcc8'); p.rect(56, 0, 4, 38, '#d3c6ac');
    for (let j = 3; j < 30; j += 7) for (let i = 7; i < 54; i += 9) { p.rect(i, j, 6, 4, hash(i, j) < 0.3 ? '#f2e6b8' : C.glass); p.rect(i - 1, j + 4, 8, 1, C.grayLt); if (snow) snowCap(p, i - 1, j + 4, 8); }
    p.rect(26, 30, 10, 8, C.grayDk); p.rect(27, 31, 8, 7, '#7f9aab');
    // 外墙：空调外机（夏天滴水）、阳台晾的衣服（冬天收了）；楼下一家小卖部
    for (let j = 3; j < 25; j += 7) for (let i = 7; i < 54; i += 9) {
      const r = hash(i * 3, j);
      if (r < 0.35) { acUnit(p, i + 1, j + 5, t + i, season === 'summer'); if (snow) snowCap(p, i + 1, j + 5, 5); }
      else if (r < 0.6 && !snow) laundry(p, i - 1, j + 5, t + j, 8);
    }
    awning(p, 8, 30, 15); p.rect(9, 34, 13, 4, C.glass); p.rect(9, 34, 13, 1, C.white);
    bins(p, 84, 38); lamp(p, 93, 47, 18);
    bike(p, 70, 47, C.gold); bike(p, 78, 47, C.blueLt);
    p.rect(62, 36, 30, 3, C.grayLt); for (let i = 64; i < 90; i += 3) p.px(i, 35, season === 'spring' ? C.pinkLt : season === 'summer' ? C.redLt : season === 'autumn' ? C.gold : C.white);
  }
  tree(p, o.rural ? 86 : 70, 38, 6, season);
  // 家里人：爷爷奶奶坐在门口，爸妈，你（按你现在的年纪）
  const grand = me + 58, parent = me + 28;
  personAt(p, 'F', grand, 8, 48, outfit(grand, 'F', season), { t, ph: 0 });
  personAt(p, 'M', parent, 34, 48, outfit(parent, 'M', season), { t, ph: 2 });
  personAt(p, 'F', parent - 2, 46, 48, outfit(parent - 2, 'F', season), { t, ph: 3 });
  personAt(p, o.sex, me, 58, 49, outfit(me, o.sex, season), { t, ph: 1, walk: me >= 1 && me < 12 });
  // 城里时不时有骑电动车的外卖员从门口经过
  if (!o.rural) {
    const x = 104 - (t * 3) % 160;
    if (x > -14 && x < W) {
      man(p, x, 34, dress({ top: C.gold, topSh: C.goldDk }, WEAR.pants, { hair: C.gold }), { sit: true, t });
      p.rect(x - 2, 50, 14, 2, C.grayDk); p.rect(x + 8, 46, 4, 4, C.gold); for (const wx of [x - 1, x + 10]) { p.rect(wx, 52, 3, 2, C.ink); }
    }
  }
  weather(p, season, t, { seed: o.seed });
  seasonGrade(p, season);
  return p;
}

export const WORLD_SCENES = { ages, yard };
