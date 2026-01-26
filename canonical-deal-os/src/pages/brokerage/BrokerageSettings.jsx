import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import {
  Briefcase,
  Users,
  Building2,
  Mail,
  UserPlus,
  Shield,
  Loader2
} from 'lucide-react';

export default function BrokerageSettings() {
  const { authToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

  // Fetch brokerage info if user has a brokerageId
  const { data: brokerageData, isLoading: loadingBrokerage } = useQuery({
    queryKey: ['brokerage', user?.brokerageId],
    queryFn: async () => {
      if (!user?.brokerageId) return null;
      const res = await fetch(`/api/brokerages/${user.brokerageId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('Failed to fetch brokerage');
      return res.json();
    },
    enabled: !!authToken && !!user?.brokerageId
  });

  // Fetch available brokerages to join
  const { data: availableBrokerages, isLoading: loadingAvailable } = useQuery({
    queryKey: ['brokerages'],
    queryFn: async () => {
      const res = await fetch('/api/brokerages', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('Failed to fetch brokerages');
      return res.json();
    },
    enabled: !!authToken && !user?.brokerageId
  });

  // Invite broker mutation
  const inviteMutation = useMutation({
    mutationFn: async ({ email, name }) => {
      const res = await fetch(`/api/brokerages/${user.brokerageId}/invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, name })
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to send invitation');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Invitation sent', description: 'The broker will receive an email invitation' });
      setInviteDialogOpen(false);
      setInviteEmail('');
      setInviteName('');
      queryClient.invalidateQueries(['brokerage', user?.brokerageId]);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  // Join brokerage mutation
  const joinMutation = useMutation({
    mutationFn: async (brokerageId) => {
      const res = await fetch(`/api/brokerages/${brokerageId}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to join brokerage');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Joined brokerage', description: 'You are now a member of this firm' });
      // Reload page to update user context
      window.location.reload();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  // Create brokerage mutation
  const createMutation = useMutation({
    mutationFn: async ({ name, domain }) => {
      const res = await fetch('/api/brokerages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, domain })
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create brokerage');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Brokerage created', description: 'Your firm has been set up' });
      window.location.reload();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const brokerage = brokerageData?.brokerage;
  const isBrokerageAdmin = user?.role === 'Brokerage Admin';

  if (loadingBrokerage) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // If user has no brokerage, show options to join or create
  if (!user?.brokerageId) {
    return <NoBrokerageView
      brokerages={availableBrokerages?.brokerages || []}
      loadingAvailable={loadingAvailable}
      onJoin={(id) => joinMutation.mutate(id)}
      onCreate={(name, domain) => createMutation.mutate({ name, domain })}
      isJoining={joinMutation.isLoading}
      isCreating={createMutation.isLoading}
    />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{brokerage?.name || 'My Firm'}</h1>
          <p className="text-slate-600 mt-1">Manage your brokerage firm settings and team</p>
        </div>
        {isBrokerageAdmin && (
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Broker
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Broker to Firm</DialogTitle>
                <DialogDescription>
                  Send an invitation to a broker to join your firm.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="inviteName">Name</Label>
                  <Input
                    id="inviteName"
                    placeholder="John Smith"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail">Email Address</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="broker@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => inviteMutation.mutate({ email: inviteEmail, name: inviteName })}
                  disabled={!inviteEmail || inviteMutation.isLoading}
                >
                  {inviteMutation.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Send Invitation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Brokers</p>
                <p className="text-2xl font-bold text-slate-900">{brokerage?.brokerCount || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Active Listings</p>
                <p className="text-2xl font-bold text-slate-900">-</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Your Role</p>
                <p className="text-lg font-bold text-slate-900">{user?.role}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Shield className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          {isBrokerageAdmin && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Firm Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500">Firm Name</Label>
                  <p className="font-medium">{brokerage?.name}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Slug</Label>
                  <p className="font-medium">{brokerage?.slug}</p>
                </div>
                {brokerage?.domain && (
                  <div>
                    <Label className="text-slate-500">Domain</Label>
                    <p className="font-medium">{brokerage.domain}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Brokers in your firm</CardDescription>
            </CardHeader>
            <CardContent>
              {brokerage?.brokers && brokerage.brokers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>License</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brokerage.brokers.map(broker => (
                      <TableRow key={broker.id}>
                        <TableCell className="font-medium">{broker.name}</TableCell>
                        <TableCell>{broker.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{broker.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {broker.brokerLicenseNo && (
                            <span className="text-sm">
                              {broker.brokerLicenseState} #{broker.brokerLicenseNo}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={broker.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : ''}>
                            {broker.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No team members yet</h3>
                  <p className="text-slate-600 mb-4">Invite brokers to join your firm</p>
                  {isBrokerageAdmin && (
                    <Button onClick={() => setInviteDialogOpen(true)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Invite Broker
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isBrokerageAdmin && (
          <TabsContent value="settings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Firm Settings</CardTitle>
                <CardDescription>Configure your brokerage settings</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600">Settings management coming soon.</p>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function NoBrokerageView({ brokerages, loadingAvailable, onJoin, onCreate, isJoining, isCreating }) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFirmName, setNewFirmName] = useState('');
  const [newFirmDomain, setNewFirmDomain] = useState('');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Join a Brokerage</h1>
        <p className="text-slate-600 mt-1">Join an existing firm or create your own</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create new firm */}
        <Card>
          <CardHeader>
            <CardTitle>Create a New Firm</CardTitle>
            <CardDescription>Start your own brokerage on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full">
                  <Briefcase className="h-4 w-4 mr-2" />
                  Create Brokerage
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Brokerage</DialogTitle>
                  <DialogDescription>
                    Set up your firm on the platform.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="firmName">Firm Name *</Label>
                    <Input
                      id="firmName"
                      placeholder="Acme Real Estate"
                      value={newFirmName}
                      onChange={(e) => setNewFirmName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="firmDomain">Domain (optional)</Label>
                    <Input
                      id="firmDomain"
                      placeholder="acmerealestate.com"
                      value={newFirmDomain}
                      onChange={(e) => setNewFirmDomain(e.target.value)}
                    />
                    <p className="text-xs text-slate-500">Used for email verification of new brokers</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => onCreate(newFirmName, newFirmDomain)}
                    disabled={!newFirmName || isCreating}
                  >
                    {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Create Firm
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Join existing firm */}
        <Card>
          <CardHeader>
            <CardTitle>Join Existing Firm</CardTitle>
            <CardDescription>Browse and join an existing brokerage</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAvailable ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : brokerages.length === 0 ? (
              <p className="text-center text-slate-500 py-4">
                No brokerages available to join
              </p>
            ) : (
              <div className="space-y-3">
                {brokerages.slice(0, 5).map(brokerage => (
                  <div
                    key={brokerage.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{brokerage.name}</p>
                      <p className="text-sm text-slate-500">
                        {brokerage.brokerCount} broker{brokerage.brokerCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onJoin(brokerage.id)}
                      disabled={isJoining}
                    >
                      Join
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
