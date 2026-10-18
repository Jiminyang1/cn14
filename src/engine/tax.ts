// 税前工资 → 到手：五险一金个人部分、个人所得税。引擎（你本人、配偶、父母的收入）和界面（「怎么算的」）共用 netOf。
// 全部按「一年」算：按月结算时用这个月的工资 × 12 算出一年的量，每月扣 1/12（一年状态不变时，全年合计就是按年汇算的结果；
// 实际的累计预扣法在年初扣得少、年底扣得多，全年总额相同）。出处见 DATA.md「个人所得税和五险一金」。
//
// 一、五险一金个人部分（单位那一半不从工资里扣，不算在这里）
//  · 有单位的工作（JOBS 里除了务农、打工、个体户、小老板、骑手、网约车，即 career.ts 的 RESID_PENSION_JOBS 以外的）：单位代扣
//    养老 8%、医疗 2%、失业 0.5%（《社会保险法》；国办发〔2019〕13 号；失业保险个人费率各地 0.2%–0.5%，取常见的 0.5%）。
//    缴费基数 = 本人工资，不低于本省全口径城镇单位就业人员平均工资（「社平工资」）的 60%，不高于 300%（工资低于最低工资的按实际工资，见 unitBase）。
//    住房公积金：个人和单位各缴 5%–12%（《住房公积金管理条例》；housing.ts 的 HPF_JOB），基数同样不超过社平工资的 3 倍。
//  · 小老板：以灵活就业人员身份自己交职工养老（20%，其中 8% 进个人账户）和职工医保（各地 6%–10%，取 8%），
//    多数人按最低的 60% 档交（估计）。所以小老板退休领职工养老金（career.ts），和原来的规则一致。
//  · 务农、进城务工、建筑工人、骑手、网约车司机、个体户：没有单位代扣，参加城乡居民保险：
//    居民医保个人缴费每年 400 元（2024–2026 年国家标准）；居民养老按年选档，最低档 100–300 元，多数人选低档，取 300 元（估计）。
//    和 RESID_PENSION_JOBS 一致：他们退休领城乡居民养老金。农民工里交职工社保的约三成（估计），游戏里没有单独区分。
//
// 二、个人所得税
//  · 综合所得（工资、劳务报酬）：年应纳税所得额 = 年收入 − 6 万（基本减除费用）− 专项扣除（三险一金个人部分）− 专项附加扣除，
//    按 3%–45% 的七级超额累进税率（《个人所得税法》2018 年修正，第二条、第六条）。
//  · 专项附加扣除（国发〔2018〕41 号，国发〔2023〕13 号提高后的标准），见 dedOf / parentDed：
//    3 岁以下婴幼儿照护、子女教育：每个孩子每月 2000 元（从出生到读完大学，这里按 22 岁以前），父母各扣一半或一方全扣；
//    赡养老人（父母一方满 60 岁）：独生子女每月 3000 元，有兄弟姐妹的分摊，每人不超过 1500 元；
//    住房贷款利息（首套）：每月 1000 元，最长 20 年；或者住房租金（在工作的城市没有房子）：直辖市、省会、计划单列市每月 1500 元，
//    市辖区户籍人口超过 100 万的城市 1100 元，其余 800 元（这里按常住人口 500 万以上的城市算 1100，估计）。两者只能选一个，夫妻由一方扣。
//    继续教育、大病医疗、个人养老金没有算。
//  · 经营所得（个体户、小老板）：5%–35% 的五级超额累进税率，没有综合所得的可以同样减除 6 万、专项扣除和专项附加扣除；
//    个体工商户年应纳税所得额 200 万以内的部分减半征收（财政部 税务总局公告 2023 年第 12 号，2023–2027 年，查账、核定征收都适用）。
//    实际上很多个体户是定额或核定征收，税负更低；这里按查账征收算，是偏高的估计。
//  · 务农：个人从事种植业、养殖业、饲养业、捕捞业的所得暂不征收个人所得税（财税〔2004〕30 号）。
//  · 养老金免征个人所得税（《个人所得税法》第四条），不经过这里。
import { fpow } from './fmath';
import { PBY } from './data';
import { CITY } from './real.generated';
import { S } from './state';
import { JOBS, RESID_PENSION_JOBS } from './career';
import { NAT_URBAN_INC } from './place';
import { sibsAlive } from './family';
import type { Loc, Partner } from './types';

