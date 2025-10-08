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

// ============================================================================
// SHARED CONSTANTS
// ============================================================================

// src/lambdas/shared/constants/tableNames.ts
export const TABLE_NAMES = {
  USERS: process.env.USERS_TABLE || 'milk-delivery-users',
  VENDORS: process.env.VENDORS_TABLE || 'milk-delivery-vendors',
  PRODUCTS: process.env.PRODUCTS_TABLE || 'milk-delivery-products',
  ORDERS: process.env.ORDERS_TABLE || 'milk-delivery-orders',
  PAYMENTS: process.env.PAYMENTS_TABLE || 'milk-delivery-payments',
  DELIVERIES: process.env.DELIVERIES_TABLE || 'milk-delivery-deliveries',
  INVENTORY: process.env.INVENTORY_TABLE || 'milk-delivery-inventory'
};

// src/lambdas/shared/constants/orderStatus.ts
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  VENDOR_ASSIGNED = 'VENDOR_ASSIGNED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  PREPARING = 'PREPARING',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED'
}

// src/lambdas/shared/constants/snsTopics.ts
export const SNS_TOPICS = {
  ORDER_CREATED: process.env.ORDER_CREATED_TOPIC || 'order-created-topic',
  VENDOR_NOTIFICATION: process.env.VENDOR_NOTIFICATION_TOPIC || 'vendor-notification-topic',
  USER_NOTIFICATION: process.env.USER_NOTIFICATION_TOPIC || 'user-notification-topic',
  PAYMENT_STATUS: process.env.PAYMENT_STATUS_TOPIC || 'payment-status-topic',
  DELIVERY_UPDATE: process.env.DELIVERY_UPDATE_TOPIC || 'delivery-update-topic',
  ADMIN_ALERT: process.env.ADMIN_ALERT_TOPIC || 'admin-alert-topic'
};

// src/lambdas/shared/constants/eventTypes.ts
export enum EventType {
  ORDER_PLACED = 'ORDER_PLACED',
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
  VENDOR_ASSIGNED = 'VENDOR_ASSIGNED',
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  DELIVERY_SCHEDULED = 'DELIVERY_SCHEDULED',
  DELIVERY_COMPLETED = 'DELIVERY_COMPLETED',
  ORDER_CANCELLED = 'ORDER_CANCELLED'
}

// ============================================================================
// SHARED MODELS
// ============================================================================

// src/lambdas/shared/models/UserModel.ts
export interface User {
  userId: string;
  email: string;
  phone: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  subscriptions?: {
    productId: string;
    frequency: 'DAILY' | 'ALTERNATE' | 'WEEKLY';
    quantity: number;
    startDate: string;
    endDate?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

// src/lambdas/shared/models/VendorModel.ts
export interface Vendor {
  vendorId: string;
  name: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  };
  serviceAreas: string[]; // Array of pincodes
  productsOffered: string[]; // Array of productIds
  rating: number;
  isActive: boolean;
  capacity: {
    dailyOrderLimit: number;
    currentOrders: number;
  };
  createdAt: string;
  updatedAt: string;
}

// src/lambdas/shared/models/ProductModel.ts
export interface Product {
  productId: string;
  name: string;
  category: 'MILK' | 'CURD' | 'PANEER' | 'BUTTER' | 'GHEE' | 'OTHER';
  description: string;
  variants: {
    variantId: string;
    name: string; // e.g., "500ml", "1L"
    price: number;
    unit: string;
  }[];
  vendorIds: string[];
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// src/lambdas/shared/models/OrderModel.ts
export interface Order {
  orderId: string;
  userId: string;
  items: {
    productId: string;
    variantId: string;
    quantity: number;
    price: number;
    vendorId?: string;
  }[];
  totalAmount: number;
  status: OrderStatus;
  deliveryDate: string;
  deliverySlot: 'MORNING' | 'EVENING';
  deliveryAddress: {
    street: string;
    city: string;
    state: string;
    pincode: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  paymentId?: string;
  deliveryId?: string;
  specialInstructions?: string;
  createdAt: string;
  updatedAt: string;
}

// src/lambdas/shared/models/PaymentModel.ts
export interface Payment {
  paymentId: string;
  orderId: string;
  userId: string;
  amount: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  paymentMethod: 'CARD' | 'UPI' | 'NETBANKING' | 'WALLET' | 'COD';
  transactionId?: string;
  gatewayResponse?: any;
  createdAt: string;
  updatedAt: string;
}

// src/lambdas/shared/models/DeliveryModel.ts
export interface Delivery {
  deliveryId: string;
  orderId: string;
  userId: string;
  vendorIds: string[];
  deliveryDate: string;
  deliverySlot: 'MORNING' | 'EVENING';
  status: 'SCHEDULED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  driverId?: string;
  estimatedTime?: string;
  actualDeliveryTime?: string;
  deliveryProof?: string; // Image URL
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================

// src/lambdas/shared/utils/response.ts
export const createResponse = (statusCode: number, body: any) => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(body)
  };
};

export const successResponse = (data: any, message = 'Success') => {
  return createResponse(200, { success: true, message, data });
};

export const errorResponse = (error: any, statusCode = 500) => {
  return createResponse(statusCode, {
    success: false,
    message: error.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error : undefined
  });
};

// src/lambdas/shared/utils/logger.ts
export class Logger {
  static info(message: string, meta?: any) {
    console.log(JSON.stringify({ level: 'INFO', message, meta, timestamp: new Date().toISOString() }));
  }

  static error(message: string, error?: any) {
    console.error(JSON.stringify({ level: 'ERROR', message, error: error?.message, stack: error?.stack, timestamp: new Date().toISOString() }));
  }

  static warn(message: string, meta?: any) {
    console.warn(JSON.stringify({ level: 'WARN', message, meta, timestamp: new Date().toISOString() }));
  }

  static debug(message: string, meta?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.log(JSON.stringify({ level: 'DEBUG', message, meta, timestamp: new Date().toISOString() }));
    }
  }
}

// src/lambdas/shared/utils/validator.ts
import { z } from 'zod';

export const validateInput = <T>(schema: z.ZodSchema<T>, data: any): T => {
  return schema.parse(data);
};

export const UserSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  name: z.string().min(2),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    pincode: z.string().length(6)
  })
});

export const OrderSchema = z.object({
  userId: z.string(),
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string(),
    quantity: z.number().positive()
  })),
  deliveryDate: z.string(),
  deliverySlot: z.enum(['MORNING', 'EVENING']),
  deliveryAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    pincode: z.string().length(6)
  })
});

// ============================================================================
// SHARED SERVICES
// ============================================================================

// src/lambdas/shared/services/dynamoClient.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

export class DynamoService {
  static async put(tableName: string, item: any) {
    const command = new PutCommand({ TableName: tableName, Item: item });
    return await docClient.send(command);
  }

  static async get(tableName: string, key: any) {
    const command = new GetCommand({ TableName: tableName, Key: key });
    const result = await docClient.send(command);
    return result.Item;
  }

  static async update(tableName: string, key: any, updateExpression: string, expressionAttributeValues: any, expressionAttributeNames?: any) {
    const command = new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW'
    });
    const result = await docClient.send(command);
    return result.Attributes;
  }

  static async delete(tableName: string, key: any) {
    const command = new DeleteCommand({ TableName: tableName, Key: key });
    return await docClient.send(command);
  }

  static async query(tableName: string, keyConditionExpression: string, expressionAttributeValues: any, indexName?: string) {
    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      IndexName: indexName
    });
    const result = await docClient.send(command);
    return result.Items || [];
  }

  static async scan(tableName: string, filterExpression?: string, expressionAttributeValues?: any) {
    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues
    });
    const result = await docClient.send(command);
    return result.Items || [];
  }
}

// src/lambdas/shared/services/snsClient.ts
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient({});

export class SNSService {
  static async publish(topicArn: string, message: any, subject?: string) {
    const command = new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(message),
      Subject: subject
    });
    return await snsClient.send(command);
  }
}

