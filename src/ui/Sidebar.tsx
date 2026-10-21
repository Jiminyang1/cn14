// 一生页面的各个栏目：一、基本情况（含家庭成员）；二、体检与鉴定；五、我的经济；
// 右下角的分隔签（材料目录 / 同批建档 / 一生曲线）。结局页也用这里的证件和一生曲线。
import { DocShelf } from './Docs';
import { Head } from './Head';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AX, AX_NAME, CAUSE, EDU_LV, FAM_HOUSE_N, JOBS, PBY, S, axWord, calMonth, calYear, leOf, partnerPay, partnerTrait, persWords, placeName, shownZ, statusLabel,
  loanBal, loanArrears, loanPayY, loveWord, parentIncome, parentRetired, closeWord, parClose, kidClose, parentWorkLoc, awayFromHome, ptJobName, Q_WORD, wan, wanM, monthlyPay, inheritedValue, netWorth, anyParent, opinion, heading, ACTS, actState, forksOf, liveTags,
  type Companion, type Doc, type Partner,
} from '../engine';
import { ageK, game } from '../game/controller';
import { LiveScene } from './Photo';
import { YearProgress } from './Progress';
import { Ib } from './TipLayer';
import { dots, sexW } from './util';
import { cashAmount, cashChange, tierName } from './Finance';
import { openYear } from './Year';
import { loadPast } from '../game/storage';

const neg = (n: boolean) => n ? 'neg' : undefined;
// 还没上小学：小学在满 6 岁以后的那个 9 月入学，6 岁生日到开学之间也还是学龄前
export const preschool = () => !S.school && S.edu === 0 && S.age < 9;

/** 一页档案：栏目序号、标题、右侧小字。m：手机上属于哪个标签（不写就一直显示） */
export function Sec({ no, title, meta, className, m, children }: { no: string; title: string; meta?: ReactNode; className?: string; m?: string; children: ReactNode }) {
  return (
    <section className={'pg' + (className ? ' ' + className : '')} data-m={m}>
      <div className="sec"><span className="no">{no}</span><h3>{title}</h3>{meta != null && <small>{meta}</small>}</div>
      {children}
    </section>
  );
}
const Row = ({ k, v, cls }: { k: ReactNode; v: ReactNode; cls?: string }) => <div className={'row' + (cls ? ' ' + cls : '')}><span className="k">{k}</span><span className="v">{v}</span></div>;

// 收入显示到手的钱，税前用小字跟在后面（g 是一年的税前）
const Gross = ({ g }: { g: number }) => <small>税前 {wanM(g)}</small>;
// 对方（恋爱对象、配偶）的月收入：在职时「到手 Y · 税前 X」，退休后是养老金（不交税）
function PtInc({ p }: { p: Partner }) {
  if (!p.inc) return <>没有收入</>;
  if (p.retired || !p.jk) return <>{(p.retired ? '养老金 ' : '月收入 ') + wanM(p.inc)}</>;
  return <>到手 {wanM(partnerPay(p).net)}<Gross g={p.inc} /></>;
}
// 月收入：到手的钱，税前不一样时（上班的）小字跟在后面
function myInc() {
  const p = monthlyPay();
  if (!p.gross) return '—';
  return <>{p.net !== p.gross && '到手 '}{wanM(p.net * 12)}{p.net !== p.gross && <Gross g={p.gross * 12} />}</>;
}

