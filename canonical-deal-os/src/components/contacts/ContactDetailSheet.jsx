import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Edit,
  Mail,
  Phone,
  Globe,
  Building2,
  Star,
  Heart,
  HeartOff,
  Calendar,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { bff } from '@/api/bffClient';
import { toast } from 'sonner';
import { StarRating, RatingBreakdown } from './StarRating';
import { format, formatDistanceToNow } from 'date-fns';

// Contact type labels
const CONTACT_TYPE_LABELS = {
  BROKER: 'Broker',
  LENDER: 'Lender',
  ATTORNEY: 'Attorney',
  TITLE_COMPANY: 'Title Company',
  APPRAISER: 'Appraiser',
  INSPECTOR: 'Inspector',
  ENVIRONMENTAL: 'Environmental',
  PROPERTY_MANAGER: 'Property Manager',
  ESCROW_AGENT: 'Escrow Agent',
  INSURANCE_AGENT: 'Insurance Agent',
  TAX_ADVISOR: 'Tax Advisor',
  CONTRACTOR: 'Contractor',
  INVESTOR: 'Investor',
  OTHER: 'Other'
};

/**
 * ContactDetailSheet - Slide-over panel showing full contact details
 *
 * @param {boolean} open - Whether the sheet is open
 * @param {function} onOpenChange - Callback to toggle sheet
 * @param {string} contactId - ID of the contact to display
 * @param {function} onEdit - Callback to edit the contact
 */
