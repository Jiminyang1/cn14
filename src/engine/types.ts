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
