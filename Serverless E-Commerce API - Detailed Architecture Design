# Serverless E-Commerce API - Detailed Architecture Design

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [System Architecture Layers](#system-architecture-layers)
3. [AWS Services Breakdown](#aws-services-breakdown)
4. [Lambda Functions Design](#lambda-functions-design)
5. [DynamoDB Schema Design](#dynamodb-schema-design)
6. [API Gateway Configuration](#api-gateway-configuration)
7. [Authentication & Authorization](#authentication--authorization)
8. [CI/CD Pipeline](#cicd-pipeline)
9. [Monitoring & Logging](#monitoring--logging)
10. [Security Architecture](#security-architecture)
11. [Infrastructure as Code Structure](#infrastructure-as-code-structure)
12. [Deployment Strategy](#deployment-strategy)

---

## Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Applications                      │
│                    (Web/Mobile/Third-party APIs)                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Route 53 (DNS Management)                     │
│                   api.yourdomain.com                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              CloudFront (Optional - CDN/DDoS Protection)         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway (REST API)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • Request Validation    • Throttling    • API Keys       │  │
│  │ • CORS Configuration    • Caching       • Custom Domain  │  │
│  │ • JWT Authorizer        • Usage Plans   • WAF           │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
┌──────────────────────┐        ┌──────────────────────┐
│  Lambda Authorizer   │        │   Business Logic     │
│   (JWT Validation)   │        │   Lambda Functions   │
└──────────────────────┘        └──────┬───────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
         ┌──────────────────┐ ┌──────────────┐ ┌────────────────┐
         │    DynamoDB      │ │  S3 Bucket   │ │  SES (Email)   │
         │  (Single Table)  │ │  (Images)    │ │ (Notifications)│
         └──────────────────┘ └──────────────┘ └────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │  DynamoDB Stream │
         └──────┬───────────┘
                │
                ▼
         ┌──────────────────┐
         │ Stream Processor │
         │  Lambda Function │
         └──────────────────┘
```

### Architecture Characteristics

- **Fully Serverless**: No server management required
- **Auto-scaling**: Handles traffic spikes automatically
- **Pay-per-use**: Cost-effective pricing model
- **High Availability**: Multi-AZ deployment by default
- **Low Latency**: Edge-optimized API Gateway
- **Secure**: Multiple layers of security controls

---

## System Architecture Layers

### 1. Presentation Layer
- **API Gateway**: RESTful API endpoints
- **Custom Domain**: api.yourdomain.com
- **SSL/TLS**: AWS Certificate Manager (ACM)
- **CORS**: Configured for web applications

### 2. Security Layer
- **Lambda Authorizer**: JWT token validation
- **IAM Roles**: Least privilege access
- **API Keys**: For third-party integrations
- **WAF**: Web Application Firewall rules
- **Secrets Manager**: Secure credential storage

### 3. Application Layer
- **Lambda Functions**: Business logic execution
- **Lambda Layers**: Shared code and dependencies
- **Environment Variables**: Configuration management
- **VPC Configuration**: For enhanced security (optional)

### 4. Data Layer
- **DynamoDB**: Primary database (single-table design)
- **DynamoDB Streams**: Change data capture
- **S3**: Object storage for images/files
- **ElastiCache**: Redis for session management (optional)

### 5. Integration Layer
- **SES**: Email notifications
- **SNS**: Push notifications
- **EventBridge**: Event-driven architecture
- **Step Functions**: Complex workflows (optional)

### 6. Monitoring Layer
- **CloudWatch Logs**: Application logging
- **CloudWatch Metrics**: Performance metrics
- **CloudWatch Alarms**: Alerting
- **X-Ray**: Distributed tracing

---

## AWS Services Breakdown

### Core Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **API Gateway** | REST API management | Regional, stage-based deployment |
| **Lambda** | Compute execution | Node.js 20.x / Python 3.12 |
| **DynamoDB** | NoSQL database | On-demand billing mode |
| **S3** | Object storage | Versioning enabled, lifecycle policies |
| **CloudWatch** | Monitoring & logging | Log retention: 30 days |
| **IAM** | Access management | Principle of least privilege |

### Supporting Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Route 53** | DNS management | Hosted zone for custom domain |
| **ACM** | SSL certificates | Auto-renewal enabled |
| **Secrets Manager** | Secret storage | Automatic rotation (30 days) |
| **SES** | Email delivery | Verified domain and identities |
| **CloudFront** | CDN (optional) | Edge caching for global users |
| **WAF** | Security rules | Rate limiting, geo-blocking |

---

## Lambda Functions Design

### Function Inventory (10+ Functions)

#### 1. Authentication Functions

**Function: auth-register**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - JWT_SECRET (from Secrets Manager)
  - USER_TABLE_NAME
  - PASSWORD_SALT_ROUNDS
Triggers: API Gateway POST /auth/register
IAM Permissions:
  - dynamodb:PutItem
  - secretsmanager:GetSecretValue
Handler: src/handlers/auth/register.handler
```

**Function: auth-login**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - JWT_SECRET
  - USER_TABLE_NAME
  - JWT_EXPIRY
Triggers: API Gateway POST /auth/login
IAM Permissions:
  - dynamodb:Query
  - secretsmanager:GetSecretValue
Handler: src/handlers/auth/login.handler
```

**Function: auth-authorizer**
```yaml
Runtime: Node.js 20.x
Memory: 128 MB
Timeout: 5 seconds
Environment Variables:
  - JWT_SECRET
Type: TOKEN authorizer
Caching: 300 seconds
Handler: src/handlers/auth/authorizer.handler
```

#### 2. Product Management Functions

**Function: product-create**
```yaml
Runtime: Node.js 20.x
Memory: 512 MB
Timeout: 15 seconds
Environment Variables:
  - TABLE_NAME
  - S3_BUCKET_NAME
Triggers: API Gateway POST /products
IAM Permissions:
  - dynamodb:PutItem
  - s3:PutObject
Authorization: JWT Required (Admin role)
Handler: src/handlers/products/create.handler
```

**Function: product-list**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - TABLE_NAME
Triggers: API Gateway GET /products
IAM Permissions:
  - dynamodb:Query
  - dynamodb:Scan
Authorization: Public (with rate limiting)
Handler: src/handlers/products/list.handler
```

**Function: product-get**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - TABLE_NAME
Triggers: API Gateway GET /products/{id}
IAM Permissions:
  - dynamodb:GetItem
Authorization: Public
Handler: src/handlers/products/get.handler
```

**Function: product-update**
```yaml
Runtime: Node.js 20.x
Memory: 512 MB
Timeout: 15 seconds
Environment Variables:
  - TABLE_NAME
Triggers: API Gateway PUT /products/{id}
IAM Permissions:
  - dynamodb:UpdateItem
  - s3:PutObject
Authorization: JWT Required (Admin role)
Handler: src/handlers/products/update.handler
```

**Function: product-delete**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - TABLE_NAME
Triggers: API Gateway DELETE /products/{id}
IAM Permissions:
  - dynamodb:DeleteItem
Authorization: JWT Required (Admin role)
Handler: src/handlers/products/delete.handler
```

#### 3. Shopping Cart Functions

**Function: cart-add-item**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - TABLE_NAME
Triggers: API Gateway POST /cart/items
IAM Permissions:
  - dynamodb:UpdateItem
  - dynamodb:GetItem
Authorization: JWT Required
Handler: src/handlers/cart/addItem.handler
```

**Function: cart-get**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - TABLE_NAME
Triggers: API Gateway GET /cart
IAM Permissions:
  - dynamodb:Query
Authorization: JWT Required
Handler: src/handlers/cart/get.handler
```

**Function: cart-update-item**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - TABLE_NAME
Triggers: API Gateway PUT /cart/items/{itemId}
IAM Permissions:
  - dynamodb:UpdateItem
Authorization: JWT Required
Handler: src/handlers/cart/updateItem.handler
```

**Function: cart-remove-item**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - TABLE_NAME
Triggers: API Gateway DELETE /cart/items/{itemId}
IAM Permissions:
  - dynamodb:UpdateItem
Authorization: JWT Required
Handler: src/handlers/cart/removeItem.handler
```

#### 4. Order Management Functions

**Function: order-create**
```yaml
Runtime: Node.js 20.x
Memory: 512 MB
Timeout: 30 seconds
Environment Variables:
  - TABLE_NAME
  - PAYMENT_API_KEY (from Secrets Manager)
Triggers: API Gateway POST /orders
IAM Permissions:
  - dynamodb:TransactWriteItems
  - secretsmanager:GetSecretValue
  - sns:Publish (for notifications)
Authorization: JWT Required
Handler: src/handlers/orders/create.handler
```

**Function: order-get**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - TABLE_NAME
Triggers: API Gateway GET /orders/{id}
IAM Permissions:
  - dynamodb:GetItem
Authorization: JWT Required (own orders only)
Handler: src/handlers/orders/get.handler
```

**Function: order-list**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Environment Variables:
  - TABLE_NAME
Triggers: API Gateway GET /orders
IAM Permissions:
  - dynamodb:Query
Authorization: JWT Required
Handler: src/handlers/orders/list.handler
```

#### 5. Stream Processing Functions

**Function: stream-processor**
```yaml
Runtime: Node.js 20.x
Memory: 512 MB
Timeout: 60 seconds
Environment Variables:
  - TABLE_NAME
  - SES_FROM_EMAIL
Triggers: DynamoDB Stream
Batch Size: 100
Starting Position: LATEST
IAM Permissions:
  - dynamodb:GetRecords
  - dynamodb:GetShardIterator
  - dynamodb:DescribeStream
  - ses:SendEmail
Handler: src/handlers/streams/processor.handler
Purpose: Send email notifications on order creation
```

#### 6. Additional Support Functions

**Function: payment-mock**
```yaml
Runtime: Node.js 20.x
Memory: 256 MB
Timeout: 10 seconds
Purpose: Mock payment processing
Handler: src/handlers/payment/process.handler
```

### Lambda Layer Structure

**Layer 1: common-dependencies**
```
- aws-sdk
- jsonwebtoken
- bcryptjs
- joi (validation)
- uuid
```

**Layer 2: custom-utilities**
```
- src/utils/response.js
- src/utils/logger.js
- src/utils/validator.js
- src/utils/dynamodb-helper.js
```

---

## DynamoDB Schema Design

### Single-Table Design Pattern

**Table Name**: `ecommerce-table`

**Configuration**:
```yaml
Billing Mode: PAY_PER_REQUEST (On-Demand)
Point-in-Time Recovery: Enabled
Encryption: AWS Managed Keys
Stream: NEW_AND_OLD_IMAGES
TTL Attribute: expiresAt
```

### Primary Key Structure

```
Partition Key (PK): String
Sort Key (SK): String
```

### Entity Definitions

#### 1. User Entity
```
PK: USER#<userId>
SK: PROFILE
Attributes:
  - userId: string
  - email: string
  - passwordHash: string
  - firstName: string
  - lastName: string
  - role: string (customer/admin)
  - createdAt: string (ISO8601)
  - updatedAt: string (ISO8601)
  - GSI1PK: EMAIL#<email>
  - GSI1SK: USER
```

#### 2. Product Entity
```
PK: PRODUCT#<productId>
SK: METADATA
Attributes:
  - productId: string
  - name: string
  - description: string
  - price: number
  - currency: string
  - category: string
  - imageUrl: string
  - stock: number
  - isActive: boolean
  - createdAt: string
  - updatedAt: string
  - GSI1PK: CATEGORY#<category>
  - GSI1SK: PRODUCT#<productId>
```

#### 3. Cart Entity
```
PK: USER#<userId>
SK: CART#<productId>
Attributes:
  - userId: string
  - productId: string
  - quantity: number
  - addedAt: string
  - updatedAt: string
```

#### 4. Order Entity
```
PK: USER#<userId>
SK: ORDER#<orderId>
Attributes:
  - orderId: string
  - userId: string
  - items: array [
      {
        productId: string
        productName: string
        quantity: number
        price: number
      }
    ]
  - totalAmount: number
  - currency: string
  - status: string (pending/processing/completed/cancelled)
  - paymentId: string
  - shippingAddress: object
  - createdAt: string
  - updatedAt: string
  - GSI1PK: ORDER#<orderId>
  - GSI1SK: USER#<userId>
  - GSI2PK: STATUS#<status>
  - GSI2SK: ORDER#<timestamp>
```

#### 5. Order Items Entity
```
PK: ORDER#<orderId>
SK: ITEM#<productId>
Attributes:
  - orderId: string
  - productId: string
  - productName: string
  - quantity: number
  - price: number
  - subtotal: number
```

### Global Secondary Indexes (GSI)

**GSI1**: Email Lookup & Category Browse
```yaml
Name: GSI1
Partition Key: GSI1PK
Sort Key: GSI1SK
Projection: ALL
```

Access Patterns:
- Find user by email: `GSI1PK = EMAIL#<email>`
- List products by category: `GSI1PK = CATEGORY#<category>`

**GSI2**: Order Status Queries
```yaml
Name: GSI2
Partition Key: GSI2PK
Sort Key: GSI2SK
Projection: ALL
```

Access Patterns:
- List orders by status: `GSI2PK = STATUS#<status>`
- Time-based order queries: `GSI2SK begins_with ORDER#`

### Access Patterns Implementation

#### User Operations
```javascript
// Create User
PutItem: {
  PK: "USER#123",
  SK: "PROFILE",
  userId: "123",
  email: "user@example.com",
  GSI1PK: "EMAIL#user@example.com",
  GSI1SK: "USER",
  ...
}

// Get User by ID
GetItem: {
  Key: {
    PK: "USER#123",
    SK: "PROFILE"
  }
}

// Get User by Email (GSI1)
Query: {
  IndexName: "GSI1",
  KeyConditionExpression: "GSI1PK = :email",
  ExpressionAttributeValues: {
    ":email": "EMAIL#user@example.com"
  }
}
```

#### Product Operations
```javascript
// Create Product
PutItem: {
  PK: "PRODUCT#prod-001",
  SK: "METADATA",
  productId: "prod-001",
  name: "Laptop",
  category: "electronics",
  GSI1PK: "CATEGORY#electronics",
  GSI1SK: "PRODUCT#prod-001",
  ...
}

// Get Product
GetItem: {
  Key: {
    PK: "PRODUCT#prod-001",
    SK: "METADATA"
  }
}

// List Products by Category (GSI1)
Query: {
  IndexName: "GSI1",
  KeyConditionExpression: "GSI1PK = :category",
  ExpressionAttributeValues: {
    ":category": "CATEGORY#electronics"
  }
}

// Scan all products (for listing)
Scan: {
  FilterExpression: "begins_with(PK, :prefix)",
  ExpressionAttributeValues: {
    ":prefix": "PRODUCT#"
  }
}
```

#### Cart Operations
```javascript
// Add to Cart
PutItem: {
  PK: "USER#123",
  SK: "CART#prod-001",
  userId: "123",
  productId: "prod-001",
  quantity: 2,
  ...
}

// Get User's Cart
Query: {
  KeyConditionExpression: "PK = :userId AND begins_with(SK, :cart)",
  ExpressionAttributeValues: {
    ":userId": "USER#123",
    ":cart": "CART#"
  }
}

// Update Cart Item
UpdateItem: {
  Key: {
    PK: "USER#123",
    SK: "CART#prod-001"
  },
  UpdateExpression: "SET quantity = :qty, updatedAt = :now",
  ...
}

// Remove from Cart
DeleteItem: {
  Key: {
    PK: "USER#123",
    SK: "CART#prod-001"
  }
}
```

#### Order Operations
```javascript
// Create Order (Transaction)
TransactWriteItems: {
  TransactItems: [
    {
      Put: {
        TableName: "ecommerce-table",
        Item: {
          PK: "USER#123",
          SK: "ORDER#order-001",
          orderId: "order-001",
          GSI1PK: "ORDER#order-001",
          GSI1SK: "USER#123",
          GSI2PK: "STATUS#pending",
          GSI2SK: "ORDER#2024-10-07T10:30:00Z",
          ...
        }
      }
    },
    {
      Put: {
        TableName: "ecommerce-table",
        Item: {
          PK: "ORDER#order-001",
          SK: "ITEM#prod-001",
          ...
        }
      }
    },
    {
      Delete: {
        TableName: "ecommerce-table",
        Key: {
          PK: "USER#123",
          SK: "CART#prod-001"
        }
      }
    }
  ]
}

// Get Order
GetItem: {
  Key: {
    PK: "USER#123",
    SK: "ORDER#order-001"
  }
}

// List User Orders
Query: {
  KeyConditionExpression: "PK = :userId AND begins_with(SK, :order)",
  ExpressionAttributeValues: {
    ":userId": "USER#123",
    ":order": "ORDER#"
  },
  ScanIndexForward: false // Most recent first
}

// List Orders by Status (GSI2)
Query: {
  IndexName: "GSI2",
  KeyConditionExpression: "GSI2PK = :status",
  ExpressionAttributeValues: {
    ":status": "STATUS#pending"
  }
}
```

---

## API Gateway Configuration

### REST API Structure

**API Name**: `ecommerce-api`
**Protocol Type**: REST
**Endpoint Type**: Regional
**Stage**: `prod`, `dev`

### API Endpoints

#### Authentication Endpoints
```
POST   /auth/register          # Create new user account
POST   /auth/login             # User login (returns JWT)
POST   /auth/refresh           # Refresh JWT token
POST   /auth/logout            # User logout
GET    /auth/me                # Get current user profile
```

#### Product Endpoints
```
GET    /products               # List all products (public)
GET    /products/{id}          # Get product details (public)
POST   /products               # Create product (admin only)
PUT    /products/{id}          # Update product (admin only)
DELETE /products/{id}          # Delete product (admin only)
GET    /products/category/{cat} # List products by category
```

#### Cart Endpoints
```
GET    /cart                   # Get user's cart
POST   /cart/items             # Add item to cart
PUT    /cart/items/{itemId}    # Update cart item quantity
DELETE /cart/items/{itemId}    # Remove item from cart
DELETE /cart                   # Clear entire cart
```

#### Order Endpoints
```
POST   /orders                 # Create new order
GET    /orders                 # List user's orders
GET    /orders/{id}            # Get order details
PUT    /orders/{id}/cancel     # Cancel order
GET    /orders/{id}/status     # Get order status
```

#### User Profile Endpoints
```
GET    /users/profile          # Get user profile
PUT    /users/profile          # Update user profile
PUT    /users/password         # Change password
```

### Request/Response Models

#### Request Validation Models

**RegisterRequest Model**
```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": ["email", "password", "firstName", "lastName"],
  "properties": {
    "email": {
      "type": "string",
      "format": "email"
    },
    "password": {
      "type": "string",
      "minLength": 8
    },
    "firstName": {
      "type": "string",
      "minLength": 1
    },
    "lastName": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**ProductRequest Model**
```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": ["name", "price", "category"],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "description": {
      "type": "string"
    },
    "price": {
      "type": "number",
      "minimum": 0
    },
    "category": {
      "type": "string"
    },
    "stock": {
      "type": "integer",
      "minimum": 0
    }
  }
}
```

**OrderRequest Model**
```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": ["items", "shippingAddress", "paymentMethod"],
  "properties": {
    "items": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["productId", "quantity"],
        "properties": {
          "productId": {
            "type": "string"
          },
          "quantity": {
            "type": "integer",
            "minimum": 1
          }
        }
      }
    },
    "shippingAddress": {
      "type": "object",
      "required": ["street", "city", "postalCode", "country"],
      "properties": {
        "street": { "type": "string" },
        "city": { "type": "string" },
        "postalCode": { "type": "string" },
        "country": { "type": "string" }
      }
    },
    "paymentMethod": {
      "type": "object"
    }
  }
}
```

### CORS Configuration

```yaml
Access-Control-Allow-Origin: '*'  # Or specific domain in production
Access-Control-Allow-Methods: 'GET,POST,PUT,DELETE,OPTIONS'
Access-Control-Allow-Headers: 'Content-Type,Authorization,X-Api-Key'
Access-Control-Max-Age: 3600
```

### Throttling Configuration

**Default Throttling**:
```yaml
Rate Limit: 10,000 requests per second
Burst Limit: 5,000 requests
```

**Usage Plans**:

**Free Tier**:
```yaml
Rate: 100 requests/second
Burst: 200 requests
Quota: 100,000 requests/month
API Key Required: Yes
```

**Premium Tier**:
```yaml
Rate: 1,000 requests/second
Burst: 2,000 requests
Quota: 10,000,000 requests/month
API Key Required: Yes
```

### API Gateway Caching

```yaml
Cache Cluster Enabled: true
Cache Cluster Size: 0.5 GB
Cache TTL: 300 seconds (5 minutes)
Cache Key Parameters:
  - Query strings: category, page, limit
  - Path parameters: id
Encrypted: true
```

**Cacheable Endpoints**:
- GET /products
- GET /products/{id}
- GET /products/category/{category}

### Custom Domain Configuration

```yaml
Domain Name: api.yourdomain.com
Base Path Mapping: /v1 -> prod stage
Certificate: ACM Certificate (*.yourdomain.com)
Security Policy: TLS 1.2
```

---

## Authentication & Authorization

### JWT Token Strategy

**Token Structure**:
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "userId": "user-123",
    "email": "user@example.com",
    "role": "customer",
    "iat": 1696680000,
    "exp": 1696766400
  }
}
```

**Token Configuration**:
```yaml
Algorithm: HS256
Secret: Stored in AWS Secrets Manager
Access Token Expiry: 24 hours
Refresh Token Expiry: 7 days
Issuer: ecommerce-api
```

### Lambda Authorizer Implementation

**Authorizer Flow**:
```
1. Client sends request with Authorization header: "Bearer <token>"
2. API Gateway extracts token and invokes Lambda Authorizer
3. Authorizer validates token:
   - Verify signature
   - Check expiration
   - Validate issuer
   - Extract user claims
4. Authorizer returns IAM policy:
   - Allow: User authenticated, policy grants access
   - Deny: User unauthorized, policy denies access
5. API Gateway caches policy (5 minutes)
6. Request forwarded to backend Lambda with context
```

**IAM Policy Document** (Allow):
```json
{
  "principalId": "user-123",
  "policyDocument": {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Action": "execute-api:Invoke",
        "Effect": "Allow",
        "Resource": "arn:aws:execute-api:region:account:api-id/*"
      }
    ]
  },
  "context": {
    "userId": "user-123",
    "email": "user@example.com",
    "role": "customer"
  }
}
```

### Role-Based Access Control (RBAC)

**Roles**:
- **Customer**: Standard user operations
- **Admin**: Product management, view all orders

**Permission Matrix**:

| Endpoint | Customer | Admin |
|----------|----------|-------|
| POST /auth/register | ✓ | ✓ |
| POST /auth/login | ✓ | ✓ |
| GET /products | ✓ | ✓ |
| POST /products | ✗ | ✓ |
| PUT /products/{id} | ✗ | ✓ |
| DELETE /products/{id} | ✗ | ✓ |
| GET /cart | ✓ | ✓ |
| POST /cart/items | ✓ | ✓ |
| POST /orders | ✓ | ✓ |
| GET /orders | ✓ (own only) | ✓ (all) |

### Security Best Practices

1. **Password Storage**:
   - bcrypt hashing (12 rounds)
   - Salt per user
   - Never store plain text

2. **JWT Security**:
   - Strong secret (256-bit minimum)
   - Short expiration times
   - Refresh token rotation
   - Token revocation list (optional)

3. **API Key Management**:
   - Unique keys per client
   - Key rotation policy
   - Rate limiting per key
   - Usage tracking

---

## CI/CD Pipeline

### GitHub Actions Workflow

**File**: `.github/workflows/deploy.yml`

```yaml
name: Deploy Serverless E-Commerce API

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  AWS_REGION: us-east-1
  NODE_VERSION: '20.x'

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Generate coverage report
        run: npm run test:coverage
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/coverage-final.json

  security-scan:
    name: Security Scanning
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      
      - name: Run SAST scan
        run: npm audit --audit-level=moderate

  terraform-plan:
    name: Terraform Plan
    runs-on: ubuntu-latest
    needs: [test, security-scan]
    if: github.event_name == 'pull_request'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.6.0
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Terraform Init
        run: terraform init
        working-directory: ./terraform
      
      - name: Terraform Validate
        run: terraform validate
        working-directory: ./terraform
      
      - name: Terraform Plan
        run: terraform plan -out=tfplan
        working-directory: ./terraform
      
      - name: Comment PR with plan
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('./terraform/tfplan', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '## Terraform Plan\n```\n' + plan + '\n```'
            });

  deploy-dev:
    name: Deploy to Development
    runs-on: ubuntu-latest
    needs: [test, security-scan]
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    environment: development
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_DEV }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build Lambda functions
        run: npm run build
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.6.0
      
      - name: Terraform Init
        run: terraform init
        working-directory: ./terraform
        env:
          TF_WORKSPACE: development
      
      - name: Terraform Apply
        run: terraform apply -auto-approve
        working-directory: ./terraform
      
      - name: Run smoke tests
        run: npm run test:smoke
        env:
          API_URL: ${{ steps.terraform.outputs.api_url }}
      
      - name: Notify deployment
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Development deployment completed'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}

  deploy-prod:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [test, security-scan]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: 
      name: production
      url: https://api.yourdomain.com
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_PROD }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Install dependencies
        run: npm ci --production
      
      - name: Build Lambda functions
        run: npm run build
      
      - name: Create deployment package
        run: |
          mkdir -p dist
          zip -r dist/functions.zip src/ node_modules/ package.json
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.6.0
      
      - name: Terraform Init
        run: terraform init
        working-directory: ./terraform
        env:
          TF_WORKSPACE: production
      
      - name: Terraform Apply
        run: terraform apply -auto-approve
        working-directory: ./terraform
      
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          API_URL: ${{ steps.terraform.outputs.api_url }}
      
      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v${{ github.run_number }}
          release_name: Release ${{ github.run_number }}
          body: |
            Automated production deployment
            Commit: ${{ github.sha }}
      
      - name: Notify deployment
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Production deployment completed'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}

  rollback:
    name: Rollback Production
    runs-on: ubuntu-latest
    if: failure()
    needs: [deploy-prod]
    environment: production
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_PROD }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
      
      - name: Rollback Terraform
        run: |
          terraform init
          terraform apply -auto-approve -var="lambda_version=previous"
        working-directory: ./terraform
```

### Pipeline Stages Breakdown

**Stage 1: Testing** (5-10 minutes)
- Code checkout
- Dependency installation
- Linting
- Unit tests
- Integration tests
- Coverage reporting

**Stage 2: Security Scanning** (3-5 minutes)
- Dependency vulnerability scanning
- SAST analysis
- License compliance check

**Stage 3: Build & Package** (2-3 minutes)
- Lambda function compilation
- Dependency bundling
- Artifact creation

**Stage 4: Infrastructure Plan** (2-3 minutes)
- Terraform initialization
- Plan generation
- Cost estimation

**Stage 5: Deployment** (5-10 minutes)
- Infrastructure provisioning
- Lambda deployment
- API Gateway updates
- Configuration updates

**Stage 6: Post-Deployment** (3-5 minutes)
- Smoke tests
- Health checks
- Notification

### AWS OIDC Configuration

**IAM Role Trust Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/YOUR_REPO:*"
        }
      }
    }
  ]
}
```

**IAM Role Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "apigateway:*",
        "dynamodb:*",
        "s3:*",
        "iam:GetRole",
        "iam:PassRole",
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "logs:*",
        "cloudwatch:*",
        "secretsmanager:*"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Monitoring & Logging

### CloudWatch Configuration

#### Lambda Metrics

**Default Metrics**:
- Invocations
- Duration
- Errors
- Throttles
- Concurrent Executions
- Iterator Age (for stream processing)

**Custom Metrics**:
```javascript
// Example: Custom metric in Lambda function
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

