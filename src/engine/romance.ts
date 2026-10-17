// 恋爱与婚姻：认识人、在一起、分手、结婚。
// 对象和你本人、父母用同一套「学历 → 职业 → 工资」逻辑生成（parents.ts），只是学历、年龄、家乡和你相关。

import { fexp } from './fmath';
import { EDU_LV, SCHOOL_EDU } from './education';
import { EDU_WAGE, JOBS, isWorking } from './career';
import { HPF_JOB } from './housing';
import { PBY, PROVS } from './data';
import { S } from './state';
import { MONTHS } from './monthly';
import { chance, clamp, gauss, pick, rnd, wpick } from './rng';
import { cityLoc, placeInc } from './place';
import { eff } from './stats';
import { log } from './journal';
import { makeName } from './names';
import { pickParentJob, wageOf } from './parents';
import { rural } from './content/events';
import { wan } from './format';

export const single = () => !S.fam.married && !S.fam.dating && !S.cand;
export const soloK = () => S.flags.solo ? 0 : 1;
export const myEdu = () => Math.max(S.edu || 0, S.school && SCHOOL_EDU[S.school] ? SCHOOL_EDU[S.school] : 0, 2);
export const TRAITS = ['温和', '直爽', '内向', '爱玩', '顾家', '上进', '慢热', '幽默', '细心', '要强'];
export const MEET_HOW = { friends: '朋友聚会上', work: '公司', wedding: '同学婚礼上', hobby: '一个兴趣小组里', app: '社交软件上', school: '学校里', blind: '亲戚介绍' };
// 认识新的人有多频繁（校准系数，使初婚年龄、不婚比例对上 2020 年普查）
export const MEET_K = 1, MUTUAL0 = 0.4, BREAK_K = 1.3, READY0 = 0.6, READY_K = 0.6;
// 单身时每年认识一个「可能发展」的人的概率（按年龄，女性略早；估计，MEET_K 为校准系数）。认识的方式里，年纪越大、相亲越多
export const MEET_P = a => S.sex === 'F'
  ? (a < 18 ? 0 : a < 22 ? 0.55 : a < 26 ? 0.7 : a < 30 ? 0.7 : a < 35 ? 0.55 : a < 45 ? 0.35 : 0.2)
  : (a < 18 ? 0 : a < 22 ? 0.45 : a < 26 ? 0.65 : a < 30 ? 0.7 : a < 35 ? 0.6 : a < 45 ? 0.4 : 0.2);
