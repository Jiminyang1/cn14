// 实时像素面板的雏形：画面由这一生的状态决定（城乡、季节、家里人的年龄），不是固定的一幕。
// ages：同一个人从婴儿到老的样子；yard：家门口，随季节变化。
import { C, Pix, disc, hash, line, personAt, scrawl, type Look } from './pix';
import { WEAR, acUnit, awning, bike, bins, cabbages, chili, coal, corn, dog, dress, firewood, ground, lamp, laundry, paperCut, seasonGrade, seasonOf, sky, smoke, snowCap, tree, vat, weather, type Season } from './kit';
import type { Life } from '../../engine/types';
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

// ==================== 实时画面：这一刻家里是什么样 ====================
// viewOf(life) 只读这一生的状态，算出“这一幕”（View）；drawWorld(view, t) 照着画。两步分开，
// 批量检查（npm run pixel -- --lives）和画廊里的示例都走同一个 drawWorld。viewOf 不碰随机数，不影响模拟。

export type Role = 'me' | 'mom' | 'dad' | 'grandma' | 'grandpa' | 'sib' | 'partner' | 'kid' | 'mate';
export interface Resident { role: Role; sex: 'M' | 'F'; age: number; job?: string | null; ill?: boolean; low?: boolean }
export interface View {
  home: 'yard' | 'flat' | 'dorm';            // 农村院子 / 楼房 / 大学宿舍楼
  big: boolean;                              // 大城市（楼更高）
  season: Season; month: number;             // 公历月份
  festival: 'spring' | 'midautumn' | null;   // 春节（1–2 月）、中秋（9 月）
  people: Resident[];                        // 现在在家的人，从左到右
  away: boolean;                             // 留守：爸妈不在家，奶奶举着手机和他们视频
  props: { wedding?: boolean; mourning?: boolean; demolish?: boolean; car?: boolean };
  seed: number;
}

/** 这一刻家里是什么样。L 是一生的状态（传 S，或批量检查时的任意一生） */
export function viewOf(L: Life): View {
  const month = ((L.birthMonth - 1 + (L.month || 0)) % 12) + 1, f = L.fam, a = L.age;
  const kind = L.loc.kind, uni = ['本科', '大专', '硕士'].includes(L.school || '');
  const meR: Resident = { role: 'me', sex: L.sex, age: a, job: L.school ? 'student' : L.job, ill: !!L.flags.ill, low: L.st.h < 35 };
  const people: Resident[] = [];
  let away = false;
  if (uni) {
    // 大学：宿舍里的室友
    for (let k = 0; k < 2; k++) people.push({ role: 'mate', sex: L.sex, age: a, job: 'student' });
    people.splice(1, 0, meR);
  } else if (!L.indep || a < 18) {
    // 和爸妈住：同住的祖父母、爸妈（留守时不在）、兄弟姐妹、你
    const pa = Math.max(f.mom.age, f.dad.age), gpAge = pa + 27;
    if ((f.gp || 0) >= 2 && gpAge < 88) people.push({ role: 'grandpa', sex: 'M', age: gpAge + 2 });
    if ((f.gp || 0) >= 1 && gpAge < 90) people.push({ role: 'grandma', sex: 'F', age: gpAge });
    const both = L.flags.lb === 'both', one = L.flags.lb === 'one';
    away = (both || one) && a < 16;
    if (f.dad.alive && !(away && (both || one))) people.push({ role: 'dad', sex: 'M', age: f.dad.age, job: f.dad.jk, ill: f.dad.ill === 1 });
    if (f.mom.alive && !(away && both)) people.push({ role: 'mom', sex: 'F', age: f.mom.age, job: f.mom.jk, ill: f.mom.ill === 1 });
    people.push(meR);
    for (const sb of f.sibs) if (sb.age < 22 && !sb.married) people.push({ role: 'sib', sex: sb.sex, age: sb.age });
  } else {
    // 自己的家：你、配偶、还没成家的孩子
    const pt = f.partner;
    if (pt && pt.alive && f.married) people.push({ role: 'partner', sex: pt.sex, age: pt.age, job: pt.retired ? 'retired' : pt.jk });
    people.push(meR);
    for (const k of f.kids) if (k.alive && k.age < 22 && !k.married) people.push({ role: 'kid', sex: k.sex, age: k.age, job: k.age >= 6 && k.age < 18 ? 'student' : null });
  }
  const died = (p: { alive: boolean; diedAt?: number }) => !p.alive && p.diedAt === a;
  return {
    home: uni ? 'dorm' : kind === 'rural' ? 'yard' : 'flat', big: kind === 'big', month,
    season: seasonOf(month), festival: month <= 2 ? 'spring' : month === 9 ? 'midautumn' : null,
    people, away,
    props: {
      wedding: !!(f.married && f.partner && f.partner.marriedAt === a),
      mourning: died(f.mom) || died(f.dad) || !!(f.partner && !f.partner.alive && L.flags.widowed === a),
      demolish: L.flags.demol === a || L.flags.demolHold != null,
      car: L.done && L.done.car != null && L.indep,
    },
    seed: L.seed,
  };
}

