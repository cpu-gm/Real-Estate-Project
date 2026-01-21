import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  DollarSign,
  TrendingUp,
  Calendar
} from 'lucide-react';

function formatCurrency(value) {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`;
  }
  if (num >= 1000) {
    return `$${(num / 1000).toFixed(0)}K`;
  }
  return `$${num.toLocaleString()}`;
}

function FinancialRow({ label, value, subtext, highlight = false }) {
  return (
    <div className={`flex items-center justify-between py-3 border-b border-slate-100 last:border-0 ${highlight ? 'bg-slate-50 -mx-4 px-4' : ''}`}>
      <span className={`text-sm ${highlight ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
        {label}
      </span>
      <div className="text-right">
        <span className={`text-sm ${highlight ? 'font-bold text-slate-900' : 'font-medium text-slate-900'}`}>
          {value}
        </span>
        {subtext && (
          <p className="text-xs text-slate-400">{subtext}</p>
        )}
      </div>
    </div>
  );
}

function DebtSummary({ loanBalance, interestRate, loanMaturity, lender, monthlyPayment }) {
  const maturityDate = loanMaturity ? new Date(loanMaturity) : null;
  const formattedMaturity = maturityDate
    ? maturityDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '-';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-slate-500" />
          Debt Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <FinancialRow label="Outstanding Balance" value={formatCurrency(loanBalance)} />
          <FinancialRow label="Interest Rate" value={interestRate ? `${interestRate}%` : '-'} />
          <FinancialRow label="Maturity Date" value={formattedMaturity} />
          <FinancialRow label="Lender" value={lender || '-'} />
          {monthlyPayment && (
            <FinancialRow label="Monthly Payment" value={formatCurrency(monthlyPayment)} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function IncomeStatement({ grossRevenue, operatingExpenses, noi, expenseRatio }) {
  const ratio = expenseRatio || (grossRevenue && operatingExpenses
    ? (operatingExpenses / grossRevenue) * 100
    : null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-slate-500" />
          Income Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <FinancialRow label="Gross Revenue" value={formatCurrency(grossRevenue)} />
          <FinancialRow label="Operating Expenses" value={formatCurrency(operatingExpenses)} />
          <FinancialRow label="Net Operating Income" value={formatCurrency(noi)} highlight />
        </div>

        {ratio && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Expense Ratio</span>
              <span className="text-sm font-medium">{ratio.toFixed(1)}%</span>
            </div>
            <Progress value={ratio} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ValueMetrics({ acquisitionPrice, acquisitionDate, estimatedValue, estimatedCapRate }) {
  const appreciation = (acquisitionPrice && estimatedValue)
    ? ((estimatedValue - acquisitionPrice) / acquisitionPrice) * 100
    : null;

  const acquisitionDateFormatted = acquisitionDate
    ? new Date(acquisitionDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '-';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-slate-500" />
          Value Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <FinancialRow
            label="Acquisition Price"
            value={formatCurrency(acquisitionPrice)}
            subtext={acquisitionDateFormatted}
          />
          <FinancialRow label="Estimated Value" value={formatCurrency(estimatedValue)} highlight />
          <FinancialRow label="Cap Rate" value={estimatedCapRate ? `${estimatedCapRate}%` : '-'} />
          {appreciation !== null && (
            <FinancialRow
              label="Appreciation"
              value={`${appreciation >= 0 ? '+' : ''}${appreciation.toFixed(1)}%`}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PropertyFinancials({
  // Income
  grossRevenue,
  operatingExpenses,
  noi,
  expenseRatio,
  // Debt
  loanBalance,
  interestRate,
  loanMaturity,
  lender,
  monthlyPayment,
  // Value
  acquisitionPrice,
  acquisitionDate,
  estimatedValue,
  estimatedCapRate
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <IncomeStatement
        grossRevenue={grossRevenue}
        operatingExpenses={operatingExpenses}
        noi={noi}
        expenseRatio={expenseRatio}
      />
      <DebtSummary
        loanBalance={loanBalance}
        interestRate={interestRate}
        loanMaturity={loanMaturity}
        lender={lender}
        monthlyPayment={monthlyPayment}
      />
      <ValueMetrics
        acquisitionPrice={acquisitionPrice}
        acquisitionDate={acquisitionDate}
        estimatedValue={estimatedValue}
        estimatedCapRate={estimatedCapRate}
      />
    </div>
  );
}
