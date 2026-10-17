// 一生页面的侧栏：体检表与账户、家庭状况、证件夹、一生曲线、同一秒建档的人。
import { useEffect, useState } from 'react';
import {
  AX, AX_NAME, CAUSE, EDU_LV, FAM_HOUSE_N, JOBS, PBY, S, axWord, leOf, partnerTrait, shownZ, loanBal, loanPayY, loveWord, parentIncome, parentRetired, parentsPerCap, ptJobName, wan,
  type Companion, type Doc,
} from '../engine';
import { Ib } from './TipLayer';
import { dots, sexW } from './util';

const red = (neg: boolean) => ({ color: neg ? 'var(--bad)' : 'inherit' });

function Bar({ n, v, c }: { n: string; v: number; c: string }) {
  return <div className="vt"><span>{n}</span><i><u style={{ '--v': v + '%', '--c': `var(${c})` } as React.CSSProperties} /></i><b>{Math.round(v)}</b></div>;
}

// 性格：五条刻度，两头是词，不显示数字；离中间超过半个标准差的那一头加重。三岁以前还看不出来
function Personality() {
  if (!S.pers) return null;
  if (S.age < 3) return <><h5 className="acct-h">性格</h5><p className="hint" style={{ marginTop: 2 }}>还小，看不出来。</p></>;
  const z = shownZ();
  return <>
    <h5 className="acct-h">性格 <span className="muted small">会随经历和年纪慢慢变</span></h5>
    {AX.map(x => {
      const v = Math.max(-2.4, Math.min(2.4, z[x])), w = axWord(x, v);
      return <div key={x} className="pt" title={w || '居中'}>
        <span className={v <= -0.5 ? 'on' : ''}>{AX_NAME[x][1]}</span>
        <i><u style={{ '--v': (50 + v * 20) + '%' } as React.CSSProperties} /></i>
        <span className={v >= 0.5 ? 'on' : ''}>{AX_NAME[x][0]}</span>
      </div>;
    })}
  </>;
}

// 体检表；经济独立以前，钱的情况看「家庭状况」，开始工作（或离开学校）以后显示个人账户
export function Vitals() {
  const st = S.st;
  return (
    <div className="sheet">
      <h4 className="sheet-title">体检表 <span className="muted small">0–100</span></h4>
      <Bar n="健康" v={st.hl} c="--hl" /><Bar n="幸福" v={st.h} c="--h" /><Bar n="学识" v={st.kn} c="--kn" /><Bar n="人际" v={st.so} c="--so" />
      <Personality />
      {S.indep === false ? <>
        <h5 className="acct-h">本人</h5>
        <p className="hint" style={{ marginTop: 2 }}>{S.school ? '在读' + S.school : S.age < 6 ? '学龄前' : '还没有工作'}，花销由家里负担，家里的收入和存款见「家庭状况」。开始工作以后才有自己的账户。</p>
      </> : <>
        <h5 className="acct-h">个人账户 <span className="muted small">{S.indepAt != null ? S.indepAt + '岁开始工作' : ''}</span></h5>
        <div className="acct">
          <div><span>存款<Ib k="myMoney" /></span><b style={red(S.money < 0)}>{wan(S.money)}</b></div>
          <div><span>{S.job === 'retired' ? '养老金' : '年收入'}<Ib k="myIncome" /></span><b>{S.job === 'retired' ? wan(S.pension || 0) : S.income ? wan(S.income) : '—'}</b></div>
          <div><span>公积金<Ib k="hpf" /></span><b>{S.hpf ? wan(S.hpf) + (S.hpfOn ? '' : '（封存）') : S.hpfOn ? '0元' : '没有'}</b></div>
          <div><span>房贷<Ib k="loan" /></span><b>{loanBal() ? wan(loanBal()) + ` · 月供${wan(loanPayY() / 12)}` : '—'}</b></div>
        </div>
        {(S.fam.mom.alive || S.fam.dad.alive) && <p className="hint">父母家里的存款约 {wan(Math.max(0, S.famMoney || 0))}。</p>}
      </>}
    </div>
  );
}

function ParentRow({ who, label }: { who: 'mom' | 'dad'; label: string }) {
  const p = S.fam[who], male = who === 'dad';
  if (!p.alive) return <div className="fr gone"><span>{label}</span><b>已去世 · 享年{p.age}岁</b></div>;
  const ret = parentRetired(p, male), inc = parentIncome(who);
  return (
    <div className="fr"><span>{label}</span><b>{p.age}岁 · {ret ? '退休（原' + p.job + '）' : p.job}</b>
      <em>{inc ? <>{(ret ? '养老金 ' : '年收入 ') + wan(inc) + '/年'}<Ib k={'parentInc:' + who} /></> : '没有收入'}</em></div>
  );
}