// src/lambdas/shared/services/stepFunctionsClient.ts
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const sfnClient = new SFNClient({});

export class StepFunctionsService {
  static async startExecution(stateMachineArn: string, input: any, name?: string) {
    const command = new StartExecutionCommand({
      stateMachineArn,
      input: JSON.stringify(input),
      name
    });
    return await sfnClient.send(command);
  }
}

// src/lambdas/shared/services/emailService.ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({});

export class EmailService {
  static async sendEmail(to: string, subject: string, body: string, isHtml = false) {
    const command = new SendEmailCommand({
      Source: process.env.FROM_EMAIL || 'noreply@milkdelivery.com',
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: isHtml ? { Html: { Data: body } } : { Text: { Data: body } }
      }
    });
    return await sesClient.send(command);
  }
}

// ============================================================================
// USER LAMBDA FUNCTIONS
// ============================================================================

// src/lambdas/user/createUser.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    Logger.info('Creating user', { body: event.body });
    
    const body = JSON.parse(event.body || '{}');
    const validatedData = validateInput(UserSchema, body);
    
    const user: User = {
      userId: uuidv4(),
      ...validatedData,
      subscriptions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await DynamoService.put(TABLE_NAMES.USERS, user);
    
    Logger.info('User created successfully', { userId: user.userId });
    return successResponse(user, 'User created successfully');
  } catch (error) {
    Logger.error('Error creating user', error);
    return errorResponse(error, 400);
  }
};

// src/lambdas/user/getUser.ts
export const getUserHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.pathParameters?.userId;
    
    if (!userId) {
      return errorResponse(new Error('User ID is required'), 400);
    }
    
    const user = await DynamoService.get(TABLE_NAMES.USERS, { userId });
    
    if (!user) {
      return errorResponse(new Error('User not found'), 404);
    }
    
    return successResponse(user);
  } catch (error) {
    Logger.error('Error fetching user', error);
    return errorResponse(error);
  }
};

// src/lambdas/user/updateUser.ts
export const updateUserHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.pathParameters?.userId;
    const body = JSON.parse(event.body || '{}');
    
    if (!userId) {
      return errorResponse(new Error('User ID is required'), 400);
    }
    
    const updateExpression = 'SET #name = :name, #phone = :phone, #address = :address, #updatedAt = :updatedAt';
    const expressionAttributeNames = {
      '#name': 'name',
      '#phone': 'phone',
      '#address': 'address',
      '#updatedAt': 'updatedAt'
    };
    const expressionAttributeValues = {
      ':name': body.name,
      ':phone': body.phone,
      ':address': body.address,
      ':updatedAt': new Date().toISOString()
    };
    
    const updatedUser = await DynamoService.update(
      TABLE_NAMES.USERS,
      { userId },
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );
    
    return successResponse(updatedUser, 'User updated successfully');
  } catch (error) {
    Logger.error('Error updating user', error);
    return errorResponse(error);
  }
};

// ============================================================================
// VENDOR LAMBDA FUNCTIONS
// ============================================================================

// src/lambdas/vendor/createVendor.ts
export const createVendorHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    
    const vendor: Vendor = {
      vendorId: uuidv4(),
      name: body.name,
      email: body.email,
      phone: body.phone,
      address: body.address,
      serviceAreas: body.serviceAreas || [],
      productsOffered: body.productsOffered || [],
      rating: 0,
      isActive: true,
      capacity: {
        dailyOrderLimit: body.dailyOrderLimit || 100,
        currentOrders: 0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await DynamoService.put(TABLE_NAMES.VENDORS, vendor);
    
    return successResponse(vendor, 'Vendor created successfully');
  } catch (error) {
    Logger.error('Error creating vendor', error);
    return errorResponse(error);
  }
};

// src/lambdas/vendor/updateVendor.ts
export const updateVendorHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const vendorId = event.pathParameters?.vendorId;
    const body = JSON.parse(event.body || '{}');
    
    if (!vendorId) {
      return errorResponse(new Error('Vendor ID is required'), 400);
    }
    
    const updateFields: string[] = [];
    const expressionAttributeNames: any = {};
    const expressionAttributeValues: any = { ':updatedAt': new Date().toISOString() };
    
    if (body.name) {
      updateFields.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = body.name;
    }
    
    if (body.phone) {
      updateFields.push('#phone = :phone');
      expressionAttributeNames['#phone'] = 'phone';
      expressionAttributeValues[':phone'] = body.phone;
    }
    
    if (body.serviceAreas) {
      updateFields.push('#serviceAreas = :serviceAreas');
      expressionAttributeNames['#serviceAreas'] = 'serviceAreas';
      expressionAttributeValues[':serviceAreas'] = body.serviceAreas;
    }
    
    if (body.isActive !== undefined) {
      updateFields.push('#isActive = :isActive');
      expressionAttributeNames['#isActive'] = 'isActive';
      expressionAttributeValues[':isActive'] = body.isActive;
    }
    
    updateFields.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    
    const updateExpression = `SET ${updateFields.join(', ')}`;
    
    const updatedVendor = await DynamoService.update(
      TABLE_NAMES.VENDORS,
      { vendorId },
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );
    
    return successResponse(updatedVendor, 'Vendor updated successfully');
  } catch (error) {
    Logger.error('Error updating vendor', error);
    return errorResponse(error);
  }
};

// src/lambdas/vendor/deleteVendor.ts
export const deleteVendorHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const vendorId = event.pathParameters?.vendorId;
    
    if (!vendorId) {
      return errorResponse(new Error('Vendor ID is required'), 400);
    }
    
    await DynamoService.delete(TABLE_NAMES.VENDORS, { vendorId });
    
    return successResponse({ vendorId }, 'Vendor deleted successfully');
  } catch (error) {
    Logger.error('Error deleting vendor', error);
    return errorResponse(error);
  }
};

// src/lambdas/vendor/getVendorById.ts
export const getVendorByIdHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const vendorId = event.pathParameters?.vendorId;
    
    if (!vendorId) {
      return errorResponse(new Error('Vendor ID is required'), 400);
    }
    
    const vendor = await DynamoService.get(TABLE_NAMES.VENDORS, { vendorId });
    
    if (!vendor) {
      return errorResponse(new Error('Vendor not found'), 404);
    }
    
    return successResponse(vendor);
  } catch (error) {
    Logger.error('Error fetching vendor', error);
    return errorResponse(error);
  }
};

// src/lambdas/vendor/listVendors.ts
export const listVendorsHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const pincode = event.queryStringParameters?.pincode;
    
    let vendors;
    if (pincode) {
      vendors = await DynamoService.scan(
        TABLE_NAMES.VENDORS,
        'contains(serviceAreas, :pincode) AND isActive = :isActive',
        { ':pincode': pincode, ':isActive': true }
      );
    } else {
      vendors = await DynamoService.scan(
        TABLE_NAMES.VENDORS,
        'isActive = :isActive',
        { ':isActive': true }
      );
    }
    
    return successResponse(vendors);
  } catch (error) {
    Logger.error('Error listing vendors', error);
    return errorResponse(error);
  }
};

// src/lambdas/vendor/notifyVendor.ts
export const notifyVendorHandler = async (event: any): Promise<void> => {
  try {
    const { vendorId, orderId, items } = event;
    
    const vendor = await DynamoService.get(TABLE_NAMES.VENDORS, { vendorId });
    
    if (!vendor) {
      throw new Error('Vendor not found');
    }
    
    const message = {
      vendorId,
      vendorName: vendor.name,
      orderId,
      items,
      timestamp: new Date().toISOString()
    };
    
    await SNSService.publish(SNS_TOPICS.VENDOR_NOTIFICATION, message, 'New Order Assignment');
    
    await EmailService.sendEmail(
      vendor.email,
      'New Order Assigned',
      `You have been assigned a new order: ${orderId}. Please check your dashboard for details.`
    );
    
    Logger.info('Vendor notified', { vendorId, orderId });
  } catch (error) {
    Logger.error('Error notifying vendor', error);
    throw error;
  }
};

