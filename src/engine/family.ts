// 家人：兄弟姐妹、自己的孩子（怀孕、出生），以及家人的变化（生日那个月长一岁、配偶的工作；每个月判定去世、父母病倒）。
import type { Kid, Sex } from './types';

import { JOBS, retireAgeOf } from './career';
import { S } from './state';
import { addDoc, log } from './journal';
import { chance, gauss, wpick } from './rng';
import { MONTHS, perMonth } from './monthly';
import { eff } from './stats';
import { kinLT, qMonth } from './mortality';
import { makeName } from './names';
import { partnerInc, partnerJob } from './romance';
import { placeInc } from './place';

declare module './types' {
  interface Flags {
    // 怀孕：due 是第几个月出生（年龄 × 12 + 月份）；pa、sur 是孩子另一位家长的名字和姓（离婚、丧偶以后孩子照样出生，证件和姓氏用得到）
    preg?: { due: number; pa: string; sur: string } | null;
  }
}

// ===== 兄弟姐妹 =====
// 参数来源见 DATA.md「兄弟姐妹」
export const SIB = {
  // 生你时妈妈的年龄（均值、标准差），按你是第几个孩子：2020 年普查分孩次平均生育年龄（城市 / 乡村），减 0.5 岁换算到生育当时（普查表 6-3）
  // 二孩、三孩的抽样均值调低了一些，抵消「妈妈生第一个孩子时至少 20 岁」这条限制把平均年龄往上推的效果；模拟出的结果约为 27.2 / 30.2 / 32.3 岁（普查全国 26.7 / 29.8 / 31.2，三孩仍偏高约 1 岁）
  momAge: { urban: { 1: [27.8, 4.2], 2: [30.5, 4.2], 3: [31.2, 4.5] }, rural: { 1: [25.4, 4], 2: [27.4, 4.2], 3: [29.0, 4.5] } },
  // 第 n 个孩子之后，下一个孩子差几岁（均值、标准差，最少 1 岁）：一二孩间隔，2010 年代全国约 5.5–6 年（按平均生育年龄差，偏高；2017 年全国生育状况抽样调查）；二三孩间隔没有全国数据，估计约 3.5 年
  gap: { 1: [4.8, 2.5], 2: [3.5, 2] },
  // 分孩次出生性别比（女 = 100）：2020 年普查，城市 112.0 / 108.3 / 144.3，乡村 114.1 / 104.9 / 125.4
  srb: { urban: { 1: 112, 2: 108.3, 3: 144.3 }, rural: { 1: 114.1, 2: 104.9, 3: 125.4 } },
  // 已经有 n 个孩子的家庭，以后还会再生一个的比例：全国一孩→二孩约 0.6、二孩→三孩约 0.16–0.19（2017 年全国生育状况抽样调查、北方七省队列研究）；城乡差异没有找到数据，按农村高、城镇低估计
  more: { 1: { urban: 0.5, rural: 0.68 }, 2: { urban: 0.12, rural: 0.25 } },
  // 再生的倾向：[还没有儿子时, 已有儿子时] 的倍数（重男轻女，估计；三孩性别比 132 远高于二孩 107）
  noSon: { 1: [1.3, 0.8], 2: [2.2, 0.65] },
  momMax: 42, // 妈妈超过这个年龄一般不再生
};
export const UR = () => S.rural ? 'rural' : 'urban';
export const boyOf = order => { const r = SIB.srb[UR()][Math.min(3, order)]; return chance(r / (100 + r)); };
// 你上面的哥哥姐姐是男是女：按分孩次性别比抽，再按「没有儿子更可能接着生」加权（拒绝抽样）
export function olderSibSexes(n) {
  let kMax = 1; for (let i = 1; i <= n; i++) kMax *= Math.max(...SIB.noSon[Math.min(2, i)]);
  for (let t = 0; t < 50; t++) {
    const sx = []; for (let i = 1; i <= n; i++) sx.push(boyOf(i) ? 'M' : 'F');
    let w = 1;
    for (let i = 1; i <= n; i++) { const k = SIB.noSon[Math.min(2, i)]; w *= sx.slice(0, i).includes('M') ? k[1] : k[0]; }
    if (chance(w / kMax)) return sx;
  }
  return Array.from({ length: n }, () => chance(0.5) ? 'M' : 'F');
}
// 以后还会不会有弟弟妹妹：出生时就定好在你几岁时出生
export function planNextSib() {
  const f = S.fam, n = 1 + f.sibs.length;
  S.flags.nextSib = null;
  if (n >= 3 || !SIB.more[n]) return;
  const hasSon = S.sex === 'M' || f.sibs.some(s => s.sex === 'M');
  const p = SIB.more[n][S.rural ? 'rural' : 'urban'] * SIB.noSon[n][hasSon ? 1 : 0];
  if (!chance(Math.min(0.95, p))) return;
  const at = S.age + Math.max(1, Math.round(gauss(...SIB.gap[n]))); // 这个函数总在最小的孩子刚出生时调用
  if (f.mom.age + (at - S.age) > SIB.momMax) return;
  S.flags.nextSib = at;
}
export function newSib() {
  const f = S.fam, sx = boyOf(2 + f.sibs.length) ? 'M' : 'F';
  f.sibs.push({ rel: sx === 'M' ? '弟弟' : '妹妹', sex: sx, age: 0 });
  eff({ h: -1, so: 2 });
  log(`家里多了一个${sx === 'M' ? '弟弟' : '妹妹'}。大人的注意力一下子都跑到了小婴儿身上。`, 'ev');
  planNextSib();
}
// ===== 家人的变化 =====
// 年龄一年长一次，在你生日那个月（第 0 岁那年不长：出生时的年龄就是那一年的年龄）。
// 去世、父母生病按月判定，年概率按 perMonth 换算。生命表的口径沿用按年时期：那时是年末先长一岁再判定，
// 所以父母、配偶在你 a 岁这一年用的是「现在的年龄 + 1」那一行，这样一年下来的死亡概率和原来一样，父母、配偶的寿命分布不变。
// 孩子原来就用当年的年龄（你的年龄 − 出生时你的年龄），照旧。
const PAR_ILL_M = perMonth(0.03); // 父母 62 岁以后每年约 3% 病倒、需要人照顾（估计）
function famAgeUp() {
  const f = S.fam;
  for (const k of ['mom', 'dad'] as const) if (f[k].alive) f[k].age++;
  for (const s of f.sibs) s.age++;
  const pt = f.partner;
  if (pt && pt.alive && f.married) {
    pt.age++;
    // 配偶的收入每年按同一套公式更新；到了退休年龄领养老金（约为原来收入的一半，估计）
    if (pt.k != null && !pt.retired) {
      if (!pt.jk && pt.age >= pt.startAge) partnerJob(pt);
      else if (pt.jk) pt.inc = partnerInc(pt);
      if (pt.jk && pt.age >= retireAgeOf(pt.sex, pt.jk)) { pt.retired = 1; pt.inc = Math.round(pt.inc * 0.5); }
    }
  }
}
function parentMonth(p, male: boolean) {
  const T = kinLT('par', male ? 'M' : 'F'), x = p.age + 1;
  if (chance(p.ill ? perMonth(Math.min(1, T.q[Math.min(119, x)] * 2)) : qMonth(T, x))) {
    p.alive = false; p.diedAt = S.age;
    log(`${male ? '爸爸' : '妈妈'}去世了，享年${p.age}岁。${S.age < 18 ? '你还没有长大。' : ''}`, 'loss');
    eff({ h: S.age < 18 ? -14 : -9, so: -3 });
  } else if (x >= 62 && !p.ill && chance(PAR_ILL_M)) p.ill = 1;
}
function familyDeaths() {
  const f = S.fam;
  if (f.mom.alive) parentMonth(f.mom, false);
  if (f.dad.alive) parentMonth(f.dad, true);
  const pt = f.partner;
  if (pt && pt.alive && f.married && chance(qMonth(kinLT('pt', pt.sex), pt.age + 1))) {
    // 丧偶：不再算已婚，以后还可以再认识人（f.partner 留着，界面显示「丧偶」，再婚时被替换）
    pt.alive = false; f.married = false; S.flags.widowed = S.age; log(`${pt.name}去世了，享年${pt.age}岁。你们一起走过了${S.age - pt.marriedAt}年。`, 'loss'); eff({ h: -15, so: -6 });
    if (S.sex === 'M' && S.flags.preg) S.flags.preg = null; // 怀着孩子的是她
  }
  for (const k of f.kids) {
    if (!k.alive) continue;
    if (chance(qMonth(kinLT('kid', k.sex), S.age - k.bornAt))) { k.alive = false; log(`${k.name}走了，才${S.age - k.bornAt}岁。没有什么比这更痛。`, 'loss'); eff({ h: -25, so: -5 }); }
  }
}
export const kidsAlive = () => S.fam.kids.filter(k => k.alive);
/** 孩子出生。pa：另一位家长（默认是现在的配偶；怀孕期间离婚、丧偶的，用怀孕时记下的） */
export function haveKid(pa?: { name: string; sur: string }) {
  const o = pa || S.fam.partner, on = o ? o.name : '';
  const _k = haveKid0(pa); addDoc('kid', '出生医学证明', [['新生儿', _k.name], ['性别', _k.sex === 'M' ? '男' : '女'], ['父母', S.sex === 'M' ? `${S.name}、${on}` : `${on}、${S.name}`]]); return _k;
}
export function haveKid0(pa?: { name: string; sur: string }) {
  const sex: Sex = chance(0.524) ? 'M' : 'F';
  const o = pa || S.fam.partner;
  const sur = S.sex === 'M' ? S.surname : (o ? o.sur : S.surname);
  const nm = makeName(sex, S.eth, sur || undefined);
  const k: Kid = { name: nm.full, sex, bornAt: S.age, age: 0, alive: true };
  S.fam.kids.push(k);
  return k;
}

