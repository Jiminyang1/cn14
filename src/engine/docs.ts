// 证件：人生每过一道关口往档案里放一份（journal.ts 的 addDoc）；之后人生往后走，证件上会多出东西（盖章、铅笔字）。
// 证件上的编号、单位名、小区名这些只是为了读起来像真的：用种子和名字算出来，不碰随机数，所以不影响这一生的走向。

import { S } from './state';
import { addDoc } from './journal';
import { calMonth, calYear } from './monthly';
import { placeName } from './place';
import { JOBS } from './career';
import { EDU_LV, TIER_N } from './education';
import { CAUSE } from './mortality';
import { wan } from './format';
import { wageRate } from './finance';
import { PBY as PROV } from './data';
import type { Loc, Partner } from './types';

declare module './types' {
  interface Doc {
    v?: string;          // 同一类证件的不同样子（毕业证：中专 / 大专 / 本科 / 硕士；工作：合同 / 务工登记）
    marks?: DocMark[];   // 后来盖上的章、写上的字（见 markDoc）
  }
}
/** 证件上后来多出来的东西。c：章的颜色；p：铅笔字（不是章） */
export interface DocMark { t: string; c: 'red' | 'green' | 'gray' | 'blue'; p?: 1; y: number; m: number }

// ===== 不碰随机数的「随机」：同一个人、同一个名目，算出来总是同一个数 =====
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** 0 到 n−1 之间的一个整数，由这一生的种子和 key 决定 */
export const dn = (key: string, n: number) => fnv(`${S.seed}|${key}`) % n;
const of = <T,>(key: string, xs: T[]) => xs[dn(key, xs.length)];
/** n 位数字的编号 */
export const digits = (key: string, n: number) => Array.from({ length: n }, (_, i) => dn(`${key}#${i}`, 10)).join('');

// ===== 名字：村、学校、单位、小区、医院 =====
const VILLAGE = ['石岭', '柳湾', '桂花', '杨家', '新桥', '河坝', '白果', '长滩', '清水', '黄桷', '松林', '双龙', '枣林', '马鞍', '青山', '庙湾'];
export const village = () => of('village', VILLAGE) + '村';
export const primarySchool = () => S.home.kind === 'rural' ? village() + '小学' : `${S.home.city}${of('pri', ['实验', '第二', '人民路', '东风', '光明', '育才'])}小学`;
export const vocSchool = () => `${S.loc.city}${of('voc', ['职业技术', '工业', '交通', '商贸'])}学校`;
const BRAND = ['锦程', '华信', '恒通', '远达', '金桥', '新程', '万和', '宏泰', '瑞丰', '东方'];
const TRADE: Record<string, string> = { engineer: '建设工程', tech: '科技', sales: '商贸', factory: '电子制造', clerk: '实业', skilled: '机械', build: '建筑劳务', boss: '商贸' };
/** 第几份工作的单位名。教师、医生、护士写学校和医院 */
export function employer(job: string, n: number) {
  const c = S.loc.city;
  if (job === 'teacher') return `${c}第${'一二三四五六七八'[dn('sch' + n, 8)]}中学`;
  if (job === 'doctor' || job === 'nurse') return hospital('emp' + n);
  return `${c}${of('brand' + n, BRAND)}${TRADE[job] || '实业'}有限公司`;
}
export const hospital = (key: string) => `${S.loc.city}${of('hosp' + key, ['第一', '第三', '中心', '第二'])}人民医院`;
/** 出生的地方：农村是乡镇卫生院或县医院，城里是妇幼保健院或人民医院 */
export const birthPlace = () => S.loc.kind === 'rural' ? of('bp' + S.age, ['乡镇卫生院', '县医院', '乡镇卫生院']) : of('bp' + S.age, ['市妇幼保健院', '市人民医院']);
export const estate = () => `${of('est', ['锦华', '翠苑', '阳光', '金桂', '滨江', '御景', '天悦', '书香', '和园', '幸福'])}${of('est2', ['苑', '花园', '小区', '雅居', '名城'])} ${1 + dn('bld', 18)} 栋 ${2 + dn('fl', 28)}0${1 + dn('unit', 4)}`;
/** 家庭住址：农村写到村和组，城里写到小区 */
export const address = () => S.loc.kind === 'rural' ? `${placeName(S.loc)} · ${village()} ${1 + dn('zu', 9)} 组` : `${placeName(S.loc)} · ${estate()}`;

