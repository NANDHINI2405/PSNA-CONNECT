import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getTodayIso } from '../services/dataService';
import {
  BaseRole,
  DayOfWeek,
  EffectiveRole,
  Gender,
  HostelType,
  ProgramLevel,
  RequestStatus,
  TimetableSession,
  UserProfile,
  deriveClassName,
  getEffectiveRole,
  getHostelTypeForGender,
  getUserGender,
  getUserHostelType,
} from '../types';
import { SAMPLE_MASTER_CSV, parseMasterUsersCsv } from '../utils/csvUsers';
import { getBrowserLocation } from '../utils/geo';

const TIMETABLE_DAYS: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const DAY_ORDER: Record<DayOfWeek, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

const PERIOD_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: '09:00 AM', end: '09:50 AM' },
  2: { start: '09:55 AM', end: '10:45 AM' },
  3: { start: '11:05 AM', end: '11:55 AM' },
  4: { start: '12:00 PM', end: '12:50 PM' },
  5: { start: '01:30 PM', end: '02:20 PM' },
  6: { start: '02:25 PM', end: '03:15 PM' },
  7: { start: '03:20 PM', end: '04:10 PM' },
  8: { start: '04:15 PM', end: '05:00 PM' },
};

function formatRequestedRole(role: EffectiveRole): string {
  switch (role) {
    case 'management':
      return 'Management';
    case 'warden':
      return 'Warden';
    case 'staff':
      return 'Staff';
    case 'hostel_resident':
      return 'Hostel Resident';
    case 'student':
      return 'Student';
  }
}

function mapEffectiveRoleToFlags(role: EffectiveRole): {
  role: BaseRole;
  isHostel: boolean;
  isWarden: boolean;
} {
  switch (role) {
    case 'management':
      return { role: 'management', isHostel: false, isWarden: false };
    case 'warden':
      return { role: 'staff', isHostel: false, isWarden: true };
    case 'staff':
      return { role: 'staff', isHostel: false, isWarden: false };
    case 'hostel_resident':
      return { role: 'student', isHostel: true, isWarden: false };
    case 'student':
      return { role: 'student', isHostel: false, isWarden: false };
  }
}

