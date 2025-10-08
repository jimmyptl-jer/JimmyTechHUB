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

**This fully captures:**

* First-time vs returning user branching
* Role-based flow (Customer / Admin / Manager)
* Step Function orchestration with all async Lambdas
* Audit logging & flags for profile completion, fraud detection, device info
* Detailed DynamoDB schema
* Notification & analytics pipelines
* Observability & UX considerations
Perfect! We can **expand this architecture further** with more granular detail, capturing additional **flags, error handling, async flows, branching for roles, retry logic, analytics enrichment, multi-device tracking, partial fulfillment**, and integrate all this in a **low-level terminal-block diagram** for implementation. Here's an extended version:

---

## FULLY EXPANDED USER & ORDER ARCHITECTURE

─────────────────────────────────────────────

### FRONTEND / UI (Web/Mobile/Tablet)

─────────────────────────────────────────────

* Handles:

  * Registration & Login (first-time / returning users)
  * Progressive profile enrichment
  * Multi-address selection & default preference
  * Quick checkout for returning users
  * Role-specific dashboards (Customer/Admin/Manager)
* Flags / Metadata captured on frontend:

  * `profileCompletionPrompted` → prevent repeated modals
  * `preferredPaymentMethod` → auto-filled in checkout
  * `lastSelectedAddress` → UI default
* Async event triggers:

  * Notify Step Function on first order start
  * Track button clicks & promotions for analytics

─────────────────────────────────────────────

### API GATEWAY (REST)

─────────────────────────────────────────────

* Routes: `/user`, `/order`, `/product`
* JWT / Auth0 authentication
* Stage-based routing: dev / prod
* Rate-limiting & throttling
* Tracing to CloudWatch/X-Ray

─────────────────────────────────────────────

### STEP 1: User Identification & Registration

─────────────────────────────────────────────
**User Service (Lambda: userHandler)**

* `checkUserExists` → returns `{exists:true/false, userId, role}`

  * Updates: `lastActiveAt`
* **Branching:**

  * Returning User → `loginHandler`

    * Flags checked: `isProfileComplete`, `lastActiveAt`, `deviceInfo`
    * Multi-device detection → trigger MFA if unusual IP
  * First-Time User → `registerUser`

    * Store IP, device/browser info, region
    * Flags: `isProfileComplete = false`
  * Optional: `addUserDetails` → addresses, preferences, payment info

    * Updates DynamoDB `Users.addresses` & `Users.preferences`

**Edge Cases / Enhancements:**

* Detect suspicious login → trigger CAPTCHA / MFA
* Track multiple devices → store in `deviceInfo` array
* Role mismatch → deny access

─────────────────────────────────────────────

### STEP 2: Role-Based Flow

─────────────────────────────────────────────

* Roles: Customer, Admin, Manager, Guest
* **Routing:**

  * Customer → default checkout path
  * Admin → CRUD Users/Products/Orders
  * Manager → Approve/Reject Orders, Generate Reports
* Flags / Metadata updated:

  * `role`, `profileCompletionPrompted`, `lastActiveAt`, `accessLevel`
* Async triggers:

  * Audit log events → AnalyticsProcessor Lambda

─────────────────────────────────────────────

### STEP 3: Pre-Order Checks

─────────────────────────────────────────────

* **Lambda: orderHandler → preOrderCheck**

  * Check `isProfileComplete` → prompt enrichment if incomplete
  * Inventory check (Inventory Lambda)
  * Update flags: `preferredPaymentMethod`, `orderCount`
* **Branching / Edge Cases:**

  * First Order → triggers Step Function CheckoutOrchestrator
  * Partial Items Available → Partial Fulfillment State
  * Out-of-Stock → suggest alternative / abort
  * Promo codes → validate asynchronously

─────────────────────────────────────────────

### STEP 4: Checkout Orchestration (Step Function)

─────────────────────────────────────────────
**States & Lambdas:**

1. **Validate Profile** → pause if incomplete
2. **Validate Order** → inventory + low-stock flags
3. **Process Payment (Payment Processor Lambda)**

   * Input: `{userId, orderId, totalAmount, paymentMethod}`
   * Output: `{status:Success/Fail, paymentId, fraudFlag}`
   * Retry logic + max attempts + fail notifications
4. **Update Order Status (OrderService Lambda)** → Paid / Pending / Failed
5. **Update Inventory (Inventory Lambda)** → deduct stock, log inventory changes
6. **Send Notifications (SendNotification Lambda → SNS)** → email/SMS/push
7. **Analytics Processor Lambda** → S3/Kinesis/Athena/QuickSight
8. **Audit Logger Lambda** → who/what/when/where + role

**Additional Edge Cases:**

* Fraud detection → hold order, notify admin
* Partial fulfillment → split order status
* Payment retry / fail → trigger frontend alert
* Recommendations & promotions → async triggers

─────────────────────────────────────────────

### STEP 5: Returning User Flow

─────────────────────────────────────────────

* Skip registration → use saved addresses, payment methods
* Quick checkout → flags updated: `lastActiveAt`, `orderCount`
* Recommendations → triggered via AnalyticsProcessor Lambda
* Async notifications → order confirmation + promotions