// ===== 盖章、写铅笔字 =====
const now = () => ({ y: calYear(), m: calMonth() });
/** 最近一份这几类里的证件 */
export const lastDoc = (ks: string | string[]) => {
  const K = typeof ks === 'string' ? [ks] : ks;
  for (let i = (S.docs || []).length - 1; i >= 0; i--) if (K.includes(S.docs[i].k)) return S.docs[i];
  return null;
};
/** 在最近一份这类证件上盖一个章（或写一行铅笔字）。once：已经有这行字的不再加 */
export function markDoc(ks: string | string[], t: string, c: DocMark['c'] = 'gray', pencil = false) {
  const d = lastDoc(ks); if (!d) return;
  (d.marks ||= []).push({ t, c, ...(pencil ? { p: 1 as const } : {}), ...now() });
}
// 工作证件（合同、务工登记、录用通知）结束了：怎么结束的写在上面；已经写过的不重复
const JOB_DOCS = ['job', 'civil'];
export function endJobDoc(t: string, c: DocMark['c'] = 'gray') {
  const d = lastDoc(JOB_DOCS); if (!d || (d.marks || []).some(x => x.c !== 'blue')) return;
  (d.marks ||= []).push({ t, c, ...now() });
}

// ===== 身份证：16 岁办第一张，26、46 岁到期换证 =====
export function idCardYear() {
  if (S.age === 16) {
    const day = 1 + dn('bday', 28), mm = String(S.birthMonth).padStart(2, '0');
    addDoc('id', '居民身份证', [['姓名', S.name], ['性别', S.sex === 'M' ? '男' : '女'], ['民族', S.eth.replace(/族$/, '')],
      ['出生', `${S.birthYear} 年 ${S.birthMonth} 月 ${day} 日`], ['住址', address()],
      ['号码', `${digits('area', 6)} ${S.birthYear}${mm}** ***${dn('chk', 10)}`]]);
  } else if (S.age === 26 || S.age === 46) markDoc('id', `换证 · 住址：${address()}`, 'blue');
}

// ===== 每一份证件写什么 =====
// 各处发证时调用这些函数，只用当时已有的状态，不碰随机数

const ym = () => `${calYear()} 年 ${calMonth()} 月`;
const hometown = (L: Loc, rural?: boolean) => `${PROV[L.p] ? PROV[L.p].n : ''}${L.city}${rural ?? L.kind === 'rural' ? ' · 农村' : ''}`;

export function birthDoc() {
  const f = S.fam, F = S.flags;
  const grow = F.lb === 'both' ? `留守，由${F.carer}带大` : F.lb ? '一方父母外出打工' : F.mig ? '随父母在外地' : '和父母在一起';
  addDoc('birth', '出生登记表', [['姓名', S.name], ['性别', S.sex === 'M' ? '男' : '女'], ['民族', S.eth], ['出生日期', `${S.birthYear}年${S.birthMonth}月`],
    ['出生地', placeName()], ['出生地点', birthPlace()], ['户籍', S.rural ? '农村' : '城镇'],
    ['母亲', `${f.mom.age}岁 · ${f.mom.job}`], ['父亲', `${f.dad.age}岁 · ${f.dad.job}`], ['家境', String(S.q)], ['成长', grow]]);
}
// 家长意见：爸妈都在外打工的，是照看的老人写的
export const parentReply = () => S.flags.lb === 'both' ? '晓得了。' : of('reply', ['知道了。', '已阅，会督促孩子改正。', '孩子在家也坐不住，辛苦老师了。', '谢谢老师。']);
/** 学籍卡：高中、职高开学时发（education.ts 的 schoolStart 补上入学年份） */
export const schoolRows = (name: string, stage: string, major?: string): [string, string][] =>
  [['学校', name], ['学段', stage], ...(major ? [['专业', major] as [string, string]] : []), ['学籍号', 'G' + digits('xj' + stage, 15)]];
