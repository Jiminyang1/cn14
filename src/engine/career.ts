// 职业：收入公式、找工作、毕业去向、退休。

import { fexp } from './fmath';
import { PBY } from './data';
import { S } from './state';
import { addDoc, log, logLater, major } from './journal';
import { wan } from './format';
import { chance, clamp, gauss, wpick } from './rng';
import { eff } from './stats';
import { goIndep } from './finance';
import { cityLoc, homeCity, migrantCity, moveTo, placeInc, placeName } from './place';
import { hpfStart } from './housing';
import { tierK } from './education';
import { approachPerMonth, calYear } from './monthly';
import { nowM } from './calendar';

declare module './types' {
  interface Flags { civilAt?: number } // 最近一次考公务员是出生后第几个月（考试一年一次，见 content/decisions.ts 的 civilretry）
  interface Life {
    wageK0?: number; // 刚入这一行时的个人工资系数（学识、学历、运气），升职加薪攒下的部分 = wageK ÷ wageK0
    penP?: string;   // 退休时所在的省（养老金按这个省的水平算，界面「怎么算的」用）
  }
}

// ===== 职业 =====
// m（职业系数）：这一行全国的平均税前年收入 ÷ 工资基数（place.ts 的 wageBase，全国城镇居民人均可支配收入 5.65 万附近，按城市收入的 0.7 次方变化；到手的钱见 tax.ts）。
// 个人系数（学历比这一行一般人 ed 高低、学识、个人差异、比同行多涨的部分）和工龄系数平均下来约为 1，所以这一行的平均就是 m × 工资基数。
// 校准（npm run calib -- money 的「按现实的大城市比例重新加权」：模拟里在六个大城市工作的人约占四成五，现实约 15%，估计）使各职业的平均对上下面的目标，
// 出处见 DATA.md「工资」（国家统计局《2025年城镇单位就业人员年平均工资情况》、《2025年农民工监测调查报告》，research/income.json）：
// · 公司职员：规模以上企业办事人员 94,936 元；销售：社会生产服务和生活服务人员 79,857；工厂工人：私营制造业 76,055（生产制造人员 80,739）；
//   技术工人：约 9.5 万（生产制造人员的 1.2 倍，估计）；工程师：专业技术人员 155,491（制造业 151,997），取 15.2 万；
// · 教师：教育业非私营 133,539；公务员：公共管理 119,465；护士：约 11.5 万、医生：约 18 万（卫生业非私营 146,266 含医生、护士、行政，两者为估计）；
// · 程序员：约 25 万（规模以上 IT 企业专业技术人员 275,504，IT 业私营 128,166；按一半在大城市算，估计）；
// · 进城务工：外出农民工 5,774 元/月 × 12；外卖骑手：约 6,500 元/月（美团公布的高频骑手 6,650–9,344 元，全体骑手低一些，估计）；
//   网约车司机：约 6,000 元/月（中国新就业形态研究中心 2025 年调查 7,623 元，扣掉部分油电和车辆成本，估计）；个体户约 6.5 万、小老板约 15 万（估计）；
// · 务农：当地农村人均可支配收入的 1 倍（估计）。建筑工人：农民工建筑业 5,880 元/月，主要是父母一代。
// ed：这一行一般人的学历（EDU_LV 的下标，估计），学历溢价按比 ed 高还是低算（eduRel）
export const JOBS: Record<string, { n: string; m: number; ed?: number; risk?: number; hl?: number; h?: number; v?: number; blue?: number; priv?: number; stable?: number }> = {
  farmer: { n: '务农', m: 1.0, ed: 2, risk: 0, hl: -1, h: 0, blue: 1 },
  migrant: { n: '进城务工', m: 1.06, ed: 2, risk: 0.04, hl: -2, h: -1, blue: 1 },
  factory: { n: '工厂工人', m: 1.11, ed: 2, risk: 0.04, hl: -2, h: -1, blue: 1 },
  build: { n: '建筑工人', m: 1.1, ed: 2, risk: 0.05, hl: -3, h: -1, blue: 1 },
  rider: { n: '外卖骑手', m: 1.46, ed: 3, risk: 0.02, hl: -3, h: -1, blue: 1 },
  driver: { n: '网约车司机', m: 1.21, ed: 2, risk: 0.02, hl: -2, h: -1, blue: 1 },
  shop: { n: '个体户', m: 1.21, ed: 2, risk: 0.06, hl: -1, h: 0, v: 0.6, blue: 1 },
  skilled: { n: '技术工人', m: 1.59, ed: 4, risk: 0.03, hl: -1, h: 0, blue: 1 },
  sales: { n: '销售', m: 1.19, ed: 4, risk: 0.07, hl: -1, h: -1, v: 0.35, priv: 1 },
  clerk: { n: '公司职员', m: 1.47, ed: 5, risk: 0.05, hl: -1, h: -1, priv: 1 },
  tech: { n: '互联网公司程序员', m: 3.78, ed: 6, risk: 0.08, hl: -3, h: -2, priv: 1 },
  engineer: { n: '工程师', m: 2.62, ed: 6, risk: 0.04, hl: -1, h: 0, priv: 1 },
  teacher: { n: '教师', m: 2.16, ed: 6, risk: 0, hl: 0, h: 1, stable: 1 },
  doctor: { n: '医生', m: 2.6, ed: 6, risk: 0, hl: -2, h: 0, stable: 1 },
  nurse: { n: '护士', m: 1.73, ed: 5, risk: 0, hl: -2, h: 0, stable: 1 },
  civil: { n: '公务员', m: 1.89, ed: 6, risk: 0, hl: 0, h: 1, stable: 1 },
  boss: { n: '小老板', m: 2.5, ed: 4, risk: 0.09, hl: -2, h: 0, v: 0.7 },
  seeking: { n: '待业', m: 0 },
  student: { n: '学生', m: 0 },
  retired: { n: '退休', m: 0 },
  home: { n: '在家', m: 0 },
};
export const isWorking = () => !!(S.job && JOBS[S.job] && JOBS[S.job].m > 0);
// 学历溢价（同一行里）：CGSS 2010–2017 估计 高中/初中 1.20、大专/高中 1.25、本科/大专 1.17；一部分已体现在职业差异里，
// 原来只取约一半（1.06 / 1.12 / 1.2 / 1.28）。工资对齐统计局时调大一些（估计）：麦可思 2025 届毕业半年后本科 6,435 元、高职 4,882 元，
// 前程无忧 2025 年校招起薪 硕士 ÷ 本科约 1.58（大企业校招，偏高），原来的溢价做出来本科 ÷ 大专只有约 1.1
export const EDU_WAGE = [1, 1, 1, 1.08, 1.08, 1.18, 1.32, 1.5];
/** 学历溢价按「比这一行一般人的学历（JOBS 的 ed）高还是低」算：职业系数 m 是这一行的平均，学历和这一行一般人一样的人是 1。
 *  你本人、父母、配偶共用 */
