import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useIntakeDealOverview } from "@/lib/hooks/useIntakeDealOverview";
import { bff } from "@/api/bffClient";
import { createPageUrl } from "@/utils";
import { debugLog } from "@/lib/debug";
import { PageError } from "@/components/ui/page-state";
import BrokerDealView from "@/pages/broker/BrokerDealView";

// New property dashboard components
import PropertyHero from "@/components/property/PropertyHero";
import PropertyKPICards from "@/components/property/PropertyKPICards";
import PropertyActionsBar from "@/components/property/PropertyActionsBar";
import PropertyInfo from "@/components/property/PropertyInfo";
import PropertyFinancials from "@/components/property/PropertyFinancials";
import PropertyRentRoll from "@/components/property/PropertyRentRoll";
import PropertyActivity from "@/components/property/PropertyActivity";
import PropertyDocuments from "@/components/property/PropertyDocuments";
import ListingStatusBanner from "@/components/property/ListingStatusBanner";
import ListingManagementPanel from "@/components/property/ListingManagementPanel";

/**
 * Parse a claim value - handles JSON and plain strings
 */
function parseClaimValue(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Extract a numeric value from a claim
 */
function getNumericClaim(claims, field) {
  const claim = claims.find(c => c.field === field);
  if (!claim) return null;
  const parsed = parseClaimValue(claim.value);
  return typeof parsed === 'number' ? parsed : parseFloat(parsed) || null;
}

/**
 * Extract a string value from a claim
 */
function getStringClaim(claims, field) {
  const claim = claims.find(c => c.field === field);
  if (!claim) return null;
  const parsed = parseClaimValue(claim.value);
  return typeof parsed === 'string' ? parsed : String(parsed);
}

/**
 * Extract a JSON value from a claim
 */
function getJsonClaim(claims, field) {
  const claim = claims.find(c => c.field === field);
  if (!claim) return null;
  return parseClaimValue(claim.value);
}

/**
 * Transform claims into structured property data
 */
function usePropertyData(draft, claims) {
  return useMemo(() => {
    if (!draft || !claims) return null;

    // Basic property info
    const propertyName = draft.propertyName || getStringClaim(claims, 'propertyName');
    const address = getStringClaim(claims, 'address') || draft.propertyAddress?.split(',')[0];
    const city = getStringClaim(claims, 'city');
    const state = getStringClaim(claims, 'state');
    const zipCode = getStringClaim(claims, 'zipCode');
    const county = getStringClaim(claims, 'county');
    const yearBuilt = getStringClaim(claims, 'yearBuilt');
    const assetClass = getStringClaim(claims, 'assetClass');
    const stories = getStringClaim(claims, 'stories');
    const lotSize = getNumericClaim(claims, 'lotSize');

    // Parse address from propertyAddress if individual fields not available
    let parsedCity = city;
    let parsedState = state;
    let parsedZip = zipCode;
    if (!city && draft.propertyAddress) {
      const parts = draft.propertyAddress.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        parsedCity = parts[1];
        if (parts.length >= 3) {
          const stateZip = parts[2].split(' ').filter(Boolean);
          parsedState = stateZip[0];
          parsedZip = stateZip[1];
        }
      }
    }

    // Units and SF
    const unitCount = draft.unitCount || getNumericClaim(claims, 'unitCount');
    const totalSF = draft.totalSF || getNumericClaim(claims, 'totalSF');

    // Unit mix
    const unitMix1BR = getJsonClaim(claims, 'unitMix1BR');
    const unitMix2BR = getJsonClaim(claims, 'unitMix2BR');
    const unitMix3BR = getJsonClaim(claims, 'unitMix3BR');
    const unitMix = [unitMix1BR, unitMix2BR, unitMix3BR].filter(Boolean);

    // Amenities and CapEx
    const amenities = getJsonClaim(claims, 'amenities') || [];
    const recentCapEx = getJsonClaim(claims, 'recentCapEx') || [];

    // Financials
    const currentNOI = getNumericClaim(claims, 'currentNOI');
    const grossRevenue = getNumericClaim(claims, 'grossRevenue');
    const operatingExpenses = getNumericClaim(claims, 'operatingExpenses');
    const occupancy = getNumericClaim(claims, 'occupancy');
    const avgRent = getNumericClaim(claims, 'avgRent');
    const expenseRatio = getNumericClaim(claims, 'expenseRatio');

    // Acquisition
    const acquisitionPrice = getNumericClaim(claims, 'acquisitionPrice');
    const acquisitionDate = getStringClaim(claims, 'acquisitionDate');

    // Valuation
    const estimatedValue = getNumericClaim(claims, 'estimatedValue');
    const estimatedCapRate = getNumericClaim(claims, 'estimatedCapRate');

    // Debt
    const loanBalance = getNumericClaim(claims, 'loanBalance');
    const interestRate = getNumericClaim(claims, 'interestRate');
    const loanMaturity = getStringClaim(claims, 'loanMaturity');
    const lender = getStringClaim(claims, 'lender');

    // Computed values
    const equity = estimatedValue && loanBalance ? estimatedValue - loanBalance : null;

    // Cash-on-Cash estimate: (NOI - Debt Service) / Down Payment
    // Approximate debt service: loanBalance * (interestRate/100) (interest only approx)
    // Down payment: acquisitionPrice - original loan (estimate: ~70% LTV)
    let cashOnCash = null;
    if (currentNOI && loanBalance && interestRate && acquisitionPrice) {
      const annualDebtService = loanBalance * (interestRate / 100);
      const cashFlow = currentNOI - annualDebtService;
      const downPayment = acquisitionPrice * 0.3; // Assume 30% down
      cashOnCash = (cashFlow / downPayment) * 100;
    }

    // NOI change estimate (mock for now - would come from historical data)
    const noiChange = 3.2; // placeholder

    // Vacancy calculation
    const vacantUnits = occupancy && unitCount
      ? Math.round(unitCount * (1 - occupancy / 100))
      : 0;

    return {
      // Hero data
      hero: {
        propertyName,
        address,
        city: parsedCity,
        state: parsedState,
        zipCode: parsedZip,
        units: unitCount,
        assetType: draft.assetType,
        assetClass,
        yearBuilt,
        imageUrl: null, // Could come from documents
        status: draft.status
      },
      // KPI data
      kpis: {
        noi: currentNOI,
        noiChange,
        occupancy,
        occupancyChange: null, // Would come from historical data
        cashOnCash,
        cashOnCashTarget: 10, // Common target
        equity,
        equityGain: equity && acquisitionPrice ? equity - (acquisitionPrice * 0.3) : null
      },
      // Property info
      info: {
        address,
        city: parsedCity,
        state: parsedState,
        zipCode: parsedZip,
        county,
        yearBuilt,
        stories,
        totalSF,
        lotSize,
        assetType: draft.assetType,
        assetClass,
        unitMix,
        amenities,
        recentCapEx
      },
      // Financials
      financials: {
        grossRevenue,
        operatingExpenses,
        noi: currentNOI,
        expenseRatio,
        loanBalance,
        interestRate,
        loanMaturity,
        lender,
        acquisitionPrice,
        acquisitionDate,
        estimatedValue,
        estimatedCapRate
      },
      // Rent roll
      rentRoll: {
        unitMix,
        occupancy,
        avgRent,
        marketAvgRent: avgRent ? avgRent * 1.05 : null, // Mock 5% below market
        vacantUnits
      }
    };
  }, [draft, claims]);
}

