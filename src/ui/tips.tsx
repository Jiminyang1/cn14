// 「怎么算的」：数字旁边一个小 i，点击后弹出一张说明卡片（公式、代入这个人的数字、规则、来源）。
// 说明在点开那一刻才计算，所以数字总是最新的。
import type { ReactNode } from 'react';
import {
  DEBT_FLOOR, DEBT_FREEZE, DEBT_SR, EDU_LV, EXP0, EXP5, EXP_BLUE, EXP_PEAK, EXP_PEAK_Y, FAM_REPAY, FAM_SAVE, HPF_JOB, INS_FLEX, INS_RESID, JOBS, LE_TARGET, LOAN_RULES, LT, NAT_URBAN_INC, PARENT_K, PBY,
  PARENT_SD, PARTNER_SD, PEN_MIN_YEARS, PEN_YEARS, RESID_PENSION_JOBS, RET_DRAW, S, SAVE_BASE, WAGE_G0, WAGE_G_MAX, WAGE_REV, WEALTH0, WEALTH_MPC, clamp, expK, famIncome,
  hpCounty, incomeLuckNow, leOf, loanPayY, matePay, myPay, parentIncome, parentPay, parentRetired, parentWage, parentWorkLoc, partnerHpf, partnerLoc, partnerPay, peek, sibsAlive,
  eduRel, personK, placeHp, placeInc, placeName, socAvg, uiPay, wageBase, wageRate, wan, workExpK,
  type DedRow, type NetPay,
} from '../engine';
import { QW } from './util';

/** 算式里的一项：数值 v，名称 l；字符串是运算符 */
export type Term = string | { v: string | number; l: string };
export interface Tip {
  title: string;
  expr?: Term[]; result?: string;   // 算式 = 结果
  expr2?: Term[]; result2?: string; // 第二段算式（税前 → 到手），画在 math 的位置
  big?: string;                     // 没有算式时，直接给一个大数字
  math?: ReactNode;                 // 公式
  rows?: [string, string][];
  notes?: string[];
  src?: string;
}

const pct = (x: number) => (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%';
const T = (v: string | number, l: string): Term => ({ v, l });
const yuan = (x: number) => Math.round(x).toLocaleString('en-US') + '元'; // 算式里的基数写到元，乘出来和结果对得上
// 收入、工资、养老金、缴存这类流量按月显示（引擎按月结算），后面附上一年的量；统计年鉴的数是年度的，按 1/12 换算
const perMo = (x: number) => (Math.abs(x / 12) < 1e5 ? yuan(x / 12) : wan(x / 12)) + '/月'; // 十万以下写到元，算式乘出来对得上
const moYr = (x: number) => `≈ ${perMo(x)}（约 ${wan(x)}/年）`;
const YEARLY = '统计年鉴是年度数，这里除以 12';
/** 工资基数的说明：城镇按当地人均可支配收入向全国平均收拢，农村就是当地农村人均可支配收入 */
const baseText = (L: Parameters<typeof placeInc>[0]) => L.kind === 'rural'
  ? `${placeName(L)}农村居民人均可支配收入，每月约 ${yuan(placeInc(L) / 12)}（一年 ${wan(placeInc(L))}；${YEARLY}）`
  : `全国城镇人均每月约 ${yuan(NAT_URBAN_INC / 12)}（一年 ${wan(NAT_URBAN_INC)}）×（${placeName(L)} ÷ 全国）^0.7：${placeName(L)}城镇居民人均可支配收入一年 ${wan(placeInc(L))}，城市间工资差距比收入差距小，按 0.7 次方收拢（${YEARLY}）`;
/** 工龄曲线的说明（career.ts 的 expCurve），y 是这一行干了第几年 */
const expText = (y: number, jk: string) => {
  const b = (k: number) => JOBS[jk] && JOBS[jk].blue ? 1 + (k - 1) * EXP_BLUE : k;
  return `工作第 ${y} 年：起薪约为这一行平均的 ${pct(b(EXP0))}，前 5 年涨到 ${pct(b(EXP5))}，第 ${EXP_PEAK_Y} 年前后到 ${pct(b(EXP_PEAK))}，之后持平${JOBS[jk] && JOBS[jk].blue ? '（体力活起薪高、涨得少）' : ''}；50 岁以后每年 −1%（最多 −15%）`;
};
/** 学历溢价的说明：比这一行一般人的学历高还是低 */
const eduText = (edu: number, jk: string) => `学历 ${eduRel(edu, jk).toFixed(2)}（${EDU_LV[edu]}；这一行一般是${EDU_LV[JOBS[jk].ed ?? 2]}）`;
/** 均值为 1 的对数正态个人差异 x（σ = sd）在同龄人里约排第几百分位 */
const rankOf = (x: number, sd: number) => Math.round(100 / (1 + Math.exp(-1.702 * (Math.log(x) + sd * sd / 2) / sd)));
const sgn = (x: number) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1);

