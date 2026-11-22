import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BedDouble,
  CheckCircle2,
  Edit3,
  Home,
  MessageSquare,
  Plus,
  Search,
  ShieldAlert,
  Utensils,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getTodayDayName, getTodayIso } from '../services/dataService';
import { DayOfWeek, HostelMenu, HostelStatus } from '../types';

const DAYS: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export function HostelView() {
  const { currentUser } = useApp();
  if (!currentUser) return null;

  if (currentUser.isWarden || currentUser.role === 'management') {
    return <WardenHostelConsole />;
  }

  if (currentUser.isHostel) {
    return <ResidentHostelView />;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
      <ShieldAlert className="w-10 h-10 text-slate-400 mx-auto mb-3" />
      <h2 className="text-lg font-semibold text-slate-900">Hostel Access Restricted</h2>
      <p className="text-sm text-slate-600 mt-1">
        The Hostel module is accessible only to Hostel Residents, Wardens, and Management.
      </p>
    </div>
  );
}

function ResidentHostelView() {
  const {
    currentUser,
    state,
    visibleNotices,
    updateMyHostelStatus,
    setActiveScreen,
  } = useApp();

  const todayDay = getTodayDayName();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(todayDay);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  if (!currentUser) return null;

  const myRoom = state.hostelRooms.find(
    (r) =>
      r.occupantUids.includes(currentUser.uid) ||
      (currentUser.roomNumber && r.roomNumber === currentUser.roomNumber)
  );

  // Roommates: ONLY name and className (strict privacy rule!)
  const roommates = useMemo(() => {
    if (!myRoom) return [];
    return state.users.filter(
      (u) =>
        u.uid !== currentUser.uid &&
        (myRoom.occupantUids.includes(u.uid) || u.roomNumber === myRoom.roomNumber)
    );
  }, [myRoom, state.users, currentUser.uid]);

  const vacantRooms = state.hostelRooms.filter((r) => r.occupantUids.length < r.capacity);
  const selectedMenu = state.hostelMenus.find((m) => m.day === selectedDay) || state.hostelMenus[0];
  const todayMenu = state.hostelMenus.find((m) => m.day === todayDay);

  const readyMeals = todayMenu
    ? [
        todayMenu.breakfastReady ? 'Breakfast' : null,
        todayMenu.lunchReady ? 'Lunch' : null,
        todayMenu.snacksReady ? 'Snacks' : null,
        todayMenu.dinnerReady ? 'Dinner' : null,
      ].filter(Boolean)
    : [];

  const hostelNotices = visibleNotices.filter((n) => n.audience === 'Hostel');

  const handleStatusChange = async (next: HostelStatus) => {
    await updateMyHostelStatus(next);
    setStatusFeedback(`Your hostel status today is updated to "${next}".`);
  };

  return (
    <div className="space-y-6">
      {/* Green Food Ready Banner */}
      {readyMeals.length > 0 && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-emerald-950">
                Food is ready · {readyMeals.join(', ')}
              </div>
              <div className="text-xs text-emerald-800 mt-0.5">
                Marked ready by Hostel Warden for {todayDay}. Dining halls are open.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Row: Room & Roommates + Today's Hostel Status */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-blue-700">My Hostel Allotment</div>
              <h2 className="text-xl font-semibold text-slate-900 mt-0.5">
                Room {myRoom?.roomNumber || currentUser.roomNumber || 'Unassigned'} ·{' '}
                {myRoom?.block || currentUser.block || 'Hostel'}
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                {currentUser.className || 'Student'} · {currentUser.department}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveScreen('chat')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium inline-flex items-center gap-2 self-start"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Open Hostel Chat</span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2.5">
                Roommates (Name & Class)
              </h3>
              {roommates.length === 0 ? (
                <p className="text-sm text-slate-500">No roommates currently assigned.</p>
              ) : (
                <ul className="space-y-2">
                  {roommates.map((rm) => (
                    <li
                      key={rm.uid}
                      className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm"
                    >
                      <span className="font-medium text-slate-900">{rm.name}</span>
                      <span className="text-xs text-slate-500">{rm.className || 'Resident'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2.5">
                Vacant Hostel Rooms
              </h3>
              {vacantRooms.length === 0 ? (
                <p className="text-sm text-slate-500">All rooms are currently full.</p>
              ) : (
                <ul className="space-y-2">
                  {vacantRooms.map((vr) => (
                    <li
                      key={vr.id}
                      className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm"
                    >
                      <span className="font-medium text-slate-900">
                        {vr.roomNumber} · {vr.block}
                      </span>
                      <span className="text-xs text-emerald-700 font-medium tabular-nums">
                        {vr.capacity - vr.occupantUids.length} bed(s) open
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* My Hostel Status Today */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="text-xs font-medium text-blue-700">Daily Movement</div>
            <h3 className="text-lg font-semibold text-slate-900 mt-0.5">
              My Hostel Status Today
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Keep your daily presence updated for Warden roll call and mess planning.
            </p>

            <div className="grid grid-cols-3 gap-2 mt-4">
              {(['In', 'Out', 'Leave'] as HostelStatus[]).map((st) => {
                const active = (currentUser.hostelStatus || 'In') === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusChange(st)}
                    className={`min-h-[44px] rounded-xl border text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          {statusFeedback && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
              {statusFeedback}
            </div>
          )}
        </div>
      </section>

      {/* Food Menu */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Hostel Mess Menu · {selectedDay}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Serving windows and live meal readiness updates
            </p>
          </div>
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selectedDay === day
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        {selectedMenu && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(
              [
                {
                  name: 'Breakfast',
                  items: selectedMenu.breakfast,
                  time: selectedMenu.breakfastTime,
                  ready: selectedMenu.breakfastReady,
                },
                {
                  name: 'Lunch',
                  items: selectedMenu.lunch,
                  time: selectedMenu.lunchTime,
                  ready: selectedMenu.lunchReady,
                },
                {
                  name: 'Snacks',
                  items: selectedMenu.snacks,
                  time: selectedMenu.snacksTime,
                  ready: selectedMenu.snacksReady,
                },
                {
                  name: 'Dinner',
                  items: selectedMenu.dinner,
                  time: selectedMenu.dinnerTime,
                  ready: selectedMenu.dinnerReady,
                },
              ] as const
            ).map((meal) => (
              <div
                key={meal.name}
                className={`rounded-xl border p-4 ${
                  meal.ready && selectedDay === todayDay
                    ? 'border-emerald-300 bg-emerald-50/60'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-slate-900">{meal.name}</span>
                  <span
                    className={`text-xs font-medium ${
                      meal.ready && selectedDay === todayDay ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {meal.ready && selectedDay === todayDay ? 'Ready now' : 'Planned'}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-500 tabular-nums mb-2">
                  {meal.time}
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{meal.items}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Important Hostel Notices */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-3">Important Hostel Notices</h3>
        {hostelNotices.length === 0 ? (
          <p className="text-sm text-slate-500">No hostel notices posted.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {hostelNotices.map((n) => (
              <div key={n.id} className="py-3 first:pt-0 last:pb-0">
                <div className="text-xs text-slate-500 tabular-nums">
                  {n.date} · Posted by {n.authorName}
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">{n.title}</div>
                <p className="text-sm text-slate-600 mt-1">{n.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function WardenHostelConsole() {
  const {
    state,
    getPrivateForUser,
    updateHostelMenu,
    saveHostelAttendanceBatch,
    allotResidentRoom,
    createHostelRoom,
    updateUserPrivateInfo,
  } = useApp();

  const [tab, setTab] = useState<'residents' | 'rooms' | 'menu' | 'attendance'>('residents');
  const [search, setSearch] = useState('');
  const [selectedResidentUid, setSelectedResidentUid] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(getTodayDayName());
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, HostelStatus>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Edit Resident Private/Medical Info state
  const [editingPrivate, setEditingPrivate] = useState(false);
  const [privPhone, setPrivPhone] = useState('');
  const [privGuardianName, setPrivGuardianName] = useState('');
  const [privGuardianPhone, setPrivGuardianPhone] = useState('');
  const [privAddress, setPrivAddress] = useState('');
  const [privBloodGroup, setPrivBloodGroup] = useState('');
  const [privAllergies, setPrivAllergies] = useState('');
  const [privMedicalNotes, setPrivMedicalNotes] = useState('');

  // Add Hostel Room state
  const [roomNumber, setRoomNumber] = useState('');
  const [roomBlock, setRoomBlock] = useState('Kurinji Hostel');
  const [roomFloor, setRoomFloor] = useState('2nd Floor');
  const [roomCapacity, setRoomCapacity] = useState('2');

  const residents = useMemo(() => state.users.filter((u) => u.isHostel), [state.users]);

  const filteredResidents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.className || '').toLowerCase().includes(q) ||
        (r.roomNumber || '').toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
    );
  }, [residents, search]);

  const selectedResident =
    residents.find((r) => r.uid === selectedResidentUid) || filteredResidents[0] || null;
  const selectedPrivate = selectedResident ? getPrivateForUser(selectedResident.uid) : null;

  const selectedRoommates = useMemo(() => {
    if (!selectedResident) return [];
    return residents.filter(
      (r) =>
        r.uid !== selectedResident.uid &&
        r.roomNumber &&
        r.roomNumber === selectedResident.roomNumber
    );
  }, [residents, selectedResident]);

  const activeMenu: HostelMenu = state.hostelMenus.find((m) => m.day === selectedDay) || {
    day: selectedDay,
    breakfast: '',
    breakfastTime: '07:15 AM – 08:45 AM',
    breakfastReady: false,
    lunch: '',
    lunchTime: '12:15 PM – 01:45 PM',
    lunchReady: false,
    snacks: '',
    snacksTime: '04:30 PM – 05:30 PM',
    snacksReady: false,
    dinner: '',
    dinnerTime: '07:30 PM – 09:00 PM',
    dinnerReady: false,
  };
  const [menuDraft, setMenuDraft] = useState<HostelMenu | null>(null);
  const currentMenuEdit = menuDraft?.day === activeMenu.day ? menuDraft : activeMenu;

  const getStatusForResident = (uid: string, fallback?: HostelStatus): HostelStatus => {
    return attendanceDraft[uid] || fallback || 'In';
  };

  const totals = useMemo(() => {
    let inCount = 0;
    let outCount = 0;
    let leaveCount = 0;
    residents.forEach((r) => {
      const st = getStatusForResident(r.uid, r.hostelStatus);
      if (st === 'In') inCount++;
      else if (st === 'Out') outCount++;
      else leaveCount++;
    });
    return { inCount, outCount, leaveCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residents, attendanceDraft]);

  const handleSaveAttendance = async () => {
    setFeedback(null);
    try {
      await saveHostelAttendanceBatch(
        residents.map((r) => ({
          residentUid: r.uid,
          residentName: r.name,
          roomNumber: r.roomNumber || 'Unassigned',
          status: getStatusForResident(r.uid, r.hostelStatus),
        }))
      );
      setFeedback({
        type: 'success',
        message: `Saved daily hostel attendance for ${getTodayIso()} (${totals.inCount} In, ${totals.outCount} Out, ${totals.leaveCount} Leave).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save attendance.',
      });
    }
  };

  const handleAllotRoom = async (residentUid: string, roomId: string) => {
    setFeedback(null);
    try {
      await allotResidentRoom(residentUid, roomId);
      setFeedback({ type: 'success', message: 'Room allotment updated.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not update room allotment.',
      });
    }
  };

  const handleOpenPrivateEdit = () => {
    if (!selectedResident) return;
    setPrivPhone(selectedPrivate?.phone || '');
    setPrivGuardianName(selectedPrivate?.guardianName || '');
    setPrivGuardianPhone(selectedPrivate?.guardianPhone || '');
    setPrivAddress(selectedPrivate?.address || '');
    setPrivBloodGroup(selectedPrivate?.bloodGroup || '');
    setPrivAllergies(selectedPrivate?.allergies || '');
    setPrivMedicalNotes(selectedPrivate?.medicalNotes || '');
    setEditingPrivate(true);
  };

  const handleSavePrivateEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResident) return;
    setFeedback(null);
    try {
      await updateUserPrivateInfo(selectedResident.uid, {
        phone: privPhone.trim(),
        guardianName: privGuardianName.trim(),
        guardianPhone: privGuardianPhone.trim(),
        address: privAddress.trim(),
        bloodGroup: privBloodGroup.trim(),
        allergies: privAllergies.trim(),
        medicalNotes: privMedicalNotes.trim(),
      });
      setEditingPrivate(false);
      setFeedback({
        type: 'success',
        message: `Updated personal & medical record for ${selectedResident.name}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update record.',
      });
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const created = await createHostelRoom({
        roomNumber,
        block: roomBlock,
        floor: roomFloor,
        capacity: Number(roomCapacity) || 2,
      });
      setRoomNumber('');
      setFeedback({
        type: 'success',
        message: `Added Room ${created.roomNumber} (${created.block}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create room.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-blue-700">Warden Administration</div>
          <h2 className="text-xl font-semibold text-slate-900 mt-0.5">
            Hostel Operations & Resident Records
          </h2>
          <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
            {residents.length} Residents · {state.hostelRooms.length} Rooms ·{' '}
            {totals.inCount} In / {totals.outCount} Out / {totals.leaveCount} Leave
          </p>
        </div>

        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl self-start lg:self-auto">
          {(
            [
              { id: 'residents', label: 'Residents & Medical' },
              { id: 'rooms', label: 'Rooms & Allotment' },
              { id: 'menu', label: 'Menu Editor' },
              { id: 'attendance', label: 'Daily Attendance' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setFeedback(null);
              }}
              className={`min-h-[40px] px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-xl border text-sm flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {tab === 'residents' && (
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search resident, room, class..."
                className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            {filteredResidents.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">No matching residents found.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredResidents.map((res) => {
                  const active = selectedResident?.uid === res.uid;
                  return (
                    <button
                      key={res.uid}
                      type="button"
                      onClick={() => {
                        setSelectedResidentUid(res.uid);
                        setEditingPrivate(false);
                      }}
                      className={`w-full py-3 px-3 rounded-xl text-left flex items-center justify-between gap-3 transition-colors ${
                        active ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{res.name}</div>
                        <div className="text-xs text-slate-500 truncate">
                          Room {res.roomNumber || '-'} · {res.className || res.department}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-slate-600 shrink-0">
                        {res.hostelStatus || 'In'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-6">
            {!selectedResident ? (
              <p className="text-sm text-slate-500">Select a resident to inspect details.</p>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <div className="text-xs font-medium text-blue-700">
                      Room {selectedResident.roomNumber || 'Unassigned'} · {selectedResident.block || 'Hostel'}
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mt-0.5">
                      {selectedResident.name}
                    </h3>
                    <div className="text-sm text-slate-600 mt-0.5">
                      {selectedResident.className} · {selectedResident.department} ·{' '}
                      <span className="font-mono tabular-nums">{selectedResident.registerNumber}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start">
                    <span className="text-xs font-semibold text-blue-700">
                      Status: {selectedResident.hostelStatus || 'In'}
                    </span>
                    {!editingPrivate && (
                      <button
                        type="button"
                        onClick={handleOpenPrivateEdit}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Edit Contact & Medical</span>
                      </button>
                    )}
                  </div>
                </div>

                {editingPrivate ? (
                  <form onSubmit={handleSavePrivateEdit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Resident Phone
                        </label>
                        <input
                          type="text"
                          value={privPhone}
                          onChange={(e) => setPrivPhone(e.target.value)}
                          placeholder="+91 98000 00101"
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Blood Group
                        </label>
                        <input
                          type="text"
                          value={privBloodGroup}
                          onChange={(e) => setPrivBloodGroup(e.target.value)}
                          placeholder="e.g. O+"
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Guardian Name
                        </label>
                        <input
                          type="text"
                          value={privGuardianName}
                          onChange={(e) => setPrivGuardianName(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Guardian Phone
                        </label>
                        <input
                          type="text"
                          value={privGuardianPhone}
                          onChange={(e) => setPrivGuardianPhone(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Home Address
                        </label>
                        <input
                          type="text"
                          value={privAddress}
                          onChange={(e) => setPrivAddress(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Allergies
                        </label>
                        <input
                          type="text"
                          value={privAllergies}
                          onChange={(e) => setPrivAllergies(e.target.value)}
                          placeholder="None reported"
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Medical Notes
                        </label>
                        <textarea
                          rows={2}
                          value={privMedicalNotes}
                          onChange={(e) => setPrivMedicalNotes(e.target.value)}
                          className="w-full p-3 rounded-xl border border-slate-200 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPrivate(false)}
                        className="min-h-[38px] px-4 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="min-h-[38px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                      >
                        Save Resident Details
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs font-medium text-slate-500">Guardian Contact</div>
                        <div className="font-medium text-slate-900 mt-0.5">
                          {selectedPrivate?.guardianName || 'Not recorded'}
                        </div>
                        <div className="font-mono text-slate-600 text-xs mt-0.5 tabular-nums">
                          {selectedPrivate?.guardianPhone || '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500">Resident Phone & Email</div>
                        <div className="font-mono text-slate-900 text-xs mt-0.5 tabular-nums">
                          {selectedPrivate?.phone || '—'}
                        </div>
                        <div className="text-slate-600 text-xs mt-0.5 truncate">
                          {selectedPrivate?.email || '—'}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-xs font-medium text-slate-500">Home Address</div>
                        <div className="text-slate-800 mt-0.5">
                          {selectedPrivate?.address || 'Not recorded'}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2 text-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                        Confidential Medical Record (Warden & Management Only)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <span className="text-xs text-slate-600 block">Blood Group</span>
                          <span className="font-semibold text-slate-900">
                            {selectedPrivate?.bloodGroup || 'Unknown'}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-600 block">Allergies</span>
                          <span className="font-semibold text-slate-900">
                            {selectedPrivate?.allergies || 'None reported'}
                          </span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-xs text-slate-600 block">Medical Notes</span>
                          <span className="text-slate-800">
                            {selectedPrivate?.medicalNotes || 'No clinical notes.'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1.5">Roommates</div>
                  {selectedRoommates.length === 0 ? (
                    <p className="text-sm text-slate-500">No roommates in this room.</p>
                  ) : (
                    <div className="flex flex-wrap gap-3 text-sm text-slate-800">
                      {selectedRoommates.map((rm) => (
                        <span key={rm.uid}>
                          {rm.name} ({rm.className})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'rooms' && (
        <section className="space-y-6">
          <form
            onSubmit={handleCreateRoom}
            className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              <h3 className="text-base font-semibold text-slate-900">Add New Hostel Room</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Room No.</label>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="e.g. K-204"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Block</label>
                <input
                  type="text"
                  required
                  value={roomBlock}
                  onChange={(e) => setRoomBlock(e.target.value)}
                  placeholder="Kurinji Hostel"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Floor</label>
                <input
                  type="text"
                  value={roomFloor}
                  onChange={(e) => setRoomFloor(e.target.value)}
                  placeholder="2nd Floor"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Capacity</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  required
                  value={roomCapacity}
                  onChange={(e) => setRoomCapacity(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm tabular-nums"
                />
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-end">
                <button
                  type="submit"
                  className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                >
                  Add Room
                </button>
              </div>
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Room Occupancy</h3>
                <span className="text-xs text-slate-500 tabular-nums">
                  {state.hostelRooms.filter((r) => r.occupantUids.length < r.capacity).length} rooms with vacancies
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {state.hostelRooms.map((room) => {
                  const occupants = residents.filter((r) => room.occupantUids.includes(r.uid));
                  const vacant = room.capacity - occupants.length;
                  return (
                    <div key={room.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BedDouble className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-slate-900">
                            {room.roomNumber} · {room.block}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-medium tabular-nums ${
                            vacant > 0 ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {occupants.length}/{room.capacity} occupied
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {occupants.length > 0
                          ? occupants.map((o) => `${o.name} (${o.className})`).join(', ')
                          : 'Vacant room ready for allotment'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Change Room Allotment</h3>
            <p className="text-sm text-slate-600">
              Reassign any hostel resident to an available room below.
            </p>
            <div className="divide-y divide-slate-100">
              {residents.map((res) => {
                const currentRoom = state.hostelRooms.find((r) =>
                  r.occupantUids.includes(res.uid)
                );
                return (
                  <div
                    key={res.uid}
                    className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{res.name}</div>
                      <div className="text-xs text-slate-500">
                        Current: {res.roomNumber || 'Unassigned'} · {res.className}
                      </div>
                    </div>
                    <select
                      aria-label={`Assign room for ${res.name}`}
                      value={currentRoom?.id || ''}
                      onChange={(e) => handleAllotRoom(res.uid, e.target.value)}
                      className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
                    >
                      <option value="" disabled>
                        Select room
                      </option>
                      {state.hostelRooms.map((rm) => (
                        <option
                          key={rm.id}
                          value={rm.id}
                          disabled={
                            !rm.occupantUids.includes(res.uid) &&
                            rm.occupantUids.length >= rm.capacity
                          }
                        >
                          {rm.roomNumber} ({rm.occupantUids.length}/{rm.capacity})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'menu' && currentMenuEdit && (
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Hostel Menu Editor · {selectedDay}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Edit dishes, serving times, or mark meals ready so residents see the green banner.
              </p>
            </div>
            <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    setSelectedDay(day);
                    setMenuDraft(null);
                  }}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium ${
                    selectedDay === day
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(
              [
                {
                  key: 'breakfast',
                  timeKey: 'breakfastTime',
                  readyKey: 'breakfastReady',
                  label: 'Breakfast',
                },
                {
                  key: 'lunch',
                  timeKey: 'lunchTime',
                  readyKey: 'lunchReady',
                  label: 'Lunch',
                },
                {
                  key: 'snacks',
                  timeKey: 'snacksTime',
                  readyKey: 'snacksReady',
                  label: 'Snacks',
                },
                {
                  key: 'dinner',
                  timeKey: 'dinnerTime',
                  readyKey: 'dinnerReady',
                  label: 'Dinner',
                },
              ] as const
            ).map((meal) => {
              const isReady = Boolean(currentMenuEdit[meal.readyKey]);
              return (
                <div
                  key={meal.key}
                  className="border border-slate-200 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{meal.label}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateHostelMenu(selectedDay, { [meal.readyKey]: true })
                        }
                        className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium ${
                          isReady
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        Mark food ready
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateHostelMenu(selectedDay, { [meal.readyKey]: false })
                        }
                        className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium ${
                          !isReady
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Mark planned
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Serving Time</label>
                    <input
                      type="text"
                      value={currentMenuEdit[meal.timeKey]}
                      onChange={(e) =>
                        setMenuDraft({
                          ...currentMenuEdit,
                          [meal.timeKey]: e.target.value,
                        })
                      }
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Menu Items</label>
                    <textarea
                      rows={2}
                      value={currentMenuEdit[meal.key]}
                      onChange={(e) =>
                        setMenuDraft({
                          ...currentMenuEdit,
                          [meal.key]: e.target.value,
                        })
                      }
                      className="w-full p-3 rounded-xl border border-slate-200 text-sm text-slate-900"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={async () => {
                await updateHostelMenu(selectedDay, currentMenuEdit);
                setFeedback({
                  type: 'success',
                  message: `Saved ${selectedDay} mess menu and serving times.`,
                });
              }}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Save {selectedDay} Menu
            </button>
          </div>
        </section>
      )}

      {tab === 'attendance' && (
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Daily Hostel Attendance · {getTodayIso()}
              </h3>
              <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
                Totals: {totals.inCount} In · {totals.outCount} Out · {totals.leaveCount} Leave
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveAttendance}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-2 self-start sm:self-auto"
            >
              <Home className="w-4 h-4" />
              <span>Save Attendance</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {residents.map((res) => {
              const currentSt = getStatusForResident(res.uid, res.hostelStatus);
              return (
                <div
                  key={res.uid}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{res.name}</div>
                    <div className="text-xs text-slate-500">
                      Room {res.roomNumber || 'Unassigned'} · {res.className}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 w-full sm:w-64">
                    {(['In', 'Out', 'Leave'] as HostelStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() =>
                          setAttendanceDraft((prev) => ({ ...prev, [res.uid]: st }))
                        }
                        className={`min-h-[40px] rounded-xl border text-xs font-medium transition-colors ${
                          currentSt === st
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
