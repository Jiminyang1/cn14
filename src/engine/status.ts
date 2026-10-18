// 此刻的状态：哪些东西正在推着健康、幸福、人际、学识往上或往下（界面「二、体检与鉴定」下面列出来）。
// · 目标值（t）：stats.ts 的 hlTarget / hTarget / soTarget 拆成一项一项，状态会慢慢靠过去；tests/status.test.ts 核对每一项加起来和结算用的一样；
// · 每年直接加减（y）：职业对健康、格子、持续的计划、拮据、上了年纪的学识（stats.ts 的 bodyMonth、focus.ts、plans.ts、drift 开头）；
// · 只读状态，不改任何东西，也不用随机数。
import { S } from './state';
import { FOCUS, slotW } from './focus';
import { JOBS, isWorking } from './career';
import { liquidBalance } from './accounts';
import { placeInc } from './place';
import { pz } from './personality';
import { POOR_HURT, TIERS } from './budget';
import { H_BASE, H_FOCUS, H_JOB, H_KID, K_H, K_HL, K_SO, hTarget, hlExp, hlTarget, persH, persSo, poorLongNow, soTarget, tierNow } from './stats';
import { CAUSE } from './mortality';
import { Q_WORD } from './story';
import { closeWord } from './actions';
import { parentsWord } from './parents';
import { PLANS, planOpt, plansShown } from './plans';

type St = 'hl' | 'h' | 'so' | 'kn';
export type Fx = Partial<Record<St, number>>;
/** 一项状态。k：来源；n：怎么写；t：目标值抬高或压低多少；y：每年直接加减多少；act：能处理它的行动；base：底子（界面不列） */
export interface Eff { k: string; n: string; t: Fx; y: Fx; act?: string; base?: boolean }

