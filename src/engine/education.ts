// 学历、高考与填报志愿：成绩 → 全省排名 → 冲/稳/保院校 → 选专业、是否服从调剂 → 平行志愿投档 → 录取 / 调剂 / 退档 / 滑档。
// 参数集中在 GK；各省分数线来自 real.generated.ts。

import { fexp, flog, fpow } from './fmath';
import type { Loc, Uni } from './types';
import { BIG, PBY, PROVS } from './data';
import { GK_LINES } from './real.generated';
import { S } from './state';
import { addDoc, log, out } from './journal';
import { chance, clamp, gauss, pick, rnd, wpick } from './rng';
import { cityLoc, moveTo } from './place';
import { eff } from './stats';
import { fire } from './lifecycle';
import { calMonth, calYear } from './monthly';

declare module './types' {
  interface Flags { toSchool?: { s: string; y: number; end: number; loc?: Loc; doc?: [string, string][] } | null } // 考上了、等开学（见 admit）
}

export const EDU_LV = ['没上过学', '小学', '初中', '高中', '中专/职高', '大专', '本科', '硕士'];
// ===== 恋爱对象 =====
// 对象和你本人、父母用同一套「学历 → 职业 → 工资」逻辑生成（js/parents.js），只是学历、年龄、家乡和你相关：
// · 学历门当户对：同一档约 55%，差一档约 35%，差两档约 10%；不同档时，女性找的对象学历更高的约六成（估计，参考普查夫妻学历匹配）
// · 年龄：男方平均大 2 岁左右（2020 年普查平均初婚年龄男 29.4、女 28.0 岁）
// · 家乡：多数是同一个省的（估计）
export const SCHOOL_EDU = { 高中: 3, 职高: 4, 复读: 3, 大专: 5, 本科: 6, 硕士: 7 };
// ===== 考上了，等 9 月开学 =====
// 中考、高考、考研、考高职在 6–7 月出结果，开学在公历 9 月。出结果时只记下要去哪里读（S.flags.toSchool），这个暑假 S.school 是空的
// （已经毕业、还没入学）；到了开学那个月（schoolStart）才换成新的学校、搬去学校所在的城市、发学籍卡。学费也在开学那个月交（household.ts）
/** 考上了：years 年后毕业；loc 是要搬去的城市（不搬家的不填）；doc 是开学时发的学籍卡（「入学」那一行开学时补上） */
export function admit(school: string, years: number, loc?: Loc, doc?: [string, string][]) {
  const y = calMonth() < 9 ? calYear() : calYear() + 1; // 哪一年 9 月开学（9 月以后才定下来的，等到第二年）
  S.school = null;
  S.flags.toSchool = { s: school, y, end: y + years, loc, doc };
}
/** 每个月开始时（schedule.ts 的 planMonth → content/decisions.ts 的 huntMonth）：到了开学的时候就入学 */
export function schoolStart() {
  const T = S.flags.toSchool; if (!T) return;
  const cy = calYear(); if (cy < T.y || (cy === T.y && calMonth() < 9)) return;
  S.flags.toSchool = null;
  if (T.loc && T.loc.city !== S.loc.city) { log(`开学了，去${T.loc.city}报到。`, 'ev'); moveTo(T.loc); }
  S.school = T.s; S.schoolEnd = T.end;
  if (T.doc) addDoc('school', '学籍卡', [...T.doc, ['入学', `${T.y}年`]]);
}
// 被录取：发录取通知书，记下学校层次和专业；9 月开学时搬去读书的城市（admit）
export function enroll(c, major, adjusted) {
  addDoc('admit', '录取通知书', [['学校', c.name], ['专业', major + (adjusted ? '（调剂）' : '')], ['层次', TIER_N[c.tier] || '']]);
  const L = BIG[c.city] ? cityLoc(BIG[c.city].p, c.city) : PBY[c.prov].cities.includes(c.city) ? cityLoc(c.prov, c.city) : { p: c.prov, city: c.city, kind: 'city' } as Loc;
  admit(c.tier === 'zhuan' ? '大专' : '本科', c.tier === 'zhuan' ? 3 : 4, L);
  S.flags.tier = { '985': 'top', '211': '211', ben1: 'ben1', ben2: 'ben', minban: 'ben', zhuan: 'zhuan' }[c.tier];
  S.flags.uni = { name: c.name, city: c.city, prov: c.prov, tier: c.tier };
  S.flags.major = major;
  if (c.fee) eff({ h: -2 });
  const away = c.prov === S.home.p ? '留在本省读书' : `离开${PBY[S.home.p].n}，去${PBY[c.prov].n}读书`;
  const fire = S.home.kind === 'rural' && (c.tier === '985' || c.tier === '211') ? '村里有人放了鞭炮。' : '';
  return { t: `被${c.name}录取，专业是${major}${adjusted ? '（服从调剂分过来的）' : ''}。${away}${c.fee ? '，民办学校一年学费两三万' : ''}。${fire}`, k: adjusted || c.fee ? 'ev' : 'good', pic: 'uni' };
}
export const TIER_K = { top: 0.3, '211': 0.18, ben1: 0.1, ben: 0.05, zhuan: 0.02 };
export const tierK = () => TIER_K[S.flags.tier] || 0.05;
export const MAJORS = ['计算机', '会计', '临床医学', '护理', '机械工程', '汉语言文学', '英语', '电子商务', '土木工程', '法学', '师范教育', '金融'];
export const GK = {
  // 各分数线大约对应“全省前百分之几”的考生（待核实的占位值）
  share: { special: 0.2, benke: 0.68, zhuanke: 0.97 },
  // 各省分数线；没有数据的省份用 default（物理类/理科口径）
  lines: { default: { total: 750, special: 520, benke: 440, zhuanke: 200 } },
  localK: 2.0,      // 985/211 在本省的“属地招生”优势
  cal: 0.76,        // 985/211 总体校准：属地优势、调剂、冲一冲叠加后，使录取比例对上招生人数
  heatK: 0.6,       // 专业线 = 学校投档线的排名 × heat^heatK：热门专业要排得更靠前（名校里只高几分）
  heatPts: 0.04,    // 但最多高出 满分 × heatPts × (1 - heat) / 0.4（750 分制计算机最多高 30 分）：专科段分数扎堆，只按排名算会高出上百分
  sd: 0.012,        // 学校投档线每年的波动（logistic 宽度，占满分的比例，750 分制约 9 分）：高出 20 分就很稳，低 20 分基本没戏
};

