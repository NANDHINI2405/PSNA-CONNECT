import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Home,
  ImageUp,
  MapPin,
  Pencil,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  StopCircle,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { SUBJECTS } from '../data/seedData';
import { useApp } from '../context/AppContext';
import { getTodayDayName, getTodayIso } from '../services/dataService';
import { DayOfWeek, TimetableSession, canAccessScreen } from '../types';
import { getBrowserLocation, haversineMeters } from '../utils/geo';
import { BarcodeDetectorCtor, decodeCanvasQr } from '../utils/qr';

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

const PERIOD_DEFAULT_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: '09:00 AM', end: '09:50 AM' },
  2: { start: '09:55 AM', end: '10:45 AM' },
  3: { start: '11:05 AM', end: '11:55 AM' },
  4: { start: '12:00 PM', end: '12:50 PM' },
  5: { start: '01:30 PM', end: '02:20 PM' },
  6: { start: '02:25 PM', end: '03:15 PM' },
  7: { start: '03:20 PM', end: '04:10 PM' },
  8: { start: '04:15 PM', end: '05:00 PM' },
};

function getDefaultTimetableDay(): DayOfWeek {
  const today = getTodayDayName();
  return today === 'Sunday' ? 'Monday' : today;
}

export function AttendanceView() {
  const {
    currentUser,
    state,
    startAttendanceSession,
    rotateSessionToken,
    stopAttendanceSession,
    markStudentAttendance,
    checkInStaff,
    upsertTimetableSession,
    deleteTimetableSession,
    setActiveScreen,
  } = useApp();

  if (!currentUser || !canAccessScreen(currentUser, 'attendance')) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900">Attendance Access Restricted</h2>
        <p className="text-sm text-slate-600 mt-1">
          Your current role does not have access to live QR attendance operations.
        </p>
      </div>
    );
  }

  if (currentUser.role === 'staff') {
    return (
      <StaffAttendancePanel
        currentUser={currentUser}
        state={state}
        startAttendanceSession={startAttendanceSession}
        rotateSessionToken={rotateSessionToken}
        stopAttendanceSession={stopAttendanceSession}
        checkInStaff={checkInStaff}
        upsertTimetableSession={upsertTimetableSession}
        deleteTimetableSession={deleteTimetableSession}
        setActiveScreen={setActiveScreen}
      />
    );
  }

  return (
    <StudentAttendancePanel
      currentUser={currentUser}
      state={state}
      markStudentAttendance={markStudentAttendance}
      setActiveScreen={setActiveScreen}
    />
  );
}

