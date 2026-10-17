// 随机事件。
// 事件：{ id, a:[最小年龄,最大年龄], w:权重或函数, c:条件, once:只发生一次, gap:冷却年数, mo:[公历月份], pm:每月的概率, big:人生大事（journal.ts 的 major）, run:()=>文字或{t,k,f} }
// k: good / bad / loss / ev；f: 附带的一条真实统计
// 两种排法（schedule.ts）：
// · 一般的事件：每年 2–3 个位置，到了那个月按权重 w 抽一件。带 mo 的只在这几个公历月份可选（权重自动乘 12 ÷ 月数，一年的发生率大致不变）；
// · 状态事件（有 pm）：不参与抽取，每个月按 pm() 的概率判定（离婚这类按风险算的、军训这类按学校日历的），不占上面的位置。mo、条件、年龄照样检查

import { JOBS, RAISE, hireInCity, isWorking, quitJob, raise } from '../career';
import { severance } from '../turns';
import { MAJORS } from '../education';
import { PBY } from '../data';
import { S } from '../state';
import { addDoc, vary } from '../journal';
import { awayFromHome, farFromParents, placeInc } from '../place';
import { anyParent, bothParents, carer, parentsWord } from '../parents';
import { chance, clamp, gauss, pick, ri, wpick } from '../rng';
import { fexp } from '../fmath';
import { eff } from '../stats';
import { kidsAlive, sibsAlive } from '../family';
import { single } from '../romance';
import { wan } from '../format';
import { sibToWed, sibWed } from '../kin';
import { shape, tiltW } from '../personality';
import { calMonth, calYear } from '../monthly';
import { nowM } from '../calendar';
import { inKg } from '../schedule';
import { reimburse } from '../health';
import { ECHO_EVENTS, meetCrush, meetPal } from './echoes';
import { slotW } from '../focus';

declare module '../types' {
  interface Flags { parDivWith?: 'mom' | 'dad' } // 父母离婚后你跟着谁生活（判给谁）
}

export const rural = () => S.loc.kind === 'rural';

export const dz = t => PBY[S.loc.p].dz.includes(t);

// 住一次院自付多少：2024 年全国医院次均住院费用 9,870 元（卫健委统计公报），按医保的实际报销比例（health.ts 的 reimburse，在本地看）扣掉报销。
// 原来是当地人均可支配收入的 0.2 倍（中位约 1 万元）、不看医保，比现实高两三倍
export const HOSP_COST = 9870;
const hospOop = () => Math.round(HOSP_COST * (1 - reimburse('local').r) / 100) * 100;

// ===== 文字里的家人 =====
const PW = { mom: '妈妈', dad: '爸爸' } as const;
/** 你跟着生活的父母：父母离婚后是判给的那一位（不在世了换另一位），否则同 parentsWord；都不在了是 null */
const famWord = () => {
  const F = S.flags;
  if (!F.parDiv) return parentsWord();
  const w = F.parDivWith || 'mom', o = w === 'mom' ? 'dad' : 'mom';
  return S.fam[w].alive ? PW[w] : S.fam[o].alive ? PW[o] : null;
};
/** 每天照看你的人：父母都在外打工时是老人（carer）；父母离婚后是你跟着的那一位；其余同 carer() */
const withWho = () => S.flags.lb !== 'both' && S.flags.parDiv ? famWord() || carer() : carer();
/** 留守时在外打工的是谁：「爸妈」「爸爸」「妈妈」。父母离婚后都还在外打工的，说你判给的那一位。那一位已经不在了，或者不再留守（16 岁以后），是 null */
const lbWord = () => {
  const F = S.flags;
  if (!F.lb || !F.lbWho || S.age >= 16) return null;
  if (F.lbWho === 'both' && !F.parDiv) return parentsWord();
  const w = F.lbWho === 'both' ? F.parDivWith || 'mom' : F.lbWho;
  return S.fam[w].alive ? PW[w] : null;
};
const ta = (w: string) => w === '爸妈' ? '他们' : w === '妈妈' ? '她' : '他';

// ===== 工作 =====
/** 有单位的工作（能升职、有同事随份子）：不是骑手、司机、个体户、小老板、务农、进城打零工、建筑工地 */
const UNIT = new Set(['factory', 'skilled', 'sales', 'clerk', 'tech', 'engineer', 'teacher', 'doctor', 'nurse', 'civil']);
export const unitJob = () => isWorking() && UNIT.has(S.job);
/** 这个年龄年里刚入职（换了工作、裁员后重新找到的）：不升职 */
const newJob = () => { const j = S.jobs[S.jobs.length - 1]; return !!j && j.age === S.age; };
const PROMO_T = { civil: '提了一级，工资涨了一点。', teacher: '评上了高一级的职称，工资涨了一些。', doctor: '评上了高一级的职称，工资涨了一些。', nurse: '评上了主管护师，工资涨了一些。', factory: '当上了班组长，工资涨了一些。', skilled: '考下了高一级的技能证书，当上了班组长。' };

