// 日常：年节、生活片段、由状态触发的节点。让每一年都有几件小事，不至于空着。
// 规则：这里只往时间线上写字（类型 'day'），不改任何会影响模拟的状态，随机数只用第二条流（rng.ts 的 rnd2），
// 所以日常内容加多少、怎么改，人生的走向都一位不变（tests/daily.test.ts 检查），校准也不用重做。
// 无界面的人生（同伴、校准脚本）不排日常。
import { S } from '../state';
import { chance2, pick2, rnd2 } from '../rng';
import { log } from '../journal';
import { awayFromHome, farFromParents } from '../place';
import { JOBS, isWorking } from '../career';
import { kidsAlive, sibsAlive } from '../family';
import { anyParent, bothParents, carer, dadAlive as dad, momAlive as mom, parentRetired, parentsWord } from '../parents';
import { inKg } from '../schedule';
import { loanBal } from '../housing';
import { MILESTONES } from '../lifecycle';
import { planOf } from '../plans';

// 开关（测试里会关掉它，验证日常不影响模拟）
export const DAILY = { on: true };

// ===== 处境 =====
// 写到谁、写到什么，条件里就要有什么：提到爸爸、妈妈先看在不在世（「爸妈」要两人都在），写幼儿园要真的在上，
// 写「回老家」要人不在老家，写「孩子们」要有两个以上在世的孩子，写「公司发了……」要有单位
const rural = () => S.loc.kind === 'rural';
const big = () => S.loc.kind === 'big';
const kid = () => S.age < 12;
const student = () => !!S.school;
const working = () => isWorking();
const blue = () => working() && !!JOBS[S.job].blue;
const office = () => working() && !JOBS[S.job].blue && S.job !== 'boss'; // 上班族（小老板自己当老板，算在 shop 里）
const retired = () => S.job === 'retired';
// 没有「单位」的营生：自己干的、跑平台的、打零工的，过节没人发东西
const NO_UNIT = new Set(['farmer', 'rider', 'driver', 'shop', 'boss', 'build', 'migrant', 'retired', 'seeking', 'home', 'student']);
const unit = () => working() && !NO_UNIT.has(S.job);
const unitW = () => S.job === 'factory' || S.job === 'skilled' ? '厂里' : JOBS[S.job]?.priv ? '公司' : '单位'; // 文字是先拼好再挑的，没工作时也会被调用
const old = () => S.age >= 60;
const single = () => !S.fam.married && !S.fam.dating;
const married = () => S.fam.married && !!S.fam.partner && S.fam.partner.alive;
const widowed = () => !!S.fam.partner && !S.fam.partner.alive;
// 配偶在上班（退休了、务农的不算加班）；也有单位
const ptWorks = () => married() && !!S.fam.partner.jk && !S.fam.partner.retired && S.fam.partner.jk !== 'farmer';
const ptUnit = () => ptWorks() && !NO_UNIT.has(S.fam.partner.jk);
// 父母：「爸妈」只在两人都在世时写；离了婚的不写成一起的场面
const together = () => bothParents() && !S.flags.parDiv;
/** 在世的父母合起来怎么称呼（离了婚的两个人不合称）；都不在了是 null */
const famW = () => S.flags.parDiv && bothParents() ? null : parentsWord();
const pron = (w: string) => w === '爸妈' ? '他们' : w === '爸爸' ? '他' : '她';
const apart = () => farFromParents() && anyParent();   // 和爸妈分隔两地（打电话、回家过年才说得通）
const withParents = () => !!S.flags.parWithMe && anyParent() && S.age >= 18;
const noParents = () => !S.fam.mom.alive && !S.fam.dad.alive;
const leftBehind = () => !!S.flags.lb && S.age < 16;
// 留守时在外打工的是谁（父母去世时 family.ts 的 parentGone 会跟着改）
const outW = () => S.flags.lbWho === 'both' ? '爸妈' : S.flags.lbWho === 'dad' ? '爸爸' : '妈妈';
// 小时候在身边的父母：在世，而且不在外打工
const momHome = () => mom() && !(leftBehind() && S.flags.lbWho !== 'dad');
const dadHome = () => dad() && !(leftBehind() && S.flags.lbWho !== 'mom');
const homeW = () => momHome() && dadHome() ? (S.flags.parDiv ? null : '爸妈') : momHome() ? '妈妈' : dadHome() ? '爸爸' : null;
// 孩子：「孩子们」要两个以上
const nKids = () => kidsAlive().length;
const kidsW = () => nKids() >= 2 ? '孩子们' : '孩子';
const youngKids = () => kidsAlive().some(k => k.age < 12);
const schoolKids = () => kidsAlive().some(k => k.age >= 6 && k.age < 18);
const grownKids = () => kidsAlive().some(k => k.age >= 22);
const grownN = () => kidsAlive().filter(k => k.age >= 18).length;
// 在世的哥哥姐姐怎么称呼：「哥哥」「姐姐」「哥哥们」「姐姐们」「哥哥姐姐」，没有是 null（只有弟弟妹妹的不算）
const elderW = () => {
  const e = sibsAlive().filter(x => x.rel === '哥哥' || x.rel === '姐姐');
  if (!e.length) return null;
  if (e.length === 1) return e[0].rel;
  return e.every(x => x.rel === '哥哥') ? '哥哥们' : e.every(x => x.rel === '姐姐') ? '姐姐们' : '哥哥姐姐';
};
// 在城里租房住：没有这座城市的房子，不在农村（住自建房），不和子女同住、不住养老院、不跟父母住；
// 在老家还有父母、父母有自己的房子的，算住在家里
const renting = () => S.indep && !(S.house && S.house.city === S.loc.city) && !rural() && !S.flags.oldLive && !S.flags.grandHelp && !S.flags.parWithMe
  && (awayFromHome() || !anyParent() || S.famHouse?.type === 'rent');