export const eduRel = (edu: number, jk: string) => EDU_WAGE[edu] / EDU_WAGE[(JOBS[jk] && JOBS[jk].ed) ?? 2];
export const TIER_WAGE = { top: 1.1, '211': 1.05 }; // 名校溢价（估计）
export const eduWageK = (jk: string) => eduRel(S.edu, jk) * (TIER_WAGE[S.flags.tier] || 1);
// 学识：入行时 kn 每高 10，工资高约 3%（估计）；KN_MID 是入行时学识的大致平均，这个水平的人是 1
export const KN_MID = 50;
export const knWageK = () => 1 + (S.st.kn - KN_MID) / 330;
/** 均值为 1 的对数正态个人差异：exp(σz − σ²/2) */
export const luckK = (sd: number) => fexp(gauss(0, sd) - sd * sd / 2);
// 工龄曲线（同一行里干了第 y 年的人，相对这一行平均的倍数）。你本人、父母、配偶共用同一条曲线：
// · 起薪 EXP0；前 5 年涨到 EXP5（涨得最快）；之后慢慢涨到第 EXP_PEAK_Y 年的 EXP_PEAK，然后持平，峰值是起薪的 2 倍；
// · 体力活（JOBS 的 blue）起薪高、涨得少：离 1 的距离只有一半（EXP_BLUE），峰值约是起薪的 1.4 倍；
// · 50 岁以后每年 −1%，最多 −15%（体力下降、不再升职、年纪大的转去轻松的岗位）。
// 依据（DATA.md「工资」）：麦可思 2025 届本科毕业半年后月收入 6,435 元，东部本科毕业三年后比半年后高 69%（含这几年的普调，
// 游戏里工资水平不随年份涨，扣掉每年约 4% 的普调后约 +50%）；Fang & Qiu（NBER 29523）：中国横截面收入在 35 岁前后最高，
// 40 年工作经验约使收入涨 150%。体力活的曲线、50 岁以后的下降是估计
export const EXP0 = 0.58, EXP5 = 0.95, EXP_PEAK = 1.16, EXP_PEAK_Y = 15, EXP_BLUE = 0.5;
export const expCurve = (y: number, age: number, jk?: string) => {
  let k = y <= 5 ? EXP0 + (EXP5 - EXP0) * y / 5 : Math.min(EXP_PEAK, EXP5 + (EXP_PEAK - EXP5) * (y - 5) / (EXP_PEAK_Y - 5));
  if (jk && JOBS[jk] && JOBS[jk].blue) k = 1 + (k - 1) * EXP_BLUE;
  return k * (age > 50 ? Math.max(0.85, 1 - 0.01 * (age - 50)) : 1);
};
export const expK = () => expCurve(S.jobY, S.age, S.job);
// 还是同一行（跳槽、换城市、失业后重新找到老本行）：工龄和个人工资系数（升职加薪攒下的）都保留；换了行才从头算。
// 每次 hire 都是进了一家新单位：在本单位的年数 empY 从头算（经济补偿按它算，见 turns.ts 的 severance）
export function hire(job, L?) {
  if (L) moveTo(L);
  const same = job === (S.job === 'seeking' ? S.flags.lastJob : S.job) && JOBS[job] && JOBS[job].m > 0;
  S.job = job; S.empY = 0;
  goIndep();
  if (!same) { S.jobY = 0; S.wageK = S.wageK0 = luckK(WAGE_SD) * knWageK() * eduWageK(job); }
  if (JOBS[job] && (JOBS[job].stable || JOBS[job].priv)) S.flags.empIns = 1;
  hpfStart(job);
  S.jobs.push({ job, age: S.age, city: S.loc.city });
  if (!S.headless && JOBS[job] && JOBS[job].m > 0) addDoc(job === 'civil' ? 'civil' : 'job', job === 'civil' ? '录用通知' : JOBS[job].blue ? '务工登记' : '劳动合同', [['岗位', JOBS[job].n], ['工作地', placeName()], ['起始', `${calYear()}年`]]);
}
// 入行时的个人差异（对数正态的 σ，均值为 1）：同一行、同样学历的人起薪的差距（估计）
export const WAGE_SD = 0.2;
// 升职加薪攒下的部分 g = wageK ÷ wageK0。工龄曲线 expCurve 是同龄同行平均的收入曲线，里面已经含了一般人的升职加薪，
// 所以 g 表示「比同龄同行涨得多还是少」，同行平均约为 1：
// · 每年向 WAGE_G0 回落 WAGE_REV：一直没升职、没跳槽的人，慢慢落到同龄同行平均以下（平均里含了别人的升职）；
//   比别人多涨的部分约 5–6 年减半（别人也会升职，跳槽的人换了单位从头熬）。WAGE_G0 按「22–59 岁在职者 g 的平均约为 1」校准；
// · 涨工资时越接近上限 WAGE_G_MAX 涨得越少，到了上限就不再涨（估计：同一行里收入前 5% 的人约为中位数的 2 倍，
//   入行时的个人差异 σ = 0.2 已经占了约 1.4 倍；原来 1.8，改成 1.6）。
// 原来只往上乘（升职 ×1.15、拼工作 ×1.12、跳槽 ×1.2），50 岁时 wageK 中位数约 1.9、前 10% 超过 3.3；
// 后来改成向 1 回落、上限 1.8，g 的平均仍约 1.16（工资整体偏高的原因之一）
export const WAGE_REV = 0.12, WAGE_G0 = 0.9, WAGE_G_MAX = 1.6;
// 各种涨工资的幅度（raise 的倍数，越接近上限实际涨得越少）。出处见 DATA.md「工资」：
// · hop 被挖去别的公司（content/decisions.ts 的 jobhop）：1.2 → 1.12。同级跳槽涨 6%–15%（Morgan McKinley 2026 年薪酬指南，转引）；
// · promo 升职（content/events.ts）：1.15 → 1.1；work 一年里拼工作（focus.ts）：1.12 → 1.05。没有找到可靠的调查，估计；
// · 每年的普调（2025 年平均约 4%：前程无忧 4.1%、美世 3.8%）不单独算：游戏里的工资水平不随年份涨，工龄曲线已经是扣掉普调以后的
export const RAISE = { promo: 1.1, work: 1.05, hop: 1.12 };
const WAGE_REV_M = approachPerMonth(WAGE_REV);
/** 涨工资（k > 1）或降薪（k < 1）。涨幅随 g 接近上限递减，降薪照实算。返回实际的倍数 */
export function raise(k: number) {
  const k0 = S.wageK0 || S.wageK, g = S.wageK / k0;
  const g2 = k >= 1 ? Math.min(WAGE_G_MAX, g * (1 + (k - 1) * clamp((WAGE_G_MAX - g) / (WAGE_G_MAX - 1), 0, 1))) : g * k;
  const x = g2 / g; S.wageK *= x; return x;
}
/** 每个在岗的月份：多涨（或少涨）的部分向 WAGE_G0 回落一点；超过上限的部分在这里截掉 */
export function wageMonth() {
  const k0 = S.wageK0; if (!k0) return;
  const g = Math.min(WAGE_G_MAX, S.wageK / k0);
  S.wageK = k0 * (g + (WAGE_G0 - g) * WAGE_REV_M);
}
// 18 岁以后还待在农村、却要去城里打工时，换到城市
export function hireInCity(job) { hire(job, S.loc.kind === 'rural' ? migrantCity() : null); }
// 法定退休年龄（2025 年起逐步延迟后的目标值）：男 63；女工人（这里按蓝领职业）55，其他女性 58。你本人、配偶、父母共用。
// 务农没有退休一说，一直种到种不动（约 72 岁，估计）为止。
// 简化：只交城乡居民养老保险的人实际是 60 岁起领取，这里也按上面的年龄算
export const FARM_STOP = 72;
export const retireAgeOf = (sex: string, jk: string) => jk === 'farmer' ? FARM_STOP : sex === 'M' ? 63 : JOBS[jk] && JOBS[jk].blue ? 55 : 58;
export const retireAge = () => retireAgeOf(S.sex, S.job === 'seeking' ? S.flags.lastJob || 'clerk' : S.job);
// 只交城乡居民养老保险的职业（其余领城镇职工养老金）
export const RESID_PENSION_JOBS = new Set(['farmer', 'migrant', 'build', 'rider', 'driver', 'shop', 'home']);
// 城乡居民养老金：2025 年实际人均约 276 元/月（人社部统计公报推算）；城镇职工约 3900 元/月
export const RESID_PENSION = 2950; // 全国城乡居民养老金人均（2024 年统计年鉴 24-27）
export function retire() {
  if (S.job === 'seeking') S.job = S.flags.lastJob || 'clerk'; // 待业到退休：按原来那一行
  const farm = S.job === 'farmer';
  if (!farm) addDoc('retire', '退休证', [['原岗位', JOBS[S.job] ? JOBS[S.job].n : ''], ['退休年龄', S.age + '岁']]);
  const last = S.income || placeInc();
  // 养老金看的是一辈子的缴费记录，不是退休前最后那份工作（finance.ts 的 penMonth 每月记一笔）：
  // 职工养老保险交满 15 年才能按月领职工养老金，否则只能领城乡居民养老金。
  // 职工养老金：按退休所在省份的实际人均水平（统计年鉴 24-26 / 24-27，2024 年），再按在职时的平均工资（相对当地水平）
  // 和缴费年数上下浮动（基础养老金大致和缴费年数成正比）；机关事业单位为主的略高。
  // PEN_YEARS 取 37（模拟里缴费年数中位数 34）：使职工养老金平均约为所在省人均的 1.04 倍，和改动前一样
  const pv = PBY[S.penP = S.loc.p];
  const penE = pv.penE || 45903, penR = pv.penR || RESID_PENSION;
  const P = S.pen || { y: 0, r: 0, s: 0 }; // 一个月都没交过职工养老保险
  const emp = P.y >= PEN_MIN_YEARS;
  S.pension = !emp ? penR + (S.job === 'shop' ? last * 0.1 : 0)
    : penE * clamp(P.r / P.y / 2.5, 0.6, 1.8) * clamp(P.y / PEN_YEARS, 0.45, 1.25) * (P.s * 2 >= P.y ? 1.2 : 1);
  S.job = 'retired'; S.hpfOn = false;
  // 退休时公积金销户提取，余额转进存款（《住房公积金管理条例》第24条：离休、退休的可以提取）。时间线上写在退休那一条后面
  const hpfOut = S.hpf > 0 ? S.hpf : 0;
  if (hpfOut) { S.money += hpfOut; S.hpf = 0; }
  const hpfLog = () => { if (hpfOut >= 100) log(`办了公积金销户提取，账户里的${wan(hpfOut)}转进了存款。`, 'ev'); };
  if (S.house && S.house.city !== S.loc.city) { moveTo(cityLoc(S.house.p, S.house.city)); log(`退休了，不用再待在${S.jobs[S.jobs.length - 1].city}。搬回了自己在${S.house.city}的房子。`, 'ev'); }
  const short = P.y > 0 && !emp ? `职工养老保险只交了${Math.round(P.y)}年，不满15年，领不了职工养老金。` : '';
  if (farm) { major(`年纪大了，地种不动了，交给了亲戚。${short}往后靠每月一点城乡居民养老金和积蓄过日子。`, 'ev'); hpfLog(); return; }
  const avgW = emp ? P.r / P.y * (pv.incU || pv.inc) : 0;
  major(!emp ? `到了退休的年纪。${short || '只交了城乡居民养老保险，'}每月领到的养老金不多，日常还得靠积蓄和孩子。` : `退休了。职工养老保险交了${Math.round(P.y)}年，每月有一份养老金，大约是在职时平均工资的${Math.round(S.pension / avgW * 100)}%。`, 'ev', null,
    '2025年起，法定退休年龄逐步延迟：男性从60岁延到63岁，女性从50/55岁延到55/58岁；职工养老保险最低缴费年限从2030年起由15年逐步提高到20年');
  hpfLog();
}
export const PEN_MIN_YEARS = 15;
export const PEN_YEARS = 37;
// 干得最久的那份工作
export function mainJob(L) {
  let best = null, span = -1;
  L.jobs.forEach((j, i) => {
    const end = L.jobs[i + 1] ? L.jobs[i + 1].age : (L.death ? L.death.age : L.age);
    if (end - j.age > span && JOBS[j.job].m > 0) { span = end - j.age; best = j.job; }
  });
  return best ? JOBS[best].n : '';
}
export function gradJob(big) {
  const m = S.flags.major, lv = S.edu, kn = S.st.kn;
  if (m === '临床医学' && lv >= 6) return 'doctor';
  if (m === '护理' && chance(0.45)) return 'nurse';
  if (m === '师范教育' && chance(0.7)) return 'teacher';
  if (m === '计算机' && chance(big ? 0.6 : 0.3)) return 'tech';
  if ((m === '机械工程' || m === '土木工程') && chance(0.6)) return 'engineer';
  if (big && chance(clamp(tierK() + (kn - 60) / 120, 0.02, 0.6))) return 'tech';
  return wpick({ clerk: 4, sales: 2.5, engineer: lv >= 6 ? 1.5 : 0.5, teacher: lv >= 6 ? 1 : 0.3, factory: lv === 5 ? 1 : 0, rider: 0.3 });
}
// 离开工作（被裁员、公司倒闭、没考上……）：工资按月发，从下个月起没有；公积金账户封存（余额还在，照样计息）
export function quitJob() {
  if (isWorking()) S.flags.lastJob = S.job;
  S.job = 'seeking';
  if (S.hpfOn) { S.hpfOn = false; if (S.hpf > 0) logLater(`公积金账户封存了，余额${wan(S.hpf)}还在，照样计息；找到交公积金的工作后接着缴。`); }
}
export function civilTry() {
  S.flags.civilAt = nowM();
  const p = clamp(0.07 + (S.st.kn - 60) / 120 + (S.edu >= 6 ? 0.05 : 0) + (S.edu >= 7 ? 0.05 : 0) + tierK() * 0.3, 0.03, 0.4);
  if (chance(p)) { hire('civil', homeCity()); S.flags.civilRetry = 0; eff({ h: 6 }); return { t: `考上了！在${S.loc.city}当了公务员。家里人逢人就说。`, k: 'good', f: '2026年度国考过审371.8万人，约98人竞争一个岗位' }; }
  quitJob(); S.flags.civilRetry = 1; eff({ h: -4 }); return { t: '没考上。进面试的名单上没有你的名字。', k: 'bad' };
}
export const gig = () => { hireInCity(chance(0.5) ? 'rider' : 'driver'); return `开始${S.job === 'rider' ? '送外卖' : '跑网约车'}，每天在路上跑十个小时。`; };
