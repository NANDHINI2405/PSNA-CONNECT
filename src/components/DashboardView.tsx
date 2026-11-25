import React, { useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coffee,
  Database,
  FileText,
  Home,
  Mail,
  MessageSquare,
  Plus,
  QrCode,
  Send,
  Utensils,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getTodayDayName, getTodayIso } from '../services/dataService';
import {
  ApprovalRequestType,
  EffectiveRole,
  NavScreen,
  RequestStatus,
  getEffectiveRole,
  getHostelTypeForGender,
  getRoleLabel,
  getUserGender,
  getUserHostelType,
} from '../types';

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
  const { currentUser, dataMode, state, visibleNotices, setActiveScreen, submitApprovalRequest } =
    useApp();

  const [reqType, setReqType] = useState<ApprovalRequestType>(() =>
    currentUser?.role === 'staff' ? 'warden' : currentUser?.isHostel ? 'staff' : 'hostel_resident'
  );
  const [reqReason, setReqReason] = useState('');
  const [reqFeedback, setReqFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [submittingReq, setSubmittingReq] = useState(false);

  if (!currentUser || currentUser.active === false) return null;

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

  const myHostelType = getUserHostelType(currentUser);
  const residents = state.users.filter((u) => {
    if (!u.isHostel) return false;
    if (effectiveRole === 'warden' && myHostelType) {
      return getUserHostelType(u) === myHostelType;
    }
    return true;
  });
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

  const scheduleDay = todayDay === 'Sunday' ? 'Monday' : todayDay;
  const todaysTimetable = state.timetableSessions
    .filter((tt) => {
      if (tt.day !== scheduleDay) return false;
      if (effectiveRole === 'management') return true;
      if (effectiveRole === 'staff' || effectiveRole === 'warden') {
        return tt.staffUid === currentUser.uid;
      }
      if (currentUser.className) {
        return tt.className.trim().toLowerCase() === currentUser.className.trim().toLowerCase();
      }
      return true;
    })
    .sort((a, b) => a.period - b.period);

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
          { screen: 'management', title: 'Management Overview', subtitle: 'Users, roles & timetable', icon: Building2 },
          { screen: 'audit', title: 'Audit Log', subtitle: 'Role & record history', icon: ClipboardList },
          { screen: 'hostel', title: 'Hostel & Roll Call', subtitle: 'QR attendance, rooms & menu', icon: Home },
          { screen: 'notices', title: 'Notices & Events', subtitle: 'Campus-wide circulars', icon: Bell },
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
          src={`${import.meta.env.BASE_URL}assets/aistudio/image_2f658eee.png`}
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
            src={`${import.meta.env.BASE_URL}assets/aistudio/image_c4857b41.png`}
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

      {currentUser.role !== 'management' && !currentUser.isWarden && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Access &amp; Hostel Requests
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Hostel resident requests go to your wing Warden (
                {getHostelTypeForGender(getUserGender(currentUser))}); Staff and Warden requests go
                to Management.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setReqFeedback(null);
                setSubmittingReq(true);
                try {
                  const created = await submitApprovalRequest({
                    requestType: reqType,
                    reason: reqReason,
                  });
                  setReqReason('');
                  setReqFeedback({
                    type: 'success',
                    message: `Request submitted to ${
                      created.targetQueue === 'warden'
                        ? `${created.targetHostelType} Warden`
                        : 'Management'
                    }.`,
                  });
                } catch (err) {
                  setReqFeedback({
                    type: 'error',
                    message: err instanceof Error ? err.message : 'Unable to submit request.',
                  });
                } finally {
                  setSubmittingReq(false);
                }
              }}
              className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Request Type
                </label>
                <select
                  value={reqType}
                  onChange={(e) => setReqType(e.target.value as ApprovalRequestType)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900"
                >
                  {currentUser.role === 'student' && !currentUser.isHostel && (
                    <option value="hostel_resident">
                      Hostel Resident ({getHostelTypeForGender(getUserGender(currentUser))} Warden)
                    </option>
                  )}
                  {currentUser.role === 'student' && (
                    <option value="staff">Staff / Faculty Access (Management)</option>
                  )}
                  <option value="warden">Warden Access (Management)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reason / Verification Note
                </label>
                <textarea
                  rows={2}
                  required
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  placeholder="Provide hostel wing need, admission slip note, or department authorization..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
                />
              </div>

              {reqFeedback && (
                <div
                  role="status"
                  className={`text-xs px-3 py-2 rounded-lg border ${
                    reqFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {reqFeedback.message}
                </div>
              )}

              <button
                type="submit"
                disabled={submittingReq}
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submittingReq ? 'Submitting...' : 'Submit Approval Request'}</span>
              </button>
            </form>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                My Submitted Requests
              </div>
              {state.approvalRequests.filter((r) => r.requesterUid === currentUser.uid).length ===
              0 ? (
                <p className="text-xs text-slate-500 py-4">
                  No role or hostel requests submitted yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {state.approvalRequests
                    .filter((r) => r.requesterUid === currentUser.uid)
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((r) => {
                      const badge =
                        r.status === 'Approved'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : r.status === 'Rejected'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200';
                      const Icon =
                        r.status === 'Approved'
                          ? CheckCircle2
                          : r.status === 'Rejected'
                          ? XCircle
                          : Clock;
                      const statusLabel: RequestStatus = r.status;
                      return (
                        <div
                          key={r.id}
                          className="rounded-xl border border-slate-200 p-3 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900">
                              {formatEffectiveRoleLabel(r.requestType)} ·{' '}
                              <span className="text-slate-500 font-normal">
                                {r.targetQueue === 'warden'
                                  ? `${r.targetHostelType || 'Hostel'} Warden`
                                  : 'Management'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5">{r.reason}</div>
                            {r.reviewNote && (
                              <div className="text-[11px] text-slate-500 mt-1">
                                Note: {r.reviewNote}
                              </div>
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium shrink-0 ${badge}`}
                          >
                            <Icon className="w-3 h-3" />
                            <span>{statusLabel}</span>
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
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
            <div className="text-xs font-medium text-slate-500">
              {myHostelType || 'My Hostel'} Status
            </div>
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
            <div className="text-xs font-medium text-slate-500">
              {effectiveRole === 'warden' && myHostelType ? `${myHostelType} Residents` : 'Hostel Residents'}
            </div>
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

      {/* Today's Class Timetable */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <h3 className="text-base font-semibold text-slate-900">
              {todayDay === 'Sunday' ? "Monday's Class Timetable" : "Today's Class Timetable"}
            </h3>
            <span className="text-xs text-slate-500">
              ·{' '}
              {effectiveRole === 'management'
                ? 'All Classes'
                : effectiveRole === 'staff' || effectiveRole === 'warden'
                ? 'Your Assigned Periods'
                : currentUser.className || 'Your Class'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setActiveScreen(effectiveRole === 'management' ? 'management' : 'attendance')
              }
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {effectiveRole === 'management'
                ? 'Manage in Overview'
                : 'Open in Attendance'}
            </button>
          </div>
        </div>

        {todaysTimetable.length === 0 ? (
          <p className="text-sm text-slate-500">
            No scheduled periods for {scheduleDay} under this filter.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {todaysTimetable.slice(0, 4).map((tt) => {
              const qrLive = state.attendanceSessions.some(
                (s) =>
                  s.active &&
                  s.subjectCode === tt.subjectCode &&
                  s.className.trim().toLowerCase() === tt.className.trim().toLowerCase()
              );
              return (
                <div
                  key={tt.id}
                  className={`rounded-xl border p-3.5 space-y-1 ${
                    qrLive ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-blue-700 tabular-nums">Period {tt.period}</span>
                    <span className="font-mono text-slate-500 tabular-nums">{tt.startTime}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {tt.subjectCode} · {tt.subjectName}
                  </div>
                  <div className="text-xs text-slate-600 truncate">
                    {tt.className} · Room {tt.room}
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span className="text-slate-500 truncate">{tt.staffName}</span>
                    {qrLive && (
                      <span className="font-semibold text-emerald-700 shrink-0">QR Active</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
            <>
              <button
                type="button"
                onClick={() => setActiveScreen('management')}
                className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
              >
                <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Import Users, Approvals &amp; Timetable</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Open Management Overview to import pre-approved CSV users, review staff approvals, or manage accounts.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveScreen('audit')}
                className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
              >
                <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span>Audit Log</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Inspect role changes, account deactivations, and medical or personal record edits.
                </div>
              </button>
            </>
          )}

          {(effectiveRole === 'warden' || effectiveRole === 'management') && (
            <button
              type="button"
              onClick={() => setActiveScreen('hostel')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
            >
              <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>Hostel Attendance, Rooms &amp; Medical</span>
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Open Hostel to launch live QR roll-call or manual attendance, add rooms, or edit mess menus.
              </div>
            </button>
          )}

          {(effectiveRole === 'staff' || effectiveRole === 'warden' || effectiveRole === 'management') && (
            <>
              <button
                type="button"
                onClick={() =>
                  setActiveScreen(effectiveRole === 'management' ? 'management' : 'attendance')
                }
                className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors"
              >
                <div className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Class Timetable Periods</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {effectiveRole === 'management'
                    ? 'Open Management Overview → Class Timetable to add or edit department periods.'
                    : 'Open Attendance → Class Timetable to add periods or launch live QR attendance.'}
                </div>
              </button>

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
