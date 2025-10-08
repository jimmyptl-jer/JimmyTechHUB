---

```
─────────────────────────────────────────────
  USER JOURNEY – FULLY DETAILED ARCHITECTURE
─────────────────────────────────────────────

Frontend / UI (Web/Mobile/Tablet)
    │
    │ API Calls (HTTPS) + JWT / Auth0 Tokens
    │
    ▼
API Gateway (REST)
    ├─ Routes: /user, /order, /product
    └─ Stage: dev / prod
    │
    ▼
─────────────────────────────────────────────
Step 1: User Identification
─────────────────────────────────────────────
User Service (Lambda: userHandler)
    ├─ Function: checkUserExists
    │   ├─ Input: {email/username}
    │   ├─ Output: {exists:true/false, userId, role}
    │   └─ Updates: lastActiveAt
    │
    ├─ Branch:
    │     ├─ Returning User → loginHandler
    │     │     ├─ Input: {email, password}
    │     │     ├─ Output: {token, userId, role}
    │     │     └─ Flags checked: isProfileComplete, lastActiveAt
    │     │
    │     └─ First-Time User → registerUser
    │           ├─ Input: {username,email,password,deviceInfo}
    │           ├─ Output: {userId, status:"created", role:"Customer"}
    │           ├─ Stores: IP, device/browser info, region
    │           └─ Flags: isProfileComplete = false
    │
    └─ Optional: addUserDetails (addresses, preferences, payment info)
           ├─ Input: {userId, addresses:[...], preferences:{...}}
           └─ Updates DynamoDB: Users.addresses, Users.preferences

─────────────────────────────────────────────
Step 2: Role-Based Access Control
─────────────────────────────────────────────
After login/registration → Check role in user record
    ├─ Customer → default path: place order
    ├─ Admin → extended path: manage users/products/orders
    └─ Manager → approve/reject orders, generate reports
    └─ Flags / Metadata:
         ├─ role
         ├─ profileCompletionPrompted
         └─ lastActiveAt

─────────────────────────────────────────────
Step 3: Pre-Order Checks
─────────────────────────────────────────────
Order Service (Lambda: orderHandler)
    ├─ preOrderCheck Lambda
    │   ├─ Check: isProfileComplete?
    │   │     ├─ If false → prompt user to add addresses/preferences
    │   │     └─ If true → proceed
    │   ├─ Check inventory availability (Inventory Lambda)
    │   └─ Flags Updated: preferredPaymentMethod, orderCount
    │
    └─ Branch: Multiple Cases
          ├─ First Order → triggers Step Function CheckoutOrchestrator
          ├─ Partial Items Available → Partial Fulfillment State
          ├─ Out-of-Stock → prompt alternative or abort

─────────────────────────────────────────────
Step 4: Checkout Orchestration (Step Function)
─────────────────────────────────────────────
CheckoutOrchestrator States:
    ├─ Validate Profile
    │     ├─ check isProfileComplete
    │     └─ pause workflow if incomplete
    │
    ├─ Validate Order
    │     ├─ Check inventory in DynamoDB: Orders & Inventory tables
    │     ├─ Flag low-stock or unavailable items
    │
    ├─ Process Payment (Payment Processor Lambda)
    │     ├─ Input: {orderId, userId, totalAmount, paymentMethod}
    │     ├─ Output: {status:Success/Fail, paymentId, fraudFlag}
    │     ├─ Branch: retry → max attempts → fail & notify
    │
    ├─ Update Order Status (OrderService Lambda)
    │     ├─ Success → Paid / Pending / Failed
    │     ├─ Update auditLogs: who, when, where
    │
    ├─ Update Inventory (Inventory Lambda)
    │     └─ Deduct stock, log inventory changes
    │
    ├─ Send Notifications (SendNotification Lambda → SNS)
    │     └─ Notify user via email/SMS/push
    │
    ├─ Analytics Tracking (AnalyticsProcessor Lambda)
    │     └─ Store event in S3 / Kinesis / Athena / QuickSight
    │
    └─ Audit / Metadata Logger Lambda
          └─ Track: user actions, role, device, IP, timestamps

─────────────────────────────────────────────
Step 5: Returning User Flow
─────────────────────────────────────────────
Returning User → Login → preOrderCheck → CheckoutOrchestrator
    ├─ Skip registration and enrichment
    ├─ Use saved addresses, payment info, preferences
    ├─ Quick order placement
    ├─ Flags Updated: lastActiveAt, orderCount
    ├─ Recommendations / Promotions triggered
    └─ Analytics & audit logs updated

─────────────────────────────────────────────
Step 6: Admin / Manager Flow
─────────────────────────────────────────────
Admin / Manager → UI / API → Lambda access
    ├─ Admin: CRUD Users, Products, Orders
    ├─ Manager: Approve/Reject Orders, Reports
    ├─ Audit Logs track actions with role metadata
    └─ Notifications & Analytics also role-tagged

─────────────────────────────────────────────
Step 7: Observability & Flags
─────────────────────────────────────────────
| Flag / Field                   | Source Lambda               | Purpose                                   |
|--------------------------------|----------------------------|-------------------------------------------|
| isProfileComplete              | userHandler / addUserDetails | Tracks if profile enrichment is done      |
| profileCompletionPrompted      | frontend / userHandler      | Prevent repeated prompts                  |
| deviceInfo                     | userHandler                 | Browser / OS / IP capture                 |
| lastActiveAt                    | userHandler / analytics    | Tracks last session                       |
| preferredPaymentMethod         | orderHandler                | Autofill during checkout                   |
| orderCount                     | orderHandler                | Number of successful orders               |
| auditLogs                       | All Lambdas                 | Who / What / When / Where                 |
| fraudFlag                       | paymentProcessor            | Detect suspicious orders                  |
| role                            | userHandler / auth          | Enforce role-based access                 |

─────────────────────────────────────────────
Step 8: Async & Edge Cases
─────────────────────────────────────────────
1. Partial Order Fulfillment
2. Out-of-Stock Items
3. Payment Failure & Retry
4. First-Time User Profile Incomplete
5. Role-Based Access Violation
6. Notifications & Analytics async events
7. Audit Logging for all actions
8. Multi-Address Selection & Defaults
9. Recommendations / Promotions based on past behavior
10. Device / IP / Region logging

─────────────────────────────────────────────
Step 9: Tables & Storage
─────────────────────────────────────────────
DynamoDB Users
    ├─ userId, email, phone
    ├─ addresses:[{label, line1,line2,city,state,zip,country}]
    ├─ preferences:{deliveryTime, paymentMethod, newsletterOptIn}
    ├─ deviceInfo, region
    ├─ isProfileComplete, role
    └─ createdAt, updatedAt

DynamoDB Products
    ├─ productId, name, description, price
    ├─ createdBy, updatedBy
    ├─ auditLogs
    └─ stockCount

DynamoDB Orders
    ├─ orderId, userId
    ├─ items:[{productId, quantity, price}]
    ├─ status, paymentInfo
    ├─ timestamps
    ├─ auditLogs
    └─ flags: partialFulfillment, fraudFlag

SNS Topics
    ├─ orderNotifications
    └─ userNotifications

S3 / Kinesis / Athena / QuickSight
    ├─ Analytics storage
    └─ Event-driven insights

─────────────────────────────────────────────
Step 10: Observability & UX
─────────────────────────────────────────────
- CloudWatch + X-Ray traces all Lambdas
- Step Function handles retries, branching, async
- Progressive profile enrichment reduces friction
- Role-based flow ensures correct UI/UX per user type
- Audit logs + analytics enable compliance and personalization
- Flags guide frontend logic for minimal prompts
- Recommendations, default addresses/payment improve UX

─────────────────────────────────────────────
```

---

✅ **This fully captures:**

* First-time vs returning user branching
* Role-based flow (Customer / Admin / Manager)
* Step Function orchestration with all async Lambdas
* Audit logging & flags for profile completion, fraud detection, device info
* Detailed DynamoDB schema
* Notification & analytics pipelines
* Observability & UX considerations

---
