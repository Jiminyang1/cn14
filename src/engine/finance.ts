// 你自己的账：经济独立、每年的收入和开销。

import { fexp, flog } from './fmath';
import { JOBS, RESID_PENSION_JOBS, expK, isWorking } from './career';
import { PBY } from './data';
import { S } from './state';
import { clamp, gauss } from './rng';
import { familyMoneyYear } from './household';
import { houseYear, hpfYear, loanYear, rentDraw } from './housing';
import { log } from './journal';
import { placeCons, placeHp, placeInc, wageBase } from './place';
import { wan } from './format';

// 经济独立：开始工作（或毕业/辍学后离开学校）才有自己的账户；之前钱的进出都算家里的
export function goIndep() {
  if (S.indep !== false) return;
  S.indep = true; S.indepAt = S.age;
  if (S.famMoney < 0 && S.flags.stuLoan) { S.money += S.famMoney; S.famMoney = 0; log(`开始工作时，身上还背着${wan(-S.money)}的助学贷款。`, 'ev'); }
}
export const SAVE_BASE = 0.2;
export function finances() {
  familyMoneyYear();
  // 这一年里已经结算过的工资（年中换过工作、被裁员）和最后这份工作从哪个时刻开始算
  const t0 = S.wageT0 || 0, acc = S.wageAcc || 0, hpfAcc = S.hpfAcc || 0;
  S.wageT0 = 0; S.wageAcc = 0; S.hpfAcc = 0;
  if (S.indep === false && S.job && !S.school && S.age >= 15) goIndep();
  if (S.indep === false) return;
  if (S.age < 16) return;
  const J = JOBS[S.job];
  let inc = acc, hpfOwn = hpfAcc;
  if (J && J.m) {
    const w = wageRate() * (J.v ? fexp(gauss(0, J.v)) : 1) * (1 - t0);
    inc += w; S.jobY++; penYear(w, 1 - t0);
    if (S.hpfOn) hpfOwn += w * S.hpfRate;
  }
  if (S.job === 'retired') {
    inc += S.pension || 0;
    // 子女赡养：成年子女每人每年给一些（按当地消费水平估计）
    const grown = S.fam.kids.filter(k => k.alive && S.age - k.bornAt >= 25).length;
    if (grown) inc += placeCons() * 0.35 * Math.min(2, grown);
  }
  S.income = Math.round(inc);
  const f = S.fam, P = placeInc();
  let hh = inc;
  hh -= hpfYear(hpfOwn); // 个人缴的公积金从工资里扣
  if (f.married && f.partner && f.partner.alive) hh += f.partner.inc;
  // 房贷先算：背着房贷的家庭会压缩日常开销（但不低于当地最低生活水平）
  const mort = loanYear();
  houseYear();
  let cost = 0;
  const adult = isWorking() || S.job === 'seeking' || S.job === 'retired' || S.job === 'home';
  if (adult) {
    // 储蓄率模型：全国居民储蓄率 ≈ (可支配收入 − 消费) ÷ 可支配收入 ≈ 32%（2025）。
    // 收入越高于当地水平，存得越多；但开销不低于当地人均消费（最低生活）。
    const adults = f.married && f.partner && f.partner.alive ? 2 : 1;
    const per = hh / adults;
    const sr = per > 0 ? clamp(SAVE_BASE + 0.15 * flog(per / P), -0.2, 0.55) : 0;
    cost = Math.max(hh * (1 - sr) - mort * 0.6, placeCons() * adults * (S.job === 'retired' ? 0.6 : 0.9));
    // 养孩子：人均消费里已经摊进了一部分孩子的开销，这里只加额外的教育、看护支出
    for (const k of f.kids) if (k.alive && k.age < 22) cost += placeCons() * 0.25;
    // 在城里租房的人，房租比当地平均水平多出一块（统计里的居住支出多为自有住房折算）
    // 老了住进养老院：每年的费用代替房租；搬去和子女同住：不付房租
    const ownHere = S.house && S.house.city === S.loc.city;
    if (S.flags.oldLive === 'home') cost += placeInc() * 0.5;
    else if (!ownHere && S.loc.kind !== 'rural' && S.flags.oldLive !== 'kid') { const rent = placeHp() * 45 * 0.018 * 0.6; cost += rent - rentDraw(rent); }
  }
  cost += mort;
  S.money += hh - cost;
  S.money *= S.money > 0 ? 1.015 : 1.04;
  S.relInc = clamp((hh / (f.married ? 1.6 : 1) / P - 1) * 6, -10, 10);
  S.stats.maxMoney = Math.max(S.stats.maxMoney, S.money);
}
// 职工养老保险的缴费记录：交了几年（y）、每年工资相对当地城镇人均可支配收入的倍数之和（r）、其中在机关事业单位的年数（s）。
// 只交城乡居民养老保险的职业（务农、打零工、个体户……）不算
// 年中离开的工作只记在岗的那部分（frac 年）；r 记的是这段工资折成一整年后的倍数 × frac，所以 r ÷ y 仍是平均倍数
export function penYear(inc: number, frac = 1) {
  if (RESID_PENSION_JOBS.has(S.job) || frac <= 0) return;
  const pv = PBY[S.loc.p], P = S.pen || (S.pen = { y: 0, r: 0, s: 0 });
  P.y += frac; P.r += inc / (pv.incU || pv.inc); if (JOBS[S.job].stable) P.s += frac;
}
// ===== 这一年的工资按实际在岗的时间算 =====
// 当前工作的年薪（不含个体户、销售的年度波动，那部分年底结算时再乘）
export const wageRate = () => { const J = JOBS[S.job]; return J && J.m ? wageBase() * J.m * S.wageK * expK() : 0; };
// 年中换工作、被裁员之前调用：把旧工作从上次结算到现在（S.t）的工资记上，公积金按旧单位的比例记上（个人那一半），养老保险记上缴费时间
export function accrueWage() {
  const dt = Math.max(0, S.t - (S.wageT0 || 0));
  S.wageT0 = S.t;
  if (!dt || !isWorking()) return;
  const w = wageRate() * dt;
  S.wageAcc = (S.wageAcc || 0) + w;
  if (S.hpfOn) S.hpfAcc = (S.hpfAcc || 0) + w * S.hpfRate;
  penYear(w, dt);
}
