import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {
  AlertCircle,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  MapPin,
  QrCode,
  RefreshCw,
  StopCircle,
  UserCheck,
} from 'lucide-react';
import { SUBJECTS } from '../data/seedData';
import { useApp } from '../context/AppContext';
import { getTodayIso } from '../services/dataService';
import { getBrowserLocation, haversineMeters } from '../utils/geo';

export function AttendanceView() {
  const {
    currentUser,
    state,
    startAttendanceSession,
    rotateSessionToken,
    stopAttendanceSession,
    markStudentAttendance,
    checkInStaff,
  } = useApp();

  if (!currentUser) return null;

  if (currentUser.role === 'staff') {
    return (
      <StaffAttendancePanel
        currentUser={currentUser}
        state={state}
        startAttendanceSession={startAttendanceSession}
        rotateSessionToken={rotateSessionToken}
        stopAttendanceSession={stopAttendanceSession}
        checkInStaff={checkInStaff}
      />
    );
  }

  return (
    <StudentAttendancePanel
      currentUser={currentUser}
      state={state}
      markStudentAttendance={markStudentAttendance}
    />
  );
}

function StudentAttendancePanel({
  currentUser,
  state,
  markStudentAttendance,
}: {
  currentUser: NonNullable<ReturnType<typeof useApp>['currentUser']>;
  state: ReturnType<typeof useApp>['state'];
  markStudentAttendance: ReturnType<typeof useApp>['markStudentAttendance'];
}) {
  const [tab, setTab] = useState<'summary' | 'scan'>('summary');
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
  const streamRef = useRef<MediaStream | null>(null);

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

  const activeSessions = state.attendanceSessions.filter((s) => s.active);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const verifyAndSubmitToken = async (rawInput: string, markedVia: 'QR' | 'Manual') => {
    setVerifying(true);
    setScanStatus({ type: 'info', message: 'Verifying classroom location and QR token...' });

    try {
      let token = rawInput.trim();
      let targetSessionId: string | null = null;
      if (token.startsWith('{')) {
        try {
          const parsed = JSON.parse(token) as { sessionId?: string; token?: string };
          if (parsed.token) token = parsed.token;
          if (parsed.sessionId) targetSessionId = parsed.sessionId;
        } catch {
          // treat as plain code
        }
      }

      const matchingSession =
        (targetSessionId
          ? activeSessions.find((s) => s.id === targetSessionId)
          : activeSessions.find(
              (s) => s.currentToken.toUpperCase() === token.toUpperCase()
            )) || activeSessions[0];

      if (!matchingSession) {
        throw new Error('No active QR attendance session is currently running.');
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
      setVerifying(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setScanStatus(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API is not available in this browser. Use the manual code entry below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Camera permission denied or unavailable (${err.message}). Use manual code entry below.`
          : 'Camera permission denied. Use manual code entry below.'
      );
    }
  };

  useEffect(() => {
    if (!cameraActive) return;
    let rafId = 0;
    let cancelled = false;

    const video = videoRef.current;
    if (video && streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }

    const scanFrame = () => {
      if (cancelled) return;
      const vid = videoRef.current;
      const canvas = canvasRef.current;
      if (vid && canvas && vid.readyState === vid.HAVE_ENOUGH_DATA) {
        canvas.width = vid.videoWidth;
        canvas.height = vid.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code?.data && !verifying) {
            verifyAndSubmitToken(code.data, 'QR');
            return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive, verifying]);

  return (
    <div className="space-y-6">
      {/* Student Academic Profile */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-blue-700">Student Academic Profile</div>
          <h2 className="text-xl font-semibold text-slate-900 mt-0.5">{currentUser.name}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 mt-1">
            <span className="font-mono tabular-nums">{currentUser.registerNumber || 'Reg. Pending'}</span>
            <span aria-hidden="true">·</span>
            <span>{currentUser.className || 'III CSE A'}</span>
            <span aria-hidden="true">·</span>
            <span>{currentUser.department}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
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
            onClick={() => setTab('scan')}
            className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              tab === 'scan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Scan Attendance
          </button>
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
      ) : (
        /* Scan Attendance Tab */
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">Camera QR Scanner</h3>
              </div>
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
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                </>
              ) : (
                <div className="text-center text-slate-300 px-6">
                  <QrCode className="w-10 h-10 mx-auto mb-2 opacity-70" />
                  <p className="text-sm font-medium">Camera preview inactive</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Click Start Camera to scan the 30-second QR code on your faculty screen, or use manual entry.
                  </p>
                </div>
              )}
            </div>
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
                No class attendance session is currently active. Switch to a Staff demo account to start a live session, or wait for faculty to open QR attendance.
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
                <div className="font-semibold">
                  Active Session: {activeSessions[0].subjectCode} — {activeSessions[0].subjectName}
                </div>
                <div>
                  Faculty: {activeSessions[0].staffName} · Class: {activeSessions[0].className} · Allowed radius:{' '}
                  <span className="font-mono tabular-nums">{activeSessions[0].radiusMeters}m</span>
                </div>
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
}: {
  currentUser: NonNullable<ReturnType<typeof useApp>['currentUser']>;
  state: ReturnType<typeof useApp>['state'];
  startAttendanceSession: ReturnType<typeof useApp>['startAttendanceSession'];
  rotateSessionToken: ReturnType<typeof useApp>['rotateSessionToken'];
  stopAttendanceSession: ReturnType<typeof useApp>['stopAttendanceSession'];
  checkInStaff: ReturnType<typeof useApp>['checkInStaff'];
}) {
  const [tab, setTab] = useState<'qr' | 'checkin'>('qr');
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0].code);
  const [customSubCode, setCustomSubCode] = useState('');
  const [customSubName, setCustomSubName] = useState('');
  const [className, setClassName] = useState('III CSE A');
  const [locationMode, setLocationMode] = useState<'gps' | 'campus'>('gps');
  const [radiusMeters, setRadiusMeters] = useState(250);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [checkinStatus, setCheckinStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const activeSession = state.attendanceSessions.find(
    (s) => s.active && s.staffUid === currentUser.uid
  );

  // Rotate QR token every 30s
  useEffect(() => {
    if (!activeSession) {
      setQrDataUrl('');
      return;
    }

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
      if (remaining <= 0) {
        rotateSessionToken(activeSession.id).catch(() => {});
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession, rotateSessionToken]);

  const handleStartSession = async () => {
    setSessionError(null);
    setStarting(true);
    try {
      let lat = state.geofence.lat;
      let lng = state.geofence.lng;
      if (locationMode === 'gps') {
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

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
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
            onClick={() => setTab('checkin')}
            className={`min-h-[40px] px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              tab === 'checkin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Staff Check-in
          </button>
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
                    Students scan this QR code or enter the rotating code while inside the classroom radius.
                  </p>
                </div>

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
                    onClick={handleStartSession}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>{starting ? 'Acquiring Classroom GPS...' : 'Start Live Attendance QR'}</span>
                  </button>
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
