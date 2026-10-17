// 学历、高考与填报志愿：成绩 → 全省排名 → 冲/稳/保院校 → 选专业、是否服从调剂 → 平行志愿投档 → 录取 / 调剂 / 退档 / 滑档。
// 参数集中在 GK；各省分数线来自 real.generated.ts。

import { fexp, flog } from './fmath';
import type { Loc, Uni } from './types';
import { BIG, PBY, PROVS } from './data';
import { GK_DIST, GK_LINES } from './real.generated';
import { S } from './state';
import { addDoc, log, out } from './journal';
import { chance, clamp, gauss, pick, rnd, wpick } from './rng';
import { cityLoc, moveTo, placeInc } from './place';
import { eff } from './stats';
import { fire } from './lifecycle';
import { MONTHS, calMonth, calYear } from './monthly';
import { pz } from './personality';
import { nowM } from './calendar';

declare module './types' {
  interface Flags {
    toSchool?: { s: string; y: number; end: number; loc?: Loc; doc?: [string, string][] } | null; // 考上了、等开学（见 admit）
    hs?: 'key' | 'county1' | 'normal'; // 高中层次：城市重点、县一中、普通高中（县里的其他高中）
    tutor?: number;                    // 在上补习班：交过补习费的最近一年
    parDivM?: number;                  // 父母离婚在你出生后的第几个月
  }
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
  // 没有一分一段表的省份：特控线、本科线大约对应全省前百分之几（有表的 11 省物理类中位数：特控 26%–42%、本科 64%–81%，见 research/gaokao.json score_dist_2026）
  share: { special: 0.36, benke: 0.72 },
  // 普通院校投档线在批次线之间的位置：x = (分 − 本科线)/(特控线 − 本科线)，x=0 在本科线、1 在特控线；专科 y = (分 − 专科线)/(本科线 − 专科线)。
  // 取甘肃、河南、四川、广东 2025 年各层次最低专业组投档分的中位数（research/gaokao.json school_lines_2025.position_between_lines）
  pos: { ben1: 1.0, ben1Out: 1.3, ben2: 0.6, ben2Out: 0.9, minban: 0.08, zhuanPub: 0.88, zhuanPri: 0.03 },
  posSd: 0.25,      // 同层次学校之间的差别（x 或 y 的标准差）：四省省属重点最低组在 x = 0.56–1.66 之间
  // 各省分数线；没有数据的省份用 default（物理类/理科口径）
  lines: { default: { total: 750, special: 520, benke: 440, zhuanke: 200 } },
  localK: 2.0,      // 985/211 在本省的“属地招生”优势（中等人口的省份）。本省名额摊到考生头上，小省多、大省少，所以再乘 平均人口 ÷ 本省人口（至少 1）：
                    // 兰州大学在甘肃最低组 538、中位组 553 分（约前 11%），郑州大学在河南最低组 601、中位组 628（约前 2.4%）
  cal: 1.05,        // 985/211 总体校准：属地优势、调剂、冲一冲叠加后，使录取比例对上招生人数
  // 校内最热专业比最冷专业（= 学校投档线）高多少分（750 分制），呈倒 U 形：名校各专业都不差；省属重点的土木、给排水、护理掉得很低；
  // 二本又缩回来（research/gaokao.json majors.within_university_by_tier_2025：985/211 计算机 +20~+30，省属重点 +55~+75，二本 +20~+38，
  // 民办理工压线、会计高约 50，高职最热约 +70）。民办和高职里最热的是会计、铁路这类，计算机不突出，这里没有细分
  spread: { '985': 25, '211': 25, ben1: 65, ben2: 30, minban: 20, zhuan: 45 },
  // 院校专业组省份：一个组里有几个专业，你报的专业所在组的投档线在学校最低线和这个专业的线之间（取中间，估计值）；组内服从调剂
  groupK: 0.5,
  sd: 0.012,        // 学校投档线每年的波动（logistic 宽度，占满分的比例，750 分制约 9 分）：高出 20 分就很稳，低 20 分基本没戏
};

