// 回响：前面出现过的人、做过的选择，后面再回来（见 AGENTS.md「回响」）。
// · 人：发小（bestie 事件里认识）、初恋（kidCrush / crush 里喜欢上的那个人）、小时候被欺负的那个同学。名字和去向记在 S.ppl；
// · 选择：童年小抉择（S.flags.kid）、走过的岔路口（S.forks），过了几十年在时间线上被提起。
// 回响事件和一般的随机事件一样排进每年的位置（schedule.ts），权重高一些，到了年龄窗口多半会遇到。
// 发小那条线里有两个真正的岔路口：拉你合伙创业（venture）、找你借钱（palloan），放在 ECHO_DEC 里，由 decisions.ts 并进 DEC。
import type { Sex } from '../types';
import { S } from '../state';
import { chance, clamp, pick, ri, wpick } from '../rng';
import { makeName } from '../names';
import { eff } from '../stats';
import { wan } from '../format';
import { placeInc } from '../place';
import { kidsAlive } from '../family';
import { WHY_N, makePartner, type Love } from '../romance';
import { hire, isWorking, quitJob } from '../career';
import { farFromParents } from '../place';
import { bothParents, parentsWord } from '../parents';
import { grownClose } from '../actions';

/** 一个反复出现的人。close：和你的亲疏（0–100）；fate：这个人这一生大概会怎么走 */
export interface Pal {
  name: string; sex: Sex; at: number; close: number; alive: boolean;
  fate?: 'home' | 'big' | 'rich' | 'down' | 'abroad';
  city?: string; gao?: boolean;            // 发小去了哪座城市；中考上没上普通高中
  single?: boolean;                        // 初恋：同学聚会时还是一个人
  venture?: 'boom' | 'meh' | 'bust';       // 发小拉你创业，那家公司后来怎么样了（你去没去都一样）
  loan?: { amt: number; at: number; back: number | null }; // 借给发小的钱：几岁借的、几岁还（null 不还）
}
declare module '../types' {
  interface Life { ppl?: { pal?: Pal; crush?: Pal; bullied?: Pal } }
}

const ta = (p: Pal) => p.sex === 'M' ? '他' : '她';
const BIG_CITIES = ['深圳', '上海', '北京', '杭州', '广州', '成都'];
const HOME_JOBS = ['进了县城的银行', '回镇上的中学当了老师', '考进了老家的派出所', '在老家开了一家小超市', '进了县城的电厂'];
const ppl = () => (S.ppl ||= {});
const person = (sex: Sex): Pal => ({ name: makeName(sex, chance(0.92) ? '汉族' : S.eth).full, sex, at: S.age, close: 60, alive: true });
const kidPick = (id: string) => S.flags.kid && S.flags.kid[id];
/** 一辈子在某一项上放了多少格·年（focus.ts 的 S.fy） */
const fy = (k: string) => (S.fy && S.fy[k]) || 0;
// 回响和人生标签的门槛：比自动分配下九成的人生都高（活过 60 岁的人生里：工作 p90 约 26、家人 37、爱好 21、运动加养身体约 50、朋友 33）
export const FY = { work: 32, family: 42, hobby: 25, health: 58, friends: 38 };

// ===== 认识的人 =====
/** 交到最好的朋友（events.ts 的 bestie）：多半同性。这个人以后大概会怎么走，现在就定下 */
export function meetPal() {
  const p = person(chance(0.85) ? S.sex : S.sex === 'M' ? 'F' : 'M');
  p.close = 55;
  p.fate = wpick([['home', 3], ['big', 3], ['rich', 1.2], ['down', 1.5], ['abroad', 0.5]]);
  p.city = p.fate === 'big' || p.fate === 'rich' ? pick(BIG_CITIES) : null;
  p.gao = chance(0.62);
  ppl().pal = p;
  return p;
}
/** 喜欢上的那个人（kidCrush 抉择、crush 事件）：异性，只认第一个 */
export function meetCrush() {
  const P = ppl();
  return P.crush ||= person(S.sex === 'M' ? 'F' : 'M');
}