export const admitRows = (c: { name: string; city: string; prov: string; tier: string }): [string, string][] =>
  [['城市', `${c.city} · ${c.prov === S.home.p ? '本省' : '外省'}`], ['学制', c.tier === 'zhuan' ? '三年' : '四年'], ['编号', digits('adm', 12)]];

/** 毕业证：中专、大专、本科、硕士。入学那年从学籍卡或录取通知书上找 */
export function gradDoc(lv: number) {
  const zhong = lv === 4, yrs = zhong || lv === 5 || lv === 7 ? 3 : 4;
  const from = zhong ? lastDoc('school') : null, get = (d, k) => d ? (d.rows.find(r => r[0] === k) || [])[1] : '';
  const school = zhong ? get(from, '学校') : S.flags.uni ? S.flags.uni.name : '';
  const title = zhong ? '中专毕业证书' : lv === 7 ? '硕士学位证书' : '毕业证书';
  addDoc('grad', title, [['学校', school], ['学历', EDU_LV[lv]], ['专业', zhong ? get(from, '专业') : S.flags.major], ['入学', String(calYear() - yrs)], ['毕业', String(calYear())],
    ['学制', `${'零一二三四'[yrs]}年`], ['编号', digits('grad' + lv, 16)]], { 4: 'zhong', 5: 'zhuan', 6: 'ben', 7: 'master' }[lv]);
}

/** 工作的证件：公务员发录用通知，蓝领发务工登记，其余是劳动合同 */
export function jobDoc(job: string) {
  const J = JOBS[job]; if (!J || !(J.m > 0)) return;
  const n = (S.jobs || []).length, mo = String(calMonth()).padStart(2, '0');
  if (job === 'civil') return addDoc('civil', '录用通知', [['岗位', J.n], ['工作地', placeName()], ['起始', `${calYear()}年`], ['报到', ym()]]);
  if (J.blue) return addDoc('job', '务工登记', [['工种', J.n], ['务工地', placeName()], ['户籍地', hometown(S.home, S.rural)], ['起始', `${calYear()}年`], ['登记', `${calYear()}.${mo}`]], 'blue');
  addDoc('job', '劳动合同', [['甲方', employer(job, n)], ['岗位', J.n], ['工作地', placeName()], ['起始', `${calYear()}年`], ['期限', of('term' + n, ['三年', '三年', '五年', '无固定期限'])],
    ['月工资', `税前 ${(Math.round(wageRate() / 12 / 100) * 100).toLocaleString('en-US')} 元`]]);
}
export function retireDoc() {
  const d = lastDoc(['job', 'civil']), unit = d ? (d.rows.find(r => r[0] === '甲方') || [])[1] : '';
  const y0 = S.indepAt != null ? S.birthYear + S.indepAt : null;
  addDoc('retire', '退休证', [['原岗位', JOBS[S.job] ? JOBS[S.job].n : ''], ['原单位', unit || ''], ['参加工作', y0 ? `${y0}年` : ''], ['退休时间', ym()],
    ['工龄', y0 ? `${calYear() - y0} 年` : ''], ['退休年龄', S.age + '岁']]);
}
/** 退休证上的养老金：退休时算出来以后补上 */
export function retirePension(perMonth: number) { const d = lastDoc('retire'); if (d && perMonth > 0) d.rows.push(['养老金', `每月 ${Math.round(perMonth).toLocaleString('en-US')} 元`]); }

