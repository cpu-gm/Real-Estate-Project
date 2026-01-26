import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  MapPin,
  DollarSign,
  Calendar,
  Search,
  ArrowUpDown,
  Eye,
  Heart,
  Loader2
} from 'lucide-react';

const ASSET_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'Multifamily', label: 'Multifamily' },
  { value: 'Office', label: 'Office' },
  { value: 'Retail', label: 'Retail' },
  { value: 'Industrial', label: 'Industrial' },
  { value: 'Mixed-Use', label: 'Mixed-Use' },
  { value: 'Hotel', label: 'Hotel' },
  { value: 'Self-Storage', label: 'Self-Storage' },
  { value: 'Land', label: 'Land' },
];

const PRICE_RANGES = [
  { value: 'all', label: 'Any Price' },
  { value: '0-5000000', label: 'Under $5M' },
  { value: '5000000-10000000', label: '$5M - $10M' },
  { value: '10000000-25000000', label: '$10M - $25M' },
  { value: '25000000-50000000', label: '$25M - $50M' },
  { value: '50000000-100000000', label: '$50M - $100M' },
  { value: '100000000+', label: '$100M+' },
];

function formatCurrency(value) {
  if (!value) return 'Price TBD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function Marketplace() {
  const { authToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [assetType, setAssetType] = useState('all');
  const [priceRange, setPriceRange] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  // Fetch public listings
  const { data, isLoading, error } = useQuery({
    queryKey: ['marketplace-listings'],
    queryFn: async () => {
      const res = await fetch('/api/intake/deals?listingType=PUBLIC&status=ACTIVE', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('Failed to fetch listings');
      return res.json();
    },
    enabled: !!authToken
  });

  const listings = data?.deals || [];

  // Filter and sort listings
  const filteredListings = useMemo(() => {
    let result = [...listings];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(listing =>
        listing.propertyName?.toLowerCase().includes(query) ||
        listing.propertyAddress?.toLowerCase().includes(query) ||
        listing.city?.toLowerCase().includes(query) ||
        listing.state?.toLowerCase().includes(query)
      );
    }

    // Asset type filter
    if (assetType !== 'all') {
      result = result.filter(listing => listing.assetType === assetType);
    }

    // Price range filter
    if (priceRange !== 'all') {
      const [min, max] = priceRange.split('-').map(v => v === '+' ? Infinity : Number(v));
      result = result.filter(listing => {
        const price = listing.askingPrice || 0;
        if (max === undefined) return price >= min;
        return price >= min && price <= max;
      });
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        break;
      case 'price-high':
        result.sort((a, b) => (b.askingPrice || 0) - (a.askingPrice || 0));
        break;
      case 'price-low':
        result.sort((a, b) => (a.askingPrice || 0) - (b.askingPrice || 0));
        break;
      default:
        break;
    }

    return result;
  }, [listings, searchQuery, assetType, priceRange, sortBy]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Error loading marketplace: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Marketplace</h1>
        <p className="text-slate-600 mt-1">Browse available commercial real estate listings</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by property name, address, or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Asset Type */}
            <Select value={assetType} onValueChange={setAssetType}>
              <SelectTrigger className="w-full md:w-[180px]">
                <Building2 className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Asset Type" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Price Range */}
            <Select value={priceRange} onValueChange={setPriceRange}>
              <SelectTrigger className="w-full md:w-[180px]">
                <DollarSign className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Price Range" />
              </SelectTrigger>
              <SelectContent>
                {PRICE_RANGES.map(range => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full md:w-[160px]">
                <ArrowUpDown className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {filteredListings.length} {filteredListings.length === 1 ? 'listing' : 'listings'} found
        </p>
      </div>

      {/* Listings Grid */}
      {filteredListings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No listings found</h3>
            <p className="text-slate-600">
              {searchQuery || assetType !== 'all' || priceRange !== 'all'
                ? 'Try adjusting your filters'
                : 'Check back later for new listings'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map(listing => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}

function ListingCard({ listing }) {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      {/* Image placeholder */}
      <div className="h-48 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
        <Building2 className="h-16 w-16 text-slate-300" />
      </div>

      <CardContent className="p-4">
        {/* Asset type badge */}
        <div className="flex items-center justify-between mb-2">
          <Badge variant="outline">{listing.assetType || 'CRE'}</Badge>
          {listing.status === 'ACTIVE' && (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
          )}
        </div>

        {/* Property name */}
        <h3 className="font-semibold text-lg text-slate-900 mb-1 line-clamp-1">
          {listing.propertyName || 'Untitled Property'}
        </h3>

        {/* Address */}
        <div className="flex items-center text-sm text-slate-600 mb-3">
          <MapPin className="h-4 w-4 mr-1 flex-shrink-0" />
          <span className="line-clamp-1">
            {listing.propertyAddress || listing.city || 'Address not provided'}
            {listing.city && listing.state && `, ${listing.city}, ${listing.state}`}
          </span>
        </div>

        {/* Price */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xl font-bold text-slate-900">
            {formatCurrency(listing.askingPrice)}
          </span>
          {listing.pricePerSF && (
            <span className="text-sm text-slate-500">
              ${listing.pricePerSF}/SF
            </span>
          )}
        </div>

        {/* Property details */}
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 mb-4">
          {listing.squareFeet && (
            <div>
              <span className="font-medium">{listing.squareFeet.toLocaleString()}</span> SF
            </div>
          )}
          {listing.units && (
            <div>
              <span className="font-medium">{listing.units}</span> Units
            </div>
          )}
          {listing.yearBuilt && (
            <div>
              Built <span className="font-medium">{listing.yearBuilt}</span>
            </div>
          )}
          {listing.capRate && (
            <div>
              <span className="font-medium">{listing.capRate}%</span> Cap
            </div>
          )}
        </div>

        {/* Posted date */}
        <div className="flex items-center text-xs text-slate-500 mb-4">
          <Calendar className="h-3 w-3 mr-1" />
          Listed {formatDate(listing.createdAt)}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button asChild className="flex-1">
            <Link to={`/BuyerDealView?dealId=${listing.id}`}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </Link>
          </Button>
          <Button variant="outline" size="icon">
            <Heart className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
