// 档案封存：这一生的履历、证件、自述，以及同一秒建档的人走完的一生。
import { useState } from 'react';
import { CAUSE, EDU_LV, LT, PBY, S, deathText, mainJob, placeName, wan } from '../engine';
import { game } from '../game/controller';
import { Cell } from './BirthCert';
import { RunId } from './RunId';
import { Curve, DocCard } from './Sidebar';
import { dots, fileNo } from './util';

export function End() {
  const [words, setWords] = useState('');
  const d = S.death, p = PBY[S.born], lt = LT();
  const longer = lt.l[Math.min(120, d.age + 1)];
  const kids = S.fam.kids, he = S.sex === 'M' ? '他' : '她';
  const leave = (then: () => void) => { game.saveLastWords(words.trim()); then(); };
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
      <div className="form-doc end-sec">
        <h2 className="form-title">履历表</h2>
        <div className="ftable">
          <Cell k="出生" v={placeName(S.home)} wide />
          <Cell k="家境" v={<span className="dots">{dots(S.q)}</span>} /><Cell k="学历" v={EDU_LV[S.edu]} /><Cell k="做得最久的工作" v={mainJob(S) || '—'} />
          <Cell k="生活过的城市" v={S.places.join('、')} wide />
          <Cell k="婚姻" v={S.fam.partner ? (S.fam.partner.alive ? '已婚' : '丧偶') : S.flags.divorced ? '离异' : '未婚'} />
          <Cell k="孩子" v={kids.length ? kids.length + '个' : '没有'} /><Cell k="房子" v={S.house ? S.house.city : '没有'} />
          <Cell k="存款最多的时候" v={wan(S.stats.maxMoney)} /><Cell k="离开时的存款" v={wan(S.money)} /><Cell k="退休金" v={S.pension ? wan(S.pension) + '/年' : '—'} />
        </div>
      </div>
      <div className="sheet end-sec"><h4 className="sheet-title">一生曲线</h4><Curve W={680} H={170} /></div>
      <div className="end-sec"><h4>档案里的 {(S.docs || []).length} 份证件</h4><div className="doc-gallery">{(S.docs || []).map((x, i) => <DocCard key={i} d={x} open />)}</div></div>
      {S.notes.length > 0 && <div className="end-sec notes"><h4>自述</h4>{S.notes.map((n, i) => <p key={i}><span className="small muted">{n.a}岁 · {n.q}</span><br />{n.t}</p>)}</div>}
      <div className="sheet end-sec">
        <h4 className="sheet-title">同一秒建档的人</h4>
        <table className="cmp">
          <thead><tr><th></th><th>出生</th><th>学历</th><th>工作</th><th>享年</th></tr></thead>
          <tbody>
            <tr><td><b>{S.name}</b></td><td>{placeName(S.home)}</td><td>{EDU_LV[S.edu]}</td><td>{mainJob(S) || '—'}</td><td>{d.age}岁</td></tr>
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
      <p className="small muted" style={{ marginTop: 10 }}><RunId /></p>
    </div>
  );
}