// ===== 回响事件 =====
const pal = () => S.ppl?.pal?.alive ? S.ppl.pal : null;
const married = () => S.fam.married && !!S.fam.partner && S.fam.partner.alive;
const justMarried = () => married() && S.age - S.fam.partner.marriedAt <= 1;
const taL = (l: Love) => l.sex === 'M' ? '他' : '她';
// 分开至少 y 年的前任（没和你结过婚的）
const ex = (y: number) => (S.loves || []).find(l => l.kind === 'love' && l.end != null && l.wed == null && S.age - l.end >= y);
// 因为外面的事分开、至少五年的前任
const exOut = () => (S.loves || []).find(l => l.kind === 'love' && l.end != null && l.wed == null && ['ldr', 'parents', 'house', 'wait'].includes(l.why) && S.age - l.end >= 5);
// 没选的人，至少五年前
const missed = () => (S.loves || []).find(l => l.kind === 'missed' && S.age - l.at >= 5);
// 一个人：离了婚、丧偶的，或者三十五岁以后一直没结婚的
const alone = () => !S.fam.married && !S.fam.dating && !S.cand && (S.flags.divorced != null || S.flags.widowed != null || S.age >= 35 && !S.fam.partner);
/** 把一个抉择排在稍后：回响事件引出的岔路口。快到年底的就排在当下（不能排到现在之前：原来封顶 0.999，
 *  一年最后一刻发生的事会把抉择排进过去，真实游玩时马上弹出、重放时却停在它前面，重放对不上） */
function soon(id: string) {
  const at = S.t + 0.005 <= 0.999 ? S.t + 0.005 : S.t;
  let i = S.queue.length; while (i > 0 && S.queue[i - 1].at > at) i--;
  S.queue.splice(i, 0, { at, type: 'dec', id });
}

