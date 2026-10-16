// 住房公积金与房贷：账户缴存、商业贷款 / 公积金贷款 / 组合贷、按月等额本息还款、提前还款、断供。
// 规则参数集中在 LOAN_RULES；research/housing_loans.json 核实后，由 real.js 覆盖（见 tools/build_real.py）。

// 来源与日期见 research/housing_loans.json（2026-10 核实）
const LOAN_RULES = {
  comRate: 0.031,              // 商业贷款：新发放个人住房贷款加权平均利率约 3.1%（5 年期 LPR 3.5%）
  hpfRate: 0.026,              // 公积金贷款：首套 5 年以上 2.6%（2025-05 起）
  hpfDeposit: 0.015,           // 公积金账户存款利率 1.5%
  downCom: 0.15,               // 商贷最低首付 15%（2024-09 起）
  downHpf: 0.2,                // 公积金贷款首付按 20%（各地不一）
  hpfMinYears: 1,              // 多数城市要求连续缴存 6–12 个月
  balanceMult: 15,             // 可贷额度 ≈ 账户余额 × 倍数（只有少数城市核实，粗略）
  comMaxAge: 70,               // 商贷：借款人年龄 + 年限 ≤ 70
  comMaxTerm: 40,              // 商贷最长 40 年（2026-08-28 起）
  hpfAgeOverRetire: 5,         // 公积金贷款：还到退休后 5 年，一般不超过 68 岁
  hpfMaxAge: 68,
  maxTerm: 30,                 // 公积金贷款最长 30 年
  dti: 0.5,                    // 月供不超过月收入的 50%（全部负债不超过 60%）
  // 公积金贷款最高额度（元）：single 个人，couple 夫妻都缴存；kids 多孩家庭上浮比例
  caps: {
    北京: { single: 1200000, couple: 2400000, kids: 400000 },
    上海: { single: 1200000, couple: 2400000, kidsK: 1.2 },
    深圳: { single: 700000, couple: 1300000, kidsK: 1.7 },
    广州: { single: 1000000, couple: 2000000, kidsK: 1.5 },
    杭州: { single: 900000, couple: 1800000, kidsK: 1.5 },
    成都: { single: 800000, couple: 1200000 },
    武汉: { single: 1200000, couple: 1500000 },
    西安: { single: 900000, couple: 1200000, kidsK: 1.2 },
    南宁: { single: 900000, couple: 900000 },
    郑州: { single: 1200000, couple: 1200000, kidsK: 1.2 },
    济南: { single: 900000, couple: 1300000 },
  },
  capCapital: { single: 800000, couple: 1200000 },  // 其他省会（按已核实省会的中间水平估计）
  capTypical: { single: 500000, couple: 800000 },   // 普通地级市、县城（参考广东地级市）
  rentDraw: 0.6,               // 租房提取：每年可取房租的一部分
  forecloseK: 0.74,            // 法拍成交价约为评估价的 74%（2025 年约 11.3 万套住宅法拍成交）
};

// 哪些工作有公积金：[有公积金的概率, 单位和个人各自的缴存比例]
// 公积金覆盖：2024 年实缴职工 1.76 亿，约占城镇就业的 37%（各职业的比例为估计，按总覆盖率校准）
const HPF_JOB = {
  civil: [1, 0.12], teacher: [0.98, 0.12], doctor: [0.98, 0.12], nurse: [0.9, 0.1],
  tech: [0.9, 0.12], engineer: [0.7, 0.08], clerk: [0.45, 0.07], sales: [0.25, 0.05],
  skilled: [0.35, 0.05], factory: [0.2, 0.05], migrant: [0.04, 0.05], build: [0.02, 0.05],
  boss: [0.15, 0.05], shop: [0, 0], rider: [0, 0], driver: [0, 0], farmer: [0, 0],
};
function hpfStart(job) {
  const r = HPF_JOB[job];
  const on = !!r && chance(r[0]);
  if (!on) { S.hpfOn = false; S.hpfY = 0; return; }
  if (!S.hpfOn) S.hpfY = 0; // 断缴后重新计算连续缴存年数
  S.hpfOn = true; S.hpfRate = r[1];
}

// 等额本息：每年还款额（按月计算后 ×12）
function annualPay(principal, rate, years) {
  if (principal <= 0 || years <= 0) return 0;
  const r = rate / 12, n = years * 12;
  return principal * r / (1 - Math.pow(1 + r, -n)) * 12;
}
const totalInterest = (principal, rate, years) => annualPay(principal, rate, years) * years - principal;

