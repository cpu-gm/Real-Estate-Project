/**
 * UserPicker Component
 * Searchable dropdown for selecting users from the organization.
 * Used for bulk operations and assignments.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bff } from '@/api/bffClient';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/debug-logger';
import {
  Search,
  X,
  User,
  Clock,
  Check,
  ChevronDown,
  Loader2
} from 'lucide-react';

const logger = createLogger('ui:user-picker');

/**
 * UserPicker - Searchable user selector
 * @param {Object} props
 * @param {Function} props.onSelect - Called with selected user(s)
 * @param {Object|Array} props.value - Currently selected user(s)
 * @param {boolean} props.multiSelect - Enable multi-select mode
 * @param {string} props.roleFilter - Filter by role
 * @param {string} props.placeholder - Input placeholder
 * @param {boolean} props.disabled - Disable the picker
 * @param {string} props.className - Additional CSS classes
 */
export function UserPicker({
  onSelect,
  value = null,
  multiSelect = false,
  roleFilter = '',
  placeholder = 'Search users...',
  disabled = false,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Fetch all users
  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users', roleFilter],
    queryFn: () => bff.users.list('', roleFilter),
    staleTime: 30000,
  });

  // Fetch recent users
  const { data: recentUsers = [] } = useQuery({
    queryKey: ['users', 'recent'],
    queryFn: () => bff.users.recent(),
    staleTime: 60000,
  });

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    const searchLower = search.toLowerCase();
    const filtered = allUsers.filter(user =>
      user.name?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower)
    );
    logger.debug('User search', { query: search, resultCount: filtered.length });
    return filtered;
  }, [allUsers, search]);

  // Get users to display (recent + filtered)
  const displayUsers = useMemo(() => {
    if (!search && recentUsers.length > 0) {
      // When no search, show recent first, then others
      const recentIds = new Set(recentUsers.map(u => u.id));
      const others = allUsers.filter(u => !recentIds.has(u.id));
      return { recent: recentUsers, others };
    }
    return { recent: [], others: filteredUsers };
  }, [search, recentUsers, allUsers, filteredUsers]);

  // Get all options for keyboard navigation
  const allOptions = useMemo(() => {
    return [...displayUsers.recent, ...displayUsers.others];
  }, [displayUsers]);

  // Check if a user is selected
  const isSelected = (userId) => {
    if (multiSelect && Array.isArray(value)) {
      return value.some(v => v.id === userId);
    }
    return value?.id === userId;
  };

  // Handle user selection
  const handleSelect = (user) => {
    logger.debug('UserPicker select', { userId: user.id, userName: user.name });

    if (multiSelect) {
      const currentValues = Array.isArray(value) ? value : [];
      if (isSelected(user.id)) {
        onSelect(currentValues.filter(v => v.id !== user.id));
      } else {
        onSelect([...currentValues, user]);
      }
    } else {
      onSelect(user);
      setIsOpen(false);
      setSearch('');
    }
  };

  // Handle clear selection
  const handleClear = (e) => {
    e?.stopPropagation();
    onSelect(multiSelect ? [] : null);
    setSearch('');
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(i => Math.min(i + 1, allOptions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (allOptions[highlightedIndex]) {
          handleSelect(allOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlighted = listRef.current.querySelector('[data-highlighted="true"]');
      highlighted?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  // Reset highlight when options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasValue = multiSelect ? (Array.isArray(value) && value.length > 0) : !!value;

  return (
    <div
      ref={inputRef}
      className={cn("relative", className)}
      data-testid="user-picker"
    >
      {/* Input/Trigger */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 border rounded-lg bg-white cursor-pointer",
          "border-[#E5E5E5] hover:border-[#A3A3A3]",
          isOpen && "border-[#171717] ring-1 ring-[#171717]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => !disabled && setIsOpen(true)}
      >
        <Search className="w-4 h-4 text-[#A3A3A3]" />

        {hasValue && !isOpen ? (
          <div className="flex-1 flex items-center gap-2 overflow-hidden">
            {multiSelect && Array.isArray(value) ? (
              <div className="flex flex-wrap gap-1">
                {value.map(user => (
                  <Badge
                    key={user.id}
                    variant="secondary"
                    className="flex items-center gap-1 px-2 py-0.5"
                  >
                    <span className="truncate max-w-[100px]">{user.name}</span>
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(user);
                      }}
                    />
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-sm text-[#171717] truncate" data-testid="selected-user">
                {value.name}
              </span>
            )}
          </div>
        ) : (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#A3A3A3]"
            data-testid="user-picker-input"
          />
        )}

        {hasValue && (
          <button
            onClick={handleClear}
            className="p-0.5 hover:bg-[#F5F5F5] rounded"
            data-testid="clear-selection"
          >
            <X className="w-4 h-4 text-[#A3A3A3] hover:text-[#171717]" />
          </button>
        )}

        {usersLoading ? (
          <Loader2 className="w-4 h-4 text-[#A3A3A3] animate-spin" data-testid="loading-spinner" />
        ) : (
          <ChevronDown className={cn(
            "w-4 h-4 text-[#A3A3A3] transition-transform",
            isOpen && "rotate-180"
          )} />
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-[#E5E5E5] rounded-lg shadow-lg max-h-64 overflow-auto"
        >
          {usersLoading ? (
            <div className="p-4 text-center text-sm text-[#737373]">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading users...
            </div>
          ) : allOptions.length === 0 ? (
            <div className="p-4 text-center text-sm text-[#737373]">
              {search ? 'No users found' : 'No users available'}
            </div>
          ) : (
            <>
              {/* Recent Section */}
              {displayUsers.recent.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs text-[#A3A3A3] bg-[#FAFAFA] flex items-center gap-1" data-testid="recent-users">
                    <Clock className="w-3 h-3" />
                    Recent
                  </div>
                  {displayUsers.recent.map((user, index) => (
                    <UserOption
                      key={user.id}
                      user={user}
                      isSelected={isSelected(user.id)}
                      isHighlighted={index === highlightedIndex}
                      onClick={() => handleSelect(user)}
                      multiSelect={multiSelect}
                    />
                  ))}
                </>
              )}

              {/* All Users / Search Results */}
              {displayUsers.others.length > 0 && (
                <>
                  {displayUsers.recent.length > 0 && (
                    <div className="px-3 py-1.5 text-xs text-[#A3A3A3] bg-[#FAFAFA]">
                      All Users
                    </div>
                  )}
                  {displayUsers.others.map((user, index) => (
                    <UserOption
                      key={user.id}
                      user={user}
                      isSelected={isSelected(user.id)}
                      isHighlighted={index + displayUsers.recent.length === highlightedIndex}
                      onClick={() => handleSelect(user)}
                      multiSelect={multiSelect}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Individual user option in the dropdown
 */
function UserOption({ user, isSelected, isHighlighted, onClick, multiSelect }) {
  return (
    <div
      className={cn(
        "px-3 py-2 flex items-center gap-3 cursor-pointer transition-colors",
        isHighlighted && "bg-[#F5F5F5]",
        isSelected && !multiSelect && "bg-[#F0F9FF]"
      )}
      onClick={onClick}
      data-highlighted={isHighlighted}
      data-testid="user-option"
      data-role={user.role}
    >
      {multiSelect && (
        <div className={cn(
          "w-4 h-4 border rounded flex items-center justify-center",
          isSelected ? "bg-[#171717] border-[#171717]" : "border-[#D4D4D4]"
        )}>
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>
      )}

      <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center flex-shrink-0">
        <User className="w-4 h-4 text-[#737373]" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[#171717] truncate">
          {user.name || user.email}
        </div>
        <div className="text-xs text-[#737373] truncate">
          {user.email}
        </div>
      </div>

      {user.role && (
        <Badge variant="outline" className="text-xs flex-shrink-0">
          {user.role}
        </Badge>
      )}

      {isSelected && !multiSelect && (
        <Check className="w-4 h-4 text-[#171717] flex-shrink-0" />
      )}
    </div>
  );
}

export default UserPicker;
