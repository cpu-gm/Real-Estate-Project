import AuditExport from './pages/AuditExport';
import Compliance from './pages/Compliance';
import CreateDeal from './pages/CreateDeal';
import DealOverview from './pages/DealOverview';
import Deals from './pages/Deals';
import Explain from './pages/Explain';
import Home from './pages/Home';
import HomeModern from './pages/HomeModern';
import Inbox from './pages/Inbox';
import Lifecycle from './pages/Lifecycle';
import Settings from './pages/Settings';
import Traceability from './pages/Traceability';
import Login from './pages/Login';
import Signup from './pages/Signup';
import PendingVerification from './pages/PendingVerification';
import AdminDashboard from './pages/AdminDashboard';
import LPPortal from './pages/LPPortal';
import LPInvestmentDetail from './pages/LPInvestmentDetail';
// GP Investor Management pages
import Investors from './pages/Investors';
import CapitalCalls from './pages/CapitalCalls';
import Distributions from './pages/Distributions';
import InvestorUpdates from './pages/InvestorUpdates';
import DealDrafts from './pages/intake/DealDrafts';
import CreateDealDraft from './pages/intake/CreateDealDraft';
import DealDraftDetail from './pages/intake/DealDraftDetail';
import DealWorkspace from './pages/DealWorkspace';
import OMEditor from './pages/om/OMEditor';
import DistributionManagement from './pages/distribution/DistributionManagement';
import BuyerReviewQueue from './pages/distribution/BuyerReviewQueue';
import BuyerAuthorizationDetail from './pages/distribution/BuyerAuthorizationDetail';
import DealProgress from './pages/distribution/DealProgress';
import BuyerInbox from './pages/buyer/BuyerInbox';
import BuyerDealView from './pages/buyer/BuyerDealView';
import BuyerCriteria from './pages/buyer/BuyerCriteria';
import BuyerResponses from './pages/buyer/BuyerResponses';
import SavedSearches from './pages/buyer/SavedSearches';
import DealComparison from './pages/buyer/DealComparison';
import SellerDealView from './pages/seller/SellerDealView';
// Marketplace
import Marketplace from './pages/marketplace/Marketplace';
// Broker pages
import Commissions from './pages/broker/Commissions';
import BrokerAcceptWizard from './pages/broker/BrokerAcceptWizard';
import BrokerDashboard from './pages/broker/BrokerDashboard';
import BrokerageSettings from './pages/brokerage/BrokerageSettings';
// Property pages
import ListForSaleWizard from './pages/property/ListForSaleWizard';
import RefinanceAnalysis from './pages/property/RefinanceAnalysis';
import ReportsGenerator from './pages/property/ReportsGenerator';
// Contacts
import Contacts from './pages/Contacts';
// Due Diligence
import DealDueDiligence from './pages/DealDueDiligence';
// n8n Workflow Integration
import EmailApprovalQueue from './pages/EmailApprovalQueue';
// Onboarding pages
import OrgOnboarding from './pages/onboarding/OrgOnboarding';
import OrgOnboardingWizard from './pages/onboarding/OrgOnboardingWizard';
import OnboardingStatus from './pages/onboarding/OnboardingStatus';
import OnboardingReviewQueue from './pages/onboarding/OnboardingReviewQueue';
import OnboardingDataLinks from './pages/onboarding/OnboardingDataLinks';
import AdminOnboardingQueue from './pages/onboarding/AdminOnboardingQueue';
import AdminOnboardingDetail from './pages/onboarding/AdminOnboardingDetail';
// Quick Import
import QuickImport from './pages/import/QuickImport';
// GP Counsel / Legal pages
import GPCounselHome from './pages/legal/GPCounselHome';
import GCApprovalQueue from './pages/legal/GCApprovalQueue';
import LegalMatters from './pages/legal/LegalMatters';
import LegalDocuments from './pages/legal/LegalDocuments';
import LegalDocumentReview from './pages/legal/LegalDocumentReview';
import PlaybookBuilder from './pages/legal/PlaybookBuilder';
import LegalVault from './pages/legal/LegalVault';
import LegalVendors from './pages/legal/LegalVendors';
import LegalEntities from './pages/legal/LegalEntities';
import SharedSpacesList from './pages/shared-spaces/SharedSpacesList';
import SharedSpaceDetail from './pages/shared-spaces/SharedSpaceDetail';
import SharedSpaceExternal from './pages/shared-spaces/SharedSpaceExternal';
// Lender pages
import LenderDashboard from './pages/LenderDashboard';
import LenderSubmissions from './pages/LenderSubmissions';
import LenderPortfolio from './pages/LenderPortfolio';
import LenderDocuments from './pages/LenderDocuments';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AuditExport": AuditExport,
    "Compliance": Compliance,
    "CreateDeal": CreateDeal,
    "DealOverview": DealOverview,
    "Deals": Deals,
    "Explain": Explain,
    "Home": Home,
    "HomeModern": HomeModern,
    "Inbox": Inbox,
    "Lifecycle": Lifecycle,
    "Settings": Settings,
    "Traceability": Traceability,
    "Login": Login,
    "Signup": Signup,
    "PendingVerification": PendingVerification,
    "AdminDashboard": AdminDashboard,
    "LPPortal": LPPortal,
    "LPInvestmentDetail": LPInvestmentDetail,
    // GP Investor Management
    "Investors": Investors,
    "CapitalCalls": CapitalCalls,
    "Distributions": Distributions,
    "InvestorUpdates": InvestorUpdates,
    "DealDrafts": DealDrafts,
    "CreateDealDraft": CreateDealDraft,
    "DealDraftDetail": DealDraftDetail,
    "DealWorkspace": DealWorkspace,
    "OMEditor": OMEditor,
    "DistributionManagement": DistributionManagement,
    "BuyerReviewQueue": BuyerReviewQueue,
    "BuyerAuthorizationDetail": BuyerAuthorizationDetail,
    "DealProgress": DealProgress,
    "BuyerInbox": BuyerInbox,
    "BuyerDealView": BuyerDealView,
    "BuyerCriteria": BuyerCriteria,
    "BuyerResponses": BuyerResponses,
    "SavedSearches": SavedSearches,
    "DealComparison": DealComparison,
    "SellerDealView": SellerDealView,
    // Marketplace
    "Marketplace": Marketplace,
    // Broker pages
    "Commissions": Commissions,
    "BrokerAcceptWizard": BrokerAcceptWizard,
    "BrokerDashboard": BrokerDashboard,
    "BrokerageSettings": BrokerageSettings,
    // Property pages
    "ListForSaleWizard": ListForSaleWizard,
    "RefinanceAnalysis": RefinanceAnalysis,
    "ReportsGenerator": ReportsGenerator,
    // Contacts
    "Contacts": Contacts,
    // Due Diligence
    "DealDueDiligence": DealDueDiligence,
    // n8n Workflow Integration
    "EmailApprovalQueue": EmailApprovalQueue,
    // Onboarding pages
    "OrgOnboarding": OrgOnboarding,
    "OrgOnboardingWizard": OrgOnboardingWizard,
    "OnboardingStatus": OnboardingStatus,
    "OnboardingReviewQueue": OnboardingReviewQueue,
    "OnboardingDataLinks": OnboardingDataLinks,
    "AdminOnboardingQueue": AdminOnboardingQueue,
    "AdminOnboardingDetail": AdminOnboardingDetail,
    // Quick Import
    "QuickImport": QuickImport,
    // GP Counsel / Legal pages
    "GPCounselHome": GPCounselHome,
    "GCApprovalQueue": GCApprovalQueue,
    "LegalMatters": LegalMatters,
    "LegalDocuments": LegalDocuments,
    "LegalDocumentReview": LegalDocumentReview,
    "PlaybookBuilder": PlaybookBuilder,
    "LegalVault": LegalVault,
    "LegalVendors": LegalVendors,
    "LegalEntities": LegalEntities,
    // Shared Spaces (Collaboration)
    "SharedSpacesList": SharedSpacesList,
    "SharedSpaceDetail": SharedSpaceDetail,
    "SharedSpaceExternal": SharedSpaceExternal,
    // Lender pages
    "LenderDashboard": LenderDashboard,
    "LenderSubmissions": LenderSubmissions,
    "LenderPortfolio": LenderPortfolio,
    "LenderDocuments": LenderDocuments,
}

export const pagesConfig = {
    mainPage: "Login",
    Pages: PAGES,
    Layout: __Layout,
};
