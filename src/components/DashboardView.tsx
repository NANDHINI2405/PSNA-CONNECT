import React from 'react';
import {
  ArrowRight,
  Bell,
  Building2,
  Calendar,
  Clock,
  Coffee,
  Database,
  FileText,
  Home,
  Mail,
  MessageSquare,
  Plus,
  QrCode,
  Utensils,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getTodayDayName, getTodayIso } from '../services/dataService';
import { EffectiveRole, NavScreen, getEffectiveRole, getRoleLabel } from '../types';

function formatEffectiveRoleLabel(role: EffectiveRole): string {
  switch (role) {
    case 'management':
      return 'Management';
    case 'warden':
      return 'Warden';
    case 'staff':
      return 'Faculty / Staff';
    case 'hostel_resident':
      return 'Hostel Resident';
    case 'student':
      return 'Day Scholar Student';
  }
}

export function DashboardView() {
  const { currentUser, dataMode, state, visibleNotices, setActiveScreen } = useApp();

  if (!currentUser) return null;

  const effectiveRole = getEffectiveRole(currentUser);
  const roleLabel = getRoleLabel(currentUser);
  const todayStr = getTodayIso();
  const todayDay = getTodayDayName();

  // Compute role-specific summary metrics
  const myAttendance = state.attendanceRecords.filter((r) => r.studentUid === currentUser.uid);
  const myAttendancePct =
    myAttendance.length > 0
      ? Math.round(
          (myAttendance.filter((r) => r.status === 'Present').length / myAttendance.length) * 100
        )
      : 0;

  const myTodayCheckin = state.staffCheckins.find(
    (c) => c.staffUid === currentUser.uid && c.date === todayStr
  );

  const todayMenu = state.hostelMenus.find((m) => m.day === todayDay);
  const anyFoodReady = Boolean(
    todayMenu &&
      (todayMenu.breakfastReady ||
        todayMenu.lunchReady ||
        todayMenu.snacksReady ||
        todayMenu.dinnerReady)
  );

  const residents = state.users.filter((u) => u.isHostel);
  const hostelInCount = residents.filter((r) => r.hostelStatus === 'In').length;
  const hostelOutCount = residents.filter((r) => r.hostelStatus === 'Out').length;
  const hostelLeaveCount = residents.filter((r) => r.hostelStatus === 'Leave').length;

  const activeOrders = state.canteenOrders.filter((o) =>
    effectiveRole === 'management' || effectiveRole === 'staff' || effectiveRole === 'warden'
      ? o.status !== 'Collected'
      : o.userUid === currentUser.uid && o.status !== 'Collected'
  );

  const unreadMails = state.mails.filter(
    (m) => m.toUid === currentUser.uid && !m.read
  ).length;

  const upcomingEvents = state.events
    .filter((e) => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const roleFilteredNotices = visibleNotices.filter((n) => {
    if (effectiveRole === 'management') return true;
    if (n.audience === 'All') return true;
    if (n.audience === 'Students' && currentUser.role === 'student') return true;
    if (n.audience === 'Staff' && currentUser.role === 'staff') return true;
    if (n.audience === 'Hostel' && (currentUser.isHostel || currentUser.isWarden)) return true;
    return false;
  });

  const quickLinks: { screen: NavScreen; title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }[] = (() => {
    switch (effectiveRole) {
      case 'student':
        return [
          { screen: 'attendance', title: 'Scan Attendance', subtitle: 'QR code + location check', icon: QrCode },
          { screen: 'canteen', title: 'Canteen Order', subtitle: 'Browse menu & get token', icon: Coffee },
          { screen: 'documents', title: 'Notes & Circulars', subtitle: 'Open PDFs in app', icon: FileText },
          { screen: 'chat', title: 'Class Chat', subtitle: `${currentUser.className || 'Class'} group`, icon: MessageSquare },
        ];
      case 'hostel_resident':
        return [
          { screen: 'hostel', title: 'My Hostel & Mess', subtitle: `Room ${currentUser.roomNumber || '-'} · Menu & Status`, icon: Home },
          { screen: 'attendance', title: 'Scan Attendance', subtitle: 'QR code + location check', icon: QrCode },
          { screen: 'canteen', title: 'Canteen Order', subtitle: 'Order snacks & meals', icon: Coffee },
          { screen: 'chat', title: 'Hostel & Class Chat', subtitle: 'Group & warden updates', icon: MessageSquare },
        ];
      case 'staff':
        return [
          { screen: 'attendance', title: 'Start Class Attendance', subtitle: '30s rotating QR & check-in', icon: QrCode },
          { screen: 'documents', title: 'Upload Notes / PDF', subtitle: 'Share study material', icon: FileText },
          { screen: 'notices', title: 'Post Notice or Event', subtitle: 'Notify students or staff', icon: Bell },
          { screen: 'mail', title: 'Mail & Meetings', subtitle: 'Create meeting links', icon: Mail },
        ];
      case 'warden':
        return [
          { screen: 'hostel', title: 'Warden Console', subtitle: 'Attendance, rooms & menu', icon: Home },
          { screen: 'attendance', title: 'Staff Attendance', subtitle: 'Class QR & campus check-in', icon: QrCode },
          { screen: 'notices', title: 'Hostel Notices', subtitle: 'Publish resident circulars', icon: Bell },
          { screen: 'chat', title: 'Hostel Group Chat', subtitle: 'Direct & group updates', icon: MessageSquare },
        ];
      case 'management':
        return [
          { screen: 'management', title: 'Management Overview', subtitle: 'Users, roles & campus tables', icon: Building2 },
          { screen: 'canteen', title: 'Canteen Console', subtitle: 'Live orders & menu items', icon: Coffee },
          { screen: 'notices', title: 'Notices & Events', subtitle: 'Campus-wide circulars', icon: Bell },
          { screen: 'documents', title: 'Circular Archive', subtitle: 'Upload official PDFs', icon: FileText },
        ];
    }
  })();

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="space-y-6">
      {/* Greeting Banner Card */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <img
          src="/assets/aistudio/image_2f658eee.png"
          alt="PSNA College of Engineering and Technology campus building"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-45"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-blue-950/80 to-indigo-950/75"
        />

        <div className="relative z-10 space-y-3">
          <img
            src="/assets/aistudio/image_c4857b41.png"
            alt="PSNA College of Engineering and Technology emblem"
            referrerPolicy="no-referrer"
            className="h-11 sm:h-12 w-auto max-w-full object-contain drop-shadow-sm"
          />
          <div>
            <div className="text-xs font-medium text-blue-200 mb-1">
              {roleLabel} · {currentUser.department}
              {currentUser.className ? ` · ${currentUser.className}` : ''}
            </div>
            <h2 className="text-2xl font-semibold text-white tracking-tight">
              {greeting}, {currentUser.name}
            </h2>
            <p className="text-sm text-slate-200 mt-1">
              {todayDay}, {todayStr} · PSNA College of Engineering and Technology, Dindigul
            </p>
          </div>
        </div>

        {effectiveRole === 'hostel_resident' && anyFoodReady && (
          <button
            type="button"
            onClick={() => setActiveScreen('hostel')}
            className="relative z-10 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-medium inline-flex items-center gap-2 shrink-0 hover:bg-emerald-100 transition-colors self-start sm:self-center"
          >
            <Utensils className="w-4 h-4 text-emerald-600" />
            <span>Hostel food is ready</span>
          </button>
        )}
      </section>

      {currentUser.requestedRole && currentUser.requestedRole !== effectiveRole && (
        <section
          role="status"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-sm text-amber-950"
        >
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">
              Requested Role Pending Management Approval:{' '}
              {formatEffectiveRoleLabel(currentUser.requestedRole)}
            </div>
            <p className="text-xs text-amber-900 mt-1 leading-relaxed">
              Your account currently has standard Student access for security. A Management user can approve your{' '}
              <span className="font-medium">{formatEffectiveRoleLabel(currentUser.requestedRole)}</span>{' '}
              request in one click under{' '}
              <span className="font-medium">Management Overview → Users &amp; Roles</span>.
            </p>
          </div>
        </section>
      )}

      {/* Role Summary KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(effectiveRole === 'student' || effectiveRole === 'hostel_resident') && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="text-xs font-medium text-slate-500">Overall Attendance</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
              {myAttendancePct}%
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              {myAttendance.length} sessions recorded
            </div>
          </div>
        )}

        {(effectiveRole === 'staff' || effectiveRole === 'warden') && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="text-xs font-medium text-slate-500">My Check-in Today</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1">
              {myTodayCheckin ? 'Present' : 'Pending'}
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              {myTodayCheckin ? `Checked in at ${myTodayCheckin.checkinTime}` : 'Location verification ready'}
            </div>
          </div>
        )}

        {effectiveRole === 'hostel_resident' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="text-xs font-medium text-slate-500">My Hostel Status</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1">
              {currentUser.hostelStatus || 'In'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Room {currentUser.roomNumber || 'Unassigned'} · {currentUser.block || 'Hostel'}
            </div>
          </div>
        )}

        {(effectiveRole === 'warden' || effectiveRole === 'management') && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="text-xs font-medium text-slate-500">Hostel Residents</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
              {hostelInCount} In
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              {hostelOutCount} Out · {hostelLeaveCount} Leave
            </div>
          </div>
        )}

        {effectiveRole === 'management' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="text-xs font-medium text-slate-500">Campus Directory</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
              {state.users.length} Users
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              {state.users.filter((u) => u.role === 'student').length} students ·{' '}
              {state.users.filter((u) => u.role === 'staff').length} staff
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-slate-500">Active Canteen Orders</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {activeOrders.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {activeOrders[0] ? `Token #${activeOrders[0].tokenNumber} · ${activeOrders[0].status}` : 'No pending orders'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-slate-500">Inbox & Notices</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {unreadMails} Unread
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {roleFilteredNotices.length} active notices · {upcomingEvents.length} events
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Quick Links</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickLinks.map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.screen}
                type="button"
                onClick={() => setActiveScreen(q.screen)}
                className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 text-left flex items-start justify-between gap-3 transition-colors group"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{q.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{q.subtitle}</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0 mt-1 transition-colors" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Latest Notices & Upcoming Events Split */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900">Latest Notices</h3>
            <button
              type="button"
              onClick={() => setActiveScreen('notices')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              View all
            </button>
          </div>
          {roleFilteredNotices.length === 0 ? (
            <p className="text-sm text-slate-500">No notices available for your role yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {roleFilteredNotices.slice(0, 3).map((n) => (
                <div key={n.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <span className="font-medium text-blue-700">{n.audience}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{n.date}</span>
                    <span aria-hidden="true">·</span>
                    <span>{n.authorName}</span>
                  </div>
                  <div className="text-sm font-medium text-slate-900">{n.title}</div>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900">Upcoming Events</h3>
            <button
              type="button"
              onClick={() => setActiveScreen('notices')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Open calendar
            </button>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-slate-500">No upcoming events scheduled.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingEvents.slice(0, 3).map((evt) => (
                <div key={evt.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{evt.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {evt.date} · {evt.time} · {evt.venue}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Where to Add New Information & Storage Mode Guide */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600 shrink-0" />
            <h3 className="text-base font-semibold text-slate-900">
              How to Add New Information ({dataMode === 'firebase' ? 'Cloud Firestore Live' : 'Local Demo Store'})
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {dataMode === 'firebase'
              ? 'All additions save directly to your Cloud Firestore database'
              : 'Changes save locally in your browser · Sign in with Google for Cloud Firestore'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {effectiveRole === 'management' && (
            <button
              type="button"
              onClick={() => setActiveScreen('management')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
            >
              <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>Users, Roles &amp; Seed</span>
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Open Management Overview → Users &amp; Roles → Add User (or click Seed Firestore Data).
              </div>
            </button>
          )}

          {(effectiveRole === 'warden' || effectiveRole === 'management') && (
            <button
              type="button"
              onClick={() => setActiveScreen('hostel')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
            >
              <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>Rooms, Mess Menu &amp; Medical</span>
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Open Hostel to add rooms, edit resident guardian/medical info, or update daily mess menus.
              </div>
            </button>
          )}

          {(effectiveRole === 'staff' || effectiveRole === 'warden' || effectiveRole === 'management') && (
            <>
              <button
                type="button"
                onClick={() => setActiveScreen('notices')}
                className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
              >
                <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Notices &amp; Campus Events</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Open Notices &amp; Events → Post Notice or Create Event for All, Students, Staff, or Hostel.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveScreen('documents')}
                className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
              >
                <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Notes &amp; Circular PDFs</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Open PDF Viewer → Upload PDF / Note to attach a .pdf or generate one from text.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveScreen('canteen')}
                className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
              >
                <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Canteen Items &amp; Orders</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Open Canteen → Orders &amp; Menu Admin to add dishes, prices, and serving times.
                </div>
              </button>
            </>
          )}

          {(effectiveRole === 'staff' || effectiveRole === 'warden') && (
            <button
              type="button"
              onClick={() => setActiveScreen('attendance')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
            >
              <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>Class QR &amp; Custom Subjects</span>
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Open Attendance → pick a subject or choose + Add Custom Subject to start live QR.
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveScreen('chat')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
          >
            <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Chat Groups &amp; Direct Messages</span>
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Open Campus Chat to start DMs{effectiveRole === 'staff' || effectiveRole === 'warden' || effectiveRole === 'management' ? ' or create Class/Hostel groups' : ''}.
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveScreen('mail')}
            className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
          >
            <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Campus Mail &amp; Meetings</span>
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Open Mail &amp; Meetings → Compose Mail{effectiveRole === 'staff' || effectiveRole === 'warden' || effectiveRole === 'management' ? ' or Create Meeting' : ' to reach staff or classmates'}.
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
