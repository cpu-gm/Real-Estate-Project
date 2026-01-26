import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Briefcase, Search, Filter, Download } from 'lucide-react';

export default function LenderPortfolio() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Loan Portfolio</h1>
          <p className="text-muted-foreground">Manage your active and closed loans</p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Loans</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Currently performing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Exposure</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0</div>
            <p className="text-xs text-muted-foreground">Outstanding principal</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. LTV</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0%</div>
            <p className="text-xs text-muted-foreground">Portfolio weighted</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Portfolio Overview</CardTitle>
              <CardDescription>View and manage your loan portfolio</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search loans..."
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
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
              <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="space-y-4">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No active loans</h3>
                <p className="text-sm text-muted-foreground">
                  Your active loans will appear here
                </p>
              </div>
            </TabsContent>
            <TabsContent value="closed" className="space-y-4">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No closed loans</h3>
                <p className="text-sm text-muted-foreground">
                  Your closed loans will appear here
                </p>
              </div>
            </TabsContent>
            <TabsContent value="watchlist" className="space-y-4">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No loans on watchlist</h3>
                <p className="text-sm text-muted-foreground">
                  Loans requiring attention will appear here
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
