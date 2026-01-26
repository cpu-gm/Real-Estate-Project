import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Briefcase,
  Users,
  Building2,
  DollarSign,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { IntakeChannelHub, BulkFileDropZone } from '@/components/onboarding';
import { bff } from '@/api/bffClient';

// Category configurations
const CATEGORIES = [
  { id: 'deals', label: 'Deals', icon: Briefcase, description: 'Import deal information and documents' },
  { id: 'properties', label: 'Properties', icon: Building2, description: 'Property details and photos' },
  { id: 'contacts', label: 'Contacts', icon: Users, description: 'Brokers, lenders, attorneys' },
  { id: 'financials', label: 'Financials', icon: DollarSign, description: 'Capital calls, distributions' },
  { id: 'documents', label: 'Documents', icon: FileText, description: 'OMs, rent rolls, T12s' },
  { id: 'lp_records', label: 'LP Records', icon: Users, description: 'Investor information' }
];

export default function QuickImport() {
  const navigate = useNavigate();

  // State
  const [selectedCategory, setSelectedCategory] = useState('deals');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  // Handle file selection from IntakeChannelHub
  const handleFilesSelected = (files) => {
    setUploadedFiles(prev => [...prev, ...files]);
    setError(null);
  };

  // Handle file removal
  const handleFileRemove = (fileIndex) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== fileIndex));
  };

  // Clear all files
  const handleClearFiles = () => {
    setUploadedFiles([]);
  };

  // Start processing
  const handleStartProcessing = async () => {
    if (uploadedFiles.length === 0) {
      setError('Please upload at least one file to continue.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Create onboarding session
      const sessionResponse = await bff.onboarding.createSession({
        selectedCategories: [selectedCategory],
        categoryPriorities: [selectedCategory],
        tier: 'SELF_SERVICE'
      });

      const newSessionId = sessionResponse.data.session?.id || sessionResponse.data.id;
      setSessionId(newSessionId);

      // Store session ID for subsequent pages
      localStorage.setItem('onboarding_session_id', newSessionId);

      // Upload files to the session
      // Note: In production, this would be a proper file upload with FormData
      // For now, we're just registering the file metadata
      await bff.onboarding.uploadDocument({
        sessionId: newSessionId,
        files: uploadedFiles.map(f => ({
          fileName: f.name || f.fileName,
          fileSize: f.size || f.fileSize,
          mimeType: f.type || f.mimeType
        }))
      });

      setSuccess(true);

      // Navigate to status page after a short delay
      setTimeout(() => {
        navigate(`/onboarding/status?sessionId=${newSessionId}`);
      }, 1500);

    } catch (err) {
      console.error('Failed to start import:', err);
      setError(err.response?.data?.message || err.message || 'Failed to start import. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md text-center">
          <CardContent className="p-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Import Started!</h2>
            <p className="text-slate-500 mb-4">
              Your files are being processed. You'll be redirected to the status page shortly.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Redirecting...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Quick Import</h1>
            <p className="text-sm text-slate-500">
              Upload files to add new data to your organization
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Category Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">What are you importing?</CardTitle>
            <CardDescription>
              Select the type of data you're uploading
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.id;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isSelected ? 'bg-blue-100' : 'bg-slate-100'
                      }`}>
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                      </div>
                      <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                        {cat.label}
                      </span>
                    </div>
                    <p className={`text-xs ${isSelected ? 'text-blue-600' : 'text-slate-500'}`}>
                      {cat.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* File Upload */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Upload Files</CardTitle>
            <CardDescription>
              Drag and drop files or click to browse
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BulkFileDropZone
              onFilesSelected={handleFilesSelected}
              files={uploadedFiles}
              onFileRemove={handleFileRemove}
              onClearAll={handleClearFiles}
              maxFiles={50}
              maxSizeMB={100}
              acceptedTypes={[
                '.pdf', '.xlsx', '.xls', '.csv',
                '.doc', '.docx', '.txt',
                '.png', '.jpg', '.jpeg',
                '.zip'
              ]}
            />
          </CardContent>
        </Card>

        {/* Upload Summary */}
        {uploadedFiles.length > 0 && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Upload className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-900">
                      {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} ready
                    </p>
                    <p className="text-sm text-blue-600">
                      {(uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0) / (1024 * 1024)).toFixed(1)} MB total
                    </p>
                  </div>
                </div>
                <Badge className="bg-blue-100 text-blue-700 capitalize">
                  {selectedCategory.replace('_', ' ')}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate('/onboarding')}>
            Full Wizard
          </Button>

          <Button
            size="lg"
            onClick={handleStartProcessing}
            disabled={uploadedFiles.length === 0 || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting Import...
              </>
            ) : (
              <>
                Start Processing
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        {/* Help Text */}
        <p className="mt-6 text-center text-sm text-slate-500">
          Your files will be processed by our AI and you'll be notified when they're ready for review.
        </p>
      </div>
    </div>
  );
}
