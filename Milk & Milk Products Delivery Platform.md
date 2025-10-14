
---

```
┌───────────────────────────────────────────────────────────────┐
│                        USER ACTIONS                            │
└───────────────────────────────────────────────────────────────┘
                │
                │ Web/Mobile App
                │ Actions:
                │ - Register / Login
                │ - Update Profile
                │ - Browse Milk Products
                │ - Add to Cart
                │ - Place Order / Subscribe
                │ - Track Order
                ▼
┌───────────────────────────────────────────────────────────────┐
│                  API GATEWAY (HTTP Endpoints)                 │
│ POST /user/register, POST /user/login,                         │
│ GET /user/profile, POST /cart/add, GET /cart/view,            │
│ POST /order/create, POST /order/subscribe, GET /order/track,  │
│ POST /payment/pay                                              │
└───────────────────────────────────────────────────────────────┘
                │
───────────────────────────────────────────────────────────────
USER LAMBDA (Node.js Modular)
───────────────────────────────────────────────────────────────
┌───────────────────────────────────────────────────────────────┐
│ handlers/userHandler.js       # Lambda entry point             │
│ routes/userRoutes.js          # Maps HTTP methods to controllers│
│ controllers/userController.js # Business logic (register/login)│
│ models/User.js                # Dynamoose ORM Model            │
│ utils/response.js             # HTTP helpers                   │
└───────────────────────────────────────────────────────────────┘
                │
                │ Example Request (register):
                │ { "userId":"U101", "name":"Jimmy", "email":"jimmy@example.com","password":"test123" }
                │ Response:
                │ { "message":"User registered successfully", "userId":"U101" }
                ▼
┌───────────────────────────────────────────────────────────────┐
│                  DYNAMODB USERS TABLE                          │
│ userId (PK), name, email, passwordHash, address, phone, createdAt │
└───────────────────────────────────────────────────────────────┘
                │
───────────────────────────────────────────────────────────────
Async Triggers after Registration/Login
───────────────────────────────────────────────────────────────
                │
                │ 1️⃣ Analytics Lambda (async via SQS)
                │ Event Payload:
                │ { "eventType":"USER_REGISTERED", "userId":"U101", "timestamp":"2025-10-14T10:00:00Z" }
                ▼
┌───────────────────────────────────────────────────────────────┐
│                 ANALYTICS LAMBDA                               │
│ logEvent(), generateReport()                                    │
└───────────────────────────────────────────────────────────────┘
                │
                │ 2️⃣ Notification Lambda (async via SNS/EventBridge)
                │ Event Payload:
                │ { "userId":"U101", "type":"WELCOME_EMAIL", "message":"Welcome Jimmy!" }
                ▼
┌───────────────────────────────────────────────────────────────┐
│                NOTIFICATION LAMBDA                              │
│ sendEmail(), sendSMS()                                          │
└───────────────────────────────────────────────────────────────┘

───────────────────────────────────────────────────────────────
PRODUCT BROWSING & CART
───────────────────────────────────────────────────────────────
                │
                │ 3️⃣ Product Lambda (sync)
                │ Request: { "category":"Milk", "filters":{} }
                │ Response: [ { "productId":"P101","name":"Cow Milk","price":50,"stock":100 } ]
                ▼
┌───────────────────────────────────────────────────────────────┐
│                 PRODUCT LAMBDA                                 │
│ listProducts(), getProductDetails()                             │
│ DynamoDB Products Table: productId, name, price, stock, category │
└───────────────────────────────────────────────────────────────┘
                │
                │ 4️⃣ Cart Lambda (sync)
                │ Request Payload: { "userId":"U101", "productId":"P101", "qty":2 }
                │ Response: { "cartId":"C101", "items":[{"productId":"P101","qty":2}] }
                ▼
┌───────────────────────────────────────────────────────────────┐
│                   CART LAMBDA                                   │
│ addToCart(), getCart()                                          │
│ DynamoDB Table: Carts: cartId, userId, items[], totalAmount    │
└───────────────────────────────────────────────────────────────┘

───────────────────────────────────────────────────────────────
ORDER PLACEMENT & SUBSCRIPTION
───────────────────────────────────────────────────────────────
                │
                │ 5️⃣ Order Lambda (sync via SDK)
                │ Request Payload:
                │ { "userId":"U101", "cartItems":[{"productId":"P101","qty":2}], "totalAmount":100, "deliverySlot":"2025-10-15T07:00:00Z" }
                │ Response:
                │ { "orderId":"O101", "status":"CREATED" }
                ▼
┌───────────────────────────────────────────────────────────────┐
│                   ORDER LAMBDA                                  │
│ createOrder(), validateOrder(), subscribeOrder()               │
│ DynamoDB Orders Table:                                           │
│ orderId (PK), userId, items[], amount, deliverySlot, status     │
│ Possible Status: CREATED, CONFIRMED, PACKED, DISPATCHED, DELIVERED, CANCELLED │
└───────────────────────────────────────────────────────────────┘
                │
                │ 6️⃣ Payment Lambda (sync/async)
                │ Request Payload: { "orderId":"O101", "amount":100, "paymentMethod":"CARD" }
                │ Response: { "paymentId":"P1001", "status":"SUCCESS" }
                ▼
┌───────────────────────────────────────────────────────────────┐
│                   PAYMENT LAMBDA                                │
│ processPayment(), paymentWebhook()                               │
│ DynamoDB Payments Table: paymentId, orderId, amount, status      │
│ Payment Status: PENDING, SUCCESS, FAILED                         │
└───────────────────────────────────────────────────────────────┘
                │
                │ 7️⃣ Notification Lambda (async)
                │ Event Payload: { "userId":"U101", "type":"ORDER_CONFIRMED", "message":"Order O101 confirmed" }
                ▼
┌───────────────────────────────────────────────────────────────┐
│                NOTIFICATION LAMBDA                               │
│ sendEmail(), sendSMS()                                           │
└───────────────────────────────────────────────────────────────┘
                │
                │ 8️⃣ Analytics Lambda (async)
                │ Event Payload: { "eventType":"ORDER_PLACED", "userId":"U101", "orderId":"O101" }
                ▼
┌───────────────────────────────────────────────────────────────┐
│                  ANALYTICS LAMBDA                                │
│ logEvent(), generateReport()                                      │
└───────────────────────────────────────────────────────────────┘

───────────────────────────────────────────────────────────────
DELIVERY & TRACKING
───────────────────────────────────────────────────────────────
                │
                │ 9️⃣ Delivery Lambda (sync/async)
                │ Request Payload: { "orderId":"O101", "deliverySlot":"2025-10-15T07:00:00Z", "address":"123 Main St" }
                │ Response: { "deliveryId":"D101", "status":"ASSIGNED" }
                ▼
┌───────────────────────────────────────────────────────────────┐
│                   DELIVERY LAMBDA                                │
│ assignDelivery(), updateStatus(), trackOrder()                  │
│ DynamoDB Deliveries Table: deliveryId, orderId, status, courierId │
│ Delivery Status: ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, FAILED │
└───────────────────────────────────────────────────────────────┘
                │
                │ 🔔 Notification: DELIVERY_UPDATE
                │ 🔍 Analytics: DELIVERY_UPDATED
                ▼
┌───────────────────────────────────────────────────────────────┐
│       NOTIFICATION & ANALYTICS LAMBDAS                          │
│ sendEmail(), sendSMS(), logEvent()                               │
└───────────────────────────────────────────────────────────────┘

───────────────────────────────────────────────────────────────
ADMIN ACTIONS
───────────────────────────────────────────────────────────────
                │
                │ Admin App → API Gateway
                │ Endpoints: POST /product/add, PATCH /delivery/update
                ▼
┌───────────────────────────────────────────────────────────────┐
│                    ADMIN LAMBDA                                  │
│ addProduct(), updateProduct(), updateDelivery                   │
│ Tables: Products, Deliveries                                     │
└───────────────────────────────────────────────────────────────┘
                │
                │ Notifications & Analytics triggered as needed
                ▼
┌───────────────────────────────────────────────────────────────┐
│           NOTIFICATION & ANALYTICS LAMBDA                         │
│ sendEmail(), sendSMS(), logEvent()                                 │
└───────────────────────────────────────────────────────────────┘

───────────────────────────────────────────────────────────────
AWS SERVICES USED
───────────────────────────────────────────────────────────────
- API Gateway → HTTP endpoints for all users/admin actions
- Lambda Functions → User, Product, Cart, Order, Payment, Delivery, Notification, Analytics, Admin
- DynamoDB Tables → Users, Products, Carts, Orders, Payments, Deliveries
- SQS → Async Analytics & Logging
- SNS / EventBridge → Notifications (Email/SMS) async
- CloudWatch Logs → Lambda logs
- Cognito / IAM → Auth & permission management
- Optional: S3 → Reports, invoices
- Optional: SES → Email
- Optional: Pinpoint → SMS
```
---

