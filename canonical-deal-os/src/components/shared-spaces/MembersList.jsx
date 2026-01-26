/**
 * Members List - Manage space members
 *
 * Features:
 * - List all members with roles
 * - Separate buttons: "Add Team Member" vs "Invite External Party"
 * - Role badges (OWNER, COLLABORATOR, VIEWER)
 * - Remove member (owner only)
 * - Show internal vs external members
 */

import React, { useState } from 'react';
import {
  User,
  Mail,
  Shield,
  UserPlus,
  UserCog,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../ui/alert-dialog';
import { bff } from '../../api/bffClient';
import AddTeamMemberModal from './AddTeamMemberModal';
import InviteExternalModal from './InviteExternalModal';

export default function MembersList({
  space,
  userRole,
  canManageMembers,
  onMemberAdded,
  onMemberRemoved
}) {
  const [addTeamModalOpen, setAddTeamModalOpen] = useState(false);
  const [inviteExternalModalOpen, setInviteExternalModalOpen] = useState(false);
  const [removingMember, setRemovingMember] = useState(null);
  const [error, setError] = useState(null);

  const handleRemoveMember = async (memberId) => {
    try {
      await bff.sharedSpaces.removeMember(space.id, memberId);
      setRemovingMember(null);
      setError(null);
      onMemberRemoved();
    } catch (err) {
      console.error('[MembersList] Failed to remove member:', err);
      setError(err.message || 'Failed to remove member');
    }
  };

  const getRoleBadgeVariant = (role) => {
    switch (role) {
      case 'OWNER':
        return 'default';
      case 'COLLABORATOR':
        return 'secondary';
      case 'VIEWER':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const members = space.members || [];
  const internalMembers = members.filter(m => m.userId);
  const externalMembers = members.filter(m => m.externalEmail);

  return (
    <div className="space-y-4">
      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Add member buttons */}
      {canManageMembers && (
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setAddTeamModalOpen(true)}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add Team Member
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setInviteExternalModalOpen(true)}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Invite External Party
          </Button>
        </div>
      )}

      {/* Members list */}
      <div className="space-y-3">
        {/* Internal members */}
        {internalMembers.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Team Members
            </h4>
            <div className="space-y-2">
              {internalMembers.map(member => (
                <div
                  key={member.id}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50"
                >
                  <User className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {member.user?.name || member.userId}
                      </span>
                      <Badge variant={getRoleBadgeVariant(member.role)} className="text-xs">
                        {member.role}
                      </Badge>
                    </div>
                    {member.user?.email && (
                      <p className="text-xs text-gray-500 truncate">
                        {member.user.email}
                      </p>
                    )}
                  </div>
                  {canManageMembers && member.role !== 'OWNER' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemovingMember(member)}
                      className="flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* External members */}
        {externalMembers.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              External Parties
            </h4>
            <div className="space-y-2">
              {externalMembers.map(member => (
                <div
                  key={member.id}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 bg-blue-50"
                >
                  <Mail className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {member.externalName}
                      </span>
                      <Badge variant={getRoleBadgeVariant(member.role)} className="text-xs">
                        {member.role}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {member.externalEmail}
                    </p>
                    {member.lastAccessAt && (
                      <p className="text-xs text-gray-400 mt-1">
                        Last accessed {new Date(member.lastAccessAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {canManageMembers && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemovingMember(member)}
                      className="flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {members.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <User className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No members yet</p>
            {canManageMembers && (
              <p className="text-xs mt-1">Add team members or invite external parties</p>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AddTeamMemberModal
        open={addTeamModalOpen}
        onClose={() => setAddTeamModalOpen(false)}
        spaceId={space.id}
        onMemberAdded={() => {
          setAddTeamModalOpen(false);
          onMemberAdded();
        }}
      />

      <InviteExternalModal
        open={inviteExternalModalOpen}
        onClose={() => setInviteExternalModalOpen(false)}
        spaceId={space.id}
        onMemberAdded={() => {
          setInviteExternalModalOpen(false);
          onMemberAdded();
        }}
      />

      {/* Remove confirmation dialog */}
      <AlertDialog
        open={!!removingMember}
        onOpenChange={() => setRemovingMember(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <strong>{removingMember?.externalName || removingMember?.user?.name}</strong>{' '}
              from this space? They will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removingMember && handleRemoveMember(removingMember.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
