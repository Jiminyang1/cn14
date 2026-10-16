// 内容：随机事件（EVENTS）和抉择（DEC）。
// 事件：{ id, a:[最小年龄,最大年龄], w:权重或函数, c:条件, once:只发生一次, gap:冷却年数, run:()=>文字或{t,k,f} }
// k: good / bad / loss / ev；f: 附带的一条真实统计

const kidsAlive = () => S.fam.kids.filter(k => k.alive);
const rural = () => S.loc.kind === 'rural';
const dz = t => PBY[S.loc.p].dz.includes(t);
const single = () => !S.fam.married && !S.fam.dating && !S.cand;
const soloK = () => S.flags.solo ? 0 : 1;
// ===== 恋爱对象 =====
// 对象和你本人、父母用同一套「学历 → 职业 → 工资」逻辑生成（js/parents.js），只是学历、年龄、家乡和你相关：
// · 学历门当户对：同一档约 55%，差一档约 35%，差两档约 10%；不同档时，女性找的对象学历更高的约六成（估计，参考普查夫妻学历匹配）
// · 年龄：男方平均大 2 岁左右（2020 年普查平均初婚年龄男 29.4、女 28.0 岁）
// · 家乡：多数是同一个省的（估计）
const SCHOOL_EDU = { 高中: 3, 职高: 4, 复读: 3, 大专: 5, 本科: 6, 硕士: 7 };
const myEdu = () => Math.max(S.edu || 0, S.school && SCHOOL_EDU[S.school] ? SCHOOL_EDU[S.school] : 0, 2);
const TRAITS = ['温和', '直爽', '内向', '爱玩', '顾家', '上进', '慢热', '幽默', '细心', '要强'];
const MEET_HOW = { friends: '朋友聚会上', work: '公司', wedding: '同学婚礼上', hobby: '一个兴趣小组里', app: '社交软件上', school: '学校里', blind: '亲戚介绍' };
// 认识新的人有多频繁（校准系数，使初婚年龄、不婚比例对上 2020 年普查）
let MEET_K = 1, MUTUAL0 = 0.4, BREAK_K = 1.3, READY0 = 0.6, READY_K = 0.6;
// 单身时每年认识一个「可能发展」的人的概率（按年龄，女性略早；估计，MEET_K 为校准系数）。认识的方式里，年纪越大、相亲越多
const MEET_P = a => S.sex === 'F'
  ? (a < 18 ? 0 : a < 22 ? 0.55 : a < 26 ? 0.7 : a < 30 ? 0.7 : a < 35 ? 0.55 : a < 45 ? 0.35 : 0.2)
  : (a < 18 ? 0 : a < 22 ? 0.45 : a < 26 ? 0.65 : a < 30 ? 0.7 : a < 35 ? 0.6 : a < 45 ? 0.4 : 0.2);
