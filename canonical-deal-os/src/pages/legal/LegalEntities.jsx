/**
 * Legal Entities Database
 *
 * Entity management with org charts and ownership structures
 */

import React, { useState } from 'react';
import { Building2, Plus, Search } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';

export default function LegalEntities() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Building2 className="h-8 w-8" />
          Entity Database
        </h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Entity
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search entities..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Placeholder - Empty State */}
      <Card>
        <CardContent className="p-12 text-center">
          <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-lg text-gray-500 mb-2">No entities yet</p>
          <p className="text-sm text-gray-400 mb-4">
            Track LLCs, LPs, corporations, and ownership structures
          </p>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add First Entity
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
