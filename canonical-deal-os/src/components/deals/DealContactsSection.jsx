import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Plus,
  Users,
  Mail,
  Phone,
  MoreHorizontal,
  Trash2,
  Edit,
  DollarSign,
  Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { bff } from '@/api/bffClient';
import { toast } from 'sonner';
import {
  StarRating,
  ContactPicker,
  ContactDetailSheet,
  AddContactModal
} from '@/components/contacts';

// Role categories for grouping contacts
const ROLE_CATEGORIES = {
  BROKERAGE: ['LISTING_BROKER', 'CO_BROKER', 'BUYERS_BROKER'],
  FINANCING: ['LENDER', 'MORTGAGE_BROKER'],
  LEGAL: ['ATTORNEY', 'TITLE', 'ESCROW'],
  DUE_DILIGENCE: ['APPRAISER', 'INSPECTOR', 'ENVIRONMENTAL'],
  OTHER: ['PROPERTY_MANAGER', 'INSURANCE', 'TAX_ADVISOR', 'CONTRACTOR', 'OTHER']
};

const ROLE_LABELS = {
  LISTING_BROKER: 'Listing Broker',
  CO_BROKER: 'Co-Broker',
  BUYERS_BROKER: 'Buyer\'s Broker',
  LENDER: 'Lender',
  MORTGAGE_BROKER: 'Mortgage Broker',
  ATTORNEY: 'Attorney',
  TITLE: 'Title Company',
  ESCROW: 'Escrow Agent',
  APPRAISER: 'Appraiser',
  INSPECTOR: 'Inspector',
  ENVIRONMENTAL: 'Environmental',
  PROPERTY_MANAGER: 'Property Manager',
  INSURANCE: 'Insurance',
  TAX_ADVISOR: 'Tax Advisor',
  CONTRACTOR: 'Contractor',
  OTHER: 'Other'
};

const CONTACT_TYPE_TO_ROLE = {
  BROKER: 'LISTING_BROKER',
  LENDER: 'LENDER',
  ATTORNEY: 'ATTORNEY',
  TITLE_COMPANY: 'TITLE',
  APPRAISER: 'APPRAISER',
  INSPECTOR: 'INSPECTOR',
  ENVIRONMENTAL: 'ENVIRONMENTAL',
  PROPERTY_MANAGER: 'PROPERTY_MANAGER',
  ESCROW_AGENT: 'ESCROW',
  INSURANCE_AGENT: 'INSURANCE',
  TAX_ADVISOR: 'TAX_ADVISOR',
  CONTRACTOR: 'CONTRACTOR',
  OTHER: 'OTHER'
};

/**
 * DealContactsSection - Shows contacts assigned to a deal with add/edit capabilities
 *
 * @param {string} dealId - The deal or deal draft ID
 * @param {string} dealType - 'KERNEL' or 'DRAFT'
 * @param {boolean} readOnly - If true, disable editing
 * @param {string} className - Additional CSS classes
 */
