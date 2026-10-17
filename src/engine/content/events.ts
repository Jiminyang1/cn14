// 随机事件。
// 事件：{ id, a:[最小年龄,最大年龄], w:权重或函数, c:条件, once:只发生一次, gap:冷却年数, run:()=>文字或{t,k,f} }
// k: good / bad / loss / ev；f: 附带的一条真实统计

import { JOBS, hireInCity, isWorking, quitJob, severance } from '../career';
import { MAJORS } from '../education';
import { PBY } from '../data';
import { S } from '../state';
import { addDoc } from '../journal';
import { farFromParents, placeInc } from '../place';
import { carer } from '../parents';
import { chance, clamp, gauss, pick, ri, wpick } from '../rng';
import { eff } from '../stats';
import { kidsAlive } from '../family';
import { single, soloK } from '../romance';
import { wan } from '../format';

export const rural = () => S.loc.kind === 'rural';
export const dz = t => PBY[S.loc.p].dz.includes(t);

export const EVENTS = [
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
  { id: 'layoff', a: [20, 60], gap: 4, w: () => isWorking() ? JOBS[S.job].risk * 4 : 0, run: () => {
      const boss = ['boss', 'shop'].includes(S.job), comp = boss ? 0 : severance();
      quitJob(); eff({ h: -8, money: comp });
      return boss ? { t: '生意越来越难做，最后关了门。', k: 'bad' }
        : { t: `公司裁员，名单上有你。按工龄拿到了${wan(comp)}的经济补偿，这一年的工资只发到离职那天。`, k: 'bad', f: '劳动合同法：经济补偿按在本单位工作的年数，每满一年支付一个月工资；没有提前30天通知的，再多付一个月（俗称“N+1”）' };
    } },
  { id: 'promo', a: [25, 58], gap: 4, w: () => isWorking() ? 1.5 : 0, run: () => { S.wageK *= 1.15; eff({ h: 4 }); return { t: S.job === 'civil' ? '提了一级，工资涨了一点。' : '升职加薪了。', k: 'good' }; } },
  { id: 'stock', a: [25, 65], gap: 5, w: 1, c: () => S.money > placeInc() * 0.5, run: () => { const g = gauss(-0.05, 0.25), x = S.money * 0.3 * g; eff({ money: x, h: g > 0 ? 2 : -3 }); return g > 0 ? `跟着同事买了股票，赚了${wan(x)}。` : `跟着同事买了股票，亏了${wan(-x)}。`; } },
  { id: 'car', a: [25, 55], once: 1, w: 1.5, c: () => S.money > placeInc() * 1.2, run: () => { eff({ money: -placeInc() * 1.0, h: 3 }); return `买了一辆${chance(0.6) ? '新能源车' : '二手车'}，过年终于可以自己开车回家了。`; } },
  { id: 'travel', a: [20, 75], gap: 3, w: 1, c: () => S.money > 0, run: () => { eff({ h: 3, money: -placeInc() * 0.08 }); return `国庆假期去${pick(['西安', '三亚', '大理', '重庆', '青岛', '张家界', '哈尔滨'])}旅游，景区人山人海，看人比看风景多。`; } },
  { id: 'springHome', a: [18, 60], gap: 3, w: () => S.loc.p !== S.home.p && !S.flags.parWithMe ? 3 : 0, run: () => { eff({ h: 2, so: 2 }); return `春运抢票抢了三天，坐了${ri(6, 30)}个小时的车回家过年。`; } },
  { id: 'smoke', a: [15, 40], once: 1, w: () => S.sex === 'M' ? 1.6 : 0.1, run: () => { S.flags.smoke = 1; eff({ hl: -3 }); return { t: S.age < 18 ? '和几个同学躲在厕所里学会了抽烟。' : S.age < 22 ? '开始抽烟了。宿舍里的人都抽，你也跟着抽上了。' : '开始抽烟了。一开始是应酬时别人递过来的。', f: '中国成年男性的吸烟率远高于女性' }; } },
  { id: 'quitSmoke', a: [30, 75], once: 1, w: 0.8, c: () => !!S.flags.smoke, run: () => { S.flags.smoke = 0; eff({ hl: 3 }); return { t: '戒烟了。试了好几次，这次终于成功。', k: 'good' }; } },
  { id: 'drink', a: [22, 55], gap: 4, w: () => ['sales', 'boss', 'civil'].includes(S.job) ? 2 : 0.3, run: () => { eff({ hl: -2 }); return '饭局上被一轮轮敬酒，喝到吐。'; } },
  { id: 'low', a: [14, 70], gap: 6, w: () => S.st.h < 40 ? 2 : 0.15, run: () => { eff({ h: -3 }); if (chance(0.15)) { eff({ h: 8 }); return { t: '有一段时间每天都很累，什么都不想做。后来你去医院看了心理科，慢慢好了一些。', f: '中国抑郁障碍患者中，一年内接受过任何治疗的不到一成（Lancet Psychiatry 2021）。全国心理援助热线：12356' }; } return { t: '有一段时间每天都很累，什么都不想做，觉得一切都没有意义。你没有告诉任何人。', k: 'bad', f: '全国心理援助热线：12356' }; } },
  { id: 'divorce', a: [25, 70], gap: 5, w: () => (S.st.h < 45 ? 0.12 : 0.02) * (PBY[S.loc.p].divK || 1), c: () => S.fam.married && S.fam.partner && S.fam.partner.alive, run: () => { const p = S.fam.partner; S.fam.married = false; S.fam.partner = null; S.flags.divorced = 1; addDoc('divorce', '离婚证', [['对方', p.name]]); eff({ h: -8, so: -4, money: -Math.max(0, S.money) * 0.4 }); return { t: `你和${p.name}离婚了。`, k: 'bad', f: '2023年全国离婚360.5万对，其中民政部门登记259.3万对，其余为法院判决或调解' }; } },
  { id: 'kidSchool', a: [28, 55], gap: 3, w: 2, c: () => kidsAlive().some(k => k.age >= 6 && k.age <= 17), run: () => { eff({ h: -2, money: -placeInc() * 0.1 }); return pick(['为了孩子上学，研究学区、排队报名，跑了好几趟。', '每天晚上辅导孩子写作业，气得血压都上来了。', '孩子的家长群一天几百条消息。']); } },
  { id: 'reunion', a: [30, 60], gap: 10, w: 1, run: () => { eff({ so: 2, h: S.relInc > 0 ? 2 : -2 }); return '同学聚会。有人开着好车来，有人没来。大家聊着聊着，就开始聊房子和孩子。'; } },
  { id: 'scam', a: [25, 90], gap: 8, w: () => S.age > 60 ? 1.5 : 0.5, c: () => S.money > 0, run: () => { const x = Math.min(S.money * 0.3, placeInc() * (S.age > 60 ? 0.5 : 0.3)); eff({ money: -x, h: -4 }); return { t: S.age > 60 ? `听了几次“健康讲座”，买了${wan(x)}的保健品。` : `接到自称“公检法”的电话，被骗走了${wan(x)}。`, k: 'bad' }; } },
  { id: 'visitHome', a: [22, 60], gap: 3, w: () => farFromParents() && (S.fam.mom.alive || S.fam.dad.alive) ? 2 : 0, run: () => { eff({ so: 2, h: 1 }); return '坐高铁回老家看爸妈。他们老了很多，饭桌上的菜却还是你小时候爱吃的。'; } },
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
export const EVMAP = {};
EVENTS.forEach(e => { EVMAP[e.id] = e; });
