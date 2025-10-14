**blueprint before you build it on AWS Console**.

---

# 🧩 SERVERLESS E-COMMERCE DATA FLOW (DETAILED)

```
┌──────────────────────────────┐
│        Users / Clients       │
│ (Web App / Mobile / Admin)   │
└───────────────┬──────────────┘
                │
                ▼  (HTTP via API Gateway)
        ┌────────────────────┐
        │   API GATEWAY      │
        │ (REST Endpoints)   │
        └────────┬───────────┘
                 │
───────────────────────────────────────────────
                 │
        ┌────────▼────────┐
        │ USER-SERVICE    │
        │ Lambda          │
        │ (register, login, get-profile)
        └────────┬────────┘
                 │
                 ▼
          ┌─────────────┐
          │ Users Table │
          └─────────────┘
```

### 🔹 register Lambda

**Input (from API Gateway):**

```json
{ "email": "jimmy@example.com", "password": "12345", "name": "Jimmy" }
```

**Process:**

* Validate input
* Hash password
* Create user record in `Users` table
  → `userId`, `email`, `passwordHash`, `createdAt`
* Optionally call **SNS** (Welcome email)

**Output (Response to Client):**

```json
{ "message": "User registered successfully", "userId": "USER#123" }
```

**Consumes:** API Gateway event
**Writes to:** DynamoDB (Users Table)
**Calls:** SNS (optional for welcome notification)

---

### 🔹 login Lambda

**Input:**

```json
{ "email": "jimmy@example.com", "password": "12345" }
```

**Process:**

* Fetch item from `Users` where `email = ?`
* Verify password hash
* Generate JWT token

**Output:**

```json
{ "token": "eyJhbGci...", "userId": "USER#123" }
```

**Reads:** DynamoDB (Users Table)
**No external calls**

---

### 🔹 get-profile Lambda

**Input (JWT-based userId):**

```json
{ "userId": "USER#123" }
```

**Process:**

* Retrieve user details by `userId`

**Output:**

```json
{
  "userId": "USER#123",
  "email": "jimmy@example.com",
  "name": "Jimmy Patel"
}
```

**Reads:** DynamoDB (Users Table)

---

```
───────────────────────────────────────────────
                 │
        ┌────────▼────────┐
        │ PRODUCT-SERVICE │
        │ Lambda          │
        │ (create, get products)
        └────────┬────────┘
                 │
                 ▼
          ┌───────────────┐
          │ Products Table│
          └───────────────┘
```

### 🔹 create-product Lambda (Admin only)

**Input:**

```json
{
  "name": "Protein Bowl",
  "price": 12.99,
  "description": "High-protein meal",
  "stock": 50
}
```

**Process:**

* Validate admin access (auth layer)
* Generate `productId`
* Write to `Products` + `Inventory`

**Output:**

```json
{ "message": "Product created", "productId": "PROD#001" }
```

**Writes:** DynamoDB (Products, Inventory Tables)

---

### 🔹 get-products Lambda

**Input:**
`GET /products`

**Process:**

* Scan or query `Products` table
* Optionally apply filters by category or price

**Output:**

```json
[
  { "productId": "PROD#001", "name": "Protein Bowl", "price": 12.99 },
  ...
]
```

**Reads:** DynamoDB (Products Table)

---

```
───────────────────────────────────────────────
                 │
        ┌────────▼────────┐
        │ CART-SERVICE    │
        │ Lambda          │
        │ (add-to-cart, get-cart)
        └────────┬────────┘
                 │
                 ▼
          ┌─────────────┐
          │ Carts Table │
          └─────────────┘
```

### 🔹 add-to-cart Lambda

**Input:**

```json
{ "userId": "USER#123", "productId": "PROD#001", "quantity": 2 }
```

**Process:**

* Check if product exists in `Products`
* Add/Update item in `Carts` table
* Return confirmation

**Output:**

```json
{ "message": "Added to cart", "productId": "PROD#001" }
```

**Reads/Writes:** DynamoDB (Carts, Products Tables)

---

### 🔹 get-cart Lambda

**Input:**

```json
{ "userId": "USER#123" }
```

**Process:**

* Query `Carts` table by `userId`
* Join product details from `Products` table (via batchGet)

**Output:**

```json
[
  { "productId": "PROD#001", "name": "Protein Bowl", "qty": 2, "price": 12.99 }
]
```

