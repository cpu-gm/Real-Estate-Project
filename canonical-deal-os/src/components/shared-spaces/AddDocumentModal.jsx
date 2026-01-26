/**
 * Add Document Modal - 3 Modes
 *
 * 1. Link Existing: Link to existing LegalMatterDocument
 * 2. Direct Upload: Upload new file
 * 3. External URL: Add link to external document
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Loader2,
  Link as LinkIcon,
  Upload,
  ExternalLink,
  FileText,
  CheckCircle
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

export default function AddDocumentModal({ open, onClose, spaceId, onDocumentAdded }) {
  const [activeTab, setActiveTab] = useState('link');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const form = useForm({
    defaultValues: {
      // Link existing
      documentId: '',
      // Upload (placeholder - full implementation would handle file upload)
      uploadFile: null,
      uploadTitle: '',
      // External URL
      externalUrl: '',
      externalTitle: ''
    }
  });

  const onSubmit = async (data) => {
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      let documentData = {};

      if (activeTab === 'link') {
        if (!data.documentId) {
          setError('Please enter a document ID');
          setSubmitting(false);
          return;
        }
        documentData = {
          documentId: data.documentId
        };
      } else if (activeTab === 'upload') {
        // Placeholder - in real implementation, would upload file first
        setError('File upload not yet implemented. Use External URL for now.');
        setSubmitting(false);
        return;
      } else if (activeTab === 'external') {
        if (!data.externalUrl || !data.externalTitle) {
          setError('Please provide both URL and title');
          setSubmitting(false);
          return;
        }
        documentData = {
          title: data.externalTitle,
          documentUrl: data.externalUrl
        };
      }

      await bff.sharedSpaces.addDocument(spaceId, documentData);

      setSuccess(true);
      form.reset();

      // Wait a moment to show success, then close
      setTimeout(() => {
        setSuccess(false);
        setActiveTab('link');
        onDocumentAdded();
      }, 1000);
    } catch (err) {
      console.error('[AddDocumentModal] Failed to add document:', err);
      setError(err.message || 'Failed to add document');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting && !success) {
      form.reset();
      setError(null);
      setSuccess(false);
      setActiveTab('link');
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Add Document to Space
          </DialogTitle>
          <DialogDescription>
            Choose how to add a document to this shared space.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-green-700 mb-2">
              Document Added!
            </h3>
            <p className="text-sm text-gray-600">
              The document is now available in this shared space.
            </p>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="link" className="flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Link Existing</span>
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">Upload</span>
                  </TabsTrigger>
                  <TabsTrigger value="external" className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" />
                    <span className="hidden sm:inline">External URL</span>
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Link Existing */}
                <TabsContent value="link" className="space-y-4 mt-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                    Link to an existing legal matter document from your document repository.
                  </div>

                  <FormField
                    control={form.control}
                    name="documentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document ID</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter document ID..."
                            {...field}
                            disabled={submitting}
                          />
                        </FormControl>
                        <FormDescription>
                          The ID of an existing legal matter document
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* Tab 2: Upload (Placeholder) */}
                <TabsContent value="upload" className="space-y-4 mt-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                    File upload functionality is coming soon. Please use External URL for now.
                  </div>

                  <FormField
                    control={form.control}
                    name="uploadTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Draft PSA"
                            {...field}
                            disabled={true}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400">
                    <Upload className="w-12 h-12 mx-auto mb-2" />
                    <p>File upload coming soon</p>
                  </div>
                </TabsContent>

                {/* Tab 3: External URL */}
                <TabsContent value="external" className="space-y-4 mt-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                    Add a link to a document hosted elsewhere (Google Drive, Dropbox, etc.)
                  </div>

                  <FormField
                    control={form.control}
                    name="externalTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document Title *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Title Commitment"
                            {...field}
                            disabled={submitting}
                          />
                        </FormControl>
                        <FormDescription>
                          Descriptive name for this document
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="externalUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Document URL *</FormLabel>
                        <FormControl>
                          <Input
                            type="url"
                            placeholder="https://drive.google.com/..."
                            {...field}
                            disabled={submitting}
                          />
                        </FormControl>
                        <FormDescription>
                          Full URL to the document
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>

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
                  {submitting ? 'Adding...' : 'Add Document'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
