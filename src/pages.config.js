import AuditExport from './pages/AuditExport';
import Compliance from './pages/Compliance';
import CreateDeal from './pages/CreateDeal';
import DealOverview from './pages/DealOverview';
import Deals from './pages/Deals';
import Explain from './pages/Explain';
import Lifecycle from './pages/Lifecycle';
import Settings from './pages/Settings';
import Traceability from './pages/Traceability';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AuditExport": AuditExport,
    "Compliance": Compliance,
    "CreateDeal": CreateDeal,
    "DealOverview": DealOverview,
    "Deals": Deals,
    "Explain": Explain,
    "Lifecycle": Lifecycle,
    "Settings": Settings,
    "Traceability": Traceability,
}

export const pagesConfig = {
    mainPage: "Deals",
    Pages: PAGES,
    Layout: __Layout,
};