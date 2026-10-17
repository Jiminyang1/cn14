// 家人：兄弟姐妹、自己的孩子（怀孕、出生、长大），以及家人的变化（生日那个月长一岁、配偶的工作和养老金；每个月判定去世、父母病倒）。
import type { Kid, Partner, Sex, Sibling } from './types';

import { JOBS, PEN_MIN_YEARS, PEN_YEARS, RESID_PENSION, RESID_PENSION_JOBS, retireAgeOf } from './career';
import { PBY } from './data';
import { S } from './state';
import { addDoc, log } from './journal';
import { chance, clamp, gauss, wpick } from './rng';
import { MONTHS, calMonth, perMonth } from './monthly';
import { nowM } from './calendar';
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
  f.sibs.push({ rel: sx === 'M' ? '弟弟' : '妹妹', sex: sx, age: 0, alive: true });
  eff({ h: -1, so: 2 });
  log(`家里多了一个${sx === 'M' ? '弟弟' : '妹妹'}。${f.dad.alive ? '大人的注意力一下子都跑到了小婴儿身上。' : '爸爸没能等到这一天。'}`, 'ev');
  planNextSib();
}
// 弟弟妹妹出生的前提：妈妈在世、父母没有离婚，爸爸在世或者走了还不到一个孕期（遗腹子）
const sibCanCome = () => {
  const f = S.fam;
  return f.mom.alive && !S.flags.parDiv && (f.dad.alive || f.dad.diedM != null && nowM() - f.dad.diedM <= PREG_MONTHS);
};
export const sibsAlive = () => S.fam.sibs.filter(s => s.alive);
// 兄弟姐妹的去世：和你同一代人，用你出生地、城乡、对应性别的生命表（就是你自己的那张表，只是不乘健康、MORT_K 这些修正），按他们当年的年龄每月判定
function sibMonth(s: Sibling) {
  if (!chance(qMonth(kinLT('sib', s.sex), s.age))) return;
  s.alive = false; s.diedAt = S.age;
  log(s.age < 18 ? `${s.rel}走了，才${s.age}岁。` : `${s.rel}去世了，享年${s.age}岁。`, 'loss');
  eff({ h: S.age < 18 || s.age < 60 ? -8 : -5, so: -2 });
}
// ===== 家人的变化 =====
// 年龄一年长一次，在你生日那个月（第 0 岁那年不长：出生时的年龄就是那一年的年龄）。
// 去世、父母生病按月判定，年概率按 perMonth 换算。生命表的口径沿用按年时期：那时是年末先长一岁再判定，
// 所以父母、配偶在你 a 岁这一年用的是「现在的年龄 + 1」那一行，这样一年下来的死亡概率和原来一样，父母、配偶的寿命分布不变。
// 你的孩子按自己的生日算年龄（见下面的 kidsMonth），兄弟姐妹在你的生日那个月长一岁、按当年的年龄判定。
const PAR_ILL_M = perMonth(0.03); // 父母 62 岁以后每年约 3% 病倒、需要人照顾（估计）
function famAgeUp() {
  const f = S.fam;
  for (const k of ['mom', 'dad'] as const) if (f[k].alive) f[k].age++;
  for (const s of f.sibs) if (s.alive) s.age++;
  const pt = f.partner;
  if (pt && pt.alive && f.married) {
    pt.age++;
    // 配偶的收入每年按同一套公式更新；到了退休年龄领养老金（partnerPension）
    if (pt.k != null && !pt.retired) {
      if (!pt.jk && pt.age >= pt.startAge) partnerJob(pt);
      else if (pt.jk) pt.inc = partnerInc(pt);
      if (pt.jk && pt.age >= retireAgeOf(pt.sex, pt.jk)) { pt.retired = 1; pt.inc = Math.round(partnerPension(pt)); }
    }
  }
}
// 配偶的养老金：和你本人同一条规则（career.ts 的 retire），按退休时你所在的省。
// 只交城乡居民养老保险的职业（RESID_PENSION_JOBS）领城乡居民养老金，个体户另加一点经营攒下的收入（和你本人一样，按最后收入的一成）；
// 其余领职工养老金：所在省职工养老金人均 × 平均工资倍数 × 缴费年数（上下限和你本人相同），机关事业单位 ×1.2。
// 配偶没有逐月的缴费记录，简化成：从参加工作一直缴到退休、中间不断（不满 15 年的领居民养老金）；
// 平均工资倍数用退休前的收入 ÷ 当地城镇人均可支配收入 ÷ 2.5（和你本人的口径一样）。配偶的个人系数不变，工龄系数一生平均约 1.03、退休时约 0.97，
// 所以退休前的收入和一生的平均工资差不多，不再折算。退休以后不调整（你本人的养老金也不调，钱都按不变价算）
export function partnerPension(pt: Partner) {
  const pv = PBY[S.loc.p], penE = pv.penE || 45903, penR = pv.penR || RESID_PENSION;
  if (RESID_PENSION_JOBS.has(pt.jk)) return penR + (pt.jk === 'shop' ? pt.inc * 0.1 : 0);
  const y = Math.max(0, pt.age - pt.startAge);
  if (y < PEN_MIN_YEARS) return penR;
  const r = pt.inc / (pv.incU || pv.inc);
  return penE * clamp(r / 2.5, 0.6, 1.8) * clamp(y / PEN_YEARS, 0.45, 1.25) * (JOBS[pt.jk] && JOBS[pt.jk].stable ? 1.2 : 1);
}
function parentMonth(p, male: boolean) {
  const T = kinLT('par', male ? 'M' : 'F'), x = p.age + 1;
  if (chance(p.ill ? perMonth(Math.min(1, T.q[Math.min(119, x)] * 2)) : qMonth(T, x))) {
    p.alive = false; p.diedAt = S.age; p.diedM = nowM();
    log(`${male ? '爸爸' : '妈妈'}去世了，享年${p.age}岁。${S.age < 18 ? '你还没有长大。' : ''}`, 'loss');
    eff({ h: S.age < 18 ? -14 : -9, so: -3 });
    parentGone(male ? 'dad' : 'mom');
  } else if (x >= 62 && !p.ill && chance(PAR_ILL_M)) p.ill = 1;
}
// 父母一方去世以后：留守的情况跟着变（只在你还是留守儿童的年纪，16 岁以前；之后 lb 只是「小时候留守过」的记录）；
// 父母都不在了，也就不再「跟父母住在一起」
function parentGone(who: 'dad' | 'mom') {
  const F = S.flags, f = S.fam, other = who === 'dad' ? 'mom' : 'dad';
  if (S.age < 16 && F.lbWho) {
    if (F.lbWho === 'both') { F.lb = 'one'; F.lbWho = other; }          // 父母都在外打工：剩下的一方还在外面，你照样由老人带
    else if (F.lbWho === who) { F.lb = undefined; F.lbWho = undefined; } // 外出的那一方走了：在家的那一方本来就在你身边，不再算留守
    else if (!F.carer) F.carer = who === 'mom' ? '奶奶' : '外婆';        // 在家带你的那一方走了、外出的还在外面：交给老人带（估计多是同住的爷爷奶奶）
  }
  if (!f.mom.alive && !f.dad.alive) F.parWithMe = undefined;
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
  for (const s of f.sibs) if (s.alive) sibMonth(s);
  for (const k of f.kids) {
    if (!k.alive) continue;
    if (chance(qMonth(kinLT('kid', k.sex), k.age))) {
      const mo = nowM() - k.bornM;
      k.alive = false;
      log(`${k.age ? `${k.name}走了，才${k.age}岁。` : mo ? `${k.name}走了，出生才${mo}个月。` : `${k.name}出生没几天就走了。`}没有什么比这更痛。`, 'loss');
      eff({ h: -25, so: -5 });
    }
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
  const nm = kidName(sex, sur || undefined, o && o.name);
  const k: Kid = { name: nm.full, sex, bornAt: S.age, bornM: nowM(), age: 0, alive: true };
  S.fam.kids.push(k);
  return k;
}
// 起名避开家里已经用过的名字：你、孩子的另一位家长（随父姓时最容易撞上爸爸的名字）、现在的配偶、别的孩子。
// 兄弟姐妹在游戏里没有名字，不用避。最多重抽 8 次
function kidName(sex: Sex, sur: string | undefined, pa: string | undefined) {
  const used = new Set([S.name, ...S.fam.kids.map(k => k.name)]);
  if (pa) used.add(pa);
  if (S.fam.partner) used.add(S.fam.partner.name);
  let nm = makeName(sex, S.eth, sur);
  for (let i = 0; i < 8 && used.has(nm.full); i++) nm = makeName(sex, S.eth, sur);
  return nm;
}

// ===== 哪些抉择今年会出现 =====
/** 能不能考虑要孩子：怀着孕的时候不能 */
export function canBaby() {
  if (S.flags.preg) return false;
  const wifeAge = S.sex === 'F' ? S.age : S.fam.partner.age;
  return wifeAge >= 22 && wifeAge <= 42 && kidsAlive().length < 3;
}
// 已婚、能生的人每年决定要孩子的概率（按已有几个孩子）。按月以后结婚更早，原来的 [0.3, 0.09, 0.02] 让人均孩子从 1.14 升到 1.20；
// 整体乘约 0.83 回到 1.11（联合国估计近年总和生育率约 1.0，2020 年普查 1.3）
export const babyP = () => [0.25, 0.075, 0.017][Math.min(2, kidsAlive().length)];

// ===== 生日那个月 =====
/** 家人长一岁（配偶的工作、收入跟着更新），然后弟弟妹妹出生（出生时就定好了在你几岁时出生） */
export function sibYearStart() {
  if (S.age > 0) famAgeUp();
  if (S.flags.nextSib === S.age && sibCanCome()) newSib();
}

// ===== 你的孩子长大 =====
// 年龄按孩子自己的生日算：出生后满几个 12 个月，在孩子的生日那个月长一岁（原来按你的生日长，0 岁那一年平均只有约 5.5 个月）。
// 上小学和你本人同一条线（calendar.ts）：9 月 1 日前满 6 岁的当年 9 月入学，也就是 9 月时出生满 73–84 个月的那一次；
// 高考在入学后第 12 年的 6 月，也就是 6 月时出生满 214–225 个月
const KID_SCHOOL_MO: [number, number] = [73, 84], KID_GAOKAO_MO: [number, number] = [214, 225];
const inR = (x: number, r: [number, number]) => x >= r[0] && x <= r[1];
function kidsMonth(m: number) {
  const cm = calMonth(m), now = nowM();
  for (const k of S.fam.kids) {
    if (!k.alive) continue;
    const mo = now - k.bornM, a = Math.floor(mo / MONTHS);
    if (a !== k.age) { k.age = a; kidBirthday(k); }
    if (cm === 9 && inR(mo, KID_SCHOOL_MO)) log(`${k.name}上小学了。`, 'ev');
    if (cm === 6 && inR(mo, KID_GAOKAO_MO)) {
      const t = wpick([['考上了一所不错的本科', 0.25 + S.q * 0.06 + (S.edu >= 6 ? 0.2 : 0)], ['考上了大专', 0.5], ['没有继续读书，出去工作了', 0.25 - S.q * 0.03]]);
      k.path = t; log(`${k.name}参加了高考，${t}。`, 'ev');
    }
  }
}
// 孩子的生日那个月：每年一次的结婚、生孩子判定
function kidBirthday(k: Kid) {
  if (k.age >= 23 && k.age <= 38 && !k.married && !k.wed && chance(0.11)) k.wed = 1; // 今年要结婚：先由抉择 kidhome 定家里出多少钱
  if (k.married && (k.gk || 0) < 2 && k.age <= 42 && chance(0.12)) {
    k.gk = (k.gk || 0) + 1; S.flags.grandkids = (S.flags.grandkids || 0) + 1;
    // 儿子的孩子叫你爷爷、奶奶，女儿的孩子叫你外公、外婆
    const gp = k.sex === 'M' ? (S.sex === 'M' ? '爷爷' : '奶奶') : (S.sex === 'M' ? '外公' : '外婆');
    log(`你当上了${gp}。${k.name}的孩子出生了。`, 'good'); eff({ h: 6, so: 4 });
  }
}

// ===== 每个月月底 =====
/** 家人：怀孕到期的孩子出生，孩子长大（生日、入学、高考），父母、兄弟姐妹、配偶、孩子的去世，父母病倒。每个月判定一次 */
export function familyMonth(m: number) {
  const pg = S.flags.preg;
  if (pg && S.age * MONTHS + m >= pg.due) babyBorn(pg);
  kidsMonth(m);
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
