/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AttendanceView } from './components/AttendanceView';
import { CanteenView } from './components/CanteenView';
import { ChatView } from './components/ChatView';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HostelView } from './components/HostelView';
import { Layout } from './components/Layout';
import { LoginPage } from './components/LoginPage';
import { MailMeetingsView } from './components/MailMeetingsView';
import { ManagementView } from './components/ManagementView';
import { NoticesEventsView } from './components/NoticesEventsView';
import { PdfViewerView } from './components/PdfViewerView';
import { AppProvider, useApp } from './context/AppContext';

function AppContent() {
  const { currentUser, loading, activeScreen } = useApp();

  if (loading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4 animate-pulse">
          <div className="h-5 w-36 bg-slate-200 rounded-lg" />
          <div className="h-8 w-64 bg-slate-200 rounded-lg" />
          <div className="h-24 w-full bg-slate-100 rounded-xl" />
          <div className="h-10 w-full bg-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':
        return <DashboardView />;
      case 'attendance':
        return <AttendanceView />;
      case 'hostel':
        return <HostelView />;
      case 'canteen':
        return <CanteenView />;
      case 'notices':
        return <NoticesEventsView />;
      case 'chat':
        return <ChatView />;
      case 'documents':
        return <PdfViewerView />;
      case 'mail':
        return <MailMeetingsView />;
      case 'management':
        return <ManagementView />;
      default:
        return <DashboardView />;
    }
  };

  return <Layout>{renderScreen()}</Layout>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
