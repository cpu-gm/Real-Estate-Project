/**
 * Create Space Modal - Create new shared space
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Loader2 } from 'lucide-react';
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
import { Textarea } from '../ui/textarea';

export default function CreateSpaceModal({ open, onClose, onSpaceCreated }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      expiresAt: ''
    }
  });

  const onSubmit = async (data) => {
    setSubmitting(true);
    setError(null);

    try {
      const spaceData = {
        name: data.name,
        description: data.description || null,
        expiresAt: data.expiresAt || null
      };

      const result = await bff.sharedSpaces.create(spaceData);

      form.reset();
      onSpaceCreated(result.space);
    } catch (err) {
      console.error('[CreateSpaceModal] Failed to create space:', err);
      setError(err.message || 'Failed to create shared space');
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
          <DialogTitle>Create Shared Space</DialogTitle>
          <DialogDescription>
            Create a secure workspace to collaborate with external counsel, lenders, and other parties.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              rules={{
                required: 'Space name is required',
                minLength: { value: 3, message: 'Name must be at least 3 characters' },
                maxLength: { value: 100, message: 'Name must be less than 100 characters' }
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Space Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Oak Tower PSA Review"
                      {...field}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    A descriptive name for this collaboration workspace
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this space's purpose..."
                      rows={3}
                      {...field}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional details about what this space is for
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Expiration Date */}
            <FormField
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiration Date (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      disabled={submitting}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </FormControl>
                  <FormDescription>
                    When this space should automatically become inactive
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
                {submitting ? 'Creating...' : 'Create Space'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