// 每个人心里「该结婚的年纪」不一样（标准差约 3 岁，估计）；农村出身的一般早一些
export const mShift = () => S.flags.mShift != null ? S.flags.mShift : (S.flags.mShift = gauss(0, 4) - (S.home.kind === 'rural' ? 1.5 : 0));
export function meetHow() {
  if (S.school && S.age < 25 && chance(0.6)) return 'school';
  if (S.age >= 25 && chance(Math.min(0.5, (S.age - 23) * 0.06))) return 'blind';
  return wpick({ friends: 3, work: isWorking() ? 3 : 0, wedding: 1, hobby: 1, app: 2 });
}
// 每年年初：单身的人这一年会不会认识一个人（认识了就排一个「要不要在一起」的抉择）
export function loveQueue() {
  if (S.age < 18 || S.age > 60 || !single() || !soloK()) return;
  const p = MEET_P(S.age) * MEET_K * (S.focus === 'love' ? 1.5 : 1) * (S.flags.loveBoost ? 1.5 : 1);
  if (!chance(Math.min(0.95, p))) return;
  S.cand = makePartner(meetHow());
  S.queue.push({ at: 0.2 + rnd() * 0.6, type: 'dec', id: 'romance' });
  S.queue.sort((a, b) => a.at - b.at);
}
export function partnerEdu() {
  const me = myEdu(), r = rnd();
  let d = r < 0.55 ? 0 : r < 0.9 ? 1 : 2;
  if (d && !chance(S.sex === 'F' ? 0.6 : 0.4)) d = -d;
  return clamp(me + d, 1, 7);
}
export function makePartner(how) {
  const sex = S.sex === 'M' ? 'F' : 'M';
  const nm = makeName(sex, chance(0.9) ? '汉族' : S.eth);
  const age = Math.max(18, Math.round(S.age + (sex === 'M' ? 2 : -2) + gauss(0, 2.8)));
  const home = chance(0.55) ? S.loc.p : chance(0.45) ? S.home.p : wpick(PROVS.map(x => [x.id, x.b]));
  const rural = S.loc.kind === 'rural' ? true : !chance(PBY[home].u / 100) && chance(0.6);
  const edu = how === 'school' ? Math.max(myEdu(), 5) : partnerEdu();
  const p: any = {
    name: nm.full, sur: nm.sur, sex, age, edu, home, rural, alive: true, metAt: S.age, how, city: S.loc.city,
    startAge: edu >= 7 ? 25 : edu >= 6 ? 22 : edu >= 5 ? 21 : edu >= 3 ? 18 : 16,
    k: fexp(gauss(0, 0.35)) * EDU_WAGE[edu], // 个人系数：学历溢价 × 个人差异
    q: clamp(Math.round(3 + (edu - 4.5) * 0.45 + gauss(0, 1.1)), 1, 5), // 对方家境（估计）
    trait: pick(TRAITS),
  };
  partnerJob(p);
  // 合不合得来：学历、年龄差得越多越难（估计）；再加一点说不清的缘分
  p.fit = clamp(0.62 - 0.1 * Math.abs(edu - myEdu()) - 0.03 * Math.abs(age - S.age) + gauss(0, 0.17), 0.05, 0.95);
  return p;
}
// 对方的工作：还在读书的没有工作；其余按学历抽职业（和父母同一张表）
export function partnerJob(p) {
  if (p.age < p.startAge) { p.jk = null; p.job = null; p.inc = 0; p.hpf = false; return; }
  let jk = pickParentJob(p.edu, p.rural && S.loc.kind === 'rural', p.sex === 'F');
  if (jk === 'home' || jk === 'farmer' && S.loc.kind !== 'rural') jk = p.edu >= 5 ? 'clerk' : 'factory';
  p.jk = p.job = jk;
  p.hpf = !!HPF_JOB[jk] && chance(HPF_JOB[jk][0]);
  p.inc = partnerInc(p);
}
export const partnerLoc = p => p.city === S.loc.city ? S.loc : cityLoc(PBY[S.loc.p].cities.includes(p.city) ? S.loc.p : p.home, PBY[S.loc.p].cities.includes(p.city) ? p.city : undefined);
export const partnerInc = p => Math.round(wageOf(p, partnerLoc(p)));
export const ptJobName = p => p.jk ? JOBS[p.jk].n : `${EDU_LV[p.edu]}在读`;
export const loveWord = v => v >= 75 ? '很好' : v >= 58 ? '不错' : v >= 42 ? '一般' : '有点冷淡';
// 对方愿不愿意：合不合得来，加上你的人际、工作和房子（婚恋市场上，男方的房子和收入更被看重，估计）
export function mutualP(p) {
  let x = MUTUAL0 + 0.5 * p.fit + (S.st.so - 55) / 100 + (p.how === 'blind' ? 0.08 : 0);
  const male = S.sex === 'M';
  if (S.house) x += male ? 0.08 : 0.03;
  if (S.income > placeInc() * 1.3) x += male ? 0.06 : 0.03;
  if (S.job === 'seeking') x -= male ? 0.12 : 0.06;
  return clamp(x, 0.05, 0.92);
}
export function partnerRows(p, opts: { love?: boolean } = {}) {
  const r = [['年龄', `${p.age}岁`], ['学历', p.jk ? EDU_LV[p.edu] : `${EDU_LV[p.edu]}在读`], ['职业', p.jk ? JOBS[p.jk].n : '还在读书'], ['年收入', p.inc ? wan(p.inc) + '/年' : '没有收入'],
    ['家乡', `${PBY[p.home].n}${p.rural ? '农村' : '城里'}`], ['家境', '●'.repeat(p.q) + '○'.repeat(5 - p.q)], ['性格', p.trait]];
  if (opts.love) r.push(['在一起', `${S.age - p.metAt}年`], ['感情', loveWord(p.love)]);
  return r;
}
// 恋爱中的每一年：感情向一个目标值靠拢（合不合得来、这一年花多少时间、是不是异地），感情差了就可能分手
export function loveYear() {
  const d = S.fam.dating; if (!d) return;
  d.age++;
  if (!d.jk && d.age >= d.startAge) { partnerJob(d); log(`${d.name}毕业了，成了一名${ptJobName(d)}。`, 'ev'); }
  else if (d.jk) d.inc = partnerInc(d);
  const ldr = d.city !== S.loc.city;
  const T = 48 + 32 * d.fit + (S.focus === 'love' ? 8 : 0) + (S.focus === 'work' ? -4 : 0) + (ldr ? -12 : 0) + (S.st.h - 55) * 0.2;
  d.love = clamp(d.love + (T - d.love) * 0.35 + gauss(0, 7), 0, 100);
  const yrs = S.age - d.metAt;
  if (yrs >= 1 && !d.metParents && chance(0.5)) {
    d.metParents = 1;
    log(S.sex === 'M' ? `第一次去${d.name}家见家长，提了两大袋礼物。${d.q >= 4 ? '对方爸妈话不多，问了问你的工作和房子。' : '对方爸妈留你吃了顿饭，一直往你碗里夹菜。'}` : `${d.name}第一次来家里见你爸妈。${S.q <= 2 ? '妈妈私下问你：“他家里条件怎么样？”' : '爸妈挺满意，说小伙子看着踏实。'}`, 'ev');
  }
  // 分手的可能：感情越差越容易分；刚在一起的头两年、年纪轻的时候更容易分（BREAK_K 为校准系数）
  const pBreak = ((d.love < 30 ? 0.45 : d.love < 45 ? 0.22 : 0.06) + (yrs <= 2 ? 0.05 : 0) + (S.age < 24 ? 0.08 : 0)) * BREAK_K + (ldr ? 0.08 : 0) + (d.asks >= 2 ? 0.1 : 0);
  if (chance(pBreak)) {
    S.fam.dating = null; S.flags.exes = (S.flags.exes || 0) + 1;
    eff({ h: d.love > 55 ? -8 : -4 });
    const why = ldr ? '异地太久，联系越来越少，' : d.asks >= 2 ? '对方等不到你的答复，' : d.love < 35 ? '吵得越来越多，' : pick(['两家对彩礼和房子谈不拢，', '对未来的打算不一样，', '慢慢觉得不合适，']);
    log(`${why}你和${d.name}分手了。在一起${yrs ? yrs + '年' : '不到一年'}。`, 'bad');
  }
}
// 你搬去别的城市时，恋人要么跟着去，要么开始异地
export function loveMove() {
  const d = S.fam.dating; if (!d || d.city === S.loc.city) return;
  if (chance(0.35 + d.love / 250)) { d.city = S.loc.city; if (d.jk) { partnerJob(d); } log(`${d.name}辞了工作，跟你一起去了${S.loc.city}。`, 'ev'); }
  else log(`你去了${S.loc.city}，${d.name}留在${d.city}。你们开始异地恋。`, 'ev');
}
// 彩礼：各省调查/报道的区间（见 DATA.md，可信度多为中低）；没有数据的省份用农村调查均值 3.86 万
export const brideAmt = pid => { const b = PBY[pid].bride; return b ? Math.round((b[0] + (b[1] - b[0]) * rnd()) / 1e3) * 1e3 : 38600; };

// ===== 每个月月底 =====
/** 恋爱中的感情变化、分手。兼容模式：一年一次，在第 12 个月 */
export function loveMonth(m: number) {
  if (m === MONTHS - 1) loveYear();
}
