import { useId, useState } from 'react';
import { S, TIERS, wan, type MonthlyStatement } from '../engine';

export const cashAmount = (value: number) => {
  const rounded = Math.round(value);
  return (rounded === 0 ? 0 : rounded).toLocaleString('zh-CN') + '元';
};
export const cashChange = (value: number) => {
  const rounded = Math.round(value);
  return (rounded > 0 ? '+' : rounded < 0 ? '−' : '') + cashAmount(Math.abs(rounded));
};
export const monthlySpending = (bill: MonthlyStatement) => bill.living + (bill.plans || 0) + bill.rent + bill.mortgage + bill.debtRepaid;
/** 生活档位的名字（budget.ts 的 TIERS） */
export const tierName = (t?: number) => TIERS[t ?? 1]?.n || '';
const movementClass = (value: number) => value < 0 ? 'neg' : value > 0 ? 'money-up' : undefined;

export const statementAge = (bill: MonthlyStatement, birthYear: number, birthMonth: number) => bill.year - birthYear - Number(bill.month < birthMonth);

const signedWan = (x: number) => (x > 0 ? '+' : '−') + wan(Math.abs(x));
// 年终小结：只在这一年有大笔进出时出现（平常年份不占时间线，逐月的账在「这一年」的账本里）
export function TimelineFinance({ bills, completed, age }: { bills: MonthlyStatement[]; completed: boolean; age?: number }) {
  const [open, setOpen] = useState(false);
  // 这一年的大笔进出（engine/journal.ts 的 noteMoney）：标题上写最大的两笔，展开后全列出来
  const moves = age == null ? [] : (S.moves || []).filter(mv => mv.a === age);
  if (!completed || !bills.length || (age != null && !moves.length)) return null;
  const top = moves.slice().sort((p, q) => Math.abs(q.x) - Math.abs(p.x)).slice(0, 2);
  const income = bills.reduce((total, bill) => total + bill.income, 0);
  const spending = bills.reduce((total, bill) => total + monthlySpending(bill), 0);
  const change = bills.reduce((total, bill) => total + bill.closing - bill.opening, 0);
  const roundedChange = Math.round(change);
  const result = roundedChange === 0 ? '现金没有变化' : `现金${roundedChange > 0 ? '增加' : '减少'}${wan(Math.abs(roundedChange))}`;
  return <details className="timeline-finance" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>
      <span className="timeline-finance-label">年终小结</span>
      <span className={movementClass(change)}>{result}</span>
      {top.length > 0 && <span className="timeline-finance-big">其中{top.map(mv => `${mv.t} ${signedWan(mv.x)}`).join('，')}</span>}
    </summary>
    {open && <div className="timeline-finance-body">
      <p className="account-note">到手 {wan(income)} · 生活和住房 {wan(spending)}</p>
      {moves.length > 0 && <dl className="big-moves">{moves.map((mv, i) => <div key={i}><dt>{mv.m}月 · {mv.t}</dt><dd className={movementClass(mv.x)}>{signedWan(mv.x)}</dd></div>)}</dl>}
      {bills.slice().reverse().map(bill => <AccountStatement key={`${bill.year}-${bill.month}`} bill={bill} />)}
    </div>}
  </details>;
}

