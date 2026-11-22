export type BaseRole = 'student' | 'staff' | 'management';

export type EffectiveRole =
  | 'student'
  | 'hostel_resident'
  | 'staff'
  | 'warden'
  | 'management';

export type HostelStatus = 'In' | 'Out' | 'Leave';
export type Audience = 'All' | 'Students' | 'Staff' | 'Hostel';
export type OrderStatus = 'Placed' | 'Preparing' | 'Ready' | 'Collected';

export interface UserProfile {
  uid: string;
  name: string;
  role: BaseRole;
  isHostel: boolean;
  isWarden: boolean;
  department: string;
  className?: string;
  registerNumber?: string;
  roomNumber?: string;
  block?: string;
  hostelStatus?: HostelStatus;
  requestedRole?: EffectiveRole;
  createdAt?: string;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phone?: string;
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
  bloodGroup?: string;
  medicalNotes?: string;
  allergies?: string;
  updatedAt?: string;
}

export interface AttendanceSession {
  id: string;
  staffUid: string;
  staffName: string;
  subjectCode: string;
  subjectName: string;
  className: string;
  department: string;
  currentToken: string;
  tokenIssuedAt: number;
  expiresAt: number;
  campusLat: number;
  campusLng: number;
  radiusMeters: number;
  active: boolean;
}

export interface AttendanceRecord {
  id: string;
  studentUid: string;
  studentName: string;
  registerNumber: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  date: string;
  status: 'Present' | 'Absent';
  sessionId?: string;
  markedVia: 'QR' | 'Manual' | 'Seed';
  markedAt: string;
}

export interface StaffCheckin {
  id: string;
  staffUid: string;
  staffName: string;
  department: string;
  date: string;
  status: 'Present' | 'Absent';
  checkinTime: string;
  distanceMeters: number;
}

export interface HostelRoom {
  id: string;
  roomNumber: string;
  block: string;
  floor: string;
  capacity: number;
  occupantUids: string[];
}

export type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export interface HostelMenu {
  day: DayOfWeek;
  breakfast: string;
  breakfastTime: string;
  breakfastReady: boolean;
  lunch: string;
  lunchTime: string;
  lunchReady: boolean;
  snacks: string;
  snacksTime: string;
  snacksReady: boolean;
  dinner: string;
  dinnerTime: string;
  dinnerReady: boolean;
  updatedAt?: string;
}

export interface HostelAttendanceLog {
  id: string;
  date: string;
  residentUid: string;
  residentName: string;
  roomNumber: string;
  status: HostelStatus;
  markedByUid: string;
}

export interface CanteenItem {
  id: string;
  name: string;
  category: string;
  price: number;
  availableFrom: string;
  availableTo: string;
  isAvailable: boolean;
  veg: boolean;
}

export interface CanteenOrderItem {
  itemId: string;
  name: string;
  qty: number;
  price: number;
}

export interface CanteenOrder {
  id: string;
  tokenNumber: number;
  userUid: string;
  userName: string;
  userRole: string;
  items: CanteenOrderItem[];
  totalAmount: number;
  status: OrderStatus;
  placedAt: string;
}

export interface Notice {
  id: string;
  title: string;
  message: string;
  audience: Audience;
  date: string;
  authorUid: string;
  authorName: string;
  authorRole: string;
  pinned?: boolean;
}

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  audience: Audience;
  organizerName: string;
  createdByUid: string;
}

export interface ChatThread {
  id: string;
  type: 'class' | 'hostel' | 'dm';
  title: string;
  className?: string;
  participantUids?: string[];
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderUid: string;
  senderName: string;
  senderRole: string;
  text: string;
  createdAt: string;
}

export interface CampusDocument {
  id: string;
  title: string;
  category: 'Notes' | 'Circular';
  audience: Audience;
  department: string;
  uploadedByUid: string;
  uploadedByName: string;
  uploadedAt: string;
  fileName: string;
  summary: string;
  pdfDataUrl?: string;
  sections?: string[];
}

export interface MailMessage {
  id: string;
  fromUid: string;
  fromName: string;
  fromEmail: string;
  toUid: string;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  sentAt: string;
  read: boolean;
}

export interface CampusMeeting {
  id: string;
  title: string;
  hostUid: string;
  hostName: string;
  department: string;
  audience: Audience;
  date: string;
  time: string;
  joinUrl: string;
  agenda: string;
}

export interface CampusGeofence {
  lat: number;
  lng: number;
  radiusMeters: number;
  label: string;
}

export type NavScreen =
  | 'dashboard'
  | 'attendance'
  | 'hostel'
  | 'canteen'
  | 'notices'
  | 'chat'
  | 'documents'
  | 'mail'
  | 'management';

export function getEffectiveRole(user: UserProfile | null): EffectiveRole {
  if (!user) return 'student';
  if (user.role === 'management') return 'management';
  if (user.role === 'staff') return user.isWarden ? 'warden' : 'staff';
  return user.isHostel ? 'hostel_resident' : 'student';
}

export function getRoleLabel(user: UserProfile | null): string {
  const effective = getEffectiveRole(user);
  switch (effective) {
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

export function getAllowedScreens(user: UserProfile | null): NavScreen[] {
  const effective = getEffectiveRole(user);
  switch (effective) {
    case 'student':
      return ['dashboard', 'attendance', 'canteen', 'notices', 'chat', 'documents', 'mail'];
    case 'hostel_resident':
      return ['dashboard', 'attendance', 'hostel', 'canteen', 'notices', 'chat', 'documents', 'mail'];
    case 'staff':
      return ['dashboard', 'attendance', 'canteen', 'notices', 'chat', 'documents', 'mail'];
    case 'warden':
      return ['dashboard', 'attendance', 'hostel', 'canteen', 'notices', 'chat', 'documents', 'mail'];
    case 'management':
      return ['dashboard', 'management', 'canteen', 'notices', 'chat', 'documents', 'mail'];
  }
}
