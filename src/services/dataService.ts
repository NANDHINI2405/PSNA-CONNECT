import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  SEED_APPROVAL_REQUESTS,
  SEED_ATTENDANCE_RECORDS,
  SEED_ATTENDANCE_SESSIONS,
  SEED_AUDIT_LOGS,
  SEED_CANTEEN_ITEMS,
  SEED_CANTEEN_ORDERS,
  SEED_CHAT_MESSAGES,
  SEED_CHAT_THREADS,
  SEED_DOCUMENTS,
  SEED_EVENTS,
  SEED_HOSTEL_ATTENDANCE_LOGS,
  SEED_HOSTEL_MENUS,
  SEED_HOSTEL_ROOMS,
  SEED_MAILS,
  SEED_MASTER_REGISTRY,
  SEED_MEETINGS,
  SEED_NOTICES,
  SEED_STAFF_CHECKINS,
  SEED_TIMETABLE_SESSIONS,
  SEED_USER_PRIVATE,
  SEED_USERS,
  formatIsoDate,
} from '../data/seedData';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ApprovalRequest,
  AttendanceRecord,
  AttendanceSession,
  AuditLogEntry,
  CampusDocument,
  CampusEvent,
  CampusGeofence,
  CampusMeeting,
  CanteenItem,
  CanteenOrder,
  ChatMessage,
  ChatThread,
  DayOfWeek,
  HostelAttendanceLog,
  HostelMenu,
  HostelRoom,
  HostelStatus,
  MailMessage,
  MasterRegistryEntry,
  Notice,
  OrderStatus,
  StaffCheckin,
  TimetableSession,
  UserPrivateInfo,
  UserProfile,
  getDefaultBlockForHostel,
  getUserHostelType,
  normalizeRegistryId,
} from '../types';
import { DEFAULT_CAMPUS_GEOFENCE } from '../utils/geo';

export interface AppDataState {
  users: UserProfile[];
  userPrivate: Record<string, UserPrivateInfo>;
  masterRegistry: MasterRegistryEntry[];
  approvalRequests: ApprovalRequest[];
  auditLogs: AuditLogEntry[];
  attendanceSessions: AttendanceSession[];
  attendanceRecords: AttendanceRecord[];
  staffCheckins: StaffCheckin[];
  hostelRooms: HostelRoom[];
  hostelMenus: HostelMenu[];
  hostelAttendanceLogs: HostelAttendanceLog[];
  canteenItems: CanteenItem[];
  canteenOrders: CanteenOrder[];
  notices: Notice[];
  events: CampusEvent[];
  chatThreads: ChatThread[];
  chatMessages: Record<string, ChatMessage[]>;
  documents: CampusDocument[];
  mails: MailMessage[];
  meetings: CampusMeeting[];
  timetableSessions: TimetableSession[];
  geofence: CampusGeofence;
}

export const STORAGE_KEY = 'psna_connect_store_v4';
const CACHED_NOTICES_KEY = 'psna_connect_cached_notices_v1';
const DEMO_UID_KEY = 'psna_connect_demo_uid_v1';
const PENDING_MASTER_KEY = 'psna_connect_pending_master_v1';

function buildInitialState(): AppDataState {
  const groupedMessages: Record<string, ChatMessage[]> = {};
  for (const m of SEED_CHAT_MESSAGES) {
    if (!groupedMessages[m.threadId]) groupedMessages[m.threadId] = [];
    groupedMessages[m.threadId].push(m);
  }
  return {
    users: SEED_USERS,
    userPrivate: SEED_USER_PRIVATE,
    masterRegistry: SEED_MASTER_REGISTRY,
    approvalRequests: SEED_APPROVAL_REQUESTS,
    auditLogs: SEED_AUDIT_LOGS,
    attendanceSessions: SEED_ATTENDANCE_SESSIONS,
    attendanceRecords: SEED_ATTENDANCE_RECORDS,
    staffCheckins: SEED_STAFF_CHECKINS,
    hostelRooms: SEED_HOSTEL_ROOMS,
    hostelMenus: SEED_HOSTEL_MENUS,
    hostelAttendanceLogs: SEED_HOSTEL_ATTENDANCE_LOGS,
    canteenItems: SEED_CANTEEN_ITEMS,
    canteenOrders: SEED_CANTEEN_ORDERS,
    notices: SEED_NOTICES,
    events: SEED_EVENTS,
    chatThreads: SEED_CHAT_THREADS,
    chatMessages: groupedMessages,
    documents: SEED_DOCUMENTS,
    mails: SEED_MAILS,
    meetings: SEED_MEETINGS,
    timetableSessions: SEED_TIMETABLE_SESSIONS,
    geofence: DEFAULT_CAMPUS_GEOFENCE,
  };
}

