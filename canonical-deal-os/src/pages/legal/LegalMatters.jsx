/**
 * Legal Matters List Page
 *
 * List all legal matters with filters and search
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Plus, Search, Filter } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

export default function LegalMatters() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Briefcase className="h-8 w-8" />
          Legal Matters
        </h1>
        <Button onClick={() => navigate('/CreateLegalMatter')}>
          <Plus className="h-4 w-4 mr-2" />
          New Matter
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search matters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
      </div>

      {/* Placeholder - Empty State */}
      <Card>
        <CardContent className="p-12 text-center">
          <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-lg text-gray-500 mb-2">No legal matters yet</p>
          <p className="text-sm text-gray-400 mb-4">
            Legal matters will appear here once created
          </p>
          <Button onClick={() => navigate('/CreateLegalMatter')}>
            <Plus className="h-4 w-4 mr-2" />
            Create First Matter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
