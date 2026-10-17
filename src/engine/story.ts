// 回看这一生（结局页用）：一段小传、几个人生标签、人生大事、走过的岔路口。只读，不碰随机数。
import type { Fork, Life, LogEntry } from './types';
import { EDU_LV } from './education';
import { CAUSE } from './mortality';
import { BIG, PBY } from './data';
import { JOBS, mainJob } from './career';
import { FOCUS } from './focus';
import { FY } from './content/echoes';

// ===== 人生标签 =====
// r：大致有多少见（1 常见、2 少见、3 罕见；估计）。标签收集在浏览器里（game/storage.ts 的 PastLife.tags），首页和结局页显示收集了几种
export interface Tag { k: string; n: string; d: string; r: 1 | 2 | 3 }
const kidsOf = (L: Life) => L.fam.kids.filter(k => k.alive || k.age >= 18);
const hasJob = (L: Life, j: string) => L.jobs.some(x => x.job === j);
const bigCityLife = (L: Life) => L.places.some(c => BIG[c]);
const loveName = (L: Life) => L.fam.partner?.name;
export const TAGS: [Tag, (L: Life) => boolean][] = [
  [{ k: 'lb', n: '留守儿童', d: '小时候爸妈在外打工', r: 1 }, L => !!L.flags.lb],
  [{ k: 'mig', n: '随迁子女', d: '跟着打工的爸妈在城里长大', r: 2 }, L => !!L.flags.mig],
  [{ k: 'home', n: '没离开过家乡', d: '一辈子生活在出生的地方', r: 1 }, L => L.places.length === 1 && !L.flags.mig],
  [{ k: 'drift', n: '漂泊', d: '在四座以上的城市生活过', r: 2 }, L => L.places.length >= 4],
  [{ k: 'bigcity', n: '大城市的异乡人', d: '从农村走到了一线城市', r: 2 }, L => L.rural && bigCityLife(L)],
  [{ k: 'tiku', n: '小镇做题家', d: '从农村或县城考进了 985、211', r: 2 }, L => (L.rural || L.home.kind === 'city') && (L.flags.tier === 'top' || L.flags.tier === '211')],
  [{ k: 'top', n: '名校生', d: '读了 985', r: 2 }, L => L.flags.tier === 'top'],
  [{ k: 'redo', n: '复读过', d: '又考了一次', r: 2 }, L => !!L.flags.zkRedo || L.done.dec_slip != null],
  [{ k: 'early-work', n: '早早出来打工', d: '没读完高中就去工作了', r: 1 }, L => L.edu <= 1 && L.jobs.length > 0],
  [{ k: 'civil', n: '铁饭碗', d: '考上了公务员', r: 2 }, L => hasJob(L, 'civil')],
  [{ k: 'boss', n: '当过老板', d: '自己干过一番事', r: 2 }, L => hasJob(L, 'boss')],
  [{ k: 'boom', n: '赌赢了', d: '跟着发小创业，做成了', r: 3 }, L => L.ppl?.pal?.venture === 'boom' && L.done.dec_venture != null && L.flags.ventureNo == null],
  [{ k: 'bust', n: '赌输了', d: '跟着发小创业，赔光了', r: 3 }, L => L.ppl?.pal?.venture === 'bust' && L.done.dec_venture != null && L.flags.ventureNo == null],
  [{ k: 'missed', n: '错过的那班车', d: '没跟发小去，后来那家公司做成了', r: 3 }, L => L.ppl?.pal?.venture === 'boom' && L.flags.ventureNo != null],
  [{ k: 'demol', n: '拆二代', d: '家里的老房子拆迁了', r: 2 }, L => L.flags.demol != null],
  [{ k: 'rich', n: '千万家财', d: '存款最多时超过一千万', r: 3 }, L => L.stats.maxMoney >= 1e7],
  [{ k: 'debt', n: '带着债走', d: '离开时还欠着钱', r: 2 }, L => (L.debt || 0) > L.money + 1e4],
  [{ k: 'firstlove', n: '和初恋走到了一起', d: '少年时喜欢的那个人，后来成了伴侣', r: 3 }, L => !!L.ppl?.crush && loveName(L) === L.ppl.crush.name],
  [{ k: 'pal', n: '一辈子的朋友', d: '和发小的交情一直没断', r: 2 }, L => !!L.ppl?.pal && L.ppl.pal.close >= 65],
  [{ k: 'solo', n: '一个人过', d: '一辈子没有结婚', r: 2 }, L => !L.fam.partner && L.flags.divorced == null && L.age >= 40],
  [{ k: 'divorce', n: '离过婚', d: '', r: 1 }, L => L.flags.divorced != null],
  [{ k: 'late', n: '黄昏恋', d: '五十岁以后又结了婚', r: 3 }, L => (L.fam.partner?.marriedAt ?? 0) >= 50],
  [{ k: 'widow', n: '送走了老伴', d: '', r: 1 }, L => !!L.fam.partner && !L.fam.partner.alive],
  [{ k: 'nokid', n: '没有孩子', d: '结了婚，没有孩子', r: 2 }, L => (L.fam.partner != null || L.flags.divorced != null) && L.fam.kids.length === 0 && L.age >= 45],
  [{ k: 'manykid', n: '儿孙满堂', d: '有三个以上的孩子', r: 2 }, L => kidsOf(L).length >= 3],
  [{ k: 'survivor', n: '挺过了大病', d: '', r: 2 }, L => !!L.flags.survivor],
  [{ k: 'work', n: '工作狂', d: '一辈子的时间大多给了工作', r: 2 }, L => (L.fy?.work || 0) >= FY.work],
  [{ k: 'family', n: '顾家', d: '一辈子的时间大多给了家人', r: 2 }, L => (L.fy?.family || 0) >= FY.family],
  [{ k: 'hobby', n: '活出了自己', d: '几十年没放下自己的爱好', r: 2 }, L => (L.fy?.hobby || 0) >= FY.hobby],
  [{ k: 'health', n: '养生达人', d: '几十年早睡早起、跑步散步', r: 2 }, L => (L.fy?.sport || 0) + (L.fy?.rest || 0) >= FY.health],
  [{ k: 'friends', n: '朋友遍天下', d: '一辈子的时间大多给了朋友', r: 2 }, L => (L.fy?.friends || 0) >= FY.friends],
  [{ k: 'long', n: '长寿', d: '活过了九十岁', r: 2 }, L => !!L.death && L.death.age >= 90],
  [{ k: 'short', n: '走得太早', d: '没活到四十五岁', r: 2 }, L => !!L.death && L.death.age < 45],
];
export const TAG_N = TAGS.length;
export const lifeTags = (L: Life): Tag[] => TAGS.filter(([, ok]) => { try { return ok(L); } catch { return false; } }).map(([t]) => t);

