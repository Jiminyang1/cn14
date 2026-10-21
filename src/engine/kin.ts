// 家里的几件大事：老房子拆迁、给孩子买婚房、兄弟姐妹之间的钱。
// 抉择本身（标题、选项）在 content/decisions.ts 的 demolish / kidhome / sibloan / heritage，这里是规则和之后每年的后续。
// 数字的出处见 DATA.md「拆迁」「婚房」「兄弟姐妹」。
import { demolDoc } from './docs';
import type { Kid, Sibling } from './types';
import { S } from './state';
import { log, out } from './journal';
import { chance, ri } from './rng';
import { eff } from './stats';
import { brideAmt } from './romance';
import { placeHp, placeInc } from './place';
import { kidsAlive, sibsAlive } from './family';
import { parentsWord } from './parents';
import { wan } from './format';

declare module './types' {
  interface Kid { help?: number } // 孩子结婚时家里帮了多少，孩子一直记着：和你亲疏的目标值高低多少（actions.ts 的 closeYear）
}

// ===== 拆迁 =====
// 父母家的老房子每年被征收的概率（估计）。参照：2013–2022 年全国棚户区改造累计开工 4300 多万套（住建部），
// 约为全国家庭户（2020 年普查 4.94 亿户）的 9%，即高峰期每年约 0.9%。棚改高峰过去以后，城中村改造的规模小得多，
// 这里按大城市、省会 0.3%，一般城市 0.2%，农村（征地）0.1% 估计
export const DEMOL_P = { big: 0.003, capital: 0.003, city: 0.002, rural: 0.001 };
// 补偿是房子估价的多少倍（估计）。条例规定货币补偿不低于类似房地产的市场价格，另有搬迁费、按期签约的奖励；
// 产权调换换到的安置房一般面积更大或位置更好，但要等安置房建好；农村征地另有土地补偿和安置补助，倍数更高
export const DEMOL_K = { cash: { urban: 1.25, rural: 2 }, swap: { urban: 1.4, rural: 2.4 }, swapWait: 3 };
// 补偿款怎么花（估计）：六成给父母换一套房，孩子已经工作的，再拿出三成分给孩子们，剩下的存起来
const DEMOL_HOUSE = 0.6, DEMOL_GIFT = 0.3;

const famLiving = () => S.fam.mom.alive || S.fam.dad.alive;
/** 这一年家里的老房子会不会被征收（只抽一次，抽中了就不会再有） */
export function demolDue() {
  const H = S.famHouse;
  if (S.flags.demol != null || !H || !['self', 'own'].includes(H.type) || !(H.v > 0) || !famLiving()) return false;
  return chance(DEMOL_P[S.home.kind] ?? 0.002);
}
const ur = () => S.home.kind === 'rural' ? 'rural' : 'urban';
function demolCash(mult: number) {
  const H = S.famHouse, total = Math.round(H.v * DEMOL_K.cash[ur()] * mult / 1e3) * 1e3;
  const gift = S.indep ? total * DEMOL_GIFT : 0, mine = gift / (1 + sibsAlive().length);
  S.famHouse = { type: 'own', v: Math.round(total * DEMOL_HOUSE / 1e3) * 1e3, where: H.where };
  S.famMoney += total * (1 - DEMOL_HOUSE) - gift;
  if (mine) S.money += mine;
  return { total, mine };
}
/** 拆迁怎么选：cash 货币补偿、swap 产权调换（等几年换安置房）、hold 先不签 */
export function demolish(k: string) {
  const H = S.famHouse, old = S.home.kind === 'rural' ? '老家的宅子' : '家里的老房子';
  S.flags.demol = S.age;
  if (k === 'hold') {
    S.flags.demolHold = S.age; eff({ h: -3 });
    return `${old}划进了征收范围。补偿方案贴出来以后，${parentsWord() || '家里'}觉得给少了，没有签字。邻居一家家搬走，墙上的“拆”字越画越多。`;
  }
  if (k === 'swap') {
    S.famHouse = { ...H, v: Math.round(H.v * DEMOL_K.swap[ur()] / 1e3) * 1e3 };
    S.flags.demolSwap = S.age + DEMOL_K.swapWait;
    demolDoc('产权调换 · 安置房一套');
    eff({ h: 2 });
    return { x: 1, t: `${old}拆迁了。${parentsWord() || '家里'}选了产权调换：等安置房建好，换一套新楼房。这几年先在外面租房住，按月领临时安置费。`, k: 'good' as const };
  }
  const { total, mine } = demolCash(1);
  demolDoc(`货币补偿 ${wan(total)}`);
  eff({ h: 4 });
  return { x: 1, t: `${old}拆迁了，选了货币补偿，一共拿到约${wan(total)}。${parentsWord() || '家里'}在附近买了一套小一点的房子${mine ? `，还给你们兄弟姐妹每人分了约${wan(mine)}` : '，剩下的钱存了起来'}。`, k: 'good' as const };
}

