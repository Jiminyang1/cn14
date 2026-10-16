// 职业：收入公式、找工作、毕业去向、退休。

import { fexp } from './fmath';
import { PBY } from './data';
import { S } from './state';
import { addDoc, log } from './journal';
import { chance, clamp, gauss, wpick } from './rng';
import { eff } from './stats';
import { goIndep } from './finance';
import { homeCity, migrantCity, moveTo, placeInc, placeName } from './place';
import { hpfStart } from './housing';
import { tierK } from './education';

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
export function hire(job, L?) {
  if (L) moveTo(L);
  S.job = job; S.jobY = 0;
  goIndep();
  S.wageK = fexp(gauss(0, 0.2)) * (0.85 + S.st.kn / 330) * eduWageK();
  if (JOBS[job] && (JOBS[job].stable || JOBS[job].priv)) S.flags.empIns = 1;
  hpfStart(job);
  S.jobs.push({ job, age: S.age, city: S.loc.city });
  if (!S.headless && JOBS[job] && JOBS[job].m > 0) addDoc(job === 'civil' ? 'civil' : 'job', job === 'civil' ? '录用通知' : JOBS[job].blue ? '务工登记' : '劳动合同', [['岗位', JOBS[job].n], ['工作地', placeName()], ['起始', `${S.birthYear + S.age}年`]]);
}
// 18 岁以后还待在农村、却要去城里打工时，换到城市
export function hireInCity(job) { hire(job, S.loc.kind === 'rural' ? migrantCity() : null); }
// 法定退休年龄（2025 年起逐步延迟后的目标值）：男 63；女工人（这里按蓝领职业）55，其他女性 58。你本人、配偶、父母共用。
// 简化：只交城乡居民养老保险的人实际是 60 岁起领取，这里也按上面的年龄算
export const retireAgeOf = (sex: string, jk: string) => sex === 'M' ? 63 : JOBS[jk] && JOBS[jk].blue ? 55 : 58;
export const retireAge = () => retireAgeOf(S.sex, S.job);
// 只交城乡居民养老保险的职业（其余领城镇职工养老金）
export const RESID_PENSION_JOBS = new Set(['farmer', 'migrant', 'build', 'rider', 'driver', 'shop', 'home']);
// 城乡居民养老金：2025 年实际人均约 276 元/月（人社部统计公报推算）；城镇职工约 3900 元/月
export const RESID_PENSION = 2950; // 全国城乡居民养老金人均（2024 年统计年鉴 24-27）
export function retire() {
  addDoc('retire', '退休证', [['原岗位', JOBS[S.job] ? JOBS[S.job].n : ''], ['退休年龄', S.age + '岁']]);
  const resid = RESID_PENSION_JOBS.has(S.job);
  const last = S.income || placeInc();
  // 养老金：按退休所在省份的实际人均水平（统计年鉴 24-26 / 24-27，2024 年）。
  // 职工养老金再按本人工资相对当地水平上下浮动；机关事业单位略高。
  const pv = PBY[S.loc.p];
  const penE = pv.penE || 45903, penR = pv.penR || RESID_PENSION;
  S.pension = resid ? penR + (S.job === 'shop' ? last * 0.1 : 0)
    : penE * clamp(last / ((pv.incU || pv.inc) * 2.5), 0.6, 1.8) * (JOBS[S.job].stable ? 1.2 : 1);
  S.job = 'retired';
  log(resid ? '到了退休的年纪。只交了城乡居民养老保险，每月领到的养老金不多，日常还得靠积蓄和孩子。' : `退休了，每月有一份养老金，大约是原来工资的${Math.round(S.pension / last * 100)}%。`, 'ev',
    '2025年起，法定退休年龄逐步延迟：男性从60岁延到63岁，女性从50/55岁延到55/58岁');
}
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
export function civilTry() {
  const p = clamp(0.07 + (S.st.kn - 60) / 120 + (S.edu >= 6 ? 0.05 : 0) + (S.edu >= 7 ? 0.05 : 0) + tierK() * 0.3, 0.03, 0.4);
  if (chance(p)) { hire('civil', homeCity()); S.flags.civilRetry = 0; eff({ h: 6 }); return { t: `考上了！在${S.loc.city}当了公务员。家里人逢人就说。`, k: 'good', f: '2026年度国考过审371.8万人，约98人竞争一个岗位' }; }
  S.job = 'seeking'; S.flags.civilRetry = 1; eff({ h: -4 }); return { t: '没考上。进面试的名单上没有你的名字。', k: 'bad' };
}
export const gig = () => { hireInCity(chance(0.5) ? 'rider' : 'driver'); return `开始${S.job === 'rider' ? '送外卖' : '跑网约车'}，每天在路上跑十个小时。`; };
