import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload,
  Mail,
  Link2,
  Cloud,
  CheckCircle2,
  ExternalLink,
  Copy,
  RefreshCw,
  AlertCircle,
  Building2,
  Calendar,
  ChevronRight
} from 'lucide-react';
import BulkFileDropZone from './BulkFileDropZone';

// OAuth provider configurations
const OAUTH_PROVIDERS = [
  {
    id: 'google',
    name: 'Google Workspace',
    description: 'Import from Google Drive & Gmail',
    icon: '/icons/google.svg',
    color: 'bg-red-50 border-red-100',
    iconBg: 'bg-white',
    dataTypes: ['Documents', 'Spreadsheets', 'Emails']
  },
  {
    id: 'microsoft',
    name: 'Microsoft 365',
    description: 'Import from OneDrive & Outlook',
    icon: '/icons/microsoft.svg',
    color: 'bg-blue-50 border-blue-100',
    iconBg: 'bg-white',
    dataTypes: ['Documents', 'Spreadsheets', 'Emails']
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Import contacts & deal pipeline',
    icon: '/icons/salesforce.svg',
    color: 'bg-sky-50 border-sky-100',
    iconBg: 'bg-white',
    dataTypes: ['Contacts', 'Accounts', 'Opportunities']
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Import CRM contacts & companies',
    icon: '/icons/hubspot.svg',
    color: 'bg-orange-50 border-orange-100',
    iconBg: 'bg-white',
    dataTypes: ['Contacts', 'Companies', 'Deals']
  },
  {
    id: 'yardi',
    name: 'Yardi',
    description: 'Import properties & financials',
    icon: '/icons/yardi.svg',
    color: 'bg-emerald-50 border-emerald-100',
    iconBg: 'bg-white',
    dataTypes: ['Properties', 'Tenants', 'Financials']
  },
  {
    id: 'appfolio',
    name: 'AppFolio',
    description: 'Import property management data',
    icon: '/icons/appfolio.svg',
    color: 'bg-violet-50 border-violet-100',
    iconBg: 'bg-white',
    dataTypes: ['Properties', 'Tenants', 'Financials']
  }
];

function OAuthProviderCard({ provider, connected = false, onConnect, onDisconnect, isConnecting }) {
  return (
    <Card className={cn(
      "relative overflow-hidden transition-all hover:shadow-md cursor-pointer",
      connected ? "ring-2 ring-green-500" : "hover:border-slate-300",
      provider.color
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Provider icon - fallback to initial if image fails */}
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", provider.iconBg)}>
            <Cloud className="w-5 h-5 text-slate-600" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-slate-900">{provider.name}</span>
              {connected && (
                <Badge className="bg-green-100 text-green-700 text-xs">
                  Connected
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 mb-2">{provider.description}</p>
            <div className="flex flex-wrap gap-1">
              {provider.dataTypes.map(type => (
                <Badge key={type} variant="outline" className="text-xs">
                  {type}
                </Badge>
              ))}
            </div>
          </div>

          <div className="shrink-0">
            {connected ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDisconnect?.(provider.id);
                }}
                className="text-slate-500 hover:text-red-600"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onConnect?.(provider.id);
                }}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Connect
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {connected && (
          <div className="absolute top-2 right-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmailForwardingPanel({ emailAddress, onCopy, isGenerating }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (emailAddress) {
      navigator.clipboard.writeText(emailAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Email Forwarding
        </CardTitle>
        <CardDescription>
          Forward your existing emails containing deal data to this address
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isGenerating ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Generating your unique email address...
          </div>
        ) : emailAddress ? (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 p-3 bg-slate-50 rounded-lg font-mono text-sm break-all">
                {emailAddress}
              </div>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>How it works:</strong> Forward any emails containing deal documents,
                spreadsheets, or property info. Our AI will automatically extract and organize the data.
              </div>
            </div>
          </>
        ) : (
          <Button variant="outline" className="w-full">
            Generate Email Address
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduledSyncPanel({ connections = [], onConfigureSync }) {
  const hasConnections = connections.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Scheduled Sync
        </CardTitle>
        <CardDescription>
          Automatically sync new data from connected accounts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasConnections ? (
          <div className="space-y-3">
            {connections.map(conn => (
              <div
                key={conn.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium">{conn.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {conn.syncInterval || 'Daily'}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => onConfigureSync?.(conn.id)}>
                    Configure
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-sm text-slate-500">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p>Connect an account above to enable scheduled syncing</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function IntakeChannelHub({
  onFilesSelected,
  onOAuthConnect,
  onOAuthDisconnect,
  connectedProviders = [],
  emailAddress = null,
  onEmailCopy,
  isGeneratingEmail = false,
  connectingProvider = null,
  onConfigureSync,
  className
}) {
  const [activeTab, setActiveTab] = useState('upload');

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Import Your Data
        </h2>
        <p className="text-slate-500">
          Choose how you want to import your existing data. You can use multiple methods.
        </p>
      </div>

      {/* Tabs for equal prominence */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="w-4 h-4" />
            Upload Files
          </TabsTrigger>
          <TabsTrigger value="connect" className="gap-2">
            <Link2 className="w-4 h-4" />
            Connect Accounts
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="w-4 h-4" />
            Email Forward
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Scheduled Sync
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="mt-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload Files</CardTitle>
              <CardDescription>
                Drag and drop your files, folders, or zip archives
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BulkFileDropZone
                onFilesSelected={onFilesSelected}
                maxFiles={100}
                maxTotalSize={500 * 1024 * 1024}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connect Accounts Tab */}
        <TabsContent value="connect" className="mt-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {OAUTH_PROVIDERS.map(provider => (
                <OAuthProviderCard
                  key={provider.id}
                  provider={provider}
                  connected={connectedProviders.includes(provider.id)}
                  onConnect={onOAuthConnect}
                  onDisconnect={onOAuthDisconnect}
                  isConnecting={connectingProvider === provider.id}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Email Forwarding Tab */}
        <TabsContent value="email" className="mt-6">
          <EmailForwardingPanel
            emailAddress={emailAddress}
            onCopy={onEmailCopy}
            isGenerating={isGeneratingEmail}
          />
        </TabsContent>

        {/* Scheduled Sync Tab */}
        <TabsContent value="sync" className="mt-6">
          <ScheduledSyncPanel
            connections={connectedProviders.map(id => {
              const provider = OAUTH_PROVIDERS.find(p => p.id === id);
              return { id, name: provider?.name || id, syncInterval: 'Daily' };
            })}
            onConfigureSync={onConfigureSync}
          />
        </TabsContent>
      </Tabs>

      {/* Summary of what's been added */}
      {(connectedProviders.length > 0 || emailAddress) && (
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium text-slate-700">Active sources:</span>
              <div className="flex items-center gap-2 flex-wrap">
                {connectedProviders.map(id => {
                  const provider = OAUTH_PROVIDERS.find(p => p.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      {provider?.name || id}
                    </Badge>
                  );
                })}
                {emailAddress && (
                  <Badge variant="secondary" className="gap-1">
                    <Mail className="w-3 h-3 text-blue-500" />
                    Email forwarding
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