// 2026 年各省分数线（real.js 里的 GK_LINES）
Object.assign(GK.lines, GK_LINES);

// 985 与部分 211 院校（名称、城市、省份）。pct 越小越难考；属性：med 医科强、edu 师范、agri 农林、eng 工科。
export const UNIS = [
  ['北京大学', '北京', 'BJ', '985', 0.00025, 'med'], ['清华大学', '北京', 'BJ', '985', 0.00025, 'eng'],
  ['复旦大学', '上海', 'SH', '985', 0.0012, 'med'], ['上海交通大学', '上海', 'SH', '985', 0.0012, 'med'],
  ['浙江大学', '杭州', 'ZJ', '985', 0.0018, 'med'], ['中国科学技术大学', '合肥', 'AH', '985', 0.0015, 'eng'],
  ['南京大学', '南京', 'JS', '985', 0.002], ['中国人民大学', '北京', 'BJ', '985', 0.002],
  ['北京航空航天大学', '北京', 'BJ', '985', 0.003, 'eng'], ['同济大学', '上海', 'SH', '985', 0.003, 'eng'],
  ['武汉大学', '武汉', 'HB', '985', 0.004, 'med'], ['华中科技大学', '武汉', 'HB', '985', 0.004, 'med'],
  ['中山大学', '广州', 'GD', '985', 0.004, 'med'], ['西安交通大学', '西安', 'SN', '985', 0.005, 'med'],
  ['哈尔滨工业大学', '哈尔滨', 'HL', '985', 0.005, 'eng'], ['南开大学', '天津', 'TJ', '985', 0.005],
  ['北京师范大学', '北京', 'BJ', '985', 0.005, 'edu'], ['天津大学', '天津', 'TJ', '985', 0.006, 'eng'],
  ['东南大学', '南京', 'JS', '985', 0.006, 'eng'], ['北京理工大学', '北京', 'BJ', '985', 0.006, 'eng'],
  ['厦门大学', '厦门', 'FJ', '985', 0.007], ['华东师范大学', '上海', 'SH', '985', 0.007, 'edu'],
  ['四川大学', '成都', 'SC', '985', 0.008, 'med'], ['电子科技大学', '成都', 'SC', '985', 0.006, 'eng'],
  ['华南理工大学', '广州', 'GD', '985', 0.008, 'eng'], ['中南大学', '长沙', 'HN', '985', 0.009, 'med'],
  ['山东大学', '济南', 'SD', '985', 0.01, 'med'], ['吉林大学', '长春', 'JL', '985', 0.012, 'med'],
  ['大连理工大学', '大连', 'LN', '985', 0.01, 'eng'], ['湖南大学', '长沙', 'HN', '985', 0.011, 'eng'],
  ['重庆大学', '重庆', 'CQ', '985', 0.011, 'eng'], ['西北工业大学', '西安', 'SN', '985', 0.009, 'eng'],
  ['中国农业大学', '北京', 'BJ', '985', 0.012, 'agri'], ['中国海洋大学', '青岛', 'SD', '985', 0.014],
  ['东北大学', '沈阳', 'LN', '985', 0.014, 'eng'], ['兰州大学', '兰州', 'GS', '985', 0.016, 'med'],
  ['中央民族大学', '北京', 'BJ', '985', 0.016], ['西北农林科技大学', '咸阳', 'SN', '985', 0.018, 'agri'],
  ['北京邮电大学', '北京', 'BJ', '211', 0.008, 'eng'], ['上海财经大学', '上海', 'SH', '211', 0.008],
  ['中央财经大学', '北京', 'BJ', '211', 0.01], ['对外经济贸易大学', '北京', 'BJ', '211', 0.011],
  ['西安电子科技大学', '西安', 'SN', '211', 0.014, 'eng'], ['南京航空航天大学', '南京', 'JS', '211', 0.016, 'eng'],
  ['中国政法大学', '北京', 'BJ', '211', 0.016], ['北京交通大学', '北京', 'BJ', '211', 0.018, 'eng'],
  ['华东理工大学', '上海', 'SH', '211', 0.02, 'eng'], ['武汉理工大学', '武汉', 'HB', '211', 0.025, 'eng'],
  ['西南财经大学', '成都', 'SC', '211', 0.02], ['暨南大学', '广州', 'GD', '211', 0.022, 'med'],
  ['苏州大学', '苏州', 'JS', '211', 0.025, 'med'], ['华中师范大学', '武汉', 'HB', '211', 0.025, 'edu'],
  ['中南财经政法大学', '武汉', 'HB', '211', 0.022], ['西南交通大学', '成都', 'SC', '211', 0.026, 'eng'],
  ['上海大学', '上海', 'SH', '211', 0.028], ['郑州大学', '郑州', 'HA', '211', 0.04, 'med'],
  ['南昌大学', '南昌', 'JX', '211', 0.04, 'med'], ['福州大学', '福州', 'FJ', '211', 0.035, 'eng'],
  ['合肥工业大学', '合肥', 'AH', '211', 0.035, 'eng'], ['安徽大学', '合肥', 'AH', '211', 0.04],
  ['西北大学', '西安', 'SN', '211', 0.035], ['陕西师范大学', '西安', 'SN', '211', 0.038, 'edu'],
  ['湖南师范大学', '长沙', 'HN', '211', 0.035, 'edu'], ['华南师范大学', '广州', 'GD', '211', 0.03, 'edu'],
  ['西南大学', '重庆', 'CQ', '211', 0.035, 'edu'], ['云南大学', '昆明', 'YN', '211', 0.04],
  ['贵州大学', '贵阳', 'GZ', '211', 0.045, 'agri'], ['广西大学', '南宁', 'GX', '211', 0.045],
  ['太原理工大学', '太原', 'SX', '211', 0.045, 'eng'], ['河北工业大学', '天津', 'HE', '211', 0.04, 'eng'],
  ['内蒙古大学', '呼和浩特', 'NM', '211', 0.045], ['辽宁大学', '沈阳', 'LN', '211', 0.045],
  ['东北师范大学', '长春', 'JL', '211', 0.04, 'edu'], ['东北林业大学', '哈尔滨', 'HL', '211', 0.045, 'agri'],
  ['新疆大学', '乌鲁木齐', 'XJ', '211', 0.045], ['海南大学', '海口', 'HI', '211', 0.045],
  ['宁夏大学', '银川', 'NX', '211', 0.045], ['青海大学', '西宁', 'QH', '211', 0.045, 'med'], ['西藏大学', '拉萨', 'XZ', '211', 0.045],
].map(([name, city, prov, tier, pct, attr]: any[]): Uni => ({ name, city, prov, tier, pct, attr: attr || '' }));