/**
 * Generate mock activity data based on claims
 */
function useMockActivity(draft) {
  return useMemo(() => {
    if (!draft) return [];

    const now = new Date();
    const activities = [];

    // Mock recent activities based on the property
    activities.push({
      id: '1',
      type: 'financial',
      title: 'T-12 Financials Updated',
      description: 'Annual operating statement uploaded and verified',
      timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      user: 'Jane GP'
    });

    activities.push({
      id: '2',
      type: 'lease',
      title: 'Lease Renewal',
      description: 'Unit 204 renewed for 12 months at $1,850/mo',
      timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
      amount: 1850
    });

    activities.push({
      id: '3',
      type: 'maintenance',
      title: 'HVAC Repair Completed',
      description: 'Building A common area unit replaced',
      timestamp: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      amount: 4200,
      status: 'completed'
    });

    activities.push({
      id: '4',
      type: 'document',
      title: 'Insurance Certificate Uploaded',
      description: '2024 property insurance documentation',
      timestamp: new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString(),
      user: 'Jane GP'
    });

    activities.push({
      id: '5',
      type: 'valuation',
      title: 'Appraisal Completed',
      description: 'Annual property valuation updated',
      timestamp: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
      amount: 32500000
    });

    return activities;
  }, [draft]);
}