// 每个人心里「该结婚的年纪」不一样（标准差约 3 岁，估计）；农村出身的一般早一些
const mShift = () => S.flags.mShift != null ? S.flags.mShift : (S.flags.mShift = gauss(0, 4) - (S.home.kind === 'rural' ? 1.5 : 0));
function meetHow() {
  if (S.school && S.age < 25 && chance(0.6)) return 'school';
  if (S.age >= 25 && chance(Math.min(0.5, (S.age - 23) * 0.06))) return 'blind';
  return wpick({ friends: 3, work: isWorking() ? 3 : 0, wedding: 1, hobby: 1, app: 2 });
}
// 每年年初：单身的人这一年会不会认识一个人（认识了就排一个「要不要在一起」的抉择）
function loveQueue() {
  if (S.age < 18 || S.age > 60 || !single() || !soloK()) return;
  const p = MEET_P(S.age) * MEET_K * (S.focus === 'love' ? 1.5 : 1) * (S.flags.loveBoost ? 1.5 : 1);
  if (!chance(Math.min(0.95, p))) return;
  S.cand = makePartner(meetHow());
  S.queue.push({ at: 0.2 + rnd() * 0.6, type: 'dec', id: 'romance' });
  S.queue.sort((a, b) => a.at - b.at);
}
function partnerEdu() {
  const me = myEdu(), r = rnd();
  let d = r < 0.55 ? 0 : r < 0.9 ? 1 : 2;
  if (d && !chance(S.sex === 'F' ? 0.6 : 0.4)) d = -d;
  return clamp(me + d, 1, 7);
}
function makePartner(how) {
  const sex = S.sex === 'M' ? 'F' : 'M';
  const nm = makeName(sex, chance(0.9) ? '汉族' : S.eth);
  const age = Math.max(18, Math.round(S.age + (sex === 'M' ? 2 : -2) + gauss(0, 2.8)));
  const home = chance(0.55) ? S.loc.p : chance(0.45) ? S.home.p : wpick(PROVS.map(x => [x.id, x.b]));
  const rural = S.loc.kind === 'rural' ? true : !chance(PBY[home].u / 100) && chance(0.6);
  const edu = how === 'school' ? Math.max(myEdu(), 5) : partnerEdu();
  const p = {
    name: nm.full, sur: nm.sur, sex, age, edu, home, rural, alive: true, metAt: S.age, how, city: S.loc.city,
    startAge: edu >= 7 ? 25 : edu >= 6 ? 22 : edu >= 5 ? 21 : edu >= 3 ? 18 : 16,
    k: Math.exp(gauss(0, 0.35)) * EDU_WAGE[edu], // 个人系数：学历溢价 × 个人差异
    q: clamp(Math.round(3 + (edu - 4.5) * 0.45 + gauss(0, 1.1)), 1, 5), // 对方家境（估计）
    trait: pick(TRAITS),
  };
  partnerJob(p);
  // 合不合得来：学历、年龄差得越多越难（估计）；再加一点说不清的缘分
  p.fit = clamp(0.62 - 0.1 * Math.abs(edu - myEdu()) - 0.03 * Math.abs(age - S.age) + gauss(0, 0.17), 0.05, 0.95);
  return p;
}
// 对方的工作：还在读书的没有工作；其余按学历抽职业（和父母同一张表）
function partnerJob(p) {
  if (p.age < p.startAge) { p.jk = null; p.job = null; p.inc = 0; p.hpf = false; return; }
  let jk = pickParentJob(p.edu, p.rural && S.loc.kind === 'rural', p.sex === 'F');
  if (jk === 'home' || jk === 'farmer' && S.loc.kind !== 'rural') jk = p.edu >= 5 ? 'clerk' : 'factory';
  p.jk = p.job = jk;
  p.hpf = !!HPF_JOB[jk] && chance(HPF_JOB[jk][0]);
  p.inc = partnerInc(p);
}
const partnerLoc = p => p.city === S.loc.city ? S.loc : cityLoc(PBY[S.loc.p].cities.includes(p.city) ? S.loc.p : p.home, PBY[S.loc.p].cities.includes(p.city) ? p.city : undefined);
const partnerInc = p => Math.round(wageOf(p, partnerLoc(p)));
const ptJobName = p => p.jk ? JOBS[p.jk].n : `${EDU_LV[p.edu]}在读`;
const loveWord = v => v >= 75 ? '很好' : v >= 58 ? '不错' : v >= 42 ? '一般' : '有点冷淡';
// 对方愿不愿意：合不合得来，加上你的人际、工作和房子（婚恋市场上，男方的房子和收入更被看重，估计）
function mutualP(p) {
  let x = MUTUAL0 + 0.5 * p.fit + (S.st.so - 55) / 100 + (p.how === 'blind' ? 0.08 : 0);
  const male = S.sex === 'M';
  if (S.house) x += male ? 0.08 : 0.03;
  if (S.income > placeInc() * 1.3) x += male ? 0.06 : 0.03;
  if (S.job === 'seeking') x -= male ? 0.12 : 0.06;
  return clamp(x, 0.05, 0.92);
}
function partnerRows(p, opts = {}) {
  const r = [['年龄', `${p.age}岁`], ['学历', p.jk ? EDU_LV[p.edu] : `${EDU_LV[p.edu]}在读`], ['职业', p.jk ? JOBS[p.jk].n : '还在读书'], ['年收入', p.inc ? wan(p.inc) + '/年' : '没有收入'],
    ['家乡', `${PBY[p.home].n}${p.rural ? '农村' : '城里'}`], ['家境', '●'.repeat(p.q) + '○'.repeat(5 - p.q)], ['性格', p.trait]];
  if (opts.love) r.push(['在一起', `${S.age - p.metAt}年`], ['感情', loveWord(p.love)]);
  return r;
}
// 恋爱中的每一年：感情向一个目标值靠拢（合不合得来、这一年花多少时间、是不是异地），感情差了就可能分手
function loveYear() {
  const d = S.fam.dating; if (!d) return;
  d.age++;
  if (!d.jk && d.age >= d.startAge) { partnerJob(d); log(`${d.name}毕业了，成了一名${ptJobName(d)}。`, 'ev'); }
  else if (d.jk) d.inc = partnerInc(d);
  const ldr = d.city !== S.loc.city;
  const T = 48 + 32 * d.fit + (S.focus === 'love' ? 8 : 0) + (S.focus === 'work' ? -4 : 0) + (ldr ? -12 : 0) + (S.st.h - 55) * 0.2;
  d.love = clamp(d.love + (T - d.love) * 0.35 + gauss(0, 7), 0, 100);
  const yrs = S.age - d.metAt;
  if (yrs >= 1 && !d.metParents && chance(0.5)) {
    d.metParents = 1;
    log(S.sex === 'M' ? `第一次去${d.name}家见家长，提了两大袋礼物。${d.q >= 4 ? '对方爸妈话不多，问了问你的工作和房子。' : '对方爸妈留你吃了顿饭，一直往你碗里夹菜。'}` : `${d.name}第一次来家里见你爸妈。${S.q <= 2 ? '妈妈私下问你：“他家里条件怎么样？”' : '爸妈挺满意，说小伙子看着踏实。'}`, 'ev');
  }
  // 分手的可能：感情越差越容易分；刚在一起的头两年、年纪轻的时候更容易分（BREAK_K 为校准系数）
  const pBreak = ((d.love < 30 ? 0.45 : d.love < 45 ? 0.22 : 0.06) + (yrs <= 2 ? 0.05 : 0) + (S.age < 24 ? 0.08 : 0)) * BREAK_K + (ldr ? 0.08 : 0) + (d.asks >= 2 ? 0.1 : 0);
  if (chance(pBreak)) {
    S.fam.dating = null; S.flags.exes = (S.flags.exes || 0) + 1;
    eff({ h: d.love > 55 ? -8 : -4 });
    const why = ldr ? '异地太久，联系越来越少，' : d.asks >= 2 ? '对方等不到你的答复，' : d.love < 35 ? '吵得越来越多，' : pick(['两家对彩礼和房子谈不拢，', '对未来的打算不一样，', '慢慢觉得不合适，']);
    log(`${why}你和${d.name}分手了。在一起${yrs ? yrs + '年' : '不到一年'}。`, 'bad');
  }
}
// 你搬去别的城市时，恋人要么跟着去，要么开始异地
function loveMove() {
  const d = S.fam.dating; if (!d || d.city === S.loc.city) return;
  if (chance(0.35 + d.love / 250)) { d.city = S.loc.city; if (d.jk) { partnerJob(d); } log(`${d.name}辞了工作，跟你一起去了${S.loc.city}。`, 'ev'); }
  else log(`你去了${S.loc.city}，${d.name}留在${d.city}。你们开始异地恋。`, 'ev');
}
function haveKid() {
  const _k = haveKid0(); addDoc('kid', '出生医学证明', [['新生儿', _k.name], ['性别', _k.sex === 'M' ? '男' : '女'], ['父母', S.sex === 'M' ? `${S.name}、${S.fam.partner ? S.fam.partner.name : ''}` : `${S.fam.partner ? S.fam.partner.name : ''}、${S.name}`]]); return _k;
}
function haveKid0() {
  const sex = chance(0.524) ? 'M' : 'F';
  const sur = S.sex === 'M' ? S.surname : (S.fam.partner ? S.fam.partner.sur : S.surname);
  const nm = makeName(sex, S.eth, sur || undefined);
  const k = { name: nm.full, sex, bornAt: S.age, age: 0, alive: true };
  S.fam.kids.push(k);
  return k;
}
// 彩礼：各省调查/报道的区间（见 DATA.md，可信度多为中低）；没有数据的省份用农村调查均值 3.86 万
const brideAmt = pid => { const b = PBY[pid].bride; return b ? Math.round((b[0] + (b[1] - b[0]) * rnd()) / 1e3) * 1e3 : 38600; };
// 回老家买房：北京、上海、天津没有“县城”，按那座城市本身的房价算；其他地方按县城房价
function hometownHouse() {
  const muni = ['BJ', 'SH', 'TJ'].includes(S.home.p);
  const per = muni ? placeHp(cityLoc(S.home.p, PBY[S.home.p].cities[0])) : hpCounty(PBY[S.home.p]);
  return { price: Math.round(per * 90 / 1e4) * 1e4, where: muni ? `回${S.home.city}买一套` : '在老家县城买一套', city: muni ? S.home.city : `${PBY[S.home.p].n}老家的县城` };
}
// 被录取：搬去读书的城市，记下学校层次和专业
function enroll(c, major, adjusted) {
  addDoc('admit', '录取通知书', [['学校', c.name], ['专业', major + (adjusted ? '（调剂）' : '')], ['层次', TIER_N[c.tier] || '']]);
  const L = BIG[c.city] ? cityLoc(BIG[c.city].p, c.city) : PBY[c.prov].cities.includes(c.city) ? cityLoc(c.prov, c.city) : { p: c.prov, city: c.city, kind: 'city' };
  moveTo(L);
  S.school = c.tier === 'zhuan' ? '大专' : '本科'; S.schoolEnd = S.age + (c.tier === 'zhuan' ? 3 : 4);
  S.flags.tier = { '985': 'top', '211': '211', ben1: 'ben1', ben2: 'ben', minban: 'ben', zhuan: 'zhuan' }[c.tier];
  S.flags.uni = { name: c.name, city: c.city, prov: c.prov, tier: c.tier };
  S.flags.major = major;
  if (c.fee) eff({ h: -2 });
  const away = c.prov === S.home.p ? '留在本省读书' : `离开${PBY[S.home.p].n}，去${PBY[c.prov].n}读书`;
  const fire = S.home.kind === 'rural' && (c.tier === '985' || c.tier === '211') ? '村里有人放了鞭炮。' : '';
  return { t: `被${c.name}录取，专业是${major}${adjusted ? '（服从调剂分过来的）' : ''}。${away}${c.fee ? '，民办学校一年学费两三万' : ''}。${fire}`, k: adjusted || c.fee ? 'ev' : 'good' };
}
const TIER_K = { top: 0.3, '211': 0.18, ben1: 0.1, ben: 0.05, zhuan: 0.02 };
const tierK = () => TIER_K[S.flags.tier] || 0.05;
const MAJORS = ['计算机', '会计', '临床医学', '护理', '机械工程', '汉语言文学', '英语', '电子商务', '土木工程', '法学', '师范教育', '金融'];