// 专业：热门的分数要求更高（heat < 1），冷门更低（heat > 1）
export const MAJOR_LIST = [
  { n: '计算机', heat: 0.6 }, { n: '电子信息', heat: 0.65 }, { n: '临床医学', heat: 0.6, need: 'med' },
  { n: '金融', heat: 0.75 }, { n: '法学', heat: 0.85 }, { n: '会计', heat: 0.9 },
  { n: '机械工程', heat: 1 }, { n: '土木工程', heat: 1.15 }, { n: '汉语言文学', heat: 0.95 },
  { n: '英语', heat: 1 }, { n: '师范教育', heat: 0.95, need: 'edu' }, { n: '护理', heat: 1.3 },
  { n: '农学', heat: 1.6, need: 'agri' }, { n: '哲学', heat: 1.5 }, { n: '地质', heat: 1.5 },
];
export const majorsOf = u => MAJOR_LIST.filter(m => !m.need || u.attr === m.need || u.tier === 'zhuan' || u.tier === 'ben2');
export const COLD = ['农学', '哲学', '地质', '护理', '土木工程'];

export const gkLines = pid => GK.lines[pid] || GK.lines.default;
export const normCdf = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * fexp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };

// 考生在全省考生里的位置：u = 排在你前面的比例（越小越好）
export function gkRank() {
  // 60 ≈ 参加高考的学生学识中位数、约 8.5 为标准差（模拟测得），使排名在考生中大致均匀分布
  const s = (S.st.kn - 60) / 8.5 + (S.q - 3) * 0.12 + (S.home.kind === 'rural' ? -0.12 : 0.08) + (S.school === '复读' ? 0.25 : 0) + gauss(0, 0.35);
  return clamp(1 - normCdf(s), 0.00002, 0.995);
}
// 位置 → 分数：在几个锚点之间按 log(u) 线性插值
export function gkScore(u, pid) {
  const L = gkLines(pid), T = L.total;
  const pts = [[0.00002, T * 0.95], [0.002, T * 0.9], [0.03, (T * 0.9 + L.special) / 2], [GK.share.special, L.special], [GK.share.benke, L.benke], [GK.share.zhuanke, L.zhuanke], [0.995, Math.min(L.zhuanke, T * 0.2)]];
  const x = flog(u);
  for (let i = 1; i < pts.length; i++) {
    const [u0, s0] = pts[i - 1], [u1, s1] = pts[i];
    if (u <= u1) { const t = (x - flog(u0)) / (flog(u1) - flog(u0)); return Math.round(s0 + (s1 - s0) * clamp(t, 0, 1)); }
  }
  return Math.round(pts[pts.length - 1][1]);
}