const poor = () => S.q <= 2;
const flush = () => S.money > 50e4;
const broke = () => S.indep && (S.debt || 0) > S.money;
const city = () => S.loc.city;

/** 从满足条件的几句里挑一句：[条件, 文字] 或直接文字。25 年内写过的句子不再选；都写过了就这次不写（日常是底色，宁少勿重复） */
const REPEAT_GAP = 25;
// 判断重复时忽略数字（岁数、年份），否则「53岁生日……」和「54岁生日……」会被当成两句话
const key = (s: string) => { const t = s.replace(/\d+/g, "#"); let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return '~' + (h >>> 0).toString(36); };
function say(...xs: (string | [unknown, string])[]): string | null {
  const ok = xs.filter(x => typeof x === 'string' || x[0]).map(x => typeof x === 'string' ? x : x[1]);
  if (!ok.length) return null;
  const used = (S.dayDone ||= {});
  const fresh = ok.filter(t => used[key(t)] == null || S.age - used[key(t)] >= REPEAT_GAP);
  if (!fresh.length) return null;
  const t = pick2(fresh);
  used[key(t)] = S.age;
  return t;
}

// ===== 年节：按公历月份放进这一年 =====
// 一个「年龄年」从生日那个月开始：公历 m 月对应这一年的进度
const atMonth = (m: number) => ((((m - S.birthMonth) % 12) + 12) % 12 + rnd2()) / 12;

interface DayItem { ok?: () => boolean; text: () => string | null; gap?: number; once?: boolean }