function hpfCap(L, couple) {
  const c = LOAN_RULES.caps[L.city] || (L.kind === 'capital' || L.kind === 'big' ? LOAN_RULES.capCapital : LOAN_RULES.capTypical);
  const base = couple ? c.couple : c.single;
  const multi = S.fam.kids.filter(k => k.alive).length >= 2;
  return multi ? (c.kids ? base + c.kids : base * (c.kidsK || 1)) : base;
}
const partnerHpf = () => !!(S.fam.married && S.fam.partner && S.fam.partner.alive && S.fam.partner.hpf);
const hhIncome = () => S.income + (S.fam.married && S.fam.partner && S.fam.partner.alive ? S.fam.partner.inc : 0);
// 父母能拿出的钱：按家境对应的城乡收入五等份组人均可支配收入（统计年鉴 6-7 / 6-12，2024）× 积蓄年数（估计）
// ===== 父母的家：收入、养老金、住房 =====
// 领城乡居民养老金的职业（其余领城镇职工养老金）
const RESID_PKEY = new Set(['farmer', 'migrant', 'build', 'rider', 'driver', 'shop', 'home']);
const parentRetired = (p, male) => p.age >= (male ? 63 : (RESID_PKEY.has(p.jk) ? 55 : 58));
// 父母的年收入：在职按工资公式（js/parents.js 的 parentWage），退休后领所在省的养老金人均水平
function parentIncome(who) {
  const p = S.fam[who], male = who === 'dad';
  if (!p.alive) return 0;
  const hp = PBY[S.home.p];
  if (parentRetired(p, male)) return RESID_PKEY.has(p.jk) ? (hp.penR || 2950) : (hp.penE || 45903);
  return parentWage(p) * PARENT_DISP;
}
// 家里的房子（出生时决定）：城镇按家境决定是否有自有住房，农村是自建房；随迁家庭在城里租房，老家有自建房
function famHouseInit() {
  const own = [0.6, 0.75, 0.88, 0.95, 0.99][S.q - 1];
  if (S.rural) S.famHouse = { type: 'self', v: Math.round(hpCounty(PBY[S.home.p]) * 0.5 * 120 / 1e3) * 1e3, where: placeName(S.home) };
  else if (chance(own)) S.famHouse = { type: 'own', v: Math.round(placeHp(S.home) * 90 * (0.7 + S.q * 0.12) / 1e3) * 1e3, where: S.home.city };
  else S.famHouse = { type: 'rent', v: 0, where: S.home.city };
}
// 出生时家里的钱：积蓄和欠款分开记。参数按以下锚点校准（research/household_wealth.json）：
// · 金融资产中位数：CHFS 2011 城镇 16,500 元、农村 3,000 元，按收入增长折算到现在约城镇 4.6 万、农村 8,500 元
// · 有负债的家庭：CHFS 2011 城镇 35%、农村 40%；农村民间借贷 43.8%（2013）；城镇有房贷 43.4%（人民银行 2019）
// · 负债 ÷ 收入：农村 1.47、城镇 1.25（CHFS 2019）
// save：积蓄约为全家年收入的几倍（中位数，按家境 1–5 档）；debtP：有欠款的概率；debt：欠款约为全家年收入的几倍（中位数）
const WEALTH0 = {
  rural: { save: [0.015, 0.045, 0.08, 0.13, 0.27], debtP: [0.48, 0.44, 0.4, 0.36, 0.3], debt: [1.35, 1.5, 1.6, 1.75, 1.9], why: ['盖房子', '看病', '办婚事、彩礼', '做生意'] },
  urban: { save: [0.04, 0.1, 0.21, 0.38, 0.77], debtP: [0.3, 0.4, 0.45, 0.5, 0.45], debt: [1.0, 1.4, 1.7, 2.0, 2.2], why: ['房贷', '房贷', '车贷和消费贷', '做生意'] },
};
const DEBT_CAP = { 车贷和消费贷: 15e4, 看病: 40e4, '办婚事、彩礼': 35e4, 盖房子: 60e4 };
function famWealthInit() {
  const W = WEALTH0[S.rural ? 'rural' : 'urban'], q = S.q - 1;
  const hhInc = famIncome() * (S.famSize || 3 + S.fam.sibs.length);
  const save = hhInc * W.save[q] * Math.exp(gauss(0, 1.0)); // 积蓄分布很偏：少数家庭存得很多
  let debt = 0;
  if (chance(W.debtP[q])) {
    debt = hhInc * W.debt[q] * Math.exp(gauss(0, 0.6));
    S.famDebtWhy = pick(W.why);
    // 租房的家庭没有房贷
    if (S.famDebtWhy === '房贷' && (!S.famHouse || S.famHouse.type !== 'own')) S.famDebtWhy = '车贷和消费贷';
    // 各类借款的上限（估计）：车贷和消费贷十几万，看病几十万，彩礼和办婚事几十万，农村盖房几十万；房贷、做生意不设上限
    const cap = DEBT_CAP[S.famDebtWhy];
    if (cap) debt = Math.min(debt, cap * (0.6 + 0.4 * rnd()));
  }
  S.famMoney = Math.round(save / 100) * 100;
  S.famDebt = S.famDebt0 = Math.round(debt / 100) * 100;
  // 房贷还剩 10–25 年；其他借款（盖房、看病、亲戚借款）用家里每年省下的钱还，年限按欠款和收入估算（只用于显示，每年重算）
  S.famDebtYears = !debt ? 0 : S.famDebtWhy === '房贷' ? ri(10, 25) : Math.min(99, Math.ceil(debt / Math.max(1, (parentIncome('mom') + parentIncome('dad')) * FAM_REPAY[S.rural ? 'rural' : 'urban'][q])));
}
const FAM_HOUSE_N = { self: '农村自建房', own: '自有住房', rent: '租房住', gone: '已由子女继承' };
// 父母家庭当下的人均可支配收入：父母的工资或养老金合计 ÷ 家里还靠他们生活的人数
const parentsPerCap = () => { const f = S.fam, n = (f.mom.alive ? 1 : 0) + (f.dad.alive ? 1 : 0) + (S.indep === false ? 1 + f.sibs.filter(x => x.age < 18).length : 0); return n ? (parentIncome('mom') + parentIncome('dad')) / n : 0; };
// 出生时的家庭人均可支配收入：由父母收入算出（familyIncomeInit）
const famIncome = () => S.famPC != null ? S.famPC : (typeof QUINT !== 'undefined' ? QUINT[S.rural ? 'rural' : 'urban'][S.q - 1] : 48e3);
// 父母能帮多少：家里实际攒下的钱，最多拿出六成
const parentsHelp = () => (S.fam.mom.alive || S.fam.dad.alive) ? Math.max(0, (S.famMoney || 0) * 0.6) : 0;