export const ECHO_EVENTS: any[] = [
  // ---- 发小 ----
  // 中考那年：约好的同一所高中
  { id: 'palZk', a: [15, 17], once: 1, w: 8, c: () => !!pal() && S.done.dec_zhongkao != null && S.age - S.done.dec_zhongkao <= 1, run: () => {
    const p = pal(), me = S.school === '高中';
    if (me && p.gao) { p.close += 10; eff({ h: 2 }); return `你和${p.name}真的考上了同一所高中。开学那天，你们在校门口拍了一张合照。`; }
    if (me) { p.close -= 10; return `${p.name}没考上高中，去了技校。约好的同一所高中，只剩你一个人去了。`; }
    if (p.gao) { p.close -= 15; eff({ h: -2 }); return `${p.name}考上了高中。开学前${ta(p)}说「周末回来找你玩」。后来周末越来越少。`; }
    p.close += 5; return `你和${p.name}都没读高中。那个夏天，你们天天骑着车在镇上转，谁也不提以后。`;
  } },
  // 各奔东西
  { id: 'palApart', a: [19, 27], once: 1, w: 3, c: () => !!pal(), run: () => {
    const p = pal();
    if (p.fate === 'home') { p.close += 5; return `${p.name}${pick(HOME_JOBS)}。每次你回老家，${ta(p)}都骑着电动车去车站接你。`; }
    if (p.fate === 'abroad') { p.close -= 20; return `${p.name}出国了。时差八个小时，你们约好的视频总是对不上时间。`; }
    if (p.fate === 'down') { p.close -= 5; return `${p.name}换了好几份工作，每份都干不长。你们喝酒的时候，${ta(p)}总说「再等等，机会就来了」。`; }
    p.close -= 12;
    return `${p.name}去了${p.city}。你们的聊天记录，从每天几十条，变成了逢年过节的一句「新年快乐」。`;
  } },
  // 你的婚礼
  { id: 'palWed', a: [20, 60], once: 1, w: 12, c: () => !!pal() && justMarried() && ['farm', 'hotel'].includes(S.fam.partner.wedHow), run: () => {
    const p = pal(), role = p.sex === S.sex ? (S.sex === 'M' ? '伴郎' : '伴娘') : '证婚的朋友';
    if (p.close >= 45) { p.close += 5; eff({ h: 2, so: 2 }); return `${p.name}特意从${p.city || '老家'}赶回来当你的${role}，敬酒的时候喝得比你还多。`; }
    eff({ h: -1 }); return `婚礼前给${p.name}发了请帖。${ta(p)}说实在走不开，转了一个大红包，附了一句「一定幸福」。`;
  } },
  // 发小发达了：拉你一起干（引出抉择 venture）
  { id: 'palCall', a: [26, 45], once: 1, w: 4, c: () => !!pal() && pal().fate === 'rich' && isWorking() && S.indep, run: () => {
    const p = pal(); soon('venture');
    return `很久没联系的${p.name}突然打来电话，聊了一个多小时。挂电话之前，${ta(p)}说：「我在${p.city}有个项目，想拉你一起干。」`;
  } },
  // 当年没去的那家公司，后来怎么样了
  { id: 'palNews', a: [30, 60], once: 1, w: 6, c: () => !!pal()?.venture && S.flags.ventureNo != null && S.age - S.flags.ventureNo >= 3, run: () => {
    const p = pal();
    if (p.venture === 'boom') { eff({ h: -3 }); return { t: `${p.name}的公司做起来了，在${p.city}买了一套大房子。同学群里都在恭喜${ta(p)}。你有时会想：当年要是跟着去了……`, x: 1 }; }
    if (p.venture === 'bust') { eff({ h: 1 }); return `${p.name}的公司倒了，听说欠了不少钱。你庆幸当年没去，心里又有点说不出的滋味。`; }
    return `${p.name}的公司不温不火地开着，前几年说要上市，后来再也没提。`;
  } },
  // 发小过得不好：找你借钱（引出抉择 palloan）
  { id: 'palBroke', a: [30, 58], once: 1, w: 3, c: () => !!pal() && pal().fate === 'down' && S.indep && S.money > placeInc() * 0.3, run: () => {
    const p = pal(); soon('palloan');
    return `${p.name}打来电话，东拉西扯了半天，最后吞吞吐吐地说出了来意。`;
  } },
  // 借出去的钱
  { id: 'palRepay', a: [30, 80], once: 1, w: 10, c: () => { const l = pal()?.loan; return !!l && l.back != null && S.age >= l.back; }, run: () => {
    const p = pal(), l = p.loan; eff({ money: l.amt, h: 3 }); p.close += 10;
    return { t: `${p.name}把当年借的${wan(l.amt)}还上了，还拎了两瓶酒来。「那时候要不是你……」${ta(p)}没说完，你们就碰了杯。`, k: 'good' };
  } },
  { id: 'palNoRepay', a: [36, 85], once: 1, w: 4, c: () => { const l = pal()?.loan; return !!l && l.back == null && S.age - l.at >= 6; }, run: () => {
    const p = pal(); p.close -= 10; eff({ h: -2 });
    return `${p.name}再也没提过那笔钱。你也没再问。过年的时候${ta(p)}照样发来祝福，你照样回一句「同乐」。`;
  } },
  // 中年
  { id: 'palMid', a: [40, 62], once: 1, w: 2, c: () => !!pal(), run: () => {
    const p = pal(), far = p.close < 35;
    const news = p.fate === 'abroad' ? '回国了，说外面再好也不是家' : p.fate === 'home' ? '的孩子考上了大学，在朋友圈连发了九张图' : p.fate === 'down' ? '又换了一座城市，说这回一定能成' : chance(0.5) ? '离婚了' : '查出了高血压，开始每天早上跑步';
    if (far) return `听老同学说，${p.name}${news}。你点开${ta(p)}的头像，想说点什么，又退了出来。`;
    p.close += 3; return `${p.name}${news}。那天晚上你们打了很久的电话，像小时候一样。`;
  } },
  // 晚年：发小走了
  { id: 'palGone', a: [62, 95], once: 1, w: () => S.age >= 75 ? 3 : 1, c: () => !!pal(), run: () => {
    const p = pal(); p.alive = false; const yrs = S.age - p.at;
    eff({ h: p.close >= 40 ? -8 : -3, so: -2 });
    if (p.close >= 40) return { t: `${p.name}走了。你们${p.at}岁认识，做了${yrs}年的朋友。葬礼上你一直在想，那年你们约好要考同一所高中。`, k: 'loss', x: 1 };
    return { t: `${p.name}走了，是在老同学群里看到的消息。你翻出了你们小时候的合照，看了很久。`, k: 'loss' };
  } },

  // ---- 初恋 ----
  { id: 'crushMeet', a: [26, 55], once: 1, w: 4, c: () => !!S.ppl?.crush, run: () => {
    const c = S.ppl.crush, k = kidPick('kidCrush');
    c.single = chance(0.12);
    const head = `同学聚会上，又见到了${c.name}。`;
    if (k === 'note' && S.flags.crushOk) { eff({ h: 2 }); return head + `${ta(c)}笑着问：「那张纸条你还留着吗？」你说早扔了。其实还夹在日记本里。`; }
    if (k === 'note') return head + '有人提起当年那张被班主任没收的纸条，全桌都笑了。你和' + ta(c) + '也跟着笑。';
    if (k === 'secret' && chance(0.4)) { eff({ h: 3 }); return head + `喝到后半场，${ta(c)}突然说：「其实当年我也喜欢过你。」你们都笑了，笑完谁都没说话。`; }
    return head + `${ta(c)}${c.single ? '还是一个人，说这些年一直在外面跑' : '手机屏保是孩子的照片'}。你没提当年的事，${ta(c)}大概也不记得了。`;
  } },
  // 又成了一个人，那个人也是：重新开始的可能（引出「心动」）
  { id: 'crushAgain', a: [35, 72], once: 1, w: 6, c: () => !!S.ppl?.crush?.single && S.ppl.crush.alive && alone() && S.done.crushMeet != null, run: () => {
    const c = S.ppl.crush, p = makePartner('reunion');
    p.name = c.name; p.sur = c.name.slice(0, 1); p.fit = clamp(p.fit + 0.2, 0.05, 0.95);
    S.cand = p; soon('romance');
    return { t: `${c.name}也是一个人。你们加了微信，从当年的班主任聊到各自的这些年，一直聊到半夜。`, k: 'good' };
  } },

  // ---- 前任、没选的人（S.loves，romance.ts 的感情线） ----
  // 分开两年以后：听说 Ta 结婚了
  { id: 'exWed', a: [22, 50], once: 1, w: 3, c: () => !!ex(2), run: () => {
    const e = ex(2), single = !S.fam.married;
    eff({ h: single ? -2 : -1 });
    return pick([`刷朋友圈，看到${e.name}结婚了。你点了个赞，又取消了。`, `听共同的朋友说，${e.name}结婚了。${single ? '那天晚上你一个人喝了两罐啤酒。' : '你“哦”了一声，接着吃饭。'}`]);
  } },
  // 十年以后：碰见了
  { id: 'exMeet', a: [32, 75], once: 1, w: 3, c: () => !!ex(10), run: () => {
    const e = ex(10), t = taL(e);
    const outside = ['ldr', 'parents', 'house', 'wait'].includes(e.why);
    return pick([`在${S.loc.city}的商场里碰见了${e.name}，${t}牵着一个孩子。你们站着聊了五分钟，谁都没提当年。`, `在高铁站碰见了${e.name}。${t}胖了一点，笑起来还是老样子。`])
      + (outside ? `临走时${t}说：“要是当年……”话没说完，就被广播打断了。` : '');
  } },
  // 当年因为外面的事分开的（异地、家里、房子、等不下去），两个人又都是一个人：重新开始的可能（引出「心动」）
  { id: 'exAgain', a: [30, 68], once: 1, w: 4, c: () => alone() && !!exOut(), run: () => {
    const e = exOut(), p = makePartner('reunion');
    p.name = e.name; p.sur = e.name.slice(0, 1); p.fit = clamp(p.fit + 0.2, 0.05, 0.95);
    S.cand = p; soon('romance');
    return { t: `当年因为${WHY_N[e.why]}分开的${e.name}，现在也是一个人。你们约着吃了顿饭，从中午一直坐到天黑。`, k: 'good' };
  } },
  // 没选的那个人：几年以后听说了 Ta 的消息
  { id: 'missedNews', a: [28, 75], once: 1, w: 3, c: () => !!missed(), run: () => {
    const m = missed(), t = taL(m);
    const now = pick([`${t}后来${m.sex === 'M' ? '娶了一个当老师的' : '嫁给了一个当医生的'}，生了两个孩子`, `${t}去了深圳，自己开了个小公司`, `${t}到现在还是一个人`]);
    const head = m.how === 'blind' ? `听介绍人说，当年相亲见过的${m.name}，` : `听朋友说，当年很聊得来、你却没追的${m.name}，`;
    // 当年选的那个人后来没走下去：会想一想
    const w = m.with && (S.loves || []).find(x => x.kind === 'love' && x.name === m.with);
    return head + now + '。' + (w && (w.end != null || w.div != null) ? `你偶尔会想，要是当年选的是${t}……` : m.with && !w ? `当年你选了${m.with}，结果没成。要是选的是${t}呢？` : '');
  } },

  // ---- 不打算结婚（抉择 single） ----
  // 家里终于不催了
  { id: 'soloMom', a: [34, 80], once: 1, w: 4, c: () => !!S.flags.noWed && S.flags.soloAt != null && S.age - S.flags.soloAt >= 3 && (S.fam.mom.alive || S.fam.dad.alive), run: () => {
    const who = S.fam.mom.alive ? '妈妈' : '爸爸';
    eff({ h: 3 });
    return { t: `有一年过年，${who}没再提结婚的事。临走时往你包里塞了两罐自己做的辣酱，说：“你自己过得好就行。”`, k: 'good' };
  } },
  // 老了以后：几个一个人过的老朋友搭伙
  { id: 'soloOld', a: [60, 82], once: 1, w: 4, c: () => !!S.flags.noWed, run: () => {
    eff({ h: 3, so: 2 });
    return { t: '和几个同样一个人过的老同学搭起了伙，每周轮流做东吃一顿饭。说好了，以后住同一家养老院。', k: 'good' };
  } },

  // ---- 晚年再婚（五十岁以后，不办酒席的那种）：子女点不点头、房子以后留给谁 ----
  { id: 'lateWed', a: [50, 90], once: 1, w: 10, c: () => married() && S.fam.partner.wedHow === 'none' && S.age - S.fam.partner.marriedAt <= 3 && (S.flags.divorced != null || S.flags.widowed != null), run: () => {
    const p = S.fam.partner, kid = kidsAlive().filter(k => k.age >= 18).sort((a, b) => b.age - a.age)[0], me = S.sex === 'M' ? '爸' : '妈';
    if (kid && S.house && !S.house.pt) { eff({ h: -3 }); return { t: `${kid.name}回家吃饭，一顿饭没说几句话。走的时候在门口问你：“${me}，这房子以后怎么算？”你说早想好了，留给${kid.sex === 'M' ? '他' : '她'}。${p.name}在厨房里洗碗，水一直开着。`, x: 1 }; }
    if (kid) { eff({ h: -2 }); return `${kid.name}一开始不同意，那年过年没回来。第二年拎着东西上了门，叫了${p.name}一声“${p.sex === 'M' ? '叔叔' : '阿姨'}”。`; }
    eff({ h: 2 }); return `${p.name}的孩子来家里吃饭，客客气气的。临走时拉着你的手说，有你陪着${p.sex === 'M' ? '他们爸' : '他们妈'}，他们就放心了。`;
  } },

  // ---- 小时候被欺负的那个同学 ----
  { id: 'bulliedMeet', a: [26, 50], once: 1, w: 3, c: () => !!kidPick('kidBully'), run: () => {
    const k = kidPick('kidBully'), b = (ppl().bullied ||= person(chance(0.7) ? S.sex : S.sex === 'M' ? 'F' : 'M'));
    if (k === 'stand') { eff({ h: 4, so: 3 }); return { t: `在${S.loc.city}办事，窗口里的人一直盯着你看：「你是不是${S.name}？当年在厕所门口……」${b.name}坚持请你吃了一顿饭，说那天${ta(b)}记了一辈子。`, k: 'good' }; }
    if (k === 'tell') { eff({ h: 1, so: 1 }); return `${b.name}在同学群里加了你，说一直记得那天老师来得那么快。你都快忘了这件事。`; }
    eff({ h: -3 }); return `在${S.loc.city}的地铁上，你好像看见了当年那个被堵在厕所门口的同学。${ta(b)}穿着西装在打电话。你没有上前。`;
  } },

  // ---- 童年的小选择 ----
  { id: 'echoClass', a: [58, 78], once: 1, w: 4, c: () => S.job === 'retired' && ['draw', 'piano', 'swim'].includes(kidPick('kidClass')), run: () => {
    const k = kidPick('kidClass'); eff({ h: 4 });
    if (k === 'draw') return '退休以后报了老年大学的国画班。老师说你画的太阳，怎么总带着一张笑脸。';
    if (k === 'piano') return '把家里那架落了灰的钢琴打开，弹了一首小时候练过的曲子，只记得前半段。';
    return '每天早上去游泳。泳池里的年轻人游不过你，你说这是六岁那年学的。';
  } },
  { id: 'echoLego', a: [30, 60], once: 1, w: 4, c: () => kidPick('kidMoney') === 'buy' && kidsAlive().some(k => k.age >= 5 && k.age <= 10), run: () => {
    eff({ h: 3 }); return '回老家翻出了当年用压岁钱买的那套乐高，给孩子玩。缺了好几块，孩子还是玩了一整个下午。';
  } },
  { id: 'echoWallet', a: [25, 45], once: 1, w: 2, c: () => kidPick('kidWallet') === 'keep', run: () => {
    eff({ h: -1 }); return '刷到一条新闻：有个小学生捡到钱包交给了警察。你想起小时候偷偷留下的那个钱包，里面有一张全家福。';
  } },
  // 留守长大的孩子：现在轮到爸妈等你
  { id: 'echoLb', a: [28, 50], once: 1, w: 3, c: () => !!S.flags.lb && farFromParents() && !!parentsWord(), run: () => {
    const w = parentsWord();
    return `小时候是你在村口等${S.flags.lbWho === 'both' ? '爸妈' : S.flags.lbWho === 'dad' ? '爸爸' : '妈妈'}过年回来。现在是${w}在村口等你，${bothParents() ? '他们' : w === '妈妈' ? '她' : '他'}比你记忆里矮了。`;
  } },

  // ---- 一辈子把时间放在哪里（focus.ts 的 S.fy：每一项放了多少格·年；门槛比自动分配的九成人生都高，偏向某一项的人生才会遇到） ----
  { id: 'fyWork', a: [48, 66], once: 1, w: 6, c: () => fy('work') >= FY.work, run: () => {
    eff({ h: -3 });
    if (kidsAlive().length) return { t: `整理旧照片的时候发现，孩子小时候的照片里几乎没有你：那些年你总在加班。孩子已经长大了，说起小时候，记得的都是${S.fam.partner ? S.fam.partner.name : '别人'}。`, x: 1 };
    return '单位给你发了一张「二十年优秀员工」的奖状。你把它放进抽屉，和这些年的工牌放在一起。';
  } },
  { id: 'fyFamily', a: [58, 88], once: 1, w: 6, c: () => fy('family') >= FY.family && kidsAlive().some(k => k.age >= 25), run: () => {
    eff({ h: 6, so: 3 });
    return { t: '孩子在饭桌上说，小时候最记得的，是每个周末你都带着他们出去，哪怕只是去公园转一圈。你装作没听见，夹了一筷子菜。', k: 'good', x: 1 };
  } },
  { id: 'fyHobby', a: [55, 88], once: 1, w: 5, c: () => fy('hobby') >= FY.hobby, run: () => {
    eff({ h: 5, so: 2 }); return { t: '这些年一直没放下的爱好，社区给你办了个小小的展览。来看的人不多，你在门口站了一整天。', k: 'good' };
  } },
  { id: 'fyHealth', a: [62, 88], once: 1, w: 5, c: () => fy('sport') + fy('rest') >= FY.health, run: () => {
    eff({ hl: 5, h: 3 }); return { t: '体检的医生翻着报告说，你的身体比同龄人年轻十岁。几十年的早睡早起、跑步散步，算是没白费。', k: 'good' };
  } },
  { id: 'fyFriends', a: [55, 90], once: 1, w: 5, c: () => fy('friends') >= FY.friends, run: () => {
    eff({ so: 5, h: 4 }); return { t: '你住院那几天，来看你的老朋友排着队，护士说没见过这么热闹的病房。', k: 'good' };
  } },
  { id: 'fyNoFriends', a: [60, 90], once: 1, w: 3, c: () => S.fy && fy('friends') < 8 && fy('work') >= 20, run: () => {
    eff({ h: -4, so: -3 }); return '退休以后，手机安静了下来。你翻遍通讯录，找不到一个能约出去喝茶的人。';
  } },

  // ---- 和孩子的亲疏（actions.ts）：老了以后看得出来 ----
  { id: 'kidsNear', a: [62, 90], once: 1, w: 5, c: () => (grownClose() ?? 0) >= 75, run: () => { eff({ h: 6, so: 4 }); return { t: '孩子们每个周末都回来，冰箱永远是满的。邻居说你有福气，你嘴上说「他们烦人」，心里高兴。', k: 'good' }; } },
  { id: 'kidsFar', a: [62, 90], once: 1, w: 5, c: () => { const c = grownClose(); return c != null && c < 35; }, run: () => { eff({ h: -6, so: -3 }); return '孩子一年只回来一次，待两天就走。走的那天你送到楼下，转身回来，屋里比原来还空。'; } },

  // ---- 当年没选的那条路 ----
  { id: 'echoFork', a: [45, 80], once: 1, w: 3, c: () => !!S.forks?.some(f => f.a >= 15 && f.a <= 40 && f.alt.length), run: () => {
    const f = pick(S.forks.filter(f => f.a >= 15 && f.a <= 40 && f.alt.length)), alt = pick(f.alt);
    return `有时会想起${f.a}岁那年的「${f.title}」。要是当年选了「${alt}」，现在会在哪里、过着什么样的日子？`;
  } },
];

