import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  MapPin,
  Calendar,
  Ruler,
  Layers,
  Trees,
  Wrench
} from 'lucide-react';

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;

  return (
    <div className="flex items-start py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2 w-40 flex-shrink-0">
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

function UnitMixTable({ unitMix }) {
  if (!unitMix || unitMix.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-slate-700 mb-2">Unit Mix</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 text-slate-500 font-medium">Type</th>
              <th className="text-right py-2 px-2 text-slate-500 font-medium">Units</th>
              <th className="text-right py-2 px-2 text-slate-500 font-medium">Avg SF</th>
              <th className="text-right py-2 px-2 text-slate-500 font-medium">Rent</th>
            </tr>
          </thead>
          <tbody>
            {unitMix.map((unit, index) => (
              <tr key={index} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-2 text-slate-900">{unit.type}</td>
                <td className="py-2 px-2 text-right text-slate-900">{unit.count}</td>
                <td className="py-2 px-2 text-right text-slate-600">{unit.avgSF?.toLocaleString()}</td>
                <td className="py-2 px-2 text-right text-slate-900">
                  ${(unit.currentRent || unit.marketRent)?.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AmenitiesList({ amenities }) {
  if (!amenities || amenities.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-slate-700 mb-2">Amenities</h4>
      <div className="flex flex-wrap gap-2">
        {amenities.map((amenity, index) => (
          <Badge key={index} variant="outline" className="text-slate-600">
            {amenity}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function RecentCapEx({ capExItems }) {
  if (!capExItems || capExItems.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-slate-700 mb-2">Recent Improvements</h4>
      <div className="space-y-2">
        {capExItems.map((item, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Wrench className="h-3 w-3 text-slate-400" />
              <span className="text-slate-700">{item.item}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-500">{item.year}</span>
              <span className="font-medium text-slate-900">${item.cost?.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PropertyInfo({
  address,
  city,
  state,
  zipCode,
  county,
  yearBuilt,
  stories,
  totalSF,
  lotSize,
  assetType,
  assetClass,
  unitMix,
  amenities,
  recentCapEx
}) {
  const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Property Details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <InfoRow icon={MapPin} label="Address" value={fullAddress} />
          <InfoRow icon={MapPin} label="County" value={county} />
          <InfoRow icon={Building2} label="Asset Type" value={assetType} />
          <InfoRow icon={Building2} label="Class" value={assetClass ? `Class ${assetClass}` : null} />
          <InfoRow icon={Calendar} label="Year Built" value={yearBuilt} />
          <InfoRow icon={Layers} label="Stories" value={stories} />
          <InfoRow icon={Ruler} label="Total SF" value={totalSF ? `${totalSF.toLocaleString()} SF` : null} />
          <InfoRow icon={Trees} label="Lot Size" value={lotSize ? `${lotSize} Acres` : null} />
        </div>

        <UnitMixTable unitMix={unitMix} />
        <AmenitiesList amenities={amenities} />
        <RecentCapEx capExItems={recentCapEx} />
      </CardContent>
    </Card>
  );
}
