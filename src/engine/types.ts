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
/** 性格的五条轴（personality.ts）：外向 e、敏感 n、认真 c、随和 a、敢闯 r */
export type Ax = 'e' | 'n' | 'c' | 'a' | 'r';
export type PZ = Record<Ax, number>;
/** 抉择里的一个选项。w 是自动抉择时的权重，tilt 是性格对这个权重的影响（每个标准差，见 personality.ts 的 tiltW），off 表示不可选 */
export interface Choice { k: string; label: string; sub?: string; w?: number; tilt?: Partial<PZ>; noWhy?: boolean; off?: boolean } // noWhy：自动选中时不写性格理由（读起来不对的几项）
export interface Decision { title: string; body: string; fact?: string; form?: string; card?: [string, string][]; choices: Choice[]; ctx?: any; why?: { k: string; t: string } } // why：自动抉择时性格起了明显作用，记下理由

/** 院校（gaokao.ts） */
export interface Uni { name: string; city: string; prov: string; tier: string; pct?: number; u?: number; attr: string; fee?: number; thr?: number; line?: number; ml?: Record<string, number>; w?: number; nt?: number; p?: number; taken?: number; group?: string }

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
  diedAt?: number;           // 去世时你几岁
  diedM?: number;            // 去世在你出生后的第几个月（calendar.ts 的 nowM）
}
export interface Sibling { rel: string; sex: Sex; age: number; alive: boolean; married?: number; diedAt?: number } // diedAt：去世时你几岁
/** 你的孩子。bornAt：出生时你几岁；bornM：出生在你出生后的第几个月（nowM），孩子的年龄按它算、在孩子自己的生日那个月长一岁 */
export interface Kid { name: string; sex: Sex; bornAt: number; bornM: number; age: number; alive: boolean; path?: string; married?: number; gk?: number; wed?: number } // wed=1：今年要结婚，等婚房的抉择
/** 恋爱对象 / 配偶（romance.ts 的 makePartner） */
export interface Partner {
  name: string; sur: string; sex: Sex; age: number; edu: number; home: string; rural: boolean; alive: boolean;
  metAt: number; how: string; city: string; startAge: number; k: number; q: number; trait: string;
  jk: string | null; job: string | null; inc: number; hpf: boolean; fit: number;
  love?: number; asks?: number; metParents?: number; marriedAt?: number; retired?: number;
  wh?: number;               // 对方家里要不要婚房：1 要、2 已经因为没房拒过一次求婚
  follow?: number;           // 你搬走时对方还在读书，说好毕业后来你的城市（romance.ts 的 loveMove）
  pz?: PZ;                   // 对方的性格（固定不变；关掉性格时没有）
}
export interface Family {
  mom: Parent; dad: Parent; sibs: Sibling[]; kids: Kid[];
  partner: Partner | null; married: boolean; dating: Partner | null;
  gp?: number;               // 同住的祖父母人数
}

export interface LogEntry { a: number; t: string; k: string; f: string | null; pic?: string } // pic：配一张像素插画（ui/pixel/scenes.ts 的场景名）
export interface Doc { k: string; title: string; a: number; y: number; rows: [string, string][] }
export interface YearRow { a: number; h: number; hl: number; m: number; s: string }
export interface QueueItem { at: number; type: 'ev' | 'dec' | 'ms' | 'ref' | 'day'; id?: string }
export type Pending = { type: 'dec'; id: string; d: Decision } | { type: 'ref'; q: string };
export interface Loan { kind: 'com' | 'hpf'; bal: number; rate: number; years: number; pay: number; arrears?: number }
export interface House { city: string; p: string; v: number; paid: number; at: number }
export interface InheritedHome { city: string; p: string; v: number; share: number; reviewed?: boolean }
export interface MonthlyStatement {
  year: number; month: number; opening: number; closing: number;
  events: number; transfers: number; income: number;
  incomeDetails?: { personal: number; partner: number; rehire: number; aid?: number }; // aid：低保（tight.ts）
  living: number; children: number; discretionary: number; rent: number;
  savingsSpend?: number;     // 动用积蓄的花销（budget.ts 的 savingsDraw）
  mortgage: number; mortgageInterest: number; mortgageHpf: number;
  debtRepaid: number; depositInterest: number; debtInterest: number;
  shortfall: number; arrears: number; debt: number;
}
export interface FamHouse { type: 'self' | 'own' | 'rent' | 'gone'; v: number; where?: string }
export interface Death { age: number; cause: string; year: number }
export interface Illness { k: string; at: number; treat?: 'big' | 'local' | 'none' }
export interface Companion {
  name: string; sex: Sex; eth: string; born: string; place: string; rural: boolean; q: number;
  death: Death; edu: number; job: string; married: boolean; kids: number; places: string[]; tr: string[];
  pw?: string[];             // 性格的词
}

/** 性格：天生 g、经历 k、起伏 u，z 是三者合起来（同龄同性别里的相对位置，平均 0），见 personality.ts */
export interface Pers { g: PZ; k: PZ; u: PZ; z: PZ }