// ===== 一、基本情况 =====
const SEASON = (m: number) => m >= 3 && m <= 5 ? '春' : m >= 6 && m <= 8 ? '夏' : m >= 9 && m <= 11 ? '秋' : '冬';
function nowWord() {
  const status = statusLabel();
  const study = S.school ? '在读' + S.school : preschool() ? '学龄前' : EDU_LV[S.edu];
  return study + (status && !S.school && S.age >= 16 ? ' · ' + status.split(' · ')[0] : '');
}
const eduWord = () => S.school ? '在读' + S.school : preschool() ? '学龄前' : EDU_LV[S.edu];
const jobWord = () => { if (S.school || !S.job) return '—'; return statusLabel().split(' · ')[0]; };
function marryWord() {
  const f = S.fam, p = f.partner;
  if (f.married && p) return p.alive ? '已婚' : '丧偶'; // 孩子在人际关系里，这里只写婚姻
  if (S.flags.divorced != null) return '离异';
  if (f.dating) return '恋爱中';
  return '未婚';
}
export function Basic() {
  const m = calMonth();
  return (
    <Sec no="一" title="基本情况" meta={<span className="mono">{calYear()}.{String(m).padStart(2, '0')}</span>} className="basic">
      <div className="basic-top">
        <LiveScene />
        <div className="agebox">
          <b>{S.age}</b><span>周岁</span>
          <div className="who-m"><b className="serif">{S.name}</b><small>{placeName(S.loc)} · {nowWord()}</small></div>
        </div>
      </div>
      <div className="f4">
        <span className="k">姓名</span><b className="serif">{S.name}</b><span className="k">性别</span><span>{sexW(S.sex)}</span>
        <span className="k">民族</span><span>{S.eth}</span><span className="k">户籍</span><span>{S.rural ? '农村' : '城镇'}</span>
        <span className="k">学历</span><span>{eduWord()}</span><span className="k">职业</span><span>{jobWord()}</span>
        {S.age >= 18 && <><span className="k">婚姻</span><span>{marryWord()}</span></>}
        <span className="k">现居</span><span className={S.age >= 18 ? undefined : 'wide'}>{placeName(S.loc)}</span>
      </div>
      <div className="seal">在 档</div>
    </Sec>
  );
}

