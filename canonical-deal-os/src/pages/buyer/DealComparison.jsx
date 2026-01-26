import React, { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Scale, Download, FileText, ArrowLeft, RefreshCw } from "lucide-react";
import { useBuyerInbox } from "@/lib/hooks/useBuyerInbox";
import { DealSelectorCard } from "@/components/comparison/DealSelectorCard";
import { ComparisonTable } from "@/components/comparison/ComparisonTable";
import { ComparisonCharts } from "@/components/comparison/ComparisonCharts";
import { exportToCSV, exportToPDF } from "@/lib/comparison/export";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import { debugLog } from "@/lib/debug";
import { PageError } from "@/components/ui/page-state";

const MAX_DEALS = 4;
const MIN_DEALS = 2;

export default function DealComparison() {
  const [selectedDealIds, setSelectedDealIds] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const comparisonRef = useRef(null);
  const { toast } = useToast();

  const { inbox, isLoading, error, refetch } = useBuyerInbox();

  // Get selected deals from inbox
  const selectedDeals = useMemo(() => {
    return inbox.filter(entry => {
      const dealId = entry.distribution?.dealDraft?.id;
      return dealId && selectedDealIds.includes(dealId);
    });
  }, [inbox, selectedDealIds]);

  const hasEnoughDeals = inbox.length >= MIN_DEALS;
  const hasSelection = selectedDeals.length >= MIN_DEALS;

  const toggleDealSelection = (dealId) => {
    setSelectedDealIds(prev => {
      if (prev.includes(dealId)) {
        debugLog("comparison", "Deal deselected", { dealId });
        return prev.filter(id => id !== dealId);
      }

      if (prev.length >= MAX_DEALS) {
        toast({
          title: "Maximum 4 deals",
          description: "Remove a deal to add another to the comparison.",
          variant: "destructive"
        });
        return prev;
      }

      debugLog("comparison", "Deal selected", { dealId, totalSelected: prev.length + 1 });
      return [...prev, dealId];
    });
  };

  const clearSelection = () => {
    setSelectedDealIds([]);
    debugLog("comparison", "Selection cleared");
  };

  const handleExportCSV = () => {
    debugLog("comparison", "Exporting to CSV", { dealCount: selectedDeals.length });
    exportToCSV(selectedDeals);
    toast({
      title: "CSV exported",
      description: "Your comparison has been downloaded."
    });
  };

  const handleExportPDF = async () => {
    if (!comparisonRef.current) return;

    setIsExporting(true);
    debugLog("comparison", "Exporting to PDF", { dealCount: selectedDeals.length });

    try {
      await exportToPDF(comparisonRef, selectedDeals);
      toast({
        title: "PDF exported",
        description: "Your comparison has been downloaded."
      });
    } catch (err) {
      debugLog("comparison", "PDF export failed", { error: err.message });
      toast({
        title: "Export failed",
        description: "There was a problem generating the PDF.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (error) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <PageError error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Button variant="ghost" size="sm" asChild className="p-0 h-auto">
              <Link to={createPageUrl("BuyerInbox")}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Inbox
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Scale className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-semibold text-[#171717] tracking-tight">
              Compare Deals
            </h1>
          </div>
          <p className="text-sm text-[#737373] mt-1">
            Select 2-4 deals to compare side by side.
          </p>
        </div>

        {hasSelection && (
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-sm">
              {selectedDeals.length} of {MAX_DEALS} selected
            </Badge>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              disabled={isExporting}
            >
              <FileText className="w-4 h-4 mr-2" />
              {isExporting ? "Generating..." : "PDF"}
            </Button>
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-[#E5E5E5] p-5 animate-pulse"
            >
              <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : !hasEnoughDeals ? (
        /* Empty state - not enough deals */
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-10 text-center">
          <Scale className="w-12 h-12 text-[#A3A3A3] mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[#171717] mb-2">
            Not enough deals to compare
          </h2>
          <p className="text-sm text-[#737373] mb-6">
            You need at least 2 deals in your inbox to use the comparison tool.
          </p>
          <Button asChild>
            <Link to={createPageUrl("Marketplace")}>Browse Marketplace</Link>
          </Button>
        </div>
      ) : !hasSelection ? (
        /* Selection view */
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[#525252]">
              Select {MIN_DEALS}-{MAX_DEALS} deals from your inbox
            </p>
            {selectedDealIds.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear selection
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inbox.map((entry) => {
              const dealId = entry.distribution?.dealDraft?.id;
              if (!dealId) return null;

              const isSelected = selectedDealIds.includes(dealId);
              const isDisabled = !isSelected && selectedDealIds.length >= MAX_DEALS;

              return (
                <DealSelectorCard
                  key={entry.id}
                  deal={entry}
                  isSelected={isSelected}
                  isDisabled={isDisabled}
                  onToggle={toggleDealSelection}
                />
              );
            })}
          </div>

          {selectedDealIds.length > 0 && selectedDealIds.length < MIN_DEALS && (
            <div className="mt-6 text-center text-sm text-[#737373]">
              Select {MIN_DEALS - selectedDealIds.length} more deal
              {MIN_DEALS - selectedDealIds.length > 1 ? "s" : ""} to compare
            </div>
          )}
        </div>
      ) : (
        /* Comparison view */
        <div>
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" size="sm" onClick={clearSelection}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Change selection
            </Button>
          </div>

          {/* Comparison content - wrapped in ref for PDF export */}
          <div ref={comparisonRef} className="space-y-8 bg-white p-6 rounded-xl">
            <ComparisonTable deals={selectedDeals} />
            <ComparisonCharts deals={selectedDeals} />
          </div>
        </div>
      )}
    </div>
  );
}
