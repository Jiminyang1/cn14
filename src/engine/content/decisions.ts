// 抉择：哪些抉择会出现、在哪个月（monthDecisions、yearDecisions、schoolDecision），以及每个抉择的选项和结果（DEC）。
// 抉择：{ build: () => { title, body, fact?, card?, choices, ctx? } | null, apply: (选中的 k, ctx) => 文字或{t,k,f} | null }

import type { Choice } from '../types';
import { fpow } from '../fmath';
import { BIG, BIRTH_TOTAL, NATION, PBY } from '../data';
import { CAUSE } from '../mortality';
import { EDU_LV, admit, enroll, gkAutoApps, gkCandidates, gkLines, gkRank, gkResolve, gkScore, schoolStart } from '../education';
import { ILL, oop, reimburse } from '../health';
import { JOBS, RAISE, RESID_PENSION_JOBS, civilTry, gig, gradJob, hire, hireInCity, isWorking, quitJob, raise, retire } from '../career';
import { MEET_HOW, READY0, READY_K, brideAmt, loveWord, mShift, mutualP, partnerInc, partnerRows, ptJobName } from '../romance';
import { S } from '../state';
import { addDoc, log, logLater } from '../journal';
import { annualPay, bestPlan, buyHouse, foreclose, hhIncome, hometownHouse, loanBal, loanArrears, loanPayY, loanPlans, planSub, sellHouse, sellInherited } from '../housing';
import { awayFromHome, cityLoc, farFromParents, homeCity, migrantCity, moveTo, placeCons, placeHp, placeInc, placeName } from '../place';
import { babyP, canBaby, conceive, kidsAlive, sibsAlive } from '../family';
import { calMonth, calYear, perMonth } from '../monthly';
import { entryYear, nowM } from '../calendar';

declare module '../types' {
  interface Flags {
    hunt?: { at: number; job: string; same?: number; home?: number } | null; // 正在找工作：出生后第几个月上岗、找到的是什么工作
    toWork?: number;   // 中考后不读了、还不满 16 岁：在家待到 16 岁再出去打工（见 huntMonth）
  }
}
import { chance, clamp, gauss, pick, ri, wpick } from '../rng';
import { eff } from '../stats';
import { bothParents, carer, parentsHelp, parentsWord } from '../parents';
import { rural } from './events';
import { wan } from '../format';
import { careFeeY, oldIncomeY, uiMonths } from '../finance';
// 晚年住养老院的抉择：积蓄要撑多少年才和收入够付的一样愿意去（80 岁左右的余寿约 9 年，估计）
const CARE_YEARS = 9;
import { borrowMoney, changeMoney, liquidBalance } from '../accounts';
import { inKg } from '../schedule';
import { DEMOL_K, demolDue, demolish, famPayBride, kidHomeCost, lendSib, marryKid, weddingKid } from '../kin';
import { heirShares, inheritSplit } from '../household';
import { KEEP, goHomeOld, jumpShip, lastJob, layOff, listDue, rehireText, severance, startRehire, startSnowbird } from '../turns';
import { shape } from '../personality';
import { DIBAO_M, DOWNSIZE_K, KID_ADV_Y, PAR_SHARE, SELL_K, askKids, askParents, parentsCan, dibaoOK, downsize, grownKids, kidSupportY, tightDue, tightText } from '../tight';

// ===== 哪些抉择会出现 =====
// 四类：
// · 学校的日历（schoolDecision）：毕业那一年的 6 月（中考、高考）或 6–7 月（毕业），由 schedule.ts 的 schoolMonth 排；
// · 由状态触发的（monthDecisions 的前半）：每个月开始时都查，状态一出现，最晚下个月就弹出；
// · 本来就是「每年有一定概率」的（monthDecisions 的后半）：每月按 perMonth 换算的概率判定，同一个年龄年里最多一次，
//   所以处境不变时一年里出现的概率和原来一样；间隔（gapOK）仍按年龄算——出现的月份前后都是随机的，平均间隔不变；
// · 每年判定一次、落在随机月份的（yearDecisions）：结婚（每年谈一次）、裁员名单和拆迁（判定在 turns.ts 的 listDue、kin.ts 的 demolDue，按年）。
// S.done['dec_'+id] 是弹出时的年龄（lifecycle.ts 的 openDec 记的）；需要按月算间隔的，用 S.decAt（排进日程时是出生后第几个月，schedule.ts 记）。
const DKEY: Record<string, string> = {};
const doneAge = (id: string) => S.done[DKEY[id] ||= 'dec_' + id];
const once = (id: string) => doneAge(id) == null;
const gapOK = (id: string, g: number) => doneAge(id) == null || S.age - doneAge(id) >= g;
/** 离上次排进日程过了几个月；没排过的是无穷大 */
const monthsSince = (id: string) => { const at = S.decAt && S.decAt[id]; return at == null ? Infinity : nowM() - at; };
/** 每年概率 p 的抉择：这个年龄年里还没出现过，这个月按 perMonth(p) 判定（换算结果缓存起来：每月都要查，fpow 不便宜）。
 *  只在一年里的 n 个月份出现的（比如暑假），在这 n 个月里每月按 1 − (1 − p)^(1/n) 判定，一年累计仍是 p */
const PM = new Map<string, number>();
const yearly = (id: string, p: number, n = 12) => {
  if (doneAge(id) === S.age) return false;
  const key = p + '/' + n;
  let q = PM.get(key);
  if (q == null) PM.set(key, q = n === 12 ? perMonth(p) : n <= 1 ? p : 1 - fpow(1 - p, 1 / n));
  return chance(q);
};

const cashLeft = (have = '存款还有') => `${have}${wan(S.money)}${S.debt > 0 ? `，另有欠款${wan(S.debt)}` : ''}`;

// 找工作要花的月数（估计）：降低要求找份普通工作 2–12 个月（平均 7），回老家托亲戚朋友 1–8 个月。
// 按年推进时，从失业到「还没有工作」弹出平均约一年，这一年都没有工资；按月以后抉择一两个月内就弹出，
// 找工作的时间放在这里。18–60 岁每 100 人年待业的月数：按年时 51.6，按月 31.5（其中备考公务员都是 8.2），
// 即待业约占这个年龄段时间的 2.6%（按年时 4.3%；2025 年城镇调查失业率平均 5.2%，分母是劳动力）
export const HUNT: Record<'any' | 'home', [number, number]> = { any: [2, 12], home: [1, 8] };
// 中风致残、干不了活的人什么时候退休：交职工养老保险的单位职工办病退（因病完全丧失劳动能力，男 50 岁、女 45 岁起）；
// 务农、打零工、个体户这些只交城乡居民养老保险的，60 岁起领城乡居民养老金
const sickRetireAge = (job: string) => RESID_PENSION_JOBS.has(job) ? 60 : S.sex === 'M' ? 50 : 45;
/** 每个月开始时（schedule.ts 的 planMonth 调用）：考上的学校到了 9 月开学（education.ts 的 schoolStart）；
 *  中考后在家等着的，满 16 岁出去打工；中风致残在家养病的，到了年纪退休；找了一阵子的工作，到时候上岗 */
export function huntMonth() {
  schoolStart();
  if (S.flags.disabled && S.job === 'seeking' && S.age >= sickRetireAge(S.flags.lastJob || 'clerk')) retire();
  if (S.flags.toWork && S.age >= 16) {
    S.flags.toWork = 0;
    if (!S.school && !S.job) { hire(chance(0.6) ? 'factory' : 'migrant', migrantCity()); eff({ h: -3 }); log(`满了16岁，收拾行李去了${S.loc.city}，进了一家工厂。你是车间里年纪最小的。`, 'ev'); }
  }
  const H = S.flags.hunt; if (!H) return;
  if (S.job !== 'seeking' || S.school || S.flags.disabled) { S.flags.hunt = null; return; } // 已经有了别的去处，或者中风以后干不了活了
  if (nowM() < H.at) return;
  S.flags.hunt = null;
  if (H.home) { hire(H.job); log(`在${placeName()}找到了工作，做了${JOBS[S.job].n}。`, 'ev'); return; }
  hireInCity(H.job);
  log(H.same ? `又找到了一份${JOBS[S.job].n}的工作。` : `找到了一份${JOBS[S.job].n}的工作。`, 'ev');
}

/** 毕业那一年 6 月该出现的升学、毕业抉择 */
export function schoolDecision() {
  return { 初中: 'zhongkao', 高中: 'gaokao', 复读: 'gaokao', 职高: 'vocgrad', 大专: 'graduate', 本科: 'graduate', 硕士: 'graduate' }[S.school];
}

/** 每个月开始时：这个月该出现的抉择（按优先级排，schedule.ts 每月最多排两个） */
// ===== 童年的小抉择 =====
// 让玩家从小就参与：每个抉择有一个年龄窗口，在窗口里大约九成的人会遇到一次（每年概率按窗口长短定）。
// 效果都很小；选了什么记在 S.flags.kid 里，以后可以接着写。
// 性格：选项的 tilt 让「什么样的孩子选什么」不同；apply 里的 shape 是这次经历反过来推一下性格（每次每条轴 0.05–0.15，按默认权重算人群平均大致为 0）
// m：只在公历这几个月出现（暑假、过年、上学的日子），一年累计的概率仍是 p（见 yearly）
const TERM = [9, 10, 11, 12, 1, 3, 4, 5, 6]; // 上学的月份：去掉暑假（7–8 月）和寒假（多在 2 月）
const CHILD: { id: string; a: [number, number]; p: number; c?: () => boolean; m?: number[] }[] = [
  { id: 'kidOut', a: [2, 3], p: 0.7 },
  // 幼儿园第一天：只在入园那个月（满 3 岁那年 9 月，schedule.ts 的 schoolMonth 先写「上幼儿园了」），没上幼儿园的没有
  // 幼儿园第一天（kidKg）不在这里：入园那个月由 schedule.ts 直接排进来
  { id: 'kidClass', a: [5, 7], p: 0.55, c: () => !rural() && S.q >= 2 && !!parentsWord() },
  { id: 'kidSummer', a: [6, 10], p: 0.4, m: [7, 8], c: () => S.flags.lb === 'both' && !!parentsWord() },
  { id: 'kidWallet', a: [7, 10], p: 0.45, m: TERM, c: () => !!S.school },
  { id: 'kidBully', a: [8, 12], p: 0.38, m: TERM, c: () => !!S.school },
  { id: 'kidMoney', a: [8, 13], p: 0.33, m: [1, 2] }, // 压岁钱：春节在 1 月下旬到 2 月中旬
  { id: 'kidCopy', a: [9, 13], p: 0.38, m: TERM, c: () => !!S.school },
  { id: 'kidCrush', a: [12, 14], p: 0.5, c: () => !!S.school },
];
const kidPick = (id: string, k: string) => { (S.flags.kid ||= {})[id] = k; };

// 没有雇主的工作：不会有别的公司来挖
const SELF_EMP = new Set(['rider', 'driver', 'shop', 'boss', 'farmer']);
// 去大城市闯一闯：老同学在哪座城市（权重）；只去收入比这里高一成以上的（否则「收入↑」不成立）
const BIGCITY_W = { 深圳: 3, 上海: 2.5, 北京: 2, 杭州: 2, 广州: 2.5, 成都: 1.5 };
const bigCities = () => { const inc = placeInc(); return Object.keys(BIGCITY_W).filter(c => BIG[c].inc >= inc * 1.1); };

// 「35岁」每年的概率，按职业分。平均约 1%：在私企干到 48 岁的约一成会遇到（智联招聘：46–50 岁求职者 11.5% 曾因年龄被裁）。
// 互联网最高：2020 年普查城市里信息技术业 40–44 岁的人只有 30–34 岁的 38%，全行业是 70%。各行业的倍数是估计，见 DATA.md「35 岁被裁」
const CUT35: Record<string, number> = { tech: 0.025, clerk: 0.012, sales: 0.01, engineer: 0.008 };

