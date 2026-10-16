// 出生登记表：出生地、家境、父母、预期寿命，以及同一秒建档的另外四个人。
import { BIRTH_TOTAL, LT, PBY, S, famIncome, leOf, placeName, wan } from '../engine';
import { game } from '../game/controller';
import { Ib } from './TipLayer';
import { QW, dots, fileNo, sexW } from './util';

export const Cell = ({ k, v, wide }: { k: React.ReactNode; v: React.ReactNode; wide?: boolean }) =>
  <div className={wide ? 'wide' : undefined}><span>{k}</span><b>{v}</b></div>;

export function BirthCert() {
  const p = PBY[S.born], f = S.fam, lt = LT();
  const le = leOf(S.born, S.sex, S.rural);
  const share = p.b / BIRTH_TOTAL;
  const sib = f.sibs.length ? f.sibs.map(s => `${s.rel}（${s.age}岁）`).join('、') : '无';
  const grow = S.flags.lb === 'both' ? `留守，由${S.flags.carer}带大` : S.flags.lb ? '一方父母外出打工' : S.flags.mig ? '随父母在外地' : '和父母在一起';
  return (
    <div className="wrap narrow">
      <div className="form-doc">
        <span className="doc-no">档案号 {fileNo(S)}</span>
        <h2 className="form-title">出生登记表</h2>
        <div className="nm">{S.name}</div>
        <p>{S.log[S.log.length - 1].t}</p>
        <div className="ftable">
          <Cell k="性别" v={sexW(S.sex)} /><Cell k="民族" v={S.eth} /><Cell k="户籍" v={S.rural ? '农村' : '城镇'} />
          <Cell k="出生地" v={placeName()} wide />
          <Cell k="家境" v={<><span className="dots">{dots(S.q)}</span> {QW[S.q - 1]}</>} />
          <Cell k={<>家庭人均可支配收入<Ib k="famQuint" /></>} v={`约${wan(famIncome())}/年`} />
          <Cell k="兄弟姐妹" v={sib} />
          <Cell k="母亲" v={`${f.mom.age}岁 · ${f.mom.job}`} /><Cell k="父亲" v={`${f.dad.age}岁 · ${f.dad.job}`} /><Cell k="成长" v={grow} />
          <Cell k={<>预期寿命<Ib k="le" /></>} v={le.toFixed(1) + '岁'} />
          <Cell k={<>5岁前离世的概率<Ib k="u5" /></>} v={((1 - lt.l[5]) * 100).toFixed(2) + '%'} />
          <Cell k={p.n + '大专及以上人口'} v={p.eduHi ? (p.eduHi * 100).toFixed(1) + '%' : '—'} />
        </div>
        <p className="small">
          此刻在中国出生的婴儿里，约 {(share * 100).toFixed(1)}% 的户籍在{p.n}，一年约 {p.b} 万人。
          {S.flags.mig ? `你的父母在外打工，你出生在${placeName(S.loc)}，户口仍在老家。` : S.rural ? '你是其中出生在农村的那一部分。' : ''}
        </p>
        <h4 style={{ marginTop: 18 }}>同一秒建档的另外四个人</h4>
        <div className="peers">
          {S.comps.map((c, i) => (
            <div className="peer" key={i}><b>{c.name}</b><span>{c.place} · {sexW(c.sex)} · {c.eth !== '汉族' ? c.eth + ' · ' : ''}{QW[c.q - 1]}的家庭</span></div>
          ))}
        </div>
        <p className="small muted">活到平均寿命大约需要 {game.pref.len} 分钟（一年约 {game.yearSec.toFixed(1)} 秒）。中途关掉页面会保存在这个浏览器里。</p>
        <div className="apply-actions"><button className="stamp-btn" onClick={() => game.startLife()}>开始这一生</button></div>
        <div className="seal stamp-in">已登记</div>
      </div>
    </div>
  );
}