export function loadLocalState(): AppDataState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const init = buildInitialState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
      localStorage.setItem(CACHED_NOTICES_KEY, JSON.stringify(init.notices));
      return init;
    }
    const parsed = JSON.parse(raw) as Partial<AppDataState>;
    const init = buildInitialState();
    return {
      ...init,
      ...parsed,
      masterRegistry:
        parsed.masterRegistry && parsed.masterRegistry.length > 0
          ? parsed.masterRegistry
          : init.masterRegistry,
      approvalRequests: parsed.approvalRequests ?? init.approvalRequests,
      auditLogs: parsed.auditLogs ?? init.auditLogs,
      timetableSessions: parsed.timetableSessions ?? init.timetableSessions,
    };
  } catch {
    return buildInitialState();
  }
}

export function saveLocalState(state: AppDataState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(CACHED_NOTICES_KEY, JSON.stringify(state.notices));
  } catch {
    // Ignore storage quota errors
  }
}

export function getCachedNotices(): Notice[] {
  try {
    const raw = localStorage.getItem(CACHED_NOTICES_KEY);
    if (raw) return JSON.parse(raw) as Notice[];
  } catch {
    // ignore
  }
  return SEED_NOTICES;
}

export function cacheNotices(notices: Notice[]): void {
  try {
    localStorage.setItem(CACHED_NOTICES_KEY, JSON.stringify(notices));
  } catch {
    // ignore
  }
}

export function getSavedDemoUid(): string | null {
  try {
    return localStorage.getItem(DEMO_UID_KEY);
  } catch {
    return null;
  }
}

export function setSavedDemoUid(uid: string | null): void {
  try {
    if (uid) localStorage.setItem(DEMO_UID_KEY, uid);
    else localStorage.removeItem(DEMO_UID_KEY);
  } catch {
    // ignore
  }
}

export function canReadPrivateInfo(
  requester: UserProfile | null,
  targetUid: string,
  targetUser?: UserProfile | null
): boolean {
  if (!requester) return false;
  if (requester.uid === targetUid) return true;
  if (requester.role === 'management') return true;
  if (requester.role === 'staff' && requester.isWarden) {
    if (!targetUser) return false;
    if (!targetUser.isHostel) return false;
    const wardenHostel = getUserHostelType(requester);
    const residentHostel = getUserHostelType(targetUser);
    return Boolean(wardenHostel && residentHostel && wardenHostel === residentHostel);
  }
  return false;
}

export function filterPrivateMapForRole(
  requester: UserProfile | null,
  privateMap: Record<string, UserPrivateInfo>,
  users: UserProfile[] = []
): Record<string, UserPrivateInfo> {
  if (!requester) return {};
  if (requester.role === 'management') {
    return privateMap;
  }
  if (requester.role === 'staff' && requester.isWarden) {
    const wardenHostel = getUserHostelType(requester);
    const allowedUids = new Set(
      users
        .filter((u) => u.isHostel && getUserHostelType(u) === wardenHostel)
        .map((u) => u.uid)
    );
    allowedUids.add(requester.uid);
    const filtered: Record<string, UserPrivateInfo> = {};
    for (const [uid, info] of Object.entries(privateMap)) {
      if (allowedUids.has(uid)) {
        filtered[uid] = info;
      }
    }
    return filtered;
  }
  if (privateMap[requester.uid]) {
    return { [requester.uid]: privateMap[requester.uid] };
  }
  return {};
}

