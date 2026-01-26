/**
 * Legal Documents Review Queue
 *
 * Document review and analysis queue for GP Counsel
 */

import React, { useState } from 'react';
import { FileInput, Upload, Search } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';

export default function LegalDocuments() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <FileInput className="h-8 w-8" />
          Document Review Queue
        </h1>
        <Button>
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search documents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Placeholder - Empty State */}
      <Card>
        <CardContent className="p-12 text-center">
          <FileInput className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-lg text-gray-500 mb-2">No documents in review queue</p>
          <p className="text-sm text-gray-400 mb-4">
            Upload documents for AI-powered analysis and review
          </p>
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            Upload First Document
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