export function ManagementView() {
  const {
    currentUser,
    dataMode,
    state,
    visibleNotices,
    setActiveScreen,
    createCampusUser,
    updateUserRoleAndFlags,
    importMasterRegistryBatch,
    reviewApprovalRequest,
    setUserActiveStatus,
    upsertTimetableSession,
    deleteTimetableSession,
    updateGeofence,
    seedCloudFirestore,
    resetDemoData,
  } = useApp();

  const [tab, setTab] = useState<
    'users' | 'import' | 'approvals' | 'staff' | 'hostel' | 'canteen' | 'rooms' | 'timetable'
  >('users');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | BaseRole>('all');
  const [canteenStatusFilter, setCanteenStatusFilter] = useState<string>('All');
  const [hostelStatusFilter, setHostelStatusFilter] = useState<string>('All');
  const [hostelWingFilter, setHostelWingFilter] = useState<'All' | HostelType>('All');
  const [ttDayFilter, setTtDayFilter] = useState<DayOfWeek | 'All'>('All');
  const [ttClassFilter, setTtClassFilter] = useState<string>('All');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Import Users CSV state
  const [csvText, setCsvText] = useState('');
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);

  // Approval Queue state
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'All' | RequestStatus>('Pending');
  const [approvalQueueScope, setApprovalQueueScope] = useState<'management' | 'all'>('management');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  // Add / Edit Timetable Period form state
  const [showTtForm, setShowTtForm] = useState(false);
  const [editingTtId, setEditingTtId] = useState<string | null>(null);
  const [ttDay, setTtDay] = useState<DayOfWeek>('Monday');
  const [ttPeriod, setTtPeriod] = useState<number>(1);
  const [ttStartTime, setTtStartTime] = useState('09:00 AM');
  const [ttEndTime, setTtEndTime] = useState('09:50 AM');
  const [ttSubjectCode, setTtSubjectCode] = useState('CS3401');
  const [ttSubjectName, setTtSubjectName] = useState('Algorithms & Data Structures');
  const [ttClassName, setTtClassName] = useState('ME CSE Year 1');
  const [ttDepartment, setTtDepartment] = useState('Computer Science & Engineering');
  const [ttStaffUid, setTtStaffUid] = useState('staff-1');
  const [ttRoom, setTtRoom] = useState('PG-102');
  const [ttRadius, setTtRadius] = useState(250);
  const [savingTt, setSavingTt] = useState(false);

  // Add Campus User form state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<EffectiveRole>('student');
  const [newGender, setNewGender] = useState<Gender>('Girl');
  const [newDept, setNewDept] = useState('Computer Science & Engineering');
  const [newProgramLevel, setNewProgramLevel] = useState<ProgramLevel>('UG');
  const [newAcademicYear, setNewAcademicYear] = useState('Year 1');
  const [newRollNumber, setNewRollNumber] = useState('');
  const [newClass, setNewClass] = useState(() =>
    deriveClassName('UG', 'Computer Science & Engineering', 'Year 1')
  );
  const [newRegNo, setNewRegNo] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newGuardianName, setNewGuardianName] = useState('');
  const [newGuardianPhone, setNewGuardianPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newBloodGroup, setNewBloodGroup] = useState('');
  const [newMedicalNotes, setNewMedicalNotes] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  if (!currentUser || currentUser.role !== 'management' || currentUser.active === false) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900">Management Access Only</h2>
        <p className="text-sm text-slate-600 mt-1">
          Only active Management accounts can view institutional metrics and manage campus roles.
        </p>
      </div>
    );
  }

  const parsedCsv = useMemo(() => {
    if (!csvText.trim()) return null;
    return parseMasterUsersCsv(csvText, currentUser.uid);
  }, [csvText, currentUser.uid]);

  const mgmtPendingCount = useMemo(
    () =>
      state.approvalRequests.filter(
        (r) => r.targetQueue === 'management' && r.status === 'Pending'
      ).length,
    [state.approvalRequests]
  );

  const filteredMasterRegistry = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...state.masterRegistry]
      .sort((a, b) => a.registerOrStaffId.localeCompare(b.registerOrStaffId))
      .filter((m) => {
        if (!query) return true;
        return (
          m.registerOrStaffId.toLowerCase().includes(query) ||
          m.name.toLowerCase().includes(query) ||
          m.email.toLowerCase().includes(query) ||
          m.department.toLowerCase().includes(query) ||
          m.role.toLowerCase().includes(query)
        );
      });
  }, [state.masterRegistry, search]);

  const filteredApprovals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...state.approvalRequests]
      .filter((r) => {
        if (approvalQueueScope === 'management' && r.targetQueue !== 'management') return false;
        if (approvalStatusFilter !== 'All' && r.status !== approvalStatusFilter) return false;
        if (!query) return true;
        return (
          r.requesterName.toLowerCase().includes(query) ||
          r.requesterEmail.toLowerCase().includes(query) ||
          (r.requesterRegisterNo || '').toLowerCase().includes(query) ||
          r.requesterDepartment.toLowerCase().includes(query) ||
          r.reason.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.approvalRequests, approvalQueueScope, approvalStatusFilter, search]);

  const todayStr = getTodayIso();
  const students = state.users.filter((u) => u.role === 'student');
  const staff = state.users.filter((u) => u.role === 'staff');
  const hostelResidents = state.users.filter((u) => u.isHostel);

  // Today's student attendance %
  const todayAtt = state.attendanceRecords.filter((r) => r.date === todayStr);
  const attBaseline = todayAtt.length > 0 ? todayAtt : state.attendanceRecords;
  const studentAttPct =
    attBaseline.length > 0
      ? Math.round(
          (attBaseline.filter((r) => r.status === 'Present').length / attBaseline.length) * 100
        )
      : 0;

  // Staff present / absent today
  const todayCheckinUids = new Set(
    state.staffCheckins.filter((c) => c.date === todayStr).map((c) => c.staffUid)
  );
  const staffPresentCount = staff.filter((s) => todayCheckinUids.has(s.uid)).length;
  const staffAbsentCount = staff.length - staffPresentCount;

  // Hostel In / Out / Leave
  const hostelIn = hostelResidents.filter((r) => (r.hostelStatus || 'In') === 'In').length;
  const hostelOut = hostelResidents.filter((r) => r.hostelStatus === 'Out').length;
  const hostelLeave = hostelResidents.filter((r) => r.hostelStatus === 'Leave').length;

  // Canteen orders today
  const todayOrders = state.canteenOrders.filter((o) => o.placedAt.startsWith(todayStr));

  // Filtered tables
  const q = search.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    return state.users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q) ||
        (u.registerNumber || '').toLowerCase().includes(q) ||
        (u.rollNumber || '').toLowerCase().includes(q) ||
        (u.programLevel || '').toLowerCase().includes(q) ||
        (u.academicYear || '').toLowerCase().includes(q)
      );
    });
  }, [state.users, roleFilter, q]);

  const filteredStaff = useMemo(() => {
    return staff.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.department.toLowerCase().includes(q)
    );
  }, [staff, q]);

  const filteredHostel = useMemo(() => {
    return hostelResidents.filter((r) => {
      if (hostelWingFilter !== 'All' && getUserHostelType(r) !== hostelWingFilter) return false;
      const st = r.hostelStatus || 'In';
      if (hostelStatusFilter !== 'All' && st !== hostelStatusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.roomNumber || '').toLowerCase().includes(q) ||
        (r.className || '').toLowerCase().includes(q) ||
        (getUserHostelType(r) || '').toLowerCase().includes(q)
      );
    });
  }, [hostelResidents, hostelWingFilter, hostelStatusFilter, q]);

  const filteredOrders = useMemo(() => {
    return state.canteenOrders.filter((o) => {
      if (canteenStatusFilter !== 'All' && o.status !== canteenStatusFilter) return false;
      if (!q) return true;
      return (
        o.userName.toLowerCase().includes(q) ||
        String(o.tokenNumber).includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [state.canteenOrders, canteenStatusFilter, q]);

  const filteredRooms = useMemo(() => {
    return state.hostelRooms.filter((rm) => {
      if (hostelWingFilter !== 'All' && rm.hostelType !== hostelWingFilter) return false;
      if (!q) return true;
      return (
        rm.roomNumber.toLowerCase().includes(q) ||
        rm.block.toLowerCase().includes(q) ||
        rm.hostelType.toLowerCase().includes(q)
      );
    });
  }, [state.hostelRooms, hostelWingFilter, q]);

  const timetableClasses = useMemo(() => {
    const set = new Set<string>();
    state.timetableSessions.forEach((t) => set.add(t.className));
    return Array.from(set).sort();
  }, [state.timetableSessions]);

  const filteredTimetable = useMemo(() => {
    return state.timetableSessions
      .filter((t) => {
        if (ttDayFilter !== 'All' && t.day !== ttDayFilter) return false;
        if (ttClassFilter !== 'All' && t.className !== ttClassFilter) return false;
        if (!q) return true;
        return (
          t.subjectCode.toLowerCase().includes(q) ||
          t.subjectName.toLowerCase().includes(q) ||
          t.className.toLowerCase().includes(q) ||
          t.staffName.toLowerCase().includes(q) ||
          t.room.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const dayDiff = (DAY_ORDER[a.day] || 9) - (DAY_ORDER[b.day] || 9);
        if (dayDiff !== 0) return dayDiff;
        if (a.period !== b.period) return a.period - b.period;
        return a.className.localeCompare(b.className);
      });
  }, [state.timetableSessions, ttDayFilter, ttClassFilter, q]);

  const resetTimetableForm = () => {
    setEditingTtId(null);
    setTtDay('Monday');
    setTtPeriod(1);
    setTtStartTime(PERIOD_TIMES[1].start);
    setTtEndTime(PERIOD_TIMES[1].end);
    setTtSubjectCode('CS3401');
    setTtSubjectName('Algorithms & Data Structures');
    setTtClassName('ME CSE Year 1');
    setTtDepartment('Computer Science & Engineering');
    setTtStaffUid(staff[0]?.uid || currentUser.uid);
    setTtRoom('PG-102');
    setTtRadius(250);
  };

  const openEditTimetable = (tt: TimetableSession) => {
    setEditingTtId(tt.id);
    setTtDay(tt.day);
    setTtPeriod(tt.period);
    setTtStartTime(tt.startTime);
    setTtEndTime(tt.endTime);
    setTtSubjectCode(tt.subjectCode);
    setTtSubjectName(tt.subjectName);
    setTtClassName(tt.className);
    setTtDepartment(tt.department);
    setTtStaffUid(tt.staffUid);
    setTtRoom(tt.room);
    setTtRadius(tt.radiusMeters || 250);
    setShowTtForm(true);
  };

  const handleSaveTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTt(true);
    try {
      const assigned = staff.find((s) => s.uid === ttStaffUid) || currentUser;
      const saved = await upsertTimetableSession({
        id: editingTtId || undefined,
        day: ttDay,
        period: ttPeriod,
        startTime: ttStartTime,
        endTime: ttEndTime,
        subjectCode: ttSubjectCode,
        subjectName: ttSubjectName,
        className: ttClassName,
        department: ttDepartment,
        staffUid: assigned.uid,
        staffName: assigned.name,
        room: ttRoom,
        radiusMeters: ttRadius,
      });
      setActionMsg(
        `${editingTtId ? 'Updated' : 'Added'} ${saved.subjectCode} (${saved.className} · ${saved.day} Period ${saved.period}).`
      );
      resetTimetableForm();
      setShowTtForm(false);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Unable to save timetable period.');
    } finally {
      setSavingTt(false);
    }
  };

  const pendingRoleUsers = useMemo(
    () =>
      state.users.filter(
        (u) => u.requestedRole && u.requestedRole !== getEffectiveRole(u)
      ),
    [state.users]
  );

  const handleApproveRequestedRole = async (target: UserProfile) => {
    if (!target.requestedRole) return;
    const requested = target.requestedRole;
    await updateUserRoleAndFlags(target.uid, {
      ...mapEffectiveRoleToFlags(requested),
      gender: getUserGender(target),
    });
    setActionMsg(
      `Approved ${target.name} as ${formatRequestedRole(requested)}.`
    );
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;
    const isStudentRole = newRole === 'student' || newRole === 'hostel_resident';
    setCreatingUser(true);
    try {
      const created = await createCampusUser({
        name: newName,
        email: newEmail,
        selectedRole: newRole,
        gender: newGender,
        department: newDept,
        programLevel: isStudentRole ? newProgramLevel : undefined,
        academicYear: isStudentRole ? newAcademicYear : undefined,
        rollNumber: isStudentRole ? newRollNumber : undefined,
        className: newClass,
        registerNumber: newRegNo,
        roomId: newRoomId || undefined,
        phone: newPhone,
        guardianName: newGuardianName,
        guardianPhone: newGuardianPhone,
        address: newAddress,
        bloodGroup: newBloodGroup,
        medicalNotes: newMedicalNotes,
      });
      setActionMsg(
        `Added ${created.name} (${formatRequestedRole(newRole)}${
          created.hostelType ? ` · ${created.hostelType}` : ''
        }) to ${dataMode === 'firebase' ? 'Cloud Firestore' : 'Local Demo Store'}.`
      );
      setNewName('');
      setNewEmail('');
      setNewProgramLevel('UG');
      setNewAcademicYear('Year 1');
      setNewRollNumber('');
      setNewClass(deriveClassName('UG', newDept, 'Year 1'));
      setNewRegNo('');
      setNewRoomId('');
      setNewPhone('');
      setNewGuardianName('');
      setNewGuardianPhone('');
      setNewAddress('');
      setNewBloodGroup('');
      setNewMedicalNotes('');
      setShowAddUser(false);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Unable to add user.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleSetCampusToMyGps = async () => {
    try {
      const pos = await getBrowserLocation();
      updateGeofence({
        ...state.geofence,
        lat: pos.lat,
        lng: pos.lng,
        label: 'Custom Verified Campus Location',
      });
      setActionMsg(
        `Updated campus geofence center to your current GPS (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(
          4
        )}).`
      );
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Unable to fetch GPS.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Executive KPI Grid */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-slate-500">Students & Staff</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {students.length} / {staff.length}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {hostelResidents.length} hostel residents
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-slate-500">Student Attendance</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {studentAttPct}%
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {todayAtt.length > 0 ? "Today's sessions" : '4-week average'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-slate-500">Staff Today</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {staffPresentCount} Present
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {staffAbsentCount} Absent / Pending
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-slate-500">Hostel Roll Call</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {hostelIn} In
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {hostelOut} Out · {hostelLeave} Leave
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 col-span-2 md:col-span-1">
          <div className="text-xs font-medium text-slate-500">Canteen Orders Today</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
            {todayOrders.length}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            ₹{todayOrders.reduce((s, o) => s + o.totalAmount, 0)} revenue
          </div>
        </div>
      </section>

      {/* Utility Bar: Campus Geofence + Firestore Seed / Demo Reset */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Campus Geofence:</span>{' '}
          <span className="font-mono text-xs tabular-nums">
            {state.geofence.lat.toFixed(4)}, {state.geofence.lng.toFixed(4)} ({state.geofence.radiusMeters}m)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveScreen('audit')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 inline-flex items-center gap-1.5"
          >
            <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
            <span>Audit Log ({state.auditLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={handleSetCampusToMyGps}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 inline-flex items-center gap-1.5"
          >
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            <span>Set Campus GPS to Here</span>
          </button>

          {dataMode === 'firebase' ? (
            <button
              type="button"
              disabled={seeding}
              onClick={async () => {
                setSeeding(true);
                try {
                  await seedCloudFirestore();
                  setActionMsg('Seeded PSNA Connect campus records into Cloud Firestore.');
                } finally {
                  setSeeding(false);
                }
              }}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{seeding ? 'Seeding Firestore...' : 'Seed Firestore Data'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                resetDemoData();
                setActionMsg('Demo dataset reset to initial seed state.');
              }}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo Seed</span>
            </button>
          )}
        </div>
      </section>

      {actionMsg && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {/* Searchable, Filterable Institutional Tables */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl">
            {(
              [
                {
                  id: 'users',
                  label:
                    pendingRoleUsers.length > 0
                      ? `Users & Roles (${pendingRoleUsers.length})`
                      : 'Users & Roles',
                },
                { id: 'import', label: `Import Users (${state.masterRegistry.length})` },
                {
                  id: 'approvals',
                  label:
                    mgmtPendingCount > 0
                      ? `Approval Queue (${mgmtPendingCount})`
                      : 'Approval Queue',
                },
                { id: 'timetable', label: 'Class Timetable' },
                { id: 'staff', label: 'Staff Attendance' },
                { id: 'hostel', label: 'Hostel Attendance' },
                { id: 'canteen', label: 'Canteen Orders' },
                { id: 'rooms', label: 'Hostel Rooms' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, room, dept..."
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm"
              />
            </div>

            {tab === 'users' && (
              <div className="flex items-center gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as 'all' | BaseRole)}
                  className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-white"
                >
                  <option value="all">All Roles</option>
                  <option value="student">Students</option>
                  <option value="staff">Staff</option>
                  <option value="management">Management</option>
                </select>
                <button
                  type="button"
                  onClick={() => setShowAddUser((v) => !v)}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add User</span>
                </button>
              </div>
            )}

            {(tab === 'hostel' || tab === 'rooms') && (
              <div className="flex items-center gap-2">
                <select
                  value={hostelWingFilter}
                  onChange={(e) => setHostelWingFilter(e.target.value as 'All' | HostelType)}
                  className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-white"
                >
                  <option value="All">All Hostels</option>
                  <option value="Boys Hostel">Boys Hostel (Boys Only)</option>
                  <option value="Girls Hostel">Girls Hostel (Girls Only)</option>
                </select>
                {tab === 'hostel' && (
                  <select
                    value={hostelStatusFilter}
                    onChange={(e) => setHostelStatusFilter(e.target.value)}
                    className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-white"
                  >
                    <option value="All">All Statuses</option>
                    <option value="In">In</option>
                    <option value="Out">Out</option>
                    <option value="Leave">Leave</option>
                  </select>
                )}
              </div>
            )}

            {tab === 'canteen' && (
              <select
                value={canteenStatusFilter}
                onChange={(e) => setCanteenStatusFilter(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-white"
              >
                <option value="All">All Statuses</option>
                <option value="Placed">Placed</option>
                <option value="Preparing">Preparing</option>
                <option value="Ready">Ready</option>
                <option value="Collected">Collected</option>
              </select>
            )}

            {tab === 'timetable' && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={ttDayFilter}
                  onChange={(e) => setTtDayFilter(e.target.value as DayOfWeek | 'All')}
                  className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-white"
                >
                  <option value="All">All Days</option>
                  {TIMETABLE_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  value={ttClassFilter}
                  onChange={(e) => setTtClassFilter(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-medium bg-white"
                >
                  <option value="All">All Classes</option>
                  {timetableClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (showTtForm && !editingTtId) {
                      setShowTtForm(false);
                    } else {
                      resetTimetableForm();
                      setShowTtForm(true);
                    }
                  }}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Class Period</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Table 1: Users & Role Management */}
        {tab === 'users' && (
          <div className="space-y-4">
            {showAddUser && (
              <form
                onSubmit={handleCreateUser}
                className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Add New Campus User
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Creates a directory profile and private contact/medical record in{' '}
                      {dataMode === 'firebase' ? 'Cloud Firestore' : 'Local Demo Store'}.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Subashree R"
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="name@psnacet.edu.in"
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Role
                    </label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as EffectiveRole)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    >
                      <option value="student">Student</option>
                      <option value="hostel_resident">Hostel Resident</option>
                      <option value="staff">Staff</option>
                      <option value="warden">Warden</option>
                      <option value="management">Management</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Gender {newRole === 'hostel_resident' || newRole === 'warden' ? '(Sets Hostel Wing)' : ''}
                    </label>
                    <select
                      value={newGender}
                      onChange={(e) => {
                        setNewGender(e.target.value as Gender);
                        setNewRoomId('');
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    >
                      <option value="Girl">Girl / Female ({getHostelTypeForGender('Girl')})</option>
                      <option value="Boy">Boy / Male ({getHostelTypeForGender('Boy')})</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      required
                      value={newDept}
                      onChange={(e) => {
                        const dept = e.target.value;
                        setNewDept(dept);
                        setNewClass(deriveClassName(newProgramLevel, dept, newAcademicYear));
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>

                  {(newRole === 'student' || newRole === 'hostel_resident') && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Program (UG / PG)
                        </label>
                        <select
                          value={newProgramLevel}
                          onChange={(e) => {
                            const lvl = e.target.value as ProgramLevel;
                            const nextYr =
                              lvl === 'PG' && (newAcademicYear === 'Year 3' || newAcademicYear === 'Year 4')
                                ? 'Year 1'
                                : newAcademicYear;
                            setNewProgramLevel(lvl);
                            setNewAcademicYear(nextYr);
                            setNewClass(deriveClassName(lvl, newDept, nextYr));
                          }}
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                        >
                          <option value="UG">UG (Undergraduate)</option>
                          <option value="PG">PG (Postgraduate)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Year
                        </label>
                        <select
                          value={newAcademicYear}
                          onChange={(e) => {
                            const yr = e.target.value;
                            setNewAcademicYear(yr);
                            setNewClass(deriveClassName(newProgramLevel, newDept, yr));
                          }}
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                        >
                          {(newProgramLevel === 'PG'
                            ? ['Year 1', 'Year 2']
                            : ['Year 1', 'Year 2', 'Year 3', 'Year 4']
                          ).map((yr) => (
                            <option key={yr} value={yr}>
                              {yr}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Roll Number
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={32}
                          value={newRollNumber}
                          onChange={(e) => setNewRollNumber(e.target.value.toUpperCase())}
                          placeholder={newProgramLevel === 'PG' ? 'e.g. 26MCSE012' : 'e.g. 24CSE042'}
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Class
                        </label>
                        <input
                          type="text"
                          value={newClass}
                          onChange={(e) => setNewClass(e.target.value)}
                          placeholder="e.g. III CSE A"
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Register Number
                        </label>
                        <input
                          type="text"
                          value={newRegNo}
                          onChange={(e) => setNewRegNo(e.target.value)}
                          placeholder="Auto-generated if blank"
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono"
                        />
                      </div>
                    </>
                  )}

                  {newRole === 'hostel_resident' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Assign {getHostelTypeForGender(newGender)} Room
                      </label>
                      <select
                        value={newRoomId}
                        onChange={(e) => setNewRoomId(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                      >
                        <option value="">Unassigned ({getHostelTypeForGender(newGender)})</option>
                        {state.hostelRooms
                          .filter(
                            (r) =>
                              r.hostelType === getHostelTypeForGender(newGender) &&
                              r.occupantUids.length < r.capacity
                          )
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.roomNumber} · {r.block} ({r.occupantUids.length}/{r.capacity})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Phone (optional)
                    </label>
                    <input
                      type="text"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="+91 98000 00000"
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>

                  {newRole === 'hostel_resident' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Guardian Name
                        </label>
                        <input
                          type="text"
                          value={newGuardianName}
                          onChange={(e) => setNewGuardianName(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Guardian Phone
                        </label>
                        <input
                          type="text"
                          value={newGuardianPhone}
                          onChange={(e) => setNewGuardianPhone(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Blood Group
                        </label>
                        <input
                          type="text"
                          value={newBloodGroup}
                          onChange={(e) => setNewBloodGroup(e.target.value)}
                          placeholder="e.g. O+"
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Home Address
                        </label>
                        <input
                          type="text"
                          value={newAddress}
                          onChange={(e) => setNewAddress(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Medical Notes
                        </label>
                        <input
                          type="text"
                          value={newMedicalNotes}
                          onChange={(e) => setNewMedicalNotes(e.target.value)}
                          placeholder="Allergies or clinic notes"
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddUser(false)}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium"
                  >
                    {creatingUser ? 'Saving User...' : 'Save Campus User'}
                  </button>
                </div>
              </form>
            )}

            {pendingRoleUsers.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Pending Role Sign-Up Requests ({pendingRoleUsers.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {pendingRoleUsers.map((u) => (
                    <div
                      key={u.uid}
                      className="rounded-xl bg-white border border-amber-200 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{u.name}</div>
                        <div className="text-xs text-slate-500 truncate">
                          {u.department} · Requested{' '}
                          <span className="font-semibold text-blue-700">
                            {formatRequestedRole(u.requestedRole!)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApproveRequestedRole(u)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shrink-0 transition-colors"
                      >
                        Approve
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2.5 pr-4 font-medium">User</th>
                    <th className="py-2.5 pr-4 font-medium">Department / Class</th>
                    <th className="py-2.5 pr-4 font-medium">Gender / Wing</th>
                    <th className="py-2.5 pr-4 font-medium">Base Role</th>
                    <th className="py-2.5 pr-4 font-medium">Hostel Flag</th>
                    <th className="py-2.5 pr-4 font-medium">Warden Flag</th>
                    <th className="py-2.5 font-medium">Account Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => {
                    const hasPendingRequest =
                      Boolean(u.requestedRole) && u.requestedRole !== getEffectiveRole(u);
                    const userGender = getUserGender(u);
                    const wing = getUserHostelType(u);
                    const isActiveAccount = u.active !== false;
                    return (
                      <tr key={u.uid} className={!isActiveAccount ? 'bg-slate-50/70' : undefined}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{u.name}</span>
                            {!isActiveAccount && (
                              <span className="px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-[10px] font-semibold text-red-700">
                                Deactivated
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-slate-500 tabular-nums">
                            {u.rollNumber || u.registerNumber || u.uid}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          <div>{u.department}</div>
                          {(u.programLevel || u.className) && (
                            <div className="text-xs text-slate-500">
                              {u.programLevel
                                ? `${u.programLevel}${u.academicYear ? ` · ${u.academicYear}` : ''}${
                                    u.className ? ` · ${u.className}` : ''
                                  }`
                                : u.className}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            aria-label={`Gender for ${u.name}`}
                            value={userGender}
                            onChange={(e) =>
                              updateUserRoleAndFlags(u.uid, {
                                role: u.role,
                                isHostel: u.isHostel,
                                isWarden: u.isWarden,
                                gender: e.target.value as Gender,
                              })
                            }
                            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium"
                          >
                            <option value="Girl">Girl</option>
                            <option value="Boy">Boy</option>
                          </select>
                          {wing && (
                            <div className="text-[11px] text-blue-700 font-medium mt-0.5">{wing}</div>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            aria-label={`Role for ${u.name}`}
                            value={u.role}
                            onChange={(e) =>
                              updateUserRoleAndFlags(u.uid, {
                                role: e.target.value as BaseRole,
                                isHostel: u.isHostel,
                                isWarden: u.isWarden,
                                gender: userGender,
                              })
                            }
                            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium"
                          >
                            <option value="student">Student</option>
                            <option value="staff">Staff</option>
                            <option value="management">Management</option>
                          </select>
                        </td>
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            disabled={u.role !== 'student'}
                            onClick={() =>
                              updateUserRoleAndFlags(u.uid, {
                                role: u.role,
                                isHostel: !u.isHostel,
                                isWarden: u.isWarden,
                                gender: userGender,
                              })
                            }
                            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-40 ${
                              u.isHostel
                                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {u.isHostel ? 'Hostel: Yes' : 'Hostel: No'}
                          </button>
                        </td>
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            disabled={u.role !== 'staff'}
                            onClick={() =>
                              updateUserRoleAndFlags(u.uid, {
                                role: u.role,
                                isHostel: u.isHostel,
                                isWarden: !u.isWarden,
                                gender: userGender,
                              })
                            }
                            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-40 ${
                              u.isWarden
                                ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {u.isWarden ? 'Warden: Yes' : 'Warden: No'}
                          </button>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {hasPendingRequest && u.requestedRole && (
                              <button
                                type="button"
                                onClick={() => handleApproveRequestedRole(u)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
                              >
                                Approve {formatRequestedRole(u.requestedRole)}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={u.uid === currentUser.uid && isActiveAccount}
                              onClick={async () => {
                                try {
                                  await setUserActiveStatus(u.uid, !isActiveAccount);
                                  setActionMsg(
                                    `${u.name} has been ${
                                      !isActiveAccount ? 'reactivated' : 'deactivated'
                                    }.`
                                  );
                                } catch (err) {
                                  setActionMsg(
                                    err instanceof Error
                                      ? err.message
                                      : 'Unable to update user status.'
                                  );
                                }
                              }}
                              className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1 disabled:opacity-40 transition-colors ${
                                isActiveAccount
                                  ? 'border-red-200 bg-red-50 hover:bg-red-100 text-red-700'
                                  : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isActiveAccount ? (
                                <>
                                  <UserX className="w-3.5 h-3.5" />
                                  <span>Deactivate</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Reactivate</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Table 1B: Import Users (CSV Master Directory) */}
        {tab === 'import' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    <span>Import Pre-Approved Campus Users (CSV)</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Expected columns:{' '}
                    <span className="font-mono text-slate-800">
                      register no/staff ID, name, email, department, year, gender, hostel Y/N, warden Y/N
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCsvText(SAMPLE_MASTER_CSV);
                      setCsvFileName('sample_master_users.csv');
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
                  >
                    Load Sample CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([SAMPLE_MASTER_CSV], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'psna_master_users_template.csv';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Template</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white hover:border-blue-400 p-5 cursor-pointer transition-colors text-center">
                  <Upload className="w-6 h-6 text-blue-600 mb-2" />
                  <span className="text-xs font-semibold text-slate-900">
                    {csvFileName ? `Selected: ${csvFileName}` : 'Choose .csv File to Preview'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Validates @psnacet.edu.in emails &amp; conflicts before import
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setCsvFileName(file.name);
                      const reader = new FileReader();
                      reader.onload = () => {
                        setCsvText(String(reader.result || ''));
                      };
                      reader.readAsText(file);
                    }}
                  />
                </label>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    CSV Content (Upload above or paste directly)
                  </label>
                  <textarea
                    rows={5}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="register no/staff ID,name,email,department,year,gender,hostel,warden"
                    className="w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900"
                  />
                </div>
              </div>

              {parsedCsv && (
                <div className="space-y-4 pt-2 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
                        {parsedCsv.rows.length} Valid Record(s)
                      </span>
                      {parsedCsv.errors.length > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700 font-semibold">
                          {parsedCsv.errors.length} Error(s)
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={importingCsv || parsedCsv.rows.length === 0}
                      onClick={async () => {
                        if (!parsedCsv || parsedCsv.rows.length === 0) return;
                        setImportingCsv(true);
                        try {
                          const res = await importMasterRegistryBatch(parsedCsv.rows);
                          setActionMsg(
                            `Imported master records: ${res.created} created, ${res.updated} updated.`
                          );
                          setCsvText('');
                          setCsvFileName(null);
                        } catch (err) {
                          setActionMsg(
                            err instanceof Error ? err.message : 'Failed to import CSV records.'
                          );
                        } finally {
                          setImportingCsv(false);
                        }
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {importingCsv
                          ? 'Importing...'
                          : `Import ${parsedCsv.rows.length} Valid Record(s)`}
                      </span>
                    </button>
                  </div>

                  {parsedCsv.errors.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
                      <div className="text-xs font-semibold text-red-900 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <span>Validation Errors (Skipped Rows)</span>
                      </div>
                      <ul className="space-y-1 text-xs text-red-800 max-h-40 overflow-y-auto">
                        {parsedCsv.errors.map((err, idx) => (
                          <li key={`${err.rowNumber}-${idx}`} className="font-mono">
                            Row {err.rowNumber}: {err.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {parsedCsv.rows.length > 0 && (
                    <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl p-3">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Import Preview ({parsedCsv.rows.length} rows)
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2 pr-3 font-medium">ID</th>
                            <th className="py-2 pr-3 font-medium">Name</th>
                            <th className="py-2 pr-3 font-medium">Email</th>
                            <th className="py-2 pr-3 font-medium">Role</th>
                            <th className="py-2 pr-3 font-medium">Dept / Year</th>
                            <th className="py-2 pr-3 font-medium">Gender</th>
                            <th className="py-2 pr-3 font-medium">Hostel</th>
                            <th className="py-2 font-medium">Warden</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedCsv.rows.map((m) => (
                            <tr key={m.id}>
                              <td className="py-2 pr-3 font-mono font-semibold text-slate-900">
                                {m.registerOrStaffId}
                              </td>
                              <td className="py-2 pr-3 text-slate-900">{m.name}</td>
                              <td className="py-2 pr-3 text-slate-600">{m.email}</td>
                              <td className="py-2 pr-3 capitalize text-blue-700 font-medium">
                                {m.role}
                              </td>
                              <td className="py-2 pr-3 text-slate-700">
                                {m.department} ({m.year})
                              </td>
                              <td className="py-2 pr-3">{m.gender}</td>
                              <td className="py-2 pr-3">
                                {m.isHostel ? `Yes (${m.hostelType})` : 'No'}
                              </td>
                              <td className="py-2">
                                {m.isWarden ? `Yes (${m.hostelType})` : 'No'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Existing Pre-Approved Master Directory */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Pre-Approved Master Directory ({filteredMasterRegistry.length})
                </h3>
                <span className="text-xs text-slate-500">
                  Only listed @psnacet.edu.in + ID pairs can register
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Register / Staff ID</th>
                      <th className="py-2.5 pr-4 font-medium">Name &amp; Email</th>
                      <th className="py-2.5 pr-4 font-medium">Role &amp; Flags</th>
                      <th className="py-2.5 pr-4 font-medium">Department / Year</th>
                      <th className="py-2.5 pr-4 font-medium">Gender</th>
                      <th className="py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMasterRegistry.map((m) => (
                      <tr key={m.id}>
                        <td className="py-3 pr-4 font-mono font-semibold text-slate-900">
                          {m.registerOrStaffId}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-900">{m.name}</div>
                          <div className="text-slate-500">{m.email}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="capitalize font-medium text-blue-700">{m.role}</span>
                          {m.isHostel && (
                            <span className="ml-1.5 text-slate-600">· Hostel ({m.hostelType})</span>
                          )}
                          {m.isWarden && (
                            <span className="ml-1.5 text-indigo-700">· Warden ({m.hostelType})</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          <div>{m.department}</div>
                          <div className="text-slate-500">
                            {m.className ? `${m.className} (${m.year})` : m.year}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{m.gender}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                                m.active
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}
                            >
                              {m.active ? 'Active' : 'Disabled'}
                            </span>
                            {m.claimedUid && (
                              <span className="px-2 py-0.5 rounded border bg-slate-100 border-slate-200 text-slate-600 text-[11px]">
                                Claimed
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Table 1C: Management Approval Queue */}
        {tab === 'approvals' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {(['Pending', 'Approved', 'Rejected', 'All'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setApprovalStatusFilter(st)}
                    className={`min-h-[34px] px-3 py-1 rounded-xl border text-xs font-medium transition-colors ${
                      approvalStatusFilter === st
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setApprovalQueueScope('management')}
                  className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium ${
                    approvalQueueScope === 'management'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  Staff &amp; Warden Queue
                </button>
                <button
                  type="button"
                  onClick={() => setApprovalQueueScope('all')}
                  className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium ${
                    approvalQueueScope === 'all'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  All Queues (incl. Hostel)
                </button>
              </div>
            </div>

            {filteredApprovals.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No {approvalStatusFilter === 'All' ? '' : approvalStatusFilter.toLowerCase()}{' '}
                approval requests match your filter.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredApprovals.map((req) => {
                  const badge =
                    req.status === 'Approved'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : req.status === 'Rejected'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200';
                  const StatusIcon =
                    req.status === 'Approved'
                      ? CheckCircle2
                      : req.status === 'Rejected'
                      ? XCircle
                      : Clock;
                  return (
                    <div
                      key={req.id}
                      className="rounded-xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {req.requesterName}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${badge}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            <span>{req.status}</span>
                          </span>
                          <span className="text-xs font-medium text-blue-700">
                            Requested: {formatRequestedRole(req.requestType)}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            · Queue:{' '}
                            {req.targetQueue === 'warden'
                              ? `${req.targetHostelType || 'Hostel'} Warden`
                              : 'Management'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {req.requesterRegisterNo ? `${req.requesterRegisterNo} · ` : ''}
                          {req.requesterEmail} · {req.requesterDepartment} ({req.requesterGender})
                        </div>
                        <div className="text-xs text-slate-700 pt-1">{req.reason}</div>
                        {req.reviewedAt && (
                          <div className="text-[11px] text-slate-500">
                            {req.status} by {req.reviewedByName} on{' '}
                            {new Date(req.reviewedAt).toLocaleString()}
                            {req.reviewNote ? ` · "${req.reviewNote}"` : ''}
                          </div>
                        )}
                      </div>

                      {req.status === 'Pending' && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                          <input
                            type="text"
                            value={reviewNotes[req.id] || ''}
                            onChange={(e) =>
                              setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                            placeholder="Optional review note..."
                            className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900 w-full sm:w-48"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await reviewApprovalRequest(
                                  req.id,
                                  'Approved',
                                  reviewNotes[req.id]
                                );
                                setActionMsg(
                                  `Approved ${req.requesterName} for ${formatRequestedRole(
                                    req.requestType
                                  )}.`
                                );
                              } catch (err) {
                                setActionMsg(
                                  err instanceof Error ? err.message : 'Approval failed.'
                                );
                              }
                            }}
                            className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await reviewApprovalRequest(
                                  req.id,
                                  'Rejected',
                                  reviewNotes[req.id]
                                );
                                setActionMsg(
                                  `Rejected ${formatRequestedRole(req.requestType)} request for ${
                                    req.requesterName
                                  }.`
                                );
                              } catch (err) {
                                setActionMsg(
                                  err instanceof Error ? err.message : 'Rejection failed.'
                                );
                              }
                            }}
                            className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-medium"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Table 2: Staff Attendance */}
        {tab === 'staff' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Staff Member</th>
                  <th className="py-2.5 pr-4 font-medium">Department</th>
                  <th className="py-2.5 pr-4 font-medium">Today Status</th>
                  <th className="py-2.5 font-medium">Check-in Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((s) => {
                  const chk = state.staffCheckins.find(
                    (c) => c.staffUid === s.uid && c.date === todayStr
                  );
                  return (
                    <tr key={s.uid}>
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        {s.name} {s.isWarden ? '· Warden' : ''}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{s.department}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`text-xs font-semibold ${
                            chk ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {chk ? 'Present' : 'Absent / Pending'}
                        </span>
                      </td>
                      <td className="py-3 text-xs font-mono text-slate-500 tabular-nums">
                        {chk ? `${chk.checkinTime} (${chk.distanceMeters}m)` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table 3: Hostel Attendance */}
        {tab === 'hostel' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Resident</th>
                  <th className="py-2.5 pr-4 font-medium">Hostel Wing</th>
                  <th className="py-2.5 pr-4 font-medium">Class</th>
                  <th className="py-2.5 pr-4 font-medium">Room & Block</th>
                  <th className="py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHostel.map((r) => (
                  <tr key={r.uid}>
                    <td className="py-3 pr-4 font-medium text-slate-900">{r.name}</td>
                    <td className="py-3 pr-4 text-xs font-medium text-blue-700">
                      {getUserHostelType(r) || 'Hostel'} ({getUserGender(r)})
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{r.className}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {r.roomNumber || 'Unassigned'} · {r.block || 'Hostel'}
                    </td>
                    <td className="py-3 font-medium text-slate-900">{r.hostelStatus || 'In'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table 4: Canteen Orders */}
        {tab === 'canteen' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Token</th>
                  <th className="py-2.5 pr-4 font-medium">User</th>
                  <th className="py-2.5 pr-4 font-medium">Items</th>
                  <th className="py-2.5 pr-4 font-medium">Total</th>
                  <th className="py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 pr-4 font-mono font-semibold tabular-nums">
                      #{o.tokenNumber}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-900">{o.userName}</div>
                      <div className="text-xs text-slate-500">{o.userRole}</div>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      {o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}
                    </td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">₹{o.totalAmount}</td>
                    <td className="py-3 font-medium text-blue-700">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table 5: Hostel Rooms */}
        {tab === 'rooms' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Room</th>
                  <th className="py-2.5 pr-4 font-medium">Hostel Wing</th>
                  <th className="py-2.5 pr-4 font-medium">Block & Floor</th>
                  <th className="py-2.5 pr-4 font-medium">Occupancy</th>
                  <th className="py-2.5 font-medium">Occupants</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRooms.map((rm) => {
                  const occ = hostelResidents.filter((u) => rm.occupantUids.includes(u.uid));
                  return (
                    <tr key={rm.id}>
                      <td className="py-3 pr-4 font-mono font-semibold text-slate-900">
                        {rm.roomNumber}
                      </td>
                      <td className="py-3 pr-4 text-xs font-medium text-blue-700">
                        {rm.hostelType} ({rm.hostelType === 'Girls Hostel' ? 'Girls Only' : 'Boys Only'})
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {rm.block} · {rm.floor}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {occ.length} / {rm.capacity}
                      </td>
                      <td className="py-3 text-slate-700">
                        {occ.length > 0 ? occ.map((u) => u.name).join(', ') : 'Vacant'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table 6: Class Timetable Management */}
        {tab === 'timetable' && (
          <div className="space-y-4">
            {showTtForm && (
              <form
                onSubmit={handleSaveTimetable}
                className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 space-y-4"
              >
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {editingTtId ? 'Edit Class Timetable Session' : 'Add Class Timetable Session'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assign class periods to faculty so students and staff can view schedules and launch live QR attendance.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Day</label>
                    <select
                      value={ttDay}
                      onChange={(e) => setTtDay(e.target.value as DayOfWeek)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    >
                      {TIMETABLE_DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Period</label>
                    <select
                      value={ttPeriod}
                      onChange={(e) => {
                        const p = Number(e.target.value);
                        setTtPeriod(p);
                        if (PERIOD_TIMES[p]) {
                          setTtStartTime(PERIOD_TIMES[p].start);
                          setTtEndTime(PERIOD_TIMES[p].end);
                        }
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                        <option key={p} value={p}>
                          Period {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Start Time</label>
                    <input
                      type="text"
                      required
                      value={ttStartTime}
                      onChange={(e) => setTtStartTime(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">End Time</label>
                    <input
                      type="text"
                      required
                      value={ttEndTime}
                      onChange={(e) => setTtEndTime(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Subject Code</label>
                    <input
                      type="text"
                      required
                      value={ttSubjectCode}
                      onChange={(e) => setTtSubjectCode(e.target.value)}
                      placeholder="CS3401"
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Subject Name</label>
                    <input
                      type="text"
                      required
                      value={ttSubjectName}
                      onChange={(e) => setTtSubjectName(e.target.value)}
                      placeholder="Algorithms & Data Structures"
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Class</label>
                    <input
                      type="text"
                      required
                      list="psna-mgmt-tt-classes"
                      value={ttClassName}
                      onChange={(e) => setTtClassName(e.target.value)}
                      placeholder="ME CSE Year 1"
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                    <datalist id="psna-mgmt-tt-classes">
                      <option value="ME CSE Year 1" />
                      <option value="III CSE A" />
                      <option value="III ECE B" />
                      <option value="III IT A" />
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                    <input
                      type="text"
                      required
                      value={ttDepartment}
                      onChange={(e) => setTtDepartment(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Assigned Faculty</label>
                    <select
                      value={ttStaffUid}
                      onChange={(e) => setTtStaffUid(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    >
                      {staff.map((s) => (
                        <option key={s.uid} value={s.uid}>
                          {s.name} ({s.department})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Room / Lab</label>
                    <input
                      type="text"
                      required
                      value={ttRoom}
                      onChange={(e) => setTtRoom(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">QR Radius (m)</label>
                    <select
                      value={ttRadius}
                      onChange={(e) => setTtRadius(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    >
                      <option value={100}>100 meters</option>
                      <option value={250}>250 meters</option>
                      <option value={500}>500 meters</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetTimetableForm();
                      setShowTtForm(false);
                    }}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingTt}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium"
                  >
                    {savingTt ? 'Saving...' : editingTtId ? 'Update Period' : 'Save Period'}
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2.5 pr-4 font-medium">Day &amp; Period</th>
                    <th className="py-2.5 pr-4 font-medium">Class &amp; Dept</th>
                    <th className="py-2.5 pr-4 font-medium">Subject</th>
                    <th className="py-2.5 pr-4 font-medium">Assigned Faculty</th>
                    <th className="py-2.5 pr-4 font-medium">Room &amp; QR</th>
                    <th className="py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTimetable.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                        No timetable sessions match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredTimetable.map((tt) => {
                      const qrLive = state.attendanceSessions.some(
                        (s) =>
                          s.active &&
                          s.subjectCode === tt.subjectCode &&
                          s.className.trim().toLowerCase() === tt.className.trim().toLowerCase()
                      );
                      return (
                        <tr key={tt.id}>
                          <td className="py-3 pr-4">
                            <div className="font-medium text-slate-900 tabular-nums">
                              {tt.day} · P{tt.period}
                            </div>
                            <div className="text-xs font-mono text-slate-500 tabular-nums">
                              {tt.startTime} – {tt.endTime}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="font-medium text-slate-900">{tt.className}</div>
                            <div className="text-xs text-slate-500">{tt.department}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="font-medium text-slate-900">
                              <span className="font-mono text-slate-700 mr-1.5">{tt.subjectCode}</span>
                              {tt.subjectName}
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-slate-700">{tt.staffName}</td>
                          <td className="py-3 pr-4">
                            <div className="text-slate-700">Room {tt.room}</div>
                            {qrLive ? (
                              <span className="text-[11px] font-semibold text-emerald-700">
                                QR Active
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">Scheduled</span>
                            )}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditTimetable(tt)}
                                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteTimetableSession(tt.id);
                                  setActionMsg(
                                    `Deleted ${tt.subjectCode} (${tt.className} · ${tt.day} Period ${tt.period}).`
                                  );
                                }}
                                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Latest Institutional Notices & Events */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-3">Latest Campus Notices</h3>
          <div className="divide-y divide-slate-100">
            {visibleNotices.slice(0, 4).map((n) => (
              <div key={n.id} className="py-3 first:pt-0 last:pb-0">
                <div className="text-xs text-slate-500 tabular-nums">
                  {n.audience} · {n.date} · {n.authorName}
                </div>
                <div className="text-sm font-medium text-slate-900 mt-0.5">{n.title}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-3">Scheduled Events</h3>
          <div className="divide-y divide-slate-100">
            {state.events.slice(0, 4).map((e) => (
              <div key={e.id} className="py-3 first:pt-0 last:pb-0">
                <div className="text-xs text-slate-500 tabular-nums">
                  {e.date} · {e.time} · {e.venue}
                </div>
                <div className="text-sm font-medium text-slate-900 mt-0.5">{e.title}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
