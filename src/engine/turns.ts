// 工作和晚年的两个关口：裁员名单、退休以后。
// 抉择本身（标题、选项）在 content/decisions.ts 的 layofflist / retireplan，这里是规则和之后每年、每月的后续。
// 出处见 DATA.md「裁员」「退休以后」。
import { S } from './state';
import { log } from './journal';
import { chance, clamp, gauss, pick, ri } from './rng';
import { eff } from './stats';
import { JOBS, hire, quitJob, raise } from './career';
import { wageRate } from './finance';
import { moveTo, placeInc } from './place';
import { MONTHS, calMonth } from './monthly';

// ===== 裁员名单 =====
// 私企岗位（销售、职员、程序员、工程师）的裁员，不再是突然落下的随机事件，而是先听说“名单上可能有你”，再决定怎么应对。
// 每年听到风声的概率 = 职业风险 × LIST_K（估计）：校准到和原来的随机事件“公司裁员”差不多的被裁频率（私企在岗每年约 5%）。
// 听到风声的年份约占一成，其中大约一半最后真的被裁
export const LIST_K = 2.5;
export const listDue = () => !!(JOBS[S.job] && JOBS[S.job].priv) && S.age >= 24 && S.age <= 58 && chance(JOBS[S.job].risk * LIST_K);
// 各种应对之后能留下的概率（估计）
export const KEEP = {
  stay: 0.5,                                                        // 拼命加班表现
  connect: () => clamp(0.25 + (S.st.so - 50) / 80, 0.1, 0.7),       // 托关系，看人际
  next: () => clamp(0.35 + (S.st.kn - 55) / 100 + (S.age < 35 ? 0.15 : -0.1), 0.1, 0.75), // 先找好下家，看学识和年纪
  nextStay: 0.4,                                                    // 下家没找到，又没被裁的概率
};
// 当地职工月平均工资 ≈ 城镇居民人均可支配收入 × 1.8 ÷ 12（估计；2024 年城镇非私营单位平均工资约为人均可支配收入的 2.3 倍，私营单位约 1.3 倍）
const AVG_WAGE_K = 1.8;
/** N+1：《劳动合同法》第47条，按在本单位工作的年限，每满一年一个月工资，六个月以上不满一年按一年，不满六个月按半个月；
 *  月工资超过当地职工月平均工资 3 倍的按 3 倍算、最多 12 年。第40条：没有提前 30 天通知的，再额外付一个月工资（“+1”）。
 *  N 按在这家单位的年数（empY），不是干这一行的年数（jobY）：原来按 jobY，被裁后又找到老本行的，前一家单位的年数已经补偿过，下次被裁又算一遍
 *  （一局 58 岁的公司职员按 33 年拿了 71 万，实际在第二家单位只干了 15 年，应约 34 万） */
const sevYears = (y = S.empY || 0) => Math.max(0.5, Math.floor(y) + (y % 1 >= 0.5 ? 1 : y % 1 > 0 ? 0.5 : 0));
export function severance() {
  const monthly = (wageRate() || S.income || placeInc()) / 12, cap = placeInc() * AVG_WAGE_K / 12 * 3;
  const m = Math.min(monthly, cap), n = monthly > cap ? Math.min(12, sevYears()) : sevYears();
  return Math.round((n * m + monthly) / 100) * 100;
}
export function layOff() {
  const n = severance();
  quitJob(); // 工资发到离职那天，公积金封存（career.ts）
  eff({ money: n });
  return n;
}
/** 找到了下家：同一行（工龄、个人系数都保留），工资大多略涨：平均 +5%，有涨有降（估计；被裁前匆忙找的下家，比主动跳槽涨得少）。
 *  涨工资统一走 raise（career.ts）：已经比同行多涨很多的，越往上越难涨 */
export function jumpShip() {
  hire(S.job);
  raise(clamp(1 + gauss(0.05, 0.08), 0.85, 1.3));
}

// ===== 退休以后 =====
// 刚退休那一年，选一种过法。返聘和候鸟会持续几年：每年生日在 turnsYear 里判定还继续不继续，钱每月在 turnsMonth 里结算
export const lastJob = () => { const j = S.jobs[S.jobs.length - 1]; return j ? j.job : null; };
const REHIRE: Record<string, string> = {
  teacher: '被学校返聘，继续带两个班', doctor: '被医院返聘，每周坐诊三天', nurse: '去社区诊所帮忙，量血压、打针',
  engineer: '被原单位返聘做技术顾问', tech: '接一些外包的活，在家写代码', civil: '去社区帮忙，每月有一点补贴',
};
export function rehireText() {
  const j = lastJob();
  return REHIRE[j] || pick(['在小区当保安，上一天休一天', '去超市理货，每天站六个小时', '在亲戚的店里帮忙看店', '去附近的工地看大门']);
}
export function startRehire() {
  const j = lastJob(), k = j && JOBS[j] && !JOBS[j].blue && j !== 'shop' ? 0.45 : 0.3;          // 返聘一般拿原来工资的三到五成（估计）
  S.flags.rehire = { until: S.age + ri(3, 6), inc: Math.round(placeInc() * (JOBS[j] ? JOBS[j].m : 1) * k / 1e2) * 1e2 };
}
export const SNOWBIRD = { years: [5, 10] as [number, number], cost: 0.3 };    // 每年冬天去南方住几个月：房租和路费约当地人均收入的三成（估计）
export function startSnowbird() { S.flags.snowbird = S.age + ri(...SNOWBIRD.years); }
export function goHomeOld() { moveTo(S.home); }

// 生日那个月：这一年还接着返聘、还去不去南方过冬（年度判定，身体和心情的影响也按年记）。钱按月在 turnsMonth 里结算
export function turnsYear() {
  const a = S.age, F = S.flags;
  if (F.rehire) {
    if (a < F.rehire.until && S.st.hl > 30) eff({ hl: -0.5 });
    else { log(`不再上班了。${a >= F.rehire.until ? '单位那边说，年纪到了，该歇歇了。' : '身体吃不消，辞了。'}`); F.rehire = null; }
  }
  if (F.snowbird) {
    if (a < F.snowbird && S.st.hl > 35 && S.money > 0) eff({ h: 1, hl: 0.5 });
    else { log('年纪大了，跑不动了，不再去南方过冬。'); F.snowbird = null; }
  }
}
// 候鸟在南方住的月份（公历 11 月到第二年 2 月），一年的开销摊在这几个月里
const WINTER = [11, 12, 1, 2];
// 每个月月底（finance.ts 的 moneyMonth 调用）：返聘的工资每月发 1/12（从选了返聘的下个月起，不再等到下一个生日）；候鸟的房租、路费在冬天的几个月里付。
// 和原来一样直接进出存款，不算进储蓄率模型的收入
export function turnsMonth(m: number) {
  const F = S.flags;
  if (F.rehire) S.money += F.rehire.inc / MONTHS;
  if (F.snowbird && WINTER.includes(calMonth(m))) S.money -= placeInc() * SNOWBIRD.cost / WINTER.length;
}
