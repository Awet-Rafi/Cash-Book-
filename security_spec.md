# Security Specification - Firestore Rules

## 1. Data Invariants
- A user must have a `userProfile` that links them to a `businessId`.
- Access to business-specific data (`products`, `sales`, `expenses`, `customers`, `payments`, `cashTransactions`, `employees`) is strictly restricted to members of that business.
- Membership is defined by the `businessId` field in the document matching the `businessId` in the user's `userProfile`.
- A user can only manage (create/update) the `business` they own.
- Admins (`tekle.taf@gmail.com`, `awet16@gmail.com`) have full override access.
- Timestamps (`createdAt`, `updatedAt`, `timestamp`) must use `request.time`.

## 2. The "Dirty Dozen" Payloads

### P1: Shadow Field Injection (Integrity)
**Target:** `products` (create)
**Payload:** `{ "name": "Hack", "price": 10, "costPrice": 5, "stockQuantity": 100, "businessId": "BID_123", "isAdmin": true }`
**Expected:** `REJECTED` (Strict key count/schema)

### P2: Cross-Business Write (Relational)
**Target:** `sales` (create)
**Payload:** `{ "businessId": "OTHER_BIZ", "totalAmount": 100, ... }`
**Expected:** `REJECTED` (Business ID mismatch with user profile)

### P3: Unauthorized Field Modification (Identity)
**Target:** `sales` (update)
**Payload:** `{ "totalAmount": 0 }` (Attempting to zero out a sale)
**Expected:** `REJECTED` (Update actions must be whitelisted and totalAmount is typically immutable or admin-only)

### P4: Orphaned Write (Consistency)
**Target:** `products` (create)
**Payload:** `{ "name": "Ghost", ..., "businessId": "NON_EXISTENT" }`
**Expected:** `REJECTED` (Requires `exists(/databases/$(database)/documents/businesses/$(incoming().businessId))`)

### P5: Identity Spoofing (Identity)
**Target:** `userProfiles` (create)
**Payload:** `{ "uid": "OTHER_UID", "businessId": "BID_123" }`
**Expected:** `REJECTED` (UID must match `request.auth.uid`)

### P6: PII Leak (Privacy)
**Target:** `userProfiles` (list)
**Condition:** Authenticated user listing all profiles.
**Expected:** `REJECTED` (List queries must be secured by `resource.data.uid == request.auth.uid`)

### P7: ID Poisoning (Resource Exhaustion)
**Target:** `products` (create)
**Document ID:** A string > 1.5KB or with invalid characters.
**Expected:** `REJECTED` (via `isValidId()`)

### P8: Temporal Fraud (Integrity)
**Target:** `expenses` (create)
**Payload:** `{ "timestamp": "2099-01-01T00:00:00Z", ... }`
**Expected:** `REJECTED` (Must match `request.time`)

### P9: Privilege Escalation (RBAC)
**Target:** `businesses` (update)
**Payload:** `{ "ownerId": "MY_UID" }` on a business I don't own.
**Expected:** `REJECTED` (Only current `ownerId` can update)

### P10: Terminal State Reversion (Integrity)
**Target:** `sales` (update)
**Payload:** `{ "status": "pending" }` on a sale that is already `paid`.
**Expected:** `REJECTED` (Terminal states are locked)

### P11: Value Poisoning (Integrity)
**Target:** `products` (update)
**Payload:** `{ "price": "ten dollars" }` (Wrong type)
**Expected:** `REJECTED` (via `isValidProduct()`)

### P12: Resource Exhaustion (Denial of Wallet)
**Target:** `sales` (create)
**Payload:** `{ "items": [ ... 1000 items ... ] }`
**Expected:** `REJECTED` (Max array size check)

## 3. Test Runner Design
A `firestore.rules.test.ts` will be implemented using the `@firebase/rules-unit-testing` framework to verify these 12 scenarios.