export function marryDoc(p: Partner) {
  const dd = 1 + dn('wed' + calYear(), 28);
  addDoc('marry', '结婚证', [['持证人', S.name], ['配偶', p.name], ['配偶性别', p.sex], ['登记日期', `${calYear()}年${calMonth()}月${dd}日`],
    ['字号', `J${digits('jz', 4)} ${calYear()} ${digits('jz' + calYear(), 6)}`], ['本人出生', `${S.birthYear}.${String(S.birthMonth).padStart(2, '0')}`], ['配偶出生', String(calYear() - p.age)],
    ['本人家乡', hometown(S.home, S.rural)], ['配偶家乡', `${PROV[p.home] ? PROV[p.home].n : ''}${p.rural ? ' · 农村' : ''}`], ['配偶学历', EDU_LV[p.edu]]]);
}
export function divorceDoc(p: Partner, kids: string[]) {
  const yrs = p.marriedAt != null ? S.age - p.marriedAt : 0;
  addDoc('divorce', '离婚证', [['对方', p.name], ['登记日期', ym()], ['字号', `L${digits('lz', 4)} ${calYear()} ${digits('lz' + calYear(), 6)}`], ['婚姻', yrs ? `${yrs} 年` : '不到一年'], ['孩子', kids.join('、')]]);
  markDoc('marry', `${calYear()}.${calMonth()} 离婚`, 'gray', true);
}
export function houseDoc(L: Loc, price: number, parts: { kind: string; bal: number; years: number }[]) {
  const p = S.fam.married && S.fam.partner && S.fam.partner.alive ? S.fam.partner : null;
  addDoc('house', '不动产权证书', [['权利人', p ? `${S.name}、${p.name}` : S.name], ['共有情况', p ? '共同共有' : '单独所有'], ['坐落', `${L.city} · ${estate()}`],
    ['用途', '住宅'], ['面积', `${(86 + dn('area' + calYear(), 80) / 10).toFixed(1)} ㎡`], ['价格', wan(price)],
    ['贷款', parts.length ? parts.map(x => `${x.kind === 'hpf' ? '公积金' : '商贷'}${wan(x.bal)}`).join(' + ') + ` · ${parts[0].years} 年` : '全款']]);
  if (parts.length) markDoc('house', '抵押', 'red');
}
export function kidDoc(k: { name: string; sex: string }, other: string) {
  const mom = S.sex === 'F' ? `${S.name} · ${S.age}岁` : other, dad = S.sex === 'M' ? `${S.name} · ${S.age}岁` : other;
  addDoc('kid', '出生医学证明', [['新生儿', k.name], ['性别', k.sex === 'M' ? '男' : '女'], ['出生时间', ym()], ['出生地点', `${placeName()} · ${birthPlace()}`],
    ['母亲', mom], ['父亲', dad], ['编号', 'Q' + digits('kid' + k.name, 9)]]);
}
// 医嘱：一句听得懂的话
const ADVICE: Record<string, string> = {
  cancer: '尽快手术，术后放化疗，定期复查', heart: '按时服药，戒烟限酒，不可劳累', stroke: '住院治疗，出院后坚持康复训练',
  resp: '戒烟，避免受凉，坚持吸入用药', liver: '戒酒，定期复查肝功能', leukemia: '住院化疗，必要时骨髓移植', kidney: '低盐饮食，定期透析或复查',
};
export function illDoc(k: string, m: number) {
  addDoc('ill', '诊断证明书', [['诊断', CAUSE[k]], ['日期', `${calYear(m)}年${calMonth(m)}月`], ['年龄', String(S.age)], ['医院', hospital('ill' + S.age)], ['医嘱', ADVICE[k] || '住院治疗，遵医嘱复查']]);
}
/** 老家拆迁签的协议：被征收人是父母（都不在了就是你） */
export function demolDoc(how: string) {
  const f = S.fam, who = f.dad.alive ? '父亲' : f.mom.alive ? '母亲' : '本人';
  addDoc('demol', '房屋征收补偿协议', [['被征收人', who], ['房屋', `${hometown(S.home)} · ${S.home.kind === 'rural' ? '自建房' : '老房子'}`], ['补偿', how], ['签约', ym()]]);
}
