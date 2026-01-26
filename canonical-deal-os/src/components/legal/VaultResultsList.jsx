import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, ExternalLink, Quote, Sparkles } from 'lucide-react';

/**
 * Displays vault query results with document excerpts
 */
export default function VaultResultsList({
  results,
  summary,
  documentHits,
  isLoading = false,
  onViewDocument
}) {
  const [expandedDoc, setExpandedDoc] = useState(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!results || (Array.isArray(results) && results.length === 0)) {
    return (
      <div className="text-center py-8">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No results found</p>
        <p className="text-sm text-gray-400 mt-1">Try a different query</p>
      </div>
    );
  }

  // Parse results if it's a JSON string
  const parsedResults = typeof results === 'string' ? JSON.parse(results) : results;

  return (
    <div className="space-y-6">
      {/* AI Summary */}
      {summary && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Sparkles className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-purple-900 mb-1">AI Summary</h4>
              <p className="text-sm text-purple-800">{summary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Result Stats */}
      {documentHits > 0 && (
        <p className="text-sm text-gray-500">
          Found relevant content in {documentHits} document{documentHits !== 1 ? 's' : ''}
        </p>
      )}

      {/* Results List */}
      <div className="space-y-3">
        {parsedResults.map((result, index) => {
          const isExpanded = expandedDoc === index;
          const excerpts = result.excerpts || [result.excerpt].filter(Boolean);

          return (
            <div
              key={index}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Document Header */}
              <button
                onClick={() => setExpandedDoc(isExpanded ? null : index)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {result.documentTitle || result.filename || `Document ${index + 1}`}
                    </p>
                    {result.documentType && (
                      <span className="text-xs text-gray-500">{result.documentType}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  {result.relevanceScore && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      {Math.round(result.relevanceScore * 100)}% match
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Excerpts */}
              {isExpanded && (
                <div className="px-4 py-3 space-y-3">
                  {excerpts.map((excerpt, i) => (
                    <div key={i} className="flex items-start space-x-2">
                      <Quote className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-700 italic">
                          "{excerpt.text || excerpt}"
                        </p>
                        {excerpt.pageNumber && (
                          <span className="text-xs text-gray-500">
                            Page {excerpt.pageNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {onViewDocument && (
                    <button
                      onClick={() => onViewDocument(result.documentId)}
                      className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <span>View full document</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Preview excerpt (when collapsed) */}
              {!isExpanded && excerpts[0] && (
                <div className="px-4 py-2 border-t border-gray-100">
                  <p className="text-sm text-gray-600 line-clamp-2">
                    "{typeof excerpts[0] === 'string' ? excerpts[0] : excerpts[0].text}"
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Query history item
 */
export function QueryHistoryItem({ query, onClick }) {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
    >
      <p className="text-sm font-medium text-gray-900 mb-1">{query.query}</p>
      <div className="flex items-center space-x-3 text-xs text-gray-500">
        <span>{formatDate(query.queriedAt)}</span>
        <span>·</span>
        <span>{query.documentHits} document{query.documentHits !== 1 ? 's' : ''}</span>
        {query.queriedByName && (
          <>
            <span>·</span>
            <span>{query.queriedByName}</span>
          </>
        )}
      </div>
    </button>
  );
}
