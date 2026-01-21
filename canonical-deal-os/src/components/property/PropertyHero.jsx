import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Share2,
  MoreVertical,
  ArrowLeft,
  Building2,
  MapPin,
  Calendar,
  Layers
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PropertyHero({
  propertyName,
  address,
  city,
  state,
  zipCode,
  units,
  assetType,
  assetClass,
  yearBuilt,
  imageUrl,
  status,
  onShare,
  onEdit,
  onArchive
}) {
  const navigate = useNavigate();

  const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');

  // Status badge styling
  const getStatusBadge = () => {
    switch (status) {
      case 'DRAFT_INGESTED':
        return <Badge variant="outline" className="bg-slate-100 text-slate-700">Portfolio</Badge>;
      case 'ACTIVE':
        return <Badge className="bg-green-100 text-green-700">Listed</Badge>;
      case 'UNDER_CONTRACT':
        return <Badge className="bg-blue-100 text-blue-700">Under Contract</Badge>;
      case 'CLOSED':
        return <Badge className="bg-purple-100 text-purple-700">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="relative">
      {/* Hero Image / Gradient Background */}
      <div className="relative h-64 w-full overflow-hidden rounded-lg">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={propertyName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900">
            <div className="absolute inset-0 flex items-center justify-center">
              <Building2 className="h-24 w-24 text-slate-600" />
            </div>
          </div>
        )}

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

        {/* Top bar with back button, status, and actions */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {getStatusBadge()}

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={onShare}
            >
              <Share2 className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  Edit Property Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onArchive} className="text-red-600">
                  Archive Property
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Property info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">
            {propertyName || 'Untitled Property'}
          </h1>

          <div className="flex items-center text-white/90 mb-3">
            <MapPin className="h-4 w-4 mr-1 flex-shrink-0" />
            <span className="text-sm">{fullAddress || 'Address not provided'}</span>
          </div>

          {/* Quick stats badges */}
          <div className="flex flex-wrap gap-2">
            {units && (
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                <Layers className="h-3 w-3 mr-1" />
                {units} Units
              </Badge>
            )}
            {assetType && (
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                <Building2 className="h-3 w-3 mr-1" />
                {assetType}
              </Badge>
            )}
            {assetClass && (
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                Class {assetClass}
              </Badge>
            )}
            {yearBuilt && (
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                <Calendar className="h-3 w-3 mr-1" />
                Built {yearBuilt}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