// 家庭成员只写人：谁、多大、做什么、在哪里、关系怎样。钱的事都在「我的经济」里
/** 父母在哪：和你住一起、在外打工的城市、老家 */
function parentWhere(p, ret: boolean) {
  if (S.flags.parWithMe) return '和你住在一起';
  if (p.jk === 'migrant' && !ret) return `在${parentWorkLoc(p).city}打工`;
  if (!awayFromHome()) return S.indep ? '和你在同一座城市' : '和你住在一起';
  return '在' + placeName(S.home);
}
// 发小在哪：各奔东西（echoes.ts 的 palApart）以前是你的同学，之后才看得出去了哪里
const palWhere = (p: NonNullable<NonNullable<typeof S.ppl>['pal']>) => S.done.palApart == null ? (S.age < 19 ? '你的同学' : '在' + S.home.city) : p.fate === 'abroad' ? '在国外' : p.city ? '在' + p.city : '在老家';
const CLOSE = (c: number) => c >= 65 ? '无话不谈' : c >= 45 ? '常联系' : c >= 25 ? '偶尔联系' : '很少联系';
/** 对方在哪：同一座城市不写，异地写城市 */
const ptWhere = (p: Partner) => p.city && p.city !== S.loc.city ? `异地，在${p.city}` : `也在${S.loc.city}`;
// ===== 右下角「人际关系」：亲疏名单 =====
// 分三组：家里（父母、兄弟姐妹）、自己的家（恋人或配偶、孩子、孙辈）、朋友（还在来往的发小）。只列现在还在你生活里的人：初恋这种只是喜欢过的不列
// 一行一个人：像素头像 | 关系 名字 年纪 + 一行事实（做什么、在哪、多少年） | 右边五格亲疏和一个词。走了的人头像变灰，写享年
type Tone = 'hi' | 'mid' | 'lo';
type Close = [string, Tone, number];
// 颜色跟着词走：亲近的绿、平常的墨色、疏远或冷淡的红（分界和 closeWord、loveWord、CLOSE 一样）
const tone = (c: number, hi: number, lo: number): Tone => c >= hi ? 'hi' : c >= lo ? 'mid' : 'lo';
const kin = (c: number): Close => [closeWord(c), tone(c, 55, 55), c];        // 很亲、还算亲 / 有点疏远、很少联系
const love = (c: number): Close => ['感情' + loveWord(c), tone(c, 58, 42), c]; // 很好、不错 / 一般 / 有点冷淡
const pals = (c: number): Close => [CLOSE(c), tone(c, 45, 25), c];           // 无话不谈、常联系 / 偶尔联系 / 很少联系
type Who = { sex: 'M' | 'F'; age: number; id: string };
function Person({ rel, name, age, facts, close, gone, who }: { rel: string; name?: string; age?: number | string; facts?: (string | false | null | undefined)[]; close?: Close; gone?: boolean; who: Who }) {
  const fs = (facts || []).filter(Boolean) as string[];
  return <div className={'pp' + (gone ? ' gone' : '')}>
    <span className="pp-ph"><Head {...who} /></span>
    <div className="pp-m">
      <div className="pp-n"><span>{rel}</span>{name && <b>{name}</b>}{age != null && <em>{typeof age === 'number' ? age + '岁' : age}</em>}</div>
      {fs.length > 0 && <div className="pp-f" title={fs.join(' · ')}>{fs.join(' · ')}</div>}
    </div>
    {close && <div className={'pp-c ' + close[1]} title={close[0]}>
      <span className="pp-meter" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} className={i < Math.max(1, Math.round(close[2] / 20)) ? 'f' : ''} />)}</span>
      <small>{close[0]}</small>
    </div>}
  </div>;
}
function Group({ n, meta, children }: { n: string; meta?: string; children: ReactNode }) {
  return <div className="pp-g"><div className="pp-h"><span>{n}</span>{meta && <small>{meta}</small>}</div>{children}</div>;
}
function ParentP({ who }: { who: 'mom' | 'dad' }) {
  const p = S.fam[who], male = who === 'dad', ret = parentRetired(p, male);
  return <Person rel={male ? '父亲' : '母亲'} age={p.age} facts={[ret ? '退休了' : p.job, parentWhere(p, ret)]} close={S.age >= 18 && S.indep ? kin(parClose()) : undefined}
    who={{ sex: male ? 'M' : 'F', age: p.age, id: who + S.seed }} />;
}
const SIB_SEX: Record<string, 'M' | 'F'> = { 哥哥: 'M', 弟弟: 'M', 姐姐: 'F', 妹妹: 'F' };
const youThen = (a?: number | null) => a != null && `你${a}岁那年`;
export function People() {
  const f = S.fam, F = S.flags, d = f.dating, pt = f.partner, pal = S.ppl?.pal;
  const ptStudy = !!pt && !pt.retired && pt.k != null && !pt.jk; // 配偶还在读书：职业一栏已经写了「本科在读」
  const homeMeta = F.lb === 'both' && S.age < 16 ? `在外打工 · ${F.carer}照看` : F.parDiv ? '父母已离婚' : undefined;
  // 走了的人不留在各自的组里，收到最下面的「已故」：上面只看还在你生活里的人
  const gone: ReactNode[] = [];
  const home: ReactNode[] = [];
  for (const who of ['dad', 'mom'] as const) {
    const p = f[who], male = who === 'dad', w: Who = { sex: male ? 'M' : 'F', age: p.age, id: who + S.seed };
    if (p.alive) home.push(<ParentP key={who} who={who} />);
    else gone.push(<Person key={who} rel={male ? '父亲' : '母亲'} age={'享年' + p.age} facts={[youThen(p.diedAt)]} gone who={w} />);
  }
  f.sibs.forEach((x, i) => {
    const w = { sex: x.sex || SIB_SEX[x.rel] || 'M', age: x.age, id: 'sib' + i + S.seed };
    if (x.alive) home.push(<Person key={'s' + i} rel={x.rel} age={x.age} facts={[x.married != null && '成家了']} who={w} />);
    else gone.push(<Person key={'s' + i} rel={x.rel} age={'享年' + x.age} facts={[youThen(x.diedAt)]} gone who={w} />);
  });
  const mine: ReactNode[] = [];
  if (d) mine.push(<Person key="d" rel={d.sex === 'M' ? '男朋友' : '女朋友'} name={d.name} age={d.age} who={{ sex: d.sex, age: d.age, id: d.name }}
    facts={[partnerTrait(d), d.jk ? EDU_LV[d.edu] : EDU_LV[d.edu] + '在读', ptJobName(d), ptWhere(d), PBY[d.home].n + (d.rural ? '农村' : '城里') + '人', S.age - d.metAt ? '在一起' + (S.age - d.metAt) + '年' : '刚在一起']}
    close={d.love != null ? love(d.love) : undefined} />);
  if (pt) {
    const rel = pt.sex === 'M' ? '丈夫' : '妻子', w = { sex: pt.sex, age: pt.age, id: pt.name };
    if (pt.alive) mine.push(<Person key="pt" rel={rel} name={pt.name} age={pt.age} who={w}
      facts={[pt.edu && !ptStudy && EDU_LV[pt.edu], pt.retired ? '退休了' : pt.k != null ? ptJobName(pt) : JOBS[pt.job]?.n, ptWhere(pt)]}
      close={pt.love != null ? love(pt.love) : undefined} />);
    else gone.push(<Person key="pt" rel={rel} name={pt.name} age={'享年' + pt.age} facts={[youThen(F.widowed), pt.marriedAt != null && F.widowed != null && `一起走过了${F.widowed - pt.marriedAt}年`]} gone who={w} />);
  }
  f.kids.forEach((k, i) => {
    const rel = k.sex === 'M' ? '儿子' : '女儿', w = { sex: k.sex, age: k.age, id: k.name };
    if (k.alive) mine.push(<Person key={'k' + i} rel={rel} name={k.name} age={k.age} who={w}
      facts={[k.path && k.path.replace(/^考上了/, ''), k.ex && k.age < 18 && '跟着对方', k.married != null && '成家了']}
      close={k.age >= 12 ? kin(kidClose(k)) : undefined} />);
    else gone.push(<Person key={'k' + i} rel={rel} name={k.name} age={'享年' + k.age} gone who={w} />);
  });
  if (S.flags.grandkids > 0) mine.push(<Person key="g" rel="孙辈" age={S.flags.grandkids + '个'} who={{ sex: 'M', age: 6, id: 'grand' + S.seed }} />);
  const friends: ReactNode[] = [];
  if (pal) {
    const w = { sex: pal.sex, age: S.age, id: pal.name };
    if (pal.alive) friends.push(<Person key="pal" rel="发小" name={pal.name} who={w}
      facts={[palWhere(pal), '认识' + (S.age - pal.at) + '年', pal.loan && (pal.loan.back == null || pal.loan.back > S.age) && `借过${pal.sex === 'M' ? '他' : '她'}${wan(pal.loan.amt)}，还没还`]} close={pals(pal.close)} />);
    else gone.push(<Person key="pal" rel="发小" name={pal.name} age="已去世" gone who={w} />);
  }
  const mineMeta = pt?.alive && pt.marriedAt != null ? `结婚${Math.max(0, S.age - pt.marriedAt)}年` : !f.married && F.divorced ? '离异' : F.widowed != null && !f.married ? '丧偶' : undefined;
  return <>
    <Group n="家里" meta={homeMeta}>{home.length ? home : <p className="note-line" style={{ margin: '4px 0 0' }}>父母和兄弟姐妹都不在了。</p>}</Group>
    {mine.length > 0 && <Group n="自己的家" meta={mineMeta}>{mine}</Group>}
    {friends.length > 0 && <Group n="朋友">{friends}</Group>}
    {gone.length > 0 && <Group n="已故" meta={gone.length + ' 人'}>{gone}</Group>}
  </>;
}

