import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tag,
  Landmark,
  FolderOpen,
  FileBarChart,
  Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function PropertyActionsBar({
  dealDraftId,
  onListForSale,
  onRefinance,
  onDocuments,
  onReports,
  onManageListing,
  isListed = false
}) {
  const navigate = useNavigate();

  const handleListForSale = () => {
    if (isListed && onManageListing) {
      // If already listed, open manage listing panel
      onManageListing();
    } else if (onListForSale) {
      onListForSale();
    } else {
      // Default: navigate to list for sale wizard
      navigate(createPageUrl('ListForSaleWizard') + `?dealDraftId=${dealDraftId}`);
    }
  };

  const handleRefinance = () => {
    if (onRefinance) {
      onRefinance();
    } else {
      // Default: navigate to refinance analysis page
      navigate(createPageUrl('RefinanceAnalysis') + `?dealDraftId=${dealDraftId}`);
    }
  };

  const handleDocuments = () => {
    if (onDocuments) {
      onDocuments();
    }
    // Could scroll to documents section or open a modal
  };

  const handleReports = () => {
    if (onReports) {
      onReports();
    } else {
      // Default: navigate to reports generator
      navigate(createPageUrl('ReportsGenerator') + `?dealDraftId=${dealDraftId}`);
    }
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-wrap gap-3 justify-center md:justify-start">
          <Button
            variant={isListed ? "default" : "outline"}
            className={`flex items-center gap-2 ${isListed ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
            onClick={handleListForSale}
          >
            {isListed ? <Settings className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
            {isListed ? 'Manage Listing' : 'List for Sale'}
          </Button>

          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={handleRefinance}
          >
            <Landmark className="h-4 w-4" />
            Refinance
          </Button>

          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={handleDocuments}
          >
            <FolderOpen className="h-4 w-4" />
            Documents
          </Button>

          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={handleReports}
          >
            <FileBarChart className="h-4 w-4" />
            Reports
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