**Reads:** DynamoDB (Carts, Products Tables)

---

```
───────────────────────────────────────────────
                 │
        ┌────────▼────────┐
        │ ORDER-SERVICE   │
        │ Lambda          │
        │ (create, validate)
        └────────┬────────┘
                 │
                 ▼
          ┌─────────────┐
          │ Orders Table│
          └─────────────┘
                 │
                 │ emits "OrderCreated" → EventBridge
───────────────────────────────────────────────
```

### 🔹 create-order Lambda

**Input:**

```json
{ "userId": "USER#123", "cartItems": [{ "productId": "PROD#001", "qty": 2 }] }
```

**Process:**

* Validate each item against `Products` stock
* Calculate `totalAmount`
* Create record in `Orders` table with status = `CREATED`
* Emit event → EventBridge: `OrderCreated`

**Output:**

```json
{ "orderId": "ORDER#1001", "status": "CREATED" }
```

**Writes:** DynamoDB (Orders Table)
**Emits:** EventBridge event → triggers Step Function (Checkout Orchestrator)

---

```
───────────────────────────────────────────────
                 ▼
       ┌────────────────────────┐
       │ STEP FUNCTIONS          │
       │ Checkout Orchestrator   │
       └─────────┬───────────────┘
                 │
───────────────────────────────────────────────
```

### 🧭 Checkout-Orchestrator Workflow

**Step 1:** Validate order (Order-Service Lambda)
**Step 2:** Process payment (Payment-Service Lambda)
**Step 3:** Update inventory (Inventory-Service Lambda)
**Step 4:** Send notification (Notification-Service Lambda)
**Step 5:** Emit analytics event

Each step passes state data like:

```json
{
  "orderId": "ORDER#1001",
  "userId": "USER#123",
  "amount": 25.98,
  "paymentStatus": "SUCCESS"
}
```

---

```
───────────────────────────────────────────────
     │                 │                    │
     ▼                 ▼                    ▼
┌────────────┐  ┌──────────────┐   ┌─────────────────┐
│Payment-Svc │  │Inventory-Svc │   │Notification-Svc │
│Lambda      │  │Lambda        │   │Lambda (SNS/SES) │
└─────┬──────┘  └─────┬────────┘   └────────┬────────┘
      │                │                     │
      ▼                ▼                     ▼
┌────────────┐  ┌────────────┐        ┌──────────────┐
│Payments Tbl│  │Inventory Tbl│        │Notifications│
└────────────┘  └────────────┘        └──────────────┘
```

### 🔹 process-payment Lambda

**Input:**

```json
{ "orderId": "ORDER#1001", "amount": 25.98, "method": "UPI" }
```

**Process:**

* Call payment gateway API (e.g., Razorpay/Stripe)
* On success, update `Payments` table
* Emit `PaymentSuccess` event → EventBridge

**Output:**

```json
{ "paymentId": "PAY#2001", "status": "SUCCESS" }
```

**Calls:** External Payment API
**Writes:** DynamoDB (Payments)
**Emits:** EventBridge Event

---

### 🔹 update-inventory Lambda

**Triggered by:** Payment success event or Step Function

**Input:**

```json
{ "orderId": "ORDER#1001", "items": [{ "productId": "PROD#001", "qty": 2 }] }
```

**Process:**

* Decrement `availableStock` in `Inventory` table for each product

**Writes:** DynamoDB (Inventory Table)
**Emits:** SQS message for async analytics

---

### 🔹 send-notification Lambda

**Triggered by:** Step Function or SNS

**Input:**

```json
{ "userId": "USER#123", "type": "EMAIL", "message": "Your order #1001 is confirmed" }
```

**Process:**

* Send email/SMS via SNS or SES
* Store record in `Notifications` table

**Writes:** DynamoDB (Notifications)
**Calls:** SNS or SES

---

```
───────────────────────────────────────────────
      ▼
  ┌───────────┐
  │ SQS Queue │
  │ (async upd│
  └────┬──────┘
       ▼
 ┌──────────────┐
 │ Analytics-Svc│
 │ (stream proc)│
 └────┬─────────┘
      ▼
 ┌──────────────┐
 │ EventLogs Tbl│
 │ (userId, evt)│
 └──────────────┘
```

### 🔹 analytics-service Lambda

**Triggered by:**

* DynamoDB Streams (Orders, Payments, Inventory)
* SQS messages from other services

