import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Database,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getTodayIso } from '../services/dataService';
import { BaseRole, EffectiveRole, UserProfile, getEffectiveRole } from '../types';
import { getBrowserLocation } from '../utils/geo';

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
    createCampusUser,
    updateUserRoleAndFlags,
    updateGeofence,
    seedCloudFirestore,
    resetDemoData,
  } = useApp();

  const [tab, setTab] = useState<'users' | 'staff' | 'hostel' | 'canteen' | 'rooms'>('users');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | BaseRole>('all');
  const [canteenStatusFilter, setCanteenStatusFilter] = useState<string>('All');
  const [hostelStatusFilter, setHostelStatusFilter] = useState<string>('All');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Add Campus User form state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<EffectiveRole>('student');
  const [newDept, setNewDept] = useState('Computer Science & Engineering');
  const [newClass, setNewClass] = useState('III CSE A');
  const [newRegNo, setNewRegNo] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newGuardianName, setNewGuardianName] = useState('');
  const [newGuardianPhone, setNewGuardianPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newBloodGroup, setNewBloodGroup] = useState('');
  const [newMedicalNotes, setNewMedicalNotes] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  if (!currentUser || currentUser.role !== 'management') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900">Management Access Only</h2>
        <p className="text-sm text-slate-600 mt-1">
          Only Management accounts can view institutional metrics and manage campus roles.
        </p>
      </div>
    );
  }

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
        (u.registerNumber || '').toLowerCase().includes(q)
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
      const st = r.hostelStatus || 'In';
      if (hostelStatusFilter !== 'All' && st !== hostelStatusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.roomNumber || '').toLowerCase().includes(q) ||
        (r.className || '').toLowerCase().includes(q)
      );
    });
  }, [hostelResidents, hostelStatusFilter, q]);

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
    return state.hostelRooms.filter(
      (rm) =>
        !q ||
        rm.roomNumber.toLowerCase().includes(q) ||
        rm.block.toLowerCase().includes(q)
    );
  }, [state.hostelRooms, q]);

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
    await updateUserRoleAndFlags(target.uid, mapEffectiveRoleToFlags(requested));
    setActionMsg(
      `Approved ${target.name} as ${formatRequestedRole(requested)}.`
    );
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;
    setCreatingUser(true);
    try {
      const created = await createCampusUser({
        name: newName,
        email: newEmail,
        selectedRole: newRole,
        department: newDept,
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
        `Added ${created.name} (${formatRequestedRole(newRole)}) to ${
          dataMode === 'firebase' ? 'Cloud Firestore' : 'Local Demo Store'
        }.`
      );
      setNewName('');
      setNewEmail('');
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
                      ? `Users & Roles (${pendingRoleUsers.length} pending)`
                      : 'Users & Roles',
                },
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
                      Department
                    </label>
                    <input
                      type="text"
                      required
                      value={newDept}
                      onChange={(e) => setNewDept(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                    />
                  </div>

                  {(newRole === 'student' || newRole === 'hostel_resident') && (
                    <>
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
                        Assign Hostel Room
                      </label>
                      <select
                        value={newRoomId}
                        onChange={(e) => setNewRoomId(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                      >
                        <option value="">Unassigned</option>
                        {state.hostelRooms
                          .filter((r) => r.occupantUids.length < r.capacity)
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
                    <th className="py-2.5 pr-4 font-medium">Base Role</th>
                    <th className="py-2.5 pr-4 font-medium">Hostel Flag</th>
                    <th className="py-2.5 pr-4 font-medium">Warden Flag</th>
                    <th className="py-2.5 font-medium">Role Request</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => {
                    const hasPendingRequest =
                      Boolean(u.requestedRole) && u.requestedRole !== getEffectiveRole(u);
                    return (
                      <tr key={u.uid}>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-900">{u.name}</div>
                          <div className="text-xs font-mono text-slate-500 tabular-nums">
                            {u.registerNumber || u.uid}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          <div>{u.department}</div>
                          {u.className && <div className="text-xs text-slate-500">{u.className}</div>}
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
                          {hasPendingRequest && u.requestedRole ? (
                            <button
                              type="button"
                              onClick={() => handleApproveRequestedRole(u)}
                              className="min-h-[34px] px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
                            >
                              Approve {formatRequestedRole(u.requestedRole)}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
                  <th className="py-2.5 pr-4 font-medium">Class</th>
                  <th className="py-2.5 pr-4 font-medium">Room & Block</th>
                  <th className="py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHostel.map((r) => (
                  <tr key={r.uid}>
                    <td className="py-3 pr-4 font-medium text-slate-900">{r.name}</td>
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