// 父母的家：父母、兄弟姐妹、家里的钱和房子
function ParentsCard({ title }: { title: string }) {
  const f = S.fam;
  const H = S.famHouse || { type: 'rent' as const, v: 0, where: '' }, anyParent = f.mom.alive || f.dad.alive;
  const assets = (S.famMoney || 0) + (H.v || 0) - (S.famDebt || 0);
  return (
    <div className="sheet">
      <h4 className="sheet-title">{title}</h4>
      <div className="fams">
        <ParentRow who="dad" label="父亲" /><ParentRow who="mom" label="母亲" />
        {!!S.flags.parDiv && <div className="fr"><span></span><b className="muted">父母已离婚</b></div>}
        {S.flags.lb === 'both' && S.age < 16 && <div className="fr"><span>照看人</span><b>{S.flags.carer}（父母在外打工）</b></div>}
        {f.sibs.length > 0 && <div className="fr"><span>兄弟姐妹</span><b>{f.sibs.map(x => `${x.rel} ${x.age}岁`).join('、')}</b></div>}
      </div>
      {anyParent ? <>
        <div className="acct">
          <div><span>家境</span><b className="dots">{dots(S.q)}</b></div>
          <div><span>{S.indep === false ? '家庭人均可支配收入' : '父母收入合计'}<Ib k="famPerCap" /></span><b>{S.indep === false ? wan(parentsPerCap()) : wan(parentIncome('mom') + parentIncome('dad'))}/年</b></div>
          <div><span>住房<Ib k="famHouse" /></span><b>{FAM_HOUSE_N[H.type]}{H.v ? ' · 估值约' + wan(H.v) : ''}</b></div>
          <div><span>{S.famMoney < 0 ? '欠款' : '存款'}<Ib k="famMoney" /></span><b style={red(S.famMoney < 0)}>{wan(Math.abs(S.famMoney || 0))}</b></div>
          {S.famDebt > 0 && <div><span>欠款<Ib k="famDebt" /></span><b style={{ color: 'var(--bad)' }}>{wan(S.famDebt)}</b></div>}
          <div><span>净资产<Ib k="famAssets" /></span><b style={red(assets < 0)}>约{wan(assets)}</b></div>
          <div><span>住在</span><b>{H.where || ''}</b></div>
        </div>
        {S.flags.supportY > 0 && <p className="hint">父母的积蓄已经花完，你每年给他们寄生活费，累计约 {wan(S.stats.support || 0)}。</p>}
      </> : <p className="hint">父母都已经去世。{S.stats.inherit ? `你继承了约 ${wan(S.stats.inherit)}。` : ''}</p>}
    </div>
  );
}

// 恋爱中：对象的基本情况、在一起几年、感情好不好
function LoveCard() {
  const d = S.fam.dating; if (!d) return null;
  const yrs = S.age - d.metAt, ldr = d.city !== S.loc.city;
  return (
    <div className="sheet">
      <h4 className="sheet-title">恋爱中 <span className="muted small">{yrs ? '在一起' + yrs + '年' : '刚在一起'}{ldr ? ' · 异地' : ''}</span></h4>
      <div className="fams"><div className="fr"><span>{d.sex === 'M' ? '男朋友' : '女朋友'}</span><b>{d.name} · {d.age}岁 · {partnerTrait(d)}</b></div></div>
      <div className="acct">
        <div><span>学历</span><b>{d.jk ? EDU_LV[d.edu] : EDU_LV[d.edu] + '在读'}</b></div>
        <div><span>职业</span><b>{ptJobName(d)}{ldr ? '（在' + d.city + '）' : ''}</b></div>
        <div><span>年收入{d.jk && <Ib k="ptInc:dating" />}</span><b>{d.inc ? wan(d.inc) + '/年' : '没有收入'}</b></div>
        <div><span>家乡</span><b>{PBY[d.home].n}{d.rural ? '农村' : '城里'}</b></div>
        <div><span>对方家境</span><b className="dots">{dots(d.q)}</b></div>
        <div><span>感情</span><b>{loveWord(d.love)} <span className="dots">{dots(Math.max(1, Math.round(d.love / 20)))}</span></b></div>
      </div>
    </div>
  );
}

