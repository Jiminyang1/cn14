// 一生页面的各个栏目：一、基本情况（含家庭成员）；二、体检与鉴定；五、我的经济；
// 右下角的分隔签（材料目录 / 同批建档 / 一生曲线）。结局页也用这里的证件和一生曲线。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AX, AX_NAME, CAUSE, EDU_LV, FAM_HOUSE_N, JOBS, PBY, S, axWord, calMonth, calYear, leOf, partnerPay, partnerTrait, persWords, placeName, shownZ, statusLabel,
  loanBal, loanArrears, loanPayY, loveWord, parentIncome, parentRetired, closeWord, parClose, kidClose, parentWorkLoc, awayFromHome, ptJobName, Q_WORD, wan, wanM, monthlyPay, inheritedValue, netWorth, anyParent,
  type Companion, type Doc, type Partner,
} from '../engine';
import { ageK, game } from '../game/controller';
import { LiveScene } from './Photo';
import { YearProgress } from './Progress';
import { Ib } from './TipLayer';
import { dots, sexW } from './util';
import { cashAmount, cashChange, tierName } from './Finance';
import { openYear } from './Year';

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
        <span className="k">现居</span><span className="wide">{placeName(S.loc)}</span>
        <span className="k">现状</span><span className="wide">{nowWord()}</span>
      </div>
      <YearProgress className="yprog" title="这一岁过了多少" />
      <div className="yline"><span>{calYear()}年{m}月 · {SEASON(m)}</span><span className="mono">1年≈{Math.round(game.yearSec / ageK(S.age))}秒</span></div>
      <div className="fam-sub">
        <div className="sub-h">家庭成员<small>{famMeta()}</small></div>
        <FamilyRows />
      </div>
      <div className="seal">在 档</div>
    </Sec>
  );
}

function famMeta() {
  const F = S.flags;
  if (F.lb === 'both' && S.age < 16) return `父母在外打工 · ${F.carer}照看`;
  if (S.fam.married) return '已成家';
  return F.parDiv ? '父母已离婚' : '';
}