/** 按年龄、职业、季节挑一身衣服 */
const JOB_WEAR: Record<string, Partial<Look>> = {
  rider: { top: C.gold, topSh: C.goldDk }, factory: { top: '#2a4a78', topSh: '#1f3a60', bottom: '#2a4a78' }, migrant: { top: '#2a4a78', topSh: '#1f3a60', bottom: '#2a4a78' },
  build: { top: '#d9893a', topSh: '#b8803e' }, doctor: WEAR.white, nurse: WEAR.white, civil: WEAR.suit, farmer: WEAR.brown, teacher: WEAR.brown,
};
// 成年人便装的几种配色，同一局里每个人固定一种（按 seed 选），不至于人人都穿蓝衣服
const CASUAL = { M: [WEAR.blue, WEAR.gray, WEAR.brown, WEAR.green], F: [WEAR.pink, WEAR.red, WEAR.green, WEAR.white] };
export function outfitFor(r: Resident, season: Season, pick = 0): Look {
  let base = outfit(r.age, r.sex, season);
  if (r.age >= 18 && r.age < 65 && season !== 'winter') base = dress(base, CASUAL[r.sex][Math.floor(pick * 4)]);
  if (r.age >= 18 && r.age < 65 && r.job && JOB_WEAR[r.job] && season !== 'winter') return dress(base, JOB_WEAR[r.job]);
  return base;
}

/** 画这一幕 */
export function drawWorld(v: View, t: number): Pix {
  const p = new Pix(W, H), { season, festival } = v, snow = season === 'winter';
  sky(p, 30);
  if (v.home === 'yard') yardHome(p, v, t); else flatHome(p, v, t);
  tree(p, v.home === 'yard' ? 86 : 70, 38, 6, season);
  const carC = [C.blueLt, C.redLt, C.white, C.grayDk, C.green][Math.floor(hash(v.seed, 77) * 5)];
  if (v.props.car) { const x = v.home === 'yard' ? 64 : 74; p.rect(x, 41, 18, 5, carC); p.rect(x + 3, 38, 11, 3, carC); p.rect(x + 4, 39, 4, 2, C.glass); p.rect(x + 9, 39, 4, 2, C.glass); p.rect(x + 2, 46, 3, 2, C.ink); p.rect(x + 13, 46, 3, 2, C.ink); }
  // 人：从左到右排开，居中
  const ws = v.people.map(r => r.age < 1 ? 9 : r.age < 4 ? 7 : r.age < 12 ? 8 : 10), gap = v.people.length > 5 ? 1 : 3;
  let x = Math.round((W - ws.reduce((s, w) => s + w + gap, -gap)) / 2);
  v.people.forEach((r, k) => {
    const look = outfitFor(r, season, hash(v.seed + k, r.role.length)), pose = { t, ph: k * 2, nod: r.low ? 1 : 0 };
    if (r.age < 1) {
      // 婴儿躺在婴儿车里
      p.rect(x, 43, 9, 4, C.pink); p.rect(x, 39, 3, 4, C.pink); p.px(x + 1, 47, C.ink); p.px(x + 7, 47, C.ink);
      personAt(p, r.sex, 0, x + 2, 43, look, pose);
    } else if (r.ill) {
      // 生病：坐在凳子上，腿上盖着毯子
      p.rect(x, 44, 10, 2, C.wood);
      personAt(p, r.sex, r.age, x, 47, look, { ...pose, sit: true, nod: 1 });
      p.rect(x + 1, 39, 8, 5, '#b7cfdc');
    } else personAt(p, r.sex, r.age, x, 48, look, { ...pose, walk: r.role === 'me' && r.age >= 2 && r.age < 10 });
    // 留守：奶奶（或爷爷）举着手机和外地的爸妈视频
    if (v.away && (r.role === 'grandma' || (r.role === 'grandpa' && !v.people.some(q => q.role === 'grandma')))) {
      p.rect(x + 9, 34, 3, 4, C.ink); p.rect(x + 10, 35, 1, 2, (t >> 1) % 2 ? C.sky : C.skyLt);
    }
    x += ws[k] + gap;
  });
  if (festival === 'spring') for (let k = 0; k < 6; k++) p.px(Math.floor(hash(v.seed, k) * W), 49 + Math.floor(hash(k, v.seed) * 5), C.red); // 地上的鞭炮碎屑
  weather(p, season, t, { seed: v.seed });
  seasonGrade(p, season);
  return p;
}

