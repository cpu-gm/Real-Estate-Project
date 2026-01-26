import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Plus,
  MoreHorizontal,
  Star,
  Heart,
  Archive,
  Edit,
  Mail,
  Phone,
  Building2,
  Loader2,
  Users,
  Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { bff } from '@/api/bffClient';
import { toast } from 'sonner';
import {
  StarRating,
  AddContactModal,
  ContactDetailSheet
} from '@/components/contacts';
import { formatDistanceToNow } from 'date-fns';

// Contact type configuration
const CONTACT_TYPES = [
  { value: 'all', label: 'All Contacts' },
  { value: 'BROKER', label: 'Brokers' },
  { value: 'LENDER', label: 'Lenders' },
  { value: 'ATTORNEY', label: 'Attorneys' },
  { value: 'TITLE_COMPANY', label: 'Title' },
  { value: 'APPRAISER', label: 'Appraisers' },
  { value: 'OTHER', label: 'Other' }
];

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

export default function Contacts() {
  const queryClient = useQueryClient();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);

  // Fetch contacts
  const { data, isLoading, error } = useQuery({
    queryKey: ['contacts', 'list', activeType, searchQuery],
    queryFn: () => bff.contacts.list({
      contactType: activeType === 'all' ? undefined : activeType,
      search: searchQuery || undefined,
      status: 'ACTIVE',
      limit: 100
    }),
    staleTime: 30000
  });

  const contacts = data?.contacts || [];

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: (contactId) => bff.contacts.archive(contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact archived');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to archive contact');
    }
  });

  // Toggle favorite mutation
  const favoriteMutation = useMutation({
    mutationFn: (contactId) => bff.contacts.toggleFavorite(contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
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

  // Handle row click
  const handleRowClick = (contact) => {
    setSelectedContactId(contact.id);
    setShowDetailSheet(true);
  };

  // Handle edit
  const handleEdit = (contact) => {
    setEditContact(contact);
    setShowAddModal(true);
    setShowDetailSheet(false);
  };

  // Handle add success
  const handleAddSuccess = (contact) => {
    setSelectedContactId(contact.id);
    setShowDetailSheet(true);
  };

  // Count by type
  const typeCounts = useMemo(() => {
    // We'd need a separate query for accurate counts
    // For now, show "all" as the total
    return { all: contacts.length };
  }, [contacts]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-gray-500">Manage your vendors and contacts</p>
        </div>
        <Button onClick={() => {
          setEditContact(null);
          setShowAddModal(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Contact
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search contacts by name, company, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Type Tabs */}
      <Tabs value={activeType} onValueChange={setActiveType}>
        <TabsList className="h-auto flex-wrap">
          {CONTACT_TYPES.map(type => (
            <TabsTrigger key={type.value} value={type.value} className="text-sm">
              {type.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">
          <p>Failed to load contacts</p>
          <p className="text-sm text-gray-500 mt-1">{error.message}</p>
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">
            {searchQuery ? 'No contacts found' : 'No contacts yet'}
          </h3>
          <p className="text-gray-500 mt-1">
            {searchQuery
              ? `No contacts match "${searchQuery}"`
              : 'Add your first contact to get started'}
          </p>
          {!searchQuery && (
            <Button className="mt-4" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Contact</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Email / Phone</TableHead>
                <TableHead className="text-center">Rating</TableHead>
                <TableHead className="text-center">Deals</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map(contact => (
                <TableRow
                  key={contact.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleRowClick(contact)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="text-sm">
                          {getInitials(contact.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{contact.name}</span>
                          {contact.isOrgPreferred && (
                            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          )}
                          {contact.isFavorite && (
                            <Heart className="h-3 w-3 text-pink-500 fill-pink-500" />
                          )}
                        </div>
                        {contact.companyName && (
                          <span className="text-sm text-gray-500 flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {contact.companyName}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {CONTACT_TYPE_LABELS[contact.contactType] || contact.contactType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-gray-600 hover:text-blue-600 flex items-center gap-1"
                        >
                          <Mail className="h-3 w-3" />
                          {contact.email}
                        </a>
                      )}
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-gray-500 flex items-center gap-1"
                        >
                          <Phone className="h-3 w-3" />
                          {contact.phone}
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {contact.avgRating !== null && contact.avgRating !== undefined ? (
                      <div className="flex justify-center">
                        <StarRating value={contact.avgRating} size="sm" showValue />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm">{contact.dealCount || 0}</span>
                  </TableCell>
                  <TableCell>
                    {contact.lastUsedAt ? (
                      <span className="text-sm text-gray-500">
                        {formatDistanceToNow(new Date(contact.lastUsedAt))} ago
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(contact);
                        }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          favoriteMutation.mutate(contact.id);
                        }}>
                          {contact.isFavorite ? (
                            <>
                              <Heart className="h-4 w-4 mr-2" />
                              Remove from Favorites
                            </>
                          ) : (
                            <>
                              <Heart className="h-4 w-4 mr-2" />
                              Add to Favorites
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Are you sure you want to archive this contact?')) {
                              archiveMutation.mutate(contact.id);
                            }
                          }}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Contact Modal */}
      <AddContactModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        editContact={editContact}
        onSuccess={handleAddSuccess}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailSheet
        open={showDetailSheet}
        onOpenChange={setShowDetailSheet}
        contactId={selectedContactId}
        onEdit={handleEdit}
      />
    </div>
  );
}
