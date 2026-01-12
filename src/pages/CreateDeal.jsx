import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { 
  Building2, 
  Sparkles, 
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function CreateDealPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('ai');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [parsedDeal, setParsedDeal] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    asset_type: '',
    asset_address: '',
    asset_city: '',
    asset_state: '',
    purchase_price: '',
    noi: '',
    gp_name: '',
    lender_name: '',
    deal_summary: ''
  });

  const handleAIParse = async () => {
    if (!aiInput.trim()) return;
    
    setIsProcessing(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Parse this real estate deal information and extract structured data. Return ONLY the JSON object, no other text.

Deal Information:
${aiInput}

Extract these fields (use null for unknown):
- name: Deal name/title
- asset_type: One of [Multifamily, Office, Industrial, Retail, Mixed-Use, Hospitality, Healthcare]
- asset_address: Street address
- asset_city: City
- asset_state: State abbreviation
- square_footage: Number
- unit_count: Number (for multifamily)
- year_built: Number
- purchase_price: Number (in dollars)
- noi: Net Operating Income (number)
- cap_rate: Number (as decimal, e.g., 0.05 for 5%)
- senior_debt: Number
- mezzanine_debt: Number
- preferred_equity: Number
- common_equity: Number
- gp_name: General Partner name
- lender_name: Lender name
- deal_summary: Brief summary`,
        response_json_schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            asset_type: { type: "string" },
            asset_address: { type: "string" },
            asset_city: { type: "string" },
            asset_state: { type: "string" },
            square_footage: { type: "number" },
            unit_count: { type: "number" },
            year_built: { type: "number" },
            purchase_price: { type: "number" },
            noi: { type: "number" },
            cap_rate: { type: "number" },
            senior_debt: { type: "number" },
            mezzanine_debt: { type: "number" },
            preferred_equity: { type: "number" },
            common_equity: { type: "number" },
            gp_name: { type: "string" },
            lender_name: { type: "string" },
            deal_summary: { type: "string" }
          }
        }
      });
      
      setParsedDeal(result);
    } catch (error) {
      console.error('Error parsing deal:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateFromAI = async () => {
    if (!parsedDeal) return;
    
    setIsProcessing(true);
    try {
      // Calculate LTV and DSCR if possible
      let ltv = null;
      let dscr = null;
      
      const totalDebt = (parsedDeal.senior_debt || 0) + (parsedDeal.mezzanine_debt || 0);
      if (parsedDeal.purchase_price && totalDebt) {
        ltv = totalDebt / parsedDeal.purchase_price;
      }
      
      // Assuming 6% debt service rate for DSCR calculation
      if (parsedDeal.noi && totalDebt) {
        const annualDebtService = totalDebt * 0.06;
        dscr = parsedDeal.noi / annualDebtService;
      }

      const deal = await base44.entities.Deal.create({
        ...parsedDeal,
        ltv,
        dscr,
        lifecycle_state: 'Draft',
        ai_derived: true,
        verification_status: 'pending_verification',
        truth_health: 'warning',
        next_action: 'Verify AI-derived data'
      });

      // Create initial event
      await base44.entities.DealEvent.create({
        deal_id: deal.id,
        event_type: 'ai_derivation',
        event_title: 'Deal created via AI parsing',
        event_description: 'Initial deal data extracted from unstructured input using AI. All fields pending verification.',
        authority_role: 'System',
        authority_name: 'Canonical Deal OS',
        evidence_type: 'ai_derived',
        timestamp: new Date().toISOString()
      });

      navigate(createPageUrl(`DealOverview?id=${deal.id}`));
    } catch (error) {
      console.error('Error creating deal:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateManual = async () => {
    setIsProcessing(true);
    try {
      const deal = await base44.entities.Deal.create({
        ...formData,
        purchase_price: formData.purchase_price ? Number(formData.purchase_price) : null,
        noi: formData.noi ? Number(formData.noi) : null,
        lifecycle_state: 'Draft',
        ai_derived: false,
        verification_status: 'pending_verification',
        truth_health: 'healthy',
        next_action: 'Complete deal information'
      });

      await base44.entities.DealEvent.create({
        deal_id: deal.id,
        event_type: 'lifecycle_transition',
        event_title: 'Deal created',
        event_description: 'Deal manually created and entered Draft state.',
        authority_role: 'GP',
        evidence_type: 'human_attested',
        timestamp: new Date().toISOString()
      });

      navigate(createPageUrl(`DealOverview?id=${deal.id}`));
    } catch (error) {
      console.error('Error creating deal:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#171717] tracking-tight">Create Deal</h1>
        <p className="text-sm text-[#737373] mt-1">AI-assisted or manual deal intake</p>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full border-b border-[#E5E5E5] rounded-none bg-[#FAFAFA] p-0 h-auto">
            <TabsTrigger 
              value="ai" 
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-[#0A0A0A] data-[state=active]:bg-white py-4 px-6"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              AI-Assisted Intake
            </TabsTrigger>
            <TabsTrigger 
              value="manual"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-[#0A0A0A] data-[state=active]:bg-white py-4 px-6"
            >
              <FileText className="w-4 h-4 mr-2" />
              Manual Entry
            </TabsTrigger>
          </TabsList>

          {/* AI Tab */}
          <TabsContent value="ai" className="p-6 m-0">
            <div className="space-y-6">
              {/* AI Input */}
              <div>
                <Label className="text-sm font-medium text-[#171717]">
                  Paste deal memo or describe the deal
                </Label>
                <Textarea 
                  placeholder="Paste your deal memo, term sheet, or describe the deal in plain text..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  className="mt-2 min-h-[200px] border-[#E5E5E5] focus:border-[#171717] focus:ring-0"
                />
                <p className="text-xs text-[#A3A3A3] mt-2">
                  The AI will extract structured data from your input. All AI-derived fields require verification.
                </p>
              </div>

              <Button 
                onClick={handleAIParse}
                disabled={!aiInput.trim() || isProcessing}
                className="bg-[#0A0A0A] hover:bg-[#171717]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Parse with AI
                  </>
                )}
              </Button>

              {/* Parsed Result */}
              {parsedDeal && (
                <div className="border border-[#E5E5E5] rounded-xl p-6 bg-[#FAFAFA]">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="px-2 py-1 bg-violet-50 rounded text-xs font-medium text-violet-700 flex items-center gap-1">
                      🤖 AI-Derived
                    </div>
                    <div className="px-2 py-1 bg-amber-50 rounded text-xs font-medium text-amber-700 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Pending verification
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {parsedDeal.name && (
                      <div className="col-span-2">
                        <span className="text-[10px] text-[#A3A3A3] uppercase tracking-wider">Deal Name</span>
                        <p className="text-sm font-medium text-[#171717]">{parsedDeal.name}</p>
                      </div>
                    )}
                    {parsedDeal.asset_type && (
                      <div>
                        <span className="text-[10px] text-[#A3A3A3] uppercase tracking-wider">Asset Type</span>
                        <p className="text-sm font-medium text-[#171717]">{parsedDeal.asset_type}</p>
                      </div>
                    )}
                    {parsedDeal.purchase_price && (
                      <div>
                        <span className="text-[10px] text-[#A3A3A3] uppercase tracking-wider">Purchase Price</span>
                        <p className="text-sm font-medium text-[#171717]">${(parsedDeal.purchase_price / 1000000).toFixed(2)}M</p>
                      </div>
                    )}
                    {parsedDeal.noi && (
                      <div>
                        <span className="text-[10px] text-[#A3A3A3] uppercase tracking-wider">NOI</span>
                        <p className="text-sm font-medium text-[#171717]">${(parsedDeal.noi / 1000).toFixed(0)}K</p>
                      </div>
                    )}
                    {parsedDeal.cap_rate && (
                      <div>
                        <span className="text-[10px] text-[#A3A3A3] uppercase tracking-wider">Cap Rate</span>
                        <p className="text-sm font-medium text-[#171717]">{(parsedDeal.cap_rate * 100).toFixed(2)}%</p>
                      </div>
                    )}
                    {parsedDeal.asset_address && (
                      <div className="col-span-2">
                        <span className="text-[10px] text-[#A3A3A3] uppercase tracking-wider">Address</span>
                        <p className="text-sm font-medium text-[#171717]">
                          {parsedDeal.asset_address}, {parsedDeal.asset_city}, {parsedDeal.asset_state}
                        </p>
                      </div>
                    )}
                    {parsedDeal.deal_summary && (
                      <div className="col-span-2">
                        <span className="text-[10px] text-[#A3A3A3] uppercase tracking-wider">Summary</span>
                        <p className="text-sm text-[#737373]">{parsedDeal.deal_summary}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#E5E5E5] flex justify-end">
                    <Button 
                      onClick={handleCreateFromAI}
                      disabled={isProcessing}
                      className="bg-[#0A0A0A] hover:bg-[#171717]"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <ArrowRight className="w-4 h-4 mr-2" />
                      )}
                      Create Deal
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Manual Tab */}
          <TabsContent value="manual" className="p-6 m-0">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-sm font-medium text-[#171717]">Deal Name *</Label>
                  <Input 
                    placeholder="e.g., 123 Main Street Acquisition"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="mt-1.5 border-[#E5E5E5] focus:border-[#171717] focus:ring-0"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium text-[#171717]">Asset Type</Label>
                  <Select value={formData.asset_type} onValueChange={(v) => setFormData({...formData, asset_type: v})}>
                    <SelectTrigger className="mt-1.5 border-[#E5E5E5]">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Multifamily">Multifamily</SelectItem>
                      <SelectItem value="Office">Office</SelectItem>
                      <SelectItem value="Industrial">Industrial</SelectItem>
                      <SelectItem value="Retail">Retail</SelectItem>
                      <SelectItem value="Mixed-Use">Mixed-Use</SelectItem>
                      <SelectItem value="Hospitality">Hospitality</SelectItem>
                      <SelectItem value="Healthcare">Healthcare</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium text-[#171717]">Purchase Price</Label>
                  <Input 
                    type="number"
                    placeholder="e.g., 25000000"
                    value={formData.purchase_price}
                    onChange={(e) => setFormData({...formData, purchase_price: e.target.value})}
                    className="mt-1.5 border-[#E5E5E5] focus:border-[#171717] focus:ring-0"
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-sm font-medium text-[#171717]">Address</Label>
                  <Input 
                    placeholder="Street address"
                    value={formData.asset_address}
                    onChange={(e) => setFormData({...formData, asset_address: e.target.value})}
                    className="mt-1.5 border-[#E5E5E5] focus:border-[#171717] focus:ring-0"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium text-[#171717]">City</Label>
                  <Input 
                    value={formData.asset_city}
                    onChange={(e) => setFormData({...formData, asset_city: e.target.value})}
                    className="mt-1.5 border-[#E5E5E5] focus:border-[#171717] focus:ring-0"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium text-[#171717]">State</Label>
                  <Input 
                    placeholder="e.g., CA"
                    value={formData.asset_state}
                    onChange={(e) => setFormData({...formData, asset_state: e.target.value})}
                    className="mt-1.5 border-[#E5E5E5] focus:border-[#171717] focus:ring-0"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium text-[#171717]">NOI</Label>
                  <Input 
                    type="number"
                    placeholder="Net Operating Income"
                    value={formData.noi}
                    onChange={(e) => setFormData({...formData, noi: e.target.value})}
                    className="mt-1.5 border-[#E5E5E5] focus:border-[#171717] focus:ring-0"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium text-[#171717]">GP Name</Label>
                  <Input 
                    placeholder="General Partner"
                    value={formData.gp_name}
                    onChange={(e) => setFormData({...formData, gp_name: e.target.value})}
                    className="mt-1.5 border-[#E5E5E5] focus:border-[#171717] focus:ring-0"
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-sm font-medium text-[#171717]">Deal Summary</Label>
                  <Textarea 
                    placeholder="Brief description of the deal..."
                    value={formData.deal_summary}
                    onChange={(e) => setFormData({...formData, deal_summary: e.target.value})}
                    className="mt-1.5 min-h-[100px] border-[#E5E5E5] focus:border-[#171717] focus:ring-0"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-[#E5E5E5]">
                <Button 
                  onClick={handleCreateManual}
                  disabled={!formData.name || isProcessing}
                  className="bg-[#0A0A0A] hover:bg-[#171717]"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Create Deal
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}