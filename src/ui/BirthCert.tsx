// 出生登记表：最上面一句命运签（抽到了什么、有多常见），同一秒出生的五个人按家境排在一起、点出差距最大的两个，
// 下面是出生地、家境、父母、预期寿命这些资料。
import { BIRTH_TOTAL, LT, PBY, S, famIncome, leOf, placeName, wan } from '../engine';
import { game } from '../game/controller';
import { Photo } from './Photo';
import { Ib } from './TipLayer';
import { QW, dots, fileNo, sexW } from './util';
import './birth.css';

const Q_SAY = ['家里很穷', '家里不宽裕', '家境普通', '家里过得不错', '家境优渥'];
// 同一秒出生的人排起点：家境为主，同一档的城里比农村靠前
const start = (q: number, rural: boolean) => q * 2 + (rural ? 0 : 1);

export const Cell = ({ k, v, wide }: { k: React.ReactNode; v: React.ReactNode; wide?: boolean }) =>
  <div className={wide ? 'wide' : undefined}><span>{k}</span><b>{v}</b></div>;

export function BirthCert() {
  const p = PBY[S.born], f = S.fam, lt = LT();
  const le = leOf(S.born, S.sex, S.rural);
  const share = p.b / BIRTH_TOTAL;
  const sib = f.sibs.length ? f.sibs.map(s => `${s.rel}（${s.age}岁）`).join('、') : '无';
  // 命运签：生在哪（省、城里还是农村）、第几个孩子、家境；每一千个婴儿里有几个和你一样生在这个省的城里 / 农村
  const town = S.rural ? '农村' : '城里', urb = p.u / 100;
  const odds = Math.max(1, Math.round(share * (S.rural ? 1 - urb : urb) * 1000));
  const nth = S.order === 1 ? (f.sibs.length ? '老大' : '第一个孩子') : `第${['', '一', '二', '三', '四', '五'][S.order] || S.order}个孩子`;
  const fate = `${p.n}${town}的${nth}，${Q_SAY[S.q - 1]}。`;
  // 同一秒出生的五个人：按起点排，你在第几
  const five = [{ me: true, name: S.name, place: placeName(S.home), rural: S.rural, q: S.q },
    ...S.comps.map(c => ({ me: false, name: c.name, place: c.place, rural: c.rural, q: c.q }))]
    .sort((a, b) => start(b.q, b.rural) - start(a.q, a.rural));
  const rank = five.findIndex(x => x.me) + 1, top = five[0], low = five[five.length - 1];
  const gap = top.q - low.q >= 2 || top.rural !== low.rural;
  // 农村出身的地名里本来就带「的农村」（placeName），没带的才补上
  const where = (x: typeof top) => x.rural && !x.place.includes('农村') ? `${x.place}的农村` : x.place;
  const contrast = !gap ? '你们五个的起点差不多。'
    : rank === 1 ? `你是这五个人里起点最高的。起点最低的${low.name}，生在${where(low)}，${Q_SAY[low.q - 1]}。`
    : rank === five.length ? `你是这五个人里起点最低的。起点最高的${top.name}，生在${where(top)}，${Q_SAY[top.q - 1]}。`
    : `起点最高的${top.name}生在${where(top)}，${Q_SAY[top.q - 1]}；起点最低的${low.name}生在${where(low)}，${Q_SAY[low.q - 1]}。`;
  const grow = S.flags.lb === 'both' ? `留守，由${S.flags.carer}带大` : S.flags.lb ? '一方父母外出打工' : S.flags.mig ? '随父母在外地' : '和父母在一起';
  return (
    <div className="wrap narrow">
      <div className="form-doc">
        <span className="doc-no">档案号 {fileNo(S)}</span>
        <h2 className="form-title">出生登记表</h2>
        <div className="nm">{S.name}</div>
        <div className="fate">
          <span className="fate-k">你抽到的是</span>
          <p className="fate-t">{fate}</p>
          <p className="fate-odds">每一千个中国婴儿里，大约有 {odds} 个和你一样，生在{p.n}的{S.rural ? '农村' : '城镇'}。</p>
        </div>
        <p>{S.log[S.log.length - 1].t}</p>
        <Photo id="birth" />
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
        <h4 style={{ marginTop: 18 }}>同一秒出生的五个人<small className="muted">　按起点排，你排第 {rank}</small></h4>
        <ol className="five">
          {five.map((x, i) => (
            <li key={i} className={x.me ? 'me' : undefined}><span className="five-n">{i + 1}</span><b>{x.me ? '你' : x.name}</b><span className="five-p">{where(x)}</span><span className="dots">{dots(x.q)}</span></li>
          ))}
        </ol>
        <p className="five-c">{contrast}</p>
        <p className="small muted">活到平均寿命大约需要 {game.pref.len} 分钟（一年约 {Math.round(game.yearSec)} 秒，6 岁以前快一倍）。中途关掉页面会保存在这个浏览器里。</p>
        <div className="apply-actions"><button className="stamp-btn" onClick={() => game.startLife()}>开始这一生</button></div>
        <div className="seal stamp-in">已登记</div>
      </div>
    </div>
  );
}