// ===== 给孩子办婚事 =====
// 孩子要结婚的那一年先标记 wed，由抉择 kidhome 决定家里出多少钱，再真正结婚
export const weddingKid = (): Kid | undefined => kidsAlive().find(k => k.wed === 1);
export function kidHomeCost(k: Kid) {
  const price = Math.round(placeHp(S.loc) * 90 / 1e4) * 1e4;
  const down = Math.round(price * 0.3 / 1e3) * 1e3;                       // 首付按三成（首套最低 15%，多数人付得更多，估计）
  const bride = k.sex === 'M' ? brideAmt(S.loc.p) : 0;
  const car = Math.round(placeInc() * 1.2 / 1e3) * 1e3;                   // 陪嫁一辆车（估计）
  const feast = Math.round(placeInc() * 0.3 / 1e3) * 1e3;                 // 酒席
  return { price, down, bride, car, feast };
}
// 帮没帮，孩子一直记着（亲疏的目标值）：首付全包 +12、出一部分 +6；儿子的婚房一分没出 −10，女儿没另外陪嫁 −4（估计）
export const KID_HELP = { all: 12, part: 6, noneSon: -10, noneDau: -4 };
export function marryKid(k: Kid, spend: number, help = 0) {
  k.wed = 0; k.married = 1; k.help = help;
  k.close = Math.max(0, Math.min(100, (k.close ?? 70) + help)); // 当下就看得出来
  eff({ money: -spend });
}

// ===== 兄弟姐妹 =====
/** 儿子娶亲，家里出彩礼（兄弟结婚、你自己结婚都一样）：先用父母的存款，不够的部分父母去借，记成家里的欠款。返回其中借了多少 */
export function famPayBride(amt: number) {
  S.famMoney -= amt;
  if (S.famMoney >= 0) return 0;
  const borrowed = -S.famMoney; S.famMoney = 0;
  if (!S.famDebt) { S.famDebt0 = 0; S.famDebtWhy = '办婚事、彩礼'; }
  S.famDebt += borrowed; S.famDebt0 += borrowed;
  return borrowed;
}
/** 兄弟姐妹结婚（随机事件 sibWed）：儿子娶亲家里出彩礼，女儿出嫁家里收彩礼 */
export const sibToWed = () => sibsAlive().find(s => !s.married && s.age >= 24 && s.age <= 34);
export function sibWed() {
  const s = sibToWed() as Sibling, amt = brideAmt(S.home.p);
  s.married = S.age;
  eff({ h: 1, so: 1 });
  const f = '2023 年农村彩礼平均约 3.86 万元（中国农业科学院农村调查），热点地区 10–30 万元';
  if (s.sex === 'M') {
    const borrowed = famPayBride(amt);
    const mine = S.indep && S.age >= 22 ? Math.round(placeInc() * 0.3 / 1e2) * 1e2 : 0;
    if (mine) eff({ money: -mine });
    return { t: `${s.rel}结婚了。家里给女方出了${wan(amt)}彩礼${borrowed > 1e3 ? `，其中${wan(borrowed)}是借的` : ''}。${mine ? `你包了${wan(mine)}的红包，回去帮着张罗了酒席。` : ''}`, f };
  }
  S.famMoney += amt * 0.5; // 收到的彩礼一半做陪嫁带走，一半留在家里（估计）
  const bro = S.sex === 'M' || sibsAlive().some(x => x !== s && x.sex === 'M' && !x.married);
  return { t: `${s.rel}出嫁了。男方给了${wan(amt)}彩礼，一半做了陪嫁，另一半${bro ? `${parentsWord() || '家里'}说先存着，留给家里的儿子将来娶媳妇用` : `${parentsWord() || '家里'}存了起来`}。`, f };
}
// 借给兄弟姐妹的钱会不会还、几年后还（估计）
export const SIB_REPAY = { p: 0.6, years: [2, 6] as [number, number], forget: 8 };
export function lendSib(rel: string, amt: number) {
  const back = chance(SIB_REPAY.p);
  eff({ money: -amt });
  S.flags.sibLoan = { rel, amt, at: S.age, back: back ? S.age + ri(...SIB_REPAY.years) : null };
}

// ===== 生日那个月：拆迁和借钱的后续 =====
// 按月推进以后仍然留在生日那个月：这些本来就是年度判定（小时候拆迁每年抽一次），或者是按「几岁时」定好的节点
// （安置房几岁交房、先不签的拖一年、借的钱几岁还），改成按月不会更准，只会多抽随机数。
// demolDue 保持年度概率：你还小的时候在这里每年调用一次；成年以后由抉择那边每年调用一次、落在随机的月份
export function kinYear() {
  const a = S.age, F = S.flags;
  // 你还小的时候，拆迁由爸妈决定
  if (a >= 1 && a < 18 && demolDue()) out(demolish(chance(0.6) ? 'cash' : 'swap'));
  if (F.demolSwap === a) {
    F.demolSwap = null;
    log(famLiving() ? `安置房交房了。${parentsWord()}搬进了新楼，第一次住上了有电梯的房子。` : '安置房交房了，可是爸妈没能等到住进去。', famLiving() ? 'good' : 'loss');
  }
  if (F.demolHold != null && a === F.demolHold + 1) {
    F.demolHold = null;
    if (chance(0.5)) {
      const { total } = demolCash(1.2); eff({ h: 3 });
      out({ t: `拖了一年，征收方又加了一些。最后签了字，比当初的方案多拿了两成，一共约${wan(total)}。`, k: 'good' });
    } else {
      const { total } = demolCash(0.95); eff({ h: -6, so: -3 });
      out({ t: `拖了一年，补偿一分没多，过渡费倒是少领了，和亲戚邻居也闹僵了。最后还是签了，一共约${wan(total)}。`, k: 'bad' });
    }
  }
  const L = F.sibLoan;
  if (L) {
    if (L.back === a) { S.money += L.amt; F.sibLoan = null; out({ t: `${L.rel}把当年借的${wan(L.amt)}还上了，还硬塞给你一条烟、两瓶酒。`, k: 'good' }); }
    else if (L.back == null && a - L.at >= SIB_REPAY.forget) { F.sibLoan = null; eff({ h: -2 }); log(`借给${L.rel}的${wan(L.amt)}，${a - L.at}年了再也没提过。你也一直没好意思开口。`); }
  }
}
