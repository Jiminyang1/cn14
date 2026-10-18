// 此刻的状态：哪些东西正在推着健康、幸福、人际、学识往上或往下（界面「二、体检与鉴定」下面列出来）。
// · 目标值（t）：stats.ts 的 hlTarget / hTarget / soTarget 拆成一项一项，状态会慢慢靠过去；tests/status.test.ts 核对每一项加起来和结算用的一样；
// · 每年直接加减（y）：职业对健康、格子、持续的计划、拮据、上了年纪的学识（stats.ts 的 bodyMonth、focus.ts、plans.ts、drift 开头）；
// · 只读状态，不改任何东西，也不用随机数。
import { S } from './state';
import { FOCUS, focusH, slotW } from './focus';
import { JOBS, isWorking } from './career';
import { liquidBalance } from './accounts';
import { placeInc } from './place';
import { pz } from './personality';
import { POOR_HURT, TIERS } from './budget';
import { H_BASE, H_FOCUS, H_JOB, H_KID, hlExp, persH, persSo, poorLongNow, tierNow } from './stats';
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
  const slots = [...new Set(S.slots || [])].filter(Boolean).map(k => FOCUS[k]?.n).join('、');
  const ill = S.flags.ill as { k?: string } | undefined;
  const c = pz('c');
  return {
    hl: [
      { k: 'age', n: '年纪', v: hlExp(a), base: true },
      { k: 'q', n: '出身 · ' + (Q_WORD[S.q] || ''), v: (S.q - 3) * 1.5 },
      { k: 'tier', n: '过日子 · ' + T.n, v: T.hl },
      { k: 'poor', n: '长期拮据', v: -poorLong * 2 },
      { k: 'neg', n: '手头欠钱', v: liquidBalance() < 0 && a >= 22 ? -3 : 0 },
      { k: 'smoke', n: '抽烟', v: S.flags.smoke ? -6 : 0, act: 'quitSmoke' },
      { k: 'ill', n: '生病' + (ill?.k && CAUSE[ill.k] ? ' · ' + CAUSE[ill.k] : ''), v: S.flags.ill ? -20 : 0 },
      { k: 'dis', n: '中风后行动不便', v: -dis * 10 },
      { k: 'short', n: '付不起开销', v: S.statement && S.statement.shortfall > 0 ? -3 : 0 },
      { k: 'pers', n: c >= 0 ? '性格 · 认真' : '性格 · 随性', v: 0.8 * c },
    ],
    h: [
      { k: 'baseH', n: '底子', v: H_BASE, base: true },
      { k: 'slots', n: '时间 · ' + slots, v: H_FOCUS * focusH() },
      { k: 'tier', n: '过日子 · ' + T.n, v: T.h },
      { k: 'poor', n: '长期拮据', v: -poorLong * 3 },
      { k: 'rel', n: (S.relInc || 0) >= 0 ? '收入比当地高' : '收入比当地低', v: a < 18 ? 0 : (S.relInc || 0) * 0.4 },
      { k: 'par', n: `和${parentsWord() || '爸妈'} · ${closeWord(S.close?.par ?? 70)}`, v: a >= 18 && (f.mom.alive || f.dad.alive) ? ((S.close?.par ?? 70) - 60) * 0.08 : 0, act: 'visit' },
      { k: 'married', n: '结了婚', v: married ? 5 : 0 },
      { k: 'kids', n: kids + ' 个孩子', v: Math.min(6, kids * 3) },
      { k: 'soH', n: '人缘', v: (st.so - 70) * 0.2, base: true },
      { k: 'hlH', n: '身体', v: (st.hl - 60) * 0.15, base: true },
      { k: 'kid', n: '还是孩子', v: a < 18 ? H_KID : 0 },
      { k: 'job', n: '工作 · ' + (JOBS[S.job]?.n || ''), v: isWorking() ? (JOBS[S.job].h || 0) * H_JOB : 0 },
      { k: 'debt', n: '欠的钱太多', v: a >= 22 && liquidBalance() < -placeInc() ? -7 : 0 },
      { k: 'lb', n: '留守', v: S.flags.lb && a < 16 ? -6 : 0 },
      { k: 'seek', n: '没有工作', v: S.job === 'seeking' ? -6 : 0 },
      { k: 'dis', n: '中风后行动不便', v: -dis * 4 },
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
  if (isWorking()) { const J = JOBS[S.job]; if (J.hl) out.push({ k: 'job', n: '工作 · ' + J.n, y: { hl: J.hl * 0.5 } }); }
  // 格子：每格的效果（幸福走目标值，这里只算健康、学识、人际）
  const fy: Fx = {};
  for (const k of new Set(S.slots || [])) {
    if (!k || !FOCUS[k] || !FOCUS[k].ok()) continue;
    for (const [st, v] of Object.entries(FOCUS[k].e) as [St, number][]) if (st !== 'h') fy[st] = (fy[st] || 0) + v * slotW(k);
  }
  if (Object.keys(fy).length) out.push({ k: 'slots', n: '时间', y: fy });
  for (const k of plansShown()) { const o = planOpt(k); if (o?.e) out.push({ k: 'plan:' + k, n: PLANS[k].n + ' · ' + o.label.replace(/^办张健身卡，?常去$/, '办卡常去'), y: { ...o.e } }); }
  const T = tierNow();
  if (S.indep !== false && T === TIERS[0]) { const m = 1 + poorLongNow(); out.push({ k: 'tier', n: '过日子 · ' + T.n, y: { h: -POOR_HURT.h * m, hl: -POOR_HURT.hl * m } }); }
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
  // 时间格子：目标值那条叫「时间 · 养身体、工作」，每年那条叫「时间」，以前一条的名字为准
  const size = (e: Eff) => Object.values(e.t).reduce((s, v) => s + Math.abs(v), 0) + Object.values(e.y).reduce((s, v) => s + Math.abs(v) * 2, 0);
  return [...by.values()].filter(e => size(e) >= SMALL).sort((p, q) => size(q) - size(p));
}