function StudentAttendancePanel({
  currentUser,
  state,
  markStudentAttendance,
  setActiveScreen,
}: {
  currentUser: NonNullable<ReturnType<typeof useApp>['currentUser']>;
  state: ReturnType<typeof useApp>['state'];
  markStudentAttendance: ReturnType<typeof useApp>['markStudentAttendance'];
  setActiveScreen: ReturnType<typeof useApp>['setActiveScreen'];
}) {
  const [tab, setTab] = useState<'summary' | 'timetable' | 'scan'>('summary');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek | 'All'>(() => getDefaultTimetableDay());
  const [timetableScope, setTimetableScope] = useState<'my_class' | 'all'>('my_class');
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const verifyingRef = useRef(false);
  const lastAttemptRef = useRef<{ payload: string; at: number }>({ payload: '', at: 0 });
  const verifyFnRef = useRef<(rawInput: string, markedVia: 'QR' | 'Manual') => Promise<void>>(
    async () => {}
  );

  const myRecords = useMemo(
    () => state.attendanceRecords.filter((r) => r.studentUid === currentUser.uid),
    [state.attendanceRecords, currentUser.uid]
  );

  // Per-subject breakdown (includes seeded subjects + any custom subjects recorded)
  const subjectStats = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    SUBJECTS.forEach((s) => map.set(s.code, s));
    myRecords.forEach((r) => {
      if (!map.has(r.subjectCode)) {
        map.set(r.subjectCode, { code: r.subjectCode, name: r.subjectName });
      }
    });
    return Array.from(map.values()).map((subj) => {
      const list = myRecords.filter((r) => r.subjectCode === subj.code);
      const present = list.filter((r) => r.status === 'Present').length;
      const total = list.length;
      const pct = total > 0 ? Math.round((present / total) * 100) : 0;
      return { ...subj, present, total, pct };
    });
  }, [myRecords]);

  // 28-day calendar map
  const calendarDays = useMemo(() => {
    const days: { date: string; label: string; weekday: string; present: number; absent: number }[] = [];
    const base = new Date();
    for (let i = 27; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const dayRecords = myRecords.filter((r) => r.date === iso);
      days.push({
        date: iso,
        label: String(d.getDate()),
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
        present: dayRecords.filter((r) => r.status === 'Present').length,
        absent: dayRecords.filter((r) => r.status === 'Absent').length,
      });
    }
    return days;
  }, [myRecords]);

  const activeSessions = useMemo(() => {
    const myClass = (currentUser.className || '').trim().toLowerCase();
    return state.attendanceSessions
      .filter((s) => s.active)
      .sort((a, b) => {
        const aMatch = myClass && a.className.trim().toLowerCase() === myClass ? 1 : 0;
        const bMatch = myClass && b.className.trim().toLowerCase() === myClass ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
        return (b.tokenIssuedAt || 0) - (a.tokenIssuedAt || 0);
      });
  }, [state.attendanceSessions, currentUser.className]);

  const filteredTimetable = useMemo(() => {
    const myClass = (currentUser.className || '').trim().toLowerCase();
    return state.timetableSessions
      .filter((tt) => {
        if (selectedDay !== 'All' && tt.day !== selectedDay) return false;
        if (timetableScope === 'my_class' && myClass) {
          return tt.className.trim().toLowerCase() === myClass;
        }
        return true;
      })
      .sort((a, b) => {
        const dayDiff = (DAY_ORDER[a.day] || 9) - (DAY_ORDER[b.day] || 9);
        return dayDiff !== 0 ? dayDiff : a.period - b.period;
      });
  }, [state.timetableSessions, selectedDay, timetableScope, currentUser.className]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const verifyAndSubmitToken = async (rawInput: string, markedVia: 'QR' | 'Manual') => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    setScanStatus({ type: 'info', message: 'QR / token detected. Verifying classroom location...' });

    try {
      let token = rawInput.trim();
      let targetSessionId: string | null = null;
      if (token.startsWith('{')) {
        try {
          const parsed = JSON.parse(token) as { sessionId?: string; token?: string };
          if (parsed.token) token = parsed.token.trim();
          if (parsed.sessionId) targetSessionId = parsed.sessionId.trim();
        } catch {
          // treat as plain code
        }
      }

      const normalizedToken = token.toUpperCase();
      let matchingSession = targetSessionId
        ? state.attendanceSessions.find((s) => s.id === targetSessionId)
        : activeSessions.find((s) => {
            const expected = s.currentToken.trim().toUpperCase();
            return (
              expected === normalizedToken ||
              expected.replace(/^PSNA-/, '') === normalizedToken
            );
          });

      if (!matchingSession && !targetSessionId) {
        matchingSession = activeSessions[0];
      }

      if (!matchingSession) {
        throw new Error('No active QR attendance session is currently running.');
      }
      if (!matchingSession.active) {
        throw new Error(
          `The QR session for ${matchingSession.subjectCode} (${matchingSession.subjectName}) has already ended.`
        );
      }

      const alreadyMarked = myRecords.find((r) => r.sessionId === matchingSession.id);
      if (alreadyMarked) {
        setScanStatus({
          type: 'success',
          message: `Attendance already recorded Present for ${alreadyMarked.subjectCode} (${alreadyMarked.subjectName}).`,
        });
        setManualCode('');
        stopCamera();
        return;
      }

      // Check browser geolocation inside classroom radius
      const pos = await getBrowserLocation();
      const distance = haversineMeters(
        pos.lat,
        pos.lng,
        matchingSession.campusLat,
        matchingSession.campusLng
      );

      if (distance > matchingSession.radiusMeters) {
        throw new Error(
          `You are ${distance}m away from the classroom (allowed radius: ${matchingSession.radiusMeters}m). Attendance rejected outside classroom geofence.`
        );
      }

      const rec = await markStudentAttendance({
        session: matchingSession,
        token,
        markedVia,
      });

      setScanStatus({
        type: 'success',
        message: `Attendance marked Present for ${rec.subjectCode} (${rec.subjectName}) · Verified ${distance}m from classroom.`,
      });
      setManualCode('');
      stopCamera();
    } catch (err) {
      setScanStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to mark attendance.',
      });
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  verifyFnRef.current = verifyAndSubmitToken;

  const startCamera = async () => {
    setCameraError(null);
    setScanStatus(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Live camera streaming is unavailable in this browser/window. Use "Scan QR Image" or the Manual Code entry.'
      );
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      lastAttemptRef.current = { payload: '', at: 0 };
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Camera permission denied or unavailable (${err.message}). Try "Scan QR Image" or Manual Code entry.`
          : 'Camera permission denied. Try "Scan QR Image" or Manual Code entry.'
      );
    }
  };

  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setCameraError(null);
    setScanStatus({ type: 'info', message: 'Reading QR code from image...' });

    try {
      const objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not load the selected image.'));
        el.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);

      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas is unavailable in this browser.');

      let decoded = decodeCanvasQr(tempCanvas, ctx, img, img.naturalWidth, img.naturalHeight);
      if (!decoded && img.naturalWidth > 640) {
        decoded = decodeCanvasQr(
          tempCanvas,
          ctx,
          img,
          img.naturalWidth,
          img.naturalHeight,
          img.naturalWidth
        );
      }

      if (!decoded) {
        throw new Error('No QR code detected in this image. Ensure the QR code is clear and well-lit.');
      }
      await verifyFnRef.current(decoded, 'QR');
    } catch (err) {
      setScanStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to decode QR image.',
      });
    }
  };

  useEffect(() => {
    if (!cameraActive) return;
    let rafId = 0;
    let cancelled = false;
    let detectingNative = false;

    const video = videoRef.current;
    if (video && streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }

    const BarcodeDetectorApi = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;
    const detector = BarcodeDetectorApi
      ? (() => {
          try {
            return new BarcodeDetectorApi({ formats: ['qr_code'] });
          } catch {
            return null;
          }
        })()
      : null;

    const handleDetected = (raw: string) => {
      const now = Date.now();
      if (
        verifyingRef.current ||
        (lastAttemptRef.current.payload === raw && now - lastAttemptRef.current.at < 2500)
      ) {
        return;
      }
      lastAttemptRef.current = { payload: raw, at: now };
      void verifyFnRef.current(raw, 'QR');
    };

    const scanFrame = () => {
      if (cancelled) return;
      const vid = videoRef.current;
      const canvas = canvasRef.current;

      if (
        vid &&
        vid.readyState >= vid.HAVE_CURRENT_DATA &&
        vid.videoWidth > 0 &&
        vid.videoHeight > 0 &&
        !verifyingRef.current
      ) {
        if (detector && !detectingNative) {
          detectingNative = true;
          detector
            .detect(vid)
            .then((codes) => {
              const raw = codes.find((c) => c.rawValue)?.rawValue;
              if (!cancelled && raw) handleDetected(raw);
            })
            .catch(() => {})
            .finally(() => {
              detectingNative = false;
            });
        }

        if (canvas) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            const raw = decodeCanvasQr(canvas, ctx, vid, vid.videoWidth, vid.videoHeight);
            if (raw) {
              handleDetected(raw);
            }
          }
        }
      }

      rafId = requestAnimationFrame(scanFrame);
    };

    rafId = requestAnimationFrame(scanFrame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [cameraActive]);

  return (
    <div className="space-y-6">
      {/* Student Academic Profile */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-blue-700">Student Academic Profile</div>
          <h2 className="text-xl font-semibold text-slate-900 mt-0.5">{currentUser.name}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 mt-1">
            <span className="font-mono tabular-nums">
              {currentUser.rollNumber || currentUser.registerNumber || 'Roll No. Pending'}
            </span>
            {currentUser.programLevel && currentUser.academicYear && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {currentUser.programLevel} · {currentUser.academicYear}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{currentUser.className || 'III CSE A'}</span>
            <span aria-hidden="true">·</span>
            <span>{currentUser.department}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {currentUser.isHostel && (
            <button
              type="button"
              onClick={() => setActiveScreen('hostel')}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Hostel Roll Call</span>
            </button>
          )}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('summary')}
              className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === 'summary' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              My Attendance
            </button>
            <button
              type="button"
              onClick={() => setTab('timetable')}
              className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === 'timetable' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Class Timetable
            </button>
            <button
              type="button"
              onClick={() => setTab('scan')}
              className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === 'scan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Scan Attendance
            </button>
          </div>
        </div>
      </section>

      {tab === 'summary' ? (
        <>
          {/* Subject Percentages */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjectStats.map((s) => {
              const low = s.pct < 75;
              return (
                <div key={s.code} className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-medium text-slate-700">{s.code}</span>
                    <span className={low ? 'text-amber-700 font-medium' : 'text-emerald-700 font-medium'}>
                      {low ? 'Below 75% warning' : 'Eligible (≥75%)'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-1">{s.name}</div>
                  <div className="flex items-baseline justify-between mt-3">
                    <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                      {s.pct}%
                    </span>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {s.present} / {s.total} classes
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full mt-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${low ? 'bg-amber-500' : 'bg-blue-600'}`}
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </section>

          {/* 4-Week Calendar */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">
                  4-Week Attendance Calendar
                </h3>
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-4">
                <span>Green: All Present</span>
                <span>Amber: Partial</span>
                <span>Slate: Holiday / No Record</span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((d) => {
                let surface = 'bg-slate-50 border-slate-200 text-slate-500';
                let label = 'No class';
                if (d.present > 0 && d.absent === 0) {
                  surface = 'bg-emerald-50 border-emerald-200 text-emerald-900';
                  label = `${d.present}P`;
                } else if (d.present > 0 && d.absent > 0) {
                  surface = 'bg-amber-50 border-amber-200 text-amber-900';
                  label = `${d.present}P/${d.absent}A`;
                } else if (d.absent > 0) {
                  surface = 'bg-red-50 border-red-200 text-red-900';
                  label = `${d.absent}A`;
                }

                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${label}`}
                    className={`border rounded-xl p-2 sm:p-2.5 text-center ${surface}`}
                  >
                    <div className="text-[10px] opacity-75">{d.weekday}</div>
                    <div className="text-sm font-semibold tabular-nums">{d.label}</div>
                    <div className="text-[10px] font-mono tabular-nums mt-0.5 truncate">{label}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : tab === 'timetable' ? (
        /* Student Class Timetable Tab */
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">Class Timetable Sessions</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Daily period schedule and live QR attendance status for {currentUser.className || 'your class'}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTimetableScope('my_class')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium ${
                    timetableScope === 'my_class' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  My Class ({currentUser.className || 'All'})
                </button>
                <button
                  type="button"
                  onClick={() => setTimetableScope('all')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium ${
                    timetableScope === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  All Classes
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedDay('All')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                selectedDay === 'All'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              All Days
            </button>
            {TIMETABLE_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                  selectedDay === day
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {day}
                {getTodayDayName() === day ? ' (Today)' : ''}
              </button>
            ))}
          </div>

          {filteredTimetable.length === 0 ? (
            <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 text-center text-sm text-slate-500">
              No class timetable sessions scheduled for this filter. Try switching to All Days or All Classes.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredTimetable.map((tt) => {
                const liveSession = activeSessions.find(
                  (s) =>
                    s.subjectCode === tt.subjectCode &&
                    s.className.trim().toLowerCase() === tt.className.trim().toLowerCase()
                );
                return (
                  <div
                    key={tt.id}
                    className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 ${
                      liveSession ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-blue-700 tabular-nums">
                          {tt.day} · Period {tt.period}
                        </span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {tt.startTime} – {tt.endTime}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        <span className="font-mono text-slate-700 mr-1.5">{tt.subjectCode}</span>
                        {tt.subjectName}
                      </div>
                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span>{tt.staffName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{tt.className}</span>
                        <span aria-hidden="true">·</span>
                        <span>Room {tt.room}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      {liveSession ? (
                        <>
                          <span className="text-xs font-semibold text-emerald-700">
                            QR Session Active ({liveSession.radiusMeters}m)
                          </span>
                          <button
                            type="button"
                            onClick={() => setTab('scan')}
                            className="min-h-[34px] px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Scan QR</span>
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">Scheduled Period</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        /* Scan Attendance Tab */
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">Camera QR Scanner</h3>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleQrImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={verifying}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <ImageUp className="w-4 h-4" />
                  <span>Scan QR Image</span>
                </button>
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-red-50 text-red-700 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <StopCircle className="w-4 h-4" />
                    <span>Stop Camera</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Start Camera</span>
                  </button>
                )}
              </div>
            </div>

            {cameraError && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                <span>{cameraError}</span>
              </div>
            )}

            <div className="aspect-video w-full rounded-xl bg-slate-900 overflow-hidden flex items-center justify-center relative border border-slate-200">
              {cameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-2xl border-2 border-blue-400/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.32)]" />
                  </div>
                  <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex justify-center">
                    <span className="px-3 py-1 rounded-full bg-slate-900/80 text-white text-xs font-medium">
                      {verifying ? 'Verifying QR & Location...' : 'Point camera at faculty QR code'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center text-slate-300 px-6">
                  <QrCode className="w-10 h-10 mx-auto mb-2 opacity-70" />
                  <p className="text-sm font-medium">Camera preview inactive</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Click Start Camera, tap Scan QR Image to snap a photo, or enter the manual code.
                  </p>
                </div>
              )}
            </div>

            {scanStatus && (
              <div
                role="status"
                className={`p-3.5 rounded-xl border text-sm flex items-start gap-2.5 ${
                  scanStatus.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : scanStatus.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                {scanStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{scanStatus.message}</span>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-semibold text-slate-900">
                Manual Code Fallback & Location Check
              </h3>
            </div>
            <p className="text-sm text-slate-600">
              Enter the rotating 6-digit code shown on the faculty projector (e.g.{' '}
              <span className="font-mono">PSNA-123456</span>). Your browser location is checked against the classroom radius.
            </p>

            {activeSessions.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">
                No class attendance session is currently active. Check your{' '}
                <button
                  type="button"
                  onClick={() => setTab('timetable')}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Class Timetable
                </button>{' '}
                or wait for faculty to start live QR attendance.
              </div>
            ) : (
              <div className="space-y-2">
                {activeSessions.map((sess) => {
                  const isMyClass =
                    Boolean(currentUser.className) &&
                    sess.className.trim().toLowerCase() === currentUser.className!.trim().toLowerCase();
                  return (
                    <div
                      key={sess.id}
                      className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                        isMyClass
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                          : 'bg-blue-50 border-blue-200 text-blue-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold">
                        <span>
                          Active Session: {sess.subjectCode} — {sess.subjectName}
                        </span>
                        {isMyClass && (
                          <span className="text-[11px] font-semibold text-emerald-700">Your Class</span>
                        )}
                      </div>
                      <div>
                        Faculty: {sess.staffName} · Class: {sess.className} · Allowed radius:{' '}
                        <span className="font-mono tabular-nums">{sess.radiusMeters}m</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualCode.trim()) verifyAndSubmitToken(manualCode, 'Manual');
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Attendance Code
                </label>
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="PSNA-000000"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 font-mono text-sm uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={verifying || !manualCode.trim()}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{verifying ? 'Verifying Location & Token...' : 'Verify Location & Mark Present'}</span>
              </button>
            </form>

            {scanStatus && (
              <div
                role="status"
                className={`p-3.5 rounded-xl border text-sm flex items-start gap-2.5 ${
                  scanStatus.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : scanStatus.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                {scanStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{scanStatus.message}</span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StaffAttendancePanel({
  currentUser,
  state,
  startAttendanceSession,
  rotateSessionToken,
  stopAttendanceSession,
  checkInStaff,
  upsertTimetableSession,
  deleteTimetableSession,
  setActiveScreen,
}: {
  currentUser: NonNullable<ReturnType<typeof useApp>['currentUser']>;
  state: ReturnType<typeof useApp>['state'];
  startAttendanceSession: ReturnType<typeof useApp>['startAttendanceSession'];
  rotateSessionToken: ReturnType<typeof useApp>['rotateSessionToken'];
  stopAttendanceSession: ReturnType<typeof useApp>['stopAttendanceSession'];
  checkInStaff: ReturnType<typeof useApp>['checkInStaff'];
  upsertTimetableSession: ReturnType<typeof useApp>['upsertTimetableSession'];
  deleteTimetableSession: ReturnType<typeof useApp>['deleteTimetableSession'];
  setActiveScreen: ReturnType<typeof useApp>['setActiveScreen'];
}) {
  const [tab, setTab] = useState<'qr' | 'timetable' | 'checkin'>('qr');
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0].code);
  const [customSubCode, setCustomSubCode] = useState('');
  const [customSubName, setCustomSubName] = useState('');
  const [className, setClassName] = useState('ME CSE Year 1');
  const [locationMode, setLocationMode] = useState<'gps' | 'campus'>('gps');
  const [radiusMeters, setRadiusMeters] = useState(250);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Staff Timetable state
  const [ttDayFilter, setTtDayFilter] = useState<DayOfWeek | 'All'>(() => getDefaultTimetableDay());
  const [ttScope, setTtScope] = useState<'mine' | 'all'>('mine');
  const [showTtForm, setShowTtForm] = useState(false);
  const [editingTtId, setEditingTtId] = useState<string | null>(null);
  const [ttDay, setTtDay] = useState<DayOfWeek>(() => getDefaultTimetableDay());
  const [ttPeriod, setTtPeriod] = useState<number>(1);
  const [ttStartTime, setTtStartTime] = useState('09:00 AM');
  const [ttEndTime, setTtEndTime] = useState('09:50 AM');
  const [ttSubjChoice, setTtSubjChoice] = useState(SUBJECTS[0].code);
  const [ttCustomCode, setTtCustomCode] = useState('');
  const [ttCustomName, setTtCustomName] = useState('');
  const [ttClassName, setTtClassName] = useState('ME CSE Year 1');
  const [ttRoom, setTtRoom] = useState('PG-102');
  const [ttRadius, setTtRadius] = useState(250);
  const [ttMessage, setTtMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingTt, setSavingTt] = useState(false);

  const [checkinStatus, setCheckinStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const activeSession = state.attendanceSessions.find(
    (s) => s.active && s.staffUid === currentUser.uid
  );
  const rotatingRef = useRef(false);

  // Rotate QR token every 30s
  useEffect(() => {
    if (!activeSession) {
      setQrDataUrl('');
      rotatingRef.current = false;
      return;
    }

    rotatingRef.current = false;
    setSecondsLeft(Math.max(0, Math.ceil((activeSession.expiresAt - Date.now()) / 1000)));

    const updateQr = async () => {
      const payload = JSON.stringify({
        sessionId: activeSession.id,
        token: activeSession.currentToken,
      });
      try {
        const url = await QRCode.toDataURL(payload, { width: 240, margin: 2 });
        setQrDataUrl(url);
      } catch {
        // ignore
      }
    };
    updateQr();

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((activeSession.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && !rotatingRef.current) {
        rotatingRef.current = true;
        rotateSessionToken(activeSession.id).catch(() => {
          rotatingRef.current = false;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession, rotateSessionToken]);

  const handleStartSession = async (overrideMode?: 'gps' | 'campus') => {
    const mode = overrideMode || locationMode;
    setSessionError(null);
    setStarting(true);
    try {
      let lat = state.geofence.lat;
      let lng = state.geofence.lng;
      if (mode === 'gps') {
        const pos = await getBrowserLocation();
        lat = pos.lat;
        lng = pos.lng;
      }
      const subj =
        selectedSubject === '__custom__'
          ? {
              code: customSubCode.trim().toUpperCase(),
              name: customSubName.trim(),
            }
          : SUBJECTS.find((s) => s.code === selectedSubject) || SUBJECTS[0];
      if (!subj.code || !subj.name || !className.trim()) {
        throw new Error('Please provide a subject code, subject name, and class.');
      }
      await startAttendanceSession({
        subjectCode: subj.code,
        subjectName: subj.name,
        className: className.trim(),
        lat,
        lng,
        radiusMeters,
      });
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Could not start QR session.');
    } finally {
      setStarting(false);
    }
  };

  const handleStartFromTimetable = async (tt: TimetableSession) => {
    setSessionError(null);
    setTtMessage(null);
    setStarting(true);
    setClassName(tt.className);
    setRadiusMeters(tt.radiusMeters || 250);
    if (SUBJECTS.some((s) => s.code === tt.subjectCode)) {
      setSelectedSubject(tt.subjectCode);
    } else {
      setSelectedSubject('__custom__');
      setCustomSubCode(tt.subjectCode);
      setCustomSubName(tt.subjectName);
    }
    setTab('qr');
    try {
      let lat = state.geofence.lat;
      let lng = state.geofence.lng;
      if (locationMode === 'gps') {
        try {
          const pos = await getBrowserLocation();
          lat = pos.lat;
          lng = pos.lng;
        } catch {
          // Fall back to campus coordinates if browser GPS is blocked indoors
        }
      }
      await startAttendanceSession({
        subjectCode: tt.subjectCode,
        subjectName: tt.subjectName,
        className: tt.className,
        lat,
        lng,
        radiusMeters: tt.radiusMeters || 250,
      });
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Could not start QR session.');
    } finally {
      setStarting(false);
    }
  };

  const resetTtForm = () => {
    setEditingTtId(null);
    setTtDay(getDefaultTimetableDay());
    setTtPeriod(1);
    setTtStartTime(PERIOD_DEFAULT_TIMES[1].start);
    setTtEndTime(PERIOD_DEFAULT_TIMES[1].end);
    setTtSubjChoice(SUBJECTS[0].code);
    setTtCustomCode('');
    setTtCustomName('');
    setTtClassName('ME CSE Year 1');
    setTtRoom('PG-102');
    setTtRadius(250);
  };

  const openEditTtForm = (tt: TimetableSession) => {
    setEditingTtId(tt.id);
    setTtDay(tt.day);
    setTtPeriod(tt.period);
    setTtStartTime(tt.startTime);
    setTtEndTime(tt.endTime);
    if (SUBJECTS.some((s) => s.code === tt.subjectCode)) {
      setTtSubjChoice(tt.subjectCode);
      setTtCustomCode('');
      setTtCustomName('');
    } else {
      setTtSubjChoice('__custom__');
      setTtCustomCode(tt.subjectCode);
      setTtCustomName(tt.subjectName);
    }
    setTtClassName(tt.className);
    setTtRoom(tt.room);
    setTtRadius(tt.radiusMeters || 250);
    setShowTtForm(true);
    setTtMessage(null);
  };

  const handleSaveTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    setTtMessage(null);
    setSavingTt(true);
    try {
      const subj =
        ttSubjChoice === '__custom__'
          ? { code: ttCustomCode.trim().toUpperCase(), name: ttCustomName.trim() }
          : SUBJECTS.find((s) => s.code === ttSubjChoice) || SUBJECTS[0];
      await upsertTimetableSession({
        id: editingTtId || undefined,
        day: ttDay,
        period: ttPeriod,
        startTime: ttStartTime,
        endTime: ttEndTime,
        subjectCode: subj.code,
        subjectName: subj.name,
        className: ttClassName,
        department: currentUser.department,
        staffUid: currentUser.uid,
        staffName: currentUser.name,
        room: ttRoom,
        radiusMeters: ttRadius,
      });
      setTtMessage({
        type: 'success',
        text: `${editingTtId ? 'Updated' : 'Added'} ${subj.code} (${ttClassName}) on ${ttDay} Period ${ttPeriod}.`,
      });
      resetTtForm();
      setShowTtForm(false);
    } catch (err) {
      setTtMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save timetable period.',
      });
    } finally {
      setSavingTt(false);
    }
  };

  const todayScheduleDay = getDefaultTimetableDay();
  const todaysStaffClasses = useMemo(() => {
    const mine = state.timetableSessions
      .filter((t) => t.day === todayScheduleDay && t.staffUid === currentUser.uid)
      .sort((a, b) => a.period - b.period);
    if (mine.length > 0) return mine;
    return state.timetableSessions
      .filter((t) => t.day === todayScheduleDay && t.department === currentUser.department)
      .sort((a, b) => a.period - b.period);
  }, [state.timetableSessions, todayScheduleDay, currentUser.uid, currentUser.department]);

  const filteredStaffTimetable = useMemo(() => {
    return state.timetableSessions
      .filter((t) => {
        if (ttDayFilter !== 'All' && t.day !== ttDayFilter) return false;
        if (ttScope === 'mine' && t.staffUid !== currentUser.uid) return false;
        return true;
      })
      .sort((a, b) => {
        const dayDiff = (DAY_ORDER[a.day] || 9) - (DAY_ORDER[b.day] || 9);
        return dayDiff !== 0 ? dayDiff : a.period - b.period;
      });
  }, [state.timetableSessions, ttDayFilter, ttScope, currentUser.uid]);

  const handleStaffCheckIn = async () => {
    setCheckinStatus(null);
    setCheckingIn(true);
    try {
      const pos = await getBrowserLocation();
      const distance = haversineMeters(
        pos.lat,
        pos.lng,
        state.geofence.lat,
        state.geofence.lng
      );
      if (distance > state.geofence.radiusMeters) {
        throw new Error(
          `Your location is ${distance}m from ${state.geofence.label} (allowed: ${state.geofence.radiusMeters}m). Check-in requires being inside the college area.`
        );
      }
      const res = await checkInStaff(distance);
      setCheckinStatus({
        type: 'success',
        message: `Checked in Present at ${res.checkinTime} (${distance}m from campus center).`,
      });
    } catch (err) {
      setCheckinStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Check-in failed.',
      });
    } finally {
      setCheckingIn(false);
    }
  };

  const todayStr = getTodayIso();
  const myTodayCheckin = state.staffCheckins.find(
    (c) => c.staffUid === currentUser.uid && c.date === todayStr
  );
  const myHistory = state.staffCheckins.filter((c) => c.staffUid === currentUser.uid);

  const liveAttendees = activeSession
    ? state.attendanceRecords.filter((r) => r.sessionId === activeSession.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Staff Profile Header */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-blue-700">
            {currentUser.isWarden ? 'Faculty & Hostel Warden' : 'Faculty / Staff Profile'}
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mt-0.5">{currentUser.name}</h2>
          <p className="text-sm text-slate-600 mt-0.5">{currentUser.department}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {currentUser.isWarden && (
            <button
              type="button"
              onClick={() => setActiveScreen('hostel')}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Take Hostel Attendance</span>
            </button>
          )}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('qr')}
              className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Start Class Attendance
            </button>
            <button
              type="button"
              onClick={() => setTab('timetable')}
              className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === 'timetable' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Class Timetable
            </button>
            <button
              type="button"
              onClick={() => setTab('checkin')}
              className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === 'checkin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              My Staff Check-in
            </button>
          </div>
        </div>
      </section>

      {tab === 'qr' ? (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* QR Session Controls / Live QR Display */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            {!activeSession ? (
              <>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Launch 30-Second Rotating QR Session
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Pick a period from today&apos;s timetable or configure a custom session below.
                  </p>
                </div>

                {todaysStaffClasses.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800">
                        {todayScheduleDay}&apos;s Timetable Quick-Launch
                      </span>
                      <button
                        type="button"
                        onClick={() => setTab('timetable')}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Manage timetable
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {todaysStaffClasses.slice(0, 4).map((tt) => (
                        <div
                          key={tt.id}
                          className="rounded-xl bg-white border border-slate-200 p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate">
                              P{tt.period} · {tt.subjectCode} · {tt.className}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate tabular-nums">
                              {tt.startTime} · Room {tt.room}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={starting}
                            onClick={() => handleStartFromTimetable(tt)}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium inline-flex items-center gap-1 shrink-0"
                          >
                            <Play className="w-3 h-3" />
                            <span>Start QR</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sessionError && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                    <span>{sessionError}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Subject
                    </label>
                    <select
                      value={selectedSubject}
                      onChange={(e) => setSelectedSubject(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900"
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} — {s.name}
                        </option>
                      ))}
                      <option value="__custom__">+ Add Custom Subject...</option>
                    </select>
                  </div>

                  {selectedSubject === '__custom__' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Subject Code
                        </label>
                        <input
                          type="text"
                          value={customSubCode}
                          onChange={(e) => setCustomSubCode(e.target.value)}
                          placeholder="e.g. CS3501"
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-mono uppercase"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Subject Name
                        </label>
                        <input
                          type="text"
                          value={customSubName}
                          onChange={(e) => setCustomSubName(e.target.value)}
                          placeholder="e.g. Compiler Design"
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Class
                      </label>
                      <input
                        type="text"
                        list="psna-class-options"
                        value={className}
                        onChange={(e) => setClassName(e.target.value)}
                        placeholder="e.g. III CSE A"
                        className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900"
                      />
                      <datalist id="psna-class-options">
                        <option value="ME CSE Year 1" />
                        <option value="III CSE A" />
                        <option value="III ECE B" />
                        <option value="III IT A" />
                        <option value="II CSE B" />
                        <option value="IV CSE A" />
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Classroom Radius
                      </label>
                      <select
                        value={radiusMeters}
                        onChange={(e) => setRadiusMeters(Number(e.target.value))}
                        className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900"
                      >
                        <option value={100}>100 meters</option>
                        <option value={250}>250 meters</option>
                        <option value={500}>500 meters</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Classroom Center Coordinates
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setLocationMode('gps')}
                        className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-medium ${
                          locationMode === 'gps'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        My Current Location
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationMode('campus')}
                        className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-medium ${
                          locationMode === 'campus'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        PSNA Main Block
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={starting}
                    onClick={() => handleStartSession()}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>{starting ? 'Acquiring Classroom GPS...' : 'Start Live Attendance QR'}</span>
                  </button>
                  {sessionError && locationMode === 'gps' && (
                    <button
                      type="button"
                      disabled={starting}
                      onClick={() => {
                        setLocationMode('campus');
                        void handleStartSession('campus');
                      }}
                      className="w-full min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium"
                    >
                      Use PSNA Main Block Coordinates Instead
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-emerald-700">Live Session Active</div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {activeSession.subjectCode} — {activeSession.subjectName}
                    </h3>
                    <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {activeSession.className} · Radius {activeSession.radiusMeters}m
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => stopAttendanceSession(activeSession.id)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                  >
                    <StopCircle className="w-4 h-4" />
                    <span>End Session</span>
                  </button>
                </div>

                <div className="flex flex-col items-center p-6 rounded-2xl bg-slate-50 border border-slate-200">
                  {qrDataUrl && (
                    <img
                      src={qrDataUrl}
                      alt="Class attendance QR code"
                      className="w-52 h-52 rounded-xl border border-slate-200 bg-white p-2"
                    />
                  )}
                  <div className="mt-4 text-center">
                    <div className="text-xs text-slate-500">Manual Fallback Token</div>
                    <div className="text-2xl font-mono font-semibold text-slate-900 tracking-wider mt-0.5 tabular-nums">
                      {activeSession.currentToken}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      Refreshes in {secondsLeft}s
                    </span>
                    <button
                      type="button"
                      onClick={() => rotateSessionToken(activeSession.id)}
                      className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Rotate now
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live List of Students Marked Present */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Live Present Roster
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Students verified by QR/code and classroom location
                </p>
              </div>
              <span className="text-sm font-semibold text-blue-700 tabular-nums">
                {liveAttendees.length} Present
              </span>
            </div>

            {liveAttendees.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-10 text-center text-slate-500">
                <UserCheck className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-700">No scans recorded yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Start a session and have students scan the QR or enter the manual code on the Student screen.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {liveAttendees.map((rec) => (
                  <div key={rec.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{rec.studentName}</div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        {rec.registerNumber} · {rec.className}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-medium text-emerald-700 block">Present</span>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        via {rec.markedVia}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : tab === 'timetable' ? (
        /* Staff Class Timetable Tab */
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">Faculty Class Timetable</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Schedule weekly periods and start live 30-second QR attendance in one click.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTtScope('mine')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium ${
                    ttScope === 'mine' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  My Classes
                </button>
                <button
                  type="button"
                  onClick={() => setTtScope('all')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium ${
                    ttScope === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  All Department
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (showTtForm && !editingTtId) {
                    setShowTtForm(false);
                  } else {
                    resetTtForm();
                    setShowTtForm(true);
                  }
                }}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Timetable Period</span>
              </button>
            </div>
          </div>

          {ttMessage && (
            <div
              role="status"
              className={`p-3.5 rounded-xl border text-sm flex items-center gap-2 ${
                ttMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {ttMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{ttMessage.text}</span>
            </div>
          )}

          {showTtForm && (
            <form
              onSubmit={handleSaveTimetable}
              className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 space-y-4"
            >
              <div className="text-sm font-semibold text-slate-900">
                {editingTtId ? 'Edit Timetable Period' : 'Add Timetable Period'}
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
                      if (PERIOD_DEFAULT_TIMES[p]) {
                        setTtStartTime(PERIOD_DEFAULT_TIMES[p].start);
                        setTtEndTime(PERIOD_DEFAULT_TIMES[p].end);
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
                    placeholder="09:00 AM"
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
                    placeholder="09:50 AM"
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
                  <select
                    value={ttSubjChoice}
                    onChange={(e) => setTtSubjChoice(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                    <option value="__custom__">+ Custom Subject...</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Class</label>
                  <input
                    type="text"
                    required
                    list="psna-staff-tt-classes"
                    value={ttClassName}
                    onChange={(e) => setTtClassName(e.target.value)}
                    placeholder="ME CSE Year 1"
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                  />
                  <datalist id="psna-staff-tt-classes">
                    <option value="ME CSE Year 1" />
                    <option value="III CSE A" />
                    <option value="III ECE B" />
                    <option value="III IT A" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Room / Lab</label>
                  <input
                    type="text"
                    required
                    value={ttRoom}
                    onChange={(e) => setTtRoom(e.target.value)}
                    placeholder="PG-102"
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                  />
                </div>

                {ttSubjChoice === '__custom__' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Custom Code
                      </label>
                      <input
                        type="text"
                        required
                        value={ttCustomCode}
                        onChange={(e) => setTtCustomCode(e.target.value)}
                        placeholder="CS3491"
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-mono uppercase"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Custom Subject Name
                      </label>
                      <input
                        type="text"
                        required
                        value={ttCustomName}
                        onChange={(e) => setTtCustomName(e.target.value)}
                        placeholder="Artificial Intelligence & ML"
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    QR Radius (m)
                  </label>
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
                    resetTtForm();
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

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTtDayFilter('All')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                ttDayFilter === 'All'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              All Days
            </button>
            {TIMETABLE_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setTtDayFilter(day)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                  ttDayFilter === day
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {day}
                {getTodayDayName() === day ? ' (Today)' : ''}
              </button>
            ))}
          </div>

          {filteredStaffTimetable.length === 0 ? (
            <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 text-center text-sm text-slate-500">
              No timetable periods found for this view. Click Add Timetable Period or switch to All Department.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2.5 pr-4 font-medium">Day &amp; Period</th>
                    <th className="py-2.5 pr-4 font-medium">Subject</th>
                    <th className="py-2.5 pr-4 font-medium">Class &amp; Room</th>
                    <th className="py-2.5 pr-4 font-medium">Faculty</th>
                    <th className="py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStaffTimetable.map((tt) => {
                    const isMine = tt.staffUid === currentUser.uid;
                    const isLive = Boolean(
                      activeSession &&
                        activeSession.subjectCode === tt.subjectCode &&
                        activeSession.className === tt.className
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
                          <div className="font-medium text-slate-900">
                            <span className="font-mono text-slate-700 mr-1.5">{tt.subjectCode}</span>
                            {tt.subjectName}
                          </div>
                          {isLive && (
                            <span className="text-[11px] font-semibold text-emerald-700">
                              QR Session Active
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          <div>{tt.className}</div>
                          <div className="text-xs text-slate-500">Room {tt.room}</div>
                        </td>
                        <td className="py-3 pr-4 text-slate-600 text-xs">{tt.staffName}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={starting}
                              onClick={() => handleStartFromTimetable(tt)}
                              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium inline-flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" />
                              <span>Start QR</span>
                            </button>
                            {isMine && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditTtForm(tt)}
                                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await deleteTimetableSession(tt.id);
                                    setTtMessage({
                                      type: 'success',
                                      text: `Removed ${tt.subjectCode} (${tt.day} Period ${tt.period}).`,
                                    });
                                  }}
                                  className="min-h-[32px] px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        /* Staff Check-In Tab */
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">
              Daily Campus Staff Check-in
            </h3>
            <p className="text-sm text-slate-600">
              Location verification against {state.geofence.label} ({state.geofence.radiusMeters}m radius).
            </p>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Status for {todayStr}</div>
                <div className="text-lg font-semibold text-slate-900 mt-0.5">
                  {myTodayCheckin ? `Present (${myTodayCheckin.checkinTime})` : 'Not Checked In'}
                </div>
              </div>
              {myTodayCheckin && (
                <span className="text-xs font-mono text-emerald-700 tabular-nums">
                  {myTodayCheckin.distanceMeters}m from center
                </span>
              )}
            </div>

            {checkinStatus && (
              <div
                className={`p-3.5 rounded-xl border text-sm flex items-start gap-2 ${
                  checkinStatus.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{checkinStatus.message}</span>
              </div>
            )}

            <button
              type="button"
              disabled={checkingIn}
              onClick={handleStaffCheckIn}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <MapPin className="w-4 h-4" />
              <span>{checkingIn ? 'Verifying Campus GPS...' : 'Verify Location & Check In'}</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Recent Check-in History</h3>
            {myHistory.length === 0 ? (
              <p className="text-sm text-slate-500">No check-in logs yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {myHistory.map((h) => (
                  <div key={h.id} className="py-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium text-slate-900 tabular-nums">{h.date}</div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {h.checkinTime} · {h.distanceMeters}m from campus center
                      </div>
                    </div>
                    <span className="text-xs font-medium text-emerald-700">{h.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