// ===== 税前 → 到手 =====
/** 第二段算式（每月）：税前 − 五险 − 公积金 − 个税 = 到手。每一项先取整，到手 = 取整后的各项相减（和引擎里的到手最多差一两元） */
function payEq(pay: NetPay): { expr2: Term[]; result2: string } {
  const g = Math.round(pay.gross / 12), i = Math.round(pay.ins / 12), h = Math.round(pay.hpf / 12), t = Math.round(pay.tax / 12);
  const insL = pay.kind === 'unit' ? '五险（个人）' : pay.kind === 'flex' ? '社保（自己交）' : '居民医保、养老';
  const expr2: Term[] = [T(yuan(g), '税前每月'), '−', T(yuan(i), insL)];
  if (h) expr2.push('−', T(yuan(h), '公积金（个人）'));
  expr2.push('−', T(yuan(t), '个税'));
  return { expr2, result2: '到手 ' + yuan(g - i - h - t) + '/月' };
}
const isBiz = (jk: string) => jk === 'shop' || jk === 'boss';
/** 五险、公积金、个税各是怎么算的；扣除项明细在 ded 里（金额按年，税法规定的是年度数） */
function payRows(pay: NetPay, jk: string, pid: string, ded: DedRow[], hpfRate: number): [string, string][] {
  const A = socAvg(pid), pv = PBY[pid], r: [string, string][] = [];
  if (pay.kind === 'unit') r.push(['五险', `单位代扣：养老 8% + 医疗 2% + 失业 0.5%。缴费基数 ${yuan(pay.base / 12)}/月（本人工资，限在${pv.n}社平工资 ${yuan(A / 12)}/月的 60%–300%）；工伤、生育保险只由单位交`]);
  else if (pay.kind === 'flex') r.push(['社保', `灵活就业，自己交职工养老 ${pct(INS_FLEX.pen)}、医保 ${pct(INS_FLEX.med)}，按${pv.n}社平工资的 60% 档（${yuan(pay.base / 12)}/月）`]);
  else if (pay.kind === 'resid') r.push(['社保', `没有单位代扣，只交城乡居民医保（每年 ${INS_RESID.med} 元）和居民养老（选低档，约 ${INS_RESID.pen} 元）`]);
  if (pay.hpf) r.push(['公积金', `个人缴 ${pct(hpfRate)}，单位再缴同样多，都进公积金账户（基数不超过社平工资的 3 倍）`]);
  if (jk === 'farmer') r.push(['个税', '务农所得暂不征收个人所得税']);
  else r.push(['个税', `${isBiz(jk) ? '经营所得' : '综合所得'}按年算、每月扣 1/12：年应纳税所得额 = 一年税前 − 6 万 − 社保和公积金 − 专项附加扣除 = ${wan(pay.taxable)}${pay.rate ? `，最高一档税率 ${pct(pay.rate)}` : '，不用交税'}${isBiz(jk) ? '；个体工商户减半征收' : ''}`]);
  r.push(['专项附加扣除', ded.length ? ded.map(([k, v]) => `${k} 每月 ${yuan(v / 12)}`).join('；') : '没有']);
  return r;
}
const TAX_NOTES = [
  '个税（综合所得，按年应纳税所得额）：3.6 万以内 3%，3.6–14.4 万 10%，14.4–30 万 20%，30–42 万 25%，42–66 万 30%，66–96 万 35%，96 万以上 45%。',
  '经营所得（个体户、小老板）：3 万以内 5%，3–9 万 10%，9–30 万 20%，30–50 万 30%，以上 35%；个体工商户 200 万以内的部分减半。',
  '专项附加扣除：每个孩子每月 2000 元（婴幼儿照护或子女教育，父母各扣一半或一方全扣）；父母满 60 岁，独生子女每月 3000 元，兄弟姐妹分摊、每人最多 1500 元；首套房贷利息每月 1000 元（最长 20 年），或者房租每月 800–1500 元（按城市）。',
  '每个月扣一年税额的 1/12：实际的累计预扣法年初扣得少、年底扣得多，一年的总额一样。养老金、失业保险金不交个税。',
];
const TAX_SRC = '《个人所得税法》（2018 年修正）；国发〔2018〕41 号、国发〔2023〕13 号；财政部 税务总局公告 2023 年第 12 号；《社会保险法》';