async function publishMetric(metricName, value) {
  await cloudwatch.putMetricData({
    Namespace: 'EcommerceAPI',
    MetricData: [
      {
        MetricName: metricName,
        Value: value,
        Unit: 'Count',
        Timestamp: new Date()
      }
    ]
  }).promise();
}

// Usage
await publishMetric('OrderCreated', 1);
await publishMetric('CartItemAdded', 1);
await publishMetric('PaymentProcessed', 1);
```

#### CloudWatch Alarms

**Critical Alarms**:

```yaml
Lambda Error Alarm:
  Metric: Errors
  Threshold: > 10 errors in 5 minutes
  Action: SNS notification to on-call team
  
Lambda Throttle Alarm:
  Metric: Throttles
  Threshold: > 5 throttles in 5 minutes
  Action: SNS notification + auto-scaling trigger
  
API Gateway 5XX Alarm:
  Metric: 5XXError
  Threshold: > 1% error rate
  Action: SNS notification to on-call team
  
API Gateway Latency Alarm:
  Metric: Latency
  Threshold: p99 > 3000ms
  Action: SNS notification
  
DynamoDB Throttle Alarm:
  Metric: SystemErrors
  Threshold: > 0 in 5 minutes
  Action: Increase capacity or switch to on-demand
  
DynamoDB Read Capacity Alarm:
  Metric: ConsumedReadCapacityUnits
  Threshold: > 80% of provisioned
  Action: Auto-scaling or capacity increase
