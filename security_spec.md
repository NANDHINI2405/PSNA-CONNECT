# PSNA Connect Security Specification

## 1. Data Invariants
1. **Default Student Role on Registration**: New user profiles created by non-management users MUST have `role == 'student'`, `isHostel == false`, and `isWarden == false`. Only Management can alter `role`, `isHostel`, or `isWarden`.
2. **Gender-Scoped Boys & Girls Hostels**:
   - `Girls Hostel` (`Mullai Girls Hostel`) is strictly restricted to `Girl` residents (`gender == 'Girl'`, `hostelType == 'Girls Hostel'`) and managed by a `Girl` Warden (`role == 'staff'`, `isWarden == true`, `hostelType == 'Girls Hostel'`).
   - `Boys Hostel` (`Kurinji Boys Hostel`) is strictly restricted to `Boy` residents (`gender == 'Boy'`, `hostelType == 'Boys Hostel'`) and managed by a `Boy` Warden (`role == 'staff'`, `isWarden == true`, `hostelType == 'Boys Hostel'`).
   - Cross-wing room creation, room allotment, hostel attendance marking, hostel chat reading/posting, and PII access by a Warden from the opposite wing are strictly denied. Management retains oversight across both wings.
3. **PII & Medical Isolation**: Personal details (`phone`, `email`, `guardianName`, `guardianPhone`, `address`) and medical records (`bloodGroup`, `medicalNotes`, `allergies`) reside in `userPrivate/{userId}` and are readable ONLY by the owner (`uid == userId`), a verified Warden of the same `hostelType` (for hostel residents only), or Management. Roommates and general students can never read `userPrivate`.
4. **Immutable Ownership & Identity**: Author/owner UIDs (`studentUid`, `staffUid`, `userUid`, `authorUid`, `fromUid`, `senderUid`) must match `request.auth.uid` on creation and cannot be reassigned on update.
5. **Canteen Order Lifecycle**: Orders must start with `status == 'Placed'` and `userUid == request.auth.uid`. Only Staff or Management can advance order status (`Placed -> Preparing -> Ready -> Collected`).
6. **Hostel Room & Menu Authority**: Only Wardens (for their own `hostelType`) or Management can edit `hostelRooms` allotments or save `hostelAttendanceLogs`. Only Wardens or Management can update `hostelMenus`. Residents may update only their own `hostelStatus` (`In` / `Out` / `Leave`).
7. **Master Gate on Chat**: Messages inside `/chatThreads/{threadId}/messages/{messageId}` verify parent thread existence, `hostelType` match for hostel groups, and participant membership for DMs.
8. **Class Timetable Governance**: Signed-in campus users may read `/timetableSessions/{sessionId}`; only Management or Staff (scoped to their own `staffUid`) can create, update, or delete class timetable periods.

## 2. Adversarial Payloads (Expected: PERMISSION_DENIED)
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
12. **Chat Sender Spoofing**: User posts to `/chatThreads/hostel-girls/messages/{id}` with `senderUid` set to the Warden's UID.
13. **Cross-Wing Room Allotment**: Boys Hostel Warden attempts to allot a room inside `/hostelRooms/room-m101` (`Girls Hostel`) or update a Girl resident's `/users/{uid}`.
14. **Cross-Wing PII Access**: Boys Hostel Warden attempts `get(/userPrivate/{girlResidentUid})` or `list` where `hostelType == 'Girls Hostel'`.
15. **Cross-Wing Hostel Chat**: Boy resident attempts to read or post in `/chatThreads/hostel-girls`.
16. **Gender-Mismatched Hostel Profile**: Creating/updating a `UserProfile` with `gender: 'Boy'`, `isHostel: true`, `hostelType: 'Girls Hostel'`.
17. **Student Timetable Tampering**: Student creates, updates, or deletes a period inside `/timetableSessions/{sessionId}`.
18. **Cross-Staff Timetable Hijack**: Staff A updates or deletes a `/timetableSessions/{sessionId}` owned by Staff B.