// 给一套房算出几种贷款方案
function loanPlans(price, L) {
  const R = LOAN_RULES, inc = hhIncome(), cash = S.money + parentsHelp() + (S.hpf || 0); // 有欠款时先抵扣
  const comYears = Math.max(5, Math.min(R.comMaxTerm, R.comMaxAge - S.age));
  const hpfYears = Math.max(5, Math.min(R.maxTerm, retireAge() + R.hpfAgeOverRetire - S.age, R.hpfMaxAge - S.age));
  const plans = [];
  const mk = (kind, label, down, parts) => {
    const pay = parts.reduce((t, p) => t + annualPay(p.bal, p.rate, p.years), 0);
    const interest = parts.reduce((t, p) => t + totalInterest(p.bal, p.rate, p.years), 0);
    const why = pay > inc * R.dti ? `月供${wan(pay / 12)}，超过家庭收入的一半，银行不批` : cash < down ? `首付${wan(down)}，加上爸妈帮忙和公积金也凑不齐` : '';
    plans.push({ kind, label, down, parts, pay, interest, off: !!why, why });
  };
  // 纯商贷
  // 首付：手上的钱留出半年收入应急，其余尽量多付（不超过五成），月供就少一些
  const spare = Math.max(0, cash - placeInc() * 0.5);
  const downOf = min => Math.max(price * min, Math.min(price * 0.5, spare));
  const comDown = downOf(R.downCom);
  mk('com', '商业贷款', comDown, [{ kind: 'com', bal: price - comDown, rate: R.comRate, years: comYears }]);
  // 公积金：需要连续缴存满一定年限
  if (S.hpfOn && (S.hpfY || 0) >= R.hpfMinYears) {
    const need = price - downOf(R.downHpf);
    const cap = Math.min(hpfCap(L, partnerHpf()), (S.hpf || 0) * R.balanceMult);
    if (cap >= need) mk('hpf', '公积金贷款', price - need, [{ kind: 'hpf', bal: need, rate: R.hpfRate, years: hpfYears }]);
    else if (cap > 0) mk('combo', '组合贷（公积金＋商贷）', price - need, [
      { kind: 'hpf', bal: cap, rate: R.hpfRate, years: hpfYears },
      { kind: 'com', bal: need - cap, rate: R.comRate, years: comYears },
    ]);
  }
  return plans;
}
const planSub = p => p.off ? p.why : `首付${wan(p.down)}，月供约${wan(p.pay / 12)}，${p.parts[0].years}年共付利息约${wan(p.interest)}`;
const bestPlan = plans => plans.filter(p => !p.off).sort((a, b) => a.pay - b.pay)[0] || null;

