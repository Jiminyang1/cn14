// 职业：收入公式、找工作、毕业去向、退休。

import { fexp } from './fmath';
import { PBY } from './data';
import { S } from './state';
import { addDoc, log, logLater } from './journal';
import { wan } from './format';
import { chance, clamp, gauss, wpick } from './rng';
import { eff } from './stats';
import { goIndep } from './finance';
import { cityLoc, homeCity, migrantCity, moveTo, placeInc, placeName } from './place';
import { hpfStart } from './housing';
import { tierK } from './education';
import { calYear } from './monthly';
import { nowM } from './calendar';

declare module './types' {
  interface Flags { civilAt?: number } // 最近一次考公务员是出生后第几个月（考试一年一次，见 content/decisions.ts 的 civilretry）
}

// ===== 职业 =====
// m = 年收入 ÷ 当地城镇居民人均可支配收入。依据国家统计局 2025 年分行业、分岗位平均工资和农民工监测调查（research/income.json）：
// 全国城镇人均可支配收入 5.65 万；农民工外出 5774 元/月、制造业 5126、建筑业 5880；办事人员 9.5 万；IT 业私营 12.8 万；教育 13.4 万；卫生 14.6 万；公共管理 11.9 万。
export const JOBS = {
  farmer: { n: '务农', m: 1.0, risk: 0, hl: -1, h: 0, blue: 1 },
  migrant: { n: '进城务工', m: 1.25, risk: 0.04, hl: -2, h: -1, blue: 1 },
  factory: { n: '工厂工人', m: 1.1, risk: 0.04, hl: -2, h: -1, blue: 1 },
  build: { n: '建筑工人', m: 1.25, risk: 0.05, hl: -3, h: -1, blue: 1 },
  rider: { n: '外卖骑手', m: 1.35, risk: 0.02, hl: -3, h: -1, blue: 1 },
  driver: { n: '网约车司机', m: 1.3, risk: 0.02, hl: -2, h: -1, blue: 1 },
  shop: { n: '个体户', m: 1.1, risk: 0.06, hl: -1, h: 0, v: 0.6, blue: 1 },
  skilled: { n: '技术工人', m: 1.5, risk: 0.03, hl: -1, h: 0, blue: 1 },
  sales: { n: '销售', m: 1.35, risk: 0.07, hl: -1, h: -1, v: 0.35, priv: 1 },
  clerk: { n: '公司职员', m: 1.5, risk: 0.05, hl: -1, h: -1, priv: 1 },
  tech: { n: '互联网公司程序员', m: 2.6, risk: 0.08, hl: -3, h: -2, priv: 1 },
  engineer: { n: '工程师', m: 2.2, risk: 0.04, hl: -1, h: 0, priv: 1 },
  teacher: { n: '教师', m: 2.1, risk: 0, hl: 0, h: 1, stable: 1 },
  doctor: { n: '医生', m: 2.4, risk: 0, hl: -2, h: 0, stable: 1 },
  nurse: { n: '护士', m: 1.6, risk: 0, hl: -2, h: 0, stable: 1 },
  civil: { n: '公务员', m: 2.0, risk: 0, hl: 0, h: 1, stable: 1 },
  boss: { n: '小老板', m: 2.4, risk: 0.09, hl: -2, h: 0, v: 0.7 },
  seeking: { n: '待业', m: 0 },
  student: { n: '学生', m: 0 },
  retired: { n: '退休', m: 0 },
  home: { n: '在家', m: 0 },
};
export const isWorking = () => !!(S.job && JOBS[S.job] && JOBS[S.job].m > 0);
// 学历溢价：CGSS 2010–2017 估计 高中/初中 1.20、大专/高中 1.25、本科/大专 1.17；一部分已体现在职业差异里，这里只取约一半
export const EDU_WAGE = [1, 1, 1, 1.06, 1.06, 1.12, 1.2, 1.28];
export const eduWageK = () => EDU_WAGE[S.edu] * ({ top: 1.1, '211': 1.05 }[S.flags.tier] || 1);
// 工龄曲线：起薪约为职业平均的 75%，前 5 年涨得快（本科毕业 3 年后月收入约比起薪高 40%，麦可思），
// 10 年后约为平均的 1.1 倍，之后持平，50 岁以后逐年略降（中后段为估计）
// 你本人、父母、配偶共用同一条曲线
export const expCurve = (y: number, age: number) => { const k = y <= 5 ? 0.75 + 0.05 * y : Math.min(1.1, 1 + 0.02 * (y - 5)); return k * (age > 50 ? Math.max(0.8, 1 - 0.01 * (age - 50)) : 1); };
export const expK = () => expCurve(S.jobY, S.age);
// 还是同一行（跳槽、换城市、失业后重新找到老本行）：工龄和个人工资系数（升职加薪攒下的）都保留；换了行才从头算
export function hire(job, L?) {
  if (L) moveTo(L);
  const same = job === (S.job === 'seeking' ? S.flags.lastJob : S.job) && JOBS[job] && JOBS[job].m > 0;
  S.job = job;
  goIndep();
  if (!same) { S.jobY = 0; S.wageK = fexp(gauss(0, 0.2)) * (0.85 + S.st.kn / 330) * eduWageK(); }
  if (JOBS[job] && (JOBS[job].stable || JOBS[job].priv)) S.flags.empIns = 1;
  hpfStart(job);
  S.jobs.push({ job, age: S.age, city: S.loc.city });
  if (!S.headless && JOBS[job] && JOBS[job].m > 0) addDoc(job === 'civil' ? 'civil' : 'job', job === 'civil' ? '录用通知' : JOBS[job].blue ? '务工登记' : '劳动合同', [['岗位', JOBS[job].n], ['工作地', placeName()], ['起始', `${calYear()}年`]]);
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
  const pv = PBY[S.loc.p];
  const penE = pv.penE || 45903, penR = pv.penR || RESID_PENSION;
  const P = S.pen || { y: 0, r: 0, s: 0 }; // 一个月都没交过职工养老保险
  const emp = P.y >= PEN_MIN_YEARS;
  S.pension = !emp ? penR + (S.job === 'shop' ? last * 0.1 : 0)
    : penE * clamp(P.r / P.y / 2.5, 0.6, 1.8) * clamp(P.y / PEN_YEARS, 0.45, 1.25) * (P.s * 2 >= P.y ? 1.2 : 1);
  S.job = 'retired'; S.hpfOn = false;
  if (S.house && S.house.city !== S.loc.city) { moveTo(cityLoc(S.house.p, S.house.city)); log(`退休了，不用再待在${S.jobs[S.jobs.length - 1].city}。搬回了自己在${S.house.city}的房子。`, 'ev'); }
  const short = P.y > 0 && !emp ? `职工养老保险只交了${Math.round(P.y)}年，不满15年，领不了职工养老金。` : '';
  if (farm) { log(`年纪大了，地种不动了，交给了亲戚。${short}往后靠每月一点城乡居民养老金和积蓄过日子。`, 'ev'); return; }
  const avgW = emp ? P.r / P.y * (pv.incU || pv.inc) : 0;
  log(!emp ? `到了退休的年纪。${short || '只交了城乡居民养老保险，'}每月领到的养老金不多，日常还得靠积蓄和孩子。` : `退休了。职工养老保险交了${Math.round(P.y)}年，每月有一份养老金，大约是在职时平均工资的${Math.round(S.pension / avgW * 100)}%。`, 'ev',
    '2025年起，法定退休年龄逐步延迟：男性从60岁延到63岁，女性从50/55岁延到55/58岁；职工养老保险最低缴费年限从2030年起由15年逐步提高到20年');
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
// 离开工作（被裁员、公司倒闭、没考上……）：先结清旧工作这一年干到现在的工资；公积金账户封存（余额还在，照样计息）
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
