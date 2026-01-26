import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';


import { toast } from '@/components/ui/use-toast';
import {
  Bookmark,
  Search,
  Plus,
  Trash2,
  Bell,
  BellOff,
  Loader2
} from 'lucide-react';

const ASSET_TYPES = [
  'Multifamily',
  'Office',
  'Retail',
  'Industrial',
  'Mixed-Use',
  'Hotel',
  'Self-Storage',
  'Land',
];

export default function SavedSearches() {
  const { authToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSearch, setNewSearch] = useState({
    name: '',
    assetTypes: [],
    minPrice: '',
    maxPrice: '',
    locations: '',
    notifyOnNew: true
  });

  // For now, use localStorage for saved searches
  // In production, this would be stored in the database
  const { data: savedSearches = [] } = useQuery({
    queryKey: ['saved-searches', user?.id],
    queryFn: () => {
      const stored = localStorage.getItem(`savedSearches_${user?.id}`);
      return stored ? JSON.parse(stored) : [];
    },
    enabled: !!user?.id
  });

  const saveMutation = useMutation({
    mutationFn: async (search) => {
      const searches = [...savedSearches, { ...search, id: Date.now().toString(), createdAt: new Date().toISOString() }];
      localStorage.setItem(`savedSearches_${user?.id}`, JSON.stringify(searches));
      return searches;
    },
    onSuccess: () => {
      toast({ title: 'Search saved', description: 'You\'ll be notified when matching listings appear' });
      setCreateDialogOpen(false);
      setNewSearch({ name: '', assetTypes: [], minPrice: '', maxPrice: '', locations: '', notifyOnNew: true });
      queryClient.invalidateQueries(['saved-searches', user?.id]);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (searchId) => {
      const searches = savedSearches.filter(s => s.id !== searchId);
      localStorage.setItem(`savedSearches_${user?.id}`, JSON.stringify(searches));
      return searches;
    },
    onSuccess: () => {
      toast({ title: 'Search deleted' });
      queryClient.invalidateQueries(['saved-searches', user?.id]);
    }
  });

  const toggleNotifyMutation = useMutation({
    mutationFn: async (searchId) => {
      const searches = savedSearches.map(s =>
        s.id === searchId ? { ...s, notifyOnNew: !s.notifyOnNew } : s
      );
      localStorage.setItem(`savedSearches_${user?.id}`, JSON.stringify(searches));
      return searches;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['saved-searches', user?.id]);
    }
  });

  const handleCreateSearch = () => {
    if (!newSearch.name.trim()) {
      toast({ title: 'Name required', description: 'Please enter a name for this search', variant: 'destructive' });
      return;
    }
    saveMutation.mutate(newSearch);
  };

  const formatCriteria = (search) => {
    const parts = [];
    if (search.assetTypes?.length > 0) {
      parts.push(search.assetTypes.join(', '));
    }
    if (search.minPrice || search.maxPrice) {
      const min = search.minPrice ? `$${(Number(search.minPrice) / 1000000).toFixed(1)}M` : '$0';
      const max = search.maxPrice ? `$${(Number(search.maxPrice) / 1000000).toFixed(1)}M` : 'Any';
      parts.push(`${min} - ${max}`);
    }
    if (search.locations) {
      parts.push(search.locations);
    }
    return parts.length > 0 ? parts.join(' • ') : 'All listings';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Saved Searches</h1>
          <p className="text-slate-600 mt-1">Get notified when new listings match your criteria</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Search
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Saved Search</DialogTitle>
              <DialogDescription>
                Define your criteria to get notified about matching listings
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="searchName">Search Name *</Label>
                <Input
                  id="searchName"
                  placeholder="e.g., Multifamily in Texas"
                  value={newSearch.name}
                  onChange={(e) => setNewSearch({ ...newSearch, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Asset Types</Label>
                <div className="flex flex-wrap gap-2">
                  {ASSET_TYPES.map(type => (
                    <Badge
                      key={type}
                      variant={newSearch.assetTypes.includes(type) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => {
                        const types = newSearch.assetTypes.includes(type)
                          ? newSearch.assetTypes.filter(t => t !== type)
                          : [...newSearch.assetTypes, type];
                        setNewSearch({ ...newSearch, assetTypes: types });
                      }}
                    >
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minPrice">Min Price</Label>
                  <Input
                    id="minPrice"
                    type="number"
                    placeholder="e.g., 5000000"
                    value={newSearch.minPrice}
                    onChange={(e) => setNewSearch({ ...newSearch, minPrice: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxPrice">Max Price</Label>
                  <Input
                    id="maxPrice"
                    type="number"
                    placeholder="e.g., 25000000"
                    value={newSearch.maxPrice}
                    onChange={(e) => setNewSearch({ ...newSearch, maxPrice: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="locations">Locations</Label>
                <Input
                  id="locations"
                  placeholder="e.g., Texas, California"
                  value={newSearch.locations}
                  onChange={(e) => setNewSearch({ ...newSearch, locations: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSearch} disabled={saveMutation.isLoading}>
                {saveMutation.isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Search
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Saved Searches List */}
      {savedSearches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bookmark className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No saved searches</h3>
            <p className="text-slate-600 mb-4">
              Create a saved search to get notified about new listings that match your criteria
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedSearches.map(search => (
            <Card key={search.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{search.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleNotifyMutation.mutate(search.id)}
                  >
                    {search.notifyOnNew ? (
                      <Bell className="h-4 w-4 text-blue-600" />
                    ) : (
                      <BellOff className="h-4 w-4 text-slate-400" />
                    )}
                  </Button>
                </div>
                <CardDescription>{formatCriteria(search)}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/Marketplace?${buildSearchParams(search)}`}>
                      <Search className="h-4 w-4 mr-2" />
                      Run Search
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => deleteMutation.mutate(search.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function buildSearchParams(search) {
  const params = new URLSearchParams();
  if (search.assetTypes?.length > 0) {
    params.set('assetType', search.assetTypes[0]);
  }
  if (search.minPrice || search.maxPrice) {
    params.set('priceRange', `${search.minPrice || '0'}-${search.maxPrice || '+'}`);
  }
  if (search.locations) {
    params.set('q', search.locations);
  }
  return params.toString();
}