// ===== 离婚 =====
// 你自己的离婚是状态事件：每个月按风险判定（年风险最多约 3%，每月取 1/12，和 perMonth 差不到 2%）。
// 年风险 = DIV_BASE × 婚龄曲线 × 婚姻质量 × 60 岁以后的折减 × 省份系数 divK × 双方性格。依据和校准见 DATA.md「离婚（2026-10）」
// · 婚龄曲线：头一年较低，婚后 2–7 年最高（CFPS 的离婚风险随婚龄呈倒 U 型），之后逐段下降，25 年以后只剩一成；
// · 婚姻质量：结婚时合不合得来（fit，均值 0.55、标准差约 0.18）、结婚时的感情（love，均值约 63、标准差约 10；婚后不再变）、
//   现在的幸福（已婚者均值约 80、标准差约 8）。每个标准差的风险比约 1.6 / 1.2 / 1.3（估计）；
// · 怀孕期间、孩子不满一岁时不离婚（民法典第 1082 条：这段时间男方不得提出离婚。女方提出的很少，简化成都不离）。
// 性格：敏感的人风险高，随和、认真的低（每个标准差的风险比约 1.15 / 0.85 / 0.85，Roberts 2007、Lundberg 2012），夫妻双方各乘一次
const DIV_T = { n: 0.14, a: -0.16, c: -0.16 };
export const DIV_BASE = 0.0095;
export const DIV_DUR = (d: number) => d < 1 ? 0.5 : d < 2 ? 0.85 : d < 8 ? 1 : d < 15 ? 0.6 : d < 25 ? 0.3 : 0.1;
const DIV_OLD = 0.3; // 60 岁以后（估计：高龄离婚很少）
/** 有不满一岁的孩子，或者正怀着孕 */
const babyGuard = () => { if (S.flags.preg) return true; const now = nowM(); return S.fam.kids.some(k => k.alive && now - k.bornM < 12); };
/** 现在能不能离婚：已婚、配偶在世、没有怀孕、没有不满一岁的孩子 */
const canDivorce = () => { const f = S.fam, p = f.partner; return f.married && !!p && p.alive && p.marriedAt != null && !babyGuard(); };
/** 你这一年离婚的风险（年概率）；不能离的时候是 0 */
export function divorceRisk() {
  if (!canDivorce()) return 0;
  const p = S.fam.partner;
  const q = fexp(-2.6 * (p.fit - 0.55) - 0.018 * ((p.love ?? 63) - 63) - 0.03 * (S.st.h - 80));
  // 格子放在「家人」上的，婚姻更稳：一格风险降三成，两格都放降近一半
  return DIV_BASE * DIV_DUR(S.age - p.marriedAt) * q * (1 - 0.3 * Math.min(1.6, slotW('family'))) * (S.age >= 60 ? DIV_OLD : 1) * (PBY[S.loc.p].divK || 1) * tiltW(DIV_T) * tiltW(DIV_T, p.pz || null);
}
// 父母离婚：同一条婚龄曲线（婚龄按你的年龄 + 2 估计，上面有哥哥姐姐的按最大的那个算），不看婚姻质量（没有记），按老家的省份系数。
// 只在你 1–17 岁时判定（之后的不影响「跟着谁生活」）。家里有不满一岁的弟弟妹妹时不离（民法典第 1082 条）
const PAR_DIV_K = 1;
function parDivRisk() {
  const f = S.fam;
  if (!bothParents() || S.flags.parDiv) return 0;
  if (f.sibs.some(s => s.alive && s.age < 1)) return 0;
  const older = f.sibs.reduce((m, s) => Math.max(m, s.age - S.age), 0);
  return DIV_BASE * PAR_DIV_K * DIV_DUR(S.age + 2 + older) * (PBY[S.home.p].divK || 1);
}
/** 父母离婚：记下你跟着谁生活（S.flags.parDivWith，两人这时都在世）。
 *  一方在外打工（留守）的，跟着一直在家带你的那一方，不再算留守（和 family.ts 的 parentGone 里「外出的那一方走了」一样；16 岁以后 lb 只是小时候的记录，不动）；
 *  父母都在外打工的，判给一方，照样由老人带；其余跟着妈妈的多（估计 65%） */
function parentsDivorce() {
  const F = S.flags;
  F.parDiv = 1; F.parDivM = nowM(); eff({ h: -10 });
  if (F.lb === 'one' && (F.lbWho === 'dad' || F.lbWho === 'mom')) {
    const out = F.lbWho, w = out === 'dad' ? 'mom' : 'dad';
    F.parDivWith = w;
    if (S.age < 16) { F.lb = undefined; F.lbWho = undefined; }
    return { t: `爸妈离婚了。在外打工的${PW[out]}很少再回来，你跟着${PW[w]}生活。`, k: 'bad' };
  }
  const w = chance(0.65) ? 'mom' : 'dad';
  F.parDivWith = w;
  return { t: F.lb === 'both' ? `爸妈离婚了。你判给了${PW[w]}，还是跟着${F.carer}在老家生活。` : `爸妈离婚了。你跟着${PW[w]}生活。`, k: 'bad' };
}