// 普通院校（不列具体校名，避免编造）：按城市和层次生成。
// 投档线直接按本省的批次线定位（u = 本省考生排在前百分之几才够得上）：批次线本身就反映了各省的招生名额，
// 所以一本在特控线附近、二本在本科线和特控线之间、民办本科贴着本科线、高职在专科线和本科线之间，外省的同层次学校比本省的高一些
export function genericUnis(hp) {
  const P = PBY[hp], out: Uni[] = [], sh = GK.share;
  const mid = (lo, hi, a) => fexp(flog(lo) * (1 - a) + flog(hi) * a); // 两条线之间按排名的对数插值：a=0 在 lo 线上，a=1 在 hi 线上
  const cap = P.cities[0], other = P.cities[1] || cap;
  out.push({ name: `${cap}的一所省属重点大学`, city: cap, prov: hp, tier: 'ben1', u: sh.special * 0.85, attr: '' });
  out.push({ name: `${other}的一所普通本科院校`, city: other, prov: hp, tier: 'ben2', u: mid(sh.benke, sh.special, 0.45), attr: '' });
  out.push({ name: `${cap}的一所民办本科`, city: cap, prov: hp, tier: 'minban', u: sh.benke * 0.95, attr: '', fee: 1 });
  out.push({ name: `${cap}的一所公办高职`, city: cap, prov: hp, tier: 'zhuan', u: mid(sh.zhuanke, sh.benke, 0.5), attr: '' });
  out.push({ name: `${other}的一所民办高职`, city: other, prov: hp, tier: 'zhuan', u: sh.zhuanke, attr: '', fee: 1 });
  // 外省的同层次院校：在本省招得少，线高一些
  const fp = wpick(PROVS.filter(p => p.id !== hp).map(p => [p, p.b])), fc = fp.cities[0]; // 按人口加权，大省的学校更常见
  out.push({ name: `${fp.n}${fc}的一所省属重点大学`, city: fc, prov: fp.id, tier: 'ben1', u: sh.special * 0.6, attr: '' });
  out.push({ name: `${fp.n}${fc}的一所普通本科院校`, city: fc, prov: fp.id, tier: 'ben2', u: mid(sh.benke, sh.special, 0.7), attr: '' });
  return out;
}
// 某校在本省的投档线（排名口径）。985/211 按全国名额换算：考虑属地优势和各省招生名额差异（ek）
export function uniThreshold(u, hp) {
  if (u.u != null) return u.u;
  let t = u.pct * GK.cal * (PBY[hp].ek || 1);
  if (u.prov === hp) t *= GK.localK;
  return Math.min(0.99, t);
}
// 录取概率：分数线每年有波动，离投档线越近越没把握。按分差算（宽度见 GK.sd）
export const admitP = (score, line, w) => 1 / (1 + fexp(-(score - line) / w));

