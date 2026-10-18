// 首页：人生档案的封面、此刻出生的婴儿落在哪里（附页）、已封存的档案（过过的人生）。
import { useEffect, useMemo, useState } from 'react';
import { BIRTH_TOTAL, NATION, PROVS, TAG_N } from '../engine';
import { game, hasSave } from '../game/controller';
import { loadPast } from '../game/storage';

const T0 = performance.now();
const YEAR_SEC = 31557600;

// 打开页面以后出生、离世的人数，每帧更新
function Counters() {
  const [s, setS] = useState(0);
  useEffect(() => {
    let id = 0;
    const f = () => { setS((performance.now() - T0) / 1000); id = requestAnimationFrame(f); };
    id = requestAnimationFrame(f);
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="counters">
      <div><b>{Math.floor(s * NATION.births / YEAR_SEC).toLocaleString('zh-CN')}</b><span>打开这一页以后出生的婴儿</span></div>
      <div><b>{Math.floor(s * NATION.deaths / YEAR_SEC).toLocaleString('zh-CN')}</b><span>同一段时间里离世的人</span></div>
    </div>
  );
}

// 按各省出生人数：前 9 个省单列，其余合并
function Distribution() {
  const all = PROVS.slice().sort((a, b) => b.b - a.b);
  const rows = all.slice(0, 9).map(p => ({ n: p.n, v: p.b / BIRTH_TOTAL, other: false }));
  rows.push({ n: `其余${all.length - 9}个省区市`, v: all.slice(9).reduce((t, p) => t + p.b, 0) / BIRTH_TOTAL, other: true });
  const mx = Math.max(...rows.map(r => r.v));
  return <>{rows.map(r => (
    <div key={r.n} className={'br' + (r.other ? ' other' : '')}>
      <span>{r.n}</span><i style={{ '--w': (r.v / mx * 100).toFixed(1) + '%' } as React.CSSProperties} /><b>{(r.v * 100).toFixed(1)}%</b>
    </div>
  ))}</>;
}

export function Home() {
  const fileNo = useMemo(() => new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0'), []);
  const sv = hasSave();
  const past = loadPast();
  return (
    <div className="home">
      <div className="home-top">
        <section className="home-hero">
          <span className="ftab"><b>人生档案</b><span className="mono">No. {fileNo}</span></span>
          <div className="rule">
            <p className="hint" style={{ margin: 0 }}>人生模拟 · 依据国家统计局、联合国等公开数据</p>
            <h1 className="brand">14亿分之<span>1</span></h1>
            <p className="lead">{NATION.year}年，中国出生了{Math.round(NATION.births / 1e4)}万个婴儿，平均每{(YEAR_SEC / NATION.births).toFixed(1)}秒一个。你将成为其中之一。生在哪个省、城市还是农村、谁家的孩子，都由不得你选。就像当初的你一样。</p>
            <Counters />
            <div className="home-cta">
              <button className="stamp-btn" type="button" onClick={() => game.bornNow()}>出生</button>
              {sv && <button className="resume" type="button" onClick={() => game.resume()}>继续上次的人生<small>{sv.name} · {sv.age} 岁</small></button>}
            </div>
            <p className="hint">一年约 40 秒（小时候更快），活到平均寿命大约 45–55 分钟。随时可以暂停、加速，或者快进到下一件大事；关掉页面会保存在这个浏览器里。</p>
          </div>
        </section>

        <section className="pg home-dist">
          <div className="sec"><span className="no">附</span><h3>此刻出生的婴儿会落在哪里</h3><small>2024 年</small></div>
          <Distribution />
          <p className="hint">按各省出生人数 ·《中国统计年鉴2025》</p>
          <div className="seal">待建档</div>
        </section>
      </div>

      <div className="home-low">
        {past.length > 0 ? (
          <section className="pg past">
            <div className="sec"><span className="no">档</span><h3>已封存的档案</h3><small>你过过的人生 · 见过 {new Set(past.flatMap(p => p.tags || [])).size} / {TAG_N} 种人生标签</small></div>
            {past.slice(0, 12).map((p, i) => (
              <div key={i} className="toc"><span className="tt">{p.name}</span><span className="muted small">{p.place}</span><span className="lead" /><span className="d">{p.y0} – {p.y1}</span><span className="age">享年{p.age}岁</span><span className="muted small">{p.line || p.cause}</span></div>
            ))}
          </section>
        ) : <div />}
        <section className="notes3">
          <div><h4>材料目录</h4><p>出生、升学、毕业、工作、结婚、买房、退休……人生每过一道关口，档案里就多一份材料。</p></div>
          <div><h4>同批建档</h4><p>那一秒，中国还有其他婴儿出生。四个人的一生会按同样的统计走完，并排放在你旁边。</p></div>
          <div className="wide"><h4>数据从哪来</h4><p>出生、收入、房价、养老金来自统计年鉴；寿命和死因用联合国、WHO 数据；教育、婚育、医疗来自教育部、民政部、卫健委等。官方与国际数字不一致时，采用国际口径。每个数字旁的小 i 都能点开看怎么算的。</p></div>
        </section>
      </div>

      <p className="footnote">疾病、死亡、自杀等沉重的事，也会按统计发生，但不会描写场面。如果你正在经历很难熬的时候，可以拨打全国心理援助热线 <b>12356</b>。</p>
    </div>
  );
}