const SPRING: DayItem = {
  ok: () => S.age >= 1,
  text: () => {
    if (noParents() && S.age >= 18 && !S.dayDone?.springAlone) { (S.dayDone ||= {}).springAlone = S.age; return '父母走后的第一个春节。年夜饭照样做了一桌，可你总觉得少了点什么。'; }
    const ow = outW(), pw = famW(), gk = grownN();
    // 跑车的人：外卖骑手、网约车司机
    const gigW = S.job === 'rider' ? '送外卖' : '跑车';
    return say(
      [S.age < 6 && leftBehind(), `过年了，在外打工的${ow}回来了。你躲在${carer()}身后，过了好几天才肯让${pron(ow)}抱。`],
      [S.age < 6 && !S.flags.lb && mom(), '过年了。大人们把你抱来抱去，红包塞满了口袋，最后都被妈妈收走了。'],
      [S.age < 6, '第一次看到放烟花，你捂着耳朵又舍不得走。'],
      [S.age >= 6 && leftBehind(), `${ow}腊月二十八才到家。你一整天都跟在${pron(ow)}后面，生怕一眨眼${pron(ow)}又走了。`],
      [S.age >= 6 && S.age < 18 && mom(), '压岁钱刚拿到手，妈妈就说“我先帮你存着”。'],
      [S.age >= 6 && S.age < 18 && rural(), '大年初一跟着大人挨家挨户拜年，口袋里塞满了瓜子和糖。'],
      [S.age >= 6 && S.age < 18 && !rural(), '城里不让放鞭炮，除夕夜一家人守着电视看春晚，十二点一过都去睡了。'],
      [S.age >= 6 && S.age < 18 && student(), '寒假作业还剩一大半，过年这几天谁也顾不上管你。'],
      [student() && S.age >= 18 && apart() && mom(), '放寒假回家，妈妈每天变着花样做菜，一周胖了三斤。'],
      [working() && apart() && together(), '抢了好几天的票，终于挤上了回家的车。到家时爸妈已经在路口等着了。'],
      [working() && apart() && mom(), `今年没抢到票，在${city()}过年。除夕夜和家里视频，妈妈一直说“没事，明年早点抢”。`],
      [working() && apart() && S.money > 0, '回家前特意买了新衣服、拎了几箱礼品。在外面过得怎么样，过年这几天总要撑一撑。'],
      [['rider', 'driver'].includes(S.job) && awayFromHome(), `春节期间单价高，你留在城里没回家。除夕夜的街上空荡荡的，只有你们这些${gigW}的人。`],
      [['factory', 'migrant', 'skilled', 'build'].includes(S.job) && awayFromHome(), `${S.job === 'build' ? '工地停工' : '厂里放假'}早，你提前半个月就回了老家，在家里待到正月十五才走。`],
      [single() && S.age >= 25 && S.age < 40, '饭桌上，亲戚们又问起有没有对象。你低头扒饭，假装没听见。'],
      [single() && S.age >= 28 && S.age < 40, '今年过年，你提前想好了一套说辞应付亲戚。结果还没开口，就被安排了两场相亲。'],
      [working() && S.age >= 22 && S.age < 35, '饭桌上，表哥问你一个月挣多少。你报了个数，他笑了笑没说话。'],
      [married() && S.age < 50 && anyParent(), '今年回谁家过年，你们商量了半个月，最后决定除夕在一家、初二去另一家。'],
      // 老家在农村、人在外面，家里还有人
      [kidsAlive().some(k => k.age >= 2 && k.age < 12) && awayFromHome() && S.home.kind === 'rural' && anyParent(), '带着孩子回老家过年。孩子不习惯旱厕和冷屋子，哭了好几回。'],
      [youngKids(), '孩子收到一堆红包，你又一个个原样包了回去。'],
      // 孩子回来过年：不和孩子住在一起（S.flags.oldLive）才说得上「回来」
      [old() && grownKids() && !S.flags.oldLive, gk >= 2 ? '孩子们都回来了，屋子里一下子满了。你从早忙到晚，累，但高兴。' : '孩子回来过年了，屋子里一下子热闹起来。你从早忙到晚，累，但高兴。'],
      [old() && grownKids() && !S.flags.oldLive, `${gk >= 2 ? '孩子们' : '孩子'}说今年工作忙，不回来过年了。你炖了一锅肉，吃了三天。`],
      [old() && widowed(), '老伴走后的春节格外安静。你照着老习惯，多摆了一副碗筷。'],
      [old() && nKids() === 0 && !married() && !S.flags.oldLive, '一个人过年。邻居送来一盘饺子，你们在门口聊了很久。'],
      [S.age >= 30 && together(), '爸妈又老了一些。吃完年夜饭，你发现爸爸已经靠在沙发上睡着了。'],
      [S.age >= 30 && !bothParents() && dad(), '爸爸又老了一些。吃完年夜饭，你发现他已经靠在沙发上睡着了。'],
      [S.age >= 30 && !bothParents() && mom(), '妈妈又老了一些。吃完年夜饭，她坐在沙发上看春晚，看着看着就睡着了。'],
      [S.age >= 18, '除夕夜，家族群里的红包一个接一个，你抢到的加起来不到五块钱。'],
      [S.age >= 6 && S.age < 18, '除夕夜说好要守岁，你撑到十一点就在沙发上睡着了。'],
      [S.age >= 6 && S.age < 14 && dad(), '贴春联的时候，你负责递胶带，爸爸在梯子上问“正不正”。'],
      [S.age >= 18 && S.age < 30, `大年初二，几个老同学约在${S.home.kind === 'rural' ? '镇上的饭馆' : '以前常去的那家饭馆'}，聊着聊着就聊到了谁结婚了。`],
      // 七天假是上班的人才有；最后一天收拾行李，说明人在外地
      [S.age >= 22 && S.age < 60 && unit() && awayFromHome(), '七天假：前三天走亲戚，后三天在床上躺着，最后一天收拾行李。'],
      [S.age >= 22 && working() && !!pw && S.money > 0, `给${pw}包了个红包，${pron(pw)}推辞了半天才收下。`],
      [S.age >= 30 && S.age < 60, '大年三十，一家人边包饺子边看春晚，小品一个也没记住。'],
      [S.age >= 40 && S.age < 65 && married(), '年夜饭在你们家做，一大家子十几口人，你在厨房里忙了一整天。'],
      [rural() && S.age >= 18, '村里过年的人越来越少，很多房子的门一年只开这几天。'],
      [old(), '正月里来拜年的人来来往往，你常常记不清谁是谁家的孩子了。'],
      [old() && rural(), '过完年，村里的年轻人又都走了，村口只剩下几个老人晒太阳。'],
    );
  },
};
const HOLIDAYS: (DayItem & { id: string; m: number[] })[] = [
  { id: 'qingming', m: [4], ok: () => S.age >= 6, text: () => say(
    [rural(), '清明节，跟着家里人上山扫墓。大人在坟前烧纸，小声说着家里这一年的事。'],
    [!rural() && S.age < 18 && student(), '清明放了三天假。作业写了一半，剩下的时间都在玩手机。'],
    [noParents() && S.age >= 30, `清明${awayFromHome() ? '回去' : ''}给父母扫墓。墓碑前的照片，比你记忆里的他们年轻。`],
    [S.age >= 18 && awayFromHome() && !noParents(), '清明没能回去扫墓，家里人在群里发了几张照片。'],
    [old(), '清明去给老朋友们扫墓。一年比一年走得慢，要去的地方却一年比一年多。'],
  ) },
  { id: 'childrenDay', m: [6], ok: () => S.age >= 3 && S.age <= 12, text: () => {
    const hw = homeW(), ow = outW();
    return say(
      [inKg(), '六一儿童节，幼儿园开联欢会，你脸上画了一颗红五角星，表演完领到一袋零食。'],
      [S.age > 6 && student(), '六一儿童节，学校放了半天假，下午全班一起看电影。'],
      [S.age > 6 && !rural() && !!hw, `六一儿童节，${hw}带你去商场，答应给你买一样东西，你挑了一个小时。`],
      [rural() && S.school === '小学', '六一儿童节，村小学排了一个节目，你站在最后一排，只记住了第一句词。'],
      [leftBehind(), `六一儿童节，${ow}打来电话，说给你寄了新衣服，过几天就到。`],
    );
  } },
  { id: 'lantern', m: [2, 3], ok: () => S.age >= 2 && S.age <= 14, text: () => say(
    [S.age < 7, '元宵节，大人给你买了一盏兔子灯，你提着它在院子里转了一圈又一圈。'],
    [rural(), '元宵节，村里耍龙灯，你跟在队伍后面跑了半个村子。'],
    [!rural(), '元宵节，一家人吃了汤圆，你一口气吃了八个。'],
    [S.age >= 7, '元宵节晚上去看灯会，猜中了一个灯谜，换到一支铅笔。'],
  ) },
  { id: 'winterBreak', m: [1, 2], ok: () => S.age >= 6 && S.age <= 14 && student(), text: () => say(
    '寒假作业本上画满了小人，题目一道都还没做。',
    `放寒假了，每天睡到中午，被${carer()}从被窝里拎起来。`,
    [rural(), '寒假里帮家里杀年猪，你负责按住猪尾巴。'],
    [!rural(), '寒假报了一个冬令营，每天在冰场上摔跤。'],
  ) },
  { id: 'dragon', m: [6], ok: () => S.age >= 3, text: () => {
    const gk = grownN();
    return say(
      [S.age < 12, '端午节，外婆包的粽子，你只吃了里面的肉。'],
      [S.age >= 18 && apart() && mom(), '端午节，妈妈寄来一箱自己包的粽子，快递路上压扁了几个。'],
      [S.age >= 18 && unit(), `端午节${unitW()}发了一盒粽子，你转手送给了楼下的保安。`],
      // 给孩子寄：孩子成年了、不住在一起
      [old() && gk > 0 && !S.flags.oldLive, gk >= 2 ? '端午节包了一大锅粽子，给几个孩子各寄了一袋。' : '端午节包了一大锅粽子，给孩子寄了一大袋。'],
    );
  } },
  { id: 'summer', m: [7, 8], ok: () => S.age >= 6 && S.age < 18 && student(), text: () => {
    const ow = outW();
    return say(
      [rural(), '暑假在家帮忙干活，傍晚和伙伴们去河边抓鱼。'],
      [leftBehind(), `暑假去了${ow}打工的城市。${pron(ow)}白天上班，你一个人在出租屋里看了一个月电视。`],
      [!rural() && S.q >= 3, '暑假被安排了两个补习班，中间还去了一趟海边。'],
      [!rural(), '暑假的下午，空调、西瓜和手机。作业留到了最后一个星期。'],
      '暑假作业最后三天才开始赶，晚上写到一点。',
    );
  } },
  { id: 'kaixue', m: [9], ok: () => S.school === '小学' || S.school === '初中' || S.school === '高中', text: () => say(
    '开学了，换了新的班主任。第一天就布置了一篇作文：《我的暑假》。',
    [S.school === '高中', '开学第一周就是摸底考试，你的名字排在了中间。'],
    [S.school === '小学', `开学领了新课本，回家让${carer()}帮忙包书皮。`],
    [rural() && S.school === '初中', '开学了，背着一周的口粮去镇上住校。'],
  ) },
  { id: 'teacher', m: [9], ok: () => S.job === 'teacher', text: () => say(
    '教师节，学生们送了一张手写的贺卡，你夹在了教案里。',
    '新学期开学，带了一个新班。点名的时候，你已经能记住一半的名字。',
  ) },
  { id: 'midautumn', m: [9, 10], ok: () => S.age >= 6, text: () => {
    const pw = famW(), ow = outW(), us = married() || nKids() > 0 ? '你们' : '你', gk = grownN();
    return say(
      [S.age < 18 && !leftBehind(), '中秋节，一家人在阳台上吃月饼。你只挑蛋黄的吃。'],
      [leftBehind(), `中秋节，${ow}没有回来。你和${carer()}分了一个月饼，电话里说了几句就挂了。`],
      [S.age >= 18 && apart() && mom() && !married(), '中秋节一个人在外面，给家里打了个电话。妈妈说月饼给你留着呢。'],
      [withParents() && !!pw, `中秋节，${pw}跟${us}一起过。饭后一家人在楼下散步，老人走得慢，${us}也放慢了脚步。`],
      [unit(), `中秋节${unitW()}发了月饼礼盒，盒子很大，月饼很小。`],
      [married() && youngKids(), '中秋晚上带着孩子下楼看月亮，孩子问月亮上有没有人。'],
      [old() && gk >= 2 && S.flags.oldLive !== 'kid', '中秋节，孩子们打来视频电话，屏幕里一家家的人轮流跟你说话。'],
      [old() && gk === 1 && S.flags.oldLive !== 'kid', '中秋节，孩子打来视频电话，问你月饼吃了没有。'],
    );
  } },
  { id: 'national', m: [10], ok: () => S.age >= 6, text: () => say(
    [S.age < 18 && student(), '国庆七天假，作业发了一大摞。'],
    [S.age >= 18 && S.money > 0 && !old(), '国庆假期哪里都没去，在家睡了七天。'],
    [working() && S.age < 35, '国庆假期，同学结婚，你随了礼、喝了酒，坐最后一班高铁回来。'],
    [married() && youngKids() && working(), '国庆带孩子出去玩了三天，回来比上班还累。'],
    [old(), '国庆节，电视里放着阅兵和晚会，你看着看着就睡着了。'],
  ) },
  { id: 'double11', m: [11], ok: () => S.age >= 16 && S.age < 70, text: () => say(
    '双十一凑满减凑到半夜，第二天发现买的东西大部分用不上。',
    [poor() || broke(), '双十一购物车里放了很多东西，最后只买了一包纸巾。'],
    [married() && youngKids(), '双十一给孩子囤了一年的纸尿裤和奶粉。'],
    [old() && grownN() > 0, '跟着孩子学会了网购，买了一个按摩仪，用了两次。'],
  ) },
  { id: 'winter', m: [12, 1], ok: () => true, text: () => say(
    [S.age < 12 && rural(), '冬天，屋里没有暖气，你手上长了冻疮。'],
    [S.age < 12 && !rural(), '下雪了，你在楼下堆了一个歪歪扭扭的雪人。'],
    [S.school === '高中', '冬天的早晨六点，天还没亮，教室里已经坐满了人。'],
    [['rider', 'driver', 'build'].includes(S.job), `最冷的那几天，你${S.job === 'driver' ? '在车里一坐' : '在外面一站'}就是一整天，${S.job === 'driver' ? '腿都伸不直' : '脸冻得发木'}。`],
    [old(), '入冬以后，你很少出门了。窗台上晒着几个橘子皮。'],
    [S.age >= 18 && S.age < 60 && unit(), '年底了，各种总结、考核和聚餐，一年就这样过去了。'],
    '流感季，家里人轮流发烧，一屋子的咳嗽声。',
    '第一场雪下来的那天，朋友圈里全是雪景。',
    '冬至吃了饺子，说是吃了不冻耳朵。',
    [office() && !!JOBS[S.job].priv, '年底冲业绩，周末也在加班。'],
    [S.age >= 30 && S.age < 60, '天一冷，膝盖就开始隐隐作痛。'],
  ) },
];

