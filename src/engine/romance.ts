// 恋爱与婚姻：认识人、在一起、分手、结婚。
// 对象和你本人、父母用同一套「学历 → 职业 → 工资」逻辑生成（parents.ts），只是学历、年龄、家乡和你相关。

import { EDU_LV, SCHOOL_EDU } from './education';
import { JOBS, RESID_PENSION_JOBS, isWorking, luckK } from './career';
import { HPF_JOB } from './housing';
import { PBY, PROVS } from './data';
import { S } from './state';
import { MONTHS, approachPerMonth, perMonth, posIn, sdPerMonth } from './monthly';
import { chance, clamp, gauss, pick, rnd, wpick } from './rng';
import { cityLoc, placeInc } from './place';
import { eff } from './stats';
import { log } from './journal';
import { makeName } from './names';
import { pickParentJob, wageOf } from './parents';
import { rural } from './content/events';
import { wan, wanM } from './format';
import { partnerPay } from './finance';
import { PERS, partnerPz, partnerTrait, pz, tiltW } from './personality';
import type { PZ } from './types';
import { loveNow, slotW } from './focus';
import { nowM } from './calendar';
import { liquidBalance } from './accounts';

declare module './types' {
  interface Flags { noLove?: number } // 说了「现在不想谈恋爱」：到出生后第几个月（nowM）以前不再认识新的人（抉择 romance 的 later）
}

