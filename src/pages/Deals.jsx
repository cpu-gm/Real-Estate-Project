import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useRole } from '../Layout';
import { 
  Building2, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Search,
  Filter
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const lifecycleColors = {
  'Draft': 'bg-slate-100 text-slate-700',
  'Under Review': 'bg-amber-50 text-amber-700',
  'Approved': 'bg-emerald-50 text-emerald-700',
  'Ready to Close': 'bg-blue-50 text-blue-700',
  'Closed': 'bg-violet-50 text-violet-700',
  'Operating': 'bg-green-50 text-green-700',
  'Changed': 'bg-orange-50 text-orange-700',
  'Distressed': 'bg-red-50 text-red-700',
  'Resolved': 'bg-teal-50 text-teal-700',
  'Exited': 'bg-slate-50 text-slate-600'
};

const TruthHealthIcon = ({ health }) => {
  if (health === 'healthy') return <CheckCircle2 className="w-4 h-4 text-green-600" />;
  if (health === 'warning') return <AlertCircle className="w-4 h-4 text-amber-500" />;
  return <AlertTriangle className="w-4 h-4 text-red-500" />;
};

export default function DealsPage() {
  const { currentRole } = useRole();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: () => base44.entities.Deal.list('-created_date'),
  });

  const filteredDeals = deals.filter(deal => 
    deal.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    deal.asset_address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#171717] tracking-tight">Deals</h1>
        <p className="text-sm text-[#737373] mt-1">
          {currentRole === 'Regulator' ? 'Regulatory oversight view' : 
           currentRole === 'Auditor' ? 'Audit compliance view' :
           currentRole === 'Lender' ? 'Lender portfolio view' :
           currentRole === 'LP' ? 'Investment portfolio view' :
           'Active deal portfolio'}
        </p>
      </div>

      {/* Search */}
      <div className="mb-6 flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
          <Input 
            placeholder="Search deals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white border-[#E5E5E5] focus:border-[#171717] focus:ring-0"
          />
        </div>
      </div>

      {/* Deals Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-[#E5E5E5] p-6 animate-pulse">
              <div className="h-6 bg-slate-100 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-slate-100 rounded w-1/2 mb-2"></div>
              <div className="h-4 bg-slate-100 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      ) : filteredDeals.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-12 text-center">
          <Building2 className="w-12 h-12 text-[#E5E5E5] mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[#171717] mb-2">No deals found</h3>
          <p className="text-sm text-[#737373] mb-6">Create your first deal to get started</p>
          <Link 
            to={createPageUrl('CreateDeal')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A0A0A] text-white rounded-lg text-sm font-medium hover:bg-[#171717] transition-colors"
          >
            Create Deal
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDeals.map((deal) => (
            <Link
              key={deal.id}
              to={createPageUrl(`DealOverview?id=${deal.id}`)}
              className="bg-white rounded-xl border border-[#E5E5E5] p-6 hover:border-[#171717] hover:shadow-sm transition-all duration-200 group"
            >
              {/* Stress Mode Banner */}
              {deal.stress_mode && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg mb-4 -mt-2 -mx-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span className="text-xs font-medium text-red-700">Stress Mode Active</span>
                </div>
              )}

              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-[#171717] group-hover:text-[#0A0A0A] transition-colors line-clamp-1">
                    {deal.name}
                  </h3>
                  <p className="text-sm text-[#737373] mt-0.5 line-clamp-1">
                    {deal.asset_address || 'No address'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#E5E5E5] group-hover:text-[#171717] transition-colors flex-shrink-0" />
              </div>

              {/* Status Row */}
              <div className="flex items-center gap-2 mb-4">
                <Badge className={cn("font-medium text-xs", lifecycleColors[deal.lifecycle_state] || 'bg-slate-100 text-slate-700')}>
                  {deal.lifecycle_state || 'Draft'}
                </Badge>
                <TruthHealthIcon health={deal.truth_health || 'healthy'} />
                {deal.ai_derived && (
                  <span className="text-[10px] px-2 py-0.5 bg-violet-50 text-violet-600 rounded font-medium">
                    🤖 AI-Derived
                  </span>
                )}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[#F5F5F5]">
                <div>
                  <span className="text-[10px] text-[#A3A3A3] uppercase tracking-wider">Purchase</span>
                  <p className="text-sm font-medium text-[#171717]">
                    {deal.purchase_price ? `$${(deal.purchase_price / 1000000).toFixed(1)}M` : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-[#A3A3A3] uppercase tracking-wider">LTV</span>
                  <p className="text-sm font-medium text-[#171717]">
                    {deal.ltv ? `${(deal.ltv * 100).toFixed(0)}%` : '—'}
                  </p>
                </div>
              </div>

              {/* Next Action */}
              {deal.next_action && (
                <div className="mt-4 pt-4 border-t border-[#F5F5F5]">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-[#A3A3A3]" />
                    <span className="text-xs text-[#737373] line-clamp-1">{deal.next_action}</span>
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}