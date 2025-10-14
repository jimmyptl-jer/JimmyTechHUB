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
