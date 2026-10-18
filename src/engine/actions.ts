// 主动行动：玩家自己拿主意的事（回家看看、给家人钱、旅行、买车、装修、报班考证）。
// · 每项都要花钱、一年有次数上限，钱不够就做不了（不借钱）；
// · 家人之间有亲疏：父母一个值，每个孩子各一个（Kid.close）。离得远会慢慢淡，回家、给钱、一起旅行、格子放在「家人」上会变亲；
// · 亲疏兑现成具体的结果：父母临终你在不在身边（family.ts）、晚年孩子给多少钱（tight.ts 的 kidSupportY）、
//   能不能搬去和孩子住（抉择 oldcare）、老了以后孩子常不常回来（content/echoes.ts）；
// · 玩家每做一件，记一条输入（game/replay.ts 的 applyInput，type 'act'），重放时一样；
// · 自动抉择、无界面的人生按普通人的习惯做一些（autoActs），不然自动的人生个个都和父母、孩子疏远。
import { S } from './state';
import { chance, clamp, ri } from './rng';
import { eff } from './stats';
import { log, moneyAround, vary } from './journal';
import { placeInc, farFromParents } from './place';
import { anyParent, parentsWord } from './parents';
import { kidsAlive } from './family';
import { JOBS, RAISE, isWorking, raise } from './career';
import { slotW } from './focus';
import { nowM } from './calendar';
import { liquidBalance } from './accounts';

declare module './types' {
  interface Life {
    close?: { par: number };                     // 和父母的亲疏（0–100）
    actN?: { a: number; n: Record<string, number> }; // 这一年（几岁那年）每项行动做了几次
    actAt?: Record<string, number>;               // 每项行动上一次是几岁做的（有冷却的用）
    actLog?: Record<string, number>;              // 自动做的行动上一次写进时间线是几岁（doAct）
  }
  interface Kid { close?: number }               // 和这个孩子的亲疏（0–100）
  interface Flags {
    car?: number;                                // 有车（几岁买的）
    cert?: { at: number; ok: boolean } | null;    // 报了班考证：出生后第几个月出结果、考没考过
  }
}

// ===== 亲疏 =====
export const parClose = () => S.close?.par ?? 70;
const addPar = (x: number) => { (S.close ||= { par: 70 }).par = clamp(parClose() + x, 0, 100); };
export const kidClose = (k: { close?: number }) => k.close ?? 70;
const addKids = (x: number, adultOnly = false) => { for (const k of kidsAlive()) if (!adultOnly || k.age >= 18) k.close = clamp(kidClose(k) + x, 0, 100); };
/** 亲疏怎么说 */
export const closeWord = (c: number) => c >= 75 ? '很亲' : c >= 55 ? '还算亲' : c >= 35 ? '有点疏远' : '很少联系';
/** 成年孩子的亲疏（平均），没有成年孩子是 null */
export const grownClose = () => { const ks = kidsAlive().filter(k => k.age >= 18); return ks.length ? ks.reduce((t, k) => t + kidClose(k), 0) / ks.length : null; };

/** 生日那个月：亲疏每年向一个目标值靠拢（父母一年走 25%，孩子 20%）。目标值看去年你是怎么做的：
 *  · 父母：基础 60；住得远 −25；去年每回一次家 +8（最多四次）、给过钱 +5；和你住一起 +20。只看行动，不看格子：
 *    「家人」格子管的是自己的小家（配偶、孩子），父母那边要你自己回去、自己给（见 AGENTS.md）；
 *  · 成年的孩子：基础 45；去年一起旅行、给过钱各 +8；「家人」每格 +12，「工作」每格 −8（忙着工作的父母和孩子远）；
 *  · 小时候的孩子：基础 65；「家人」每格 +12，「工作」每格 −10。
 *  自动的人生大致落在五六十；常回家的会越来越亲，不管不问的几年就疏远了 */
export function closeYear() {
  const last = S.actN && S.actN.a === S.age - 1 ? S.actN.n : {}, n = (k: string) => last[k] || 0;
  const fam = slotW('family'), work = slotW('work');
  if (anyParent() && S.age >= 18) {
    const T = 60 + (S.flags.parWithMe ? 20 : farFromParents() ? -25 : 0) + 8 * Math.min(4, n('visit')) + (n('giveParents') ? 5 : 0);
    addPar((clamp(T, 0, 100) - parClose()) * 0.25);
  }
  for (const k of kidsAlive()) {
    const T = k.age >= 18 ? 45 + 8 * Math.min(1, n('trip')) + 8 * Math.min(1, n('giveKid')) + 12 * fam - 8 * work : 65 + 12 * fam - 10 * work;
    k.close = clamp(kidClose(k) + (clamp(T, 0, 100) - kidClose(k)) * 0.2, 0, 100);
  }
}

