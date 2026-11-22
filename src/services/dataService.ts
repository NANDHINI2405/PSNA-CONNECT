import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
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
  SEED_ATTENDANCE_RECORDS,
  SEED_ATTENDANCE_SESSIONS,
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
  SEED_MEETINGS,
  SEED_NOTICES,
  SEED_STAFF_CHECKINS,
  SEED_USER_PRIVATE,
  SEED_USERS,
  formatIsoDate,
} from '../data/seedData';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AttendanceRecord,
  AttendanceSession,
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
  Notice,
  OrderStatus,
  StaffCheckin,
  UserPrivateInfo,
  UserProfile,
} from '../types';
import { DEFAULT_CAMPUS_GEOFENCE } from '../utils/geo';

export interface AppDataState {
  users: UserProfile[];
  userPrivate: Record<string, UserPrivateInfo>;
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
  geofence: CampusGeofence;
}

const STORAGE_KEY = 'psna_connect_store_v2';
const CACHED_NOTICES_KEY = 'psna_connect_cached_notices_v1';
const DEMO_UID_KEY = 'psna_connect_demo_uid_v1';

function buildInitialState(): AppDataState {
  const groupedMessages: Record<string, ChatMessage[]> = {};
  for (const m of SEED_CHAT_MESSAGES) {
    if (!groupedMessages[m.threadId]) groupedMessages[m.threadId] = [];
    groupedMessages[m.threadId].push(m);
  }
  return {
    users: SEED_USERS,
    userPrivate: SEED_USER_PRIVATE,
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
    return JSON.parse(raw) as AppDataState;
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

export function canReadPrivateInfo(requester: UserProfile | null, targetUid: string): boolean {
  if (!requester) return false;
  if (requester.uid === targetUid) return true;
  if (requester.role === 'management') return true;
  if (requester.role === 'staff' && requester.isWarden) return true;
  return false;
}

export function filterPrivateMapForRole(
  requester: UserProfile | null,
  privateMap: Record<string, UserPrivateInfo>
): Record<string, UserPrivateInfo> {
  if (!requester) return {};
  if (requester.role === 'management' || (requester.role === 'staff' && requester.isWarden)) {
    return privateMap;
  }
  if (privateMap[requester.uid]) {
    return { [requester.uid]: privateMap[requester.uid] };
  }
  return {};
}

export async function signInWithGoogleFirebase(): Promise<UserProfile> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return ensureFirebaseUserProfile(cred.user);
}

export async function signInWithEmailFirebase(email: string, password: string): Promise<UserProfile> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return ensureFirebaseUserProfile(cred.user);
}

export async function signUpWithEmailFirebase(
  name: string,
  email: string,
  password: string,
  department: string,
  requestedRole?: UserProfile['requestedRole']
): Promise<UserProfile> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  return ensureFirebaseUserProfile(cred.user, { name, department, requestedRole });
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export async function ensureFirebaseUserProfile(
  fbUser: FirebaseUser,
  overrides?: {
    name?: string;
    department?: string;
    requestedRole?: UserProfile['requestedRole'];
  }
): Promise<UserProfile> {
  const userRef = doc(db, 'users', fbUser.uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    const isAdminEmail =
      fbUser.email?.toLowerCase() === 'nandyviji2407@gmail.com' && fbUser.emailVerified;

    // Security rule: new sign-ups are always created as Student unless bootstrapped admin;
    // requestedRole records non-student requests for 1-click Management approval.
    const newProfile: UserProfile = {
      uid: fbUser.uid,
      name: overrides?.name || fbUser.displayName || fbUser.email?.split('@')[0] || 'Campus User',
      role: isAdminEmail ? 'management' : 'student',
      isHostel: false,
      isWarden: false,
      department: overrides?.department || (isAdminEmail ? 'Administration' : 'Computer Science & Engineering'),
      className: isAdminEmail ? undefined : 'III CSE A',
      registerNumber: isAdminEmail ? undefined : `921324${String(Math.floor(100000 + Math.random() * 899999))}`,
      requestedRole:
        !isAdminEmail && overrides?.requestedRole && overrides.requestedRole !== 'student'
          ? overrides.requestedRole
          : undefined,
      createdAt: new Date().toISOString(),
    };
    // Strip undefined fields for Firestore
    const cleanProfile = Object.fromEntries(
      Object.entries(newProfile).filter(([, v]) => v !== undefined)
    );
    await setDoc(userRef, cleanProfile);

    const privateRef = doc(db, 'userPrivate', fbUser.uid);
    await setDoc(privateRef, {
      uid: fbUser.uid,
      email: fbUser.email || '',
      updatedAt: new Date().toISOString(),
    });
    return newProfile;
  } catch (error) {
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
  for (const chk of SEED_STAFF_CHECKINS) {
    batch.set(doc(db, 'staffCheckins', chk.id), chk);
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
  watchCol<CanteenItem>('canteenItems', 'canteenItems');
  watchCol<Notice>('notices', 'notices');
  watchCol<CampusEvent>('events', 'events');
  watchCol<CampusDocument>('documents', 'documents');
  watchCol<CampusMeeting>('meetings', 'meetings');

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

  if (currentUser.isHostel || currentUser.isWarden || currentUser.role === 'management') {
    watchCol<HostelRoom>('hostelRooms', 'hostelRooms');
    watchCol<HostelMenu>('hostelMenus', 'hostelMenus');
    if (currentUser.isWarden || currentUser.role === 'management') {
      watchCol<HostelAttendanceLog>('hostelAttendanceLogs', 'hostelAttendanceLogs');
    } else {
      watchCol<HostelAttendanceLog>(
        'hostelAttendanceLogs',
        'hostelAttendanceLogs',
        query(collection(db, 'hostelAttendanceLogs'), where('residentUid', '==', currentUser.uid))
      );
    }
  }

  // Private PII subscription strictly scoped by role
  if (currentUser.role === 'management' || currentUser.isWarden) {
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

  // Chat threads subscription
  const unsubThreads = onSnapshot(
    collection(db, 'chatThreads'),
    (snap) => {
      const threads = snap.docs.map((d) => d.data() as ChatThread);
      onUpdate({ chatThreads: threads });
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'chatThreads')
  );
  unsubs.push(unsubThreads);

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