function savePendingMasterHint(email: string, masterId: string): void {
  try {
    const raw = localStorage.getItem(PENDING_MASTER_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[email.toLowerCase()] = masterId;
    localStorage.setItem(PENDING_MASTER_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function getPendingMasterHint(email: string): string | null {
  try {
    const raw = localStorage.getItem(PENDING_MASTER_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[email.toLowerCase()] || null;
  } catch {
    return null;
  }
}

export async function signInWithGoogleFirebase(): Promise<UserProfile> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return ensureFirebaseUserProfile(cred.user);
}

export async function signInWithEmailFirebase(
  email: string,
  password: string
): Promise<{ user: FirebaseUser; profile: UserProfile | null }> {
  const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  if (!cred.user.emailVerified) {
    return { user: cred.user, profile: null };
  }
  const profile = await ensureFirebaseUserProfile(cred.user);
  return { user: cred.user, profile };
}

export async function signUpWithEmailFirebase(
  email: string,
  registerOrStaffId: string,
  password: string
): Promise<{ user: FirebaseUser; masterEntry: MasterRegistryEntry }> {
  const cleanEmail = email.trim().toLowerCase();
  const masterId = normalizeRegistryId(registerOrStaffId);
  if (!cleanEmail.endsWith('@psnacet.edu.in')) {
    throw new Error('Only official @psnacet.edu.in college emails are permitted.');
  }
  if (!masterId) {
    throw new Error('Please enter your Register Number or Staff ID.');
  }

  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  try {
    const masterSnap = await getDoc(doc(db, 'masterRegistry', masterId));
    if (!masterSnap.exists()) {
      throw new Error(
        'Your email and Register No / Staff ID were not found in the Management-approved master list.'
      );
    }
    const master = masterSnap.data() as MasterRegistryEntry;
    if (master.email.toLowerCase() !== cleanEmail) {
      throw new Error(
        'Your email does not match the college email on record for this Register No / Staff ID.'
      );
    }
    if (!master.active) {
      throw new Error(
        'This master directory record has been deactivated by Management. Contact administration.'
      );
    }
    if (master.claimedUid && master.claimedUid !== cred.user.uid) {
      throw new Error(
        'This Register No / Staff ID has already been claimed by another account. Use Sign In or Forgot Password.'
      );
    }
    await updateProfile(cred.user, { displayName: master.name });
    savePendingMasterHint(cleanEmail, master.id);
    await sendEmailVerification(cred.user);
    return { user: cred.user, masterEntry: master };
  } catch (err) {
    try {
      await deleteUser(cred.user);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

export async function sendPasswordResetEmailFirebase(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('Please enter your college email address.');
  }
  await sendPasswordResetEmail(auth, cleanEmail);
}

export async function resendVerificationEmailFirebase(): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('No pending account session found. Please sign in again.');
  }
  await sendEmailVerification(auth.currentUser);
}

export async function reloadFirebaseUser(): Promise<FirebaseUser | null> {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

async function resolveMasterEntryForUser(
  email: string,
  hintEntry?: MasterRegistryEntry
): Promise<MasterRegistryEntry | null> {
  if (hintEntry) return hintEntry;
  const cleanEmail = email.trim().toLowerCase();
  const hintId = getPendingMasterHint(cleanEmail);
  if (hintId) {
    const snap = await getDoc(doc(db, 'masterRegistry', hintId));
    if (snap.exists()) {
      return snap.data() as MasterRegistryEntry;
    }
  }
  const qSnap = await getDocs(
    query(collection(db, 'masterRegistry'), where('email', '==', cleanEmail))
  );
  if (!qSnap.empty) {
    return qSnap.docs[0].data() as MasterRegistryEntry;
  }
  return null;
}

export async function ensureFirebaseUserProfile(
  fbUser: FirebaseUser,
  hintEntry?: MasterRegistryEntry
): Promise<UserProfile> {
  if (!fbUser.emailVerified) {
    throw new Error('EMAIL_NOT_VERIFIED');
  }
  const userRef = doc(db, 'users', fbUser.uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    const cleanEmail = (fbUser.email || '').trim().toLowerCase();
    const isAdminEmail =
      cleanEmail === 'nandyviji2407@gmail.com' && fbUser.emailVerified;

    if (isAdminEmail) {
      const adminProfile: UserProfile = {
        uid: fbUser.uid,
        name: fbUser.displayName || 'Campus Administrator',
        role: 'management',
        gender: 'Girl',
        isHostel: false,
        isWarden: false,
        department: 'Administration',
        active: true,
        createdAt: new Date().toISOString(),
      };
      await setDoc(userRef, adminProfile);
      await setDoc(doc(db, 'userPrivate', fbUser.uid), {
        uid: fbUser.uid,
        email: cleanEmail,
        updatedAt: new Date().toISOString(),
      });
      return adminProfile;
    }

    if (!cleanEmail.endsWith('@psnacet.edu.in')) {
      throw new Error('Only verified @psnacet.edu.in accounts or pre-approved campus members can access PSNA Connect.');
    }

    const master = await resolveMasterEntryForUser(cleanEmail, hintEntry);
    if (!master) {
      throw new Error(
        'Your @psnacet.edu.in email is not listed in the Management-approved master directory.'
      );
    }
    if (!master.active) {
      throw new Error('Your pre-approved master directory entry is currently deactivated.');
    }

    const resolvedHostelType =
      master.isHostel || master.isWarden
        ? master.hostelType || (master.gender === 'Girl' ? 'Girls Hostel' : 'Boys Hostel')
        : undefined;

    const newProfile: UserProfile = {
      uid: fbUser.uid,
      name: master.name.slice(0, 100),
      role: master.role,
      gender: master.gender,
      isHostel: master.isHostel,
      isWarden: master.isWarden,
      hostelType: resolvedHostelType,
      programLevel: master.programLevel,
      academicYear: master.academicYear,
      rollNumber: master.role === 'student' ? master.registerOrStaffId : undefined,
      department: master.department.slice(0, 80),
      className: master.className,
      registerNumber: master.registerOrStaffId,
      block: resolvedHostelType ? getDefaultBlockForHostel(resolvedHostelType) : undefined,
      hostelStatus: master.isHostel ? 'In' : undefined,
      masterId: master.id,
      active: true,
      createdAt: new Date().toISOString(),
    };

    const cleanProfile = Object.fromEntries(
      Object.entries(newProfile).filter(([, v]) => v !== undefined)
    );
    await setDoc(userRef, cleanProfile);

    const privPayload: Record<string, unknown> = {
      uid: fbUser.uid,
      email: cleanEmail,
      updatedAt: new Date().toISOString(),
    };
    if (resolvedHostelType) privPayload.hostelType = resolvedHostelType;
    await setDoc(doc(db, 'userPrivate', fbUser.uid), privPayload);

    return newProfile;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('master directory') || error.message.includes('@psnacet.edu.in') || error.message === 'EMAIL_NOT_VERIFIED')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `users/${fbUser.uid}`);
  }
}

export function subscribeFirebaseAuth(cb: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function seedFirestoreWithDummyData(currentUser: UserProfile): Promise<void> {
  if (currentUser.role !== 'management') {
    throw new Error('Only Management can seed the campus database.');
  }
  const batch = writeBatch(db);
  for (const u of SEED_USERS) {
    const clean = Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined));
    batch.set(doc(db, 'users', u.uid), clean);
  }
  for (const [uid, priv] of Object.entries(SEED_USER_PRIVATE)) {
    batch.set(doc(db, 'userPrivate', uid), priv);
  }
  for (const r of SEED_HOSTEL_ROOMS) {
    batch.set(doc(db, 'hostelRooms', r.id), r);
  }
  for (const m of SEED_HOSTEL_MENUS) {
    batch.set(doc(db, 'hostelMenus', m.day), m);
  }
  for (const log of SEED_HOSTEL_ATTENDANCE_LOGS) {
    batch.set(doc(db, 'hostelAttendanceLogs', log.id), log);
  }
  for (const item of SEED_CANTEEN_ITEMS) {
    batch.set(doc(db, 'canteenItems', item.id), item);
  }
  for (const ord of SEED_CANTEEN_ORDERS) {
    batch.set(doc(db, 'canteenOrders', ord.id), ord);
  }
  for (const n of SEED_NOTICES) {
    batch.set(doc(db, 'notices', n.id), n);
  }
  for (const e of SEED_EVENTS) {
    batch.set(doc(db, 'events', e.id), e);
  }
  for (const t of SEED_CHAT_THREADS) {
    const clean = Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined));
    batch.set(doc(db, 'chatThreads', t.id), clean);
  }
  for (const msg of SEED_CHAT_MESSAGES) {
    batch.set(doc(db, 'chatThreads', msg.threadId, 'messages', msg.id), msg);
  }
  for (const d of SEED_DOCUMENTS) {
    batch.set(doc(db, 'documents', d.id), {
      id: d.id,
      title: d.title,
      category: d.category,
      audience: d.audience,
      department: d.department,
      uploadedByUid: d.uploadedByUid,
      uploadedByName: d.uploadedByName,
      uploadedAt: d.uploadedAt,
      fileName: d.fileName,
      summary: d.summary,
      sections: d.sections || [],
    });
  }
  for (const mail of SEED_MAILS) {
    batch.set(doc(db, 'mails', mail.id), mail);
  }
  for (const meet of SEED_MEETINGS) {
    batch.set(doc(db, 'meetings', meet.id), meet);
  }
  for (const sess of SEED_ATTENDANCE_SESSIONS) {
    batch.set(doc(db, 'attendanceSessions', sess.id), sess);
  }
  for (const tt of SEED_TIMETABLE_SESSIONS) {
    const cleanTt = Object.fromEntries(Object.entries(tt).filter(([, v]) => v !== undefined));
    batch.set(doc(db, 'timetableSessions', tt.id), cleanTt);
  }
  for (const chk of SEED_STAFF_CHECKINS) {
    batch.set(doc(db, 'staffCheckins', chk.id), chk);
  }
  for (const m of SEED_MASTER_REGISTRY) {
    const cleanM = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined));
    batch.set(doc(db, 'masterRegistry', m.id), cleanM);
  }
  for (const req of SEED_APPROVAL_REQUESTS) {
    const cleanReq = Object.fromEntries(Object.entries(req).filter(([, v]) => v !== undefined));
    batch.set(doc(db, 'approvalRequests', req.id), cleanReq);
  }
  for (const log of SEED_AUDIT_LOGS) {
    const cleanLog = Object.fromEntries(Object.entries(log).filter(([, v]) => v !== undefined));
    batch.set(doc(db, 'auditLogs', log.id), cleanLog);
  }
  await batch.commit();

  // Seed recent attendance records in chunks of 400
  const recentRecords = SEED_ATTENDANCE_RECORDS.slice(-120);
  const attBatch = writeBatch(db);
  for (const rec of recentRecords) {
    attBatch.set(doc(db, 'attendanceRecords', rec.id), rec);
  }
  await attBatch.commit();
}