export default function DealWorkspace() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dealDraftId = searchParams.get("dealDraftId");
  const [activeTab, setActiveTab] = useState("overview");
  const [showListingPanel, setShowListingPanel] = useState(false);

  const {
    draft,
    claims,
    isLoading: draftLoading,
    error: draftError
  } = useIntakeDealOverview(dealDraftId);

  // Query to check user's access level to this deal
  const accessQuery = useQuery({
    queryKey: ["dealAccess", dealDraftId],
    queryFn: () => bff.dealIntake.checkAccess(dealDraftId),
    enabled: !!dealDraftId,
    retry: false,
    staleTime: 30000 // Cache for 30 seconds
  });

  // Query for listing details
  const listingQuery = useQuery({
    queryKey: ["listing", dealDraftId],
    queryFn: () => bff.dealIntake.getListing(dealDraftId),
    enabled: !!dealDraftId && draft?.status?.startsWith('LISTED'),
    retry: false
  });

  // Query for documents
  const documentsQuery = useQuery({
    queryKey: ["documents", dealDraftId],
    queryFn: () => bff.dealIntake.getDocuments?.(dealDraftId) || Promise.resolve([]),
    enabled: !!dealDraftId,
    onSuccess: (data) => {
      debugLog("documents", "Documents loaded", { dealDraftId, count: data?.length ?? 0 });
    }
  });

  // Transform claims data into component-friendly format
  const propertyData = usePropertyData(draft, claims);

  // Mock activity data
  const activities = useMockActivity(draft);

  // Check if property is listed
  const isListed = draft?.status?.startsWith('LISTED');
  const listingData = listingQuery.data;

  // Handlers
  const handleShare = () => {
    // Open share modal or copy link
    navigator.clipboard?.writeText(window.location.href);
    // Could show toast notification
  };

  const handleEdit = () => {
    navigate(createPageUrl(`DealDraftDetail?id=${dealDraftId}`));
  };

  const handleArchive = () => {
    // Archive confirmation modal
    if (confirm('Are you sure you want to archive this property?')) {
      // Call archive API
    }
  };

  const handleUploadDocuments = () => {
    // Open document upload modal or navigate to documents page
  };

  const handleViewDocument = (doc) => {
    // Open document viewer
    window.open(doc.url, '_blank');
  };

  const handleDownloadDocument = (doc) => {
    // Trigger download
    window.open(doc.downloadUrl || doc.url, '_blank');
  };

  const handleShareDocument = () => {
    // Open share modal
  };

  if (!dealDraftId) {
    return (
      <div className="p-ds-24">
        <div className="bg-card rounded-md border border-border p-ds-24 text-ds-body text-muted-foreground">
          Missing dealDraftId. Please select a property from the list.
        </div>
      </div>
    );
  }

  if (draftError) {
    return (
      <div className="p-ds-24">
        <PageError error={draftError} />
      </div>
    );
  }

  if (draftLoading || !propertyData || accessQuery.isLoading) {
    return (
      <div className="p-ds-24 space-y-ds-16">
        <Skeleton className="h-64 w-full rounded-md" />
        <div className="grid grid-cols-4 gap-ds-16">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Route to broker view if user is an invited broker (not owner)
  const accessData = accessQuery.data;
  if (accessData?.relation === 'broker_pending' || accessData?.relation === 'broker_accepted') {
    return (
      <BrokerDealView
        dealDraftId={dealDraftId}
        draft={draft}
        accessData={accessData}
        listingData={listingQuery.data}
      />
    );
  }

  // TODO: Add BuyerDealView routing when user is a buyer
  // if (accessData?.relation === 'buyer') {
  //   return <BuyerDealView ... />;
  // }

  const documents = documentsQuery.data ?? [];

  // Owner view (default - full access)
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-content mx-auto p-ds-24 space-y-ds-24">
        {/* Hero Header */}
        <PropertyHero
          {...propertyData.hero}
          onShare={handleShare}
          onEdit={handleEdit}
          onArchive={handleArchive}
        />

        {/* Listing Status Banner (shown when listed) */}
        {isListed && (
          <ListingStatusBanner
            status={draft?.status}
            listingType={draft?.listingType}
            askingPrice={draft?.askingPrice}
            priceMin={draft?.askingPriceMin}
            priceMax={draft?.askingPriceMax}
            brokerName={listingData?.broker?.name}
            brokerEmail={listingData?.broker?.email}
            brokerStatus={listingData?.broker?.status}
            listedAt={draft?.listedAt}
            onManageListing={() => setShowListingPanel(true)}
          />
        )}

        {/* KPI Cards */}
        <PropertyKPICards {...propertyData.kpis} />

        {/* Actions Bar */}
        <PropertyActionsBar
          dealDraftId={dealDraftId}
          onDocuments={() => setActiveTab("documents")}
          isListed={isListed}
          onManageListing={() => setShowListingPanel(true)}
        />

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financials">Financials</TabsTrigger>
            <TabsTrigger value="rentroll">Rent Roll</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <div className="mt-ds-24">
            <TabsContent value="overview" className="m-0">
              <PropertyInfo {...propertyData.info} />
            </TabsContent>

            <TabsContent value="financials" className="m-0">
              <PropertyFinancials {...propertyData.financials} />
            </TabsContent>

            <TabsContent value="rentroll" className="m-0">
              <PropertyRentRoll {...propertyData.rentRoll} />
            </TabsContent>

            <TabsContent value="activity" className="m-0">
              <PropertyActivity
                activities={activities}
                maxItems={10}
                onViewAll={() => {}}
              />
            </TabsContent>

            <TabsContent value="documents" className="m-0">
              <PropertyDocuments
                documents={documents}
                onUpload={handleUploadDocuments}
                onView={handleViewDocument}
                onDownload={handleDownloadDocument}
                onShare={handleShareDocument}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Listing Management Panel */}
      <ListingManagementPanel
        open={showListingPanel}
        onOpenChange={setShowListingPanel}
        dealDraftId={dealDraftId}
        listing={listingData}
      />
    </div>
  );
}