// ===== 哪些抉择今年会出现 =====
/** 能不能考虑要孩子：怀着孕的时候不能 */
export function canBaby() {
  if (S.flags.preg) return false;
  const wifeAge = S.sex === 'F' ? S.age : S.fam.partner.age;
  return wifeAge >= 22 && wifeAge <= 42 && kidsAlive().length < 3;
}
export const babyP = () => [0.3, 0.09, 0.02][Math.min(2, kidsAlive().length)];

// ===== 生日那个月 =====
/** 家人长一岁（配偶的工作、收入跟着更新），然后弟弟妹妹出生（出生时就定好了在你几岁时出生） */
export function sibYearStart() {
  if (S.age > 0) famAgeUp();
  if (S.flags.nextSib === S.age && S.fam.mom.alive) newSib();
}
/** 你的孩子长大：上学、高考、结婚、生孩子 */
export function kidsYearStart() {
  const a = S.age, f = S.fam;
  for (const k of f.kids) {
    if (!k.alive) continue;
    k.age = a - k.bornAt;
    if (k.age === 6) log(`${k.name}上小学了。`, 'ev');
    if (k.age === 18) {
      const t = wpick([['考上了一所不错的本科', 0.25 + S.q * 0.06 + (S.edu >= 6 ? 0.2 : 0)], ['考上了大专', 0.5], ['没有继续读书，出去工作了', 0.25 - S.q * 0.03]]);
      k.path = t; log(`${k.name}参加了高考，${t}。`, 'ev');
    }
    if (k.age >= 23 && k.age <= 38 && !k.married && !k.wed && chance(0.11)) k.wed = 1; // 今年要结婚：先由抉择 kidhome 定家里出多少钱
    if (k.married && (k.gk || 0) < 2 && k.age <= 42 && chance(0.12)) { k.gk = (k.gk || 0) + 1; S.flags.grandkids = (S.flags.grandkids || 0) + 1; log(`你当上了${S.sex === 'M' ? '爷爷' : '奶奶'}（或${S.sex === 'M' ? '外公' : '外婆'}）。${k.name}的孩子出生了。`, 'good'); eff({ h: 6, so: 4 }); }
  }
}