// ===== 二、体检与鉴定 =====
// 横条：当前值 + 一根细竖线标「照这样过下去会停在哪」（engine/status.ts 的 heading）；差三分以上，数字后面一个 ▲▼
// 学识没有目标值，只给方向（kn：每年加减多少）
function Bar({ n, v, c, to, kn }: { n: string; v: number; c: string; to?: number; kn?: number }) {
  const d = to == null ? (kn || 0) * 3 : to - v;
  return <div className="vt"><span>{n}</span><i><u style={{ '--v': v + '%', '--c': `var(${c})` } as React.CSSProperties} />{to != null && <s style={{ left: Math.max(0, Math.min(100, to)) + '%' }} />}</i><b>{Math.round(v)}</b><em className={d > 0 ? 'up' : 'dn'}>{d >= 3 ? '▲' : d <= -3 ? '▼' : ''}</em></div>;
}
// 鉴定意见（engine/status.ts 的 opinion）：一段话；能处理的短语可点，打开「这一年」里对应的行动
function Opinion() {
  const segs = opinion();
  if (!segs.length) return null;
  const go = (g?: { act?: string }) => !!(g?.act && ACTS[g.act] && actState(g.act).ok);
  return <>
    <div className="sub-h">鉴定意见</div>
    <p className="op">{segs.map((g, i) => {
      if (go(segs[i - 1]) && /^[，；。]$/.test(g.t)) return null; // 已经和前面可点的短语放在一起
      if (!go(g)) return <span key={i}>{g.t}</span>;
      // 可点的短语和后面的标点不分开，标点不会落到下一行开头
      const p = segs[i + 1] && /^[，；。]$/.test(segs[i + 1].t) ? segs[i + 1].t : '';
      return <span key={i} className="op-nb"><button type="button" className="op-go" title={ACTS[g.act].n} onClick={() => openYear(ACTS[g.act!].g)}>{g.t}</button>{p}</span>;
    })}</p>
  </>;
}
// 性格：五条刻度，两头是词，不显示数字；离中间超过半个标准差的那一头加重。三岁以前还看不出来
function Personality() {
  if (!S.pers) return null;
  if (S.age < 3) return <><div className="sub-h">性格</div><p className="note-line" style={{ marginTop: 2 }}>还小，看不出来。</p></>;
  const z = shownZ(), words = persWords(z, 3);
  return <>
    <div className="sub-h">性格<small>随经历和年纪慢慢变</small></div>
    {AX.map(x => {
      const v = Math.max(-2.4, Math.min(2.4, z[x]));
      return <div key={x} className="pt" title={axWord(x, v) || '居中'}>
        <span className={v <= -0.5 ? 'on' : ''}>{AX_NAME[x][1]}</span>
        <i><u style={{ '--v': (50 + v * 20) + '%' } as React.CSSProperties} /></i>
        <span className={v >= 0.5 ? 'on' : ''}>{AX_NAME[x][0]}</span>
      </div>;
    })}
    <p className="note-line"><span className="serif" style={{ marginRight: 6 }}>评语</span><span style={{ color: 'var(--ink)' }}>{words.length ? words.join('，') + '。' : '性子平和，没有特别突出的地方。'}</span></p>
  </>;
}
export function Body({ m }: { m?: string }) {
  const st = S.st, to = S.age >= 3 ? heading() : null;
  return (
    <Sec no="二" title="体检与鉴定" meta="0–100" m={m}>
      <div className="vts">
        <Bar n="健康" v={st.hl} c="--hl" to={to?.hl} /><Bar n="幸福" v={st.h} c="--h" to={to?.h} />
        <Bar n="学识" v={st.kn} c="--kn" kn={to?.kn} /><Bar n="人际" v={st.so} c="--so" to={to?.so} />
      </div>
      <Opinion />
      <Personality />
    </Sec>
  );
}

