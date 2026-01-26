import React, { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { createPageUrl } from './utils';
import {
  LayoutDashboard,
  Home,
  PlusCircle,
  GitBranch,
  Inbox,
  Search,
  MessageSquare,
  Shield,
  FileDown,
  Settings,
  ChevronRight,
  Menu,
  X,
  Users,
  Users2,
  CheckCircle2,
  UserPlus,
  Building2,
  FileInput,
  Briefcase,
  Store,
  Bookmark,
  DollarSign,
  Mail,
  Scale,
  Gavel
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { ChatProvider } from '@/context/ChatContext';
import ChatPanel from '@/components/chat/ChatPanel';
import ChatFAB from '@/components/chat/ChatFAB';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { isBrokerRole, isGPCounselRole, getRoleCategory } from '@/lib/permissions';
import NotificationBell from '@/components/notifications/NotificationBell';
import { createLogger } from '@/lib/debug-logger';

const logger = createLogger('ui:layout');

export const RoleContext = createContext();

export const useRole = () => useContext(RoleContext);

export default function Layout({ children, currentPageName }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentRole, setCurrentRole] = useState('GP');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, authToken } = useAuth();
  const queryClient = useQueryClient();
  const previousPendingRef = useRef(null);
  const notifiedRequestsRef = useRef(new Set());
  const lastInquiryCheckRef = useRef(new Date().toISOString());
  const notifiedInquiriesRef = useRef(new Set());

  const roles = ['GP', 'GP Analyst', 'Broker', 'Brokerage Admin', 'Lender', 'Counsel', 'Regulator', 'Auditor', 'LP'];

  // Check if user is an admin
  const isAdmin = user?.role === 'Admin';
  const isBroker = user?.role ? isBrokerRole(user.role) : false;
  const isGPCounsel = user?.role ? isGPCounselRole(user.role) : false;
  const userRoleCategory = user?.role ? getRoleCategory(user.role) : 'SELLER_BUYER';

  // Approve mutation for quick approve from toast
  const approveMutation = useMutation({
    mutationFn: async (requestId) => {
      const res = await fetch(`/api/admin/verification-requests/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      });
      if (!res.ok) throw new Error('Failed to approve');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['verification-queue']);
      toast({
        title: "User approved",
        description: "The user has been approved and can now access the platform.",
      });
    }
  });

  // Fetch pending verification count for admins
  const { data: verificationData } = useQuery({
    queryKey: ['verification-queue'],
    queryFn: async () => {
      const res = await fetch('/api/admin/verification-queue', {
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      });
      if (!res.ok) return { requests: [] };
      return res.json();
    },
    enabled: isAdmin && !!authToken,
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  const pendingCount = verificationData?.requests?.length || 0;
  const pendingRequests = verificationData?.requests || [];

  // Fetch broker unread inquiry count
  const { data: brokerUnreadData } = useQuery({
    queryKey: ['broker-unread-count'],
    queryFn: async () => {
      const res = await fetch('/api/broker/unread-count', {
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: isBroker && !!authToken,
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  const brokerUnreadCount = brokerUnreadData?.count || 0;

  // Poll for new broker inquiries (for toast notifications)
  const { data: newInquiriesData } = useQuery({
    queryKey: ['broker-new-inquiries', lastInquiryCheckRef.current],
    queryFn: async () => {
      const res = await fetch(`/api/broker/new-inquiries?since=${encodeURIComponent(lastInquiryCheckRef.current)}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      });
      if (!res.ok) return { inquiries: [] };
      return res.json();
    },
    enabled: isBroker && !!authToken,
    refetchInterval: 30000 // Check every 30 seconds
  });

  // Show toast when new broker inquiries arrive
  useEffect(() => {
    if (!isBroker || !newInquiriesData?.inquiries?.length) return;

    newInquiriesData.inquiries.forEach((inquiry) => {
      // Skip if we've already shown a toast for this inquiry
      if (notifiedInquiriesRef.current.has(inquiry.id)) return;
      notifiedInquiriesRef.current.add(inquiry.id);

      toast({
        title: inquiry.hasQuestions
          ? `New inquiry with questions`
          : `New interested buyer`,
        description: (
          <div className="flex flex-col gap-2">
            <p>
              <strong>{inquiry.buyerName}</strong>
              {inquiry.buyerFirm && ` from ${inquiry.buyerFirm}`} is interested in{' '}
              <strong>{inquiry.propertyName || 'your listing'}</strong>
              {inquiry.hasQuestions && ' and has questions for you'}.
            </p>
            <button
              onClick={() => navigate(createPageUrl('BrokerDashboard'))}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md font-medium transition-colors w-fit"
            >
              <MessageSquare className="w-4 h-4" />
              View Inquiries
            </button>
          </div>
        ),
        duration: 10000
      });

      // Update the last check time after processing
      lastInquiryCheckRef.current = new Date().toISOString();
    });
  }, [newInquiriesData, isBroker, navigate]);

  // Global keyboard shortcuts
  const handleGlobalKeyDown = useCallback((e) => {
    // Don't trigger shortcuts if user is typing in an input
    const target = e.target;
    const isInput = target.tagName === 'INPUT' ||
                   target.tagName === 'TEXTAREA' ||
                   target.isContentEditable;

    if (isInput) return;

    // Log keyboard events for debugging
    logger.debug('Keyboard event', { key: e.key, modifiers: { ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey } });
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  // Show toast when new verification request comes in
  useEffect(() => {
    if (!isAdmin || !pendingRequests.length) return;

    const isInitialLoad = previousPendingRef.current === null;

    // On initial load, show a summary toast if there are pending requests
    if (isInitialLoad && pendingRequests.length > 0) {
      // Mark all current requests as notified
      pendingRequests.forEach((req) => notifiedRequestsRef.current.add(req.id));

      toast({
        title: `${pendingRequests.length} user${pendingRequests.length > 1 ? 's' : ''} awaiting approval`,
        description: (
          <div className="flex flex-col gap-2">
            <p>You have pending verification requests that need your attention.</p>
            <button
              onClick={() => navigate(createPageUrl('AdminDashboard'))}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md font-medium transition-colors w-fit"
            >
              <UserPlus className="w-4 h-4" />
              Review Now
            </button>
          </div>
        ),
        duration: 10000,
      });
    } else {
      // Find new requests that we haven't notified about yet
      pendingRequests.forEach((request) => {
        if (!notifiedRequestsRef.current.has(request.id)) {
          notifiedRequestsRef.current.add(request.id);

          const handleApprove = () => {
            approveMutation.mutate(request.id);
          };

          toast({
            title: "New user awaiting approval",
            description: (
              <div className="flex flex-col gap-2">
                <p><strong>{request.user.name}</strong> ({request.user.email}) wants to join as {request.requestedRole}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleApprove}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md font-medium transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => navigate(createPageUrl('AdminDashboard'))}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-md font-medium transition-colors"
                  >
                    View All
                  </button>
                </div>
              </div>
            ),
            duration: 15000, // Show for 15 seconds
          });
        }
      });
    }

    previousPendingRef.current = pendingRequests.length;
  }, [pendingRequests, isAdmin, navigate, approveMutation]);

  // URL-based role switching: ?role=GP%20Analyst
  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam && roles.includes(roleParam)) {
      setCurrentRole(roleParam);
    }
  }, [searchParams]);

  // Role-based navigation sections
  const getNavSections = () => {
    // Admin navigation (system administration only - NO operational access)
    if (isAdmin) {
      return [
        {
          title: 'ADMINISTRATION',
          items: [
            { name: 'Admin Dashboard', href: 'AdminDashboard', icon: Users, badge: pendingCount },
            { name: 'Organizations', href: 'OrganizationManagement', icon: Building2 }
          ]
        },
        {
          title: 'OVERSIGHT',
          items: [
            { name: 'Audit Export', href: 'AuditExport', icon: FileDown },
            { name: 'Compliance', href: 'Compliance', icon: Shield },
            { name: 'Traceability', href: 'Traceability', icon: Search },
            { name: 'Lifecycle', href: 'Lifecycle', icon: GitBranch }
          ]
        },
        {
          title: 'CONTACTS',
          items: [
            { name: 'Contacts', href: 'Contacts', icon: Users }
          ]
        }
      ];
    }

    // GP Counsel / General Counsel navigation
    if (isGPCounsel) {
      const legalItems = [
        { name: 'Dashboard', href: 'GPCounselHome', icon: Scale },
        { name: 'Matters', href: 'LegalMatters', icon: Briefcase }
      ];

      // Add Approval Queue for General Counsel only
      if (user?.role === 'General Counsel') {
        legalItems.splice(1, 0, { name: 'Approval Queue', href: 'GCApprovalQueue', icon: Scale });
      }

      return [
        {
          title: 'LEGAL',
          items: legalItems
        },
        {
          title: 'DEALS',
          items: [
            { name: 'All Deals', href: 'Deals', icon: Building2 },
            { name: 'Due Diligence', href: 'DealDueDiligence', icon: CheckCircle2 }
          ]
        },
        {
          title: 'DOCUMENTS',
          items: [
            { name: 'Review Queue', href: 'LegalDocuments', icon: FileInput },
            { name: 'Document Vault', href: 'LegalVault', icon: Gavel }
          ]
        },
        {
          title: 'COLLABORATION',
          items: [
            { name: 'Shared Spaces', href: 'SharedSpacesList', icon: Users2 }
          ]
        },
        {
          title: 'MANAGEMENT',
          items: [
            { name: 'Vendors', href: 'LegalVendors', icon: Users },
            { name: 'Entities', href: 'LegalEntities', icon: Building2 }
          ]
        }
      ];
    }

    // Broker navigation
    if (isBroker) {
      return [
        {
          title: 'BROKER',
          items: [
            { name: 'Dashboard', href: 'BrokerDashboard', icon: LayoutDashboard }
          ]
        },
        {
          title: 'LISTINGS',
          items: [
            { name: 'My Listings', href: 'DealDrafts', icon: Building2 },
            { name: 'Buyer Responses', href: 'BuyerReviewQueue', icon: MessageSquare, badge: brokerUnreadCount },
            { name: 'Commissions', href: 'Commissions', icon: DollarSign }
          ]
        },
        {
          title: 'MARKETPLACE',
          items: [
            { name: 'Browse Listings', href: 'Marketplace', icon: Store }
          ]
        },
        {
          title: 'BROKERAGE',
          items: [
            { name: 'My Firm', href: 'BrokerageSettings', icon: Briefcase },
            { name: 'Contacts', href: 'Contacts', icon: Users }
          ]
        }
      ];
    }

    // Lender navigation (full app access for frequent lenders)
    if (user?.role === 'Lender') {
      return [
        {
          title: 'LENDING',
          items: [
            { name: 'Dashboard', href: 'LenderDashboard', icon: LayoutDashboard },
            { name: 'Submissions', href: 'LenderSubmissions', icon: Inbox },
            { name: 'Portfolio', href: 'LenderPortfolio', icon: Briefcase }
          ]
        },
        {
          title: 'DOCUMENTS',
          items: [
            { name: 'My Documents', href: 'LenderDocuments', icon: FileInput }
          ]
        },
        {
          title: 'TOOLS',
          items: [
            { name: 'Contacts', href: 'Contacts', icon: Users }
          ]
        }
      ];
    }

    // GP navigation (full operational control)
    if (user?.role === 'GP') {
      return [
        {
          title: 'OPERATIONS',
          items: [
            { name: 'Home', href: 'Home', icon: Home },
            { name: 'All Deals', href: 'Deals', icon: Building2 },
            { name: 'Create Deal', href: 'CreateDeal', icon: PlusCircle },
            { name: 'Inbox', href: 'Inbox', icon: LayoutDashboard }
          ]
        },
        {
          title: 'INVESTORS',
          items: [
            { name: 'LP Management', href: 'Investors', icon: Users },
            { name: 'Capital Calls', href: 'CapitalCalls', icon: LayoutDashboard },
            { name: 'Distributions', href: 'Distributions', icon: LayoutDashboard },
            { name: 'Investor Updates', href: 'InvestorUpdates', icon: LayoutDashboard }
          ]
        },
        {
          title: 'OVERSIGHT',
          items: [
            { name: 'Email Approvals', href: 'EmailApprovalQueue', icon: Mail },
            { name: 'Compliance', href: 'Compliance', icon: Shield }
          ]
        },
        {
          title: 'TOOLS',
          items: [
            { name: 'Contacts', href: 'Contacts', icon: Users },
            { name: 'Lifecycle', href: 'Lifecycle', icon: GitBranch },
            { name: 'Traceability', href: 'Traceability', icon: Search },
            { name: 'Explain', href: 'Explain', icon: MessageSquare },
            { name: 'Audit Export', href: 'AuditExport', icon: FileDown }
          ]
        }
      ];
    }

    // GP Analyst navigation (supervised junior role - restricted actions hidden)
    if (user?.role === 'GP Analyst') {
      return [
        {
          title: 'MY WORK',
          items: [
            { name: 'Home', href: 'Home', icon: Home },
            { name: 'Assigned Deals', href: 'Deals', icon: Building2 },
            { name: 'Create Deal', href: 'CreateDeal', icon: PlusCircle },
            { name: 'My Tasks', href: 'Inbox', icon: LayoutDashboard }
          ]
        },
        {
          title: 'MARKETPLACE',
          items: [
            { name: 'Browse Listings', href: 'Marketplace', icon: Store },
            { name: 'Saved Searches', href: 'SavedSearches', icon: Bookmark }
          ]
        },
        {
          title: 'INVESTORS',
          items: [
            { name: 'View Investors', href: 'Investors', icon: Users },
            { name: 'Capital Calls', href: 'CapitalCalls', icon: LayoutDashboard },
            { name: 'Distributions', href: 'Distributions', icon: LayoutDashboard }
          ]
        },
        {
          title: 'TOOLS',
          items: [
            { name: 'Contacts', href: 'Contacts', icon: Users },
            { name: 'Lifecycle', href: 'Lifecycle', icon: GitBranch },
            { name: 'Explain', href: 'Explain', icon: MessageSquare }
          ]
        }
      ];
    }

    // Default: Seller/Buyer marketplace navigation (fallback for undefined roles)
    return [
      {
        title: 'SELLING',
        items: [
          { name: 'My Properties', href: 'DealDrafts', icon: Building2 },
          { name: 'List Property', href: 'CreateDealDraft', icon: PlusCircle },
          { name: 'My Deals', href: 'Deals', icon: FileInput }
        ]
      },
      {
        title: 'BUYING',
        items: [
          { name: 'Deal Inbox', href: 'BuyerInbox', icon: Inbox },
          { name: 'Browse Listings', href: 'Marketplace', icon: Store },
          { name: 'Saved Searches', href: 'SavedSearches', icon: Bookmark },
          { name: 'My Responses', href: 'BuyerResponses', icon: MessageSquare }
        ]
      },
      {
        title: 'PORTFOLIO',
        items: [
          { name: 'Home', href: 'Home', icon: Home },
          { name: 'Contacts', href: 'Contacts', icon: Users }
        ]
      }
    ];
  };

  const navSections = getNavSections();

  return (
    <RoleContext.Provider value={{ currentRole, setCurrentRole }}>
    <ChatProvider>
      <style>{`
        :root {
          --color-bg: #FAFAFA;
          --color-surface: #FFFFFF;
          --color-border: #E5E5E5;
          --color-text-primary: #171717;
          --color-text-secondary: #737373;
          --color-text-tertiary: #A3A3A3;
          --color-accent: #0A0A0A;
          --color-success: #16A34A;
          --color-warning: #CA8A04;
          --color-danger: #DC2626;
        }
      `}</style>
      
      <div className="min-h-screen bg-[#FAFAFA] flex">
        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={cn(
          "fixed left-0 top-0 h-full bg-white border-r border-[#E5E5E5] flex flex-col transition-all duration-300 z-50",
          sidebarCollapsed ? "w-16" : "w-64",
          "lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
          {/* Logo */}
          <div className="h-16 flex items-center px-5 border-b border-[#E5E5E5] justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#0A0A0A] rounded-lg flex items-center justify-center">
                <span className="text-white font-semibold text-sm">C</span>
              </div>
              {!sidebarCollapsed && (
                <div>
                  <h1 className="font-semibold text-[#171717] text-sm tracking-tight">Canonical Deal OS</h1>
                  <p className="text-[10px] text-[#A3A3A3] tracking-wide">PROVABLE TRUTH</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-2 hover:bg-[#F5F5F5] rounded-lg"
            >
              <X className="w-5 h-5 text-[#171717]" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
            {navSections.map((section, sectionIndex) => (
              <div key={section.title} className="space-y-1">
                {!sidebarCollapsed && (
                  <div className={cn("px-3 pb-2", sectionIndex > 0 && "pt-4")}>
                    <span className="text-[10px] font-medium text-[#A3A3A3] uppercase tracking-wider">
                      {section.title}
                    </span>
                  </div>
                )}
                {section.items.map((item) => {
                  const isActive = currentPageName === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={createPageUrl(item.href)}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-[#0A0A0A] text-white"
                          : "text-[#737373] hover:bg-[#F5F5F5] hover:text-[#171717]"
                      )}
                    >
                      <div className="relative">
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {item.badge > 0 && sidebarCollapsed && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                            {item.badge > 9 ? '9+' : item.badge}
                          </span>
                        )}
                      </div>
                      {!sidebarCollapsed && (
                        <>
                          <span className="flex-1">{item.name}</span>
                          {item.badge > 0 && (
                            <span className="px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full font-medium">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Role Switcher */}
          <div className="p-3 border-t border-[#E5E5E5]">
            {!sidebarCollapsed && (
              <div className="mb-2 px-3">
                <span className="text-[10px] font-medium text-[#A3A3A3] uppercase tracking-wider">Viewing As</span>
              </div>
            )}
            <Link
              to={createPageUrl('Settings')}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                currentPageName === 'Settings'
                  ? "bg-[#0A0A0A] text-white"
                  : "text-[#737373] hover:bg-[#F5F5F5] hover:text-[#171717]"
              )}
            >
              <Settings className="w-4 h-4" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between flex-1">
                  <span className="text-sm font-medium">{currentRole}</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              )}
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className={cn(
          "flex-1 transition-all duration-300",
          "lg:ml-64",
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
        )}>
          {/* Mobile Header */}
          <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-[#E5E5E5] flex items-center justify-between px-4 z-30">
            <div className="flex items-center">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 hover:bg-[#F5F5F5] rounded-lg"
              >
                <Menu className="w-5 h-5 text-[#171717]" />
              </button>
              <div className="ml-3 flex items-center gap-2">
                <div className="w-6 h-6 bg-[#0A0A0A] rounded-md flex items-center justify-center">
                  <span className="text-white font-semibold text-xs">C</span>
                </div>
                <span className="font-semibold text-[#171717] text-sm">Canonical</span>
              </div>
            </div>
            {/* Notification Bell - Mobile */}
            <NotificationBell />
          </div>

          {/* Desktop Header Bar */}
          <div className="hidden lg:flex fixed top-0 right-0 h-14 bg-white/80 backdrop-blur-sm border-b border-[#E5E5E5] items-center justify-end px-6 z-30" style={{ left: sidebarCollapsed ? '64px' : '256px' }}>
            <NotificationBell />
          </div>

          <div className="min-h-screen pt-16 lg:pt-14">
            {children}
          </div>
        </main>

        {/* Chat Components - ChatPanel and ChatFAB need ChatProvider */}
        <ChatPanel />
        <ChatFAB />
      </div>
    </ChatProvider>
    </RoleContext.Provider>
  );
}
