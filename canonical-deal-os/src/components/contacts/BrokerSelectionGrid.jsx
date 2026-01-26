import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, UserX, Clock, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrokerCard, BrokerCardSkeleton } from './BrokerCard';

/**
 * BrokerSelectionGrid - Full-page broker selection component for ListForSale wizard
 *
 * Shows a grid of broker contacts with search, filtering, and selection.
 *
 * @param {array} contacts - Array of broker contacts
 * @param {string} selectedId - Currently selected contact ID
 * @param {function} onSelect - Callback when a contact is selected
 * @param {function} onAddNew - Callback to add a new broker
 * @param {function} onNoBroker - Callback when user wants to proceed without broker
 * @param {array} recentContacts - Recently used contacts (shown at top)
 * @param {boolean} isLoading - Loading state
 * @param {string} className - Additional CSS classes
 */
export function BrokerSelectionGrid({
  contacts = [],
  selectedId,
  onSelect,
  onAddNew,
  onNoBroker,
  recentContacts = [],
  isLoading = false,
  className
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'preferred', 'favorites', 'recent'

  // Filter and search contacts
  const filteredContacts = useMemo(() => {
    let result = [...contacts];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(contact =>
        contact.name?.toLowerCase().includes(query) ||
        contact.companyName?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    switch (filter) {
      case 'preferred':
        result = result.filter(c => c.isOrgPreferred);
        break;
      case 'favorites':
        result = result.filter(c => c.isFavorite);
        break;
      case 'recent':
        // Show only recent contacts
        const recentIds = new Set(recentContacts.map(c => c.id));
        result = result.filter(c => recentIds.has(c.id));
        break;
      default:
        // 'all' - no additional filtering
        break;
    }

    return result;
  }, [contacts, searchQuery, filter, recentContacts]);

  // Get recent contacts that aren't in filtered list
  const recentSection = useMemo(() => {
    if (filter !== 'all' || searchQuery.trim()) return [];
    const filteredIds = new Set(filteredContacts.map(c => c.id));
    return recentContacts.filter(c => !filteredIds.has(c.id)).slice(0, 3);
  }, [recentContacts, filteredContacts, filter, searchQuery]);

  // Combine recent + filtered for display
  const displayContacts = useMemo(() => {
    if (filter === 'all' && !searchQuery.trim() && recentSection.length > 0) {
      // Put recent contacts first
      const recentIds = new Set(recentSection.map(c => c.id));
      const otherContacts = filteredContacts.filter(c => !recentIds.has(c.id));
      return [...recentSection, ...otherContacts];
    }
    return filteredContacts;
  }, [filteredContacts, recentSection, filter, searchQuery]);

  const handleSelect = (contact) => {
    if (onSelect) {
      onSelect(contact);
    }
  };

  // Count for filter badges
  const counts = useMemo(() => ({
    all: contacts.length,
    preferred: contacts.filter(c => c.isOrgPreferred).length,
    favorites: contacts.filter(c => c.isFavorite).length,
    recent: recentContacts.length
  }), [contacts, recentContacts]);

  if (isLoading) {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="text-center">
          <h2 className="text-xl font-semibold">Select Your Listing Broker</h2>
          <p className="text-gray-500">Loading your saved brokers...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <BrokerCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-semibold">Select Your Listing Broker</h2>
        <p className="text-gray-500">Choose from your saved brokers or add a new one</p>
      </div>

      {/* Search and filters */}
      <div className="space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search brokers by name, company, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter tabs */}
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" className="text-xs sm:text-sm">
              All ({counts.all})
            </TabsTrigger>
            <TabsTrigger value="preferred" className="text-xs sm:text-sm">
              <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-400" />
              Preferred ({counts.preferred})
            </TabsTrigger>
            <TabsTrigger value="favorites" className="text-xs sm:text-sm">
              Favorites ({counts.favorites})
            </TabsTrigger>
            <TabsTrigger value="recent" className="text-xs sm:text-sm">
              <Clock className="h-3 w-3 mr-1" />
              Recent ({counts.recent})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Results */}
      {displayContacts.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          {searchQuery.trim() ? (
            <>
              <Search className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No brokers found</h3>
              <p className="text-gray-500 mt-1">
                No brokers match "{searchQuery}"
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setSearchQuery('')}
              >
                Clear search
              </Button>
            </>
          ) : filter !== 'all' ? (
            <>
              <UserX className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">
                No {filter === 'preferred' ? 'preferred' : filter === 'favorites' ? 'favorite' : 'recent'} brokers
              </h3>
              <p className="text-gray-500 mt-1">
                {filter === 'preferred' && 'No brokers have been marked as organization preferred yet.'}
                {filter === 'favorites' && 'You haven\'t added any brokers to your favorites yet.'}
                {filter === 'recent' && 'You haven\'t worked with any brokers recently.'}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setFilter('all')}
              >
                View all brokers
              </Button>
            </>
          ) : (
            <>
              <UserX className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No brokers in your contacts</h3>
              <p className="text-gray-500 mt-1">
                Add a broker to get started
              </p>
              {onAddNew && (
                <Button className="mt-4" onClick={onAddNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Broker
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Recent contacts section header */}
          {filter === 'all' && !searchQuery.trim() && recentSection.length > 0 && (
            <div className="pb-2">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recently Used
              </h3>
            </div>
          )}

          {/* Broker grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayContacts.map((contact, index) => (
              <React.Fragment key={contact.id}>
                {/* Show divider after recent contacts */}
                {filter === 'all' &&
                  !searchQuery.trim() &&
                  recentSection.length > 0 &&
                  index === recentSection.length && (
                    <div className="col-span-full py-2">
                      <h3 className="text-sm font-medium text-gray-700">
                        All Brokers
                      </h3>
                    </div>
                  )}
                <BrokerCard
                  contact={contact}
                  isSelected={selectedId === contact.id}
                  onClick={() => handleSelect(contact)}
                />
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {/* Bottom actions */}
      <div className="flex flex-wrap gap-4 pt-4 border-t">
        {onAddNew && (
          <Button variant="outline" onClick={onAddNew}>
            <Plus className="h-4 w-4 mr-2" />
            Add New Broker
          </Button>
        )}
        {onNoBroker && (
          <Button variant="ghost" onClick={onNoBroker}>
            List Without Broker
          </Button>
        )}
      </div>
    </div>
  );
}

export default BrokerSelectionGrid;
