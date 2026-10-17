// 实时像素面板的雏形：画面由这一生的状态决定（城乡、季节、家里人的年龄），不是固定的一幕。
// ages：同一个人从婴儿到老的样子；yard：家门口，随季节变化。
import { C, Pix, disc, hash, line, personAt, scrawl, type Look } from './pix';
import { WEAR, dress, ground, seasonGrade, seasonOf, sky, tree, weather, type Season } from './kit';
import { flatHome, hospitalHome, nursingHome, rentalHome, townHome, yardHome } from './homes';
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

export type Role = 'me' | 'mom' | 'dad' | 'grandma' | 'grandpa' | 'sib' | 'partner' | 'kid' | 'gkid' | 'mate' | 'carer';
/** gown：穿病号服；chair：坐轮椅 */
export interface Resident { role: Role; sex: 'M' | 'F'; age: number; job?: string | null; ill?: boolean; low?: boolean; gown?: boolean; chair?: boolean }
export type Home = 'yard' | 'town' | 'flat' | 'rental' | 'dorm' | 'nursing' | 'hospital';
export interface View {
  home: Home;                                // 农村院子 / 县城老小区 / 城里的楼 / 城中村出租屋 / 大学宿舍 / 养老院 / 医院
  big: boolean;                              // 大城市（楼更高）
  season: Season; month: number;             // 公历月份
  festival: 'spring' | 'midautumn' | null;   // 春节（1–2 月）、中秋（9 月）
  people: Resident[];                        // 现在在家的人，从左到右
  away: boolean;                             // 留守：在外地打工的爸爸或妈妈不在家，家里的大人举着手机和他们视频
  awayWho?: ('mom' | 'dad')[];               // 不在家的是谁
  props: { wedding?: boolean; mourning?: boolean; demolish?: boolean; car?: boolean; boxes?: boolean }; // boxes：刚搬家，门口堆着纸箱（由界面在搬家后几个月里加上）
  seed: number;
}