/** 门上贴的东西：春节红春联 + 横批 + 灯笼；结婚贴喜字；家里有人去世贴白对联 */
function door(p: Pix, x: number, y: number, w: number, h: number, v: View, t: number, lamps: [number, number][]) {
  if (v.props.mourning) { p.rect(x - 2, y, 2, h, C.white); p.rect(x + w, y, 2, h, C.white); return; }
  if (v.festival === 'spring' || v.props.wedding) {
    p.rect(x - 2, y, 2, h, C.red); p.rect(x + w, y, 2, h, C.red); p.rect(x, y - 2, w, 2, C.red);
    for (const [lx, ly] of lamps) disc(p, lx, ly + ((t + lx) % 2), 2, C.redLt);
  }
  if (v.props.wedding) { p.rect(x + 2, y + 3, w - 4, w - 4, C.red); scrawl(p, x + 3, y + 4, 1, w - 6, C.gold, 9); }
}

function yardHome(p: Pix, v: View, t: number) {
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

function flatHome(p: Pix, v: View, t: number) {
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
  // 时不时有骑电动车的外卖员从楼下经过
  const rx = 104 - (t * 3) % 160;
  if (rx > -14 && rx < W) {
    man(p, rx, 34, dress({ top: C.gold, topSh: C.goldDk }, WEAR.pants, { hair: C.gold }), { sit: true, t });
    p.rect(rx - 2, 50, 14, 2, C.grayDk); p.rect(rx + 8, 46, 4, 4, C.gold); for (const wx of [rx - 1, rx + 10]) p.rect(wx, 52, 3, 2, C.ink);
  }
}

// ---------- 画廊里的示例：用 ctx 拼一个 View（爷爷奶奶、爸妈、你） ----------
function yard(o: SceneCtx, t: number) {
  const me = o.age ?? 16, season = o.season || 'summer', month = { spring: 4, summer: 7, autumn: 10, winter: 1 }[season];
  const grand = me + 58, parent = me + 28;
  return drawWorld({
    home: o.rural ? 'yard' : 'flat', big: false, season, month, festival: season === 'winter' ? 'spring' : null, away: false, props: {}, seed: o.seed || 1,
    people: [{ role: 'grandma', sex: 'F', age: grand }, { role: 'dad', sex: 'M', age: parent }, { role: 'mom', sex: 'F', age: parent - 2 }, { role: 'me', sex: o.sex || 'M', age: me }],
  }, t);
}

export const WORLD_SCENES = { ages, yard };
