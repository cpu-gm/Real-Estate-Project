import React, { useState, useCallback } from 'react';
import { Upload, File, X, Loader2, FileText, FileType } from 'lucide-react';

const ALLOWED_TYPES = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/plain': 'TXT'
};

const DOCUMENT_TYPES = [
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'LEASE', label: 'Lease Agreement' },
  { value: 'PSA', label: 'Purchase & Sale Agreement' },
  { value: 'LOI', label: 'Letter of Intent' },
  { value: 'AMENDMENT', label: 'Amendment' },
  { value: 'SIDE_LETTER', label: 'Side Letter' },
  { value: 'OPERATING_AGREEMENT', label: 'Operating Agreement' },
  { value: 'TITLE_DOCUMENT', label: 'Title Document' },
  { value: 'INSURANCE', label: 'Insurance Document' },
  { value: 'ENVIRONMENTAL', label: 'Environmental Report' },
  { value: 'SURVEY', label: 'Survey' },
  { value: 'OTHER', label: 'Other' }
];

export default function DocumentUploader({ onUpload, isUploading = false, matterId }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentType, setDocumentType] = useState('CONTRACT');
  const [error, setError] = useState(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const validateFile = (file) => {
    if (!ALLOWED_TYPES[file.type]) {
      return `Invalid file type. Allowed: ${Object.values(ALLOWED_TYPES).join(', ')}`;
    }
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      return 'File size exceeds 50MB limit';
    }
    return null;
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setSelectedFile(file);
    }
  }, []);

  const handleFileSelect = (e) => {
    setError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !matterId) return;

    try {
      // Convert file to base64 for upload
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Content = reader.result.split(',')[1];
        await onUpload({
          filename: selectedFile.name,
          mimeType: selectedFile.type,
          sizeBytes: selectedFile.size,
          documentType,
          content: base64Content
        });
        setSelectedFile(null);
        setDocumentType('CONTRACT');
      };
      reader.readAsDataURL(selectedFile);
    } catch (err) {
      setError(err.message || 'Upload failed');
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-6 transition-colors
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${error ? 'border-red-300 bg-red-50' : ''}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          className="hidden"
          accept=".pdf,.docx,.txt"
          onChange={handleFileSelect}
          disabled={isUploading}
        />

        {!selectedFile ? (
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center cursor-pointer"
          >
            <Upload className={`w-10 h-10 ${dragActive ? 'text-blue-500' : 'text-gray-400'}`} />
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
            </p>
            <p className="mt-1 text-xs text-gray-500">
              PDF, DOCX, or TXT (max 50MB)
            </p>
          </label>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-xs text-gray-500">
                  {ALLOWED_TYPES[selectedFile.type]} · {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <button
              onClick={clearSelection}
              className="p-1 text-gray-400 hover:text-gray-600"
              disabled={isUploading}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 rounded-md">
          {error}
        </div>
      )}

      {/* Document Type Selector & Upload Button */}
      {selectedFile && (
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <label htmlFor="document-type" className="block text-sm font-medium text-gray-700 mb-1">
              Document Type
            </label>
            <select
              id="document-type"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              disabled={isUploading}
            >
              {DOCUMENT_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Upload</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