// 2026 年各省分数线和一分一段表（real.generated.ts 里的 GK_LINES、GK_DIST）
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
  ['西南大学', '重庆', 'CQ', '211', 0.035, 'edu'], ['云南大学', '昆明', 'YN', '211', 0.055],
  ['贵州大学', '贵阳', 'GZ', '211', 0.055, 'agri'], ['广西大学', '南宁', 'GX', '211', 0.055],
  ['太原理工大学', '太原', 'SX', '211', 0.045, 'eng'], ['河北工业大学', '天津', 'HE', '211', 0.04, 'eng'],
  ['内蒙古大学', '呼和浩特', 'NM', '211', 0.055], ['辽宁大学', '沈阳', 'LN', '211', 0.045],
  ['东北师范大学', '长春', 'JL', '211', 0.04, 'edu'], ['东北林业大学', '哈尔滨', 'HL', '211', 0.045, 'agri'],
  ['新疆大学', '乌鲁木齐', 'XJ', '211', 0.055], ['海南大学', '海口', 'HI', '211', 0.055],
  ['宁夏大学', '银川', 'NX', '211', 0.055], ['青海大学', '西宁', 'QH', '211', 0.055, 'med'], ['西藏大学', '拉萨', 'XZ', '211', 0.055],
  // 中西部省份的 211 在外省招生的线更低（资料：贵州大学、云南大学在四川、宁夏大学在甘肃的中位组比按 0.045 算的宽 1.1–1.9 倍），取 0.055（再高 211 的名额就明显超了）
].map(([name, city, prov, tier, pct, attr]: any[]): Uni => ({ name, city, prov, tier, pct, attr: attr || '' }));

// 专业：热门的分数要求更高（heat 小），冷门更低（heat 大）。专业线 = 投档线 + 校内分差 × hot，hot = (1.6 − heat)，农学为 0、计算机为 1
// 临床医学在顶尖校已经降温（浙大、山大的临床低于计算机），在医学院仍是最热的一档
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