// ============================================================================
// PRODUCT LAMBDA FUNCTIONS
// ============================================================================

// src/lambdas/product/createProduct.ts
export const createProductHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    
    const product: Product = {
      productId: uuidv4(),
      name: body.name,
      category: body.category,
      description: body.description,
      variants: body.variants,
      vendorIds: body.vendorIds || [],
      imageUrl: body.imageUrl,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await DynamoService.put(TABLE_NAMES.PRODUCTS, product);
    
    return successResponse(product, 'Product created successfully');
  } catch (error) {
    Logger.error('Error creating product', error);
    return errorResponse(error);
  }
};

// src/lambdas/product/updateProduct.ts
export const updateProductHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const productId = event.pathParameters?.productId;
    const body = JSON.parse(event.body || '{}');
    
    if (!productId) {
      return errorResponse(new Error('Product ID is required'), 400);
    }
    
    const updateFields: string[] = [];
    const expressionAttributeNames: any = {};
    const expressionAttributeValues: any = { ':updatedAt': new Date().toISOString() };
    
    if (body.name) {
      updateFields.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = body.name;
    }
    
    if (body.description) {
      updateFields.push('#description = :description');
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':description'] = body.description;
    }
    
    if (body.variants) {
      updateFields.push('#variants = :variants');
      expressionAttributeNames['#variants'] = 'variants';
      expressionAttributeValues[':variants'] = body.variants;
    }
    
    if (body.isActive !== undefined) {
      updateFields.push('#isActive = :isActive');
      expressionAttributeNames['#isActive'] = 'isActive';
      expressionAttributeValues[':isActive'] = body.isActive;
    }
    
    updateFields.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    
    const updateExpression = `SET ${updateFields.join(', ')}`;
    
    const updatedProduct = await DynamoService.update(
      TABLE_NAMES.PRODUCTS,
      { productId },
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );
    
    return successResponse(updatedProduct, 'Product updated successfully');
  } catch (error) {
    Logger.error('Error updating product', error);
    return errorResponse(error);
  }
};

// src/lambdas/product/deleteProduct.ts
export const deleteProductHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const productId = event.pathParameters?.productId;
    
    if (!productId) {
      return errorResponse(new Error('Product ID is required'), 400);
    }
    
    await DynamoService.update(
      TABLE_NAMES.PRODUCTS,
      { productId },
      'SET #isActive = :isActive, #updatedAt = :updatedAt',
      { ':isActive': false, ':updatedAt': new Date().toISOString() },
      { '#isActive': 'isActive', '#updatedAt': 'updatedAt' }
    );
    
    return successResponse({ productId }, 'Product deactivated successfully');
  } catch (error) {
    Logger.error('Error deleting product', error);
    return errorResponse(error);
  }
};

// src/lambdas/product/listProducts.ts
export const listProductsHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const category = event.queryStringParameters?.category;
    
    let products;
    if (category) {
      products = await DynamoService.scan(
        TABLE_NAMES.PRODUCTS,
        'category = :category AND isActive = :isActive',
        { ':category': category, ':isActive': true }
      );
    } else {
      products = await DynamoService.scan(
        TABLE_NAMES.PRODUCTS,
        'isActive = :isActive',
        { ':isActive': true }
      );
    }
    
    return successResponse(products);
  } catch (error) {
    Logger.error('Error listing products', error);
    return errorResponse(error);
  }
};

// src/lambdas/product/checkStock.ts
export const checkStockHandler = async (event: any): Promise<any> => {
  try {
    const { productId, variantId, quantity, vendorId } = event;
    
    const inventory = await DynamoService.get(TABLE_NAMES.INVENTORY, {
      productId,
      vendorId
    });
    
    if (!inventory) {
      return {
        available: false,
        reason: 'Product not found in inventory'
      };
    }
    
    const variant = inventory.variants?.find((v: any) => v.variantId === variantId);
    
    if (!variant || variant.stock < quantity) {
      return {
        available: false,
        reason: 'Insufficient stock',
        availableQuantity: variant?.stock || 0
      };
    }
    
    return {
      available: true,
      availableQuantity: variant.stock
    };
  } catch (error) {
    Logger.error('Error checking stock', error);
    throw error;
  }
};

// ============================================================================
// ORDER LAMBDA FUNCTIONS
// ============================================================================

// src/lambdas/order/createOrder.ts
export const createOrderHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const validatedData = validateInput(OrderSchema, body);
    
    // Calculate total amount
    let totalAmount = 0;
    const enrichedItems = [];
    
    for (const item of validatedData.items) {
      const product = await DynamoService.get(TABLE_NAMES.PRODUCTS, { productId: item.productId });
      if (!product) {
        return errorResponse(new Error(`Product ${item.productId} not found`), 404);
      }
      
      const variant = product.variants.find((v: any) => v.variantId === item.variantId);
      if (!variant) {
        return errorResponse(new Error(`Variant ${item.variantId} not found`), 404);
      }
      
      const itemTotal = variant.price * item.quantity;
      totalAmount += itemTotal;
      
      enrichedItems.push({
        ...item,
        price: variant.price
      });
    }
    
    const order: Order = {
      orderId: uuidv4(),
      userId: validatedData.userId,
      items: enrichedItems,
      totalAmount,
      status: OrderStatus.PENDING,
      deliveryDate: validatedData.deliveryDate,
      deliverySlot: validatedData.deliverySlot,
      deliveryAddress: validatedData.deliveryAddress,
      specialInstructions: body.specialInstructions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await DynamoService.put(TABLE_NAMES.ORDERS, order);
    
    // Start Step Function for order processing
    const stateMachineArn = process.env.ORDER_PROCESSING_STATE_MACHINE_ARN;
    if (stateMachineArn) {
      await StepFunctionsService.startExecution(stateMachineArn, order, `order-${order.orderId}`);
    }
    
    // Publish order created event
    await SNSService.publish(
      SNS_TOPICS.ORDER_CREATED,
      { orderId: order.orderId, userId: order.userId, totalAmount: order.totalAmount },
      'New Order Created'
    );
    
    Logger.info('Order created successfully', { orderId: order.orderId });
    return successResponse(order, 'Order created successfully');
  } catch (error) {
    Logger.error('Error creating order', error);
    return errorResponse(error, 400);
  }
};

// src/lambdas/order/updateOrderStatus.ts
export const updateOrderStatusHandler = async (event: any): Promise<any> => {
  try {
    const { orderId, status, metadata } = event;
    
    const updatedOrder = await DynamoService.update(
      TABLE_NAMES.ORDERS,
      { orderId },
      'SET #status = :status, #updatedAt = :updatedAt',
      { ':status': status, ':updatedAt': new Date().toISOString() },
      { '#status': 'status', '#updatedAt': 'updatedAt' }
    );
    
    // Notify user of status change
    await SNSService.publish(
      SNS_TOPICS.USER_NOTIFICATION,
      {
        userId: updatedOrder.userId,
        orderId,
        status,
        message: `Your order status has been updated to ${status}`,
        metadata
      },
      'Order Status Update'
    );
    
    Logger.info('Order status updated', { orderId, status });
    return updatedOrder;
  } catch (error) {
    Logger.error('Error updating order status', error);
    throw error;
  }
};

// src/lambdas/order/getOrderDetails.ts
export const getOrderDetailsHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const orderId = event.pathParameters?.orderId;
    
    if (!orderId) {
      return errorResponse(new Error('Order ID is required'), 400);
    }
    
    const order = await DynamoService.get(TABLE_NAMES.ORDERS, { orderId });
    
    if (!order) {
      return errorResponse(new Error('Order not found'), 404);
    }
    
    // Fetch related data
    const payment = order.paymentId 
      ? await DynamoService.get(TABLE_NAMES.PAYMENTS, { paymentId: order.paymentId })
      : null;
    
    const delivery = order.deliveryId
      ? await DynamoService.get(TABLE_NAMES.DELIVERIES, { deliveryId: order.deliveryId })
      : null;
    
    return successResponse({
      ...order,
      payment,
      delivery
    });
  } catch (error) {
    Logger.error('Error fetching order details', error);
    return errorResponse(error);
  }
};