### **1️⃣ API Gateway**

* **Where:** Front of all Lambdas; handles HTTP requests from Web/Mobile apps.
* **How:** Receives REST API calls → triggers corresponding Lambda.
* **Why:** Provides a scalable, secure HTTP endpoint for your users/admins.
* **What:** Endpoints like `/user/register`, `/order/create`, `/payment/pay`.

---

### **2️⃣ AWS Lambda Functions**

* **Where:** Core logic layer; each microservice has its own Lambda.
* **How:** Triggered via API Gateway (sync) or SNS/EventBridge/SQS (async).
* **Why:** Serverless, auto-scaling, pay-per-use compute for modular services.
* **What:**

  * **User Lambda** → register/login/update profile
  * **Product Lambda** → list/view products
  * **Cart Lambda** → add/view cart items
  * **Order Lambda** → create/validate/subscribe orders
  * **Payment Lambda** → process payments
  * **Delivery Lambda** → assign, track, update deliveries
  * **Notification Lambda** → email/SMS notifications
  * **Analytics Lambda** → event logging and reporting
  * **Admin Lambda** → product/delivery updates

---

### **3️⃣ DynamoDB**

* **Where:** All persistent storage for users, products, orders, etc.
* **How:** Accessed via Dynamoose ORM (Node.js) or AWS SDK.
* **Why:** Fully managed, highly scalable NoSQL DB for fast lookups.
* **What:**