export const EVENTS = [
  // ---------- 0–5 岁 ----------
  { id: 'vax', a: [0, 0], once: 1, w: 5, run: () => { eff({ hl: 2 }); return { t: '在社区医院打了乙肝疫苗和卡介苗。之后几年，那本小小的接种本上会盖满章。', f: '国家免疫规划疫苗对适龄儿童免费接种' }; } },
  { id: 'steps', a: [1, 1], once: 1, w: 4, run: () => { eff({ h: 2 }); return `你迈出了第一步，${withWho()}赶紧掏出手机录了下来。`; } },
  // 第一个词：叫的是每天带你的人；爸妈都在身边时也常常先叫「爸爸」
  { id: 'word', a: [1, 2], once: 1, w: 3, run: () => { const c = withWho(); return `你说出了第一个词：“${c === '妈妈' && bothParents() && !S.flags.parDiv && chance(0.4) ? '爸爸' : c}”。`; } },
  { id: 'oldDrift', a: [0, 2], once: 1, w: () => !rural() && !S.flags.lb ? 3 : 0, c: anyParent, run: () => { eff({ so: 2 }); return { t: `奶奶从老家坐了一夜火车赶来，帮${famWord()}带你。她在城里谁也不认识，每天推着你在小区里一圈圈地转。`, f: '随子女进城照顾孙辈的老人，常被称为“老漂族”' }; } },
  { id: 'fever', a: [0, 5], gap: 2, w: 2, run: () => { eff({ hl: -2 }); return rural() ? '半夜发高烧，家里人抱着你骑电动车去镇卫生院。' : `半夜发高烧，${withWho()}抱着你去儿童医院，急诊排了三个小时队。`; } },
  { id: 'tablet', a: [2, 8], once: 1, w: 3, run: () => { eff({ kn: -1, h: 2 }); return '大人忙的时候，就把手机递给你。短视频一刷就是一下午。'; } },
  // 留守：在外打工的是谁按 lbWho（父母去世、离婚时跟着更新），那一位不在了就没有这两件事。
  // 过年的事（lbSpring、urge、springHome）是状态事件：只剩 1–2 月可选以后，放在每年 2–3 个位置里抽，一年的发生率掉了三到六成（位置落在 1–2 月的机会不到一半），
  // 所以改成春节前后每个月按概率判定（概率按改前的年发生率校准，见 DATA.md「随机事件的排法」）
  { id: 'lbCall', a: [1, 15], gap: 2, w: 4, c: () => !!lbWord(), run: () => { const w = lbWord(); eff({ h: -2, so: -1 }); return { t: S.flags.lb === 'both' ? `每个星期天晚上，和在外打工的${w}视频。信号不好，画面总是卡住。${S.age < 5 ? '你不太认得屏幕里的人。' : '说着说着就不知道该说什么了。'}` : `在外打工的${w}每周打来一次电话，问的总是“听不听话”“考了多少分”。`, f: '2024年义务教育阶段有农村留守儿童858万、进城务工人员随迁子女1309万（中国统计年鉴2025）' }; } },
  { id: 'lbSpring', a: [2, 15], gap: 2, mo: [1, 2], pm: () => LB_SPRING_PM, c: () => !!lbWord(), run: () => { const w = lbWord(); eff({ h: 3 }); return S.flags.lb === 'both' ? `过年了，${w}从外地回来，给你带了新衣服。正月初八${ta(w)}又走了，你追着车跑了很远。` : `过年时一家人终于聚齐了。初六那天，${w}又背上行李去了车站。`; } },

  // 童年（2026-10 补充）：让 0–5 岁每年也有几件事。效果都很小，多数只动幸福、人际
  { id: 'zhuazhou', a: [1, 1], once: 1, w: () => rural() ? 3 : 2, run: () => { const g = pick([['一支笔', '以后是读书的料'], ['一把算盘', '以后会算账'], ['一个手机', '以后离不开手机'], ['一张钞票', '以后能挣钱'], ['一把勺子', '以后是个吃货']]); eff({ h: 1, so: 1 }); return `周岁抓周，你一把抓住了${g[0]}。大人们笑着说：「${g[1]}。」`; } },
  { id: 'bump', a: [1, 5], once: 1, w: 1.5, run: () => { eff({ hl: -1, h: -1 }); return pick(['从床上滚下来，额头磕在床头柜上，缝了两针。', '在楼梯上摔了一跤，膝盖上留了个疤。', '学走路的时候撞到桌角，额头肿了一个大包。']); } },
  { id: 'picky', a: [2, 5], once: 1, w: 1, run: () => { eff({ hl: -1 }); return `开始挑食，青菜一口不吃。${withWho()}追着你喂饭，一顿饭要喂一个小时。`; } },
  { id: 'lostToy', a: [2, 5], once: 1, w: 1, run: () => { eff({ h: -1 }); return pick(['心爱的小熊玩偶弄丢了，你哭了一下午。', '最喜欢的小汽车被别的小朋友拿走了，你哭着回了家。']); } },
  // 幼儿园：上了幼儿园、还没上小学（inKg）。入园在满 3 岁那年的 9 月，所以年龄放宽到 2–6 岁
  { id: 'redFlower', a: [2, 6], once: 1, w: () => rural() ? 1.4 : 2, c: inKg, run: () => { eff({ h: 1, so: 1 }); return '在幼儿园得了一朵小红花。回家的路上，你一直举着给每个人看。'; } },
  { id: 'kgSick', a: [2, 6], gap: 2, w: 1.5, c: inKg, run: () => { eff({ hl: -1, h: -1 }); return pick(['幼儿园里流行手足口病，班上停课了一个星期，你也被传上了。', '上了幼儿园以后，三天两头感冒，药就没断过。']); } },
  { id: 'kgCry', a: [2, 5], once: 1, w: 1.5, c: () => !rural() && inKg(), run: () => { eff({ so: 1 }); return '在幼儿园和小朋友抢玩具，被老师罚坐了五分钟。'; } },
  { id: 'zoo', a: [3, 7], once: 1, w: () => rural() ? 0.3 : 1.5, run: () => { eff({ h: 1 }); return pick(['第一次去动物园，看见了大熊猫，它一直在睡觉。', '去海洋馆看了海豚表演，被溅了一身水。']); } },
  { id: 'chicks', a: [2, 7], once: 1, w: () => rural() ? 2 : 0, run: () => { eff({ h: 1 }); return '家里孵了一窝小鸡，你每天蹲在旁边看，给每一只都起了名字。'; } },
  { id: 'grandStory', a: [2, 7], gap: 3, w: () => S.flags.lb || rural() ? 1.5 : 0.8, run: () => { eff({ so: 1, h: 1 }); return `每天晚上，${S.flags.lb === 'both' ? S.flags.carer : chance(0.5) ? '奶奶' : '外婆'}给你讲以前的事。很多年以后，你还记得其中几个。`; } },
  { id: 'cartoon', a: [3, 7], once: 1, w: 1.5, run: () => { eff({ h: 1 }); return `迷上了一部动画片《${pick(['熊出没', '小猪佩奇', '汪汪队立大功', '喜羊羊与灰太狼'])}》，天天要看，看完一集又一集。`; } },
  // 吵架的对象：在世、年纪也还小（3–20 岁）的兄弟姐妹
  { id: 'sibSquabble', a: [3, 12], gap: 2, w: () => sibPals().length ? 1.5 : 0, run: () => { const s = pick(sibPals()); eff({ h: -1, so: 1 }); return `和${s.rel}为了${pick(['一块蛋糕', '遥控器', '谁坐窗边', '一个玩具'])}吵起来，最后两个人都挨了骂。`; } },
  // ---------- 6–14 岁 ----------
  { id: 'redscarf', a: [7, 8], once: 1, w: 2, c: () => !!S.school, run: () => { eff({ h: 1, so: 1 }); return '戴上了红领巾，入了少先队。'; } },
  { id: 'homework', a: [6, 14], gap: 2, w: () => rural() ? 1 : 3, c: () => !!S.school, run: () => { eff({ kn: 2, h: -2 }); return `家长群里，老师又@了你${withWho()}。那天的作业写到晚上十点。`; } },
  { id: 'myopia', a: [7, 16], once: 1, w: 2, run: () => { eff({ hl: -1 }); return { t: '看黑板越来越模糊，配了人生第一副眼镜。', f: '2025年全国儿童青少年总体近视率为49.9%（国家疾控局）' }; } },
  { id: 'classes', a: [7, 15], gap: 2, w: () => !rural() && S.q >= 3 ? 2.5 : 0, run: () => { eff({ kn: 3, h: -3, money: 0 }); return `周末被报了好几个班：${pick(['书法和编程', '英语和奥数', '钢琴和游泳', '画画和跆拳道'])}，比上学还累。`; } },
  { id: 'olympiad', a: [9, 14], once: 1, w: () => S.st.kn > 62 ? 2 : 0, run: () => { eff({ kn: 2, h: 4 }); return { t: '数学竞赛拿了奖。奖状被贴在家里最显眼的那面墙上。', k: 'good' }; } },
  { id: 'bestie', a: [6, 14], once: 1, w: 2, run: () => { eff({ so: 6, h: 3 }); const p = meetPal(); return `交到了一个最好的朋友，叫${p.name}。你们约好以后考同一所高中。`; } },
  // 被欺负：活到 16 岁的人里约三成遇到过（原来约 85%）。人际差的、留守的风险高一些。依据见 DATA.md「校园欺凌」
  { id: 'bully', big: 1, a: [7, 15], once: 1, w: () => (S.st.so < 45 ? 0.3 : 0.1) * (S.flags.lb ? 1.5 : 1), c: () => !!S.school, run: () => { eff({ h: -6, so: -3 }); shape({ n: 0.1, e: -0.05 }); return { t: '在学校被几个同学欺负，你没敢告诉家里。', k: 'bad' }; } },
  { id: 'cadre', a: [7, 14], once: 1, w: () => S.st.kn > 55 ? 2 : 0.8, run: () => { eff({ so: 2, h: 2 }); return `当上了${pick(['班长', '学习委员', '数学课代表', '体育委员'])}。`; } },
  { id: 'phone', a: [10, 14], once: 1, w: 2, run: () => { eff({ h: 2, kn: -1 }); return `有了自己的第一部手机，是${lbWord() || famWord() || '家里人'}换下来的旧手机。`; } },
  { id: 'game', a: [10, 17], once: 1, w: 2, run: () => { eff({ h: 3, kn: -2 }); return { t: `迷上了一款手游。可是防沉迷规定，你只能在周五到周日晚上八点到九点玩。`, f: '2021年起，网络游戏企业只能在周五、周六、周日和法定节假日20时至21时向未成年人提供1小时服务' }; } },
  { id: 'migSchool', a: [6, 7], once: 1, w: () => S.flags.mig ? 10 : 0, c: anyParent, run: () => { eff({ h: -2 }); return { t: `因为没有${S.loc.city}户口，${famWord()}准备了居住证、社保记录、租房合同一大摞材料，才让你在这里上了小学。`, f: '随迁子女在流入地入学，通常需要提供居住证、社保缴纳等证明材料' }; } },
  { id: 'river', a: [6, 13], once: 1, mo: [6, 7, 8], w: () => rural() ? 2 : 0.4, run: () => { eff({ h: 2 }); return { t: '夏天和伙伴偷偷去河里游泳，被大人揪回来狠狠骂了一顿。', f: '溺水是中国中小学生意外死亡的主要原因之一' }; } },
  // 农忙：春天摘茶叶、插秧，五六月收麦子，夏秋摘辣椒，秋天掰玉米
  { id: 'farmHelp', a: [8, 15], gap: 2, mo: [3, 4, 5, 6, 8, 9, 10], w: () => rural() ? 2.5 : 0, run: () => { eff({ hl: 1, so: 1 }); return `农忙时请假回家帮忙${pick(FARM_WORK[calMonth()])}，晒得黢黑。`; } },
  { id: 'snack', a: [6, 11], once: 1, w: 1, run: () => { eff({ h: 2 }); return '放学路过小卖部，用攒下的零花钱买了辣条，和同学分着吃。'; } },
  // 父母吵架：两人都在世、没有离婚，也不是都在外打工（一方在外的少一些，过年回来时吵）。离婚另有状态事件 parentsDiv
  { id: 'parentFight', a: [4, 16], gap: 3, w: () => S.flags.lb === 'both' ? 0 : S.flags.lb ? 0.5 : 1, c: () => bothParents() && !S.flags.parDiv, run: () => { eff({ h: -4 }); return '爸妈又吵架了，你躲在房间里假装写作业。'; } },
  { id: 'parentsDiv', big: 1, a: [1, 17], pm: () => parDivRisk() / 12, c: () => parDivRisk() > 0, run: parentsDivorce },
  // 住校：农村孩子上初中那年的 9 月（按学校日历，状态事件）
  { id: 'boarding', a: [11, 15], once: 1, mo: [9], pm: () => rural() ? 0.85 : 0, c: () => S.school === '初中' && calYear() === S.schoolEnd - 3, run: () => { eff({ so: 2, h: -1 }); return '去镇上读初中，开始住校。每周回家一次，带一罐家里腌的咸菜。'; } },
  // 体育中考在初三下学期：从初三开学（9 月）到 5 月
  { id: 'peTest', a: [13, 15], once: 1, w: 2.5, c: () => S.school === '初中' && (calYear() === S.schoolEnd ? calMonth() <= 5 : calYear() === S.schoolEnd - 1 && calMonth() >= 9), run: () => { eff({ hl: 2 }); return '为了体育中考，每天放学练跳绳和立定跳远。'; } },

  // 童年（2026-10 补充）：小学、初中
  { id: 'sportsDay', a: [7, 13], gap: 3, w: 1.2, c: () => !!S.school, run: () => { eff({ h: 1, hl: 1 }); return pick(['运动会上跑了第三名，领到一个印着「奖」字的笔记本。', '运动会接力赛，你跑最后一棒，被人追上了。全班都没怪你，你还是哭了。', '拔河比赛你们班赢了，手心磨出了水泡。']); } },
  { id: 'chickenpox', a: [5, 10], once: 1, w: 1, run: () => { eff({ hl: -1, h: -1 }); return '出了水痘，脸上身上都是，痒得睡不着，在家休息了两个星期。'; } },
  { id: 'essay', a: [7, 13], once: 1, w: () => S.st.kn > 50 ? 1.5 : 0.6, c: () => !!S.school, run: () => { eff({ h: 1, kn: 1 }); return '作文被老师当成范文在班上念了。你低着头，耳朵都红了。'; } },
  { id: 'pet', a: [6, 13], once: 1, w: 1, run: () => { eff({ h: 1 }); return rural() ? '家里的狗生了一窝小狗，你挑了最小的一只，天天带着它满村跑。' : pick([`软磨硬泡了半年，${withWho()}终于同意养一只小猫。`, '从学校门口买了两只小乌龟，养在脸盆里。']); } },
  // 留守的孩子放假去爸妈打工的城市：暑假、寒假（其余月份写「第一次坐高铁」）
  { id: 'firstTrain', a: [6, 14], once: 1, w: () => S.flags.lb || S.flags.mig ? 2 : 1, run: () => { eff({ h: 1 }); const w = lbWord(), cm = calMonth(); return w && [1, 2, 7, 8].includes(cm) ? `${cm >= 7 ? '暑假' : '寒假'}第一次坐火车，去${w}打工的城市。你趴在窗边看了一路。` : '第一次坐高铁，窗外的房子一闪就过去了。'; } },
  { id: 'fightKid', a: [8, 14], once: 1, w: () => S.sex === 'M' ? 1.2 : 0.4, c: () => !!S.school, run: () => { eff({ h: -2, so: -1 }); return `在学校和同学打了一架，被叫了家长。回家的路上，${withWho()}一句话都没说。`; } },
  { id: 'campSummer', a: [9, 14], once: 1, mo: [7, 8], w: () => !rural() && S.q >= 4 ? 1.5 : 0, run: () => { eff({ so: 1, h: 1 }); return '暑假去了一个星期的夏令营，认识了几个外地的朋友，回来以后还通了一阵子信。'; } },
  { id: 'keyKid', a: [7, 12], once: 1, w: () => !rural() && !S.flags.lb ? 1.2 : 0, c: () => !!S.school && anyParent(), run: () => { eff({ so: 1 }); return `脖子上挂着家里的钥匙，放学自己回家，写完作业等${famWord()}下班。`; } },
  { id: 'newYearShow', a: [6, 12], once: 1, mo: [12, 1], w: 1, c: () => !!S.school, run: () => { eff({ so: 1, h: 1 }); return '元旦晚会上和同学一起表演了节目，脸上被老师涂了两团红胭脂。'; } },
  // ---------- 15–18 岁 ----------
  // 军训：上高中、职高那年的 8 月底或 9 月（按学校日历，状态事件；中考在 6 月，录取以后 S.school 就是高中了）
  { id: 'jxun', a: [13, 18], once: 1, mo: [8, 9], pm: () => 0.42, c: () => (S.school === '高中' || S.school === '职高') && calYear() === S.schoolEnd - 3, run: () => { eff({ hl: 1, so: 2 }); return '开学先是一周军训，晒脱了一层皮。'; } },
  { id: 'crush', a: [13, 17], once: 1, w: 2, c: () => !!S.school, run: () => { eff({ h: 3 }); const c = meetCrush(); return `喜欢上了班里的${c.name}。传的小纸条被班主任没收了。`; } },
  // 高考百日誓师：高考那一年的 2 月底、3 月初（按学校日历，状态事件）。复读的也算
  { id: 'gk100', a: [16, 20], once: 1, mo: [2, 3], pm: () => 0.65, c: () => (S.school === '高中' || S.school === '复读') && calYear() === S.schoolEnd, run: () => { eff({ kn: 2, h: -2 }); return '高考百日誓师大会上，全年级一起喊口号，喊得嗓子都哑了。'; } },
  { id: 'nosleep', a: [16, 17], once: 1, w: 3, c: () => S.school === '高中', run: () => { eff({ hl: -3, kn: 3 }); return '每天早上六点起床，晚自习上到十点半，一天只睡六个小时。'; } },
  { id: 'vocIntern', a: [16, 17], once: 1, w: 4, c: () => S.school === '职高', run: () => { eff({ hl: -2, money: 3000 }); return '学校安排去工厂“实习”，在流水线上一站就是十个小时。'; } },

  // ---------- 大学 ----------
  { id: 'dorm', a: [18, 22], once: 1, w: 3, c: () => ['本科', '大专'].includes(S.school), run: () => { eff({ so: 5, h: 3 }); return '大学宿舍住了六个人，来自五个省。熄灯后的卧谈会能聊到凌晨。'; } },
  { id: 'cet', a: [18, 21], once: 1, w: 2, c: () => S.school === '本科', run: () => { eff({ kn: 2 }); return chance(0.6) ? '大学英语四级一次就过了。' : '大学英语四级考了两次才过。'; } },
  { id: 'parttime', a: [18, 22], once: 1, w: 2, c: () => ['本科', '大专'].includes(S.school), run: () => { eff({ money: 4000, so: 1 }); return `周末去${pick(['做家教', '发传单', '奶茶店打工', '商场做促销'])}，赚点生活费。`; } },
  { id: 'major', a: [18, 19], once: 1, w: 10, c: () => ['本科', '大专'].includes(S.school) && !S.flags.major, run: () => { S.flags.major = S.school === '大专' ? pick(['护理', '电子商务', '会计', '机械工程', '计算机', '师范教育']) : pick(MAJORS); return `你的专业是${S.flags.major}。`; } },

  // ---------- 工作与生活 ----------
  { id: 'firstRent', a: [18, 32], once: 1, w: 3, c: () => isWorking() && !rural() && !S.house, run: () => { eff({ h: -1 }); return `第一次自己租房。${S.loc.kind === 'big' ? '城中村的单间，窗户对着隔壁楼的墙。' : '老小区的一间次卧，和陌生人合租。'}`; } },
  { id: 'overtime', a: [22, 45], gap: 2, w: () => ['tech', 'clerk', 'engineer', 'sales'].includes(S.job) ? 3 : 0, run: () => { eff({ hl: -4, h: -3, money: placeInc() * 0.1 }); return vary('overtime', ['连续加了一个月的班。项目上线那天，你在工位上睡着了。', '凌晨一点，工作群里还在@你。你回了一句「收到」，关灯躺下，又爬起来改了一版。', '周末也在加班。楼下的保安都认识你了，见面就说「又来了」。', '年底冲业绩，连着三个周末没休。体检的时候医生问你最近是不是睡得很少。']); } },
  { id: 'riderRain', a: [16, 60], gap: 3, w: () => S.job === 'rider' ? 4 : 0, run: () => { eff({ hl: -2, h: -2 }); return vary('riderRain', ['下暴雨的晚上订单最多。你在积水里骑了四个小时，超时一单就被扣钱。', '一个顾客给了你差评，说汤洒了。那一单白跑了，还扣了五十。', '电梯坏了，你提着外卖爬上二十七楼。开门的人说了声谢谢，还给了你一瓶水。', '平台又改了算法，同样跑一天，到手少了一百多。']); } },
  { id: 'gigExit', a: [20, 58], gap: 2, w: () => ['rider', 'driver'].includes(S.job) && S.jobY >= 2 ? 2 : 0, run: () => { const was = JOBS[S.job].n; hireInCity(wpick({ factory: 2, sales: 2, clerk: S.edu >= 5 ? 2 : 0.5, shop: 1, skilled: S.edu === 4 ? 2 : 0.3 })); return `做了几年${was}，换成了${JOBS[S.job].n}。`; } },
  { id: 'factoryLine', a: [16, 60], gap: 3, w: () => ['factory', 'migrant'].includes(S.job) ? 3 : 0, run: () => { eff({ hl: -2, money: placeInc() * 0.05 }); return vary('factoryLine', ['旺季每天上十二个小时的班，宿舍八个人一间。', '流水线换了新机器，班组里裁了三个人。你被留了下来，一个人干两个人的活。', '这个月加班多，工资条上的数字是平时的一倍半。你给家里转了一半。', '夜班上到第三个星期，白天怎么也睡不着。']); } },
  { id: 'buildSite', a: [16, 65], gap: 3, w: () => S.job === 'build' ? 3 : 0, run: () => { eff({ hl: -3 }); if (chance(0.05)) { eff({ hl: -10, money: -placeInc() * 0.3 }); return { t: '在工地上从脚手架摔下来，腿骨折了，躺了三个月。', k: 'bad' }; } return '工程结束，包工头拖了三个月才把工钱结清。'; } },
  { id: 'blind', a: [23, 42], gap: 1, c: single, w: () => S.age >= 27 ? 1.5 : 0.6, run: () => { eff({ h: -1 }); return '被家里安排去相亲。在咖啡馆坐了一个小时，对方问的全是收入和房子。'; } },
  // 催婚：过年时（1–2 月，状态事件）。在谈恋爱的、丧偶不到一年的不问；人在老家的是「走亲戚」，不是「回家」
  { id: 'urge', a: [25, 40], gap: 2, mo: [1, 2], pm: () => URGE_PM, c: () => !S.fam.married && !S.fam.dating && !(S.flags.widowed != null && S.age - S.flags.widowed <= 1), run: () => { eff({ h: -3 }); return `${awayFromHome() ? '过年回家' : '过年走亲戚'}，七大姑八大姨轮流问：“有对象了吗？什么时候结婚？”`; } },
  { id: 'dateTrip', a: [18, 50], gap: 2, w: 1.2, c: () => !!S.fam.dating, run: () => { const d = S.fam.dating; d.love = clamp(d.love + 6, 0, 100); eff({ h: 3, money: -placeInc() * 0.04 }); return { t: `和${d.name}去${pick(['厦门', '大理', '成都', '青岛', '西安', '桂林'])}玩了几天。${d.city !== S.loc.city ? '难得见一次面。' : ''}`, k: 'good' }; } },
  { id: 'dateFight', a: [18, 50], gap: 2, w: () => S.fam.dating && S.fam.dating.fit < 0.5 ? 1.5 : 0.6, c: () => !!S.fam.dating, run: () => { const d = S.fam.dating; d.love = clamp(d.love - 8, 0, 100); eff({ h: -3 }); return pick([`和${d.name}为了一件小事吵了一架，冷战了一个星期。`, `${d.name}嫌你回消息太慢，吵了一架。`, `${d.name}说你从来不考虑你们的以后。`]); } },
  // 份子钱：有单位的写同事结婚，其余写朋友
  { id: 'redEnv', a: [22, 70], gap: 4, w: 1, run: () => { const x = ri(2, 10) * 100; eff({ money: -x * ri(2, 5) }); return vary('redEnv', [`这一年随了好几份份子钱，${unitJob() ? '同事' : '朋友'}结婚、亲戚家孩子考上大学，每份${x}元。`, `五月到十月，几乎每个月都有一场婚礼。随出去的份子，加起来快有一个月的工资。`, `一个多年不联系的老同学发来请帖。你想了半天，还是转了${x}元。`, `亲戚家办满月酒，你包了${x}元。回来的路上算了算，这几年随出去的，大概是收不回来了。`]); } },
  // 私企岗位（销售、职员、程序员、工程师）改成先听到风声、再决定怎么应对：抉择 layofflist（turns.ts）
  // 这个年龄年里刚升过职的不裁
  { id: 'layoff', big: 1, a: [20, 60], gap: 4, w: () => isWorking() && !JOBS[S.job].priv ? JOBS[S.job].risk * 4 : 0, c: () => S.done.promo !== S.age, run: () => {
      const boss = ['boss', 'shop'].includes(S.job), comp = boss ? 0 : severance();
      quitJob(); eff({ h: -8, money: comp });
      return boss ? { t: '生意越来越难做，最后关了门。', k: 'bad' }
        : { t: `公司裁员，名单上有你。按工龄拿到了${wan(comp)}的经济补偿，工资发到离职那天为止。`, k: 'bad', f: '劳动合同法：经济补偿按在本单位工作的年数，每满一年支付一个月工资；没有提前30天通知的，再多付一个月（俗称“N+1”）' };
    } },
  // 升职：有单位的工作，这个年龄年里刚入职的、被裁过的不升。涨工资统一用 raise（越接近上限涨得越少）
  { id: 'promo', a: [25, 58], gap: 4, w: () => unitJob() ? 1.8 : 0, c: () => unitJob() && !newJob() && S.done.layoff !== S.age, run: () => { raise(RAISE.promo); eff({ h: 4 }); return { t: PROMO_T[S.job] || '升职加薪了。', k: 'good' }; } },
  // 炒股：在单位上班的跟着同事，其余跟着朋友、老同事
  { id: 'stock', a: [25, 65], gap: 5, w: 1, c: () => S.money > placeInc() * 0.5, run: () => { const g = gauss(-0.05, 0.25), x = S.money * 0.3 * g, who = unitJob() ? '同事' : isWorking() ? '朋友' : '老同事'; eff({ money: x, h: g > 0 ? 2 : -3 }); return g > 0 ? `跟着${who}买了股票，赚了${wan(x)}。` : `跟着${who}买了股票，亏了${wan(-x)}。`; } },
  { id: 'car', a: [25, 55], once: 1, w: 1.5, c: () => S.money > placeInc() * 1.2, run: () => { eff({ money: -placeInc() * 1.0, h: 3 }); return `买了一辆${chance(0.6) ? '新能源车' : '二手车'}，${awayFromHome() ? '过年终于可以自己开车回家了' : '周末终于可以开车出去转转了'}。`; } },
  // 旅游：按月份写是哪个假期
  { id: 'travel', a: [20, 75], gap: 4, w: 1, c: () => S.money > 0, run: () => { eff({ h: 3, money: -placeInc() * 0.08 }); const go = `${HOLIDAY[calMonth()]}去${pick(['西安', '三亚', '大理', '重庆', '青岛', '张家界', '哈尔滨', '桂林', '敦煌', '厦门'])}`;
    return vary('travel', [`${go}旅游，景区人山人海，看人比看风景多。`, `${go}玩了几天。拍了几百张照片，回来以后一张也没再看过。`, `${go}。在一家小馆子里吃到了这辈子吃过最好吃的一碗面，后来再也没找到那家店。`, `${go}，赶上下雨，在酒店里躺了两天。倒也挺好。`, `${go}，${S.fam.married ? '和另一半' : '一个人'}看了一场日出。`]); } },
  // 春运回家：1–2 月（状态事件），在外省、父母还有人在、没有跟你住在一起
  { id: 'springHome', a: [18, 60], gap: 3, mo: [1, 2], pm: () => SPRING_PM, c: () => S.loc.p !== S.home.p && !S.flags.parWithMe && anyParent(), run: () => { eff({ h: 2, so: 2 }); return `春运抢票抢了三天，坐了${ri(6, 30)}个小时的车回家过年。`; } },
  { id: 'smoke', a: [15, 40], once: 1, w: () => S.sex === 'M' ? 1.6 : 0.1, run: () => { S.flags.smoke = 1; eff({ hl: -3 }); return { t: S.age < 18 ? '和几个同学躲在厕所里学会了抽烟。' : S.age < 22 ? '开始抽烟了。宿舍里的人都抽，你也跟着抽上了。' : '开始抽烟了。一开始是应酬时别人递过来的。', f: '中国成年男性的吸烟率远高于女性' }; } },
  { id: 'quitSmoke', a: [30, 75], once: 1, w: 0.8, c: () => !!S.flags.smoke, run: () => { S.flags.smoke = 0; eff({ hl: 3 }); return { t: '戒烟了。试了好几次，这次终于成功。', k: 'good' }; } },
  { id: 'drink', a: [22, 55], gap: 4, w: () => ['sales', 'boss', 'civil'].includes(S.job) ? 2 : 0.3, run: () => { eff({ hl: -2 }); return vary('drink', ['饭局上被一轮轮敬酒，喝到吐。', '酒桌上领导说「感情深，一口闷」。你闷了，第二天头疼了一整天。', '陪客户喝到半夜，打车回家，在楼下坐了半个小时才上楼。', '体检说你有脂肪肝。你看着报告，想起这几年喝过的酒。']); } },
  { id: 'low', a: [14, 70], gap: 6, w: () => S.st.h < 40 ? 2 : 0.15, run: () => { eff({ h: -3 }); if (chance(0.15)) { eff({ h: 8 }); return { t: '有一段时间每天都很累，什么都不想做。后来你去医院看了心理科，慢慢好了一些。', f: '中国抑郁障碍患者中，一年内接受过任何治疗的不到一成（Lancet Psychiatry 2021）。全国心理援助热线：12356' }; } return { t: '有一段时间每天都很累，什么都不想做，觉得一切都没有意义。你没有告诉任何人。', k: 'bad', f: '全国心理援助热线：12356' }; } },
  // 离婚：状态事件，风险见上面的 divorceRisk（每个月取年风险的 1/12）。月初排进来、月中才发生，c 在发生时再查一次（这个月里刚怀上的不离）
  { id: 'divorce', big: 1, a: [20, 100], pm: () => divorceRisk() / 12, c: canDivorce, run: () => { const p = S.fam.partner; S.fam.married = false; S.fam.partner = null; S.flags.divorced = S.age; addDoc('divorce', '离婚证', [['对方', p.name]]); eff({ h: -8, so: -4, money: -Math.max(0, S.money) * 0.4 }); return { t: `你和${p.name}离婚了。`, k: 'bad', f: '2023年全国离婚360.5万对，其中民政部门登记259.3万对，其余为法院判决或调解' }; } },
  { id: 'kidSchool', a: [28, 55], gap: 3, w: 2, c: () => kidsAlive().some(k => k.age >= 6 && k.age <= 17), run: () => { eff({ h: -2, money: -placeInc() * 0.1 }); return pick(['为了孩子上学，研究学区、排队报名，跑了好几趟。', '每天晚上辅导孩子写作业，气得血压都上来了。', '孩子的家长群一天几百条消息。']); } },
  { id: 'reunion', a: [30, 60], gap: 10, w: 1, run: () => { eff({ so: 2, h: S.relInc > 0 ? 2 : -2 }); return vary('reunion', ['同学聚会。有人开着好车来，有人没来。大家聊着聊着，就开始聊房子和孩子。', '同学聚会，当年的班长致辞，说「二十年了，大家都没怎么变」。所有人都笑了。', '同学聚会上，有人提起了已经不在的一位同学。桌上安静了一会儿，又有人举起了杯子。', '同学聚会，回了一趟母校。教学楼翻新了，你们的教室变成了实验室。']); } },
  { id: 'scam', a: [25, 90], gap: 8, w: () => S.age > 60 ? 1.5 : 0.5, c: () => S.money > 0, run: () => { const x = Math.min(S.money * 0.3, placeInc() * (S.age > 60 ? 0.5 : 0.3)); eff({ money: -x, h: -4 }); return { t: S.age > 60 ? vary('scamOld', [`听了几次“健康讲座”，买了${wan(x)}的保健品。`, `有人上门推销“磁疗床垫”，说能治腰疼。你买了一张，花了${wan(x)}。`, `一个说是“老战友的儿子”的人打来电话借钱，你转了${wan(x)}。后来才知道是骗子。`]) : vary('scam', [`接到自称“公检法”的电话，被骗走了${wan(x)}。`, `在网上碰到一个“稳赚不赔”的投资群，投进去${wan(x)}，群第二天就解散了。`, `网购退款，对方让你下载一个软件。卡里的${wan(x)}没了。`]), k: 'bad' }; } },
  { id: 'visitHome', a: [22, 60], gap: 3, w: () => farFromParents() && anyParent() ? 2 : 0, run: () => { const w = parentsWord(); eff({ so: 2, h: 1 }); return vary('visitHome', [`坐高铁回老家看${w}。${ta(w)}老了很多，饭桌上的菜却还是你小时候爱吃的。`, `请了几天假回去看${w}。走的时候，${ta(w)}往你的行李箱里塞满了吃的，拉都拉不上。`, `回老家住了一个星期。第三天就开始吵架，最后一天又舍不得走。`, `回去看${w}，发现家里的灯泡坏了好几个，${ta(w)}一直没说。你一个个换好了。`]); } },
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
  // ---------- 兄弟姐妹 ----------
  { id: 'sibWed', a: [8, 75], w: 2.5, c: () => !!sibToWed() && (S.fam.mom.alive || S.fam.dad.alive), run: sibWed },
  // ---------- 老年 ----------
  { id: 'dance', a: [50, 85], once: 1, w: () => S.sex === 'F' ? 3 : 0.8, c: () => S.job === 'retired' || S.age > 58, run: () => { eff({ so: 5, hl: 2, h: 3 }); return '加入了小区的广场舞队，每天晚上七点准时出现。'; } },
  { id: 'grandcare', a: [50, 80], gap: 4, w: 2, c: () => kidsAlive().some(k => k.gk), run: () => { eff({ so: 3, hl: -1, h: 2 }); return '帮子女带孙辈，每天接送上学、做饭，比上班还忙。'; } },
  { id: 'phoneOld', a: [60, 85], once: 1, w: 1.5, run: () => { eff({ h: 2 }); return '学会了用手机视频通话和扫码付款，还加了好几个老同学群。'; } },
  { id: 'oldFriend', a: [65, 105], gap: 5, w: 2, run: () => { eff({ so: -3, h: -4 }); return vary('oldFriend', ['一个认识了几十年的老朋友走了。', '以前一起下棋的老张走了。公园的石桌边上，少了一个人。', '老同事打来电话，说又有一个人走了。你挂了电话，在窗前站了很久。']); } },
  { id: 'hosp', a: [65, 105], gap: 3, w: 1.5, run: () => { eff({ hl: -3, money: -hospOop() }); return `因为${pick(['肺炎', '摔跤骨折', '心律不齐', '白内障手术'])}住了一次院。`; } },
  { id: 'pensionUp', a: [63, 105], gap: 5, w: 1, c: () => S.job === 'retired', run: () => { S.pension *= 1.05; return '养老金又涨了一点。'; } },
  // ---------- 格子放在哪，就多遇到哪一类事（权重低，格子所在领域乘上 domK 才常见，见 EV_DOM 和 focus.ts） ----------
  { id: 'workTrip', a: [22, 60], gap: 3, w: 0.5, c: () => isWorking() && !['farmer', 'retired'].includes(S.job), run: () => { eff({ hl: -1, h: -1 }); return vary('workTrip', ['出差了半个月，在酒店里吃了十几顿外卖。', '跟着领导去外地谈项目，酒桌上替他挡了三杯酒。', '第一次一个人出差，在高铁上把方案改了三遍。']); } },
  { id: 'workClash', a: [22, 60], gap: 4, w: 0.4, c: () => isWorking(), run: () => { eff({ h: -3, so: -1 }); return vary('workClash', ['和同事因为一个方案吵了起来，之后在电梯里遇到都不说话。', '领导当着全组的面批评你的报告。你回到座位上，盯着屏幕看了很久。', '被客户投诉了一次。你写了三页的情况说明，没人看。']); } },
  { id: 'workPraise', a: [22, 60], gap: 4, w: 0.4, c: () => isWorking(), run: () => { eff({ h: 3, so: 1 }); return { t: vary('workPraise', ['你做的项目拿了年度奖。奖金不多，奖杯摆在了工位上。', '新来的同事说，进来之前就听说过你。', '年终总结会上，领导拿你的事当了例子。']), k: 'good' }; } },
  { id: 'famKid', a: [24, 60], gap: 3, w: 0.5, c: () => kidsAlive().some(k => k.age >= 3 && k.age < 13), run: () => { eff({ h: 3, so: 1 }); return vary('famKid', ['周末带孩子去公园放风筝。线断了，风筝飞走了，孩子笑得比放起来还开心。', '陪孩子写作业到十点，一道题讲到第三遍，你自己先急了。', '孩子学校开运动会，你请了假去当啦啦队，嗓子喊哑了。']); } },
  { id: 'famParents', a: [28, 65], gap: 3, w: 0.5, c: () => bothParents() && !S.flags.parDiv, run: () => { eff({ h: 2, so: 1 }); return vary('famParents', ['带爸妈去做了一次全面体检，排了一上午的队。爸爸一直说「花这个钱干什么」。', '周末陪妈妈去逛菜市场，她跟每个摊主都介绍「这是我孩子」。', '给爸妈换了一台大电视，遥控器教了三遍。']); } },
  { id: 'famHome', a: [24, 85], gap: 3, w: 0.4, c: () => S.fam.married && !!S.fam.partner && S.fam.partner.alive, run: () => { eff({ h: 3 }); return vary('famHome', ['一家人难得在家吃了一顿晚饭，谁都没看手机。', `结婚纪念日，你和${S.fam.partner.name}回到了第一次约会的那家店。店还在，老板换了。`, `周末和${S.fam.partner.name}把家里大扫除了一遍，翻出了结婚时的照片，看了一下午。`]); } },
  { id: 'halfMara', a: [20, 60], once: 1, w: 0.3, run: () => { eff({ hl: 2, h: 4 }); return { t: '跑完了人生第一个半程马拉松。到终点的时候，腿已经不是自己的了。', k: 'good' }; } },
  { id: 'keepFit', a: [18, 75], gap: 4, w: 0.4, run: () => { eff({ hl: 2, h: 1 }); return vary('keepFit', ['办的健身卡，这次居然坚持了一整年。', '每天晚饭后绕着小区走一万步，保安都认识你了。', '体检的时候，几项指标都比去年好了。']); } },
  { id: 'hobbyDeep', a: [16, 85], gap: 3, w: 0.4, run: () => { eff({ h: 3 }); return vary('hobbyDeep', ['周末都泡在自己的爱好上，家里堆满了相关的东西。', '在网上找到了一群同好，约好每个月见一次面。', '花了半年做成的一件东西发到网上，有几百个人点了赞。']); } },
  { id: 'friendsNight', a: [16, 80], gap: 2, w: 0.4, run: () => { eff({ so: 2, h: 2, hl: -1 }); return vary('friendsNight', ['和几个朋友吃火锅吃到半夜，聊的都是十年前的事。', '朋友失恋了，你陪着喝到凌晨三点。', '几个朋友组了个周末爬山的群，坚持了两个月就散了。']); } },
  // ---------- 少见的大事：一辈子碰上的人不多，碰上了就是人生大事（权重是估计，一生里各约百分之一到几） ----------
  { id: 'lottery', big: 1, a: [25, 75], once: 1, w: 0.02, run: () => { const x = Math.round(placeInc() * ri(3, 8) / 1e3) * 1e3; eff({ money: x, h: 8 }); return { t: `随手买的彩票中了二等奖，税后到手${wan(x)}。你把彩票复印了一份，原件锁进了抽屉，好几天没睡好觉。`, k: 'good' }; } },
  { id: 'hero', big: 1, a: [16, 65], once: 1, mo: [6, 7, 8], w: 0.04, run: () => { eff({ so: 8, h: 6, hl: -2 }); return { t: `在河边跳下去，救起了一个落水的孩子。本地新闻播了你的名字，${isWorking() ? '单位给你发了一面锦旗' : '居委会给你送了一面锦旗'}。孩子的家长每年过年都来看你。`, k: 'good' }; } },
  { id: 'viral', big: 1, a: [18, 55], once: 1, w: 0.05, run: () => { eff({ h: 5, so: 4 }); return { t: `随手拍的一段视频火了，一夜之间涨了二十多万粉丝，评论区里全是陌生人。一个月以后，热度就过去了，你还是你。`, k: 'good' }; } },
  { id: 'crash', big: 1, a: [18, 80], once: 1, w: 0.05, run: () => { eff({ hl: -18, h: -8, money: -placeInc() * 0.3 }); return { t: `过马路的时候被一辆闯红灯的车撞了，在医院躺了三个月。出院那天，你走得很慢，觉得外面的阳光特别刺眼。`, k: 'bad' }; } },
  { id: 'star', a: [25, 60], once: 1, w: 0.05, c: () => S.edu >= 1, run: () => { eff({ h: 2 }); return `电视上出现了一张熟悉的脸：初中坐在你后排的那个同学，现在成了演员。你跟身边的人说「我认识他」，没人信。`; } },
  // ---------- 回响：前面出现过的人和选择（content/echoes.ts） ----------
  ...ECHO_EVENTS,
];
// 过年的状态事件每个月（1 月、2 月）的概率
const LB_SPRING_PM = 0.18, URGE_PM = 0.5, SPRING_PM = 0.25;
// 农忙的活（按公历月份）
const FARM_WORK = { 3: ['摘茶叶'], 4: ['摘茶叶', '插秧'], 5: ['插秧', '收麦子'], 6: ['收麦子', '插秧'], 8: ['摘辣椒'], 9: ['掰玉米', '摘辣椒'], 10: ['掰玉米', '收稻子'] };
// 旅游放的是哪个假（按公历月份）
const HOLIDAY = { 1: '春节假期', 2: '春节假期', 3: '请了几天年假', 4: '五一假期', 5: '五一假期', 6: '端午假期', 7: '夏天请了年假', 8: '夏天请了年假', 9: '国庆假期', 10: '国庆假期', 11: '请了几天年假', 12: '元旦假期' };
/** 一起玩、会吵架的兄弟姐妹：在世，3–20 岁 */
const sibPals = () => sibsAlive().filter(s => s.age >= 3 && s.age <= 20);

