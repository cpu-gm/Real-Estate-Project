/**
 * Documents List - Manage space documents
 *
 * Features:
 * - List all documents
 * - Three add modes: Link existing legal docs, Direct upload, External URLs
 * - Download documents
 * - Remove documents (owner/collaborator)
 */

import React, { useState } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Plus,
  ExternalLink,
  Link as LinkIcon,
  Upload,
  Calendar,
  User
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
import AddDocumentModal from './AddDocumentModal';

export default function DocumentsList({
  space,
  userRole,
  canAddDocuments,
  onDocumentAdded,
  onDocumentRemoved
}) {
  const [addDocModalOpen, setAddDocModalOpen] = useState(false);
  const [removingDoc, setRemovingDoc] = useState(null);
  const [error, setError] = useState(null);

  const handleRemoveDocument = async (docId) => {
    try {
      await bff.sharedSpaces.removeDocument(space.id, docId);
      setRemovingDoc(null);
      setError(null);
      onDocumentRemoved();
    } catch (err) {
      console.error('[DocumentsList] Failed to remove document:', err);
      setError(err.message || 'Failed to remove document');
    }
  };

  const handleDownload = (doc) => {
    if (doc.documentUrl) {
      // Open in new tab or trigger download
      window.open(doc.documentUrl, '_blank');
    }
  };

  const documents = space.documents || [];

  return (
    <div className="space-y-4">
      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Add document button */}
      {canAddDocuments && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setAddDocModalOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Document
        </Button>
      )}

      {/* Documents list */}
      <div className="space-y-2">
        {documents.map(doc => {
          const isExternal = !doc.documentId;
          const isLinked = !!doc.documentId;

          return (
            <div
              key={doc.id}
              className="p-3 rounded-lg border hover:bg-gray-50 space-y-2"
            >
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">
                      {doc.title}
                    </span>
                    {isExternal && (
                      <Badge variant="outline" className="text-xs">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        External
                      </Badge>
                    )}
                    {isLinked && (
                      <Badge variant="outline" className="text-xs">
                        <LinkIcon className="w-3 h-3 mr-1" />
                        Linked
                      </Badge>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(doc.addedAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      Added by {doc.addedBy}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 flex-shrink-0">
                  {doc.documentUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(doc)}
                      title="Download/View"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  )}
                  {canAddDocuments && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemovingDoc(doc)}
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {documents.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No documents yet</p>
            {canAddDocuments && (
              <p className="text-xs mt-1">Add documents to share with collaborators</p>
            )}
          </div>
        )}
      </div>

      {/* Add Document Modal */}
      <AddDocumentModal
        open={addDocModalOpen}
        onClose={() => setAddDocModalOpen(false)}
        spaceId={space.id}
        onDocumentAdded={() => {
          setAddDocModalOpen(false);
          onDocumentAdded();
        }}
      />

      {/* Remove confirmation dialog */}
      <AlertDialog
        open={!!removingDoc}
        onOpenChange={() => setRemovingDoc(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{removingDoc?.title}</strong>{' '}
              from this space? This will not delete the original document.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removingDoc && handleRemoveDocument(removingDoc.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
