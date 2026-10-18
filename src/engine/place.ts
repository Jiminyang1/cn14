// 地点：地名、当地收入、消费、房价，搬家与外出打工的去向。
import { fpow } from './fmath';
import type { Loc } from './types';

import { BIG, CROSS_PROV, LEAN_OF, MIGRANT_DEST, MIGRANT_LEAN, PBY, REGION_OF } from './data';
import { CITY } from './real.generated';
import { S } from './state';
import { chance, pick, wpick } from './rng';
import { loveMove, partnerInc } from './romance';

// ===== 地点、收入、房价 =====
export const MUNI = new Set(['BJ', 'SH', 'TJ', 'CQ']);
export function placeName(L = S.loc) {
  const p = PBY[L.p];
  if (L.kind === 'rural') return MUNI.has(L.p) ? `${L.city}郊区的村子` : `${p.n}${L.city}的农村`;
  return MUNI.has(L.p) || L.kind === 'big' || L.city.startsWith(p.n) ? L.city : `${p.n}${L.city}`; // 「江苏老家的县城」这类地名本身带省名
}
// 收入、消费：城镇/农村居民人均可支配收入和消费支出（统计年鉴）；省会略高于全省城镇平均，其他城市略低
// 地级市数据（real.js 里的 CITY，约 90 个城市）优先；没有的城市用全省平均
export const cityOf = L => (CITY[L.city] && CITY[L.city].p === L.p) ? CITY[L.city] : null;
export function placeInc(L = S.loc) {
  const p = PBY[L.p], c = cityOf(L);
  if (c && L.kind === 'rural' && c.incR) return c.incR;
  if (c && L.kind !== 'rural' && c.incU) return c.incU;
  if (L.kind === 'big' && BIG[L.city]) return BIG[L.city].inc;
  if (L.kind === 'rural') return p.incR || p.inc * 0.55;
  if (L.kind === 'capital') return p.incCap || (p.incU || p.inc) * 1.1;
  return (p.incU || p.inc) * 0.95;
}
// 工资基数：城市之间的工资差距小于人均可支配收入的差距，按 0.7 的弹性随城市收入变化（估计）
export const NAT_URBAN_INC = 56502; // 2025 年全国城镇居民人均可支配收入
export const wageBase = (L = S.loc) => L.kind === 'rural' ? placeInc(L) : NAT_URBAN_INC * fpow(placeInc(L) / NAT_URBAN_INC, 0.7);
export function placeCons(L = S.loc) {
  const p = PBY[L.p];
  if (!p.consU) return placeInc(L) * 0.7;
  if (L.kind === 'rural') return p.consR;
  return p.consU * placeInc(L) / p.incU;
}
// 当地人均消费里「居住」占几成（2024 年城镇，统计年鉴表 6-27）。这一项约三分之二是自己住自己房子折算的房租，不是真的花出去的钱
// （全国城镇居住 8,008 元里现金只有 2,707 元，表 6-6）；游戏里房租、房贷另算，日常开销要先去掉折算的这部分，不然住房就算了两遍。
// 剩下的三分之一（水电燃气、物业、修修补补）还是日常开销。农村居住按两成（估计）
const HOUSE_SH: Record<string, number> = { BJ: 0.39, TJ: 0.21, HE: 0.23, SX: 0.21, NM: 0.18, LN: 0.20, JL: 0.19, HL: 0.19, SH: 0.34, JS: 0.27, ZJ: 0.23, AH: 0.21, FJ: 0.28, JX: 0.21, SD: 0.19, HA: 0.22, HB: 0.21, HN: 0.18, GD: 0.25, GX: 0.21, HI: 0.24, CQ: 0.20, SC: 0.18, GZ: 0.16, YN: 0.20, XZ: 0.20, SN: 0.22, GS: 0.20, QH: 0.22, NX: 0.18, XJ: 0.17 };
/** 当地每人一年的日常开销（不含住房） */
export const placeLive = (L = S.loc) => placeCons(L) * (1 - IMPUTED * (L.kind === 'rural' ? 0.2 : HOUSE_SH[L.p] ?? 0.22));
const IMPUTED = 0.66;
// 房价：省会用35个大中城市的新建住宅均价；其他城市用全省均价；县城用县城价（没有数据时取全省均价的七成）
export const hpCounty = p => p.hpCounty || p.hp * 0.7;
export function placeHp(L = S.loc) {
  const p = PBY[L.p], c = cityOf(L);
  if (c && (c.hpNew || c.hp) && L.kind !== 'rural') return c.hpNew || c.hp; // 政府新房均价优先，其次二手挂牌价
  if (L.kind === 'big' && BIG[L.city]) return BIG[L.city].hp;
  if (L.kind === 'rural') return hpCounty(p) * 0.6;
  if (L.kind === 'capital') return p.hpCap || p.hp * 1.4;
  return p.hp;
}
export function cityLoc(pid: string, city?: string): Loc {
  const p = PBY[pid];
  if (!city) {
    // 有人口数据时按人口加权；全省其余人口归到名单外的城市
    const known = p.cities.map(c => [c, (CITY[c] && CITY[c].pop) || 0]);
    const listed = known.reduce((t, [, w]) => t + w, 0);
    if (listed > 0) {
      const rest = Math.max(0, (p.pop || listed) - listed), unknown = known.filter(([, w]) => !w);
      const pairs = known.filter(([, w]) => w > 0);
      if (unknown.length && rest > 0) for (const [c] of unknown) pairs.push([c, rest / unknown.length]);
      city = wpick(pairs);
    } else city = p.cities.length === 1 ? p.cities[0] : chance(0.5) ? p.cities[0] : pick(p.cities.slice(1));
  }
  return { p: pid, city, kind: BIG[city] ? 'big' : city === p.cities[0] ? 'capital' : 'city' };
}
export function moveTo(L) {
  S.loc = { ...L };
  if (!S.places.includes(L.city)) S.places.push(L.city);
  if (S.fam && S.fam.dating) loveMove();
  // 结了婚一起搬；到了新的城市工资按新城市算（不然要等到下一个生日才更新）
  const pt = S.fam && S.fam.married ? S.fam.partner : null;
  if (pt) { pt.city = L.city; if (pt.alive && pt.jk && !pt.retired && pt.k != null) pt.inc = partnerInc(pt); }
  const d = S.fam && S.fam.dating;
  if (d && d.jk && d.city === L.city) d.inc = partnerInc(d); // 恋爱对象跟着来了
}
// 老家的县城（housing.ts 的 hometownHouse 在那里买房）：地名是「某省老家的县城」，和出生登记的城市名不同
export const homeCounty = (p = S.home.p) => `${PBY[p].n}老家的县城`;
// 不在老家：不在出生登记的那座城市，也不在老家的县城（在老家县城买了房、住在那里的，算在老家；原来地名对不上，算成了在外地，
// 清明「没能回去扫墓」、手头紧时还会被问要不要「回老家」）
export const awayFromHome = () => S.loc.p !== S.home.p || (S.loc.city !== S.home.city && S.loc.city !== homeCounty());
// 和爸妈不在一起住、也不在一座城市：打电话、视频、回老家看他们才说得通（接来同住、回老家照顾以后就不算）
export const farFromParents = () => awayFromHome() && !S.flags.parWithMe;
// 打工去哪座城市：城市越大、收入越高越吸引人（人口 × 收入的三次方，估计）；省内打工的，省会再 ×2；名单外的小城市不作为打工目的地
export function pullCity(pid, capK = 1) {
  const p = PBY[pid], pairs = [];
  for (const c of p.cities) {
    const d = CITY[c];
    if (!d || !d.pop) continue;
    pairs.push([c, d.pop * fpow((d.incU || p.incU || 5e4) / 5e4, 3) * (c === p.cities[0] ? capK : 1)]);
  }
  return cityLoc(pid, pairs.length ? wpick(pairs) : p.cities[0]);
}
// 外出打工：先按户籍地区决定跨不跨省（统计局 2024），省内大多去省会和较富的城市，跨省去沿海和京津的大城市
// cross 可以指定（例如随迁子女的统计口径）；不指定时按地区比例抽
export function migrantCity(cross = null, from = S.home.p) {
  if (cross === null) cross = chance(CROSS_PROV[REGION_OF[from] || 'west']);
  if (!cross) return pullCity(from, 2);
  const lean = MIGRANT_LEAN[LEAN_OF[from]] || {};
  const dests = MIGRANT_DEST.concat([['TJ', 0.5]]).filter(([pid]) => pid !== from).map(([pid, w]) => [pid, w * (lean[pid] || 1)]);
  return pullCity(wpick(dests));
}

// ===== 抉择用到的小工具 =====
export const homeCity = () => S.home.kind === 'rural' ? cityLoc(S.home.p) : S.home;
