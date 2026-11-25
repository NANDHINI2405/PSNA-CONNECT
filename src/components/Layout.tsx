import React, { useState } from 'react';
import {
  Bell,
  Building2,
  ClipboardList,
  Coffee,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  QrCode,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { NavScreen, getAllowedScreens, getRoleLabel } from '../types';

interface NavItem {
  id: NavScreen;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { id: 'management', label: 'Management Overview', shortLabel: 'Admin', icon: Building2 },
  { id: 'audit', label: 'Audit Log', shortLabel: 'Audit', icon: ClipboardList },
  { id: 'attendance', label: 'Attendance', shortLabel: 'Attend', icon: QrCode },
  { id: 'hostel', label: 'Hostel', shortLabel: 'Hostel', icon: Home },
  { id: 'canteen', label: 'Canteen', shortLabel: 'Canteen', icon: Coffee },
  { id: 'notices', label: 'Notices & Events', shortLabel: 'Notices', icon: Bell },
  { id: 'chat', label: 'Campus Chat', shortLabel: 'Chat', icon: MessageSquare },
  { id: 'documents', label: 'PDF Viewer', shortLabel: 'PDFs', icon: FileText },
  { id: 'mail', label: 'Mail & Meetings', shortLabel: 'Mail', icon: Mail },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const {
    currentUser,
    activeScreen,
    setActiveScreen,
    logout,
    isOnline,
    dataMode,
  } = useApp();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  if (!currentUser) return null;

  const allowedIds = getAllowedScreens(currentUser);
  const navItems = ALL_NAV_ITEMS.filter((item) => allowedIds.includes(item.id));
  const currentItem = navItems.find((i) => i.id === activeScreen) || navItems[0];
  const roleLabel = getRoleLabel(currentUser);

  // Mobile bottom bar holds up to 4 primary items + More sheet trigger if needed
  const primaryMobileItems = navItems.length <= 5 ? navItems : navItems.slice(0, 4);
  const overflowMobileItems = navItems.length <= 5 ? [] : navItems.slice(4);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Laptop / Desktop Left Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="px-5 h-16 flex items-center gap-3 border-b border-slate-200 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
            PC
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-slate-900 text-base tracking-tight block truncate">
              PSNA Connect
            </span>
            <span className="text-xs text-slate-500 block truncate">Dindigul Campus</span>
          </div>
        </div>

        {/* User Role Summary */}
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900 truncate">{currentUser.name}</div>
          <div className="text-xs text-blue-700 font-medium mt-0.5 truncate">
            {roleLabel} · {currentUser.department}
          </div>
          {(currentUser.programLevel || currentUser.rollNumber || currentUser.registerNumber) && (
            <div className="text-xs font-mono text-slate-500 mt-0.5 tabular-nums truncate">
              {currentUser.programLevel
                ? `${currentUser.programLevel}${currentUser.academicYear ? ` · ${currentUser.academicYear}` : ''}${
                    currentUser.rollNumber || currentUser.registerNumber ? ' · ' : ''
                  }`
                : ''}
              {currentUser.rollNumber || currentUser.registerNumber}
            </div>
          )}
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveScreen(item.id)}
                className={`w-full min-h-[42px] px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer: Mode + Sign Out */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="text-xs text-slate-500 px-1">
            Storage: {dataMode === 'firebase' ? 'Cloud Firestore' : 'Local Demo Store'}
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Top Header Bar (Desktop & Mobile) */}
        <header className="sticky top-0 z-20 h-14 md:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="md:hidden w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              PC
            </div>
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-semibold text-slate-900 truncate">
                {currentItem?.label}
              </h1>
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                <span>PSNA Connect</span>
                <span aria-hidden="true">·</span>
                <span>{roleLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={logout}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Offline Banner */}
        {!isOnline && (
          <div
            role="status"
            className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2.5 text-xs sm:text-sm text-amber-900"
          >
            <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              You are currently offline. Cached notices remain readable, and changes will resume once reconnected.
            </span>
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-10 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div
          className={`grid items-center h-16 ${
            overflowMobileItems.length > 0
              ? 'grid-cols-5'
              : (
                  {
                    1: 'grid-cols-1',
                    2: 'grid-cols-2',
                    3: 'grid-cols-3',
                    4: 'grid-cols-4',
                    5: 'grid-cols-5',
                  }[primaryMobileItems.length] || 'grid-cols-4'
                )
          }`}
        >
          {primaryMobileItems.map((item) => {
            const Icon = item.icon;
            const active = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveScreen(item.id);
                  setMobileMoreOpen(false);
                }}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-1 px-1 transition-colors ${
                  active ? 'text-blue-600' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-medium tracking-tight truncate max-w-full">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
          {overflowMobileItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMobileMoreOpen((v) => !v)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-1 px-1 transition-colors ${
                overflowMobileItems.some((i) => i.id === activeScreen) || mobileMoreOpen
                  ? 'text-blue-600'
                  : 'text-slate-500'
              }`}
            >
              <Menu className="w-5 h-5" />
              <span className="text-[11px] font-medium tracking-tight">More</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile More Drawer */}
      {mobileMoreOpen && overflowMobileItems.length > 0 && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-5 pb-8 space-y-3 border-t border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-900">More Modules</span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                aria-label="Close menu"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {overflowMobileItems.map((item) => {
                const Icon = item.icon;
                const active = activeScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveScreen(item.id);
                      setMobileMoreOpen(false);
                    }}
                    className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-sm font-medium flex items-center gap-2.5 ${
                      active
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
