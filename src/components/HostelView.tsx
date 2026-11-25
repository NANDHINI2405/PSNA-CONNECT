import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  BedDouble,
  Camera,
  CheckCircle2,
  Clock,
  Edit3,
  Home,
  ImageUp,
  MapPin,
  MessageSquare,
  Play,
  Plus,
  QrCode,
  Search,
  ShieldAlert,
  StopCircle,
  UserCheck,
  Utensils,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getTodayDayName, getTodayIso } from '../services/dataService';
import {
  DayOfWeek,
  HostelMenu,
  HostelStatus,
  HostelType,
  RequestStatus,
  canAccessScreen,
  getDefaultBlockForHostel,
  getUserGender,
  getUserHostelType,
} from '../types';
import { getBrowserLocation, haversineMeters } from '../utils/geo';
import { BarcodeDetectorCtor, decodeCanvasQr } from '../utils/qr';

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
  if (!canAccessScreen(currentUser, 'hostel')) {
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

  if (currentUser && (currentUser.isWarden || currentUser.role === 'management')) {
    return <WardenHostelConsole />;
  }

  if (currentUser && currentUser.isHostel) {
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
    dataMode,
    state,
    visibleNotices,
    updateMyHostelStatus,
    markResidentHostelAttendance,
    setActiveScreen,
  } = useApp();

  const todayDay = getTodayDayName();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(todayDay);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [useCampusAnchorDemo, setUseCampusAnchorDemo] = useState(false);
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

  const myHostelType: HostelType = currentUser
    ? getUserHostelType(currentUser) ||
      (getUserGender(currentUser) === 'Girl' ? 'Girls Hostel' : 'Boys Hostel')
    : 'Boys Hostel';

  const wingRooms = useMemo(
    () => state.hostelRooms.filter((r) => r.hostelType === myHostelType),
    [state.hostelRooms, myHostelType]
  );

  const myWarden = useMemo(
    () => state.users.find((u) => u.isWarden && getUserHostelType(u) === myHostelType),
    [state.users, myHostelType]
  );

  const myRoom = wingRooms.find(
    (r) =>
      (currentUser && r.occupantUids.includes(currentUser.uid)) ||
      (currentUser?.roomNumber && r.roomNumber === currentUser.roomNumber)
  );

  // Roommates: ONLY name and className from same hostel wing (strict privacy rule!)
  const roommates = useMemo(() => {
    if (!myRoom || !currentUser) return [];
    return state.users.filter(
      (u) =>
        u.uid !== currentUser.uid &&
        u.isHostel &&
        getUserHostelType(u) === myHostelType &&
        (myRoom.occupantUids.includes(u.uid) || u.roomNumber === myRoom.roomNumber)
    );
  }, [myRoom, state.users, currentUser, myHostelType]);

  const activeHostelSessions = useMemo(
    () =>
      state.hostelAttendanceSessions
        .filter((s) => s.active && s.hostelType === myHostelType)
        .sort((a, b) => (b.tokenIssuedAt || 0) - (a.tokenIssuedAt || 0)),
    [state.hostelAttendanceSessions, myHostelType]
  );

  const myHostelLogs = useMemo(() => {
    if (!currentUser) return [];
    return state.hostelAttendanceLogs
      .filter((l) => l.residentUid === currentUser.uid)
      .sort((a, b) => {
        const dateDiff = b.date.localeCompare(a.date);
        if (dateDiff !== 0) return dateDiff;
        return (b.markedAt || '').localeCompare(a.markedAt || '');
      });
  }, [state.hostelAttendanceLogs, currentUser]);

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

  const verifyHostelRollCall = async (rawInput: string, markedVia: 'QR' | 'Manual') => {
    if (verifyingRef.current || !currentUser) return;
    verifyingRef.current = true;
    setVerifying(true);
    setScanStatus({ type: 'info', message: 'Verifying hostel roll-call code & location...' });

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
        ? state.hostelAttendanceSessions.find(
            (s) => s.id === targetSessionId && s.hostelType === myHostelType
          )
        : activeHostelSessions.find((s) => {
            const expected = s.currentToken.trim().toUpperCase();
            return (
              expected === normalizedToken ||
              expected.replace(/^PSNA-/, '') === normalizedToken
            );
          });

      if (!matchingSession && !targetSessionId) {
        matchingSession = activeHostelSessions[0];
      }

      if (!matchingSession) {
        throw new Error(`No active ${myHostelType} roll-call session is running right now.`);
      }
      if (!matchingSession.active) {
        throw new Error(
          `${matchingSession.sessionLabel} (${matchingSession.hostelType}) has already ended.`
        );
      }

      const alreadyMarked = myHostelLogs.find((l) => l.sessionId === matchingSession.id);
      if (alreadyMarked) {
        setScanStatus({
          type: 'success',
          message: `You are already marked In for ${matchingSession.sessionLabel} (${alreadyMarked.date}).`,
        });
        setManualCode('');
        stopCamera();
        return;
      }

      let distance = 0;
      if (!(dataMode === 'demo' && useCampusAnchorDemo)) {
        const pos = await getBrowserLocation();
        distance = haversineMeters(
          pos.lat,
          pos.lng,
          matchingSession.campusLat,
          matchingSession.campusLng
        );
        if (distance > matchingSession.radiusMeters) {
          throw new Error(
            `You are ${distance}m from ${myHostelType} (allowed radius: ${matchingSession.radiusMeters}m). Attendance rejected outside hostel geofence.`
          );
        }
      }

      const log = await markResidentHostelAttendance({
        session: matchingSession,
        token,
        markedVia,
      });

      setScanStatus({
        type: 'success',
        message: `Hostel attendance marked In for ${log.sessionLabel || 'Roll Call'} (${log.date})${
          dataMode === 'demo' && useCampusAnchorDemo
            ? ' · Campus anchor verified.'
            : ` · Verified ${distance}m from hostel.`
        }`,
      });
      setManualCode('');
      stopCamera();
    } catch (err) {
      setScanStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to mark hostel attendance.',
      });
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  verifyFnRef.current = verifyHostelRollCall;

  const startCamera = async () => {
    setCameraError(null);
    setScanStatus(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Live camera streaming is unavailable in this browser. Use "Scan QR Image" or Manual Roll-Call Code.'
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
          ? `Camera permission denied or unavailable (${err.message}). Try "Scan QR Image" or Manual Code.`
          : 'Unable to open camera.'
      );
    }
  };

  useEffect(() => {
    if (!cameraActive || !streamRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = streamRef.current;
    video.play().catch(() => {});

    let cancelled = false;
    const canvas = canvasRef.current || document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const DetectorCtor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;
    let detector: ReturnType<() => InstanceType<BarcodeDetectorCtor>> | null = null;
    if (DetectorCtor) {
      try {
        detector = new DetectorCtor({ formats: ['qr_code'] });
      } catch {
        detector = null;
      }
    }

    let timerId: number | undefined;

    const scanFrame = async () => {
      if (cancelled || !videoRef.current) return;
      const v = videoRef.current;
      if (v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0 && !verifyingRef.current) {
        let detected: string | null = null;
        if (ctx) {
          try {
            detected = decodeCanvasQr(canvas, ctx, v, v.videoWidth, v.videoHeight);
          } catch {
            // fallback below
          }
        }
        if (!detected && detector) {
          try {
            const found = await detector.detect(v);
            detected = found.find((f) => f.rawValue)?.rawValue || null;
          } catch {
            // ignore frame read errors
          }
        }
        if (detected) {
          const now = Date.now();
          const isSameRecent =
            lastAttemptRef.current.payload === detected && now - lastAttemptRef.current.at < 3500;
          if (!isSameRecent) {
            lastAttemptRef.current = { payload: detected, at: now };
            await verifyFnRef.current(detected, 'QR');
          }
        }
      }
      if (!cancelled) {
        timerId = window.setTimeout(scanFrame, 250);
      }
    };

    timerId = window.setTimeout(scanFrame, 300);
    return () => {
      cancelled = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [cameraActive]);

  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCameraError(null);
    setScanStatus({ type: 'info', message: 'Reading hostel roll-call QR image...' });
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let raw: string | null = null;
      if (ctx) {
        raw = decodeCanvasQr(canvas, ctx, bitmap, bitmap.width, bitmap.height);
      }
      if (!raw) {
        const DetectorCtor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
          .BarcodeDetector;
        if (DetectorCtor) {
          try {
            const detector = new DetectorCtor({ formats: ['qr_code'] });
            const found = await detector.detect(bitmap);
            raw = found.find((f) => f.rawValue)?.rawValue || null;
          } catch {
            // ignore
          }
        }
      }
      bitmap.close();
      if (!raw) {
        throw new Error('No readable QR code found in the uploaded image.');
      }
      await verifyHostelRollCall(raw, 'QR');
    } catch (err) {
      setScanStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to decode uploaded QR image.',
      });
    }
  };

  if (!currentUser) return null;

  const vacantRooms = wingRooms.filter((r) => r.occupantUids.length < r.capacity);
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
              <div className="text-xs font-medium text-blue-700">
                {myHostelType} · {myHostelType === 'Girls Hostel' ? 'Girls Only' : 'Boys Only'}
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mt-0.5">
                Room {myRoom?.roomNumber || currentUser.roomNumber || 'Unassigned'} ·{' '}
                {myRoom?.block || currentUser.block || getDefaultBlockForHostel(myHostelType)}
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                {currentUser.className || 'Student'} · {currentUser.department}
                {myWarden
                  ? ` · Warden: ${myWarden.name} (${
                      myHostelType === 'Girls Hostel' ? 'Female Warden' : 'Male Warden'
                    })`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveScreen('chat')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium inline-flex items-center gap-2 self-start"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Open {myHostelType} Chat</span>
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
                Vacant {myHostelType} Rooms
              </h3>
              {vacantRooms.length === 0 ? (
                <p className="text-sm text-slate-500">All {myHostelType} rooms are currently full.</p>
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

      {/* Hostel Roll-Call Attendance Scanner & History */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scan / Enter Roll-Call Code */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div>
            <div className="text-xs font-medium text-blue-700">{myHostelType} Attendance</div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              Mark Hostel Roll-Call Attendance (QR / Code)
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Scan the Warden&apos;s 30-second roll-call QR code or enter the code shown on the hostel notice screen.
            </p>
          </div>

          {activeHostelSessions.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
              No active {myHostelType} QR roll-call session is running right now. Check with your Warden or update your daily movement status above.
            </div>
          ) : (
            <div className="space-y-2">
              {activeHostelSessions.map((sess) => {
                const already = myHostelLogs.find((l) => l.sessionId === sess.id);
                return (
                  <div
                    key={sess.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                      already
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                        : 'bg-blue-50 border-blue-200 text-blue-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold">
                      <span>
                        {sess.sessionLabel} · {sess.hostelType}
                      </span>
                      {already ? (
                        <span className="text-emerald-700 font-semibold">Marked In</span>
                      ) : (
                        <span className="text-blue-700 font-semibold">Live Now</span>
                      )}
                    </div>
                    <div>
                      Warden: {sess.wardenName} · Date: {sess.date} · Radius:{' '}
                      <span className="font-mono tabular-nums">{sess.radiusMeters}m</span>
                    </div>
                    {dataMode === 'demo' && !already && (
                      <div className="pt-1 flex items-center justify-between gap-2 text-[11px] text-blue-800">
                        <span>
                          Demo Roll-Call Code:{' '}
                          <strong className="font-mono">{sess.currentToken}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setManualCode(sess.currentToken)}
                          className="underline font-medium hover:text-blue-950"
                        >
                          Fill code
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Camera & Upload Controls */}
          <div className="flex flex-wrap gap-2">
            {!cameraActive ? (
              <button
                type="button"
                onClick={startCamera}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Camera className="w-4 h-4" />
                <span>Open Camera Scanner</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <StopCircle className="w-4 h-4" />
                <span>Close Camera</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
            >
              <ImageUp className="w-4 h-4" />
              <span>Scan QR Image</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleQrImageUpload}
              className="hidden"
            />
          </div>

          {cameraActive && (
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 aspect-video relative">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />

          {cameraError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              {cameraError}
            </div>
          )}

          {dataMode === 'demo' && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={useCampusAnchorDemo}
                onChange={(e) => setUseCampusAnchorDemo(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>Demo mode: use campus hostel coordinates if GPS is blocked</span>
            </label>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualCode.trim()) verifyHostelRollCall(manualCode, 'Manual');
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Enter roll-call code (e.g. PSNA-742910)"
              className="flex-1 h-11 px-3.5 rounded-xl border border-slate-200 font-mono text-sm uppercase text-slate-900"
            />
            <button
              type="submit"
              disabled={verifying || !manualCode.trim()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{verifying ? 'Verifying...' : 'Mark Hostel In'}</span>
            </button>
          </form>

          {scanStatus && (
            <div
              role="status"
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${
                scanStatus.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : scanStatus.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              {scanStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{scanStatus.message}</span>
            </div>
          )}
        </div>

        {/* My Hostel Attendance History */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">My Hostel Attendance Log</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Roll-call records marked via QR check-in or {myHostelType} Warden
              </p>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              {myHostelLogs.length} record{myHostelLogs.length === 1 ? '' : 's'}
            </span>
          </div>

          {myHostelLogs.length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-sm text-slate-500">
              No hostel attendance entries recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
              {myHostelLogs.map((log) => (
                <div key={log.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <div className="font-medium text-slate-900">
                      {log.sessionLabel || 'Daily Roll Call'}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                      {log.date} · Room {log.roomNumber} · Via {log.markedVia || 'Warden'}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                      log.status === 'In'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : log.status === 'Out'
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
              ))}
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
    currentUser,
    state,
    getPrivateForUser,
    updateHostelMenu,
    startHostelAttendanceSession,
    rotateHostelSessionToken,
    stopHostelAttendanceSession,
    saveHostelAttendanceBatch,
    allotResidentRoom,
    createHostelRoom,
    updateUserPrivateInfo,
    reviewApprovalRequest,
  } = useApp();

  const isManagement = currentUser?.role === 'management';
  const wardenHostelType: HostelType | null =
    currentUser?.isWarden && !isManagement ? getUserHostelType(currentUser) || 'Boys Hostel' : null;

  const [wingFilter, setWingFilter] = useState<'All' | HostelType>(wardenHostelType || 'All');
  const activeWingFilter: 'All' | HostelType = wardenHostelType || wingFilter;

  const [tab, setTab] = useState<'residents' | 'rooms' | 'menu' | 'attendance' | 'approvals'>(
    'residents'
  );
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'All' | RequestStatus>('Pending');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [selectedResidentUid, setSelectedResidentUid] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(getTodayDayName());
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, HostelStatus>>({});
  const [attendanceDate, setAttendanceDate] = useState<string>(() => getTodayIso());
  const [manualSessionLabel, setManualSessionLabel] = useState<string>('Night Roll Call');
  const [logDateFilter, setLogDateFilter] = useState<'selected' | 'all'>('selected');

  // Hostel Live QR Roll-Call state
  const [qrSessionWing, setQrSessionWing] = useState<HostelType>(wardenHostelType || 'Boys Hostel');
  const [qrSessionLabel, setQrSessionLabel] = useState<string>('Night Roll Call');
  const [qrLocationMode, setQrLocationMode] = useState<'campus' | 'gps'>('campus');
  const [qrRadiusMeters, setQrRadiusMeters] = useState<number>(250);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number>(30);
  const [startingQr, setStartingQr] = useState<boolean>(false);
  const rotatingHostelRef = useRef(false);

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
  const [newRoomHostelType, setNewRoomHostelType] = useState<HostelType>(
    wardenHostelType || 'Boys Hostel'
  );
  const [roomNumber, setRoomNumber] = useState('');
  const [roomBlock, setRoomBlock] = useState(
    getDefaultBlockForHostel(wardenHostelType || 'Boys Hostel')
  );
  const [roomFloor, setRoomFloor] = useState('2nd Floor');
  const [roomCapacity, setRoomCapacity] = useState('2');

  const effectiveRoomHostelType: HostelType = wardenHostelType || newRoomHostelType;
  const effectiveQrWing: HostelType =
    wardenHostelType || (activeWingFilter !== 'All' ? activeWingFilter : qrSessionWing);

  const activeHostelQrSession = useMemo(
    () =>
      state.hostelAttendanceSessions.find(
        (s) => s.active && s.hostelType === effectiveQrWing
      ) || null,
    [state.hostelAttendanceSessions, effectiveQrWing]
  );

  useEffect(() => {
    if (!activeHostelQrSession) {
      setQrDataUrl('');
      rotatingHostelRef.current = false;
      return;
    }

    rotatingHostelRef.current = false;
    setQrSecondsLeft(
      Math.max(0, Math.ceil((activeHostelQrSession.expiresAt - Date.now()) / 1000))
    );

    const renderQr = async () => {
      const payload = JSON.stringify({
        sessionId: activeHostelQrSession.id,
        token: activeHostelQrSession.currentToken,
      });
      try {
        const url = await QRCode.toDataURL(payload, { width: 220, margin: 2 });
        setQrDataUrl(url);
      } catch {
        // ignore
      }
    };
    renderQr();

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((activeHostelQrSession.expiresAt - Date.now()) / 1000)
      );
      setQrSecondsLeft(remaining);
      if (remaining <= 0 && !rotatingHostelRef.current) {
        rotatingHostelRef.current = true;
        rotateHostelSessionToken(activeHostelQrSession.id).catch(() => {
          rotatingHostelRef.current = false;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeHostelQrSession, rotateHostelSessionToken]);

  const residents = useMemo(() => {
    return state.users.filter((u) => {
      if (!u.isHostel) return false;
      if (activeWingFilter === 'All') return true;
      return getUserHostelType(u) === activeWingFilter;
    });
  }, [state.users, activeWingFilter]);

  const visibleRooms = useMemo(() => {
    if (activeWingFilter === 'All') return state.hostelRooms;
    return state.hostelRooms.filter((r) => r.hostelType === activeWingFilter);
  }, [state.hostelRooms, activeWingFilter]);

  const wingApprovals = useMemo(() => {
    return state.approvalRequests
      .filter((r) => {
        if (r.targetQueue !== 'warden') return false;
        if (activeWingFilter !== 'All' && r.targetHostelType !== activeWingFilter) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.approvalRequests, activeWingFilter]);

  const pendingWingApprovalsCount = useMemo(
    () => wingApprovals.filter((r) => r.status === 'Pending').length,
    [wingApprovals]
  );

  const boysWarden = useMemo(
    () => state.users.find((u) => u.isWarden && getUserHostelType(u) === 'Boys Hostel'),
    [state.users]
  );
  const girlsWarden = useMemo(
    () => state.users.find((u) => u.isWarden && getUserHostelType(u) === 'Girls Hostel'),
    [state.users]
  );

  const filteredResidents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.className || '').toLowerCase().includes(q) ||
        (r.roomNumber || '').toLowerCase().includes(q) ||
        (getUserHostelType(r) || '').toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
    );
  }, [residents, search]);

  const selectedResident =
    residents.find((r) => r.uid === selectedResidentUid) || filteredResidents[0] || null;
  const selectedPrivate = selectedResident ? getPrivateForUser(selectedResident.uid) : null;

  const selectedRoommates = useMemo(() => {
    if (!selectedResident) return [];
    const resHostel = getUserHostelType(selectedResident);
    return residents.filter(
      (r) =>
        r.uid !== selectedResident.uid &&
        getUserHostelType(r) === resHostel &&
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
        })),
        {
          date: attendanceDate,
          sessionLabel: manualSessionLabel,
        }
      );
      setFeedback({
        type: 'success',
        message: `Saved ${manualSessionLabel || 'Daily Roll Call'} (${
          activeWingFilter === 'All' ? 'All Hostels' : activeWingFilter
        }) for ${attendanceDate}: ${totals.inCount} In, ${totals.outCount} Out, ${totals.leaveCount} Leave.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save attendance.',
      });
    }
  };

  const handleMarkAllIn = () => {
    const nextDraft: Record<string, HostelStatus> = {};
    residents.forEach((r) => {
      nextDraft[r.uid] = 'In';
    });
    setAttendanceDraft(nextDraft);
  };

  const handleStartHostelQr = async () => {
    setFeedback(null);
    setStartingQr(true);
    try {
      let lat = state.geofence.lat;
      let lng = state.geofence.lng;
      if (qrLocationMode === 'gps') {
        const pos = await getBrowserLocation();
        lat = pos.lat;
        lng = pos.lng;
      }
      const created = await startHostelAttendanceSession({
        hostelType: effectiveQrWing,
        sessionLabel: qrSessionLabel,
        lat,
        lng,
        radiusMeters: qrRadiusMeters,
      });
      setFeedback({
        type: 'success',
        message: `Started live QR roll-call "${created.sessionLabel}" for ${created.hostelType}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start hostel QR roll call.',
      });
    } finally {
      setStartingQr(false);
    }
  };

  const visibleHostelLogs = useMemo(() => {
    return state.hostelAttendanceLogs
      .filter((l) => {
        if (activeWingFilter !== 'All' && l.hostelType && l.hostelType !== activeWingFilter) {
          return false;
        }
        if (logDateFilter === 'selected' && l.date !== attendanceDate) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateDiff = b.date.localeCompare(a.date);
        if (dateDiff !== 0) return dateDiff;
        return (b.markedAt || '').localeCompare(a.markedAt || '');
      });
  }, [activeWingFilter, attendanceDate, logDateFilter, state.hostelAttendanceLogs]);

  const activeQrAttendees = activeHostelQrSession
    ? state.hostelAttendanceLogs.filter((l) => l.sessionId === activeHostelQrSession.id)
    : [];

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
        hostelType: effectiveRoomHostelType,
        floor: roomFloor,
        capacity: Number(roomCapacity) || 2,
      });
      setRoomNumber('');
      setFeedback({
        type: 'success',
        message: `Added ${created.hostelType} Room ${created.roomNumber} (${created.block}).`,
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
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-blue-700">
              {wardenHostelType
                ? `${wardenHostelType} Administration · ${
                    wardenHostelType === 'Girls Hostel' ? 'Female Warden (Girls Only)' : 'Male Warden (Boys Only)'
                  }`
                : 'Management Hostel Administration · Boys & Girls Hostels'}
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mt-0.5">
              {wardenHostelType ? `${wardenHostelType} Operations & Resident Records` : 'Hostel Operations & Resident Records'}
            </h2>
            <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
              {residents.length} Residents · {visibleRooms.length} Rooms ·{' '}
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
                {
                  id: 'approvals',
                  label:
                    pendingWingApprovalsCount > 0
                      ? `Approval Queue (${pendingWingApprovalsCount})`
                      : 'Approval Queue',
                },
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
        </div>

        {/* Hostel Wing Scope Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            {(!wardenHostelType || wardenHostelType === 'Boys Hostel') && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 font-medium">
                Boys Hostel (Boys Only) · Male Warden: {boysWarden?.name || 'Unassigned'}
              </span>
            )}
            {(!wardenHostelType || wardenHostelType === 'Girls Hostel') && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 font-medium">
                Girls Hostel (Girls Only) · Female Warden: {girlsWarden?.name || 'Unassigned'}
              </span>
            )}
          </div>

          {isManagement && (
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
              {(['All', 'Boys Hostel', 'Girls Hostel'] as const).map((wing) => (
                <button
                  key={wing}
                  type="button"
                  onClick={() => {
                    setWingFilter(wing);
                    if (wing !== 'All') {
                      setNewRoomHostelType(wing);
                      setRoomBlock(getDefaultBlockForHostel(wing));
                    }
                  }}
                  className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    wingFilter === wing
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {wing === 'All' ? 'All Hostels' : wing}
                </button>
              ))}
            </div>
          )}
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
                          {getUserHostelType(res) || 'Hostel'} · Room {res.roomNumber || '-'} · {res.className || res.department}
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
                      {getUserHostelType(selectedResident) || 'Hostel'} ({getUserGender(selectedResident)}) · Room {selectedResident.roomNumber || 'Unassigned'} · {selectedResident.block || 'Hostel'}
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mt-0.5">
                      {selectedResident.name}
                    </h3>
                    <div className="text-sm text-slate-600 mt-0.5">
                      {selectedResident.programLevel
                        ? `${selectedResident.programLevel}${
                            selectedResident.academicYear ? ` · ${selectedResident.academicYear}` : ''
                          } · `
                        : ''}
                      {selectedResident.className} · {selectedResident.department} ·{' '}
                      <span className="font-mono tabular-nums">
                        {selectedResident.rollNumber || selectedResident.registerNumber}
                      </span>
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
              <h3 className="text-base font-semibold text-slate-900">
                Add New {wardenHostelType || ''} Room
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Hostel Wing</label>
                {wardenHostelType ? (
                  <div className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 flex items-center">
                    {wardenHostelType}
                  </div>
                ) : (
                  <select
                    value={newRoomHostelType}
                    onChange={(e) => {
                      const next = e.target.value as HostelType;
                      setNewRoomHostelType(next);
                      setRoomBlock(getDefaultBlockForHostel(next));
                    }}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
                  >
                    <option value="Boys Hostel">Boys Hostel (Boys Only)</option>
                    <option value="Girls Hostel">Girls Hostel (Girls Only)</option>
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Room No.</label>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder={effectiveRoomHostelType === 'Girls Hostel' ? 'e.g. M-106' : 'e.g. K-204'}
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
                  placeholder={getDefaultBlockForHostel(effectiveRoomHostelType)}
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
                  {visibleRooms.filter((r) => r.occupantUids.length < r.capacity).length} rooms with vacancies
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {visibleRooms.map((room) => {
                  const occupants = state.users.filter(
                    (r) => r.isHostel && room.occupantUids.includes(r.uid)
                  );
                  const vacant = room.capacity - occupants.length;
                  return (
                    <div key={room.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BedDouble className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-slate-900">
                            {room.roomNumber} · {room.block}
                          </span>
                          <span className="text-[11px] font-medium text-blue-700">
                            ({room.hostelType})
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
              Girls Hostel rooms accept Girl residents only; Boys Hostel rooms accept Boy residents only.
            </p>
            <div className="divide-y divide-slate-100">
              {residents.map((res) => {
                const resHostel = getUserHostelType(res) || 'Boys Hostel';
                const eligibleRooms = visibleRooms.filter((rm) => rm.hostelType === resHostel);
                const currentRoom = eligibleRooms.find((r) =>
                  r.occupantUids.includes(res.uid)
                );
                return (
                  <div
                    key={res.uid}
                    className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {res.name}{' '}
                        <span className="text-xs font-normal text-blue-700">({resHostel})</span>
                      </div>
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
                        Select {resHostel} room
                      </option>
                      {eligibleRooms.map((rm) => (
                        <option
                          key={rm.id}
                          value={rm.id}
                          disabled={
                            !rm.occupantUids.includes(res.uid) &&
                            rm.occupantUids.length >= rm.capacity
                          }
                        >
                          {rm.roomNumber} · {rm.hostelType} ({rm.occupantUids.length}/{rm.capacity})
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
        <div className="space-y-6">
          {/* 1. Live Hostel Roll-Call QR Session */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              {!activeHostelQrSession ? (
                <>
                  <div>
                    <div className="text-xs font-medium text-blue-700">
                      Live QR Roll-Call Attendance
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                      Start {effectiveQrWing} QR Roll Call
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      Generate a 30-second rotating QR code &amp; token so {effectiveQrWing}{' '}
                      residents can check in from the Hostel page.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Hostel Wing
                      </label>
                      {wardenHostelType ? (
                        <div className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 flex items-center">
                          {wardenHostelType}
                        </div>
                      ) : (
                        <select
                          value={effectiveQrWing}
                          onChange={(e) => {
                            const next = e.target.value as HostelType;
                            setQrSessionWing(next);
                            setWingFilter(next);
                          }}
                          className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                        >
                          <option value="Boys Hostel">Boys Hostel (Boys Only)</option>
                          <option value="Girls Hostel">Girls Hostel (Girls Only)</option>
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Roll-Call Session
                      </label>
                      <select
                        value={qrSessionLabel}
                        onChange={(e) => setQrSessionLabel(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                      >
                        <option value="Night Roll Call">Night Roll Call (9:00 PM)</option>
                        <option value="Morning Roll Call">Morning Roll Call (7:30 AM)</option>
                        <option value="Evening Study Roll Call">Evening Study Roll Call</option>
                        <option value="Weekend Inspection">Weekend Inspection</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Allowed Radius
                      </label>
                      <select
                        value={qrRadiusMeters}
                        onChange={(e) => setQrRadiusMeters(Number(e.target.value))}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                      >
                        <option value={100}>100 meters</option>
                        <option value={250}>250 meters</option>
                        <option value={500}>500 meters</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Anchor Location
                      </label>
                      <select
                        value={qrLocationMode}
                        onChange={(e) => setQrLocationMode(e.target.value as 'campus' | 'gps')}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                      >
                        <option value="campus">Use Hostel / Campus Center</option>
                        <option value="gps">Use My Live GPS</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={startingQr}
                    onClick={handleStartHostelQr}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>
                      {startingQr
                        ? 'Starting Hostel QR Session...'
                        : `Start ${effectiveQrWing} QR Roll Call`}
                    </span>
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-emerald-700">
                        Live {activeHostelQrSession.hostelType} Roll Call Active
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 mt-0.5">
                        {activeHostelQrSession.sessionLabel}
                      </h3>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Warden: {activeHostelQrSession.wardenName} · Radius{' '}
                        {activeHostelQrSession.radiusMeters}m
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => stopHostelAttendanceSession(activeHostelQrSession.id)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <StopCircle className="w-4 h-4" />
                      <span>End Session</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    {qrDataUrl && (
                      <img
                        src={qrDataUrl}
                        alt="Hostel roll-call QR code"
                        className="w-40 h-40 rounded-xl bg-white p-2 border border-slate-200 shrink-0"
                      />
                    )}
                    <div className="space-y-2 text-center sm:text-left">
                      <div className="text-xs text-slate-500">Current Rotating Token</div>
                      <div className="text-2xl font-mono font-bold text-slate-900 tracking-wide">
                        {activeHostelQrSession.currentToken}
                      </div>
                      <div className="text-xs font-medium text-blue-700 tabular-nums">
                        Refreshes in {qrSecondsLeft}s
                      </div>
                      <div className="w-40 h-1.5 bg-slate-200 rounded-full overflow-hidden mx-auto sm:mx-0">
                        <div
                          className="h-full bg-blue-600 transition-all"
                          style={{ width: `${Math.min(100, Math.round((qrSecondsLeft / 30) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live QR Scanned Roster */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-base font-semibold text-slate-900">
                    Live Roll-Call Check-Ins ({effectiveQrWing})
                  </h3>
                </div>
                <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                  {activeQrAttendees.length} Checked In
                </span>
              </div>

              {!activeHostelQrSession ? (
                <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-sm text-slate-500">
                  Start a live QR roll-call session to see residents check in with QR &amp; location verification in real time.
                </div>
              ) : activeQrAttendees.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-sm text-slate-500">
                  Waiting for {activeHostelQrSession.hostelType} residents to scan or enter{' '}
                  <span className="font-mono font-semibold text-slate-800">
                    {activeHostelQrSession.currentToken}
                  </span>
                  .
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {activeQrAttendees.map((rec) => (
                    <div key={rec.id} className="py-2.5 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium text-slate-900">{rec.residentName}</div>
                        <div className="text-xs text-slate-500">
                          Room {rec.roomNumber} · Via {rec.markedVia || 'QR'}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700">{rec.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 2. Manual Hostel Roll Call */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Manual Hostel Roll Call · {attendanceDate}
                </h3>
                <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
                  Totals: {totals.inCount} In · {totals.outCount} Out · {totals.leaveCount} Leave
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  aria-label="Attendance date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value || getTodayIso())}
                  className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
                />
                <input
                  type="text"
                  aria-label="Roll call session name"
                  value={manualSessionLabel}
                  onChange={(e) => setManualSessionLabel(e.target.value)}
                  placeholder="Session name (e.g. Night Roll Call)"
                  className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 w-44"
                />
                <button
                  type="button"
                  onClick={handleMarkAllIn}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium whitespace-nowrap"
                >
                  Mark All In
                </button>
                <button
                  type="button"
                  onClick={handleSaveAttendance}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <Home className="w-4 h-4" />
                  <span>Save Attendance</span>
                </button>
              </div>
            </div>

            {residents.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                No residents found in {activeWingFilter}.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {residents.map((res) => {
                  const currentSt = getStatusForResident(res.uid, res.hostelStatus);
                  return (
                    <div
                      key={res.uid}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {res.name}{' '}
                          <span className="text-xs font-normal text-blue-700">
                            ({getUserHostelType(res) || 'Hostel'})
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          Room {res.roomNumber || 'Unassigned'} · {res.className || res.department}
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
            )}
          </section>

          {/* 3. Recorded Hostel Attendance Logs */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Recorded Hostel Attendance Logs
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Combined log of Warden roll-calls and resident QR check-ins
                </p>
              </div>
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setLogDateFilter('selected')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium ${
                    logDateFilter === 'selected'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {attendanceDate}
                </button>
                <button
                  type="button"
                  onClick={() => setLogDateFilter('all')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium ${
                    logDateFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Dates ({state.hostelAttendanceLogs.length})
                </button>
              </div>
            </div>

            {visibleHostelLogs.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                No hostel attendance logs recorded for this filter.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Date</th>
                      <th className="py-2.5 pr-4 font-medium">Resident</th>
                      <th className="py-2.5 pr-4 font-medium">Room &amp; Wing</th>
                      <th className="py-2.5 pr-4 font-medium">Session</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <th className="py-2.5 font-medium">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleHostelLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-600 tabular-nums">
                          {log.date}
                        </td>
                        <td className="py-3 pr-4 font-medium text-slate-900">{log.residentName}</td>
                        <td className="py-3 pr-4 text-slate-600 text-xs">
                          Room {log.roomNumber} · {log.hostelType || 'Hostel'}
                        </td>
                        <td className="py-3 pr-4 text-slate-700 text-xs">
                          {log.sessionLabel || 'Daily Roll Call'}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`text-xs font-semibold ${
                              log.status === 'In'
                                ? 'text-emerald-700'
                                : log.status === 'Out'
                                ? 'text-amber-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 text-xs text-slate-500">{log.markedVia || 'Warden'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'approvals' && (
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {activeWingFilter === 'All'
                  ? 'Hostel Resident Approval Queue'
                  : `${activeWingFilter} Resident Approval Queue`}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Hostel admission requests route strictly to the Warden of the applicant&apos;s hostel wing.
              </p>
            </div>
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
          </div>

          {(() => {
            const visibleReqs = wingApprovals.filter((r) =>
              approvalStatusFilter === 'All' ? true : r.status === approvalStatusFilter
            );
            if (visibleReqs.length === 0) {
              return (
                <div className="py-10 text-center text-sm text-slate-500">
                  No {approvalStatusFilter === 'All' ? '' : approvalStatusFilter.toLowerCase()}{' '}
                  hostel resident requests in this queue.
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {visibleReqs.map((req) => {
                  const statusBadge =
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
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${statusBadge}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            <span>{req.status}</span>
                          </span>
                          <span className="text-xs text-blue-700 font-medium">
                            {req.targetHostelType}
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
                              setFeedback(null);
                              try {
                                await reviewApprovalRequest(
                                  req.id,
                                  'Approved',
                                  reviewNotes[req.id]
                                );
                                setFeedback({
                                  type: 'success',
                                  message: `Approved ${req.requesterName} for ${req.targetHostelType}.`,
                                });
                              } catch (err) {
                                setFeedback({
                                  type: 'error',
                                  message: err instanceof Error ? err.message : 'Approval failed.',
                                });
                              }
                            }}
                            className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setFeedback(null);
                              try {
                                await reviewApprovalRequest(
                                  req.id,
                                  'Rejected',
                                  reviewNotes[req.id]
                                );
                                setFeedback({
                                  type: 'success',
                                  message: `Rejected hostel request for ${req.requesterName}.`,
                                });
                              } catch (err) {
                                setFeedback({
                                  type: 'error',
                                  message: err instanceof Error ? err.message : 'Rejection failed.',
                                });
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
            );
          })()}
        </section>
      )}
    </div>
  );
}
