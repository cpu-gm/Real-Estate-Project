import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Globe,
  Lock,
  Users,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Calendar,
  Clock
} from 'lucide-react';

const BUYER_TYPES = [
  { id: 'INSTITUTIONAL', label: 'Institutional Investors' },
  { id: 'PRIVATE', label: 'Private Equity' },
  { id: 'REIT', label: 'REITs' },
  { id: 'FAMILY_OFFICE', label: 'Family Offices' },
  { id: '1031_EXCHANGE', label: '1031 Exchange Buyers' },
  { id: 'OWNER_OCCUPANT', label: 'Owner Occupants' }
];

const GEOGRAPHIES = [
  { id: 'LOCAL', label: 'Local/Regional' },
  { id: 'NATIONAL', label: 'National' },
  { id: 'INTERNATIONAL', label: 'International' }
];

/**
 * WizardStepMarketing - Step 3
 *
 * Allows the broker to configure marketing options for the listing:
 * - Visibility (platform users only, invite-only)
 * - Target buyer criteria
 * - Marketing materials (OM, flyers, property website)
 * - Timeline (offer deadline, listing duration, open house dates)
 */
export default function WizardStepMarketing({ dealDraft, formData, onChange }) {
  console.log('[WizardStepMarketing] Rendering', {
    dealDraftId: dealDraft?.id,
    visibility: formData.visibility
  });

  /**
   * Toggle a buyer type selection
   */
  const toggleBuyerType = (typeId) => {
    const current = formData.targetBuyerTypes || [];
    const updated = current.includes(typeId)
      ? current.filter(id => id !== typeId)
      : [...current, typeId];
    onChange({ targetBuyerTypes: updated });
  };

  /**
   * Toggle a geography selection
   */
  const toggleGeography = (geoId) => {
    const current = formData.targetGeographies || [];
    const updated = current.includes(geoId)
      ? current.filter(id => id !== geoId)
      : [...current, geoId];
    onChange({ targetGeographies: updated });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Marketing Configuration</h2>
        <p className="text-slate-500">
          Configure how this property will be marketed to potential buyers.
        </p>
      </div>

      {/* Visibility */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Listing Visibility</Label>
        <RadioGroup
          value={formData.visibility || 'PLATFORM'}
          onValueChange={(value) => onChange({ visibility: value })}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
            <RadioGroupItem value="PLATFORM" id="platform" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="platform" className="font-medium cursor-pointer flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-600" />
                Platform Users
              </Label>
              <p className="text-sm text-slate-500">Visible to all registered users on the platform</p>
            </div>
          </div>
          <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
            <RadioGroupItem value="INVITE_ONLY" id="invite" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="invite" className="font-medium cursor-pointer flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-600" />
                Invite Only
              </Label>
              <p className="text-sm text-slate-500">Only visible to buyers you specifically invite</p>
            </div>
          </div>
        </RadioGroup>
      </div>

      {/* Target Buyer Types */}
      <div className="space-y-3">
        <Label className="text-base font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Target Buyer Types
        </Label>
        <p className="text-sm text-slate-500">Select the types of buyers you want to target</p>
        <div className="grid grid-cols-2 gap-2">
          {BUYER_TYPES.map((type) => (
            <div
              key={type.id}
              className={`flex items-center space-x-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                formData.targetBuyerTypes?.includes(type.id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'hover:bg-slate-50'
              }`}
              onClick={() => toggleBuyerType(type.id)}
            >
              <Checkbox
                checked={formData.targetBuyerTypes?.includes(type.id)}
                onCheckedChange={() => toggleBuyerType(type.id)}
              />
              <Label className="font-normal cursor-pointer text-sm">{type.label}</Label>
            </div>
          ))}
        </div>
      </div>

      {/* Target Investment Range */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Target Investment Size</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="investMin" className="text-sm font-normal">Minimum ($)</Label>
            <Input
              id="investMin"
              type="number"
              placeholder="1000000"
              value={formData.targetInvestmentMin || ''}
              onChange={(e) => onChange({ targetInvestmentMin: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="investMax" className="text-sm font-normal">Maximum ($)</Label>
            <Input
              id="investMax"
              type="number"
              placeholder="50000000"
              value={formData.targetInvestmentMax || ''}
              onChange={(e) => onChange({ targetInvestmentMax: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Target Geographies */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Target Geography</Label>
        <div className="flex gap-2">
          {GEOGRAPHIES.map((geo) => (
            <Badge
              key={geo.id}
              variant={formData.targetGeographies?.includes(geo.id) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggleGeography(geo.id)}
            >
              {geo.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Marketing Materials */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Marketing Materials</Label>
        <div className="space-y-3">
          <div className="flex items-center space-x-3 p-3 border rounded-lg">
            <Checkbox
              id="enableOM"
              checked={formData.enableOM !== false}
              onCheckedChange={(checked) => onChange({ enableOM: checked })}
            />
            <div className="flex-1">
              <Label htmlFor="enableOM" className="font-medium cursor-pointer flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600" />
                Offering Memorandum (OM)
              </Label>
              <p className="text-xs text-slate-500">Generate professional OM document</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 border rounded-lg">
            <Checkbox
              id="enableFlyers"
              checked={formData.enableFlyers}
              onCheckedChange={(checked) => onChange({ enableFlyers: checked })}
            />
            <div className="flex-1">
              <Label htmlFor="enableFlyers" className="font-medium cursor-pointer flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-slate-600" />
                Marketing Flyers
              </Label>
              <p className="text-xs text-slate-500">Create printable property flyers</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 border rounded-lg">
            <Checkbox
              id="enablePropertyWebsite"
              checked={formData.enablePropertyWebsite}
              onCheckedChange={(checked) => onChange({ enablePropertyWebsite: checked })}
            />
            <div className="flex-1">
              <Label htmlFor="enablePropertyWebsite" className="font-medium cursor-pointer flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-slate-600" />
                Property Website
              </Label>
              <p className="text-xs text-slate-500">Create dedicated property landing page</p>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        <Label className="text-base font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Timeline
        </Label>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="offerDeadline" className="text-sm font-normal">Offer Deadline</Label>
            <Input
              id="offerDeadline"
              type="date"
              value={formData.offerDeadline || ''}
              onChange={(e) => onChange({ offerDeadline: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="listingDuration" className="text-sm font-normal">Listing Duration (days)</Label>
            <Input
              id="listingDuration"
              type="number"
              min="1"
              max="365"
              placeholder="90"
              value={formData.listingDuration || ''}
              onChange={(e) => onChange({ listingDuration: parseInt(e.target.value) || '' })}
            />
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="text-sm text-slate-500 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <strong className="text-blue-700">Next:</strong> Review and confirm the listing agreement before going live.
      </div>
    </div>
  );
}