export function subscribeFirestoreState(
  currentUser: UserProfile,
  onUpdate: (partial: Partial<AppDataState>) => void
): () => void {
  if (currentUser.active === false) {
    return () => {};
  }

  const unsubs: (() => void)[] = [];

  const watchCol = <T>(
    colName: string,
    key: keyof AppDataState,
    qRef = query(collection(db, colName))
  ) => {
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as T);
        if (key === 'notices') {
          cacheNotices(list as unknown as Notice[]);
        }
        onUpdate({ [key]: list } as Partial<AppDataState>);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, colName);
      }
    );
    unsubs.push(unsub);
  };

  watchCol<UserProfile>('users', 'users');
  watchCol<AttendanceSession>('attendanceSessions', 'attendanceSessions');
  watchCol<TimetableSession>('timetableSessions', 'timetableSessions');
  watchCol<CanteenItem>('canteenItems', 'canteenItems');
  watchCol<Notice>('notices', 'notices');
  watchCol<CampusEvent>('events', 'events');
  watchCol<CampusDocument>('documents', 'documents');
  watchCol<CampusMeeting>('meetings', 'meetings');

  if (currentUser.role === 'management') {
    watchCol<MasterRegistryEntry>('masterRegistry', 'masterRegistry');
    watchCol<AuditLogEntry>('auditLogs', 'auditLogs');
    watchCol<ApprovalRequest>('approvalRequests', 'approvalRequests');
  } else {
    const myHostelType = getUserHostelType(currentUser);
    const mergedReqs = new Map<string, ApprovalRequest>();
    const emitReqs = () => onUpdate({ approvalRequests: Array.from(mergedReqs.values()) });

    const unsubOwnReqs = onSnapshot(
      query(collection(db, 'approvalRequests'), where('requesterUid', '==', currentUser.uid)),
      (snap) => {
        snap.docs.forEach((d) => mergedReqs.set(d.id, d.data() as ApprovalRequest));
        emitReqs();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'approvalRequests')
    );
    unsubs.push(unsubOwnReqs);

    if (currentUser.isWarden && myHostelType) {
      const unsubWardenReqs = onSnapshot(
        query(
          collection(db, 'approvalRequests'),
          where('targetQueue', '==', 'warden'),
          where('targetHostelType', '==', myHostelType)
        ),
        (snap) => {
          snap.docs.forEach((d) => mergedReqs.set(d.id, d.data() as ApprovalRequest));
          emitReqs();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'approvalRequests')
      );
      unsubs.push(unsubWardenReqs);
    }
  }

  // Role-scoped queries so Firestore rules never reject unauthorized list queries
  if (currentUser.role === 'management' || currentUser.role === 'staff') {
    watchCol<AttendanceRecord>('attendanceRecords', 'attendanceRecords');
    watchCol<CanteenOrder>('canteenOrders', 'canteenOrders');
  } else {
    watchCol<AttendanceRecord>(
      'attendanceRecords',
      'attendanceRecords',
      query(collection(db, 'attendanceRecords'), where('studentUid', '==', currentUser.uid))
    );
    watchCol<CanteenOrder>(
      'canteenOrders',
      'canteenOrders',
      query(collection(db, 'canteenOrders'), where('userUid', '==', currentUser.uid))
    );
  }

  if (currentUser.role === 'management') {
    watchCol<StaffCheckin>('staffCheckins', 'staffCheckins');
  } else if (currentUser.role === 'staff') {
    watchCol<StaffCheckin>(
      'staffCheckins',
      'staffCheckins',
      query(collection(db, 'staffCheckins'), where('staffUid', '==', currentUser.uid))
    );
  }

  const myHostelType = getUserHostelType(currentUser);

  if (currentUser.isHostel || currentUser.isWarden || currentUser.role === 'management') {
    if (currentUser.role === 'management') {
      watchCol<HostelRoom>('hostelRooms', 'hostelRooms');
    } else if (myHostelType) {
      watchCol<HostelRoom>(
        'hostelRooms',
        'hostelRooms',
        query(collection(db, 'hostelRooms'), where('hostelType', '==', myHostelType))
      );
    }
    watchCol<HostelMenu>('hostelMenus', 'hostelMenus');
    if (currentUser.role === 'management') {
      watchCol<HostelAttendanceLog>('hostelAttendanceLogs', 'hostelAttendanceLogs');
    } else if (currentUser.isWarden && myHostelType) {
      watchCol<HostelAttendanceLog>(
        'hostelAttendanceLogs',
        'hostelAttendanceLogs',
        query(collection(db, 'hostelAttendanceLogs'), where('hostelType', '==', myHostelType))
      );
    } else {
      watchCol<HostelAttendanceLog>(
        'hostelAttendanceLogs',
        'hostelAttendanceLogs',
        query(collection(db, 'hostelAttendanceLogs'), where('residentUid', '==', currentUser.uid))
      );
    }
  }

  // Private PII subscription strictly scoped by role & warden hostel wing
  if (currentUser.role === 'management') {
    const unsubPriv = onSnapshot(
      collection(db, 'userPrivate'),
      (snap) => {
        const map: Record<string, UserPrivateInfo> = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as UserPrivateInfo;
        });
        onUpdate({ userPrivate: map });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'userPrivate')
    );
    unsubs.push(unsubPriv);
  } else if (currentUser.isWarden && myHostelType) {
    const privMap: Record<string, UserPrivateInfo> = {};
    const unsubWardenPriv = onSnapshot(
      query(collection(db, 'userPrivate'), where('hostelType', '==', myHostelType)),
      (snap) => {
        snap.docs.forEach((d) => {
          privMap[d.id] = d.data() as UserPrivateInfo;
        });
        onUpdate({ userPrivate: { ...privMap } });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'userPrivate')
    );
    const unsubSelfPriv = onSnapshot(
      doc(db, 'userPrivate', currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          privMap[currentUser.uid] = snap.data() as UserPrivateInfo;
          onUpdate({ userPrivate: { ...privMap } });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `userPrivate/${currentUser.uid}`)
    );
    unsubs.push(unsubWardenPriv, unsubSelfPriv);
  } else {
    const unsubSelfPriv = onSnapshot(
      doc(db, 'userPrivate', currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          onUpdate({ userPrivate: { [currentUser.uid]: snap.data() as UserPrivateInfo } });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `userPrivate/${currentUser.uid}`)
    );
    unsubs.push(unsubSelfPriv);
  }

  // Mail subscriptions
  if (currentUser.role === 'management') {
    watchCol<MailMessage>('mails', 'mails');
  } else {
    // Load mails sent or received
    const loadMails = async () => {
      try {
        const [inboxSnap, sentSnap] = await Promise.all([
          getDocs(query(collection(db, 'mails'), where('toUid', '==', currentUser.uid))),
          getDocs(query(collection(db, 'mails'), where('fromUid', '==', currentUser.uid))),
        ]);
        const merged = new Map<string, MailMessage>();
        inboxSnap.docs.forEach((d) => merged.set(d.id, d.data() as MailMessage));
        sentSnap.docs.forEach((d) => merged.set(d.id, d.data() as MailMessage));
        onUpdate({ mails: Array.from(merged.values()) });
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'mails');
      }
    };
    loadMails();
  }

  // Chat threads subscription (role- and hostelType-scoped queries)
  if (currentUser.role === 'management') {
    const unsubThreads = onSnapshot(
      collection(db, 'chatThreads'),
      (snap) => {
        const threads = snap.docs.map((d) => d.data() as ChatThread);
        onUpdate({ chatThreads: threads });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chatThreads')
    );
    unsubs.push(unsubThreads);
  } else {
    const mergedThreads = new Map<string, ChatThread>();
    const emitThreads = () => onUpdate({ chatThreads: Array.from(mergedThreads.values()) });

    const unsubClass = onSnapshot(
      query(collection(db, 'chatThreads'), where('type', '==', 'class')),
      (snap) => {
        snap.docs.forEach((d) => mergedThreads.set(d.id, d.data() as ChatThread));
        emitThreads();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chatThreads')
    );
    unsubs.push(unsubClass);

    const unsubDm = onSnapshot(
      query(
        collection(db, 'chatThreads'),
        where('type', '==', 'dm'),
        where('participantUids', 'array-contains', currentUser.uid)
      ),
      (snap) => {
        snap.docs.forEach((d) => mergedThreads.set(d.id, d.data() as ChatThread));
        emitThreads();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chatThreads')
    );
    unsubs.push(unsubDm);

    if ((currentUser.isHostel || currentUser.isWarden) && myHostelType) {
      const unsubHostel = onSnapshot(
        query(
          collection(db, 'chatThreads'),
          where('type', '==', 'hostel'),
          where('hostelType', '==', myHostelType)
        ),
        (snap) => {
          snap.docs.forEach((d) => mergedThreads.set(d.id, d.data() as ChatThread));
          emitThreads();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'chatThreads')
      );
      unsubs.push(unsubHostel);
    }
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

export function subscribeChatThreadMessages(
  threadId: string,
  onMessages: (msgs: ChatMessage[]) => void
): () => void {
  const path = `chatThreads/${threadId}/messages`;
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const msgs = snap.docs
        .map((d) => d.data() as ChatMessage)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onMessages(msgs);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

// --- Firestore Write Helpers ---
export async function fbSetDoc(path: string, id: string, data: object): Promise<void> {
  try {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await setDoc(doc(db, path, id), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${path}/${id}`);
  }
}

export async function fbUpdateDoc(path: string, id: string, data: object): Promise<void> {
  try {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await updateDoc(doc(db, path, id), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${path}/${id}`);
  }
}

export async function fbDeleteDoc(path: string, id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, path, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${path}/${id}`);
  }
}

export function getTodayDayName(): DayOfWeek {
  const map: DayOfWeek[] = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return map[new Date().getDay()];
}

export function getTodayIso(): string {
  return formatIsoDate(new Date());
}
