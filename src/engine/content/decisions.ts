// 抉择：哪些抉择今年会出现（dueDecisions），以及每个抉择的选项和结果（DEC）。
// 抉择：{ build: () => { title, body, fact?, card?, choices, ctx? } | null, apply: (选中的 k, ctx) => 文字或{t,k,f} | null }

import type { Choice } from '../types';
import { BIG, BIRTH_TOTAL, NATION, PBY } from '../data';
import { CAUSE } from '../mortality';
import { EDU_LV, enroll, gkAutoApps, gkCandidates, gkLines, gkRank, gkResolve, gkScore } from '../education';
import { ILL, oop, reimburse } from '../health';
import { JOBS, civilTry, gig, gradJob, hire, hireInCity, isWorking } from '../career';
import { MEET_HOW, READY0, READY_K, brideAmt, loveWord, mShift, mutualP, partnerInc, partnerRows, ptJobName } from '../romance';
import { S } from '../state';
import { addDoc, log } from '../journal';
import { annualPay, bestPlan, buyHouse, foreclose, hhIncome, hometownHouse, loanBal, loanPayY, loanPlans, planSub, sellHouse } from '../housing';
import { awayFromHome, cityLoc, homeCity, migrantCity, moveTo, placeHp, placeInc, placeName } from '../place';
import { babyP, canBaby, haveKid, kidsAlive } from '../family';
import { chance, clamp, gauss, pick, ri, wpick } from '../rng';
import { eff } from '../stats';
import { parentsHelp } from '../parents';
import { rural } from './events';
import { wan } from '../format';

export function dueDecisions() {
  const a = S.age, f = S.fam, d = [];
  const once = id => S.done['dec_' + id] == null;
  const gapOK = (id, g) => S.done['dec_' + id] == null || a - S.done['dec_' + id] >= g;
  if (S.flags.ill && !S.flags.ill.treat) d.push('illness');
  if (S.school && S.schoolEnd === a) d.push({ 初中: 'zhongkao', 高中: 'gaokao', 复读: 'gaokao', 职高: 'vocgrad', 大专: 'graduate', 本科: 'graduate', 硕士: 'graduate' }[S.school]);
  if (S.job === 'seeking' && !S.school) d.push(S.flags.civilRetry && a < 35 ? 'civilretry' : 'seek');
  if ((f.mom.alive && f.mom.ill === 1) || (f.dad.alive && f.dad.ill === 1)) { if (a >= 22) d.push('parentcare'); }
  if (f.dating && !f.married && a >= (S.sex === 'M' ? 22 : 20) && a - f.dating.metAt >= (a < 28 && !(mShift() < -2) ? 2 : 1)) d.push('marry');
  if (f.married && f.partner && f.partner.alive && canBaby() && chance(babyP())) d.push('baby');
  if (!S.house && isWorking() && a >= 26 && a <= 50 && (f.married || a >= 30) && gapOK('house', 4) && chance(0.35)) d.push('house');
  if (isWorking() && S.loc.kind !== 'big' && a >= 19 && a <= 32 && once('bigcity') && !JOBS[S.job].stable && chance(0.18)) d.push('bigcity');
  if (JOBS[S.job] && JOBS[S.job].priv && a >= 35 && a <= 48 && once('crisis') && chance(0.12)) d.push('crisis');
  if (isWorking() && JOBS[S.job].risk > 0 && a >= 24 && a <= 50 && gapOK('jobhop', 6) && chance(0.07)) d.push('jobhop');
  if (a >= 78 && once('oldcare') && chance(0.3)) d.push('oldcare');
  // 欠款超过一年的月供（或半年的当地收入）才算真的还不上；小额缺口靠信用卡、亲戚周转
  if (loanBal() && S.money < -Math.max(loanPayY() * 1.5, placeInc()) && gapOK('arrears', 1)) d.push('arrears');
  else if (loanBal() && S.money - placeInc() * 1.5 > Math.max(placeInc() * 0.5, loanBal() * 0.2) && gapOK('prepay', 4) && chance(0.3)) d.push('prepay');
  return d.filter(Boolean);
}

