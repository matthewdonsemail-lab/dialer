import React, { useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/auth';
import { api } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { PowerDialerProvider } from '@/components/campaigns/PowerDialer';
import {
  BarChart3,
  Users,
  FileText,
  Clock,
  Shield,
  Phone,
  Settings,
  LogOut,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  type IconComponent,
} from "@/components/ui/icons";

interface NavItem {
  to: string;
  label: string;
  icon: IconComponent;
}

/** Sidebar sections, separated by a divider (like GoHighLevel / WAVV). */
const navGroups: NavItem[][] = [
  [
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/contacts', label: 'Contacts', icon: Users },
  ],
  [
    { to: '/scripts', label: 'Scripts', icon: FileText },
    { to: '/history', label: 'Call History', icon: Clock },
    { to: '/phone-numbers', label: 'Phone Numbers', icon: Phone },
    { to: '/admin', label: 'Admin', icon: Shield },
  ],
];
const settingsItem: NavItem = { to: '/settings', label: 'Settings', icon: Settings };
const navItems = [...navGroups.flat(), settingsItem];

/** One sidebar row: icon + label, or icon only when the rail is collapsed. */
function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/reports'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `group flex items-center gap-2.5 h-9 rounded-[6px] text-[13px] font-medium transition-colors ${
          collapsed ? 'justify-center px-0' : 'px-2.5'
        } ${
          isActive
            ? 'bg-[var(--ods-active)] text-[var(--ods-text-primary)]'
            : 'text-[var(--ods-text-secondary)] hover:bg-[var(--ods-hover)] hover:text-[var(--ods-text-primary)]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`w-[18px] h-[18px] flex-shrink-0 ${
              isActive ? 'text-[var(--ods-brand-600)]' : 'text-[var(--ods-text-secondary)] group-hover:text-[var(--ods-text-primary)]'
            }`}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  // Collapsed = icon-only rail. Starts collapsed on phone-width screens; the choice is remembered.
  const [collapsed, setCollapsed] = usePersistedState('sidebar-collapsed', window.innerWidth < 640);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isLeadDetail = location.pathname.startsWith('/leads/') && location.pathname !== '/leads';
  const isProspectDetail = location.pathname.startsWith('/contacts/') && location.pathname !== '/contacts';
  const currentNav = navItems.find((n) => location.pathname.startsWith(n.to));

  // Compact mode is strictly opt-in via ?embed=1 (e.g. small Twenty panels).
  // Default iframe embeds show the FULL app with sidebar — no auto-detection,
  // so pasting a plain URL into a Twenty iframe widget keeps all chrome.
  const params = new URLSearchParams(location.search);
  const isEmbed = params.get('embed') === '1' || params.get('framed') === '1';

  // Extract ID from URL
  const leadId = useMemo(() => {
    const match = location.pathname.match(/^\/leads\/([^/]+)$/);
    return match ? match[1] : null;
  }, [location.pathname]);

  const prospectId = useMemo(() => {
    const match = location.pathname.match(/^\/contacts\/([^/]+)$/);
    return match ? match[1] : null;
  }, [location.pathname]);

  // Fetch lead name
  const { data: lead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => api.leads.get(leadId ?? ''),
    enabled: !!leadId,
    staleTime: Infinity,
  });

  // Fetch prospect name
  const { data: prospect } = useQuery({
    queryKey: ['prospect', prospectId],
    queryFn: () => api.prospects.get(prospectId ?? ''),
    enabled: !!prospectId,
    staleTime: Infinity,
  });

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  if (isEmbed) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-[var(--ods-bg-primary,#ffffff)] text-[var(--ods-text-primary,#18181b)] font-sans antialiased">
        <div className="flex items-center justify-between h-8 px-3 border-b border-[var(--ods-border,#e5e5ea)] text-[12px] text-[var(--ods-text-secondary,#575757)]">
          <span className="font-medium truncate">{currentNav?.label ?? 'Cold Dialer'}</span>
          <a
            href={location.pathname + location.search.replace(/[?&]embed=1/, '').replace(/[?&]framed=1/, '')}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--ods-text-primary,#18181b)] underline underline-offset-2"
          >
            Open full page
          </a>
        </div>
        <main className="flex flex-col flex-1 min-w-0 min-h-0">{children}</main>
      </div>
    );
  }

  return (
    <PowerDialerProvider>
    <div className="flex h-screen overflow-hidden bg-[var(--ods-bg-secondary,#fafafb)] text-[var(--ods-text-primary,#18181b)] font-sans antialiased">
      {/* always-visible sidebar: every section as an icon + label row */}
      <aside
        className={`flex-shrink-0 ${collapsed ? 'w-14' : 'w-56'} bg-[var(--ods-bg-secondary)] border-r border-[var(--ods-border)] flex flex-col select-none transition-[width] duration-200`}
      >
        {/* workspace + collapse toggle */}
        <div className={`flex items-center h-12 border-b border-[var(--ods-border)] ${collapsed ? 'justify-center' : 'justify-between px-3'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-[6px] bg-[var(--ods-brand-600)] flex items-center justify-center flex-shrink-0">
                <Phone className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-[14px] font-semibold tracking-tight truncate text-[var(--ods-text-primary)]">Cold Dialer</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-[6px] text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)] transition-colors"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {navGroups.map((group, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className="my-3 mx-1 border-t border-[var(--ods-border)]" />}
              <div className="space-y-0.5">
                {group.map((item) => (
                  <SidebarLink key={item.to} item={item} collapsed={collapsed} />
                ))}
              </div>
            </React.Fragment>
          ))}
        </nav>

        {/* settings, theme and account */}
        <div className="px-2 py-2 border-t border-[var(--ods-border)] space-y-0.5">
          <SidebarLink item={settingsItem} collapsed={collapsed} />
          <div className={`flex items-center h-10 rounded-[6px] ${collapsed ? 'justify-center' : 'justify-between px-2.5'}`}>
            {!collapsed && (
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-[var(--ods-bg-tertiary)] flex items-center justify-center text-[11px] font-semibold text-[var(--ods-text-primary)] flex-shrink-0">
                  {((user?.user_metadata?.full_name || user?.email || 'U') as string).trim()[0]?.toUpperCase() ?? 'U'}
                </div>
                <span className="text-[12px] font-medium text-[var(--ods-text-secondary)] truncate">
                  {user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'}
                </span>
              </div>
            )}
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="p-1.5 rounded-[6px] text-[var(--ods-text-tertiary)] hover:text-red-600 hover:bg-[var(--ods-hover)] transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* main content area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--ods-bg-primary,#ffffff)]">
        {/* twenty-style 40px top bar with dynamic breadcrumbs */}
        <header className="sticky top-0 z-30 bg-[var(--ods-bg-primary,#ffffff)] border-b border-[var(--ods-border,#e5e5ea)] h-10 flex items-center justify-between px-3 select-none">
          <div className="flex items-center gap-3">
            {/* twenty breadcrumb trail */}
            <div className="flex items-center gap-1.5 text-[13px]">
              {isLeadDetail ? (
                <>
                  <button
                    onClick={() => navigate('/contacts')}
                    className="flex items-center gap-1.5 text-[var(--ods-text-secondary,#575757)] hover:text-[var(--ods-text-primary,#18181b)] transition-colors"
                  >
                    <Users className="w-3.5 h-3.5 opacity-70" />
                    <span>Leads</span>
                  </button>
                  <span className="text-[var(--ods-text-tertiary,#8a8a93)]">/</span>
                  <span className="font-semibold text-[var(--ods-text-primary,#18181b)] truncate max-w-[200px]">
                    <span className="text-[var(--ods-text-tertiary,#8a8a93)]">Name:</span>{' '}
                    {lead ? `${lead.first_name} ${lead.last_name}` : (
                      <Skeleton className="inline-block align-middle h-3 w-24 ml-1" />
                    )}
                  </span>
                </>
              ) : isProspectDetail ? (
                <>
                  <button
                    onClick={() => navigate('/contacts')}
                    className="flex items-center gap-1.5 text-[var(--ods-text-secondary,#575757)] hover:text-[var(--ods-text-primary,#18181b)] transition-colors"
                  >
                    <Users className="w-3.5 h-3.5 opacity-70" />
                    <span>Contacts</span>
                  </button>
                  <span className="text-[var(--ods-text-tertiary,#8a8a93)]">/</span>
                  <span className="font-semibold text-[var(--ods-text-primary,#18181b)] truncate max-w-[200px]">
                    <span className="text-[var(--ods-text-tertiary,#8a8a93)]">Name:</span>{' '}
                    {prospect ? `${prospect.first_name} ${prospect.last_name}` : (
                      <Skeleton className="inline-block align-middle h-3 w-24 ml-1" />
                    )}
                  </span>
                </>
              ) : (
                <div className="flex items-center gap-1.5 font-medium text-[var(--ods-text-primary,#18181b)]">
                  {currentNav && <currentNav.icon className="w-3.5 h-3.5 opacity-70 text-[var(--ods-text-secondary,#71717a)]" />}
                  <span>{currentNav?.label ?? 'Workspace'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="relative p-1 text-[var(--ods-text-secondary,#575757)] hover:text-[var(--ods-text-primary,#18181b)] hover:bg-[var(--ods-hover)] rounded-[4px] transition">
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* content body */}
        <main className="flex flex-col flex-1 min-w-0 h-[calc(100vh-40px)] bg-[var(--ods-bg-primary)]">
          {children}
        </main>
      </div>
    </div>
    </PowerDialerProvider>
  );
}
