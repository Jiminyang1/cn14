// 性格：五条轴——外向 e、敏感 n、认真 c、随和 a、敢闯 r（前四条对应大五人格，敢闯是风险偏好）。设计和依据见 docs/personality/PLAN.md。
// 每条轴 z = 天生 g × 权重 + 起伏 u × 权重 + 经历 k，大致是标准分数：同龄同性别里平均 0、标准差 1。
// 对结果起作用的都是 z，所以加了性格以后人群的平均寿命、结婚率不会整体偏移；界面上的词另外加上随年龄的「成熟」和性别差（shownZ）。
// 随机数只用第三条流 rnd3：主流的随机数序列不变。
import { calYear } from './monthly';
import { parentReply, primarySchool } from './docs';
import { fcos, fexp, flog } from './fmath';
import { addDoc, log } from './journal';
import { clamp, gauss3 } from './rng';
import { S } from './state';
import type { Ax, Life, PZ } from './types';

/** 总开关：关掉时不生成性格，所有接入点都不起作用（测试用：关掉时结果必须和加性格以前完全一样） */
export const PERS = { on: true };
export const AX: Ax[] = ['e', 'n', 'c', 'a', 'r'];
const zero = (): PZ => ({ e: 0, n: 0, c: 0, a: 0, r: 0 });
const ZERO: PZ = Object.freeze(zero());

// 天生部分的权重：出生时 0.4，25 岁升到 0.7（遗传率约 0.4；5 岁时几乎看不出将来，25 岁以后基本稳定。Bleidorn 2022、Vukasović 2015）
const wG = (age: number) => 0.4 + 0.3 * Math.min(1, age / 25);
// 起伏每年的自相关：12 岁前 0.7，25 岁起 0.88。成年后相隔 1 年的相关约 0.93、10 年约 0.64、50 年约 0.5
const phi = (age: number) => age < 12 ? 0.7 : age < 25 ? 0.7 + 0.18 * (age - 12) / 13 : 0.88;
// 经历最多把一条轴推动半个标准差
const K_MAX = 0.5;

function calc(L: Life) {
  const P = L.pers, w = wG(L.age), s = Math.sqrt(Math.max(0, 1 - w * w - 0.03));
  for (const x of AX) P.z[x] = w * P.g[x] + s * P.u[x] + P.k[x];
}
/** 出生时生成：天生部分和起伏各抽一次 */
export function persInit(L: Life = S) {
  if (!PERS.on) return;
  const g = zero(), u = zero();
  for (const x of AX) g[x] = gauss3(L);
  for (const x of AX) u[x] = gauss3(L);
  L.pers = { g, k: zero(), u, z: zero() };
  calc(L);
}
/** 生日那个月（长一岁以后）：起伏变一次 */
export function persYear() {
  const P = S.pers; if (!P) return;
  const f = phi(S.age), s = Math.sqrt(1 - f * f);
  for (const x of AX) P.u[x] = f * P.u[x] + s * gauss3();
  calc(S);
}
/** 经历推一下性格（童年的抉择、留守、被欺负……）：16 岁前全额，16–24 岁减半，25 岁以后不再推 */
export function shape(d: Partial<PZ>) {
  const P = S.pers; if (!P) return;
  const m = S.age < 16 ? 1 : S.age < 25 ? 0.5 : 0;
  if (!m) return;
  for (const x in d) P.k[x] = clamp(P.k[x] + d[x] * m, -K_MAX, K_MAX);
  calc(S);
}

/** 这条轴现在的值（没有性格时是 0） */
export const pz = (x: Ax) => S.pers ? S.pers.z[x] : 0;
/** 一组倾向（每个标准差的系数）作用在性格 z 上的乘数：e^(Σ t·z − Σ t²/2)，人群平均仍是 1。没有性格时是 1 */
export function tiltW(t: Partial<PZ> | undefined, z: PZ | null = S.pers ? S.pers.z : null) {
  if (!t || !z) return 1;
  let s = 0, v = 0;
  for (const x in t) { s += t[x] * z[x]; v += t[x] * t[x]; }
  return fexp(s - v / 2);
}