/** 目标值拆成一项一项（含底子，加起来就是 hlTarget / hTarget / soTarget） */
export function targetTerms(): Record<'hl' | 'h' | 'so', { k: string; n: string; v: number; act?: string; base?: boolean }[]> {
  const st = S.st, f = S.fam, a = S.age, T = tierNow(), poorLong = poorLongNow();
  let kids = 0; for (const k of f.kids) if (k.alive) kids++;
  const dis = S.flags.disabled ? 1 : 0, married = !!(f.married && f.partner && f.partner.alive);
  const ill = S.flags.ill as { k?: string } | undefined;
  const c = pz('c');
  return {
    hl: [
      { k: 'age', n: '年纪', v: hlExp(a), base: true },
      { k: 'q', n: '出身 · ' + (Q_WORD[S.q] || ''), v: (S.q - 3) * 1.5 },
      { k: 'tier', n: '日子' + T.n, v: T.hl },
      { k: 'poor', n: '长期拮据', v: -poorLong * 2 },
      { k: 'neg', n: '欠着钱', v: liquidBalance() < 0 && a >= 22 ? -3 : 0 },
      { k: 'smoke', n: '抽烟', v: S.flags.smoke ? -6 : 0, act: 'quitSmoke' },
      { k: 'ill', n: ill?.k && CAUSE[ill.k] ? CAUSE[ill.k] : '生病', v: S.flags.ill ? -20 : 0 },
      { k: 'dis', n: '中风', v: -dis * 10 },
      { k: 'short', n: '付不起开销', v: S.statement && S.statement.shortfall > 0 ? -3 : 0 },
      { k: 'pers', n: c >= 0 ? '性格 · 认真' : '性格 · 随性', v: 0.8 * c },
    ],
    h: [
      { k: 'baseH', n: '底子', v: H_BASE, base: true },
      // 格子一格一项（加起来就是 H_FOCUS × focusH()）
      ...Object.keys(FOCUS).map(k => ({ k: 'slot:' + k, n: FOCUS[k].n, v: FOCUS[k].e.h && FOCUS[k].ok() ? H_FOCUS * FOCUS[k].e.h! * slotW(k) : 0 })),
      { k: 'tier', n: '日子' + T.n, v: T.h },
      { k: 'poor', n: '长期拮据', v: -poorLong * 3 },
      { k: 'rel', n: (S.relInc || 0) >= 0 ? '挣得比当地多' : '挣得比当地少', v: a < 18 ? 0 : (S.relInc || 0) * 0.4 },
      { k: 'par', n: `和${parentsWord() || '爸妈'}${closeWord(S.close?.par ?? 70)}`, v: a >= 18 && (f.mom.alive || f.dad.alive) ? ((S.close?.par ?? 70) - 60) * 0.08 : 0, act: 'visit' },
      { k: 'married', n: '结了婚', v: married ? 5 : 0 },
      { k: 'kids', n: kids + ' 个孩子', v: Math.min(6, kids * 3) },
      { k: 'soH', n: '人缘', v: (st.so - 70) * 0.2, base: true },
      { k: 'hlH', n: '身体', v: (st.hl - 60) * 0.15, base: true },
      { k: 'kid', n: '还是孩子', v: a < 18 ? H_KID : 0 },
      { k: 'job', n: JOBS[S.job]?.n || '工作', v: isWorking() ? (JOBS[S.job].h || 0) * H_JOB : 0 },
      { k: 'debt', n: '欠债太多', v: a >= 22 && liquidBalance() < -placeInc() ? -7 : 0 },
      { k: 'lb', n: '留守', v: S.flags.lb && a < 16 ? -6 : 0 },
      { k: 'seek', n: '没有工作', v: S.job === 'seeking' ? -6 : 0 },
      { k: 'dis', n: '中风', v: -dis * 4 },
      { k: 'pers', n: '性格', v: persH() },
    ],
    so: [
      { k: 'baseSo', n: '底子', v: 50, base: true },
      { k: 'married', n: '结了婚', v: f.married ? 8 : 0 },
      { k: 'kids', n: kids + ' 个孩子', v: Math.min(9, kids * 3) },
      { k: 'lb', n: '留守', v: S.flags.lb && a < 16 ? -4 : 0 },
      { k: 'old', n: '上了年纪', v: a > 75 ? -6 : 0 },
      { k: 'pers', n: '性格', v: persSo() },
    ],
  };
}

/** 每年直接加减的（不经过目标值） */
function yearly(): { k: string; n: string; y: Fx; act?: string }[] {
  const out: { k: string; n: string; y: Fx; act?: string }[] = [];
  if (isWorking()) { const J = JOBS[S.job]; if (J.hl) out.push({ k: 'job', n: J.n, y: { hl: J.hl * 0.5 } }); }
  // 格子：每格的效果（幸福走目标值，这里只算健康、学识、人际）
  for (const k of new Set(S.slots || [])) {
    if (!k || !FOCUS[k] || !FOCUS[k].ok()) continue;
    const fy: Fx = {};
    for (const [st, v] of Object.entries(FOCUS[k].e) as [St, number][]) if (st !== 'h') fy[st] = v * slotW(k);
    out.push({ k: 'slot:' + k, n: FOCUS[k].n, y: fy });
  }
  for (const k of plansShown()) { const o = planOpt(k); if (o?.e) out.push({ k: 'plan:' + k, n: PLANS[k].n, y: { ...o.e } }); }
  const T = tierNow();
  if (S.indep !== false && T === TIERS[0]) { const m = 1 + poorLongNow(); out.push({ k: 'tier', n: '日子' + T.n, y: { h: -POOR_HURT.h * m, hl: -POOR_HURT.hl * m } }); }
  if (S.age >= 68 && S.st.kn > 25) out.push({ k: 'oldKn', n: '上了年纪', y: { kn: -0.3 } });
  return out;
}

