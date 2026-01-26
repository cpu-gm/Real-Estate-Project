import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File,
  Search,
  Maximize2,
  Minimize2,
  ExternalLink,
  Loader2
} from 'lucide-react';

/**
 * DocumentViewer - Multi-format document viewer for onboarding review
 *
 * Supports:
 * - PDF viewing with page navigation
 * - Excel/CSV preview with cell highlighting
 * - Image viewing with zoom
 * - Text/email content display
 *
 * Features:
 * - Highlight specific regions (for provenance)
 * - Page/cell navigation
 * - Zoom controls
 * - Full-screen mode
 */
export function DocumentViewer({
  source,
  highlightRegion,
  onRegionClick,
  className = ''
}) {
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  // Determine document type from source
  const getDocumentType = () => {
    if (!source) return 'unknown';
    const mimeType = source.mimeType || '';
    const fileName = source.fileName || '';

    if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) return 'pdf';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') ||
        fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) return 'spreadsheet';
    if (mimeType.includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) return 'image';
    if (mimeType.includes('text') || fileName.endsWith('.txt')) return 'text';
    return 'unknown';
  };

  const docType = getDocumentType();

  useEffect(() => {
    // Simulate loading
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [source?.id]);

  useEffect(() => {
    // Navigate to highlighted region's page
    if (highlightRegion?.pageNumber) {
      setCurrentPage(highlightRegion.pageNumber);
    }
  }, [highlightRegion]);

  const handleZoomIn = () => setZoom(Math.min(zoom + 25, 200));
  const handleZoomOut = () => setZoom(Math.max(zoom - 25, 50));
  const handleResetZoom = () => setZoom(100);

  const handlePrevPage = () => setCurrentPage(Math.max(1, currentPage - 1));
  const handleNextPage = () => setCurrentPage(Math.min(source?.totalPages || 1, currentPage + 1));

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const getFileIcon = () => {
    switch (docType) {
      case 'pdf': return <FileText className="w-5 h-5" />;
      case 'spreadsheet': return <FileSpreadsheet className="w-5 h-5" />;
      case 'image': return <ImageIcon className="w-5 h-5" />;
      default: return <File className="w-5 h-5" />;
    }
  };

  if (!source) {
    return (
      <div className={`flex items-center justify-center h-full bg-slate-50 ${className}`}>
        <div className="text-center text-slate-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No document selected</p>
          <p className="text-sm">Select a claim to view its source document</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex flex-col h-full bg-slate-100 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          {getFileIcon()}
          <span className="font-medium text-sm truncate max-w-[200px]">
            {source.fileName}
          </span>
          <Badge variant="outline" className="text-xs uppercase">
            {docType}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <Button variant="ghost" size="sm" onClick={handleZoomOut} disabled={zoom <= 50}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm text-slate-600 w-12 text-center">{zoom}%</span>
          <Button variant="ghost" size="sm" onClick={handleZoomIn} disabled={zoom >= 200}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleResetZoom}>
            <RotateCw className="w-4 h-4" />
          </Button>

          <div className="w-px h-4 bg-slate-300 mx-1" />

          {/* Fullscreen */}
          <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>

          {/* Download */}
          <Button variant="ghost" size="sm" asChild>
            <a href={source.downloadUrl} download={source.fileName}>
              <Download className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* Page navigation for multi-page documents */}
      {docType === 'pdf' && source.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2 bg-slate-50 border-b border-slate-200">
          <Button variant="ghost" size="sm" onClick={handlePrevPage} disabled={currentPage <= 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm">
            Page {currentPage} of {source.totalPages}
          </span>
          <Button variant="ghost" size="sm" onClick={handleNextPage} disabled={currentPage >= source.totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Document content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            <p>Failed to load document: {error}</p>
          </div>
        ) : (
          <DocumentContent
            source={source}
            docType={docType}
            zoom={zoom}
            currentPage={currentPage}
            highlightRegion={highlightRegion}
            onRegionClick={onRegionClick}
          />
        )}
      </div>

      {/* Highlight info bar */}
      {highlightRegion && (
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 text-sm">
          <div className="flex items-center gap-2 text-amber-800">
            <Search className="w-4 h-4" />
            <span>
              Highlighting: {highlightRegion.textSnippet?.slice(0, 50)}...
              {highlightRegion.pageNumber && ` (Page ${highlightRegion.pageNumber})`}
              {highlightRegion.cellReference && ` (Cell ${highlightRegion.cellReference})`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * DocumentContent - Renders document based on type
 */
function DocumentContent({
  source,
  docType,
  zoom,
  currentPage,
  highlightRegion,
  onRegionClick
}) {
  switch (docType) {
    case 'pdf':
      return (
        <PDFContent
          source={source}
          zoom={zoom}
          currentPage={currentPage}
          highlightRegion={highlightRegion}
        />
      );
    case 'spreadsheet':
      return (
        <SpreadsheetContent
          source={source}
          zoom={zoom}
          highlightRegion={highlightRegion}
          onRegionClick={onRegionClick}
        />
      );
    case 'image':
      return (
        <ImageContent
          source={source}
          zoom={zoom}
          highlightRegion={highlightRegion}
        />
      );
    case 'text':
      return (
        <TextContent
          source={source}
          highlightRegion={highlightRegion}
        />
      );
    default:
      return (
        <div className="text-center text-slate-500 py-12">
          <File className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <p className="font-medium">Preview not available</p>
          <p className="text-sm">This file type cannot be previewed</p>
          <Button variant="outline" className="mt-4" asChild>
            <a href={source.downloadUrl} download>
              <Download className="w-4 h-4 mr-2" />
              Download file
            </a>
          </Button>
        </div>
      );
  }
}

/**
 * PDFContent - PDF document preview
 * In production, would use react-pdf or similar
 */
function PDFContent({ source, zoom, currentPage, highlightRegion }) {
  // Mock PDF content - in production, use react-pdf
  return (
    <div
      className="bg-white shadow-lg mx-auto"
      style={{
        width: `${8.5 * zoom / 100}in`,
        minHeight: `${11 * zoom / 100}in`,
        padding: `${0.5 * zoom / 100}in`
      }}
    >
      <div className="text-slate-600 text-sm leading-relaxed">
        {/* Mock PDF content */}
        <div className="text-center text-slate-400 py-8">
          <FileText className="w-12 h-12 mx-auto mb-3" />
          <p className="font-medium">PDF Preview</p>
          <p className="text-xs">Page {currentPage}</p>
          {source.content ? (
            <div className="mt-4 text-left whitespace-pre-wrap">
              {highlightRegion?.textSnippet ? (
                <HighlightedText
                  content={source.content}
                  highlight={highlightRegion.textSnippet}
                />
              ) : (
                source.content
              )}
            </div>
          ) : (
            <p className="text-xs mt-2">Content preview not available</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * SpreadsheetContent - Excel/CSV preview with cell highlighting
 */
function SpreadsheetContent({ source, zoom, highlightRegion, onRegionClick }) {
  // Mock spreadsheet data - in production, parse actual file
  const mockData = source.sheetData || [
    ['Property', 'Address', 'Units', 'Rent'],
    ['Sunset Apartments', '123 Main St', '48', '$1,250'],
    ['Oak Plaza', '456 Oak Ave', '32', '$1,450'],
    ['Downtown Tower', '789 Center Blvd', '96', '$1,650']
  ];

  const isHighlightedCell = (rowIndex, colIndex) => {
    if (!highlightRegion?.cellReference) return false;
    // Parse cell reference like "B2" -> row 2, col B (1)
    const match = highlightRegion.cellReference.match(/([A-Z]+)(\d+)/);
    if (!match) return false;
    const col = match[1].charCodeAt(0) - 65;
    const row = parseInt(match[2]) - 1;
    return rowIndex === row && colIndex === col;
  };

  return (
    <div
      className="bg-white overflow-auto"
      style={{ fontSize: `${14 * zoom / 100}px` }}
    >
      <table className="w-full border-collapse">
        <tbody>
          {mockData.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex === 0 ? 'bg-slate-100 font-medium' : ''}>
              {row.map((cell, colIndex) => (
                <td
                  key={colIndex}
                  onClick={() => onRegionClick?.({ row: rowIndex, col: colIndex })}
                  className={`border border-slate-300 px-3 py-2 cursor-pointer hover:bg-slate-50 ${
                    isHighlightedCell(rowIndex, colIndex)
                      ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400'
                      : ''
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * ImageContent - Image preview with zoom
 */
function ImageContent({ source, zoom, highlightRegion }) {
  return (
    <div className="flex items-center justify-center">
      <img
        src={source.previewUrl || source.downloadUrl}
        alt={source.fileName}
        className="max-w-full shadow-lg"
        style={{
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'center'
        }}
      />
    </div>
  );
}

/**
 * TextContent - Plain text/email content display
 */
function TextContent({ source, highlightRegion }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow max-w-3xl mx-auto">
      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
        {highlightRegion?.textSnippet ? (
          <HighlightedText
            content={source.content || ''}
            highlight={highlightRegion.textSnippet}
          />
        ) : (
          source.content || 'No content available'
        )}
      </pre>
    </div>
  );
}

/**
 * HighlightedText - Highlight matching text within content
 */
function HighlightedText({ content, highlight }) {
  if (!highlight || !content) return content;

  const parts = content.split(new RegExp(`(${escapeRegex(highlight)})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className="bg-amber-200 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ProvenanceHighlight - Clickable provenance indicator
 */
export function ProvenanceHighlight({
  provenance,
  onClick,
  className = ''
}) {
  if (!provenance) return null;

  const { documentName, pageNumber, cellReference, textSnippet } = provenance;

  return (
    <button
      onClick={() => onClick?.(provenance)}
      className={`inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline ${className}`}
    >
      <ExternalLink className="w-3 h-3" />
      {documentName}
      {pageNumber && ` p.${pageNumber}`}
      {cellReference && ` ${cellReference}`}
    </button>
  );
}

export default DocumentViewer;