export function AccountStatement({ bill = S.statement }: { bill?: MonthlyStatement } = {}) {
  if (!bill) return <p className="account-note">第一个月结束后生成收支账单。</p>;
  // 只留几行：收入、生活（按档位）、住房、还欠款，其余（事件、家里的往来、利息）合成「其他」；为零的不写
  const rows: [string, number][] = [
    ['到手收入', bill.income], [`生活开销（${tierName(bill.tier)}）`, -bill.living], ['持续的计划', -(bill.plans || 0)],
    ['房租／养老院', -bill.rent], ['房贷', -bill.mortgage], ['还欠款', -bill.debtRepaid],
    ['其他（事件、往来、利息）', bill.events + bill.transfers + bill.depositInterest],
  ];
  const entries: [string, number][] = [['期初现金', bill.opening], ...rows.filter(([, v]) => Math.round(v) !== 0), ['期末现金', bill.closing]];
  const change = bill.closing - bill.opening;
  return <details className="account-statement">
    <summary>
      <span className="statement-date">{bill.year}年{bill.month}月<small>期末 {wan(bill.closing)}</small></span>
      <span className={'statement-change ' + (movementClass(change) || '')}><small>现金变化</small>{cashChange(change)}</span>
    </summary>
    <div className="statement-body">
      <dl>{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{cashAmount(value)}</dd></div>)}</dl>
      {bill.incomeDetails && (bill.incomeDetails.partner > 0 || bill.incomeDetails.rehire > 0 || bill.incomeDetails.aid > 0) && <div className="statement-income">
        <span>到手收入构成</span>
        <dl>
          <div><dt>本人收入／养老金及补贴</dt><dd>{cashAmount(bill.incomeDetails.personal)}</dd></div>
          {bill.incomeDetails.partner > 0 && <div><dt>配偶到手收入</dt><dd>{cashAmount(bill.incomeDetails.partner)}</dd></div>}
          {bill.incomeDetails.rehire > 0 && <div><dt>返聘收入</dt><dd>{cashAmount(bill.incomeDetails.rehire)}</dd></div>}
          {bill.incomeDetails.aid > 0 && <div><dt>低保</dt><dd>{cashAmount(bill.incomeDetails.aid)}</dd></div>}
        </dl>
      </div>}
      {bill.mortgageHpf > 1 && <p className="account-note">另外公积金付了房贷 {cashAmount(bill.mortgageHpf)}。</p>}
      {bill.debt > 1 && <p className="account-note">月底还欠着 {cashAmount(bill.debt)}。</p>}
      {bill.arrears > 1 && <p className="account-note neg">房贷累计逾期 {cashAmount(bill.arrears)}，仍包含在贷款余额中。</p>}
      {bill.shortfall > 1 && <p className="account-note neg">钱不够付必要的生活和住房，差了 {cashAmount(bill.shortfall)}，记成了欠款。</p>}
    </div>
  </details>;
}

export function MonthlyLedger({ m, embedded = false }: { m?: string; embedded?: boolean }) {
  const yearId = useId();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const bills = S.statements?.length ? S.statements : S.statement ? [S.statement] : [];
  const latest = bills[bills.length - 1];
  const history = bills.slice(0, -1);
  const years = [...new Set(history.map(bill => bill.year))].sort((first, second) => second - first);
  const year = years.includes(selectedYear) ? selectedYear : years[0];
  const visible = history.filter(bill => bill.year === year).slice().reverse();
  const incomplete = (S.cashflow?.months || 0) > bills.length;
  const yearIncome = visible.reduce((total, bill) => total + bill.income, 0);
  const yearSpending = visible.reduce((total, bill) => total + monthlySpending(bill), 0);
  const yearChange = visible.reduce((total, bill) => total + bill.closing - bill.opening, 0);
  const content = latest ? <>
    <AccountStatement key={`${latest.year}-${latest.month}`} bill={latest} />
    {(history.length > 0 || incomplete) && <details className="finance-fold ledger-history">
      <summary><span>查看历史账单</span><span className="fold-meta">{history.length} 个月</span></summary>
      <div className="finance-fold-body">
        {history.length > 0 && <>
          <div className="ledger-toolbar">
            <label htmlFor={yearId}>查看年份 <select id={yearId} value={year} onChange={event => setSelectedYear(Number(event.target.value))}>
              {years.map(value => <option key={value} value={value}>{value}年</option>)}
            </select></label>
            <span>历史记录 {history.length} 个月</span>
          </div>
          <dl className="finance-metrics ledger-totals">
            <div><dt>到手收入</dt><dd>{wan(yearIncome)}</dd></div>
            <div><dt>生活与还款</dt><dd>{wan(yearSpending)}</dd></div>
            <div><dt>现金变化</dt><dd className={movementClass(yearChange)}>{cashChange(yearChange)}</dd></div>
          </dl>
          <p className="account-note ledger-hint">以上为所选年份的 {visible.length} 个月历史记录；现金变化含利息、转账及事件，点开月份查看明细。</p>
          <div className="ledger-months" key={year}>{visible.map(bill => <AccountStatement key={`${bill.year}-${bill.month}`} bill={bill} />)}</div>
        </>}
        {incomplete && <p className="account-note">账单从 {bills[0].year}年{bills[0].month}月开始保留，更早月份暂无明细。</p>}
      </div>
    </details>}
  </> : <p className="account-note ledger-empty">{S.indep === false ? '经济独立后，每月月底会自动记下一笔收支。' : '第一个月结算后，这里会保留每个月的收支，之后也能回来翻看。'}</p>;
  if (embedded) return <div className="monthly-ledger">{content}</div>;
  if (S.indep === false && !latest) return null; // 经济独立以前没有自己的账：整栏不显示
  return <section className="pg monthly-ledger" data-m={m}>
    <div className="sec"><span className="no">六</span><h3>收支账本</h3><small>按月留档</small></div>
    {content}
  </section>;
}
