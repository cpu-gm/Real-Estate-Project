import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  Building2,
  CheckCircle2,
  Clock,
  TrendingUp,
  Loader2,
  FileText
} from 'lucide-react';

function formatCurrency(value) {
  if (!value) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getStatusBadge(status) {
  switch (status) {
    case 'PAID':
      return <Badge className="bg-green-100 text-green-700">Paid</Badge>;
    case 'PENDING':
      return <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>;
    case 'CONFIRMED':
      return <Badge className="bg-blue-100 text-blue-700">Confirmed</Badge>;
    case 'DISPUTED':
      return <Badge className="bg-red-100 text-red-700">Disputed</Badge>;
    default:
      return <Badge variant="outline">{status || 'Draft'}</Badge>;
  }
}

export default function Commissions() {
  const { authToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState('all');

  // Fetch commission data
  const { data, isLoading, error } = useQuery({
    queryKey: ['broker-commissions', user?.id],
    queryFn: async () => {
      // For now, fetch listing agreements and calculate commissions
      const res = await fetch('/api/intake/deals', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('Failed to fetch commission data');
      const data = await res.json();

      // Transform deals to commission view
      const commissions = (data.deals || []).map(deal => ({
        id: deal.id,
        propertyName: deal.propertyName,
        propertyAddress: deal.propertyAddress,
        askingPrice: deal.askingPrice,
        commissionPercent: deal.commissionPercent || 3.0, // Default 3%
        commissionAmount: deal.askingPrice ? deal.askingPrice * (deal.commissionPercent || 3.0) / 100 : 0,
        status: deal.status === 'CLOSED' ? 'PAID' :
                deal.status === 'UNDER_CONTRACT' ? 'PENDING' : 'DRAFT',
        closingDate: deal.closingDate,
        createdAt: deal.createdAt,
        sellerName: deal.seller?.entityName || 'Unknown Seller',
        agreementType: deal.listingAgreement?.agreementType || 'EXCLUSIVE_RIGHT_TO_SELL'
      }));

      return { commissions };
    },
    enabled: !!authToken && !!user?.id
  });

  const commissions = data?.commissions || [];

  // Calculate summary stats
  const stats = {
    totalPending: commissions.filter(c => c.status === 'PENDING').reduce((sum, c) => sum + c.commissionAmount, 0),
    totalPaid: commissions.filter(c => c.status === 'PAID').reduce((sum, c) => sum + c.commissionAmount, 0),
    totalProjected: commissions.reduce((sum, c) => sum + c.commissionAmount, 0),
    activeListings: commissions.filter(c => c.status !== 'PAID').length,
  };

  // Filter commissions by tab
  const filteredCommissions = activeTab === 'all'
    ? commissions
    : commissions.filter(c => c.status === activeTab.toUpperCase());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Commission Tracking</h1>
        <p className="text-slate-600 mt-1">Track your earnings across all listings</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Projected</p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalProjected)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{formatCurrency(stats.totalPending)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Paid YTD</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalPaid)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Active Listings</p>
                <p className="text-2xl font-bold text-slate-900">{stats.activeListings}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Commission List */}
      <Card>
        <CardHeader>
          <CardTitle>Commission Details</CardTitle>
          <CardDescription>Track commission status for each listing</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All ({commissions.length})</TabsTrigger>
              <TabsTrigger value="pending">
                Pending ({commissions.filter(c => c.status === 'PENDING').length})
              </TabsTrigger>
              <TabsTrigger value="paid">
                Paid ({commissions.filter(c => c.status === 'PAID').length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {filteredCommissions.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No commissions found</h3>
                  <p className="text-slate-600">
                    {activeTab === 'all'
                      ? 'Create listings to start tracking commissions'
                      : `No ${activeTab} commissions`}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead className="text-right">Sale Price</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Closing Date</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCommissions.map(commission => (
                      <TableRow key={commission.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{commission.propertyName || 'Untitled'}</p>
                            <p className="text-sm text-slate-500">{commission.propertyAddress}</p>
                          </div>
                        </TableCell>
                        <TableCell>{commission.sellerName}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(commission.askingPrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div>
                            <p className="font-medium">{formatCurrency(commission.commissionAmount)}</p>
                            <p className="text-sm text-slate-500">{commission.commissionPercent}%</p>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(commission.status)}</TableCell>
                        <TableCell>
                          {commission.closingDate
                            ? formatDate(commission.closingDate)
                            : <span className="text-slate-400">TBD</span>}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/DealDraftDetail?id=${commission.id}`}>
                              <FileText className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