// ===== 人生大事、岔路口 =====
/** 时间线上的人生大事，按时间先后 */
export const lifeMajors = (L: Life): LogEntry[] => L.log.filter(e => e.x).slice().reverse();
/** 走过的岔路口：有结果的（「再处处看」「暂时不要」这种没有下文的不算），同一个抉择只留第一次（裁员名单遇到几次都只列第一次） */
export function forksOf(L: Life): Fork[] {
  const seen = new Set<string>(), out: Fork[] = [];
  for (const f of L.forks || []) {
    if (!f.res || !f.alt.length) continue;
    if (seen.has(f.id)) continue;
    seen.add(f.id); out.push(f);
  }
  return out;
}

// ===== 这一生的时间 =====
/** 一辈子在每一项上放了多少格·年，从多到少（结局页画成一条） */
export const lifeTime = (L: Life) => Object.entries(L.fy || {}).filter(([, y]) => y >= 0.5).sort((a, b) => b[1] - a[1]).map(([k, y]) => ({ k, n: FOCUS[k]?.n || k, y }));

// ===== 小传 =====
const Q_WORD = ['', '家里很穷', '家里不宽裕', '家境普通', '家里过得不错', '家境优渥'];
function mood(L: Life) {
  const ys = L.years.filter(y => y.a >= 18);
  if (!ys.length) return null;
  const h = ys.reduce((s, y) => s + y.h, 0) / ys.length;
  return h >= 78 ? '回头看，这一生大多数时候是开心的。' : h >= 62 ? '回头看，这一生平平淡淡，也有过几段好日子。' : h >= 48 ? '回头看，这一生过得不算轻松。' : '回头看，这一生大多数时候过得很辛苦。';
}
/** 一段小传：出身、读书、工作和城市、感情、家人、结尾。每句都从这一生的状态里拼出来 */
export function lifeStory(L: Life): string[] {
  const he = L.sex === 'M' ? '他' : '她', P = PBY[L.born], out: string[] = [];
  const born = L.docs?.find(x => x.k === 'birth')?.rows.find(r => r[0] === '出生地')?.[1] || P.n;
  let s = `${L.birthYear}年，${L.name}出生在${born}${L.rural && !born.includes('农村') ? '的农村' : ''}，${Q_WORD[L.q] || '家境普通'}。`;
  if (L.flags.lb === 'both') s += `爸妈都在外面打工，${he}跟着${L.flags.carer || '老人'}长大。`;
  else if (L.flags.mig) s += `${he}跟着打工的爸妈在城里长大，户口一直在老家。`;
  if (L.flags.parDiv) s += '爸妈在' + he + '小时候离了婚。';
  out.push(s);
  if (!L.death || L.death.age >= 16) {
    const u = L.flags.uni;
    s = u ? `${he}考上了${u.name}${L.flags.major ? `，学的是${L.flags.major}` : ''}。` : L.edu >= 2 ? `${he}读到了${EDU_LV[L.edu]}。` : L.edu === 1 ? `${he}初中毕业就不再读书了。` : '';
    const pal = L.ppl?.pal;
    if (pal) s += pal.close >= 65 ? `小学时认识的${pal.name}，做了${he}一辈子的朋友。` : `小时候最好的朋友${pal.name}，后来渐渐走远了。`;
    if (s) out.push(s);
  }
  const job = mainJob(L);
  if (job) {
    const cities = [...new Set(L.jobs.map(j => j.city))];
    s = `${he}做得最久的是${job}${cities.length > 1 ? `，先后在${cities.slice(0, 4).join('、')}工作过` : cities[0] ? `，在${cities[0]}` : ''}。`;
    if (L.done.dec_venture != null && L.flags.ventureNo == null) s += L.ppl?.pal?.venture === 'boom' ? '三十来岁跟着发小去创业，赌赢了。' : L.ppl?.pal?.venture === 'bust' ? '有一年跟着发小去创业，赔光了积蓄。' : '跟着发小创过一次业，不赚也不亏。';
    else if (L.flags.ventureNo != null && L.ppl?.pal?.venture === 'boom') s += '发小当年拉' + he + '一起创业，' + he + '没去；后来那家公司做成了。';
    if (L.flags.demol != null) s += '家里的老房子拆迁，分到了一笔钱。';
    out.push(s);
  }
  const pt = L.fam.partner;
  if (pt) {
    const yrs = (pt.alive ? (L.death?.age ?? L.age) : (L.flags.widowed ?? L.age)) - (pt.marriedAt ?? L.age);
    s = `${pt.marriedAt}岁那年，${he}和${pt.name}结了婚${yrs > 0 ? `，一起过了${yrs}年` : ''}。`;
    if (L.ppl?.crush && pt.name === L.ppl.crush.name) s = `少年时喜欢的${pt.name}，在${pt.marriedAt}岁那年成了${he}的伴侣。`;
    if (L.flags.divorced != null && pt.marriedAt > L.flags.divorced) s = `${he}离过一次婚。` + s;
    if (!pt.alive) s += `${pt.name}先走了一步。`;
  } else s = L.flags.divorced != null ? `${he}结过婚，后来离了，之后一直一个人。` : (L.death?.age ?? L.age) >= 35 ? `${he}一辈子没有结婚。` : '';
  const ks = L.fam.kids;
  if (ks.length) s += `有${ks.length}个孩子：${ks.map(k => k.name).join('、')}。`;
  if (s) out.push(s);
  const top = lifeTime(L).filter(t => t.k !== 'study' && t.k !== 'play')[0];
  if (top && top.y >= 10) out.push(`这一生，${he}把最多的空闲时间给了${top.n}，前后算起来有${Math.round(top.y)}年。`);
  const mo = mood(L);
  if (L.death) out.push(`${L.death.age}岁，${he}因为${CAUSE[L.death.cause]}离开了。${mo || ''}`);
  return out;
}
/** 首页和结局页用的一句话：这一生是什么样的人生（取最少见的一个标签） */
export const lifeLine = (L: Life) => { const t = lifeTags(L).sort((a, b) => b.r - a.r)[0]; return t ? t.n : JOBS[L.job]?.n || ''; };
