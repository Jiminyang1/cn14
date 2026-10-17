// 「怎么算的」：数字旁边一个小 i，点击后弹出一张说明卡片（公式、代入这个人的数字、规则、来源）。
// 说明在点开那一刻才计算，所以数字总是最新的。
import type { ReactNode } from 'react';
import {
  EDU_LV, EDU_WAGE, FAM_REPAY, FAM_SAVE, INS_FLEX, INS_RESID, JOBS, LE_TARGET, LOAN_RULES, LT, NAT_URBAN_INC, PARENT_K, PBY,
  RESID_PENSION_JOBS, S, SAVE_BASE, WEALTH0, expK, famIncome, hpCounty, incLuckNow, leOf, loanPayY, myPay, parentIncome, parentPay, parentRetired, parentWage,
  parentWorkLoc, partnerHpf, partnerLoc, partnerPay, peek, placeHp, placeInc, placeName, socAvg, wageBase, wageRate, wan, workExpK,
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
const sgn = (x: number) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1);
const yuan = (x: number) => Math.round(x).toLocaleString('en-US') + '元';

// ===== 税前 → 到手 =====
/** 第二段算式：税前 − 五险 − 公积金 − 个税 = 到手。per = 12 按月显示，1 按年。每一项先取整，到手 = 取整后的各项相减（和引擎里的到手最多差一两元） */
function payEq(pay: NetPay, per: 1 | 12): { expr2: Term[]; result2: string } {
  const g = Math.round(pay.gross / per), i = Math.round(pay.ins / per), h = Math.round(pay.hpf / per), t = Math.round(pay.tax / per);
  const insL = pay.kind === 'unit' ? '五险（个人）' : pay.kind === 'flex' ? '社保（自己交）' : '居民医保、养老';
  const expr2: Term[] = [T(yuan(g), per === 12 ? '税前每月' : '税前'), '−', T(yuan(i), insL)];
  if (h) expr2.push('−', T(yuan(h), '公积金（个人）'));
  expr2.push('−', T(yuan(t), '个税'));
  return { expr2, result2: '到手 ' + yuan(g - i - h - t) + (per === 12 ? '/月' : '/年') };
}
const isBiz = (jk: string) => jk === 'shop' || jk === 'boss';
/** 五险、公积金、个税各是怎么算的；扣除项明细在 ded 里 */
function payRows(pay: NetPay, jk: string, pid: string, ded: DedRow[], hpfRate: number): [string, string][] {
  const A = socAvg(pid), pv = PBY[pid], r: [string, string][] = [];
  if (pay.kind === 'unit') r.push(['五险', `单位代扣：养老 8% + 医疗 2% + 失业 0.5%。缴费基数 ${yuan(pay.base / 12)}/月（本人工资，限在${pv.n}社平工资 ${yuan(A / 12)}/月的 60%–300%）；工伤、生育保险只由单位交`]);
  else if (pay.kind === 'flex') r.push(['社保', `灵活就业，自己交职工养老 ${pct(INS_FLEX.pen)}、医保 ${pct(INS_FLEX.med)}，按${pv.n}社平工资的 60% 档（${yuan(pay.base / 12)}/月）`]);
  else if (pay.kind === 'resid') r.push(['社保', `没有单位代扣，只交城乡居民医保（每年 ${INS_RESID.med} 元）和居民养老（选低档，约 ${INS_RESID.pen} 元）`]);
  if (pay.hpf) r.push(['公积金', `个人缴 ${pct(hpfRate)}，单位再缴同样多，都进公积金账户（基数不超过社平工资的 3 倍）`]);
  if (jk === 'farmer') r.push(['个税', '务农所得暂不征收个人所得税']);
  else r.push(['个税', `${isBiz(jk) ? '经营所得' : '综合所得'}：年应纳税所得额 = 税前 − 6 万 − 社保和公积金 − 专项附加扣除 = ${wan(pay.taxable)}${pay.rate ? `，最高一档税率 ${pct(pay.rate)}` : '，不用交税'}${isBiz(jk) ? '；个体工商户减半征收' : ''}`]);
  r.push(['专项附加扣除', ded.length ? ded.map(([k, v]) => `${k} ${wan(v)}/年`).join('；') : '没有']);
  return r;
}
const TAX_NOTES = [
  '个税（综合所得，按年应纳税所得额）：3.6 万以内 3%，3.6–14.4 万 10%，14.4–30 万 20%，30–42 万 25%，42–66 万 30%，66–96 万 35%，96 万以上 45%。',
  '经营所得（个体户、小老板）：3 万以内 5%，3–9 万 10%，9–30 万 20%，30–50 万 30%，以上 35%；个体工商户 200 万以内的部分减半。',
  '专项附加扣除：每个孩子每月 2000 元（婴幼儿照护或子女教育，父母各扣一半或一方全扣）；父母满 60 岁，独生子女每月 3000 元，兄弟姐妹分摊、每人最多 1500 元；首套房贷利息每月 1000 元（最长 20 年），或者房租每月 800–1500 元（按城市）。',
  '每个月扣一年税额的 1/12：实际的累计预扣法年初扣得少、年底扣得多，一年的总额一样。养老金不交个税。',
];
const TAX_SRC = '《个人所得税法》（2018 年修正）；国发〔2018〕41 号、国发〔2023〕13 号；财政部 税务总局公告 2023 年第 12 号；《社会保险法》';