// ===== 每个月月底 =====
/** 家人：怀孕到期的孩子出生，父母、配偶、孩子的去世，父母病倒。每个月判定一次 */
export function familyMonth(m: number) {
  const pg = S.flags.preg;
  if (pg && S.age * MONTHS + m >= pg.due) babyBorn(pg);
  familyDeaths();
}
// 孕期按 40 周（约 9.2 个月）算：决定要孩子的那个月不算，往后第 9 个月月底出生，离做决定 9–10 个月
export const PREG_MONTHS = 9;
/** 决定要孩子以后：怀孕，约十个月后出生（familyMonth 里到期出生）。返回给抉择用的一段话 */
export function conceive() {
  const p = S.fam.partner;
  if (S.flags.preg || !p) return null;
  S.flags.preg = { due: S.age * MONTHS + S.month + PREG_MONTHS, pa: p.name, sur: p.sur };
  return { t: S.sex === 'F' ? '你怀孕了。' : `${p.name}怀孕了。`, k: 'good' as const };
}
// 出生：高兴，也花钱（生产、坐月子；数字沿用原来「要孩子」抉择里的）
function babyBorn(pg: { pa: string; sur: string }) {
  S.flags.preg = null;
  const pt = S.fam.partner, same = !!pt && pt.name === pg.pa;
  const kid = haveKid(same ? undefined : { name: pg.pa, sur: pg.sur });
  eff({ h: 6, so: 4, money: -placeInc() * 0.3 });
  // 配偶在怀孕期间去世（只会是你怀着孩子），或者离了婚
  const widow = same ? !pt.alive : S.flags.widowed != null && S.age - S.flags.widowed <= 1;
  const tail = same && pt.alive ? '' : widow ? '孩子的爸爸没能等到这一天。' : `这时你和${pg.pa}已经分开了。`;
  log(`${kid.name}出生了，是个${kid.sex === 'M' ? '男孩' : '女孩'}。${tail}`, 'good');
}
