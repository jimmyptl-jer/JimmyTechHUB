# LOW-LEVEL ARCHITECTURE DESIGN
## Milk & Milk Products Delivery Platform

---

## TABLE OF CONTENTS
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Database Schema Design](#database-schema-design)
4. [Lambda Functions Specifications](#lambda-functions-specifications)
5. [API Gateway Routes](#api-gateway-routes)
6. [Step Functions State Machine](#step-functions-state-machine)
7. [Event-Driven Architecture](#event-driven-architecture)
8. [Security & IAM Policies](#security-iam-policies)
9. [Data Flow Diagrams](#data-flow-diagrams)
10. [Error Handling & Retry Logic](#error-handling-retry-logic)

---

## 1. SYSTEM OVERVIEW

### 1.1 Architecture Pattern
- **Pattern**: Event-Driven Serverless Microservices
- **Communication**: Async (SNS/EventBridge) + Sync (API Gateway)
- **Data Store**: NoSQL (DynamoDB) + S3 Data Lake
- **Orchestration**: AWS Step Functions
- **Auth**: Amazon Cognito with JWT tokens

### 1.2 Core Components
```
┌─────────────────────────────────────────────────────────────┐
│                    ARCHITECTURAL LAYERS                      │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Client Layer (React/Mobile)                        │
│ Layer 2: API Gateway + Cognito Authorizer                   │
│ Layer 3: Business Logic (Lambda Functions)                  │
│ Layer 4: Orchestration (Step Functions)                     │
│ Layer 5: Data Layer (DynamoDB, S3)                          │
│ Layer 6: Messaging (SNS, EventBridge, SQS)                  │
│ Layer 7: Observability (CloudWatch, X-Ray)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. TECHNOLOGY STACK

### 2.1 Frontend
- **Framework**: React 18 / Next.js 14
- **State Management**: Redux Toolkit / Zustand
- **API Client**: Axios with retry interceptors
- **Auth**: AWS Amplify Auth module
- **Hosting**: S3 + CloudFront

### 2.2 Backend
- **Runtime**: Node.js 20.x
- **Language**: TypeScript 5.x
- **Lambda Handler**: async/await pattern
- **SDK**: AWS SDK v3 (modular imports)

### 2.3 Infrastructure
- **IaC**: AWS SAM / CloudFormation
- **CI/CD**: GitHub Actions / AWS CodePipeline
- **Monitoring**: CloudWatch Logs, X-Ray, CloudWatch Insights

### 2.4 Third-Party Integrations
- **Payment**: Stripe / Razorpay SDK
- **SMS**: AWS SNS (SMS capability)
- **Email**: AWS SES
- **Maps**: Google Maps API (delivery routing)

---

## 3. DATABASE SCHEMA DESIGN

### 3.1 DynamoDB Tables

#### Table: Users
```yaml
TableName: milk-delivery-users
PartitionKey: userId (String)
Attributes:
  - userId: String (UUID)
  - email: String (UNIQUE, GSI)
  - name: String
  - phone: String
  - role: String (Customer | Vendor | Admin | Manager)
  - addresses: List<Map>
      - addressId: String
      - label: String (Home/Work)
      - line1: String
      - line2: String
      - city: String
      - state: String
      - zipCode: String
      - country: String
      - isDefault: Boolean
  - preferences: Map
      - paymentMethod: String (Card/UPI/COD)
      - deliveryTimeSlot: String (Morning/Evening)
      - notificationChannel: String (Email/SMS/Both)
  - loyaltyPoints: Number (default: 0)
  - orderCount: Number (default: 0)
  - isProfileComplete: Boolean (default: false)
  - lastActiveAt: String (ISO timestamp)
  - createdAt: String (ISO timestamp)
  - updatedAt: String (ISO timestamp)

GSI:
  - email-index (PK: email) - for login lookup
  - role-index (PK: role, SK: createdAt) - for admin queries

StreamEnabled: true (for analytics)
```

#### Table: Products
```yaml
TableName: milk-delivery-products
PartitionKey: productId (String)
SortKey: vendorId (String)
Attributes:
  - productId: String (UUID)
  - vendorId: String (FK to Vendors)
  - name: String
  - description: String
  - category: String (Milk|Yogurt|Cheese|Butter|Paneer)
  - subcategory: String (Organic|Regular|Low-fat)
  - price: Number (in cents)
  - unitType: String (Liter|Kg|Pack|Bottle)
  - unitSize: Number
  - stock: Number
  - lowStockThreshold: Number (default: 10)
  - imageUrl: String (S3 URL)
  - nutritionInfo: Map
      - calories: Number
      - protein: Number
      - fat: Number
      - carbs: Number
  - expiryDate: String (ISO date)
  - isActive: Boolean (default: true)
  - createdAt: String
  - updatedAt: String

GSI:
  - category-index (PK: category, SK: price) - for browsing
  - vendor-index (PK: vendorId, SK: createdAt) - vendor's products

StreamEnabled: true
```

#### Table: Vendors
```yaml
TableName: milk-delivery-vendors
PartitionKey: vendorId (String)
Attributes:
  - vendorId: String (UUID)
  - name: String
  - contactEmail: String
  - contactPhone: String
  - address: Map
      - line1, city, state, zipCode, country
  - gstNumber: String
  - fssaiLicense: String
  - region: String (service area)
  - pickupDays: List<String> (Mon|Tue|Wed...)
  - operatingHours: Map
      - open: String (HH:MM)
      - close: String (HH:MM)
  - inventorySummary: List<Map>
      - productId: String
      - stock: Number
      - price: Number
      - lastUpdated: String
  - rating: Number (1-5)
  - totalOrders: Number
  - isActive: Boolean
  - createdAt: String
  - updatedAt: String

GSI:
  - region-index (PK: region, SK: rating) - regional search
```

#### Table: Orders
```yaml
TableName: milk-delivery-orders
PartitionKey: orderId (String)
SortKey: userId (String)
Attributes:
  - orderId: String (UUID)
  - userId: String (FK to Users)
  - items: List<Map>
      - productId: String
      - vendorId: String
      - productName: String
      - quantity: Number
      - unitPrice: Number
      - totalPrice: Number
      - deliveryDate: String
  - subtotal: Number
  - tax: Number
  - deliveryCharge: Number
  - discount: Number
  - totalAmount: Number
  - status: String (Pending|Paid|Confirmed|Processing|OutForDelivery|Delivered|Cancelled|Failed)
  - paymentInfo: Map
      - paymentId: String
      - paymentMethod: String
      - paymentStatus: String
      - transactionId: String
      - paidAt: String
  - deliveryAddress: Map (copy from Users.addresses)
  - vendorAssignments: List<Map>
      - vendorId: String
      - items: List<productId>
      - pickupDate: String
      - status: String
  - flags: Map
      - isPartialFulfillment: Boolean
      - customDeliveryDate: Boolean
      - isFirstOrder: Boolean
  - metadata: Map
      - deviceInfo: String
      - ipAddress: String
      - userAgent: String
  - createdAt: String
  - updatedAt: String
  - deliveredAt: String

GSI:
  - userId-status-index (PK: userId, SK: status) - user's orders
  - status-createdAt-index (PK: status, SK: createdAt) - admin queries

StreamEnabled: true (triggers analytics)
```

#### Table: Inventory
```yaml
TableName: milk-delivery-inventory
PartitionKey: vendorId (String)
SortKey: productId (String)
Attributes:
  - vendorId: String
  - productId: String
  - stock: Number
  - reserved: Number (locked for pending orders)
  - available: Number (stock - reserved)
  - lowStockAlert: Boolean
  - lastRestockDate: String
  - nextRestockDate: String
  - movements: List<Map> (last 10 transactions)
      - type: String (Inbound|Outbound|Adjustment)
      - quantity: Number
      - orderId: String (if applicable)
      - timestamp: String
  - updatedAt: String

StreamEnabled: true (low-stock alerts)
```

#### Table: Deliveries
```yaml
TableName: milk-delivery-deliveries
PartitionKey: deliveryId (String)
Attributes:
  - deliveryId: String (UUID)
  - orderId: String (FK to Orders)
  - vendorId: String
  - driverId: String (if assigned)
  - routeId: String
  - pickupAddress: Map (vendor address)
  - deliveryAddress: Map (user address)
  - scheduledPickupDate: String
  - scheduledDeliveryDate: String
  - actualPickupTime: String
  - actualDeliveryTime: String
  - status: String (Scheduled|InTransit|Delivered|Failed)
  - deliveryProof: Map
      - photoUrl: String (S3)
      - signature: String (base64)
      - notes: String
  - createdAt: String
  - updatedAt: String

GSI:
  - orderId-index (PK: orderId) - lookup by order
  - driverId-date-index (PK: driverId, SK: scheduledDeliveryDate) - driver's route
```

#### Table: AuditLogs
```yaml
TableName: milk-delivery-audit-logs
PartitionKey: logId (String)
SortKey: timestamp (String)
Attributes:
  - logId: String (UUID)
  - timestamp: String (ISO)
  - actorId: String (userId/vendorId/adminId)
  - actorRole: String
  - action: String (CREATE|UPDATE|DELETE|VIEW)
  - resource: String (User|Order|Product|Vendor)
  - resourceId: String
  - changes: Map (before/after values)
  - metadata: Map
      - ipAddress: String
      - userAgent: String
      - requestId: String
  - ttl: Number (expire after 90 days)

GSI:
  - actorId-timestamp-index (PK: actorId, SK: timestamp)
  - resource-timestamp-index (PK: resource, SK: timestamp)
```

---

## 4. LAMBDA FUNCTIONS SPECIFICATIONS

### 4.1 User Service Lambdas

#### Lambda: createUserLambda
```typescript
// Handler: src/lambdas/user/createUser.ts

interface CreateUserInput {
  email: string;
  name: string;
  phone: string;
  password: string;
  role?: 'Customer' | 'Vendor';
}

interface CreateUserOutput {
  userId: string;
  email: string;
  role: string;
  status: 'created';
  message: string;
}

// Process Flow:
// 1. Validate input (email format, phone format)
// 2. Check if email already exists (GSI query)
// 3. Hash password (bcrypt)
// 4. Generate userId (UUID v4)
// 5. Insert into Users table
// 6. Set flags: isProfileComplete=false, orderCount=0
// 7. Publish to SNS: userNotifications (welcome email)
// 8. Log to AuditLogs table
// 9. Return userId and status

// Error Handling:
// - DuplicateEmailError (400)
// - ValidationError (400)
// - DatabaseError (500)

// IAM Permissions Required:
// - dynamodb:PutItem (Users table)
// - dynamodb:Query (email-index)
// - sns:Publish (userNotifications topic)
// - logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents

// Environment Variables:
// - USERS_TABLE_NAME
// - SNS_USER_NOTIFICATIONS_ARN
// - BCRYPT_SALT_ROUNDS=10

// Timeout: 10 seconds
// Memory: 512 MB
// Concurrent Executions: 100
```

#### Lambda: getUserLambda
```typescript
// Handler: src/lambdas/user/getUser.ts

interface GetUserInput {
  userId: string;
}

interface GetUserOutput {
  userId: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  addresses: Address[];
  preferences: UserPreferences;
  loyaltyPoints: number;
  orderCount: number;
  isProfileComplete: boolean;
  lastActiveAt: string;
}

// Process Flow:
// 1. Validate userId format
// 2. GetItem from Users table
// 3. Update lastActiveAt timestamp
// 4. Return user data (exclude password hash)

// Error Handling:
// - UserNotFoundError (404)
// - ValidationError (400)

// IAM Permissions:
// - dynamodb:GetItem (Users table)
// - dynamodb:UpdateItem (Users table)

// Timeout: 5 seconds
// Memory: 256 MB
```

#### Lambda: updateUserProfileLambda
```typescript
// Handler: src/lambdas/user/updateUserProfile.ts

interface UpdateUserProfileInput {
  userId: string;
  addresses?: Address[];
  preferences?: UserPreferences;
}

interface UpdateUserProfileOutput {
  userId: string;
  status: 'updated';
  isProfileComplete: boolean;
}

// Process Flow:
// 1. Validate input
// 2. Get existing user data
// 3. Merge new data with existing
// 4. Check if profile is now complete
// 5. UpdateItem in Users table
// 6. Set isProfileComplete flag if all fields present
// 7. Log to AuditLogs
// 8. Return status

// Validation Rules:
// - At least one address required
// - Address must have: line1, city, state, zipCode
// - Phone must be valid format
// - Email cannot be changed here

// Timeout: 10 seconds
// Memory: 512 MB
```

### 4.2 Order Service Lambdas

#### Lambda: createOrderLambda
```typescript
// Handler: src/lambdas/order/createOrder.ts

interface CreateOrderInput {
  userId: string;
  items: OrderItem[];
  deliveryDate: string; // ISO date
  paymentMethod: string;
  addressId: string;
}

interface OrderItem {
  productId: string;
  vendorId: string;
  quantity: number;
}

interface CreateOrderOutput {
  orderId: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'Pending';
  message: string;
}

// Process Flow:
// 1. Validate input (items not empty, valid date)
// 2. Check user profile completion
// 3. Fetch product details (BatchGetItem from Products)
// 4. Calculate prices:
//    - subtotal = sum(item.price * item.quantity)
//    - tax = subtotal * 0.05 (5% GST)
//    - deliveryCharge = calculateDeliveryCharge(items, address)
//    - totalAmount = subtotal + tax + deliveryCharge
// 5. Generate orderId (UUID)
// 6. Create order record in Orders table
// 7. Set status = 'Pending'
// 8. Trigger Step Function: OrderProcessingStateMachine
// 9. Publish to SNS: orderEvents topic
// 10. Log to AuditLogs
// 11. Return orderId and status

// Business Rules:
// - Minimum order value: ₹100
// - Maximum items per order: 50
// - Delivery date must be: today + 1 to today + 7 days
// - Check if user has any 'Pending' payment orders (limit 3)

// Error Handling:
// - InvalidItemsError (400)
// - InsufficientStockError (400)
// - InvalidDeliveryDateError (400)
// - ProfileIncompleteError (400)
// - MinimumOrderValueError (400)

// IAM Permissions:
// - dynamodb:PutItem (Orders table)
// - dynamodb:BatchGetItem (Products table)
// - dynamodb:GetItem (Users table)
// - states:StartExecution (Step Functions)
// - sns:Publish

// Timeout: 30 seconds
// Memory: 1024 MB
// Reserved Concurrency: 50
```

#### Lambda: validateInventoryLambda
```typescript
// Handler: src/lambdas/order/validateInventory.ts

interface ValidateInventoryInput {
  orderId: string;
  items: OrderItem[];
}

interface ValidateInventoryOutput {
  orderId: string;
  valid: boolean;
  unavailableItems: UnavailableItem[];
  message: string;
}

interface UnavailableItem {
  productId: string;
  vendorId: string;
  requestedQty: number;
  availableQty: number;
}

// Process Flow:
// 1. For each item in order:
//    a. Query Inventory table (PK: vendorId, SK: productId)
//    b. Check: available = stock - reserved
//    c. If available < requestedQty: mark as unavailable
// 2. If any unavailable:
//    - Set valid = false
//    - Return list of unavailable items
//    - Do NOT proceed to next step
// 3. If all available:
//    - Set valid = true
//    - Proceed to updateStockLambda

// Concurrency:
// - Use DynamoDB Transactions for atomic checks
// - Prevent race conditions with optimistic locking

// Error Handling:
// - StockCheckFailedError (500)
// - TransactionConflictError (409) - retry

// IAM Permissions:
// - dynamodb:Query (Inventory table)
// - dynamodb:TransactGetItems

// Timeout: 15 seconds
// Memory: 512 MB
```

#### Lambda: updateStockLambda
```typescript
// Handler: src/lambdas/order/updateStock.ts

interface UpdateStockInput {
  orderId: string;
  items: OrderItem[];
  operation: 'reserve' | 'deduct' | 'release';
}

interface UpdateStockOutput {
  orderId: string;
  updated: boolean;
  lowStockAlerts: LowStockAlert[];
}

interface LowStockAlert {
  vendorId: string;
  productId: string;
  currentStock: number;
  threshold: number;
}

// Process Flow:
// 1. Start DynamoDB Transaction
// 2. For each item:
//    a. Read current stock
//    b. If operation = 'reserve':
//       - Increment reserved count
//    c. If operation = 'deduct':
//       - Decrement stock
//       - Decrement reserved
//       - Add to movements history
//    d. If operation = 'release':
//       - Decrement reserved count
//    e. Check if stock < lowStockThreshold
// 3. Commit transaction
// 4. If lowStockAlert triggered:
//    - Publish to SNS: inventoryAlerts topic
//    - Notify vendor
// 5. Update order.vendorAssignments status
// 6. Return success

// Idempotency:
// - Check if orderId already processed
// - Use conditional expressions to prevent double-deduction

// Error Handling:
// - InsufficientStockError (400)
// - TransactionFailedError (500)
// - ConcurrentModificationError (409)

// IAM Permissions:
// - dynamodb:TransactWriteItems (Inventory table)
// - dynamodb:Query
// - sns:Publish (inventoryAlerts)

// Timeout: 20 seconds
// Memory: 512 MB
```

### 4.3 Vendor Service Lambdas

#### Lambda: notifyVendorLambda
```typescript
// Handler: src/lambdas/vendor/notifyVendor.ts

interface NotifyVendorInput {
  orderId: string;
  vendorId: string;
  items: OrderItem[];
  pickupDate: string;
  deliveryDate: string;
  customerInfo: {
    name: string;
    phone: string;
    address: Address;
  };
}

interface NotifyVendorOutput {
  vendorId: string;
  orderId: string;
  messageId: string;
  status: 'sent';
}

// Process Flow:
// 1. Get vendor details from Vendors table
// 2. Format notification message:
//    Subject: "New Order - Order ID: {orderId}"
//    Body: Order details, items, pickup date, customer address
// 3. Publish to SNS topic: vendorNotifications
//    - Email to vendor.contactEmail
//    - SMS to vendor.contactPhone
//    - HTTP POST to vendor webhook (if configured)
// 4. Store notification record in NotificationsLog (optional)
// 5. Update order.vendorAssignments.notifiedAt timestamp
// 6. Return messageId

// SNS Message Format:
// {
//   "vendorId": "string",
//   "orderId": "string",
//   "items": [...],
//   "pickupDate": "ISO string",
//   "totalAmount": number,
//   "customerName": "string",
//   "deliveryAddress": {...}
// }

// Error Handling:
// - VendorNotFoundError (404)
// - SNSPublishFailedError (500)
// - retry 3 times with exponential backoff

// IAM Permissions:
// - dynamodb:GetItem (Vendors table)
// - dynamodb:UpdateItem (Orders table)
// - sns:Publish (vendorNotifications topic)

// Timeout: 10 seconds
// Memory: 256 MB
```

### 4.4 Delivery Service Lambdas

#### Lambda: scheduleDeliveryLambda
```typescript
// Handler: src/lambdas/delivery/scheduleDelivery.ts

interface ScheduleDeliveryInput {
  orderId: string;
  deliveryDate: string;
  deliveryAddress: Address;
  vendorAssignments: VendorAssignment[];
}

interface ScheduleDeliveryOutput {
  deliveryId: string;
  orderId: string;
  scheduledDate: string;
  status: 'scheduled';
}

// Process Flow:
// 1. Generate deliveryId (UUID)
// 2. Calculate pickupDate = deliveryDate - 1 day
// 3. For each vendor in vendorAssignments:
//    a. Get vendor address
//    b. Calculate route (vendor → customer)
//    c. Estimate pickup time window
// 4. Create delivery record in Deliveries table
// 5. Set status = 'Scheduled'
// 6. Publish event to EventBridge: DeliveryScheduled
// 7. Trigger route optimization Lambda (if multiple vendors)
// 8. Return deliveryId

// Route Optimization:
// - If multi-vendor order, optimize pickup sequence
// - Use Google Maps Distance Matrix API
// - Consider vendor operating hours

// Error Handling:
// - InvalidDateError (400)
// - VendorUnavailableError (400)

// IAM Permissions:
// - dynamodb:PutItem (Deliveries table)
// - events:PutEvents (EventBridge)
// - secretsmanager:GetSecretValue (for Google Maps API key)

// Timeout: 15 seconds
// Memory: 512 MB
```

#### Lambda: assignDeliveryLambda
```typescript
// Handler: src/lambdas/delivery/assignDelivery.ts

interface AssignDeliveryInput {
  deliveryId: string;
  driverId?: string; // optional, auto-assign if not provided
  routeId?: string;
}

interface AssignDeliveryOutput {
  deliveryId: string;
  driverId: string;
  routeId: string;
  status: 'assigned';
}

// Process Flow:
// 1. If driverId not provided:
//    a. Query available drivers for the date
//    b. Check driver capacity (max 20 deliveries/day)
//    c. Auto-assign based on proximity
// 2. Update delivery record with driverId
// 3. Add delivery to driver's route
// 4. Publish to EventBridge: DeliveryAssigned
// 5. Trigger notifyDriverLambda
// 6. Return assignment details

// Driver Selection Algorithm:
// - Proximity to pickup location
// - Current workload
// - Driver rating
// - Vehicle capacity

// IAM Permissions:
// - dynamodb:UpdateItem (Deliveries table)
// - dynamodb:Query (Drivers table)
// - events:PutEvents

// Timeout: 10 seconds
// Memory: 256 MB
```

### 4.5 Notification Service Lambdas

#### Lambda: notifyUserLambda
```typescript
// Handler: src/lambdas/notifications/notifyUser.ts

interface NotifyUserInput {
  userId: string;
  orderId: string;
  status: OrderStatus;
  message: string;
  channel?: 'email' | 'sms' | 'both';
}

interface NotifyUserOutput {
  userId: string;
  messageId: string;
  status: 'sent';
}

// Process Flow:
// 1. Get user details and preferences
// 2. Determine notification channel:
//    - Use user.preferences.notificationChannel
//    - Override if channel specified in input
// 3. Format message based on status:
//    - OrderConfirmed: "Your order {orderId} is confirmed..."
//    - OutForDelivery: "Your order is out for delivery..."
//    - Delivered: "Your order has been delivered..."
// 4. Publish to SNS: userNotifications topic
//    - Email via SES
//    - SMS via SNS
// 5. Store notification log
// 6. Return messageId

// Message Templates:
// - Stored in S3 or DynamoDB
// - Support placeholders: {{orderId}}, {{userName}}, {{deliveryDate}}

// IAM Permissions:
// - dynamodb:GetItem (Users table)
// - sns:Publish (userNotifications topic)
// - ses:SendEmail

// Timeout: 10 seconds
// Memory: 256 MB
```

### 4.6 Analytics Service Lambdas

#### Lambda: orderAnalyticsLambda
```typescript
// Handler: src/lambdas/analytics/orderAnalytics.ts

interface OrderAnalyticsInput {
  orderId: string;
  eventType: 'OrderCreated' | 'OrderPaid' | 'OrderDelivered' | 'OrderCancelled';
  metadata: Record<string, any>;
}

interface OrderAnalyticsOutput {
  orderId: string;
  status: 'logged';
}

// Process Flow:
// 1. Extract analytics metrics:
//    - Order value
//    - Items count
//    - Vendors involved
//    - Payment method
//    - Delivery date
//    - User demographics
// 2. Publish to Kinesis Firehose
// 3. Firehose delivers to S3 (raw data lake)
// 4. Trigger Glue Crawler for schema inference
// 5. Data available in Athena for queries
// 6. QuickSight dashboards auto-refresh

// Metrics Tracked:
// - Daily/Weekly/Monthly revenue
// - Average order value
// - Top products
// - Top vendors
// - Delivery success rate
// - Customer retention rate

// IAM Permissions:
// - firehose:PutRecord
// - firehose:PutRecordBatch

// Timeout: 5 seconds
// Memory: 256 MB
// Triggered by: DynamoDB Stream on Orders table
```

---

## 5. API GATEWAY ROUTES

### 5.1 API Structure
```
Base URL: https://api.milkdelivery.com/v1

Authentication: Cognito JWT in Authorization header
Rate Limiting: 1000 requests/min per user
Throttling: 10000 requests/sec burst
```

### 5.2 Route Definitions

#### User Routes
```yaml
POST /user/register
  Lambda: createUserLambda
  Auth: None (public)
  Request Body:
    {
      "email": "string",
      "name": "string",
      "phone": "string",
      "password": "string"
    }
  Response: 201 Created
    {
      "userId": "string",
      "message": "User created successfully"
    }
  Errors: 400 (validation), 409 (duplicate email)

GET /user/profile
  Lambda: getUserLambda
  Auth: Required (Cognito)
  Query Params: userId (auto-extracted from JWT)
  Response: 200 OK
    {
      "userId": "string",
      "email": "string",
      "name": "string",
      ...user data
    }
  Errors: 404 (not found), 401 (unauthorized)

PUT /user/profile
  Lambda: updateUserProfileLambda
  Auth: Required
  Request Body:
    {
      "addresses": [...],
      "preferences": {...}
    }
  Response: 200 OK
  Errors: 400 (validation), 404 (not found)
```

#### Product Routes
```yaml
GET /products
  Lambda: listProductsLambda
  Auth: Optional
  Query Params:
    - category: string (optional)
    - vendorId: string (optional)
    - limit: number (default: 20, max: 100)
    - nextToken: string (pagination)
  Response: 200 OK
    {
      "items": [...products],
      "nextToken": "string" (if more results)
    }

GET /products/{productId}
  Lambda: getProductLambda
  Auth: Optional
  Path Params: productId
  Response: 200 OK
    {
      "productId": "string",
      ...product details
    }
  Errors: 404 (not found)
```

#### Order Routes
```yaml
POST /orders
  Lambda: createOrderLambda
  Auth: Required
  Request Body:
    {
      "items": [
        {
          "productId": "string",
          "vendorId": "string",
          "quantity": number
        }
      ],
      "deliveryDate": "ISO date",
      "paymentMethod": "string",
      "addressId": "string"
    }
  Response: 201 Created
    {
      "orderId": "string",
      "totalAmount": number,
      "status": "Pending"
    }
  Errors: 400 (validation), 402 (payment required)

GET /orders/{orderId}
  Lambda: getOrderLambda
  Auth: Required (owner or admin)
  Path Params: orderId
  Response: 200 OK
  Errors: 404, 403 (forbidden)

GET /orders
  Lambda: listOrdersLambda
  Auth: Required
  Query Params:
