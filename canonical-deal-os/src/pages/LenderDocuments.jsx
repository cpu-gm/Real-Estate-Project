import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileInput, Search, Filter, Upload } from 'lucide-react';

export default function LenderDocuments() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Documents</h1>
          <p className="text-muted-foreground">Manage loan documents and agreements</p>
        </div>
        <Button>
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Document Library</CardTitle>
              <CardDescription>Access and manage your loan documents</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search documents..."
                  className="pl-8 w-[250px]"
                />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">Pending Signature</TabsTrigger>
              <TabsTrigger value="executed">Executed</TabsTrigger>
              <TabsTrigger value="all">All Documents</TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="space-y-4">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileInput className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No documents pending signature</h3>
                <p className="text-sm text-muted-foreground">
                  Documents requiring your signature will appear here
                </p>
              </div>
            </TabsContent>
            <TabsContent value="executed" className="space-y-4">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileInput className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No executed documents</h3>
                <p className="text-sm text-muted-foreground">
                  Fully executed documents will appear here
                </p>
              </div>
            </TabsContent>
            <TabsContent value="all" className="space-y-4">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileInput className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
                <p className="text-sm text-muted-foreground">
                  All your loan documents will appear here
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