// src/lambdas/order/cancelOrder.ts
export const cancelOrderHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const orderId = event.pathParameters?.orderId;
    
    if (!orderId) {
      return errorResponse(new Error('Order ID is required'), 400);
    }
    
    const order = await DynamoService.get(TABLE_NAMES.ORDERS, { orderId });
    
    if (!order) {
      return errorResponse(new Error('Order not found'), 404);
    }
    
    // Check if order can be cancelled
    if ([OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.OUT_FOR_DELIVERY].includes(order.status)) {
      return errorResponse(new Error(`Order cannot be cancelled in ${order.status} status`), 400);
    }
    
    const updatedOrder = await DynamoService.update(
      TABLE_NAMES.ORDERS,
      { orderId },
      'SET #status = :status, #updatedAt = :updatedAt',
      { ':status': OrderStatus.CANCELLED, ':updatedAt': new Date().toISOString() },
      { '#status': 'status', '#updatedAt': 'updatedAt' }
    );
    
    // Initiate refund if payment was completed
    if (order.paymentId && order.status === OrderStatus.PAYMENT_COMPLETED) {
      const payment = await DynamoService.get(TABLE_NAMES.PAYMENTS, { paymentId: order.paymentId });
      if (payment && payment.status === 'COMPLETED') {
        // Trigger refund process
        await SNSService.publish(
          SNS_TOPICS.PAYMENT_STATUS,
          { paymentId: order.paymentId, action: 'REFUND', orderId },
          'Refund Request'
        );
      }
    }
    
    return successResponse(updatedOrder, 'Order cancelled successfully');
  } catch (error) {
    Logger.error('Error cancelling order', error);
    return errorResponse(error);
  }
};

// src/lambdas/order/assignVendor.ts
export const assignVendorHandler = async (event: any): Promise<any> => {
  try {
    const { orderId, items, deliveryAddress } = event;
    
    Logger.info('Assigning vendors to order', { orderId });
    
    const pincode = deliveryAddress.pincode;
    
    // Get available vendors for the pincode
    const vendors = await DynamoService.scan(
      TABLE_NAMES.VENDORS,
      'contains(serviceAreas, :pincode) AND isActive = :isActive',
      { ':pincode': pincode, ':isActive': true }
    );
    
    if (vendors.length === 0) {
      throw new Error(`No vendors available for pincode ${pincode}`);
    }
    
    const assignedItems = [];
    
    for (const item of items) {
      // Find vendors who offer this product
      const availableVendors = vendors.filter((v: Vendor) => 
        v.productsOffered.includes(item.productId) &&
        v.capacity.currentOrders < v.capacity.dailyOrderLimit
      );
      
      if (availableVendors.length === 0) {
        throw new Error(`No vendor available for product ${item.productId}`);
      }
      
      // Sort by rating and capacity
      availableVendors.sort((a, b) => {
        const scoreA = a.rating * 10 - a.capacity.currentOrders;
        const scoreB = b.rating * 10 - b.capacity.currentOrders;
        return scoreB - scoreA;
      });
      
      const selectedVendor = availableVendors[0];
      
      // Check stock availability
      const stockCheck = await checkStockHandler({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        vendorId: selectedVendor.vendorId
      });
      
      if (!stockCheck.available) {
        throw new Error(`Product ${item.productId} not available in sufficient quantity`);
      }
      
      assignedItems.push({
        ...item,
        vendorId: selectedVendor.vendorId
      });
      
      // Update vendor's current order count
      await DynamoService.update(
        TABLE_NAMES.VENDORS,
        { vendorId: selectedVendor.vendorId },
        'SET capacity.currentOrders = capacity.currentOrders + :inc',
        { ':inc': 1 }
      );
      
      // Notify vendor
      await notifyVendorHandler({
        vendorId: selectedVendor.vendorId,
        orderId,
        items: [item]
      });
    }
    
    // Update order with vendor assignments
    await DynamoService.update(
      TABLE_NAMES.ORDERS,
      { orderId },
      'SET items = :items, #status = :status, #updatedAt = :updatedAt',
      {
        ':items': assignedItems,
        ':status': OrderStatus.VENDOR_ASSIGNED,
        ':updatedAt': new Date().toISOString()
      },
      { '#status': 'status', '#updatedAt': 'updatedAt' }
    );
    
    Logger.info('Vendors assigned successfully', { orderId, assignedItems });
    
    return {
      orderId,
      items: assignedItems,
      status: OrderStatus.VENDOR_ASSIGNED
    };
  } catch (error) {
    Logger.error('Error assigning vendors', error);
    throw error;
  }
};

// ============================================================================
// PAYMENT LAMBDA FUNCTIONS
// ============================================================================