export const TIPS: Record<string, (arg?: string) => Tip> = {
  famQuint() {
    // 家境是出生时定的：父母那时的到手收入和同住老人的收入，出生时记在 famPCParts（parents.ts 的 familyIncomeInit）
    const f = S.fam, n = S.famSize || 3 + sibsAlive().length, [d, m, gp] = S.famPCParts || [0, 0, 0];
    return {
      title: '家庭人均可支配收入（出生时，每月）',
      expr: ['(', T(yuan(d / 12), '父亲到手（月）'), '+', T(yuan(m / 12), '母亲到手（月）'), ...(gp ? ['+', T(yuan(gp / 12), '同住老人的月收入')] : []), ')', '÷', T(n + ' 人', '家庭人口')],
      result: moYr(famIncome()),
      rows: [['家境', `落在${S.rural ? '农村' : '城镇'}居民收入五等份的第 ${S.q} 档（${QW[S.q - 1]}）`], ['可支配收入', '到手的钱：工资扣掉五险、个税以后，加上经营收入、房租利息、养老金和补贴'], ['人均', `全家到手收入 ÷ 全家人数（父母、孩子${f.gp ? `、同住的 ${f.gp} 位老人` : ''}都算）`]],
      notes: ['都是出生那一年的数。父母的工资和你本人用同一套公式算，再扣五险和个税（点父母那一行的 i 可以看）。', `五等份的分界是年收入，${YEARLY}。`],
      src: '五等份分组：中国统计年鉴 2025 表 6-7、6-12（2024 年）；城镇、农村人均收入中位数已对上统计局 2025 年数据',
    };
  },
  famPerCap() {
    const f = S.fam, a = parentIncome('dad'), b = parentIncome('mom');
    const n = (f.mom.alive ? 1 : 0) + (f.dad.alive ? 1 : 0) + (S.indep === false ? 1 + sibsAlive().filter(x => x.age < 18).length : 0);
    return {
      title: S.indep === false ? '家庭人均可支配收入（每月）' : '父母收入合计（每月）',
      expr: S.indep === false ? ['(', T(yuan(a / 12), '父亲'), '+', T(yuan(b / 12), '母亲'), ')', '÷', T(n + ' 人', '靠他们生活的人')] : [T(yuan(a / 12), '父亲'), '+', T(yuan(b / 12), '母亲')],
      result: moYr(S.indep === false ? (n ? (a + b) / n : 0) : a + b),
      notes: ['可支配收入就是到手的钱：工资扣掉五险和个税，养老金不交税。', '父母各自的收入见下一行「父母收入」的 i。'],
    };
  },
  // 父母的收入合在一行：都退休了叫「父母养老金」，都在上班叫「父母月收入」，一个退休一个上班叫「父母收入」；各自的情况写在这里
  parentsInc() {
    const f = S.fam, both = ['dad', 'mom'] as const, label = { dad: '父亲', mom: '母亲' };
    const alive = both.filter(w => f[w].alive), ret = (w: 'dad' | 'mom') => parentRetired(f[w], w === 'dad');
    const word = alive.every(ret) ? '养老金' : alive.every(w => !ret(w)) ? '月收入' : '收入';
    const tot = alive.reduce((t, w) => t + parentIncome(w), 0);
    const res = (w: 'dad' | 'mom') => RESID_PENSION_JOBS.has(f[w].jk);
    const desc = (w: 'dad' | 'mom') => {
      const p = f[w], v = parentIncome(w);
      if (!p.alive) return `已去世（享年${p.age}岁），没有收入`;
      if (ret(w)) return `养老金 ${perMo(v)}：${res(w) ? '城乡居民基本养老金' : '城镇职工基本养老金'}，退休前是${p.job}`;
      return v ? `月收入 ${perMo(v)}（到手）：${p.job}` : `没有收入：${p.job}`;
    };
    const notes: string[] = [];
    if (alive.some(ret)) notes.push(`养老金按${PBY[S.home.p].n} 2024 年人均水平算（${YEARLY}），不交税。`);
    if (alive.some(w => ret(w) && res(w))) notes.push('务农、打工、个体户、在家带孩子的，多数只参加了城乡居民养老保险，领得很少。');
    if (alive.some(w => !ret(w) && parentIncome(w) > 0)) notes.push('上班的收入是到手的钱：工资扣掉五险和个税。');
    return {
      title: `父母${word}（每月）`,
      ...(alive.length === 2 ? { expr: [T(yuan(parentIncome('dad') / 12), '父亲'), '+', T(yuan(parentIncome('mom') / 12), '母亲')], result: moYr(tot) } : { big: perMo(tot) }),
      rows: both.map(w => [label[w], desc(w)] as [string, string]),
      notes,
      src: alive.some(ret) ? '中国统计年鉴 2025 表 24-26、24-27（基金支出 ÷ 领取人数）' : undefined,
    };
  },
  parentInc(who) {
    const f = S.fam, p = f[who], male = who === 'dad', hp = PBY[S.home.p], label = male ? '父亲' : '母亲';
    if (!p.alive) return { title: label, big: '已去世' };
    if (parentRetired(p, male)) {
      const res = RESID_PENSION_JOBS.has(p.jk);
      return {
        title: label + '的养老金（每月）', big: perMo(parentIncome(who)),
        rows: [['类型', res ? '城乡居民基本养老金' : '城镇职工基本养老金'], ['标准', `${hp.n} 2024 年人均水平，一年 ${wan(parentIncome(who))}（${YEARLY}）`], ['原来的工作', p.job]],
        notes: [res ? '务农、打工、个体户、在家带孩子的，多数只参加了城乡居民养老保险，领得很少。' : '有单位的人参加城镇职工养老保险。'],
        src: `中国统计年鉴 2025 表 ${res ? '24-27' : '24-26'}（基金支出 ÷ 领取人数）`,
      };
    }
    const J = JOBS[p.jk];
    if (!J || !J.m) return { title: label + '的收入', big: '没有工资收入', rows: [['学历', EDU_LV[p.edu]], ['情况', p.job]] };
    const L = parentWorkLoc(p), y = Math.max(0, p.age - p.startAge);
    const luck = p.k, pk = PARENT_K[S.rural ? 'rural' : 'urban'];
    const rank = rankOf(luck, PARENT_SD); // 个人差异在同龄人里大约排第几（对数正态，σ = PARENT_SD）
    const ded: DedRow[] = [], pay = parentPay(who as 'mom' | 'dad', ded);
    return {
      title: label + '的月收入',
      expr: [T(yuan(wageBase(L) / 12), '工资基数（月）'), '×', T(J.m, '职业系数'), '×', T(personK(p).toFixed(2), '个人系数'), '×', T(workExpK(p).toFixed(2), '工龄系数'), '×', T(pk, '父母一代')],
      result: '税前 ' + perMo(parentWage(p)),
      ...payEq(pay),
      rows: [
        ['工作', `${p.job}${L.city !== S.home.city ? '（在' + placeName(L) + '）' : ''}`],
        ['工资基数', baseText(L)],
        ['个人系数', `${eduText(p.edu, p.jk)} × 个人差异 ${luck.toFixed(2)}（同龄人里约第 ${rank} 百分位，含工时、奖金、兼职和运气）`],
        ['工龄系数', expText(y, p.jk)],
        ['父母一代', `校准系数，使出生时${S.rural ? '农村' : '城镇'}家庭人均可支配收入的中位数对上统计局 2025 年数据`],
        ...payRows(pay, p.jk, L.p, ded, 0),
      ],
      notes: ['和你本人同一套公式。职业系数是这一行全国的平均（按统计局分行业、分岗位平均工资折算，税前），学历、个人差异、工龄系数平均下来约为 1。', '父母个人缴的公积金没有从到手里扣：它还是家里的钱，可以提取付房贷、房租。', ...TAX_NOTES],
      src: '父母一代的学历分布参考 2020 年人口普查（估计）；' + TAX_SRC,
    };
  },
  famMoney() {
    const W = WEALTH0[S.rural ? 'rural' : 'urban'], q = S.q - 1, neg = S.famMoney < 0;
    const loan: [string, string][] = S.stuDebt ? [['助学贷款', `${wan(S.stuDebt)}：只借学费、生活费的缺口，本专科每年最多 2 万元、研究生 2.5 万元；在读免息，工作以后转到你名下自己还`]] : [];
    if (!S.fam.mom.alive && !S.fam.dad.alive) return {
      title: '父母留下的钱', big: wan(Math.max(0, S.famMoney || 0)),
      rows: [['谁来管', '亲戚帮着管，供你吃穿上学：每年约当地人均消费的一半，加上学费'], ['花完以后', '由亲戚和孤儿基本生活费兜底，不算你的欠款'], ['独立时', '剩下的钱交到你手里'], ...loan],
      src: '2024 年社会散居孤儿基本生活费平均约每月 1,500 元（民政部）',
    };
    return {
      title: neg ? '父母的欠款' : '父母的存款', big: (neg ? '欠 ' : '') + wan(Math.abs(S.famMoney || 0)),
      rows: [
        ['出生时', `积蓄约为全家年收入的 ${W.save[q]} 倍（中位数，因人而异）`],
        ['欠款的可能', `${S.rural ? '农村' : '城镇'}家境第 ${S.q} 档约 ${pct(W.debtP[q])} 的家庭有欠款`],
        ['父母上班时', `收入 × 净储蓄率 ${pct(FAM_SAVE[S.q - 1])}（家境第 ${S.q} 档）`],
        ['父母退休后', '养老金 − 当地人均消费 × 0.7 × 人数'],
        ['孩子上学', '开学时交一学年：高中约 3,000 元，大学约 2 万元，民办更高；家里拿不出的部分办助学贷款'],
        ...loan,
        ['其他', '父母生病另有开销；存款年利息约 1.5%，欠款约 2%（多是房贷或亲戚借款）'],
        ['花光以后', '由已经工作的子女补贴（还在世的兄弟姐妹一起分摊）'],
      ],
      notes: ['出生时的积蓄已按家庭金融调查校准：金融资产中位数约城镇 4.6 万、农村 8,500 元（CHFS 2011 按收入增长折算）。各档倍数和净储蓄率仍是估计。'],
      src: '参考：2024 年农村居民（收入 − 消费）÷ 收入约 17%，城镇约 34%',
    };
  },
  famHouse() {
    const H = S.famHouse || { type: 'rent', v: 0 };
    const near = (x: number) => Math.abs(Math.round(x / 1e3) * 1e3 - H.v) <= 1e3;
    const k = 0.7 + S.q * 0.12;
    if ((H.type === 'own' && !near(placeHp(S.home) * 90 * k)) || (H.type === 'self' && !near(hpCounty(PBY[S.home.p]) * 0.5 * 120))) return {
      title: '父母的房子', big: wan(H.v), notes: ['拆迁以后拿到的补偿房（或安置房），按补偿时的估值。'],
    };
    if (H.type === 'own') return {
      title: '父母的房子', expr: [T(Math.round(placeHp(S.home)) + '元/㎡', S.home.city + '房价'), '×', T('90 ㎡', '面积'), '×', T(k.toFixed(2), '家境系数')],
      result: wan(H.v), notes: ['家境系数是估计：家境越好，房子越大、地段越好。'], src: '房价：统计年鉴 35 个大中城市新建住宅均价、各市统计公报，或安居客挂牌价',
    };
    if (H.type === 'self') return {
      title: '父母的房子（农村自建房）', expr: [T(Math.round(hpCounty(PBY[S.home.p])) + '元/㎡', '县城房价'), '×', T('0.5', '折算'), '×', T('120 ㎡', '面积')],
      result: wan(H.v), notes: ['只是参考：宅基地上的房子很难在市场上卖出。'],
    };
    if (H.type === 'gone') return { title: '父母的房子', big: '已继承', notes: ['父母去世后，房子和存款由还在世的兄弟姐妹平分，也可以商量着分。'] };
    return { title: '父母的房子', big: '租房住', notes: ['城镇家庭按家境决定有没有自有住房：最穷一档约六成有房，最富一档几乎都有（估计）。'] };
  },
  famDebt() {
    const W = WEALTH0[S.rural ? 'rural' : 'urban'], q = S.q - 1;
    return {
      title: '父母的欠款', big: wan(S.famDebt || 0),
      rows: [['原因', S.famDebtWhy || '借款'], ['出生时', `${wan(S.famDebt0 || 0)}，约为全家年收入的 ${W.debt[q]} 倍（中位数，因人而异）`], ['怎么还', S.famDebtWhy === '房贷' ? `按商贷利率 ${pct(LOAN_RULES.comRate)} 等额本息，从工资里扣，还剩约 ${S.famDebtYears || 0} 年；父母退休后从存款里扣` : `家里每年省下的钱（约收入的 ${pct(FAM_REPAY[S.rural ? 'rural' : 'urban'][q])}）先拿去还债，这几年不再存钱。照现在的收入，还要约 ${S.famDebtYears >= 99 ? '很多' : S.famDebtYears || 0} 年；父母退休后还没还完的，用存款还`], ['父母去世', '先用遗产抵，子女不承担超出遗产的部分']],
      notes: [`${S.rural ? '农村' : '城镇'}家境第 ${S.q} 档约 ${pct(W.debtP[q])} 的家庭有欠款。整体已按调查校准：有负债的家庭城镇约 44%、农村约 40%；负债约为年收入的 1.3–1.5 倍（CHFS 2011、2019，人民银行 2019）。`],
    };
  },
  ptInc(who) {
    const p = who === 'dating' ? S.fam.dating : S.fam.partner;
    if (!p || !p.jk) return { title: '对方的收入', big: '没有收入', notes: ['还在读书。毕业以后按学历找工作。'] };
    if (p.retired) return { title: `${p.name}的退休收入（每月）`, big: perMo(p.inc), notes: [`一年约 ${wan(p.inc)}。和你同一套规则：务农、打零工、个体户这类领城乡居民养老金，其余领职工养老金（按参加工作一直缴到退休估算）。`] };
    // 对方的收入每年更新一次（生日那个月）。这一年里搬了家，现在的数和按现在的地方算的对不上：不列算式，免得乘不出来
    const L = partnerLoc(p), live = wageBase(L) * JOBS[p.jk].m * personK(p) * workExpK(p);
    if (Math.abs(live - p.inc) > Math.max(100, p.inc * 0.01)) return {
      title: `${p.name}的月收入`, big: perMo(p.inc),
      rows: [['工作', JOBS[p.jk].n], ['一年', wan(p.inc)], ['怎么算', '工资基数 × 职业系数 × 个人系数 × 工龄系数，每年更新一次'], ['明年', `按${placeName(L)}算，约 ${perMo(live)}`]],
    };
    const luck = p.k, rank = rankOf(luck, PARTNER_SD);
    const married = who !== 'dating', ded: DedRow[] = [], pay = partnerPay(p, ded), pid = married ? S.loc.p : L.p;
    return {
      title: `${p.name}的月收入`,
      expr: [T(yuan(wageBase(L) / 12), '工资基数（月）'), '×', T(JOBS[p.jk].m, '职业系数'), '×', T(personK(p).toFixed(2), '个人系数'), '×', T(workExpK(p).toFixed(2), '工龄系数')],
      result: '税前 ' + perMo(p.inc),
      ...payEq(pay),
      rows: [['工作', `${JOBS[p.jk].n}（在${placeName(L)}）`], ['工资基数', baseText(L)], ['个人系数', `${eduText(p.edu, p.jk)} × 个人差异 ${luck.toFixed(2)}（同龄人里约第 ${rank} 百分位）`], ['工龄系数', expText(Math.max(0, p.age - p.startAge), p.jk)],
        ...payRows(pay, p.jk, pid, ded, pay.hpf && HPF_JOB[p.jk] ? HPF_JOB[p.jk][1] : 0)],
      notes: ['和你本人、父母同一套公式。对方的学历按「门当户对」抽：同一档约五成五，差一档约三成五（估计）。', married ? '结了婚：孩子的扣除夫妻各扣一半，住房的扣除由工资高的那个扣；对方个人缴的公积金也进家里的公积金账户。' : '还没结婚：只算对方自己的扣除。', ...TAX_NOTES],
      src: TAX_SRC,
    };
  },
  famAssets() {
    const H = S.famHouse || { v: 0 }, m = S.famMoney || 0, d = S.famDebt || 0;
    return { title: '父母的净资产', expr: [T(wan(m), '存款'), '−', T(wan(d), '欠款'), '+', T(wan(H.v || 0), '房产估值')], result: wan(m - d + (H.v || 0)), notes: ['房产按估值计，不一定卖得掉。净资产可以是负数。'] };
  },
  myIncome() {
    const F = S.flags, side: [string, string][] = [];
    if (S.job === 'retired') {
      const pv = PBY[S.penP || S.loc.p], P = S.pen || { y: 0, r: 0, s: 0 }, emp = P.y >= PEN_MIN_YEARS, penE = pv.penE || 45903, penR = pv.penR || 2950;
      const grown = S.fam.kids.filter(k => k.alive && k.age >= 25).length;
      if (grown) side.push(['子女给的', `成年子女每人每月约当地人均消费的 35% ÷ 12（最多算两个），另算`]);
      if (F.rehire) side.push(['返聘', `每月约 ${perMo(F.rehire.inc)}，到 ${F.rehire.until} 岁，另算`]);
      if (!emp) return {
        title: '你的养老金（每月）', big: perMo(S.pension || 0),
        rows: [['类型', '城乡居民基本养老金'], ['一年', `${wan(S.pension || 0)}（含历年上调）`], ['标准', `${pv.n}人均每月约 ${yuan(penR / 12)}（${YEARLY}）${S.flags.lastJob === 'shop' || S.jobs.some(j => j.job === 'shop') ? '；个体户另有约一成原来的经营收入' : ''}`],
          ['为什么', P.y > 0 ? `职工养老保险只交了 ${Math.round(P.y)} 年，不满 ${PEN_MIN_YEARS} 年，领不了职工养老金` : '没交过职工养老保险（务农、打零工、个体户多是这样）'], ...side],
        src: '中国统计年鉴 2025 表 24-27',
      };
      const wk = clamp(P.r / P.y / 2.5, 0.6, 1.8), yk = clamp(P.y / PEN_YEARS, 0.45, 1.25), sk = P.s * 2 >= P.y;
      // 退休后的「养老金又涨了一点」（content/events.ts）直接乘在 S.pension 上：单列一项，算式乘出来才等于结果
      const up = (S.pension || 0) / (penE * wk * yk * (sk ? 1.2 : 1)), upK = Math.abs(up - 1) > 0.005;
      return {
        title: '你的养老金（每月）',
        expr: [T(yuan(penE / 12), '本省职工人均（月）'), '×', T(wk.toFixed(2), '工资档次'), '×', T(yk.toFixed(2), '缴费年数'), ...(sk ? ['×', T('1.2', '机关事业单位')] : []), ...(upK ? ['×', T(up.toFixed(2), '历年上调')] : [])],
        result: moYr(S.pension || 0),
        rows: [
          ['本省职工人均', `${pv.n}城镇职工人均养老金一年 ${wan(penE)}（按退休时所在的省；${YEARLY}）`],
          ['工资档次', `在职时平均工资约为当地城镇人均可支配收入的 ${(P.r / P.y).toFixed(2)} 倍，÷ 2.5，在 0.6–1.8 之间`],
          ['缴费年数', `交了 ${Math.round(P.y)} 年，÷ ${PEN_YEARS}，在 0.45–1.25 之间（基础养老金大致和缴费年数成正比）`],
          ...(sk ? [['机关事业单位', '一半以上的缴费年数在机关事业单位，略高'] as [string, string]] : []),
          ...(upK ? [['历年上调', '退休以后养老金每隔几年上调一次，每次约 5%'] as [string, string]] : []),
          ...side,
        ],
        notes: ['看的是一辈子的缴费记录，不是退休前最后那份工作。交满 15 年才能按月领职工养老金。'],
        src: '中国统计年鉴 2025 表 24-26、24-27',
      };
    }
    if (S.job === 'seeking' && S.uiOn && (S.uiM > 0 || S.income > 0)) return {
      title: '失业保险金（每月）', big: perMo(uiPay()),
      rows: [['还能领', `${S.uiM || 0} 个月`], ['标准', `全国月人均约 1,898 元（2024），按${PBY[S.loc.p].n}城镇收入水平调整`], ['能领多久', '缴费 1–5 年最长 12 个月，5–10 年 18 个月，10 年以上 24 个月；上次没领完的可以合并，最长 24 个月']],
      src: '《失业保险条例》第17条；人社部 2024 年统计公报',
    };
    const J = JOBS[S.job];
    if (!J || !J.m) return { title: '月收入', big: '—', notes: ['现在没有工作收入。'] };
    const k0 = S.wageK0 || S.wageK, g = S.wageK / k0, luck = incomeLuckNow(J.v), biz = S.job !== 'sales', lk = biz ? '生意系数' : '提成系数';
    const mood = luck > 1.05 ? '今年比平常好' : luck < 0.95 ? '今年比平常差' : '今年和平常差不多';
    const ded: DedRow[] = [], pay = myPay(wageRate() * luck, undefined, ded);
    return {
      title: '你的月收入',
      expr: [T(yuan(wageBase() / 12), '工资基数（月）'), '×', T(J.m, '职业系数'), '×', T(S.wageK.toFixed(2), '个人系数'), '×', T(expK().toFixed(2), '工龄系数'), ...(J.v ? ['×', T(luck.toFixed(2), lk)] : [])],
      result: '税前 ' + perMo(pay.gross),
      ...payEq(pay),
      rows: [
        ['工资基数', baseText(S.loc)],
        ['职业系数', `${J.n}这一行全国的平均，按统计局 2025 年分行业、分岗位平均工资（税前）折算`],
        ['个人系数', `入行时 ${k0.toFixed(2)}（${eduText(S.edu, S.job)}、学识、学校层次，加一点运气；同行平均约为 1）× 这些年比同龄同行多涨（或少涨）的 ${g.toFixed(2)}`],
        ['多涨的部分', `升职、拼工作、跳槽涨的工资。工龄系数是同龄同行的平均，里面已经含了一般人的升职加薪：一直不升职、不跳槽，每年向 ${WAGE_G0} 回落约 ${Math.round(WAGE_REV * 100)}%（落到同行平均以下）；最多是入行时的 ${WAGE_G_MAX} 倍，越接近越难涨`],
        ['工龄系数', expText(S.jobY, S.job)],
        ...(J.v ? [[lk, `${biz ? '做生意的收入' : '销售的收入大头是提成，'}一年好一年坏：${mood}。多年平均正好是 1`] as [string, string]] : []),
        ...payRows(pay, S.job, S.loc.p, ded, S.hpfRate || 0),
      ],
      notes: [...(J.v ? [biz ? '生意好的年份能多赚不少，差的年份可能白忙一年。' : '提成看行情和业绩，好的年份和差的年份能差一倍。'] : []), ...TAX_NOTES],
      src: TAX_SRC,
    };
  },
  myMoney() {
    return {
      title: '你的存款', big: wan(S.money),
      rows: [
        ['每月变化', '到手收入（税前扣掉五险一金、个税）− 生活开销 − 房租 − 房贷，再加利息'],
        ['上班时的开销', `收入 ×（1 − 储蓄率）+ 存款的 ${pct(WEALTH_MPC)}/年；不低于当地人均消费的九成`],
        ['储蓄率', `${pct(SAVE_BASE)} + 15% × ln（人均到手收入 ÷ 当地人均可支配收入），在 −20% 到 55% 之间`],
        ['退休以后', `收入全部花掉，再花存款的 ${pct(RET_DRAW)}/年，房租、养老院也从这里出`],
        ['欠着钱时', `至少拿收入的 ${pct(DEBT_SR)} 还债，开销压到下限的 ${pct(DEBT_FLOOR)}；退休以后不再借钱`],
        ['房贷', '先用公积金余额还，不够再用存款'],
        ['利息', `存款约 1.5%，欠款约 4%；欠款超过当地 ${DEBT_FREEZE} 年人均收入的部分不再计息`],
      ],
      notes: ['背着房贷的家庭会压缩日常开销。', '存款多的家庭花得也多（人情、装修、换车、帮衬家人），所以存款不会只进不出。'],
      src: '参考：2025 年全国居民储蓄率约 32%',
    };
  },
  hpf() {
    if (S.job === 'retired' && !S.hpf) return { title: '住房公积金', big: '已提取', notes: ['退休时公积金销户，余额转进了存款。'] };
    if (!S.hpfOn && !S.hpf) return { title: '住房公积金', big: '没有', notes: ['你现在的工作没有缴公积金。骑手、个体户、务农基本都没有。'], src: '2024 年全国实缴人数约占城镇就业的 37%' };
    // 待业、或者换到了不缴公积金的单位：账户封存，余额还在
    if (!S.hpfOn) return {
      title: '住房公积金', big: wan(S.hpf) + '（封存）',
      rows: [['状态', S.job === 'seeking' ? '待业，停止缴存' : S.job === 'retired' ? '你已退休；配偶还在缴，配偶退休后一起提取' : '现在的工作不缴公积金'], ['账户利率', '1.5%'], ['可以提取', '付房租、买房付首付、按月还房贷']],
      notes: ['封存的账户余额还在，照样计息。', '找到交公积金的工作后接着缴；连续缴存的年数从头算，满 1 年才能申请公积金贷款。'],
    };
    // 缴存基数 = 税前工资，不超过社平工资的 3 倍（tax.ts）；配偶的比例按配偶的职业（housing.ts 的 HPF_JOB）
    const rate = S.hpfRate || 0.05, own = myPay(), pt = S.fam.partner;
    const mp = partnerHpf() && !pt.retired ? matePay(pt, own.gross) : null, mr = mp && HPF_JOB[pt.jk] ? HPF_JOB[pt.jk][1] : 0;
    const mHpf = mp && mr ? mp.hpf : 0;
    return {
      title: '住房公积金（每月缴存）', expr: [T(yuan(own.hpf / rate / 12), '缴存基数（月）'), '×', T(pct(rate), '缴存比例'), '×', T('2', '单位 + 个人'), ...(mHpf ? ['+', T(yuan(mHpf / mr / 12), '配偶缴存基数（月）'), '×', T(pct(mr), '配偶缴存比例'), '×', T('2', '单位 + 个人')] : [])],
      result: moYr((own.hpf + mHpf) * 2),
      rows: [['账户余额', wan(S.hpf || 0)], ['缴存基数', '税前工资，不超过社平工资的 3 倍'], ['账户利率', '1.5%'], ['可以提取', '付房租、买房付首付、按月还房贷；退休时销户全部提取'], ['公积金贷款', '连续缴存满 1 年可申请，首套利率 2.6%']],
      notes: mHpf ? ['配偶缴的公积金也算进家庭账户；个人缴的那一半从配偶的收入里扣。'] : [],
    };
  },
  loan() {
    if (!S.loans || !S.loans.length) return { title: '房贷', big: '没有房贷' };
    return {
      title: '房贷', big: '月供 ' + wan(loanPayY() / 12),
      rows: S.loans.map((l): [string, string] => [l.kind === 'hpf' ? '公积金贷款' : '商业贷款', `剩 ${wan(l.bal)} · 年利率 ${(l.rate * 100).toFixed(2)}% · 还剩 ${l.years} 年 · 月供 ${wan(l.pay / 12)}`]),
      math: <>月供 = P × r ÷ ( 1 − (1 + r)<sup>−n</sup> )</>,
      notes: ['等额本息：P 贷款本金，r 月利率，n 还款月数。'],
      src: '利率：商贷新发放平均约 3.1%，公积金首套 2.6%（2025–2026）',
    };
  },
  le() {
    const le = leOf(S.born, S.sex, S.rural), base = LE_TARGET[S.sex], ra = S.rural ? -1.0 : 0.6, pd = le - base - ra;
    return {
      title: '预期寿命', expr: [T(base.toFixed(1), '全国'), sgn(pd).slice(0, 1), T(Math.abs(pd).toFixed(1), '本省差异'), sgn(ra).slice(0, 1), T(Math.abs(ra).toFixed(1), S.rural ? '农村' : '城镇')],
      result: le.toFixed(1) + ' 岁',
      rows: [['全国', `联合国 WPP 2024 生命表（${S.sex === 'M' ? '男性' : '女性'}）`], ['本省差异', '第七次人口普查各省分性别预期寿命与全国的差'], ['城乡', '农村 −1.0 岁、城镇 +0.6 岁（估计）']],
      notes: ['官方口径 2024 年全国 79.0 岁，比联合国高约 1 岁；游戏采用联合国口径。'],
    };
  },
  u5() {
    const l5 = LT().l[5];
    return {
      title: '5 岁前离世的概率', expr: [T('1', ''), '−', T((l5 * 100).toFixed(2) + '%', '活到 5 岁的比例')], result: ((1 - l5) * 100).toFixed(2) + '%',
      rows: [['婴儿死亡率', 'UN IGME 2024：男 4.3‰、女 3.9‰（与卫健委 4.0‰ 一致）'], ['调整', '按省份和城乡'], ['1–4 岁', '联合国生命表']],
    };
  },
};

/** 按 "名字:参数" 构建一张说明卡片；第二段算式画在 math 的位置，样式和第一段一样 */
export function buildTip(key: string): Tip | null {
  const [name, arg] = key.split(':');
  const t = TIPS[name] && S ? peek(() => TIPS[name](arg)) : null;
  if (t && t.expr2 && !t.math) t.math = <div className="tp-eq" style={{ padding: 0, border: 0, background: 'none', fontStyle: 'normal' }}>
    {t.expr2.map((x, i) => typeof x === 'string' ? <span key={i} className="tp-op">{x}</span> : <span key={i} className="tp-t"><b>{x.v}</b><small>{x.l}</small></span>)}
    <span className="tp-op">=</span><span className="tp-res">{t.result2}</span>
  </div>;
  return t;
}
