// 日程用的时间工具：从出生算起的第几个月（按月的间隔用），以及学校的日历。
import { S } from './state';
import { MONTHS } from './monthly';

/** 从出生算起的第几个月：S.age 岁的第 S.month 个月 */
export const nowM = () => S.age * MONTHS + S.month;

// ===== 学校的日历 =====
// 9 月开学，6 月中考、高考，6–7 月毕业。S.schoolEnd 记的是「毕业那一年的公历年份」（6 月考试或毕业），
// 不再是年龄：比如 2041 年 9 月上初中，S.schoolEnd = 2044，2044 年 6 月中考。
// 入学年龄按 8 月 31 日划线：9 月 1 日前满 6 岁的，当年 9 月上小学；9–12 月出生的，晚一年（入学时 6 岁多、快 7 岁）。
// 简化：不考虑各地的提前、推迟入学；幼儿园同样按这条线，满 3 岁那年的 9 月入园。
export const SCHOOL_AGE = 6;
export const entryYear = () => S.birthYear + SCHOOL_AGE + (S.birthMonth >= 9 ? 1 : 0);
/** 旧存档里 schoolEnd 是年龄：换成那个年龄年里 6 月所在的公历年份 */
export const juneYearOfAge = (a: number) => S.birthYear + a + (S.birthMonth > 6 ? 1 : 0);
export function fixSchoolEnd() {
  if (S.schoolEnd != null && S.schoolEnd < 1000) S.schoolEnd = juneYearOfAge(S.schoolEnd);
}
