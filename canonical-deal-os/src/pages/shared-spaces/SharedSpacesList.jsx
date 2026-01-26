/**
 * Shared Spaces List - Phase 3
 *
 * List all shared spaces with:
 * - Card grid view showing space name, member count, document count
 * - Create new space button
 * - Filter by matter/deal
 * - Click to navigate to space detail
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users2,
  Plus,
  FileText,
  MessageSquare,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Building2,
  Briefcase,
  Lock,
  Unlock
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { bff } from '../../api/bffClient';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import CreateSpaceModal from '../../components/shared-spaces/CreateSpaceModal';
import SharedSpaceCard from '../../components/shared-spaces/SharedSpaceCard';

export default function SharedSpacesList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState(true);
  const [filterMatterId, setFilterMatterId] = useState(searchParams.get('matterId') || '');
  const [filterDealId, setFilterDealId] = useState(searchParams.get('dealId') || '');

  const loadSpaces = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const filters = {};
      if (filterMatterId) filters.matterId = filterMatterId;
      if (filterDealId) filters.dealId = filterDealId;
      filters.isActive = filterActive;

      const data = await bff.sharedSpaces.list(filters);
      setSpaces(data.spaces || []);
      setError(null);
    } catch (err) {
      console.error('[SharedSpacesList] Failed to load spaces:', err);
      setError(err.message || 'Failed to load shared spaces');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterMatterId, filterDealId, filterActive]);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  const handleSpaceClick = (spaceId) => {
    navigate(`/SharedSpaceDetail/${spaceId}`);
  };

  const handleCreateSpace = () => {
    setCreateModalOpen(true);
  };

  const handleSpaceCreated = (newSpace) => {
    setCreateModalOpen(false);
    loadSpaces(true);
    // Navigate to new space
    navigate(`/SharedSpaceDetail/${newSpace.id}`);
  };

  const handleRefresh = () => {
    loadSpaces(true);
  };

  // Filter spaces by search term (client-side)
  const filteredSpaces = spaces.filter(space => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      space.name.toLowerCase().includes(term) ||
      (space.description && space.description.toLowerCase().includes(term))
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !spaces.length) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading shared spaces</h3>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={() => loadSpaces()}
            className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users2 className="w-8 h-8" />
              Shared Spaces
            </h1>
            <p className="text-gray-600 mt-1">
              Collaborate with external counsel, lenders, and partners
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleCreateSpace}>
              <Plus className="w-4 h-4 mr-2" />
              New Space
            </Button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search spaces by name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={filterActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterActive(!filterActive)}
          >
            {filterActive ? <Lock className="w-4 h-4 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
            {filterActive ? 'Active Only' : 'Show All'}
          </Button>
        </div>
      </div>

      {/* Error message (if spaces loaded but error occurred on action) */}
      {error && spaces.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <p className="text-yellow-800 text-sm">{error}</p>
        </div>
      )}

      {/* Spaces Grid */}
      {filteredSpaces.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">
              {searchTerm ? 'No spaces match your search' : 'No shared spaces yet'}
            </h3>
            <p className="text-gray-500 mb-4">
              {searchTerm
                ? 'Try adjusting your search term or filters'
                : 'Create your first shared space to collaborate with external parties'}
            </p>
            {!searchTerm && (
              <Button onClick={handleCreateSpace}>
                <Plus className="w-4 h-4 mr-2" />
                Create Shared Space
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSpaces.map(space => (
            <SharedSpaceCard
              key={space.id}
              space={space}
              onClick={() => handleSpaceClick(space.id)}
            />
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {filteredSpaces.length > 0 && (
        <div className="mt-6 text-sm text-gray-500">
          Showing {filteredSpaces.length} of {spaces.length} space{spaces.length !== 1 ? 's' : ''}
          {searchTerm && ` matching "${searchTerm}"`}
        </div>
      )}

      {/* Create Space Modal */}
      <CreateSpaceModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSpaceCreated={handleSpaceCreated}
      />
    </div>
  );
}
