// 理财（持续的计划，plans.ts）：钱全存银行（照常，按 finance.ts 的存款利息走），或者拿一部分买银行理财、指数基金。
// · 理财和基金的钱放在 S.inv 里，不是现金：生活开销、首付、借给亲戚……都只看现金（S.money）；净资产算进去；
// · 生日那个月（year）：记上过去一年的收益，再按选项调仓——现金先留够半年的生活费，其余的一定比例放进理财或基金
//   （多了卖回来，少了买进去）；没选的那一样全部卖回现金；
// · 每个月月底（month）：理财、基金按这个月的行情涨跌；现金不够（不到两个月的开销，或者有欠款）就先卖理财、再卖基金补上；
//   换成「全存银行」的，当月全部卖回现金；从银行换成理财、基金的，当月就买；
// · 行情所有人生共用一条，只看公历年份（见 fundRet），不用随机数：同一年出生的同伴经历同一轮牛熊。
import { S } from '../state';
import { fpow } from '../fmath';
import { eff } from '../stats';
import { log, noteMoney, vary } from '../journal';
import { wan } from '../format';
import { MONTHS, calYear } from '../monthly';
import { placeCons } from '../place';
import { liquidBalance } from '../accounts';
import { definePlan } from '../plans';

declare module '../types' {
  interface Life {
    // 理财账户：w 银行理财、f 指数基金的余额；gw、gf 这一年（上个生日以来）两样各赚了多少；
    // x 这一年基金的行情（净值从上个生日以来乘了多少）；cw、cf 一生累计赚了多少；k、a 上一次按哪个选项、几岁那年调过仓
    inv?: { w: number; f: number; gw: number; gf: number; x: number; cw: number; cf: number; k?: string; a?: number };
  }
}