─────────────────────────────────────────────

### STEP 6: Admin / Manager Flow

─────────────────────────────────────────────

* Admin → CRUD Users/Products/Orders
* Manager → Approve/Reject Orders, Reports
* Audit logs → include role + action context
* Notifications → role-tagged
* Async triggers → analytics events

─────────────────────────────────────────────

### STEP 7: Tables & Storage (Expanded)

─────────────────────────────────────────────
**Users Table**

* `userId`, `email`, `phone`
* `addresses:[{label,line1,line2,city,state,zip,country}]`
* `preferences:{deliveryTime, paymentMethod, newsletterOptIn}`
* `deviceInfo:[{OS,browser,IP,lastActive}]`
* `isProfileComplete`, `profileCompletionPrompted`, `role`
* `createdAt`, `updatedAt`

**Products Table**

* `productId`, `name`, `description`, `price`
* `stockCount`, `auditLogs`, `createdBy/updatedBy`

**Orders Table**

* `orderId`, `userId`
* `items:[{productId, quantity, price}]`
* `status`, `paymentInfo`
* Flags: `partialFulfillment`, `fraudFlag`
* `timestamps`, `auditLogs`

**SNS Topics** → `orderNotifications`, `userNotifications`

**Analytics Storage** → S3/Kinesis/Athena/QuickSight

─────────────────────────────────────────────

### STEP 8: Observability & UX

─────────────────────────────────────────────

* CloudWatch + X-Ray → trace all Lambdas
* Step Function → retries, branching, async
* Progressive profile enrichment → reduced friction
* Role-based flow → correct UI/UX per user type
* Audit logs + analytics → compliance & personalization
* Flags → guide frontend logic & auto-fill
* Recommendations, default addresses/payment → improved UX

─────────────────────────────────────────────

### STEP 9: Edge Cases & Async Events

─────────────────────────────────────────────

* Partial Order Fulfillment
* Out-of-Stock Items
* Payment Failure & Retry
* First-Time User Profile Incomplete
* Role-Based Access Violation
* Notifications & Analytics async events
* Audit Logging for all actions
* Multi-Address Selection & Defaults
* Recommendations / Promotions based on past behavior
* Device / IP / Region logging
* Fraud detection & alerts
* Promo codes / Discounts validation
* Multi-currency / multi-region pricing

---

## TERMINAL-BLOCK DIAGRAM (HORIZONTAL + VERTICAL MIX)

```text
                ┌───────────────┐
                │ Frontend / UI │
                │ Web/Mobile    │
                └───────┬───────┘
                        │ API Calls + JWT/Auth0
                        ▼
                ┌───────────────┐
                │ API Gateway   │
                │ /user,/order  │
                └───────┬───────┘
        ┌───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ UserService  │ │ ProductServ  │ │ OrderService │ │ Inventory    │
│ Lambda       │ │ Lambda       │ │ Lambda       │ │ Lambda       │
├──────────────┤ ├──────────────┤ ├──────────────┤ ├──────────────┤
│ checkUserEx. │ │ getProducts  │ │ preOrderCheck│ │ stockCheck   │
│ registerUser │ │ createProd.  │ │ createOrder  │ │ updateStock  │
│ loginHandler │ │ updateProd.  │ │ validateOrder│ │ auditLogs    │
│ addUserDet.  │ │ deleteProd.  │ │ updateFlags  │ │              │
└─────┬────────┘ └─────┬────────┘ └─────┬────────┘ └─────┬────────┘
      │                │                │                │
      ▼                ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ DynamoDB     │ │ DynamoDB     │ │ DynamoDB     │ │ SNS Topics   │
│ Users        │ │ Products     │ │ Orders       │ │ order/user  │
└──────────────┘ └──────────────┘ └─────┬────────┘ └──────────────┘
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │ StepFunction        │
                                │ CheckoutOrchestrator│
                                ├─────────────────────┤
                                │ ValidateProfile     │
                                │ ValidateOrder       │
```


```
                            │ ProcessPayment      │
                            │ UpdateOrderStatus   │
                            │ UpdateInventory     │
                            │ SendNotifications   │
                            │ AnalyticsProcessor  │
                            │ AuditLogger         │
                            └─────────┬───────────┘
                                      │
      ┌───────────────────────┬───────┴───────────┬───────────────────────┐
      ▼                       ▼                   ▼                       ▼
```

┌──────────────┐       ┌──────────────┐     ┌──────────────┐        ┌──────────────┐
│ SNS: Orders  │       │ SNS: Users   │     │ S3/Kinesis  │        │ CloudWatch   │
│ Notifications│       │ Notifications│     │ Analytics   │        │ + X-Ray      │
└──────────────┘       └──────────────┘     └──────────────┘        └──────────────┘

```

**Notes:**  
- Vertical arrows → synchronous calls  
- Horizontal arrows → async events / notifications / analytics  
- StepFunction handles branching, retries, and async tasks  
- All Lambdas log to CloudWatch/X-Ray  
- Flags guide both backend & frontend logic  

---
```

