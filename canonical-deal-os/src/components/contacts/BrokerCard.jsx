import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Star, Building2, Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarRating } from './StarRating';

/**
 * BrokerCard - Card component for displaying a broker contact
 *
 * @param {object} contact - The contact object
 * @param {boolean} isSelected - Whether this card is currently selected
 * @param {function} onClick - Callback when card is clicked
 * @param {boolean} showDetails - Show additional details like email/phone
 * @param {string} className - Additional CSS classes
 */
export function BrokerCard({
  contact,
  isSelected = false,
  onClick,
  showDetails = true,
  className
}) {
  if (!contact) return null;

  // Parse type-specific fields if they exist
  let typeFields = {};
  try {
    if (contact.typeFields) {
      typeFields = typeof contact.typeFields === 'string'
        ? JSON.parse(contact.typeFields)
        : contact.typeFields;
    }
  } catch (e) {
    console.warn('Failed to parse typeFields:', e);
  }

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200',
        'hover:border-blue-300 hover:shadow-md',
        isSelected && 'border-blue-500 bg-blue-50 ring-1 ring-blue-500',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className={cn(
              'text-sm font-medium',
              isSelected ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-600'
            )}>
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-medium text-gray-900 truncate">
                  {contact.name}
                </h4>
                {contact.companyName && (
                  <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {contact.companyName}
                  </p>
                )}
              </div>

              {/* Selection indicator */}
              {isSelected && (
                <CheckCircle className="h-5 w-5 text-blue-500 shrink-0" />
              )}
            </div>

            {/* Contact details */}
            {showDetails && (
              <div className="mt-2 space-y-1">
                {contact.email && (
                  <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                    <Mail className="h-3 w-3 shrink-0" />
                    {contact.email}
                  </p>
                )}
                {contact.phone && (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Phone className="h-3 w-3 shrink-0" />
                    {contact.phone}
                  </p>
                )}
              </div>
            )}

            {/* Rating and deal count */}
            <div className="mt-2 flex items-center gap-3">
              {contact.avgRating !== null && contact.avgRating !== undefined ? (
                <StarRating value={contact.avgRating} size="sm" />
              ) : (
                <span className="text-xs text-gray-400">No ratings</span>
              )}
              <span className="text-xs text-gray-400">
                {contact.dealCount || 0} deal{contact.dealCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Badges */}
            <div className="mt-2 flex flex-wrap gap-1">
              {contact.isOrgPreferred && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-amber-100 text-amber-700 border-0">
                  <Star className="h-3 w-3 mr-0.5 fill-amber-400" />
                  Preferred
                </Badge>
              )}
              {contact.isFavorite && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-pink-100 text-pink-700 border-0">
                  Favorite
                </Badge>
              )}
              {typeFields.licenseNo && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  Lic: {typeFields.licenseNo}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * BrokerCardSkeleton - Loading skeleton for BrokerCard
 */
export function BrokerCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
            <div className="flex gap-2 mt-2">
              <div className="h-3 bg-gray-200 rounded w-20" />
              <div className="h-3 bg-gray-200 rounded w-16" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default BrokerCard;