// ===== 自动抉择：份额修正 =====
// 只给某一项加倾向时，即使每个人的倍数平均是 1，「选这一项的人占多少」整体也会变（选择概率对倍数是凹的，例如恋爱「主动追求」69% → 63%）。
// 所以先在一组固定的「标准人群」上算各选项的份额，给各项的基础权重乘一个修正系数，让人群份额回到不看性格时的样子：
// 性格只决定「谁」选哪一项，不改变「多少人」选，校准过的比例不受影响。
// 标准人群：32 对固定的五维标准正态点（z 和 −z 成对，均值正好是 0），用自己的小随机数生成，不消耗任何随机数流
const POP: PZ[] = (() => {
  let st = 0x1234567;
  const r = () => {
    let t = (st = (st + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: PZ[] = [];
  for (let i = 0; i < 32; i++) {
    const z = zero(), m = zero();
    for (const x of AX) { const u = 1 - r(), v = r(); z[x] = Math.sqrt(-2 * flog(u)) * fcos(2 * Math.PI * v); m[x] = -z[x]; }
    out.push(z, m);
  }
  return out;
})();
/** 修正后的基础权重：在标准人群上，各选项的平均份额等于不看性格时的份额（迭代 8 次，误差远小于抽样误差） */
export function balanceW(w0: number[], ts: (Partial<PZ> | undefined)[]) {
  if (!ts.some(t => t)) return w0;
  const n = w0.length, M = POP.map(z => ts.map(t => tiltW(t, z)));
  const tot = w0.reduce((a, b) => a + Math.max(0, b), 0), c = w0.map(() => 1);
  for (let it = 0; it < 8; it++) {
    const share = w0.map(() => 0);
    for (const m of M) {
      let s = 0;
      for (let i = 0; i < n; i++) s += Math.max(0, c[i] * w0[i] * m[i]);
      if (s > 0) for (let i = 0; i < n; i++) share[i] += Math.max(0, c[i] * w0[i] * m[i]) / s / M.length;
    }
    for (let i = 0; i < n; i++) if (share[i] > 0 && w0[i] > 0) c[i] *= (w0[i] / tot) / share[i];
  }
  return w0.map((w, i) => w * c[i]);
}

// ===== 自动抉择的理由 =====
const WHY: Record<Ax, [string, string]> = {
  e: ['性子外向', '性子内向'], n: ['心思重', '心大'], c: ['做事认真', '性子随性'], a: ['脾气随和', '性子要强'], r: ['向来敢闯', '向来求稳'],
};
/**
 * 第 i 项被选中时，是哪条轴把它推上去的：逐条轴单独算「只看这一条轴」时这一项的概率比不看性格时高多少，取最大的那条。
 * 也算上「别的选项被压下去」（例如内向的人主动追求的少，选了只做朋友，理由是「性子内向」）。小于 1.4 倍、或者 4 岁以前不写
 */
export function whyPick(wb: number[], ts: (Partial<PZ> | undefined)[], i: number) {
  if (!S.pers || S.age < 4 || !(wb[i] > 0)) return null;
  const z = S.pers.z, tot = wb.reduce((a, b) => a + Math.max(0, b), 0), p0 = wb[i] / tot;
  let best: Ax = null, bg = 1.4;
  for (const x of AX) {
    if (!ts.some(t => t && t[x])) continue;
    const zx = zero(); zx[x] = z[x];
    let s = 0;
    for (let j = 0; j < wb.length; j++) s += Math.max(0, wb[j] * tiltW(ts[j], zx));
    const g = wb[i] * tiltW(ts[i], zx) / s / p0;
    if (g > bg) { bg = g; best = x; }
  }
  return best ? WHY[best][z[best] > 0 ? 0 : 1] : null;
}

// ===== 界面上的词 =====
const ramp = (a: number, a0: number, a1: number) => clamp((a - a0) / (a1 - a0), 0, 1);
/**
 * 界面上显示用：加上随年龄的「成熟」（敏感下降，认真、随和上升，外向、敢闯慢慢下降）和性别差（女性敏感 +0.35）。估计，依据 Bleidorn 2022、Zhang 2019、CFPS 2018。
 * 性别差到青春期才出现，成熟是成年以后的事：10 岁以前都不加，10–18 岁逐渐加上
 */
export function shownOf(z: PZ, a: number, sex: 'M' | 'F'): PZ {
  const k = ramp(a, 10, 18), m = ramp(a, 18, 50) - 0.5;
  return {
    e: z.e + k * (0.1 - 0.3 * ramp(a, 40, 80)),
    n: z.n + k * ((sex === 'F' ? 0.175 : -0.175) - 0.6 * m),
    c: z.c + k * 0.5 * m,
    a: z.a + k * 0.4 * m,
    r: z.r - k * 0.6 * (ramp(a, 20, 70) - 0.3),
  };
}
export const shownZ = (L: Life = S): PZ => shownOf(L.pers ? L.pers.z : ZERO, L.age, L.sex);
/** 每条轴两端的名字（刻度条两头） */
export const AX_NAME: Record<Ax, [string, string]> = { e: ['外向', '内向'], n: ['敏感', '心大'], c: ['认真', '随性'], a: ['随和', '要强'], r: ['敢闯', '求稳'] };
const STRONG: Record<Ax, [string, string]> = { e: ['很外向', '很内向'], n: ['很敏感', '没心没肺'], c: ['一丝不苟', '散漫'], a: ['好脾气', '倔'], r: ['胆子大', '特别谨慎'] };
/** 一条轴的词：离中间不到半个标准差不显示，超过 1.5 个（约一成多的人）用更重的说法 */
export const axWord = (x: Ax, v: number) => Math.abs(v) < 0.5 ? null : (Math.abs(v) >= 1.5 ? STRONG : AX_NAME)[x][v > 0 ? 0 : 1];
/** 离中间最远的几条轴的词 */
export function persWords(z: PZ, n = 2) {
  return AX.filter(x => Math.abs(z[x]) >= 0.5).sort((a, b) => Math.abs(z[b]) - Math.abs(z[a])).slice(0, n).map(x => axWord(x, z[x]));
}

// ===== 对象 / 配偶的性格 =====
// 用主流的一次 rnd() 做种子在本地派生（主流消耗的次数和原来的 pick(TRAITS) 一样）。
// 和你的性格相关约 0.12（伴侣之间大五的相关只有 0.06–0.16，Horwitz 2023、CFPS 2018 夫妻样本）。成年人，固定不变
export function partnerPz(r01: number): PZ {
  let st = Math.floor(r01 * 4294967296) | 0;
  const r = () => {
    let t = (st = (st + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const me = S.pers ? S.pers.z : ZERO, out = zero();
  for (const x of AX) { const u = 1 - r(), v = r(); out[x] = 0.12 * me[x] + 0.993 * Math.sqrt(-2 * flog(u)) * fcos(2 * Math.PI * v); }
  return out;
}
/** 对象的性格标签（恋爱卡、抉择卡片上显示） */
export const partnerTrait = (p: { pz?: PZ; trait: string; age: number; sex: 'M' | 'F' }) => p.pz ? persWords(shownOf(p.pz, p.age, p.sex), 2).join('、') || '温和' : p.trait;

// ===== 小学的成绩报告单：一年级上学期期末（公历 1 月），班主任评语按性格写 =====
const REMARK: Record<Ax, [string, string]> = {
  e: ['上课积极举手发言，和同学相处融洽', '文静内向，希望以后多和同学交流、大胆发言'],
  n: ['心思细腻，遇到事情容易紧张，要相信自己', '遇事不慌，不计较小事'],
  c: ['作业认真，字迹工整', '脑子灵活，就是有点粗心，上课爱做小动作'],
  a: ['懂礼貌，乐于帮助同学', '很有主见，有时会和同学争执'],
  r: ['胆子大，好奇心强，下课总是跑得最远', '做事稳当，不冒失'],
};
// 读起来自相矛盾的两句不同时写（「容易紧张」和「胆子大」、「积极发言」和「容易紧张」、「做事稳当」和「上课爱做小动作」），只留离中间更远的那条
const CLASH = new Set(['n+r+', 'e+n+', 'r-c-']);
export function reportCard() {
  if (!S.pers) return;
  const z = shownZ();
  const key = (x: Ax) => x + (z[x] > 0 ? '+' : '-'), ax: Ax[] = [];
  for (const x of AX.filter(x => Math.abs(z[x]) >= 0.5).sort((a, b) => Math.abs(z[b]) - Math.abs(z[a]))) {
    if (ax.length < 3 && !ax.some(y => CLASH.has(key(x) + key(y)) || CLASH.has(key(y) + key(x)))) ax.push(x);
  }
  const t = '该生' + (ax.length ? ax.map(x => REMARK[x][z[x] > 0 ? 0 : 1]).join('；') : '各方面表现良好，是个让老师省心的孩子') + '。望继续努力！';
  addDoc('report', '小学成绩报告单', [['姓名', S.name], ['年级', '一年级（上）'], ['学校', primarySchool()], ['学年', `${calYear() - 1}–${calYear()}`], ['班主任评语', t], ['家长意见', parentReply()]]);
  log(`一年级的成绩报告单发下来了。班主任评语：“${t}”`, 'ev');
}