// ===== 生日：不是里程碑的年份，偶尔写一句 =====
const BIRTHDAY: DayItem = {
  ok: () => S.age >= 3 && !MILESTONES.includes(S.age),
  text: () => say(
    [S.age < 12 && !leftBehind(), `${S.age}岁生日，许了一个愿，说出来就不灵了。`],
    [S.age < 12 && leftBehind(), `${S.age}岁生日，${carer()}给你煮了一碗长寿面，卧了两个鸡蛋。`],
    [S.age >= 12 && S.age < 18, `${S.age}岁生日，朋友们凑钱买了一个小蛋糕，奶油抹了一脸。`],
    [S.age >= 18 && single() && S.age < 40, `${S.age}岁生日，一个人点了外卖。手机上收到几条祝福，大多是银行和商家发的。`],
    [S.age >= 18 && married(), `${S.age}岁生日，${S.fam.partner?.sex === 'M' ? '他' : '她'}订了一家餐厅，你们吃到很晚。`],
    [S.age >= 18 && apart() && mom(), `${S.age}岁生日，妈妈一大早打来电话，第一句是“吃面了没有”。`],
    [S.age >= 18 && mom() && !apart() && (withParents() || S.age < 30 && !awayFromHome()), `${S.age}岁生日，妈妈一早煮了一碗长寿面，卧了两个鸡蛋。`],
    [S.age % 10 === 0 && S.age >= 30, `${S.age}岁了。你对着镜子看了一会儿，发现了几根白头发。`],
    [old() && grownN() > 0, `${S.age}岁生日，${grownN() >= 2 ? '孩子们' : '孩子'}张罗着给你过寿，你嘴上说别折腾，心里高兴。`],
    [old(), `${S.age}岁生日。你不太记得自己的年纪了，是别人提醒的。`],
  ),
};