// 生成 冲 / 稳 / 保 的候选院校。每个学校带上投档线 line（分）和各专业的录取线 ml（分）
export function gkCandidates(rank, hp, score) {
  const L = gkLines(hp), w = L.total * GK.sd;
  const pool = UNIS.map(u => ({ ...u })).concat(genericUnis(hp)).filter(u => score >= L.benke || u.tier === 'zhuan');
  for (const u of pool) {
    u.thr = uniThreshold(u, hp); u.line = gkScore(u.thr, hp); u.p = admitP(score, u.line, w);
    // 专业线：热门的要排得更靠前；冷门的就是学校投档线
    u.ml = Object.fromEntries(majorsOf(u).map(m => {
      const h = Math.min(1, m.heat);
      return [m.n, Math.min(gkScore(u.thr * fpow(h, GK.heatK), hp), Math.round(u.line + L.total * GK.heatPts * (1 - h) / 0.4))];
    }));
  }
  const pickN = (lo, hi, n) => {
    const c = pool.filter(u => u.p >= lo && u.p < hi && !u.taken).sort((a, b) => a.thr - b.thr);
    const got = [];
    // 本省和外省尽量都有
    for (const want of [x => x.prov !== hp, x => x.prov === hp, () => true]) {
      const x = c.find(u => !u.taken && want(u));
      if (x && got.length < n) { x.taken = 1; got.push(x); }
    }
    return got;
  };
  const rush = pickN(0.08, 0.5, 3), steady = pickN(0.5, 0.9, 3), safe = pickN(0.9, 1.01, 2);
  const tag = (arr, g) => arr.map(u => ({ name: u.name, city: u.city, prov: u.prov, tier: u.tier, attr: u.attr, thr: u.thr, line: u.line, ml: u.ml, w, p: u.p, fee: u.fee || 0, group: g }));
  return [...tag(rush, '冲'), ...tag(steady, '稳'), ...tag(safe, '保')];
}
export const TIER_N = { '985': '985', '211': '211', ben1: '一本', ben2: '二本', minban: '民办本科', zhuan: '专科' };
// 被这个学校的这个专业录取的概率（不超过学校投档的概率：专业线不会低于投档线）
export const majorP = (score, c, m) => Math.min(c.p, admitP(score, c.ml[m.n] ?? c.line, c.w));

// 平行志愿投档：按志愿顺序，第一个够得上投档线的学校投档；再看专业线够不够，没录上时服从调剂就分到冷门专业，不服从就退档。
// 同一个学校的投档线和专业线一起涨落，所以只抽一次：今年线低到够得上专业，就一定也够得上投档
export function gkResolve(apps, score, adjust) {
  for (const a of apps) {
    const m = MAJOR_LIST.find(x => x.n === a.major) || MAJOR_LIST[6];
    const v = rnd();
    if (v >= a.c.p) continue;
    if (v < majorP(score, a.c, m)) return { ok: true, c: a.c, major: a.major };
    if (adjust) return { ok: true, c: a.c, major: pick(COLD.filter(x => majorsOf(a.c).some(y => y.n === x))) || '农学', adjusted: true };
    return { ok: false, rejected: a.c };
  }
  return { ok: false };
}
// 自动填报：冲、稳、保各选一个，专业按兴趣随机
export function gkAutoApps(ctx) {
  const by = g => ctx.cands.filter(c => c.group === g);
  const apps = [];
  for (const g of ['冲', '稳', '保']) {
    const list = by(g); if (!list.length) continue;
    const c = pick(list), ms = majorsOf(c);
    apps.push({ i: ctx.cands.indexOf(c), major: pick(ms).n });
  }
  return { apps, adjust: chance(0.9) };
}
