import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AppDataState,
  STORAGE_KEY,
  cacheNotices,
  canReadPrivateInfo,
  ensureFirebaseUserProfile,
  fbSetDoc,
  fbUpdateDoc,
  filterPrivateMapForRole,
  getCachedNotices,
  getSavedDemoUid,
  getTodayIso,
  loadLocalState,
  saveLocalState,
  seedFirestoreWithDummyData,
  setSavedDemoUid,
  signInWithEmailFirebase,
  signInWithGoogleFirebase,
  signOutFirebase,
  signUpWithEmailFirebase,
  subscribeChatThreadMessages,
  subscribeFirebaseAuth,
  subscribeFirestoreState,
} from '../services/dataService';
import {
  AttendanceRecord,
  AttendanceSession,
  BaseRole,
  CampusDocument,
  CampusEvent,
  CampusGeofence,
  CampusMeeting,
  CanteenItem,
  CanteenOrder,
  CanteenOrderItem,
  ChatMessage,
  ChatThread,
  DayOfWeek,
  EffectiveRole,
  Gender,
  HostelAttendanceLog,
  HostelMenu,
  HostelRoom,
  HostelStatus,
  HostelType,
  MailMessage,
  NavScreen,
  Notice,
  OrderStatus,
  StaffCheckin,
  UserPrivateInfo,
  UserProfile,
  getAllowedScreens,
  getDefaultBlockForHostel,
  getHostelTypeForGender,
  getUserGender,
  getUserHostelType,
} from '../types';
import { deleteField, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

export type DataMode = 'demo' | 'firebase';

interface AppContextValue {
  currentUser: UserProfile | null;
  dataMode: DataMode;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  isOnline: boolean;
  activeScreen: NavScreen;
  setActiveScreen: (screen: NavScreen) => void;
  state: AppDataState;
  visibleNotices: Notice[];
  getPrivateForUser: (targetUid: string) => UserPrivateInfo | null;

  // Auth Actions
  loginDemoUser: (uid: string) => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string,
    department: string,
    selectedRole: EffectiveRole,
    gender?: Gender
  ) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  seedCloudFirestore: () => Promise<void>;

  // Attendance Actions
  startAttendanceSession: (payload: {
    subjectCode: string;
    subjectName: string;
    className: string;
    lat: number;
    lng: number;
    radiusMeters: number;
  }) => Promise<AttendanceSession>;
  rotateSessionToken: (sessionId: string) => Promise<string>;
  stopAttendanceSession: (sessionId: string) => Promise<void>;
  markStudentAttendance: (payload: {
    session: AttendanceSession;
    token: string;
    markedVia: 'QR' | 'Manual';
  }) => Promise<AttendanceRecord>;
  checkInStaff: (distanceMeters: number) => Promise<StaffCheckin>;

  // Hostel Actions
  updateMyHostelStatus: (status: HostelStatus) => Promise<void>;
  updateHostelMenu: (day: DayOfWeek, updates: Partial<HostelMenu>) => Promise<void>;
  saveHostelAttendanceBatch: (
    entries: { residentUid: string; residentName: string; roomNumber: string; status: HostelStatus }[]
  ) => Promise<void>;
  allotResidentRoom: (residentUid: string, targetRoomId: string) => Promise<void>;
  createHostelRoom: (payload: {
    roomNumber: string;
    block: string;
    hostelType: HostelType;
    floor: string;
    capacity: number;
  }) => Promise<HostelRoom>;
  updateUserPrivateInfo: (
    targetUid: string,
    updates: Partial<Omit<UserPrivateInfo, 'uid'>>
  ) => Promise<void>;

  // Canteen Actions
  placeCanteenOrder: (items: CanteenOrderItem[]) => Promise<CanteenOrder>;
  updateCanteenOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  toggleCanteenItemAvailability: (itemId: string) => Promise<void>;
  upsertCanteenItem: (item: CanteenItem) => Promise<void>;

  // Notices & Events
  createNotice: (payload: Omit<Notice, 'id' | 'authorUid' | 'authorName' | 'authorRole' | 'date'>) => Promise<void>;
  createEvent: (payload: Omit<CampusEvent, 'id' | 'createdByUid'>) => Promise<void>;

  // Chat
  subscribeThread: (threadId: string) => () => void;
  sendChatMessage: (threadId: string, text: string) => Promise<void>;
  createOrOpenDmThread: (otherUser: UserProfile) => Promise<ChatThread>;
  createGroupThread: (payload: {
    type: 'class' | 'hostel';
    title: string;
    className?: string;
    hostelType?: HostelType;
  }) => Promise<ChatThread>;

  // Documents, Mail, Meetings
  uploadDocument: (payload: Omit<CampusDocument, 'id' | 'uploadedByUid' | 'uploadedByName' | 'uploadedAt'>) => Promise<void>;
  sendMail: (payload: { toUser: UserProfile; toEmail: string; subject: string; body: string }) => Promise<void>;
  markMailRead: (mailId: string) => Promise<void>;
  createMeeting: (payload: Omit<CampusMeeting, 'id' | 'hostUid' | 'hostName'>) => Promise<void>;

  // Management
  createCampusUser: (payload: {
    name: string;
    email: string;
    selectedRole: EffectiveRole;
    gender: Gender;
    department: string;
    className?: string;
    registerNumber?: string;
    roomId?: string;
    phone?: string;
    guardianName?: string;
    guardianPhone?: string;
    address?: string;
    bloodGroup?: string;
    medicalNotes?: string;
  }) => Promise<UserProfile>;
  updateUserRoleAndFlags: (
    targetUid: string,
    updates: { role: BaseRole; isHostel: boolean; isWarden: boolean; gender?: Gender }
  ) => Promise<void>;
  updateGeofence: (geofence: CampusGeofence) => void;
  resetDemoData: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

function generateToken(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `PSNA-${digits}`;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppDataState>(() => loadLocalState());
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const savedUid = getSavedDemoUid();
    if (!savedUid) return null;
    const local = loadLocalState();
    return local.users.find((u) => u.uid === savedUid) || null;
  });
  const [dataMode, setDataMode] = useState<DataMode>('demo');
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [activeScreen, setActiveScreen] = useState<NavScreen>('dashboard');

  // Online / Offline listener
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Cross-tab sync in Demo mode
  useEffect(() => {
    if (dataMode !== 'demo') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setState(JSON.parse(e.newValue) as AppDataState);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [dataMode]);

  // Firebase Auth listener
  useEffect(() => {
    let firestoreUnsub: (() => void) | null = null;
    const authUnsub = subscribeFirebaseAuth(async (fbUser) => {
      if (fbUser) {
        try {
          const profile = await ensureFirebaseUserProfile(fbUser);
          setDataMode('firebase');
          setCurrentUser(profile);
          setSavedDemoUid(null);
          if (firestoreUnsub) firestoreUnsub();
          firestoreUnsub = subscribeFirestoreState(profile, (partial) => {
            setState((prev) => {
              const next = { ...prev, ...partial };
              if (partial.users) {
                const refreshed = partial.users.find((u) => u.uid === profile.uid);
                if (refreshed) setCurrentUser(refreshed);
              }
              return next;
            });
          });
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'Failed to load Firebase profile.');
        } finally {
          setLoading(false);
        }
      } else {
        if (firestoreUnsub) {
          firestoreUnsub();
          firestoreUnsub = null;
        }
        setDataMode('demo');
        setLoading(false);
      }
    });

    return () => {
      authUnsub();
      if (firestoreUnsub) firestoreUnsub();
    };
  }, []);

  // Keep activeScreen valid when role changes
  useEffect(() => {
    if (!currentUser) return;
    const allowed = getAllowedScreens(currentUser);
    if (!allowed.includes(activeScreen)) {
      setActiveScreen('dashboard');
    }
  }, [currentUser, activeScreen]);

  const mutateDemoState = useCallback((updater: (prev: AppDataState) => AppDataState) => {
    setState((prev) => {
      const next = updater(prev);
      saveLocalState(next);
      return next;
    });
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const loginDemoUser = useCallback(
    (uid: string) => {
      const local = loadLocalState();
      const found = local.users.find((u) => u.uid === uid);
      if (!found) {
        setAuthError('Demo account not found.');
        return;
      }
      setDataMode('demo');
      setState(local);
      setCurrentUser(found);
      setSavedDemoUid(found.uid);
      setActiveScreen('dashboard');
      setAuthError(null);
    },
    []
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail || !password) {
        setAuthError('Please enter both email and password.');
        return;
      }

      // Check if user matches a demo credential for smooth testing with demo password or local signup password
      const local = loadLocalState();
      const matchedPriv = Object.values(local.userPrivate).find(
        (p) => p.email.toLowerCase() === trimmedEmail
      );
      let savedLocalPass: string | null = null;
      try {
        const rawCreds = localStorage.getItem('psna_connect_demo_creds_v1');
        if (rawCreds) {
          const parsed = JSON.parse(rawCreds) as Record<string, string>;
          savedLocalPass = parsed[trimmedEmail] || null;
        }
      } catch {
        // ignore
      }
      if (matchedPriv && (password === 'psna2026' || (savedLocalPass && password === savedLocalPass))) {
        loginDemoUser(matchedPriv.uid);
        return;
      }

      try {
        setLoading(true);
        const profile = await signInWithEmailFirebase(trimmedEmail, password);
        setCurrentUser(profile);
        setActiveScreen('dashboard');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('auth/operation-not-allowed')) {
          setAuthError(
            'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method → Email/Password). Use Google Sign-In, the Demo Switcher below, or demo password "psna2026" for any seeded @psnacet.edu.in account.'
          );
        } else if (msg.includes('auth/invalid-credential') || msg.includes('auth/user-not-found')) {
          setAuthError(
            'Invalid email or password. Tip: for seeded @psnacet.edu.in demo accounts, use password "psna2026" or click a Demo Switcher card below.'
          );
        } else {
          setAuthError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [loginDemoUser]
  );

  const signUpWithEmail = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      department: string,
      selectedRole: EffectiveRole,
      gender: Gender = 'Girl'
    ) => {
      setAuthError(null);
      if (!name.trim() || !email.trim() || password.length < 6) {
        setAuthError('Please provide your full name, valid email, and a password of at least 6 characters.');
        return;
      }
      try {
        setLoading(true);
        const profile = await signUpWithEmailFirebase(
          name.trim(),
          email.trim(),
          password,
          department,
          selectedRole,
          gender
        );
        setCurrentUser(profile);
        setActiveScreen('dashboard');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('auth/operation-not-allowed')) {
          const isStudentRole = selectedRole === 'student' || selectedRole === 'hostel_resident';
          const baseRole: BaseRole =
            selectedRole === 'management'
              ? 'management'
              : selectedRole === 'staff' || selectedRole === 'warden'
              ? 'staff'
              : 'student';
          const isHostel = selectedRole === 'hostel_resident';
          const isWarden = selectedRole === 'warden';
          const hostelType: HostelType | undefined =
            isHostel || isWarden ? getHostelTypeForGender(gender) : undefined;
          const defaultRoomId = hostelType === 'Girls Hostel' ? 'room-m105' : 'room-k203';
          const defaultRoomNumber = hostelType === 'Girls Hostel' ? 'M-105' : 'K-203';
          const defaultBlock = hostelType ? getDefaultBlockForHostel(hostelType) : undefined;
          const newUid = `${baseRole}-${Date.now()}`;
          const newUser: UserProfile = {
            uid: newUid,
            name: name.trim(),
            role: baseRole,
            gender,
            isHostel,
            isWarden,
            hostelType,
            department,
            className: isStudentRole ? 'III CSE A' : undefined,
            registerNumber: isStudentRole
              ? `921324${String(Math.floor(100000 + Math.random() * 899999))}`
              : undefined,
            roomNumber: isHostel ? defaultRoomNumber : undefined,
            block: defaultBlock,
            hostelStatus: isHostel ? 'In' : undefined,
            createdAt: new Date().toISOString(),
          };
          mutateDemoState((prev) => ({
            ...prev,
            users: [...prev.users, newUser],
            userPrivate: {
              ...prev.userPrivate,
              [newUid]: {
                uid: newUid,
                email: email.trim().toLowerCase(),
                hostelType,
                updatedAt: new Date().toISOString(),
              },
            },
            hostelRooms: isHostel
              ? prev.hostelRooms.map((r) =>
                  r.id === defaultRoomId && r.occupantUids.length < r.capacity
                    ? { ...r, occupantUids: [...r.occupantUids, newUid] }
                    : r
                )
              : prev.hostelRooms,
          }));
          try {
            const rawCreds = localStorage.getItem('psna_connect_demo_creds_v1');
            const parsed = rawCreds ? (JSON.parse(rawCreds) as Record<string, string>) : {};
            parsed[email.trim().toLowerCase()] = password;
            localStorage.setItem('psna_connect_demo_creds_v1', JSON.stringify(parsed));
          } catch {
            // ignore
          }
          setDataMode('demo');
          setCurrentUser(newUser);
          setSavedDemoUid(newUid);
          setActiveScreen('dashboard');
        } else {
          setAuthError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [mutateDemoState]
  );

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      setLoading(true);
      const profile = await signInWithGoogleFirebase();
      setCurrentUser(profile);
      setActiveScreen('dashboard');
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setSavedDemoUid(null);
    setCurrentUser(null);
    setActiveScreen('dashboard');
    if (dataMode === 'firebase') {
      try {
        await signOutFirebase();
      } catch {
        // ignore
      }
    }
    setDataMode('demo');
  }, [dataMode]);

  const seedCloudFirestore = useCallback(async () => {
    if (!currentUser || dataMode !== 'firebase') return;
    await seedFirestoreWithDummyData(currentUser);
  }, [currentUser, dataMode]);

  const getPrivateForUser = useCallback(
    (targetUid: string): UserPrivateInfo | null => {
      const targetUser = state.users.find((u) => u.uid === targetUid) || null;
      if (!canReadPrivateInfo(currentUser, targetUid, targetUser)) return null;
      return state.userPrivate[targetUid] || null;
    },
    [currentUser, state.userPrivate, state.users]
  );

  const visibleNotices = useMemo(() => {
    const source = !isOnline ? getCachedNotices() : state.notices;
    if (isOnline && source.length > 0) {
      cacheNotices(source);
    }
    return [...source].sort((a, b) => b.date.localeCompare(a.date));
  }, [isOnline, state.notices]);

  // --- Attendance ---
  const startAttendanceSession = useCallback(
    async (payload: {
      subjectCode: string;
      subjectName: string;
      className: string;
      lat: number;
      lng: number;
      radiusMeters: number;
    }): Promise<AttendanceSession> => {
      if (!currentUser || (currentUser.role !== 'staff' && currentUser.role !== 'management')) {
        throw new Error('Only Staff or Management can start a class attendance session.');
      }
      const now = Date.now();
      const session: AttendanceSession = {
        id: `sess-${now}`,
        staffUid: currentUser.uid,
        staffName: currentUser.name,
        subjectCode: payload.subjectCode,
        subjectName: payload.subjectName,
        className: payload.className,
        department: currentUser.department,
        currentToken: generateToken(),
        tokenIssuedAt: now,
        expiresAt: now + 30000,
        campusLat: payload.lat,
        campusLng: payload.lng,
        radiusMeters: payload.radiusMeters,
        active: true,
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('attendanceSessions', session.id, session);
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          attendanceSessions: [session, ...prev.attendanceSessions.map((s) =>
            s.staffUid === currentUser.uid ? { ...s, active: false } : s
          )],
        }));
      }
      return session;
    },
    [currentUser, dataMode, mutateDemoState]
  );

  const rotateSessionToken = useCallback(
    async (sessionId: string): Promise<string> => {
      const nextToken = generateToken();
      const now = Date.now();
      const patch = {
        currentToken: nextToken,
        tokenIssuedAt: now,
        expiresAt: now + 30000,
      };
      if (dataMode === 'firebase') {
        await fbUpdateDoc('attendanceSessions', sessionId, patch);
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          attendanceSessions: prev.attendanceSessions.map((s) =>
            s.id === sessionId ? { ...s, ...patch } : s
          ),
        }));
      }
      return nextToken;
    },
    [dataMode, mutateDemoState]
  );

  const stopAttendanceSession = useCallback(
    async (sessionId: string) => {
      if (dataMode === 'firebase') {
        await fbUpdateDoc('attendanceSessions', sessionId, { active: false });
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          attendanceSessions: prev.attendanceSessions.map((s) =>
            s.id === sessionId ? { ...s, active: false } : s
          ),
        }));
      }
    },
    [dataMode, mutateDemoState]
  );

  const markStudentAttendance = useCallback(
    async (payload: {
      session: AttendanceSession;
      token: string;
      markedVia: 'QR' | 'Manual';
    }): Promise<AttendanceRecord> => {
      if (!currentUser || currentUser.role !== 'student') {
        throw new Error('Only students can mark student attendance.');
      }
      const { session, token, markedVia } = payload;
      if (!session.active) {
        throw new Error('This attendance session is no longer active.');
      }
      if (token.trim().toUpperCase() !== session.currentToken.toUpperCase()) {
        throw new Error('Invalid or expired QR token. Please scan the latest 30-second code on screen.');
      }
      if (Date.now() > session.expiresAt + 3000) {
        throw new Error('This 30-second QR token has expired. Wait for the refreshed code.');
      }

      const todayStr = getTodayIso();
      const recordId = `att-${todayStr}-${session.subjectCode}-${currentUser.uid}`;
      const record: AttendanceRecord = {
        id: recordId,
        studentUid: currentUser.uid,
        studentName: currentUser.name,
        registerNumber: currentUser.registerNumber || 'N/A',
        className: currentUser.className || session.className,
        subjectCode: session.subjectCode,
        subjectName: session.subjectName,
        date: todayStr,
        status: 'Present',
        sessionId: session.id,
        markedVia,
        markedAt: new Date().toISOString(),
      };

      if (dataMode === 'firebase') {
        await fbSetDoc('attendanceRecords', recordId, record);
      } else {
        mutateDemoState((prev) => {
          const filtered = prev.attendanceRecords.filter((r) => r.id !== recordId);
          return { ...prev, attendanceRecords: [record, ...filtered] };
        });
      }
      return record;
    },
    [currentUser, dataMode, mutateDemoState]
  );

  const checkInStaff = useCallback(
    async (distanceMeters: number): Promise<StaffCheckin> => {
      if (!currentUser || currentUser.role !== 'staff') {
        throw new Error('Only Staff accounts can perform staff check-in.');
      }
      const todayStr = getTodayIso();
      const checkinId = `chk-${todayStr}-${currentUser.uid}`;
      const checkin: StaffCheckin = {
        id: checkinId,
        staffUid: currentUser.uid,
        staffName: currentUser.name,
        department: currentUser.department,
        date: todayStr,
        status: 'Present',
        checkinTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        distanceMeters,
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('staffCheckins', checkinId, checkin);
      } else {
        mutateDemoState((prev) => {
          const filtered = prev.staffCheckins.filter((c) => c.id !== checkinId);
          return { ...prev, staffCheckins: [checkin, ...filtered] };
        });
      }
      return checkin;
    },
    [currentUser, dataMode, mutateDemoState]
  );

  // --- Hostel ---
  const updateMyHostelStatus = useCallback(
    async (status: HostelStatus) => {
      if (!currentUser || !currentUser.isHostel) {
        throw new Error('Only hostel residents can update hostel status.');
      }
      if (dataMode === 'firebase') {
        await fbUpdateDoc('users', currentUser.uid, { hostelStatus: status });
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            u.uid === currentUser.uid ? { ...u, hostelStatus: status } : u
          ),
        }));
        setCurrentUser((prev) => (prev ? { ...prev, hostelStatus: status } : prev));
      }
    },
    [currentUser, dataMode, mutateDemoState]
  );

  const updateHostelMenu = useCallback(
    async (day: DayOfWeek, updates: Partial<HostelMenu>) => {
      if (!currentUser || (!currentUser.isWarden && currentUser.role !== 'management')) {
        throw new Error('Only the Warden or Management can update the hostel menu.');
      }
      const existing = state.hostelMenus.find((m) => m.day === day);
      const base: HostelMenu = existing || {
        day,
        breakfast: 'To be updated',
        breakfastTime: '07:15 AM – 08:45 AM',
        breakfastReady: false,
        lunch: 'To be updated',
        lunchTime: '12:15 PM – 01:45 PM',
        lunchReady: false,
        snacks: 'To be updated',
        snacksTime: '04:30 PM – 05:30 PM',
        snacksReady: false,
        dinner: 'To be updated',
        dinnerTime: '07:30 PM – 09:00 PM',
        dinnerReady: false,
      };
      const fullMenu: HostelMenu = {
        ...base,
        ...updates,
        day,
        updatedAt: new Date().toISOString(),
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('hostelMenus', day, fullMenu);
      } else {
        mutateDemoState((prev) => {
          const exists = prev.hostelMenus.some((m) => m.day === day);
          return {
            ...prev,
            hostelMenus: exists
              ? prev.hostelMenus.map((m) => (m.day === day ? fullMenu : m))
              : [...prev.hostelMenus, fullMenu],
          };
        });
      }
    },
    [currentUser, dataMode, mutateDemoState, state.hostelMenus]
  );

  const saveHostelAttendanceBatch = useCallback(
    async (
      entries: { residentUid: string; residentName: string; roomNumber: string; status: HostelStatus }[]
    ) => {
      if (!currentUser || (!currentUser.isWarden && currentUser.role !== 'management')) {
        throw new Error('Only the Warden or Management can save hostel attendance.');
      }
      const wardenHostel = currentUser.isWarden ? getUserHostelType(currentUser) : null;
      const todayStr = getTodayIso();
      const newLogs: HostelAttendanceLog[] = entries.map((e) => {
        const resUser = state.users.find((u) => u.uid === e.residentUid);
        const resHostel = getUserHostelType(resUser) || wardenHostel || 'Boys Hostel';
        if (currentUser.isWarden && wardenHostel && resHostel !== wardenHostel) {
          throw new Error(
            `${wardenHostel} Warden can only mark attendance for ${wardenHostel} residents.`
          );
        }
        return {
          id: `hlog-${todayStr}-${e.residentUid}`,
          date: todayStr,
          residentUid: e.residentUid,
          residentName: e.residentName,
          roomNumber: e.roomNumber,
          hostelType: resHostel,
          status: e.status,
          markedByUid: currentUser.uid,
        };
      });

      if (dataMode === 'firebase') {
        await Promise.all(
          newLogs.map((log) => fbSetDoc('hostelAttendanceLogs', log.id, log))
        );
        await Promise.all(
          entries.map((e) => fbUpdateDoc('users', e.residentUid, { hostelStatus: e.status }))
        );
      } else {
        mutateDemoState((prev) => {
          const map = new Map(prev.hostelAttendanceLogs.map((l) => [l.id, l]));
          newLogs.forEach((l) => map.set(l.id, l));
          const statusMap = new Map(entries.map((e) => [e.residentUid, e.status]));
          return {
            ...prev,
            hostelAttendanceLogs: Array.from(map.values()),
            users: prev.users.map((u) =>
              statusMap.has(u.uid) ? { ...u, hostelStatus: statusMap.get(u.uid) } : u
            ),
          };
        });
      }
    },
    [currentUser, dataMode, mutateDemoState, state.users]
  );

  const allotResidentRoom = useCallback(
    async (residentUid: string, targetRoomId: string) => {
      if (!currentUser || (!currentUser.isWarden && currentUser.role !== 'management')) {
        throw new Error('Only Warden or Management can change room allotment.');
      }
      const targetRoom = state.hostelRooms.find((r) => r.id === targetRoomId);
      if (!targetRoom) throw new Error('Target room not found.');

      const resident = state.users.find((u) => u.uid === residentUid);
      if (!resident || !resident.isHostel) {
        throw new Error('Only hostel residents can be allotted a hostel room.');
      }

      const residentGender = getUserGender(resident);
      const expectedHostel = getHostelTypeForGender(residentGender);
      if (targetRoom.hostelType !== expectedHostel) {
        throw new Error(
          targetRoom.hostelType === 'Girls Hostel'
            ? 'Girls Hostel rooms are strictly for Girl residents only.'
            : 'Boys Hostel rooms are strictly for Boy residents only.'
        );
      }

      if (currentUser.isWarden) {
        const wardenHostel = getUserHostelType(currentUser);
        if (wardenHostel && targetRoom.hostelType !== wardenHostel) {
          throw new Error(
            `${wardenHostel} Warden can only allot rooms inside ${wardenHostel}.`
          );
        }
      }

      if (
        !targetRoom.occupantUids.includes(residentUid) &&
        targetRoom.occupantUids.length >= targetRoom.capacity
      ) {
        throw new Error(`Room ${targetRoom.roomNumber} is already at full capacity (${targetRoom.capacity}).`);
      }

      const updatedRooms = state.hostelRooms.map((r) => {
        const cleaned = r.occupantUids.filter((id) => id !== residentUid);
        if (r.id === targetRoomId) {
          return { ...r, occupantUids: [...cleaned, residentUid] };
        }
        return { ...r, occupantUids: cleaned };
      });

      if (dataMode === 'firebase') {
        await Promise.all(
          updatedRooms
            .filter((r) => currentUser.role === 'management' || r.hostelType === targetRoom.hostelType)
            .map((r) => fbUpdateDoc('hostelRooms', r.id, { occupantUids: r.occupantUids }))
        );
        await fbUpdateDoc('users', residentUid, {
          roomNumber: targetRoom.roomNumber,
          block: targetRoom.block,
          hostelType: targetRoom.hostelType,
        });
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          hostelRooms: updatedRooms,
          users: prev.users.map((u) =>
            u.uid === residentUid
              ? {
                  ...u,
                  roomNumber: targetRoom.roomNumber,
                  block: targetRoom.block,
                  hostelType: targetRoom.hostelType,
                }
              : u
          ),
        }));
      }
    },
    [currentUser, dataMode, mutateDemoState, state.hostelRooms, state.users]
  );

  const createHostelRoom = useCallback(
    async (payload: {
      roomNumber: string;
      block: string;
      hostelType: HostelType;
      floor: string;
      capacity: number;
    }): Promise<HostelRoom> => {
      if (!currentUser || (!currentUser.isWarden && currentUser.role !== 'management')) {
        throw new Error('Only Warden or Management can add hostel rooms.');
      }
      const wardenHostel = currentUser.isWarden ? getUserHostelType(currentUser) : null;
      const resolvedHostelType = wardenHostel || payload.hostelType;
      if (currentUser.isWarden && wardenHostel && payload.hostelType !== wardenHostel) {
        throw new Error(`${wardenHostel} Warden can only add rooms to ${wardenHostel}.`);
      }
      const roomNum = payload.roomNumber.trim().slice(0, 16);
      const block =
        payload.block.trim().slice(0, 32) || getDefaultBlockForHostel(resolvedHostelType);
      const floor = payload.floor.trim().slice(0, 20) || '1st Floor';
      const capacity = Math.min(6, Math.max(1, Number(payload.capacity) || 2));
      if (!roomNum || !block) {
        throw new Error('Room number and block are required.');
      }
      const room: HostelRoom = {
        id: `room-${Date.now()}`,
        roomNumber: roomNum,
        block,
        hostelType: resolvedHostelType,
        floor,
        capacity,
        occupantUids: [],
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('hostelRooms', room.id, room);
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          hostelRooms: [...prev.hostelRooms, room],
        }));
      }
      return room;
    },
    [currentUser, dataMode, mutateDemoState]
  );

  const updateUserPrivateInfo = useCallback(
    async (targetUid: string, updates: Partial<Omit<UserPrivateInfo, 'uid'>>) => {
      if (
        !currentUser ||
        (!currentUser.isWarden && currentUser.role !== 'management' && currentUser.uid !== targetUid)
      ) {
        throw new Error('You are not authorized to update these personal or medical details.');
      }
      const targetUser = state.users.find((u) => u.uid === targetUid);
      if (currentUser.isWarden && currentUser.uid !== targetUid) {
        const wardenHostel = getUserHostelType(currentUser);
        const targetHostel = getUserHostelType(targetUser);
        if (!targetUser?.isHostel || !wardenHostel || targetHostel !== wardenHostel) {
          throw new Error(
            `${wardenHostel || 'Hostel'} Warden can only edit records for residents of their own hostel.`
          );
        }
      }
      const existing = state.userPrivate[targetUid];
      const targetHostel = targetUser?.isHostel || targetUser?.isWarden ? getUserHostelType(targetUser) || undefined : undefined;
      const merged: UserPrivateInfo = {
        uid: targetUid,
        email: (updates.email ?? existing?.email ?? `${targetUid}@psnacet.edu.in`).slice(0, 120),
        hostelType: existing?.hostelType || targetHostel,
        phone: updates.phone !== undefined ? updates.phone.slice(0, 30) : existing?.phone,
        guardianName:
          updates.guardianName !== undefined
            ? updates.guardianName.slice(0, 100)
            : existing?.guardianName,
        guardianPhone:
          updates.guardianPhone !== undefined
            ? updates.guardianPhone.slice(0, 30)
            : existing?.guardianPhone,
        address: updates.address !== undefined ? updates.address.slice(0, 300) : existing?.address,
        bloodGroup:
          updates.bloodGroup !== undefined ? updates.bloodGroup.slice(0, 10) : existing?.bloodGroup,
        allergies:
          updates.allergies !== undefined ? updates.allergies.slice(0, 200) : existing?.allergies,
        medicalNotes:
          updates.medicalNotes !== undefined
            ? updates.medicalNotes.slice(0, 500)
            : existing?.medicalNotes,
        updatedAt: new Date().toISOString(),
      };
      const clean = Object.fromEntries(
        Object.entries(merged).filter(([, v]) => v !== undefined && v !== '')
      ) as unknown as UserPrivateInfo;
      if (dataMode === 'firebase') {
        await fbSetDoc('userPrivate', targetUid, clean);
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          userPrivate: {
            ...prev.userPrivate,
            [targetUid]: clean,
          },
        }));
      }
    },
    [currentUser, dataMode, mutateDemoState, state.userPrivate, state.users]
  );

  // --- Canteen ---
  const placeCanteenOrder = useCallback(
    async (items: CanteenOrderItem[]): Promise<CanteenOrder> => {
      if (!currentUser) throw new Error('Sign in required to place an order.');
      if (items.length === 0) throw new Error('Your canteen cart is empty.');
      const nextToken =
        state.canteenOrders.reduce((max, o) => Math.max(max, o.tokenNumber), 100) + 1;
      const totalAmount = items.reduce((sum, i) => sum + i.price * i.qty, 0);
      const order: CanteenOrder = {
        id: `ord-${Date.now()}`,
        tokenNumber: nextToken,
        userUid: currentUser.uid,
        userName: currentUser.name,
        userRole: currentUser.role === 'staff' ? (currentUser.isWarden ? 'Warden' : 'Staff') : 'Student',
        items,
        totalAmount,
        status: 'Placed',
        placedAt: new Date().toISOString(),
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('canteenOrders', order.id, order);
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          canteenOrders: [order, ...prev.canteenOrders],
        }));
      }
      return order;
    },
    [currentUser, dataMode, mutateDemoState, state.canteenOrders]
  );

  const updateCanteenOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      if (!currentUser || (currentUser.role !== 'management' && currentUser.role !== 'staff')) {
        throw new Error('Only Staff or Management can update order status.');
      }
      if (dataMode === 'firebase') {
        await fbUpdateDoc('canteenOrders', orderId, { status });
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          canteenOrders: prev.canteenOrders.map((o) =>
            o.id === orderId ? { ...o, status } : o
          ),
        }));
      }
    },
    [currentUser, dataMode, mutateDemoState]
  );

  const toggleCanteenItemAvailability = useCallback(
    async (itemId: string) => {
      if (!currentUser || (currentUser.role !== 'management' && currentUser.role !== 'staff')) {
        throw new Error('Only Management or Staff can toggle item availability.');
      }
      const existing = state.canteenItems.find((i) => i.id === itemId);
      if (!existing) return;
      if (dataMode === 'firebase') {
        await fbUpdateDoc('canteenItems', itemId, { isAvailable: !existing.isAvailable });
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          canteenItems: prev.canteenItems.map((i) =>
            i.id === itemId ? { ...i, isAvailable: !i.isAvailable } : i
          ),
        }));
      }
    },
    [currentUser, dataMode, mutateDemoState, state.canteenItems]
  );

  const upsertCanteenItem = useCallback(
    async (item: CanteenItem) => {
      if (!currentUser || (currentUser.role !== 'management' && currentUser.role !== 'staff')) {
        throw new Error('Only Management or Staff can edit canteen items.');
      }
      if (dataMode === 'firebase') {
        await fbSetDoc('canteenItems', item.id, item);
      } else {
        mutateDemoState((prev) => {
          const exists = prev.canteenItems.some((i) => i.id === item.id);
          return {
            ...prev,
            canteenItems: exists
              ? prev.canteenItems.map((i) => (i.id === item.id ? item : i))
              : [...prev.canteenItems, item],
          };
        });
      }
    },
    [currentUser, dataMode, mutateDemoState]
  );

  // --- Notices & Events ---
  const createNotice = useCallback(
    async (payload: Omit<Notice, 'id' | 'authorUid' | 'authorName' | 'authorRole' | 'date'>) => {
      if (!currentUser || (currentUser.role !== 'staff' && currentUser.role !== 'management')) {
        throw new Error('Only Staff, Warden, or Management can post notices.');
      }
      const notice: Notice = {
        ...payload,
        id: `not-${Date.now()}`,
        date: getTodayIso(),
        authorUid: currentUser.uid,
        authorName: currentUser.name,
        authorRole: currentUser.role === 'management' ? 'Management' : currentUser.isWarden ? 'Warden' : 'Staff',
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('notices', notice.id, notice);
      } else {
        mutateDemoState((prev) => ({ ...prev, notices: [notice, ...prev.notices] }));
      }
    },
    [currentUser, dataMode, mutateDemoState]
  );

  const createEvent = useCallback(
    async (payload: Omit<CampusEvent, 'id' | 'createdByUid'>) => {
      if (!currentUser || (currentUser.role !== 'staff' && currentUser.role !== 'management')) {
        throw new Error('Only Staff, Warden, or Management can publish events.');
      }
      const event: CampusEvent = {
        ...payload,
        id: `evt-${Date.now()}`,
        createdByUid: currentUser.uid,
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('events', event.id, event);
      } else {
        mutateDemoState((prev) => ({ ...prev, events: [event, ...prev.events] }));
      }
    },
    [currentUser, dataMode, mutateDemoState]
  );

  // --- Chat ---
  const subscribeThread = useCallback(
    (threadId: string) => {
      if (dataMode !== 'firebase') {
        return () => {};
      }
      return subscribeChatThreadMessages(threadId, (msgs) => {
        setState((prev) => ({
          ...prev,
          chatMessages: { ...prev.chatMessages, [threadId]: msgs },
        }));
      });
    },
    [dataMode]
  );

  const sendChatMessage = useCallback(
    async (threadId: string, text: string) => {
      if (!currentUser || !text.trim()) return;
      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        threadId,
        senderUid: currentUser.uid,
        senderName: currentUser.name,
        senderRole:
          currentUser.role === 'management'
            ? 'Management'
            : currentUser.isWarden
            ? 'Warden'
            : currentUser.role === 'staff'
            ? 'Staff'
            : currentUser.isHostel
            ? 'Hostel Resident'
            : 'Student',
        text: text.trim(),
        createdAt: new Date().toISOString(),
      };
      if (dataMode === 'firebase') {
        try {
          await setDoc(doc(db, 'chatThreads', threadId, 'messages', msg.id), msg);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `chatThreads/${threadId}/messages/${msg.id}`);
        }
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          chatMessages: {
            ...prev.chatMessages,
            [threadId]: [...(prev.chatMessages[threadId] || []), msg],
          },
        }));
      }
    },
    [currentUser, dataMode, mutateDemoState]
  );

  const createOrOpenDmThread = useCallback(
    async (otherUser: UserProfile): Promise<ChatThread> => {
      if (!currentUser) throw new Error('Sign in required.');
      const pair = [currentUser.uid, otherUser.uid].sort();
      const existing = state.chatThreads.find(
        (t) =>
          t.type === 'dm' &&
          t.participantUids?.length === 2 &&
          pair.every((id) => t.participantUids?.includes(id))
      );
      if (existing) return existing;

      const thread: ChatThread = {
        id: `dm-${pair[0]}-${pair[1]}`.slice(0, 120),
        type: 'dm',
        title: `${currentUser.name} ↔ ${otherUser.name}`,
        participantUids: pair,
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('chatThreads', thread.id, thread);
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          chatThreads: [...prev.chatThreads, thread],
        }));
      }
      return thread;
    },
    [currentUser, dataMode, mutateDemoState, state.chatThreads]
  );

  const createGroupThread = useCallback(
    async (payload: {
      type: 'class' | 'hostel';
      title: string;
      className?: string;
      hostelType?: HostelType;
    }): Promise<ChatThread> => {
      if (!currentUser || (currentUser.role !== 'staff' && currentUser.role !== 'management')) {
        throw new Error('Only Staff or Management can create group chat channels.');
      }
      const resolvedHostelType =
        payload.type === 'hostel'
          ? currentUser.isWarden
            ? getUserHostelType(currentUser) || 'Boys Hostel'
            : payload.hostelType || 'Boys Hostel'
          : undefined;
      const thread: ChatThread = {
        id: `grp-${Date.now()}`,
        type: payload.type,
        title: payload.title.trim().slice(0, 100),
        className:
          payload.type === 'class' && payload.className?.trim()
            ? payload.className.trim().slice(0, 40)
            : undefined,
        hostelType: resolvedHostelType,
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('chatThreads', thread.id, thread);
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          chatThreads: [...prev.chatThreads, thread],
        }));
      }
      return thread;
    },
    [currentUser, dataMode, mutateDemoState]
  );

  // --- Documents, Mail, Meetings ---
  const uploadDocument = useCallback(
    async (
      payload: Omit<CampusDocument, 'id' | 'uploadedByUid' | 'uploadedByName' | 'uploadedAt'>
    ) => {
      if (!currentUser || (currentUser.role !== 'staff' && currentUser.role !== 'management')) {
        throw new Error('Only Staff or Management can upload documents.');
      }
      const docItem: CampusDocument = {
        ...payload,
        id: `doc-${Date.now()}`,
        uploadedByUid: currentUser.uid,
        uploadedByName: currentUser.name,
        uploadedAt: getTodayIso(),
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('documents', docItem.id, docItem);
      } else {
        mutateDemoState((prev) => ({ ...prev, documents: [docItem, ...prev.documents] }));
      }
    },
    [currentUser, dataMode, mutateDemoState]
  );

  const sendMail = useCallback(
    async (payload: { toUser: UserProfile; toEmail: string; subject: string; body: string }) => {
      if (!currentUser) throw new Error('Sign in required.');
      const myPriv = state.userPrivate[currentUser.uid];
      const mail: MailMessage = {
        id: `mail-${Date.now()}`,
        fromUid: currentUser.uid,
        fromName: currentUser.name,
        fromEmail: myPriv?.email || `${currentUser.uid}@psnacet.edu.in`,
        toUid: payload.toUser.uid,
        toName: payload.toUser.name,
        toEmail: payload.toEmail || `${payload.toUser.uid}@psnacet.edu.in`,
        subject: payload.subject.trim(),
        body: payload.body.trim(),
        sentAt: new Date().toISOString(),
        read: false,
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('mails', mail.id, mail);
      } else {
        mutateDemoState((prev) => ({ ...prev, mails: [mail, ...prev.mails] }));
      }
    },
    [currentUser, dataMode, mutateDemoState, state.userPrivate]
  );

  const markMailRead = useCallback(
    async (mailId: string) => {
      if (dataMode === 'firebase') {
        await fbUpdateDoc('mails', mailId, { read: true });
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          mails: prev.mails.map((m) => (m.id === mailId ? { ...m, read: true } : m)),
        }));
      }
    },
    [dataMode, mutateDemoState]
  );

  const createMeeting = useCallback(
    async (payload: Omit<CampusMeeting, 'id' | 'hostUid' | 'hostName'>) => {
      if (!currentUser || (currentUser.role !== 'staff' && currentUser.role !== 'management')) {
        throw new Error('Only Staff or Management can schedule meetings.');
      }
      const meeting: CampusMeeting = {
        ...payload,
        id: `meet-${Date.now()}`,
        hostUid: currentUser.uid,
        hostName: currentUser.name,
      };
      if (dataMode === 'firebase') {
        await fbSetDoc('meetings', meeting.id, meeting);
      } else {
        mutateDemoState((prev) => ({ ...prev, meetings: [meeting, ...prev.meetings] }));
      }
    },
    [currentUser, dataMode, mutateDemoState]
  );

  // --- Management ---
  const createCampusUser = useCallback(
    async (payload: {
      name: string;
      email: string;
      selectedRole: EffectiveRole;
      gender: Gender;
      department: string;
      className?: string;
      registerNumber?: string;
      roomId?: string;
      phone?: string;
      guardianName?: string;
      guardianPhone?: string;
      address?: string;
      bloodGroup?: string;
      medicalNotes?: string;
    }): Promise<UserProfile> => {
      if (!currentUser || currentUser.role !== 'management') {
        throw new Error('Only Management can add new campus users.');
      }
      const isStudentRole =
        payload.selectedRole === 'student' || payload.selectedRole === 'hostel_resident';
      const baseRole: BaseRole =
        payload.selectedRole === 'management'
          ? 'management'
          : payload.selectedRole === 'staff' || payload.selectedRole === 'warden'
          ? 'staff'
          : 'student';
      const isHostel = payload.selectedRole === 'hostel_resident';
      const isWarden = payload.selectedRole === 'warden';
      const hostelType: HostelType | undefined =
        isHostel || isWarden ? getHostelTypeForGender(payload.gender) : undefined;
      const uid = `${baseRole}-${Date.now()}`;
      const chosenRoom = isHostel
        ? state.hostelRooms.find((r) => r.id === payload.roomId)
        : undefined;

      if (chosenRoom && hostelType && chosenRoom.hostelType !== hostelType) {
        throw new Error(
          chosenRoom.hostelType === 'Girls Hostel'
            ? 'Girls Hostel rooms are strictly for Girl residents only.'
            : 'Boys Hostel rooms are strictly for Boy residents only.'
        );
      }

      const profile: UserProfile = {
        uid,
        name: payload.name.trim().slice(0, 100),
        role: baseRole,
        gender: payload.gender,
        isHostel,
        isWarden,
        hostelType,
        department: payload.department.trim().slice(0, 80),
        className: isStudentRole ? (payload.className?.trim() || 'III CSE A').slice(0, 40) : undefined,
        registerNumber: isStudentRole
          ? (
              payload.registerNumber?.trim() ||
              `921324${String(Math.floor(100000 + Math.random() * 899999))}`
            ).slice(0, 32)
          : undefined,
        roomNumber: chosenRoom?.roomNumber,
        block: chosenRoom?.block || (hostelType ? getDefaultBlockForHostel(hostelType) : undefined),
        hostelStatus: isHostel ? 'In' : undefined,
        createdAt: new Date().toISOString(),
      };

      const privRaw: UserPrivateInfo = {
        uid,
        email: payload.email.trim().toLowerCase().slice(0, 120),
        hostelType,
        phone: payload.phone?.trim().slice(0, 30) || undefined,
        guardianName: payload.guardianName?.trim().slice(0, 100) || undefined,
        guardianPhone: payload.guardianPhone?.trim().slice(0, 30) || undefined,
        address: payload.address?.trim().slice(0, 300) || undefined,
        bloodGroup: payload.bloodGroup?.trim().slice(0, 10) || undefined,
        medicalNotes: payload.medicalNotes?.trim().slice(0, 500) || undefined,
        updatedAt: new Date().toISOString(),
      };
      const cleanPriv = Object.fromEntries(
        Object.entries(privRaw).filter(([, v]) => v !== undefined)
      ) as unknown as UserPrivateInfo;

      if (dataMode === 'firebase') {
        await fbSetDoc('users', uid, profile);
        await fbSetDoc('userPrivate', uid, cleanPriv);
        if (chosenRoom && chosenRoom.occupantUids.length < chosenRoom.capacity) {
          await fbUpdateDoc('hostelRooms', chosenRoom.id, {
            occupantUids: [...chosenRoom.occupantUids, uid],
          });
        }
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          users: [...prev.users, profile],
          userPrivate: {
            ...prev.userPrivate,
            [uid]: cleanPriv,
          },
          hostelRooms: chosenRoom
            ? prev.hostelRooms.map((r) =>
                r.id === chosenRoom.id && r.occupantUids.length < r.capacity
                  ? { ...r, occupantUids: [...r.occupantUids, uid] }
                  : r
              )
            : prev.hostelRooms,
        }));
      }
      return profile;
    },
    [currentUser, dataMode, mutateDemoState, state.hostelRooms]
  );

  const updateUserRoleAndFlags = useCallback(
    async (
      targetUid: string,
      updates: { role: BaseRole; isHostel: boolean; isWarden: boolean; gender?: Gender }
    ) => {
      if (!currentUser || currentUser.role !== 'management') {
        throw new Error('Only Management can modify user roles and flags.');
      }
      const targetUser = state.users.find((u) => u.uid === targetUid);
      const resolvedGender = updates.gender || getUserGender(targetUser);
      const isHostel = updates.role === 'student' ? updates.isHostel : false;
      const isWarden = updates.role === 'staff' ? updates.isWarden : false;
      const resolvedHostelType: HostelType | undefined =
        isHostel || isWarden ? getHostelTypeForGender(resolvedGender) : undefined;
      const genderChanged = Boolean(targetUser && resolvedGender !== getUserGender(targetUser));
      const clearRoom = !isHostel || genderChanged;

      const normalized: Partial<UserProfile> = {
        role: updates.role,
        gender: resolvedGender,
        isHostel,
        isWarden,
        hostelType: resolvedHostelType,
        block: resolvedHostelType ? getDefaultBlockForHostel(resolvedHostelType) : undefined,
        roomNumber: clearRoom ? undefined : targetUser?.roomNumber,
      };
      if (dataMode === 'firebase') {
        const patch: Record<string, unknown> = {
          role: normalized.role,
          gender: normalized.gender,
          isHostel: normalized.isHostel,
          isWarden: normalized.isWarden,
          requestedRole: deleteField(),
          hostelType: resolvedHostelType ?? deleteField(),
          block: normalized.block ?? deleteField(),
        };
        if (clearRoom) {
          patch.roomNumber = deleteField();
        }
        await fbUpdateDoc('users', targetUid, patch);
        if (state.userPrivate[targetUid]) {
          await fbUpdateDoc('userPrivate', targetUid, {
            hostelType: resolvedHostelType ?? deleteField(),
            updatedAt: new Date().toISOString(),
          });
        }
        if (clearRoom) {
          const affectedRooms = state.hostelRooms.filter((r) => r.occupantUids.includes(targetUid));
          await Promise.all(
            affectedRooms.map((r) =>
              fbUpdateDoc('hostelRooms', r.id, {
                occupantUids: r.occupantUids.filter((id) => id !== targetUid),
              })
            )
          );
        }
      } else {
        mutateDemoState((prev) => ({
          ...prev,
          hostelRooms: clearRoom
            ? prev.hostelRooms.map((r) => ({
                ...r,
                occupantUids: r.occupantUids.filter((id) => id !== targetUid),
              }))
            : prev.hostelRooms,
          users: prev.users.map((u) =>
            u.uid === targetUid ? { ...u, ...normalized, requestedRole: undefined } : u
          ),
          userPrivate: prev.userPrivate[targetUid]
            ? {
                ...prev.userPrivate,
                [targetUid]: {
                  ...prev.userPrivate[targetUid],
                  hostelType: resolvedHostelType,
                  updatedAt: new Date().toISOString(),
                },
              }
            : prev.userPrivate,
        }));
        if (currentUser.uid === targetUid) {
          setCurrentUser((prev) =>
            prev ? { ...prev, ...normalized, requestedRole: undefined } : prev
          );
        }
      }
    },
    [currentUser, dataMode, mutateDemoState, state.hostelRooms, state.userPrivate, state.users]
  );

  const updateGeofence = useCallback(
    (geofence: CampusGeofence) => {
      mutateDemoState((prev) => ({ ...prev, geofence }));
    },
    [mutateDemoState]
  );

  const resetDemoData = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    const fresh = loadLocalState();
    setState(fresh);
    if (currentUser) {
      const updated = fresh.users.find((u) => u.uid === currentUser.uid);
      if (updated) setCurrentUser(updated);
    }
  }, [currentUser]);

  // Ensure private map returned in context respects RBAC even in Demo Mode
  const scopedState = useMemo<AppDataState>(
    () => ({
      ...state,
      userPrivate: filterPrivateMapForRole(currentUser, state.userPrivate, state.users),
    }),
    [currentUser, state]
  );

  const value: AppContextValue = {
    currentUser,
    dataMode,
    loading,
    authError,
    clearAuthError,
    isOnline,
    activeScreen,
    setActiveScreen,
    state: scopedState,
    visibleNotices,
    getPrivateForUser,
    loginDemoUser,
    loginWithEmail,
    signUpWithEmail,
    loginWithGoogle,
    logout,
    seedCloudFirestore,
    startAttendanceSession,
    rotateSessionToken,
    stopAttendanceSession,
    markStudentAttendance,
    checkInStaff,
    updateMyHostelStatus,
    updateHostelMenu,
    saveHostelAttendanceBatch,
    allotResidentRoom,
    createHostelRoom,
    updateUserPrivateInfo,
    placeCanteenOrder,
    updateCanteenOrderStatus,
    toggleCanteenItemAvailability,
    upsertCanteenItem,
    createNotice,
    createEvent,
    subscribeThread,
    sendChatMessage,
    createOrOpenDmThread,
    createGroupThread,
    uploadDocument,
    sendMail,
    markMailRead,
    createMeeting,
    createCampusUser,
    updateUserRoleAndFlags,
    updateGeofence,
    resetDemoData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
