// 「怎么算的」：数字旁边一个小 i，点击后弹出一张说明卡片（公式、代入这个人的数字、规则、来源）。
// 说明在点开那一刻才计算，所以数字总是最新的。
import type { ReactNode } from 'react';
import {
  EDU_LV, EDU_WAGE, FAM_REPAY, FAM_SAVE, JOBS, LE_TARGET, LOAN_RULES, LT, NAT_URBAN_INC, PARENT_DISP, PARENT_K, PBY,
  RESID_PENSION_JOBS, S, WEALTH0, expK, famIncome, hpCounty, leOf, loanPayY, parentIncome, parentRetired, parentWage,
  parentWorkLoc, partnerHpf, partnerLoc, peek, placeHp, placeInc, placeName, wageBase, wan, workExpK,
} from '../engine';
import { QW } from './util';

/** 算式里的一项：数值 v，名称 l；字符串是运算符 */
export type Term = string | { v: string | number; l: string };
export interface Tip {
  title: string;
  expr?: Term[]; result?: string;   // 算式 = 结果
  big?: string;                     // 没有算式时，直接给一个大数字
  math?: ReactNode;                 // 公式
  rows?: [string, string][];
  notes?: string[];
  src?: string;
}

const pct = (x: number) => (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%';
const T = (v: string | number, l: string): Term => ({ v, l });
const sgn = (x: number) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1);

