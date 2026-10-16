// 学历、高考与填报志愿：成绩 → 全省排名 → 冲/稳/保院校 → 选专业、是否服从调剂 → 平行志愿投档 → 录取 / 调剂 / 退档 / 滑档。
// 参数集中在 GK；各省分数线来自 real.generated.ts。

import { fexp, flog } from './fmath';
import type { Uni } from './types';
import { BIG, PBY, PROVS } from './data';
import { GK_LINES } from './real.generated';
import { S } from './state';
import { addDoc, out } from './journal';
import { chance, clamp, gauss, pick, wpick } from './rng';
import { cityLoc, moveTo } from './place';
import { eff } from './stats';
import { fire } from './lifecycle';

export const EDU_LV = ['没上过学', '小学', '初中', '高中', '中专/职高', '大专', '本科', '硕士'];
// ===== 恋爱对象 =====
// 对象和你本人、父母用同一套「学历 → 职业 → 工资」逻辑生成（js/parents.js），只是学历、年龄、家乡和你相关：
// · 学历门当户对：同一档约 55%，差一档约 35%，差两档约 10%；不同档时，女性找的对象学历更高的约六成（估计，参考普查夫妻学历匹配）
// · 年龄：男方平均大 2 岁左右（2020 年普查平均初婚年龄男 29.4、女 28.0 岁）
// · 家乡：多数是同一个省的（估计）
export const SCHOOL_EDU = { 高中: 3, 职高: 4, 复读: 3, 大专: 5, 本科: 6, 硕士: 7 };
// 被录取：搬去读书的城市，记下学校层次和专业
export function enroll(c, major, adjusted) {
  addDoc('admit', '录取通知书', [['学校', c.name], ['专业', major + (adjusted ? '（调剂）' : '')], ['层次', TIER_N[c.tier] || '']]);
  const L = BIG[c.city] ? cityLoc(BIG[c.city].p, c.city) : PBY[c.prov].cities.includes(c.city) ? cityLoc(c.prov, c.city) : { p: c.prov, city: c.city, kind: 'city' };
  moveTo(L);
  S.school = c.tier === 'zhuan' ? '大专' : '本科'; S.schoolEnd = S.age + (c.tier === 'zhuan' ? 3 : 4);
  S.flags.tier = { '985': 'top', '211': '211', ben1: 'ben1', ben2: 'ben', minban: 'ben', zhuan: 'zhuan' }[c.tier];
  S.flags.uni = { name: c.name, city: c.city, prov: c.prov, tier: c.tier };
  S.flags.major = major;
  if (c.fee) eff({ h: -2 });
  const away = c.prov === S.home.p ? '留在本省读书' : `离开${PBY[S.home.p].n}，去${PBY[c.prov].n}读书`;
  const fire = S.home.kind === 'rural' && (c.tier === '985' || c.tier === '211') ? '村里有人放了鞭炮。' : '';
  return { t: `被${c.name}录取，专业是${major}${adjusted ? '（服从调剂分过来的）' : ''}。${away}${c.fee ? '，民办学校一年学费两三万' : ''}。${fire}`, k: adjusted || c.fee ? 'ev' : 'good' };
}
export const TIER_K = { top: 0.3, '211': 0.18, ben1: 0.1, ben: 0.05, zhuan: 0.02 };
export const tierK = () => TIER_K[S.flags.tier] || 0.05;
export const MAJORS = ['计算机', '会计', '临床医学', '护理', '机械工程', '汉语言文学', '英语', '电子商务', '土木工程', '法学', '师范教育', '金融'];
export const GK = {
  // 各分数线大约对应“全省前百分之几”的考生（待核实的占位值）
  share: { special: 0.2, benke: 0.68, zhuanke: 0.97 },
  // 各省分数线；没有数据的省份用 default（物理类/理科口径）
  lines: { default: { total: 750, special: 520, benke: 440, zhuanke: 200 } },
  // 院校门槛：全国考生中前百分之几能考上（待核实的占位值，按 985/211/本科招生人数换算）
  pctTop985: 0.0004, pct985: 0.016, pct211: 0.045, pctBen1: 0.15, pctBen2: 0.32, pctMinban: 0.4, pctZhuan: 0.85,
  localK: 2.0,      // 在本省上学的“属地招生”优势
  adjustK: 1.3,     // 服从调剂时，学校整体门槛比热门专业宽多少
  cal: 0.65,        // 总体校准：属地优势、调剂、冲一冲叠加后，使各层次录取比例对上招生人数
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

// 普通院校（不列具体校名，避免编造）：按城市和层次生成
export function genericUnis(hp) {
  const P = PBY[hp], out: Uni[] = [];
  const cap = P.cities[0], other = P.cities[1] || cap;
  out.push({ name: `${cap}的一所省属重点大学`, city: cap, prov: hp, tier: 'ben1', pct: GK.pctBen1 * 0.6, attr: '' });
  out.push({ name: `${other}的一所普通本科院校`, city: other, prov: hp, tier: 'ben2', pct: GK.pctBen2 * 0.7, attr: '' });
  out.push({ name: `${cap}的一所民办本科`, city: cap, prov: hp, tier: 'minban', pct: GK.pctMinban, attr: '', fee: 1 });
  out.push({ name: `${cap}的一所公办高职`, city: cap, prov: hp, tier: 'zhuan', pct: GK.pctZhuan * 0.7, attr: '' });
  out.push({ name: `${other}的一所民办高职`, city: other, prov: hp, tier: 'zhuan', pct: 0.97, attr: '', fee: 1 });
  // 外省的同层次院校
  const fp = wpick(PROVS.filter(p => p.id !== hp).map(p => [p, p.b])), fc = fp.cities[0]; // 按人口加权，大省的学校更常见
  out.push({ name: `${fp.n}${fc}的一所省属重点大学`, city: fc, prov: fp.id, tier: 'ben1', pct: GK.pctBen1 * 0.5, attr: '' });
  out.push({ name: `${fp.n}${fc}的一所普通本科院校`, city: fc, prov: fp.id, tier: 'ben2', pct: GK.pctBen2 * 0.6, attr: '' });
  return out;
}
// 某考生能不能上某校：考虑属地优势和各省招生名额差异（ek）
export function uniThreshold(u, hp) {
  let t = u.pct * (u.tier === '985' || u.tier === '211' ? GK.cal : 1) * (PBY[hp].ek || 1);
  if (u.prov === hp) t *= GK.localK;
  return Math.min(0.99, t);
}
// 录取概率：分数线每年有波动，所以离门槛越近越没把握（对数尺度上的宽度 0.3）
export const admitP = (rank, thr) => 1 / (1 + fexp(-flog(thr / rank) / 0.3));

// 生成 冲 / 稳 / 保 的候选院校
export function gkCandidates(rank, hp, score) {
  const L = gkLines(hp);
  const pool = UNIS.map(u => ({ ...u })).concat(genericUnis(hp)).filter(u => score >= L.benke || u.tier === 'zhuan');
  for (const u of pool) { u.thr = uniThreshold(u, hp); u.p = admitP(rank, u.thr * 0.9); }
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
  const tag = (arr, g) => arr.map(u => ({ name: u.name, city: u.city, prov: u.prov, tier: u.tier, attr: u.attr, thr: u.thr, p: u.p, fee: u.fee || 0, group: g }));
  return [...tag(rush, '冲'), ...tag(steady, '稳'), ...tag(safe, '保')];
}
export const TIER_N = { '985': '985', '211': '211', ben1: '一本', ben2: '二本', minban: '民办本科', zhuan: '专科' };
export const majorP = (rank, c, m) => admitP(rank, c.thr * m.heat * 0.9);

// 平行志愿投档：按志愿顺序，第一个能上的学校投档；专业没录上时，服从调剂就分到冷门专业，不服从就退档
export function gkResolve(apps, rank, adjust) {
  for (const a of apps) {
    const m = MAJOR_LIST.find(x => x.n === a.major) || MAJOR_LIST[6];
    const schoolOK = chance(admitP(rank, a.c.thr * GK.adjustK * 0.9));
    if (!schoolOK) continue;
    if (chance(majorP(rank, a.c, m))) return { ok: true, c: a.c, major: a.major };
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