/** 这一刻家里是什么样。L 是一生的状态（传 S，或批量检查时的任意一生） */
export function viewOf(L: Life): View {
  const month = ((L.birthMonth - 1 + (L.month || 0)) % 12) + 1, f = L.fam, a = L.age;
  const kind = L.loc.kind, uni = ['本科', '大专', '硕士'].includes(L.school || '');
  const meR: Resident = { role: 'me', sex: L.sex, age: a, job: L.school ? 'student' : L.job, ill: !!L.flags.ill, low: L.st.h < 35 };
  const people: Resident[] = [];
  let away = false;
  const awayWho: ('mom' | 'dad')[] = [];
  // 住在哪：刚查出大病、正在治疗的那一年在医院；住进养老院的在养老院；大学在宿舍；
  // 其他按地方：农村院子、地级市和县城的老小区、省会和大城市的楼；在大城市、省会租房的年轻人和随迁的孩子住城中村
  const ill = L.flags.ill, hosp = !!(ill && ill.treat && ill.treat !== 'none' && a - ill.at <= 0);
  const renting = (kind === 'big' || kind === 'capital') && ((L.indep && !L.house && a < 40) || (!L.indep && (!!L.flags.mig || L.famHouse?.type === 'rent')));
  const home: Home = hosp ? 'hospital' : L.flags.oldLive === 'home' ? 'nursing' : uni ? 'dorm' : kind === 'rural' ? 'yard' : renting ? 'rental' : kind === 'city' ? 'town' : 'flat';
  if (hosp) {
    // 医院：你穿着病号服，家里人来看你
    const pt = f.partner, adultKid = f.kids.find(k => k.alive && k.age >= 18);
    if (pt && pt.alive && f.married) people.push({ role: 'partner', sex: pt.sex, age: pt.age });
    else if (!L.indep && f.mom.alive) people.push({ role: 'mom', sex: 'F', age: f.mom.age });
    people.push({ ...meR, gown: true, ill: true });
    if (adultKid) people.push({ role: 'kid', sex: adultKid.sex, age: adultKid.age });
  } else if (home === 'nursing') {
    // 养老院：护工、你、同屋的老人
    people.push({ role: 'carer', sex: 'F', age: 42, job: 'carer' }, { ...meR, chair: a >= 82 || L.st.hl < 30 }, { role: 'mate', sex: L.sex === 'M' ? 'M' : 'F', age: a + 3 });
  } else if (L.flags.oldLive === 'kid') {
    // 和子女同住：你、成了家的孩子、孙辈
    const k0 = f.kids.find(k => k.alive && k.married) || f.kids.find(k => k.alive);
    people.push(meR);
    if (k0) people.push({ role: 'kid', sex: k0.sex, age: k0.age, job: k0.age < 65 ? 'clerk' : 'retired' });
    for (let g = 0; g < Math.min(2, L.flags.grandkids || 0); g++) people.push({ role: 'gkid', sex: g % 2 ? 'F' : 'M', age: Math.max(1, (k0 ? k0.age : a - 28) - 28 + g * 3) });
  } else if (uni) {
    // 大学：宿舍里的室友
    for (let k = 0; k < 2; k++) people.push({ role: 'mate', sex: L.sex, age: a, job: 'student' });
    people.splice(1, 0, meR);
  } else if (!L.indep || a < 18) {
    // 和爸妈住：同住的祖父母、爸妈（留守时不在）、兄弟姐妹、你
    const pa = Math.max(f.mom.age, f.dad.age), gpAge = pa + 27;
    if ((f.gp || 0) >= 2 && gpAge < 88) people.push({ role: 'grandpa', sex: 'M', age: gpAge + 2 });
    if ((f.gp || 0) >= 1 && gpAge < 90) people.push({ role: 'grandma', sex: 'F', age: gpAge });
    // 留守：都出去了，或者只有一方——按谁的工作是外出务工来定（都不是的话算爸爸）
    const lb = a < 16 ? L.flags.lb : undefined;
    const momOut = lb === 'both' || (lb === 'one' && f.mom.jk === 'migrant');
    const dadOut = lb === 'both' || (lb === 'one' && !momOut);
    away = momOut || dadOut;
    if (dadOut) awayWho.push('dad');
    if (momOut) awayWho.push('mom');
    // 爸妈都出去了、家里又没有同住的祖父母：带你的那个人（flags.carer，比如外婆）在家
    if (momOut && dadOut && !people.length) { const c = L.flags.carer || '奶奶'; people.push({ role: /爷|公/.test(c) ? 'grandpa' : 'grandma', sex: /爷|公/.test(c) ? 'M' : 'F', age: gpAge }); }
    if (f.dad.alive && !dadOut) people.push({ role: 'dad', sex: 'M', age: f.dad.age, job: f.dad.jk, ill: f.dad.ill === 1 });
    if (f.mom.alive && !momOut) people.push({ role: 'mom', sex: 'F', age: f.mom.age, job: f.mom.jk, ill: f.mom.ill === 1 });
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
    home, big: kind === 'big', month,
    season: seasonOf(month), festival: month <= 2 ? 'spring' : month === 9 ? 'midautumn' : null,
    people, away, awayWho,
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
  if (r.gown) return dress(base, { top: '#b7cfdc', topSh: '#93b2c6', bottom: '#b7cfdc', bottomSh: '#93b2c6' }); // 病号服
  if (r.role === 'carer') return dress(base, { top: C.pink, topSh: '#cf8584', bottom: C.white });                    // 护工
  if (r.age >= 18 && r.age < 65 && r.job && JOB_WEAR[r.job] && season !== 'winter') return dress(base, JOB_WEAR[r.job]);
  return base;
}

const HOME_DRAW: Record<Home, (p: Pix, v: View, t: number) => void> = {
  yard: yardHome, town: townHome, flat: flatHome, dorm: flatHome, rental: rentalHome, nursing: nursingHome, hospital: hospitalHome,
};
/** 每种住处的树种在哪（城中村、养老院、医院不画树） */
const TREE_X: Partial<Record<Home, number>> = { yard: 86, town: 90, flat: 70, dorm: 70 };
/** 画这一幕 */
export function drawWorld(v: View, t: number): Pix {
  const p = new Pix(W, H), { season, festival } = v, snow = season === 'winter';
  sky(p, 30);
  HOME_DRAW[v.home](p, v, t);
  if (TREE_X[v.home] != null) tree(p, TREE_X[v.home]!, 38, 6, season);
  const carC = [C.blueLt, C.redLt, C.white, C.grayDk, C.green][Math.floor(hash(v.seed, 77) * 5)];
  // 刚搬家：门口堆着纸箱
  if (v.props.boxes) for (const [bx, by, bw] of [[2, 42, 8], [4, 37, 6], [11, 43, 6]] as const) { p.rect(bx, by, bw, 5, C.kraft); p.rect(bx, by, bw, 1, C.kraftDk); p.rect(bx + Math.floor(bw / 2), by, 1, 5, '#d9c7a6'); }
  if (v.props.car && (v.home === 'yard' || v.home === 'flat')) { const x = v.home === 'yard' ? 64 : 74; p.rect(x, 41, 18, 5, carC); p.rect(x + 3, 38, 11, 3, carC); p.rect(x + 4, 39, 4, 2, C.glass); p.rect(x + 9, 39, 4, 2, C.glass); p.rect(x + 2, 46, 3, 2, C.ink); p.rect(x + 13, 46, 3, 2, C.ink); }
  // 人：从左到右排开，居中
  const ws = v.people.map(r => r.age < 1 ? 9 : r.age < 4 ? 7 : r.age < 12 ? 8 : 10), gap = v.people.length > 5 ? 1 : 3;
  let x = Math.round((W - ws.reduce((s, w) => s + w + gap, -gap)) / 2);
  v.people.forEach((r, k) => {
    const look = outfitFor(r, season, hash(v.seed + k, r.role.length)), pose = { t, ph: k * 2, nod: r.low ? 1 : 0 };
    if (r.age < 1) {
      // 婴儿躺在婴儿车里
      p.rect(x, 43, 9, 4, C.pink); p.rect(x, 39, 3, 4, C.pink); p.px(x + 1, 47, C.ink); p.px(x + 7, 47, C.ink);
      personAt(p, r.sex, 0, x + 2, 43, look, pose);
    } else if (r.chair) {
      // 坐轮椅
      personAt(p, r.sex, r.age, x, 47, look, { ...pose, sit: true });
      p.rect(x - 1, 40, 1, 7, C.grayDk); p.rect(x, 44, 10, 1, C.grayDk); disc(p, x + 2, 46, 2, C.grayDk); p.px(x + 2, 46, C.grayLt); p.px(x + 9, 47, C.grayDk);
    } else if (r.ill) {
      // 生病：坐在凳子上，腿上盖着毯子
      p.rect(x, 44, 10, 2, C.wood);
      personAt(p, r.sex, r.age, x, 47, look, { ...pose, sit: true, nod: 1 });
      p.rect(x + 1, 39, 8, 5, '#b7cfdc');
    } else personAt(p, r.sex, r.age, x, 48, look, { ...pose, walk: r.role === 'me' && r.age >= 2 && r.age < 10 });
    // 留守：家里的大人（先奶奶，再爷爷、妈妈、爸爸）举着手机和在外地的爸爸或妈妈视频
    if (v.away && r.role === (['grandma', 'grandpa', 'mom', 'dad'] as Role[]).find(x => v.people.some(q => q.role === x))) {
      p.rect(x + 9, 34, 3, 4, C.ink); p.rect(x + 10, 35, 1, 2, (t >> 1) % 2 ? C.sky : C.skyLt);
    }
    x += ws[k] + gap;
  });
  if (festival === 'spring' && v.home !== 'hospital' && v.home !== 'nursing') for (let k = 0; k < 6; k++) p.px(Math.floor(hash(v.seed, k) * W), 49 + Math.floor(hash(k, v.seed) * 5), C.red); // 地上的鞭炮碎屑
  weather(p, season, t, { seed: v.seed });
  seasonGrade(p, season);
  return p;
}

// ---------- 画廊里的示例：用 ctx 拼一个 View。ctx.home 选住处，默认是爷爷奶奶、爸妈和你 ----------
function yard(o: SceneCtx, t: number) {
  const me = o.age ?? 16, season = o.season || 'summer', month = { spring: 4, summer: 7, autumn: 10, winter: 1 }[season];
  const sx = o.sex || 'M', other: 'M' | 'F' = sx === 'M' ? 'F' : 'M';
  const home = (o.home as Home) || (o.rural ? 'yard' : 'flat');
  const people: Resident[] =
    home === 'hospital' ? [{ role: 'partner', sex: other, age: me }, { role: 'me', sex: sx, age: me, gown: true, ill: true }, { role: 'kid', sex: 'F', age: me - 28 }]
    : home === 'nursing' ? [{ role: 'carer', sex: 'F', age: 42 }, { role: 'me', sex: sx, age: me, chair: me >= 82 }, { role: 'mate', sex: sx, age: me + 3 }]
    : home === 'dorm' ? [{ role: 'mate', sex: sx, age: me }, { role: 'me', sex: sx, age: me }, { role: 'mate', sex: sx, age: me }]
    : home === 'rental' && me >= 18 ? [{ role: 'partner', sex: other, age: me }, { role: 'me', sex: sx, age: me, job: 'rider' }]
    : [{ role: 'grandma', sex: 'F', age: me + 58 }, { role: 'dad', sex: 'M', age: me + 28 }, { role: 'mom', sex: 'F', age: me + 26 }, { role: 'me', sex: sx, age: me }];
  return drawWorld({ home, big: false, season, month, festival: season === 'winter' ? 'spring' : null, away: false, props: { boxes: o.seed === 99 }, seed: o.seed || 1, people }, t);
}

export const WORLD_SCENES = { ages, yard };