export function monthDecisions() {
  const a = S.age, f = S.fam, d = [], J = JOBS[S.job], working = !!J && J.m > 0;
  // ---- 由状态触发：一出现就排 ----
  if (S.flags.ill && !S.flags.ill.treat) d.push('illness');
  if (S.job === 'seeking' && !S.school && !S.flags.hunt && !S.flags.disabled) { // 中风致残的不再找工作
    // 公务员考试一年一次：上次考完满 12 个月才再问要不要再考，中间这一年在家备考
    if (S.flags.civilRetry && a < 35) { if (nowM() - (S.flags.civilAt ?? -Infinity) >= 12) d.push('civilretry'); }
    else d.push('seek');
  }
  if ((f.mom.alive && f.mom.ill === 1) || (f.dad.alive && f.dad.ill === 1)) { if (a >= 22) d.push('parentcare'); }
  if (weddingKid()) d.push('kidhome');
  if (S.flags.heirDue && !S.flags.inherited) d.push('heritage');
  if (S.indep && S.inheritedHomes?.length && monthsSince('inheritedhome') >= 12 &&
    (S.inheritedHomes.some(home => !home.reviewed) || liquidBalance() < 0 || loanArrears() > 0)) d.push('inheritedhome');
  if (S.job === 'retired' && once('retireplan') && a <= 75) d.push('retireplan');
  const lb = loanBal(), inc = lb || S.indep ? placeInc() : 0;
  const arrears = lb && loanArrears() >= Math.max(1, loanPayY() / 12 * 2);
  if (arrears && monthsSince('arrears') >= 3) d.push('arrears');
  // 手头紧了（tight.ts）：连续几个月付不起基本开销或者欠款还在涨。房贷断供有自己的抉择（arrears），那时不再问这个
  if (S.indep && !S.school && a >= 18 && !arrears && monthsSince('tight') >= 12 && tightDue(placeInc())) d.push('tight');
  // ---- 童年的小抉择 ----
  if (a <= 14) for (const c of CHILD) if (a >= c.a[0] && a <= c.a[1] && once(c.id) && (!c.m || c.m.includes(calMonth())) && (!c.c || c.c()) && yearly(c.id, c.p, c.m ? c.m.length : 12)) d.push(c.id);
  // ---- 每年一定概率：按月换算 ----
  if (f.married && f.partner && f.partner.alive && canBaby() && yearly('baby', babyP())) d.push('baby');
  const ask = !!f.dating && f.dating.wh === 2; // 对方家里等着婚房
  if (!S.house && working && a >= (ask ? 22 : 26) && a <= 50 && (f.married || a >= 30 || ask) && gapOK('house', ask ? 1 : 4) && yearly('house', ask ? 0.8 : 0.35)) d.push('house');
  if (working && S.loc.kind !== 'big' && a >= 19 && a <= 32 && once('bigcity') && !J.stable && bigCities().length && yearly('bigcity', 0.18)) d.push('bigcity');
  // 每年 1%：在私企干到 48 岁的约一成会遇到（智联招聘：46–50 岁求职者 11.5% 曾因年龄被裁，见 DATA.md）；这一年出过的，裁员名单不再出现（见 layofflist）
  if (J && J.priv && a >= 35 && a <= 48 && once('crisis') && yearly('crisis', CUT35[S.job] ?? 0.01)) d.push('crisis');
  // 跳槽：被别的公司挖，只说得通有雇主的工作（骑手、司机、个体户、小老板、务农不算）
  if (working && J.risk > 0 && !SELF_EMP.has(S.job) && a >= 24 && a <= 50 && gapOK('jobhop', 6) && yearly('jobhop', 0.07)) d.push('jobhop');
  if (a >= 78 && once('oldcare') && yearly('oldcare', 0.3)) d.push('oldcare');
  if (S.indep && a >= 24 && a <= 65 && !S.flags.sibLoan && sibsAlive().some(s => s.age >= 22) && S.money > inc * 0.6 && gapOK('sibloan', 10) && yearly('sibloan', 0.015)) d.push('sibloan'); // 有兄弟姐妹的人一辈子约被借 0.6 次（估计）
  if (lb && !arrears && !(S.debt > 0) && S.money - inc * 1.5 > Math.max(inc * 0.5, lb * 0.2) && gapOK('prepay', 4) && yearly('prepay', 0.3)) d.push('prepay');
  return d;
}

// 女方家里要婚房、你还没有：坚持先买房的人家的比例（估计）。原来约一半；工资对齐统计局以后，32 岁前买上房的男性少了约一成半，
// 32 岁未婚的男性从 23.7% 升到 25.2%（2020 年普查 30–34 岁 20.6%），改成 HOUSE_FIRST 以后见 DATA.md「工资」
export const HOUSE_FIRST = 0.4;
// 能不能谈结婚：法定婚龄（《民法典》第1047条，男不早于22周岁、女不早于20周岁），双方都要到；谈了一两年（年纪大些的一年就谈）
const marryOK = () => {
  const p = S.fam.dating; if (!p || S.fam.married) return false;
  const man = S.sex === 'M' ? S.age : p.age, woman = S.sex === 'M' ? p.age : S.age;
  return man >= 22 && woman >= 20 && S.age - p.metAt >= (S.age < 28 && !(mShift() < -2) ? 2 : 1);
};

/** 生日那个月：每年判定一次的抉择，schedule.ts 把它们放在这一年随机的一个月 */
export function yearDecisions() {
  const a = S.age, d = [];
  // 谈了一两年，每年谈一次结婚的事（弹出时再查一遍：这期间可能分手、换了人）
  if (marryOK()) d.push('marry');
  if (isWorking() && gapOK('layofflist', 4) && listDue()) d.push('layofflist');
  if (a >= 18 && demolDue()) d.push('demolish');
  return d;
}