// ===== 社平工资 =====
// 全国全口径城镇单位就业人员平均工资（非私营和私营按就业人数加权）没有直接公布的全国数；2025 年非私营 129,441 元、私营 71,590 元，
// 按就业人数加权约 9.4 万元（非私营 1.65 亿人，私营单位约 2.6 亿人是推算，见 DATA.md「工资」；这里按各省公布的数定）。各省公布的 2023–2024 年全口径平均工资：广东约 11.0 万、江苏约 9.8 万、重庆约 8.7 万、安徽宣城约 8.5 万。
// 这里取全国 ≈ 城镇居民人均可支配收入 × 1.75（≈ 9.9 万），各省按本省城镇人均可支配收入的 0.7 次方变化（和工资基数同一个弹性，place.ts 的 wageBase），
// 代入上面几个省都在一成以内。缴费基数按省统一（多数省份全省一个上下限）
export const SOC_AVG_K = 1.75;
const socCache: Record<string, number> = {};
export function socAvg(pid: string) {
  let v = socCache[pid];
  if (v == null) { const p = PBY[pid]; v = socCache[pid] = NAT_URBAN_INC * SOC_AVG_K * fpow((p.incU || p.inc) / NAT_URBAN_INC, 0.7); }
  return v;
}

// ===== 五险一金 =====
export const INS_UNIT = { pen: 0.08, med: 0.02, une: 0.005 };   // 单位职工个人部分：养老、医疗、失业
export const INS_FLEX = { pen: 0.2, med: 0.08, base: 0.6 };     // 灵活就业（小老板）：按社平工资的 60% 交职工养老、医保
export const INS_RESID = { med: 400, pen: 300 };                // 城乡居民医保、居民养老，每年（元）
/** 这份工作的社保怎么交：unit 单位代扣职工社保；flex 灵活就业自己交职工社保；resid 只交城乡居民保险；none 没有工资 */
export function insKind(jk: string): 'unit' | 'flex' | 'resid' | 'none' {
  const J = JOBS[jk];
  if (!J || !J.m) return 'none';
  if (jk === 'boss') return 'flex';
  return RESID_PENSION_JOBS.has(jk) ? 'resid' : 'unit';
}
export const unitInsured = (jk: string) => insKind(jk) === 'unit';
// 单位职工的缴费基数：本人工资，不低于社平工资的 60%、不高于 300%。
// 简化：一年工资还不到当地最低工资标准 × 12 的（非全日制、季节性的活，游戏里主要是父母一代工资很低的人），按实际工资算——
// 这样的工作现实中多是按实际工资申报或者干脆不缴；按下限交会扣掉工资的一大半。各省最低工资标准第一档约为社平工资的 25%（如广东 2,500 元/月，估计）
export const MIN_WAGE_K = 0.25;
const unitBase = (gross: number, A: number) => gross < MIN_WAGE_K * A ? gross : Math.min(3 * A, Math.max(0.6 * A, gross));
/** 职工养老保险的缴费基数（一年）：单位职工见 unitBase；灵活就业按 60% 档；其余 0（不交职工养老） */
export function penBase(gross: number, jk: string, pid: string) {
  const k = insKind(jk), A = socAvg(pid);
  return k === 'unit' ? unitBase(gross, A) : k === 'flex' ? INS_FLEX.base * A : 0;
}

