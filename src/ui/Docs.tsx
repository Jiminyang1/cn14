// 证件：每一份都画成一件真东西（出生登记表、录取通知书、红本、绿本……），后来盖上的章、写上的铅笔字一起画出来。
// 证件夹（DocFolder）：左边按人生的段落排目录，右边摊开一份；拿到新证件时右下角滑出提示（DocToast）；结局页按年龄铺成一条线（DocTimeline）。
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { S, type Doc, type DocMark } from '../engine';
import { game } from '../game/controller';
import { PixCanvas } from './Photo';
import { Pix, personAt } from './pixel/pix';
import { WEAR, dress } from './pixel/kit';
import { dots, fileNo } from './util';
import './docs.css';

const row = (d: Doc, k: string) => (d.rows.find(r => r[0] === k) || [])[1] || '';
const pad2 = (n: number) => String(n).padStart(2, '0');
const CN = '〇一二三四五六七八九';
const cnYear = (y: number | string) => String(y).split('').map(c => CN[+c] ?? c).join('');
const cnMonth = (m: number) => m <= 10 ? (m === 10 ? '十' : CN[m]) : '十' + CN[m - 10];
/** 同一个字符串总是同一个数：校长、医生的名字按单位名挑 */
const pickBy = <T,>(s: string, xs: T[]) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return xs[h % xs.length]; };

// ===== 封皮颜色：目录、提示、时间线上的小本子都用它 =====
type Cover = { bg: string; fg: string; s: string; line?: boolean };
export function coverOf(d: Doc): Cover {
  switch (d.k) {
    case 'birth': return { bg: '#E7EEF7', fg: '#2F4B7A', s: '出生', line: true };
    case 'report': return { bg: '#E6C77A', fg: '#7A1F17', s: '成绩' };
    case 'school': return { bg: '#2F5597', fg: '#fff', s: '学籍' };
    case 'id': return { bg: '#DCE9EE', fg: '#3E6A8A', s: '身份', line: true };
    case 'admit': return { bg: '#B3261E', fg: '#E9C46A', s: '录取' };
    case 'grad': return { bg: d.v === 'zhong' ? '#2D4A3E' : d.v === 'master' ? '#1F2F55' : '#6E1B1B', fg: '#E9C46A', s: d.v === 'master' ? '学位' : '毕业' };
    case 'job': return d.v === 'blue' ? { bg: '#2D6A8A', fg: '#fff', s: '务工' } : { bg: '#FFFDF8', fg: '#1F2328', s: '合同', line: true };
    case 'civil': return { bg: '#FFFDF8', fg: '#B3261E', s: '录用', line: true };
    case 'marry': return { bg: '#B3261E', fg: '#E9C46A', s: '结婚' };
    case 'divorce': return { bg: '#5B2A23', fg: '#E9C46A', s: '离婚' };
    case 'house': return { bg: '#24453A', fg: '#E9C46A', s: '房产' };
    case 'kid': return { bg: '#FFF0F3', fg: '#8A2D55', s: '出生', line: true };
    case 'ill': return { bg: '#FFFDF8', fg: '#2F5597', s: '诊断', line: true };
    case 'retire': return { bg: '#A32420', fg: '#E9C46A', s: '退休' };
    case 'demol': return { bg: '#FFFDF8', fg: '#1F2328', s: '征收', line: true };
    default: return { bg: '#FFFDF8', fg: '#1F2328', s: d.title.slice(0, 2), line: true };
  }
}
export function DocMini({ d, w = 46 }: { d: Doc; w?: number }) {
  const c = coverOf(d);
  return <span className={'dmini' + (c.line ? ' line' : '')} aria-hidden="true" style={{ width: w, height: Math.round(w * 4 / 3), background: c.bg, color: c.fg, fontSize: Math.max(8, w / 5) }}>{c.s}</span>;
}