**Process:**

* Parse event
* Write summarized log into `EventLogs` table

**Output Example:**

```json
{
  "eventId": "EVT#123",
  "eventType": "ORDER_COMPLETED",
  "userId": "USER#123",
  "metadata": { "orderId": "ORDER#1001" },
  "timestamp": "2025-10-13T14:10:00Z"
}
```

**Reads/Writes:** SQS, DynamoDB (EventLogs)

---

# 🧭 Summary Table (Lambda → Data → AWS Service Mapping)

| Lambda            | Input           | Reads           | Writes              | Calls/Triggers           |
| ----------------- | --------------- | --------------- | ------------------- | ------------------------ |
| register          | user info       | —               | Users               | SNS                      |
| login             | email, pass     | Users           | —                   | —                        |
| get-profile       | userId          | Users           | —                   | —                        |
| create-product    | product details | —               | Products, Inventory | —                        |
| get-products      | —               | Products        | —                   | —                        |
| add-to-cart       | productId, qty  | Products        | Carts               | —                        |
| get-cart          | userId          | Carts, Products | —                   | —                        |
| create-order      | cart items      | Products        | Orders              | EventBridge              |
| validate-order    | orderId         | Orders          | —                   | Step Functions           |
| process-payment   | orderId         | —               | Payments            | External Payment Gateway |
| update-inventory  | items           | Inventory       | Inventory           | SQS                      |
| send-notification | userId, msg     | —               | Notifications       | SNS/SES                  |
| analytics-service | stream event    | —               | EventLogs           | —                        |