// src/lambdas/payment/initiatePayment.ts
export const initiatePaymentHandler = async (event: any): Promise<any> => {
  try {
    const { orderId, userId, amount, paymentMethod } = event;
    
    Logger.info('Initiating payment', { orderId, amount });
    
    const payment: Payment = {
      paymentId: uuidv4(),
      orderId,
      userId,
      amount,
      status: 'PENDING',
      paymentMethod,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await DynamoService.put(TABLE_NAMES.PAYMENTS, payment);
    
    // Update order with payment ID
    await DynamoService.update(
      TABLE_NAMES.ORDERS,
      { orderId },
      'SET paymentId = :paymentId, #status = :status, #updatedAt = :updatedAt',
      {
        ':paymentId': payment.paymentId,
        ':status': OrderStatus.PAYMENT_PENDING,
        ':updatedAt': new Date().toISOString()
      },
      { '#status': 'status', '#updatedAt': 'updatedAt' }
    );
    
    // Here you would integrate with actual payment gateway (Razorpay, Stripe, etc.)
    // For now, we'll simulate payment gateway response
    const gatewayResponse = {
      transactionId: `TXN_${uuidv4()}`,
      gatewayOrderId: `GORD_${Date.now()}`,
      checkoutUrl: `https://payment-gateway.com/checkout/${payment.paymentId}`
    };
    
    await DynamoService.update(
      TABLE_NAMES.PAYMENTS,
      { paymentId: payment.paymentId },
      'SET gatewayResponse = :gatewayResponse, transactionId = :transactionId, #updatedAt = :updatedAt',
      {
        ':gatewayResponse': gatewayResponse,
        ':transactionId': gatewayResponse.transactionId,
        ':updatedAt': new Date().toISOString()
      },
      { '#updatedAt': 'updatedAt' }
    );
    
    return {
      paymentId: payment.paymentId,
      ...gatewayResponse
    };
  } catch (error) {
    Logger.error('Error initiating payment', error);
    throw error;
  }
};

// src/lambdas/payment/verifyPayment.ts
export const verifyPaymentHandler = async (event: any): Promise<any> => {
  try {
    const { paymentId, transactionId } = event;
    
    Logger.info('Verifying payment', { paymentId, transactionId });
    
    const payment = await DynamoService.get(TABLE_NAMES.PAYMENTS, { paymentId });
    
    if (!payment) {
      throw new Error('Payment not found');
    }
    
    // Here you would verify with actual payment gateway
    // For simulation, we'll consider payment successful
    const isVerified = true;
    
    if (isVerified) {
      await DynamoService.update(
        TABLE_NAMES.PAYMENTS,
        { paymentId },
        'SET #status = :status, #updatedAt = :updatedAt',
        {
          ':status': 'COMPLETED',
          ':updatedAt': new Date().toISOString()
        },
        { '#status': 'status', '#updatedAt': 'updatedAt' }
      );
      
      await DynamoService.update(
        TABLE_NAMES.ORDERS,
        { orderId: payment.orderId },
        'SET #status = :status, #updatedAt = :updatedAt',
        {
          ':status': OrderStatus.PAYMENT_COMPLETED,
          ':updatedAt': new Date().toISOString()
        },
        { '#status': 'status', '#updatedAt': 'updatedAt' }
      );
      
      // Publish payment completed event
      await SNSService.publish(
        SNS_TOPICS.PAYMENT_STATUS,
        {
          paymentId,
          orderId: payment.orderId,
          status: 'COMPLETED',
          amount: payment.amount
        },
        'Payment Completed'
      );
      
      return {
        success: true,
        paymentId,
        status: 'COMPLETED'
      };
    } else {
      await DynamoService.update(
        TABLE_NAMES.PAYMENTS,
        { paymentId },
        'SET #status = :status, #updatedAt = :updatedAt',
        {
          ':status': 'FAILED',
          ':updatedAt': new Date().toISOString()
        },
        { '#status': 'status', '#updatedAt': 'updatedAt' }
      );
      
      return {
        success: false,
        paymentId,
        status: 'FAILED'
      };
    }
  } catch (error) {
    Logger.error('Error verifying payment', error);
    throw error;
  }
};

// src/lambdas/payment/refundPayment.ts
export const refundPaymentHandler = async (event: any): Promise<any> => {
  try {
    const { paymentId, reason } = event;
    
    Logger.info('Processing refund', { paymentId, reason });
    
    const payment = await DynamoService.get(TABLE_NAMES.PAYMENTS, { paymentId });
    
    if (!payment) {
      throw new Error('Payment not found');
    }
    
    if (payment.status !== 'COMPLETED') {
      throw new Error('Can only refund completed payments');
    }
    
    // Here you would process refund with actual payment gateway
    // For simulation, we'll consider refund successful
    
    await DynamoService.update(
      TABLE_NAMES.PAYMENTS,
      { paymentId },
      'SET #status = :status, refundReason = :reason, #updatedAt = :updatedAt',
      {
        ':status': 'REFUNDED',
        ':reason': reason || 'Order cancelled',
        ':updatedAt': new Date().toISOString()
      },
      { '#status': 'status', '#updatedAt': 'updatedAt' }
    );
    
    await DynamoService.update(
      TABLE_NAMES.ORDERS,
      { orderId: payment.orderId },
      'SET #status = :status, #updatedAt = :updatedAt',
      {
        ':status': OrderStatus.REFUNDED,
        ':updatedAt': new Date().toISOString()
      },
      { '#status': 'status', '#updatedAt': 'updatedAt' }
    );
    
    // Notify user
    await SNSService.publish(
      SNS_TOPICS.USER_NOTIFICATION,
      {
        userId: payment.userId,
        orderId: payment.orderId,
        message: `Refund of ₹${payment.amount} has been processed`,
        paymentId
      },
      'Refund Processed'
    );
    
    return {
      success: true,
      paymentId,
      status: 'REFUNDED',
      amount: payment.amount
    };
  } catch (error) {
    Logger.error('Error processing refund', error);
    throw error;
  }
};

// ============================================================================
// DELIVERY LAMBDA FUNCTIONS
// ============================================================================

// src/lambdas/delivery/scheduleDelivery.ts
export const scheduleDeliveryHandler = async (event: any): Promise<any> => {
  try {
    const { orderId, userId, deliveryDate, deliverySlot, deliveryAddress, vendorIds } = event;
    
    Logger.info('Scheduling delivery', { orderId, deliveryDate });
    
    const delivery: Delivery = {
      deliveryId: uuidv4(),
      orderId,
      userId,
      vendorIds,
      deliveryDate,
      deliverySlot,
      status: 'SCHEDULED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await DynamoService.put(TABLE_NAMES.DELIVERIES, delivery);
    
    // Update order with delivery ID
    await DynamoService.update(
      TABLE_NAMES.ORDERS,
      { orderId },
      'SET deliveryId = :deliveryId, #status = :status, #updatedAt = :updatedAt',
      {
        ':deliveryId': delivery.deliveryId,
        ':status': OrderStatus.PREPARING,
        ':updatedAt': new Date().toISOString()
      },
      { '#status': 'status', '#updatedAt': 'updatedAt' }
    );
    
    // Notify user
    await SNSService.publish(
      SNS_TOPICS.USER_NOTIFICATION,
      {
        userId,
        orderId,
        message: `Your order is scheduled for delivery on ${deliveryDate} (${deliverySlot})`,
        deliveryId: delivery.deliveryId
      },
      'Delivery Scheduled'
    );
    
    return delivery;
  } catch (error) {
    Logger.error('Error scheduling delivery', error);
    throw error;
  }
};

// src/lambdas/delivery/updateDeliveryStatus.ts
export const updateDeliveryStatusHandler = async (event: any): Promise<any> => {
  try {
    const { deliveryId, status, driverId, actualDeliveryTime, deliveryProof } = event;
    
    Logger.info('Updating delivery status', { deliveryId, status });
    
    const updateFields: string[] = ['#status = :status', '#updatedAt = :updatedAt'];
    const expressionAttributeNames: any = { '#status': 'status', '#updatedAt': 'updatedAt' };
    const expressionAttributeValues: any = {
      ':status': status,
      ':updatedAt': new Date().toISOString()
    };
    
    if (driverId) {
      updateFields.push('driverId = :driverId');
      expressionAttributeValues[':driverId'] = driverId;
    }
    
    if (actualDeliveryTime) {
      updateFields.push('actualDeliveryTime = :actualDeliveryTime');
      expressionAttributeValues[':actualDeliveryTime'] = actualDeliveryTime;
    }
    
    if (deliveryProof) {
      updateFields.push('deliveryProof = :deliveryProof');
      expressionAttributeValues[':deliveryProof'] = deliveryProof;
    }
    
    const updateExpression = `SET ${updateFields.join(', ')}`;
    
    const updatedDelivery = await DynamoService.update(
      TABLE_NAMES.DELIVERIES,
      { deliveryId },
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );
    
    // Update order status based on delivery status
    let orderStatus = OrderStatus.PREPARING;
    if (status === 'IN_TRANSIT') {
      orderStatus = OrderStatus.OUT_FOR_DELIVERY;
    } else if (status === 'DELIVERED') {
      orderStatus = OrderStatus.DELIVERED;
    }
    
    await DynamoService.update(
      TABLE_NAMES.ORDERS,
      { orderId: updatedDelivery.orderId },
      'SET #status = :status, #updatedAt = :updatedAt',
      {
        ':status': orderStatus,
        ':updatedAt': new Date().toISOString()
      },
      { '#status': 'status', '#updatedAt': 'updatedAt' }
    );
    
    // Notify user
    await SNSService.publish(
      SNS_TOPICS.DELIVERY_UPDATE,
      {
        userId: updatedDelivery.userId,
        orderId: updatedDelivery.orderId,
        deliveryId,
        status,
        message: `Your delivery status: ${status}`
      },
      'Delivery Update'
    );
    
    return updatedDelivery;
  } catch (error) {
    Logger.error('Error updating delivery status', error);
    throw error;
  }
};

// src/lambdas/delivery/notifyDriver.ts
export const notifyDriverHandler = async (event: any): Promise<void> => {
  try {
    const { deliveryId, driverId, deliveryDetails } = event;
    
    Logger.info('Notifying driver', { deliveryId, driverId });
    
    // Here you would integrate with driver app API or send push notification
    // For now, we'll just log and send SNS notification
    
    await SNSService.publish(
      SNS_TOPICS.DELIVERY_UPDATE,
      {
        driverId,
        deliveryId,
        action: 'ASSIGNMENT',
        deliveryDetails
      },
      'New Delivery Assignment'
    );
    
    Logger.info('Driver notified successfully', { deliveryId, driverId });
  } catch (error) {
    Logger.error('Error notifying driver', error);
    throw error;
  }
};

// ============================================================================
// NOTIFICATION LAMBDA FUNCTIONS
// ============================================================================

// src/lambdas/notifications/sendUserNotification.ts
export const sendUserNotificationHandler = async (event: any): Promise<void> => {
  try {
    const records = event.Records || [event];
    
    for (const record of records) {
      const message = JSON.parse(record.Sns?.Message || JSON.stringify(record));
      const { userId, orderId, message: notificationMessage, subject } = message;
      
      Logger.info('Sending user notification', { userId, orderId });
      
      const user = await DynamoService.get(TABLE_NAMES.USERS, { userId });
      
      if (!user) {
        Logger.warn('User not found', { userId });
        continue;
      }
      
      // Send email
      await EmailService.sendEmail(
        user.email,
        subject || 'Order Update',
        notificationMessage
      );
      
      // Here you could also send SMS via SNS or push notification
      Logger.info('User notification sent', { userId, email: user.email });
    }
  } catch (error) {
    Logger.error('Error sending user notification', error);
    throw error;
  }
};

// src/lambdas/notifications/sendVendorNotification.ts
export const sendVendorNotificationHandler = async (event: any): Promise<void> => {
  try {
    const records = event.Records || [event];
    
    for (const record of records) {
      const message = JSON.parse(record.Sns?.Message || JSON.stringify(record));
      const { vendorId, orderId, items } = message;
      
      Logger.info('Sending vendor notification', { vendorId, orderId });
      
      const vendor = await DynamoService.get(TABLE_NAMES.VENDORS, { vendorId });
      
      if (!vendor) {
        Logger.warn('Vendor not found', { vendorId });
        continue;
      }
      
      const itemsList = items.map((item: any) => 
        `- ${item.quantity}x Product ${item.productId}`
      ).join('\n');
      
      await EmailService.sendEmail(
        vendor.email,
        'New Order Assignment',
        `You have been assigned a new order: ${orderId}\n\nItems:\n${itemsList}\n\nPlease log in to your dashboard for details.`
      );
      
      Logger.info('Vendor notification sent', { vendorId, email: vendor.email });
    }
  } catch (error) {
    Logger.error('Error sending vendor notification', error);
    throw error;
  }
};

// src/lambdas/notifications/sendAdminAlert.ts
export const sendAdminAlertHandler = async (event: any): Promise<void> => {
  try {
    const { alertType, message, severity, metadata } = event;
    
    Logger.info('Sending admin alert', { alertType, severity });
    
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@milkdelivery.com';
    
    await EmailService.sendEmail(
      adminEmail,
      `[${severity}] ${alertType}`,
      `${message}\n\nMetadata: ${JSON.stringify(metadata, null, 2)}`
    );
    
    Logger.info('Admin alert sent', { alertType });
  } catch (error) {
    Logger.error('Error sending admin alert', error);
    throw error;
  }
};

// ============================================================================
// REPORTING LAMBDA FUNCTIONS
// ============================================================================

// src/lambdas/reporting/generateDailyReport.ts
export const generateDailyReportHandler = async (event: any): Promise<any> => {
  try {
    Logger.info('Generating daily report');
    
    const today = new Date().toISOString().split('T')[0];
    
    // Get all orders for today
    const orders = await DynamoService.scan(
      TABLE_NAMES.ORDERS,
      'begins_with(createdAt, :today)',
      { ':today': today }
    );
    
    const report = {
      date: today,
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum: number, order: any) => sum + order.totalAmount, 0),
      ordersByStatus: {} as any,
      averageOrderValue: 0,
      topProducts: {} as any
    };
    
    // Calculate orders by status
    orders.forEach((order: any) => {
      report.ordersByStatus[order.status] = (report.ordersByStatus[order.status] || 0) + 1;
      
      // Count products
      order.items.forEach((item: any) => {
        report.topProducts[item.productId] = (report.topProducts[item.productId] || 0) + item.quantity;
      });
    });
    
    report.averageOrderValue = orders.length > 0 ? report.totalRevenue / orders.length : 0;
    
    Logger.info('Daily report generated', report);
    
    return report;
  } catch (error) {
    Logger.error('Error generating daily report', error);
    throw error;
  }
};