// 学识每年的增长里重心以外的部分（在校时每月记 1/12）。15 岁时 1 个标准差约 11 点学识。依据见 research/education_strat.json
export const STUDY = {
  c: 0.3,         // 认真（性格「认真」的 z 分）每 +1，每年多涨 0.3：到 15 岁约差 0.25 个标准差（尽责性与成绩 r ≈ 0.19，Poropat 2009）
  rural: -0.1,    // 在农村读小学、初中：每年少涨 0.1，九年约 0.1 个标准差（城乡初中生认知差 0.37–0.41 个标准差，约一半能用家庭背景解释，CEPS）
  lbBoth: -0.15,  // 父母都在外打工的留守儿童：每年少涨 0.15，到 15 岁约 0.12 个标准差；只有一方外出的约为 0（Zhang 等 2014 JDE 约 −0.13；也有研究为 0）
  hs: { key: 0.33, county1: 1, normal: 0 }, // 高中层次本身的作用（排除生源后）：城市重点三年约 +0.1 个标准差，县一中约 +0.25（甘肃贫困县 RD +0.39，湖南县不显著）
  tutor: 0.3,     // 补习班：每年 +0.3（约 0.03 个标准差）；排除选择偏差后的研究多为 0 或不显著
};
// 补习费：每年 9 月交一年，约当地人均收入的 0.27（初中）、0.34（高中）（北大教育财政所 2019：参与者城镇初中 11772、高中 13628 元，农村 4167、6064 元）
export const tutorFee = () => Math.round(placeInc() * (S.school === '高中' || S.school === '复读' ? 0.34 : 0.27));
const IN_SCHOOL = new Set(['小学', '初中', '高中', '复读']);
export function studyMonth() {
  const sc = S.school;
  if (!sc || !IN_SCHOOL.has(sc)) { if (S.flags.tutor && (sc || S.age >= 19)) S.flags.tutor = 0; return; }
  let y = STUDY.c * pz('c');
  if (sc === '小学' || sc === '初中') { if (S.loc.kind === 'rural') y += STUDY.rural; }
  else y += STUDY.hs[S.flags.hs || 'normal'];
  if (S.flags.lb === 'both' && S.age < 16) y += STUDY.lbBoth;
  if (S.flags.tutor && sc !== '小学') {
    y += STUDY.tutor;
    if (calMonth() === 9 && S.flags.tutor < calYear()) { S.flags.tutor = calYear(); eff({ money: -tutorFee() }); }
  }
  S.st.kn = clamp(S.st.kn + y / MONTHS, 0, 100);
}
// 中考排名 → 高中层次：城市里前约 30% 上重点高中，县里前约 15% 上县一中（只有省会的招生计划口径：合肥省示范高中约占中考报名的 54%、四大名校约 29%；县里更少，估计）
export const ZK = { mu: 51, sd: 11 }; // 参加中考的学生学识的均值、标准差（模拟测得）
export function hsTier(): 'key' | 'county1' | 'normal' {
  const top = 1 - normCdf((S.st.kn - ZK.mu) / ZK.sd + gauss(0, 0.3));
  return S.loc.kind === 'rural' ? (top < 0.15 ? 'county1' : 'normal') : (top < 0.3 ? 'key' : 'normal');
}
export const HS_NAME = { key: c => `${c}的一所重点高中`, county1: () => '县里的第一中学', normal: (c, rural) => rural ? '县里的一所普通高中' : `${c}的一所普通高中` };
// 高三那一年家里出事（父母去世、离婚）：考试少 0.05 个标准差（荷兰、瑞典登记数据：考前亲人去世 −0.03 ~ −0.06）
export function gkShock(): string | null {
  const now = nowM(), f = S.fam, near = m => m != null && now - m <= 12;
  if (near(f.dad.diedM) || near(f.mom.diedM)) return '这一年家里刚办完丧事，你考得有些心神不定。';
  if (near(S.flags.parDivM)) return '这一年爸妈离了婚，你考前好几个晚上没睡好。';
  return null;
}
// 考生在全省考生里的位置：u = 排在你前面的比例（越小越好）。家境、城乡都已经在学识里了，这里不再加；
// 随机发挥 0.35 个标准差（约占总差异的一成，模考与高考相关约 0.85）；复读 +0.25（连同复读那年涨的学识约 +0.45，复读的因果效应 +0.47，Kang 等 2024）
export const GKR = { mu: 58.6, sd: 9.4 }; // 参加高考的学生学识的中位数、标准差（模拟测得）
export function gkRank() {
  const s = (S.st.kn - GKR.mu) / GKR.sd + (S.school === '复读' ? 0.25 : 0) + (gkShock() ? -0.05 : 0) + gauss(0, 0.35);
  return clamp(1 - normCdf(s), 0.00002, 0.995);
}
// 位置 → 分数：在锚点之间按 log(u) 线性插值。有一分一段表的省份直接用表（GK_DIST），其余省份用有表各省的中位形状
export function gkScore(u, pid) {
  const L = gkLines(pid), T = L.total, D = GK_DIST[pid], sh = GK.share;
  let pts = D ? D.map(([sc, f]) => [f, sc])
    // 高分段各省差不多：680 分约前 0.1%、650 约 0.9%、620 约 3.5%（750 分制，有表各省的中位数）
    : [[0.001, T * 0.907], [0.009, T * 0.867], [0.035, T * 0.827], [sh.special, L.special], [sh.benke, L.benke], [1 - (1 - sh.benke) * 0.2, (L.benke + L.zhuanke) / 2], [0.993, L.zhuanke]];
  pts = [[0.00002, Math.max(T * 0.95, pts[0][1] + 10)], ...pts];
  if (pts[pts.length - 1][1] > L.zhuanke) pts.push([0.999, L.zhuanke]);
  pts = pts.reduce((a, p) => !a.length || (p[0] > a[a.length - 1][0] && p[1] < a[a.length - 1][1]) ? [...a, p] : a, []); // 只留严格单调的点
  const x = flog(u);
  for (let i = 1; i < pts.length; i++) {
    const [u0, s0] = pts[i - 1], [u1, s1] = pts[i];
    if (u <= u1) { const t = (x - flog(u0)) / (flog(u1) - flog(u0)); return Math.round(s0 + (s1 - s0) * clamp(t, 0, 1)); }
  }
  return Math.round(pts[pts.length - 1][1]);
}

