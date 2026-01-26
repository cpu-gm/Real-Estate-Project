import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  Link2,
  Mail,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
  CheckCircle2,
  Clock,
  FileText,
  Users,
  Building2,
  DollarSign,
  Briefcase
} from 'lucide-react';
// Data categories we can import
const IMPORTABLE_CATEGORIES = [
  { icon: Briefcase, label: 'Deals', description: 'Active and historical deals' },
  { icon: Building2, label: 'Properties', description: 'Property details and documents' },
  { icon: Users, label: 'Contacts', description: 'Brokers, lenders, attorneys' },
  { icon: DollarSign, label: 'Financials', description: 'Capital calls, distributions' },
  { icon: FileText, label: 'Documents', description: 'OMs, rent rolls, financials' },
  { icon: Users, label: 'LP Records', description: 'Investor information' }
];

// Intake methods
const INTAKE_METHODS = [
  {
    icon: Upload,
    title: 'Upload Files',
    description: 'Drag & drop spreadsheets, PDFs, images, or archives',
    color: 'bg-blue-500'
  },
  {
    icon: Link2,
    title: 'Connect Accounts',
    description: 'Google, Microsoft, Salesforce, HubSpot, Yardi',
    color: 'bg-green-500'
  },
  {
    icon: Mail,
    title: 'Email Forward',
    description: 'Forward existing emails with deal data',
    color: 'bg-purple-500'
  },
  {
    icon: RefreshCw,
    title: 'Scheduled Sync',
    description: 'Auto-sync new data from connected accounts',
    color: 'bg-orange-500'
  }
];

// Value propositions
const VALUE_PROPS = [
  {
    icon: Zap,
    title: 'AI-Powered Extraction',
    description: 'Our AI understands CRE data and extracts it accurately'
  },
  {
    icon: Sparkles,
    title: 'Smart Data Linking',
    description: 'Automatically discovers connections between your data'
  },
  {
    icon: Shield,
    title: 'Full Provenance',
    description: 'See exactly where every piece of data came from'
  }
];

export default function OrgOnboarding() {
  const navigate = useNavigate();

  const handleStartImport = () => {
    navigate('/onboarding/wizard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-blue-100 text-blue-700 hover:bg-blue-100">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Powered Import
          </Badge>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Import Your Existing Data
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Upload everything you have - spreadsheets, documents, emails.
            Our AI will organize it all and get you started in minutes.
          </p>
        </div>

        {/* Intake Methods Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {INTAKE_METHODS.map((method, index) => (
            <Card key={index} className="text-center hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className={`w-12 h-12 rounded-full ${method.color} flex items-center justify-center mx-auto mb-4`}>
                  <method.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{method.title}</h3>
                <p className="text-sm text-slate-500">{method.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* What We Import */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle>What We Can Import</CardTitle>
            <CardDescription>
              We'll extract and organize all your CRE data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {IMPORTABLE_CATEGORIES.map((category, index) => (
                <div
                  key={index}
                  className="flex flex-col items-center p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <category.icon className="w-8 h-8 text-slate-600 mb-2" />
                  <span className="font-medium text-slate-900 text-sm">{category.label}</span>
                  <span className="text-xs text-slate-500 text-center">{category.description}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* How It Works */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: 1, title: 'Upload Everything', description: 'Drop all your files or connect your accounts' },
              { step: 2, title: 'AI Processes', description: 'Our AI extracts and organizes your data' },
              { step: 3, title: 'Review & Verify', description: 'Check the results with full source visibility' },
              { step: 4, title: 'Go Live', description: 'Approve and start using your data' }
            ].map((item, index) => (
              <div key={index} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold mb-3">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-slate-500">{item.description}</p>
                </div>
                {index < 3 && (
                  <div className="hidden md:block absolute top-5 left-[60%] w-[80%] h-0.5 bg-slate-200" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Value Props */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {VALUE_PROPS.map((prop, index) => (
            <div key={index} className="flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <prop.icon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">{prop.title}</h3>
                <p className="text-sm text-slate-500">{prop.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <Card className="bg-slate-900 text-white border-0">
          <CardContent className="p-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Ready to get started?</h2>
                <p className="text-slate-300">
                  Import your data now and see the results in minutes.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden md:block">
                  <div className="flex items-center gap-1 text-sm text-slate-300">
                    <Clock className="w-4 h-4" />
                    Estimated time based on data size
                  </div>
                </div>
                <Button
                  size="lg"
                  className="bg-white text-slate-900 hover:bg-slate-100"
                  onClick={handleStartImport}
                >
                  Start Import
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trust indicators */}
        <div className="flex items-center justify-center gap-8 mt-8 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Secure & encrypted
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Full audit trail
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Enterprise ready
          </div>
        </div>
      </div>
    </div>
  );
}
