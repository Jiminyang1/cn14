// 模拟引擎：出生抽签、逐年推进、事件与抉择调度、死亡判定。
// 所有状态都在全局 S 上；同伴的人生通过临时切换 S 在后台跑完。

let S = null;

// ===== 随机数（可存档的 mulberry32，状态保存在 S.rs） =====
function rnd() {
  let t = (S.rs = (S.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const chance = p => rnd() < p;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function wpick(pairs) {
  if (!Array.isArray(pairs)) pairs = Object.entries(pairs);
  let t = 0;
  for (const [, w] of pairs) t += Math.max(0, w);
  let r = rnd() * t;
  for (const [x, w] of pairs) { r -= Math.max(0, w); if (r < 0) return x; }
  return pairs[pairs.length - 1][0];
}
function gauss(m = 0, sd = 1) { const u = 1 - rnd(), v = rnd(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const wan = x => { const a = Math.abs(x); const s = a >= 1e8 ? (a / 1e8).toFixed(2) + '亿' : a >= 1e4 ? (a / 1e4).toFixed(a >= 1e6 ? 0 : 1) + '万' : Math.round(a) + ''; return (x < 0 ? '-' : '') + s + '元'; };

// ===== 生命表 =====
// 有全国分性别的真实生命表（QX_NAT）时：以它的年龄形状为底，按比例风险缩放，使预期寿命对上各省的值；
// 没有时退回 Gompertz-Makeham 曲线。两种情况下 0 岁的死亡概率都单独给定。
const LT_CACHE = {};
function natQx(sex) {
  if (typeof QX_NAT === 'undefined' || !QX_NAT || !QX_NAT[sex]) return null;
  const k = '_full' + sex;
  if (QX_NAT[k]) return QX_NAT[k];
  const q = QX_NAT[sex].slice(0, 101);
  // 100 岁以后按最后十年的增长率外推到 119
  const g = Math.pow(q[100] / q[90], 1 / 10);
  for (let x = 101; x < 120; x++) q.push(Math.min(0.95, q[x - 1] * g));
  q.push(1);
  return (QX_NAT[k] = q);
}
function lifeTable(le, q0, sex) {
  const key = le.toFixed(2) + '|' + q0.toFixed(5) + '|' + (sex || '');
  if (LT_CACHE[key]) return LT_CACHE[key];
  const base = natQx(sex);
  const A = 0.0002, b = 0.092;
  const build = base
    ? m => { const kk = Math.exp(m), q = [q0]; for (let x = 1; x < 120; x++) q.push(Math.min(1, 1 - Math.pow(1 - base[x], kk))); q.push(1); return q; }
    : m => { const a = Math.exp(m), q = [q0]; for (let x = 1; x < 120; x++) q.push(Math.min(1, 1 - Math.exp(-(A + a * Math.exp(b * x))))); q.push(1); return q; };
  const e0 = q => { let l = 1, e = 0; for (let x = 0; x <= 120; x++) { const l2 = l * (1 - q[x]); e += l2 + (l - l2) * (x === 0 ? 0.15 : 0.5); l = l2; } return e; };
  let lo = base ? -4 : -22, hi = base ? 4 : -3;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (e0(build(m)) > le) lo = m; else hi = m; }
  const q = build((lo + hi) / 2);
  const l = [1];
  for (let x = 0; x < 120; x++) l.push(l[x] * (1 - q[x]));
  return (LT_CACHE[key] = { q, l });
}
// 各省之间的差距来自人口普查；全国整体水平对齐联合国 WPP 2024（比官方口径略低，见 DATA.md）。
const HAS_REAL = typeof QX_NAT !== 'undefined';
const LE_TARGET = { M: 75.25, F: 80.97 };            // UN WPP 2024
const RURAL_LE = { rural: -1.0, urban: 0.6 };        // 城乡差距（粗略）
const leRaw = (pid, sex, rural) => { const p = PBY[pid]; return (sex === 'F' ? (p.leF || p.le + 2.95) : (p.leM || p.le - 2.56)) + (rural ? RURAL_LE.rural : RURAL_LE.urban); };
const LE_SHIFT = {};
for (const sx of ['M', 'F']) {
  let t = 0, n = 0;
  for (const p of PROVS) { const u = p.u / 100; t += p.b * (u * leRaw(p.id, sx, false) + (1 - u) * leRaw(p.id, sx, true)); n += p.b; }
  LE_SHIFT[sx] = LE_TARGET[sx] - t / n;
}
const leOf = (pid, sex, rural) => leRaw(pid, sex, rural) + LE_SHIFT[sex];
// 婴儿死亡率：全国水平用 UN IGME 2024（男 4.3‰、女 3.9‰），各省、城乡按相对倍数分配，再归一到全国水平
const IMK_NORM = PROVS.reduce((t, p) => t + p.b * p.imk * (p.u / 100 * 0.8 + (1 - p.u / 100) * 1.3), 0) / BIRTH_TOTAL;
const q0Of = (pid, rural, sex = 'M') => (HAS_REAL ? Q0_NAT[sex] : 0.0045) * PBY[pid].imk * (rural ? 1.3 : 0.8) / IMK_NORM;
const LT = () => lifeTable(leOf(S.born, S.sex, S.rural), q0Of(S.born, S.rural, S.sex), S.sex);

// ===== 地点、收入、房价 =====
const MUNI = new Set(['BJ', 'SH', 'TJ', 'CQ']);
function placeName(L = S.loc) {
  const p = PBY[L.p];
  if (L.kind === 'rural') return MUNI.has(L.p) ? `${L.city}郊区的村子` : `${p.n}${L.city}的农村`;
  return MUNI.has(L.p) || L.kind === 'big' ? L.city : `${p.n}${L.city}`;
}
// 收入、消费：城镇/农村居民人均可支配收入和消费支出（统计年鉴）；省会略高于全省城镇平均，其他城市略低
// 地级市数据（real.js 里的 CITY，约 90 个城市）优先；没有的城市用全省平均
const cityOf = L => (typeof CITY !== 'undefined' && CITY[L.city] && CITY[L.city].p === L.p) ? CITY[L.city] : null;
function placeInc(L = S.loc) {
  const p = PBY[L.p], c = cityOf(L);
  if (c && L.kind === 'rural' && c.incR) return c.incR;
  if (c && L.kind !== 'rural' && c.incU) return c.incU;
  if (L.kind === 'big' && BIG[L.city]) return BIG[L.city].inc;
  if (L.kind === 'rural') return p.incR || p.inc * 0.55;
  if (L.kind === 'capital') return p.incCap || (p.incU || p.inc) * 1.1;
  return (p.incU || p.inc) * 0.95;
}
// 工资基数：城市之间的工资差距小于人均可支配收入的差距，按 0.7 的弹性随城市收入变化（估计）
const NAT_URBAN_INC = 56502; // 2025 年全国城镇居民人均可支配收入
const wageBase = (L = S.loc) => L.kind === 'rural' ? placeInc(L) : NAT_URBAN_INC * Math.pow(placeInc(L) / NAT_URBAN_INC, 0.7);
function placeCons(L = S.loc) {
  const p = PBY[L.p];
  if (!p.consU) return placeInc(L) * 0.7;
  if (L.kind === 'rural') return p.consR;
  return p.consU * placeInc(L) / p.incU;
}
// 房价：省会用35个大中城市的新建住宅均价；其他城市用全省均价；县城用县城价（没有数据时取全省均价的七成）
const hpCounty = p => p.hpCounty || p.hp * 0.7;
function placeHp(L = S.loc) {
  const p = PBY[L.p], c = cityOf(L);
  if (c && (c.hpNew || c.hp) && L.kind !== 'rural') return c.hpNew || c.hp; // 政府新房均价优先，其次二手挂牌价
  if (L.kind === 'big' && BIG[L.city]) return BIG[L.city].hp;
  if (L.kind === 'rural') return hpCounty(p) * 0.6;
  if (L.kind === 'capital') return p.hpCap || p.hp * 1.4;
  return p.hp;
}
function cityLoc(pid, city) {
  const p = PBY[pid];
  if (!city) {
    // 有人口数据时按人口加权；全省其余人口归到名单外的城市
    const known = p.cities.map(c => [c, (typeof CITY !== 'undefined' && CITY[c] && CITY[c].pop) || 0]);
    const listed = known.reduce((t, [, w]) => t + w, 0);
    if (listed > 0) {
      const rest = Math.max(0, (p.pop || listed) - listed), unknown = known.filter(([, w]) => !w);
      const pairs = known.filter(([, w]) => w > 0);
      if (unknown.length && rest > 0) for (const [c] of unknown) pairs.push([c, rest / unknown.length]);
      city = wpick(pairs);
    } else city = p.cities.length === 1 ? p.cities[0] : chance(0.5) ? p.cities[0] : pick(p.cities.slice(1));
  }
  return { p: pid, city, kind: BIG[city] ? 'big' : city === p.cities[0] ? 'capital' : 'city' };
}
function moveTo(L) {
  S.loc = { ...L };
  if (!S.places.includes(L.city)) S.places.push(L.city);
  if (S.fam && S.fam.dating && typeof loveMove === 'function') loveMove();
  if (S.fam && S.fam.married && S.fam.partner) S.fam.partner.city = L.city; // 结了婚一起搬
}
const awayFromHome = () => S.loc.p !== S.home.p || (S.loc.city !== S.home.city);

// ===== 职业 =====
// m = 年收入 ÷ 当地城镇居民人均可支配收入。依据国家统计局 2025 年分行业、分岗位平均工资和农民工监测调查（research/income.json）：
// 全国城镇人均可支配收入 5.65 万；农民工外出 5774 元/月、制造业 5126、建筑业 5880；办事人员 9.5 万；IT 业私营 12.8 万；教育 13.4 万；卫生 14.6 万；公共管理 11.9 万。
const JOBS = {
  farmer: { n: '务农', m: 1.0, risk: 0, hl: -1, h: 0, blue: 1 },
  migrant: { n: '进城务工', m: 1.25, risk: 0.04, hl: -2, h: -1, blue: 1 },
  factory: { n: '工厂工人', m: 1.1, risk: 0.04, hl: -2, h: -1, blue: 1 },
  build: { n: '建筑工人', m: 1.25, risk: 0.05, hl: -3, h: -1, blue: 1 },
  rider: { n: '外卖骑手', m: 1.35, risk: 0.02, hl: -3, h: -1, blue: 1 },
  driver: { n: '网约车司机', m: 1.3, risk: 0.02, hl: -2, h: -1, blue: 1 },
  shop: { n: '个体户', m: 1.1, risk: 0.06, hl: -1, h: 0, v: 0.6, blue: 1 },
  skilled: { n: '技术工人', m: 1.5, risk: 0.03, hl: -1, h: 0, blue: 1 },
  sales: { n: '销售', m: 1.35, risk: 0.07, hl: -1, h: -1, v: 0.35, priv: 1 },
  clerk: { n: '公司职员', m: 1.5, risk: 0.05, hl: -1, h: -1, priv: 1 },
  tech: { n: '互联网公司程序员', m: 2.6, risk: 0.08, hl: -3, h: -2, priv: 1 },
  engineer: { n: '工程师', m: 2.2, risk: 0.04, hl: -1, h: 0, priv: 1 },
  teacher: { n: '教师', m: 2.1, risk: 0, hl: 0, h: 1, stable: 1 },
  doctor: { n: '医生', m: 2.4, risk: 0, hl: -2, h: 0, stable: 1 },
  nurse: { n: '护士', m: 1.6, risk: 0, hl: -2, h: 0, stable: 1 },
  civil: { n: '公务员', m: 2.0, risk: 0, hl: 0, h: 1, stable: 1 },
  boss: { n: '小老板', m: 2.4, risk: 0.09, hl: -2, h: 0, v: 0.7 },
  seeking: { n: '待业', m: 0 },
  student: { n: '学生', m: 0 },
  retired: { n: '退休', m: 0 },
  home: { n: '在家', m: 0 },
};
const isWorking = () => !!(S.job && JOBS[S.job] && JOBS[S.job].m > 0);
// 学历溢价：CGSS 2010–2017 估计 高中/初中 1.20、大专/高中 1.25、本科/大专 1.17；一部分已体现在职业差异里，这里只取约一半
const EDU_WAGE = [1, 1, 1, 1.06, 1.06, 1.12, 1.2, 1.28];
const eduWageK = () => EDU_WAGE[S.edu] * ({ top: 1.1, '211': 1.05 }[S.flags.tier] || 1);
// 工龄曲线：起薪约为职业平均的 75%，前 5 年涨得快（本科毕业 3 年后月收入约比起薪高 40%，麦可思），
// 10 年后约为平均的 1.1 倍，之后持平，50 岁以后逐年略降（中后段为估计）
const expK = () => { const y = S.jobY; const k = y <= 5 ? 0.75 + 0.05 * y : Math.min(1.1, 1 + 0.02 * (y - 5)); return k * (S.age > 50 ? Math.max(0.8, 1 - 0.01 * (S.age - 50)) : 1); };
function hire(job, L) {
  if (L) moveTo(L);
  S.job = job; S.jobY = 0;
  goIndep();
  S.wageK = Math.exp(gauss(0, 0.2)) * (0.85 + S.st.kn / 330) * eduWageK();
  if (JOBS[job] && (JOBS[job].stable || JOBS[job].priv)) S.flags.empIns = 1;
  if (typeof hpfStart === 'function') hpfStart(job);
  S.jobs.push({ job, age: S.age, city: S.loc.city });
  if (!S.headless && JOBS[job] && JOBS[job].m > 0) addDoc(job === 'civil' ? 'civil' : 'job', job === 'civil' ? '录用通知' : JOBS[job].blue ? '务工登记' : '劳动合同', [['岗位', JOBS[job].n], ['工作地', placeName()], ['起始', `${S.birthYear + S.age}年`]]);
}
// 打工去哪座城市：城市越大、收入越高越吸引人（人口 × 收入的三次方，估计）；省内打工的，省会再 ×2；名单外的小城市不作为打工目的地
function pullCity(pid, capK = 1) {
  const p = PBY[pid], pairs = [];
  for (const c of p.cities) {
    const d = typeof CITY !== 'undefined' && CITY[c];
    if (!d || !d.pop) continue;
    pairs.push([c, d.pop * Math.pow((d.incU || p.incU || 5e4) / 5e4, 3) * (c === p.cities[0] ? capK : 1)]);
  }
  return cityLoc(pid, pairs.length ? wpick(pairs) : p.cities[0]);
}
// 外出打工：先按户籍地区决定跨不跨省（统计局 2024），省内大多去省会和较富的城市，跨省去沿海和京津的大城市
// cross 可以指定（例如随迁子女的统计口径）；不指定时按地区比例抽
function migrantCity(cross = null, from = S.home.p) {
  if (cross === null) cross = chance(CROSS_PROV[REGION_OF[from] || 'west']);
  if (!cross) return pullCity(from, 2);
  const lean = MIGRANT_LEAN[LEAN_OF[from]] || {};
  const dests = MIGRANT_DEST.concat([['TJ', 0.5]]).filter(([pid]) => pid !== from).map(([pid, w]) => [pid, w * (lean[pid] || 1)]);
  return pullCity(wpick(dests));
}
// 18 岁以后还待在农村、却要去城里打工时，换到城市
function hireInCity(job) { hire(job, S.loc.kind === 'rural' ? migrantCity() : null); }

const EDU_LV = ['没上过学', '小学', '初中', '高中', '中专/职高', '大专', '本科', '硕士'];

// ===== 名字 =====
function makeName(sex, eth, surname) {
  if (ETH_NAMES[eth] && (eth !== '蒙古族' || chance(0.5))) return { full: pick(ETH_NAMES[eth][sex]), sur: '' };
  const sur = surname || wpick(SURNAMES);
  return { full: sur + pick(GIVEN[sex]), sur };
}

// ===== 兄弟姐妹 =====
// 参数来源见 DATA.md「兄弟姐妹」
const SIB = {
  // 生你时妈妈的年龄（均值、标准差），按你是第几个孩子：2020 年普查分孩次平均生育年龄（城市 / 乡村），减 0.5 岁换算到生育当时（普查表 6-3）
  // 二孩、三孩的抽样均值调低了一些，抵消「妈妈生第一个孩子时至少 20 岁」这条限制把平均年龄往上推的效果；模拟出的结果约为 27.2 / 30.2 / 32.3 岁（普查全国 26.7 / 29.8 / 31.2，三孩仍偏高约 1 岁）
  momAge: { urban: { 1: [27.8, 4.2], 2: [30.5, 4.2], 3: [31.2, 4.5] }, rural: { 1: [25.4, 4], 2: [27.4, 4.2], 3: [29.0, 4.5] } },
  // 第 n 个孩子之后，下一个孩子差几岁（均值、标准差，最少 1 岁）：一二孩间隔，2010 年代全国约 5.5–6 年（按平均生育年龄差，偏高；2017 年全国生育状况抽样调查）；二三孩间隔没有全国数据，估计约 3.5 年
  gap: { 1: [4.8, 2.5], 2: [3.5, 2] },
  // 分孩次出生性别比（女 = 100）：2020 年普查，城市 112.0 / 108.3 / 144.3，乡村 114.1 / 104.9 / 125.4
  srb: { urban: { 1: 112, 2: 108.3, 3: 144.3 }, rural: { 1: 114.1, 2: 104.9, 3: 125.4 } },
  // 已经有 n 个孩子的家庭，以后还会再生一个的比例：全国一孩→二孩约 0.6、二孩→三孩约 0.16–0.19（2017 年全国生育状况抽样调查、北方七省队列研究）；城乡差异没有找到数据，按农村高、城镇低估计
  more: { 1: { urban: 0.5, rural: 0.68 }, 2: { urban: 0.12, rural: 0.25 } },
  // 再生的倾向：[还没有儿子时, 已有儿子时] 的倍数（重男轻女，估计；三孩性别比 132 远高于二孩 107）
  noSon: { 1: [1.3, 0.8], 2: [2.2, 0.65] },
  momMax: 42, // 妈妈超过这个年龄一般不再生
};
const UR = () => S.rural ? 'rural' : 'urban';
const boyOf = order => { const r = SIB.srb[UR()][Math.min(3, order)]; return chance(r / (100 + r)); };
// 你上面的哥哥姐姐是男是女：按分孩次性别比抽，再按「没有儿子更可能接着生」加权（拒绝抽样）
function olderSibSexes(n) {
  let kMax = 1; for (let i = 1; i <= n; i++) kMax *= Math.max(...SIB.noSon[Math.min(2, i)]);
  for (let t = 0; t < 50; t++) {
    const sx = []; for (let i = 1; i <= n; i++) sx.push(boyOf(i) ? 'M' : 'F');
    let w = 1;
    for (let i = 1; i <= n; i++) { const k = SIB.noSon[Math.min(2, i)]; w *= sx.slice(0, i).includes('M') ? k[1] : k[0]; }
    if (chance(w / kMax)) return sx;
  }
  return Array.from({ length: n }, () => chance(0.5) ? 'M' : 'F');
}
// 以后还会不会有弟弟妹妹：出生时就定好在你几岁时出生
function planNextSib() {
  const f = S.fam, n = 1 + f.sibs.length;
  S.flags.nextSib = null;
  if (n >= 3 || !SIB.more[n]) return;
  const hasSon = S.sex === 'M' || f.sibs.some(s => s.sex === 'M');
  const p = SIB.more[n][S.rural ? 'rural' : 'urban'] * SIB.noSon[n][hasSon ? 1 : 0];
  if (!chance(Math.min(0.95, p))) return;
  const at = S.age + Math.max(1, Math.round(gauss(...SIB.gap[n]))); // 这个函数总在最小的孩子刚出生时调用
  if (f.mom.age + (at - S.age) > SIB.momMax) return;
  S.flags.nextSib = at;
}
function newSib() {
  const f = S.fam, sx = boyOf(2 + f.sibs.length) ? 'M' : 'F';
  f.sibs.push({ rel: sx === 'M' ? '弟弟' : '妹妹', sex: sx, age: 0 });
  eff({ h: -1, so: 2 });
  log(`家里多了一个${sx === 'M' ? '弟弟' : '妹妹'}。大人的注意力一下子都跑到了小婴儿身上。`, 'ev');
  planNextSib();
}

// ===== 出生 =====
function birth(seed, opts = {}) {
  S = {
    v: 1, seed, rs: seed | 0, age: 0, t: 0, birthYear: opts.year || 2026, birthMonth: 1,
    st: {}, flags: {}, done: {}, recent: [], log: [], years: [], queue: [], fT: {}, notes: [], places: [], jobs: [],
    stats: { maxMoney: 0 }, phase: 'life', money: 0, income: 0, job: null, jobY: 0, wageK: 1,
    school: null, schoolEnd: null, edu: 0, house: null, focus: null, pending: null, headless: !!opts.headless,
  };
  S.birthMonth = ri(1, 12);
  const p = wpick(PROVS.map(x => [x, x.b]));
  S.born = p.id;
  S.rural = !chance(p.u / 100);
  S.order = wpick([[1, NATION.order[0]], [2, NATION.order[1]], [3, NATION.order[2]]]); // 你是第几个孩子（孩次结构，国家统计局）
  S.sex = boyOf(S.order) ? 'M' : 'F'; // 分孩次出生性别比
  let eth = '汉族', r = rnd();
  for (const [e, sh] of p.eth) { if (r < sh) { eth = e; break; } r -= sh; }
  S.eth = eth;
  const L = cityLoc(p.id);
  if (S.rural) L.kind = 'rural';
  S.loc = L; S.home = { ...L }; S.places = [L.city];
  const nm = makeName(S.sex, eth);
  S.name = nm.full; S.surname = nm.sur;

  // 父母：和你本人同一套「学历 → 职业 → 工资」逻辑生成；家境由他们的收入反推（js/parents.js）
  // 哥哥姐姐：相邻两个孩子差几岁随机抽；妈妈生第一个孩子时至少 20 岁
  const gaps = []; for (let i = 1; i < S.order; i++) gaps.push(Math.max(1, Math.round(gauss(...SIB.gap[i]))));
  const span = gaps.reduce((a, b) => a + b, 0);
  const momAge = Math.round(clamp(Math.max(gauss(...SIB.momAge[UR()][S.order]), span + 20 + Math.max(0, gauss(1, 2))), 19, 45));
  S.fam = {
    mom: makeParent('F', momAge, S.rural, p.id),
    dad: makeParent('M', Math.round(clamp(momAge + gauss(2.5, 2.5), 20, 55)), S.rural, p.id),
    sibs: [], partner: null, married: false, kids: [], dating: null,
  };
  S.indep = false;
  S.famMoney = 0; // 出生后在 planYear 之前设置
  S.flags.solo = chance(S.sex === 'M' ? 0.045 : 0.015); // 有些人一辈子没有结婚（2020年普查45–49岁未婚：男4.4%、女1.3%）
  const sexes = olderSibSexes(S.order - 1);
  let age = span;
  for (let i = 0; i < S.order - 1; i++) { S.fam.sibs.push({ rel: sexes[i] === 'M' ? '哥哥' : '姐姐', sex: sexes[i], age }); age -= gaps[i]; }
  planNextSib();

  // 留守 / 随迁
  // 夫妻常常一起外出打工
  if (S.fam.dad.jk === 'migrant' && S.rural && S.fam.mom.jk !== 'migrant' && chance(0.6)) setParentJob(S.fam.mom, 'migrant');
  const dm = S.fam.dad.jk === 'migrant', mm = S.fam.mom.jk === 'migrant';
  // 2024 年义务教育阶段：随迁子女 1309 万（外省迁入 47%、本省外县 53%），农村留守儿童 858 万（统计年鉴 21-12）
  if (dm && mm) {
    // 随迁子女里外省迁入占 47%，高于外出农民工整体的跨省比例 38.3%；按地区比例同步放大
    if (chance(0.6)) { S.flags.mig = 1; moveTo(migrantCity(chance(Math.min(0.9, CROSS_PROV[REGION_OF[p.id] || 'west'] * 0.47 / 0.383)))); }
    else { S.flags.lb = 'both'; S.flags.carer = chance(0.7) ? '奶奶' : '外婆'; }
  } else if ((dm || mm) && LABOR_OUT.has(p.id)) S.flags.lb = 'one';

  S.st = {
    hl: clamp(gauss(76, 7) - (S.rural ? 2 : 0), 30, 98),
    h: clamp(gauss(62, 6), 30, 90),
    kn: clamp(gauss(48, 10), 10, 90), // 家境的影响在建档后补上
    so: clamp(gauss(55, 7), 25, 85),
  };
  familyIncomeInit(); // 家境由父母收入决定
  S.st.kn = clamp(S.st.kn + (S.q - 3) * 3 + (Math.max(S.fam.mom.edu, S.fam.dad.edu) - 4) * 1.5, 10, 90); // 家境、父母学历
  famHouseInit();
  famWealthInit(); // 家里原有的积蓄和欠款
  log(birthText(), 'birth');
  addDoc('birth', '出生登记表', [['姓名', S.name], ['性别', S.sex === 'M' ? '男' : '女'], ['民族', S.eth], ['出生日期', `${S.birthYear}年${S.birthMonth}月`], ['出生地', placeName()], ['户籍', S.rural ? '农村' : '城镇']]);
  planYear();
  return S;
}
function birthText() {
  const f = S.fam;
  const order = S.order === 1 ? '你是家里第一个孩子' : `你上面有${f.sibs.map(s => s.rel).join('和')}`;
  const where = S.flags.mig ? `出生在${placeName()}。你的户口在${placeName(S.home)}，爸妈在这里打工` : `出生在${placeName()}`;
  return `${S.birthYear}年${S.birthMonth}月，你${where}，是个${S.sex === 'M' ? '男孩' : '女孩'}。${order}。`;
}
function carer() { return S.flags.lb === 'both' ? S.flags.carer : '妈妈'; }

// ===== 证件：人生每个关口往档案里放一份 =====
// k: 证件类型（决定样式），title: 名称，rows: [[栏目, 内容]...]
function addDoc(k, title, rows) {
  if (!S.docs) S.docs = [];
  S.docs.push({ k, title, a: S.age, y: S.birthYear + S.age, rows: rows.filter(r => r && r[1] != null && r[1] !== '') });
}

// ===== 记录 =====
function log(t, k = 'ev', f = null) { S.log.unshift({ a: S.age, t, k, f }); }
function out(r, kind = 'ev') { if (!r) return; if (typeof r === 'string') log(r, kind); else log(r.t, r.k || kind, r.f || null); }
function eff(o) {
  for (const k in o) {
    if (k === 'money') { if (S.indep === false) S.famMoney += o.money; else S.money += o.money; }
    // 学识：越高越难再提高（边际递减）
    else if (k === 'kn' && o.kn > 0) S.st.kn = clamp(S.st.kn + o.kn * (1 - S.st.kn / 115), 0, 100);
    else S.st[k] = clamp(S.st[k] + o[k], 0, 100);
  }
}
// 经济独立：开始工作（或毕业/辍学后离开学校）才有自己的账户；之前钱的进出都算家里的
function goIndep() {
  if (S.indep !== false) return;
  S.indep = true; S.indepAt = S.age;
  if (S.famMoney < 0 && S.flags.stuLoan) { S.money += S.famMoney; S.famMoney = 0; log(`开始工作时，身上还背着${wan(-S.money)}的助学贷款。`, 'ev'); }
}
// 家庭每年的结余：家庭人均可支配收入 × 3 口人 × 储蓄率（按家境），减去孩子上学的开销
// 家庭净储蓄率（扣掉盖房、人情、看病等大额开销后，估计）；2024 年农村居民（收入−消费）÷收入约 17%，城镇约 34%
const FAM_SAVE = [0.02, 0.04, 0.06, 0.1, 0.15];
// 有非房贷的欠款（盖房、看病、办婚事、做生意，多是向亲戚借的，一般不算利息）时，家里先还债、不再存钱，每年能拿出收入的这么多（按家境，估计）。
// 参考：2024 年（收入 − 消费）÷ 收入，农村约 17%，城镇约 34%。欠得越多、家里越穷，还得越久。
const FAM_REPAY = { rural: [0.06, 0.1, 0.14, 0.18, 0.25], urban: [0.1, 0.16, 0.22, 0.28, 0.35] };
const SCHOOL_COST = { 高中: 3000, 职高: 2000, 复读: 6000, 大专: 18000, 本科: 20000, 硕士: 22000 };
function familyMoneyYear() {
  const f = S.fam, alive = ['mom', 'dad'].filter(k => f[k].alive);
  if (!alive.length) { inherit(); return; }
  // 收入：在职按职业分摊的工资，退休后是养老金
  const inc = alive.reduce((t, k) => t + parentIncome(k), 0);
  const working = alive.some(k => !parentRetired(f[k], k === 'dad'));
  // 开销：还有人在上班时，按家境的净储蓄率存钱；都退休以后，按当地消费水平的七成算老人的生活费（估计），再加看病
  const home = { ...S.home, kind: S.home.kind };
  const mortgage = S.famDebtWhy === '房贷';
  // 还在还其他欠款的年份，家里省下的钱先拿去还债，不再往存款里放
  let net = working ? (S.famDebt > 0 && !mortgage ? 0 : inc * FAM_SAVE[S.q - 1]) : inc - placeCons(home) * 0.7 * alive.length;
  for (const k of alive) if (f[k].ill) net -= placeCons(home) * 0.3;
  S.famMoney += net;
  if (S.famDebt > 0) famDebtYear(inc, working, mortgage);
  if (S.indep === false && S.school) {
    const fee = (SCHOOL_COST[S.school] || 0) * (S.flags.uni && S.flags.uni.tier === 'minban' && S.school === '本科' ? 2.2 : 1);
    S.famMoney -= fee;
    if (S.famMoney < 0 && ['大专', '本科', '硕士'].includes(S.school) && !S.flags.stuLoan) {
      S.flags.stuLoan = 1;
      log('家里拿不出学费和生活费，你申请了生源地信用助学贷款。', 'ev', '国家助学贷款：本专科学生每人每年最高 2 万元，在读期间免息');
    }
  }
  // 父母都不上班以后，存款花光了，由已经工作的子女补贴生活费（兄弟姐妹一起分摊）；父母还在上班时，欠款由他们自己慢慢还
  if (S.indep && S.famMoney < 0 && !working) {
    const share = -S.famMoney / (1 + f.sibs.length);
    S.money -= share; S.famMoney = 0; S.flags.supportY = (S.flags.supportY || 0) + 1;
    S.stats.support = (S.stats.support || 0) + share;
    if (S.flags.supportY === 1) log(`父母的积蓄花完了，养老金不够用。你开始每年给他们寄生活费，今年寄了${wan(share)}。`, 'ev', '2024 年城乡居民养老金人均每年约 2,950 元，城镇职工约 4.6 万元（中国统计年鉴 24-26、24-27）');
  }
  // 存款年利息约 1.5%；欠款大多是房贷或向亲戚借的，平均按约 2% 计（估计）
  S.famMoney *= S.famMoney > 0 ? 1.015 : 1.02;
}
// 父母还欠款：
// · 房贷：按商贷利率等额本息，每月从工资里扣（家里照常存钱）；父母都退休后从存款里扣
// · 其他借款：用家里每年省下的钱还（见 FAM_REPAY），不计利息；父母都退休后，有存款就先拿存款还清
function famDebtYear(inc, working, mortgage) {
  const before = S.famDebt;
  let pay;
  if (mortgage) {
    const r = LOAN_RULES.comRate, n = Math.max(1, S.famDebtYears || 1);
    pay = Math.min(S.famDebt * (1 + r), annualPay(S.famDebt, r, n));
    S.famDebt = S.famDebt * (1 + r) - pay; S.famDebtYears = n - 1;
    if (!working) S.famMoney -= pay;
  } else if (working) {
    pay = Math.min(S.famDebt, inc * FAM_REPAY[S.rural ? 'rural' : 'urban'][S.q - 1]);
    S.famDebt -= pay;
    S.famDebtYears = pay > 0 ? Math.ceil(S.famDebt / pay) : 99;
  } else {
    pay = Math.min(S.famDebt, Math.max(0, S.famMoney));
    S.famDebt -= pay; S.famMoney -= pay; S.famDebtYears = S.famDebt > 0 ? 99 : 0;
  }
  if (S.famDebt < 100) {
    S.famDebt = 0; S.famDebtYears = 0;
    if (S.famDebt0 >= 1e4) log(famDebtPaidText(), 'ev');
  }
  return before - S.famDebt;
}
function famDebtPaidText() {
  const w = S.famDebtWhy, d = wan(S.famDebt0);
  if (w === '房贷') return '家里的房贷还清了。';
  if (w === '车贷和消费贷') return `家里的车贷和消费贷（当初${d}）还清了。`;
  const how = { 盖房子: '盖房子借的', 看病: '看病借的', '办婚事、彩礼': '办婚事、出彩礼借的', 做生意: '做生意欠下的' }[w] || '借的';
  return `家里当年${how}${d}，这一年终于还清了。`;
}
// 父母都去世以后：存款和房子由兄弟姐妹平分
function inherit() {
  if (S.flags.inherited) return;
  S.flags.inherited = 1;
  // 父母的欠款先用遗产抵；子女不承担超出遗产的债务
  const H = S.famHouse || { v: 0 }, total = Math.max(0, (S.famMoney || 0) + (H.v || 0) - (S.famDebt || 0));
  S.famDebt = 0;
  const share = total / (1 + S.fam.sibs.length);
  S.famMoney = 0; S.famHouse = { ...H, type: 'gone', v: 0 };
  if (share < 1000) return;
  if (S.indep === false) { S.famMoney = share; return; }
  S.money += share; S.stats.inherit = share;
  log(`父母都走了。${H.v ? '老房子和' : ''}存款${S.fam.sibs.length ? `由兄弟姐妹${1 + S.fam.sibs.length}人分了，` : '都留给了你，'}你分到约${wan(share)}。`, 'ev');
}
// ===== 每年的重心 =====
const FOCUS = {
  study: { n: '学习', d: '多花时间读书、写作业', e: { kn: 3, h: -2, so: -1 }, ok: () => S.age >= 6 && (S.school || S.age < 18) },
  play: { n: '玩耍', d: '跑出去玩、看动画、打游戏', e: { h: 4, kn: -1, so: 1 }, ok: () => S.age >= 6 && S.age < 18 },
  friends: { n: '朋友', d: '和朋友待在一起', e: { so: 5, h: 2, kn: -1 }, ok: () => S.age >= 6 },
  sport: { n: '运动', d: '跑步、打球、跳绳', e: { hl: 3, h: 1 }, ok: () => S.age >= 6 && S.age < 60 },
  work: { n: '工作', d: '加班、学技能、争取升职', e: { h: -2, hl: -2, so: -1 }, ok: () => isWorking() },
  love: { n: '恋爱', d: '多出去认识人', e: { so: 2, h: 1 }, ok: () => S.age >= 18 && S.age < 45 && !S.fam.married },
  family: { n: '家人', d: '陪伴家人', e: { so: 4, h: 3 }, ok: () => S.age >= 22 },
  hobby: { n: '爱好', d: '做自己喜欢的事', e: { h: 4, so: 1 }, ok: () => S.age >= 18 },
  rest: { n: '养身体', d: '好好吃饭睡觉，按时体检', e: { hl: 4, h: 1 }, ok: () => S.age >= 18 },
};
const focusList = () => Object.keys(FOCUS).filter(k => FOCUS[k].ok());
function autoFocus() {
  const l = focusList(); if (!l.length) return null;
  const w = { study: S.school ? 3 : 1, play: 2, friends: 1.5, sport: 1, work: 3, love: S.age < 32 ? 2 : 0.5, family: S.fam.married ? 2.5 : 1, hobby: 1, rest: S.age > 50 ? 2.5 : 0.8 };
  return wpick(l.map(k => [k, w[k] || 1]));
}
function applyFocus() {
  if (S.headless || S.auto) S.fT = { [autoFocus() || 'none']: 1 };
  let tot = 0; for (const k in S.fT) tot += S.fT[k];
  if (!tot) return;
  for (const k in S.fT) {
    const f = FOCUS[k]; if (!f || !f.ok()) continue;
    const w = S.fT[k] / tot;
    for (const s in f.e) S.st[s] = clamp(S.st[s] + f.e[s] * w * (s === 'kn' && f.e[s] > 0 ? 1 - S.st.kn / 115 : 1), 0, 100);
    if (k === 'work' && w > 0.4 && chance(0.22 * w)) { S.wageK *= 1.12; log('工作上很拼，这一年涨了工资。', 'good'); }
    if (k === 'love' && w > 0.4) S.flags.loveBoost = 1;
  }
}

// ===== 年度计划 =====
const MILESTONES = [1, 5, 15, 30, 50, 65, 80, 90, 100];
const REFLECT = {
  15: '这个孩子15岁了。你15岁的时候，在为什么事情烦恼？',
  30: '30岁的这个人，和30岁的你（或将来的你），过的日子像吗？',
  50: '如果能回到某一年重新选一次，这个人会选哪一年？你呢？',
  70: '这一生里，哪些是这个人自己选的，哪些是出生那一刻就决定了的？',
};
function planYear() {
  yearStart();
  if (S.phase !== 'life') return;
  S.queue = []; S.fT = {};
  const n = S.age < 6 ? 2 : 3, used = new Set();
  for (let i = 0; i < n; i++) {
    const id = chooseEvent(used);
    if (id) { used.add(id); S.queue.push({ at: 0.1 + (i + rnd() * 0.8) / n * 0.8, type: 'ev', id }); }
  }
  dueDecisions().slice(0, 2).forEach((id, i) => S.queue.push({ at: 0.3 + i * 0.3 + rnd() * 0.1, type: 'dec', id }));
  if (typeof loveQueue === 'function') loveQueue();
  if (MILESTONES.includes(S.age)) S.queue.push({ at: 0.02, type: 'ms' });
  if (!S.headless && REFLECT[S.age]) S.queue.push({ at: 0.92, type: 'ref' });
  S.queue.sort((a, b) => a.at - b.at);
  if (S.focus && !(FOCUS[S.focus] && FOCUS[S.focus].ok())) S.focus = null;
  if (!S.focus && focusList().length) S.focus = autoFocus();
}
// 「平静的一段时间」：给低权重事件一个参照，避免总有事情发生
const QUIET_W = a => a < 18 ? 1.5 : 5;
function chooseEvent(used) {
  const w = [[null, QUIET_W(S.age)]];
  for (const ev of EVENTS) {
    if (S.age < ev.a[0] || S.age > ev.a[1] || used.has(ev.id)) continue;
    if (ev.once && S.done[ev.id] != null) continue;
    if (ev.gap && S.done[ev.id] != null && S.age - S.done[ev.id] < ev.gap) continue;
    if (ev.c && !ev.c()) continue;
    let wt = typeof ev.w === 'function' ? ev.w() : (ev.w == null ? 1 : ev.w);
    if (S.recent.includes(ev.id)) wt *= 0.1;
    if (wt > 0) w.push([ev.id, wt]);
  }
  return wpick(w);
}

// ===== 推进 =====
function tick(dtYears) {
  if (!S || S.phase !== 'life' || S.pending) return;
  const nt = S.t + dtYears;
  while (S.queue.length && S.queue[0].at <= nt) {
    const e = S.queue.shift();
    S.t = e.at;
    fire(e);
    if (S.pending || S.phase !== 'life') return;
  }
  S.t = Math.min(nt, 1);
  if (S.focus) S.fT[S.focus] = (S.fT[S.focus] || 0) + dtYears;
  if (S.t >= 1) endYear();
}
function fire(e) {
  if (e.type === 'ev') {
    const ev = EVMAP[e.id];
    if (!ev || (ev.c && !ev.c())) return;
    S.done[ev.id] = S.age;
    S.recent = [ev.id, ...S.recent].slice(0, 8);
    out(ev.run());
  } else if (e.type === 'dec') openDec(e.id);
  else if (e.type === 'ms') milestone();
  else if (e.type === 'ref') S.pending = { type: 'ref', q: REFLECT[S.age] };
}
function openDec(id) {
  const D = DEC[id]; if (!D) return;
  const d = D.build(); if (!d) return;
  S.done['dec_' + id] = S.age;
  if (S.headless) { resolveDec(id, d, autoPick(d)); return; }
  S.pending = { type: 'dec', id, d };
}
function autoPick(d) { return wpick(d.choices.filter(c => !c.off).map(c => [c.k, c.w == null ? 1 : c.w])); }
function resolveDec(id, d, k) {
  const c = d.choices.find(x => x.k === k) || { label: k.startsWith('apply:') ? '填报志愿：' + JSON.parse(k.slice(6)).apps.map(a => d.ctx.cands[a.i].name).join('、') : k };
  S.pending = null;
  log(`${d.title} —— ${c.label}`, 'choice');
  out(DEC[id].apply(k, d.ctx || {}));
}
function runHeadlessYear() {
  while (S.phase === 'life' && S.queue.length) fire(S.queue.shift());
  if (S.phase === 'life') endYear();
}

// ===== 年初：入学、退休、孩子长大 =====
function yearStart() {
  const a = S.age, f = S.fam;
  if (S.flags.nextSib === a && f.mom.alive) newSib();
  if (a === 3) {
    if (chance(S.loc.kind === 'rural' ? 0.85 : 0.96)) log(S.loc.kind === 'rural' ? '上了镇上的幼儿园，每天坐校车来回。' : '上幼儿园了。第一天你抱着门框哭，第二天就交到了朋友。', 'ev');
    else log(`没有上幼儿园，每天跟着${carer()}在家附近转。`, 'ev');
  }
  if (a === 6) { S.school = '小学'; S.schoolEnd = 12; log(S.loc.kind === 'rural' ? '背上新书包，走半个小时的山路去村里的小学。' : '上小学了。开学第一天，门口挤满了拍照的家长。', 'ev'); }
  if (a === 12 && S.school === '小学') { S.school = '初中'; S.schoolEnd = 15; S.edu = 1; log(S.loc.kind === 'rural' ? '小学毕业，去镇上读初中。' : '小学毕业，上了初中。', 'ev'); }
  if (isWorking() && a >= retireAge()) retire();
  if (S.job === 'farmer' && a >= 72 && !S.flags.farmStop) { S.flags.farmStop = 1; S.job = 'retired'; S.pension = RESID_PENSION; log('年纪大了，地种不动了，交给了亲戚。', 'ev'); }
  for (const k of f.kids) {
    if (!k.alive) continue;
    k.age = a - k.bornAt;
    if (k.age === 6) log(`${k.name}上小学了。`, 'ev');
    if (k.age === 18) {
      const t = wpick([['考上了一所不错的本科', 0.25 + S.q * 0.06 + (S.edu >= 6 ? 0.2 : 0)], ['考上了大专', 0.5], ['没有继续读书，出去工作了', 0.25 - S.q * 0.03]]);
      k.path = t; log(`${k.name}参加了高考，${t}。`, 'ev');
    }
    if (k.age >= 23 && k.age <= 38 && !k.married && chance(0.11)) { k.married = 1; log(`${k.name}结婚了。`, 'good'); eff({ h: 4, money: -placeInc() * 0.3 }); }
    if (k.married && (k.gk || 0) < 2 && k.age <= 42 && chance(0.12)) { k.gk = (k.gk || 0) + 1; S.flags.grandkids = (S.flags.grandkids || 0) + 1; log(`你当上了${S.sex === 'M' ? '爷爷' : '奶奶'}（或${S.sex === 'M' ? '外公' : '外婆'}）。${k.name}的孩子出生了。`, 'good'); eff({ h: 6, so: 4 }); }
  }
}
function retireAge() {
  if (S.sex === 'M') return 63;
  return JOBS[S.job] && JOBS[S.job].blue ? 55 : 58;
}
// 城乡居民养老金：2025 年实际人均约 276 元/月（人社部统计公报推算）；城镇职工约 3900 元/月
const RESID_PENSION = 2950; // 全国城乡居民养老金人均（2024 年统计年鉴 24-27）
function retire() {
  addDoc('retire', '退休证', [['原岗位', JOBS[S.job] ? JOBS[S.job].n : ''], ['退休年龄', S.age + '岁']]);
  const resid = ['migrant', 'build', 'rider', 'driver', 'shop', 'farmer'].includes(S.job);
  const last = S.income || placeInc();
  // 养老金：按退休所在省份的实际人均水平（统计年鉴 24-26 / 24-27，2024 年）。
  // 职工养老金再按本人工资相对当地水平上下浮动；机关事业单位略高。
  const pv = PBY[S.loc.p];
  const penE = pv.penE || 45903, penR = pv.penR || RESID_PENSION;
  S.pension = resid ? penR + (S.job === 'shop' ? last * 0.1 : 0)
    : penE * clamp(last / ((pv.incU || pv.inc) * 2.5), 0.6, 1.8) * (JOBS[S.job].stable ? 1.2 : 1);
  S.job = 'retired';
  log(resid ? '到了退休的年纪。只交了城乡居民养老保险，每月领到的养老金不多，日常还得靠积蓄和孩子。' : `退休了，每月有一份养老金，大约是原来工资的${Math.round(S.pension / last * 100)}%。`, 'ev',
    '2025年起，法定退休年龄逐步延迟：男性从60岁延到63岁，女性从50/55岁延到55/58岁');
}

// ===== 年末结算 =====
function endYear() {
  const a = S.age, st = S.st;
  applyFocus();
  if (a >= 68 && st.kn > 25) st.kn -= 0.3;
  if (isWorking()) { const J = JOBS[S.job]; st.hl = clamp(st.hl + (J.hl || 0) * 0.5, 0, 100); st.h = clamp(st.h + (J.h || 0) * 0.5, 0, 100); }
  finances();
  family();
  if (typeof loveYear === 'function') loveYear();
  if (S.phase !== 'life') return;
  drift();
  S.years.push({ a, h: Math.round(st.h), hl: Math.round(st.hl), m: Math.round(S.money), s: statusLabel() });
  if (S.flags.ill && S.flags.ill.treat) { if (illYear()) return; }
  else if (!S.flags.ill && chance(deathProb())) {
    const k = pickCause();
    if (['cancer', 'heart', 'stroke', 'liver', 'resp'].includes(k) && a >= 35 && chance(0.55)) {
      S.flags.ill = { k, at: a };
      addDoc('ill', '诊断书', [['诊断', CAUSE[k]], ['日期', `${S.birthYear + a}年`]]);
      log(DIAG[k], 'bad');
    } else { die(k); return; }
  } else if (S.flags.ill && !S.flags.ill.treat && a > S.flags.ill.at + 1) { die(S.flags.ill.k); return; }
  S.age++; S.t = 0;
  if (S.age >= 110) { die('old'); return; }
  planYear();
}
const SAVE_BASE = 0.2;
const f0 = () => S.fam;
function finances() {
  familyMoneyYear();
  if (S.indep === false && S.job && !S.school && S.age >= 15) goIndep();
  if (S.indep === false) return;
  if (S.age < 16) return;
  const J = JOBS[S.job];
  let inc = 0;
  if (J && J.m) { inc = wageBase() * J.m * S.wageK * expK() * (J.v ? Math.exp(gauss(0, J.v)) : 1); S.jobY++; }
  if (S.job === 'retired') {
    inc = S.pension || 0;
    // 子女赡养：成年子女每人每年给一些（按当地消费水平估计）
    const grown = f0().kids.filter(k => k.alive && S.age - k.bornAt >= 25).length;
    if (grown) inc += placeCons() * 0.35 * Math.min(2, grown);
  }
  S.income = Math.round(inc);
  const f = S.fam, P = placeInc();
  let hh = inc;
  hh -= hpfYear(); // 个人缴的公积金从工资里扣
  if (f.married && f.partner && f.partner.alive) hh += f.partner.inc;
  // 房贷先算：背着房贷的家庭会压缩日常开销（但不低于当地最低生活水平）
  const mort = loanYear();
  houseYear();
  let cost = 0;
  const adult = isWorking() || S.job === 'seeking' || S.job === 'retired' || S.job === 'home';
  if (adult) {
    // 储蓄率模型：全国居民储蓄率 ≈ (可支配收入 − 消费) ÷ 可支配收入 ≈ 32%（2025）。
    // 收入越高于当地水平，存得越多；但开销不低于当地人均消费（最低生活）。
    const adults = f.married && f.partner && f.partner.alive ? 2 : 1;
    const per = hh / adults;
    const sr = per > 0 ? clamp(SAVE_BASE + 0.15 * Math.log(per / P), -0.2, 0.55) : 0;
    cost = Math.max(hh * (1 - sr) - mort * 0.6, placeCons() * adults * (S.job === 'retired' ? 0.6 : 0.9));
    // 养孩子：人均消费里已经摊进了一部分孩子的开销，这里只加额外的教育、看护支出
    for (const k of f.kids) if (k.alive && k.age < 22) cost += placeCons() * 0.25;
    // 在城里租房的人，房租比当地平均水平多出一块（统计里的居住支出多为自有住房折算）
    const ownHere = S.house && S.house.city === S.loc.city;
    if (!ownHere && S.loc.kind !== 'rural' && S.job !== 'retired') { const rent = placeHp() * 45 * 0.018 * 0.6; cost += rent - rentDraw(rent); }
  }
  cost += mort;
  S.money += hh - cost;
  S.money *= S.money > 0 ? 1.015 : 1.04;
  S.relInc = clamp((hh / (f.married ? 1.6 : 1) / P - 1) * 6, -10, 10);
  S.stats.maxMoney = Math.max(S.stats.maxMoney, S.money);
}
function parentQ(p, male) { return lifeTable(leOf(S.born, male ? 'M' : 'F', S.rural) - 3, 0.005, male ? 'M' : 'F').q[Math.min(119, p.age)]; }
function family() {
  const f = S.fam;
  for (const [k, male] of [['mom', false], ['dad', true]]) {
    const p = f[k]; if (!p.alive) continue;
    p.age++;
    if (chance(parentQ(p, male) * (p.ill ? 2 : 1))) {
      p.alive = false; p.diedAt = S.age;
      log(`${male ? '爸爸' : '妈妈'}去世了，享年${p.age}岁。${S.age < 18 ? '你还没有长大。' : ''}`, 'loss');
      eff({ h: S.age < 18 ? -14 : -9, so: -3 });
    } else if (p.age >= 62 && !p.ill && chance(0.03)) p.ill = 1;
  }
  for (const s of f.sibs) s.age++;
  const pt = f.partner;
  if (pt && pt.alive && f.married) {
    pt.age++;
    // 配偶的收入每年按同一套公式更新；到了退休年龄领养老金（约为原来收入的一半，估计）
    if (pt.k != null && !pt.retired) {
      if (!pt.jk && pt.age >= pt.startAge) partnerJob(pt);
      else if (pt.jk) pt.inc = partnerInc(pt);
      if (pt.jk && pt.age >= (pt.sex === 'M' ? 63 : JOBS[pt.jk].blue ? 55 : 58)) { pt.retired = 1; pt.inc = Math.round(pt.inc * 0.5); }
    }
    if (chance(lifeTable(leOf(S.loc.p, pt.sex, false), 0.004, pt.sex).q[Math.min(119, pt.age)])) {
      pt.alive = false; log(`${pt.name}去世了，享年${pt.age}岁。你们一起走过了${S.age - pt.marriedAt}年。`, 'loss'); eff({ h: -15, so: -6 });
    }
  }
  for (const k of f.kids) {
    if (!k.alive) continue;
    const kq = lifeTable(leOf(S.loc.p, k.sex, false), 0.003, k.sex).q[Math.min(119, S.age - k.bornAt)];
    if (chance(kq)) { k.alive = false; log(`${k.name}走了，才${S.age - k.bornAt}岁。没有什么比这更痛。`, 'loss'); eff({ h: -25, so: -5 }); }
  }
}
function drift() {
  const st = S.st, f = S.fam, a = S.age;
  const kids = f.kids.filter(k => k.alive).length;
  const hT = hlExp(a) + (S.q - 3) * 1.5 + (S.money < 0 && a >= 22 ? -3 : 0) + (S.flags.smoke ? -6 : 0) + (S.flags.ill ? -20 : 0);
  st.hl = clamp(st.hl + (hT - st.hl) * 0.18, 1, 100);
  const rel = a < 18 ? (S.q - 3) * 2.5 : (S.relInc || 0);
  const debt = a >= 22 && S.money < -placeInc() ? 7 : 0;
  const hpT = 56 + rel + (f.married && f.partner && f.partner.alive ? 5 : 0) + Math.min(6, kids * 3) + (st.so - 50) * 0.25 + (st.hl - 60) * 0.15
    - debt - (S.flags.lb && a < 16 ? 6 : 0) - (S.job === 'seeking' ? 6 : 0);
  st.h = clamp(st.h + (hpT - st.h) * 0.25, 0, 100);
  const soT = 50 + (f.married ? 8 : 0) + Math.min(9, kids * 3) + (S.flags.lb && a < 16 ? -4 : 0) + (a > 75 ? -6 : 0);
  st.so = clamp(st.so + (soT - st.so) * 0.12, 0, 100);
}
function statusLabel() {
  if (S.age < 3) return '婴儿';
  if (S.age < 6) return '幼儿';
  if (S.school) return `读${S.school}`;
  if (S.job) return S.job === 'retired' ? '退休' : `${JOBS[S.job].n} · ${S.loc.city}`;
  return '';
}

// ===== 死亡 =====
const CAUSE = {
  perinatal: '早产或出生时的并发症', congenital: '先天性疾病', pneumonia: '肺炎', drown: '溺水', traffic: '交通事故', accident: '意外伤害',
  leukemia: '白血病', cancer: '癌症', heart: '心脏病', stroke: '脑卒中（中风）', resp: '慢性呼吸系统疾病', liver: '肝病',
  suicide: '自杀', old: '衰老', disaster: '自然灾害', other: '疾病',
  diabetes: '糖尿病', kidney: '肾病', dementia: '阿尔茨海默病等认知症', maternal: '孕产期并发症',
};
const CAUSE_W = [
  [0, 0, { perinatal: 6, congenital: 2, pneumonia: 1.5, accident: 0.5 }],
  [1, 14, { drown: 3, traffic: 2, accident: 1.5, leukemia: 1.5, congenital: 1.5, other: 1 }],
  [15, 34, { traffic: 3, accident: 1.5, suicide: 1.7, cancer: 1.8, heart: 1.2, other: 0.8, drown: 0.5 }],
  [35, 59, { cancer: 3.8, heart: 1.8, stroke: 1.5, traffic: 0.6, accident: 0.4, liver: 0.5, suicide: 0.5, other: 0.9 }],
  [60, 79, { cancer: 3.0, stroke: 2.4, heart: 2.3, resp: 1.0, other: 1.3 }],
  [80, 200, { heart: 3.0, stroke: 2.5, resp: 1.5, cancer: 1.5, old: 1.5 }],
];
const DIAG = {
  cancer: '体检时发现了一个阴影，进一步检查后，医生说是癌症。',
  heart: '胸口一阵剧痛，被送进医院。医生说是冠心病，心脏的血管堵了。',
  stroke: '一天早上起床时半边身子发麻，被送去医院，确诊是脑卒中。',
  liver: '一直觉得累，查出来是肝硬化。',
  resp: '咳嗽和气短越来越重，确诊为慢性阻塞性肺病。',
};
const hlExp = a => clamp(90 - Math.max(0, a - 22) * 0.8, 15, 90);
const MORT_K = { M: 1.63, F: 1.76 };
function deathProb() {
  const hm = S.age < 15 ? 1 : clamp(Math.exp((hlExp(S.age) - S.st.hl) / 30), 0.6, 2.2);
  // ×MORT_K：抵消“确诊后治愈”带走的那部分死亡，使模拟的平均寿命对上生命表
  return LT().q[Math.min(119, S.age)] * hm * (S.age >= 35 ? MORT_K[S.sex] : 1) * (S.flags.smoke && S.age > 40 ? 1.3 : 1);
}
function pickCause() {
  const tbl = typeof CAUSE_REAL !== 'undefined' ? CAUSE_REAL[S.sex] : CAUSE_W;
  const row = tbl.find(r => S.age >= r[0] && S.age <= r[1]);
  const w = { ...row[2] };
  if (w.suicide && S.st.h < 35) w.suicide *= 2.5;
  if (w.cancer && S.flags.smoke) w.cancer *= 1.4;
  if (w.traffic) w.traffic *= PBY[S.loc.p].trafK || 1; // 各省交通事故死亡率差异（统计年鉴 24-6）
  return wpick(w);
}
// ===== 大病：存活、费用、医保（来源见 research/health.json） =====
// 每年死亡概率按 5 年生存率换算：癌症全国 43.7%（城市 46.7%、农村 33.6%，国家癌症中心 2019–2021）；
// 去三甲约为平均的 1.1 倍、本地医院约 0.8 倍（按城乡差距推算，估计）；不治疗约为 0.2 倍。
// 心梗：院内死亡约 4%，出院后一年约 2.8%；脑卒中：一年死亡 3.3%–13.4%，13%–33% 留下较重残疾。
const ILL = {
  cancer: { die: { big: 0.135, local: 0.19, none: 0.38 }, cost: { big: 120000, local: 55000, none: 10000 } },
  heart: { die: { big: 0.04, local: 0.06, none: 0.2 }, cost: { big: 50000, local: 25000, none: 5000 } },
  stroke: { die: { big: 0.05, local: 0.09, none: 0.2 }, cost: { big: 50000, local: 25000, none: 5000 }, disable: 0.25 },
  liver: { die: { big: 0.15, local: 0.2, none: 0.4 }, cost: { big: 60000, local: 35000, none: 8000 } },
  resp: { die: { big: 0.07, local: 0.09, none: 0.16 }, cost: { big: 20000, local: 10000, none: 3000 } },
};
// 医保：职工医保（正式工作）还是城乡居民医保。住院费用的实际报销比例（含目录外自费）：
// 肺癌研究里职工约 49%、居民约 37%；居民医保在三级医院的目录内报销比例（61.7%）明显低于基层（79.4%）；异地就医再低一些。
const empIns = () => !!(S.hpfOn || S.flags.empIns || (JOBS[S.job] && (JOBS[S.job].stable || JOBS[S.job].priv)));
function reimburse(where) {
  const emp = empIns();
  let r = emp ? (where === 'big' ? 0.47 : 0.55) : (where === 'big' ? 0.33 : 0.45);
  if (where === 'big' && S.loc.kind !== 'big' && S.loc.kind !== 'capital') r -= 0.08; // 异地就医
  return { r: Math.max(0.2, r), emp };
}
const oop = (k, where) => Math.round(ILL[k].cost[where] * (1 - reimburse(where).r) / 1e3) * 1e3;
function illYear() {
  const il = S.flags.ill;
  il.y = (il.y || 0) + 1;
  const p = (ILL[il.k] || ILL.cancer).die[il.treat] * (S.rural && il.k === 'cancer' ? 1.15 : 1);
  if (il.y > 1 && il.treat !== 'none') S.money -= oop(il.k, il.treat) * 0.3; // 之后每年复查、吃药
  if (chance(p)) { die(il.k); return true; }
  if (il.y >= 5 && il.treat !== 'none') { S.flags.ill = null; S.flags.survivor = 1; log('复查结果一直稳定。医生说，可以算是挺过来了。', 'good'); eff({ h: 8 }); }
  return false;
}
function die(k) {
  S.phase = 'end'; S.pending = null; S.queue = [];
  S.death = { age: S.age, cause: k, year: S.birthYear + S.age };
  log(deathText(k), 'death');
}
function deathText(k) {
  const a = S.age;
  if (a === 0) return k === 'perinatal' ? '出生后没多久，你因为早产并发症离开了这个世界。' : `还不满一岁，你因为${CAUSE[k]}离开了这个世界。`;
  if (k === 'suicide') return `${a}岁那年，你在长久的痛苦里结束了自己的生命。`;
  if (k === 'old') return `${a}岁，你在睡梦中安静地走了。`;
  return `${a}岁，你因为${CAUSE[k]}离开了这个世界。`;
}
function milestone() {
  const l = LT().l[S.age], sx = S.sex === 'M' ? '男孩' : '女孩', pv = PBY[S.born].n;
  if (S.age === 5) log(`五岁生日。在${pv}，同年出生的孩子里大约每千人有${Math.max(1, Math.round((1 - l) * 1000))}人没能活到五岁。你走过了这一关。`, 'ms');
  else {
    const pct = l * 100;
    log(`${S.age}岁。同一年在${pv}出生的${sx}里，${pct >= 99.5 ? '几乎所有人都还活着' : `大约${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%还活着`}。`, 'ms');
  }
}

// ===== 同一秒出生的人 =====
function runCompanion(seed) {
  const keep = S;
  birth(seed, { headless: true });
  const c = S;
  const tr = [];
  let guard = 0;
  while (c.phase === 'life' && guard++ < 130) { tr[c.age] = statusLabel(); runHeadlessYear(); }
  S = keep;
  return {
    name: c.name, sex: c.sex, eth: c.eth, born: c.born, place: placeName(c.home), rural: c.rural, q: c.q,
    death: c.death, edu: c.edu, job: mainJob(c), married: c.fam.married, kids: c.fam.kids.length, places: c.places, tr,
  };
}
// 干得最久的那份工作
function mainJob(L) {
  let best = null, span = -1;
  L.jobs.forEach((j, i) => {
    const end = L.jobs[i + 1] ? L.jobs[i + 1].age : (L.death ? L.death.age : L.age);
    if (end - j.age > span && JOBS[j.job].m > 0) { span = end - j.age; best = j.job; }
  });
  return best ? JOBS[best].n : '';
}
function newLife(seed) {
  birth(seed);
  const me = S;
  me.comps = [1, 2, 3, 4].map(i => runCompanion((seed * 31 + i * 7919) | 0));
  S = me;
  return me;
}