// 普通院校（不列具体校名，避免编造）：按城市和层次生成。投档线直接按本省批次线定位（见 GK.pos），每所学校上下有些差别：
// 一本在特控线附近、二本在本科线和特控线之间偏下、民办本科贴着本科线、公办高职接近本科线、民办高职贴着专科线；
// 外省的同层次学校在本省招得少，线高一截（外省二本和本省一本差不多）
export function genericUnis(hp) {
  const P = PBY[hp], L = gkLines(hp), out: Uni[] = [], G = GK.pos;
  const ben = x => Math.round(L.benke + (L.special - L.benke) * Math.max(0, x + gauss(0, GK.posSd)));
  const zhuan = y => Math.round(L.zhuanke + (L.benke - L.zhuanke) * clamp(y + gauss(0, GK.posSd), 0, 1.1));
  const C = P.cities, cap = C[0], c2 = C[1] || cap, c3 = C[2] || c2;
  // 本省：两所省属重点（多在省会）、两所普通本科、一所民办本科、一所公办高职、一所民办高职
  out.push({ name: `${cap}的一所省属重点大学`, city: cap, prov: hp, tier: 'ben1', line: ben(G.ben1), attr: '' });
  out.push({ name: `${cap}的另一所省属重点大学`, city: cap, prov: hp, tier: 'ben1', line: ben(G.ben1), attr: '' });
  out.push({ name: `${c2}的一所普通本科院校`, city: c2, prov: hp, tier: 'ben2', line: ben(G.ben2), attr: '' });
  out.push({ name: `${c3}的一所普通本科院校`, city: c3, prov: hp, tier: 'ben2', line: ben(G.ben2), attr: '' });
  out.push({ name: `${cap}的一所民办本科`, city: cap, prov: hp, tier: 'minban', line: ben(G.minban), attr: '', fee: 1 });
  out.push({ name: `${cap}的一所公办高职`, city: cap, prov: hp, tier: 'zhuan', line: zhuan(G.zhuanPub), attr: '' });
  out.push({ name: `${c2}的一所民办高职`, city: c2, prov: hp, tier: 'zhuan', line: zhuan(G.zhuanPri), attr: '', fee: 1 });
  // 外省：各两所省属重点、普通本科，按人口加权挑省份（大省的学校更常见）
  const far = () => { const fp = wpick(PROVS.filter(p => p.id !== hp).map(p => [p, p.b])); return [fp, fp.cities[0]]; };
  for (const [tier, x, kind] of [['ben1', G.ben1Out, '省属重点大学'], ['ben1', G.ben1Out, '省属重点大学'], ['ben2', G.ben2Out, '普通本科院校'], ['ben2', G.ben2Out, '普通本科院校']] as const) {
    const [fp, fc] = far();
    if (!out.some(u => u.prov === fp.id && u.tier === tier)) out.push({ name: `${fp.n}${fc}的一所${kind}`, city: fc, prov: fp.id, tier, line: ben(x), attr: '' });
  }
  return out;
}
const MEAN_B = PROVS.reduce((t, p) => t + p.b, 0) / PROVS.length;
// 985/211 在本省的投档线（排名口径）：按全国名额换算，考虑属地优势和各省招生名额差异（ek）
export function uniThreshold(u, hp) {
  let t = u.pct * GK.cal * (PBY[hp].ek || 1);
  if (u.prov === hp) t *= Math.max(1, GK.localK * MEAN_B / PBY[hp].b);
  return Math.min(0.99, t);
}
// 录取概率：分数线每年有波动，离投档线越近越没把握。按分差算（宽度见 GK.sd）
export const admitP = (score, line, w) => 1 / (1 + fexp(-(score - line) / w));