```

**Warning Alarms**:

```yaml
Lambda Duration Alarm:
  Metric: Duration
  Threshold: p95 > 2000ms
  Action: SNS notification for optimization
  
API Gateway 4XX Alarm:
  Metric: 4XXError
  Threshold: > 5% error rate
  Action: SNS notification
  
Cold Start Alarm:
  Metric: Custom - ColdStartCount
  Threshold: > 100 in 1 hour
  Action: Consider provisioned concurrency
```

### Structured Logging

**Log Format**:
```json
{
  "timestamp": "2024-10-07T10:30:45.123Z",
  "level": "INFO",
  "requestId": "abc123-def456",
  "userId": "user-123",
  "functionName": "order-create",
  "event": "ORDER_CREATED",
  "message": "Order created successfully",
  "metadata": {
    "orderId": "order-001",
    "totalAmount": 299.99,
    "itemCount": 3
  },
  "duration": 1234
}
```

**Log Levels**:
- ERROR: Critical issues requiring immediate attention
- WARN: Warning conditions that should be reviewed
- INFO: General informational messages
- DEBUG: Detailed debugging information (dev only)

**Logger Implementation**:
```javascript
class Logger {
  constructor(context) {
    this.requestId = context.requestId;
    this.functionName = context.functionName;
  }
  
