// 档案封存：回看这一生。先是小传、人生标签、人生大事、走过的岔路口、同一秒建档的人；
// 履历表、这一生的钱、一生曲线、证件、自述收在最下面的「档案附件」里（见 AGENTS.md「回看这一生」）。
import { useState } from 'react';
import { CAUSE, EDU_LV, LT, PBY, S, TAG_N, lifeTime, deathText, forksOf, inheritedValue, lifeStory, lifeTags, loanBal, mainJob, lifeMajors, netWorth, persWords, shownZ, wan, wanM } from '../engine';
import { game } from '../game/controller';
import { loadPast } from '../game/storage';
import { Cell } from './BirthCert';
import { RunId } from './RunId';
import { Curve, DocCard } from './Sidebar';
import { MonthlyLedger } from './Finance';
import { dots, fileNo } from './util';
import { FOCUS_C } from './Life';

const RARE = ['', '', '少见', '罕见'];

export function End() {
  const [words, setWords] = useState('');
  const [allMajors, setAllMajors] = useState(false);
  const d = S.death, p = PBY[S.born], lt = LT();
  const longer = lt.l[Math.min(120, d.age + 1)];
  const kids = S.fam.kids, he = S.sex === 'M' ? '他' : '她';
  const leave = (then: () => void) => { game.saveLastWords(words.trim()); then(); };
  // 出生地以出生登记表为准：随迁子女出生在父母打工的城市，不是户口所在的老家（S.home）
  const bornAt = S.docs.find(x => x.k === 'birth').rows.find(r => r[0] === '出生地')[1];
  const cashflow = S.cashflow;
  const story = lifeStory(S), tags = lifeTags(S), majors = lifeMajors(S), forks = forksOf(S);
  // 收集过的人生标签：所有封存过的档案（这一生在 game.finish 里已经存进去了）
  const seen = new Set(loadPast().flatMap(x => x.tags || []));
  const shownMajors = allMajors ? majors : majors.slice(0, 12);
  const time = lifeTime(S), timeAll = time.reduce((t, x) => t + x.y, 0);
  return (
    <div className="wrap narrow">
      <div className="folder sealed">
        <div className="folder-tab">人生档案 · <span className="mono">No. {fileNo(S)}</span></div>
        <div className="folder-body">
          <p className="eyebrow">{S.birthYear}年{S.birthMonth}月 — {d.year}年{d.month ? d.month + '月' : ''} · 享年{d.age}岁</p>
          <div className="end-h">{S.name}</div>
          <p className="end-cause">{deathText(d.cause)}</p>
          <p>同一年在{p.n}出生的{S.sex === 'M' ? '男孩' : '女孩'}里，大约 {Math.round(longer * 100)}% 会活得比{he}更久。</p>
        </div>
        <div className="seal seal-lg stamp-in">档案<br />封存</div>
      </div>
      {d.cause === 'suicide' && <p className="help">如果你也正在经历很难熬的时候，请拨打全国心理援助热线 <b>12356</b>，或者告诉身边一个你信任的人。</p>}

      <div className="end-sec end-story">
        <h4>{S.name}的一生</h4>
        {story.map((s, i) => <p key={i}>{s}</p>)}
      </div>

      {timeAll >= 3 && <div className="end-sec">
        <h4>这一生的时间<small className="end-small">六岁以后的空闲时间放在了哪里</small></h4>
        <div className="tbar" role="img" aria-label={time.map(t => `${t.n}${Math.round(t.y)}年`).join('，')}>
          {time.map(t => <span key={t.k} style={{ width: `${t.y / timeAll * 100}%`, background: FOCUS_C[t.k] || 'var(--muted)' }} />)}
        </div>
        <div className="tlegend">{time.map(t => <span key={t.k}><i style={{ background: FOCUS_C[t.k] || 'var(--muted)' }} />{t.n} {Math.round(t.y)}年</span>)}</div>
      </div>}

      {tags.length > 0 && <div className="end-sec">
        <h4>人生标签<small className="end-small">你已经见过 {seen.size} / {TAG_N} 种</small></h4>
        <div className="tags">
          {tags.map(t => <span key={t.k} className={'tag r' + t.r} title={t.d}><b>{t.n}</b>{RARE[t.r] && <i>{RARE[t.r]}</i>}{t.d && <small>{t.d}</small>}</span>)}
        </div>
      </div>}

      {majors.length > 0 && <div className="end-sec">
        <h4>人生大事</h4>
        <ol className="majors">
          {shownMajors.map((e, i) => <li key={i} className={e.k}><span className="mono">{e.a}岁</span><p>{e.t}</p></li>)}
        </ol>
        {majors.length > shownMajors.length && <button className="btn" type="button" onClick={() => setAllMajors(true)}>还有 {majors.length - shownMajors.length} 件</button>}
      </div>}

      {forks.length > 0 && <div className="end-sec">
        <h4>岔路口</h4>
        <ul className="forks">
          {forks.map((f, i) => <li key={i}>
            <div className="fk-h"><span className="mono">{f.a}岁</span><b>{f.title}</b></div>
            <p className="fk-pick"><span className="chop">定</span>{f.pick}</p>
            {f.res && <p className="fk-res">{f.res}</p>}
            <p className="fk-alt">没走的路：{f.alt.join(' / ')}</p>
          </li>)}
        </ul>
      </div>}

      <div className="sheet end-sec">
        <h4 className="sheet-title">同一秒建档的人</h4>
        <table className="cmp">
          <thead><tr><th></th><th>出生</th><th>学历</th><th>工作</th><th>享年</th></tr></thead>
          <tbody>
            <tr><td><b>{S.name}</b></td><td>{bornAt}</td><td>{EDU_LV[S.edu]}</td><td>{mainJob(S) || '—'}</td><td>{d.age}岁</td></tr>
            {S.comps.map((c, i) => <tr key={i}><td>{c.name}</td><td>{c.place}</td><td>{EDU_LV[c.edu]}</td><td>{c.job || '—'}</td><td>{c.death.age}岁 · {CAUSE[c.death.cause]}</td></tr>)}
          </tbody>
        </table>
        <p className="small muted" style={{ margin: 0 }}>没有人选择过自己在哪里出生。</p>
      </div>

      <div className="end-sec">
        <h4>最后，你想对{he}说一句话吗？</h4>
        <textarea maxLength={300} placeholder="只保存在这个浏览器里" value={words} onChange={e => setWords(e.target.value)} />
      </div>
      <div className="end-actions">
        <button className="stamp-btn" onClick={() => leave(() => game.bornNow())}>再出生一次</button>
        <button className="btn" onClick={() => leave(() => game.show('home'))}>回到首页</button>
        <button className="btn" title="局 ID、种子、每一次选择和完整状态，反馈问题时附上" onClick={() => game.exportRun()}>导出这一局的日志</button>
      </div>

      <details className="end-more">
        <summary>档案附件：履历表、这一生的钱、一生曲线、证件</summary>
        <div className="form-doc end-sec">
          <h2 className="form-title">履历表</h2>
          <div className="ftable">
            <Cell k="出生" v={bornAt} wide />
            <Cell k="家境" v={<span className="dots">{dots(S.q)}</span>} /><Cell k="学历" v={EDU_LV[S.edu]} /><Cell k="做得最久的工作" v={mainJob(S) || '—'} />
            <Cell k="生活过的城市" v={S.places.join('、')} wide />
            <Cell k="婚姻" v={S.fam.partner ? (S.fam.partner.alive ? '已婚' : '丧偶') : S.flags.divorced ? '离异' : '未婚'} />
            <Cell k="孩子" v={kids.length ? kids.length + '个' : '没有'} /><Cell k="房子" v={S.house ? S.house.city : '没有'} />
            {S.pers && S.age >= 3 && <Cell k="性格" v={persWords(shownZ(), 3).join('、') || '平和'} wide />}
            <Cell k="存款最多的时候" v={wan(S.stats.maxMoney)} /><Cell k="离开时的存款" v={wan(S.money)} /><Cell k="退休金" v={S.pension ? wanM(S.pension) : '—'} />
            <Cell k="其他欠款" v={wan(S.debt || 0)} /><Cell k="继承房产权益" v={wan(inheritedValue())} /><Cell k="净资产" v={wan(netWorth())} />
            <Cell k="剩余房贷" v={wan(loanBal())} /><Cell k="公积金余额" v={wan(S.hpf || 0)} />
          </div>
        </div>
        {cashflow && <div className="sheet end-sec">
          <h4 className="sheet-title">这一生的钱</h4>
          <div className="ftable">
            <Cell k="累计家庭到手收入" v={wan(cashflow.income)} />
            <Cell k="累计日常消费与房租" v={wan(cashflow.spending)} />
            <Cell k="现金偿还房贷" v={wan(cashflow.mortgage)} />
            <Cell k="偿还其他欠款" v={wan(cashflow.debtRepaid)} />
            <Cell k="事件、资产转账及利息净额" v={wan(S.money - cashflow.income + cashflow.spending + cashflow.mortgage + cashflow.debtRepaid)} />
            <Cell k="最终可用现金" v={wan(S.money)} />
          </div>
          <p className="account-note">家庭到手收入含配偶、养老金和返聘；日常消费与房租不含买房、医疗等事件。公积金直接还贷不计入现金支出，继承后未出售的房产不计入现金。</p>
          <h4>逐月收支</h4>
          <MonthlyLedger embedded />
        </div>}
        <div className="sheet end-sec"><h4 className="sheet-title">一生曲线</h4><Curve W={680} H={170} /></div>
        <div className="end-sec"><h4>档案里的 {(S.docs || []).length} 份证件</h4><div className="doc-gallery">{(S.docs || []).map((x, i) => <DocCard key={i} d={x} open />)}</div></div>
        {S.notes.length > 0 && <div className="end-sec notes"><h4>自述</h4>{S.notes.map((n, i) => <p key={i}><span className="small muted">{n.a}岁 · {n.q}</span><br />{n.t}</p>)}</div>}
      </details>
      <p className="small muted" style={{ marginTop: 10 }}><RunId /></p>
    </div>
  );
}