// ===== 行动 =====
// g：分在哪一栏（家人 / 生活）；max：一年最多几次；gap：隔几年才能再做；cost：要花多少（一次）；ok：现在能不能做；run：做了以后（返回时间线上的一句）
export interface Act { n: string; g: 'kin' | 'life' | 'health' | 'money' | 'study'; d: () => string; max: number; gap?: number; cost: () => number; ok: () => boolean; run: () => string }
const inc = () => placeInc();
/** 路费：离老家越远越贵（同省便宜，跨省贵），按当地收入算（估计） */
const tripCost = () => Math.round(inc() * (S.loc.p === S.home.p ? 0.01 : 0.03) / 100) * 100;
const people = () => 1 + Number(!!(S.fam.married && S.fam.partner?.alive)) + kidsAlive().filter(k => k.age < 18).length;
const workingAdult = () => S.indep && S.age >= 18;

export const ACTS: Record<string, Act> = {
  visit: {
    n: '回家看看', g: 'kin', max: 4, d: () => `回${S.home.city}看${parentsWord()}`,
    cost: tripCost, ok: () => workingAdult() && anyParent() && farFromParents() && !S.flags.parWithMe,
    run: () => {
      addPar(3); eff({ so: 1 }); // 幸福不在这里加：自动的人生年年回家，年年加就成了持续的加成；跟爸妈亲，幸福的目标值高一点（stats.ts）
      const w = parentsWord(), ta = w === '爸妈' ? '他们' : w === '妈妈' ? '她' : '他';
      return vary('actVisit', [`请了几天假回去看${w}。${ta}一大早就在路口等着。`, `回家住了几天。走的时候，${w}往你的箱子里塞满了吃的。`, `回去陪${w}吃了几顿饭，听${ta}把邻居家的事讲了一遍又一遍。`, `回家帮${w}把屋顶漏雨的地方修好了。`]);
    },
  },
  giveParents: {
    n: '给爸妈钱', g: 'kin', max: 2, d: () => `转给${parentsWord()}一个月的工资`,
    cost: () => Math.round(Math.max(inc() / 12, (S.net || 0) / 12) / 100) * 100, ok: () => workingAdult() && anyParent() && S.age >= 22,
    run: () => {
      addPar(3);
      const w = parentsWord();
      return vary('actGive', [`给${w}转了一笔钱。${w}嘴上说不要，第二天发来一张新衣服的照片。`, `给${w}包了个红包，${w}推辞了半天才收下。`, `给${w}转了钱，让${w === '爸妈' ? '他们' : '自己'}别省着。`]);
    },
  },
  giveKid: {
    n: '给孩子钱', g: 'kin', max: 1, d: () => '贴补成家立业的孩子',
    cost: () => Math.round(inc() * 0.5 / 1e3) * 1e3, ok: () => S.indep && kidsAlive().some(k => k.age >= 22),
    run: () => { addKids(3, true); return vary('actGiveKid', ['给孩子转了一笔钱，说是给小两口过日子用的。', '孩子说手头紧，你没多问，转了一笔过去。', '孩子换工作的那几个月，你每个月都给他转点钱。']); },
  },
  trip: {
    n: '旅行', g: 'kin', max: 1, d: () => people() > 1 ? '带家人出去玩几天' : '一个人出去走走',
    cost: () => Math.round(inc() * 0.08 * people() / 100) * 100, ok: workingAdult,
    run: () => {
      const fam = people() > 1, p = S.fam.married && S.fam.partner?.alive ? S.fam.partner : null;
      eff({ h: fam ? 5 : 4 });
      if (p) p.love = clamp((p.love ?? 63) + 5, 0, 100);
      addKids(3);
      const where = ['三亚', '大理', '西安', '青岛', '桂林', '敦煌', '厦门', '张家界', '成都', '哈尔滨'][ri(0, 9)];
      return fam ? vary('actTripFam', [`一家人去${where}玩了几天。孩子在沙滩上挖了一下午的坑。`, `带家人去${where}，在酒店的阳台上看了一场日落。`, `一家人去${where}，路上堵了三个小时，到了以后都说值。`])
        : vary('actTrip', [`一个人去${where}走了走，在一家小馆子里吃到了这辈子最好吃的一碗面。`, `去${where}玩了几天，拍了几百张照片。`, `一个人坐火车去了${where}，一路上看着窗外，什么都没想。`]);
    },
  },
  car: {
    n: '买车', g: 'life', max: 1, d: () => '买一辆车',
    cost: () => Math.round(inc() * 1.0 / 1e3) * 1e3, ok: () => workingAdult() && !S.flags.car && S.age <= 65,
    run: () => { S.flags.car = S.age; eff({ h: 5 }); return farFromParents() ? '买了一辆车。过年终于可以自己开车回家了。' : '买了一辆车，周末终于可以开出去转转了。'; },
  },
  renovate: {
    n: '装修房子', g: 'life', max: 1, gap: 10, d: () => `把${S.house?.city}的房子翻新一遍`,
    cost: () => Math.round(inc() * 0.8 / 1e3) * 1e3, ok: () => !!S.house && S.indep,
    run: () => { eff({ h: 5 }); return vary('actReno', ['把房子重新装修了一遍。搬回去的那天，你在客厅里站了很久。', '装修拖了三个月，吵了好几架，住进去以后都觉得值。']); },
  },
  course: {
    n: '报班考证', g: 'study', max: 1, gap: 5, d: () => '周末上课，明年考证，考下来能涨工资',
    cost: () => Math.round(inc() * 0.3 / 1e3) * 1e3, ok: () => isWorking() && S.age <= 50 && !!JOBS[S.job]?.m && !S.flags.cert,
    run: () => {
      // 考不考得过看学识（估计）：学识 50 约六成，70 约八成
      S.flags.cert = { at: nowM() + 12, ok: chance(clamp(0.6 + (S.st.kn - 50) / 100, 0.3, 0.9)) };
      eff({ h: -2, kn: 2 });
      return '报了个班，每个周末去上课，晚上回来接着看书。';
    },
  },
};
/** 模块注册自己的一次性行动（plans/*.ts 的健康、理财……） */
export function defineAct(k: string, A: Act) { ACTS[k] = A; }
const actKeys = () => Object.keys(ACTS);