// 家庭成员只写人：谁、多大、做什么、在哪里、关系怎样。钱的事都在「我的经济」里
/** 父母在哪：和你住一起、在外打工的城市、老家 */
function parentWhere(p, ret: boolean) {
  if (S.flags.parWithMe) return '和你住在一起';
  if (p.jk === 'migrant' && !ret) return `在${parentWorkLoc(p).city}打工`;
  if (!awayFromHome()) return S.indep ? '和你在同一座城市' : '和你住在一起';
  return '在' + placeName(S.home);
}
function ParentRow({ who, label }: { who: 'mom' | 'dad'; label: string }) {
  const p = S.fam[who], male = who === 'dad';
  if (!p.alive) return <Row k={label} v={'已去世 · 享年' + p.age + '岁'} cls="gone" />;
  const ret = parentRetired(p, male);
  return <Row k={label} v={<>{p.age}岁 · {ret ? '退休了' : p.job}<small>{parentWhere(p, ret)}{S.age >= 18 && S.indep ? ' · ' + closeWord(parClose()) : ''}</small></>} />;
}
// 发小在哪：各奔东西（echoes.ts 的 palApart）以前是你的同学，之后才看得出去了哪里
const palWhere = (p: NonNullable<NonNullable<typeof S.ppl>['pal']>) => S.done.palApart == null ? (S.age < 19 ? '你的同学' : '在' + S.home.city) : p.fate === 'abroad' ? '在国外' : p.city ? '在' + p.city : '在老家';
const CLOSE = (c: number) => c >= 65 ? '无话不谈' : c >= 45 ? '常联系' : c >= 25 ? '偶尔联系' : '很少联系';
/** 对方在哪：同一座城市不写，异地写城市 */
const ptWhere = (p: Partner) => p.city && p.city !== S.loc.city ? `异地，在${p.city}` : `也在${S.loc.city}`;
// 家庭成员：父母、兄弟姐妹、恋人、配偶、孩子
export function FamilyRows() {
  const f = S.fam, d = f.dating, pt = f.partner, pal = S.ppl?.pal;
  const ptStudy = !!pt && !pt.retired && pt.k != null && !pt.jk; // 配偶还在读书：职业一栏已经写了「本科在读」
  return <>
    <ParentRow who="dad" label="父亲" /><ParentRow who="mom" label="母亲" />
    {f.sibs.map((x, i) => <Row key={'s' + i} k={x.rel} v={x.alive ? x.age + '岁' : '已去世'} cls={x.alive ? undefined : 'gone'} />)}
    {d && <Row k={d.sex === 'M' ? '男朋友' : '女朋友'} v={<>{d.name} · {d.age} · {partnerTrait(d)}
      <small>{d.jk ? EDU_LV[d.edu] : EDU_LV[d.edu] + '在读'} · {ptJobName(d)} · {ptWhere(d)} · {PBY[d.home].n}{d.rural ? '农村' : '城里'}人</small>
      <small>{S.age - d.metAt ? '在一起' + (S.age - d.metAt) + '年' : '刚在一起'} · 感情{loveWord(d.love)}</small></>} />}
    {pt && <div className={'row' + (pt.alive ? '' : ' gone')}>
      <span className="k">{pt.sex === 'M' ? '丈夫' : '妻子'}</span>
      {pt.alive ? <details className="v person-details">
        <summary>{pt.name} · {pt.age}岁</summary>
        <small>{pt.edu && !ptStudy ? EDU_LV[pt.edu] + ' · ' : ''}{pt.retired ? '退休' : pt.k != null ? ptJobName(pt) : JOBS[pt.job] ? JOBS[pt.job].n : ''} · {ptWhere(pt)}</small>
        <small>{pt.marriedAt != null ? `结婚${Math.max(0, S.age - pt.marriedAt)}年` : ''}{pt.love != null ? ' · 感情' + loveWord(pt.love) : ''}</small>
      </details> : <span className="v">{pt.name} · 已去世</span>}
    </div>}
    {!f.married && !!S.flags.divorced && <Row k="婚姻" v="离异" />}
    {f.kids.map((k, i) => <Row key={'k' + i} k={k.sex === 'M' ? '儿子' : '女儿'} cls={k.alive ? undefined : 'gone'} v={k.alive ? <>{k.name} · {k.age}岁{k.path ? ' · ' + k.path.replace(/^考上了/, '') : ''}{k.ex && k.age < 18 ? ' · 跟着对方' : ''}{k.age >= 12 && <small>{closeWord(kidClose(k))}</small>}</> : k.name + ' · 已离世'} />)}
    {S.flags.grandkids > 0 && <Row k="孙辈" v={S.flags.grandkids + '人'} />}
    {pal && <Row k="发小" cls={pal.alive ? undefined : 'gone'} v={pal.alive ? <>{pal.name} · 认识{S.age - pal.at}年<small>{palWhere(pal)} · {CLOSE(pal.close)}</small></> : pal.name + ' · 已去世'} />}
  </>;
}