export const EVMAP = {};
// 事件属于哪个领域：格子放在这个领域上，这类事更容易抽到（focus.ts 的 domK），好事坏事一起多
export const EV_DOM: Record<string, string> = {
  homework: 'study', olympiad: 'study', cadre: 'study', essay: 'study', cet: 'study', nosleep: 'study', myopia: 'study',
  workTrip: 'work', workClash: 'work', workPraise: 'work', famKid: 'family', famParents: 'family', famHome: 'family',
  halfMara: 'health', keepFit: 'health', hobbyDeep: 'leisure', friendsNight: 'social',
  game: 'leisure', pet: 'leisure', snack: 'leisure', campSummer: 'leisure', river: 'leisure', travel: 'leisure', dance: 'leisure', phoneOld: 'leisure', viral: 'leisure',
  bestie: 'social', fightKid: 'social', dorm: 'social', reunion: 'social', redEnv: 'social', newYearShow: 'social', oldFriend: 'social', palMid: 'social', crushMeet: 'social', bulliedMeet: 'social', star: 'social',
  sportsDay: 'health', peTest: 'health', checkup: 'health', quitSmoke: 'health',
  overtime: 'work', promo: 'work', drink: 'work', factoryLine: 'work', buildSite: 'work', riderRain: 'work', parttime: 'work', palCall: 'work',
  crush: 'love', blind: 'love', dateTrip: 'love', dateFight: 'love',
  visitHome: 'family', kidSchool: 'family', grandcare: 'family', sibWed: 'family', echoLego: 'family', echoLb: 'family',
};
EVENTS.forEach(e => { EVMAP[e.id] = e; });
