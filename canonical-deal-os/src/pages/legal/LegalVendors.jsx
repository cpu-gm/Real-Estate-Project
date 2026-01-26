/**
 * Legal Vendors (Outside Counsel) Directory
 *
 * Vendor CRM for managing outside counsel and other legal vendors
 */

import React, { useState } from 'react';
import { Users, Plus, Search } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';

export default function LegalVendors() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Users className="h-8 w-8" />
          Legal Vendors
        </h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search vendors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Placeholder - Empty State */}
      <Card>
        <CardContent className="p-12 text-center">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-lg text-gray-500 mb-2">No vendors yet</p>
          <p className="text-sm text-gray-400 mb-4">
            Add outside counsel, title companies, and other legal vendors
          </p>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add First Vendor
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
