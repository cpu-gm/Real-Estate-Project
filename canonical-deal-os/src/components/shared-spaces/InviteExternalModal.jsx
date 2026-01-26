/**
 * Invite External Modal - Invite external party via email
 * Generates access token and sends invitation email
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, ExternalLink, Mail, CheckCircle } from 'lucide-react';
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
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { Textarea } from '../ui/textarea';

export default function InviteExternalModal({ open, onClose, spaceId, onMemberAdded }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const form = useForm({
    defaultValues: {
      externalEmail: '',
      externalName: '',
      role: 'COLLABORATOR',
      message: ''
    }
  });

  const onSubmit = async (data) => {
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const memberData = {
        externalEmail: data.externalEmail,
        externalName: data.externalName,
        role: data.role,
        message: data.message || null
      };

      await bff.sharedSpaces.addMember(spaceId, memberData);

      setSuccess(true);
      form.reset();

      // Wait a moment to show success, then close
      setTimeout(() => {
        setSuccess(false);
        onMemberAdded();
      }, 1500);
    } catch (err) {
      console.error('[InviteExternalModal] Failed to invite external party:', err);
      setError(err.message || 'Failed to send invitation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting && !success) {
      form.reset();
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="w-5 h-5" />
            Invite External Party
          </DialogTitle>
          <DialogDescription>
            Invite outside counsel, lenders, or other external parties to collaborate.
            They will receive an email with a secure access link.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-green-700 mb-2">
              Invitation Sent!
            </h3>
            <p className="text-sm text-gray-600">
              The external party will receive an email with access instructions.
            </p>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Name */}
              <FormField
                control={form.control}
                name="externalName"
                rules={{
                  required: 'Name is required',
                  minLength: { value: 2, message: 'Name must be at least 2 characters' }
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., John Smith"
                        {...field}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormDescription>
                      Full name of the person you're inviting
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email */}
              <FormField
                control={form.control}
                name="externalEmail"
                rules={{
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address'
                  }
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address *</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="john@externallawfirm.com"
                        {...field}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormDescription>
                      They will receive the invitation at this address
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Role */}
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
                            <div className="font-medium">Collaborator (Recommended)</div>
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
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      External parties cannot be owners
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Personal Message */}
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personal Message (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add a note to include in the invitation email..."
                        rows={3}
                        {...field}
                        disabled={submitting}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional context or instructions for the recipient
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
                  <Mail className="w-4 h-4 mr-2" />
                  {submitting ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