| Table                | Key Fields          | Other Fields                                                                                                     | Notes                        |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Users                | userId (PK)         | name, email, passwordHash, phone, address, createdAt, updatedAt                                                  | Stores all registered users  |
| Products             | productId (PK)      | name, description, price, stock, category, createdAt, updatedAt                                                  | Stores milk & dairy products |
| Carts                | cartId (PK)         | userId, items[], totalAmount, createdAt, updatedAt                                                               | Tracks user shopping cart    |
| Orders               | orderId (PK)        | userId, cartItems[], totalAmount, deliverySlot, orderStatus, paymentStatus, subscriptionId, createdAt, updatedAt | Tracks each order            |
| Payments             | paymentId (PK)      | orderId, amount, paymentMethod, status, transactionId, createdAt, updatedAt                                      | Tracks payment history       |
| Deliveries           | deliveryId (PK)     | orderId, userId, deliverySlot, deliveryStatus, deliveryPersonId, trackingUrl, createdAt, updatedAt               | Tracks delivery lifecycle    |
| Subscriptions        | subscriptionId (PK) | userId, productId, qty, frequency, startDate, endDate, status, createdAt, updatedAt                              | Recurring orders             |
| Analytics (Optional) | eventId (PK)        | eventType, userId, orderId, timestamp, details                                                                   | Event-driven analytics log   |

---

### **4️⃣ SNS / EventBridge**

* **Where:** Asynchronous event handling between services.
* **How:** Lambdas publish events → subscribed Lambdas (Notification, Analytics) receive them.
* **Why:** Decouples services; ensures notifications and analytics do not block main workflows.
* **What:**

  * `USER_REGISTERED` → triggers welcome email
  * `ORDER_CONFIRMED` → triggers email/SMS
  * `DELIVERY_UPDATE` → triggers notifications
  * `PAYMENT_COMPLETED` → triggers notifications and analytics

---

### **5️⃣ SQS**

* **Where:** Queue for asynchronous processing of heavy workloads.
* **How:** Lambdas push messages to SQS → Analytics Lambda polls and processes events.
* **Why:** Handles spikes, ensures eventual processing, decouples services.
* **What:**

  * Queue messages for logging orders, payments, deliveries, subscriptions.

---

### **6️⃣ CloudWatch**

* **Where:** Across all Lambdas and AWS resources.
* **How:** Logs Lambda executions, monitors performance metrics, triggers alarms.
* **Why:** Observability, debugging, performance monitoring, alerts.
* **What:**

  * Lambda logs → API Gateway requests, errors
  * Metrics → execution duration, errors, throttles

---

### **7️⃣ Cognito / IAM**

* **Where:** Authentication & access control.
* **How:** Cognito handles user sign-up/sign-in; IAM roles define Lambda permissions.
* **Why:** Secure user management and service-to-service access.
* **What:**

  * Cognito → JWT token-based auth for API calls
  * IAM → Lambda permissions, SQS/SNS access

---

### **8️⃣ SES / Pinpoint (Optional)**

* **Where:** Notification Lambda integration.
* **How:** SES sends emails, Pinpoint sends SMS.
* **Why:** Communication with users.
* **What:**

  * WELCOME_EMAIL, ORDER_CONFIRMED, DELIVERY_UPDATE

---

### **9️⃣ S3 (Optional)**

