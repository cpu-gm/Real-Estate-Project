import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  AlertTriangle,
  Clock,
  ChevronRight,
  Shield,
  FileText,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { bff } from '@/api/bffClient';
import { format, differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ContactDetailSheet } from '@/components/contacts';

/**
 * ExpiringCredentialsWidget - Dashboard widget showing credentials expiring soon
 *
 * @param {number} days - Number of days to look ahead (default 30)
 * @param {number} limit - Maximum number of items to show (default 5)
 * @param {string} className - Additional CSS classes
 */
export function ExpiringCredentialsWidget({
  days = 30,
  limit = 5,
  className
}) {
  const navigate = useNavigate();
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);

  // Fetch expiring credentials
  const { data, isLoading, error } = useQuery({
    queryKey: ['contacts', 'expiring-credentials', days],
    queryFn: () => bff.contacts.expiringCredentials(days),
    staleTime: 60000 // 1 minute
  });

  const credentials = data?.credentials?.slice(0, limit) || [];
  const totalExpiring = data?.credentials?.length || 0;

  // Get urgency level based on days until expiry
  const getUrgency = (daysUntilExpiry) => {
    if (daysUntilExpiry <= 0) return 'expired';
    if (daysUntilExpiry <= 7) return 'critical';
    if (daysUntilExpiry <= 14) return 'warning';
    return 'normal';
  };

  // Get badge styling based on urgency
  const getBadgeStyle = (urgency) => {
    switch (urgency) {
      case 'expired':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'critical':
        return 'bg-red-50 text-red-600 border-red-100';
      case 'warning':
        return 'bg-amber-50 text-amber-600 border-amber-100';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Handle click on credential
  const handleCredentialClick = (cred) => {
    setSelectedContactId(cred.contact.id);
    setShowDetailSheet(true);
  };

  // Navigate to full contacts page
  const handleViewAll = () => {
    navigate(createPageUrl('Contacts'));
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-500" />
            Expiring Credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-500" />
            Expiring Credentials
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">Unable to load credentials</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-500" />
            Expiring Credentials
            {totalExpiring > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 text-xs bg-amber-100 text-amber-700"
              >
                {totalExpiring}
              </Badge>
            )}
          </CardTitle>
          {credentials.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={handleViewAll}
            >
              View All
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {credentials.length === 0 ? (
          <div className="text-center py-4">
            <Shield className="h-8 w-8 text-green-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              No credentials expiring in the next {days} days
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {credentials.map((cred) => {
              const urgency = getUrgency(cred.daysUntilExpiry);
              const badgeStyle = getBadgeStyle(urgency);

              return (
                <div
                  key={cred.id}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleCredentialClick(cred)}
                >
                  <Avatar className="h-8 w-8 mt-0.5">
                    <AvatarFallback className="text-xs">
                      {getInitials(cred.contact.name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {cred.contact.name}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {cred.contact.contactType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <FileText className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-600 truncate">
                        {cred.credentialName}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <Badge className={cn('text-xs', badgeStyle)}>
                      {urgency === 'expired' ? (
                        <>
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Expired
                        </>
                      ) : (
                        <>
                          <Clock className="h-3 w-3 mr-1" />
                          {cred.daysUntilExpiry}d
                        </>
                      )}
                    </Badge>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(cred.expirationDate), 'MMM d')}
                    </p>
                  </div>
                </div>
              );
            })}

            {totalExpiring > limit && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-gray-500"
                onClick={handleViewAll}
              >
                +{totalExpiring - limit} more expiring
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {/* Contact Detail Sheet */}
      <ContactDetailSheet
        open={showDetailSheet}
        onOpenChange={setShowDetailSheet}
        contactId={selectedContactId}
      />
    </Card>
  );
}

export default ExpiringCredentialsWidget;
