
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

## ⚙️ STEP 3 — Create Lambda Functions (User Service)

We’ll use the **AWS Console** (no CLI).
Each Lambda will use the same `lambda-execution-role` you created earlier.

---

### 📍 Overview of User-Service Functions

| Function        | Purpose                         | DynamoDB Table |
| --------------- | ------------------------------- | -------------- |
| `register-user` | Register new users              | `Users`        |
| `login-user`    | Authenticate user credentials   | `Users`        |
| `get-profile`   | Retrieve user profile by userId | `Users`        |

---

### 🧩 1️⃣ Create `register-user` Lambda

#### 🪜 Steps:

1. Go to **AWS Lambda Console** → [https://console.aws.amazon.com/lambda](https://console.aws.amazon.com/lambda)
2. Click **Create function**
3. Choose:

   * **Author from scratch**
   * Function name: `register-user`
   * Runtime: **Node.js 18.x**
   * Execution role: **Use existing role** → select `lambda-execution-role`
4. Click **Create function**

---

#### 🧠 Add Code

Scroll down to the **Code** editor and replace default code with:

```javascript
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { userId, name, email, password } = body;

    if (!userId || !email || !password) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing required fields" }) };
    }

    const params = {
      TableName: "Users",
      Item: {
        userId: { S: userId },
        name: { S: name },
        email: { S: email },
        password: { S: password }, // You can later hash it using bcrypt
        createdAt: { S: new Date().toISOString() }
      }
    };

    await client.send(new PutItemCommand(params));

    return {
      statusCode: 201,
      body: JSON.stringify({ message: "User registered successfully" })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal Server Error" }) };
  }
};
```

✅ Click **Deploy**.

---

#### 🧪 Test

1. Go to **Test** tab → Create test event
2. Event JSON:

```json
{
  "body": "{\"userId\": \"U101\", \"name\": \"Jimmy\", \"email\": \"jimmy@example.com\", \"password\": \"test123\"}"
}
```

3. Click **Test**
   ✅ You should see a success message:
   `{"message": "User registered successfully"}`

Then check your **Users table** in DynamoDB — you’ll see a new item added.

---

### 🧩 2️⃣ Create `login-user` Lambda

#### Steps:

1. Back in Lambda console → **Create function**
2. Name: `login-user`
3. Runtime: **Node.js 18.x**
4. Role: `lambda-execution-role`

#### Code:

```javascript
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  const body = JSON.parse(event.body);
  const { email, password } = body;

  if (!email || !password) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing email or password" }) };
  }

  const params = {
    TableName: "Users",
    Key: { userId: { S: email } } // or use email as partition key if preferred
  };

  try {
    const result = await client.send(new GetItemCommand(params));
    if (!result.Item || result.Item.password.S !== password) {
      return { statusCode: 401, body: JSON.stringify({ message: "Invalid credentials" }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Login successful", userId: result.Item.userId.S })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal Server Error" }) };
  }
};
```

✅ Click **Deploy → Test** with:

```json
{
  "body": "{\"email\": \"jimmy@example.com\", \"password\": \"test123\"}"
}
```

---

### 🧩 3️⃣ Create `get-profile` Lambda

#### Steps:

1. Create new function → name: `get-profile`
2. Runtime: Node.js 18.x
3. Role: `lambda-execution-role`

#### Code:

```javascript
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing userId" }) };
  }

  try {
    const result = await client.send(new GetItemCommand({
      TableName: "Users",
      Key: { userId: { S: userId } }
    }));

    if (!result.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: "User not found" }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        userId: result.Item.userId.S,
        name: result.Item.name.S,
        email: result.Item.email.S
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal Server Error" }) };
  }
};
```

✅ Click **Deploy → Test**
Use this test event:

```json
{
  "queryStringParameters": { "userId": "U101" }
}
```

---

### ✅ Summary (User Service Complete)

| Lambda Function | Description                |
| --------------- | -------------------------- |
| `register-user` | Adds new user to DynamoDB  |
| `login-user`    | Validates user credentials |
| `get-profile`   | Retrieves user info by ID  |

---

## API Gateway & Connect Lambdas

---

### 2️⃣ Create a New API

1. API Name: `ServerlessEcommerceAPI`
2. Description: `API for User, Product, Cart, Order Services`
3. Endpoint Type: **Regional**
4. Click **Create API**

---

### 3️⃣ Create Resources (Endpoints)

API Gateway uses **resources + methods**.

#### Resource: `/user`

1. Select your API → **Actions → Create Resource**
2. Resource Name: `user`
3. Resource Path: `/user` → Click **Create Resource**

---

### 4️⃣ Create Methods

#### a) `POST /user/register` → `register-user` Lambda

1. Select `/user` → **Actions → Create Method → POST**
2. Integration type: **Lambda Function**
3. Lambda Region: same as your Lambda
4. Lambda Function: `register-user`
5. Click **Save** → Confirm **Add Permission to API Gateway**
   ✅ Now `/user/register` will invoke `register-user` Lambda

---

#### b) `POST /user/login` → `login-user` Lambda

1. Repeat above → create **POST method** on `/user/login`
2. Integration type: **Lambda Function**
3. Lambda Function: `login-user`
4. Save & confirm

---

#### c) `GET /user/profile` → `get-profile` Lambda

1. Select `/user` → **Actions → Create Method → GET**
2. Integration type: **Lambda Function**
3. Lambda Function: `get-profile`
4. Save & confirm
5. **Enable Query String Parameters** in **Method Request**:

   * Add `userId` as a query string parameter

---

### 5️⃣ Deploy API

1. Click **Actions → Deploy API**
2. Deployment Stage: **New Stage**
3. Stage Name: `dev`
4. Click **Deploy**
5. You’ll get an **Invoke URL**, e.g.:

```
https://abcd1234.execute-api.eu-west-1.amazonaws.com/dev
```

---

### 6️⃣ Test Your Endpoints

* **Register User (POST)**

```
POST https://abcd1234.execute-api.eu-west-1.amazonaws.com/dev/user/register
Body (JSON):
{
  "userId": "U101",
  "name": "Jimmy",
  "email": "jimmy@example.com",
  "password": "test123"
}
```

* **Login User (POST)**

```
POST https://abcd1234.execute-api.eu-west-1.amazonaws.com/dev/user/login
Body (JSON):
{
  "email": "jimmy@example.com",
  "password": "test123"
}
```

* **Get Profile (GET)**

```
GET https://abcd1234.execute-api.eu-west-1.amazonaws.com/dev/user/profile?userId=U101
```
---

### 7️⃣ Next Steps

Once this works for **User Service**, you can repeat the same process for:

| Service         | Resource Path | Lambda Functions                       |
| --------------- | ------------- | -------------------------------------- |
| Product Service | `/product`    | `create-product`, `get-products`       |
| Cart Service    | `/cart`       | `add-to-cart`, `get-cart`              |
| Order Service   | `/order`      | `create-order`, `validate-order`, etc. |

---

# ** Lambda User Service **

### **1️⃣ Folder Structure**

```
lambda-user-service/
├── handlers/
│   └── userHandler.js       # Main Lambda entry point
├── controllers/
│   └── userController.js    # Business logic
├── routes/
│   └── userRoutes.js        # Routes mapping
├── models/
│   └── User.js              # Dynamoose ORM model
├── utils/
│   └── response.js          # HTTP response helper
├── package.json
├── package-lock.json
├── template.yaml            # SAM template
└── node_modules/
```

---

### **2️⃣ Install Dependencies**

```bash
npm init -y
npm install dynamoose
```

* `dynamoose` is a DynamoDB ORM for Node.js.
* Include **any other dependencies** you may need (e.g., `bcrypt` for passwords).

---

### **3️⃣ Dynamoose Model (`models/User.js`)**

```javascript
import dynamoose from "dynamoose";

// Define Users table schema
const userSchema = new dynamoose.Schema({
  userId: { type: String, hashKey: true },
  name: String,
  email: String,
  password: String,
  createdAt: String,
});

export const User = dynamoose.model("Users", userSchema);
```

* `hashKey: true` → primary key
* Dynamoose automatically maps JavaScript objects to DynamoDB items.

---

### **4️⃣ Utility Function (`utils/response.js`)**

```javascript
export const success = (data) => ({
  statusCode: 200,
  body: JSON.stringify(data),
});

export const error = (message, status = 500) => ({
  statusCode: status,
  body: JSON.stringify({ message }),
});
```

* Makes your Lambdas **clean and consistent**.

---

### **5️⃣ Controller Logic (`controllers/userController.js`)**

```javascript
import { User } from "../models/User.js";
import { success, error } from "../utils/response.js";
import bcrypt from "bcryptjs";

export const register = async (body) => {
  const { userId, name, email, password } = body;
  if (!userId || !email || !password) {
    return error("Missing required fields", 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const newUser = new User({
      userId,
      name,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
    });
    await newUser.save();
    return success({ message: "User registered successfully" });
  } catch (err) {
    console.error(err);
    return error("Internal Server Error");
  }
};

export const login = async (body) => {
  const { email, password } = body;
  if (!email || !password) return error("Missing email or password", 400);

  try {
    const user = await User.scan("email").eq(email).exec();
    if (!user || !user[0]) return error("Invalid credentials", 401);

    const valid = await bcrypt.compare(password, user[0].password);
    if (!valid) return error("Invalid credentials", 401);

    return success({ message: "Login successful", userId: user[0].userId });
  } catch (err) {
    console.error(err);
    return error("Internal Server Error");
  }
};

export const getProfile = async (query) => {
  const { userId } = query;
  if (!userId) return error("Missing userId", 400);

  try {
    const user = await User.get(userId);
    if (!user) return error("User not found", 404);

    return success({
      userId: user.userId,
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    console.error(err);
    return error("Internal Server Error");
  }
};
```

* **Business logic separated** from handler → clean and testable.

---

### **6️⃣ Routes Mapping (`routes/userRoutes.js`)**

```javascript
import { register, login, getProfile } from "../controllers/userController.js";

export const route = async (path, method, body, query) => {
  switch (path) {
    case "/user/register":
      if (method === "POST") return await register(body);
      break;
    case "/user/login":
      if (method === "POST") return await login(body);
      break;
    case "/user/profile":
      if (method === "GET") return await getProfile(query);
      break;
    default:
      return { statusCode: 404, body: JSON.stringify({ message: "Route not found" }) };
  }
};
```

* Central routing inside Lambda.
* No need for Express.js — **API Gateway passes `path` and `method`**.

---

### **7️⃣ Lambda Handler (`handlers/userHandler.js`)**

```javascript
import { route } from "../routes/userRoutes.js";

export const handler = async (event) => {
  const { path, httpMethod, body, queryStringParameters } = event;
  let parsedBody = {};
  if (body) parsedBody = JSON.parse(body);

  return await route(path, httpMethod, parsedBody, queryStringParameters);
};
```

* Lambda entry point → **delegates to routes → controllers → models**.

---

### **8️⃣ SAM Template (`template.yaml`)**

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Serverless User Service

Globals:
  Function:
    Runtime: nodejs18.x
    MemorySize: 128
    Timeout: 10
    Environment:
      Variables:
        USERS_TABLE: Users

Resources:
  UserServiceFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: handlers/userHandler.handler
      CodeUri: .
      Policies:
        - DynamoDBCrudPolicy:
            TableName: Users
      Events:
        RegisterUser:
          Type: Api
          Properties:
            Path: /user/register
            Method: post
        LoginUser:
          Type: Api
          Properties:
            Path: /user/login
            Method: post
        GetProfile:
          Type: Api
          Properties:
            Path: /user/profile
            Method: get
```

---

### **9️⃣ Deploy**

```bash
sam build
sam deploy --guided
```

* Includes **folder structure and `node_modules`**.
* Lambda in AWS `/var/task` has **handlers/, controllers/, routes/, models/, utils/**.

---

### **10️⃣ Test API Endpoints**

```bash
# Register
curl -X POST https://<api-gateway-url>/user/register \
  -H "Content-Type: application/json" \
  -d '{"userId":"U101","name":"Jimmy","email":"jimmy@example.com","password":"test123"}'

# Login
curl -X POST https://<api-gateway-url>/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jimmy@example.com","password":"test123"}'

# Get Profile
curl -X GET "https://<api-gateway-url>/user/profile?userId=U101"
```
---


