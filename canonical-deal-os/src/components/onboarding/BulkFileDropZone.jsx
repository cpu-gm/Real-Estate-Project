import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Image,
  File,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FolderOpen
} from 'lucide-react';

// File type detection and icons
const FILE_TYPES = {
  'application/pdf': { icon: FileText, label: 'PDF', color: 'text-red-500' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: FileSpreadsheet, label: 'Excel', color: 'text-green-500' },
  'application/vnd.ms-excel': { icon: FileSpreadsheet, label: 'Excel', color: 'text-green-500' },
  'text/csv': { icon: FileSpreadsheet, label: 'CSV', color: 'text-green-500' },
  'image/jpeg': { icon: Image, label: 'Image', color: 'text-blue-500' },
  'image/png': { icon: Image, label: 'Image', color: 'text-blue-500' },
  'image/webp': { icon: Image, label: 'Image', color: 'text-blue-500' },
  'application/zip': { icon: FolderOpen, label: 'Archive', color: 'text-amber-500' },
  'application/x-zip-compressed': { icon: FolderOpen, label: 'Archive', color: 'text-amber-500' }
};

function getFileTypeInfo(file) {
  const typeInfo = FILE_TYPES[file.type];
  if (typeInfo) return typeInfo;

  // Fallback based on extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['xlsx', 'xls'].includes(ext)) return FILE_TYPES['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  if (ext === 'pdf') return FILE_TYPES['application/pdf'];
  if (ext === 'csv') return FILE_TYPES['text/csv'];
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return FILE_TYPES['image/jpeg'];
  if (ext === 'zip') return FILE_TYPES['application/zip'];

  return { icon: File, label: 'File', color: 'text-slate-500' };
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileItem({ file, onRemove, status = 'pending' }) {
  const typeInfo = getFileTypeInfo(file);
  const IconComponent = typeInfo.icon;

  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg group hover:border-slate-300 transition-colors">
      <div className={cn("p-2 rounded-lg bg-slate-50", typeInfo.color)}>
        <IconComponent className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900 truncate">
            {file.name}
          </span>
          <Badge variant="outline" className="text-xs shrink-0">
            {typeInfo.label}
          </Badge>
        </div>
        <span className="text-xs text-slate-500">
          {formatFileSize(file.size)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {status === 'uploading' && (
          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
        )}
        {status === 'complete' && (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        )}
        {status === 'error' && (
          <AlertTriangle className="w-4 h-4 text-red-500" />
        )}
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100 h-8 w-8 p-0"
          onClick={() => onRemove(file)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function BulkFileDropZone({
  onFilesSelected,
  maxFiles = 100,
  maxTotalSize = 500 * 1024 * 1024, // 500MB default
  acceptedTypes = null, // null means all types
  disabled = false,
  uploadProgress = null, // { current: 5, total: 10, percent: 50 }
  className
}) {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, [disabled]);

  const validateFiles = useCallback((newFiles) => {
    const fileArray = Array.from(newFiles);

    // Check max files
    if (files.length + fileArray.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return null;
    }

    // Check total size
    const currentSize = files.reduce((sum, f) => sum + f.size, 0);
    const newSize = fileArray.reduce((sum, f) => sum + f.size, 0);
    if (currentSize + newSize > maxTotalSize) {
      setError(`Total file size exceeds ${formatFileSize(maxTotalSize)}`);
      return null;
    }

    // Filter accepted types if specified
    if (acceptedTypes) {
      const filtered = fileArray.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return acceptedTypes.includes(f.type) || acceptedTypes.includes(`.${ext}`);
      });
      if (filtered.length < fileArray.length) {
        setError(`Some files were skipped (unsupported type)`);
        return filtered;
      }
    }

    setError(null);
    return fileArray;
  }, [files, maxFiles, maxTotalSize, acceptedTypes]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const validFiles = validateFiles(droppedFiles);
      if (validFiles && validFiles.length > 0) {
        const newFiles = [...files, ...validFiles];
        setFiles(newFiles);
        onFilesSelected?.(newFiles);
      }
    }
  }, [disabled, files, validateFiles, onFilesSelected]);

  const handleFileInput = useCallback((e) => {
    if (disabled) return;

    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const validFiles = validateFiles(selectedFiles);
      if (validFiles && validFiles.length > 0) {
        const newFiles = [...files, ...validFiles];
        setFiles(newFiles);
        onFilesSelected?.(newFiles);
      }
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [disabled, files, validateFiles, onFilesSelected]);

  const removeFile = useCallback((fileToRemove) => {
    const newFiles = files.filter(f => f !== fileToRemove);
    setFiles(newFiles);
    onFilesSelected?.(newFiles);
    setError(null);
  }, [files, onFilesSelected]);

  const clearAll = useCallback(() => {
    setFiles([]);
    onFilesSelected?.([]);
    setError(null);
  }, [onFilesSelected]);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const hasFiles = files.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop Zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-xl transition-all",
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-slate-200 hover:border-slate-300",
          disabled && "opacity-50 pointer-events-none",
          hasFiles ? "p-4" : "p-8"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {!hasFiles ? (
          /* Empty state */
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
              <Upload className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">
              Drop your files here
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Upload spreadsheets, PDFs, images, or zip archives
            </p>
            <div className="flex items-center justify-center gap-3">
              <input
                type="file"
                multiple
                onChange={handleFileInput}
                className="hidden"
                id="bulk-file-upload"
                accept={acceptedTypes?.join(',') || undefined}
                disabled={disabled}
              />
              <label htmlFor="bulk-file-upload">
                <Button variant="default" className="cursor-pointer" asChild>
                  <span>
                    <Upload className="w-4 h-4 mr-2" />
                    Select Files
                  </span>
                </Button>
              </label>
              <input
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFileInput}
                className="hidden"
                id="bulk-folder-upload"
                disabled={disabled}
              />
              <label htmlFor="bulk-folder-upload">
                <Button variant="outline" className="cursor-pointer" asChild>
                  <span>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Select Folder
                  </span>
                </Button>
              </label>
            </div>
            <p className="text-xs text-slate-400 mt-4">
              Up to {maxFiles} files, {formatFileSize(maxTotalSize)} total
            </p>
          </div>
        ) : (
          /* Files list */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected
                </span>
                <Badge variant="secondary" className="text-xs">
                  {formatFileSize(totalSize)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                  id="add-more-files"
                  accept={acceptedTypes?.join(',') || undefined}
                  disabled={disabled}
                />
                <label htmlFor="add-more-files">
                  <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                    <span>Add More</span>
                  </Button>
                </label>
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  Clear All
                </Button>
              </div>
            </div>

            {/* Upload progress */}
            {uploadProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">
                    Processing {uploadProgress.current} of {uploadProgress.total}...
                  </span>
                  <span className="text-slate-500">{uploadProgress.percent}%</span>
                </div>
                <Progress value={uploadProgress.percent} className="h-2" />
              </div>
            )}

            {/* File list - scrollable */}
            <div className="max-h-64 overflow-auto space-y-2 pr-1">
              {files.map((file, index) => (
                <FileItem
                  key={`${file.name}-${index}`}
                  file={file}
                  onRemove={removeFile}
                  status={
                    uploadProgress
                      ? index < uploadProgress.current
                        ? 'complete'
                        : index === uploadProgress.current
                        ? 'uploading'
                        : 'pending'
                      : 'pending'
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Drag overlay hint */}
      {dragActive && (
        <div className="fixed inset-0 bg-blue-500/10 pointer-events-none z-50 flex items-center justify-center">
          <div className="bg-white px-6 py-4 rounded-xl shadow-lg border-2 border-blue-500 text-center">
            <Upload className="w-8 h-8 text-blue-500 mx-auto mb-2" />
            <span className="text-lg font-medium text-blue-700">Drop files to upload</span>
          </div>
        </div>
      )}
    </div>
  );
}