// ===== 回响引出的岔路口 =====
declare module '../types' {
  interface Flags { ventureNo?: number; crushOk?: number } // 没跟发小去创业是几岁；初中递的纸条对方回了「我也是」
}
export const ECHO_DEC = {
  // 发小拉你合伙创业：真正的大起大落。去不去，那家公司后来的样子都是一样的（p.venture），只是你在不在里面
  venture: {
    fork: true,
    build: () => {
      const p = pal(); if (!p || !isWorking()) return null;
      p.venture ||= wpick([['boom', 3], ['meh', 4], ['bust', 3]]);
      const all = Math.round(Math.max(S.money * 0.6, 0) / 1e3) * 1e3, part = Math.round(Math.max(S.money * 0.25, 0) / 1e3) * 1e3;
      return {
        title: '合伙', body: `${p.name}在${p.city}做的事情，说得头头是道：已经拉到了一笔投资，缺一个信得过的人。要你辞职过去，股份给你一成。`,
        fact: '大多数新创办的小企业撑不过五年。',
        choices: [
          { k: 'all', label: '辞职，跟着干', sub: `投进去${wan(all)} 赌一把：可能翻好几倍，也可能全赔`, w: 1, tilt: { r: 0.8 } },
          { k: 'part', label: '不辞职，只投点钱', sub: part >= 1e3 ? `投${wan(part)}` : '手头没什么钱', off: part < 1e3, w: 1.2, tilt: { r: 0.3 } },
          { k: 'no', label: '算了，过安稳日子', sub: '', w: 2.5, tilt: { r: -0.6, n: 0.3 } },
        ], ctx: { all, part },
      };
    },
    apply: (k, ctx) => {
      const p = pal(), v = p.venture;
      if (k === 'no') { S.flags.ventureNo = S.age; p.close -= 5; return `你谢了${p.name}。${ta(p)}说「理解，理解」，那之后很久没再联系。`; }
      const x = k === 'all' ? ctx.all : ctx.part;
      eff({ money: -x });
      if (k === 'all') { quitJob(); hire('boss', null); p.close += 15; }
      else p.close += 5;
      if (v === 'boom') {
        const back = Math.max(x, placeInc() * (k === 'all' ? 2 : 0.5)) * ri(3, 7);
        eff({ money: back, h: 10, so: 5 });
        return { t: k === 'all' ? `你辞了职去了${p.city}。头两年住在公司，没日没夜。第三年，公司做起来了，你分到了${wan(back)}。` : `投给${p.name}的钱，几年后变成了${wan(back)}。你第一次知道钱可以这样生钱。`, k: 'good' };
      }
      if (v === 'meh') {
        eff({ money: x * 0.8, h: -2 });
        if (k === 'all') { quitJob(); return `你在${p.name}的公司干了三年，不赚也不亏。最后公司被人收购，你拿回了大部分本钱，重新找工作。`; }
        return `投给${p.name}的钱，几年后连本带利拿回来，比存银行还少一点。`;
      }
      eff({ h: -10 }); p.close -= 10;
      if (k === 'all') { quitJob(); return { t: `公司撑了两年半，倒了。你投进去的${wan(x)}一分没剩，还得从头找工作。你和${p.name}在最后一次散伙饭上都喝多了。`, k: 'bad' }; }
      return { t: `${p.name}的公司倒了，你投的${wan(x)}没了。${ta(p)}说一定会还你，你知道还不了了。`, k: 'bad' };
    },
  },
  // 发小找你借钱
  palloan: {
    fork: true,
    build: () => {
      const p = pal(); if (!p) return null;
      const amt = Math.round(Math.min(Math.max(placeInc() * 0.5, 1e4), S.money * 0.8) / 1e3) * 1e3;
      if (amt < 5e3) return null;
      return {
        title: '借钱', body: `${p.name}说手头周转不开，想借${wan(amt)}，「最多两年就还」。你们${S.age - p.at}年的交情，这些年${ta(p)}过得一直不太顺。`,
        choices: [
          { k: 'all', label: `借${wan(amt)}`, sub: '可能还，也可能不还', w: 1.5, tilt: { a: 0.5 } },
          { k: 'half', label: `借一半，${wan(amt / 2)}`, sub: '', w: 1.5, tilt: { c: 0.3 } },
          { k: 'no', label: '说自己手头也紧', sub: '这份交情可能就淡了', w: 1, tilt: { a: -0.5 } },
        ], ctx: { amt },
      };
    },
    apply: (k, ctx) => {
      const p = pal();
      if (k === 'no') { p.close -= 25; eff({ h: -2 }); return `你说最近手头也紧。${p.name}说「没事没事」，很快挂了电话。`; }
      const amt = k === 'all' ? ctx.amt : ctx.amt / 2;
      eff({ money: -amt }); p.close += k === 'all' ? 15 : 5;
      p.loan = { amt, at: S.age, back: chance(0.55) ? S.age + ri(2, 7) : null };
      return `你把${wan(amt)}转了过去。${p.name}发来一长串语音，你没听完。`;
    },
  },
};