// ===== 抉择 =====
export const DEC = {
  zhongkao: {
    build: () => {
      const back = !!S.flags.mig && !S.flags.migBack && chance(0.6);
      // 51 ≈ 参加中考的学生学识中位数（模拟测得）
      const p = clamp(0.68 + (S.st.kn - 51) / 30 + (S.q - 3) * 0.05 + (rural() ? -0.06 : 0.03), 0.08, 0.97);
      const pass = chance(p);
      const body = (back ? `因为户口不在${S.loc.city}，你回到老家${placeName(S.home)}参加中考。` : '') + (pass ? '中考成绩出来了，分数够上普通高中。' : '中考成绩出来了，差了一些，没够上普通高中的分数线。');
      let choices = pass ? [
        { k: 'gao', label: '读普通高中，三年后考大学', sub: '学识↑ 压力↑', w: 9 },
        { k: 'voc', label: '去读职高，早点学门手艺', sub: '三年后就能工作', w: 1 },
      ] : [
        { k: 'voc', label: '读职高或中专', sub: '学一门技术', w: 6 },
        { k: 'redo', label: '复读一年，再考一次', sub: '学识↑ 幸福↓', w: 2 },
        { k: 'work', label: '不读了，出去打工', sub: '16岁就能赚钱', w: S.q <= 2 ? 2 : 0.5 },
      ];
      if (S.flags.zkRedo) choices = choices.filter(c => c.k !== 'redo');
      return { title: '中考', body, fact: '2025年普通高中与中职招生之比约为74:26（教育部；若计入技工学校约为67:33）', choices, ctx: { back } };
    },
    apply: (k, ctx) => {
      if (ctx.back) { S.flags.migBack = 1; moveTo(S.home); }
      S.edu = Math.max(S.edu, 2);
      if (k === 'gao') { S.school = '高中'; S.schoolEnd = S.age + 3; addDoc('school', '学籍卡', [['学校', `${S.loc.city}的一所普通高中`], ['入学', `${S.birthYear + S.age}年`]]); return '开始读高中了。'; }
      if (k === 'voc') { S.school = '职高'; S.schoolEnd = S.age + 3; return `进了职业高中，学的是${pick(['数控技术', '汽车维修', '电子商务', '学前教育', '护理', '烹饪', '计算机应用'])}。`; }
      if (k === 'redo') { S.flags.zkRedo = 1; S.school = '初中'; S.schoolEnd = S.age + 1; eff({ kn: 5, h: -5 }); return '又回到初三的教室，坐在一群比你小一岁的同学中间。'; }
      S.school = null; hire(chance(0.6) ? 'factory' : 'migrant', migrantCity()); eff({ h: -3 });
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
      if (S.school !== '复读') choices.push({ k: 'redo', label: '复读一年', sub: '学识↑ 幸福↓', w: redoW });
      choices.push({ k: 'work', label: '不读了，去工作', sub: '早点赚钱', w: score < L.zhuanke ? 3 : 0.5 });
      return {
        title: '高考', form: 'zhiyuan',
        body: `你在${P.n}参加高考，考了${score}分（满分${L.total}），全省排名约第${pos.toLocaleString('zh-CN')}名（前${(rank * 100).toFixed(rank < 0.01 ? 2 : 1)}%）。今年${P.n}的特控线${L.special}分、本科线${L.benke}分、专科线${L.zhuanke}分。你${line}。`,
        fact: NATION.gaokaoFact || '2026年全国高考报名人数为1290万（教育部）',
        choices, ctx: { rank, score, cands },
      };
    },
    apply: (k, ctx) => {
      S.edu = Math.max(S.edu, 3);
      if (k === 'redo') { S.school = '复读'; S.schoolEnd = S.age + 1; eff({ kn: 4, h: -6 }); return '回到高三，又过了一年每天只睡六个小时的日子。'; }
      if (k === 'work') { S.school = null; hireInCity(wpick({ factory: 2, migrant: 2, rider: 1, sales: 1.5, shop: 0.5 })); return `没有再读书，去了${S.loc.city}，做了${JOBS[S.job].n}。`; }
      const sel = k === 'apply' ? gkAutoApps(ctx) : JSON.parse(k.slice(6));
      const apps = sel.apps.map(a => ({ c: ctx.cands[a.i], major: a.major }));
      const r = gkResolve(apps, ctx.rank, sel.adjust);
      if (r.ok) return enroll(r.c, r.major, r.adjusted);
      S.flags.slip = { score: ctx.score };
      S.queue.unshift({ at: S.t, type: 'dec', id: 'slip' });
      return { t: r.rejected ? `${r.rejected.name}投了你的档，但想读的专业没录上，你又没有服从调剂，被退档了。` : '所有志愿都没有录取，滑档了。', k: 'bad' };
    },
  },

  slip: {
    build: () => {
      const L = gkLines(S.home.p), sc = (S.flags.slip || {}).score || 0;
      const ch = [{ k: 'redo', label: '复读一年', sub: '明年再考', w: 3 }];
      if (sc >= L.zhuanke) ch.push({ k: 'zhuan', label: '参加征集志愿，读一所还有空位的高职', sub: '专科', w: 2 });
      ch.push({ k: 'work', label: '不读了，去工作', sub: '', w: 1 });
      return { title: '滑档之后', body: '本科批没有被录取。征集志愿里还剩一些学校有空位，也可以复读一年。', choices: ch };
    },
    apply: k => {
      if (k === 'redo') { S.school = '复读'; S.schoolEnd = S.age + 1; eff({ kn: 4, h: -6 }); return '决定复读。'; }
      if (k === 'work') { S.school = null; hireInCity(wpick({ factory: 2, migrant: 2, sales: 1.5 })); return `去了${S.loc.city}，做了${JOBS[S.job].n}。`; }
      const P = PBY[S.home.p], city = pick(P.cities);
      return enroll({ name: `${city}的一所高职`, city, prov: S.home.p, tier: 'zhuan', attr: '' }, pick(['护理', '电子商务', '会计', '机械工程', '计算机']), false);
    },
  },

  vocgrad: {
    build: () => ({
      title: '职高毕业', body: '三年职高读完了。', fact: '技术工人是中国制造业长期紧缺的岗位',
      choices: [{ k: 'skilled', label: '进厂当技术工人', sub: '收入稳定', w: 2 }, { k: 'zhuan', label: '考高职，读大专', sub: '再读三年', w: 4 }, { k: 'city', label: '去大城市打工', sub: '', w: 1.5 }],
    }),
    apply: k => {
      S.edu = Math.max(S.edu, 4); S.school = null; addDoc('grad', '中专毕业证书', [['学历', '中专/职高']]);
      if (k === 'skilled') { hireInCity('skilled'); return `在${S.loc.city}的一家工厂当了技术工人。`; }
      if (k === 'zhuan') { S.school = '大专'; S.schoolEnd = S.age + 3; moveTo(cityLoc(S.home.p, PBY[S.home.p].cities[0])); return `考上了${S.loc.city}的一所高职。`; }
      hire(wpick({ migrant: 2, rider: 1, factory: 2, sales: 1 }), migrantCity()); return `去了${S.loc.city}，做了${JOBS[S.job].n}。`;
    },
  },

  graduate: {
    build: () => {
      const lv = { 大专: 5, 本科: 6, 硕士: 7 }[S.school], top = ['top', '211'].includes(S.flags.tier);
      const ch = [];
      // 深造率：中上游 985 约 53%–75%，211 约 50%–64%，地方本科国内读研约 14%（各校就业质量报告、麦可思）
      if (lv === 6) ch.push({ k: 'kaoyan', label: S.flags.tier === 'top' || S.flags.tier === '211' ? '读研（保研或考研）' : '考研', sub: '再读三年', w: { top: 9, '211': 6, ben1: 3, ben: 2.5 }[S.flags.tier] || 2 });
      ch.push({ k: 'civil', label: '考公务员或事业编', sub: '稳定，但竞争激烈', w: 2 });
      ch.push({ k: 'big', label: '去大城市找工作', sub: '工资高，房租也高', w: top ? 4 : 2 });
      const U = S.flags.uni;
      if (U && U.prov !== S.home.p && !BIG[U.city]) ch.push({ k: 'stay', label: `留在${U.city}工作`, sub: '读了几年书，已经熟悉这座城市', w: 2 });
      ch.push({ k: 'home', label: '回家乡找份工作', sub: '离家近，节奏慢', w: 2 });
      return { title: '毕业去向', body: `${S.school}毕业了。${S.flags.major ? `你学的是${S.flags.major}。` : ''}`, fact: '2026届全国高校毕业生预计为1270万人', choices: ch, ctx: { lv } };
    },
    apply: (k, ctx) => {
      S.edu = Math.max(S.edu, ctx.lv); S.school = null; addDoc('grad', ctx.lv === 7 ? '硕士学位证书' : '毕业证书', [['学校', S.flags.uni ? S.flags.uni.name : ''], ['学历', EDU_LV[ctx.lv]], ['专业', S.flags.major]]);
      const top = ['top', '211'].includes(S.flags.tier);
      if (k === 'kaoyan') {
        // 考研总体录取率约 27%–32%（2024–2025）；名校有推免名额，成功率高得多
        const base = { top: 0.75, '211': 0.6, ben1: 0.38, ben: 0.3, zhuan: 0.15 }[S.flags.tier] || 0.3;
        if (chance(clamp(base + (S.st.kn - 62) / 50, 0.08, 0.92))) { S.school = '硕士'; S.schoolEnd = S.age + 3; return { t: base >= 0.6 && chance(0.5) ? '拿到了保研名额，免试读研。' : '考上了研究生。', k: 'good' }; }
        S.job = 'seeking'; return { t: '考研差了几分，没上线。先找工作吧。', k: 'bad', f: '2026年考研报名343万人，2025年硕士招生123.7万人' };
      }
      if (k === 'civil') return civilTry();
      // 毕业即失业：16–24 岁（不含在校生）调查失业率 2026 年 8 月为 18.9%
      // 毕业半年后未落实去向：双一流 8.1%、地方本科 14.4%、高职 11.9%（麦可思 2024/2025 届）
      if (chance({ top: 0.08, '211': 0.09, ben1: 0.13, ben: 0.145, zhuan: 0.12 }[S.flags.tier] || 0.14)) { if (k === 'big') { const city = wpick({ 深圳: 3, 上海: 3, 北京: 3, 杭州: 2, 广州: 2, 成都: 1.5 }); moveTo(cityLoc(BIG[city].p, city)); } else if (k === 'home') moveTo(homeCity()); S.job = 'seeking'; return { t: `投了几十份简历，毕业时还没有找到工作。`, k: 'bad', f: '2024届本科毕业生半年后去向落实率：“双一流”高校91.9%，地方本科85.6%（麦可思）' }; }
      if (k === 'big') { const city = wpick({ 深圳: 3, 上海: 3, 北京: 3, 杭州: 2, 广州: 2, 成都: 1.5 }); moveTo(cityLoc(BIG[city].p, city)); hire(gradJob(true)); return `去了${city}，成了一名${JOBS[S.job].n}。`; }
      if (k === 'stay') { hire(gradJob(false)); return `留在了${S.loc.city}，做了${JOBS[S.job].n}。`; }
      moveTo(homeCity()); hire(gradJob(false)); return `回到${S.loc.city}，做了${JOBS[S.job].n}。`;
    },
  },

  civilretry: {
    build: () => ({ title: '再考一次？', body: `你已经考了${S.flags.civilN || 1}次公务员，这一年都在家里备考。`, choices: [{ k: 'again', label: '再考一年', sub: '全职备考', w: 2 }, { k: 'stop', label: '不考了，去找工作', sub: '', w: 3 }] }),
    apply: k => {
      if (k === 'again') { S.flags.civilN = (S.flags.civilN || 1) + 1; return civilTry(); }
      S.flags.civilRetry = 0; hireInCity(gradJob(S.loc.kind === 'big')); return `放下了考公的书，做了${JOBS[S.job].n}。`;
    },
  },

  seek: {
    build: () => S.job !== 'seeking' ? null : ({
      title: '还没有工作', body: `你现在没有工作。存款还有${wan(Math.max(0, S.money))}。`,
      choices: [{ k: 'gig', label: '先送外卖或跑网约车', sub: '马上有收入', w: 0.7 }, { k: 'any', label: '降低要求，找份普通工作', sub: '', w: 3.5 }, { k: 'home', label: '回老家', sub: '', w: 1 }],
    }),
    apply: k => {
      if (k === 'gig') return gig();
      const lj = S.flags.lastJob;
      if (k === 'any' && lj && !['boss', 'shop', 'farmer'].includes(lj) && chance(0.6)) { hireInCity(lj); return `又找到了一份${JOBS[lj].n}的工作。`; }
      if (k === 'any') { hireInCity(S.edu >= 5 ? wpick({ clerk: 3, sales: 2 }) : wpick({ factory: 2, sales: 1, migrant: 1, shop: 0.5 })); return `找到了一份${JOBS[S.job].n}的工作。`; }
      moveTo(S.home); hire(S.home.kind === 'rural' ? (chance(0.5) ? 'farmer' : 'shop') : wpick({ clerk: 1, sales: 1, shop: 1 }));
      return `回到了${placeName()}，${S.job === 'farmer' ? '帮家里种地' : '做了' + JOBS[S.job].n}。`;
    },
  },

  bigcity: {
    build: () => {
      if (!isWorking() || S.loc.kind === 'big') return null;
      const city = wpick({ 深圳: 3, 上海: 2.5, 北京: 2, 杭州: 2, 广州: 2.5, 成都: 1.5 });
      const r = BIG[city].inc / placeInc();
      return {
        title: '去大城市闯一闯？', body: `老同学在${city}，说那边机会多。${city}的收入水平大约是你这里的${r.toFixed(1)}倍，房租也贵得多。`,
        choices: [{ k: 'go', label: `去${city}`, sub: '收入↑ 房租↑ 离家更远', w: 2 }, { k: 'stay', label: '留在这里', sub: '', w: 3 }], ctx: { city },
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
    build: () => !(JOBS[S.job] && JOBS[S.job].priv) ? null : ({
      title: '35岁', body: `公司“降本增效”，你所在的部门被裁撤了。你${S.age}岁，${loanBal() ? `房贷还欠${wan(loanBal())}，` : ''}${kidsAlive().some(k => k.age < 18) ? '孩子还在上学。' : ''}`,
      fact: '不少企业招聘时会写明“35岁以下”，这被称为“35岁门槛”；国考的年龄上限已在2025年度放宽到38岁',
      choices: [{ k: 'same', label: '找类似的工作，接受降薪', sub: '', w: 3 }, { k: 'gig', label: '先去送外卖或开网约车', sub: '', w: 1.5 }, { k: 'boss', label: '拿补偿金自己创业', sub: '风险很大', w: 1 }, { k: 'home', label: '回老家', sub: '', w: 1 }],
    }),
    apply: k => {
      eff({ h: -6, money: S.income * 0.3 });
      if (k === 'same') { if (chance(0.55)) { hire(S.job); S.wageK *= 0.8; return '投了上百份简历，几个月后找到了一份类似的工作，工资降了两成。'; } S.flags.lastJob = S.job; S.job = 'seeking'; return { t: '投了上百份简历，大多数没有回音。', k: 'bad' }; }
      if (k === 'gig') return gig();
      if (k === 'boss') { eff({ money: -placeInc() * 1.5 }); hire(wpick({ boss: 1, shop: 2 })); return `拿出积蓄开了一家${pick(['奶茶店', '小饭馆', '便利店', '培训工作室', '网店'])}。`; }
      hire(wpick({ clerk: 2, sales: 1, shop: 1 }), homeCity()); return `回到了${S.loc.city}，做了${JOBS[S.job].n}。工资少了一大截，但离爸妈近了。`;
    },
  },

  jobhop: {
    build: () => !isWorking() ? null : ({
      title: '跳槽？', body: '另一家公司来挖你，工资高两成，但听说更忙。',
      choices: [{ k: 'hop', label: '跳槽', sub: '收入↑ 健康↓', w: 2 }, { k: 'stay', label: '留在原来的地方', sub: '', w: 3 }, { k: 'boss', label: '干脆辞职自己干', sub: '风险很大', w: 0.4 }],
    }),
    apply: k => {
      if (k === 'stay') return null;
      if (k === 'hop') { const w = S.wageK; hire(S.job); S.wageK = w * 1.2; eff({ hl: -2 }); return '跳槽到了新公司，工资涨了两成。'; }
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
          { k: 'go', label: blind ? '继续接触' : '主动追求', sub: `对方也有意的可能：${P >= 0.65 ? '比较大' : P >= 0.4 ? '一半一半' : '不太大'}`, w: 0.6 + p.fit * 2 },
          { k: 'pass', label: blind ? '觉得不合适' : '只做朋友', sub: '', w: 0.7 },
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
      if (!S.fam.dating || S.fam.married) return null;
      const p = S.fam.dating, yrs = S.age - p.metAt;
      const amt = brideAmt(S.home.p);
      // 结婚的条件：男方家里出彩礼；不少女方家里希望有婚房（估计）
      const wantHouse = S.sex === 'M' && !S.house && chance(S.loc.kind === 'rural' ? 0.4 : 0.6);
      const push = p.asks >= 2 ? `${p.name}已经问过你好几次什么时候结婚。` : '';
      const body = `你和${p.name}在一起${yrs}年了，感情${loveWord(p.love)}。${push}` + (S.sex === 'M' ? `对方家里提出彩礼${wan(amt)}${wantHouse ? '，还希望你们有一套自己的房子' : ''}。` : `男方家里说可以给${wan(amt)}彩礼。`);
      // 想不想结婚：二十出头多半觉得还早，年纪越大越想定下来（READY_K 为校准系数）
      const ready = READY0 + Math.max(0, S.age - (S.sex === 'F' ? 24 : 26) - mShift()) * READY_K + Math.max(0, S.age - 30) * 0.5; // 三十岁以后家里催得更紧
      return {
        title: '结婚', body, card: partnerRows(p, { love: true }), fact: '2025年全国结婚登记676.5万对；2020年人口普查的平均初婚年龄：男29.38岁、女27.95岁',
        choices: [
          { k: 'yes', label: S.sex === 'M' ? '求婚' : '答应结婚', sub: '办酒席、领证', w: ready * clamp(p.love / 60, 0.3, 1.6) },
          { k: 'wait', label: '再处处看', sub: p.asks >= 2 ? '对方可能不想再等了' : '', w: 2 },
          { k: 'no', label: '分手', sub: '', w: p.love < 45 ? 1.5 : 0.3 },
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
      S.fam.married = true; S.fam.partner = p; p.marriedAt = S.age; S.fam.dating = null; p.city = S.loc.city;
      if (p.jk) p.inc = partnerInc(p);
      addDoc('marry', '结婚证', [['持证人', S.name], ['配偶', p.name], ['配偶学历', EDU_LV[p.edu]], ['配偶职业', ptJobName(p)], ['登记日期', `${S.birthYear + S.age}年`]]);
      eff({ money: (S.sex === 'M' ? -ctx.amt : ctx.amt * 0.3) - placeInc() * 0.1, h: 8, so: 6 });
      return { t: `你和${p.name}结婚了。酒席摆了${ri(10, 40)}桌。`, k: 'good' };
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
      const kid = haveKid(); eff({ h: 6, so: 4, money: -placeInc() * 0.3 });
      return { t: `${kid.name}出生了，是个${kid.sex === 'M' ? '男孩' : '女孩'}。`, k: 'good' };
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
        body: `${S.loc.city}一套90平米的房子大约${wan(price)}。你手上有${wan(Math.max(0, S.money))}${S.hpf ? `，公积金账户里有${wan(S.hpf)}` : '，没有公积金'}${help ? `，爸妈说能拿出${wan(help)}` : ''}。`,
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
      const part = Math.min(bal, Math.round((S.money - placeInc() * 1.5) / 1e4) * 1e4);
      if (part <= 0) return null;
      const ch = [{ k: 'part', label: `提前还${wan(part)}`, sub: '月供变少，利息省一些', w: 2 }];
      if (S.money - placeInc() * 1.5 > bal) ch.unshift({ k: 'all', label: `一次还清剩下的${wan(bal)}`, sub: '无债一身轻', w: 2 });
      ch.push({ k: 'no', label: '不还，钱留在手里', sub: '应急、理财或者给孩子用', w: 2 });
      return { title: '提前还房贷？', body: `房贷还剩${wan(bal)}，利率${(S.loans[0].rate * 100).toFixed(2)}%。存款理财的收益越来越低，身边不少人都在提前还贷。`, fact: '2023–2024年出现“提前还贷潮”，全国个人住房贷款余额连续下降', choices: ch, ctx: { part } };
    },
    apply: (k, c) => {
      if (k === 'no') return null;
      if (k === 'all') { S.money -= loanBal(); S.loans = []; eff({ h: 4 }); return { t: '把房贷一次还清了。', k: 'good' }; }
      let left = c.part; S.money -= c.part;
      for (const l of S.loans.sort((a, b) => b.rate - a.rate)) { const x = Math.min(l.bal, left); l.bal -= x; left -= x; l.pay = annualPay(l.bal, l.rate, l.years); }
      S.loans = S.loans.filter(l => l.bal > 1); eff({ h: 2 });
      return `提前还了${wan(c.part)}，月供降到了${wan(loanPayY() / 12)}。`;
    },
  },

  arrears: {
    build: () => {
      if (!S.house || !loanBal()) return null;
      return {
        title: '房贷还不上了', body: `存款已经花光，还欠着${wan(-S.money)}。房贷每月${wan(loanPayY() / 12)}，还剩${wan(loanBal())}没还。房子现在大约值${wan(S.house.v)}。`,
        fact: '2025年全国约11.3万套住宅法拍成交，成交价约为评估价的74%',
        choices: [{ k: 'sell', label: '把房子卖了', sub: '按市价打折卖，先还清贷款', w: S.flags.heldOn ? 3 : 1.5 }, { k: 'hold', label: '找亲戚借钱，再撑一年', sub: '幸福↓', w: S.flags.heldOn ? 1 : 3 }, { k: 'stop', label: '断供', sub: '房子被法拍，征信留下污点', w: 0.5 }],
      };
    },
    apply: k => {
      if (k === 'hold') { eff({ h: -6, so: -3 }); S.flags.heldOn = (S.flags.heldOn || 0) + 1; return { t: '找亲戚东拼西凑，先把这一年的月供补上了。', k: 'bad' }; }
      if (k === 'sell') { const got = sellHouse(0.92); eff({ h: -8 }); return { t: `急着出手，房子卖了${wan(got)}，还完贷款${S.money >= 0 ? '还剩一点' : '还欠着一些'}。`, k: 'bad' }; }
      const got = foreclose(); eff({ h: -15, so: -5 }); return { t: `停止还贷。几个月后房子被法院拍卖，只卖了${wan(got)}。`, k: 'bad' };
    },
  },

  parentcare: {
    build: () => {
      if (!(S.fam.mom.alive && S.fam.mom.ill === 1) && !(S.fam.dad.alive && S.fam.dad.ill === 1)) return null;
      const who = S.fam.mom.alive && S.fam.mom.ill === 1 ? 'mom' : 'dad', p = S.fam[who], wn = who === 'mom' ? '妈妈' : '爸爸';
      const away = awayFromHome();
      const ch = away
        ? [{ k: 'back', label: '辞职回老家照顾', sub: '收入↓ 陪伴↑', w: 1.5 }, { k: 'care', label: '花钱请护工', sub: '开销↑', w: 2 }, { k: 'take', label: `把${wn}接到身边`, sub: '', w: 1.5 }]
        : [{ k: 'self', label: '自己照顾', sub: '健康↓ 陪伴↑', w: 2 }, { k: 'care', label: '花钱请护工', sub: '开销↑', w: 2 }];
      return { title: `${wn}病了`, body: `${wn}${p.age}岁了，${pick(['中风后行动不便', '查出了阿尔茨海默病，开始认不出人', '摔了一跤，髋骨骨折，卧床了'])}，需要人照顾。`, choices: ch, ctx: { who } };
    },
    apply: (k, c) => {
      S.fam[c.who].ill = 2;
      if (k === 'back') { hire(S.home.kind === 'rural' ? (chance(0.5) ? 'farmer' : 'shop') : wpick({ clerk: 1, sales: 1, shop: 1 }), S.home); eff({ so: 4, h: -3 }); return `辞了${S.jobs.length > 1 ? '大城市的' : ''}工作，回到${placeName()}。`; }
      if (k === 'care') { eff({ money: -placeInc() * 0.8, h: -2 }); return '请了护工，每个月的开销多了一大块。'; }
      if (k === 'take') { eff({ h: -3, so: 3, money: -placeInc() * 0.3 }); return '把老人接来同住。房子小了，日子挤了，但心里踏实些。'; }
      eff({ hl: -3, h: -3, so: 3 }); return '每天下班先去爸妈家，喂饭、擦身、陪着说话。';
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
      if (il.k === 'stroke' && chance(ILL.stroke.disable * (k === 'big' ? 0.7 : 1))) { S.flags.disabled = 1; eff({ hl: -15, h: -6 }); log('命保住了，但半边身子不太灵活，生活需要人照顾。', 'bad'); }
      if (S.money < 0 && !S.flags.illDebt) { S.flags.illDebt = 1; log('为了治病，家里欠下了一笔债。', 'bad', '大病医疗费用曾是农村家庭致贫的主要原因：2016年建档立卡贫困户中约42%因病致贫'); }
      if (k === 'big') return '在大医院排了一个月队，住进了病房。家里人轮流请假来陪床。';
      if (k === 'local') return '在本地医院开始治疗。';
      return '决定不做大的治疗，回家好好过剩下的日子。';
    },
  },

  oldcare: {
    build: () => {
      const has = kidsAlive().length > 0;
      const ch = [{ k: 'home', label: '去养老院', sub: '', w: 1.5 }, { k: 'self', label: '还是自己住', sub: '', w: 2 }];
      if (has) ch.unshift({ k: 'kid', label: '搬去和子女一起住', sub: '', w: 3 });
      return { title: '晚年', body: '年纪大了，一个人生活越来越吃力。', choices: ch };
    },
    apply: k => {
      if (k === 'kid') { eff({ so: 5, h: 2 }); return '搬去和子女同住，每天看着孙辈进进出出。'; }
      if (k === 'home') { eff({ so: 2, h: -2, money: -placeInc() * 0.5 }); return '住进了养老院，和几个老人一间屋。'; }
      eff({ so: -3 }); return '还是住在自己家，邻居偶尔过来看看。';
    },
  },
};