// ===== 右下角「岔路口」 =====
// 这一生到现在做过的大抉择（fork），连同当年没选的那几条路；上面一行是已经拿到的人生标签，以前的人生里没见过的标一个「新」
let pastTags: { L: object; s: Set<string> } | null = null; // 封存过的档案只在两局之间变：每一局读一次
function Forks() {
  const forks = forksOf(S), tags = liveTags(S);
  if (pastTags?.L !== S) pastTags = { L: S, s: new Set(loadPast().flatMap(x => x.tags || [])) };
  const seen = pastTags.s;
  if (!forks.length && !tags.length) return <p className="note-line" style={{ margin: 0 }}>还没走到岔路口。</p>;
  return <>
    {tags.length > 0 && <div className="ltags">
      {tags.map(t => <span key={t.k} className={'ltag r' + t.r} title={t.d}>{t.n}{!seen.has(t.k) && <i>新</i>}</span>)}
    </div>}
    {forks.length > 0 && <ol className="fk">
      {forks.map((f, i) => <li key={i}>
        <span className="fk-a mono">{f.a}岁</span>
        <div>
          <b>{f.title}</b>
          <p><span className="chop">定</span>{f.pick}</p>
          <p className="fk-no">没选　{f.alt.slice(0, 3).join(' ／ ')}{f.alt.length > 3 ? ' ……' : ''}</p>
        </div>
      </li>)}
    </ol>}
  </>;
}