export function ContactDetailSheet({
  open,
  onOpenChange,
  contactId,
  onEdit
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch contact with all details
  const { data: contact, isLoading } = useQuery({
    queryKey: ['contacts', contactId, 'detail'],
    queryFn: () => bff.contacts.get(contactId, {
      includeCredentials: true,
      includeActivity: true,
      includeRatings: true,
      includeDeals: true
    }),
    enabled: open && !!contactId
  });

  // Fetch activity separately for pagination
  const { data: activityData } = useQuery({
    queryKey: ['contacts', contactId, 'activity'],
    queryFn: () => bff.contacts.getActivity(contactId, { limit: 50 }),
    enabled: open && !!contactId && activeTab === 'activity'
  });

  // Fetch ratings
  const { data: ratingsData } = useQuery({
    queryKey: ['contacts', contactId, 'ratings'],
    queryFn: () => bff.contacts.getRatings(contactId),
    enabled: open && !!contactId && activeTab === 'ratings'
  });

  // Toggle favorite mutation
  const favoriteMutation = useMutation({
    mutationFn: () => bff.contacts.toggleFavorite(contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(contact?.isFavorite ? 'Removed from favorites' : 'Added to favorites');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update favorite');
    }
  });

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Parse type fields
  const getTypeFields = () => {
    if (!contact?.typeFields) return {};
    try {
      return typeof contact.typeFields === 'string'
        ? JSON.parse(contact.typeFields)
        : contact.typeFields;
    } catch {
      return {};
    }
  };

  const typeFields = getTypeFields();

  if (isLoading) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[500px] sm:w-[600px]">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!contact) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[500px] sm:w-[600px]">
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <FileText className="h-12 w-12 mb-4" />
            <p>Contact not found</p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[600px] p-0">
        <ScrollArea className="h-full">
          <div className="p-6">
            {/* Header */}
            <SheetHeader className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-xl bg-blue-100 text-blue-600">
                      {getInitials(contact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="flex items-center gap-2">
                      {contact.name}
                      {contact.isOrgPreferred && (
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                      )}
                    </SheetTitle>
                    <SheetDescription className="flex flex-col gap-1 text-left">
                      <Badge variant="secondary" className="w-fit">
                        {CONTACT_TYPE_LABELS[contact.contactType] || contact.contactType}
                      </Badge>
                      {contact.companyName && (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Building2 className="h-3 w-3" />
                          {contact.companyName}
                        </span>
                      )}
                    </SheetDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => favoriteMutation.mutate()}
                    disabled={favoriteMutation.isPending}
                  >
                    {contact.isFavorite ? (
                      <Heart className="h-4 w-4 fill-pink-500 text-pink-500" />
                    ) : (
                      <HeartOff className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                  {onEdit && (
                    <Button variant="outline" size="sm" onClick={() => onEdit(contact)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>

              {/* Quick stats */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <StarRating value={contact.avgRating} size="sm" />
                  {contact.avgRating && (
                    <span className="text-gray-500">({contact.avgRating.toFixed(1)})</span>
                  )}
                </div>
                <span className="text-gray-400">|</span>
                <span className="text-gray-600">{contact.dealCount || 0} deals</span>
                {contact.lastUsedAt && (
                  <>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-500 text-xs">
                      Last used {formatDistanceToNow(new Date(contact.lastUsedAt))} ago
                    </span>
                  </>
                )}
              </div>
            </SheetHeader>

            <Separator className="my-6" />

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="credentials">Credentials</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="ratings">Ratings</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-6 space-y-6">
                {/* Contact Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                      >
                        <Mail className="h-4 w-4" />
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-2 text-sm text-gray-600"
                      >
                        <Phone className="h-4 w-4" />
                        {contact.phone}
                      </a>
                    )}
                    {contact.phoneAlt && (
                      <a
                        href={`tel:${contact.phoneAlt}`}
                        className="flex items-center gap-2 text-sm text-gray-600"
                      >
                        <Phone className="h-4 w-4" />
                        {contact.phoneAlt} (Alt)
                      </a>
                    )}
                    {contact.website && (
                      <a
                        href={contact.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                      >
                        <Globe className="h-4 w-4" />
                        {contact.website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {contact.title && (
                      <p className="text-sm text-gray-500">
                        <span className="font-medium">Title:</span> {contact.title}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Type-specific fields */}
                {Object.keys(typeFields).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">
                        {CONTACT_TYPE_LABELS[contact.contactType]} Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(typeFields).map(([key, value]) => {
                        if (!value) return null;
                        const label = key
                          .replace(/([A-Z])/g, ' $1')
                          .replace(/^./, str => str.toUpperCase());
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-gray-500">{label}</span>
                            <span className="font-medium">
                              {Array.isArray(value) ? value.join(', ') : String(value)}
                            </span>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Notes */}
                {contact.notes && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">
                        {contact.notes}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Credentials Tab */}
              <TabsContent value="credentials" className="mt-6 space-y-4">
                {contact.credentials && contact.credentials.length > 0 ? (
                  contact.credentials.map(cred => (
                    <Card key={cred.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{cred.credentialName}</h4>
                              <CredentialStatusBadge status={cred.status} />
                            </div>
                            <p className="text-sm text-gray-500">{cred.credentialType}</p>
                            {cred.credentialNumber && (
                              <p className="text-sm text-gray-600 mt-1">
                                #{cred.credentialNumber}
                              </p>
                            )}
                            {cred.issuingAuthority && (
                              <p className="text-sm text-gray-500">
                                Issued by: {cred.issuingAuthority}
                              </p>
                            )}
                          </div>
                          {cred.expirationDate && (
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Expires</p>
                              <p className={cn(
                                'text-sm font-medium',
                                cred.status === 'EXPIRED' && 'text-red-600',
                                cred.status === 'EXPIRING_SOON' && 'text-amber-600'
                              )}>
                                {format(new Date(cred.expirationDate), 'MMM d, yyyy')}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>No credentials on file</p>
                  </div>
                )}
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity" className="mt-6">
                {activityData?.activities && activityData.activities.length > 0 ? (
                  <div className="space-y-4">
                    {activityData.activities.map(activity => (
                      <div key={activity.id} className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <ActivityIcon type={activity.activityType} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {activity.subject || activity.activityType.replace(/_/g, ' ')}
                          </p>
                          {activity.summary && (
                            <p className="text-sm text-gray-600 mt-1">{activity.summary}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {formatDistanceToNow(new Date(activity.occurredAt))} ago
                            {activity.recordedByName && ` by ${activity.recordedByName}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>No activity recorded</p>
                  </div>
                )}
              </TabsContent>

              {/* Ratings Tab */}
              <TabsContent value="ratings" className="mt-6">
                {ratingsData?.ratings && ratingsData.ratings.length > 0 ? (
                  <div className="space-y-6">
                    <RatingBreakdown ratings={ratingsData.ratings} />
                    <Separator />
                    <div className="space-y-4">
                      {ratingsData.ratings.map(rating => (
                        <Card key={rating.id}>
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <StarRating value={rating.overallRating} size="sm" />
                                {rating.comments && (
                                  <p className="text-sm text-gray-600 mt-2">
                                    "{rating.comments}"
                                  </p>
                                )}
                              </div>
                              <div className="text-right text-xs text-gray-500">
                                <p>{rating.ratedByName || 'Anonymous'}</p>
                                <p>{formatDistanceToNow(new Date(rating.ratedAt))} ago</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Star className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>No ratings yet</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// Credential status badge
function CredentialStatusBadge({ status }) {
  const config = {
    ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-700' },
    EXPIRED: { label: 'Expired', color: 'bg-red-100 text-red-700' },
    EXPIRING_SOON: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-700' },
    PENDING: { label: 'Pending', color: 'bg-gray-100 text-gray-700' }
  };

  const { label, color } = config[status] || config.PENDING;

  return (
    <Badge variant="secondary" className={cn('text-xs', color)}>
      {label}
    </Badge>
  );
}

// Activity icon
function ActivityIcon({ type }) {
  const icons = {
    EMAIL_SENT: <Mail className="h-4 w-4 text-blue-500" />,
    EMAIL_RECEIVED: <Mail className="h-4 w-4 text-green-500" />,
    CALL: <Phone className="h-4 w-4 text-purple-500" />,
    MEETING: <Calendar className="h-4 w-4 text-orange-500" />,
    NOTE: <FileText className="h-4 w-4 text-gray-500" />,
    DOCUMENT_SHARED: <FileText className="h-4 w-4 text-blue-500" />,
    PORTAL_ACCESS: <Globe className="h-4 w-4 text-green-500" />,
    DEAL_ASSIGNED: <CheckCircle className="h-4 w-4 text-blue-500" />
  };

  return icons[type] || <Clock className="h-4 w-4 text-gray-400" />;
}

export default ContactDetailSheet;
