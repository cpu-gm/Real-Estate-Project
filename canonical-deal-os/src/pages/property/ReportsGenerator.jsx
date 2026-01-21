import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  FileBarChart,
  FileText,
  Table2,
  PiggyBank,
  Download,
  Loader2,
  CheckCircle2,
  Calendar
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

function getJsonClaim(claims, field) {
  const claim = claims.find(c => c.field === field);
  if (!claim) return null;
  return parseClaimValue(claim.value);
}

function formatCurrency(value) {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `$${num.toLocaleString()}`;
}

const REPORT_TYPES = [
  {
    id: 'property-summary',
    title: 'Property Summary Report',
    description: 'Basic property details, location, and key metrics',
    icon: FileText
  },
  {
    id: 'financial-performance',
    title: 'Financial Performance Report',
    description: 'Income statement, expense breakdown, NOI analysis',
    icon: FileBarChart
  },
  {
    id: 'rent-roll',
    title: 'Rent Roll Export',
    description: 'Unit mix, current rents, vacancy details',
    icon: Table2
  },
  {
    id: 'investment-summary',
    title: 'Investment Summary',
    description: 'Acquisition info, equity position, returns analysis',
    icon: PiggyBank
  }
];

const FORMAT_OPTIONS = [
  { id: 'pdf', label: 'PDF Document' },
  { id: 'csv', label: 'CSV Spreadsheet' }
];

