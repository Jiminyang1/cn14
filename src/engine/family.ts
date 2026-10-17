// 家人：兄弟姐妹、自己的孩子，以及每年家人的变化（衰老、去世、配偶的工作）。
import type { Kid, Sex } from './types';

import { JOBS, retireAgeOf } from './career';
import { S } from './state';
import { addDoc, log } from './journal';
import { chance, gauss } from './rng';
import { eff } from './stats';
import { leOf, lifeTable, parentQ } from './mortality';
import { makeName } from './names';
import { partnerInc, partnerJob } from './romance';

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
export function family() {
  const f = S.fam;
  for (const [k, male] of [["mom", false], ["dad", true]] as const) {
    const p = f[k]; if (!p.alive) continue;
    p.age++;
    if (chance(parentQ(p, male) * (p.ill ? 2 : 1))) {
      p.alive = false; p.diedAt = S.age;
      log(`${male ? '爸爸' : '妈妈'}去世了，享年${p.age}岁。${S.age < 18 ? '你还没有长大。' : ''}`, 'loss');
      eff({ h: S.age < 18 ? -14 : -9, so: -3 });
    } else if (p.age >= 62 && !p.ill && chance(0.03)) p.ill = 1;
  }
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
    if (chance(lifeTable(leOf(S.loc.p, pt.sex, false), 0.004, pt.sex).q[Math.min(119, pt.age)])) {
      // 丧偶：不再算已婚，以后还可以再认识人（f.partner 留着，界面显示「丧偶」，再婚时被替换）
      pt.alive = false; f.married = false; S.flags.widowed = S.age; log(`${pt.name}去世了，享年${pt.age}岁。你们一起走过了${S.age - pt.marriedAt}年。`, 'loss'); eff({ h: -15, so: -6 });
    }
  }
  for (const k of f.kids) {
    if (!k.alive) continue;
    const kq = lifeTable(leOf(S.loc.p, k.sex, false), 0.003, k.sex).q[Math.min(119, S.age - k.bornAt)];
    if (chance(kq)) { k.alive = false; log(`${k.name}走了，才${S.age - k.bornAt}岁。没有什么比这更痛。`, 'loss'); eff({ h: -25, so: -5 }); }
  }
}
export const kidsAlive = () => S.fam.kids.filter(k => k.alive);
export function haveKid() {
  const _k = haveKid0(); addDoc('kid', '出生医学证明', [['新生儿', _k.name], ['性别', _k.sex === 'M' ? '男' : '女'], ['父母', S.sex === 'M' ? `${S.name}、${S.fam.partner ? S.fam.partner.name : ''}` : `${S.fam.partner ? S.fam.partner.name : ''}、${S.name}`]]); return _k;
}
export function haveKid0() {
  const sex: Sex = chance(0.524) ? 'M' : 'F';
  const sur = S.sex === 'M' ? S.surname : (S.fam.partner ? S.fam.partner.sur : S.surname);
  const nm = makeName(sex, S.eth, sur || undefined);
  const k: Kid = { name: nm.full, sex, bornAt: S.age, age: 0, alive: true };
  S.fam.kids.push(k);
  return k;
}

// ===== 哪些抉择今年会出现 =====
export function canBaby() {
  const wifeAge = S.sex === 'F' ? S.age : S.fam.partner.age;
  return wifeAge >= 22 && wifeAge <= 42 && kidsAlive().length < 3;
}
export const babyP = () => [0.3, 0.09, 0.02][Math.min(2, kidsAlive().length)];
