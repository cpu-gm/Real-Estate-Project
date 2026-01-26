/**
 * Add Team Member Modal - Invite internal user to space
 * Uses UserPicker component for searchable user selection
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, UserPlus } from 'lucide-react';
import { bff } from '../../api/bffClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Button } from '../ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '../ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import UserPicker from '../UserPicker';

export default function AddTeamMemberModal({ open, onClose, spaceId, onMemberAdded }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const form = useForm({
    defaultValues: {
      userId: '',
      role: 'COLLABORATOR'
    }
  });

  const onSubmit = async (data) => {
    if (!data.userId) {
      setError('Please select a team member');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const memberData = {
        userId: data.userId,
        role: data.role
      };

      await bff.sharedSpaces.addMember(spaceId, memberData);

      form.reset();
      onMemberAdded();
    } catch (err) {
      console.error('[AddTeamMemberModal] Failed to add member:', err);
      setError(err.message || 'Failed to add team member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      form.reset();
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Add Team Member
          </DialogTitle>
          <DialogDescription>
            Add an internal team member to this shared space.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* User Selection */}
            <FormField
              control={form.control}
              name="userId"
              rules={{ required: 'Team member is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team Member *</FormLabel>
                  <FormControl>
                    <UserPicker
                      selectedUserId={field.value}
                      onUserSelect={(user) => field.onChange(user?.id || '')}
                      placeholder="Search for a team member..."
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Select a user from your organization
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Role Selection */}
            <FormField
              control={form.control}
              name="role"
              rules={{ required: 'Role is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="COLLABORATOR">
                        <div>
                          <div className="font-medium">Collaborator</div>
                          <div className="text-xs text-gray-500">
                            Can view, add docs, and send messages
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="VIEWER">
                        <div>
                          <div className="font-medium">Viewer</div>
                          <div className="text-xs text-gray-500">
                            Can only view documents and messages
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="OWNER">
                        <div>
                          <div className="font-medium">Owner</div>
                          <div className="text-xs text-gray-500">
                            Full control including member management
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Defines what this member can do in the space
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Error message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {submitting ? 'Adding...' : 'Add Member'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