// src/lambdas/reporting/sendSummaryToAdmin.ts
export const sendSummaryToAdminHandler = async (event: any): Promise<void> => {
  try {
    const report = await generateDailyReportHandler(event);
    
    const emailBody = `
Daily Operations Summary - ${report.date}

Total Orders: ${report.totalOrders}
Total Revenue: ₹${report.totalRevenue.toFixed(2)}
Average Order Value: ₹${report.averageOrderValue.toFixed(2)}

Orders by Status:
${Object.entries(report.ordersByStatus).map(([status, count]) => `- ${status}: ${count}`).join('\n')}

Top Products:
${Object.entries(report.topProducts)
  .sort(([, a]: any, [, b]: any) => b - a)
  .slice(0, 5)
  .map(([productId, count]) => `- Product ${productId}: ${count} units`)
  .join('\n')}
    `;
    
    await EmailService.sendEmail(
      process.env.ADMIN_EMAIL || 'admin@milkdelivery.com',
      `Daily Summary - ${report.date}`,
      emailBody
    );
    
    Logger.info('Summary sent to admin');
  } catch (error) {
    Logger.error('Error sending summary to admin', error);
    throw error;
  }
};

// ============================================================================
// INVENTORY LAMBDA FUNCTIONS
// ============================================================================

// src/lambdas/inventory/updateStock.ts
export const updateStockHandler = async (event: any): Promise<any> => {
  try {
    const { productId, vendorId, variantId, quantity, operation } = event;
    
    Logger.info('Updating stock', { productId, vendorId, variantId, quantity, operation });
    
    const inventory = await DynamoService.get(TABLE_NAMES.INVENTORY, {
      productId,
      vendorId
    });
    
    if (!inventory) {
      // Create new inventory record
      const newInventory = {
        productId,
        vendorId,
        variants: [{
          variantId,
          stock: operation === 'ADD' ? quantity : 0
        }],
        lastUpdated: new Date().toISOString()
      };
      
      await DynamoService.put(TABLE_NAMES.INVENTORY, newInventory);
      return newInventory;
    }
    
    // Update existing inventory
    const variants = inventory.variants || [];
    const variantIndex = variants.findIndex((v: any) => v.variantId === variantId);
    
    if (variantIndex >= 0) {
      if (operation === 'ADD') {
        variants[variantIndex].stock += quantity;
      } else if (operation === 'SUBTRACT') {
        variants[variantIndex].stock = Math.max(0, variants[variantIndex].stock - quantity);
      } else if (operation === 'SET') {
        variants[variantIndex].stock = quantity;
      }
    } else {
      variants.push({
        variantId,
        stock: operation === 'ADD' || operation === 'SET' ? quantity : 0
      });
    }
    
    const updatedInventory = await DynamoService.update(
      TABLE_NAMES.INVENTORY,
      { productId, vendorId },
      'SET variants = :variants, lastUpdated = :lastUpdated',
      {
        ':variants': variants,
        ':lastUpdated': new Date().toISOString()
      }
    );
    
    Logger.info('Stock updated', { productId, vendorId, variantId });
    return updatedInventory;
  } catch (error) {
    Logger.error('Error updating stock', error);
    throw error;
  }
};

// src/lambdas/inventory/getInventorySummary.ts
export const getInventorySummaryHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const vendorId = event.pathParameters?.vendorId;
    
    if (vendorId) {
      // Get inventory for specific vendor
      const inventory = await DynamoService.query(
        TABLE_NAMES.INVENTORY,
        'vendorId = :vendorId',
        { ':vendorId': vendorId },
        'VendorIdIndex'
      );
      return successResponse(inventory);
    } else {
      // Get all inventory
      const inventory = await DynamoService.scan(TABLE_NAMES.INVENTORY);
      return successResponse(inventory);
    }
  } catch (error) {
    Logger.error('Error fetching inventory summary', error);
    return errorResponse(error);
  }
};

