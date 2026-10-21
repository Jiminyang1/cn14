// 持续的计划：设好以后每个月自动生效，直到你改掉（生活方式、理财、健身、定期体检……）。
// 和一次性的行动（actions.ts）一起放在「行动」里：一次性的做一次就完，持续的每个月扣钱、慢慢起作用。
// · 每个计划有几个选项（opts），玩家没设过的用默认（def，自动的人生也用它，可以按处境定）；
// · 每个月月底（plansMonth，在 moneyMonth 之前）：按选项扣这个月的钱（monthly），只从现金里出，钱不够就停掉、回到默认，
//   时间线上写一句；再按 e 给体检与鉴定加减（一整年的量，每月 1/12）；最后调用模块自己的 month；
// · 生日那个月（plansYear）：调用模块自己的 year；
// · 玩家改选项是一条输入（game/replay.ts 的 applyInput，type 'plan'），重放时一样。
// 模块各自一个文件（plans/*.ts），用 definePlan 注册，engine/index.ts 引入它们。
import { S } from './state';
import { clamp } from './rng';
import { log } from './journal';
import { calMonth, calYear } from './monthly';
import { liquidBalance } from './accounts';

declare module './types' {
  interface Life {
    plans?: Record<string, string>;  // 玩家设过的计划：计划名 → 选项
    planSpend?: number;              // 这个月花在持续计划上的钱（moneyMonth 记进账单后清零）
  }
  interface MonthlyStatement { plans?: number } // 持续计划这个月花的钱
  interface LogEntry { pk?: string }             // 改计划时写的那一句：哪个计划（同一个月再改就换掉这一句）
}

type St = 'hl' | 'h' | 'kn' | 'so';
/** 计划的一个选项。monthly：每个月要花多少（没有就是不花钱）；e：一整年对体检与鉴定的影响 */
export interface PlanOpt { k: string; label: string; sub?: () => string; monthly?: () => number; e?: Partial<Record<St, number>> }
export interface Plan {
  n: string;                         // 名字（「生活方式」「理财」「健身」）
  g: 'life' | 'money' | 'health';    // 分在哪一栏
  d: () => string;                   // 一句话说明
  ok: () => boolean;                 // 现在能不能设（不能的不显示，也不生效）
  opts: PlanOpt[];
  def: () => string;                 // 默认选项：玩家没设过时用；自动抉择、无界面的人生也用它
  month?: (k: string) => void;       // 每个月月底，扣完钱、加完减完以后（行情、体检……）
  year?: (k: string) => void;        // 生日那个月
  say?: (k: string, old: string) => string | null; // 玩家改了选项，时间线上写一句（不写就是 null）
}
export const PLANS: Record<string, Plan> = {};
export function definePlan(k: string, p: Plan) { PLANS[k] = p; }

/** 计划 k 现在用的是哪个选项；现在设不了的是 null */
export function planOf(k: string): string | null {
  const P = PLANS[k]; if (!P || !P.ok()) return null;
  const v = S.plans?.[k];
  return v && P.opts.some(o => o.k === v) ? v : P.def();
}
export const planOpt = (k: string) => { const v = planOf(k); return v == null ? null : PLANS[k].opts.find(o => o.k === v) || null; };
/** 现在能设的计划（界面列出来的） */
export const plansShown = () => Object.keys(PLANS).filter(k => PLANS[k].ok());

/** 玩家改选项（输入 'plan'） */
export function setPlan(k: string, v: string) {
  const P = PLANS[k]; if (!P || !P.ok() || !P.opts.some(o => o.k === v)) return;
  const old = planOf(k) || P.def();
  (S.plans ||= {})[k] = v;
  if (old === v) return;
  // 同一个月里来回改同一项，时间线上只留最后一句
  const top = S.log[0];
  if (top && top.pk === k && top.a === S.age && top.y === calYear() && top.m === calMonth()) S.log.shift();
  const t = P.say?.(v, old);
  if (t) { log(t, 'ev'); S.log[0].pk = k; }
}

/** 每个月月底：扣钱、加减状态、模块自己的事。在 moneyMonth 之前（花的钱记进这个月的账单） */
export function plansMonth() {
  S.planSpend = 0;
  for (const k in PLANS) {
    const v = planOf(k); if (v == null) continue;
    const P = PLANS[k], o = P.opts.find(x => x.k === v); if (!o) continue;
    const c = o.monthly ? Math.max(0, o.monthly()) : 0;
    if (c > 0) {
      // 只从现金里出：钱不够就停掉，回到默认（默认通常不花钱）
      if (liquidBalance() < c) {
        if (S.plans?.[k] && S.plans[k] !== P.def()) { S.plans[k] = P.def(); log(`手头紧了，${P.n}先停了。`, 'bad'); }
        continue;
      }
      S.money -= c; S.planSpend += c;
    }
    if (o.e) for (const st in o.e) S.st[st] = clamp(S.st[st] + o.e[st] / 12, 0, 100);
    P.month?.(v);
  }
}
/** 生日那个月：模块自己的事 */
export function plansYear() {
  for (const k in PLANS) { const v = planOf(k); if (v != null) PLANS[k].year?.(v); }
}