* **Where:** Storage for invoices, reports, logs.
* **How:** Analytics Lambda or Payment Lambda writes reports to S3.
* **Why:** Centralized storage of documents & large logs.
* **What:**

  * PDF invoices
  * CSV/JSON analytics reports

---

### **10️⃣ AWS SDK Integration (Sync Calls)**

* **Where:** Lambda-to-Lambda communication.
* **How:** User Lambda calls Order Lambda → Payment Lambda via `AWS.Lambda.invoke()`.
* **Why:** Some flows need synchronous execution (e.g., payment before order confirmation).
* **What:**

  * User places order → triggers Order Lambda → triggers Payment Lambda → confirmation → Notification Lambda (async)

---

### **11️⃣ Status Flows**

**Order Status:**
`CREATED → CONFIRMED → PACKED → OUT_FOR_DELIVERY → DELIVERED`
`CANCELLED / RETURNED` at any stage

**Payment Status:**
`PENDING → SUCCESS / FAILED → REFUNDED`

**Delivery Status:**
`ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED`
`FAILED / CANCELLED`

**Subscription Status:**
`ACTIVE → PAUSED → CANCELLED`

---

### **12️⃣ Key Interactions / “Why & How”**

| Service           | Interacts With             | Purpose                             |
| ----------------- | -------------------------- | ----------------------------------- |
| API Gateway       | User/Admin App → Lambdas   | HTTP request handling               |
| Lambda            | DynamoDB, SQS, SNS         | Execute business logic & store data |
| DynamoDB          | Lambdas                    | Persistent storage for all entities |
| SNS / EventBridge | Notification Lambda        | Async notification delivery         |
| SQS               | Analytics Lambda           | Async logging & processing          |
| CloudWatch        | All Lambdas                | Observability & monitoring          |
| Cognito / IAM     | API Gateway & Lambdas      | Authentication & authorization      |
| SES / Pinpoint    | Notification Lambda        | Email/SMS delivery                  |
| S3                | Analytics / Payment Lambda | Reports & invoices                  |
| Lambda SDK        | Lambda → Lambda            | Synchronous service communication   |

---
Perfect! Let’s create the **Ultimate Blueprint for your Milk Delivery System** as a **full terminal-style diagram** combining:

* **All Lambdas with folder structure** (handlers/routes/controllers/models/utils)
* **Sync vs async triggers** (color-coded)
* **Database tables with all fields & statuses**
* **AWS services at each stage with arrows & payloads**
* **Where, How, Why, What** for each component

Here’s the detailed visual blueprint:

