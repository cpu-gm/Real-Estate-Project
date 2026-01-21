import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Landmark,
  Calculator,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Calendar,
  Sparkles,
  Plus,
  Trash2
} from 'lucide-react';
import { useIntakeDealOverview } from '@/lib/hooks/useIntakeDealOverview';
import { createPageUrl } from '@/utils';
import { PageError } from '@/components/ui/page-state';

function parseClaimValue(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getNumericClaim(claims, field) {
  const claim = claims.find(c => c.field === field);
  if (!claim) return null;
  const parsed = parseClaimValue(claim.value);
  return typeof parsed === 'number' ? parsed : parseFloat(parsed) || null;
}

function getStringClaim(claims, field) {
  const claim = claims.find(c => c.field === field);
  if (!claim) return null;
  const parsed = parseClaimValue(claim.value);
  return typeof parsed === 'string' ? parsed : String(parsed);
}

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

function calculateMonthlyPayment(principal, annualRate, years) {
  if (!principal || !annualRate || !years) return 0;
  const monthlyRate = annualRate / 100 / 12;
  const numPayments = years * 12;
  if (monthlyRate === 0) return principal / numPayments;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
         (Math.pow(1 + monthlyRate, numPayments) - 1);
}

function calculateTotalInterest(principal, monthlyPayment, years) {
  return (monthlyPayment * years * 12) - principal;
}

function CurrentDebtCard({ loanBalance, interestRate, loanMaturity, lender, monthlyPayment }) {
  const maturityDate = loanMaturity ? new Date(loanMaturity) : null;
  const formattedMaturity = maturityDate
    ? maturityDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '-';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Landmark className="h-5 w-5 text-slate-500" />
          Current Loan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-500">Outstanding Balance</p>
            <p className="text-xl font-bold">{formatCurrency(loanBalance)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Interest Rate</p>
            <p className="text-xl font-bold">{interestRate ? `${interestRate}%` : '-'}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Maturity Date</p>
            <p className="font-medium">{formattedMaturity}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Lender</p>
            <p className="font-medium">{lender || '-'}</p>
          </div>
        </div>
        {monthlyPayment > 0 && (
          <div className="pt-3 border-t">
            <p className="text-sm text-slate-500">Monthly Payment</p>
            <p className="text-lg font-bold">{formatCurrency(monthlyPayment)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScenarioCard({
  scenario,
  index,
  propertyValue,
  currentPayment,
  onChange,
  onRemove,
  canRemove
}) {
  const ltvPercent = propertyValue && scenario.loanAmount
    ? ((scenario.loanAmount / propertyValue) * 100).toFixed(1)
    : null;

  const newMonthlyPayment = calculateMonthlyPayment(
    scenario.loanAmount,
    scenario.interestRate,
    scenario.termYears
  );

  const monthlySavings = currentPayment - newMonthlyPayment;
  const totalNewInterest = calculateTotalInterest(scenario.loanAmount, newMonthlyPayment, scenario.termYears);

  return (
    <Card className="border-2 border-blue-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Scenario {index + 1}</CardTitle>
          {canRemove && (
            <Button variant="ghost" size="icon" onClick={onRemove}>
              <Trash2 className="h-4 w-4 text-slate-400" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`amount-${index}`}>New Loan Amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id={`amount-${index}`}
                type="text"
                value={scenario.loanAmount ? scenario.loanAmount.toLocaleString() : ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  onChange({ ...scenario, loanAmount: parseInt(value) || 0 });
                }}
                className="pl-9"
              />
            </div>
            {ltvPercent && (
              <p className="text-xs text-slate-500">LTV: {ltvPercent}%</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`rate-${index}`}>Interest Rate (%)</Label>
            <Input
              id={`rate-${index}`}
              type="number"
              step="0.125"
              min="0"
              max="15"
              value={scenario.interestRate || ''}
              onChange={(e) => onChange({ ...scenario, interestRate: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`term-${index}`}>Loan Term</Label>
            <Select
              value={String(scenario.termYears)}
              onValueChange={(value) => onChange({ ...scenario, termYears: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 years</SelectItem>
                <SelectItem value="20">20 years</SelectItem>
                <SelectItem value="25">25 years</SelectItem>
                <SelectItem value="30">30 years</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`cashout-${index}`}>Cash-Out</Label>
              <Switch
                checked={scenario.cashOutEnabled}
                onCheckedChange={(checked) => onChange({ ...scenario, cashOutEnabled: checked })}
              />
            </div>
            {scenario.cashOutEnabled && (
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id={`cashout-${index}`}
                  type="text"
                  value={scenario.cashOutAmount ? scenario.cashOutAmount.toLocaleString() : ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    onChange({ ...scenario, cashOutAmount: parseInt(value) || 0 });
                  }}
                  className="pl-9"
                />
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="pt-4 border-t space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">New Monthly Payment</span>
            <span className="font-bold">{formatCurrency(newMonthlyPayment)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">Monthly Savings</span>
            <span className={`font-bold flex items-center gap-1 ${monthlySavings > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {monthlySavings > 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              {formatCurrency(Math.abs(monthlySavings))}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">Total Interest (over term)</span>
            <span className="font-medium">{formatCurrency(totalNewInterest)}</span>
          </div>
          {scenario.cashOutEnabled && scenario.cashOutAmount > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Cash at Closing</span>
              <span className="font-bold text-blue-600">{formatCurrency(scenario.cashOutAmount)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AmortizationPreview({ principal, rate, years }) {
  const monthlyPayment = calculateMonthlyPayment(principal, rate, years);
  const monthlyRate = rate / 100 / 12;

  // Generate first 12 months
  const schedule = [];
  let balance = principal;

  for (let month = 1; month <= Math.min(12, years * 12); month++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    balance -= principalPayment;

    schedule.push({
      month,
      payment: monthlyPayment,
      principal: principalPayment,
      interest: interestPayment,
      balance: Math.max(0, balance)
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Amortization Preview (First Year)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Payment</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Interest</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule.map((row) => (
              <TableRow key={row.month}>
                <TableCell>{row.month}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.payment)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.principal)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.interest)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function RefinanceAnalysis() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dealDraftId = searchParams.get('dealDraftId');

  const {
    draft,
    claims,
    isLoading,
    error
  } = useIntakeDealOverview(dealDraftId);

  const [scenarios, setScenarios] = useState([
    { loanAmount: 0, interestRate: 5.5, termYears: 30, cashOutEnabled: false, cashOutAmount: 0 }
  ]);

  // Extract current loan data from claims
  const currentDebt = useMemo(() => {
    if (!claims) return null;
    return {
      loanBalance: getNumericClaim(claims, 'loanBalance'),
      interestRate: getNumericClaim(claims, 'interestRate'),
      loanMaturity: getStringClaim(claims, 'loanMaturity'),
      lender: getStringClaim(claims, 'lender'),
      estimatedValue: getNumericClaim(claims, 'estimatedValue')
    };
  }, [claims]);

  // Calculate current monthly payment (estimate based on interest only for simplicity)
  const currentMonthlyPayment = useMemo(() => {
    if (!currentDebt?.loanBalance || !currentDebt?.interestRate) return 0;
    // Estimate assuming 25 year remaining term
    return calculateMonthlyPayment(currentDebt.loanBalance, currentDebt.interestRate, 25);
  }, [currentDebt]);

  // Initialize first scenario with current loan balance when data loads
  useMemo(() => {
    if (currentDebt?.loanBalance && scenarios[0].loanAmount === 0) {
      setScenarios([{
        ...scenarios[0],
        loanAmount: currentDebt.loanBalance
      }]);
    }
  }, [currentDebt]);

  const addScenario = () => {
    if (scenarios.length < 3) {
      setScenarios([...scenarios, {
        loanAmount: currentDebt?.loanBalance || 0,
        interestRate: 5.5,
        termYears: 30,
        cashOutEnabled: false,
        cashOutAmount: 0
      }]);
    }
  };

  const removeScenario = (index) => {
    setScenarios(scenarios.filter((_, i) => i !== index));
  };

  const updateScenario = (index, updated) => {
    setScenarios(scenarios.map((s, i) => i === index ? updated : s));
  };

  if (!dealDraftId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">
            Missing dealDraftId. Please select a property.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <PageError error={error} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Refinance Analysis</h1>
              <p className="text-sm text-slate-500">{draft?.propertyName}</p>
            </div>
          </div>

          {/* AI Memo Button - Coming Soon */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" disabled className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Memo Analysis
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Coming Soon - AI-powered refinance memo generation</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Current Loan + Scenario Calculator */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Current Loan Info */}
          <CurrentDebtCard
            loanBalance={currentDebt?.loanBalance}
            interestRate={currentDebt?.interestRate}
            loanMaturity={currentDebt?.loanMaturity}
            lender={currentDebt?.lender}
            monthlyPayment={currentMonthlyPayment}
          />

          {/* Scenarios */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Calculator className="h-5 w-5 text-slate-500" />
                Refinance Scenarios
              </h2>
              {scenarios.length < 3 && (
                <Button variant="outline" size="sm" onClick={addScenario}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Scenario
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scenarios.map((scenario, index) => (
                <ScenarioCard
                  key={index}
                  scenario={scenario}
                  index={index}
                  propertyValue={currentDebt?.estimatedValue}
                  currentPayment={currentMonthlyPayment}
                  onChange={(updated) => updateScenario(index, updated)}
                  onRemove={() => removeScenario(index)}
                  canRemove={scenarios.length > 1}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Amortization Preview for first scenario */}
        {scenarios[0].loanAmount > 0 && scenarios[0].interestRate > 0 && (
          <AmortizationPreview
            principal={scenarios[0].loanAmount}
            rate={scenarios[0].interestRate}
            years={scenarios[0].termYears}
          />
        )}

        {/* Summary Comparison */}
        {scenarios.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scenario Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    {scenarios.map((_, i) => (
                      <TableHead key={i} className="text-right">Scenario {i + 1}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Loan Amount</TableCell>
                    <TableCell className="text-right">{formatCurrency(currentDebt?.loanBalance)}</TableCell>
                    {scenarios.map((s, i) => (
                      <TableCell key={i} className="text-right">{formatCurrency(s.loanAmount)}</TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell>Interest Rate</TableCell>
                    <TableCell className="text-right">{currentDebt?.interestRate}%</TableCell>
                    {scenarios.map((s, i) => (
                      <TableCell key={i} className="text-right">{s.interestRate}%</TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell>Monthly Payment</TableCell>
                    <TableCell className="text-right">{formatCurrency(currentMonthlyPayment)}</TableCell>
                    {scenarios.map((s, i) => (
                      <TableCell key={i} className="text-right">
                        {formatCurrency(calculateMonthlyPayment(s.loanAmount, s.interestRate, s.termYears))}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell>Monthly Savings</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    {scenarios.map((s, i) => {
                      const newPayment = calculateMonthlyPayment(s.loanAmount, s.interestRate, s.termYears);
                      const savings = currentMonthlyPayment - newPayment;
                      return (
                        <TableCell key={i} className={`text-right font-medium ${savings > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {savings > 0 ? '+' : ''}{formatCurrency(savings)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