// ===== 父母与家庭支持 =====
// 家里的钱：家境几个点、一句话说清楚（爸妈做什么、一个月挣多少、住什么房子、存款和欠款），细账收在折叠里
const PW = { dad: '爸爸', mom: '妈妈' } as const;
export function famLine() {
  const f = S.fam, H = S.famHouse || { type: 'rent' as const, v: 0, where: '' };
  const alive = (['dad', 'mom'] as const).filter(w => f[w].alive);
  const ret = (w: 'dad' | 'mom') => parentRetired(f[w], w === 'dad');
  const doing = (w: 'dad' | 'mom') => {
    const p = f[w];
    if (ret(w)) return '退休了';
    if (p.jk === 'migrant') return `在${p.wloc?.city || '外地'}打工`;
    if (p.jk === 'farmer') return '在家种地';
    if (p.jk === 'home') return S.rural ? '在家种地带孩子' : '在家带孩子';
    return '是' + p.job;
  };
  // 两个人一样的（都退休了、都在家种地、都在同一座城市打工）合成一句
  const jobs = alive.length === 2 && doing('dad') === doing('mom') ? '爸妈都' + doing('dad') : alive.map(w => PW[w] + doing(w)).join('，');
  const inc = parentIncome('mom') + parentIncome('dad');
  const both = alive.length === 2, verb = alive.every(ret) ? '领' : '挣';
  let t = `${jobs}，${both ? '两个人一个月一共' : '一个月'}${verb}${wan(inc / 12)}。`;
  t += H.type === 'self' ? '家里住自己盖的房子' : H.type === 'own' ? `家里在${H.where || '本地'}有一套房子` : H.type === 'rent' ? '一家人租房住' : '家里没有自己的房子';
  const money = S.famMoney || 0, debt = S.famDebt || 0;
  t += money > 1000 ? `，存着${wan(money)}` : '，没什么存款';
  t += debt > 0 ? `，还欠着${wan(debt)}。` : money < -1000 ? `，还欠着${wan(-money)}。` : '。';
  return t;
}
/** 父母家：家境、一句话、细账。经济独立以前展开（那时家里的钱就是你的钱）；之后折叠成一行，点开再看 */
export function Econ({ fold = false }: { fold?: boolean }) {
  const f = S.fam;
  const H = S.famHouse || { type: 'rent' as const, v: 0, where: '' }, anyParent = f.mom.alive || f.dad.alive;
  const alive = (['dad', 'mom'] as const).filter(w => f[w].alive), ret = (w: 'dad' | 'mom') => parentRetired(f[w], w === 'dad');
  const word = alive.every(ret) ? '养老金' : alive.every(w => !ret(w)) ? '月收入' : '收入';
  if (!anyParent) return <div className="fam-econ"><h4 className="fam-h">父母家</h4><p className="fam-line">父母都已经去世。{S.stats.inherit ? `你继承了约 ${wan(S.stats.inherit)}。` : ''}</p></div>;
  const q = <span className="fam-q"><span className="dots">{dots(S.q)}</span><b>{Q_WORD[S.q]}</b></span>;
  const body = <>
    <p className="fam-line">{famLine()}</p>
    {S.flags.supportY > 0 && <p className="fam-line">父母的积蓄已经花完，你每年给他们寄生活费，累计约 {wan(S.stats.support || 0)}。</p>}
    <Row k={<>父母{word}<Ib k="parentsInc" /></>} v={wanM(parentIncome('mom') + parentIncome('dad'))} />
    <Row k={<>住房<Ib k="famHouse" /></>} v={<>{FAM_HOUSE_N[H.type]}{H.v ? ' · 约' + wan(H.v) : ''}{H.where && <small>{H.where}</small>}</>} />
    <Row k={<>存款<Ib k="famMoney" /></>} v={<b className={neg(S.famMoney < 0)}>{S.famMoney < 0 ? '−' : ''}{wan(Math.abs(S.famMoney || 0))}</b>} />
    {S.famDebt > 0 && <Row k={<>欠款<Ib k="famDebt" /></>} v={<b className="neg">{wan(S.famDebt)}</b>} />}
  </>;
  if (!fold) return <div className="fam-econ"><h4 className="fam-h">{S.indep ? '父母家' : '家里'} {q}</h4>{body}</div>;
  return (
    <details className="finance-fold fam-econ">
      <summary><span>父母家{S.flags.supportY > 0 && <small>你在贴补他们</small>}</span>{q}</summary>
      <div className="finance-fold-body">{body}</div>
    </details>
  );
}

