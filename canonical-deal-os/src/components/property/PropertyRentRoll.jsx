import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, TrendingUp } from 'lucide-react';

function formatCurrency(value) {
  if (value === null || value === undefined) return '-';
  return `$${Number(value).toLocaleString()}`;
}

function RentComparisonBar({ currentRent, marketRent }) {
  if (!currentRent || !marketRent) return null;

  const percentage = (currentRent / marketRent) * 100;
  const isBelow = percentage < 100;

  return (
    <div className="w-24">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className={isBelow ? 'text-orange-600' : 'text-green-600'}>
          {percentage.toFixed(0)}%
        </span>
      </div>
      <Progress
        value={Math.min(percentage, 100)}
        className={`h-1.5 ${isBelow ? '[&>div]:bg-orange-500' : '[&>div]:bg-green-500'}`}
      />
    </div>
  );
}

function UnitMixSummary({ unitMix, occupancy }) {
  if (!unitMix || unitMix.length === 0) return null;

  const totalUnits = unitMix.reduce((sum, u) => sum + (u.count || 0), 0);
  const totalRent = unitMix.reduce((sum, u) => sum + ((u.count || 0) * (u.currentRent || u.marketRent || 0)), 0);
  const avgRent = totalUnits > 0 ? totalRent / totalUnits : 0;

  return (
    <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
      <div>
        <p className="text-sm text-slate-500">Total Units</p>
        <p className="text-xl font-bold text-slate-900">{totalUnits}</p>
      </div>
      <div>
        <p className="text-sm text-slate-500">Occupancy</p>
        <p className="text-xl font-bold text-slate-900">{occupancy ? `${occupancy}%` : '-'}</p>
      </div>
      <div>
        <p className="text-sm text-slate-500">Avg Rent</p>
        <p className="text-xl font-bold text-slate-900">{formatCurrency(avgRent)}</p>
      </div>
    </div>
  );
}

export default function PropertyRentRoll({
  unitMix,
  occupancy,
  avgRent,
  marketAvgRent,
  vacantUnits = 0
}) {
  if (!unitMix || unitMix.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-500" />
            Rent Roll
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-slate-500">
            No unit mix data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate rent to market comparison
  const rentToMarket = (avgRent && marketAvgRent)
    ? ((avgRent / marketAvgRent) * 100).toFixed(1)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-500" />
          Rent Roll
        </CardTitle>
      </CardHeader>
      <CardContent>
        <UnitMixSummary unitMix={unitMix} occupancy={occupancy} />

        {rentToMarket && (
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-600">
              Rents are at <span className="font-medium">{rentToMarket}%</span> of market
            </span>
            {parseFloat(rentToMarket) < 95 && (
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                Upside Potential
              </Badge>
            )}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit Type</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Avg SF</TableHead>
              <TableHead className="text-right">Current Rent</TableHead>
              <TableHead className="text-right">Market Rent</TableHead>
              <TableHead className="text-right">vs Market</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {unitMix.map((unit, index) => {
              const currentRent = unit.currentRent || unit.marketRent;
              const marketRent = unit.marketRent || unit.currentRent;

              return (
                <TableRow key={index}>
                  <TableCell className="font-medium">{unit.type}</TableCell>
                  <TableCell className="text-right">{unit.count}</TableCell>
                  <TableCell className="text-right text-slate-600">
                    {unit.avgSF?.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(currentRent)}
                  </TableCell>
                  <TableCell className="text-right text-slate-600">
                    {formatCurrency(marketRent)}
                  </TableCell>
                  <TableCell className="text-right">
                    <RentComparisonBar
                      currentRent={currentRent}
                      marketRent={marketRent}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {vacantUnits > 0 && (
          <div className="mt-4 p-3 bg-amber-50 rounded-lg">
            <p className="text-sm text-amber-800">
              <span className="font-medium">{vacantUnits} vacant units</span> available for lease
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