// ===== 个人所得税 =====
// [这一档的上限, 税率, 速算扣除数]，年应纳税所得额
export const IIT: [number, number, number][] = [[36000, 0.03, 0], [144000, 0.1, 2520], [300000, 0.2, 16920], [420000, 0.25, 31920], [660000, 0.3, 52920], [960000, 0.35, 85920], [Infinity, 0.45, 181920]];
export const BIZ: [number, number, number][] = [[30000, 0.05, 0], [90000, 0.1, 1500], [300000, 0.2, 10500], [500000, 0.3, 40500], [Infinity, 0.35, 65500]];
export const BASIC_DED = 60000;     // 基本减除费用：每年 6 万（每月 5000）
const BIZ_HALF_CAP = 2e6;           // 个体工商户减半征收：应纳税所得额 200 万以内的部分
function progressive(x: number, T: [number, number, number][]) {
  if (x <= 0) return { tax: 0, rate: 0 };
  for (const [up, r, q] of T) if (x <= up) return { tax: x * r - q, rate: r };
  return { tax: 0, rate: 0 };
}

export interface TaxOpts { jk: string; p: string; hpf?: number; ded?: number }
export interface NetPay { gross: number; base: number; ins: number; hpf: number; ded: number; taxable: number; rate: number; tax: number; net: number; kind: string }
/** 一年的税前收入 gross → 到手。jk 职业，p 参保的省份，hpf 公积金个人缴存比例（0 = 不缴），ded 专项附加扣除（一年合计） */
export function netOf(gross: number, o: TaxOpts): NetPay {
  const kind = insKind(o.jk), ded = o.ded || 0;
  if (!(gross > 0) || kind === 'none') return { gross: Math.max(0, gross || 0), base: 0, ins: 0, hpf: 0, ded: 0, taxable: 0, rate: 0, tax: 0, net: Math.max(0, gross || 0), kind };
  const A = socAvg(o.p);
  let base = 0, ins: number;
  if (kind === 'unit') { base = unitBase(gross, A); ins = base * (INS_UNIT.pen + INS_UNIT.med + INS_UNIT.une); }
  else if (kind === 'flex') { base = INS_FLEX.base * A; ins = base * (INS_FLEX.pen + INS_FLEX.med); }
  else ins = INS_RESID.med + INS_RESID.pen;
  ins = Math.min(ins, gross);
  const hpf = o.hpf ? Math.min(gross, 3 * A) * o.hpf : 0;
  const taxable = Math.max(0, gross - BASIC_DED - ins - hpf - ded);
  let t = { tax: 0, rate: 0 };
  if (o.jk === 'farmer') t = { tax: 0, rate: 0 };
  else if (o.jk === 'shop' || o.jk === 'boss') { const f = progressive(taxable, BIZ); t = { tax: f.tax - progressive(Math.min(taxable, BIZ_HALF_CAP), BIZ).tax * 0.5, rate: f.rate }; }
  else t = progressive(taxable, IIT);
  return { gross, base, ins, hpf, ded, taxable, rate: t.rate, tax: t.tax, net: gross - ins - hpf - t.tax, kind };
}

// ===== 专项附加扣除 =====
export const KID_DED = 24000;                    // 每个孩子每年（婴幼儿照护或子女教育）
export const ELDER_DED = 36000, ELDER_SHARE = 18000; // 赡养老人：独生子女每年 3.6 万；有兄弟姐妹的每人最多 1.8 万
export const LOAN_DED = 12000, LOAN_DED_YEARS = 20;  // 首套住房贷款利息：每年 1.2 万，最长 20 年
const SEP_CITY = new Set(['大连', '青岛', '宁波', '厦门', '深圳']); // 计划单列市
/** 住房租金扣除（一年）：直辖市、省会、计划单列市 1.8 万；大城市 1.32 万；其余 9600 元。在农村住的不扣 */
export function rentDed(L: Loc) {
  if (L.kind === 'rural') return 0;
  if (L.kind === 'big' || L.kind === 'capital' || SEP_CITY.has(L.city) || ['BJ', 'SH', 'TJ', 'CQ'].includes(L.p)) return 18000;
  const c = CITY[L.city];
  return c && c.p === L.p && c.pop >= 500 ? 13200 : 9600;
}
// 还在世、22 岁以前的孩子有几个（孩子按自己的生日长大，k.age）
const kidsUnder = (kids: { age: number; alive: boolean; ex?: number }[]) => { let n = 0; for (const k of kids) if (k.alive && k.age < 22 && !k.ex) n++; return n; }; // 跟着对方的孩子由对方扣
/** 你本人、配偶这个家的住房扣除（一年）：有房贷、买房不满 20 年的扣房贷利息；在工作的城市没有房子、自己租房的扣房租；都没有是 0 */
export function houseDed() {
  if (S.loans && S.loans.length && S.house && S.age - S.house.at < LOAN_DED_YEARS) return LOAN_DED;
  const ownHere = S.house && S.house.city === S.loc.city;
  if (!ownHere && S.flags.oldLive !== 'kid' && S.flags.oldLive !== 'home' && !S.flags.grandHelp) return rentDed(S.loc);
  return 0;
}
/** 专项附加扣除（一年）。mate：算的是配偶（或恋爱对象）时传入对方，算你本人时不传；
 *  kids：孩子算不算这个人的（恋爱对象不算），both：夫妻都有工资（孩子各扣一半）；house：住房这一项是不是由这个人扣（夫妻里工资高的那个）。
 *  rows：传入时把每一项（名称、一年的金额）记进去，界面显示明细用 */