// 「我的家」住在哪里：和每月的房租怎么算（finance.ts）一致。住在自己房子所在的城市不付房租；
// 住养老院、搬去和子女同住、去子女家带孙辈也不付；在农村住的是自家的房子；其余是租房
function myHome() {
  const H = S.house, F = S.flags;
  const own = H ? H.city + ' · 约' + wan(H.v) : '';
  if (H && H.city === S.loc.city) return own;
  const now = F.oldLive === 'home' ? '住养老院' : F.oldLive === 'kid' || F.grandHelp ? '住在子女家' : S.loc.kind === 'rural' ? '农村自家的房子' : '租房';
  return H ? `${now}（${own}）` : now;
}

// ===== 五、经济：常驻只放两个数（现金、月收入）和几行事实；细账、走势、行动都在「这一年」里 =====
// 经济独立以前：家里的钱就是你的钱，直接写父母家
export function Account({ m }: { m?: string }) {
  if (S.indep === false) {
    const why = S.school ? '在读' + S.school + '，花销靠家里' : preschool() ? '还小，花销靠家里' : '还没有工作';
    return (
      <Sec no="五" title="经济" meta={why} m={m}>
        <Econ />
      </Sec>
    );
  }
  const f = S.fam, pt = f.partner, mate = f.married && pt?.alive ? pt : null;
  const bill = S.statement, change = bill ? bill.closing - bill.opening : 0;
  const pay = monthlyPay();
  const hh = pay.net + ((S.flags.rehire?.inc || 0) + (mate ? partnerPay(mate).net : 0)) / 12;
  const housing = bill && (bill.rent > 0 || bill.mortgage > 0) ? ` · 每月 ${Math.round(bill.rent + bill.mortgage).toLocaleString('zh-CN')}` : '';
  return (
    <Sec no="五" title="经济" meta={<button type="button" className="sec-link" onClick={() => openYear('book')}>看账本 ›</button>} m={m}>
      <div className="eco-two">
        <div><span>现金<Ib k="myMoney" /></span><b className="mono">{wan(S.money)}</b>{S.debt > 0 ? <small className="neg">欠 {wan(S.debt)}</small> : <small>没有欠款</small>}</div>
        <div><span>{S.job === 'retired' ? '养老金' : '月收入'}<Ib k="myIncome" /></span><b className="mono">{S.job === 'retired' ? wanM(S.pension || 0) : pay.gross ? wan(pay.net) : '—'}</b><small>{mate ? `全家到手 ${wan(hh)}` : S.job === 'retired' ? '每月' : pay.gross ? '到手 · 每月' : '没有工作'}</small></div>
      </div>
      <Row k="住" v={myHome() + housing} />
      {bill && <Row k="过日子" v={`${tierName(bill.tier)} · 每月 ${Math.round(bill.living).toLocaleString('zh-CN')}`} />}
      {bill && <Row k="上个月" v={<b className={change < 0 ? 'neg' : 'money-up'}>{cashChange(change)}</b>} />}
      {loanArrears() > 1 && <p className="account-note neg">房贷逾期 {wan(loanArrears())}</p>}
      {bill?.shortfall > 1 && <p className="account-note neg">上个月缺口 {cashAmount(bill.shortfall)}</p>}
      {anyParent() && <Row k="父母家" v={<button type="button" className="row-link" onClick={() => openYear('par')}><span className="dots">{dots(S.q)}</span> {Q_WORD[S.q]}{S.flags.supportY > 0 ? ' · 在贴补他们' : ''}</button>} />}
    </Sec>
  );
}

// ===== 证件 =====
// 材料目录：最新的在上面，一行一份，点开进证件夹（Docs.tsx）。后来盖的章写成小标签