// 成家以前一张「家庭状况」；成家以后分成「我的家」和「父母」两张
export function FamilyCards() {
  const f = S.fam, pt = f.partner, kids = f.kids;
  const ownFamily = f.married || pt || kids.length;
  if (!ownFamily) return <div className="fam-cards"><LoveCard /><ParentsCard title="家庭状况" /></div>;
  const hh = (S.income || 0) + (pt && pt.alive && f.married ? pt.inc : 0);
  return (
    <div className="fam-cards">
      <LoveCard />
      <div className="sheet">
        <h4 className="sheet-title">我的家</h4>
        <div className="fams">
          {pt && (
            <div className={'fr' + (pt.alive ? '' : ' gone')}><span>{pt.sex === 'M' ? '丈夫' : '妻子'}</span>
              <b>{pt.name} · {pt.alive ? pt.age + '岁 · ' + (pt.edu ? EDU_LV[pt.edu] + ' · ' : '') + (pt.retired ? '退休' : pt.k != null ? ptJobName(pt) : JOBS[pt.job] ? JOBS[pt.job].n : '') : '已去世'}</b>
              <em>{pt.alive && <>{(pt.retired ? '养老金 ' : '年收入 ') + wan(pt.inc) + '/年'}{pt.k != null && <Ib k="ptInc:partner" />}</>}</em></div>
          )}
          {!f.married && !!S.flags.divorced && <div className="fr"><span>婚姻</span><b>离异</b></div>}
          {kids.map((k, i) => (
            <div key={i} className={'fr' + (k.alive ? '' : ' gone')}><span>{k.sex === 'M' ? '儿子' : '女儿'}</span>
              <b>{k.name} · {k.alive ? (S.age - k.bornAt) + '岁' + (k.path ? ' · ' + k.path.replace(/^考上了/, '') : '') : '已离世'}</b></div>
          ))}
          {S.flags.grandkids > 0 && <div className="fr"><span>孙辈</span><b>{S.flags.grandkids}人</b></div>}
        </div>
        <div className="acct"><div><span>家庭年收入</span><b>{wan(hh)}</b></div><div><span>房子</span><b>{S.house ? S.house.city + ' · 约' + wan(S.house.v) : '租房'}</b></div></div>
      </div>
      <ParentsCard title="父母" />
    </div>
  );
}

// ===== 证件 =====
const DOC_SEAL: Record<string, string> = { birth: '登记', admit: '录取', grad: '毕业', school: '学籍', job: '合同', civil: '录用', marry: '婚姻', divorce: '登记', house: '不动产', kid: '出生', ill: '医院', retire: '退休', report: '学校' };
export function DocCard({ d, open, onClick }: { d: Doc; open: boolean; onClick?: () => void }) {
  return (
    <div className={`doc ${d.k}${open ? ' open' : ''}`} onClick={onClick}>
      <h5>{d.title}<small>{d.y}年 · {d.a}岁</small></h5>
      <dl>{d.rows.map((r, i) => <Pair key={i} k={r[0]} v={r[1]} />)}</dl>
      <span className="mini-seal">{DOC_SEAL[d.k] || '档'}</span>
    </div>
  );
}
const Pair = ({ k, v }: { k: string; v: string }) => <><dt>{k}</dt><dd>{v}</dd></>;

// 证件夹：最新的在上面；有新证件时只展开最新那一份，点击可以开合
export function Docs() {
  const docs = S.docs || [];
  const [open, setOpen] = useState<Set<number>>(() => new Set([docs.length - 1]));
  useEffect(() => { setOpen(new Set([docs.length - 1])); }, [docs.length]);
  const toggle = (i: number) => setOpen(o => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <div className="docs-wrap">
      <h4 className="side-title">证件夹 <span className="muted small">{docs.length} 份</span></h4>
      <div className="docs">{docs.map((d, i) => [d, i] as const).reverse().map(([d, i]) => <DocCard key={i} d={d} open={open.has(i)} onClick={() => toggle(i)} />)}</div>
    </div>
  );
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
    return <div key={i} className={'comp' + (s.dead ? ' dead' : '')}><b>{c.name}</b> <span className="muted">{c.place} · {sexW(c.sex)}{c.pw && c.pw.length ? ' · ' + c.pw.join('、') : ''}</span><span className="st">{s.t}</span></div>;
  })}</div>;
}