// src/lambdas/inventory/reconcileStock.ts
export const reconcileStockHandler = async (event: any): Promise<void> => {
  try {
    Logger.info('Starting stock reconciliation');
    
    const vendors = await DynamoService.scan(TABLE_NAMES.VENDORS);
    
    for (const vendor of vendors) {
      const inventory = await DynamoService.query(
        TABLE_NAMES.INVENTORY,
        'vendorId = :vendorId',
        { ':vendorId': vendor.vendorId },
        'VendorIdIndex'
      );
      
      // Check for low stock and alert
      for (const item of inventory) {
        for (const variant of item.variants) {
          if (variant.stock < 10) {
            await sendAdminAlertHandler({
              alertType: 'LOW_STOCK',
              message: `Low stock alert for product ${item.productId} at vendor ${vendor.vendorId}`,
              severity: 'WARNING',
              metadata: {
                productId: item.productId,
                vendorId: vendor.vendorId,
                variantId: variant.variantId,
                currentStock: variant.stock
              }
            });
          }
        }
      }
    }
    
    Logger.info('Stock reconciliation completed');
  } catch (error) {
    Logger.error('Error reconciling stock', error);
    throw error;
  }
};

// ============================================================================
// STEP FUNCTIONS STATE MACHINE DEFINITIONS
// ============================================================================

// src/step-functions/orderProcessingStateMachine.asl.json
export const orderProcessingStateMachine = {
  "Comment": "Order Processing State Machine",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:validateOrder",
      "Next": "AssignVendors",
      "Catch": [{
        "ErrorEquals": ["States.ALL"],
        "Next": "OrderFailed"
      }]
    },
    "AssignVendors": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:assignVendor",
      "Next": "CheckStockAvailability",
      "Catch": [{
        "ErrorEquals": ["States.ALL"],
        "Next": "VendorAssignmentFailed"
      }]
    },
    "CheckStockAvailability": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:checkStock",
      "Next": "StockAvailable?",
      "Catch": [{
        "ErrorEquals": ["States.ALL"],
        "Next": "StockCheckFailed"
      }]
    },
    "StockAvailable?": {
      "Type": "Choice",
      "Choices": [{
        "Variable": "$.available",
        "BooleanEquals": true,
        "Next": "InitiatePayment"
      }],
      "Default": "InsufficientStock"
    },
    "InitiatePayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:initiatePayment",
      "Next": "WaitForPayment",
      "Catch": [{
        "ErrorEquals": ["States.ALL"],
        "Next": "PaymentInitiationFailed"
      }]
    },
    "WaitForPayment": {
      "Type": "Wait",
      "Seconds": 300,
      "Next": "VerifyPayment"
    },
    "VerifyPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:verifyPayment",
      "Next": "PaymentSuccessful?",
      "Catch": [{
        "ErrorEquals": ["States.ALL"],
        "Next": "PaymentVerificationFailed"
      }]
    },
    "PaymentSuccessful?": {
      "Type": "Choice",
      "Choices": [{
        "Variable": "$.success",
        "BooleanEquals": true,
        "Next": "ScheduleDelivery"
      }],
      "Default": "PaymentFailed"
    },
    "ScheduleDelivery": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:scheduleDelivery",
      "Next": "UpdateOrderStatus",
      "Catch": [{
        "ErrorEquals": ["States.ALL"],
        "Next": "DeliverySchedulingFailed"
      }]
    },
    "UpdateOrderStatus": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:updateOrderStatus",
      "Next": "NotifyCustomer"
    },
    "NotifyCustomer": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:sendUserNotification",
      "Next": "OrderCompleted"
    },
    "OrderCompleted": {
      "Type": "Succeed"
    },
    "InsufficientStock": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:handleInsufficientStock",
      "Next": "OrderFailed"
    },
    "PaymentFailed": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:handlePaymentFailure",
      "Next": "OrderFailed"
    },
    "OrderFailed": {
      "Type": "Fail",
      "Error": "OrderProcessingFailed",
      "Cause": "Order could not be processed"
    },
    "VendorAssignmentFailed": {
      "Type": "Fail",
      "Error": "VendorAssignmentFailed",
      "Cause": "Could not assign vendors to order"
    },
    "StockCheckFailed": {
      "Type": "Fail",
      "Error": "StockCheckFailed",
      "Cause": "Could not verify stock availability"
    },
    "PaymentInitiationFailed": {
      "Type": "Fail",
      "Error": "PaymentInitiationFailed",
      "Cause": "Could not initiate payment"
    },
    "PaymentVerificationFailed": {
      "Type": "Fail",
      "Error": "PaymentVerificationFailed",
      "Cause": "Could not verify payment"
    },
    "DeliverySchedulingFailed": {
      "Type": "Fail",
      "Error": "DeliverySchedulingFailed",
      "Cause": "Could not schedule delivery"
    }
  }
};

// ============================================================================
// AWS SAM TEMPLATE
// ============================================================================

// infrastructure/templates/sam-template.yaml
export const samTemplate = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Milk Delivery Platform - Serverless Application

Globals:
  Function:
    Timeout: 30
    MemorySize: 512
    Runtime: nodejs18.x
    Environment:
      Variables:
        USERS_TABLE: !Ref UsersTable
        VENDORS_TABLE: !Ref VendorsTable
        PRODUCTS_TABLE: !Ref ProductsTable
        ORDERS_TABLE: !Ref OrdersTable
        PAYMENTS_TABLE: !Ref PaymentsTable
        DELIVERIES_TABLE: !Ref DeliveriesTable
        INVENTORY_TABLE: !Ref InventoryTable
        ORDER_CREATED_TOPIC: !Ref OrderCreatedTopic
        VENDOR_NOTIFICATION_TOPIC: !Ref VendorNotificationTopic
        USER_NOTIFICATION_TOPIC: !Ref UserNotificationTopic
        PAYMENT_STATUS_TOPIC: !Ref PaymentStatusTopic
        DELIVERY_UPDATE_TOPIC: !Ref DeliveryUpdateTopic
        ADMIN_ALERT_TOPIC: !Ref AdminAlertTopic