// 一生曲线：幸福（实线）和健康（虚线），竖虚线是平均寿命
export function Curve({ W = 300, H = 120 }: { W?: number; H?: number }) {
  const ys = S.years, le = leOf(S.born, S.sex, S.rural);
  const maxA = Math.max(100, S.age + 1);
  const x = (a: number) => 8 + a / maxA * (W - 16), y = (v: number) => 8 + (100 - v) / 100 * (H - 26);
  const pts = (k: 'h' | 'hl') => ys.map(r => `${x(r.a).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
  const ticks = [];
  for (let a = 0; a <= maxA; a += 20) ticks.push(a);
  return (
    <div className="curve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="一生曲线">
        <line className="ax" x1="8" x2={W - 8} y1={H - 16} y2={H - 16} />
        {ticks.map(a => <g key={a}><line className="ax" x1={x(a)} x2={x(a)} y1={H - 16} y2={H - 12} /><text x={x(a)} y={H - 2} textAnchor="middle">{a}</text></g>)}
        <line className="le" x1={x(le)} x2={x(le)} y1="6" y2={H - 16} />
        {ys.length > 1 && <><polyline className="lhl" points={pts('hl')} /><polyline className="lh" points={pts('h')} /></>}
      </svg>
      <p className="hint" style={{ margin: '4px 0 0' }}>实线幸福，虚线健康；竖线是{PBY[S.born].n}{S.sex === 'M' ? '男性' : '女性'}的预期寿命 {le.toFixed(0)} 岁。</p>
    </div>
  );
}

// 同一秒建档的人，此刻（同样的年纪）在做什么
function compNow(c: Companion, age: number) {
  if (c.death && c.death.age < age) return { dead: true, t: `${c.death.age}岁离世 · ${CAUSE[c.death.cause]}` };
  return { dead: false, t: c.tr[age] || '' };
}
export function Companions() {
  return <div>{S.comps.map((c, i) => {
    const s = compNow(c, S.age);
    return <div key={i} className={'comp' + (s.dead ? ' dead' : '')}><b>{c.name}</b><span className="muted">{c.place} · {sexW(c.sex)}{c.pw && c.pw.length ? ' · ' + c.pw.join('、') : ''}</span><span className="st">{s.t}</span></div>;
  })}</div>;
}

// ===== 右下角的分隔签 =====
const TABS = [['ppl', '人际关系'], ['fork', '岔路口'], ['doc', '材料目录'], ['peer', '同批建档']] as const;
type Tab = typeof TABS[number][0];
const TAB_KEY = 'cn14.tab';
export function ArchiveTabs({ mtab }: { mtab: string }) {
  const [tab, setTab] = useState<Tab>(() => { try { const t = localStorage.getItem(TAB_KEY) as Tab; return TABS.some(x => x[0] === t) ? t : 'ppl'; } catch { return 'ppl'; } });
  const pick = (k: Tab) => { setTab(k); try { localStorage.setItem(TAB_KEY, k); } catch { /* 存不了也没关系 */ } };
  // 材料目录上提示有几份新材料（上次看材料目录以后发的）；手机上看「材料」标签也算看过
  const docsN = (S.docs || []).length;
  const seen = useRef(docsN);
  if (tab === 'doc' || mtab === 'doc') seen.current = docsN;
  const fresh = docsN - seen.current;
  const forksN = forksOf(S).length;
  return (
    <section className={'pg tabs-card t-' + tab} data-m="home body doc peer">
      <nav className="tabs" role="tablist">
        {TABS.map(([k, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pick(k)}>
            {n}{k === 'doc' && <span className="mono" style={{ fontWeight: 400, marginLeft: 4 }}>{docsN}</span>}{k === 'fork' && forksN > 0 && <span className="mono" style={{ fontWeight: 400, marginLeft: 4 }}>{forksN}</span>}{k === 'doc' && fresh > 0 && <i className="tdot" aria-label={`${fresh} 份新材料`}>新</i>}
          </button>
        ))}
      </nav>
      <div className="tp" data-t="fork" data-m="body"><div className="sub-h m-only" style={{ marginTop: 0 }}>岔路口</div><Forks /></div>
      <div className="tp" data-t="doc" data-m="doc"><DocShelf /></div>
      <div className="tp" data-t="peer" data-m="peer"><p className="note-line" style={{ margin: '0 0 4px' }}>同一秒建档的另外 {S.comps.length} 人 · 此刻也是 {S.age} 岁</p><Companions /></div>
      <div className="tp" data-t="ppl" data-m="home"><People /></div>
    </section>
  );
}
