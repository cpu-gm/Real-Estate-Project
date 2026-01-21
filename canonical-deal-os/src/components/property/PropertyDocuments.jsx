import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FolderOpen,
  FileText,
  FileSpreadsheet,
  Image,
  File,
  Upload,
  Download,
  Share2,
  Eye,
  MoreVertical,
  ChevronRight
} from 'lucide-react';

const DOCUMENT_CATEGORIES = [
  { id: 'financials', name: 'Financials', icon: FileSpreadsheet },
  { id: 'leases', name: 'Leases', icon: FileText },
  { id: 'insurance', name: 'Insurance', icon: File },
  { id: 'legal', name: 'Legal', icon: FileText },
  { id: 'photos', name: 'Photos', icon: Image },
  { id: 'other', name: 'Other', icon: File },
];

function getFileIcon(mimeType) {
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) {
    return FileSpreadsheet;
  }
  if (mimeType?.includes('image')) {
    return Image;
  }
  return FileText;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function DocumentRow({ document, onView, onDownload, onShare }) {
  const Icon = getFileIcon(document.mimeType);

  return (
    <div className="flex items-center gap-3 py-3 px-2 hover:bg-slate-50 rounded-lg group">
      <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-slate-500" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">
          {document.originalFilename || document.filename}
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{formatFileSize(document.sizeBytes)}</span>
          {document.createdAt && (
            <>
              <span>•</span>
              <span>{formatDate(document.createdAt)}</span>
            </>
          )}
          {document.classifiedType && (
            <>
              <span>•</span>
              <Badge variant="outline" className="text-xs py-0">
                {document.classifiedType}
              </Badge>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView?.(document)}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDownload?.(document)}>
          <Download className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onShare?.(document)}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem>Rename</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function CategorySection({ category, documents, onView, onDownload, onShare }) {
  const [expanded, setExpanded] = useState(true);
  const Icon = category.icon;

  if (!documents || documents.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        className="flex items-center gap-2 w-full py-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <Icon className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700">{category.name}</span>
        <Badge variant="secondary" className="ml-auto">
          {documents.length}
        </Badge>
      </button>

      {expanded && (
        <div className="ml-6 mt-1">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              document={doc}
              onView={onView}
              onDownload={onDownload}
              onShare={onShare}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PropertyDocuments({
  documents = [],
  onUpload,
  onView,
  onDownload,
  onShare
}) {
  // Group documents by category
  const documentsByCategory = DOCUMENT_CATEGORIES.reduce((acc, category) => {
    acc[category.id] = documents.filter(doc => {
      const type = doc.classifiedType?.toLowerCase() || 'other';
      if (category.id === 'financials') {
        return ['t12', 'rent_roll', 'financials'].some(t => type.includes(t));
      }
      if (category.id === 'photos') {
        return doc.mimeType?.includes('image');
      }
      return type.includes(category.id);
    });
    return acc;
  }, {});

  // Put uncategorized docs in "other"
  const categorizedIds = new Set(
    Object.values(documentsByCategory).flat().map(d => d.id)
  );
  documentsByCategory.other = [
    ...documentsByCategory.other,
    ...documents.filter(d => !categorizedIds.has(d.id))
  ];

  const totalDocs = documents.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-slate-500" />
          Documents
          {totalDocs > 0 && (
            <Badge variant="secondary">{totalDocs}</Badge>
          )}
        </CardTitle>
        <Button size="sm" onClick={onUpload}>
          <Upload className="h-4 w-4 mr-2" />
          Upload
        </Button>
      </CardHeader>
      <CardContent>
        {totalDocs === 0 ? (
          <div className="text-center py-8">
            <FolderOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 mb-4">No documents uploaded yet</p>
            <Button variant="outline" onClick={onUpload}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Documents
            </Button>
          </div>
        ) : (
          <div>
            {DOCUMENT_CATEGORIES.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                documents={documentsByCategory[category.id]}
                onView={onView}
                onDownload={onDownload}
                onShare={onShare}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
