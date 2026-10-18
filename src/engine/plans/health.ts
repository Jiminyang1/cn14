// 健康：两个持续的计划（健身、定期体检）和一个一次性的行动（戒烟）。
// · 健身：每个月交卡钱，健康和幸福慢慢往上走（e 是一整年的量；健康每年还会向目标值靠拢，所以 +1.5 一年，
//   常年坚持下来大约比不去的人高七八点，死亡率低一两成，估计）；
// · 定期体检：每年做一次全面体检，钱按月折算。确诊大病时发现得早（health.ts 的 illHook），治疗中的死亡率减半（ILL_EARLY）；
//   每年生日偶尔写一句体检的结果；
// · 戒烟：抽烟的人一年可以试一次，成不成看认真程度和年纪。自动的人生不走这里，由事件 quitSmoke 自己发生。
// 自动的人生（无界面、自动抉择）：认真、手头宽裕的去健身；40 岁以上、做事认真、有一年收入的积蓄的定期体检。玩家没设过的都是不去
import { S } from '../state';
import { chance, clamp } from '../rng';
import { eff } from '../stats';
import { log, vary } from '../journal';
import { placeInc } from '../place';
import { pz } from '../personality';
import { liquidBalance } from '../accounts';
import { illHook } from '../health';
import { definePlan, planOf } from '../plans';
import { defineAct } from '../actions';

const autoLife = () => S.headless || !!S.auto;
const logEv = (t: string) => log(t, 'ev');
/** 手头不紧：没有连着几个月付不起开销，余钱还有当地几个月的收入 */
const easy = (k: number) => !S.tightM && liquidBalance() > placeInc() * k;
/** 按当地收入折成每个月的钱，取整到十块 */
const perMo = (r: number) => Math.round(placeInc() * r / 12 / 10) * 10;

// ===== 健身 =====
// 健身卡一个月约当地年收入的 0.5%（收入 5 万的地方两百来块，大城市三四百，估计）
definePlan('gym', {
  n: '健身', g: 'health',
  d: () => S.st.hl >= 70 ? '身体还行，动一动能一直这样' : '身体不如以前了，该动一动了',
  ok: () => !!S.indep && S.age >= 18 && S.age <= 75,
  opts: [
    { k: 'none', label: '不去' },
    { k: 'gym', label: '办张健身卡，常去', sub: () => '一周去两三次', monthly: () => perMo(0.05), e: { hl: 1.5, h: 1 } },
  ],
  def: () => autoLife() && pz('c') > 0.5 && easy(0.5) ? 'gym' : 'none',
  say: k => k === 'gym'
    ? vary('gymOn', ['办了一张健身卡，第一次去，在跑步机上走了二十分钟就下来了。', '办了一张健身卡，跟自己说这次一定坚持。', '在家附近的健身房办了卡，买了一双新跑鞋。'])
    : '健身卡到期了，没再续。',
});

// ===== 定期体检 =====
// 一年一次全面体检，约当地年收入的 3%（一两千块，估计）
definePlan('checkup', {
  n: '定期体检', g: 'health',
  d: () => S.age >= 40 ? '过了四十，很多病早发现和晚发现差得很远' : '每年查一次，心里有个数',
  ok: () => !!S.indep && S.age >= 18,
  opts: [
    { k: 'none', label: '不查' },
    { k: 'yearly', label: '每年全面体检', sub: () => '大病能早发现', monthly: () => perMo(0.03) },
  ],
  def: () => autoLife() && S.age >= 40 && pz('c') > 0 && easy(1) ? 'yearly' : 'none',
  say: k => k === 'yearly' ? '决定以后每年做一次全面体检。' : '体检不再年年做了。',
  // 生日那个月，偶尔写一句结果（八年里约一次；健康越好，箭头越少）
  year: k => {
    if (k !== 'yearly' || !chance(0.12)) return;
    if (S.st.hl >= 70) return void logEv(vary('checkupGood', ['体检报告上一个箭头都没有。医生翻了翻，说「保持」。', '体检做完了，各项都正常。走出医院的时候，觉得天特别蓝。', '今年的体检报告比去年还好看一点。']));
    if (S.st.hl >= 45) return void logEv(vary('checkupMid', ['体检报告上有两个小箭头，医生说少吃点油、多走走。', '体检查出血脂有点高。你把报告折起来塞进了抽屉。', '体检说颈椎有点问题，让你别老低着头看手机。']));
    logEv(vary('checkupBad', ['体检报告厚了一沓，好几项都要复查。', '体检完，医生把你单独叫进去，叮嘱了半天按时吃药。', '体检的单子上，箭头比去年又多了几个。']));
  },
});

/** 定期体检开着 */
export const checkupOn = () => planOf('checkup') === 'yearly';
// 确诊大病时（health.ts）：体检开着的，发现得早，换一句话
const EARLY: Record<string, string> = {
  cancer: '体检的时候发现得早：片子上有一个很小的阴影，进一步检查是早期的癌症。医生说，这个时候发现，机会大得多。',
  heart: '体检的时候发现得早：心电图有些不对，进一步检查是冠心病，血管堵了一半，还没出大事。',
  stroke: '体检的时候发现得早：颈动脉里有斑块，脑子里已经有一处小的梗塞。医生说是脑卒中，好在还轻。',
  liver: '体检的时候发现得早：B超上肝有些不对，进一步检查是早期的肝硬化。',
  resp: '体检的时候发现得早：肺功能没过，确诊是慢性阻塞性肺病，还在早期。',
};
illHook.early = k => checkupOn() ? EARLY[k] || EARLY.cancer : null;

// ===== 戒烟 =====
// 成功率（估计）：基础 35%，认真程度每个标准差 ±12%，四十岁以后知道怕了 +10%，生着大病 +20%；在 10%–75% 之间
export const quitP = () => clamp(0.35 + 0.12 * pz('c') + (S.age >= 40 ? 0.1 : 0) + (S.flags.ill ? 0.2 : 0), 0.1, 0.75);
defineAct('quitSmoke', {
  n: '戒烟', g: 'health', max: 1, d: () => '把烟戒了',
  cost: () => 0, ok: () => !!S.flags.smoke,
  fx: () => [`戒掉约 ${Math.round(quitP() * 100)}%`, '健康 +3', '幸福 +2'],
  run: () => {
    if (chance(quitP())) {
      S.flags.smoke = 0; eff({ hl: 3, h: 2 });
      return vary('quitOk', ['戒烟了。头一个月嘴里总想含点什么，熬过去以后，早上起来不咳了。', '把家里的烟和打火机全扔了。这次是真的戒了。', '戒烟了。递过来的烟，你摆摆手说「戒了」，说多了自己也就信了。']);
    }
    eff({ h: -1 });
    return vary('quitFail', ['坚持了三个星期，又抽上了。', '戒了两个月。一次饭局上，有人递过来一根，你接了。', '说好了戒烟，烟盒藏在抽屉最里面，还是没忍住。']);
  },
});