export const TIPS: Record<string, (arg?: string) => Tip> = {
  famQuint() {
    const f = S.fam, n = 3 + f.sibs.length;
    return {
      title: '家庭人均可支配收入',
      expr: ['(', T(wan(parentWage(f.dad)), '父亲工资'), '+', T(wan(parentWage(f.mom)), '母亲工资'), ')', '×', T(PARENT_DISP, '税后比例'), '÷', T(n + ' 人', '家庭人口')],
      result: wan(famIncome()) + '/年',
      rows: [['家境', `落在${S.rural ? '农村' : '城镇'}居民收入五等份的第 ${S.q} 档（${QW[S.q - 1]}）`], ['可支配收入', '税后到手的钱：工资、经营收入、房租利息、养老金和补贴'], ['人均', '全家到手收入 ÷ 全家人数（老人小孩都算）']],
      notes: ['父母的工资和你本人用同一套公式算（点父母那一行的 i 可以看）。'],
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
      notes: ['可支配收入就是税后到手的钱。', '父母各自的收入在他们那一行的 i 里有算法。'],
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
    return {
      title: label + '的年收入（税后）',
      expr: [T(wan(wageBase(L)), '工资基数'), '×', T(J.m, '职业系数'), '×', T(p.k.toFixed(2), '个人系数'), '×', T(workExpK(p).toFixed(2), '工龄系数'), '×', T(pk, '父母一代'), '×', T(PARENT_DISP, '税后')],
      result: wan(parentIncome(who)) + '/年',
      rows: [
        ['工作', `${p.job}${L.city !== S.home.city ? '（在' + placeName(L) + '）' : ''}`],
        ['工资基数', L.kind === 'rural' ? `${placeName(L)}农村居民人均可支配收入` : `${placeName(L)}城镇居民人均可支配收入 ${wan(placeInc(L))}，按 0.7 次方向全国平均 ${wan(NAT_URBAN_INC)} 收拢（城市间工资差距比收入差距小）`],
        ['个人系数', `学历溢价 ${ek.toFixed(2)}（${EDU_LV[p.edu]}）× 个人差异 ${luck.toFixed(2)}（同龄人里约第 ${rank} 百分位，含工时、奖金、兼职和运气）`],
        ['工龄系数', `工作第 ${y} 年：前 5 年从 0.75 涨到 1.0，之后每年 +2%，最高 1.1；50 岁以后每年 −1%`],
        ['父母一代', `校准系数，使出生时${S.rural ? '农村' : '城镇'}家庭人均可支配收入的中位数对上统计局 2025 年数据`],
      ],
      notes: ['和你本人同一套公式。职业系数按统计局分行业平均工资折算。'],
      src: '父母一代的学历分布参考 2020 年人口普查（估计）',
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
    const L = partnerLoc(p), ek = EDU_WAGE[p.edu], luck = p.k / ek, z = Math.log(luck) / 0.35, rank = Math.round(100 / (1 + Math.exp(-1.702 * z)));
    return {
      title: `${p.name}的年收入`,
      expr: [T(wan(wageBase(L)), '工资基数'), '×', T(JOBS[p.jk].m, '职业系数'), '×', T(p.k.toFixed(2), '个人系数'), '×', T(workExpK(p).toFixed(2), '工龄系数')],
      result: wan(p.inc) + '/年',
      rows: [['工作', `${JOBS[p.jk].n}（在${placeName(L)}）`], ['个人系数', `学历溢价 ${ek.toFixed(2)}（${EDU_LV[p.edu]}）× 个人差异 ${luck.toFixed(2)}（同龄人里约第 ${rank} 百分位）`], ['工龄', `工作第 ${Math.max(0, p.age - p.startAge)} 年`]],
      notes: ['和你本人、父母同一套公式。对方的学历按「门当户对」抽：同一档约五成五，差一档约三成五（估计）。'],
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
        title: '你的养老金', big: wan(S.pension || 0) + '/年',
        rows: [['城镇职工', `${pv.n}人均约 ${wan(pv.penE || 45903)}/年，再按退休前工资上下浮动（0.6–1.8 倍）`], ['城乡居民', `${pv.n}人均约 ${wan(pv.penR || 2950)}/年`]],
        src: '中国统计年鉴 2025 表 24-26、24-27',
      };
    }
    const J = JOBS[S.job];
    if (!J || !J.m) return { title: '年收入', big: '—', notes: ['现在没有工作收入。'] };
    return {
      title: '你的年收入',
      expr: [T(wan(wageBase()), '工资基数'), '×', T(J.m, '职业系数'), '×', T(S.wageK.toFixed(2), '个人系数'), '×', T(expK().toFixed(2), '工龄系数')],
      result: '≈ ' + wan(S.income) + '/年',
      rows: [
        ['工资基数', `全国城镇人均 5.65 万 ×（${S.loc.city} ÷ 全国）^0.7`],
        ['职业系数', `${J.n}，按统计局 2025 年分行业、分岗位平均工资`],
        ['个人系数', `学识、学历（${EDU_LV[S.edu]}）、学校层次，加一点运气`],
        ['工龄系数', `工作第 ${S.jobY} 年。起薪约为平均的 75%，前 5 年涨得快，50 岁后略降`],
      ],
      notes: J.v ? ['做生意的收入每年上下波动很大。'] : [],
    };
  },
  myMoney() {
    return {
      title: '你的存款', big: wan(S.money),
      rows: [
        ['每年变化', '到手收入 − 生活开销 − 房租 − 房贷'],
        ['生活开销', '收入 ×（1 − 储蓄率）；不低于当地人均消费的九成'],
        ['储蓄率', '20% + 15% × ln（人均收入 ÷ 当地人均收入）'],
        ['房贷', '先用公积金余额还，不够再用存款'],
        ['利息', '存款约 1.5%，欠款约 4%'],
      ],
      notes: ['背着房贷的家庭会压缩日常开销。'],
      src: '参考：2025 年全国居民储蓄率约 32%',
    };
  },
  hpf() {
    if (!S.hpfOn && !S.hpf) return { title: '住房公积金', big: '没有', notes: ['你现在的工作没有缴公积金。骑手、个体户、务农基本都没有。'], src: '2024 年全国实缴人数约占城镇就业的 37%' };
    return {
      title: '住房公积金', expr: [T(wan(S.income || 0), '年收入'), '×', T(pct(S.hpfRate || 0.05), '缴存比例'), '×', T('2', '单位 + 个人')],
      result: wan((S.income || 0) * (S.hpfRate || 0.05) * 2) + '/年',
      rows: [['账户余额', wan(S.hpf || 0)], ['账户利率', '1.5%'], ['可以提取', '付房租、买房付首付、按月还房贷'], ['公积金贷款', '连续缴存满 1 年可申请，首套利率 2.6%']],
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

/** 按 "名字:参数" 构建一张说明卡片 */
export function buildTip(key: string): Tip | null {
  const [name, arg] = key.split(':');
  return TIPS[name] && S ? peek(() => TIPS[name](arg)) : null;
}