Resources:
  # DynamoDB Tables
  UsersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: milk-delivery-users
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
        - AttributeName: email
          AttributeType: S
      KeySchema:
        - AttributeName: userId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: EmailIndex
          KeySchema:
            - AttributeName: email
              KeyType: HASH
          Projection:
            ProjectionType: ALL

  VendorsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: milk-delivery-vendors
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: vendorId
          AttributeType: S
      KeySchema:
        - AttributeName: vendorId
          KeyType: HASH

  ProductsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: milk-delivery-products
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: productId
          AttributeType: S
        - AttributeName: category
          AttributeType: S
      KeySchema:
        - AttributeName: productId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: CategoryIndex
          KeySchema:
            - AttributeName: category
              KeyType: HASH
          Projection:
            ProjectionType: ALL

  OrdersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: milk-delivery-orders
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: orderId
          AttributeType: S
        - AttributeName: userId
          AttributeType: S
        - AttributeName: createdAt
          AttributeType: S
      KeySchema:
        - AttributeName: orderId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: UserIdIndex
          KeySchema:
            - AttributeName: userId
              KeyType: HASH
            - AttributeName: createdAt
              KeyType: RANGE
          Projection:
            ProjectionType: ALL

  PaymentsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: milk-delivery-payments
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: paymentId
          AttributeType: S
        - AttributeName: orderId
          AttributeType: S
      KeySchema:
        - AttributeName: paymentId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: OrderIdIndex
          KeySchema:
            - AttributeName: orderId
              KeyType: HASH
          Projection:
            ProjectionType: ALL

  DeliveriesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: milk-delivery-deliveries
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: deliveryId
          AttributeType: S
        - AttributeName: orderId
          AttributeType: S
        - AttributeName: deliveryDate
          AttributeType: S
      KeySchema:
        - AttributeName: deliveryId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: OrderIdIndex
          KeySchema:
            - AttributeName: orderId
              KeyType: HASH
          Projection:
            ProjectionType: ALL
        - IndexName: DeliveryDateIndex
          KeySchema:
            - AttributeName: deliveryDate
              KeyType: HASH
          Projection:
            ProjectionType: ALL

  InventoryTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: milk-delivery-inventory
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: productId
          AttributeType: S
        - AttributeName: vendorId
          AttributeType: S
      KeySchema:
        - AttributeName: productId
          KeyType: HASH
        - AttributeName: vendorId
          KeyType: RANGE
      GlobalSecondaryIndexes:
        - IndexName: VendorIdIndex
          KeySchema:
            - AttributeName: vendorId
              KeyType: HASH
          Projection:
            ProjectionType: ALL

  # SNS Topics
  OrderCreatedTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: order-created-topic
      DisplayName: Order Created Notifications

  VendorNotificationTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: vendor-notification-topic
      DisplayName: Vendor Notifications

  UserNotificationTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: user-notification-topic
      DisplayName: User Notifications

  PaymentStatusTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: payment-status-topic
      DisplayName: Payment Status Updates

  DeliveryUpdateTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: delivery-update-topic
      DisplayName: Delivery Updates

  AdminAlertTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: admin-alert-topic
      DisplayName: Admin Alerts

  # API Gateway
  ApiGateway:
    Type: AWS::Serverless::Api
    Properties:
      Name: MilkDeliveryAPI
      StageName: prod
      Cors:
        AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
        AllowHeaders: "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
        AllowOrigin: "'*'"
      Auth:
        DefaultAuthorizer: NONE

  # Lambda Functions - User Management
  CreateUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: createUser
      CodeUri: src/lambdas/user/
      Handler: createUser.handler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref UsersTable
      Events:
        CreateUser:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /users
            Method: POST

  GetUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: getUser
      CodeUri: src/lambdas/user/
      Handler: getUser.getUserHandler
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref UsersTable
      Events:
        GetUser:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /users/{userId}
            Method: GET

  UpdateUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: updateUser
      CodeUri: src/lambdas/user/
      Handler: updateUser.updateUserHandler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref UsersTable
      Events:
        UpdateUser:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /users/{userId}
            Method: PUT

  # Lambda Functions - Vendor Management
  CreateVendorFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: createVendor
      CodeUri: src/lambdas/vendor/
      Handler: createVendor.createVendorHandler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref VendorsTable
      Events:
        CreateVendor:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /vendors
            Method: POST

  ListVendorsFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: listVendors
      CodeUri: src/lambdas/vendor/
      Handler: listVendors.listVendorsHandler
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref VendorsTable
      Events:
        ListVendors:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /vendors
            Method: GET

  # Lambda Functions - Product Management
  CreateProductFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: createProduct
      CodeUri: src/lambdas/product/
      Handler: createProduct.createProductHandler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref ProductsTable
      Events:
        CreateProduct:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /products
            Method: POST

  ListProductsFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: listProducts
      CodeUri: src/lambdas/product/
      Handler: listProducts.listProductsHandler
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref ProductsTable
      Events:
        ListProducts:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /products
            Method: GET

  # Lambda Functions - Order Management
  CreateOrderFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: createOrder
      CodeUri: src/lambdas/order/
      Handler: createOrder.createOrderHandler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref OrdersTable
        - DynamoDBReadPolicy:
            TableName: !Ref ProductsTable
        - SNSPublishMessagePolicy:
            TopicName: !GetAtt OrderCreatedTopic.TopicName
        - Statement:
            - Effect: Allow
              Action:
                - states:StartExecution
              Resource: !Ref OrderProcessingStateMachine
      Events:
        CreateOrder:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /orders
            Method: POST

  GetOrderFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: getOrder
      CodeUri: src/lambdas/order/
      Handler: getOrderDetails.getOrderDetailsHandler
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref OrdersTable
        - DynamoDBReadPolicy:
            TableName: !Ref PaymentsTable
        - DynamoDBReadPolicy:
            TableName: !Ref DeliveriesTable
      Events:
        GetOrder:
          Type: Api
          Properties:
            RestApiId: !Ref ApiGateway
            Path: /orders/{orderId}
            Method: GET

  # Step Functions State Machine
  OrderProcessingStateMachine:
    Type: AWS::Serverless::StateMachine
    Properties:
      Name: OrderProcessingStateMachine
      DefinitionUri: src/step-functions/orderProcessingStateMachine.asl.json
      Role: !GetAtt StateMachineRole.Arn

  StateMachineRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: states.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaRole

  # EventBridge Rule for Daily Reports
  DailyReportRule:
    Type: AWS::Events::Rule
    Properties:
      Name: DailyReportSchedule
      Description: Trigger daily report generation
      ScheduleExpression: cron(0 1 * * ? *)
      State: ENABLED
      Targets:
        - Arn: !GetAtt GenerateDailyReportFunction.Arn
          Id: DailyReportTarget

  GenerateDailyReportFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: generateDailyReport
      CodeUri: src/lambdas/reporting/
      Handler: generateDailyReport.generateDailyReportHandler
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref OrdersTable

Outputs:
  ApiEndpoint:
    Description: API Gateway endpoint URL
    Value: !Sub 'https://${ApiGateway}.execute-api.${AWS::Region}.amazonaws.com/prod'
  
  StateMachineArn:
    Description: Order Processing State Machine ARN
    Value: !Ref OrderProcessingStateMachine
`;

// ============================================================================
// PACKAGE.JSON
// ============================================================================

export const packageJson = {
  "name": "milk-delivery-platform",
  "version": "1.0.0",
  "description": "Serverless milk delivery platform using AWS Lambda",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "deploy": "sam build && sam deploy --guided",
    "local": "sam local start-api"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.450.0",
    "@aws-sdk/lib-dynamodb": "^3.450.0",
    "@aws-sdk/client-sns": "^3.450.0",
    "@aws-sdk/client-ses": "^3.450.0",
    "@aws-sdk/client-sfn": "^3.450.0",
    "uuid": "^9.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.130",
    "@types/node": "^20.10.0",
    "@types/uuid": "^9.0.7",
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0"
  }
};

// ============================================================================
// TYPESCRIPT CONFIG
// ============================================================================

export const tsConfig = {
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
};

// ============================================================================
// README
// ============================================================================

export const readme = `
# Milk Delivery Platform

A serverless milk delivery platform built with AWS Lambda, DynamoDB, Step Functions, and API Gateway.

## Features

- User management (registration, profile updates)
- Vendor management (onboarding, service areas, capacity)
- Product catalog (milk, dairy products with variants)
- Order processing (placement, tracking, cancellation)
- Multi-vendor order assignment
- Payment integration (initiate, verify, refund)
- Delivery scheduling (next-day, slot-based)
- Real-time notifications (SNS, Email)
- Inventory management
- Daily reporting and analytics

## Architecture

- **API Gateway**: RESTful API endpoints
- **Lambda Functions**: Serverless compute for business logic
- **DynamoDB**: NoSQL database for all data
- **Step Functions**: Order processing workflow orchestration
- **SNS**: Event-driven notifications
- **SES**: Email notifications
- **EventBridge**: Scheduled tasks (daily reports)

## Setup

1. Install AWS SAM CLI
2. Install dependencies: \`npm install\`
3. Build: \`npm run build\`
4. Deploy: \`npm run deploy\`

## API Endpoints

### Users
- POST /users - Create user
- GET /users/{userId} - Get user details
- PUT /users/{userId} - Update user

### Vendors
- POST /vendors - Create vendor
- GET /vendors - List vendors
- GET /vendors/{vendorId} - Get vendor details
- PUT /vendors/{vendorId} - Update vendor
- DELETE /vendors/{vendorId} - Delete vendor

### Products
- POST /products - Create product
- GET /products - List products
- GET /products/{productId} - Get product details
- PUT /products/{productId} - Update product
- DELETE /products/{productId} - Delete product

### Orders
- POST /orders - Create order
- GET /orders/{orderId} - Get order details
- PUT /orders/{orderId}/cancel - Cancel order

## Environment Variables

- USERS_TABLE
- VENDORS_TABLE
- PRODUCTS_TABLE
- ORDERS_TABLE
- PAYMENTS_TABLE
- DELIVERIES_TABLE
- INVENTORY_TABLE
- ORDER_CREATED_TOPIC
- VENDOR_NOTIFICATION_TOPIC
- USER_NOTIFICATION_TOPIC
- ADMIN_EMAIL
- FROM_EMAIL

## Testing

Run tests: \`npm test\`

## License

MIT
```
