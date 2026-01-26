import React, { useState } from 'react';
import { Search, Loader2, Sparkles, History, ArrowRight } from 'lucide-react';

const EXAMPLE_QUERIES = [
  'Which documents have indemnification clauses?',
  'Find all purchase price terms across documents',
  'Show me liability caps in these contracts',
  'What are the termination provisions?',
  'Compare due diligence periods across all PSAs',
  'List all insurance requirements'
];

/**
 * Natural language query input for vault search
 */
export default function VaultQueryInput({
  onQuery,
  isLoading = false,
  recentQueries = [],
  placeholder = 'Ask a question about your documents...'
}) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onQuery(query.trim());
      setShowSuggestions(false);
    }
  };

  const handleExampleClick = (example) => {
    setQuery(example);
    setShowSuggestions(false);
    onQuery(example);
  };

  return (
    <div className="relative">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            {isLoading ? (
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5 text-purple-500" />
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={placeholder}
            disabled={isLoading}
            className="block w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute inset-y-0 right-0 pr-4 flex items-center"
          >
            <div className={`p-1.5 rounded-full ${query.trim() && !isLoading ? 'bg-purple-100 text-purple-600 hover:bg-purple-200' : 'text-gray-400'}`}>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      </form>

      {/* Suggestions Dropdown */}
      {showSuggestions && !isLoading && (
        <div className="absolute z-10 w-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          {/* Recent Queries */}
          {recentQueries.length > 0 && (
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center space-x-2 px-2 py-1 text-xs font-medium text-gray-500">
                <History className="w-3 h-3" />
                <span>Recent</span>
              </div>
              {recentQueries.slice(0, 3).map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(q.query)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded"
                >
                  {q.query}
                </button>
              ))}
            </div>
          )}

          {/* Example Queries */}
          <div className="p-2">
            <div className="flex items-center space-x-2 px-2 py-1 text-xs font-medium text-gray-500">
              <Sparkles className="w-3 h-3" />
              <span>Try asking</span>
            </div>
            {EXAMPLE_QUERIES.slice(0, 4).map((example, i) => (
              <button
                key={i}
                onClick={() => handleExampleClick(example)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 rounded"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact query input for inline use
 */
export function CompactQueryInput({ onQuery, isLoading, placeholder }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onQuery(query.trim());
      setQuery('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center space-x-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || 'Search documents...'}
          disabled={isLoading}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        />
      </div>
      <button
        type="submit"
        disabled={!query.trim() || isLoading}
        className="px-3 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          'Ask'
        )}
      </button>
    </form>
  );
}