// 生成 冲 / 稳 / 保 的候选院校。每个学校带上投档线 line（分）和各专业的录取线 ml（分）
export function gkCandidates(rank, hp, score) {
  const L = gkLines(hp), w = L.total * GK.sd;
  const pool = UNIS.map(u => ({ ...u })).concat(genericUnis(hp)).filter(u => score >= L.benke || u.tier === 'zhuan');
  for (const u of pool) {
    if (u.line == null) u.line = gkScore(uniThreshold(u, hp), hp);
    u.p = admitP(score, u.line, w);
    u.ml = Object.fromEntries(majorsOf(u).map(m => [m.n, Math.round(u.line + GK.spread[u.tier] * L.total / 750 * clamp(1.6 - m.heat, 0, 1))]));
  }
  // 冲：先列最有希望的；稳、保：先列线最高的（保底也要尽量好）
  const pickN = (lo, hi, n) => {
    const c = pool.filter(u => u.p >= lo && u.p < hi && !u.taken).sort(hi <= 0.5 ? (a, b) => b.p - a.p : (a, b) => b.line - a.line);
    const got = [];
    // 本省和外省尽量都有
    for (const want of [x => x.prov !== hp, x => x.prov === hp, () => true]) {
      const x = c.find(u => !u.taken && want(u));
      if (x && got.length < n) { x.taken = 1; got.push(x); }
    }
    return got;
  };
  const rush = pickN(0.08, 0.5, 3), steady = pickN(0.5, 0.9, 3), safe = pickN(0.9, 1.01, 2);
  const nt = NO_TIAOJI.has(hp) ? 1 : 0;
  const tag = (arr, g) => arr.map(u => ({ name: u.name, city: u.city, prov: u.prov, tier: u.tier, attr: u.attr, line: u.line, ml: u.ml, w, p: u.p, nt, fee: u.fee || 0, group: g }));
  return [...tag(rush, '冲'), ...tag(steady, '稳'), ...tag(safe, '保')];
}
export const TIER_N = { '985': '985', '211': '211', ben1: '一本', ben2: '二本', minban: '民办本科', zhuan: '专科' };
// 报这个学校的这个专业：所在专业组的投档线（「专业+院校」省份就是专业线）、投进这个组的概率、录到这个专业的概率
export const groupLine = (c, m) => { const ml = c.ml[m.n] ?? c.line; return c.nt ? ml : Math.round(c.line + (ml - c.line) * GK.groupK); };
export const groupP = (score, c, m) => admitP(score, groupLine(c, m), c.w);
export const majorP = (score, c, m) => Math.min(groupP(score, c, m), admitP(score, c.ml[m.n] ?? c.line, c.w));

// 「专业+院校」填报的省份：每个专业单独投档，没有专业调剂，也就不会因为专业没录上被退档（research/gaokao.json zhiyuan_rules）
export const NO_TIAOJI = new Set(['ZJ', 'SD', 'HE', 'CQ', 'LN', 'GZ', 'QH']);

// 平行志愿投档：按志愿顺序，第一个够得上专业组投档线的志愿投档；再看专业线够不够，没录上时服从调剂就分到组里更冷的专业，不服从就退档。
// 「专业+院校」省份专业线不够就看下一个志愿。同一个学校的各条线一起涨落，所以只抽一次：今年线低到够得上专业，就一定也够得上组
export function gkResolve(apps, score, adjust, hp) {
  void hp;
  for (const a of apps) {
    const m = MAJOR_LIST.find(x => x.n === a.major) || MAJOR_LIST[6];
    const v = rnd();
    if (v >= groupP(score, a.c, m)) continue;
    if (v < majorP(score, a.c, m)) return { ok: true, c: a.c, major: a.major };
    if (a.c.nt) continue;
    const colder = majorsOf(a.c).filter(x => x.heat > m.heat).map(x => x.n);
    if (adjust) return { ok: true, c: a.c, major: pick(colder.length ? colder : COLD.filter(x => majorsOf(a.c).some(y => y.n === x))) || '农学', adjusted: true };
    return { ok: false, rejected: a.c };
  }
  return { ok: false };
}
// 自动填报：冲、稳、保各选一个，专业按兴趣随机，但只挑够得着的（服从调剂时看专业组、不服从看专业，把握三成以上；都够不着就随便挑）
export function gkAutoApps(ctx) {
  const by = g => ctx.cands.filter(c => c.group === g);
  const apps = [], adjust = chance(0.9);
  for (const g of ['冲', '稳', '保']) {
    const list = by(g); if (!list.length) continue;
    const c = pick(list), ms = majorsOf(c), ok = ms.filter(m => (adjust && !c.nt ? groupP : majorP)(ctx.score, c, m) >= 0.3);
    apps.push({ i: ctx.cands.indexOf(c), major: pick(ok.length ? ok : ms).n });
  }
  return { apps, adjust };
}
