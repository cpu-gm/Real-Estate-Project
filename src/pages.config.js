import Deals from './pages/Deals';
import CreateDeal from './pages/CreateDeal';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Deals": Deals,
    "CreateDeal": CreateDeal,
}

export const pagesConfig = {
    mainPage: "Deals",
    Pages: PAGES,
    Layout: __Layout,
};