// ===== 行情 =====
// 沪深300 价格指数 2005–2025 年逐年涨跌（%，不含分红）
export const CSI300: Record<number, number> = {
  2005: -7.7, 2006: 121.0, 2007: 161.6, 2008: -66.0, 2009: 96.7, 2010: -12.5, 2011: -25.0, 2012: 7.6, 2013: -7.7, 2014: 51.7,
  2015: 5.6, 2016: -11.3, 2017: 21.8, 2018: -25.3, 2019: 36.1, 2020: 27.2, 2021: -5.2, 2022: -21.6, 2023: -11.4, 2024: 14.7, 2025: 17.7,
};
const Y0 = 2005, N = 21;
// 整数哈希（只用整数运算，各环境结果相同）
const ih = (x: number) => { let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
/** 公历 y 年按真实的哪一年走：2005–2025 就是那一年；其余的年份每 21 年一轮，整轮照搬真实的 21 年，
 *  从哪一年开始由这一轮的序号哈希定。不逐年乱抽，是为了留住真实的节奏：大牛市后面跟着暴跌，熊市一连好几年 */
export function mktYear(y: number) {
  if (y >= Y0 && y < Y0 + N) return y;
  const n = y - 2026, c = Math.floor(n / N), i = n - c * N;
  return Y0 + (i + ih(c + 7)) % N;
}
// 极端的年份打个折：真实的沪深300 这 21 年几何平均一年涨约 7.6%，几乎全靠 2006、2007 两年翻了五倍；
// 原样搬进游戏，赶上那一轮的同伴三成存款能翻几倍，基金成了印钞机。涨跌超过三成的年份按六成算（+161.6% → +97%，−66% → −40%），
// 几何平均降到一年约 5.4%：比存银行（1.5%）、理财（约 2.5%）多一些，但要扛得住好几年的下跌
const DAMP = 30, DAMP_K = 0.6;
/** 公历 y 年基金一年的涨跌（比例，0.1 是涨 10%） */
export function fundRet(y: number) {
  const r = CSI300[mktYear(y)];
  return (Math.abs(r) > DAMP ? r * DAMP_K : r) / 100;
}
/** 公历 y 年银行理财一年的收益：2%–3%，按年份小幅起伏 */
export const wealthRet = (y: number) => 0.02 + (ih(y * 31 + 5) % 11) / 1000;

// ===== 账户 =====
const inv = () => (S.inv ||= { w: 0, f: 0, gw: 0, gf: 0, x: 1, cw: 0, cf: 0 });
/** 理财和基金一共多少钱（净资产算进去，界面显示用） */
export const invBal = () => S.inv ? S.inv.w + S.inv.f : 0;
// 每个选项放进去的比例：现金扣掉半年生活费以后的一半买理财，或者三成买基金
const FRAC: Record<string, number> = { wealth: 0.5, fund: 0.3 };
const SLOT: Record<string, 'w' | 'f'> = { wealth: 'w', fund: 'f' };
// 一个月的开销：最近一次结算的生活、房租、房贷、持续计划；还没结算过的按当地人均消费
const costM = () => { const b = S.statement; return b ? Math.max(1, b.living + b.rent + b.mortgage + (b.plans || 0)) : placeCons() / MONTHS; };
const reserve = () => costM() * 6;
// 卖出 x（不超过余额），钱回到现金
function sell(c: 'w' | 'f', x: number) {
  const I = inv(), y = Math.min(Math.max(0, x), I[c]);
  I[c] -= y; S.money += y;
  if (I[c] < 1) { S.money += I[c]; I[c] = 0; }
  return y;
}
function buy(c: 'w' | 'f', x: number) {
  const y = Math.min(Math.max(0, x), S.money);
  S.money -= y; inv()[c] += y;
  return y;
}
// 调仓：没选的那一样全部卖掉；选了的那一样调到「(现金 − 半年生活费 + 已经放进去的) × 比例」。有欠款的先不买
function rebal(k: string) {
  const I = inv();
  if (k !== 'wealth') sell('w', I.w);
  if (k !== 'fund') sell('f', I.f);
  I.k = k; I.a = S.age;
  if (k === 'bank') return;
  const c = SLOT[k];
  const want = (S.debt || 0) > 0 ? I[c] : Math.max(0, (S.money - reserve() + I[c]) * FRAC[k]), d = want - I[c];
  if (Math.abs(d) >= 1000) { if (d > 0) buy(c, d); else sell(c, -d); }
}

// ===== 每个月、每年 =====
// 每个月乘的倍数（理财 w、基金 f），按公历年份缓存：只省掉重复计算，结果完全相同
const MF = new Map<number, { w: number; f: number }>();
const mf = (y: number) => {
  let v = MF.get(y);
  if (!v) MF.set(y, v = { w: fpow(1 + wealthRet(y), 1 / MONTHS), f: fpow(1 + fundRet(y), 1 / MONTHS) });
  return v;
};
/** 每个月月底：行情、补现金、换了选项的当月调仓 */
export function investMonth(k: string) {
  if (k === 'bank' && !S.inv) return; // 从来没买过的不建账户
  const I = inv(), y = calYear();
  if (I.w > 0) { const g = I.w * (mf(y).w - 1); I.w += g; I.gw += g; I.cw += g; }
  const fx = mf(y).f;
  I.x *= fx;
  if (I.f > 0) { const g = I.f * (fx - 1); I.f += g; I.gf += g; I.cf += g; }
  if (k === 'bank' ? I.w + I.f > 0 : !(I.k === k && I.a === S.age)) rebal(k);
  // 现金不够：补到三个月的开销，外加还清欠款
  const m = costM();
  if (I.w + I.f > 0 && ((S.debt || 0) > 0 || S.money < m * 2)) {
    let need = (S.debt || 0) + m * 3 - S.money;
    need -= sell('w', need);
    if (need > 0) sell('f', need);
  }
}
// 基金大涨大跌的年份写一句；x 是这一年净值乘了多少
const CN = ['', '一', '两', '三', '四', '五', '六', '七', '八', '九'];
const upWord = (x: number) => x >= 2 ? '一倍多' : x >= 1.9 ? '将近一倍' : `${CN[Math.floor((x - 1) * 10)]}成多`;
const downWord = (x: number) => { const p = Math.round((1 - x) * 10); return p === 5 ? '一半' : p > 5 ? '一大半' : `${CN[p]}成`; };
function fundSay(x: number, g: number) {
  const n = x > 1 ? upWord(x) : downWord(x);
  if (x >= 1.3) return vary('invUp', [
    `股市大涨，基金一年涨了${n}。你盯着账户看了好几天。`,
    `这一年行情好得出奇，基金涨了${n}，赚了${wan(g)}。身边的人都在聊股票。`,
    `基金一年涨了${n}。你算了算，比存银行一年的利息多出好几倍。`,
  ]);
  if (x <= 0.7) return vary('invCrash', [
    `股市暴跌，基金跌掉了${n}，亏了${wan(-g)}。你删掉了炒股软件。`,
    `股灾。基金一年跌了${n}，账上少了${wan(-g)}。你一连几个月不敢打开账户。`,
  ]);
  if (x <= 0.8) return vary('invDown', [
    `这一年行情不好，基金跌了${n}。`,
    `基金跌了${n}，账上少了${wan(-g)}。你安慰自己：没卖就不算亏。`,
  ]);
  return null;
}
/** 生日那个月：记上过去一年的收益，再调仓 */
export function investYear(k: string) {
  if (k === 'bank' && !S.inv) return;
  const I = inv(), big = I.x >= 1.3 || I.x <= 0.8;
  // 基金占了不少钱的（一万块以上），行情的大起大落会影响心情
  if (I.f >= 1e4 && !S.headless) { const t = fundSay(I.x, I.gf); if (t) log(t, I.x > 1 ? 'good' : 'bad'); }
  if (I.f >= 1e4 && big) eff({ h: I.x > 1 ? 2 : -3 });
  // 年终小结只记基金大涨大跌的年份，或者一年的盈亏超过一年的收入（至少二十万）：理财、基金年年都有一点，都记的话每年都出来一条
  if (big || Math.abs(I.gf) >= Math.max(20e4, S.net || 0)) noteMoney(I.gf > 0 ? '基金的收益' : '基金的亏损', I.gf);
  I.gw = 0; I.gf = 0; I.x = 1;
  rebal(k);
}

// ===== 自动的人生 =====
// 按处境定（不能用随机数，每个月都会问一次）：钱算上已经放进去的，换了选项也不会因为现金变少又跳回来
function autoPick() {
  const t = liquidBalance() + invBal(), y = costM() * MONTHS, r = S.pers ? S.pers.z.r : 0;
  if (t >= y * 3 && r > 0.5) return 'fund';
  if (t >= y * 1.5) return 'wealth';
  return 'bank';
}

definePlan('invest', {
  n: '理财', g: 'money',
  d: () => {
    const I = S.inv, w = I?.w || 0, f = I?.f || 0;
    if (w + f < 1) return '钱都存在银行里，一年利息约1.5%';
    return `现在${w >= 1 ? `银行理财${wan(w)}` : ''}${w >= 1 && f >= 1 ? '，' : ''}${f >= 1 ? `基金${wan(f)}` : ''}；这些不算现金，手头紧了会先卖掉补上`;
  },
  ok: () => !!S.indep && S.age >= 18,
  opts: [
    { k: 'bank', label: '全存银行', sub: () => '一年利息约1.5%，随用随取' },
    { k: 'wealth', label: '买点理财', sub: () => '留够半年的生活费，其余一半买银行理财，一年约2%–3%' },
    { k: 'fund', label: '买点基金', sub: () => '留够半年的生活费，其余三成买指数基金，跟着股市涨跌' },
  ],
  def: () => S.headless || S.auto ? autoPick() : 'bank',
  month: investMonth,
  year: investYear,
  say: k => k === 'fund' ? '开了个证券账户，买了些指数基金。' : k === 'wealth' ? '在银行买了些理财，说是稳当，比存定期多一点。'
    : (S.inv && S.inv.w + S.inv.f >= 1) ? '把理财和基金都卖了，钱放回银行，心里踏实。' : null,
});
