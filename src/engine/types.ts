// 引擎用到的数据结构。

/** 省份：data.ts 里的估计值，再由 real.generated.ts 覆盖、补充 */
export interface Province {
  id: string; n: string;
  b: number;          // 出生人数（万人）
  u: number;          // 城镇化率（%）
  le: number; leM?: number; leF?: number; // 预期寿命
  inc: number; incU?: number; incR?: number; incCap?: number; // 人均可支配收入
  cons?: number; consU?: number; consR?: number;               // 人均消费支出
  hp: number; hpCap?: number; hpCounty?: number;               // 房价（元/㎡）
  ek: number;         // 高考难易系数
  imk: number;        // 婴儿死亡率倍数
  cities: string[];   // 第一个是省会
  dz: string[]; dzK?: number; dzW?: Record<string, number>; // 自然灾害
  eth: [string, number][];
  pop?: number; eduHi?: number; penE?: number; penR?: number;
  bride?: [number, number]; divK?: number; trafK?: number;
}
export interface BigCity { p: string; inc: number; hp: number }
export interface Nation { births: number; deaths: number; year: number; srb: number; order: number[]; gaokao: number; gaokaoFact?: string }

/** 一个地点：省、城市，以及是大城市 / 省会 / 普通城市 / 农村 */
export interface Loc { p: string; city: string; kind: 'big' | 'capital' | 'city' | 'rural' }

/** 抉择里的一个选项。w 是自动抉择时的权重，off 表示不可选 */
export interface Choice { k: string; label: string; sub?: string; w?: number; off?: boolean }
export interface Decision { title: string; body: string; fact?: string; form?: string; card?: [string, string][]; choices: Choice[]; ctx?: any }

/** 院校（gaokao.ts） */
export interface Uni { name: string; city: string; prov: string; tier: string; pct: number; attr: string; fee?: number; thr?: number; p?: number; taken?: number; group?: string }

// ===== 一个人的一生 =====

export type Sex = 'M' | 'F';
/** 四项状态，0–100 */
export interface Stats4 { hl: number; h: number; kn: number; so: number }

export interface Parent {
  sex: Sex; age: number; edu: number; alive: boolean; startAge: number;
  jk: string; job: string;   // 职业代码、显示名
  k: number;                 // 个人收入系数
  wloc?: Loc;                // 外出打工的城市
  ill?: number;              // 1 刚生病、2 已安排照顾
  diedAt?: number;
}
export interface Sibling { rel: string; sex: Sex; age: number }
export interface Kid { name: string; sex: Sex; bornAt: number; age: number; alive: boolean; path?: string; married?: number; gk?: number }
/** 恋爱对象 / 配偶（romance.ts 的 makePartner） */
export interface Partner {
  name: string; sur: string; sex: Sex; age: number; edu: number; home: string; rural: boolean; alive: boolean;
  metAt: number; how: string; city: string; startAge: number; k: number; q: number; trait: string;
  jk: string | null; job: string | null; inc: number; hpf: boolean; fit: number;
  love?: number; asks?: number; metParents?: number; marriedAt?: number; retired?: number;
}
export interface Family {
  mom: Parent; dad: Parent; sibs: Sibling[]; kids: Kid[];
  partner: Partner | null; married: boolean; dating: Partner | null;
  gp?: number;               // 同住的祖父母人数
}

export interface LogEntry { a: number; t: string; k: string; f: string | null }
export interface Doc { k: string; title: string; a: number; y: number; rows: [string, string][] }
export interface YearRow { a: number; h: number; hl: number; m: number; s: string }
export interface QueueItem { at: number; type: 'ev' | 'dec' | 'ms' | 'ref'; id?: string }
export type Pending = { type: 'dec'; id: string; d: Decision } | { type: 'ref'; q: string };
export interface Loan { kind: 'com' | 'hpf'; bal: number; rate: number; years: number; pay: number }
export interface House { city: string; p: string; v: number; paid: number; at: number }
export interface FamHouse { type: 'self' | 'own' | 'rent' | 'gone'; v: number; where?: string }
export interface Death { age: number; cause: string; year: number }
export interface Illness { k: string; at: number; treat?: 'big' | 'local' | 'none'; y?: number }
export interface Companion {
  name: string; sex: Sex; eth: string; born: string; place: string; rural: boolean; q: number;
  death: Death; edu: number; job: string; married: boolean; kids: number; places: string[]; tr: string[];
}

/** 一生里零散的标记（多数只在少数事件里用到） */
export interface Flags {
  solo?: boolean;            // 一辈子不结婚
  nextSib?: number | null;   // 弟弟妹妹会在你几岁时出生
  lb?: 'both' | 'one';       // 留守：父母都外出 / 一方外出
  carer?: string;            // 留守时带你的人
  mig?: number; migBack?: number; // 随迁子女；回老家中考
  ill?: Illness | null; survivor?: number; disabled?: number; illDebt?: number;
  smoke?: number; parDiv?: number; divorced?: number; exes?: number; mShift?: number; loveBoost?: number;
  tier?: string; uni?: { name: string; city: string; prov: string; tier: string }; major?: string;
  zkRedo?: number; slip?: { score: number }; stuLoan?: number;
  civilRetry?: number; civilN?: number; lastJob?: string; empIns?: number; farmStop?: number;
  badCredit?: number; heldOn?: number; supportY?: number; inherited?: number; grandkids?: number;
}

export interface Life {
  v: number; seed: number; rs: number;              // 存档版本、种子、随机数状态
  age: number; t: number;                           // 年龄；这一年过了多少（0–1）
  birthYear: number; birthMonth: number;
  name: string; surname: string; sex: Sex; eth: string;
  born: string; rural: boolean; order: number; q: number; // 出生省份、农村户籍、第几个孩子、家境（1–5）
  loc: Loc; home: Loc; places: string[];
  st: Stats4; flags: Flags;
  fam: Family; cand?: Partner | null;               // 认识了、还没决定的人
  // 学业与工作
  school: string | null; schoolEnd: number | null; edu: number;
  job: string | null; jobY: number; wageK: number; jobs: { job: string; age: number; city: string }[];
  income: number; relInc?: number; pension?: number;
  // 钱：经济独立以前算在家里
  indep: boolean; indepAt?: number; money: number;
  famMoney: number; famDebt: number; famDebt0: number; famDebtWhy?: string; famDebtYears: number;
  famHouse?: FamHouse; famPC: number; famSize: number;
  house: House | null; loans?: Loan[];
  hpf?: number; hpfOn?: boolean; hpfY?: number; hpfRate?: number;
  // 调度
  phase: 'life' | 'end'; queue: QueueItem[]; pending: Pending | null; headless: boolean;
  done: Record<string, number>; recent: string[]; focus: string | null; fT: Record<string, number>; fStart?: number; // 每年的重心：当前重心、各重心累计的时间、当前重心从哪个进度开始
  // 记录
  log: LogEntry[]; years: YearRow[]; docs?: Doc[]; notes: { a: number; q: string; t: string }[];
  stats: { maxMoney: number; support?: number; inherit?: number };
  death?: Death; comps?: Companion[];
  auto?: boolean;                                   // 自动抉择（也决定每年的重心）
}