export const single = () => !S.fam.married && !S.fam.dating && !S.cand;
export const myEdu = () => Math.max(S.edu || 0, S.school && SCHOOL_EDU[S.school] ? SCHOOL_EDU[S.school] : 0, 2);
export const TRAITS = ['温和', '直爽', '内向', '爱玩', '顾家', '上进', '慢热', '幽默', '细心', '要强'];
export const MEET_HOW = { friends: '朋友聚会上', work: '公司', wedding: '同学婚礼上', hobby: '一个兴趣小组里', app: '社交软件上', school: '学校里', blind: '亲戚介绍', reunion: '同学聚会上' };
// 遇见的人：一两年一个，每个都问你（原来单身的人每个月都可能冒出一个，一年认识一个半人，一个都记不住，
// 还要靠自动抉择替玩家挡掉大半，结果替玩家「主动追求」了一个 Ta 从没见过的人）。
// MEET_K、MEET_KF、BREAK_K 是校准系数：无界面的人生 32 岁未婚、初婚年龄大致不离谱就行。
// 遇见的人少了以后分手也调轻了（BREAK_K 1.3 → 0.7），不然一辈子单身的太多：32 岁未婚 男 25.9% / 女 10.0%，初婚 28.1 / 25.7
export const MEET_K = 1.6, MEET_KF = 0.95, MUTUAL0 = 0.4, READY0 = 0.6, READY_K = 0.8;
// 单身时一年里遇见一个人的可能（按年龄，估计）：大学、刚工作、家里催的那几年最多
export const MEET_P = a => a < 18 ? 0 : a < 22 ? 0.5 : a < 27 ? 0.6 : a < 34 ? 0.7 : a < 45 ? 0.45 : 0.2;
// 上一个人以后（认识、分手、离婚、丧偶）至少隔这么多个月才遇见下一个；时间放在恋爱上的短一些
export const MEET_GAP = 10, MEET_GAP_LOVE = 5;
// 每个人心里「该结婚的年纪」不一样（标准差约 3 岁，估计）；农村出身的一般早一些
export const mShift = () => S.flags.mShift != null ? S.flags.mShift : (S.flags.mShift = gauss(0, 4) - (S.home.kind === 'rural' ? 1.5 : 0));
// 编制：公务员、教师、医生、护士（职业表里的 stable）。相亲市场上最吃香的一条
export const bianzhi = (jk: string | null | undefined) => !!(jk && JOBS[jk] && JOBS[jk].stable);
// 你拿得出手的条件：有编制、有房（介绍人会主动上门）
const myCondOK = () => S.age >= 25 && (bianzhi(S.job) || !!S.house);
// 说了「想找个人」（抉择 single）的两年里，家里和朋友多介绍
const looking = () => S.flags.look != null && nowM() < S.flags.look;
// 怎么认识的：读书时多在学校；二十六七以后相亲越来越多，有编制、有房的更多
export function meetHow() {
  if (S.school && S.age < 25 && chance(0.7)) return 'school';
  if (S.age >= 26 && chance(Math.min(0.8, (S.age - 24) * 0.1 + (myCondOK() ? 0.15 : 0) + (looking() ? 0.3 : 0)))) return 'blind';
  return wpick({ friends: 3, work: isWorking() ? 3 : 0, wedding: S.age >= 24 ? 1.5 : 0.3, hobby: 1, app: 2 });
}
// 单身的人这个月会不会遇见一个人：MEET_P 是一年的，换算成每月。外向的人遇见的多一些（每个标准差约 ×1.28）。
// 「恋爱」每占一格，机会多 LOVE_FOCUS_K 倍那么多（一格 ×1.8，两格都放 ×2.3）；「朋友」每格 ×1.2（朋友多了，介绍的人也多）；
// 有编制、有房的 ×1.25（介绍人主动上门）
export const LOVE_FOCUS_K = 0.8, FRIEND_MEET_K = 0.2;
const MEET_T = { e: 0.25 };
declare module './types' {
  interface Flags { lastMeet?: number; coupled?: number; look?: number; noWed?: number; soloAt?: number } // look：说了想找个人，到哪个月为止多介绍；noWed：不打算结婚了；soloAt：几岁时决定的 // 上一个人是出生后第几个月遇见的（或者那段感情是哪个月结束的）；上个月还有没有对象
}
function meetMonth(m: number) {
  if (S.age < 18 || S.age > 60 || !single()) return;
  const love = loveNow();
  // 说过「现在不想谈恋爱」的，这段时间里不再认识新的人；改回「恋爱」重心就是又想谈了
  if (S.flags.noLove != null) { if (love || nowM() >= S.flags.noLove) S.flags.noLove = undefined; else return; }
  // 不打算结婚的不再遇见人；改回「恋爱」重心就是又想谈了
  if (S.flags.noWed) { if (love) S.flags.noWed = undefined; else return; }
  if (S.flags.lastMeet != null && nowM() - S.flags.lastMeet < (love ? MEET_GAP_LOVE : MEET_GAP)) return;
  const p = MEET_P(S.age) * MEET_K * (S.sex === 'F' ? MEET_KF : 1) * (1 + LOVE_FOCUS_K * slotW('love') + FRIEND_MEET_K * slotW('friends')) * (myCondOK() ? 1.25 : 1) * (looking() ? 1.6 : 1) * tiltW(MEET_T);
  if (!chance(perMonth(Math.min(0.95, p)))) return;
  S.flags.lastMeet = nowM();
  const how = meetHow();
  if (how === 'blind') blindPair(); else S.cand = makePartner(how);
  queueRomance(m);
}
// 认识了，就在下个月排一个「要不要在一起」的抉择（队列按时间排序）。
// 第 12 个月认识的排在 posIn(12, …)，也就是 at > 1：新一年开始时 planYearSchedule 会把 at > 1 的条目挪到下一年的第 0 个月（at − 1）。
// 这个位置不能正好是 1（那会被当成这一年已经过去的事丢掉），所以月内的位置至少取 0.01
function queueRomance(m: number) {
  const f = rnd();
  const e = { at: posIn(m + 1, m >= MONTHS - 1 ? Math.max(0.01, f) : f), type: 'dec' as const, id: 'romance' };
  let i = S.queue.length; while (i > 0 && S.queue[i - 1].at > e.at) i--;
  S.queue.splice(i, 0, e);
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
  let age = Math.max(18, Math.round(S.age + (sex === 'M' ? 2 : -2) + gauss(0, 2.8)));
  if (how === 'school') age = Math.min(age, S.age + 1); // 学校里认识的也还在读书
  const home = chance(0.55) ? S.loc.p : chance(0.45) ? S.home.p : wpick(PROVS.map(x => [x.id, x.b]));
  const rural = S.loc.kind === 'rural' ? true : !chance(PBY[home].u / 100) && chance(0.6);
  const edu = how === 'school' ? Math.max(myEdu(), 5) : partnerEdu();
  const p: any = {
    name: nm.full, sur: nm.sur, sex, age, edu, home, rural, alive: true, metAt: S.age, how, city: S.loc.city,
    startAge: edu >= 7 ? 25 : edu >= 6 ? 22 : edu >= 5 ? 21 : edu >= 3 ? 18 : 16,
    k: luckK(PARTNER_SD), // 个人差异（均值为 1）；学历溢价按对方做的那一行算（parents.ts 的 personK）
    q: clamp(Math.round(3 + (edu - 4.5) * 0.45 + gauss(0, 1.1)), 1, 5), // 对方家境（估计）
    trait: PERS.on && S.pers ? '' : pick(TRAITS), // 有性格时由对方的性格派生（partnerTrait），下面那一次 rnd() 代替这里的 pick
  };
  if (!p.trait) p.pz = partnerPz(rnd());
  partnerJob(p);
  // 是不是独生子女（城里的多，估计）；工作了几年的，家境越好越可能已经有自己的房（估计）
  p.only = chance(p.rural ? 0.25 : 0.55);
  p.house = !!p.jk && p.age >= 24 && chance(clamp(0.05 + 0.1 * (p.q - 1) + 0.03 * (p.age - 24), 0.05, 0.8));
  // 合不合得来：学历、年龄差得越多越难；两个人里敏感的越多越容易磕碰，随和的跟谁都处得来（估计）；再加一点说不清的缘分
  p.fit = clamp(0.62 - 0.1 * Math.abs(edu - myEdu()) - 0.03 * Math.abs(age - S.age) + persFit(p) + gauss(0, 0.17), 0.05, 0.95);
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
// 对方所在的城市属于哪个省（找不到就算在对方老家的省会）。确定的，不消耗随机数：界面上也会调用
const PROV_OF = new Map<string, string>();
for (const x of PROVS) for (const c of x.cities) if (!PROV_OF.has(c)) PROV_OF.set(c, x.id);
export const partnerLoc = p => {
  if (p.city === S.loc.city) return S.loc;
  const pid = PBY[S.loc.p].cities.includes(p.city) ? S.loc.p : PROV_OF.get(p.city);
  return pid ? cityLoc(pid, p.city) : cityLoc(p.home, PBY[p.home].cities[0]);
};
// 对方的个人差异（对数正态的 σ，均值为 1；估计）
export const PARTNER_SD = 0.35;
export const partnerInc = p => Math.round(wageOf(p, partnerLoc(p))); // 税前；到手见 finance.ts 的 partnerPay
export const ptJobName = p => p.jk ? JOBS[p.jk].n : `${EDU_LV[p.edu]}在读`;
export const loveWord = v => v >= 75 ? '很好' : v >= 58 ? '不错' : v >= 42 ? '一般' : '有点冷淡';
// 「收入高」：税前年收入超过当地人均可支配收入的 RICH_K 倍。原来是 1.3 倍（24–34 岁未婚在职男性约 68% 满足）；
// 工资对齐统计局以后同样 1.3 倍只有 44%，改成 1.0 倍（69%），保持原来的比例
export const RICH_K = 1.0;
// 对方愿不愿意 = Ta 本人（selfP）+ Ta 家里（famPts，见下面的条件表）。抉择单上只写合起来的可能（约几成）
// Ta 本人：合不合得来（含两个人的性格），加上你会不会来事（人际、外向）
export const persFit = p => -0.05 * (pz('n') + ptz(p, 'n')) + 0.04 * (pz('a') + ptz(p, 'a'));
export const selfP = p => MUTUAL0 + 0.5 * p.fit + (S.st.so - 55) / 100 + 0.04 * pz('e') + (p.how === 'blind' ? 0.05 : 0);
// Ta 家里每一分（famPts）约 6 个百分点（估计）
const FAM_K = 0.06;
export const mutualP = p => clamp(selfP(p) + FAM_K * clamp(famPts(p), -3, 3), 0.05, 0.92);
export function partnerRows(p, opts: { love?: boolean } = {}): [string, string][] {
  const r: [string, string][] = [['年龄', `${p.age}岁`], ['学历', p.jk ? EDU_LV[p.edu] : `${EDU_LV[p.edu]}在读`], ['职业', p.jk ? JOBS[p.jk].n + (bianzhi(p.jk) ? '（有编制）' : '') : '还在读书'],
    ['月收入', p.inc ? (p.jk && !p.retired ? `到手${wanM(partnerPay(p).net)}` : wanM(p.inc)) : '没有收入']];
  if (p.jk && p.house != null) r.push(['房子', p.house ? '有自己的房' : '还没有']);
  r.push(['家乡', `${PBY[p.home].n}${p.rural ? '农村' : '城里'}`], ['家境', '●'.repeat(p.q) + '○'.repeat(5 - p.q)]);
  if (p.only != null) r.push(['家里', p.only ? '独生子女' : '有兄弟姐妹']);
  r.push(['性格', partnerTrait(p)]);
  if (opts.love) r.push(['在一起', `${S.age - p.metAt}年`], ['感情', loveWord(p.love)]);
  return r;
}
/** 相亲时两个人并排比：每项压成一行，表短一些 */
export function partnerBrief(p): [string, string][] {
  return [['年龄', `${p.age}岁 · ${EDU_LV[p.edu]}`], ['工作', p.jk ? JOBS[p.jk].n + (bianzhi(p.jk) ? '（有编制）' : '') : '还在读书'],
    ['月收入', p.jk && p.inc ? `到手${wanM(partnerPay(p).net)}` : '没有收入'],
    ['家里', `${PBY[p.home].n}${p.rural ? '农村' : '城里'} · ${p.only ? '独生子女' : '有兄弟姐妹'}`],
    ['家境', '●'.repeat(p.q) + '○'.repeat(5 - p.q) + (p.jk ? (p.house ? ' · 有房' : ' · 没房') : '')], ['性格', partnerTrait(p)]];
}
export const feelWord = p => p.fit >= 0.7 ? '聊得很投缘' : p.fit >= 0.5 ? '感觉还可以' : '好像不太聊得来';

// ===== 两家的看法 =====
// 中国人谈对象，看的不只是两个人。两家用同一张条件表互相看：工作（编制、有没有工作）、房子、收入、家境、城乡、是不是外地的、
// 兄弟姐妹、爸妈以后要不要养、年龄差。对方家里看你（theirWhys）、你家里看对方（myWhys）都是这张表，只是说法不同。
// 每一条一个分数：总分 ≥ 1 是满意、≤ −1 是不太满意（见家长时用）；对方家里的总分也算进 Ta 愿不愿意（mutualP）。
// 确定的，不消耗随机数（界面上也会算）。二十二岁以前、还在读书的，家里还不过问
type Prof = { male: boolean; age: number; bz: boolean; noJob: boolean; house: boolean; rich: boolean; q: number; rural: boolean; home: string; only: boolean; burden: string };
const meProf = (): Prof => {
  const par = [S.fam.mom, S.fam.dad].filter(x => x.alive);
  return { male: S.sex === 'M', age: S.age, bz: bianzhi(S.job), noJob: S.job === 'seeking', house: !!S.house, rich: S.income > placeInc() * RICH_K, q: S.q, rural: S.home.kind === 'rural', home: S.home.p,
    only: !S.fam.sibs.some(b => b.alive), burden: par.some(x => x.ill) ? 'ill' : par.length && par.every(x => RESID_PENSION_JOBS.has(x.jk)) ? 'pension' : '' };
};
const taProf = (p): Prof => ({ male: p.sex === 'M', age: p.age, bz: bianzhi(p.jk), noJob: !p.jk && p.age >= 24, house: !!p.house, rich: p.inc > placeInc() * RICH_K, q: p.q, rural: p.rural, home: p.home, only: !!p.only, burden: '' });
/** a 在 b 家眼里的每一条：[哪一条, 分数] */
function score(a: Prof, b: Prof): [string, number][] {
  const r: [string, number][] = [];
  if (a.bz) r.push(['bz', 1]);
  if (a.noJob) r.push(['seek', a.male ? -1.5 : -1]);
  if (a.house) r.push(['house', a.male ? 1 : 0.5]);
  else if (a.male && a.age >= 25) r.push(['nohouse', b.q >= 4 ? -1 : -0.5]);
  if (a.rich) r.push(['rich', 0.5]);
  const gap = a.q - b.q;
  if (gap <= -2) r.push(['poor', 0.5 * (gap + 1)]); else if (gap >= 1) r.push(['wealth', 0.3 * gap]);
  if (a.rural && !b.rural) r.push(['rural', -0.5]);
  if (a.home !== b.home) r.push(['far', -0.5]);
  if (a.only) r.push(['only', 0.3]);
  if (a.burden) r.push([a.burden, -0.5]);
  if (Math.abs(a.age - b.age) >= 6) r.push(['age', -0.5]);
  return r;
}
const involved = () => !S.school && S.age >= 22;
type Why = { k: string; v: number; t: (subj: string) => string };
/** 对方家里看你：每一条配一句话（subj 是「张三家里」） */
export function theirWhys(p): Why[] {
  if (!involved()) return [];
  const jn = S.job && JOBS[S.job] ? JOBS[S.job].n : '', ag = Math.abs(p.age - S.age);
  const alt = <T,>(a: T[]) => a[(S.age + p.age) % a.length]; // 同样的条件换着说，不用随机数
  const T: Record<string, (x: string) => string> = {
    bz: alt([x => `${x}听说你是${jn}，有编制，挺满意。`, x => `${x}一听是${jn}，有编制，脸上就有了笑。`]),
    seek: x => `${x}问你在哪儿上班，你说还在找。`,
    house: alt([x => `${x}听说你在${S.house?.city}有房，挺满意。`, x => `${x}知道你在${S.house?.city}有自己的房子，放心了不少。`]),
    nohouse: alt([x => `${x}托人问了两次：你有没有房。`, x => `${x}第一句就问：在${S.loc.city}买房了没有？`]),
    rich: x => `听说你收入不错，${x}没什么好挑的。`,
    poor: x => `${x}条件好，话里话外嫌你家底薄。`,
    wealth: x => `${x}听说你家里条件不错，挺满意。`,
    rural: alt([x => `${x}听说你是农村出来的，有点犹豫。`, x => `${x}打听了你老家在哪儿，听说是村里的，没再往下问。`]),
    far: x => `${x}听说你老家在${PBY[S.home.p].n}，嫌远。`,
    only: x => `${x}听说你是独生子女，家里的心思都在你身上，挺放心。`,
    ill: x => `${x}听说你家里老人身体不好，有点犹豫。`,
    pension: alt([x => `${x}问起你爸妈有没有退休金，你说没有。`, x => `${x}算了算：你爸妈没有退休金，以后得靠你养。`]),
    age: x => `${x}嫌你们差了${ag}岁。`,
  };
  return score(meProf(), taProf(p)).map(([k, v]) => ({ k, v, t: T[k] }));
}
export const famPts = p => theirWhys(p).reduce((a, w) => a + w.v, 0);
/** 对方家里怎么看你（subj：「张三家里」）：最满意的一条和最在意的一条各说一句 */
export function theirView(p, subj = `${p.name}家里`): string | null {
  const ws = theirWhys(p).filter(w => Math.abs(w.v) >= 0.3); if (!ws.length) return null;
  const best = ws.reduce((a, b) => b.v > a.v ? b : a), worst = ws.reduce((a, b) => b.v < a.v ? b : a);
  const ta = p.sex === 'M' ? '他' : '她';
  if (best.v > 0 && worst.v < 0) return best.t(subj) + worst.t(`不过${ta}家里`);
  return (best.v > 0 ? best : worst).t(subj);
}
/** 你家里看对方：同一张表，你爸妈的口气 */
export function myWhys(p): { k: string; v: number; t: string }[] {
  if (!involved() || !(S.fam.mom.alive || S.fam.dad.alive)) return [];
  const ta = p.sex === 'M' ? '他' : '她', ag = Math.abs(p.age - S.age);
  const T: Record<string, string> = {
    bz: '有编制，稳当', seek: '还没工作', house: '自己有房，省心', nohouse: '还没买房', rich: '收入不错',
    poor: '家里条件差了点', wealth: '家里条件不错',
    rural: S.sex === 'M' ? '农村的，彩礼怕是不少' : `农村的，以后过年回${ta}家，你待得惯吗`,
    far: S.sex === 'F' ? `${PBY[p.home].n}的？嫁那么远，以后想回趟家都难` : '外地的？以后过年回谁家',
    only: '独生子女，家里的心思都在一个人身上', age: `${p.age > S.age ? '大' : '小'}了${ag}岁`,
  };
  return score(taProf(p), meProf()).map(([k, v]) => ({ k, v, t: T[k] }));
}
/** 你家里怎么看对方：好的、担心的各取最要紧的一条。par：1 满意、0 没意见、-1 不太满意 */
export function famView(p): { who: string | null; good: string | null; bad: string | null; par: number } {
  const who = S.fam.mom.alive ? '妈妈' : S.fam.dad.alive ? '爸爸' : null, ws = myWhys(p);
  if (!ws.length) return { who: involved() ? who : null, good: null, bad: null, par: 0 };
  const best = ws.reduce((a, b) => b.v > a.v ? b : a), worst = ws.reduce((a, b) => b.v < a.v ? b : a), f = ws.reduce((a, w) => a + w.v, 0);
  return { who, good: best.v > 0 ? best.t : null, bad: worst.v < 0 ? worst.t : null, par: f <= -1 ? -1 : f >= 1 ? 1 : 0 };
}
/** 「妈妈说：“……”」 */
export function famSay(p): string | null {
  const v = famView(p); if (!v.who) return null;
  const t = v.good && v.bad ? `${v.good}。就是${v.bad}。` : v.good ? `${v.good}。` : v.bad ? `${v.bad}。` : `人看着挺好。`;
  return `${v.who}说：“${t}”`;
}

// ===== 相亲：一次介绍两个 =====
// 一个条件好、聊不太来，一个合得来、条件一般：见哪一个，是真正的取舍
const condScore = p => p.q + (bianzhi(p.jk) ? 1.5 : 0) + (p.house ? 1 : 0);
function blindPair() {
  const a = makePartner('blind'), b = makePartner('blind');
  const [hi, lo] = condScore(a) + (a.inc > b.inc ? 0.5 : 0) >= condScore(b) + (b.inc > a.inc ? 0.5 : 0) ? [a, b] : [b, a];
  if (hi.q - lo.q < 2) { hi.q = Math.min(5, hi.q + 1); lo.q = Math.max(1, lo.q - 1); }
  const f = (hi.fit + lo.fit) / 2;
  hi.fit = clamp(f - 0.12, 0.05, 0.95); lo.fit = clamp(f + 0.12, 0.05, 0.95);
  // 先后随机，免得条件好的总排在前面
  [S.cand, S.cand2] = chance(0.5) ? [hi, lo] : [lo, hi];
}
/** 谁介绍的：爸妈在的是爸妈托人，不在了是亲戚或者同事 */
export const matchmaker = () => S.fam.mom.alive ? '妈妈' : S.fam.dad.alive ? '爸爸' : isWorking() ? '同事' : '亲戚';
/** 自动抉择（无界面的人生、你勾了自动抉择）时，条件好、家里满意的更容易选上 */
export const pickW = p => Math.max(0.1, (0.6 + p.fit * 2 + 0.25 * (p.q - 3) + (bianzhi(p.jk) ? 0.3 : 0) + (p.house ? 0.2 : 0)) * (1 + 0.2 * famView(p).par));

// 恋爱中的每一年：对象长一岁、毕业了找工作、收入更新（在第 12 个月月底，紧接着你自己长一岁）
function partnerYear(d) {
  d.age++;
  if (!d.jk && d.age >= d.startAge) {
    // 说好毕业后来找你的：到你现在的城市找工作
    const come = d.follow && d.city !== S.loc.city;
    if (come) d.city = S.loc.city;
    d.follow = 0; partnerJob(d);
    log(come ? `${d.name}毕业了，来${S.loc.city}找你，成了一名${ptJobName(d)}。` : `${d.name}毕业了，成了一名${ptJobName(d)}。`, 'ev');
  } else if (d.jk) d.inc = partnerInc(d);
}
// 双方的性格：敏感的人感情差一些、随和的人好一些（各算一次；性格相似度本身几乎不起作用，Dyrenforth 2010，所以不算「合不合」）
const ptz = (d: { pz?: PZ }, x: keyof PZ) => d.pz ? d.pz[x] : 0;
const loveP = d => -2 * (pz('n') + ptz(d, 'n')) + 1.5 * (pz('a') + ptz(d, 'a'));
// 每年靠拢 0.35、波动 7（估计），换算成每月；在一起满一年后，每年有一半的机会去见家长
const LOVE_K = approachPerMonth(0.35), LOVE_SD = sdPerMonth(7), PARENTS_P = perMonth(0.5);
// 感情淡了：感情掉到 LOVE_COLD 以下，先有苗头（时间线上写一句），过三个月还没好，停下来问你（抉择 cold）；
// 回到 LOVE_COLD + 5 以上算缓过来了。原来每个月掷骰子分手，人说没就没，现在分开要么是你选的，要么是苗头出来、你选了拖着以后 Ta 选的
export const LOVE_COLD = 40;
declare module './types' {
  interface Partner {
    coldAt?: number;  // 感情淡下来的苗头是哪个月出现的
    coldAsk?: number; // 上一次问你「感情淡了」是哪个月（两年内不再问）
    drag?: number;    // 你选了「就这么拖着」是哪个月：半年后还没缓过来，Ta 会先开口
    tpar?: number;    // 对方家里的态度：1 满意、0 没意见、-1 不太满意（见家长时定下）
    slowed?: number;  // 见家长时选了「先缓一缓」是哪个月（一年以后再见）
    wf?: string;      // 结婚的事，你说要等什么：grad 毕业、job 工作稳定、house 买了房、think 还没想好
    wAt?: number;     // 说「再等等」是哪个月
    w0?: number;      // 第一次说「再等等」是哪个月（Ta 等了多久）
    apart?: number;   // 婚后两地分居是哪个月开始的（抉择 wedMove）
  }
}
// ===== 感情线 =====
// 每一段感情、每一个没选的人都记下来（S.loves）：回响事件（echoes.ts）接着用，结局页列成一条感情线。
// kind：love 在一起过、missed 没选的（相亲时选了另一个，或者很投缘却没追）。why：怎么分开的（WHY_N）
export interface Love { name: string; sex: 'M' | 'F'; at: number; how: string; kind: 'love' | 'missed'; end?: number; why?: string; wed?: number; div?: number; died?: number; with?: string }
declare module './types' { interface Life { loves?: Love[] } }
export const WHY_N = { parents: '家里不同意', ldr: '异地', cold: '感情淡了', wait: '等不下去了', house: '没有婚房', no: '没走到结婚' };
export function noteLove(p, kind: 'love' | 'missed' = 'love', withName?: string) {
  const l = (S.loves ||= []);
  if (l.length < 16) l.push({ name: p.name, sex: p.sex, at: S.age, how: p.how, kind, ...(withName ? { with: withName } : {}) });
}
/** 和这个人的那一段（还没结束的那段） */
export const loveOf = (p): Love | undefined => (S.loves || []).slice().reverse().find(x => x.kind === 'love' && x.name === p.name);
/** 分开：时间线上写一句，记一次前任。k：怎么分开的（WHY_N） */
export function breakUp(d, why: string, h = -5, k = '') {
  const e = loveOf(d); if (e) { e.end = S.age; e.why = k; }
  S.fam.dating = null; S.flags.exes = (S.flags.exes || 0) + 1; eff({ h });
  const yrs = S.age - d.metAt;
  log(`${why}你和${d.name}分手了。在一起${yrs ? yrs + '年' : '不到一年'}。`, 'bad');
}
/** 把一个抉择排在稍后（同一个月里）。快到年底的就排在当下：不能排到现在之前，不然真实游玩时马上弹出、重放时却停在它前面（content/echoes.ts 的 soon 同样） */
export function soon(id: string) {
  if (S.queue.some(e => e.type === 'dec' && e.id === id)) return;
  const at = S.t + 0.005 <= 0.999 ? S.t + 0.005 : S.t;
  let i = S.queue.length; while (i > 0 && S.queue[i - 1].at > at) i--;
  S.queue.splice(i, 0, { at, type: 'dec', id });
}
const COLD_SIGN = {
  ldr: ['异地以后，一周打不了两次电话，打了也不知道说什么。', '你们约好的视频，又有一次谁都没想起来。'],
  near: ['最近总是吵架，吵完谁也不先低头。', '一起吃饭的时候，两个人各看各的手机。', '周末各过各的，好几天没说上话。'],
};
// 恋爱中的每个月：感情向一个目标值靠拢（合不合得来、花多少时间、是不是异地）；满一年去见家长；感情淡了先有苗头，再问你
export function loveStep(d) {
  const ldr = d.city !== S.loc.city;
  const T = 48 + 32 * d.fit + 10 * slotW('love') - 5 * slotW('work') + (ldr ? -12 : 0) + (S.st.h - 55) * 0.2 + loveP(d);
  d.love = clamp(d.love + (T - d.love) * LOVE_K + gauss(0, LOVE_SD), 0, 100);
  const yrs = S.age - d.metAt, m = nowM();
  if (yrs >= 1 && !d.metParents && (d.slowed == null || m - d.slowed >= 12) && chance(PARENTS_P)) { meetParents(d); return; }
  if (d.love >= LOVE_COLD + 5) { d.coldAt = d.drag = undefined; return; }
  if (d.love >= LOVE_COLD) return;
  if (d.coldAt == null) { d.coldAt = m; log(pick(COLD_SIGN[ldr ? 'ldr' : 'near']), 'ev'); return; }
  // 选了拖着，半年还没缓过来：Ta 先开口
  if (d.drag != null && m - d.drag >= 6) { breakUp(d, ldr ? `${d.name}在电话里说，这样下去没意思。` : `${d.name}说，这样拖着对谁都不好。`, -6, ldr ? 'ldr' : 'cold'); return; }
  if (d.drag == null && m - d.coldAt >= 3 && (d.coldAsk == null || m - d.coldAsk >= 24)) { d.coldAsk = m; soon('cold'); }
}
// 见家长：两家都没意见的，写一句就过去了；有一边不同意的，停下来问你（抉择 parents）。
// 对方家里满不满意就是上面那张条件表的总分
export const theirPar = p => { const f = famPts(p); return f <= -1 ? -1 : f >= 1 ? 1 : 0; };
function meetParents(d) {
  // 先缓过一阵的，家里有一半的可能松口（估计）
  if (d.slowed != null) { if (d.par < 0 && chance(0.5)) d.par = 0; if (d.tpar < 0 && chance(0.5)) d.tpar = 0; }
  else { d.par = famView(d).par; d.tpar = theirPar(d); }
  d.metParents = 1;
  if (d.par < 0 || d.tpar < 0) { soon('parents'); return; }
  log(S.sex === 'M' ? `第一次去${d.name}家见家长，提了两大袋礼物。${d.q >= 4 ? '对方爸妈话不多，问了问你的工作和房子。' : '对方爸妈留你吃了顿饭，一直往你碗里夹菜。'}` : meetMyParents(d), 'ev');
}
// 女方带男朋友回家见父母：父母不在了的，带他去看看父母；还有一方在世的，见那一位
function meetMyParents(d) {
  const { mom, dad } = S.fam;
  if (!mom.alive && !dad.alive) return `你带${d.name}回了一趟老家，去给爸妈上了坟。回来的路上，他一直握着你的手。`;
  const who = mom.alive && dad.alive ? '你爸妈' : mom.alive ? '你妈妈' : '你爸爸';
  const ask = mom.alive ? '妈妈' : '爸爸';
  return `${d.name}第一次来家里见${who}。${S.q <= 2 ? `${ask}私下问你：“他家里条件怎么样？”` : `${mom.alive && dad.alive ? '爸妈' : ask}挺满意，说小伙子看着踏实。`}`;
}
// 你搬去别的城市时：还在读书的走不开，说好毕业后过来（毕业时见 partnerYear）；已经工作的，问你怎么办（抉择 ldr）
export function loveMove() {
  const d = S.fam.dating; if (!d || d.city === S.loc.city) return;
  if (!d.jk) { d.follow = 1; log(`你去了${S.loc.city}。${d.name}还在读书，说好毕业以后就过来找你。`, 'ev'); return; }
  d.follow = 0; soon('ldr');
}
// 彩礼：各省调查/报道的区间（见 DATA.md，可信度多为中低）；没有数据的省份用农村调查均值 3.86 万
export const brideAmt = pid => { const b = PBY[pid].bride; return b ? Math.round((b[0] + (b[1] - b[0]) * rnd()) / 1e3) * 1e3 : 38600; };

// ===== 婚后 =====
// 婚后的感情也会变：向一个目标值慢慢靠拢（比谈恋爱时慢）。合得来、时间放在家人上的好；工作占得多、孩子不满一岁、手头紧的差（估计）。
// 淡了先有苗头（时间线上一句），半年还没缓过来，婚姻就出了问题（p.crisis：三个月后问你，抉择 split）。
// 另外还有说不清的变故（events.ts 的 marCrisis，按 divorceRisk）：感情越差越容易碰上
// WED_T0 和 events.ts 的 DIV_BASE 一起校准：婚后任何时候约 1% 的夫妻感情淡了，活到 60 岁离过婚的约 10%
const WED_T0 = 45, WED_K = approachPerMonth(0.2), WED_SD = sdPerMonth(6), APART_END = perMonth(0.25);
/** 婚姻出问题时时间线上的那一句（marCrisis 也用） */
export const crisisLine = p => pick([`你和${p.name}已经分房睡了大半年，谁也没提。`, `吵架的时候，${p.name}第一次说出了“离婚”两个字。`, '一家人吃饭，只听得见碗筷的声音。', `${p.name}越来越晚回家，问起来就说加班。`]);
export function marriedStep(p) {
  const baby = S.fam.kids.some(k => k.alive && k.age < 1), broke = liquidBalance() < 0 || (S.debt || 0) > 0;
  const apart = p.city !== S.loc.city;
  const T = WED_T0 + 30 * p.fit + 6 * slotW('family') - 4 * slotW('work') - (baby ? 6 : 0) - (broke ? 5 : 0) - (apart ? 10 : 0) + (S.st.h - 75) * 0.2 + loveP(p);
  const v = p.love ?? 63;
  p.love = clamp(v + (T - v) * WED_K + gauss(0, WED_SD), 0, 100);
  // 两地分居：退休了就过来；分居两年以后，每年约四分之一的可能 Ta 调到你这边（估计）
  if (apart && (p.retired || p.apart != null && nowM() - p.apart >= 24 && chance(APART_END))) {
    p.city = S.loc.city; p.apart = undefined;
    if (p.jk && !p.retired) partnerJob(p);
    log(p.retired ? `${p.name}退休了，搬来${S.loc.city}和你一起住。两地分居的日子总算到头了。` : `${p.name}在${S.loc.city}找到了工作，搬了过来。两地分居的日子总算到头了。`, 'good');
  }
  if (p.crisis != null) return;
  const m = nowM();
  if (p.love >= LOVE_COLD + 5) { p.coldAt = undefined; return; }
  if (p.love >= LOVE_COLD) return;
  if (p.coldAt == null) {
    p.coldAt = m;
    log(pick([`结婚这些年，你和${p.name}的话越来越少，饭桌上各看各的手机。`, `${p.name}说你心里只有${S.job && isWorking() ? '工作' : '自己'}。你没接话。`, '为了一点小事吵起来，翻出了好几年前的旧账。']), 'ev');
    return;
  }
  if (m - p.coldAt >= 6) { p.crisis = m; p.coldAt = undefined; eff({ h: -4 }); log(crisisLine(p), 'bad'); }
}

// ===== 每个月月底 =====
/** 单身的：这个月会不会认识人；恋爱中的：感情变化、见家长、分手（第 12 个月月底对象还长一岁）；结了婚的：婚后的感情 */
export function loveMonth(m: number) {
  // 刚分开（分手、离婚、丧偶）：从这个月算起，隔一段时间才会遇见下一个人
  const has = S.fam.dating || S.fam.married ? 1 : 0;
  if (S.flags.coupled && !has) S.flags.lastMeet = nowM();
  S.flags.coupled = has || undefined;
  if (S.cand) {
    // 认识了还没决定（抉择排在下个月）。万一抉择不在队列里了（比如这个月被清掉），补排进下个月，免得一直卡在「还没决定」
    if (!S.queue.some(e => e.type === 'dec' && e.id === 'romance')) queueRomance(m);
  } else meetMonth(m);
  const pt = S.fam.married && S.fam.partner?.alive ? S.fam.partner : null;
  if (pt) marriedStep(pt);
  const d = S.fam.dating; if (!d) return;
  if (m === MONTHS - 1) partnerYear(d);
  loveStep(d);
}