export function DealContactsSection({
  dealId,
  dealType = 'DRAFT',
  readOnly = false,
  className
}) {
  const queryClient = useQueryClient();
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [addRole, setAddRole] = useState(null);

  // Fetch deal contacts
  const { data, isLoading, error } = useQuery({
    queryKey: ['dealContacts', dealId, dealType],
    queryFn: () => bff.dealContacts.list(dealId, dealType),
    enabled: !!dealId
  });

  const dealContacts = data?.contacts || [];

  // Assign contact mutation
  const assignMutation = useMutation({
    mutationFn: ({ contactId, role }) =>
      bff.dealContacts.assign(dealId, dealType, { contactId, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealContacts', dealId] });
      toast.success('Contact added to deal');
      setShowAddPicker(false);
      setAddRole(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add contact');
    }
  });

  // Remove contact mutation
  const removeMutation = useMutation({
    mutationFn: (assignmentId) => bff.dealContacts.remove(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealContacts', dealId] });
      toast.success('Contact removed from deal');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove contact');
    }
  });

  // Group contacts by role category
  const groupedContacts = dealContacts.reduce((groups, dc) => {
    const category = Object.entries(ROLE_CATEGORIES).find(([_, roles]) =>
      roles.includes(dc.role)
    )?.[0] || 'OTHER';

    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(dc);
    return groups;
  }, {});

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Handle contact selection from picker
  const handleContactSelected = (contactId) => {
    if (contactId && addRole) {
      assignMutation.mutate({ contactId, role: addRole });
    }
  };

  // Handle new contact created
  const handleContactCreated = (contact) => {
    if (addRole) {
      const role = CONTACT_TYPE_TO_ROLE[contact.contactType] || addRole;
      assignMutation.mutate({ contactId: contact.id, role });
    }
    setShowAddModal(false);
  };

  // Handle click on contact
  const handleContactClick = (dc) => {
    setSelectedContactId(dc.contactId);
    setShowDetailSheet(true);
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Deal Contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Deal Contacts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">Failed to load contacts</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Deal Contacts
            {dealContacts.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {dealContacts.length}
              </Badge>
            )}
          </CardTitle>
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <DropdownMenuItem
                    key={role}
                    onClick={() => {
                      setAddRole(role);
                      setShowAddPicker(true);
                    }}
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {dealContacts.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-lg">
            <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No contacts assigned</p>
            {!readOnly && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setAddRole('LISTING_BROKER');
                  setShowAddPicker(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Contact
              </Button>
            )}
          </div>
        ) : (
          // Group contacts by category
          Object.entries(ROLE_CATEGORIES).map(([category, roles]) => {
            const categoryContacts = groupedContacts[category] || [];
            if (categoryContacts.length === 0) return null;

            return (
              <div key={category}>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  {category.replace('_', ' ')}
                </h4>
                <div className="space-y-2">
                  {categoryContacts.map(dc => (
                    <ContactRow
                      key={dc.id}
                      dealContact={dc}
                      onRemove={() => removeMutation.mutate(dc.id)}
                      onClick={() => handleContactClick(dc)}
                      getInitials={getInitials}
                      readOnly={readOnly}
                      isRemoving={removeMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      {/* Contact Picker Dialog */}
      {showAddPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">
                Add {ROLE_LABELS[addRole] || 'Contact'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ContactPicker
                value={null}
                onChange={handleContactSelected}
                showCreateOption={true}
                onCreateNew={() => {
                  setShowAddPicker(false);
                  setShowAddModal(true);
                }}
                placeholder={`Search for ${ROLE_LABELS[addRole]?.toLowerCase() || 'contact'}...`}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddPicker(false);
                    setAddRole(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Contact Modal */}
      <AddContactModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={handleContactCreated}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailSheet
        open={showDetailSheet}
        onOpenChange={setShowDetailSheet}
        contactId={selectedContactId}
      />
    </Card>
  );
}

// Individual contact row
function ContactRow({
  dealContact,
  onRemove,
  onClick,
  getInitials,
  readOnly,
  isRemoving
}) {
  const contact = dealContact.contact;

  if (!contact) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer group"
      onClick={onClick}
    >
      <Avatar className="h-9 w-9">
        <AvatarFallback className="text-xs">
          {getInitials(contact.name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{contact.name}</span>
          <Badge variant="outline" className="text-xs">
            {ROLE_LABELS[dealContact.role] || dealContact.role}
          </Badge>
          {dealContact.isPrimary && (
            <Badge className="text-xs bg-blue-100 text-blue-700 border-0">
              Primary
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {contact.email && (
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" />
              {contact.email}
            </span>
          )}
          {dealContact.estimatedFee && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {dealContact.feeType === 'PERCENTAGE'
                ? `${dealContact.estimatedFee}%`
                : `$${dealContact.estimatedFee.toLocaleString()}`}
            </span>
          )}
        </div>
      </div>

      {contact.avgRating && (
        <StarRating value={contact.avgRating} size="sm" />
      )}

      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              disabled={isRemoving}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export default DealContactsSection;
