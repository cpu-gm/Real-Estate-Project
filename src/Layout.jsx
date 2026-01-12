import React, { useState, createContext, useContext } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { 
  LayoutDashboard, 
  PlusCircle, 
  GitBranch, 
  Search, 
  MessageSquare, 
  Shield, 
  FileDown, 
  Settings,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import { cn } from "@/lib/utils";

export const RoleContext = createContext();

export const useRole = () => useContext(RoleContext);

export default function Layout({ children, currentPageName }) {
  const [currentRole, setCurrentRole] = useState('GP');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navigation = [
    { name: 'Deals', href: 'Deals', icon: LayoutDashboard },
    { name: 'Create Deal', href: 'CreateDeal', icon: PlusCircle },
    { name: 'Lifecycle', href: 'Lifecycle', icon: GitBranch },
    { name: 'Traceability', href: 'Traceability', icon: Search },
    { name: 'Explain', href: 'Explain', icon: MessageSquare },
    { name: 'Compliance', href: 'Compliance', icon: Shield },
    { name: 'Audit Export', href: 'AuditExport', icon: FileDown },
  ];

  const roles = ['GP', 'Lender', 'Regulator', 'Auditor', 'LP'];

  return (
    <RoleContext.Provider value={{ currentRole, setCurrentRole }}>
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
        {/* Sidebar */}
        <aside className={cn(
          "fixed left-0 top-0 h-full bg-white border-r border-[#E5E5E5] flex flex-col transition-all duration-300 z-50",
          sidebarCollapsed ? "w-16" : "w-64"
        )}>
          {/* Logo */}
          <div className="h-16 flex items-center px-5 border-b border-[#E5E5E5]">
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
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = currentPageName === item.href;
              return (
                <Link
                  key={item.name}
                  to={createPageUrl(item.href)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-[#0A0A0A] text-white" 
                      : "text-[#737373] hover:bg-[#F5F5F5] hover:text-[#171717]"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!sidebarCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
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
          sidebarCollapsed ? "ml-16" : "ml-64"
        )}>
          <div className="min-h-screen">
            {children}
          </div>
        </main>
      </div>
    </RoleContext.Provider>
  );
}