const SMALL = 0.5; // 小于这个的不列
/** 此刻在起作用的状态：同一个来源合成一条，按影响大小排；底子和很小的不列 */
export function statusNow(): Eff[] {
  const by = new Map<string, Eff>();
  const get = (k: string, n: string) => { let e = by.get(k); if (!e) { e = { k, n, t: {}, y: {} }; by.set(k, e); } return e; };
  const T = targetTerms();
  for (const st of ['hl', 'h', 'so'] as const) for (const x of T[st]) {
    if (x.base || Math.abs(x.v) < SMALL) continue;
    const e = get(x.k, x.n); e.t[st] = (e.t[st] || 0) + x.v; if (x.act) e.act = x.act;
  }
  for (const x of yearly()) {
    const e = get(x.k, x.n);
    for (const [st, v] of Object.entries(x.y) as [St, number][]) if (Math.abs(v) >= 0.05) e.y[st] = (e.y[st] || 0) + v;
    if (x.act) e.act = x.act;
  }
  const size = (e: Eff) => Object.values(e.t).reduce((s, v) => s + Math.abs(v), 0) + Object.values(e.y).reduce((s, v) => s + Math.abs(v) * 2, 0);
  return [...by.values()].filter(e => size(e) >= SMALL).sort((p, q) => size(q) - size(p));
}