```
───────────────────────────────────────────────────────────────
                          USER ACTIONS
───────────────────────────────────────────────────────────────
Web/Mobile App
Actions:
- Register / Login
- Update Profile
- Browse Milk Products
- Add to Cart / Place Order
- Subscribe for Daily Milk
- Track Order / Subscription
- View Payment History
Triggers → API Gateway
───────────────────────────────────────────────────────────────
API GATEWAY (HTTP Endpoints)
───────────────────────────────────────────────────────────────
POST /user/register, POST /user/login
GET /user/profile
POST /cart/add, GET /cart
POST /order/create, POST /order/subscribe, GET /order/track
POST /payment/pay, GET /payment/history
→ Invokes respective Lambdas
───────────────────────────────────────────────────────────────
USER LAMBDA (Node.js Modular)
───────────────────────────────────────────────────────────────
Folder Structure:
handlers/userHandler.js → Entry Point
routes/userRoutes.js → Map endpoints to controllers
controllers/userController.js → Business Logic
models/User.js → Dynamoose ORM
utils/response.js → HTTP helpers

Actions:
- registerUser(event)
- loginUser(event)
- getProfile(event)
→ Calls DynamoDB Users table

Payload Example (register):
Request: { userId, name, email, password }
Response: { message: "User registered successfully", userId }

Async Triggers:
1️⃣ Analytics Lambda (SQS) → { eventType: "USER_REGISTERED", userId, timestamp }
2️⃣ Notification Lambda (SNS/EventBridge) → { userId, type: "WELCOME_EMAIL", message }
───────────────────────────────────────────────────────────────
DYNAMODB TABLES
───────────────────────────────────────────────────────────────
USERS TABLE
userId (PK), name, email, passwordHash, phone, address, createdAt, updatedAt

PRODUCTS TABLE
productId (PK), name, description, price, stock, category, createdAt, updatedAt

CARTS TABLE
cartId (PK), userId (FK), items[{productId, qty, price}], totalAmount, createdAt, updatedAt

ORDERS TABLE
orderId (PK), userId (FK), cartItems[{productId, qty, price}], totalAmount, deliverySlot,
orderStatus(CREATED→CONFIRMED→PACKED→OUT_FOR_DELIVERY→DELIVERED→CANCELLED→RETURNED),
paymentStatus(PENDING→SUCCESS/FAILED→REFUNDED), subscriptionId, createdAt, updatedAt

PAYMENTS TABLE
paymentId (PK), orderId (FK), amount, paymentMethod(CARD,UPI,CASH),
status(PENDING→SUCCESS/FAILED→REFUNDED), transactionId, createdAt, updatedAt

DELIVERIES TABLE
deliveryId (PK), orderId (FK), userId (FK), deliverySlot,
deliveryStatus(ASSIGNED→PICKED_UP→IN_TRANSIT→DELIVERED→FAILED/CANCELLED),
deliveryPersonId(FK, optional), trackingUrl(optional), createdAt, updatedAt

SUBSCRIPTIONS TABLE
subscriptionId (PK), userId (FK), productId, qty, frequency(DAILY/WEEKLY),
startDate, endDate, status(ACTIVE/PAUSED/CANCELLED), createdAt, updatedAt
───────────────────────────────────────────────────────────────
USER BROWSING & CART
───────────────────────────────────────────────────────────────
Product Lambda (sync)
Request: { category, filters }
Response: [{ productId, name, price, stock }]
→ Stores in PRODUCTS table

Cart Lambda (sync)
Request: { userId, productId, qty }
Response: { cartId, items[...] }
→ Stores in CARTS table
───────────────────────────────────────────────────────────────
ORDER & PAYMENT FLOW
───────────────────────────────────────────────────────────────
Order Lambda (sync)
Request: { userId, cartItems, totalAmount, deliverySlot }
Response: { orderId, status: "CREATED" }
→ Stores in ORDERS table

Payment Lambda (sync/async)
Request: { orderId, amount, paymentMethod }
Response: { paymentId, status: "SUCCESS/FAILED" }
→ Stores in PAYMENTS table

Async triggers:
- Notification Lambda → { userId, type: "ORDER_CONFIRMED", message }
- Analytics Lambda → { eventType: "ORDER_PLACED", userId, orderId }
───────────────────────────────────────────────────────────────
DELIVERY & TRACKING
───────────────────────────────────────────────────────────────
Delivery Lambda (sync/async)
Request: { orderId, deliverySlot, address }
Response: { deliveryId, status: "ASSIGNED" }
→ Stores in DELIVERIES table

Notifications:
- Notification Lambda → { userId, type: "DELIVERY_UPDATE", message }
- Analytics Lambda → { eventType: "DELIVERY_UPDATED", userId, orderId }
───────────────────────────────────────────────────────────────
SUBSCRIPTIONS
───────────────────────────────────────────────────────────────
Subscription Lambda / Order Lambda
- Recurring Milk orders
- Frequency: Daily/Weekly
- Async triggers:
  * Analytics → SUBSCRIPTION_CREATED
  * Notification → SUBSCRIPTION_ACTIVE/PAUSED/CANCELLED
───────────────────────────────────────────────────────────────
ADMIN LAMBDA
───────────────────────────────────────────────────────────────
Endpoints: POST /product/add, PATCH /product/update, PATCH /delivery/update
Updates:
- PRODUCTS table
- DELIVERIES table
- ORDERS table
Async triggers:
- Notification Lambda → Admin/Delivery updates
- Analytics Lambda → Admin actions
───────────────────────────────────────────────────────────────
AWS SERVICES INTEGRATION
───────────────────────────────────────────────────────────────
API Gateway → Frontend HTTP requests
Lambda → Microservices logic (User, Product, Cart, Order, Payment, Delivery, Notification, Analytics, Admin)
DynamoDB → Users, Products, Carts, Orders, Payments, Deliveries, Subscriptions
SQS → Async events (Analytics)
SNS / EventBridge → Async notifications (Email/SMS)
CloudWatch → Logging & monitoring
Cognito/IAM → Auth & permissions
SES / Pinpoint → Email/SMS
S3 → Reports & invoices
Lambda SDK → Sync calls between Lambdas (User→Order→Payment)
───────────────────────────────────────────────────────────────
STATUS FLOWS
───────────────────────────────────────────────────────────────
Order Status:
CREATED → CONFIRMED → PACKED → OUT_FOR_DELIVERY → DELIVERED
CANCELLED / RETURNED possible at multiple stages

Payment Status:
PENDING → SUCCESS / FAILED → REFUNDED

Delivery Status:
ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED → FAILED / CANCELLED
───────────────────────────────────────────────────────────────
```

---