// ===== 生活片段：按人生阶段和处境挑 =====
const FRAG: Record<string, DayItem> = {
  // 0–5 岁
  toddlerWords: { ok: () => S.age >= 2 && S.age < 6, text: () => say('学会了数到十，见人就数给人听。', '开始问“为什么”，问得大人答不上来。', '最喜欢的玩具是一个旧纸盒子。') },
  toddlerFear: { ok: () => S.age >= 1 && S.age < 6, text: () => say('去打疫苗，进门就开始哭。', '晚上不肯一个人睡，非要开着灯。', '在楼下摔了一跤，膝盖破了皮，哭完又跑去玩了。') },
  toddlerRural: { ok: () => S.age >= 2 && S.age < 6 && rural(), text: () => say(`跟着${carer()}去赶集，回来时手里攥着一个糖人。`, '在院子里追鸡，被大鹅追着跑了半个院子。', '下雨天在泥地里踩水，回家挨了一顿骂。') },
  toddlerCity: { ok: () => S.age >= 2 && S.age < 6 && !rural(), text: () => say('小区滑梯上排队的小孩比你还多。', '每天晚上要听同一个故事，讲错一个字都不行。', '第一次坐地铁，一直扒着窗户看隧道里的灯。') },
  babyLife: { ok: () => S.age < 2, text: () => say('学会了翻身，又学会了爬，家里的东西都得往高处放。', '长了第一颗牙，抓到什么都往嘴里塞。', '第一次吃辅食，糊了一脸米糊。', '夜里总要醒几次，大人轮流抱着你在屋里走。') },
  toddlerHome: { ok: () => S.age >= 2 && S.age < 6, text: () => say('学会了自己穿鞋，左右总是穿反。', '每天早上要看着大人刷牙，自己也要拿着牙刷比划。', '把家里的锅碗瓢盆全拿出来，敲了一下午。', '躲猫猫的时候，你总是躲在窗帘后面，脚露在外面。', '画了一张全家福，每个人都只有一个圆脑袋和四根棍子。', [!!elderW(), `跟在${elderW()}屁股后面，${elderW() === '哥哥' ? '他' : elderW() === '姐姐' ? '她' : '他们'}去哪你就去哪。`]) },
  toddlerTalk: { ok: () => S.age >= 2 && S.age < 6, text: () => say('问大人：「我是从哪里来的？」大人支支吾吾说是捡来的。', '说要当科学家，过了一个星期又说要当卖冰淇淋的。', '学会了背《静夜思》，见人就背一遍。', '会认几十个字了，路上看见招牌就大声念出来。') },
  kidLife: { ok: () => S.age >= 6 && S.age < 12, text: () => say('换了一颗门牙，把掉下来的牙扔到了房顶上。', '收集了一抽屉的干脆面卡片。', '和同学交换日记本，上面写满了「友谊长存」。', '学会了跳皮筋，一边跳一边念口诀。', '放学路上踩水坑，回家被骂了一顿。', '第一次自己去小卖部买东西，找回来的零钱数了三遍。', [rural(), '和小伙伴去河边摸鱼，裤腿湿到了膝盖。'], [!rural(), '在小区里学会了骑没有辅助轮的自行车。']) },
  kidPlay: { ok: () => S.age >= 6 && S.age < 13, text: () => say('和邻居家的孩子玩捉迷藏，一直玩到天黑被叫回家。', '攒了一整盒卡片，那是你最宝贵的东西。', '养了几只蚕，每天放学都去摘桑叶。', '学会了骑自行车，膝盖上摔破了好几块。', `帮${carer()}去小卖部买酱油，找回的零钱买了一根冰棍。`, [dadHome(), '跟爸爸抢电视遥控器，从来没抢赢过。'], [poor(), '新学期穿的校服是表哥穿剩下的，袖子长了一截。']) },
  teen: { ok: () => S.age >= 12 && S.age < 18, text: () => say('偷偷用零花钱买了一本漫画，藏在床垫底下。', [student(), '和朋友在群里聊到半夜，第二天上课一直打瞌睡。'], [!!homeW(), `第一次和${homeW()}大吵一架，摔门进了自己房间。`], '跟着喜欢的歌手学唱歌，录下来又删掉了。', '个子一下子蹿高了，裤子短了一截。') },
  // 小学、初中
  schoolDay: { ok: () => S.age >= 6 && S.age < 15 && student(), text: () => say('期末考试数学考砸了，回家前在门口站了很久。', '运动会报了 800 米，跑完在操场上躺了半节课。', '班里换座位，你和最好的朋友分开了。', '春游去了公园，带的零食比午饭还多。', '上课传纸条被抓，在走廊里站了一节课。', '学校组织看电影，回来要写观后感。', `家长会后，${carer()}回来脸色不太好看。`) },
  schoolRural: { ok: () => S.age >= 6 && S.age < 15 && rural() && student(), text: () => say('每天走一个小时的路上学，路上会经过一片玉米地。', '学校的英语老师同时教语文和音乐。', '下大雨，学校提前放学，你和同学们踩着泥回家。') },
  schoolCity: { ok: () => S.age >= 6 && S.age < 15 && !rural() && student(), text: () => say('放学后先去托管班，写完作业才被接回家。', '同学过生日请全班吃蛋糕，回家你也想要。', `周末的补习班在商场里，补完课${carer()}会带你去吃一顿好的。`) },
  // 高中、中职
  highSchool: { ok: () => (S.school === '高中' || S.school === '复读') , text: () => say('月考排名贴在教室后面，你看了一眼就走开了。', '晚自习偷偷在课本下面看小说。', '食堂的饭永远是那几样，你每天都要排队抢鸡腿。', '体育课被数学老师占了。', '你的书桌上堆的书，比你坐着还高。') },
  vocational: { ok: () => S.school === '职高', text: () => say('实训课上第一次自己拆装发动机，满手油污。', '班里一半的人在想毕业以后去哪个厂。', [rural() || S.home.kind === 'rural', '周末去镇上的网吧，一坐就是一个下午。']) },
  // 大学
  college: { ok: () => ['大专', '本科', '硕士'].includes(S.school), text: () => say('期末周，图书馆一大早就占满了座。', '选课系统一开放就崩了，你抢到的全是没人要的课。', '社团招新，你加了三个，最后只去了一个。', '宿舍夜聊聊到天亮，第二天的早课全宿舍都没去。', [awayFromHome(), '第一次一个人坐火车去外地，看了一路的窗外。'], '在食堂吃饭时，看到招聘会的海报贴满了一面墙。') },
  // 上班
  commuteBig: { ok: () => office() && big(), text: () => say('早高峰的地铁挤不上去，你等了三趟。', '通勤单程一个半小时，你在地铁上刷完了一整部剧。', [renting(), '房东说下个月房租要涨三百。'], '加班到十点，楼下的便利店成了你的食堂。') },
  commute: { ok: () => office() && !big(), text: () => say('每天骑电动车上下班，下雨天一身湿。', '周一的例会开了两个小时，讲的和上周差不多。', '同事离职了，他的活分到了你头上。', '年终奖比去年少了一些，大家都没说什么。', `${unitW() === '公司' ? '公司' : '单位'}团建去爬山，领导走在最前面，大家只好跟着。`, '工作群里的消息半夜还在响。') },
  factory: { ok: () => ['factory', 'migrant', 'skilled'].includes(S.job), text: () => say('流水线换了新的机器，产量指标又涨了。', '宿舍里有人走了，又来了新人，你已经记不住名字。', '这个月加班多，工资条上的数字好看了一点。', '厂门口的小饭馆换了老板，菜少了，价钱没变。') },
  site: { ok: () => S.job === 'build', text: () => say('工地换到了城市另一头，每天坐一个小时的车。', '工头说这个月的钱下个月一起结。', '工友们在工棚里一起看手机里的家人。') },
  rider: { ok: () => S.job === 'rider' || S.job === 'driver', text: () => say('平台又调了规则，同样跑一天，到手少了一些。', [S.job === 'rider', '电动车的电池不行了，换一块要一千多。'], [S.job === 'driver', '车该保养了，换了机油和刹车片，一个星期白跑。'], [S.job === 'rider', '有一单送晚了，被顾客投诉，那一单白跑了。'], [S.job === 'driver', '一个乘客给了差评，这个月的奖励没了。'], '在路边等单的时候，和同行聊起各自老家的事。') },
  farmer: { ok: () => S.job === 'farmer', text: () => say('今年雨水好，地里的收成还不错。', '化肥又涨价了，算下来一亩地挣不了几个钱。', '村里的年轻人都出去了，农忙时只能请邻村的人帮忙。', '赶集时卖了几筐菜，换回了一袋米和一桶油。') },
  shop: { ok: () => S.job === 'shop' || S.job === 'boss', text: () => say('隔壁新开了一家同样的店，你这个月的生意少了一截。', '店里从早开到晚，一年到头没有休息日。', '房东要涨租金，你算了半天，决定再撑一年。') },
  publicJob: { ok: () => ['civil', 'teacher', 'doctor', 'nurse'].includes(S.job), text: () => say('又要迎接检查，写了一个星期的材料。', '单位组织体检，你的报告上多了一个箭头。', '值了一个夜班，第二天下午才睡醒。') },
  jobless: { ok: () => S.job === 'seeking' && S.age >= 18, text: () => say('投出去的简历大多没有回音。', [apart(), '白天在家投简历，晚上不太敢接家里的电话。'], [!apart() && !!famW(), `白天在家投简历。吃饭的时候${famW()}不问，你也不说。`], '去面试，等了两个小时，聊了十分钟。') },
  // 感情与家
  singleLife: { ok: () => single() && S.age >= 23 && S.age < 50, text: () => say('周末一个人去看了场电影，散场时外面下雨了。', '朋友结婚，你坐在“单身桌”。', '学会了做几个菜，一个人吃也要好好吃。', '深夜刷到老同学晒娃的照片，点了个赞。') },
  soloLife: { ok: () => !!S.flags.noWed && S.age >= 33, text: () => say('一个人去了趟云南，没跟团，走到哪儿算哪儿。', '给自己买了一份商业养老保险，填受益人那一栏时想了很久。', [S.fam.sibs.some(b => b.alive), '侄子侄女来拜年，你包的红包最厚。'], '周末在家做了三个菜，开了瓶酒，一个人吃得挺好。', [S.age >= 45, '体检报告出来，你一个人去拿，一个人看，一个人去复查。']) },
  dating: { ok: () => !!S.fam.dating, text: () => say(`和${S.fam.dating.name}看完电影，在路边吃了一碗面。`, `${S.fam.dating.name}送了你一个小礼物，你一直放在包里。`, `和${S.fam.dating.name}为了周末去哪儿吵了几句，晚上又和好了。`) },
  marriedLife: { ok: () => married() && S.age < 65, text: () => say(`你和${S.fam.partner.name}为了谁洗碗吵了一架，第二天谁都不记得了。`, `结婚纪念日，${S.fam.partner.name}记得，你忘了。`, [unit() && ptUnit(), `晚饭后和${S.fam.partner.name}在小区里走了几圈，说了说各自单位的事。`], [ptWorks(), `${S.fam.partner.name}加班到很晚，你留了一盏灯。`]) },
  baby: { ok: () => kidsAlive().some(k => k.age < 3), text: () => { const us = married() ? '你们' : '你'; return say(`孩子半夜哭醒好几次，${us}${married() ? '轮流' : '一次次'}抱着在屋里走。`, '孩子会叫“爸爸”“妈妈”了，全家人高兴了一整天。', `孩子发烧，${us}在儿童医院的走廊里坐了一夜。`); } },
  parenting: { ok: () => schoolKids(), text: () => say('家长群里每天几十条消息，你只敢在深夜一条条看。', '孩子的期末成绩出来了，你忍着没发火。', '每天早上送孩子上学，路上堵得要命。', '给孩子报了兴趣班，孩子坚持了两个月。', '孩子进入了青春期，关上房门不太跟你说话了。') },
  kidsAway: { ok: () => grownKids() && S.age >= 45 && !S.flags.oldLive, text: () => say('孩子在外地工作，一个月打一次电话，每次都说“挺好的”。', [kidsAlive().some(k => k.age >= 22 && !k.married), '孩子带对象回家吃饭，你提前三天就开始准备菜。'], `孩子说想买房，${married() ? '你们' : '你'}把存折翻出来算了一晚上。`) },
  // 父母老了：只看还在世的那一位（去世的父母年龄停在去世那年）
  parentsAging: { ok: () => S.age >= 30 && (mom() && S.fam.mom.age >= 60 || dad() && S.fam.dad.age >= 60), text: () => {
    const pw = famW(), lp = parentsWord();
    return say(
      [apart() && together(), '爸妈学会了用手机视频，常常打来，只是为了看看你。'],
      [apart() && dad(), '回家时发现，爸爸的背比以前驼了。'],
      [apart() && mom(), '妈妈在电话里说腿疼，你让她去医院看看，她说没事。'],
      [together() && !withParents(), '爸妈把你小时候的东西都留着，一样也舍不得扔。'],
      [withParents() && working(), `老人起得早，你出门上班时，${pron(lp)}已经买完菜回来了。`],
      [withParents() && mom(), `妈妈总嫌${married() ? '你们' : '你'}买的菜贵，每天自己去早市。`],
      [!apart() && !withParents() && mom() && !!pw, `周末回${pw}家吃饭，走的时候妈妈总要给你装一兜菜。`],
    );
  } },
  money: { ok: () => S.indep && S.age >= 22 && S.age < 60, text: () => say(
    [broke() && working(), '月底了，信用卡账单比工资先到。'],
    [broke(), '找朋友借了点钱周转，说好下个月还。'],
    [flush() && planOf('invest') === 'bank', '你开始研究理财，看了很多文章，最后还是把钱存了定期。'], // 买了理财、基金的不写这句
    [loanBal() > 0 && working(), '每个月一发工资，先把房贷还上，剩下的才是自己的。'],
    [renting(), '又到了续租的时候，你在附近看了几套房子，都差不多。'],
    '算了一下这一年的开销，钱都不知道花到哪里去了。',
  ) },
  health: { ok: () => S.age >= 35 && !old(), text: () => say('体检报告上多了几个向上的箭头，你决定少吃点夜宵。', '颈椎不舒服，去推拿了几次。', '办了一张健身卡，去了四次。', '开始戒烟、戒酒、早睡，坚持了一个月。') },
  weekend: { ok: () => S.age >= 18 && S.age < 60 && !student(), text: () => say('周末去爬了一次山，下山时腿一直发抖。', [anyParent(), `换了一部新手机，旧的给了${parentsWord()}。`], '在网上看了很多讨论房价的帖子，越看越焦虑。', '在路上偶遇多年不联系的老同学，加了微信，之后再没聊过。', '小区门口新开了一家早餐店，你成了常客。', '因为一点小事和邻居吵了一架，后来在电梯里碰见都有点尴尬。', '夏天热得睡不着，空调开了一整夜，电费单吓了你一跳。', '周末大扫除，翻出了一箱以前的旧东西，坐在地上看了一下午。') },
  // 老年
  oldMorning: { ok: () => old() && S.age < 85, text: () => say('每天早上去菜市场，和几个摊主都成了熟人。', '在公园里看人下棋，看了一上午，一句话没说。', '跟着短视频学做菜，做出来的和视频里不太一样。', '老同学群里每天都有人转发养生文章。', '在阳台上种了几盆花，每天浇水。', '学会了用手机付钱，去菜市场再也不用带零钱。', '早上跟着一群老人在公园里打太极。', [awayFromHome(), '给老家的亲戚打电话，聊着聊着就聊到了以前的人。'], '每天晚上准时看新闻和天气预报。') },
  oldGrand: { ok: () => old() && (S.flags.grandkids || 0) > 0, text: () => say('孙辈来住了几天，家里热闹了。他们走后，屋里一下子空了。', '孙辈教你用手机拍照，你学了好几遍。', '每天接孙辈放学，在校门口和别的老人聊天。') },
  oldHealth: { ok: () => S.age >= 65, text: () => say('去医院开药，挂号、排队、取药，用了一整个上午。', '腿脚不如从前了，上楼要歇两次。', '记性变差了，出门常常忘了带钥匙。', '夜里睡不着，听着收音机到天亮。', '牙不好了，去配了一副假牙。', '每天吃的药越来越多，你在药盒上贴了纸条，写着早上、中午、晚上。') },
  // 一个人住：没有在世的配偶，没搬去子女家、没住养老院
  oldAlone: { ok: () => old() && !married() && !S.flags.oldLive, text: () => say('一个人吃饭，饭菜做多了，就吃两顿。', '邻居家的孩子常来串门，你给他们拿糖吃。', '社区的工作人员来看你，问你有没有什么需要。') },
  veryOld: { ok: () => S.age >= 85, text: () => say('大部分时间坐在窗边晒太阳。', [nKids() >= 2, '有时叫错孩子们的名字，他们笑着答应。'], [nKids() === 1, '有时把孩子叫成别人的名字，孩子笑着答应。'], '翻看旧照片，照片里的很多人已经不在了。', '你常常想起小时候的事，比昨天的事还清楚。') },
};