const EVENTS = [
  // ---------- 0–5 岁 ----------
  { id: 'vax', a: [0, 0], once: 1, w: 5, run: () => { eff({ hl: 2 }); return { t: '在社区医院打了乙肝疫苗和卡介苗。之后几年，那本小小的接种本上会盖满章。', f: '国家免疫规划疫苗对适龄儿童免费接种' }; } },
  { id: 'steps', a: [1, 1], once: 1, w: 4, run: () => { eff({ h: 2 }); return `你迈出了第一步，${carer()}赶紧掏出手机录了下来。`; } },
  { id: 'word', a: [1, 2], once: 1, w: 3, run: () => `你说出了第一个词：“${S.flags.lb === 'both' ? S.flags.carer : chance(0.6) ? '妈妈' : '爸爸'}”。` },
  { id: 'oldDrift', a: [0, 2], once: 1, w: () => !rural() && !S.flags.lb ? 3 : 0, run: () => { eff({ so: 2 }); return { t: '奶奶从老家坐了一夜火车赶来，帮爸妈带你。她在城里谁也不认识，每天推着你在小区里一圈圈地转。', f: '随子女进城照顾孙辈的老人，常被称为“老漂族”' }; } },
  { id: 'fever', a: [0, 5], gap: 2, w: 2, run: () => { eff({ hl: -2 }); return rural() ? '半夜发高烧，家里人抱着你骑电动车去镇卫生院。' : '半夜发高烧，爸妈抱着你去儿童医院，急诊排了三个小时队。'; } },
  { id: 'tablet', a: [2, 8], once: 1, w: 3, run: () => { eff({ kn: -1, h: 2 }); return '大人忙的时候，就把手机递给你。短视频一刷就是一下午。'; } },
  { id: 'lbCall', a: [1, 15], gap: 2, w: () => S.flags.lb ? 4 : 0, run: () => { eff({ h: -2, so: -1 }); return { t: S.flags.lb === 'both' ? `每个星期天晚上，和在外打工的爸妈视频。信号不好，画面总是卡住。${S.age < 5 ? '你不太认得屏幕里的人。' : '说着说着就不知道该说什么了。'}` : '在外打工的爸爸每周打来一次电话，问的总是“听不听话”“考了多少分”。', f: '2024年义务教育阶段有农村留守儿童858万、进城务工人员随迁子女1309万（中国统计年鉴2025）' }; } },
  { id: 'lbSpring', a: [2, 15], gap: 2, w: () => S.flags.lb ? 3 : 0, run: () => { eff({ h: 3 }); return S.flags.lb === 'both' ? '过年了，爸妈从外地回来，给你带了新衣服。正月初八他们又走了，你追着车跑了很远。' : '过年时一家人终于聚齐了。初六那天，爸爸又背上行李去了车站。'; } },

  // ---------- 6–14 岁 ----------
  { id: 'redscarf', a: [7, 8], once: 1, w: 2, c: () => !!S.school, run: () => { eff({ h: 1, so: 1 }); return '戴上了红领巾，入了少先队。'; } },
  { id: 'homework', a: [6, 14], gap: 2, w: () => rural() ? 1 : 3, c: () => !!S.school, run: () => { eff({ kn: 2, h: -2 }); return '家长群里，老师又@了你妈妈。那天的作业写到晚上十点。'; } },
  { id: 'myopia', a: [7, 16], once: 1, w: 2, run: () => { eff({ hl: -1 }); return { t: '看黑板越来越模糊，配了人生第一副眼镜。', f: '2025年全国儿童青少年总体近视率为49.9%（国家疾控局）' }; } },
  { id: 'classes', a: [7, 15], gap: 2, w: () => !rural() && S.q >= 3 ? 2.5 : 0, run: () => { eff({ kn: 3, h: -3, money: 0 }); return `周末被报了好几个班：${pick(['书法和编程', '英语和奥数', '钢琴和游泳', '画画和跆拳道'])}，比上学还累。`; } },
  { id: 'olympiad', a: [9, 14], once: 1, w: () => S.st.kn > 62 ? 2 : 0, run: () => { eff({ kn: 2, h: 4 }); return { t: '数学竞赛拿了奖。奖状被贴在家里最显眼的那面墙上。', k: 'good' }; } },
  { id: 'bestie', a: [6, 14], once: 1, w: 2, run: () => { eff({ so: 6, h: 3 }); return '交到了一个最好的朋友，你们约好以后考同一所高中。'; } },
  { id: 'bully', a: [7, 15], once: 1, w: () => S.st.so < 45 ? 2 : 0.7, run: () => { eff({ h: -6, so: -3 }); return { t: '在学校被几个同学欺负，你没敢告诉家里。', k: 'bad' }; } },
  { id: 'cadre', a: [7, 14], once: 1, w: () => S.st.kn > 55 ? 2 : 0.8, run: () => { eff({ so: 2, h: 2 }); return `当上了${pick(['班长', '学习委员', '数学课代表', '体育委员'])}。`; } },
  { id: 'phone', a: [10, 14], once: 1, w: 2, run: () => { eff({ h: 2, kn: -1 }); return '有了自己的第一部手机，是爸妈换下来的旧手机。'; } },
  { id: 'game', a: [10, 17], once: 1, w: 2, run: () => { eff({ h: 3, kn: -2 }); return { t: `迷上了一款手游。可是防沉迷规定，你只能在周五到周日晚上八点到九点玩。`, f: '2021年起，网络游戏企业只能在周五、周六、周日和法定节假日20时至21时向未成年人提供1小时服务' }; } },
  { id: 'migSchool', a: [6, 7], once: 1, w: () => S.flags.mig ? 10 : 0, run: () => { eff({ h: -2 }); return { t: `因为没有${S.loc.city}户口，爸妈准备了居住证、社保记录、租房合同一大摞材料，才让你在这里上了小学。`, f: '随迁子女在流入地入学，通常需要提供居住证、社保缴纳等证明材料' }; } },
  { id: 'river', a: [6, 13], once: 1, w: () => rural() ? 2 : 0.4, run: () => { eff({ h: 2 }); return { t: '夏天和伙伴偷偷去河里游泳，被大人揪回来狠狠骂了一顿。', f: '溺水是中国中小学生意外死亡的主要原因之一' }; } },
  { id: 'farmHelp', a: [8, 15], gap: 2, w: () => rural() ? 2.5 : 0, run: () => { eff({ hl: 1, so: 1 }); return `农忙时请假回家帮忙${pick(['掰玉米', '插秧', '摘茶叶', '收麦子', '摘辣椒'])}，晒得黢黑。`; } },
  { id: 'snack', a: [6, 11], once: 1, w: 1, run: () => { eff({ h: 2 }); return '放学路过小卖部，用攒下的零花钱买了辣条，和同学分着吃。'; } },
  { id: 'parentFight', a: [4, 16], gap: 3, w: () => S.flags.lb === 'both' ? 0 : 1, run: () => { eff({ h: -4 }); if (!S.flags.parDiv && chance(0.12)) { S.flags.parDiv = 1; eff({ h: -6 }); return { t: `爸妈离婚了。你跟着${chance(0.65) ? '妈妈' : '爸爸'}生活。`, k: 'bad' }; } return '爸妈又吵架了，你躲在房间里假装写作业。'; } },
  { id: 'boarding', a: [12, 14], once: 1, w: () => rural() ? 3 : 0, c: () => !!S.school, run: () => { eff({ so: 2, h: -1 }); return '去镇上读初中，开始住校。每周回家一次，带一罐家里腌的咸菜。'; } },
  { id: 'peTest', a: [14, 14], once: 1, w: 2, c: () => S.school === '初中', run: () => { eff({ hl: 2 }); return '为了体育中考，每天放学练跳绳和立定跳远。'; } },

  // ---------- 15–18 岁 ----------
  { id: 'jxun', a: [15, 15], once: 1, w: 3, c: () => S.school === '高中' || S.school === '职高', run: () => { eff({ hl: 1, so: 2 }); return '开学先是一周军训，晒脱了一层皮。'; } },
  { id: 'crush', a: [13, 17], once: 1, w: 2, run: () => { eff({ h: 3 }); return '喜欢上了班里的一个同学。传的小纸条被班主任没收了。'; } },
  { id: 'gk100', a: [17, 17], once: 1, w: 4, c: () => S.school === '高中', run: () => { eff({ kn: 2, h: -2 }); return '高考百日誓师大会上，全年级一起喊口号，喊得嗓子都哑了。'; } },
  { id: 'nosleep', a: [16, 17], once: 1, w: 3, c: () => S.school === '高中', run: () => { eff({ hl: -3, kn: 3 }); return '每天早上六点起床，晚自习上到十点半，一天只睡六个小时。'; } },
  { id: 'vocIntern', a: [16, 17], once: 1, w: 4, c: () => S.school === '职高', run: () => { eff({ hl: -2, money: 3000 }); return '学校安排去工厂“实习”，在流水线上一站就是十个小时。'; } },

  // ---------- 大学 ----------
  { id: 'dorm', a: [18, 22], once: 1, w: 3, c: () => ['本科', '大专'].includes(S.school), run: () => { eff({ so: 5, h: 3 }); return '大学宿舍住了六个人，来自五个省。熄灯后的卧谈会能聊到凌晨。'; } },
  { id: 'cet', a: [18, 21], once: 1, w: 2, c: () => S.school === '本科', run: () => { eff({ kn: 2 }); return chance(0.6) ? '大学英语四级一次就过了。' : '大学英语四级考了两次才过。'; } },
  { id: 'parttime', a: [18, 22], once: 1, w: 2, c: () => ['本科', '大专'].includes(S.school), run: () => { eff({ money: 4000, so: 1 }); return `周末去${pick(['做家教', '发传单', '奶茶店打工', '商场做促销'])}，赚点生活费。`; } },
  { id: 'major', a: [18, 19], once: 1, w: 10, c: () => ['本科', '大专'].includes(S.school) && !S.flags.major, run: () => { S.flags.major = S.school === '大专' ? pick(['护理', '电子商务', '会计', '机械工程', '计算机', '师范教育']) : pick(MAJORS); return `你的专业是${S.flags.major}。`; } },

  // ---------- 工作与生活 ----------
  { id: 'firstRent', a: [18, 32], once: 1, w: 3, c: () => isWorking() && !rural() && !S.house, run: () => { eff({ h: -1 }); return `第一次自己租房。${S.loc.kind === 'big' ? '城中村的单间，窗户对着隔壁楼的墙。' : '老小区的一间次卧，和陌生人合租。'}`; } },
  { id: 'overtime', a: [22, 45], gap: 2, w: () => ['tech', 'clerk', 'engineer', 'sales'].includes(S.job) ? 3 : 0, run: () => { eff({ hl: -4, h: -3, money: placeInc() * 0.1 }); return '连续加了一个月的班。项目上线那天，你在工位上睡着了。'; } },
  { id: 'riderRain', a: [16, 60], gap: 3, w: () => S.job === 'rider' ? 4 : 0, run: () => { eff({ hl: -2, h: -2 }); return '下暴雨的晚上订单最多。你在积水里骑了四个小时，超时一单就被扣钱。'; } },
  { id: 'gigExit', a: [20, 58], gap: 2, w: () => ['rider', 'driver'].includes(S.job) && S.jobY >= 2 ? 2 : 0, run: () => { const was = JOBS[S.job].n; hireInCity(wpick({ factory: 2, sales: 2, clerk: S.edu >= 5 ? 2 : 0.5, shop: 1, skilled: S.edu === 4 ? 2 : 0.3 })); return `做了几年${was}，换成了${JOBS[S.job].n}。`; } },
  { id: 'factoryLine', a: [16, 60], gap: 3, w: () => ['factory', 'migrant'].includes(S.job) ? 3 : 0, run: () => { eff({ hl: -2, money: placeInc() * 0.05 }); return '旺季每天上十二个小时的班，宿舍八个人一间。'; } },
  { id: 'buildSite', a: [16, 65], gap: 3, w: () => S.job === 'build' ? 3 : 0, run: () => { eff({ hl: -3 }); if (chance(0.05)) { eff({ hl: -10, money: -placeInc() * 0.3 }); return { t: '在工地上从脚手架摔下来，腿骨折了，躺了三个月。', k: 'bad' }; } return '工程结束，包工头拖了三个月才把工钱结清。'; } },
  { id: 'blind', a: [23, 42], gap: 1, c: single, w: () => (S.age >= 27 ? 1.5 : 0.6) * soloK(), run: () => { eff({ h: -1 }); return '被家里安排去相亲。在咖啡馆坐了一个小时，对方问的全是收入和房子。'; } },
  { id: 'urge', a: [25, 40], gap: 2, w: 3, c: () => !S.fam.married, run: () => { eff({ h: -3 }); return '过年回家，七大姑八大姨轮流问：“有对象了吗？什么时候结婚？”'; } },
  { id: 'dateTrip', a: [18, 50], gap: 2, w: 1.2, c: () => !!S.fam.dating, run: () => { const d = S.fam.dating; d.love = clamp(d.love + 6, 0, 100); eff({ h: 3, money: -placeInc() * 0.04 }); return { t: `和${d.name}去${pick(['厦门', '大理', '成都', '青岛', '西安', '桂林'])}玩了几天。${d.city !== S.loc.city ? '难得见一次面。' : ''}`, k: 'good' }; } },
  { id: 'dateFight', a: [18, 50], gap: 2, w: () => S.fam.dating && S.fam.dating.fit < 0.5 ? 1.5 : 0.6, c: () => !!S.fam.dating, run: () => { const d = S.fam.dating; d.love = clamp(d.love - 8, 0, 100); eff({ h: -3 }); return pick([`和${d.name}为了一件小事吵了一架，冷战了一个星期。`, `${d.name}嫌你回消息太慢，吵了一架。`, `${d.name}说你从来不考虑你们的以后。`]); } },
  { id: 'redEnv', a: [22, 70], gap: 4, w: 1, run: () => { const x = ri(2, 10) * 100; eff({ money: -x * ri(2, 5) }); return `这一年随了好几份份子钱，同事结婚、亲戚家孩子考上大学，每份${x}元。`; } },
  { id: 'layoff', a: [20, 60], gap: 4, w: () => isWorking() ? JOBS[S.job].risk * 4 : 0, run: () => { const boss = ['boss', 'shop'].includes(S.job); S.flags.lastJob = S.job; S.job = 'seeking'; eff({ h: -8 }); return { t: boss ? '生意越来越难做，最后关了门。' : '公司裁员，名单上有你。', k: 'bad' }; } },
  { id: 'promo', a: [25, 58], gap: 4, w: () => isWorking() ? 1.5 : 0, run: () => { S.wageK *= 1.15; eff({ h: 4 }); return { t: S.job === 'civil' ? '提了一级，工资涨了一点。' : '升职加薪了。', k: 'good' }; } },
  { id: 'stock', a: [25, 65], gap: 5, w: 1, c: () => S.money > placeInc() * 0.5, run: () => { const g = gauss(-0.05, 0.25), x = S.money * 0.3 * g; eff({ money: x, h: g > 0 ? 2 : -3 }); return g > 0 ? `跟着同事买了股票，赚了${wan(x)}。` : `跟着同事买了股票，亏了${wan(-x)}。`; } },
  { id: 'car', a: [25, 55], once: 1, w: 1.5, c: () => S.money > placeInc() * 1.2, run: () => { eff({ money: -placeInc() * 1.0, h: 3 }); return `买了一辆${chance(0.6) ? '新能源车' : '二手车'}，过年终于可以自己开车回家了。`; } },
  { id: 'travel', a: [20, 75], gap: 3, w: 1, c: () => S.money > 0, run: () => { eff({ h: 3, money: -placeInc() * 0.08 }); return `国庆假期去${pick(['西安', '三亚', '大理', '重庆', '青岛', '张家界', '哈尔滨'])}旅游，景区人山人海，看人比看风景多。`; } },
  { id: 'springHome', a: [18, 60], gap: 3, w: () => S.loc.p !== S.home.p ? 3 : 0, run: () => { eff({ h: 2, so: 2 }); return `春运抢票抢了三天，坐了${ri(6, 30)}个小时的车回家过年。`; } },
  { id: 'smoke', a: [15, 40], once: 1, w: () => S.sex === 'M' ? 1.6 : 0.1, run: () => { S.flags.smoke = 1; eff({ hl: -3 }); return { t: S.age < 18 ? '和几个同学躲在厕所里学会了抽烟。' : S.age < 22 ? '开始抽烟了。宿舍里的人都抽，你也跟着抽上了。' : '开始抽烟了。一开始是应酬时别人递过来的。', f: '中国成年男性的吸烟率远高于女性' }; } },
  { id: 'quitSmoke', a: [30, 75], once: 1, w: 0.8, c: () => !!S.flags.smoke, run: () => { S.flags.smoke = 0; eff({ hl: 3 }); return { t: '戒烟了。试了好几次，这次终于成功。', k: 'good' }; } },
  { id: 'drink', a: [22, 55], gap: 4, w: () => ['sales', 'boss', 'civil'].includes(S.job) ? 2 : 0.3, run: () => { eff({ hl: -2 }); return '饭局上被一轮轮敬酒，喝到吐。'; } },
  { id: 'low', a: [14, 70], gap: 6, w: () => S.st.h < 40 ? 2 : 0.15, run: () => { eff({ h: -3 }); if (chance(0.15)) { eff({ h: 8 }); return { t: '有一段时间每天都很累，什么都不想做。后来你去医院看了心理科，慢慢好了一些。', f: '中国抑郁障碍患者中，一年内接受过任何治疗的不到一成（Lancet Psychiatry 2021）。全国心理援助热线：12356' }; } return { t: '有一段时间每天都很累，什么都不想做，觉得一切都没有意义。你没有告诉任何人。', k: 'bad', f: '全国心理援助热线：12356' }; } },
  { id: 'divorce', a: [25, 70], gap: 5, w: () => (S.st.h < 45 ? 0.12 : 0.02) * (PBY[S.loc.p].divK || 1), c: () => S.fam.married && S.fam.partner && S.fam.partner.alive, run: () => { const p = S.fam.partner; S.fam.married = false; S.fam.partner = null; S.flags.divorced = 1; addDoc('divorce', '离婚证', [['对方', p.name]]); eff({ h: -8, so: -4, money: -Math.max(0, S.money) * 0.4 }); return { t: `你和${p.name}离婚了。`, k: 'bad', f: '2023年全国离婚360.5万对，其中民政部门登记259.3万对，其余为法院判决或调解' }; } },
  { id: 'kidSchool', a: [28, 55], gap: 3, w: 2, c: () => kidsAlive().some(k => k.age >= 6 && k.age <= 17), run: () => { eff({ h: -2, money: -placeInc() * 0.1 }); return pick(['为了孩子上学，研究学区、排队报名，跑了好几趟。', '每天晚上辅导孩子写作业，气得血压都上来了。', '孩子的家长群一天几百条消息。']); } },
  { id: 'reunion', a: [30, 60], gap: 10, w: 1, run: () => { eff({ so: 2, h: S.relInc > 0 ? 2 : -2 }); return '同学聚会。有人开着好车来，有人没来。大家聊着聊着，就开始聊房子和孩子。'; } },
  { id: 'scam', a: [25, 90], gap: 8, w: () => S.age > 60 ? 1.5 : 0.5, c: () => S.money > 0, run: () => { const x = Math.min(S.money * 0.3, placeInc() * (S.age > 60 ? 0.5 : 0.3)); eff({ money: -x, h: -4 }); return { t: S.age > 60 ? `听了几次“健康讲座”，买了${wan(x)}的保健品。` : `接到自称“公检法”的电话，被骗走了${wan(x)}。`, k: 'bad' }; } },
  { id: 'visitHome', a: [22, 60], gap: 3, w: () => awayFromHome() && (S.fam.mom.alive || S.fam.dad.alive) ? 2 : 0, run: () => { eff({ so: 2, h: 1 }); return '坐高铁回老家看爸妈。他们老了很多，饭桌上的菜却还是你小时候爱吃的。'; } },
  { id: 'checkup', a: [35, 75], gap: 4, w: 1.5, run: () => { eff({ hl: -1 }); return { t: `体检报告上有几个向上的箭头：${pick(['血压偏高', '血脂偏高', '血糖偏高', '尿酸偏高'])}。`, f: '中国18岁及以上居民高血压患病率为27.5%（2018年调查，2020年发布）' }; } },
  // 自然灾害：各省受灾人口相对全国的倍数（统计年鉴 8-25，2024）决定频率，农作物受灾面积的构成决定类型；地震按原来的地区名单
  { id: 'disaster', a: [0, 100], gap: 8, w: () => 0.3 * Math.min(4, PBY[S.loc.p].dzK || (PBY[S.loc.p].dz.length ? 1 : 0)), run: () => {
      const P = PBY[S.loc.p], w = { ...(P.dzW || {}) };
      if (P.dz.includes('quake')) w.quake = 0.15; if (P.dz.includes('sand')) w.sand = 0.1;
      const t = Object.keys(w).length ? wpick(w) : pick(P.dz.length ? P.dz : ['flood']);
      if (t === 'quake') { eff({ h: -6, money: -placeInc() * 0.3 }); return { t: '发生了地震。房子裂了几道缝，你们在帐篷里住了一个月。', k: 'bad' }; }
      if (t === 'flood') { eff({ h: -4, money: -placeInc() * 0.15 }); return { t: '连续暴雨引发洪水，家里一楼被淹，在安置点住了几天。', k: 'bad' }; }
      if (t === 'typhoon') { eff({ h: -2 }); return '台风过境，停课停工两天，窗户玻璃被吹裂了。'; }
      if (t === 'drought') { eff({ h: -2, money: rural() ? -placeInc() * 0.15 : 0 }); return rural() ? { t: '大旱，地里的庄稼减产了一大半。', k: 'bad' } : '持续干旱，城里限时供水了好几周。'; }
      if (t === 'hail') { eff({ h: -2, money: rural() ? -placeInc() * 0.1 : 0 }); return rural() ? '一场冰雹把快熟的庄稼砸坏了。' : '一场冰雹砸坏了停在路边的车。'; }
      if (t === 'cold') { eff({ hl: -1 }); return '一场大雪加寒潮，道路结冰，停课停工了好几天。'; }
      eff({ hl: -1 }); return '沙尘暴来了，天空一片昏黄，出门要戴口罩。';
    } },
  // ---------- 老年 ----------
  { id: 'dance', a: [50, 85], once: 1, w: () => S.sex === 'F' ? 3 : 0.8, c: () => S.job === 'retired' || S.age > 58, run: () => { eff({ so: 5, hl: 2, h: 3 }); return '加入了小区的广场舞队，每天晚上七点准时出现。'; } },
  { id: 'grandcare', a: [50, 80], gap: 4, w: 2, c: () => (S.flags.grandkids || 0) > 0, run: () => { eff({ so: 3, hl: -1, h: 2 }); return '帮子女带孙辈，每天接送上学、做饭，比上班还忙。'; } },
  { id: 'phoneOld', a: [60, 85], once: 1, w: 1.5, run: () => { eff({ h: 2 }); return '学会了用手机视频通话和扫码付款，还加了好几个老同学群。'; } },
  { id: 'oldFriend', a: [65, 105], gap: 5, w: 2, run: () => { eff({ so: -3, h: -4 }); return '一个认识了几十年的老朋友走了。'; } },
  { id: 'hosp', a: [65, 105], gap: 3, w: 1.5, run: () => { eff({ hl: -3, money: -placeInc() * 0.2 }); return `因为${pick(['肺炎', '摔跤骨折', '心律不齐', '白内障手术'])}住了一次院。`; } },
  { id: 'pensionUp', a: [63, 105], gap: 5, w: 1, c: () => S.job === 'retired', run: () => { S.pension *= 1.05; return '养老金又涨了一点。'; } },
];
const EVMAP = {};
EVENTS.forEach(e => { EVMAP[e.id] = e; });