// ===== 抉择 =====
export const DEC = {
  // ---------- 童年的小抉择（时间表见 CHILD） ----------
  kidOut: {
    build: () => ({
      title: '外面的世界', body: `${carer()}第一次带你去广场。那里有很多小孩、很多狗，音乐响得震耳朵。`,
      choices: [{ k: 'run', label: '挣脱大人的手，跑过去', sub: '人际↑', w: 2, tilt: { e: 0.5, r: 0.3 } }, { k: 'hide', label: '躲在大人身后偷偷看', sub: '', w: 2, tilt: { e: -0.4, r: -0.2 } }, { k: 'cry', label: '哭着要回家', sub: '幸福↓', w: 1, tilt: { n: 0.5 } }],
    }),
    apply: k => {
      kidPick('kidOut', k);
      shape(k === 'run' ? { e: 0.12, r: 0.1, n: -0.06 } : k === 'hide' ? { e: -0.12, r: -0.1 } : { n: 0.12 });
      if (k === 'run') { eff({ so: 1, h: 1 }); return chance(0.3) ? '你冲进一群小孩里，摔了一跤，爬起来接着跑。' : '你冲进一群小孩里，不一会儿就跟着他们一起追泡泡。'; }
      if (k === 'hide') { eff({ so: 1 }); return '你攥着大人的衣角看了好久。快回家的时候，终于有个小孩过来拉你一起玩。'; }
      eff({ h: -1 }); return '一只大狗朝你跑过来，你吓得大哭。那天之后，你见到狗就绕着走。';
    },
  },
  kidKg: {
    build: () => ({
      title: '幼儿园第一天', body: `${carer()}把你交给老师，转身要走。`,
      choices: [{ k: 'cry', label: '抱着门框大哭', sub: '', w: 2, tilt: { n: 0.5 } }, { k: 'teacher', label: '拉着老师的手走进去', sub: '人际↑', w: 1.5, tilt: { a: 0.4, c: 0.3 } }, { k: 'toy', label: '看见一屋子玩具，头也不回', sub: '幸福↑', w: 1.5, tilt: { r: 0.4, n: -0.3 } }],
    }),
    apply: k => {
      kidPick('kidKg', k);
      shape(k === 'cry' ? { n: 0.12, e: -0.08 } : k === 'teacher' ? { a: 0.03, c: 0.03, r: -0.1, n: -0.06 } : { e: 0.1, r: 0.1, n: -0.1 });
      if (k === 'cry') { eff({ h: -1 }); return '你哭了一整个上午。第二天还是哭，第三天就和同桌抢起了积木。'; }
      if (k === 'teacher') { eff({ so: 1 }); return '你一直跟在老师身边，放学时老师夸你最乖。'; }
      eff({ h: 1 }); return '你扑向那一屋子玩具。放学来接你的时候，你还不想走。';
    },
  },
  kidClass: {
    build: () => ({
      title: '兴趣班', body: `${parentsWord()}说${S.school ? '' : '上小学前'}要给你报一个兴趣班，问你想学什么。`, fact: '城镇家庭的课外班开销，常常是孩子教育支出里最大的一块',
      choices: [{ k: 'draw', label: '画画', sub: '幸福↑', w: 2, tilt: { e: -0.3 } }, { k: 'piano', label: '钢琴', sub: '学识↑ 家里开销↑', w: S.q >= 4 ? 2 : 0.5, tilt: { c: 0.4 } }, { k: 'swim', label: '游泳', sub: '健康↑', w: 1.5, tilt: { r: 0.3, e: 0.2 } }, { k: 'none', label: '什么都不想学', sub: '', w: 1, tilt: { c: -0.4 } }],
    }),
    apply: k => {
      kidPick('kidClass', k);
      shape(k === 'draw' ? { e: -0.06, r: -0.06 } : k === 'piano' ? { c: 0.1 } : k === 'swim' ? { e: 0.08, r: 0.08 } : { c: -0.1 });
      const fee = placeInc() * (k === 'piano' ? 0.15 : 0.06);
      if (k === 'draw') { eff({ h: 1, money: -fee }); return '每个周末去画画班。你画的太阳总是带着一张笑脸。'; }
      if (k === 'piano') { eff({ kn: 1, h: -1, money: -fee }); return `开始学钢琴。每天练半个小时，${carer()}坐在旁边盯着。`; }
      if (k === 'swim') { eff({ hl: 2, money: -fee }); return '学会了游泳，呛了好几口水，最后能一口气游二十五米。'; }
      eff({ h: 1 }); return `${parentsWord() || '家里'}拗不过你，什么班都没报。周末你在楼下玩到天黑。`;
    },
  },
  kidSummer: {
    build: () => ({
      title: '暑假', body: `${parentsWord()}打电话来，问你暑假要不要去${bothParents() ? '他们' : S.fam.mom.alive ? '她' : '他'}打工的城市。`,
      choices: [{ k: 'go', label: '去', sub: `能见到${parentsWord()}`, w: 3, tilt: { r: 0.3, e: 0.2 } }, { k: 'stay', label: `留在家里陪${carer()}`, sub: '', w: 1, tilt: { a: 0.4 } }],
    }),
    apply: k => {
      kidPick('kidSummer', k);
      shape(k === 'go' ? { r: 0.06, a: -0.04 } : { a: 0.12, r: -0.15 });
      if (k === 'go') { eff({ h: 1, money: -placeInc() * 0.03 }); return `坐了一夜的火车到了城里。${parentsWord()}白天上班，你一个人在出租屋里看电视，晚上${bothParents() ? '一家人' : '两个人'}挤在一张床上。`; }
      eff({ so: 1, h: -1 }); return `留在了家里。暑假里，你和${carer()}一起去地里，晚上坐在院子里乘凉。`;
    },
  },
  kidWallet: {
    build: () => ({
      title: '捡到钱包', body: '放学路上，你在路边捡到一个钱包，里面有两百块钱。',
      choices: [{ k: 'teacher', label: '交给老师', sub: '', w: 3, tilt: { c: 0.4, a: 0.3 } }, { k: 'keep', label: '偷偷留下来', sub: '', w: 1, tilt: { c: -0.5, a: -0.3 }, noWhy: true }, { k: 'back', label: '放回原地', sub: '', w: 1, tilt: { e: -0.3, r: -0.2 } }],
    }),
    apply: k => {
      kidPick('kidWallet', k);
      shape(k === 'teacher' ? { c: 0.04, e: 0.05, n: -0.04 } : k === 'keep' ? { c: -0.15, a: -0.08, n: 0.1 } : { e: -0.12 });
      if (k === 'teacher') { eff({ h: 1, so: 1 }); return '你把钱包交给了老师。失主送来一面锦旗，校长在升旗仪式上念了你的名字。'; }
      if (k === 'keep') { eff({ h: -1 }); return '你把钱藏在了书包夹层里。买了几次零食，每次都心里发慌。'; }
      return '你把钱包放回原地，站在旁边等了好久，没有人来。';
    },
  },
  kidBully: {
    build: () => ({
      title: '看见同学被欺负', body: '课间，几个高年级的学生把你们班一个瘦小的同学堵在了厕所门口。',
      choices: [{ k: 'stand', label: '站出来', sub: '可能挨打', w: 1, tilt: { r: 0.5, a: -0.3 } }, { k: 'tell', label: '跑去告诉老师', sub: '', w: 2, tilt: { c: 0.4 } }, { k: 'ignore', label: '假装没看见', sub: '', w: 2, tilt: { r: -0.4, n: 0.3 } }],
    }),
    apply: k => {
      kidPick('kidBully', k);
      shape(k === 'stand' ? { r: 0.15, a: -0.12, n: -0.06 } : k === 'tell' ? { c: 0.03, a: 0.06, n: -0.04 } : { n: 0.08, r: -0.08 });
      if (k === 'stand') { if (chance(0.4)) { eff({ hl: -1, so: 1 }); return '你冲上去，被推倒在地上，膝盖破了。那个同学后来成了你的好朋友。'; } eff({ so: 1, h: 1 }); return '你冲上去大喊了一声，那几个人骂骂咧咧地走了。'; }
      if (k === 'tell') { eff({ so: 1 }); return '老师来了，把那几个学生带去了办公室。'; }
      eff({ h: -2 }); return '你低着头走开了。那天晚上，你一直想着那个同学的眼神。';
    },
  },
  kidMoney: {
    build: () => ({
      title: '压岁钱', body: `过年收了${S.q >= 4 ? '一千多' : S.q >= 2 ? '几百' : '一百多'}块压岁钱。这一次，${carer()}说让你自己做主。`,
      choices: [{ k: 'save', label: '存起来', sub: '', w: 2, tilt: { c: 0.5, r: -0.2 } }, { k: 'buy', label: '买那个想要很久的东西', sub: '幸福↑', w: 2, tilt: { c: -0.4, r: 0.2 } }, { k: 'give', label: `交给${carer()}`, sub: '', w: 1, tilt: { a: 0.4 } }],
    }),
    apply: k => {
      kidPick('kidMoney', k);
      shape(k === 'save' ? { c: 0.1, r: -0.06 } : k === 'buy' ? { c: -0.1, r: 0.06 } : { a: 0.08, c: -0.08 });
      if (k === 'save') { eff({ h: 1 }); return '你把钱存进了一个小猪存钱罐，每隔几天就摇一摇听听响。'; }
      if (k === 'buy') { eff({ h: 1 }); return `用压岁钱买了${pick(['一套乐高', '一个游戏机', '一双新球鞋', '一大堆漫画书'])}，高兴了一整个寒假。`; }
      eff({ so: 1 }); const w = carer(); return `你把钱交给了${w}。${/[爸爷公]/.test(w) ? '他' : '她'}说帮你存着，以后给你交学费。`;
    },
  },
  kidCopy: {
    build: () => ({
      title: '抄作业', body: '同桌把作业本推过来：「快抄，课代表马上要收了。」',
      choices: [{ k: 'copy', label: '抄', sub: '', w: 2, tilt: { c: -0.5 } }, { k: 'self', label: '不抄，自己写', sub: '学识↑', w: 1.5, tilt: { c: 0.5, a: -0.2 } }, { k: 'look', label: '只看看思路', sub: '', w: 1.5 }],
    }),
    apply: k => {
      kidPick('kidCopy', k);
      shape(k === 'copy' ? { c: -0.12, a: 0.05 } : k === 'self' ? { c: 0.12, a: -0.08 } : {});
      if (k === 'copy') { eff({ kn: -1, h: 1 }); return chance(0.3) ? '你们俩错得一模一样，被老师一眼看了出来，罚抄了十遍。' : '你飞快地抄完，交了上去。'; }
      if (k === 'self') { eff({ kn: 1, h: -1 }); return '你埋头自己写完，交得最晚，对的却最多。'; }
      eff({ kn: 0.5 }); return '你看了看同桌的思路，自己算了一遍，才明白那道题是怎么回事。';
    },
  },
  kidCrush: {
    build: () => ({
      title: '喜欢的人', body: '你发现自己总是忍不住看班里的一个同学。',
      choices: [{ k: 'note', label: '递一张纸条', sub: '', w: 1, tilt: { r: 0.5, e: 0.3 } }, { k: 'secret', label: '藏在心里', sub: '', w: 3, tilt: { e: -0.3, n: 0.3 } }, { k: 'friend', label: '告诉最好的朋友', sub: '', w: 1, tilt: { e: 0.4 } }],
    }),
    apply: k => {
      kidPick('kidCrush', k);
      if (k === 'note') { if (chance(0.4)) { shape({ r: 0.1, e: 0.1 }); eff({ h: 1 }); return '对方回了一张纸条，只有三个字：「我也是。」你把它夹在了日记本里。'; } shape({ r: 0.1, n: 0.08 }); eff({ h: -2 }); return '纸条被传到了一半，落在了班主任手里。'; }
      if (k === 'secret') { shape({ e: -0.04, r: -0.05 }); return '你什么都没说。毕业那天，你看着那个人的背影，想了很久。'; }
      if (chance(0.5)) { shape({ n: 0.1, e: -0.05 }); eff({ h: -2 }); return '第二天，全班都知道了。'; }
      shape({ e: 0.1, a: 0.06 }); eff({ so: 1 }); return '最好的朋友帮你保守了秘密，还帮你打听到了对方喜欢什么。';
    },
  },

  zhongkao: {
    build: () => {
      const back = !!S.flags.mig && !S.flags.migBack && chance(0.6);
      // 51 ≈ 参加中考的学生学识中位数（模拟测得）
      const p = clamp(0.68 + (S.st.kn - 51) / 30 + (S.q - 3) * 0.05 + (rural() ? -0.06 : 0.03), 0.08, 0.97);
      const pass = chance(p);
      const body = (back ? `因为户口不在${S.loc.city}，你回到老家${placeName(S.home)}参加中考。` : '') + (pass ? '中考成绩出来了，分数够上普通高中。' : '中考成绩出来了，差了一些，没够上普通高中的分数线。');
      let choices = pass ? [
        { k: 'gao', label: '读普通高中，三年后考大学', sub: '学识↑ 压力↑', w: 9 },
        { k: 'voc', label: '去读职高，早点学门手艺', sub: '三年后就能工作', w: 1, tilt: { c: -0.3 } },
      ] : [
        { k: 'voc', label: '读职高或中专', sub: '学一门技术', w: 6 },
        { k: 'redo', label: '复读一年，再考一次', sub: '学识↑ 幸福↓', w: 2, tilt: { c: 0.5 } },
        // 不满 16 岁不能招用（《劳动法》第15条）：先在家待着，满 16 岁再出去
        { k: 'work', label: S.age < 16 ? '不读了，在家待到16岁再出去打工' : '不读了，出去打工', sub: S.age < 16 ? '满16岁才能进厂' : '早点赚钱', w: S.q <= 2 ? 2 : 0.5, tilt: { c: -0.3, r: 0.3 } },
      ];
      if (S.flags.zkRedo) choices = choices.filter(c => c.k !== 'redo');
      return { title: '中考', body, fact: '2025年普通高中与中职招生之比约为74:26（教育部；若计入技工学校约为67:33）', choices, ctx: { back } };
    },
    apply: (k, ctx) => {
      if (ctx.back) { S.flags.migBack = 1; moveTo(S.home); }
      S.edu = Math.max(S.edu, 2);
      // 9 月开学（education.ts 的 admit）
      if (k === 'gao') { admit('高中', 3, undefined, [['学校', `${S.loc.city}的一所普通高中`]]); return { t: '考上了普通高中，九月开学。', pic: 'high' }; }
      if (k === 'voc') { admit('职高', 3); return { t: `报了职业高中，学${pick(['数控技术', '汽车维修', '电子商务', '学前教育', '护理', '烹饪', '计算机应用'])}，九月开学。`, pic: 'voc' }; }
      if (k === 'redo') { S.flags.zkRedo = 1; S.school = '初中'; S.schoolEnd = calYear() + 1; eff({ kn: 5, h: -5 }); return '又回到初三的教室，坐在一群比你小一岁的同学中间。'; }
      S.school = null;
      if (S.age < 16) { S.flags.toWork = 1; return '不读了。还不满16岁，工厂不收，先在家帮着干点活，等满了16岁再出去。'; } // 满 16 岁那个月出去（huntMonth）
      hire(chance(0.6) ? 'factory' : 'migrant', migrantCity()); eff({ h: -3 });
      return `收拾行李去了${S.loc.city}，进了一家工厂。你是车间里年纪最小的。`;
    },
  },

  gaokao: {
    build: () => {
      const hp = S.home.p, P = PBY[hp], L = gkLines(hp);
      const rank = gkRank(), score = gkScore(rank, hp);
      const cands = gkCandidates(rank, hp, score);
      const n = Math.round(NATION.gaokao * P.b / BIRTH_TOTAL), pos = Math.max(1, Math.round(n * rank));
      const line = score >= L.special ? '过了特控线' : score >= L.benke ? '过了本科线' : score >= L.zhuanke ? '只过了专科线' : '没过专科线';
      const redoW = score < L.benke ? 1.5 : 0.4;
      const choices: Choice[] = [{ k: "apply", label: '填报志愿', w: score >= L.zhuanke ? 6 : 0.5, off: !cands.length }];
      if (S.school !== '复读') choices.push({ k: 'redo', label: '复读一年', sub: '学识↑ 幸福↓', w: redoW, tilt: { c: 0.5 } });
      choices.push({ k: 'work', label: '不读了，去工作', sub: '早点赚钱', w: score < L.zhuanke ? 3 : 0.5, tilt: { c: -0.3, r: 0.2 } });
      return {
        title: '高考', form: 'zhiyuan',
        body: `你在${P.n}参加高考，考了${score}分（满分${L.total}），全省排名约第${pos.toLocaleString('zh-CN')}名（前${(rank * 100).toFixed(rank < 0.01 ? 2 : 1)}%）。今年${P.n}的特控线${L.special}分、本科线${L.benke}分、专科线${L.zhuanke}分。你${line}。`,
        fact: NATION.gaokaoFact || '2026年全国高考报名人数为1290万（教育部）',
        choices, ctx: { rank, score, cands },
      };
    },
    apply: (k, ctx) => {
      S.edu = Math.max(S.edu, 3);
      if (k === 'redo') { S.school = '复读'; S.schoolEnd = calYear() + 1; eff({ kn: 4, h: -6 }); return '回到高三，又过了一年每天只睡六个小时的日子。'; }
      if (k === 'work') { S.school = null; hireInCity(wpick({ factory: 2, migrant: 2, rider: 1, sales: 1.5, shop: 0.5 })); return `没有再读书，去了${S.loc.city}，做了${JOBS[S.job].n}。`; }
      const sel = k === 'apply' ? gkAutoApps(ctx) : JSON.parse(k.slice(6));
      const apps = sel.apps.map(a => ({ c: ctx.cands[a.i], major: a.major }));
      const r = gkResolve(apps, ctx.score, sel.adjust, S.home.p);
      if (r.ok) return enroll(r.c, r.major, r.adjusted);
      S.flags.slip = { score: ctx.score };
      S.queue.unshift({ at: S.t, type: 'dec', id: 'slip' });
      return { t: r.rejected ? `${r.rejected.name}投了你的档，但想读的专业没录上，你又没有服从调剂，被退档了。` : '所有志愿都没有录取，滑档了。', k: 'bad' };
    },
  },

  slip: {
    build: () => {
      const L = gkLines(S.home.p), sc = (S.flags.slip || {}).score || 0;
      const ch: Choice[] = [{ k: 'redo', label: '复读一年', sub: '明年再考', w: 3, tilt: { c: 0.5 } }];
      if (sc >= L.zhuanke) ch.push({ k: 'zhuan', label: '参加征集志愿，读一所还有空位的高职', sub: '专科', w: 2 });
      ch.push({ k: 'work', label: '不读了，去工作', sub: '', w: 1, tilt: { c: -0.3, r: 0.2 } });
      return { title: '滑档之后', body: '本科批没有被录取。征集志愿里还剩一些学校有空位，也可以复读一年。', choices: ch };
    },
    apply: k => {
      if (k === 'redo') { S.school = '复读'; S.schoolEnd = calYear() + 1; eff({ kn: 4, h: -6 }); return '决定复读。'; }
      if (k === 'work') { S.school = null; hireInCity(wpick({ factory: 2, migrant: 2, sales: 1.5 })); return `去了${S.loc.city}，做了${JOBS[S.job].n}。`; }
      const P = PBY[S.home.p], city = pick(P.cities);
      return enroll({ name: `${city}的一所高职`, city, prov: S.home.p, tier: 'zhuan', attr: '' }, pick(['护理', '电子商务', '会计', '机械工程', '计算机']), false);
    },
  },

  vocgrad: {
    build: () => ({
      title: '职高毕业', body: '三年职高读完了。', fact: '技术工人是中国制造业长期紧缺的岗位',
      choices: [{ k: 'skilled', label: '进厂当技术工人', sub: '收入稳定', w: 2, tilt: { r: -0.2 } }, { k: 'zhuan', label: '考高职，读大专', sub: '再读三年', w: 4, tilt: { c: 0.4 } }, { k: 'city', label: '去大城市打工', sub: '', w: 1.5, tilt: { r: 0.3, e: 0.2 } }],
    }),
    apply: k => {
      S.edu = Math.max(S.edu, 4); S.school = null; addDoc('grad', '中专毕业证书', [['学历', '中专/职高']]);
      if (k === 'skilled') { hireInCity('skilled'); return `在${S.loc.city}的一家工厂当了技术工人。`; }
      if (k === 'zhuan') { const L = cityLoc(S.home.p, PBY[S.home.p].cities[0]); admit('大专', 3, L); return `考上了${L.city}的一所高职，九月开学。`; }
      hire(wpick({ migrant: 2, rider: 1, factory: 2, sales: 1 }), migrantCity()); return `去了${S.loc.city}，做了${JOBS[S.job].n}。`;
    },
  },

  graduate: {
    build: () => {
      const lv = { 大专: 5, 本科: 6, 硕士: 7 }[S.school], top = ['top', '211'].includes(S.flags.tier);
      const ch = [];
      // 深造率：中上游 985 约 53%–75%，211 约 50%–64%，地方本科国内读研约 14%（各校就业质量报告、麦可思）
      if (lv === 6) ch.push({ k: 'kaoyan', label: S.flags.tier === 'top' || S.flags.tier === '211' ? '读研（保研或考研）' : '考研', sub: '再读三年', w: { top: 9, '211': 6, ben1: 3, ben: 2.5 }[S.flags.tier] || 2, tilt: { c: 0.4 } });
      ch.push({ k: 'civil', label: '考公务员或事业编', sub: '稳定，但竞争激烈', w: 2, tilt: { r: -0.3, c: 0.2 } });
      ch.push({ k: 'big', label: '去大城市找工作', sub: '工资高，房租也高', w: top ? 4 : 2, tilt: { r: 0.3, e: 0.2 } });
      const U = S.flags.uni;
      if (U && U.prov !== S.home.p && !BIG[U.city]) ch.push({ k: 'stay', label: `留在${U.city}工作`, sub: '读了几年书，已经熟悉这座城市', w: 2 });
      ch.push({ k: 'home', label: awayFromHome() ? '回家乡找份工作' : '留在家乡找份工作', sub: '离家近，节奏慢', w: 2, tilt: { r: -0.2 } });
      return { title: '毕业去向', body: `${S.school}毕业了。${S.flags.major ? `你学的是${S.flags.major}。` : ''}`, fact: '2026届全国高校毕业生预计为1270万人', choices: ch, ctx: { lv } };
    },
    apply: (k, ctx) => {
      S.edu = Math.max(S.edu, ctx.lv); S.school = null; addDoc('grad', ctx.lv === 7 ? '硕士学位证书' : '毕业证书', [['学校', S.flags.uni ? S.flags.uni.name : ''], ['学历', EDU_LV[ctx.lv]], ['专业', S.flags.major]]);
      const top = ['top', '211'].includes(S.flags.tier);
      if (k === 'kaoyan') {
        // 考研总体录取率约 27%–32%（2024–2025）；名校有推免名额，成功率高得多
        const base = { top: 0.75, '211': 0.6, ben1: 0.38, ben: 0.3, zhuan: 0.15 }[S.flags.tier] || 0.3;
        if (chance(clamp(base + (S.st.kn - 62) / 50, 0.08, 0.92))) { admit('硕士', 3); return { t: base >= 0.6 && chance(0.5) ? '拿到了保研名额，免试读研。' : '考上了研究生。', k: 'good', pic: 'master' }; }
        quitJob(); return { t: '考研差了几分，没上线。先找工作吧。', k: 'bad', f: '2026年考研报名343万人，2025年硕士招生123.7万人' };
      }
      if (k === 'civil') return civilTry();
      // 毕业即失业：16–24 岁（不含在校生）调查失业率 2026 年 8 月为 18.9%
      // 毕业半年后未落实去向：双一流 8.1%、地方本科 14.4%、高职 11.9%（麦可思 2024/2025 届）
      if (chance({ top: 0.08, '211': 0.09, ben1: 0.13, ben: 0.145, zhuan: 0.12 }[S.flags.tier] || 0.14)) { if (k === 'big') { const city = wpick({ 深圳: 3, 上海: 3, 北京: 3, 杭州: 2, 广州: 2, 成都: 1.5 }); moveTo(cityLoc(BIG[city].p, city)); } else if (k === 'home') moveTo(homeCity()); quitJob(); return { t: `投了几十份简历，毕业时还没有找到工作。`, k: 'bad', f: '2024届本科毕业生半年后去向落实率：“双一流”高校91.9%，地方本科85.6%（麦可思）' }; }
      if (k === 'big') { const city = wpick({ 深圳: 3, 上海: 3, 北京: 3, 杭州: 2, 广州: 2, 成都: 1.5 }); moveTo(cityLoc(BIG[city].p, city)); hire(gradJob(true)); return `去了${city}，成了一名${JOBS[S.job].n}。`; }
      if (k === 'stay') { hire(gradJob(false)); return `留在了${S.loc.city}，做了${JOBS[S.job].n}。`; }
      const back = awayFromHome();
      moveTo(homeCity()); hire(gradJob(false)); return `${back ? '回到' : '留在'}${S.loc.city}，做了${JOBS[S.job].n}。`;
    },
  },

  civilretry: {
    build: () => ({ title: '再考一次？', body: `你已经考了${S.flags.civilN || 1}次公务员，这一年都在家里备考。`, choices: [{ k: 'again', label: '再考一年', sub: '全职备考', w: 2, tilt: { r: -0.4, c: 0.3 } }, { k: 'stop', label: '不考了，去找工作', sub: '', w: 3 }] }),
    apply: k => {
      if (k === 'again') { S.flags.civilN = (S.flags.civilN || 1) + 1; return civilTry(); }
      S.flags.civilRetry = 0; hireInCity(gradJob(S.loc.kind === 'big')); return `放下了考公的书，做了${JOBS[S.job].n}。`;
    },
  },

  seek: {
    build: () => S.job !== 'seeking' || S.flags.disabled ? null : ({
      title: '还没有工作', body: `你现在没有工作。${cashLeft()}。`,
      // 人就在老家的，「回老家」换成在当地托亲戚朋友打听
      choices: [{ k: 'gig', label: '先送外卖或跑网约车', sub: '马上有收入', w: 0.7, tilt: { r: 0.5 } }, { k: 'any', label: '降低要求，找份普通工作', sub: '', w: 3.5 }, { k: 'home', label: awayFromHome() ? '回老家' : '托亲戚朋友打听', sub: '', w: 1, tilt: { r: -0.4 } }],
    }),
    // 送外卖、跑网约车马上能上岗，回家种地也是；其余要找一阵子（HUNT），找到以前仍是待业、没有工资，到时候由 huntMonth 上岗
    apply: k => {
      if (k === 'gig') return gig();
      const lj = S.flags.lastJob;
      if (k === 'any') {
        const same = lj && !['boss', 'shop', 'farmer'].includes(lj) && chance(0.6);
        S.flags.hunt = { at: nowM() + ri(...HUNT.any), job: same ? lj : S.edu >= 5 ? wpick({ clerk: 3, sales: 2 }) : wpick({ factory: 2, sales: 1, migrant: 1, shop: 0.5 }), same: same ? 1 : 0 };
        return null;
      }
      const away = awayFromHome();
      moveTo(S.home);
      const job = S.home.kind === 'rural' ? (chance(0.5) ? 'farmer' : 'shop') : wpick({ clerk: 1, sales: 1, shop: 1 });
      if (job === 'farmer') { hire(job); return away ? `回到了${placeName()}，帮家里种地。` : '先在家帮着种地。'; }
      S.flags.hunt = { at: nowM() + ri(...HUNT.home), job, home: 1 };
      return away ? `回到了${placeName()}，托亲戚朋友打听工作。` : '托亲戚朋友打听工作。';
    },
  },

  bigcity: {
    build: () => {
      if (!isWorking() || S.loc.kind === 'big') return null;
      const ok = bigCities(); if (!ok.length) return null;
      const city = wpick(ok.map(c => [c, BIGCITY_W[c]]));
      const r = BIG[city].inc / placeInc();
      return {
        title: '去大城市闯一闯？', body: `老同学在${city}，说那边机会多。${city}的收入水平大约是你这里的${r.toFixed(1)}倍，房租也贵得多。`,
        choices: [{ k: 'go', label: `去${city}`, sub: '收入↑ 房租↑ 离家更远', w: 2, tilt: { r: 0.4, e: 0.2 } }, { k: 'stay', label: '留在这里', sub: '', w: 3 }], ctx: { city },
      };
    },
    apply: (k, ctx) => {
      if (k === 'stay') return null;
      const keep = ['clerk', 'tech', 'engineer', 'sales', 'rider', 'driver', 'nurse'].includes(S.job) ? S.job : wpick({ rider: 1, factory: 2, migrant: 1.5, clerk: S.edu >= 5 ? 3 : 0.5, sales: 1.5 });
      hire(keep, cityLoc(BIG[ctx.city].p, ctx.city)); eff({ so: -3 });
      return `拖着行李箱到了${ctx.city}，做了${JOBS[S.job].n}。`;
    },
  },

  crisis: {
    build: () => {
      if (!(JOBS[S.job] && JOBS[S.job].priv)) return null;
      const ch: Choice[] = [{ k: 'same', label: '找类似的工作，接受降薪', sub: '', w: 3, tilt: { c: 0.3 } }, { k: 'gig', label: '先去送外卖或开网约车', sub: '', w: 1.5, tilt: { r: 0.3 } }, { k: 'boss', label: '拿补偿金自己创业', sub: '风险很大', w: 1, tilt: { r: 0.8 } }];
      if (awayFromHome()) ch.push({ k: 'home', label: '回老家', sub: '', w: 1, tilt: { r: -0.4 } }); // 人就在老家的没有这一项
      const why = [loanBal() ? `房贷还欠${wan(loanBal())}` : '', kidsAlive().some(k => k.age < 18) ? '孩子还在上学' : ''].filter(x => x).join('，');
      return {
        title: '35岁', body: `公司“降本增效”，你所在的部门被裁撤了。你${S.age}岁了${why ? '，' + why : ''}。`,
        fact: '不少企业招聘时会写明“35岁以下”，这被称为“35岁门槛”；国考的年龄上限已在2025年度放宽到38岁',
        choices: ch,
      };
    },
    apply: k => {
      const comp = severance(); // 部门被裁撤：N+1 经济补偿
      eff({ h: -6, money: comp });
      logLater(`公司按工龄给了${wan(comp)}的经济补偿。`);
      if (k === 'same') { if (chance(0.55)) { hire(S.job); raise(0.8); return '投了上百份简历，几个月后找到了一份类似的工作，工资降了两成。'; } quitJob(); return { t: '投了上百份简历，大多数没有回音。', k: 'bad' }; }
      if (k === 'gig') return gig();
      if (k === 'boss') { eff({ money: -placeInc() * 1.5 }); hire(wpick({ boss: 1, shop: 2 })); return `拿出积蓄开了一家${pick(['奶茶店', '小饭馆', '便利店', '培训工作室', '网店'])}。`; }
      hire(wpick({ clerk: 2, sales: 1, shop: 1 }), homeCity()); const pw = parentsWord();
      return `回到了${S.loc.city}，做了${JOBS[S.job].n}。工资少了一大截，${pw ? `但离${pw}近了` : '但回到了熟悉的地方'}。`;
    },
  },

  jobhop: {
    build: () => {
      if (!isWorking() || SELF_EMP.has(S.job)) return null;
      const w = S.wageK, x = raise(RAISE.hop); S.wageK = w; // 先算一下能涨多少（不消耗随机数），选了跳槽时 apply 里照样再涨一次
      const more = x >= 1.1 ? '一成多' : x >= 1.06 ? '一成左右' : '一点';
      return {
        title: '跳槽？', body: `另一家公司来挖你，工资高${more}，但听说更忙。`,
        choices: [{ k: 'hop', label: '跳槽', sub: '收入↑ 健康↓', w: 2, tilt: { r: 0.3 } }, { k: 'stay', label: '留在原来的地方', sub: '', w: 3, tilt: { a: 0.2 } }, { k: 'boss', label: '干脆辞职自己干', sub: '风险很大', w: 0.4, tilt: { r: 0.5 } }],
        ctx: { more },
      };
    },
    apply: (k, c) => {
      if (k === 'stay') return null;
      // 涨工资统一走 raise（career.ts）：涨得多的人越往上越难涨，实际涨幅可能不到 RAISE.hop
      if (k === 'hop') { const w = S.wageK; hire(S.job); S.wageK = w; raise(RAISE.hop); eff({ hl: -2 }); return `跳槽到了新公司，工资涨了${c.more}。`; }
      eff({ money: -placeInc() * 1.2 }); hire(wpick({ boss: 1, shop: 1.5 })); return '辞了职，和朋友合伙做起了生意。';
    },
  },

  // 认识了一个人：要不要在一起
  romance: {
    build: () => {
      const p = S.cand; if (!p || S.fam.married || S.fam.dating) { S.cand = null; return null; }
      const P = mutualP(p), blind = p.how === 'blind';
      const feel = p.fit >= 0.7 ? '聊得很投缘' : p.fit >= 0.5 ? '感觉还可以' : '好像不太聊得来';
      const body = blind ? `家里亲戚介绍了${p.name}。见了一面，${feel}。` : `在${MEET_HOW[p.how]}认识了${p.name}，${feel}。`;
      return {
        title: blind ? '相亲' : '心动', body, card: partnerRows(p),
        fact: '对方愿不愿意，看你们合不合得来，也看你的人际、工作和房子。',
        choices: [
          { k: 'go', label: blind ? '继续接触' : '主动追求', sub: `对方也有意的可能：${P >= 0.65 ? '比较大' : P >= 0.4 ? '一半一半' : '不太大'}`, w: 0.6 + p.fit * 2, tilt: blind ? { e: 0.3 } : { e: 0.5, r: 0.3 } },
          { k: 'pass', label: blind ? '觉得不合适' : '只做朋友', sub: '', w: 0.7, tilt: { n: 0.3 } },
        ], ctx: {},
      };
    },
    apply: k => {
      const p = S.cand; S.cand = null;
      if (k === 'pass') return null;
      if (!chance(mutualP(p))) { eff({ h: -3 }); return { t: p.how === 'blind' ? `又见了两次，${p.name}说觉得你们不太合适。` : `你鼓起勇气表白，${p.name}说只想做朋友。`, k: 'bad' }; }
      p.love = clamp(55 + 25 * (p.fit - 0.5) + gauss(0, 8), 20, 90); p.asks = 0;
      S.fam.dating = p; eff({ h: 6 });
      return { t: `你和${p.name}在一起了。`, k: 'good' };
    },
  },

  marry: {
    build: () => {
      // 年初排下以后，可能已经分手、换了人：弹出时再查一遍婚龄和在一起的年数
      if (!marryOK()) return null;
      const p = S.fam.dating, yrs = S.age - p.metAt;
      const amt = brideAmt(S.home.p);
      // 结婚的条件：男方家里出彩礼；不少女方家里希望有婚房（估计）
      // 同一个对象只定一次（被拒以后不会突然不要了）
      if (p.wh == null) p.wh = S.sex === 'M' && chance(S.loc.kind === 'rural' ? 0.4 : 0.6) ? 1 : 0;
      const wantHouse = !!p.wh && !S.house;
      const push = p.asks >= 2 ? `${p.name}已经问过你好几次什么时候结婚。` : '';
      const again = wantHouse && p.wh === 2 ? `上次求婚，${p.name}的爸妈说没有房子不能结婚。` : '';
      const body = `你和${p.name}在一起${yrs}年了，感情${loveWord(p.love)}。${push}${again}` + (S.sex === 'M' ? (amt >= 1000 ? `对方家里提出彩礼${wan(amt)}${wantHouse ? '，还希望你们有一套自己的房子' : ''}。` : wantHouse ? '对方家里不要彩礼，只希望你们有一套自己的房子。' : '对方家里不要彩礼。') : amt >= 1000 ? `男方家里说可以给${wan(amt)}彩礼。` : '男方家里没提彩礼的事。');
      // 想不想结婚：二十出头多半觉得还早，年纪越大越想定下来（READY_K 为校准系数）
      const ready = READY0 + Math.max(0, S.age - (S.sex === 'F' ? 24 : 26) - mShift()) * READY_K + Math.max(0, S.age - 30) * 0.5; // 三十岁以后家里催得更紧
      return {
        title: '结婚', body, card: partnerRows(p, { love: true }), fact: '2025年全国结婚登记676.5万对；2020年人口普查的平均初婚年龄：男29.38岁、女27.95岁',
        choices: [
          { k: 'yes', label: S.sex === 'M' ? '求婚' : '答应结婚', sub: wantHouse ? '没有房子，对方家里可能不同意' : '办酒席、领证', w: ready * clamp(p.love / 60, 0.3, 1.6) * (wantHouse ? 0.6 : 1), tilt: { c: 0.3 } },
          { k: 'wait', label: '再处处看', sub: p.asks >= 2 ? '对方可能不想再等了' : '', w: 2, tilt: { n: 0.5, r: -0.2 } },
          { k: 'no', label: '分手', sub: '', w: p.love < 45 ? 1.5 : 0.3, tilt: { a: -0.4 } },
        ], ctx: { amt, wantHouse },
      };
    },
    apply: (k, ctx) => {
      const p = S.fam.dating;
      if (k === 'wait') {
        p.asks = (p.asks || 0) + 1;
        if (p.asks >= 3 && S.age >= 27 && chance(0.4)) { S.fam.dating = null; eff({ h: -7 }); return { t: `${p.name}说不想再等了。你们分手了。`, k: 'bad' }; }
        return null;
      }
      if (k === 'no') { S.fam.dating = null; eff({ h: -5 }); return `你和${p.name}分手了。`; }
      // 女方家里要婚房、你还没有：一部分人家坚持先买房（估计约一半），婚事搁下，买房的抉择会提前出现（p.wh = 2）。
      // 被拒也算对方问过一次（asks）。坚持过一次的人家，第二次求婚时还是没房：要么松口（不再要婚房，当场答应），要么分手。
      // 松口的可能看感情：感情一般（50）的约一半，很好（75）的约八成，冷淡（35）的约三成（估计）
      let pre = '';
      if (ctx.wantHouse && !S.house && (p.wh === 2 || chance(HOUSE_FIRST))) {
        p.asks = (p.asks || 0) + 1;
        if (p.wh !== 2) {
          p.love = clamp(p.love - 8, 0, 100); p.wh = 2; eff({ h: -4 });
          return { t: `${p.name}的爸妈说，没有房子不能结婚。婚事先放下了。`, k: 'bad' };
        }
        if (!chance(clamp(0.5 + (p.love - 50) / 85, 0.15, 0.85))) {
          S.fam.dating = null; S.flags.exes = (S.flags.exes || 0) + 1; eff({ h: -8 });
          return { t: `${p.name}的爸妈还是那句话：没有房子，不能结婚。又拖了一阵，你们分手了。`, k: 'bad' };
        }
        p.wh = 0; pre = `${p.name}的爸妈松了口：房子以后再说，先把婚结了。`;
      }
      S.fam.married = true; S.fam.partner = p; p.marriedAt = S.age; S.fam.dating = null; p.city = S.loc.city;
      if (p.jk) p.inc = partnerInc(p);
      addDoc('marry', '结婚证', [['持证人', S.name], ['配偶', p.name], ['配偶学历', EDU_LV[p.edu]], ['配偶职业', ptJobName(p)], ['登记日期', `${calYear()}年`]]);
      // 彩礼和兄弟姐妹结婚时一样（kin.ts 的 sibWed）：娶亲的，父母在世就由家里出，不够的父母去借；父母都不在了才自己出。
      // 出嫁的，彩礼一半做陪嫁带走（进你的存款），另一半留在娘家；父母都不在了，整笔做陪嫁。酒席的钱自己出。
      // 原来男方一律自己出：48% 的男主角婚后欠着钱，其中不少父母存款超过 10 万
      const amt = ctx.amt, par = S.fam.mom.alive || S.fam.dad.alive, pw = parentsWord() || '家里';
      let bride = '';
      if (S.sex === 'M') {
        if (par) { const b = famPayBride(amt); bride = `${pw}出了${wan(amt)}彩礼${b > 1e3 ? `，其中${wan(b)}是借的` : ''}。`; }
        else { eff({ money: -amt }); bride = `彩礼${wan(amt)}是你自己出的。`; }
      } else if (par) { eff({ money: amt * 0.5 }); S.famMoney += amt * 0.5; bride = `男方给了${wan(amt)}彩礼，一半做了你的陪嫁，另一半留在了娘家。`; }
      else { eff({ money: amt }); bride = `男方给了${wan(amt)}彩礼，都做了你的陪嫁。`; }
      eff({ money: -placeInc() * 0.1, h: 8, so: 6 });
      return { t: `${pre}你和${p.name}结婚了。${bride}酒席摆了${ri(10, 40)}桌。`, k: 'good' };
    },
  },

  baby: {
    build: () => {
      if (!S.fam.married || !S.fam.partner || !S.fam.partner.alive) return null;
      const n = kidsAlive().length, p = S.fam.partner;
      return {
        title: n ? '再要一个孩子？' : '要孩子吗？',
        body: n ? `你们已经有${n}个孩子了。` : `结婚${S.age - p.marriedAt}年了。${S.fam.mom.alive ? '家里老人一直在催。' : ''}`,
        fact: '2025年全国出生人口为792万，比2024年少了162万',
        choices: [{ k: 'yes', label: n ? '再要一个' : '要孩子', sub: '幸福↑ 开销↑', w: n ? 1.2 : 4 }, { k: 'no', label: '暂时不要', sub: '', w: 2 }],
      };
    },
    apply: k => {
      if (k === 'no') return null;
      // 怀孕约十个月后出生（family.ts 的 conceive）；出生时的幸福、人际和开销在出生那个月记，这里不再加
      return conceive();
    },
  },

  house: {
    build: () => {
      if (S.house || !isWorking()) return null;
      const price = Math.round(placeHp() * 90 / 1e4) * 1e4;
      const bad = S.flags.badCredit != null && S.age - S.flags.badCredit < 5;
      const plans = loanPlans(price, S.loc);
      // 自动抉择时：月供占收入越高，越不愿意买
      const stretch = p => clamp(2.2 - p.pay / Math.max(1, hhIncome()) * 5, 0.05, 1.5);
      const ch: Choice[] = plans.map(p => ({ k: 'buy:' + p.kind, label: `在${S.loc.city}买 · ${p.label}`, sub: bad ? '征信有不良记录，银行不放贷' : planSub(p), off: bad || p.off, w: (p.kind === 'com' ? 2 : 3) * stretch(p) }));
      ch.push({ k: 'rent', label: '继续租房', sub: S.hpf ? '公积金可以提取一部分付房租' : '', w: 2 });
      let home = null;
      if (awayFromHome() && (S.loc.p !== S.home.p || !['BJ', 'SH', 'TJ'].includes(S.home.p))) {
        const H = hometownHouse();
        const L = ['BJ', 'SH', 'TJ'].includes(S.home.p) ? cityLoc(S.home.p, PBY[S.home.p].cities[0]) : { p: S.home.p, city: H.city, kind: 'city' };
        const bp = bestPlan(loanPlans(H.price, L));
        home = { price: H.price, L, plan: bp };
        ch.push({ k: 'home', label: H.where, off: bad || !bp, sub: bp ? `90平米约${wan(H.price)}，${bp.label}，${planSub(bp)}` : `90平米约${wan(H.price)}，眼下负担不起`, w: H.price < price ? 1 : 0.3 });
      }
      const help = parentsHelp();
      return {
        title: '买房',
        body: `${S.loc.city}一套90平米的房子大约${wan(price)}。${cashLeft('你手上有')}${S.hpf ? `，公积金账户里有${wan(S.hpf)}` : '，没有公积金'}${help >= 1000 ? `，${parentsWord()}说能拿出${wan(help)}` : ''}。`,
        fact: '商贷最低首付15%、最长40年（2026年8月起）；公积金贷款首套利率2.6%，但有最高额度，而且要连续缴存一段时间才能贷',
        choices: ch, ctx: { price, plans, home },
      };
    },
    apply: (k, c) => {
      if (k === 'rent') return null;
      if (k === 'home') { const r = buyHouse(c.home.price, c.home.L, c.home.plan); eff({ h: 2 }); return `在${c.home.L.city}买了一套房（${c.home.plan.label}）。平时空着，过年回去住几天。${r.fromHpf ? `首付用了${wan(r.fromHpf)}公积金。` : ''}`; }
      const plan = c.plans.find(p => 'buy:' + p.kind === k);
      const r = buyHouse(c.price, S.loc, plan); eff({ h: 5 });
      return { t: `在${S.loc.city}买了房，${plan.label}${plan.parts.map(p => `${p.kind === 'hpf' ? '公积金' : '商贷'}${wan(p.bal)}`).join('、')}，${plan.parts[0].years}年还清。${r.fromHpf ? `首付里有${wan(r.fromHpf)}是公积金。` : ''}`, k: 'good' };
    },
  },

  prepay: {
    build: () => {
      const bal = loanBal(); if (!bal) return null;
      // 留出一年半的生活费应急
      const spare = S.money - placeInc() * 1.5, part = Math.min(bal, Math.round(spare / 1e4) * 1e4);
      if (part <= 0) return null;
      // 取整到万以后已经够还清的（原来会出现一个和「一次还清」金额相同的「提前还」，还完写「月供降到了0元」），只留「一次还清」，权重是两项之和
      const ch: Choice[] = [];
      if (spare > bal || part >= bal) ch.push({ k: 'all', label: `一次还清剩下的${wan(bal)}`, sub: '无债一身轻', w: part >= bal ? 4 : 2, tilt: { r: -0.5, c: 0.2 } });
      if (part < bal) ch.push({ k: 'part', label: `提前还${wan(part)}`, sub: '月供变少，利息省一些', w: 2, tilt: { r: -0.3 } });
      ch.push({ k: 'no', label: '不还，钱留在手里', sub: '应急、理财或者给孩子用', w: 2, tilt: { r: 0.3 }, noWhy: true });
      return { title: '提前还房贷？', body: `房贷还剩${wan(bal)}，利率${(S.loans[0].rate * 100).toFixed(2)}%。存款理财的收益越来越低，身边不少人都在提前还贷。`, fact: '2023–2024年出现“提前还贷潮”，全国个人住房贷款余额连续下降', choices: ch, ctx: { part } };
    },
    apply: (k, c) => {
      if (k === 'no') return null;
      if (k === 'all') { changeMoney(-loanBal()); S.loans = []; eff({ h: 4 }); return { t: '把房贷一次还清了。', k: 'good' }; }
      let left = c.part; changeMoney(-c.part);
      for (const l of S.loans.sort((a, b) => b.rate - a.rate)) { const x = Math.min(l.bal, left); l.bal -= x; left -= x; l.pay = annualPay(l.bal, l.rate, l.mo != null ? l.mo / 12 : l.years); }
      S.loans = S.loans.filter(l => l.bal > 1); eff({ h: 2 });
      return S.loans.length ? `提前还了${wan(c.part)}，月供降到了${wan(loanPayY() / 12)}。` : { t: `提前还了${wan(c.part)}，房贷还清了。`, k: 'good' };
    },
  },

  arrears: {
    build: () => {
      if (!S.house || !loanBal()) return null;
      return {
        title: '房贷还不上了', body: `手上现金${wan(S.money)}，房贷已逾期${wan(loanArrears())}，另外还有欠款${wan(S.debt || 0)}。房贷每月${wan(loanPayY() / 12)}，还剩${wan(loanBal())}没还。房子现在大约值${wan(S.house.v)}。`,
        fact: '2025年全国约11.3万套住宅法拍成交，成交价约为评估价的74%',
        choices: [{ k: 'sell', label: '把房子卖了', sub: '按市价打折卖，先还清贷款', w: S.flags.heldOn ? 3 : 1.5, tilt: { r: -0.4 } }, { k: 'hold', label: '找亲戚借钱周转', sub: (S.flags.heldOn || 0) >= 2 ? '已经借过两次，亲戚那边也借不动了' : '幸福↓', off: (S.flags.heldOn || 0) >= 2 || (S.debt || 0) >= placeInc() * 0.5, w: S.flags.heldOn ? 1 : 3, tilt: { e: 0.3 } }, { k: 'stop', label: '断供', sub: '房子被法拍，征信留下污点', w: 0.5, tilt: { r: 0.6, c: -0.3 } }],
      };
    },
    apply: k => {
      if (k === 'hold') { const borrowed = borrowMoney(loanArrears() + loanPayY() / 4, placeInc() * 0.5); eff({ h: -6, so: -3 }); S.flags.heldOn = (S.flags.heldOn || 0) + 1; return { t: `找亲戚借到了${wan(borrowed)}，先周转眼前的月供。这笔钱还要还。`, k: 'bad' }; }
      if (k === 'sell') { const got = sellHouse(0.92); eff({ h: -8 }); return { t: `急着出手，房子卖了${wan(got)}，还完贷款${liquidBalance() >= 0 ? '还剩一点' : '还欠着一些'}。`, k: 'bad' }; }
      const got = foreclose(); eff({ h: -15, so: -5 }); return { t: `停止还贷。几个月后房子被法院拍卖，只卖了${wan(got)}。`, k: 'bad' };
    },
  },

  // 手头紧了：选项按处境出现，每一项都有代价。规则和后续在 tight.ts。
  // 自动抉择的权重（估计）：卖房是最后一招，欠得越多（相对一年的收入）越可能卖；约 41% 的老人和成年子女同住（CHARLS），
  // 所以有成年子女的老人搬去同住、向子女开口都常见；在别处有自己房子的，搬回去住最省钱；符合低保条件的多会去申请；
// 年轻人（没找到工作、刚工作、销售行情差的年份）最常见的是找父母要钱，30 岁以后少一些
  tight: {
    build: () => {
      const st = S.statement, incM = st ? st.income - (st.incomeDetails?.aid || 0) : 0, size = S.fam.married && S.fam.partner?.alive ? 2 : 1;
      const sev = clamp((S.debt || 0) / Math.max(placeInc() * 0.3, incM * 12), 0.3, 3); // 欠款相对一年收入有多重
      const H = S.house, here = !!H && H.city === S.loc.city, elsewhere = !!H && !here;
      const retired = S.job === 'retired', idle = !isWorking(), kids = grownKids(), lj = lastJob(), work = rehireText();
      const ch: Choice[] = [];
      if (H) ch.push({ k: 'sell', label: here ? '把房子卖了还债' : `把${H.city}的房子卖了`, sub: `房子大约值${wan(H.v)}，卖掉按九五折到手${loanBal() ? '，先还清房贷' : ''}${here ? '，以后租房住' : ''}`, w: 0.5 * sev, tilt: { r: 0.2 } });
      if (here && !loanBal()) ch.push({ k: 'downsize', label: '换一套小点的房子', sub: `卖了换套便宜些的，差价约${wan(H.v * (SELL_K - DOWNSIZE_K))}拿来还债、过日子`, w: 1 * sev, tilt: { c: 0.2 } });
      if (parentsCan()) ch.push({ k: 'parents', label: `找${parentsWord() || '爸妈'}要钱`, sub: `${parentsWord() || '爸妈'}最多能拿出约${wan(Math.min((S.debt || 0) + placeCons() / 4, S.famMoney * PAR_SHARE))}`, w: S.age < 30 ? 3 : 1.5, tilt: { a: 0.2, r: -0.2 } });
      if (S.age >= 60 && kids && !S.flags.oldLive && !S.flags.grandHelp) ch.push({ k: 'kids', label: '搬去和子女一起住', sub: '不用再付房租，吃住在一起', w: 2.5, tilt: { a: 0.3 } });
      if (retired && kids && !(S.kidAdv > 0) && S.debt > 0) ch.push({ k: 'ask', label: '跟子女开口', sub: `子女先拿出约${wan(Math.min(S.debt, kidSupportY(placeCons()) * KID_ADV_Y))}帮你还债，以后每月给你的钱先扣回这笔`, w: 2, tilt: { a: 0.2, n: -0.2 } });
      if (idle && !S.flags.oldLive && !S.flags.grandHelp && (elsewhere || awayFromHome())) ch.push({ k: 'move', label: elsewhere ? `搬回${H.city}自己的房子住` : `回老家${S.home.city}`, sub: elsewhere ? '不用再付这边的房租' : S.home.kind === 'rural' ? '老家不用租房，开销也小' : '那边房租、开销都便宜些', w: elsewhere ? 2.5 : 1.2, tilt: { r: -0.2 } });
      if (retired && !S.flags.rehire && S.age < 70 && S.st.hl > 40 && !S.flags.disabled && lj !== 'farmer') ch.push({ k: 'work', label: '再出去找点活干', sub: work, w: 1.5, tilt: { c: 0.3 } });
      if (!S.flags.frugal) ch.push({ k: 'frugal', label: '节衣缩食', sub: '吃穿都省着，还清以前基本生活少花两成', w: 2.5, tilt: { c: 0.3 } });
      if (!S.flags.dibao && dibaoOK(incM, size)) ch.push({ k: 'dibao', label: '去社区申请低保', sub: `按家里人均收入补到每人每月${S.loc.kind === 'rural' ? DIBAO_M.rural : DIBAO_M.city}元`, w: 3 });
      ch.push({ k: 'hold', label: '先扛着', sub: '欠的钱照样计息', w: 2, tilt: { r: 0.2 } });
      const why = st && st.shortfall > 0 ? '这几个月连基本开销都付不起' : '这几个月欠的钱一直在涨，还不上';
      return {
        title: '手头紧了', body: `${tightText()}。${why}，每月到手约${wan(incM)}。`,
        fact: `2025年5月底，全国城乡低保平均标准分别为每人每月${DIBAO_M.city}元、${DIBAO_M.rural}元（民政部）`,
        choices: ch, ctx: { work },
      };
    },
    apply: (k, c) => {
      if (k === 'sell') { const city = S.house.city, lb = loanBal(), got = sellHouse(SELL_K); eff({ h: -6 }); return { t: `把${city}的房子卖了，到手${wan(got)}，${lb ? '先还清了房贷，' : ''}剩下的拿来还债。`, k: 'bad' }; }
      if (k === 'parents') { const pw = parentsWord() || '爸妈', x = askParents(placeCons()); eff({ h: -2 }); return `硬着头皮给${pw}打了电话。${pw}没多问，转过来${wan(x)}，只说“别饿着自己”。`; }
      if (k === 'downsize') { const x = downsize(); eff({ h: -3 }); return `卖掉老房子，在附近换了一套小一点的。差价${wan(x)}，先把欠的钱还上了。`; }
      if (k === 'kids') { S.flags.oldLive = 'kid'; eff({ so: 3, h: -1 }); return '搬去和子女一起住。房租省下了，就是凡事要看人脸色，说话也得掂量着。'; }
      if (k === 'ask') { const x = askKids(placeCons()); eff({ h: -3 }); return `跟子女开了口。他们凑了${wan(x)}帮你把账还了，嘴上没说什么。`; }
      if (k === 'move') {
        const H = S.house, elsewhere = !!H && H.city !== S.loc.city;
        moveTo(elsewhere ? cityLoc(H.p, H.city) : S.home); eff({ so: -2 });
        return elsewhere ? `搬回了${S.loc.city}自己的房子，不用再付房租了。` : `回到了老家${S.loc.city}，开销小了不少。`;
      }
      if (k === 'work') { startRehire(); eff({ hl: -1 }); return `又出去干活了：${c.work}。每年能挣${wan(S.flags.rehire.inc)}。`; }
      if (k === 'frugal') { S.flags.frugal = 1; eff({ h: -2 }); return '开始节衣缩食：菜挑便宜的买，衣服缝缝补补，能不出门就不出门。'; }
      if (k === 'dibao') { S.flags.dibao = 1; eff({ h: -2 }); return { t: '去社区申请了低保。填了好几张表，入户核查过了，名字在小区门口公示了一个星期。', f: '低保按家庭人均收入低于当地标准的差额发放，审批要入户调查、公示' }; }
      eff({ h: -1 }); return '咬着牙先扛着，想着过一阵就好了。';
    },
  },

  parentcare: {
    build: () => {
      if (!(S.fam.mom.alive && S.fam.mom.ill === 1) && !(S.fam.dad.alive && S.fam.dad.ill === 1)) return null;
      const who = S.fam.mom.alive && S.fam.mom.ill === 1 ? 'mom' : 'dad', p = S.fam[who], wn = who === 'mom' ? '妈妈' : '爸爸';
      // 不在老家、也没和父母住在一起的，才有「回老家照顾」和「接到身边」；中风致残的自己干不了活，没有「回老家找份工作」
      const away = farFromParents(), work = isWorking();
      const ch = away
        ? [...(S.flags.disabled ? [] : [{ k: 'back', label: work ? '辞职回老家照顾' : '回老家照顾', sub: work ? '收入↓ 陪伴↑' : '陪伴↑', w: 1.5, tilt: { a: 0.5 } }]), { k: 'care', label: '花钱请护工', sub: '开销↑', w: 2, noWhy: true }, { k: 'take', label: `把${wn}接到身边`, sub: '', w: 1.5, tilt: { a: 0.4 } }]
        : [{ k: 'self', label: '自己照顾', sub: '健康↓ 陪伴↑', w: 2, tilt: { a: 0.5, c: 0.2 } }, { k: 'care', label: '花钱请护工', sub: '开销↑', w: 2, noWhy: true }];
      return { title: `${wn}病了`, body: `${wn}${p.age}岁了，${pick(['中风后行动不便', '查出了阿尔茨海默病，开始认不出人', '摔了一跤，髋骨骨折，卧床了'])}，需要人照顾。`, choices: ch, ctx: { who } };
    },
    apply: (k, c) => {
      S.fam[c.who].ill = 2;
      const wn = c.who === 'mom' ? '妈妈' : '爸爸';
      if (k === 'back' || k === 'take') S.flags.parWithMe = 1;
      if (k === 'back') {
        // 在职、待业的回去找份工作；已经退休的只是搬回去
        const was = S.loc.city, work = isWorking();
        if (S.job === 'retired') moveTo(S.home);
        else hire(S.home.kind === 'rural' ? (chance(0.5) ? 'farmer' : 'shop') : wpick({ clerk: 1, sales: 1, shop: 1 }), S.home);
        eff({ so: 4, h: -3 });
        return `${work ? `辞了在${was}的工作，` : `离开${was}，`}回到${placeName()}照顾${wn}。`;
      }
      if (k === 'care') { eff({ money: -placeInc() * 0.8, h: -2 }); return '请了护工，每个月的开销多了一大块。'; }
      if (k === 'take') { eff({ h: -3, so: 3, money: -placeInc() * 0.3 }); return '把老人接来同住。房子小了，日子挤了，但心里踏实些。'; }
      eff({ hl: -3, h: -3, so: 3 });
      if (S.flags.parWithMe) return `${isWorking() ? '每天下班回到家' : '每天在家'}，给${wn}喂饭、擦身、陪着说话。`;
      return `${isWorking() ? '每天下班先去' : '每天一早就去'}${bothParents() ? '爸妈' : wn}家，喂饭、擦身、陪着说话。`;
    },
  },

  illness: {
    build: () => {
      const k = S.flags.ill.k, I = ILL[k] || ILL.cancer, ins = reimburse('local').emp ? '职工医保' : '城乡居民医保';
      const sub = w => `总费用约${wan(I.cost[w])}，${ins}报销后自付约${wan(oop(k, w))}`;
      const facts = {
        cancer: '中国癌症5年生存率为43.7%（2019–2021，国家癌症中心），城市高于农村；肺癌约29%、肝癌约14%、乳腺癌约81%',
        heart: '急性心梗住院期间死亡率约4%，出院后一年内约2.8%',
        stroke: '缺血性脑卒中一年内死亡率约3%–13%，约13%–33%的人留下较重残疾',
        liver: '肝硬化和肝癌在中国常与乙肝相关',
        resp: '中国40岁以上人群慢阻肺患病率约13.7%，大多数人从没做过肺功能检查',
      };
      return {
        title: '治疗', body: `${CAUSE[k]}。医生说要尽快决定治疗方案。你参加的是${ins}。`, fact: facts[k],
        choices: [
          { k: 'big', label: S.loc.kind === 'big' ? '去最好的三甲医院' : '去大城市的三甲医院', sub: sub('big') + (S.loc.kind === 'big' || S.loc.kind === 'capital' ? '' : '（异地就医，报销少一些）'), w: S.money > oop(k, 'big') ? 3 : 1 },
          { k: 'local', label: '在本地医院治', sub: sub('local'), w: 3 },
          { k: 'none', label: '保守治疗，不折腾了', sub: `自付约${wan(oop(k, 'none'))}`, w: S.age > 75 ? 2 : 0.4 },
        ],
      };
    },
    apply: k => {
      const il = S.flags.ill; il.treat = k;
      eff({ money: -oop(il.k, k), h: k === 'none' ? -2 : -4 });
      if (il.k === 'stroke' && chance(ILL.stroke.disable * (k === 'big' ? 0.7 : 1))) {
        S.flags.disabled = 1; eff({ hl: -15, h: -6 }); log('命保住了，但半边身子不太灵活，生活需要人照顾。', 'bad');
        // 干不了活了：到了能退休的年纪就退（见 sickRetireAge），否则辞职在家养病，到了那个年纪再退（huntMonth）。之后不再找工作（见 monthDecisions）
        if (isWorking()) {
          if (S.age >= sickRetireAge(S.job)) { log(RESID_PENSION_JOBS.has(S.job) ? '原来的活干不了了，不再干了。' : '干不了原来的工作了，单位给办了病退。', 'ev'); retire(); }
          else { quitJob(); log('原来的活干不了了，辞了工作，在家养病。', 'ev'); }
        }
        S.flags.hunt = null;
      }
      if (S.debt > 0 && !S.flags.illDebt) { S.flags.illDebt = 1; log('为了治病，家里欠下了一笔债。', 'bad', '大病医疗费用曾是农村家庭致贫的主要原因：2016年建档立卡贫困户中约42%因病致贫'); }
      if (k === 'big') return '在大医院排了一个月队，住进了病房。家里人轮流请假来陪床。';
      if (k === 'local') return '在本地医院开始治疗。';
      return '决定不做大的治疗，回家好好过剩下的日子。';
    },
  },

  oldcare: {
    build: () => {
      const has = kidsAlive().length > 0;
      // 付不付得起：养老院的费用减去养老金、子女给的、老伴的收入，差的部分要靠积蓄撑。撑不到两年的不能选；
      // 撑得越久越愿意去，撑满 CARE_YEARS 年（80 岁左右的余寿，估计）和收入够付的一样。原来不看钱，权重固定，付不起的也住进去，欠款一直累积到去世
      const fee = careFeeY(), short = Math.max(0, fee - oldIncomeY()), years = short ? Math.max(0, liquidBalance()) / short : Infinity;
      const careSub = `每年约${wan(fee)}${short ? `，养老金和子女给的钱每年差${wan(short)}${years < 2 ? '，积蓄撑不了两年' : ''}` : '，养老金够付'}`;
      const ch: Choice[] = [{ k: 'home', label: '去养老院', sub: careSub, off: years < 2, w: 1.5 * clamp(years / CARE_YEARS, 0.1, 1) }, { k: 'self', label: '还是自己住', sub: '', w: 2, tilt: { a: -0.4 } }];
      if (has) ch.unshift({ k: 'kid', label: '搬去和子女一起住', sub: '', w: 3, tilt: { a: 0.3 } });
      const pt = S.fam.married && S.fam.partner && S.fam.partner.alive;
      return { title: '晚年', body: pt ? '年纪大了，老两口互相照应，也越来越吃力。' : '年纪大了，一个人生活越来越吃力。', choices: ch };
    },
    apply: k => {
      if (k === 'kid') { S.flags.oldLive = 'kid'; eff({ so: 5, h: 2 }); return (S.flags.grandkids || 0) > 0 ? '搬去和子女同住，每天看着孙辈进进出出。' : '搬去和子女同住，每天等着他们下班回来一起吃饭。'; }
      if (k === 'home') { S.flags.oldLive = 'home'; eff({ so: 2, h: -2 }); return '住进了养老院，和几个老人一间屋。每年的费用从养老金和积蓄里出。'; }
      eff({ so: -3 }); return '还是住在自己家，邻居偶尔过来看看。';
    },
  },

  // ---------- 家里的大事（规则在 kin.ts） ----------
  demolish: {
    build: () => {
      if (!parentsWord()) return null; // 年初排下以后父母都走了：拆迁由继承的人处理（kin.ts）
      const H = S.famHouse, rural = S.home.kind === 'rural', u = rural ? 'rural' : 'urban';
      const cash = Math.round(H.v * DEMOL_K.cash[u] / 1e3) * 1e3, swap = Math.round(H.v * DEMOL_K.swap[u] / 1e3) * 1e3;
      return {
        title: '拆迁',
        body: `${H.where}${rural ? '老家的宅子' : '家里的老房子'}划进了征收范围，墙上画了一个红圈，里面写着“拆”。${parentsWord()}打电话来，问你的意思。房子估价约${wan(H.v)}。`,
        card: [['货币补偿', `约${wan(cash)}，含搬迁费和奖励`], ['产权调换', `等${DEMOL_K.swapWait}年，换一套约值${wan(swap)}的安置房`]],
        fact: '《国有土地上房屋征收与补偿条例》：货币补偿不得低于类似房地产的市场价格；被征收人可以选择货币补偿，也可以选择房屋产权调换。2013–2022 年全国棚户区改造累计开工 4300 多万套（住建部）',
        choices: [
          { k: 'cash', label: '拿钱', sub: `一次拿到补偿款，${parentsWord()}另买房子`, w: 3, tilt: { r: -0.2 } },
          { k: 'swap', label: '换安置房', sub: `新房更值钱，但要租房等${DEMOL_K.swapWait}年`, w: 2 },
          { k: 'hold', label: '先不签，等更好的条件', sub: '可能多拿，也可能闹僵', w: 0.6, tilt: { r: 0.5, a: -0.4 } },
        ],
      };
    },
    apply: k => demolish(k),
  },

  kidhome: {
    build: () => {
      const kd = weddingKid(); if (!kd) return null;
      const c = kidHomeCost(kd), have = Math.max(0, S.money), son = kd.sex === 'M';
      const lack = (x: number) => have < x ? `，不够的${sibsAlive().length ? '找兄弟姐妹' : '找亲戚'}借` : '';
      // 自动抉择时按「这一项一共要花多少（连酒席）÷ 手上的钱」压低权重：钱够的不压，只够一半的压到四分之一；
      // 存款加一年的收入都不够的，不能选（原来不管存款多少，「首付全包」「一半首付」的权重都很高，会背上几十万到一百多万的债）
      const inc = Math.max(0, hhIncome());
      const fit = (x: number) => { const r = Math.min(1, have / Math.max(1, x + c.feast)); return r * r; };
      const off = (x: number) => have + inc < x + c.feast;
      const cash = cashLeft('你手上有'), br = c.bride >= 1000; // 有的省份彩礼数据是 0（不兴彩礼）
      const body = son
        ? `${kd.name}要结婚了。女方家里${br ? `提出彩礼${wan(c.bride)}，还希望` : '没要彩礼，只希望'}有一套婚房。${S.loc.city}一套90平米的房子约${wan(c.price)}，首付三成要${wan(c.down)}。${cash}。`
        : `${kd.name}要结婚了。男方家里准备买婚房，首付三成要${wan(c.down)}，还差一些。按老规矩，娘家要准备陪嫁。${cash}。`;
      const tooMuch = '存款加上一年的收入也不够';
      return {
        title: son ? '儿子的婚房' : '女儿的陪嫁', body,
        fact: '据贝壳研究院2021年对约40万名90后购房客户的调研，61.1%买房时靠父母出钱（全款或部分资助）',
        choices: son ? [
          { k: 'all', label: br ? '出彩礼，首付也全包了' : '首付全包了', sub: off(c.bride + c.down) ? `一共${wan(c.bride + c.down)}，${tooMuch}` : `一共${wan(c.bride + c.down)}${lack(c.bride + c.down)}`, off: off(c.bride + c.down), w: 3 * fit(c.bride + c.down) },
          { k: 'part', label: br ? '出彩礼和一半首付' : '出一半首付', sub: off(c.bride + c.down / 2) ? `一共${wan(c.bride + c.down / 2)}，${tooMuch}` : `一共${wan(c.bride + c.down / 2)}${lack(c.bride + c.down / 2)}`, off: off(c.bride + c.down / 2), w: 3 * fit(c.bride + c.down / 2) },
          { k: 'none', label: br ? '只出彩礼，房子让他们自己想办法' : '房子让他们自己想办法', sub: br ? wan(c.bride) : '只出酒席钱', w: have < c.bride + c.down / 2 + c.feast ? 3 : 1 },
        ] : [
          { k: 'all', label: '陪嫁一辆车，再帮着出一半首付', sub: off(c.car + c.down / 2) ? `一共${wan(c.car + c.down / 2)}，${tooMuch}` : `一共${wan(c.car + c.down / 2)}${lack(c.car + c.down / 2)}`, off: off(c.car + c.down / 2), w: 2 * fit(c.car + c.down / 2) },
          { k: 'part', label: '陪嫁一辆车', sub: off(c.car) ? `${wan(c.car)}，${tooMuch}` : wan(c.car) + lack(c.car), off: off(c.car), w: 3 * fit(c.car) },
          { k: 'none', label: '彩礼原样带过去，算作陪嫁', sub: '不额外出钱', w: 1.5 },
        ],
        ctx: { ...c, son },
      };
    },
    apply: (k, c) => {
      const kd = weddingKid(); if (!kd) return null;
      const spend = c.feast + (c.son ? c.bride + (k === 'all' ? c.down : k === 'part' ? c.down / 2 : 0) : (k === 'all' ? c.car + c.down / 2 : k === 'part' ? c.car : 0));
      marryKid(kd, spend);
      eff({ h: k === 'none' ? (c.son ? -2 : 1) : 4 });
      const owe = `${c.son && c.bride >= 1000 ? '连彩礼、酒席在内' : '连酒席在内'}，一共花了约${wan(spend)}。` + (S.debt > 0 ? `目前还欠着${wan(S.debt)}。` : '');
      if (c.son) return { t: `${kd.name}结婚了。${k === 'none' ? '婚房没买成，小两口先租房住，亲家那边有些不高兴。' : `你出了${k === 'all' ? '全部' : '一半'}首付，婚房写的是他们的名字。`}${owe}`, k: 'good' };
      return { t: `${kd.name}出嫁了。${k === 'none' ? '男方给的彩礼，你们原样让她带了过去。' : k === 'all' ? '你陪嫁了一辆车，还帮小两口出了一半首付。' : '你陪嫁了一辆车。'}${owe}`, k: 'good' };
    },
  },

  sibloan: {
    build: () => {
      const adults = sibsAlive().filter(s => s.age >= 22); if (!adults.length || S.money <= 0) return null;
      const s = pick(adults), why = pick(['买房凑首付', '做生意周转', '孩子要上学', '家里有人看病']);
      const amt = Math.max(1e4, Math.round(Math.min(S.money * 0.5, placeInc() * 1.5) / 1e3) * 1e3);
      return {
        title: `${s.rel}来借钱`,
        body: `${s.rel}打来电话，${parentsWord() ? `先问了问${parentsWord()}的身体` : '先说了说家里的近况'}，又绕了半天，最后说${why}，想借${wan(amt)}。你手上有${wan(S.money)}。`,
        fact: '向父母、兄弟姐妹、朋友借钱是中国家庭借钱的主要渠道之一，越穷的家庭越依赖这类借款（基于中国家庭金融调查的研究）',
        choices: [
          { k: 'all', label: `借${wan(amt)}`, sub: '亲兄弟姐妹，不打借条', w: 2.5, tilt: { a: 0.5 } },
          { k: 'half', label: `先借${wan(Math.round(amt / 2 / 1e3) * 1e3)}`, sub: '说手头只有这么多', w: 2 },
          { k: 'no', label: '不借', sub: '可能伤感情', w: 1.2, tilt: { a: -0.4, c: 0.2 } },
        ],
        ctx: { rel: s.rel, amt },
      };
    },
    apply: (k, c) => {
      if (k === 'no') { eff({ so: -4, h: -2 }); return { t: `你说最近手头也紧。${c.rel}说“那算了”。之后过年见面，话少了很多。`, k: 'bad' }; }
      const x = k === 'all' ? c.amt : Math.round(c.amt / 2 / 1e3) * 1e3;
      lendSib(c.rel, x); eff({ so: 2 });
      return `借给了${c.rel}${wan(x)}，没打借条。`;
    },
  },

  inheritedhome: {
    build: () => {
      const index = S.inheritedHomes?.findIndex(home => !home.reviewed) ?? -1;
      const selected = index >= 0 ? index : 0, home = S.inheritedHomes?.[selected];
      if (!home) return null;
      return { title: '继承的房子怎么安排', body: `${home.city}的房产权益估值约${wan(home.v)}。这笔资产还没有变成现金。`,
        choices: [
          { k: 'sell', label: '出售，拿到现金', sub: `扣除交易折价后约${wan(home.v * 0.95)}`, w: liquidBalance() < 0 ? 5 : 1 },
          { k: 'move', label: '搬进去住', sub: '省下当地的房租', off: !!S.house || home.share < 0.999, w: 2 },
          { k: 'keep', label: '先留着', sub: '继续持有，不计租金收入', w: 2 },
        ], ctx: { index: selected } };
    },
    apply: (choice, context) => {
      const home = S.inheritedHomes?.[context.index];
      if (!home) return '';
      if (choice === 'sell') return `出售了继承的房产权益，实际到账${wan(sellInherited(context.index))}。`;
      if (choice === 'move' && !S.house && home.share >= 0.999) {
        S.house = { city: home.city, p: home.p, v: home.v, paid: 0, at: S.age };
        moveTo(home.p === S.home.p && home.city === S.home.city ? { ...S.home } : cityLoc(home.p, home.city));
        S.inheritedHomes.splice(context.index, 1);
        return '搬进了父母留下的房子，往后不用再付这边的房租。';
      }
      home.reviewed = true;
      return '把房子留了下来。房产记在名下，存款没有增加。';
    },
  },

  heritage: {
    build: () => {
      const H = S.famHouse, f = S.fam, rural = S.home.kind === 'rural';
      const bros = sibsAlive().filter(s => s.sex === 'M').length;
      const eq = heirShares(1), cashOnly = heirShares(0), all = heirShares(eq.n);
      // 老规矩：房子（尤其农村的宅子）留给儿子。你是女儿、家里有兄弟时，多半让出来；你是唯一的儿子时，多半归你
      const daughter = S.sex === 'F' && bros > 0, onlySon = S.sex === 'M' && bros === 0;
      const got = (x: number) => x >= 100 ? `你分到约${wan(x)}` : '存款没剩下什么，你几乎分不到钱';
      const ch: Choice[] = [{ k: 'equal', label: '房子卖了，所有东西平分', sub: got((eq.cash + eq.house * 0.95) / eq.n), w: rural ? 1.5 : 3 }];
      if (onlySon) ch.push({ k: 'take', label: '按老规矩，房子归你，姐妹只分存款', sub: `继承约${wan(all.share)}的资产，房子暂不变现`, w: rural ? 3 : 1, tilt: { a: -0.3 } });
      const heir = bros ? '兄弟' : '姐妹';
      if (!onlySon) ch.push({ k: 'give', label: `房子留给${heir}，你只分存款`, sub: got(cashOnly.share), w: daughter ? (rural ? 4 : 2) : 1, tilt: { a: 0.5 } });
      ch.push({ k: 'court', label: '谈不拢，去法院', sub: '按法律平分，但要打官司', w: 0.12, tilt: { a: -0.6, r: 0.3 } });
      return {
        title: '老房子怎么分',
        body: `爸妈都走了，留下${H.where}的${rural ? '老宅' : '老房子'}（约${wan(eq.house)}）${eq.cash >= 100 ? `和存款约${wan(eq.cash)}` : '，存款没剩下什么'}。兄弟姐妹${eq.n}个人坐在一起，商量怎么分。${daughter && rural ? '村里的老规矩是，房子和宅基地留给儿子。' : ''}`,
        fact: '《民法典》第1126条：继承权男女平等。第1130条：同一顺序继承人继承遗产的份额，一般应当均等；继承人协商同意的，也可以不均等',
        choices: ch, ctx: { n: eq.n, daughter, onlySon, heir },
      };
    },
    apply: (k, c) => {
      if (k === 'give') { const x = inheritSplit(0, true); eff({ so: 2, h: c.daughter ? -2 : 0 }); return `父母都走了。房子留给了${c.heir}，${x >= 100 ? `你分到存款约${wan(x)}` : '存款没剩下什么，你什么也没分到'}。${c.daughter ? '你没说什么，回去的路上一直没说话。' : ''}`; }
      if (k === 'take') { const x = inheritSplit(c.n, true); eff({ so: -2 }); return `父母都走了。按老规矩，房子归了你，连同存款共继承约${wan(x)}的资产，房子还没有卖。姐妹们没争，只是后来走动少了。`; }
      const x = inheritSplit(1, true, true);
      if (k === 'court') { const fee = Math.round(x * 0.05 / 1e2) * 1e2; eff({ money: -fee, so: -8, h: -5 }); return { t: `父母都走了，兄弟姐妹为老房子打了一年多官司。按法律平分，你分到约${wan(x)}，律师费花了${wan(fee)}。兄弟姐妹之间，从此不再来往。`, k: 'bad' }; }
      eff({ so: -1 }); return `父母都走了。老房子卖了，所有东西兄弟姐妹${c.n}人平分，你分到约${wan(x)}。`;
    },
  },

  // ---------- 工作和晚年的关口（规则在 turns.ts） ----------
  layofflist: {
    build: () => {
      // 这一年已经因为「35岁」被裁过的，不再有裁员名单
      if (!(JOBS[S.job] && JOBS[S.job].priv) || doneAge('crisis') === S.age || S.done.promo === S.age) return null; // 这一年刚升过职的也不上名单
      // 失业保险金能领几个月按缴费年数算（finance.ts 的 uiMonths）；S.jobY 是这一行干了几年（跳槽了也接着算），所以写「这一行」
      const pct = ri(1, 3) * 10, n = severance(), ui = uiMonths();
      return {
        title: '裁员名单',
        body: `公司说要“优化组织结构”，这一轮大约要裁掉${pct}%的人。HR开始一个个约谈，有人悄悄告诉你，名单上可能有你。${S.jobY ? `你干这一行${S.jobY}年了` : '你干这一行还不到一年'}${S.age >= 35 ? `，今年${S.age}岁` : ''}。`,
        card: [['如果被裁', `在这家公司干了${(S.empY || 0) >= 1 ? `${Math.floor(S.empY)}年` : '不到一年'}，按N+1补偿约${wan(n)}`], ['失业保险金', !S.flags.empIns ? '没交过失业保险' : ui ? `最长可以领${ui}个月` : '失业保险交了不满一年，领不了']],
        fact: '《劳动合同法》第47条：经济补偿按在本单位的工作年限，每满一年支付一个月工资；第40条：没有提前30天通知的，再额外支付一个月工资。2025年全国城镇调查失业率平均5.2%（国家统计局）',
        choices: [
          { k: 'stay', label: '拼命加班，表现给领导看', sub: '累，未必有用', w: 3, tilt: { c: 0.5 } },
          { k: 'connect', label: '找领导吃饭，托托关系', sub: S.st.so >= 60 ? '你人缘不错' : '你在公司里人缘一般', w: 1.5, tilt: { e: 0.5 } },
          { k: 'next', label: '悄悄投简历，先找好下家', sub: S.age >= 35 ? '这个年纪不好找' : '', w: 2, tilt: { r: 0.4 } },
          { k: 'take', label: '主动去谈，拿N+1走人', sub: `约${wan(n)}`, w: 1, tilt: { n: -0.3, a: 0.2 } },
        ],
      };
    },
    apply: k => {
      const cut = () => { const n = layOff(); eff({ h: -6 }); return n; };
      if (k === 'take') { const n = layOff(); eff({ h: -2 }); return `你主动找HR谈了，签了协议，拿了${wan(n)}补偿。收拾东西那天，工位上的绿萝送给了隔壁同事。`; }
      if (k === 'next') {
        if (chance(KEEP.next())) { jumpShip(); eff({ h: 3 }); return { t: `名单公布之前，你拿到了另一家公司的offer，还是做${JOBS[S.job].n}，工资涨了一点。`, k: 'good' }; }
        if (chance(KEEP.nextStay)) { eff({ h: -2 }); return '简历投了几十份，只有两个面试，都没下文。好在这一轮名单上最后没有你。'; }
        const n = cut(); return { t: `简历投了几十份，都没下文。名单下来，上面有你。拿了${wan(n)}补偿。`, k: 'bad' };
      }
      if (k === 'connect') {
        eff({ money: -placeInc() * 0.05 });
        if (chance(KEEP.connect())) { eff({ so: 2 }); return '请领导吃了两顿饭，过年还送了礼。名单下来，上面没有你。'; }
        const n = cut(); eff({ so: -2 }); return { t: `饭也请了，礼也送了。名单下来，上面还是有你。领导说“我也没办法”。拿了${wan(n)}补偿。`, k: 'bad' };
      }
      eff({ hl: -4, h: -3 });
      if (chance(KEEP.stay)) return '连着三个月最后一个走。名单下来，上面没有你，旁边的工位空了好几个。';
      const n = cut(); return { t: `连着三个月加班到深夜，名单下来，上面还是有你。拿了${wan(n)}补偿。`, k: 'bad' };
    },
  },

  retireplan: {
    build: () => {
      const j = lastJob(), f = S.fam, rural = S.loc.kind === 'rural';
      const kidsGrown = kidsAlive().some(k => k.married || k.age >= 22), away = awayFromHome();
      const ch: Choice[] = [], work = rehireText();
      // 中风致残的不再返聘、不去带孩子；还没有孙辈的，是去子女那边帮着照应家里
      const dis = !!S.flags.disabled, gk = (S.flags.grandkids || 0) > 0;
      if (j !== 'farmer' && S.st.hl > 40 && !dis) ch.push({ k: 'rehire', label: '再干几年', sub: work, w: S.pension < placeInc() * 0.6 ? 3 : 1.5, tilt: { c: 0.4 } });
      if (kidsGrown && !dis) ch.push({ k: 'grand', label: gk ? '去帮子女带孩子' : '搬去子女那边住', sub: gk ? '搬去他们那边住' : '帮他们做做饭、看看家', w: gk ? 3.5 : 1.5, tilt: { a: 0.4 } });
      if (away) ch.push({ k: 'home', label: '回老家养老', sub: `回${S.home.city}，老邻居、老同学都在`, w: 2, tilt: { r: -0.3 } });
      if (!rural && S.money > placeInc() * 3 && S.st.hl > 45) ch.push({ k: 'snow', label: '冬天去海南，夏天回来', sub: '每年花一笔房租和路费', w: 1, tilt: { r: 0.4 } });
      ch.push({ k: 'school', label: '上老年大学，跳跳广场舞', sub: '书法、合唱、摄影……', w: 2, tilt: { e: 0.5 } });
      const pen = S.pension ? `每月养老金约${wan(S.pension / 12)}。` : '';
      return {
        title: '退休以后',
        body: `${j === 'farmer' ? '地种不动了，交给了亲戚。' : `${S.age}岁，退休了。`}${pen}${gk && !dis ? '子女那边的孙辈还小，' + (f.married && f.partner && f.partner.alive ? '老伴总念叨着' : '你总惦记着') + '想去帮忙。' : ''}往后的日子，打算怎么过？`,
        fact: '2010年人口普查：60岁及以上老人的主要生活来源，城市66%是离退休金，农村41%靠自己劳动、48%靠家人供养',
        choices: ch.slice(0, 4), ctx: { work },
      };
    },
    apply: (k, c) => {
      if (k === 'rehire') { startRehire(); eff({ so: 1, h: 1 }); return `闲不住，${c.work}。每年多挣${wan(S.flags.rehire.inc)}。`; }
      if (k === 'grand') { S.flags.grandHelp = 1; eff({ so: 3, h: 2, hl: -1, money: -placeInc() * 0.1 }); return { t: (S.flags.grandkids || 0) > 0 ? '搬去子女家，住进了次卧。每天买菜、做饭、接送孙辈，比上班还忙。' : '搬去子女家，住进了次卧。每天买菜、做饭，等他们下班回来。', f: '约41%的60岁及以上老人和成年子女住在一起（中国健康与养老追踪调查 CHARLS 基线）' }; }
      if (k === 'home') { goHomeOld(); eff({ so: 3, h: 3 }); return `回到了${S.loc.city}。早上去公园打拳，下午和老同学喝茶、打牌。`; }
      if (k === 'snow') { startSnowbird(); eff({ h: 4 }); return { t: '入冬以后，和一群老乡在海南租了间房，住到开春再回来。', f: '2017年10月到2018年4月，在海南过冬的“候鸟”约165万人，多是北方来的老人（海南省数据）' }; }
      eff({ so: 4, kn: 2, h: 3 }); return { t: `报了老年大学的${pick(['书法班', '合唱团', '摄影班', '国画班', '智能手机班'])}，每周去两次。晚上还加入了小区的广场舞队。`, f: '全国有7.6万多所老年大学和老年学校，在校学员1000多万人（中国老年大学协会，2024年）' };
    },
  },
};