// ===== 状态节点：由这一生的数据触发，各只出现一次 =====
const uniKid = () => kidsAlive().find(k => (k.age === 18 || k.age === 19) && !!k.path && k.path.startsWith('考上'));
const MARKS: Record<string, DayItem> = {
  save10w: { ok: () => S.indep && S.money >= 10e4, text: () => '存款第一次过了十万。你看着那串数字，看了好几遍。' },
  save100w: { ok: () => S.indep && S.money >= 100e4, text: () => '存款过了一百万。你没告诉任何人。' },
  dadRetire: { ok: () => S.age >= 10 && S.fam.dad.alive && parentRetired(S.fam.dad, true), text: () => '爸爸退休了。他说终于可以好好歇歇，结果没几天就闲不住了。' },
  momRetire: { ok: () => S.age >= 10 && S.fam.mom.alive && parentRetired(S.fam.mom, false), text: () => '妈妈退休了，开始每天去跳广场舞，比上班时还忙。' },
  kidJunior: { ok: () => kidsAlive().some(k => k.age === 12), text: () => '孩子上初中了，个子快赶上你了。' },
  // 孩子考上了大学、大专，去学校报到（高考在 6 月，family.ts 的 kidsMonth 记下 k.path）
  kidAway: { ok: () => !!uniKid(), text: () => { const k = uniKid(); return `${k.name}去${k.path.includes('大专') ? '读大专' : '上大学'}了。送走那天，你在空荡荡的房间里坐了很久。`; } },
  firstRetired: { ok: () => retired(), text: () => '退休后的第一个早晨，你还是六点就醒了，想了一会儿才想起不用上班。' },
  houseHalf: { ok: () => !!S.house && loanBal() > 0 && loanBal() < S.house.paid * 0.4, text: () => '房贷已经还了一大半。你算了算，还要再还几年。' },
};