  log(level, event, message, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      requestId: this.requestId,
      functionName: this.functionName,
      event,
      message,
      metadata
    };
    console.log(JSON.stringify(logEntry));
  }
  
  info(event, message, metadata) {
    this.log('INFO', event, message, metadata);
  }
  
  error(event, message, metadata) {
    this.log('ERROR', event, message, metadata);
  }
  
  warn(event, message, metadata) {
    this.log('WARN', event, message, metadata);
  }
}
```

### CloudWatch Logs Insights Queries

**Query 1: Error Analysis**
```sql
fields @timestamp, level, message, metadata.error
| filter level = "ERROR"
| sort @timestamp desc
| limit 100
```

**Query 2: Performance Analysis**
```sql
fields @timestamp, functionName, duration
| stats avg(duration), max(duration), min(duration) by functionName
| sort avg(duration) desc
```

**Query 3: User Activity**
```sql
fields @timestamp, userId, event, message
| filter userId = "user-123"
| sort @timestamp desc
```

**Query 4: Order Volume**
```sql
fields @timestamp
| filter event = "ORDER_CREATED"
| stats count() as OrderCount by bin(5m)
```

### X-Ray Tracing

**Configuration**:
```yaml
Lambda Functions:
  Tracing: Active
  
API Gateway:
  Tracing: Active
  
