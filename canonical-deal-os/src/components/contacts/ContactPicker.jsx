import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  ChevronsUpDown,
  Check,
  Plus,
  Star,
  Building2,
  User,
  Clock,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { bff } from '@/api/bffClient';
import { StarRating } from './StarRating';

// Contact type display info
const CONTACT_TYPE_INFO = {
  BROKER: { label: 'Broker', icon: User },
  LENDER: { label: 'Lender', icon: Building2 },
  ATTORNEY: { label: 'Attorney', icon: User },
  TITLE_COMPANY: { label: 'Title Company', icon: Building2 },
  APPRAISER: { label: 'Appraiser', icon: User },
  INSPECTOR: { label: 'Inspector', icon: User },
  ENVIRONMENTAL: { label: 'Environmental', icon: User },
  PROPERTY_MANAGER: { label: 'Property Manager', icon: User },
  ESCROW_AGENT: { label: 'Escrow Agent', icon: User },
  INSURANCE_AGENT: { label: 'Insurance Agent', icon: User },
  TAX_ADVISOR: { label: 'Tax Advisor', icon: User },
  CONTRACTOR: { label: 'Contractor', icon: User },
  INVESTOR: { label: 'Investor', icon: User },
  OTHER: { label: 'Other', icon: User }
};

/**
 * ContactPicker - Searchable dropdown for selecting contacts
 *
 * @param {string} value - Selected contact ID
 * @param {function} onChange - Callback when selection changes
 * @param {string} defaultType - Default contact type filter (e.g., 'BROKER')
 * @param {array} allowedTypes - Restrict to these contact types
 * @param {boolean} showCreateOption - Show "Add New Contact" option
 * @param {function} onCreateNew - Callback when "Add New" is clicked
 * @param {string} placeholder - Placeholder text
 * @param {boolean} disabled - Disable the picker
 * @param {string} className - Additional CSS classes
 */
export function ContactPicker({
  value,
  onChange,
  defaultType = null,
  allowedTypes = null,
  showCreateOption = true,
  onCreateNew,
  placeholder = 'Select contact...',
  disabled = false,
  className
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState(defaultType);

  // Fetch recent contacts
  const { data: recentData } = useQuery({
    queryKey: ['contacts', 'recent', activeType],
    queryFn: () => bff.contacts.recent(activeType, 5),
    enabled: open && !searchQuery.trim(),
    staleTime: 30000
  });

  // Search contacts
  const { data: searchData, isLoading: isSearching } = useQuery({
    queryKey: ['contacts', 'search', searchQuery, activeType],
    queryFn: () => bff.contacts.search(searchQuery, { contactType: activeType, limit: 20 }),
    enabled: open && searchQuery.trim().length >= 2,
    staleTime: 10000
  });

  // Get selected contact details
  const { data: selectedContact } = useQuery({
    queryKey: ['contacts', value],
    queryFn: () => bff.contacts.get(value),
    enabled: !!value,
    staleTime: 60000
  });

  // Determine which contacts to display
  const displayContacts = searchQuery.trim().length >= 2
    ? (searchData?.contacts || [])
    : (recentData?.contacts || []);

  const recentContacts = recentData?.contacts || [];

  // Handle selection
  const handleSelect = (contact) => {
    onChange(contact.id);
    setOpen(false);
    setSearchQuery('');
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

  // Get type chips for filtering
  const typeChips = allowedTypes || (defaultType ? [defaultType] : null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          {selectedContact ? (
            <div className="flex items-center gap-2 truncate">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs">
                  {getInitials(selectedContact.name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{selectedContact.name}</span>
              {selectedContact.companyName && (
                <span className="text-gray-400 truncate">
                  ({selectedContact.companyName})
                </span>
              )}
            </div>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search contacts..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />

          {/* Type filter chips */}
          {typeChips && typeChips.length > 1 && (
            <div className="flex gap-1 px-2 py-1.5 border-b">
              <Badge
                variant={activeType === null ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setActiveType(null)}
              >
                All
              </Badge>
              {typeChips.map(type => (
                <Badge
                  key={type}
                  variant={activeType === type ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => setActiveType(type)}
                >
                  {CONTACT_TYPE_INFO[type]?.label || type}
                </Badge>
              ))}
            </div>
          )}

          <CommandList>
            {isSearching && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            )}

            <CommandEmpty>
              {searchQuery.trim().length < 2
                ? 'Type at least 2 characters to search...'
                : 'No contacts found.'}
            </CommandEmpty>

            {/* Recent contacts (when not searching) */}
            {!searchQuery.trim() && recentContacts.length > 0 && (
              <CommandGroup heading="Recent">
                {recentContacts.map(contact => (
                  <ContactCommandItem
                    key={contact.id}
                    contact={contact}
                    isSelected={value === contact.id}
                    onSelect={() => handleSelect(contact)}
                    getInitials={getInitials}
                  />
                ))}
              </CommandGroup>
            )}

            {/* Search results */}
            {searchQuery.trim().length >= 2 && displayContacts.length > 0 && (
              <CommandGroup heading="Search Results">
                {displayContacts.map(contact => (
                  <ContactCommandItem
                    key={contact.id}
                    contact={contact}
                    isSelected={value === contact.id}
                    onSelect={() => handleSelect(contact)}
                    getInitials={getInitials}
                  />
                ))}
              </CommandGroup>
            )}

            {/* Create new option */}
            {showCreateOption && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      onCreateNew?.();
                    }}
                    className="cursor-pointer"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    <span>Add New Contact</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * ContactCommandItem - Individual contact item in the command list
 */
function ContactCommandItem({ contact, isSelected, onSelect, getInitials }) {
  const typeInfo = CONTACT_TYPE_INFO[contact.contactType] || CONTACT_TYPE_INFO.OTHER;

  return (
    <CommandItem
      value={contact.id}
      onSelect={onSelect}
      className="cursor-pointer"
    >
      <div className="flex items-center gap-3 w-full">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
            {getInitials(contact.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{contact.name}</span>
            {contact.isOrgPreferred && (
              <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {contact.companyName && (
              <span className="truncate">{contact.companyName}</span>
            )}
            {contact.email && (
              <span className="truncate text-gray-400">
                {contact.email}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {contact.avgRating !== null && contact.avgRating !== undefined && (
              <StarRating value={contact.avgRating} size="sm" />
            )}
            <span className="text-xs text-gray-400">
              {contact.dealCount || 0} deals
            </span>
          </div>
        </div>

        {isSelected && (
          <Check className="h-4 w-4 text-blue-600 shrink-0" />
        )}
      </div>
    </CommandItem>
  );
}

export default ContactPicker;