// ===== 二、体检与鉴定 =====
function Bar({ n, v, c }: { n: string; v: number; c: string }) {
  return <div className="vt"><span>{n}</span><i><u style={{ '--v': v + '%', '--c': `var(${c})` } as React.CSSProperties} /></i><b>{Math.round(v)}</b></div>;
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
  const st = S.st;
  return (
    <Sec no="二" title="体检与鉴定" meta="0–100" m={m}>
      <Bar n="健康" v={st.hl} c="--hl" /><Bar n="幸福" v={st.h} c="--h" /><Bar n="学识" v={st.kn} c="--kn" /><Bar n="人际" v={st.so} c="--so" />
      <Personality />
    </Sec>
  );
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
const DOC_SEAL: Record<string, string> = { birth: '登记', admit: '录取', grad: '毕业', school: '学籍', job: '合同', civil: '录用', marry: '婚姻', divorce: '登记', house: '不动产', kid: '出生', ill: '医院', retire: '退休', report: '学校' };
export function DocCard({ d, open, onClick }: { d: Doc; open: boolean; onClick?: () => void }) {
  return (
    <div className={`doc ${d.k}${open ? ' open' : ''}`} onClick={onClick}>
      <h5>{d.title}<small>{d.y}年{d.m}月 · {d.a}岁</small></h5>
      <dl>{d.rows.map((r, i) => <Pair key={i} k={r[0]} v={r[1]} />)}</dl>
      <span className="mini-seal">{DOC_SEAL[d.k] || '档'}</span>
    </div>
  );
}
const Pair = ({ k, v }: { k: string; v: string }) => <><dt>{k}</dt><dd>{v}</dd></>;

// 材料目录：最新的在上面，点一行展开内容；有新材料时展开最新那一份
function Docs() {
  const docs = S.docs || [];
  const [open, setOpen] = useState<number>(docs.length - 1);
  useEffect(() => { setOpen(docs.length - 1); }, [docs.length]);
  return <>{docs.map((d, i) => [d, i] as const).reverse().map(([d, i]) => (
    <div key={i}>
      <button type="button" className={'toc' + (i === docs.length - 1 ? ' fresh' : '')} aria-expanded={open === i} onClick={() => setOpen(o => o === i ? -1 : i)}>
        <span className="n">{String(i + 1).padStart(2, '0')}</span><span className="tt">{d.title}</span><span className="lead" /><span className="d">{d.y}.{String(d.m).padStart(2, '0')}</span>
      </button>
      {open === i && d.rows.length > 0 && <dl className="toc-dl">{d.rows.map((r, j) => <Pair key={j} k={r[0]} v={r[1]} />)}</dl>}
    </div>
  ))}</>;
}

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
const TABS = [['doc', '材料目录'], ['peer', '同批建档'], ['curve', '一生曲线']] as const;
type Tab = typeof TABS[number][0];
const TAB_KEY = 'cn14.tab';
export function ArchiveTabs({ mtab }: { mtab: string }) {
  const [tab, setTab] = useState<Tab>(() => { try { const t = localStorage.getItem(TAB_KEY) as Tab; return TABS.some(x => x[0] === t) ? t : 'doc'; } catch { return 'doc'; } });
  const pick = (k: Tab) => { setTab(k); try { localStorage.setItem(TAB_KEY, k); } catch { /* 存不了也没关系 */ } };
  // 材料目录上提示有几份新材料（上次看材料目录以后发的）；手机上看「材料」标签也算看过
  const docsN = (S.docs || []).length;
  const seen = useRef(docsN);
  if (tab === 'doc' || mtab === 'doc') seen.current = docsN;
  const fresh = docsN - seen.current;
  return (
    <section className={'pg tabs-card t-' + tab} data-m="doc peer body">
      <nav className="tabs" role="tablist">
        {TABS.map(([k, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pick(k)}>
            {n}{k === 'doc' && <span className="mono" style={{ fontWeight: 400, marginLeft: 4 }}>{docsN}</span>}{k === 'doc' && fresh > 0 && <i className="tdot" aria-label={`${fresh} 份新材料`}>新</i>}
          </button>
        ))}
      </nav>
      <div className="tp" data-t="doc" data-m="doc"><Docs /></div>
      <div className="tp" data-t="peer" data-m="peer"><p className="note-line" style={{ margin: '0 0 4px' }}>同一秒建档的另外 {S.comps.length} 人 · 此刻也是 {S.age} 岁</p><Companions /></div>
      <div className="tp" data-t="curve" data-m="body"><div className="sub-h m-only" style={{ marginTop: 0 }}>一生曲线</div><Curve /></div>
    </section>
  );
}

/** 手机上「家与钱」标签里单独的一页家庭成员（电脑上它在基本情况里） */
export function FamilySec({ m }: { m: string }) {
  return <Sec no="一" title="家庭成员" meta={famMeta()} className="m-only" m={m}><FamilyRows /></Sec>;
}