DynamoDB:
  Tracing: Enabled via SDK
```

**Custom Segments**:
```javascript
const AWSXRay = require('aws-xray-sdk-core');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));

async function processOrder(order) {
  const segment = AWSXRay.getSegment();
  const subsegment = segment.addNewSubsegment('ProcessOrder');
  
  try {
    subsegment.addAnnotation('orderId', order.id);
    subsegment.addAnnotation('userId', order.userId);
    
    // Process order
    const result = await createOrderInDB(order);
    
    subsegment.addMetadata('result', result);
    subsegment.close();
    
    return result;
  } catch (error) {
    subsegment.addError(error);
    subsegment.close();
    throw error;
  }
}
```

---

## Security Architecture

### Security Layers

#### 1. Network Security

**VPC Configuration** (Optional for enhanced security):
```yaml
VPC:
  CIDR: 10.0.0.0/16
  
Subnets:
  Private Subnet 1: 10.0.1.0/24 (us-east-1a)
  Private Subnet 2: 10.0.2.0/24 (us-east-1b)
  
Lambda VPC Configuration:
  SecurityGroups: [lambda-sg]
  Subnets: [private-subnet-1, private-subnet-2]
  
VPC Endpoints:
  - DynamoDB
  - S3
  - Secrets Manager
  - SES