function generatePropertySummaryHTML(draft, claims, data) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Property Summary - ${data.propertyName}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
        h1 { color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
        h2 { color: #475569; margin-top: 30px; }
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 30px; }
        .meta { color: #64748b; font-size: 14px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .card { background: #f8fafc; padding: 20px; border-radius: 8px; }
        .card h3 { margin: 0 0 15px 0; color: #334155; font-size: 14px; text-transform: uppercase; }
        .stat { margin-bottom: 12px; }
        .stat-label { color: #64748b; font-size: 12px; }
        .stat-value { color: #1e293b; font-size: 18px; font-weight: bold; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>${data.propertyName}</h1>
          <p class="meta">${data.address}</p>
        </div>
        <div class="meta">
          Generated: ${new Date().toLocaleDateString()}
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Property Details</h3>
          <div class="stat">
            <div class="stat-label">Asset Type</div>
            <div class="stat-value">${data.assetType || '-'}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Asset Class</div>
            <div class="stat-value">${data.assetClass ? 'Class ' + data.assetClass : '-'}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Year Built</div>
            <div class="stat-value">${data.yearBuilt || '-'}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Total Units</div>
            <div class="stat-value">${data.unitCount?.toLocaleString() || '-'}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Total SF</div>
            <div class="stat-value">${data.totalSF?.toLocaleString() || '-'} SF</div>
          </div>
        </div>

        <div class="card">
          <h3>Key Metrics</h3>
          <div class="stat">
            <div class="stat-label">Current NOI</div>
            <div class="stat-value">${formatCurrency(data.currentNOI)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Occupancy</div>
            <div class="stat-value">${data.occupancy ? data.occupancy + '%' : '-'}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Estimated Value</div>
            <div class="stat-value">${formatCurrency(data.estimatedValue)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Cap Rate</div>
            <div class="stat-value">${data.estimatedCapRate ? data.estimatedCapRate + '%' : '-'}</div>
          </div>
        </div>
      </div>

      <div class="footer">
        This report was generated by the Property Management Platform. Data as of ${new Date().toLocaleDateString()}.
      </div>
    </body>
    </html>
  `;
}

function generateFinancialReportHTML(draft, claims, data) {
  const expenseRatio = data.grossRevenue && data.operatingExpenses
    ? ((data.operatingExpenses / data.grossRevenue) * 100).toFixed(1)
    : null;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Financial Performance - ${data.propertyName}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
        h1 { color: #1e293b; border-bottom: 2px solid #10b981; padding-bottom: 10px; }
        h2 { color: #475569; margin-top: 30px; }
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 30px; }
        .meta { color: #64748b; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; color: #475569; font-weight: 600; }
        td.number { text-align: right; font-family: monospace; }
        .highlight { background: #f0fdf4; font-weight: bold; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>Financial Performance Report</h1>
          <p class="meta">${data.propertyName}</p>
        </div>
        <div class="meta">
          Generated: ${new Date().toLocaleDateString()}
        </div>
      </div>

      <h2>Income Statement (T-12)</h2>
      <table>
        <tr>
          <th>Category</th>
          <th style="text-align: right">Amount</th>
        </tr>
        <tr>
          <td>Gross Revenue</td>
          <td class="number">${formatCurrency(data.grossRevenue)}</td>
        </tr>
        <tr>
          <td>Operating Expenses</td>
          <td class="number">(${formatCurrency(data.operatingExpenses)})</td>
        </tr>
        <tr class="highlight">
          <td><strong>Net Operating Income (NOI)</strong></td>
          <td class="number"><strong>${formatCurrency(data.currentNOI)}</strong></td>
        </tr>
      </table>

      <h2>Performance Metrics</h2>
      <table>
        <tr>
          <th>Metric</th>
          <th style="text-align: right">Value</th>
        </tr>
        <tr>
          <td>Expense Ratio</td>
          <td class="number">${expenseRatio ? expenseRatio + '%' : '-'}</td>
        </tr>
        <tr>
          <td>Occupancy Rate</td>
          <td class="number">${data.occupancy ? data.occupancy + '%' : '-'}</td>
        </tr>
        <tr>
          <td>Average Rent</td>
          <td class="number">${formatCurrency(data.avgRent)}/month</td>
        </tr>
        <tr>
          <td>Cap Rate</td>
          <td class="number">${data.estimatedCapRate ? data.estimatedCapRate + '%' : '-'}</td>
        </tr>
      </table>

      <div class="footer">
        This report was generated by the Property Management Platform. Financial data based on trailing 12-month actuals.
      </div>
    </body>
    </html>
  `;
}

function generateRentRollHTML(draft, claims, data) {
  const unitMix = data.unitMix || [];

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Rent Roll - ${data.propertyName}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; }
        h1 { color: #1e293b; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px; }
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 30px; }
        .meta { color: #64748b; font-size: 14px; }
        .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
        .summary-card { background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; }
        .summary-value { font-size: 24px; font-weight: bold; color: #1e293b; }
        .summary-label { font-size: 12px; color: #64748b; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; color: #475569; font-weight: 600; }
        td.number { text-align: right; font-family: monospace; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>Rent Roll Export</h1>
          <p class="meta">${data.propertyName}</p>
        </div>
        <div class="meta">
          Generated: ${new Date().toLocaleDateString()}
        </div>
      </div>

      <div class="summary">
        <div class="summary-card">
          <div class="summary-value">${data.unitCount || '-'}</div>
          <div class="summary-label">Total Units</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${data.occupancy ? data.occupancy + '%' : '-'}</div>
          <div class="summary-label">Occupancy</div>
        </div>
        <div class="summary-card">
          <div class="summary-value">${formatCurrency(data.avgRent)}</div>
          <div class="summary-label">Average Rent</div>
        </div>
      </div>

      <h2>Unit Mix</h2>
      <table>
        <tr>
          <th>Unit Type</th>
          <th style="text-align: right">Count</th>
          <th style="text-align: right">Avg SF</th>
          <th style="text-align: right">Current Rent</th>
          <th style="text-align: right">Total Revenue</th>
        </tr>
        ${unitMix.map(unit => `
          <tr>
            <td>${unit.type}</td>
            <td class="number">${unit.count}</td>
            <td class="number">${unit.avgSF?.toLocaleString() || '-'}</td>
            <td class="number">${formatCurrency(unit.currentRent || unit.marketRent)}</td>
            <td class="number">${formatCurrency((unit.count || 0) * (unit.currentRent || unit.marketRent || 0))}</td>
          </tr>
        `).join('')}
      </table>

      <div class="footer">
        This report was generated by the Property Management Platform. Rent data as of ${new Date().toLocaleDateString()}.
      </div>
    </body>
    </html>
  `;
}

function generateInvestmentSummaryHTML(draft, claims, data) {
  const equity = data.estimatedValue && data.loanBalance
    ? data.estimatedValue - data.loanBalance
    : null;

  const appreciation = data.acquisitionPrice && data.estimatedValue
    ? ((data.estimatedValue - data.acquisitionPrice) / data.acquisitionPrice * 100).toFixed(1)
    : null;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Investment Summary - ${data.propertyName}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
        h1 { color: #1e293b; border-bottom: 2px solid #f59e0b; padding-bottom: 10px; }
        h2 { color: #475569; margin-top: 30px; }
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 30px; }
        .meta { color: #64748b; font-size: 14px; }
        .highlight-box { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 30px; border-radius: 12px; margin: 30px 0; text-align: center; }
        .highlight-value { font-size: 36px; font-weight: bold; color: #92400e; }
        .highlight-label { font-size: 14px; color: #a16207; margin-top: 8px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .card { background: #f8fafc; padding: 20px; border-radius: 8px; }
        .card h3 { margin: 0 0 15px 0; color: #334155; font-size: 14px; text-transform: uppercase; }
        .stat { margin-bottom: 12px; }
        .stat-label { color: #64748b; font-size: 12px; }
        .stat-value { color: #1e293b; font-size: 18px; font-weight: bold; }
        .positive { color: #16a34a; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>Investment Summary</h1>
          <p class="meta">${data.propertyName}</p>
        </div>
        <div class="meta">
          Generated: ${new Date().toLocaleDateString()}
        </div>
      </div>

      <div class="highlight-box">
        <div class="highlight-value">${formatCurrency(equity)}</div>
        <div class="highlight-label">Current Equity Position</div>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Acquisition</h3>
          <div class="stat">
            <div class="stat-label">Purchase Price</div>
            <div class="stat-value">${formatCurrency(data.acquisitionPrice)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Acquisition Date</div>
            <div class="stat-value">${data.acquisitionDate ? new Date(data.acquisitionDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '-'}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Acquisition Cap Rate</div>
            <div class="stat-value">${data.acquisitionCapRate ? data.acquisitionCapRate + '%' : '-'}</div>
          </div>
        </div>

        <div class="card">
          <h3>Current Value</h3>
          <div class="stat">
            <div class="stat-label">Estimated Value</div>
            <div class="stat-value">${formatCurrency(data.estimatedValue)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Appreciation</div>
            <div class="stat-value positive">${appreciation ? '+' + appreciation + '%' : '-'}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Current Cap Rate</div>
            <div class="stat-value">${data.estimatedCapRate ? data.estimatedCapRate + '%' : '-'}</div>
          </div>
        </div>

        <div class="card">
          <h3>Debt Position</h3>
          <div class="stat">
            <div class="stat-label">Loan Balance</div>
            <div class="stat-value">${formatCurrency(data.loanBalance)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Interest Rate</div>
            <div class="stat-value">${data.interestRate ? data.interestRate + '%' : '-'}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Lender</div>
            <div class="stat-value">${data.lender || '-'}</div>
          </div>
        </div>

        <div class="card">
          <h3>Returns</h3>
          <div class="stat">
            <div class="stat-label">Current NOI</div>
            <div class="stat-value">${formatCurrency(data.currentNOI)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">LTV Ratio</div>
            <div class="stat-value">${data.estimatedValue && data.loanBalance ? ((data.loanBalance / data.estimatedValue) * 100).toFixed(1) + '%' : '-'}</div>
          </div>
        </div>
      </div>

      <div class="footer">
        This report was generated by the Property Management Platform. Values are estimates as of ${new Date().toLocaleDateString()}.
      </div>
    </body>
    </html>
  `;
}

function generateCSV(data, reportType) {
  let rows = [];

  if (reportType === 'property-summary') {
    rows = [
      ['Property Summary Report'],
      ['Generated', new Date().toLocaleDateString()],
      [''],
      ['Property Name', data.propertyName],
      ['Address', data.address],
      ['Asset Type', data.assetType || ''],
      ['Asset Class', data.assetClass || ''],
      ['Year Built', data.yearBuilt || ''],
      ['Total Units', data.unitCount || ''],
      ['Total SF', data.totalSF || ''],
      [''],
      ['Key Metrics'],
      ['Current NOI', data.currentNOI || ''],
      ['Occupancy', data.occupancy ? data.occupancy + '%' : ''],
      ['Estimated Value', data.estimatedValue || ''],
      ['Cap Rate', data.estimatedCapRate ? data.estimatedCapRate + '%' : '']
    ];
  } else if (reportType === 'rent-roll') {
    rows = [
      ['Rent Roll Export'],
      ['Property', data.propertyName],
      ['Generated', new Date().toLocaleDateString()],
      [''],
      ['Unit Type', 'Count', 'Avg SF', 'Current Rent', 'Total Revenue'],
      ...(data.unitMix || []).map(unit => [
        unit.type,
        unit.count,
        unit.avgSF || '',
        unit.currentRent || unit.marketRent || '',
        (unit.count || 0) * (unit.currentRent || unit.marketRent || 0)
      ])
    ];
  }

  return rows.map(row => row.join(',')).join('\n');
}

export default function ReportsGenerator() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dealDraftId = searchParams.get('dealDraftId');

  const [selectedReport, setSelectedReport] = useState('property-summary');
  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);

  const {
    draft,
    claims,
    isLoading,
    error
  } = useIntakeDealOverview(dealDraftId);

  // Extract all property data from claims
  const propertyData = useMemo(() => {
    if (!draft || !claims) return null;

    const unitMix1BR = getJsonClaim(claims, 'unitMix1BR');
    const unitMix2BR = getJsonClaim(claims, 'unitMix2BR');
    const unitMix3BR = getJsonClaim(claims, 'unitMix3BR');

    return {
      propertyName: draft.propertyName || getStringClaim(claims, 'propertyName'),
      address: draft.propertyAddress || [
        getStringClaim(claims, 'address'),
        getStringClaim(claims, 'city'),
        getStringClaim(claims, 'state'),
        getStringClaim(claims, 'zipCode')
      ].filter(Boolean).join(', '),
      assetType: draft.assetType,
      assetClass: getStringClaim(claims, 'assetClass'),
      yearBuilt: getStringClaim(claims, 'yearBuilt'),
      unitCount: draft.unitCount || getNumericClaim(claims, 'unitCount'),
      totalSF: draft.totalSF || getNumericClaim(claims, 'totalSF'),
      currentNOI: getNumericClaim(claims, 'currentNOI'),
      grossRevenue: getNumericClaim(claims, 'grossRevenue'),
      operatingExpenses: getNumericClaim(claims, 'operatingExpenses'),
      occupancy: getNumericClaim(claims, 'occupancy'),
      avgRent: getNumericClaim(claims, 'avgRent'),
      estimatedValue: getNumericClaim(claims, 'estimatedValue'),
      estimatedCapRate: getNumericClaim(claims, 'estimatedCapRate'),
      acquisitionPrice: getNumericClaim(claims, 'acquisitionPrice'),
      acquisitionDate: getStringClaim(claims, 'acquisitionDate'),
      acquisitionCapRate: getNumericClaim(claims, 'acquisitionCapRate'),
      loanBalance: getNumericClaim(claims, 'loanBalance'),
      interestRate: getNumericClaim(claims, 'interestRate'),
      lender: getStringClaim(claims, 'lender'),
      unitMix: [unitMix1BR, unitMix2BR, unitMix3BR].filter(Boolean)
    };
  }, [draft, claims]);

  const generateReport = async () => {
    setIsGenerating(true);
    setDownloadReady(false);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1500));

    let content;
    let filename;
    let mimeType;

    if (selectedFormat === 'pdf') {
      // Generate HTML and trigger print/save as PDF
      let html;
      switch (selectedReport) {
        case 'property-summary':
          html = generatePropertySummaryHTML(draft, claims, propertyData);
          break;
        case 'financial-performance':
          html = generateFinancialReportHTML(draft, claims, propertyData);
          break;
        case 'rent-roll':
          html = generateRentRollHTML(draft, claims, propertyData);
          break;
        case 'investment-summary':
          html = generateInvestmentSummaryHTML(draft, claims, propertyData);
          break;
        default:
          html = generatePropertySummaryHTML(draft, claims, propertyData);
      }

      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();

    } else if (selectedFormat === 'csv') {
      content = generateCSV(propertyData, selectedReport);
      filename = `${propertyData.propertyName.replace(/\s+/g, '_')}_${selectedReport}.csv`;
      mimeType = 'text/csv';

      // Download CSV
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    setIsGenerating(false);
    setDownloadReady(true);
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
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const selectedReportType = REPORT_TYPES.find(r => r.id === selectedReport);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Generate Reports</h1>
            <p className="text-sm text-slate-500">{draft?.propertyName}</p>
          </div>
        </div>

        {/* Report Type Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Report Type</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={selectedReport} onValueChange={setSelectedReport} className="space-y-3">
              {REPORT_TYPES.map((report) => {
                const Icon = report.icon;
                return (
                  <div
                    key={report.id}
                    className={`flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedReport === report.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'hover:bg-slate-50'
                    }`}
                    onClick={() => setSelectedReport(report.id)}
                  >
                    <RadioGroupItem value={report.id} id={report.id} className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-slate-500" />
                        <Label htmlFor={report.id} className="font-medium cursor-pointer">
                          {report.title}
                        </Label>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{report.description}</p>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Format Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Output Format</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {FORMAT_OPTIONS.map((format) => (
                <Button
                  key={format.id}
                  variant={selectedFormat === format.id ? 'default' : 'outline'}
                  onClick={() => setSelectedFormat(format.id)}
                  className="flex-1"
                >
                  {format.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Generate Button */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{selectedReportType?.title}</h3>
                <p className="text-sm text-slate-500">
                  {selectedFormat === 'pdf' ? 'Opens print dialog to save as PDF' : 'Downloads CSV file'}
                </p>
              </div>
              <Button onClick={generateReport} disabled={isGenerating} className="gap-2">
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : downloadReady ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Generated
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Generate Report
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