// ===== 鉴定意见 =====
// 体检卡下面的一段话：按 健康 → 幸福 → 学识 → 人际 的顺序，每项最多一句。
// · 每个原因只说一次，放在它影响最大的那一项里；每句先写往上推的（最多两个），「；」后写往下拉的（最多两个，能处理的一定写、放句末）；
// · 数值在两头的，句首加一个底色（身体底子好、没什么朋友……）；没有原因也不在两头的那一项不写。
export interface Seg { t: string; act?: string }
type K4 = 'hl' | 'h' | 'kn' | 'so';
const SLOT_P: Record<string, string> = {
  study: '埋头读书', play: '玩心重', friends: '常和朋友待在一起', sport: '常运动', work: '常加班',
  love: '忙着谈恋爱', family: '时间多给了家人', hobby: '有自己的爱好', rest: '注意养身体',
};
const FIXED_P: Record<string, string> = {
  poor: '穷了好几年', neg: '手头欠着钱', smoke: '烟没戒', ill: '病还没好', dis: '中风后行动不便', short: '开销付不起',
  married: '成了家', kid: '年纪小，没什么烦恼', debt: '欠债太多', lb: '爸妈不在身边', seek: '还没找到工作',
  old: '老朋友越来越少', oldKn: '记性不如从前', 'plan:gym': '常去健身',
};
const CN_N = ['', '一', '两', '三', '四', '五', '六', '七', '八', '九'];
// 钱上的事都放进「日子」那一句（幸福），不管它对哪一项影响大
const PIN: Record<string, K4> = { tier: 'h', poor: 'h', neg: 'h', debt: 'h', short: 'h', rel: 'h' };
function phrase(e: Eff, st: K4, up: boolean) {
  if (e.k.startsWith('slot:')) return SLOT_P[e.k.slice(5)] || e.n;
  if (FIXED_P[e.k]) return FIXED_P[e.k];
  if (e.k === 'tier') return e.n === '日子普通' ? '日子过得一般' : e.n === '日子拮据' ? '日子紧巴' : e.n;
  if (e.k === 'kids') { const n = parseInt(e.n); return n === 1 ? '有个孩子' : `有${CN_N[n] || n}个孩子`; }
  if (e.k === 'job') return st === 'hl' ? (up ? '工作轻松' : '工作累人') : (up ? '工作顺心' : '工作不顺心');
  return e.n;
}
// 数值在两头时句首的底色
function baseP(st: K4, v: number): { t: string; up: boolean } | null {
  if (st === 'hl') return v >= 85 ? { t: '身体底子好', up: true } : v < 40 ? { t: '身体一年不如一年', up: false } : null;
  if (st === 'h') return v >= 80 ? { t: '心里敞亮', up: true } : v < 35 ? { t: '心里苦', up: false } : null;
  if (st === 'kn') return v >= 85 ? { t: '书读得多', up: true } : v < 25 && S.age >= 10 ? { t: '识字不多', up: false } : null;
  return v >= 85 ? { t: '人缘好', up: true } : v < 30 ? { t: '没什么朋友', up: false } : null;
}
// 每年直接加减的 y，最后会让数值停在目标值之外再多 y / (12 × 每月靠拢的比例) 的地方（月底：x += (目标 − x)·K + y/12）；
// 学识没有目标值，每年加减多少就按五倍算个分量
const YW: Record<K4, number> = { hl: 1 / (12 * K_HL), h: 1 / (12 * K_H), so: 1 / (12 * K_SO), kn: 5 };
/** 一个原因对某一项的分量：目标值 + 每年直接加减的折算 */
export const effOn = (e: Eff, st: K4) => (e.t[st] || 0) + (e.y[st] || 0) * YW[st];
/** 照现在这样过下去，健康、幸福、人际最后停在哪（目标值 + 每年直接加减的折算）；学识只看每年加减的方向 */
export function heading(): { hl: number; h: number; so: number; kn: number } {
  const y: Fx = {};
  for (const x of yearly()) for (const [st, v] of Object.entries(x.y) as [St, number][]) y[st] = (y[st] || 0) + v;
  const c = (v: number) => Math.max(0, Math.min(100, v));
  return { hl: c(hlTarget() + (y.hl || 0) * YW.hl), h: c(hTarget() + (y.h || 0) * YW.h), so: c(soTarget() + (y.so || 0) * YW.so), kn: y.kn || 0 };
}
/** 鉴定意见：一段话，切成几段，能处理的那几段带行动 */
export function opinion(): Seg[] {
  if (S.age < 3) return [];
  const list = statusNow().filter(e => e.k !== 'pers' && e.k !== 'q');
  const ORDER: K4[] = ['hl', 'h', 'kn', 'so'];
  const by: Record<K4, { e: Eff; w: number }[]> = { hl: [], h: [], kn: [], so: [] };
  for (const e of list) {
    let best: K4 | null = PIN[e.k] || null, bw = best ? effOn(e, best) : 0;
    if (!PIN[e.k]) for (const st of ORDER) { const w = effOn(e, st); if (Math.abs(w) > Math.abs(bw)) { best = st; bw = w; } }
    if (best && Math.abs(bw) >= 0.5) by[best].push({ e, w: bw });
  }
  const out: Seg[] = [];
  for (const st of ORDER) {
    const xs = by[st].sort((p, q) => Math.abs(q.w) - Math.abs(p.w));
    const pos = xs.filter(x => x.w > 0).slice(0, 2);
    const negAll = xs.filter(x => x.w < 0);
    let neg = negAll.slice(0, 2);
    const fix = negAll.find(x => x.e.act);
    if (fix && !neg.includes(fix)) neg = [neg[0], fix];
    neg = [...neg.filter(x => !x.e.act), ...neg.filter(x => x.e.act)];
    const b = baseP(st, S.st[st]);
    // 好的底色放句首，不好的底色放到「；」后面打头
    const first: Seg[] = [...(b?.up ? [{ t: b.t }] : []), ...pos.map(x => ({ t: phrase(x.e, st, true) }))];
    const second: Seg[] = [...(b && !b.up ? [{ t: b.t }] : []), ...neg.map(x => ({ t: phrase(x.e, st, false), act: x.e.act }))];
    if (!first.length && !second.length) continue;
    first.forEach((g, i) => { if (i) out.push({ t: '，' }); out.push(g); });
    if (first.length && second.length) out.push({ t: '；' });
    second.forEach((g, i) => { if (i) out.push({ t: '，' }); out.push(g); });
    out.push({ t: '。' });
  }
  return out;
}