```

**Security Groups**:
```yaml
Lambda Security Group:
  Ingress: None (Lambda initiates connections)
  Egress:
    - HTTPS (443) to VPC Endpoints
    - HTTPS (443) to Internet (via NAT Gateway)
```

#### 2. API Security

**AWS WAF Rules**:
```yaml
Rule 1: Rate Limiting
  Name: RateLimitRule
  Priority: 1
  Rule: Rate > 2000 requests per 5 minutes per IP
  Action: Block
  
Rule 2: Geographic Restrictions
  Name: GeoBlockRule
  Priority: 2
  Rule: Country NOT IN [allowed_countries]
  Action: Block
  
Rule 3: SQL Injection Protection
  Name: SQLiProtectionRule
  Priority: 3
  Rule: Contains SQL injection patterns
  Action: Block
  
Rule 4: XSS Protection
  Name: XSSProtectionRule
  Priority: 4
  Rule: Contains XSS patterns
  Action: Block
  
Rule 5: Bad Bot Protection
  Name: BotProtectionRule
  Priority: 5
  Rule: Known bad bot signatures
  Action: Block
```

#### 3. Data Security

**Encryption at Rest**:
```yaml
DynamoDB:
  Encryption: AWS Managed Keys (KMS)
  Key: alias/aws/dynamodb
  