export const TIPS: Record<string, (arg?: string) => Tip> = {
  famQuint() {
    const [d, m, gp] = S.famPCParts || [0, 0, 0], n = S.famSize || 3;
    const expr: Term[] = ['(', T(wan(d), '父亲到手'), '+', T(wan(m), '母亲到手')];
    if (gp) expr.push('+', T(wan(gp), '同住老人'));
    expr.push(')', '÷', T(n + ' 人', '家庭人口'));
    return {
      title: '家庭人均可支配收入', expr,
      result: wan(famIncome()) + '/年',
      rows: [['家境', `落在${S.rural ? '农村' : '城镇'}居民收入五等份的第 ${S.q} 档（${QW[S.q - 1]}）`], ['可支配收入', '到手的钱：工资扣掉五险、个税以后，加上经营收入、房租利息、养老金和补贴'], ['人均', '全家到手收入 ÷ 全家人数（老人小孩都算）'], ['同住老人', '养老金或务农收入（农村约七成和爷爷奶奶住在一起，城镇约两成，估计）']],
      notes: ['都是出生那一年的数。父母的工资和你本人用同一套公式算，再扣五险和个税（点父母那一行的 i 可以看）。'],
      src: '五等份分组：中国统计年鉴 2025 表 6-7、6-12（2024 年）；城镇、农村人均收入中位数已对上统计局 2025 年数据',
    };
  },
  famPerCap() {
    const f = S.fam, a = parentIncome('dad'), b = parentIncome('mom');
    const n = (f.mom.alive ? 1 : 0) + (f.dad.alive ? 1 : 0) + (S.indep === false ? 1 + f.sibs.filter(x => x.age < 18).length : 0);
    return {
      title: S.indep === false ? '家庭人均可支配收入' : '父母收入合计',
      expr: S.indep === false ? ['(', T(wan(a), '父亲'), '+', T(wan(b), '母亲'), ')', '÷', T(n + ' 人', '靠他们生活的人')] : [T(wan(a), '父亲'), '+', T(wan(b), '母亲')],
      result: wan(S.indep === false ? (n ? (a + b) / n : 0) : a + b) + '/年',
      notes: ['可支配收入就是到手的钱：工资扣掉五险和个税，养老金不交税。', '父母各自的收入在他们那一行的 i 里有算法。'],
    };
  },
  parentInc(who) {
    const f = S.fam, p = f[who], male = who === 'dad', hp = PBY[S.home.p], label = male ? '父亲' : '母亲';
    if (parentRetired(p, male)) {
      const res = RESID_PENSION_JOBS.has(p.jk);
      return {
        title: label + '的养老金', big: wan(parentIncome(who)) + '/年',
        rows: [['类型', res ? '城乡居民基本养老金' : '城镇职工基本养老金'], ['标准', `${hp.n} 2024 年人均水平`], ['原来的工作', p.job]],
        notes: [res ? '务农、打工、个体户、在家带孩子的，多数只参加了城乡居民养老保险，领得很少。' : '有单位的人参加城镇职工养老保险。'],
        src: `中国统计年鉴 2025 表 ${res ? '24-27' : '24-26'}（基金支出 ÷ 领取人数）`,
      };
    }
    const J = JOBS[p.jk];
    if (!J || !J.m) return { title: label + '的收入', big: '没有工资收入', rows: [['学历', EDU_LV[p.edu]], ['情况', p.job]] };
    const L = parentWorkLoc(p), y = Math.max(0, p.age - p.startAge);
    const ek = EDU_WAGE[p.edu], luck = p.k / ek, pk = PARENT_K[S.rural ? 'rural' : 'urban'];
    // 个人差异在同龄人里大约排第几（对数正态，σ = 0.65）
    const z = Math.log(luck) / 0.65, rank = Math.round(100 / (1 + Math.exp(-1.702 * z)));
    const ded: DedRow[] = [], pay = parentPay(who as 'mom' | 'dad', ded);
    return {
      title: label + '的年收入',
      expr: [T(wan(wageBase(L)), '工资基数'), '×', T(J.m, '职业系数'), '×', T(p.k.toFixed(2), '个人系数'), '×', T(workExpK(p).toFixed(2), '工龄系数'), '×', T(pk, '父母一代')],
      result: '税前 ' + wan(parentWage(p)) + '/年',
      ...payEq(pay, 1),
      rows: [
        ['工作', `${p.job}${L.city !== S.home.city ? '（在' + placeName(L) + '）' : ''}`],
        ['工资基数', L.kind === 'rural' ? `${placeName(L)}农村居民人均可支配收入` : `${placeName(L)}城镇居民人均可支配收入 ${wan(placeInc(L))}，按 0.7 次方向全国平均 ${wan(NAT_URBAN_INC)} 收拢（城市间工资差距比收入差距小）`],
        ['个人系数', `学历溢价 ${ek.toFixed(2)}（${EDU_LV[p.edu]}）× 个人差异 ${luck.toFixed(2)}（同龄人里约第 ${rank} 百分位，含工时、奖金、兼职和运气）`],
        ['工龄系数', `工作第 ${y} 年：前 5 年从 0.75 涨到 1.0，之后每年 +2%，最高 1.1；50 岁以后每年 −1%`],
        ['父母一代', `校准系数，使出生时${S.rural ? '农村' : '城镇'}家庭人均可支配收入的中位数对上统计局 2025 年数据`],
        ...payRows(pay, p.jk, L.p, ded, 0),
      ],
      notes: ['和你本人同一套公式。职业系数按统计局分行业平均工资（税前）折算。', '父母个人缴的公积金没有从到手里扣：它还是家里的钱，可以提取付房贷、房租。', ...TAX_NOTES],
      src: '父母一代的学历分布参考 2020 年人口普查（估计）；' + TAX_SRC,
    };
  },
  famMoney() {
    const W = WEALTH0[S.rural ? 'rural' : 'urban'], q = S.q - 1, neg = S.famMoney < 0;
    return {
      title: neg ? '父母的欠款' : '父母的存款', big: (neg ? '欠 ' : '') + wan(Math.abs(S.famMoney || 0)),
      rows: [
        ['出生时', `积蓄约为全家年收入的 ${W.save[q]} 倍（中位数，因人而异）`],
        ['欠款的可能', `${S.rural ? '农村' : '城镇'}家境第 ${S.q} 档约 ${pct(W.debtP[q])} 的家庭有欠款`],
        ['父母上班时', `收入 × 净储蓄率 ${pct(FAM_SAVE[S.q - 1])}（家境第 ${S.q} 档）`],
        ['父母退休后', '养老金 − 当地人均消费 × 0.7 × 人数'],
        ['孩子上学', '高中约 3,000 元/年，大学约 2 万元/年，民办更高'],
        ['其他', '父母生病另有开销；存款年利息约 1.5%，欠款约 2%（多是房贷或亲戚借款）'],
        ['花光以后', '由已经工作的子女补贴'],
      ],
      notes: ['出生时的积蓄已按家庭金融调查校准：金融资产中位数约城镇 4.6 万、农村 8,500 元（CHFS 2011 按收入增长折算）。各档倍数和净储蓄率仍是估计。'],
      src: '参考：2024 年农村居民（收入 − 消费）÷ 收入约 17%，城镇约 34%',
    };
  },
  famHouse() {
    const H = S.famHouse || { type: 'rent', v: 0 };
    // 拆迁换了安置房、拿了补偿买的房，估值不再是出生时的算法
    if (H.type === 'own' && Math.abs(Math.round(placeHp(S.home) * 90 * (0.7 + S.q * 0.12) / 1e3) * 1e3 - H.v) > 1000) return {
      title: '父母的房子', big: wan(H.v), notes: ['老房子拆迁以后换的房子（安置房或用补偿款买的），按补偿时的估值计。'],
    };
    if (H.type === 'own') return {
      title: '父母的房子', expr: [T(wan(placeHp(S.home)) + '/㎡', S.home.city + '房价'), '×', T('90 ㎡', '面积'), '×', T((0.7 + S.q * 0.12).toFixed(2), '家境系数')],
      result: wan(H.v), notes: ['家境系数是估计：家境越好，房子越大、地段越好。'], src: '房价：统计年鉴 35 个大中城市新建住宅均价、各市统计公报，或安居客挂牌价',
    };
    if (H.type === 'self') return {
      title: '父母的房子（农村自建房）', expr: [T(wan(hpCounty(PBY[S.home.p])) + '/㎡', '县城房价'), '×', T('0.5', '折算'), '×', T('120 ㎡', '面积')],
      result: wan(H.v), notes: ['只是参考：宅基地上的房子很难在市场上卖出。'],
    };
    if (H.type === 'gone') return { title: '父母的房子', big: '已继承', notes: ['父母去世后，房子和存款由兄弟姐妹平分。'] };
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
    if (p.retired) return { title: `${p.name}的养老金`, big: wan(p.inc) + '/年', notes: ['退休以后约为原来收入的一半（估计）。养老金不交个税。'] };
    const L = partnerLoc(p), ek = EDU_WAGE[p.edu], luck = p.k / ek, z = Math.log(luck) / 0.35, rank = Math.round(100 / (1 + Math.exp(-1.702 * z)));
    const married = who !== 'dating', ded: DedRow[] = [], pay = partnerPay(p, ded), pid = married ? S.loc.p : L.p;
    return {
      title: `${p.name}的年收入`,
      expr: [T(wan(wageBase(L)), '工资基数'), '×', T(JOBS[p.jk].m, '职业系数'), '×', T(p.k.toFixed(2), '个人系数'), '×', T(workExpK(p).toFixed(2), '工龄系数')],
      result: '税前 ' + wan(p.inc) + '/年',
      ...payEq(pay, 1),
      rows: [['工作', `${JOBS[p.jk].n}（在${placeName(L)}）`], ['个人系数', `学历溢价 ${ek.toFixed(2)}（${EDU_LV[p.edu]}）× 个人差异 ${luck.toFixed(2)}（同龄人里约第 ${rank} 百分位）`], ['工龄', `工作第 ${Math.max(0, p.age - p.startAge)} 年`],
        ...payRows(pay, p.jk, pid, ded, pay.hpf ? pay.hpf / Math.min(pay.gross, 3 * socAvg(pid)) : 0)],
      notes: ['和你本人、父母同一套公式。对方的学历按「门当户对」抽：同一档约五成五，差一档约三成五（估计）。', married ? '结了婚：孩子的扣除夫妻各扣一半，住房的扣除由工资高的那个扣；对方个人缴的公积金也进家里的公积金账户。' : '还没结婚：只算对方自己的扣除。', ...TAX_NOTES],
      src: TAX_SRC,
    };
  },
  famAssets() {
    const H = S.famHouse || { v: 0 }, m = S.famMoney || 0, d = S.famDebt || 0;
    return { title: '父母的净资产', expr: [T(wan(m), '存款'), '−', T(wan(d), '欠款'), '+', T(wan(H.v || 0), '房产估值')], result: wan(m - d + (H.v || 0)), notes: ['房产按估值计，不一定卖得掉。净资产可以是负数。'] };
  },
  myIncome() {
    if (S.job === 'retired') {
      const pv = PBY[S.loc.p];
      return {
        title: '你的养老金', big: wan((S.pension || 0) / 12) + '/月',
        rows: [['一年', wan(S.pension || 0)], ['城镇职工', `${pv.n}人均约 ${wan(pv.penE || 45903)}/年，再按在职时的缴费基数上下浮动（0.6–1.8 倍）`], ['城乡居民', `${pv.n}人均约 ${wan(pv.penR || 2950)}/年`]],
        notes: ['养老金免征个人所得税，也不再交社保。'],
        src: '中国统计年鉴 2025 表 24-26、24-27；《个人所得税法》第四条',
      };
    }
    const J = JOBS[S.job];
    if (!J || !J.m) return { title: '月收入', big: '—', notes: ['现在没有工作收入。'] };
    const luck = incLuckNow(), gross = wageRate() * luck, ded: DedRow[] = [], pay = myPay(gross, undefined, ded);
    const expr: Term[] = [T(wan(wageBase()), '工资基数'), '×', T(J.m, '职业系数'), '×', T(S.wageK.toFixed(2), '个人系数'), '×', T(expK().toFixed(2), '工龄系数')];
    if (J.v) expr.push('×', T(luck.toFixed(2), '提成系数'));
    return {
      title: '你的月收入',
      expr, result: '税前 ' + wan(gross) + '/年',
      ...payEq(pay, 12),
      rows: [
        ['工资基数', `全国城镇人均 5.65 万 ×（${S.loc.city} ÷ 全国）^0.7`],
        ['职业系数', `${J.n}，按统计局 2025 年分行业、分岗位平均工资（税前）`],
        ['个人系数', `学识、学历（${EDU_LV[S.edu]}）、学校层次，加一点运气；升职、跳槽涨的工资也记在这里`],
        ['工龄系数', `工作第 ${S.jobY} 年。起薪约为平均的 75%，前 5 年涨得快，50 岁后略降`],
        ...(J.v ? [['提成系数', '这一年生意、业绩的好坏，每年变一次'] as [string, string]] : []),
        ...payRows(pay, S.job, S.loc.p, ded, S.hpfRate || 0),
      ],
      notes: TAX_NOTES,
      src: TAX_SRC,
    };
  },
  myMoney() {
    return {
      title: '你的存款', big: wan(S.money),
      rows: [
        ['每年变化', '到手收入（税前扣掉五险一金、个税）− 生活开销 − 房租 − 房贷'],
        ['生活开销', '收入 ×（1 − 储蓄率）；不低于当地人均消费的九成'],
        ['储蓄率', `${Math.round(SAVE_BASE * 100)}% + 15% × ln（人均到手收入 ÷ 当地人均可支配收入）`],
        ['房贷', '先用公积金余额还，不够再用存款'],
        ['利息', '存款约 1.5%，欠款约 4%'],
      ],
      notes: ['背着房贷的家庭会压缩日常开销。'],
      src: '参考：2025 年全国居民储蓄率约 32%',
    };
  },
  hpf() {
    if (!S.hpfOn && !S.hpf) return { title: '住房公积金', big: '没有', notes: ['你现在的工作没有缴公积金。骑手、个体户、务农基本都没有。'], src: '2024 年全国实缴人数约占城镇就业的 37%' };
    // 待业、或者换到了不缴公积金的单位：账户封存，余额还在
    if (!S.hpfOn) return {
      title: '住房公积金', big: wan(S.hpf) + '（封存）',
      rows: [['状态', S.job === 'seeking' ? '待业，停止缴存' : S.job === 'retired' ? '已退休，停止缴存' : '现在的工作不缴公积金'], ['账户利率', '1.5%'], ['可以提取', '付房租、买房付首付、按月还房贷']],
      notes: ['封存的账户余额还在，照样计息。', '找到交公积金的工作后接着缴；连续缴存的年数从头算，满 1 年才能申请公积金贷款。'],
    };
    const pay = myPay(), rate = S.hpfRate || 0.05, base = pay.hpf / rate;
    return {
      title: '住房公积金', expr: [T(wan(base), '缴存基数'), '×', T(pct(rate), '缴存比例'), '×', T('2', '单位 + 个人')],
      result: wan(pay.hpf * 2) + '/年',
      rows: [['账户余额', wan(S.hpf || 0)], ['缴存基数', '税前工资，不超过社平工资的 3 倍'], ['账户利率', '1.5%'], ['可以提取', '付房租、买房付首付、按月还房贷'], ['公积金贷款', '连续缴存满 1 年可申请，首套利率 2.6%']],
      notes: partnerHpf() ? ['配偶缴的公积金也算进家庭账户。'] : [],
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