export function dedOf(mate: Partner | null, kids: boolean, both: boolean, house: boolean, rows?: DedRow[]) {
  const f = S.fam;
  let d = 0;
  const n = kids ? kidsUnder(f.kids) : 0;
  if (n) d += add(rows, `子女教育、婴幼儿照护（${n} 个孩子${both ? '，夫妻各扣一半' : ''}）`, n * KID_DED * (both ? 0.5 : 1));
  if (!mate) {
    const sib = sibsAlive().length; // 还在世的兄弟姐妹一起分摊
    if ((f.mom.alive && f.mom.age >= 60) || (f.dad.alive && f.dad.age >= 60)) d += add(rows, sib ? `赡养老人（和兄弟姐妹 ${1 + sib} 人分摊）` : '赡养老人（独生子女）', sib ? Math.min(ELDER_SHARE, ELDER_DED / (1 + sib)) : ELDER_DED);
  } else if (mate.age >= 32 && mate.age < 60) {
    // 对方的父母没有单独模拟：按对方 32–59 岁之间父母满 60 岁、在世（估计），城里长大的按独生子女，农村长大的按有兄弟姐妹
    d += add(rows, '赡养老人（估计）', mate.rural ? ELDER_SHARE : ELDER_DED);
  }
  if (house) { const h = houseDed(); if (h) d += add(rows, h === LOAN_DED && S.loans && S.loans.length ? '住房贷款利息' : '住房租金', h); }
  return d;
}
export type DedRow = [string, number];
const add = (rows: DedRow[] | undefined, k: string, v: number) => { if (rows) rows.push([k, v]); return v; };
/** 父母的专项附加扣除（一年）：孩子（你和兄弟姐妹）22 岁以前每人 2.4 万，父母都有工资时各扣一半；
 *  赡养老人：爷爷奶奶、外公外婆没有单独模拟，按父母 33–59 岁之间（老人比父母大约 27 岁）有满 60 岁的老人在世（估计），城镇按独生子女，农村按有兄弟姐妹；
 *  住房：还房贷的扣房贷利息、租房的扣房租，由爸爸扣（爸爸没有工资时由妈妈扣） */
export function parentDed(p: { age: number }, both: boolean, house: boolean, rows?: DedRow[]) {
  const f = S.fam;
  let n = S.age < 22 ? 1 : 0, d = 0;
  for (const s of f.sibs) if (s.alive && s.age < 22) n++;
  if (n) d += add(rows, `子女教育、婴幼儿照护（${n} 个孩子${both ? '，夫妻各扣一半' : ''}）`, n * KID_DED * (both ? 0.5 : 1));
  if (p.age >= 33 && p.age < 60) d += add(rows, '赡养老人（估计）', S.rural ? ELDER_SHARE : ELDER_DED);
  if (house && S.famHouse) {
    if (S.famHouse.type === 'own' && S.famDebtWhy === '房贷' && S.famDebt > 0) d += add(rows, '住房贷款利息', LOAN_DED);
    else if (S.famHouse.type === 'rent') d += add(rows, '住房租金', rentDed(S.home));
  }
  return d;
}