S3:
  Encryption: AES-256
  Key Management: AWS Managed Keys
  
Lambda Environment Variables:
  Encryption: KMS Customer Managed Key
  Key: alias/ecommerce-lambda-key
  
CloudWatch Logs:
  Encryption: KMS
  Key: alias/ecommerce-logs-key
```

**Encryption in Transit**:
```yaml
API Gateway:
  TLS: 1.2 minimum
  Certificate: ACM
  
Lambda to DynamoDB:
  Protocol: HTTPS
  TLS: 1.2
  
Lambda to S3:
  Protocol: HTTPS
  TLS: 1.2
```

#### 4. Secrets Management

**AWS Secrets Manager Configuration**:
```yaml
Secrets:
  - Name: ecommerce/jwt/secret
    Value: <256-bit secret>
    Rotation: 30 days
    
  - Name: ecommerce/payment/api-key
    Value: <payment gateway API key>
    Rotation: Manual
    
  - Name: ecommerce/database/encryption-key
    Value: <encryption key>
    Rotation: 90 days
```

**Accessing Secrets in Lambda**:
```javascript
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

async function getSecret(secretName) {
  const data = await secretsManager.getSecretValue({
    SecretId: secretName
  }).promise();
  
  return JSON.parse(data.SecretString);
}

// Cache secrets for duration of Lambda execution
let jwtSecret = null;

async function getJWTSecret() {
  if (!jwtSecret) {
    const secret = await getSecret('ecommerce/jwt/secret');
    jwtSecret = secret.value;
  }
  return jwtSecret;
}
```

#### 5. IAM Policies

**Lambda Execution Role** (Principle of Least Privilege):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:region:account:table/ecommerce-table",
        "arn:aws:dynamodb:region:account:table/ecommerce-table/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:region:account:secret:ecommerce/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ses:FromAddress": "noreply@yourdomain.com"
        }
      }
    }
  ]
}
```

### Security Best Practices Checklist

- [ ] Enable MFA for AWS root account
- [ ] Use IAM roles, never access keys in code
- [ ] Enable CloudTrail for audit logging
- [ ] Enable GuardDuty for threat detection
- [ ] Implement AWS Config for compliance
- [ ] Use AWS Security Hub for security posture
- [ ] Regular security assessments and penetration testing
- [ ] Implement AWS Backup for disaster recovery
- [ ] Enable versioning on S3 buckets
- [ ] Use KMS Customer Managed Keys for sensitive data
- [ ] Implement least privilege access
- [ ] Regular key rotation
- [ ] Monitor and alert on security events
- [ ] Implement DDoS protection with Shield
- [ ] Use AWS WAF for application protection