/** 一生里零散的标记（多数只在少数事件里用到） */
export interface Flags {
  kid?: Record<string, string>; // 童年小抉择选了什么（content/decisions.ts 的 CHILD）
  solo?: boolean;            // 一辈子不结婚
  nextSib?: number | null;   // 弟弟妹妹会在你几岁时出生
  lb?: 'both' | 'one';       // 留守：父母都外出 / 一方外出
  lbWho?: 'dad' | 'mom' | 'both'; // 留守时外出打工的是谁（父母去世时跟着更新，见 family.ts 的 parentGone）
  carer?: string;            // 留守时带你的人（父母都外出，或者在家的那一方去世了）
  mig?: number; migBack?: number; // 随迁子女；回老家中考
  ill?: Illness | null; survivor?: number; disabled?: number; illDebt?: number;
  smoke?: number; parDiv?: number; divorced?: number /* 离婚时几岁 */; exes?: number; mShift?: number;
  tier?: string; uni?: { name: string; city: string; prov: string; tier: string }; major?: string;
  zkRedo?: number; slip?: { score: number }; stuLoan?: number;
  civilRetry?: number; civilN?: number; lastJob?: string; empIns?: number; farmStop?: number;
  badCredit?: number; heldOn?: number; widowed?: number; supportY?: number; inherited?: number; grandkids?: number;
  oldLive?: 'kid' | 'home';   // 晚年：和子女同住 / 住养老院
  parWithMe?: number;        // 爸妈和你住在一起（接来同住、回老家照顾）；你搬家他们跟着
  demol?: number; demolHold?: number | null; demolSwap?: number | null; // 老房子拆迁的年龄；先不签、等安置房（kin.ts）
  sibLoan?: { rel: string; amt: number; at: number; back: number | null } | null; // 借给兄弟姐妹的钱：几岁借的、几岁还（null 不还）
  heirDue?: number;          // 父母都走了，老房子等着兄弟姐妹商量怎么分（抉择 heritage）
  rehire?: { until: number; inc: number } | null; snowbird?: number | null; grandHelp?: number; // 退休后返聘到几岁、每年多少；候鸟过冬到几岁；去子女家带孙辈（turns.ts）
}

export interface Life {
  seed: number; rs: number; rs2?: number; rs3?: number; // 种子、主随机数状态、日常用的第二条随机数流、性格用的第三条（rng.ts）
  age: number; t: number;                           // 年龄；这一年过了多少（0–1）
  birthYear: number; birthMonth: number;
  name: string; surname: string; sex: Sex; eth: string;
  born: string; rural: boolean; order: number; q: number; // 出生省份、农村户籍、第几个孩子、家境（1–5）
  loc: Loc; home: Loc; places: string[];
  st: Stats4; flags: Flags;
  pers?: Pers;                                     // 性格（personality.ts）
  fam: Family; cand?: Partner | null;               // 认识了、还没决定的人
  // 学业与工作
  school: string | null; schoolEnd: number | null; edu: number;
  job: string | null; jobY: number; wageK: number; jobs: { job: string; age: number; city: string }[];
  empY?: number;                                   // 在现在这家单位干了几年（按月累计；经济补偿的 N 按它算，换单位就从头算）
  income: number; relInc?: number; pension?: number;
  pen?: { y: number; r: number; s: number };       // 职工养老保险缴费记录（finance.ts 的 penMonth）
  // 钱：经济独立以前算在家里
  indep: boolean; indepAt?: number; money: number;
  debt?: number; lifestyle?: number; parentLifestyle?: number;
  retirementLifestyle?: number; parentRetirementLifestyle?: number;
  statement?: MonthlyStatement;
  statements?: MonthlyStatement[];
  cashflow?: { months: number; income: number; spending: number; mortgage: number; debtRepaid: number };
  inheritedHomes?: InheritedHome[];
  famMoney: number; famDebt: number; famDebt0: number; famDebtWhy?: string; famDebtYears: number;
  famHouse?: FamHouse; famPC: number; famSize: number;
  house: House | null; loans?: Loan[];
  hpf?: number; hpfOn?: boolean; hpfY?: number; hpfRate?: number;
  // 调度
  phase: 'life' | 'end'; queue: QueueItem[]; pending: Pending | null; headless: boolean;
  month: number;                                   // 这一年的第几个月（0 = 生日那个月），见 monthly.ts
  done: Record<string, number>; recent: string[]; fT: Record<string, number>; fStart?: number; // 每年的格子（focus.ts 的 slots）：这个月各项累计的时间、上次记账的进度
  // 记录
  log: LogEntry[]; years: YearRow[]; docs?: Doc[]; notes: { a: number; q: string; t: string }[];
  stats: { maxMoney: number; support?: number; inherit?: number };
  death?: Death; comps?: Companion[];
  dayDone?: Record<string, number>;                // 日常条目上次出现的年龄（content/daily.ts）
  auto?: boolean;                                   // 自动抉择（也决定每年的重心）
  forks?: Fork[];                                   // 走过的岔路口（抉择的 fork，结局回顾用；无界面的人生不记）
}
/** 一个岔路口：几岁、哪个抉择、选了什么、没选的那几条、结果 */
export interface Fork { a: number; id: string; title: string; pick: string; alt: string[]; res: string | null }