// ===== 哪些抉择今年会出现 =====
function canBaby() {
  const wifeAge = S.sex === 'F' ? S.age : S.fam.partner.age;
  return wifeAge >= 22 && wifeAge <= 42 && kidsAlive().length < 3;
}
const babyP = () => [0.3, 0.09, 0.02][Math.min(2, kidsAlive().length)];
function dueDecisions() {
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

// ===== 抉择用到的小工具 =====
const homeCity = () => S.home.kind === 'rural' ? cityLoc(S.home.p) : S.home;
function gradJob(big) {
  const m = S.flags.major, lv = S.edu, kn = S.st.kn;
  if (m === '临床医学' && lv >= 6) return 'doctor';
  if (m === '护理' && chance(0.45)) return 'nurse';
  if (m === '师范教育' && chance(0.7)) return 'teacher';
  if (m === '计算机' && chance(big ? 0.6 : 0.3)) return 'tech';
  if ((m === '机械工程' || m === '土木工程') && chance(0.6)) return 'engineer';
  if (big && chance(clamp(tierK() + (kn - 60) / 120, 0.02, 0.6))) return 'tech';
  return wpick({ clerk: 4, sales: 2.5, engineer: lv >= 6 ? 1.5 : 0.5, teacher: lv >= 6 ? 1 : 0.3, factory: lv === 5 ? 1 : 0, rider: 0.3 });
}
function civilTry() {
  const p = clamp(0.07 + (S.st.kn - 60) / 120 + (S.edu >= 6 ? 0.05 : 0) + (S.edu >= 7 ? 0.05 : 0) + tierK() * 0.3, 0.03, 0.4);
  if (chance(p)) { hire('civil', homeCity()); S.flags.civilRetry = 0; eff({ h: 6 }); return { t: `考上了！在${S.loc.city}当了公务员。家里人逢人就说。`, k: 'good', f: '2026年度国考过审371.8万人，约98人竞争一个岗位' }; }
  S.job = 'seeking'; S.flags.civilRetry = 1; eff({ h: -4 }); return { t: '没考上。进面试的名单上没有你的名字。', k: 'bad' };
}
const gig = () => { hireInCity(chance(0.5) ? 'rider' : 'driver'); return `开始${S.job === 'rider' ? '送外卖' : '跑网约车'}，每天在路上跑十个小时。`; };

// ===== 抉择 =====
const DEC = {
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
      const choices = [{ k: 'apply', label: '填报志愿', w: score >= L.zhuanke ? 6 : 0.5, off: !cands.length }];
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
      const ch = plans.map(p => ({ k: 'buy:' + p.kind, label: `在${S.loc.city}买 · ${p.label}`, sub: bad ? '征信有不良记录，银行不放贷' : planSub(p), off: bad || p.off, w: (p.kind === 'com' ? 2 : 3) * stretch(p) }));
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
