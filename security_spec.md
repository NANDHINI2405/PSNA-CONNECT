# PSNA Connect Security Specification

## 1. Data Invariants
1. **Default Student Role on Registration**: New user profiles created by non-management users MUST have `role == 'student'`, `isHostel == false`, and `isWarden == false`. Only Management can alter `role`, `isHostel`, or `isWarden`.
2. **PII & Medical Isolation**: Personal details (`phone`, `email`, `guardianName`, `guardianPhone`, `address`) and medical records (`bloodGroup`, `medicalNotes`, `allergies`) reside in `userPrivate/{userId}` and are readable ONLY by the owner (`uid == userId`), a verified Warden, or Management. Roommates and general students can never read `userPrivate`.
3. **Immutable Ownership & Identity**: Author/owner UIDs (`studentUid`, `staffUid`, `userUid`, `authorUid`, `fromUid`, `senderUid`) must match `request.auth.uid` on creation and cannot be reassigned on update.
4. **Canteen Order Lifecycle**: Orders must start with `status == 'Placed'` and `userUid == request.auth.uid`. Only Staff or Management can advance order status (`Placed -> Preparing -> Ready -> Collected`).
5. **Hostel Room & Menu Authority**: Only Wardens or Management can edit `hostelRooms` allotments, `hostelMenus`, or save `hostelAttendanceLogs`. Residents may update only their own `hostelStatus` (`In` / `Out` / `Leave`).
6. **Master Gate on Chat**: Messages inside `/chatThreads/{threadId}/messages/{messageId}` verify parent thread existence and membership/audience constraints.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Self-Promotion on Signup**: User creates `/users/{uid}` with `role: "management"`, `isWarden: true`.
2. **Role Escalation Update**: Student updates `/users/{uid}` changing `isHostel: true` or `role: "staff"`.
3. **Shadow Field Injection**: User writes `/notices/{id}` with valid fields plus ghost field `approvedOverride: true`.
4. **Cross-Resident PII Snooping**: Hostel resident A calls `get(/userPrivate/{residentB})`.
5. **Resident Medical Tampering**: Resident A attempts to overwrite `medicalNotes` in `/userPrivate/{residentB}`.
6. **Attendance Forgery**: Student creates `/attendanceRecords/{id}` with `studentUid` set to another student's UID.
7. **Spoofed Staff QR Session**: Student attempts to create `/attendanceSessions/{id}` with `active: true`.
8. **Hostel Menu Sabotage**: Student creates or updates `/hostelMenus/Monday` setting `breakfastReady: true`.
9. **Canteen Order Status Skipping**: Student creates `/canteenOrders/{id}` directly with `status: "Ready"`.
10. **Canteen Order Hijack**: Student updates another user's `/canteenOrders/{id}` to `status: "Collected"`.
11. **Oversized ID Poisoning**: User attempts `create` at `/notices/` + 500-character document ID.
12. **Chat Sender Spoofing**: User posts to `/chatThreads/hostel-main/messages/{id}` with `senderUid` set to the Warden's UID.
