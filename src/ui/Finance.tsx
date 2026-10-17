import { useId, useState } from 'react';
import { S, wan, type MonthlyStatement } from '../engine';

export const cashAmount = (value: number) => {
  const rounded = Math.round(value);
  return (rounded === 0 ? 0 : rounded).toLocaleString('zh-CN') + '元';
};
export const cashChange = (value: number) => {
  const rounded = Math.round(value);
  return (rounded > 0 ? '+' : rounded < 0 ? '−' : '') + cashAmount(Math.abs(rounded));
};
export const monthlySpending = (bill: MonthlyStatement) => bill.living + bill.children + bill.discretionary + (bill.savingsSpend || 0) + bill.rent + bill.mortgage + bill.debtRepaid;
const movementClass = (value: number) => value < 0 ? 'neg' : value > 0 ? 'money-up' : undefined;

export const statementAge = (bill: MonthlyStatement, birthYear: number, birthMonth: number) => bill.year - birthYear - Number(bill.month < birthMonth);

export function TimelineFinance({ bills, completed }: { bills: MonthlyStatement[]; completed: boolean }) {
  const [open, setOpen] = useState(false);
  if (!completed || !bills.length) return null;
  const income = bills.reduce((total, bill) => total + bill.income, 0);
  const spending = bills.reduce((total, bill) => total + monthlySpending(bill), 0);
  const change = bills.reduce((total, bill) => total + bill.closing - bill.opening, 0);
  const roundedChange = Math.round(change);
  const result = roundedChange === 0 ? '现金没有变化' : `现金${roundedChange > 0 ? '增加' : '减少'}${wan(Math.abs(roundedChange))}`;
  return <details className="timeline-finance" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>
      <span className="timeline-finance-label">年终小结</span>
      <span className={movementClass(change)}>{result}</span>
    </summary>
    {open && <div className="timeline-finance-body">
      <p className="account-note">到手收入 {wan(income)}，生活与还款 {wan(spending)}。现金变化含利息和其他往来。</p>
      <p className="account-note">共记录 {bills.length} 个月，点开月份看明细。</p>
      {bills.slice().reverse().map(bill => <AccountStatement key={`${bill.year}-${bill.month}`} bill={bill} />)}
    </div>}
  </details>;
}

export function AccountStatement({ bill = S.statement }: { bill?: MonthlyStatement } = {}) {
  if (!bill) return <p className="account-note">第一个月结束后生成收支账单。</p>;
  const entries: [string, number][] = [
    ['期初现金', bill.opening], ['期间事件与转账（净额）', bill.events], ['月底账户转入／家庭往来', bill.transfers],
    ['家庭到手收入', bill.income], ['基本生活', -bill.living], ['孩子日常开销', -bill.children],
    ['房租／养老院（现金实付）', -bill.rent], ['房贷（现金实付）', -bill.mortgage],
    ['偿还其他欠款', -bill.debtRepaid], ['可选消费', -bill.discretionary], ['动用积蓄的花销', -(bill.savingsSpend || 0)], ['存款利息', bill.depositInterest],
    ['期末现金', bill.closing],
  ];
  const change = bill.closing - bill.opening;
  return <details className="account-statement">
    <summary>
      <span className="statement-date">{bill.year}年{bill.month}月<small>期末 {wan(bill.closing)}</small></span>
      <span className={'statement-change ' + (movementClass(change) || '')}><small>现金变化</small>{cashChange(change)}</span>
    </summary>
    <div className="statement-body">
      <dl>{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{cashAmount(value)}</dd></div>)}</dl>
      {bill.incomeDetails && <div className="statement-income">
        <span>到手收入构成</span>
        <dl>
          <div><dt>本人收入／养老金及补贴</dt><dd>{cashAmount(bill.incomeDetails.personal)}</dd></div>
          {bill.incomeDetails.partner > 0 && <div><dt>配偶到手收入</dt><dd>{cashAmount(bill.incomeDetails.partner)}</dd></div>}
          {bill.incomeDetails.rehire > 0 && <div><dt>返聘收入</dt><dd>{cashAmount(bill.incomeDetails.rehire)}</dd></div>}
        </dl>
      </div>}
      <p className="account-note">公积金另付房贷 {cashAmount(bill.mortgageHpf)}；房贷本月计息 {cashAmount(bill.mortgageInterest)}，已计入贷款余额；其他欠款新增利息 {cashAmount(bill.debtInterest)}，未从现金扣除。</p>
      <p className="account-note">月底其他欠款 {cashAmount(bill.debt)}。</p>
      {bill.arrears > 1 && <p className="account-note neg">房贷累计逾期 {cashAmount(bill.arrears)}，仍包含在贷款余额中。</p>}
      {bill.shortfall > 1 && <p className="account-note neg">基本生活或住房缺口 {cashAmount(bill.shortfall)}，已压缩生活，未付房租计入欠款。</p>}
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
  return <section className="pg monthly-ledger" data-m={m}>
    <div className="sec"><span className="no">六</span><h3>收支账本</h3><small>按月留档</small></div>
    {content}
  </section>;
}