---
```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                            SERVERLESS E-COMMERCE SYSTEM FLOW (DETAILED)                   │
└────────────────────────────────────────────────────────────────────────────────────────────┘
                                        ▲
                                        │
                             ┌──────────────────────┐
                             │     END USERS        │
                             │(Web / Mobile / Admin)│
                             └─────────┬────────────┘
                                       │  (HTTPS via REST)
                                       ▼
                            ┌──────────────────────────┐
                            │      API GATEWAY         │
                            │  Routes to Lambda APIs   │
                            └───────────┬──────────────┘
────────────────────────────────────────────────────────────────────────────────────────────
      │                   │                     │                    │
      ▼                   ▼                     ▼                    ▼
┌──────────────┐  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│ USER-SERVICE │  │ PRODUCT-SERVICE│    │ CART-SERVICE   │    │ ORDER-SERVICE  │
│ (Auth/Profile│  │ (CRUD Product) │    │ (Cart Mgmt)    │    │ (Order Mgmt)   │
└──────┬───────┘  └───────┬────────┘    └───────┬────────┘    └──────┬────────┘
       │                   │                     │                    │
       ▼                   ▼                     ▼                    ▼
  DynamoDB Users       DynamoDB Products     DynamoDB Cart       DynamoDB Orders
  (userId, name)       (productId, name)     (userId, items[])   (orderId, status)
────────────────────────────────────────────────────────────────────────────────────────────
                                           │
                                           ▼
                    ┌────────────────────────────────────────┐
                    │       CHECKOUT PROCESS STARTS          │
                    │ (Triggered when user clicks “BUY NOW”) │
                    └─────────────────┬──────────────────────┘
                                      │
                                      ▼
                 ┌────────────────────────────────────────────┐
                 │   checkoutLambda (ENTRY POINT)             │
                 │   Validates user/cart/order                │
                 │   ➜ Triggers Step Function Workflow        │
                 └─────────────────┬──────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                         STEP FUNCTION: checkout-orchestrator                               │
│  (Handles sequential and parallel tasks for one complete order process)                     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                         ┌─────────────────────────┐
                         │ Step 1: validateOrder() │
                         │  - Calls Order-Service  │
                         │  - Ensures items exist  │
                         └───────────┬─────────────┘
                                     │ success/failure
                                     ▼
                         ┌────────────────────────────┐
                         │ Step 2: checkInventory()   │
                         │  - Calls Inventory Lambda  │
                         │  - Checks stock in DynamoDB│
                         │  - Reserves temporarily    │
                         └───────────┬───────────────┘
                                     │ if available
                                     ▼
                         ┌────────────────────────────┐
                         │ Step 3: processPayment()   │
                         │  - Calls Payment Lambda    │
                         │  - Integrates with Stripe  │
                         │  - Updates Payments Table  │
                         │  - Emits EventBridge event │
                         └───────────┬───────────────┘
                                     │ payment success/fail
                                     ▼
                         ┌────────────────────────────┐
                         │ Step 4: updateInventory()  │
                         │  - Deduct purchased qty    │
                         │  - Updates Inventory Table │
                         └───────────┬───────────────┘
                                     │
                                     ▼
                         ┌────────────────────────────┐
                         │ Step 5: createOrderRecord()│
                         │  - Stores Order in DynamoDB│
                         │  - Status: CONFIRMED       │
                         └───────────┬───────────────┘
                                     │
                                     ▼
                         ┌────────────────────────────┐
                         │ Step 6: sendNotification() │
                         │  - Calls NotificationSvc   │
                         │  - Sends email/SMS         │
                         └───────────┬───────────────┘
                                     │
                                     ▼
                         ┌────────────────────────────┐
                         │ Step 7: publishEvent()     │
                         │  - Publishes event to      │
                         │    EventBridge (order.done)│
                         └───────────┬───────────────┘
                                     │
                                     ▼
                         ┌────────────────────────────┐
                         │ Step 8: end()              │
                         │  - Marks workflow success  │
                         └────────────────────────────┘
────────────────────────────────────────────────────────────────────────────────────────────

TRIGGERS AND ASYNC FLOWS (AFTER CHECKOUT)
────────────────────────────────────────────────────────────────────────────────────────────
1️⃣ Event Published: `order.done`
   - Sent to EventBridge Bus
   - Triggers downstream Lambdas:
     • `analyticsLambda` → Updates Reports/Analytics Table
     • `emailReceiptLambda` → Sends final receipt email
     • `inventoryAuditLambda` → Logs data for daily reconciliation

2️⃣ SNS Notifications:
   - From Notification Lambda → to SMS/Email topic
   - Subscribers: Customer, Admin, Inventory Team

3️⃣ SQS Queues:
   - For async stock reconciliation or retrying failed payments
   - Example: `inventory-update-queue` or `payment-retry-queue`

────────────────────────────────────────────────────────────────────────────────────────────
DATA FLOW SUMMARY
────────────────────────────────────────────────────────────────────────────────────────────
Step | Lambda / Service       | Reads/Writes                 | Purpose
─────┼────────────────────────┼──────────────────────────────┼─────────────────────────────
 1   | checkoutLambda          | Orders, Cart Tables          | Validates cart, starts StepFn
 2   | validateOrder()         | Orders Table                 | Confirms valid order items
 3   | checkInventory()        | Inventory Table              | Checks stock availability
 4   | processPayment()        | Payments Table               | Charges user securely
 5   | updateInventory()       | Inventory Table              | Deducts stock quantity
 6   | createOrderRecord()     | Orders Table                 | Finalizes order details
 7   | sendNotification()      | SNS/SES                      | Sends confirmation message
 8   | publishEvent()          | EventBridge                  | Triggers async listeners
────────────────────────────────────────────────────────────────────────────────────────────
MONITORING / OBSERVABILITY
────────────────────────────────────────────────────────────────────────────────────────────
- CloudWatch Logs: Each Lambda + Step Function execution logs
- X-Ray: Trace complete checkout flow latency
- CloudTrail: Logs API Gateway calls
────────────────────────────────────────────────────────────────────────────────────────────
```

---

### 🔁 **Step Function Trigger & Flow Recap**

**Trigger Event:**
When the frontend calls `/checkout`, it invokes `checkoutLambda`.

**Lambda Action:**

* Validates user/cart.
* Invokes **AWS Step Function: `checkout-orchestrator`** using SDK.

**Step Function Workflow:**
Executes each step in sequence → on any failure, rollback logic (like restock or refund) can be added.

---

### 🧩 AWS Services Involved

| Function      | AWS Service                 | Purpose                              |
| ------------- | --------------------------- | ------------------------------------ |
| API Endpoints | **API Gateway**             | Expose REST APIs                     |
| Compute       | **Lambda Functions**        | Stateless microservices              |
| State Machine | **Step Functions**          | Checkout orchestration               |
| Database      | **DynamoDB**                | Store products, users, carts, orders |
| Messaging     | **SNS / SQS / EventBridge** | Async communication                  |
| Notifications | **SES / SNS**               | Send email/SMS                       |
| Monitoring    | **CloudWatch, X-Ray**       | Observability & tracing              |

---