---

## Infrastructure as Code Structure

### Terraform Project Structure

```
terraform/
├── main.tf                      # Root module
├── variables.tf                 # Input variables
├── outputs.tf                   # Output values
├── versions.tf                  # Terraform and provider versions
├── backend.tf                   # Remote state configuration
├── terraform.tfvars            # Variable values (gitignored)
├── terraform.tfvars.example    # Example variable values
│
├── modules/
│   ├── lambda/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── api-gateway/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── dynamodb/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   ├── s3/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   │
│   └── monitoring/
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       └── README.md
│
└── environments/
    ├── dev/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── terraform.tfvars
    │
    └── prod/
        ├── main.tf
        ├── variables.tf
        └── terraform.tfvars
```

### Root Module (main.tf)

```hcl
terraform {
  required_version = ">= 1.6.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket         = "ecommerce-terraform-state"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "ecommerce-api"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# DynamoDB Module
module "dynamodb" {
  source = "./modules/dynamodb"
  
  table_name     = "${var.project_name}-${var.environment}"
  billing_mode   = var.dynamodb_billing_mode
  hash_key       = "PK"
  range_key      = "SK"
  stream_enabled = true
  
  global_secondary_indexes = [
    {
      name            = "GSI1"
      hash_key        = "GSI1PK"
      range_key       = "GSI1SK"
      projection_type = "ALL"
    },
    {
      name            = "GSI2"
      hash_key        = "GSI2PK"
      range_key       = "GSI2SK"
      projection_type = "ALL"
    }
  ]
  
  tags = var.tags
}

# Lambda Functions Module
module "lambda_functions" {
  source = "./modules/lambda"
  
  for_each = var.lambda_functions
  
  function_name = "${var.project_name}-${var.environment}-${each.key}"
  handler       = each.value.handler
  runtime       = var.lambda_runtime
  memory_size   = each.value.memory_size
  timeout       = each.value.timeout
  
  source_dir = "${path.module}/../src/handlers/${each.value.path}"
  
  environment_variables = merge(
    {
      TABLE_NAME      = module.dynamodb.table_name
      ENVIRONMENT     = var.environment
      LOG_LEVEL       = var.log_level
    },
    each.value.environment_variables
  )
  
  layers = [
    module.lambda_layer_dependencies.layer_arn,
    module.lambda_layer_utilities.layer_arn
  ]
  
  tags = var.tags
}

# API Gateway Module
module "api_gateway" {
  source = "./modules/api-gateway"
  
  api_name    = "${var.project_name}-${var.environment}"
  description = "E-Commerce API"
  
  lambda_functions = {
    for name, config in var.lambda_functions :
    name => module.lambda_functions[name].function_arn
  }
  
  authorizer_function_arn = module.lambda_functions["auth-authorizer"].function_arn
  
  custom_domain = var.custom_domain_enabled ? {
    domain_name     = var.domain_name
    certificate_arn = var.certificate_arn
  } : null
  
  cors_configuration = {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Api-Key"]
  }
  
  throttling = {
    rate_limit  = var.api_rate_limit
    burst_limit = var.api_burst_limit
  }
  
  tags = var.tags
}

# S3 Bucket Module
module "s3_bucket" {
  source = "./modules/s3"
  
  bucket_name = "${var.project_name}-${var.environment}-assets"
  
  versioning_enabled = true
  
  lifecycle_rules = [
    {
      id      = "delete-old-versions"
      enabled = true
      noncurrent_version_expiration_days = 90
    }
  ]
  
  cors_rules = [
    {
      allowed_origins = var.cors_allowed_origins
      allowed_methods = ["GET", "PUT", "POST"]
      allowed_headers = ["*"]
      max_age_seconds = 3000
    }
  ]
  
  tags = var.tags
}

# CloudWatch Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"
  
  project_name = var.project_name
  environment  = var.environment
  
  lambda_functions = {
    for name, lambda in module.lambda_functions :
    name => {
      function_name = lambda.function_name
      function_arn  = lambda.function_arn
    }
  }
  
  api_gateway_id   = module.api_gateway.api_id
  api_gateway_name = module.api_gateway.api_name
  
  dynamodb_table_name = module.dynamodb.table_name
  
  alarm_email = var.alarm_email
  
  tags = var.tags
}
```

### Lambda Module (modules/lambda/main.tf)

```hcl
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${path.module}/lambda_${var.function_name}.zip"
}

resource "aws_lambda_function" "this" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = var.function_name
  role            = aws_iam_role.lambda_role.arn
  handler         = var.handler
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime         = var.runtime
  memory_size     = var.memory_size
  timeout         = var.timeout
  
  layers = var.layers
  
  environment {
    variables = var.environment_variables
  }
  
  tracing_config {
    mode = var.tracing_enabled ? "Active" : "PassThrough"
  }
  
  dynamic "vpc_config" {
    for_each = var.vpc_config != null ? [var.vpc_config] : []
    content {
      subnet_ids         = vpc_config.value.subnet_ids
      security_group_ids = vpc_config.value.security_group_ids
    }
  }
  
  tags = var.tags
}

resource "aws_iam_role" "lambda_role" {
  name = "${var.function_name}-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
  
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.function_name}-policy"
  role = aws_iam_role.lambda_role.id
  
  policy = var.iam_policy_document
}

resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  
  tags = var.tags
}
```