// 买下：首付先用公积金余额，再用爸妈的钱，最后是自己的存款（不够时就是欠亲戚的钱）
function buyHouse(price, L, plan) {
  let down = plan.down;
  const fromHpf = Math.min(S.hpf || 0, down); S.hpf -= fromHpf; down -= fromHpf;
  const help = Math.min(parentsHelp(), down); down -= help; S.famMoney -= help;
  S.money -= down;
  S.house = { city: L.city, p: L.p, v: price, paid: price, at: S.age };
  S.loans = plan.parts.map(p => ({ ...p, pay: annualPay(p.bal, p.rate, p.years) }));
  addDoc('house', '房产证', [['坐落', L.city], ['面积', '约90平方米'], ['价格', wan(price)], ['贷款', plan.parts.map(p => `${p.kind === 'hpf' ? '公积金' : '商贷'}${wan(p.bal)}`).join(' + ')]]);
  return { fromHpf, help };
}

// ===== 每年结算 =====
function hpfYear() {
  if (S.hpf) S.hpf *= 1 + LOAN_RULES.hpfDeposit;
  let dep = 0;
  if (isWorking() && S.hpfOn) { dep += S.income * S.hpfRate * 2; S.hpfY = (S.hpfY || 0) + 1; }
  else if (!isWorking() && S.job !== 'student') S.hpfOn = false;
  if (partnerHpf() && S.job !== 'retired') dep += S.fam.partner.inc * 0.07 * 2;
  S.hpf = (S.hpf || 0) + dep;
  // 个人缴的那一半从工资里扣
  return S.hpfOn && isWorking() ? S.income * S.hpfRate : 0;
}
// 还房贷：先用公积金余额（还贷提取），不够的从存款里出。返回从存款里付的钱。
function loanYear() {
  if (!S.loans || !S.loans.length) return 0;
  let fromCash = 0;
  for (const l of S.loans) {
    if (l.bal <= 0) continue;
    const pay = Math.min(l.pay, l.bal * (1 + l.rate));
    const interest = l.bal * l.rate;
    l.bal = Math.max(0, l.bal - (pay - interest));
    l.years--;
    if (l.years <= 0) l.bal = 0;
    const fromHpf = Math.min(S.hpf || 0, pay);
    S.hpf -= fromHpf;
    fromCash += pay - fromHpf;
  }
  S.loans = S.loans.filter(l => l.bal > 1);
  if (!S.loans.length) log('房贷终于还完了。', 'good');
  return fromCash;
}
// 租房提取：没有在这座城市买房的人，每年可以取出一部分公积金付房租
function rentDraw(rent) {
  if (!S.hpf || rent <= 0) return 0;
  const x = Math.min(S.hpf, rent * LOAN_RULES.rentDraw);
  S.hpf -= x;
  return x;
}
// 房价每年随机波动（没有方向性假设）
function houseYear() {
  if (S.house) S.house.v *= Math.exp(gauss(0, 0.04));
}
const loanBal = () => (S.loans || []).reduce((t, l) => t + l.bal, 0);
const loanPayY = () => (S.loans || []).reduce((t, l) => t + (l.bal > 0 ? l.pay : 0), 0);
// 断供：房子被法拍，按市价打折卖掉，还不清的部分仍然是欠款
function foreclose(k = LOAN_RULES.forecloseK) {
  const got = S.house.v * k;
  S.money += got - loanBal();
  S.loans = []; S.house = null; S.flags.badCredit = S.age;
  return got;
}
function sellHouse(k = 0.95) {
  const got = S.house.v * k;
  S.money += got - loanBal();
  S.loans = []; S.house = null;
  return got;
}