// ===== 能不能做 =====
const used = (k: string) => S.actN && S.actN.a === S.age ? S.actN.n[k] || 0 : 0;
/** 这一项现在的状态：能做 / 为什么不能做、还剩几次 */
export function actState(k: string) {
  const A = ACTS[k], left = A.max - used(k), cost = A.cost();
  const cool = A.gap && S.actAt?.[k] != null && S.age - S.actAt[k] < A.gap ? A.gap - (S.age - S.actAt[k]) : 0;
  const why = !A.ok() ? '现在做不了' : cool ? `${cool}年后才能再做` : left <= 0 ? '今年已经做过了' : cost > 0 && liquidBalance() < cost ? '手头的钱不够' : ''; // 不花钱的（戒烟）欠着钱也能做
  return { ok: !why, why, left: Math.max(0, left), cost };
}
/** 现在能做的行动（界面只列出能做的和「今年做过了」「钱不够」的，完全不相干的不列） */
export const actsShown = () => actKeys().filter(k => ACTS[k].ok());

// 自动的人生年年回家、给钱，每次都记一句，一辈子就是十几条一样的话：自动做的这几项，第一次和隔了 QUIET_Y 年以上才记
const QUIET = new Set(['visit', 'giveParents', 'giveKid']), QUIET_Y = 8;
/** 做一件（玩家的输入、自动的人生都走这里）。做不了就什么都不做。auto：自动的人生替你做的 */
export function doAct(k: string, auto = false) {
  const A = ACTS[k]; if (!A) return false;
  const st = actState(k); if (!st.ok) return false;
  moneyAround(() => A.n, () => {
    if (k === 'giveParents') { S.money -= st.cost; S.famMoney = (S.famMoney || 0) + st.cost; }
    else eff({ money: -st.cost });
    const t = A.run(), seen = S.actLog?.[k];
    if (!auto || !QUIET.has(k) || seen == null || S.age - seen >= QUIET_Y) { log(t, 'ev'); (S.actLog ||= {})[k] = S.age; }
  });
  if (!S.actN || S.actN.a !== S.age) S.actN = { a: S.age, n: {} };
  S.actN.n[k] = (S.actN.n[k] || 0) + 1;
  (S.actAt ||= {})[k] = S.age;
  return true;
}

// ===== 每个月：考证出结果 =====
export function actsMonth() {
  const c = S.flags.cert;
  if (!c || nowM() < c.at) return;
  S.flags.cert = null;
  if (!isWorking()) { log('证书考下来了，可这时候已经不在原来那份工作上了。', 'ev'); return; }
  if (c.ok) { raise(RAISE.promo); eff({ h: 4 }); log('证考下来了。拿着证书去找领导，工资涨了一档。', 'good'); }
  else { eff({ h: -3 }); log('考试没过，差了几分。花出去的报名费，就当买了个教训。', 'bad'); }
}

// ===== 自动的人生：按普通人的习惯做一些（估计） =====
// 一年回一两次家，偶尔给爸妈钱、出去玩，手头宽裕了买车、装修。生日那个月做（也是亲疏变化的时候）
export function autoActs() {
  if (!S.indep || S.age < 18) return;
  const rich = (k: string, n: number) => liquidBalance() > ACTS[k].cost() * n;
  if (ACTS.visit.ok()) { doAct('visit', true); if (chance(0.6)) doAct('visit', true); }
  if (ACTS.giveParents.ok() && rich('giveParents', 6) && chance(S.q <= 2 ? 0.5 : 0.25)) doAct('giveParents', true);
  if (ACTS.trip.ok() && rich('trip', 8) && chance(0.35)) doAct('trip', true);
  if (ACTS.car.ok() && rich('car', 2.5) && S.age >= 25 && chance(0.15)) doAct('car', true);
  if (ACTS.renovate.ok() && rich('renovate', 3) && chance(0.08)) doAct('renovate', true);
  if (ACTS.giveKid.ok() && rich('giveKid', 4) && chance(0.2)) doAct('giveKid', true);
  if (ACTS.course.ok() && rich('course', 4) && S.age <= 35 && chance(0.06)) doAct('course', true);
}

/** 生日那个月：亲疏变化，自动的人生做这一年的行动 */
export function actsYear() {
  closeYear();
  if (S.headless || S.auto) autoActs();
}