// ===== 像素证件照 =====
type Look = Parameters<typeof dress>[0];
function Portrait({ who, bg, scale = 7, w = 14 }: { who: { sex: 'M' | 'F'; age: number; look: Look }[]; bg: string; scale?: number; w?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify([who, bg, w]);
  useEffect(() => {
    if (!ref.current) return;
    const p = new Pix(w, 16);
    p.rect(0, 0, w, 16, bg);
    const step = w / who.length;
    who.forEach((x, i) => personAt(p, x.sex, x.age, Math.round(step * i + step / 2) - 5, x.age < 18 ? 21 : x.age >= 65 ? 23 : 25, dress(x.look)));
    p.draw(ref.current);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="dpix" width={w} height={16} style={{ width: w * scale, height: 16 * scale }} role="img" aria-label="证件照" />;
}
const me = (age: number, look: Look) => ({ sex: S.sex as 'M' | 'F', age, look });
const oldHair = (age: number) => age >= 55 ? WEAR.old : {};

// ===== 小零件 =====
const Seal = ({ children, size = 80, style }: { children: ReactNode; size?: number; style?: CSSProperties }) =>
  <span className="dseal" style={{ width: size, height: size, fontSize: Math.max(10, size / 7.5), ...style }}>{children}</span>;
const F = ({ k, children }: { k: string; children: ReactNode }) => <><span className="k">{k}</span><span>{children}</span></>;
const Feet = ({ c = '#2F4B7A' }: { c?: string }) => (
  <svg width="64" height="50" viewBox="0 0 74 58" role="img" aria-label="新生儿足印">
    <g fill={c} opacity=".75">
      <ellipse cx="18" cy="36" rx="9" ry="16" /><circle cx="12" cy="14" r="3.2" /><circle cx="18" cy="11" r="2.6" /><circle cx="23" cy="12" r="2.2" /><circle cx="27" cy="15" r="1.9" /><circle cx="29" cy="19" r="1.6" />
      <ellipse cx="52" cy="38" rx="9" ry="16" /><circle cx="58" cy="16" r="3.2" /><circle cx="52" cy="13" r="2.6" /><circle cx="47" cy="14" r="2.2" /><circle cx="43" cy="17" r="1.9" /><circle cx="41" cy="21" r="1.6" />
    </g>
  </svg>
);
const MARK_C: Record<DocMark['c'], string> = { red: '#C23B2E', green: '#2F7D5B', gray: '#7E776B', blue: '#2F5597' };
/** 后来盖上的章：叠在证件右上角，一个比一个往下 */
function Stamps({ d, top = 18, right = 18, bottom }: { d: Doc; top?: number; right?: number; bottom?: number }) {
  const ms = (d.marks || []).filter(m => !m.p);
  return <>{ms.map((m, i) => (
    <span key={i} className="dstamp" style={{ ...(bottom != null ? { bottom: bottom + i * 34 } : { top: top + i * 34 }), right: right + (i % 2) * 18, color: MARK_C[m.c], borderColor: MARK_C[m.c] }}>
      {m.t.split(' · ')[0]}{m.t === '抵押' ? '' : <small>{m.y}.{pad2(m.m)}</small>}
    </span>
  ))}</>;
}
/** 后来写上的铅笔字 */
const Pencil = ({ d }: { d: Doc }) => {
  const ms = (d.marks || []).filter(m => m.p);
  return ms.length ? <div className="dpencil">{ms.map((m, i) => <div key={i}>{m.t}</div>)}</div> : null;
};

// ===== 每一种证件 =====
function Birth({ d }: { d: Doc }) {
  const q = +row(d, '家境') || 0;
  return (
    <div className="dpaper dform birth">
      <span className="dno mono">No. {fileNo(S)}</span>
      <div className="dtitle blue">出生登记表</div>
      <div className="dfld">
        <F k="姓　名"><b className="serif big">{row(d, '姓名')}</b></F>
        <F k="性　别">{row(d, '性别')}</F>
        <F k="民　族">{row(d, '民族')}</F>
        <F k="出生时间">{row(d, '出生日期')}</F>
        <F k="出生地点">{row(d, '出生地')}{row(d, '出生地点') && ' · ' + row(d, '出生地点')}</F>
        <F k="户　籍">{row(d, '户籍')}</F>
        {row(d, '母亲') && <F k="母　亲">{row(d, '母亲')}</F>}
        {row(d, '父亲') && <F k="父　亲">{row(d, '父亲')}</F>}
        {q > 0 && <F k="家　境"><span className="dots">{dots(q)}</span></F>}
        {row(d, '成长') && <F k="成　长">{row(d, '成长')}</F>}
      </div>
      <div className="dfoot"><Feet /><span>新生儿足印</span></div>
      <Seal size={70} style={{ right: 22, bottom: 22 }}>已登记</Seal>
    </div>
  );
}
function Report({ d }: { d: Doc }) {
  return (
    <div className="dreport">
      <div className="cover">
        <i />
        <div className="vt serif">成绩报告单</div>
        <div className="serif sm">{row(d, '学校') || '小学'}</div>
        {row(d, '学年') && <div className="mono xs">{row(d, '学年')} 学年</div>}
        <i />
      </div>
      <div className="inner">
        <div className="dfld two"><F k="姓名"><span className="serif">{row(d, '姓名')}</span></F><F k="年级">{row(d, '年级')}</F></div>
        <div className="lbl serif">班主任评语</div>
        <p className="hand ink">{row(d, '班主任评语')}</p>
        {row(d, '家长意见') && <div className="reply"><span className="lbl serif">家长意见</span><span className="hand">{row(d, '家长意见')}</span></div>}
        <Seal size={44} style={{ right: 16, top: 12, transform: 'rotate(10deg)', fontSize: 20, borderWidth: 2 }}>★</Seal>
      </div>
    </div>
  );
}
function School({ d }: { d: Doc }) {
  const voc = row(d, '学段') === '职高';
  return (
    <div className={'dpaper dcard' + ((d.marks || []).length ? ' mk' : '')}>
      <div className="dband blue"><b className="serif">{voc ? '中等职业学校学生学籍卡' : '普通高中学生学籍卡'}</b>{row(d, '学籍号') && <span className="mono">{row(d, '学籍号')}</span>}</div>
      <div className="dcard-b">
        <Portrait who={[me(d.a, WEAR.school)]} bg="#4f7fc0" />
        <div className="dfld">
          <F k="姓名"><b className="serif">{S.name}</b></F>
          <F k="学校">{row(d, '学校')}</F>
          {row(d, '专业') && <F k="专业">{row(d, '专业')}</F>}
          <F k="入学">{row(d, '入学')}</F>
        </div>
      </div>
      <Stamps d={d} bottom={12} right={14} />
    </div>
  );
}
function IdCard({ d }: { d: Doc }) {
  const re = (d.marks || []).filter(m => m.c === 'blue');
  return (
    <div className="did-wrap">
      <div className="did">
        <div className="did-g" aria-hidden="true" />
        <div className="did-b">
          <div className="dfld">
            <F k="姓 名"><b className="serif big">{row(d, '姓名')}</b></F>
            <F k="性 别"><span>{row(d, '性别')}　　<span className="k">民族</span>　{row(d, '民族')}</span></F>
            <F k="出 生"><span className="mono">{row(d, '出生')}</span></F>
            <F k="住 址"><span>{row(d, '住址')}</span></F>
          </div>
          <Portrait who={[me(d.a, WEAR.white)]} bg="#f4f4f2" scale={7.5} />
          <div className="did-no"><span className="k">公民身份号码</span><span className="mono">{row(d, '号码')}</span></div>
        </div>
      </div>
      {re.length > 0 && <div className="dpencil">{re.map((m, i) => { const at = m.t.split('住址：')[1], prev = i ? re[i - 1].t.split('住址：')[1] : row(d, '住址'); return <div key={i}>{m.y} 年换了新证{at && at !== prev ? `，住址改成${at}` : ''}</div>; })}</div>}
    </div>
  );
}
function Admit({ d }: { d: Doc }) {
  const school = row(d, '学校'), major = row(d, '专业'), adj = major.includes('（调剂）');
  return (
    <div className="dadmit">
      <div className="cover">
        <i aria-hidden="true" />
        <div className="emb" aria-hidden="true">{school.slice(0, 1)}</div>
        <div className="serif nm">{school}</div>
        <div className="serif vt">录取通知书</div>
        {row(d, '编号') && <div className="mono xs">No. {row(d, '编号')}</div>}
      </div>
      <div className="letter">
        <p className="serif"><b className="big">{S.name}</b> 同学：</p>
        <p className="serif body">经批准，你被录取到我校 <b className="u">{major.replace('（调剂）', '')}</b> 专业{row(d, '学制') ? `，学制${row(d, '学制')}` : ''}。请于 <span className="mono">{d.y}</span> 年 <span className="mono">9</span> 月凭本通知书来校报到。</p>
        <div className="tags">
          {row(d, '层次') && <span className="red">{row(d, '层次')}</span>}
          {row(d, '城市') && <span>{row(d, '城市')}</span>}
          {adj && <span>专业调剂</span>}
        </div>
        <div className="sign"><span className="hand">{pickBy(school, ['林振华', '周启明', '陈立新', '郑文远', '刘明德', '吴建国'])}</span><small className="serif">校长</small><small className="serif">{cnYear(d.y)}年{cnMonth(d.m)}月</small></div>
        <Seal size={92} style={{ right: 118, bottom: 22 }}>录取<br />专用章</Seal>
      </div>
    </div>
  );
}
function Grad({ d }: { d: Doc }) {
  const c = coverOf(d), master = d.v === 'master', zhong = d.v === 'zhong';
  const y0 = row(d, '入学'), y1 = row(d, '毕业') || String(d.y), lvl = { zhong: '中等职业教育', zhuan: '专科', ben: '本科', master: '硕士研究生' }[d.v || 'ben'] || '';
  const text = master
    ? <>研究生 <b>{S.name}</b>，性别{S.sex === 'M' ? '男' : '女'}，{cnYear(S.birthYear)}年{cnMonth(S.birthMonth)}月生，于{cnYear(y0)}年九月至{cnYear(y1)}年六月在本校 <b>{row(d, '专业')}</b> 专业攻读硕士学位，完成了研究生培养计划的全部要求，学位论文答辩合格，授予硕士学位。</>
    : <>学生 <b>{S.name}</b>，性别{S.sex === 'M' ? '男' : '女'}，{cnYear(S.birthYear)}年{cnMonth(S.birthMonth)}月生，于{cnYear(y0)}年九月至{cnYear(y1)}年六月在本校 <b>{row(d, '专业') || '　　'}</b> 专业{row(d, '学制')}制{lvl}学习，修完教学计划规定的全部课程，成绩合格，准予毕业。</>;
  return (
    <div className="dbook" style={{ background: c.bg }}>
      <div className="pages">
        <div className="pg-l">
          <Portrait who={[me(d.a, WEAR.suit)]} bg="#4f7fc0" />
          <div className="dfld">
            {row(d, '编号') && <F k="证书编号"><span className="mono">{row(d, '编号').replace(/(\d{4})(?=\d)/g, '$1 ')}</span></F>}
            <F k="学　历">{zhong ? '中专 / 职高' : row(d, '学历')}</F>
          </div>
        </div>
        <div className="pg-r">
          <div className="dtitle" style={{ color: c.bg }}>{master ? '硕士学位证书' : zhong ? '毕业证书' : '毕业证书'}</div>
          <p className="serif body">{text}</p>
          <div className="sign row"><span className="serif">{row(d, '学校')}</span><span><span className="hand">{pickBy(row(d, '学校'), ['林振华', '周启明', '陈立新', '郑文远', '刘明德', '吴建国'])}</span><small className="serif">校长 · {cnYear(y1)}年六月</small></span></div>
          <Seal size={84} style={{ left: '44%', bottom: 18 }}>{master ? '学位' : '毕业'}证书<br />专用章</Seal>
        </div>
      </div>
    </div>
  );
}
function Job({ d }: { d: Doc }) {
  if (d.k === 'civil') return (
    <div className="dpaper dletter">
      <div className="dtitle red">录用通知书</div>
      <div className="redline" />
      <p className="serif"><b>{S.name}</b> 同志：</p>
      <p className="serif body">经考试、考察和公示，决定录用你为 {row(d, '工作地')} {row(d, '岗位')}。请于{row(d, '报到') || `${d.y} 年 ${d.m} 月`}报到。</p>
      <Seal size={70} style={{ right: 24, bottom: 20 }}>录用<br />专用章</Seal>
      <Stamps d={d} top={20} />
    </div>
  );
  if (d.v === 'blue') return (
    <div className={'dpaper dcard' + ((d.marks || []).length ? ' mk' : '')}>
      <div className="dband" style={{ background: '#2D6A8A' }}><b className="serif">务工人员登记卡</b><span className="mono">{row(d, '登记')}</span></div>
      <div className="dcard-b">
        <Portrait who={[me(d.a, WEAR.blue)]} bg="#e8eef0" />
        <div className="dfld">
          <F k="姓名"><b className="serif">{S.name}</b></F>
          <F k="工种">{row(d, '工种')}</F>
          <F k="务工地">{row(d, '务工地')}</F>
          <F k="户籍地">{row(d, '户籍地')}</F>
        </div>
      </div>
      <Stamps d={d} bottom={12} right={14} />
    </div>
  );
  return (
    <div className="dstack">
      <div className="dpaper sh2" aria-hidden="true" /><div className="dpaper sh1" aria-hidden="true" />
      <div className="dpaper dcontract">
        <span className="staple" aria-hidden="true" />
        <div className="dtitle">劳动合同书</div>
        <div className="dfld">
          {row(d, '甲方') && <F k="甲　方">{row(d, '甲方')}</F>}
          <F k="乙　方"><b className="serif">{S.name}</b></F>
          <F k="岗　位">{row(d, '岗位')}</F>
          <F k="工作地点">{row(d, '工作地')}</F>
          <F k="期　限">自 <span className="mono">{row(d, '起始').replace('年', '')}</span> 年 <span className="mono">{d.m}</span> 月起{row(d, '期限') ? `，${row(d, '期限')}` : ''}</F>
          {row(d, '月工资') && <F k="月工资"><span className="mono">{row(d, '月工资')}</span></F>}
        </div>
        <div className="signs"><div><span className="k">甲方（盖章）</span></div><div><span className="k">乙方（签字）</span><div className="hand ln">{S.name}</div></div></div>
        <Seal size={80} style={{ left: 40, bottom: 44 }}>合同<br />专用章</Seal>
        <span className="halfseal" aria-hidden="true"><i /></span>
        <Stamps d={d} top={14} right={14} />
      </div>
    </div>
  );
}
function Marry({ d }: { d: Doc }) {
  const ps = (row(d, '配偶性别') || (S.sex === 'M' ? 'F' : 'M')) as 'M' | 'F', pAge = d.y - (+row(d, '配偶出生') || d.y - d.a);
  const pair = [me(d.a, WEAR.white), { sex: ps, age: pAge, look: WEAR.white }];
  if (S.sex === 'F') pair.reverse();
  return (
    <div className="dbook" style={{ background: '#B3261E' }}>
      <div className="pages">
        <div className="pg-l">
          <div className="dfld">
            <F k="持证人"><b className="serif big">{row(d, '持证人')}</b></F>
            <F k="登记日期"><span className="mono">{row(d, '登记日期')}</span></F>
            {row(d, '字号') && <F k="结婚证字号"><span className="mono">{row(d, '字号')}</span></F>}
          </div>
          <div className="pair">
            <div className="dfld"><F k="姓名"><b className="serif">{S.name}</b></F>{row(d, '本人出生') && <F k="出生"><span className="mono">{row(d, '本人出生')}</span></F>}{row(d, '本人家乡') && <F k="家乡">{row(d, '本人家乡')}</F>}</div>
            <div className="dfld"><F k="姓名"><b className="serif">{row(d, '配偶')}</b></F>{row(d, '配偶出生') && <F k="出生"><span className="mono">{row(d, '配偶出生')}</span></F>}{row(d, '配偶家乡') && <F k="家乡">{row(d, '配偶家乡')}</F>}</div>
          </div>
          <Pencil d={d} />
        </div>
        <div className="pg-r center">
          <span className="steel-w"><Portrait who={pair} bg="#c8302a" w={26} scale={8} /><i className="steel" aria-hidden="true" /></span>
          <span className="serif muted">婚姻登记机关</span>
          <Seal size={84} style={{ right: 30, bottom: 22 }}>婚姻登记<br />专用章</Seal>
        </div>
      </div>
    </div>
  );
}
function Divorce({ d }: { d: Doc }) {
  return (
    <div className="dbook" style={{ background: '#5B2A23' }}>
      <div className="pages gray">
        <div className="pg-l">
          <div className="dfld">
            <F k="持证人"><b className="serif big">{S.name}</b></F>
            {row(d, '登记日期') && <F k="登记日期"><span className="mono">{row(d, '登记日期')}</span></F>}
            {row(d, '字号') && <F k="离婚证字号"><span className="mono">{row(d, '字号')}</span></F>}
            <F k="对　方">{row(d, '对方')}</F>
            {row(d, '孩子') && <F k="孩　子">{row(d, '孩子')}</F>}
          </div>
          {row(d, '婚姻') && <div className="dpencil">婚姻 {row(d, '婚姻')}。</div>}
        </div>
        <div className="pg-r center">
          <Portrait who={[me(d.a, WEAR.white)]} bg="#4f7fc0" />
          <Seal size={78} style={{ right: 30, bottom: 22, opacity: 0.6 }}>婚姻登记<br />专用章</Seal>
        </div>
      </div>
    </div>
  );
}
function House({ d }: { d: Doc }) {
  return (
    <div className="dbook" style={{ background: '#24453A' }}>
      <div className="pages">
        <div className="pg-l">
          <div className="dfld">
            <F k="权利人"><b className="serif">{row(d, '权利人') || S.name}</b></F>
            {row(d, '共有情况') && <F k="共有情况">{row(d, '共有情况')}</F>}
            <F k="坐　落">{row(d, '坐落')}</F>
            {row(d, '用途') && <F k="用　途">{row(d, '用途')}</F>}
            <F k="面　积"><span className="mono">{row(d, '面积')}</span></F>
            <F k="购入价"><span className="mono">{row(d, '价格')}</span></F>
            <F k="贷　款"><span className="mono">{row(d, '贷款')}</span></F>
          </div>
        </div>
        <div className="pg-r">
          <svg viewBox="0 0 220 130" role="img" aria-label="户型图" className="plan">
            <g fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="208" height="118" /><line x1="96" y1="6" x2="96" y2="80" /><line x1="6" y1="80" x2="150" y2="80" /><line x1="150" y1="6" x2="150" y2="124" /><line x1="96" y1="80" x2="96" y2="124" /></g>
            <g fill="currentColor" fontSize="10" opacity=".6"><text x="30" y="46">主卧</text><text x="112" y="46">次卧</text><text x="40" y="106">客厅</text><text x="112" y="106">厨</text><text x="168" y="70">阳台</text></g>
          </svg>
          <figure className="dscene"><PixCanvas id="house" ctx={{ sex: S.sex, seed: S.seed }} t={0} /></figure>
          <Stamps d={d} top={18} />
        </div>
      </div>
    </div>
  );
}
function Kid({ d }: { d: Doc }) {
  return (
    <div className="dpaper dform kid">
      <div className="kid-g" aria-hidden="true" />
      <div className="kid-b">
        <div className="dhead"><span className="dtitle pink">出生医学证明</span>{row(d, '编号') && <span className="mono">{row(d, '编号')}</span>}</div>
        <div className="dfld">
          <F k="新生儿姓名"><b className="serif big">{row(d, '新生儿')}</b></F>
          <F k="性　别">{row(d, '性别')}</F>
          <F k="出生时间">{row(d, '出生时间') || `${d.y} 年 ${d.m} 月`}</F>
          {row(d, '出生地点') && <F k="出生地点">{row(d, '出生地点')}</F>}
          {row(d, '母亲') ? <><F k="母　亲">{row(d, '母亲')}</F><F k="父　亲">{row(d, '父亲')}</F></> : <F k="父　母">{row(d, '父母')}</F>}
        </div>
        <div className="dfoot"><Feet c="#8A2D55" /><span>新生儿足印</span></div>
        <Seal size={78} style={{ right: 12, bottom: 10 }}>出生医学<br />证明专用章</Seal>
      </div>
    </div>
  );
}
function Ill({ d }: { d: Doc }) {
  return (
    <div className="dpaper dform ill">
      <div className="serif hosp">{row(d, '医院') || '人民医院'}</div>
      <div className="dtitle">诊断证明书</div>
      <div className="blueline" />
      <div className="dfld three"><F k="姓名"><span className="serif">{S.name}</span></F><F k="性别">{S.sex === 'M' ? '男' : '女'}</F><F k="年龄"><span className="mono">{row(d, '年龄') || d.a}</span></F></div>
      <div className="lbl serif">诊断</div>
      <div className="scrawl big">{row(d, '诊断')}</div>
      {row(d, '医嘱') && <><div className="lbl serif">医嘱</div><div className="scrawl">{row(d, '医嘱')}</div></>}
      <div className="dfoot sp"><span className="mono">{row(d, '日期')}</span><span className="serif lbl">医师 <span className="scrawl">{pickBy(row(d, '医院') + d.a, ['陈', '王', '李', '赵', '周'])}</span></span></div>
      <Seal size={74} style={{ right: 70, bottom: 14 }}>诊断证明<br />专用章</Seal>
      <Stamps d={d} top={12} right={12} />
    </div>
  );
}
function Retire({ d }: { d: Doc }) {
  return (
    <div className="dbook" style={{ background: '#A32420' }}>
      <div className="pages">
        <div className="pg-l center">
          <Portrait who={[me(d.a, { ...WEAR.gray, ...oldHair(d.a) })]} bg="#c0453a" />
          <div className="serif glory">光荣退休</div>
          <Seal size={64} style={{ right: 10, bottom: 10 }}>退休证<br />专用章</Seal>
        </div>
        <div className="pg-r">
          <div className="dfld">
            <F k="姓　名"><b className="serif big">{S.name}</b></F>
            {row(d, '原单位') && <F k="原单位">{row(d, '原单位')}</F>}
            <F k="岗　位">{row(d, '原岗位')}</F>
            {row(d, '参加工作') && <F k="参加工作"><span className="mono">{row(d, '参加工作')}</span></F>}
            {row(d, '退休时间') && <F k="退休时间"><span className="mono">{row(d, '退休时间')}</span></F>}
            {row(d, '工龄') && <F k="工　龄"><span className="mono">{row(d, '工龄')}</span></F>}
            {row(d, '养老金') && <F k="养老金"><span className="mono">{row(d, '养老金')}</span></F>}
          </div>
        </div>
      </div>
    </div>
  );
}
function Demol({ d }: { d: Doc }) {
  return (
    <div className="dpaper dform">
      <div className="dtitle">房屋征收补偿协议</div>
      <div className="dfld">
        <F k="被征收人">{row(d, '被征收人')}</F>
        <F k="房　屋">{row(d, '房屋')}</F>
        <F k="补　偿"><span className="mono">{row(d, '补偿')}</span></F>
        <F k="签　约"><span className="mono">{row(d, '签约')}</span></F>
      </div>
      <figure className="dscene wide"><PixCanvas id="demolish" ctx={{ sex: S.sex, seed: S.seed, rural: S.rural }} t={0} /></figure>
      <Seal size={70} style={{ right: 18, bottom: 18 }}>征收<br />专用章</Seal>
    </div>
  );
}
function Generic({ d }: { d: Doc }) {
  return <div className="dpaper dform"><div className="dtitle">{d.title}</div><div className="dfld">{d.rows.map(([k, v], i) => <F key={i} k={k}>{v}</F>)}</div><Stamps d={d} /></div>;
}
const VIEW: Record<string, (p: { d: Doc }) => ReactNode> = {
  birth: Birth, report: Report, school: School, id: IdCard, admit: Admit, grad: Grad, job: Job, civil: Job,
  marry: Marry, divorce: Divorce, house: House, kid: Kid, ill: Ill, retire: Retire, demol: Demol,
};
export function DocView({ d }: { d: Doc }) {
  const V = VIEW[d.k] || Generic;
  return <div className={'dview k-' + d.k}><V d={d} /></div>;
}

// ===== 证件夹 =====
let open: number | null = null, resume = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const useOpen = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => open);
/** 打开证件夹，停在第 i 份。一生进行中时先暂停，关上以后接着走 */
export function openDoc(i: number) {
  if (open == null && game.screen === 'life' && !game.paused) { game.togglePause(); resume = true; }
  open = i; emit();
}
function closeDoc() {
  open = null; emit();
  if (resume) { resume = false; if (game.paused && game.screen === 'life') game.togglePause(); }
}
const GROUPS: [string, string[]][] = [['出 生', ['birth']], ['求 学', ['report', 'school', 'id', 'admit', 'grad']], ['工 作', ['job', 'civil']], ['成 家', ['marry', 'divorce', 'house', 'kid', 'demol']], ['晚 年', ['ill', 'retire']]];
const groupOf = (k: string) => GROUPS.findIndex(g => g[1].includes(k));
/** 目录上的小标签：最后一个章，或者最后一行铅笔字 */
const lastMark = (d: Doc) => { const m = (d.marks || []).filter(x => x.t !== '抵押'); return m.length ? m[m.length - 1] : null; };

/** 这份证件前后两个月里的大事：证件夹里摊开时，写在下面 */
function aroundLog(d: Doc) {
  const t = d.y * 12 + d.m;
  return S.log.filter(e => { const u = e.y * 12 + e.m; return u >= t - 1 && u <= t + 2 && (e.x || e.k === 'choice' || e.pic); }).slice(-3).reverse();
}

export function DocFolder() {
  const i = useOpen();
  const docs = S.docs || [];
  useEffect(() => {
    if (i == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDoc();
      if (e.key === 'ArrowLeft' && i > 0) openDoc(i - 1);
      if (e.key === 'ArrowRight' && i < docs.length - 1) openDoc(i + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [i, docs.length]);
  if (i == null || !docs[i]) return null;
  const d = docs[i], around = aroundLog(d);
  const order = docs.map((x, j) => [x, j] as const);
  return (
    <div className="dfolder-bg" onClick={e => { if (e.target === e.currentTarget) closeDoc(); }}>
      <div className="dfolder-w">
        <span className="ftab"><b>人生档案</b><span className="mono">No. {fileNo(S)}</span><span>{S.name} · 材料 {docs.length} 份</span></span>
        <div className="dfolder" role="dialog" aria-modal="true" aria-label="证件夹">
          <nav className="dfolder-nav" aria-label="材料目录">
            <div className="dfolder-h"><b className="serif">材料目录</b><span>按人生的段落</span></div>
            <div className="dfolder-list">
              {GROUPS.map(([g], gi) => {
                const items = order.filter(([x]) => groupOf(x.k) === gi || (gi === 2 && groupOf(x.k) < 0));
                if (!items.length) return null;
                return <div key={g}>
                  <div className="grp serif">{g}</div>
                  {items.map(([x, j]) => {
                    const m = lastMark(x), c = coverOf(x);
                    return (
                      <button key={j} type="button" className={'it' + (j === i ? ' on' : '')} aria-current={j === i} onClick={() => openDoc(j)}>
                        <i style={{ background: c.bg, outline: c.line ? '1px solid #D8CFBE' : undefined }} />
                        <span><b>{x.title}</b>{x.k === 'kid' && <small>{row(x, '新生儿')}</small>}{m && <span className="tag" style={{ color: MARK_C[m.c] }}>{m.t.split(' · ')[0].replace(/^\d{4}\.\d+ /, '')}</span>}</span>
                        <span className="d mono">{x.y}</span>
                      </button>
                    );
                  })}
                </div>;
              })}
            </div>
          </nav>
          <section className="dfolder-main">
            <div className="dfolder-top">
              <span className="no serif">{pad2(i + 1)}</span><h2 className="serif">{d.title}</h2><span className="mono when">{d.y}.{pad2(d.m)} · {d.a} 岁</span>
              <button type="button" className="x" aria-label="关闭" onClick={closeDoc}>×</button>
            </div>
            <div className="dfolder-stage">
              <button type="button" className="nav" aria-label="上一份" disabled={i === 0} onClick={() => openDoc(i - 1)}>‹</button>
              <div className="dfolder-doc"><DocView d={d} /></div>
              <button type="button" className="nav" aria-label="下一份" disabled={i === docs.length - 1} onClick={() => openDoc(i + 1)}>›</button>
            </div>
            {around.length > 0 && <div className="dfolder-back">
              <span className="lbl serif">那段日子</span>
              {around.map((e, j) => <p key={j}><span className="mono">{e.y}.{pad2(e.m)}</span>{e.t}</p>)}
            </div>}
          </section>
        </div>
      </div>
    </div>
  );
}

// ===== 右下角「材料目录」：不弹窗也摊开 =====
// 上面一排封皮按时间排，点哪份看哪份（默认最新的）；下面把这份证件按原样画出来再缩到栏宽。点证件或「展开」打开证件夹
const MOUNT_W = 560; // 证件按这个宽度排版，再整体缩小：和证件夹里摊开的是同一个样子
function Shrunk({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ k: 0.5, h: 0 });
  useEffect(() => {
    const b = box.current, n = inner.current;
    if (!b || !n) return;
    const upd = () => { const k = Math.min(1, b.clientWidth / MOUNT_W); setFit({ k, h: n.offsetHeight * k }); };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(b); ro.observe(n);
    return () => ro.disconnect();
  }, []);
  return <div ref={box} className="dshrunk" style={{ height: fit.h || undefined }}>
    <div ref={inner} className="dshrunk-in" style={{ width: MOUNT_W, transform: `scale(${fit.k})` }}>{children}</div>
  </div>;
}
// 卡片上写一句：每种证件最要紧的一两样
const SUM: Record<string, (r: (k: string) => string) => string[]> = {
  birth: r => [r('出生地'), r('出生地点')], report: r => [r('年级'), r('学校')], school: r => [r('学校')], id: r => [r('住址')],
  admit: r => [r('学校'), r('专业')], grad: r => [r('学历'), r('专业')], civil: r => [r('岗位'), r('工作地')],
  marry: r => [r('配偶') && '和' + r('配偶')], divorce: r => [r('对方') && '和' + r('对方'), r('婚姻')],
  house: r => [r('坐落').replace(/ · $/, ''), r('面积')], kid: r => [r('新生儿'), r('性别')], ill: r => [r('诊断'), r('医院')],
  retire: r => [r('原单位') || r('原岗位')], demol: r => [r('补偿')],
};
const sumOf = (d: Doc) => {
  const r = (k: string) => row(d, k);
  const vs = d.k === 'job' ? (d.v === 'blue' ? [r('工种'), r('务工地')] : [r('岗位'), r('甲方')]) : SUM[d.k] ? SUM[d.k](r) : d.rows.slice(0, 2).map(x => x[1]);
  return vs.filter(Boolean).join(' · ');
};
export function DocShelf() {
  const docs = S.docs || [];
  const [on, setOn] = useState<number | null>(null);
  if (!docs.length) return <p className="note-line" style={{ margin: 0 }}>还没有材料。</p>;
  return <div className="dshelf">
    {docs.map((d, i) => [d, i] as const).reverse().map(([d, i]) => {
      const c = coverOf(d), m = lastMark(d), open = on === i;
      return <div key={i} className={'dcv-w' + (open ? ' open' : '')}>
        <button type="button" className={'dcv' + (c.line ? ' line' : '')} aria-expanded={open} style={{ background: c.bg, color: c.fg }} onClick={() => setOn(open ? null : i)}>
          <span className="dcv-t"><b>{d.title}</b><span className="mono">{d.y}.{pad2(d.m)}</span></span>
          <span className="dcv-s">{sumOf(d)}{m && <em>{m.t.split(' · ')[0].replace(/^\d{4}\.\d+ /, '')}</em>}</span>
        </button>
        {open && <div className="dcv-open">
          <button type="button" className="dshelf-doc" aria-label={'在证件夹里看' + d.title} onClick={() => openDoc(i)}><Shrunk><DocView d={d} /></Shrunk></button>
          <button type="button" className="sec-link" onClick={() => openDoc(i)}>放大看 ›</button>
        </div>}
      </div>;
    })}
  </div>;
}

// ===== 拿到新证件：右下角滑出来，六秒后收起 =====
const TOAST_MS = 6000;
export function DocToast() {
  const n = (S.docs || []).length;
  const seen = useRef(n);
  const [show, setShow] = useState<number | null>(null);
  useEffect(() => {
    if (n > seen.current) { setShow(n - 1); seen.current = n; const t = setTimeout(() => setShow(null), TOAST_MS); return () => clearTimeout(t); }
    seen.current = n;
  }, [n]);
  const d = show != null ? (S.docs || [])[show] : null;
  if (!d) return null;
  const sub = [row(d, '学校') || row(d, '甲方') || row(d, '坐落') || row(d, '配偶') || row(d, '新生儿') || row(d, '诊断') || row(d, '工种') || row(d, '岗位'), `${d.y}.${pad2(d.m)}`].filter(Boolean).join(' · ');
  return (
    <div className="dtoast" role="status">
      <DocMini d={d} />
      <div className="t"><small>新材料归档 · 第 <span className="mono">{pad2(show! + 1)}</span> 份</small><b className="serif">{d.title}</b><span>{sub}</span></div>
      <button type="button" className="ctl on" onClick={() => { const k = show!; setShow(null); openDoc(k); }}>翻开</button>
      <i className="bar" style={{ animationDuration: TOAST_MS + 'ms' }} />
    </div>
  );
}

// ===== 结局：按发证的年龄铺在一条线上 =====
export function DocTimeline() {
  const docs = S.docs || [], end = Math.max(S.age, 1);
  let lastX = -99, lane = 0;
  const items = docs.map((d, i) => [d, i] as const).sort((a, b) => a[0].a - b[0].a || a[1] - b[1]).map(([d, i]) => {
    const x = d.a / (end + 4) * 100;
    lane = x - lastX < 4.5 ? lane + 1 : 0; lastX = x;
    return { d, i, x, lane };
  });
  return (
    <div className="dline">
      <div className="track" />
      {items.map(({ d, i, x, lane: l }) => (
        <button key={i} type="button" className="pin" style={{ left: x + '%', bottom: 44 + Math.min(l, 3) * 52 }} title={`${d.title} · ${d.y}.${pad2(d.m)} · ${d.a} 岁`} onClick={() => openDoc(i)}><DocMini d={d} w={34} /></button>
      ))}
      <span className="ag mono" style={{ left: 0 }}>0 岁</span>
      <span className="ag mono end" style={{ left: end / (end + 4) * 100 + '%' }}>{S.death ? `享年 ${S.death.age} 岁` : `${S.age} 岁`}</span>
    </div>
  );
}