// ===== 排进这一年 =====
const ALL: Record<string, DayItem> = { spring: SPRING, birthday: BIRTHDAY, ...Object.fromEntries(HOLIDAYS.map(h => [h.id, h])), ...FRAG, ...MARKS };
const lastAt = (id: string) => (S.dayDone || {})[id];
const fresh = (id: string, gap: number) => lastAt(id) == null || S.age - lastAt(id) >= gap;

export function planDaily() {
  if (!DAILY.on || S.headless) return;
  const add = (id: string, at: number) => S.queue.push({ at: Math.min(0.995, at), type: 'day', id });
  // 日常是底色：一年两三条就够（AGENTS.md「轻重」）。春节大多数年份写一笔，别的节日一半的年份写一个
  if (SPRING.ok() && chance2(0.7)) add('spring', atMonth(chance2(0.6) ? 2 : 1));
  const hs = HOLIDAYS.filter(h => h.ok() && fresh(h.id, 2));
  if (hs.length && chance2(0.45)) { const h = pick2(hs); add(h.id, atMonth(pick2(h.m))); }
  if (BIRTHDAY.ok() && chance2(0.35)) add('birthday', rnd2() * 0.04);
  // 生活片段：一条，一半的年份再多一条；同一类至少隔几年才再出现
  const frags = Object.keys(FRAG).filter(id => FRAG[id].ok() && fresh(id, 3));
  for (let i = 0, n = S.age < 6 || !chance2(0.5) ? 1 : 2; i < n && frags.length; i++) add(frags.splice(Math.floor(rnd2() * frags.length), 1)[0], 0.05 + rnd2() * 0.9);
  for (const id in MARKS) if (lastAt(id) == null && MARKS[id].ok()) add(id, 0.05 + rnd2() * 0.9);
}

export function fireDaily(id: string) {
  const it = ALL[id];
  if (!it || (it.ok && !it.ok())) return; // 排进来以后处境变了：不写
  if (MARKS[id] && lastAt(id) != null) return;
  const t = it.text();
  if (!t) return;
  (S.dayDone ||= {})[id] = S.age;
  log(t, 'day');
}
