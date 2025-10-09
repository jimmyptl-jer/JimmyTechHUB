Decoded:

Header:
{
  "alg": "RS256",  // Algorithm (Cognito uses RS256)
  "kid": "abc123",  // Key ID
  "typ": "JWT"
}

Payload (Claims):
{
  "sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  // User ID
  "email": "user@example.com",
  "email_verified": true,
  "name": "John Doe",
  "phone_number": "+1234567890",
  "cognito:username": "john.doe",
  "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_aBcDeFgHi",
  "aud": "1a2b3c4d5e6f7g8h9i0j",  // App Client ID
  "token_use": "id",  // id or access
  "auth_time": 1633048800,  // Authentication time
  "iat": 1633048800,  // Issued at
  "exp": 1633052400   // Expires at
}

Signature:
// Signed with Cognito's private key
// Verified with public key from JWKS endpoint
```

**Token Types:**
```
ID Token:
├── Contains user attributes (email, name)
├── Use for: Getting user information
└── Sent to frontend, displayed in UI

Access Token:
├── Contains user permissions/groups
├── Use for: Authorization (API requests)
└── Sent to API Gateway in Authorization header

Refresh Token:
├── Long-lived (30 days)
├── Use for: Getting new access/ID tokens
└── Stored securely on client
```

### 9.3 API Gateway Authorizer

**Cognito Authorizer Configuration:**
```yaml
MilkDeliveryApi:
  Type: AWS::Serverless::Api
  Properties:
    StageName: dev
    Auth:
      DefaultAuthorizer: CognitoAuthorizer
      Authorizers:
        CognitoAuthorizer:
          UserPoolArn: !GetAtt UserPool.Arn
          Identity:
            Header: Authorization  # Where to find token
            ValidationExpression: '^Bearer [-0-9a-zA-z\.]***BatchGetItem:**
```
Purpose: Retrieve multiple items in one request

Limitations:
├── Max 100 items per request
├── Max 16 MB total response size
├── Items can be from different tables
└── Returns in any order (not sorted)

Example: Get multiple products by ID
const productIds = ['prod-1', 'prod-2', 'prod-3'];

const result = await docClient.batchGet({
  RequestItems: {
    'Products': {
      Keys: productIds.map(id => ({ productId: id }))
    }
  }
});

// Result
{
  Responses: {
    Products: [
      { productId: 'prod-1', name: 'Milk', price: 50 },
      { productId: 'prod-2', name: 'Yogurt', price: 30 },
      { productId: 'prod-3', name: 'Cheese', price: 100 }
    ]
  },
  UnprocessedKeys: {}  // Empty if all items retrieved
}

Handling UnprocessedKeys:
// If some items couldn't be retrieved (throttling)
if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0) {
  // Retry with exponential backoff
  await new Promise(resolve => setTimeout(resolve, 1000));
  const retryResult = await docClient.batchGet({
    RequestItems: result.UnprocessedKeys
  });
}

Cost Comparison:
├── Individual GetItem: 3 requests * 1 RCU = 3 RCUs
├── BatchGetItem: 1 request * 3 RCUs = 3 RCUs
└── Performance: BatchGetItem is faster (single network call)
```

**BatchWriteItem:**
```
Purpose: Write/delete multiple items in one request

Limitations:
├── Max 25 items per request
├── Cannot update items (only put/delete)
├── No conditional expressions
└── Partial failures possible

Example: Create multiple order items
const items = [
  { orderId: 'order-1', userId: 'user-123', total: 100 },
  { orderId: 'order-2', userId: 'user-123', total: 200 },
  { orderId: 'order-3', userId: 'user-456', total: 150 }
];

await docClient.batchWrite({
  RequestItems: {
    'Orders': items.map(item => ({
      PutRequest: { Item: item }
    }))
  }
});

Delete multiple items:
const orderIdsToDelete = ['order-1', 'order-2'];

await docClient.batchWrite({
  RequestItems: {
    'Orders': orderIdsToDelete.map(id => ({
      DeleteRequest: {
        Key: { orderId: id }
      }
    }))
  }
});

Warning: BatchWriteItem is NOT atomic
├── Some items may succeed, others fail
├── Check UnprocessedItems in response
└── Implement retry logic for failures
```

### 7.4 Transactions (Atomic Operations)

**TransactWriteItems:**
```
Purpose: All-or-nothing writes across multiple items/tables

Use Cases:
├── Transfer funds between accounts
├── Reserve inventory + create order
├── Update multiple related records
└── Any operation requiring atomicity

Limitations:
├── Max 100 items per transaction (25 for DynamoDB standard)
├── Max 4 MB total transaction size
├── Higher cost: 2x WCU compared to regular writes
└── Cannot span across regions

Example: Create order + reserve inventory (atomic)
try {
  await docClient.transactWrite({
    TransactItems: [
      {
        Put: {
          TableName: 'Orders',
          Item: {
            orderId: 'order-123',
            userId: 'user-456',
            status: 'Pending',
            totalAmount: 250
          },
          ConditionExpression: 'attribute_not_exists(orderId)'
        }
      },
      {
        Update: {
          TableName: 'Inventory',
          Key: {
            vendorId: 'vendor-001',
            productId: 'prod-milk-500ml'
          },
          UpdateExpression: 'SET reserved = reserved + :qty, stock = stock - :qty',
          ConditionExpression: 'stock >= :qty',
          ExpressionAttributeValues: {
            ':qty': 5
          }
        }
      },
      {
        Update: {
          TableName: 'Users',
          Key: { userId: 'user-456' },
          UpdateExpression: 'SET orderCount = orderCount + :inc',
          ExpressionAttributeValues: {
            ':inc': 1
          }
        }
      }
    ]
  });
  
  console.log('Transaction succeeded - all items updated');
  
} catch (error) {
  if (error.name === 'TransactionCanceledException') {
    console.error('Transaction failed - no items were updated');
    
    // Check which condition failed
    error.CancellationReasons.forEach((reason, index) => {
      if (reason.Code === 'ConditionalCheckFailed') {
        console.error(`Item ${index} failed condition check`);
      }
    });
  }
}

Cost Example:
├── Regular write: 3 items * 1 WCU = 3 WCUs
├── Transaction: 3 items * 2 WCU = 6 WCUs
└── Trade-off: 2x cost for guaranteed atomicity
```

**TransactGetItems:**
```
Purpose: Read multiple items with snapshot isolation

Use Case: Ensure consistent view of related data

Example: Get order with current inventory status
const result = await docClient.transactGet({
  TransactItems: [
    {
      Get: {
        TableName: 'Orders',
        Key: { orderId: 'order-123' }
      }
    },
    {
      Get: {
        TableName: 'Inventory',
        Key: {
          vendorId: 'vendor-001',
          productId: 'prod-milk-500ml'
        }
      }
    }
  ]
});

// All items read at the same point in time
const order = result.Responses[0].Item;
const inventory = result.Responses[1].Item;

Cost: 2x RCU compared to regular reads
```

### 7.5 DynamoDB Best Practices for Your Project

**1. Table Design Strategy**
```
Single Table Design vs Multiple Tables:

For Learning Project: Use Multiple Tables (simpler)
├── Users table
├── Products table
├── Orders table
├── Inventory table
└── Vendors table

Advantages:
├── Easier to understand
├── Simpler queries
├── Better for learning
└── Good for MVP

Single Table Design (Advanced):
├── One table for all entities
├── Uses generic PK/SK (e.g., PK: ENTITY#ID, SK: METADATA)
├── Reduces number of tables
└── More complex, use after mastering basics

Your Recommendation: Start with multiple tables
```

**2. Naming Conventions**
```
Table Names:
├── Pattern: {project}-{entity}-{environment}
├── Example: milk-delivery-users-dev
└── SAM: Use !Sub for environment substitution

Attribute Names:
├── Use camelCase: userId, createdAt, totalAmount
├── Avoid reserved words: Use ExpressionAttributeNames
└── Be consistent across all tables

Index Names:
├── Pattern: {attribute}-index
├── Example: email-index, status-createdAt-index
└── Descriptive and clear purpose
```

**3. Data Modeling Patterns**

**Pattern 1: One-to-Many Relationship**
```
Example: User has many orders

Option A: Composite Key (Recommended)
Orders Table:
PK: userId, SK: orderId
├── user-123, order-2025-001
├── user-123, order-2025-002
└── user-123, order-2025-003

Query: Get all orders for user
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: { ':uid': 'user-123' }
});

Option B: GSI
Orders Table:
PK: orderId, GSI: userId-index
└── Query via GSI

Choose Option A for main access pattern
Choose Option B if orderId lookups are more common
```

**Pattern 2: Many-to-Many Relationship**
```
Example: Orders can have multiple products, products in multiple orders

Solution: Junction Table
OrderItems Table:
PK: orderId, SK: productId
├── order-001, prod-milk
├── order-001, prod-yogurt
├── order-002, prod-milk
└── order-002, prod-cheese

Query: Get all products in an order
await docClient.query({
  TableName: 'OrderItems',
  KeyConditionExpression: 'orderId = :oid',
  ExpressionAttributeValues: { ':oid': 'order-001' }
});

Query: Get all orders containing a product (use GSI)
GSI: productId-orderId-index
await docClient.query({
  TableName: 'OrderItems',
  IndexName: 'productId-orderId-index',
  KeyConditionExpression: 'productId = :pid',
  ExpressionAttributeValues: { ':pid': 'prod-milk' }
});
```

**Pattern 3: Time-Series Data**
```
Example: Order history, tracking updates

Orders Table:
PK: userId, SK: createdAt#orderId
├── user-123, 2025-10-01T10:00:00Z#order-001
├── user-123, 2025-10-05T14:30:00Z#order-002
└── user-123, 2025-10-09T09:15:00Z#order-003

Benefits:
├── Natural sort by date
├── Range queries (get orders between dates)
└── Easy pagination

Query: Get orders in date range
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid AND #sk BETWEEN :start AND :end',
  ExpressionAttributeNames: {
    '#sk': 'createdAt#orderId'  // Sort key
  },
  ExpressionAttributeValues: {
    ':uid': 'user-123',
    ':start': '2025-10-01',
    ':end': '2025-10-10'
  }
});
```

**4. Pagination**
```
Problem: Query returns many items, don't load all at once

Solution: Use ExclusiveStartKey

Implementation:
async function getPaginatedOrders(userId: string, limit = 20, nextToken?: string) {
  const params: any = {
    TableName: 'Orders',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: {
      ':uid': userId
    },
    Limit: limit,
    ScanIndexForward: false  // Sort descending (newest first)
  };
  
  if (nextToken) {
    params.ExclusiveStartKey = JSON.parse(
      Buffer.from(nextToken, 'base64').toString()
    );
  }
  
  const result = await docClient.query(params);
  
  const response: any = {
    items: result.Items,
    count: result.Count
  };
  
  if (result.LastEvaluatedKey) {
    response.nextToken = Buffer.from(
      JSON.stringify(result.LastEvaluatedKey)
    ).toString('base64');
  }
  
  return response;
}

API Response:
{
  "items": [...],
  "count": 20,
  "nextToken": "eyJvcmRlcklkIjoib3JkZXItMDIwIn0="
}

Next Request:
GET /orders?limit=20&nextToken=eyJvcmRlcklkIjoib3JkZXItMDIwIn0=
```

**5. Conditional Expressions**
```
Use Cases:
├── Prevent overwriting existing items
├── Optimistic locking (version control)
├── Business logic enforcement
└── Race condition prevention

Example 1: Create only if not exists
await docClient.put({
  TableName: 'Orders',
  Item: order,
  ConditionExpression: 'attribute_not_exists(orderId)'
});
// Throws ConditionalCheckFailedException if orderId exists

Example 2: Update only if version matches (optimistic locking)
await docClient.update({
  TableName: 'Orders',
  Key: { orderId: 'order-123' },
  UpdateExpression: 'SET #status = :newStatus, #version = :newVersion',
  ConditionExpression: '#version = :currentVersion',
  ExpressionAttributeNames: {
    '#status': 'status',
    '#version': 'version'
  },
  ExpressionAttributeValues: {
    ':newStatus': 'Delivered',
    ':newVersion': 2,
    ':currentVersion': 1
  }
});
// Fails if another process updated version to 2 already

Example 3: Decrement only if sufficient quantity
await docClient.update({
  TableName: 'Inventory',
  Key: { vendorId: 'vendor-001', productId: 'prod-milk' },
  UpdateExpression: 'SET stock = stock - :qty',
  ConditionExpression: 'stock >= :qty',
  ExpressionAttributeValues: {
    ':qty': 5
  }
});
// Prevents negative stock
```

### 7.6 Common DynamoDB Errors & Solutions

**1. ProvisionedThroughputExceededException**
```
Cause: Exceeded 25 WCU or 25 RCU limit

Solutions:
├── Use on-demand billing (auto-scales, recommended for learning)
├── Implement exponential backoff (AWS SDK does this automatically)
├── Optimize queries (reduce data scanned)
└── Check for hot partitions (one partition getting all requests)

SAM Template Fix:
UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    BillingMode: PAY_PER_REQUEST  # Auto-scales, no throttling
    # OR
    BillingMode: PROVISIONED
    ProvisionedThroughput:
      ReadCapacityUnits: 5
      WriteCapacityUnits: 5
```

**2. ValidationException: One or more parameter values were invalid**
```
Cause: Incorrect data types or missing required attributes

Common Mistakes:
├── Using Number type for String attribute
├── Missing partition key in PutItem
├── Invalid attribute names (reserved words)
└── Malformed key schema

Solution: Double-check attribute types
await docClient.put({
  TableName: 'Orders',
  Item: {
    orderId: 'order-123',  // String
    userId: 'user-456',    // String
    totalAmount: 250,      // Number (not "250")
    createdAt: new Date().toISOString()  // String (ISO format)
  }
});
```

**3. ConditionalCheckFailedException**
```
Cause: ConditionExpression evaluated to false

Example:
try {
  await docClient.put({
    TableName: 'Orders',
    Item: order,
    ConditionExpression: 'attribute_not_exists(orderId)'
  });
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    return {
      statusCode: 409,
      body: JSON.stringify({
        error: 'Conflict',
        message: 'Order already exists'
      })
    };
  }
}
```

**4. ResourceNotFoundException**
```
Cause: Table or index doesn't exist

Common Causes:
├── Table not created yet (deployment still in progress)
├── Wrong table name (typo or wrong environment variable)
├── GSI name misspelled
└── Cross-region access (table in different region)

Debugging:
console.log('Table name:', process.env.ORDERS_TABLE);  // Check env var
console.log('Region:', process.env.AWS_REGION);        // Check region

Solution: Verify in AWS Console
├── DynamoDB → Tables → Check table exists
└── Check table ARN matches expected region
```

**5. ItemCollectionSizeLimitExceededException**
```
Cause: Partition size exceeded 10 GB

Occurs when:
├── Too many items with same partition key
└── Using Local Secondary Index (LSI)

Solution:
├── Redesign partition key (add more granularity)
├── Use composite key differently
└── For your learning project: Unlikely to hit this limit
```

---

## 8. API GATEWAY: CONFIGURATION & TESTING

### 8.1 REST API vs HTTP API

**Comparison:**
```
REST API (Choose for learning):
├── More features: Request validation, caching, API keys
├── Better for learning AWS concepts
├── Integrates with AWS WAF (firewall)
├── Cost: $3.50 per million requests (after free tier)
└── Free Tier: 1M requests/month (12 months)

HTTP API (Simpler, newer):
├── Lower cost: $1.00 per million requests
├── Faster (lower latency)
├── Simpler configuration
├── Limited features
└── No free tier

Recommendation: Use REST API for your project
```

### 8.2 Request/Response Transformations

**Request Mapping Template:**
```
Use Case: Transform incoming request before Lambda receives it

Example: Add metadata to request
VTL Template (Velocity Template Language):
{
  "body": $input.json('   await dynamodb.transactWrite(params);
   // Either both succeed or both fail (atomicity)
   
   Test Case 5: User Cancels Order During Processing
   Scenario: Order created, Step Functions running, user clicks "Cancel"
   
   Implementation:
   ├── Check current order status
   ├── If status = "Pending": Allow cancellation
   ├── If status = "Processing": Check Step Functions execution
   ├── Stop execution: stepFunctions.stopExecution()
   ├── Release inventory
   └── Update order status: "Cancelled"
   
   Test Case 6: Invalid JWT Token
   Scenario: User sends expired or tampered token
   
   API Gateway Authorizer handles:
   ├── Validates JWT signature
   ├── Checks expiration
   ├── Verifies issuer (Cognito User Pool)
   └── Returns 401 Unauthorized if invalid
   
   Lambda never receives request with invalid token
   
   Test Case 7: DynamoDB Throttling
   Scenario: Free tier limits exceeded (25 WCU/RCU)
   
   Symptoms:
   ├── ProvisionedThroughputExceededException
   ├── Lambda returns 500 error
   └── Operations fail
   
   Solution:
   ├── Use exponential backoff (built into AWS SDK)
   ├── Implement retry logic in Lambda
   ├── Monitor CloudWatch metrics
   └── Consider on-demand billing (scales automatically)
   
   Implementation:
   const dynamodbWithRetry = DynamoDBDocumentClient.from(client, {
     retryMode: 'adaptive',
     maxAttempts: 3
   });
   
   Test Case 8: Large Order (100+ items)
   Scenario: User tries to order 100 different products
   
   Considerations:
   ├── Lambda execution time: May exceed 10s timeout
   ├── DynamoDB batch size: Max 25 items per BatchGetItem
   ├── API Gateway payload: Max 10 MB
   └── Step Functions payload: Max 256 KB
   
   Solutions:
   ├── Set maximum items per order: 50
   ├── Validate in API Gateway request validator
   ├── Batch DynamoDB operations properly
   └── Use S3 for large payloads if needed (advanced)

Afternoon Session (1.5 hours)

2. Implement Idempotency
   
   Problem: User clicks "Place Order" twice
   ├── Network delay, no response
   ├── User clicks again
   └── Two orders created for same cart
   
   Solution: Idempotency Keys
   
   Request Header:
   Idempotency-Key: <unique-client-generated-uuid>
   
   Implementation:
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent) => {
     const idempotencyKey = event.headers['idempotency-key'] || 
                            event.headers['Idempotency-Key'];
     
     if (!idempotencyKey) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'MissingIdempotencyKey',
           message: 'Idempotency-Key header is required'
         })
       };
     }
     
     // Check if order with this key already exists
     const existingOrder = await dynamodb.query({
       TableName: ORDERS_TABLE,
       IndexName: 'idempotency-key-index',
       KeyConditionExpression: 'idempotencyKey = :key',
       ExpressionAttributeValues: {
         ':key': idempotencyKey
       }
     });
     
     if (existingOrder.Items && existingOrder.Items.length > 0) {
       // Order already created, return existing order
       return {
         statusCode: 200,
         body: JSON.stringify(existingOrder.Items[0])
       };
     }
     
     // Create new order with idempotency key
     const order = {
       ...orderData,
       idempotencyKey
     };
     
     await dynamodb.put({
       TableName: ORDERS_TABLE,
       Item: order,
       ConditionExpression: 'attribute_not_exists(idempotencyKey)'
     });
     
     return {
       statusCode: 201,
       body: JSON.stringify(order)
     };
   };
   
   DynamoDB Table Update (template.yaml):
   OrdersTable:
     GlobalSecondaryIndexes:
       - IndexName: idempotency-key-index
         KeySchema:
           - AttributeName: idempotencyKey
             KeyType: HASH
         Projection:
           ProjectionType: ALL

3. Implement Circuit Breaker Pattern
   
   Problem: Downstream service (payment gateway) is down
   ├── Every request times out
   ├── Lambda execution time wasted
   ├── Poor user experience
   └── Increased costs
   
   Solution: Circuit Breaker
   
   States:
   ├── CLOSED: Normal operation, requests pass through
   ├── OPEN: Too many failures, reject requests immediately
   └── HALF_OPEN: Test if service recovered
   
   Implementation:
   File: src/shared/circuitBreaker.ts
   
   class CircuitBreaker {
     private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
     private failureCount = 0;
     private failureThreshold = 5;
     private timeout = 60000; // 1 minute
     private lastFailureTime?: number;
     
     async execute<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'OPEN') {
         if (Date.now() - this.lastFailureTime! > this.timeout) {
           this.state = 'HALF_OPEN';
         } else {
           throw new Error('Circuit breaker is OPEN');
         }
       }
       
       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
     
     private onSuccess() {
       this.failureCount = 0;
       this.state = 'CLOSED';
     }
     
     private onFailure() {
       this.failureCount++;
       this.lastFailureTime = Date.now();
       
       if (this.failureCount >= this.failureThreshold) {
         this.state = 'OPEN';
       }
     }
   }
   
   Usage:
   const paymentCircuitBreaker = new CircuitBreaker();
   
   try {
     const paymentResult = await paymentCircuitBreaker.execute(async () => {
       return await stripeClient.charges.create({...});
     });
   } catch (error) {
     if (error.message === 'Circuit breaker is OPEN') {
       return {
         statusCode: 503,
         body: JSON.stringify({
           error: 'ServiceUnavailable',
           message: 'Payment service is temporarily unavailable. Please try again later.'
         })
       };
     }
   }

4. Comprehensive Error Response Structure
   
   Standardized Error Format:
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Human-readable message",
       "details": {
         "field": "specificField",
         "reason": "Detailed reason"
       },
       "requestId": "req-abc-123",
       "timestamp": "2025-10-09T10:30:00Z",
       "retryable": boolean,
       "documentation": "https://docs.milkdelivery.com/errors/ERROR_CODE"
     }
   }
   
   Error Codes Catalog:
   ├── VALIDATION_ERROR (400)
   ├── UNAUTHORIZED (401)
   ├── FORBIDDEN (403)
   ├── RESOURCE_NOT_FOUND (404)
   ├── CONFLICT (409)
   ├── RATE_LIMIT_EXCEEDED (429)
   ├── INTERNAL_SERVER_ERROR (500)
   ├── SERVICE_UNAVAILABLE (503)
   └── GATEWAY_TIMEOUT (504)
   
   Implementation:
   File: src/shared/errors.ts
   
   export class AppError extends Error {
     constructor(
       public code: string,
       public message: string,
       public statusCode: number,
       public details?: any,
       public retryable: boolean = false
     ) {
       super(message);
       this.name = 'AppError';
     }
     
     toJSON() {
       return {
         error: {
           code: this.code,
           message: this.message,
           details: this.details,
           requestId: 'Set by Lambda context',
           timestamp: new Date().toISOString(),
           retryable: this.retryable,
           documentation: `https://docs.milkdelivery.com/errors/${this.code}`
         }
       };
     }
   }
   
   export class ValidationError extends AppError {
     constructor(message: string, field?: string) {
       super('VALIDATION_ERROR', message, 400, { field });
     }
   }
   
   export class InsufficientStockError extends AppError {
     constructor(productId: string, available: number, requested: number) {
       super(
         'INSUFFICIENT_STOCK',
         `Product has only ${available} units available`,
         400,
         { productId, available, requested }
       );
     }
   }
   
   Usage in Lambda:
   try {
     // ... validation logic
     if (stock < requestedQty) {
       throw new InsufficientStockError(productId, stock, requestedQty);
     }
   } catch (error) {
     if (error instanceof AppError) {
       return {
         statusCode: error.statusCode,
         body: JSON.stringify(error.toJSON())
       };
     }
     
     // Unknown error
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: {
           code: 'INTERNAL_SERVER_ERROR',
           message: 'An unexpected error occurred',
           requestId: context.requestId,
           timestamp: new Date().toISOString()
         }
       })
     };
   }

5. Logging Best Practices
   
   Structured Logging Format:
   {
     "timestamp": "2025-10-09T10:30:00.123Z",
     "level": "INFO|WARN|ERROR",
     "requestId": "req-abc-123",
     "userId": "user-456",
     "action": "CREATE_ORDER",
     "message": "Order created successfully",
     "context": {
       "orderId": "order-xyz-789",
       "totalAmount": 239.5,
       "itemCount": 2
     },
     "duration": 1234,
     "memoryUsed": 128
   }
   
   Implementation:
   File: src/shared/logger.ts
   
   export class Logger {
     private context: Record<string, any> = {};
     
     setContext(key: string, value: any) {
       this.context[key] = value;
     }
     
     info(message: string, data?: Record<string, any>) {
       this.log('INFO', message, data);
     }
     
     warn(message: string, data?: Record<string, any>) {
       this.log('WARN', message, data);
     }
     
     error(message: string, error?: Error, data?: Record<string, any>) {
       this.log('ERROR', message, {
         ...data,
         error: error?.message,
         stack: error?.stack
       });
     }
     
     private log(level: string, message: string, data?: Record<string, any>) {
       const logEntry = {
         timestamp: new Date().toISOString(),
         level,
         message,
         ...this.context,
         ...data
       };
       
       console.log(JSON.stringify(logEntry));
     }
   }
   
   Usage in Lambda:
   export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
     const logger = new Logger();
     logger.setContext('requestId', context.requestId);
     logger.setContext('functionName', context.functionName);
     
     const startTime = Date.now();
     
     try {
       logger.info('Order creation started', {
         userId: extractUserId(event)
       });
       
       const order = await createOrder(body);
       
       logger.info('Order created successfully', {
         orderId: order.orderId,
         totalAmount: order.totalAmount,
         duration: Date.now() - startTime
       });
       
       return successResponse(order);
     } catch (error) {
       logger.error('Order creation failed', error as Error, {
         userId: extractUserId(event),
         duration: Date.now() - startTime
       });
       
       return errorResponse(error);
     }
   };

Learning Outcome:
├── Edge cases identified and handled
├── Idempotency implemented
├── Circuit breaker pattern understood
├── Error handling standardized
├── Logging best practices applied
└── Production-ready code quality
```

---

## 6. LAMBDA FUNCTIONS: DEEP DIVE

### 6.1 Lambda Execution Model

**Cold Start vs Warm Start:**
```
Cold Start (First Invocation or After Idle):
├── AWS provisions execution environment
├── Downloads function code from S3
├── Initializes runtime (Node.js)
├── Executes initialization code (outside handler)
├── Executes handler function
└── Duration: 1-3 seconds (varies)

Warm Start (Subsequent Invocations):
├── Reuses existing execution environment
├── Skips initialization
├── Executes handler function only
└── Duration: 10-100 milliseconds

Optimization Strategy:
├── Initialize clients outside handler
├── Reuse database connections
├── Cache static data
└── Keep functions "warm" (CloudWatch Events ping)
```

**Example: Optimized Lambda Structure**
```typescript
// ✅ GOOD: Initialize outside handler
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Cache configuration (loaded once)
const config = {
  ordersTable: process.env.ORDERS_TABLE,
  minOrderValue: 100,
  taxRate: 0.05
};

export const handler = async (event, context) => {
  // Handler executes quickly, reusing connections
  const result = await docClient.get({
    TableName: config.ordersTable,
    Key: { orderId: event.pathParameters.orderId }
  });
  
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};

// ❌ BAD: Initialize inside handler
export const handler = async (event, context) => {
  const client = new DynamoDBClient({});  // Created every time!
  const docClient = DynamoDBDocumentClient.from(client);
  
  const result = await docClient.get({...});
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};
```

### 6.2 Memory and Timeout Configuration

**Memory Size Impact:**
```
Memory Configuration Options: 128 MB to 10,240 MB (10 GB)

Cost Calculation:
├── Price: $0.0000166667 per GB-second
├── 128 MB = 0.125 GB
├── Example: 1 million requests, 1 second each
│   ├── 128 MB: 1M * 1s * 0.125 GB * $0.0000166667 = $2.08
│   ├── 256 MB: 1M * 1s * 0.25 GB * $0.0000166667 = $4.17
│   ├── 512 MB: 1M * 1s * 0.5 GB * $0.0000166667 = $8.33
│   └── 1024 MB: 1M * 1s * 1 GB * $0.0000166667 = $16.67

Important: CPU power scales with memory
├── 128 MB = Low CPU power (slow execution)
├── 1024 MB = Proportional CPU (4x faster)
└── Paradox: Higher memory can be cheaper (faster execution)

Example Scenario:
├── Function with 128 MB: 2 seconds execution
│   └── Cost: 2s * 0.125 GB * $0.0000166667 = $0.0000041667
├── Same function with 512 MB: 0.6 seconds execution
│   └── Cost: 0.6s * 0.5 GB * $0.0000166667 = $0.0000050000
└── Verdict: 128 MB is cheaper in this case

Optimization Process:
1. Start with 512 MB (good balance)
2. Monitor CloudWatch metrics:
   ├── Duration
   ├── Memory Used
   └── Throttles
3. Adjust based on actual usage:
   ├── If memory used < 50%: Reduce memory
   ├── If duration consistently high: Increase memory
   └── Run load tests to find optimal setting

Your Learning Project:
├── Simple queries (getUser): 256 MB, 5s timeout
├── Order creation: 512 MB, 10s timeout
├── Image processing: 1024 MB, 30s timeout
└── Batch operations: 1024 MB, 60s timeout
```

**Timeout Configuration:**
```
Default: 3 seconds
Maximum: 15 minutes (900 seconds)
Recommendation: Set slightly higher than expected duration

Examples:
├── Simple CRUD: 5-10 seconds
├── API calls to third-party: 15-30 seconds
├── Complex calculations: 30-60 seconds
└── Batch processing: 5-15 minutes

Warning: Long timeouts increase cost if function hangs
├── Always implement timeout handling in code
└── Don't rely solely on Lambda timeout
```

### 6.3 Environment Variables & Secrets

**Environment Variables (SAM Template):**
```yaml
CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Environment:
      Variables:
        ORDERS_TABLE: !Ref OrdersTable
        USERS_TABLE: !Ref UsersTable
        MIN_ORDER_VALUE: '100'
        TAX_RATE: '0.05'
        STAGE: dev
        LOG_LEVEL: INFO
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'  # Reuse HTTP connections
```

**Secrets Management:**
```
❌ NEVER store sensitive data in environment variables:
├── API keys
├── Database passwords
├── Private keys
└── OAuth tokens

✅ Use AWS Secrets Manager:

1. Store secret:
$ aws secretsmanager create-secret \
  --name milk-delivery/stripe-api-key \
  --secret-string '{"apiKey":"sk_test_..."}'

2. Grant Lambda permission (SAM template):
CreateOrderFunction:
  Policies:
    - AWSSecretsManagerGetSecretValuePolicy:
        SecretArn: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:milk-delivery/*'

3. Retrieve in Lambda:
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretName: string) {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString!);
}

// Cache secret (avoid fetching on every invocation)
let stripeKey: string;

export const handler = async (event) => {
  if (!stripeKey) {
    const secret = await getSecret('milk-delivery/stripe-api-key');
    stripeKey = secret.apiKey;
  }
  
  // Use stripeKey
};

Cost: $0.40 per secret per month + $0.05 per 10,000 API calls
For learning: ~$0.40/month (1 secret, minimal calls)
```

### 6.4 Lambda Layers (Code Reuse)

**When to Use Layers:**
```
Use Cases:
├── Shared dependencies (AWS SDK, lodash, axios)
├── Common utilities (logger, validation, db helpers)
├── Large libraries (reduce deployment package size)
└── Code reuse across multiple functions

Benefits:
├── Faster deployments (layer unchanged, only function code updates)
├── Smaller deployment packages
├── Easier dependency management
└── Version control for shared code

Limitations:
├── Max 5 layers per function
├── Max 250 MB unzipped (all layers + function)
├── Layers are immutable (create new version to update)
```

**Creating a Lambda Layer:**
```
Directory Structure:
backend/
└── layers/
    └── common/
        ├── nodejs/
        │   ├── node_modules/  ← Dependencies
        │   └── utils/         ← Your utilities
        │       ├── logger.ts
        │       ├── db.ts
        │       └── validation.ts
        └── package.json

package.json:
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.400.0",
    "@aws-sdk/lib-dynamodb": "^3.400.0",
    "uuid": "^9.0.0"
  }
}

Build Layer:
$ cd layers/common/nodejs
$ npm install
$ cd ../..
$ zip -r common-layer.zip nodejs/

SAM Template:
CommonLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: milk-delivery-common
    Description: Shared utilities and dependencies
    ContentUri: layers/common/
    CompatibleRuntimes:
      - nodejs20.x
    RetentionPolicy: Retain

CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref CommonLayer
    CodeUri: dist/

Usage in Lambda:
// Import from layer
import { logger } from '/opt/nodejs/utils/logger';
import { v4 as uuidv4 } from 'uuid';  // From layer dependencies

export const handler = async (event) => {
  logger.info('Function started');
  const id = uuidv4();
  // ...
};
```

### 6.5 Lambda Monitoring Metrics

**Key CloudWatch Metrics:**
```
1. Invocations
   ├── Count: Total number of invocations
   ├── Use: Track function usage
   └── Free Tier: 1M invocations/month

2. Duration
   ├── Measure: Execution time in milliseconds
   ├── Use: Identify slow functions
   └── Optimization target: Keep under 1 second

3. Errors
   ├── Count: Failed invocations
   ├── Types: Function errors, timeout errors
   └── Goal: < 1% error rate

4. Throttles
   ├── Count: Rejected due to concurrency limits
   ├── Causes: Too many concurrent executions
   └── Solution: Increase reserved concurrency or optimize

5. Memory Usage
   ├── Measure: Actual memory used
   ├── Use: Right-size memory configuration
   └── Example: If using 150 MB of 512 MB, reduce to 256 MB

6. Concurrent Executions
   ├── Measure: Number of instances running simultaneously
   ├── Default limit: 1000 per region
   └── Free tier limit: Usually sufficient for learning

CloudWatch Logs Insights Queries:

Query 1: Average duration by function
fields @timestamp, @duration
| stats avg(@duration) as avg_duration by @function
| sort avg_duration desc

Query 2: Error count
filter @type = "ERROR"
| stats count() as error_count by bin(5m)

Query 3: Memory usage
fields @timestamp, @memorySize / 1000 / 1000 as mem_mb, @maxMemoryUsed / 1000 / 1000 as used_mb
| stats avg(used_mb) as avg_used, max(used_mb) as max_used

Query 4: Cold starts
filter @type = "REPORT"
| fields @duration, @initDuration
| filter ispresent(@initDuration)
| stats count() as cold_starts, avg(@initDuration) as avg_cold_start_ms
```

### 6.6 Lambda Cost Optimization

**Free Tier Maximization:**
```
Lambda Free Tier (Always Free):
├── 1M requests per month
├── 400,000 GB-seconds compute time per month

Calculation Examples:

Scenario 1: 128 MB function, 200ms execution
├── Compute: 0.2s * 0.125 GB = 0.025 GB-seconds per request
├── Free tier allows: 400,000 / 0.025 = 16M requests
├── But request limit is 1M, so effective limit: 1M requests
└── Verdict: Request limit is constraint, not compute

Scenario 2: 1024 MB function, 1s execution
├── Compute: 1s * 1 GB = 1 GB-second per request
├── Free tier allows: 400,000 / 1 = 400,000 requests
├── But request limit is 1M
└── Verdict: Compute is constraint, only 400K requests free

Your Learning Project Estimate:
├── Average: 512 MB, 500ms execution
├── Compute per request: 0.5s * 0.5 GB = 0.25 GB-seconds
├── Free tier allows: 400,000 / 0.25 = 1.6M requests
├── Your usage: ~10,000 requests/month during development
└── Cost: $0 (well within free tier)

Cost After Free Tier:
├── Requests: $0.20 per 1M requests
├── Compute: $0.0000166667 per GB-second
└── Your 10K requests: ~$0.02/month

Optimization Tips:
1. Reduce memory if not fully utilized
2. Optimize code for faster execution
3. Use layers for shared dependencies
4. Implement caching where possible
5. Batch operations when feasible
6. Monitor and eliminate unnecessary invocations
```

---

## 7. DYNAMODB: QUERY PATTERNS & OPTIMIZATION

### 7.1 Key Concepts

**Partition Key (PK) vs Sort Key (SK):**
```
Partition Key (Required):
├── Determines which partition data is stored in
├── Must be unique for each item (if no sort key)
├── Used for direct lookups: GetItem, PutItem
└── Example: userId, orderId, productId

Sort Key (Optional):
├── Allows multiple items with same partition key
├── Items sorted by sort key value
├── Enables range queries
└── Example: timestamp, status, category

Table Design Pattern 1: Simple (PK only)
Users Table:
PK: userId
├── user-001
├── user-002
└── user-003

Query: Get user by ID
const result = await docClient.get({
  TableName: 'Users',
  Key: { userId: 'user-001' }
});

Table Design Pattern 2: Composite Key (PK + SK)
Orders Table:
PK: userId, SK: orderId
├── user-001, order-2025-001
├── user-001, order-2025-002
├── user-002, order-2025-003
└── user-002, order-2025-004

Query: Get all orders for a user
const result = await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-001'
  }
});

Result: Returns order-2025-001 and order-2025-002
```

**Global Secondary Index (GSI):**
```
Purpose: Query table using different keys

Example Problem:
Users Table: PK = userId
├── You can query by userId
└── But you cannot query by email

Solution: Create GSI on email

GSI: email-index
PK: email
├── Allows query by email
└── Returns userId

Query: Find user by email
const result = await docClient.query({
  TableName: 'Users',
  IndexName: 'email-index',
  KeyConditionExpression: 'email = :email',
  ExpressionAttributeValues: {
    ':email': 'user@example.com'
  }
});

GSI Considerations:
├── Cost: Consumes additional WCU/RCU
├── Eventual consistency: Slight delay (usually milliseconds)
├── Projection: Choose ALL, KEYS_ONLY, or INCLUDE
└── Free Tier: Included in 25 WCU/RCU limit

SAM Template:
UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    AttributeDefinitions:
      - AttributeName: userId
        AttributeType: S
      - AttributeName: email
        AttributeType: S
    KeySchema:
      - AttributeName: userId
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: email-index
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        Projection:
          ProjectionType: ALL
    BillingMode: PAY_PER_REQUEST
```

### 7.2 Query vs Scan

**Query (Efficient):**
```
Characteristics:
├── Uses partition key (required)
├── Optionally uses sort key for range
├── Returns only matching items
├── Fast and cost-effective
└── Use whenever possible

Example: Get all orders for a user
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-123'
  }
});

Cost: 1 RCU per 4 KB read (eventually consistent)
Example: 10 orders, 1 KB each = 10 KB = 3 RCUs
```

**Scan (Inefficient):**
```
Characteristics:
├── Reads entire table
├── Filters after reading (wasteful)
├── Slow and expensive
├── Consumes RCUs for all items scanned
└── Avoid in production

Example: Find all orders with status="Pending" (BAD!)
await docClient.scan({
  TableName: 'Orders',
  FilterExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Problem:
├── Scans all 10,000 orders
├── Filters to 100 pending orders
├── Consumes RCUs for all 10,000 items
└── Returns only 100 items

Cost: If 10,000 items * 1 KB = 10,000 KB = 2,500 RCUs
(Way over free tier 25 RCU limit!)

Solution: Use GSI
Create GSI: status-index (PK: status, SK: createdAt)

Query with GSI:
await docClient.query({
  TableName: 'Orders',
  IndexName: 'status-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Cost: Only reads 100 pending orders = 25 RCUs
Savings: 100x reduction!
```

### 7.3 Batch Operations

**BatchGetItem:**
```
Purpose: Retrieve multiple items in one request

Limitations:
├── Max 100 items per request
├── Max 16 MB total response# SOLO DEVELOPER GUIDE - AWS FREE TIER OPTIMIZED
## Milk & Milk Products Delivery Platform (Comprehensive Learning Project)

---

## TABLE OF CONTENTS
1. [Solo Developer Workflow & Mindset](#solo-developer-workflow-mindset)
2. [AWS Free Tier: Complete Strategy](#aws-free-tier-complete-strategy)
3. [Development Environment Setup](#development-environment-setup)
4. [Hybrid Development: Console + VS Code](#hybrid-development-console-vs-code)
5. [Feature Development Flow (Step-by-Step)](#feature-development-flow)
6. [Lambda Functions: Deep Dive](#lambda-functions-deep-dive)
7. [DynamoDB: Query Patterns & Optimization](#dynamodb-query-patterns-optimization)
8. [API Gateway: Configuration & Testing](#api-gateway-configuration-testing)
9. [Authentication & Authorization](#authentication-authorization)
10. [Error Handling & Edge Cases](#error-handling-edge-cases)
11. [Testing Strategies](#testing-strategies)
12. [Monitoring & Debugging](#monitoring-debugging)
13. [CI/CD Pipeline Setup](#cicd-pipeline-setup)
14. [Cost Optimization Techniques](#cost-optimization-techniques)
15. [Security Best Practices](#security-best-practices)
16. [Performance Optimization](#performance-optimization)
17. [Common Pitfalls & Solutions](#common-pitfalls-solutions)
18. [Learning Path & Milestones](#learning-path-milestones)

---

## 1. SOLO DEVELOPER WORKFLOW & MINDSET

### 1.1 Daily Development Routine

**Realistic Time Allocation (3-4 hours/day):**

```
Morning Session (1.5-2 hours)
├── 00:00-00:10 → Review AWS costs (console billing dashboard)
├── 00:10-00:20 → Check CloudWatch logs for overnight errors
├── 00:20-00:30 → Plan today's feature (write in docs/daily-log.md)
├── 00:30-01:45 → Development work (focus time, no distractions)
└── 01:45-02:00 → Commit code & push to GitHub

Evening Session (1.5-2 hours)
├── 00:00-01:00 → Continue feature development or bug fixes
├── 01:00-01:20 → Testing (local + deployed)
├── 01:20-01:40 → Documentation (update API docs, learning notes)
├── 01:40-01:50 → Deploy to AWS (if ready)
└── 01:50-02:00 → Plan tomorrow's task + update Kanban board
```

**Weekly Rhythm:**
```
Monday: Start new feature (backend)
Tuesday: Complete feature + unit tests
Wednesday: Integration + API Gateway setup
Thursday: Frontend integration
Friday: End-to-end testing + documentation
Saturday: Deployment + monitoring
Sunday: Review week, plan next week, learn new AWS concept
```

### 1.2 Solo Developer's Development Phases

**Phase 1: MVP Foundation (Week 1-3)**
```
Week 1: Infrastructure Setup
├── Day 1-2: AWS account setup, IAM users, billing alerts
├── Day 3-4: First Lambda function (Hello World → createUser)
├── Day 5-6: DynamoDB table creation + manual data entry
└── Day 7: First API endpoint working end-to-end

Week 2: User Management
├── Day 1-2: User registration with validation
├── Day 3-4: User login (Cognito integration)
├── Day 5-6: User profile management
└── Day 7: Testing + bug fixes

Week 3: Product Catalog
├── Day 1-3: Product listing + search
├── Day 4-5: Product details + images (S3)
├── Day 6: Vendor management basics
└── Day 7: Integration testing
```

**Phase 2: Core Business Logic (Week 4-8)**
```
Week 4: Order Creation Flow
├── Shopping cart logic (frontend state)
├── Order validation
├── Inventory checking
└── Order creation Lambda

Week 5: Payment Integration
├── Stripe/Razorpay SDK setup
├── Payment flow (test mode)
├── Payment webhooks
└── Order confirmation

Week 6: Step Functions
├── Order processing workflow
├── Inventory reservation
├── Vendor notifications
└── State machine testing

Week 7: Delivery Management
├── Delivery scheduling
├── Status updates
├── Notifications (SNS/SES)
└── Delivery tracking

Week 8: Integration & Bug Fixes
├── End-to-end testing
├── Edge case handling
├── Performance optimization
└── Documentation
```

**Phase 3: Frontend & Polish (Week 9-12)**
```
Week 9-10: React Frontend
├── Component development
├── State management (Redux/Zustand)
├── API integration
└── Responsive design

Week 11: Advanced Features
├── User dashboard
├── Order history
├── Admin panel basics
└── Analytics

Week 12: Deployment & Launch
├── Production deployment
├── Performance tuning
├── Security audit
└── Final testing
```

### 1.3 Task Management (Solo Approach)

**Simple Kanban Board (GitHub Projects or Trello):**
```
Backlog → Todo → In Progress → Testing → Done
```

**Sample Tasks Breakdown:**
```yaml
Epic: User Management
  Story: User Registration
    Task: Create DynamoDB Users table
    Task: Create createUser Lambda
    Task: Add validation logic
    Task: Set up API Gateway endpoint
    Task: Write unit tests
    Task: Test in console
    Task: Deploy with SAM
    Task: Integration test
    
  Story: User Login
    Task: Configure Cognito User Pool
    Task: Create login API
    Task: JWT token validation
    Task: Test authentication flow
```

### 1.4 Learning Mindset

**Document Everything:**
```
docs/
├── daily-log.md           # What you learned today
├── mistakes.md            # Errors and how you fixed them
├── aws-concepts.md        # AWS services explained in your words
├── design-decisions.md    # Why you chose X over Y
└── helpful-resources.md   # Useful articles, videos, docs
```

**Sample daily-log.md entry:**
```markdown
# Day 15 - October 10, 2025

## What I Built Today
- Completed createOrder Lambda function
- Added inventory validation
- Set up Step Functions for order processing

## What I Learned
- DynamoDB transactions prevent race conditions
- Lambda cold starts can be 1-2 seconds (need to optimize)
- Step Functions are billed per state transition ($0.025/1000)

## Problems I Faced
- Issue: Lambda timeout after 3 seconds
- Solution: Increased timeout to 10s, optimized DynamoDB query
- Learning: Always use indexes for queries, not scans!

## Tomorrow's Plan
- Add payment integration (Stripe test mode)
- Write unit tests for createOrder
- Deploy to dev environment
```

---

## 2. AWS FREE TIER: COMPLETE STRATEGY

### 2.1 Detailed Free Tier Limits

**Always Free (No Time Limit):**
```yaml
Lambda:
  Requests: 1,000,000 per month
  Compute: 400,000 GB-seconds per month
  Example: 
    - 1M invocations with 128MB = ~51 hours compute
    - Roughly 3,200 requests/day with 128MB, 1s execution
  Your Usage: Likely 100-500 requests/day during development
  Status: ✅ Safe

DynamoDB:
  Storage: 25 GB
  WCU: 25 (write capacity units)
  RCU: 25 (read capacity units)
  Example:
    - 25 WCU = 25 writes/sec or 2.1M writes/day
    - 25 RCU = 100 eventual reads/sec or 8.6M reads/day
  Your Usage: Maybe 50-100 operations/day in development
  Status: ✅ Very safe
  
  Important: Use on-demand billing mode
    - No upfront capacity planning
    - Pay only for actual reads/writes
    - First 25 WCU/RCU free, then $1.25/$0.25 per million

S3:
  Storage: 5 GB Standard storage
  GET: 20,000 requests
  PUT: 2,000 requests
  Data Transfer: 100 GB out per month (first 12 months)
  Your Usage: 10-50 MB for product images in development
  Status: ✅ Safe

CloudWatch:
  Logs: 5 GB ingestion, 5 GB storage
  Metrics: 10 custom metrics
  Alarms: 10 alarms
  Dashboard: 3 dashboards
  Your Usage: 100-500 MB logs/month during development
  Status: ✅ Safe

SNS:
  Email: 1,000 notifications/month (12 months free)
  SMS: 100 notifications/month (12 months free)
  HTTP: 100,000 notifications/month (12 months free)
  After 12 months: $0.50 per million emails
  Your Usage: 10-50 emails/month for testing
  Status: ⚠️ Be careful with SMS after year 1

SES (Simple Email Service):
  Emails: 62,000 per month (always free if sent from EC2)
  From Lambda: 3,000 per month free (12 months)
  After: $0.10 per 1,000 emails
  Your Usage: 10-100 emails/month
  Status: ✅ Safe, better than SNS for emails

Cognito:
  MAU: 50,000 monthly active users (always free)
  Your Usage: 1-10 test users
  Status: ✅ Very safe
```

**12 Months Free (After Sign-up):**
```yaml
API Gateway:
  REST API: 1,000,000 requests per month
  After: $3.50 per million requests
  Your Usage: 100-1,000 requests/day = 3,000-30,000/month
  Status: ✅ Safe during free tier
  Strategy: After 1 year, consider Lambda Function URLs (free)

CloudFront:
  Data Transfer: 1 TB out
  Requests: 10,000,000 HTTP/HTTPS
  After: $0.085 per GB + $0.0075 per 10,000 requests
  Your Usage: Don't use during development
  Status: ⚠️ Use only for production launch
```

**Services to AVOID (Cost Traps):**
```yaml
❌ NAT Gateway:
  Cost: $0.045/hour = $32.40/month + data transfer
  Why avoid: Expensive for learning
  Alternative: Lambda functions don't need NAT (direct internet)

❌ Application Load Balancer:
  Cost: $0.0225/hour = $16.20/month + LCU charges
  Why avoid: Unnecessary for serverless
  Alternative: API Gateway (free tier) or Lambda Function URLs

❌ RDS:
  Free tier: 750 hours/month for 12 months (db.t2.micro)
  After: Minimum $15-20/month
  Why avoid: Not needed, use DynamoDB
  Alternative: DynamoDB (always free up to limits)

❌ ECS/EKS:
  ECS: $0.10/hour per running task
  EKS: $0.10/hour for control plane = $73/month
  Why avoid: Overkill for learning serverless
  Alternative: Lambda functions

❌ ElastiCache:
  Free tier: None
  Cost: Minimum $13/month
  Why avoid: Not needed for MVP
  Alternative: In-memory caching in Lambda

❌ Elasticsearch:
  Free tier: None
  Cost: Minimum $23/month
  Why avoid: Expensive
  Alternative: DynamoDB queries + GSIs
```

### 2.2 Cost Monitoring Setup (Critical!)

**Step 1: Set Up Billing Alerts (Day 1 Task)**
```
AWS Console → Billing Dashboard → Billing Preferences
├── ✅ Receive PDF Invoice By Email
├── ✅ Receive Free Tier Usage Alerts (your email)
├── ✅ Receive Billing Alerts
└── Save preferences

AWS Console → CloudWatch → Alarms → Billing
├── Create Alarm: Estimated Charges > $5
├── Create Alarm: Estimated Charges > $10
├── Create Alarm: Estimated Charges > $20
└── SNS Topic: Email notification to yourself
```

**Step 2: Daily Cost Check Routine**
```
Every Morning (5 minutes):
├── AWS Console → Billing Dashboard
├── Check "Month-to-Date Spend"
├── Review "Free Tier Usage" (shows % consumed)
└── If over $5: Investigate "Cost Explorer"

Expected Daily Costs During Development:
├── Days 1-30: $0.00 - $0.50/day (within free tier)
├── Days 31-60: $0.50 - $1.00/day (learning curve)
├── Days 61-90: $0.20 - $0.50/day (optimized)
└── Goal: Stay under $10/month
```

**Step 3: AWS Cost Explorer Tags**
```
Tag all resources for tracking:
├── Environment: dev
├── Project: milk-delivery
├── Owner: your-name
└── Cost-Center: learning

Example in SAM template:
Tags:
  Environment: dev
  Project: milk-delivery
  Owner: solo-developer
```

### 2.3 Free Tier Budget Calculator

**Your Estimated Monthly Usage:**
```yaml
Service            | Free Tier    | Your Usage  | Cost Impact
-------------------|--------------|-------------|-------------
Lambda             | 1M requests  | 10,000      | $0.00
DynamoDB           | 25 WCU/RCU   | 1,000 ops   | $0.00
API Gateway        | 1M requests  | 10,000      | $0.00 (Year 1)
S3                 | 5 GB         | 100 MB      | $0.00
CloudWatch Logs    | 5 GB         | 500 MB      | $0.00
SES                | 62,000 emails| 50 emails   | $0.00
Cognito            | 50k MAU      | 5 users     | $0.00
Step Functions     | 4,000 states | 100 states  | $0.00
-------------------|--------------|-------------|-------------
TOTAL                                           | $0.00-$2.00

Potential Charges:
- API Gateway (after Year 1): ~$0.04/month
- Data Transfer Out: ~$0.50/month (minimal testing)
- CloudWatch (if over 5GB logs): ~$1.00/month

Expected Total: $0-5/month during development
```

---

## 3. DEVELOPMENT ENVIRONMENT SETUP

### 3.1 Machine Requirements

**Minimum Specifications:**
```yaml
Operating System: Windows 10/11, macOS, or Linux
Processor: Intel i3 or equivalent (dual-core)
RAM: 8 GB minimum, 16 GB recommended
Storage: 20 GB free space (for Node.js, Docker, projects)
Internet: Stable connection (AWS API calls)
```

**Recommended Setup:**
```yaml
OS: Windows 11 or macOS
RAM: 16 GB (Docker + VS Code + Browser = memory hungry)
Storage: SSD with 50 GB free (faster builds)
Internet: 10 Mbps+ (for video tutorials, AWS console)
```

### 3.2 Software Installation (Step-by-Step)

**Step 1: Install Node.js**
```
What: JavaScript runtime for Lambda development
Why: Lambda supports Node.js 20.x runtime
Where: https://nodejs.org/en/download

Installation:
├── Download Node.js 20.x LTS installer
├── Run installer (default options are fine)
├── Verify installation:
│   ├── Open terminal/command prompt
│   ├── Type: node --version (should show v20.x.x)
│   └── Type: npm --version (should show v10.x.x)
└── Done!

Post-Install Configuration:
├── Set npm global directory (avoid permission issues)
│   └── npm config set prefix ~/.npm-global (Mac/Linux)
│       or C:\Users\YourName\AppData\Roaming\npm (Windows)
└── Update npm: npm install -g npm@latest
```

**Step 2: Install AWS CLI**
```
What: Command-line tool to interact with AWS services
Why: Deploy resources, check logs, manage services
Where: https://aws.amazon.com/cli/

Windows:
├── Download MSI installer
├── Run installer
└── Verify: aws --version

macOS:
├── Option 1: Homebrew
│   └── brew install awscli
├── Option 2: Official installer
│   └── Download .pkg file
└── Verify: aws --version

Linux:
├── curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
├── unzip awscliv2.zip
├── sudo ./aws/install
└── Verify: aws --version

Configuration:
├── Run: aws configure
├── AWS Access Key ID: [Get from IAM console]
├── AWS Secret Access Key: [Get from IAM console]
├── Default region name: us-east-1
└── Default output format: json
```

**Step 3: Install AWS SAM CLI**
```
What: Framework for building serverless applications
Why: Local testing, easy deployment, IaC with templates
Where: https://aws.amazon.com/serverless/sam/

Windows:
├── Download MSI installer
├── Run installer (requires admin rights)
└── Verify: sam --version

macOS:
├── Homebrew: brew install aws-sam-cli
└── Verify: sam --version

Linux:
├── Download ZIP file
├── Unzip and install
└── Verify: sam --version

SAM Prerequisites:
├── Docker Desktop (for sam local commands)
│   └── Download from: https://www.docker.com/products/docker-desktop
└── Python 3.8+ (usually pre-installed on Mac/Linux)
```

**Step 4: Install Visual Studio Code**
```
What: Code editor with excellent AWS support
Why: Best IDE for serverless development
Where: https://code.visualstudio.com/

Installation:
├── Download installer for your OS
├── Run installer
├── Launch VS Code
└── Done!

Essential Extensions (Install via Extensions panel):
├── AWS Toolkit (amazonwebservices.aws-toolkit-vscode)
│   └── Integrates AWS services into VS Code
├── ESLint (dbaeumer.vscode-eslint)
│   └── JavaScript/TypeScript linting
├── Prettier (esbenp.prettier-vscode)
│   └── Code formatting
├── Thunder Client (rangav.vscode-thunder-client)
│   └── API testing (like Postman, but in VS Code)
├── GitLens (eamodio.gitlens)
│   └── Git history and blame annotations
├── Docker (ms-azuretools.vscode-docker)
│   └── Manage Docker containers
└── REST Client (humao.rest-client)
    └── Test HTTP requests from .http files
```

**Step 5: Install Git**
```
What: Version control system
Why: Code versioning, GitHub integration
Where: https://git-scm.com/downloads

Installation:
├── Download installer
├── Run with default options
└── Verify: git --version

Configuration:
├── git config --global user.name "Your Name"
├── git config --global user.email "your.email@example.com"
└── git config --global init.defaultBranch main
```

**Step 6: Optional but Recommended Tools**
```
Docker Desktop:
├── Required for: sam local invoke, sam local start-api
├── Download: https://www.docker.com/products/docker-desktop
└── Purpose: Run Lambda functions locally in containers

Postman (Alternative to Thunder Client):
├── Download: https://www.postman.com/downloads/
└── Purpose: API testing with collections

DynamoDB Local (Optional):
├── Download: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
└── Purpose: Test DynamoDB operations without AWS connection
```

### 3.3 AWS Account Setup

**Step 1: Create AWS Account**
```
Go to: https://aws.amazon.com/free

Sign Up Process:
├── 1. Email and password
├── 2. Account type: Personal
├── 3. Contact information
├── 4. Payment information (required, but won't charge if stay in free tier)
├── 5. Identity verification (phone call)
└── 6. Select Support Plan: Basic (Free)

⚠️ Important:
- Use a credit/debit card with at least $1 for verification
- Set up billing alerts immediately
- Enable MFA (Multi-Factor Authentication) for root account
```

**Step 2: Secure Root Account**
```
After Sign-up:
├── 1. Go to IAM → Dashboard
├── 2. Enable MFA for root account
│   ├── Use Google Authenticator, Authy, or hardware token
│   └── NEVER share MFA codes
├── 3. Create IAM user for daily use (don't use root)
└── 4. Delete root access keys if created
```

**Step 3: Create IAM User (For Development)**
```
IAM → Users → Add User

User Details:
├── Username: milk-delivery-dev
├── Access type: ✅ Programmatic access (for AWS CLI)
│              ✅ AWS Management Console access (for console)
└── Console password: Auto-generated or custom

Permissions:
├── Attach existing policies directly:
│   ├── ✅ AdministratorAccess (for learning only)
│   │   └── ⚠️ In production, use least-privilege policies
│   └── Or create custom policy (see below)
└── Tags:
    ├── Environment: dev
    └── Purpose: learning

Download Credentials:
├── Save Access Key ID
├── Save Secret Access Key
└── Store securely (password manager recommended)

Configure AWS CLI:
├── aws configure --profile milk-delivery-dev
├── Enter Access Key ID
├── Enter Secret Access Key
├── Region: us-east-1
└── Output: json
```

**Custom IAM Policy (Least Privilege for Learning):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "dynamodb:*",
        "apigateway:*",
        "s3:*",
        "cloudformation:*",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "logs:*",
        "events:*",
        "sns:*",
        "ses:*",
        "cognito-idp:*",
        "states:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3.4 VS Code Configuration

**Workspace Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true,
  "files.autoSave": "onFocusChange",
  "typescript.preferences.importModuleSpecifier": "relative",
  "aws.samcli.location": "/usr/local/bin/sam",
  "aws.profile": "milk-delivery-dev",
  "aws.region": "us-east-1",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

**Launch Configuration (.vscode/launch.json):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Lambda (SAM)",
      "type": "node",
      "request": "attach",
      "address": "localhost",
      "port": 5858,
      "localRoot": "${workspaceFolder}/backend/src",
      "remoteRoot": "/var/task",
      "protocol": "inspector",
      "stopOnEntry": false
    }
  ]
}
```

---

## 4. HYBRID DEVELOPMENT: CONSOLE + VS CODE

### 4.1 Philosophy: When to Use What

**AWS Console is BEST for:**
```
✅ Visual Learning & Exploration
   ├── Understanding service dashboards
   ├── Exploring service features and options
   ├── Reading integrated documentation
   └── Seeing visual representations (Step Functions graphs)

✅ One-Time Setup Tasks
   ├── Creating Cognito User Pool (complex configuration)
   ├── Setting up billing alerts
   ├── Creating IAM roles and policies (first time)
   ├── Configuring CloudWatch dashboards
   └── Setting up SNS/SES email verification

✅ Quick Testing & Debugging
   ├── Testing Lambda with sample events
   ├── Viewing DynamoDB table data
   ├── Checking CloudWatch logs in real-time
   ├── Testing API Gateway endpoints manually
   └── Viewing Step Functions execution history

✅ Monitoring & Operations
   ├── CloudWatch Logs Insights queries
   ├── Viewing metrics and graphs
   ├── Checking service quotas and limits
   ├── Cost analysis and billing reports
   └── Resource utilization dashboards
```

**VS Code is BEST for:**
```
✅ All Code Development
   ├── Writing Lambda functions
   ├── TypeScript/JavaScript development
   ├── Creating unit tests
   ├── Shared utilities and libraries
   └── Frontend React components

✅ Infrastructure as Code (IaC)
   ├── SAM templates (template.yaml)
   ├── CloudFormation templates
   ├── Environment configuration files
   └── Deployment scripts

✅ Version Control
   ├── Git commits and branching
   ├── Code reviews (self-review before commit)
   ├── Merge conflict resolution
   └── GitHub integration

✅ Local Development & Testing
   ├── sam local invoke (test Lambda locally)
   ├── sam local start-api (local API Gateway)
   ├── Unit tests with Jest
   ├── Integration tests
   └── Debugging with breakpoints

✅ Batch Operations
   ├── Creating multiple Lambda functions
   ├── Updating multiple files at once
   ├── Search and replace across project
   └── Refactoring code
```

### 4.2 Hybrid Workflow Patterns

**Pattern 1: Learning a New Service**
```
Example: Setting up DynamoDB for the first time

Step 1: AWS Console (30 minutes)
├── Navigate to DynamoDB service
├── Click "Create table"
├── Experiment with different settings:
│   ├── Partition key vs. Sort key
│   ├── Provisioned vs. On-demand
│   ├── Global Secondary Indexes (GSI)
│   └── Stream settings
├── Create a test table manually
├── Add sample items via console
├── Try different queries in console
└── Learn query vs. scan difference

Step 2: VS Code (30 minutes)
├── Create SAM template with DynamoDB resource
├── Define table schema in YAML
├── Add GSI definitions
├── Write Lambda function to interact with table
└── Test locally with DynamoDB Local or deployed table

Step 3: AWS Console (15 minutes)
├── Deploy via SAM from VS Code terminal
├── Verify table creation in console
├── Check table metrics
└── Validate data structure

Result: You understand DynamoDB AND have IaC code
```

**Pattern 2: Developing a New Lambda Function**
```
Example: Creating "createOrder" Lambda

Step 1: Console Prototype (15 minutes)
├── AWS Console → Lambda → Create function
├── Name: createOrderPrototype
├── Runtime: Node.js 20.x
├── Write basic handler code inline
├── Create test event with sample JSON:
│   {
│     "userId": "user-123",
│     "items": [{"productId": "prod-1", "quantity": 2}]
│   }
├── Test and see output
├── Fix any immediate errors
└── Verify basic logic works

Step 2: VS Code Development (2 hours)
├── Create file: backend/src/lambdas/order/createOrder.ts
├── Copy working logic from console
├── Add TypeScript types and interfaces
├── Implement proper error handling
├── Add input validation
├── Add logging
├── Add to SAM template
├── Write unit tests
└── Test locally: sam local invoke

Step 3: Console Debugging (20 minutes)
├── Deploy from VS Code: sam deploy
├── Go to AWS Console → Lambda → createOrder
├── Test with real event
├── Check CloudWatch logs
├── Identify any AWS-specific issues
└── Note execution time and memory usage

Step 4: VS Code Refinement (30 minutes)
├── Fix issues found in console testing
├── Optimize memory settings in SAM template
├── Adjust timeout if needed
├── Update documentation
└── Redeploy: sam deploy

Result: Production-ready Lambda with IaC
```

**Pattern 3: API Gateway Setup**
```
Example: Creating REST API with multiple endpoints

Step 1: Console Exploration (30 minutes)
├── AWS Console → API Gateway
├── Create REST API (not HTTP API)
├── Manually create one resource: /users
├── Add POST method
├── Link to Lambda function (console UI)
├── Configure CORS manually
├── Deploy to "dev" stage
├── Test with API Gateway test feature
└── Understand request/response transformation

Step 2: VS Code IaC (1 hour)
├── Add API Gateway to SAM template
├── Define all resources and methods in YAML
├── Configure Cognito authorizer
├── Set up request validators
├── Configure CORS in template
├── Add multiple endpoints
└── Deploy entire API: sam deploy

Step 3: Console Validation (15 minutes)
├── Check deployed API in console
├── Verify all endpoints exist
├── Test each endpoint
├── Check authorization works
└── Review API Gateway logs

Result: Complete API defined in code, easy to replicate
```

### 4.3 AWS Toolkit Extension (The Bridge)

**Installation & Setup:**
```
Step 1: Install Extension
├── Open VS Code
├── Go to Extensions (Ctrl+Shift+X)
├── Search: "AWS Toolkit"
├── Install "AWS Toolkit" by Amazon Web Services
└── Restart VS Code

Step 2: Connect to AWS
├── Click AWS icon in left sidebar
├── Click "Connect to AWS"
├── Select profile: milk-delivery-dev
└── Region: us-east-1

Step 3: Verify Connection
├── Expand "Lambda" in sidebar
├── You should see all deployed functions
├── Expand "DynamoDB"
├── You should see all tables
└── Success!
```

**Key Features You'll Use Daily:**

**1. Lambda Functions**
```
What you can do from VS Code:
├── View all deployed Lambda functions
├── Invoke function remotely (without console)
│   ├── Right-click function
│   ├── Select "Invoke on AWS"
│   ├── Choose test event
│   └── See results in VS Code
├── Download function code
│   ├── Right-click function
│   ├── Select "Download Lambda"
│   └── Code appears in VS Code
└── View CloudWatch logs
    ├── Right-click function
    ├── Select "View CloudWatch Logs"
    └── Logs stream in VS Code terminal

Example Workflow:
├── Deploy function from VS Code terminal: sam deploy
├── Test directly from VS Code using AWS Toolkit
├── View logs without switching to browser
└── Make changes and redeploy, all in one place
```

**2. DynamoDB Tables**
```
What you can do from VS Code:
├── Browse table data
│   ├── Expand DynamoDB in AWS Toolkit
│   ├── Right-click table
│   ├── Select "View Table"
│   └── See items in VS Code panel
├── Run queries
│   ├── Click "Query" button
│   ├── Enter partition key value
│   ├── Execute
│   └── Results appear in VS Code
├── Download items as JSON
│   ├── Right-click items
│   ├── Select "Download items"
│   └── Save to file
└── Insert test data
    ├── Right-click table
    ├── Select "Insert Item"
    └── Paste JSON

Example Workflow:
├── Check if user exists in database
├── Query directly from VS Code
├── No need to open AWS Console
└── Copy user data for test event
```

**3. CloudWatch Logs**
```
What you can do from VS Code:
├── View log groups
├── Stream logs in real-time
│   ├── Right-click Lambda function
│   ├── Select "View CloudWatch Logs"
│   ├── Logs appear in VS Code terminal
│   └── Auto-refreshes with new logs
├── Search logs
│   ├── Use Ctrl+F in log panel
│   └── Filter by text
└── Download logs for analysis

Example Workflow:
├── Deploy Lambda function
├── Invoke from VS Code
├── Instantly see logs in VS Code
├── Debug without opening console
└── Faster iteration cycle
```

**4. S3 Buckets**
```
What you can do from VS Code:
├── Browse bucket contents
├── Upload files
│   ├── Right-click bucket
│   ├── Select "Upload File"
│   └── Choose file from system
├── Download files
│   ├── Right-click file
│   ├── Select "Download"
│   └── Save to local folder
└── Delete files

Example Workflow:
├── Upload product images
├── Get S3 URL for DynamoDB
├── All without leaving VS Code
```

**5. Step Functions**
```
What you can do from VS Code:
├── View state machines
├── Start execution
│   ├── Right-click state machine
│   ├── Select "Start Execution"
│   ├── Provide input JSON
│   └── Execution starts
├── View execution history
└── Download execution results

Example Workflow:
├── Test order processing workflow
├── Start execution from VS Code
├── Check status in toolkit
├── View results inline
```

### 4.4 Detailed Workflow Examples

**Example 1: Building User Registration (Complete Flow)**

**Day 1 Morning: Console Exploration (1 hour)**
```
Task: Understand what you need to build

1. Research Phase (AWS Console)
   ├── Navigate to Cognito
   ├── Read "What is Amazon Cognito?"
   ├── Create a test User Pool
   │   ├── Pool name: milk-delivery-users-test
   │   ├── Standard attributes: email, name, phone
   │   ├── Password policy: default
   │   ├── MFA: Optional (for learning)
   │   └── Create pool
   ├── Create test user manually
   │   ├── Username: testuser@example.com
   │   ├── Temporary password: Test@1234
   │   └── Verify user can login
   └── Test user login in Cognito UI
   
2. DynamoDB Exploration (AWS Console)
   ├── Navigate to DynamoDB
   ├── Create table: Users
   │   ├── Partition key: userId (String)
   │   ├── Billing mode: On-demand
   │   └── Create table
   ├── Add sample user item manually:
   │   {
   │     "userId": "user-001",
   │     "email": "test@example.com",
   │     "name": "Test User",
   │     "phone": "+1234567890",
   │     "role": "Customer",
   │     "createdAt": "2025-10-09T10:00:00Z"
   │   }
   └── Verify item appears in table

3. Lambda Exploration (AWS Console)
   ├── Navigate to Lambda
   ├── Create function: createUserTest
   ├── Write minimal code inline:
   │   exports.handler = async (event) => {
   │     console.log('Received event:', event);
   │     return {
   │       statusCode: 200,
   │       body: JSON.stringify({ message: 'User created' })
   │     };
   │   };
   ├── Test with sample event:
   │   {
   │     "body": "{\"email\":\"new@example.com\",\"name\":\"New User\"}"
   │   }
   └── Verify it returns 200 OK

Learning Outcome:
├── Understand Cognito concepts
├── See DynamoDB table structure
├── Know Lambda basic structure
└── Ready to code properly in VS Code
```

**Day 1 Afternoon: VS Code Development (2-3 hours)**
```
Task: Build production-ready createUser Lambda

1. Project Setup (VS Code Terminal)
   $ cd ~/projects
   $ mkdir milk-delivery-platform
   $ cd milk-delivery-platform
   $ sam init
   ├── Choose: 1 - AWS Quick Start Templates
   ├── Choose: 1 - Hello World Example
   ├── Runtime: nodejs20.x
   ├── Name: milk-delivery
   └── Project created!

2. Project Structure Organization
   milk-delivery-platform/
   ├── backend/
   │   ├── src/
   │   │   ├── lambdas/
   │   │   │   └── user/
   │   │   │       ├── createUser.ts
   │   │   │       ├── getUser.ts
   │   │   │       └── types.ts
   │   │   └── shared/
   │   │       ├── db.ts
   │   │       ├── validation.ts
   │   │       └── logger.ts
   │   ├── template.yaml
   │   ├── package.json
   │   └── tsconfig.json
   └── docs/
       └── api/
           └── user-api.md

3. Install Dependencies
   $ cd backend
   $ npm init -y
   $ npm install --save @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   $ npm install --save-dev @types/node @types/aws-lambda typescript

4. Create TypeScript Configuration (tsconfig.json)
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "lib": ["ES2020"],
       "outDir": "./dist",
       "rootDir": "./src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }

5. Create Lambda Function (Skeleton)
   File: src/lambdas/user/createUser.ts
   
   // Define interfaces
   interface CreateUserRequest {
     email: string;
     name: string;
     phone: string;
     password: string;
   }
   
   interface CreateUserResponse {
     userId: string;
     email: string;
     message: string;
   }
   
   // TODO: Implement handler
   // TODO: Add validation
   // TODO: Add DynamoDB operations
   // TODO: Add error handling

6. Create SAM Template (template.yaml)
   AWSTemplateFormatVersion: '2010-09-09'
   Transform: AWS::Serverless-2016-10-31
   
   Globals:
     Function:
       Timeout: 10
       Runtime: nodejs20.x
       Environment:
         Variables:
           USERS_TABLE: !Ref UsersTable
   
   Resources:
     CreateUserFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/user/createUser.handler
         Policies:
           - DynamoDBCrudPolicy:
               TableName: !Ref UsersTable
     
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
           - IndexName: email-index
             KeySchema:
               - AttributeName: email
                 KeyType: HASH
             Projection:
               ProjectionType: ALL

7. Build & Test Locally
   $ npm run build
   $ sam build
   $ sam local invoke CreateUserFunction --event events/create-user.json
   
   events/create-user.json:
   {
     "body": "{\"email\":\"test@example.com\",\"name\":\"Test User\",\"phone\":\"+1234567890\",\"password\":\"Test@123\"}"
   }

Learning Outcome:
├── Project structure established
├── SAM template basics understood
├── Local testing working
└── Ready for implementation
```

**Day 2: Implementation & Deployment**
```
Task: Complete Lambda implementation and deploy

1. Implement Full Lambda Function (VS Code)
   File: src/lambdas/user/createUser.ts
   
   [Full TypeScript implementation with:]
   ├── Input validation (email format, password strength)
   ├── Check if email already exists (GSI query)
   ├── Generate userId (UUID)
   ├── Hash password (if not using Cognito)
   ├── Save to DynamoDB
   ├── Error handling (try-catch with proper status codes)
   └── Logging (console.log with context)

2. Create Shared Utilities (VS Code)
   File: src/shared/validation.ts
   ├── validateEmail(email: string): boolean
   ├── validatePhone(phone: string): boolean
   └── validatePassword(password: string): string | null
   
   File: src/shared/db.ts
   ├── DynamoDB client initialization
   ├── Helper functions for common operations
   └── Error handling wrappers

3. Write Unit Tests (VS Code)
   File: tests/unit/createUser.test.ts
   
   Test cases:
   ├── Should create user with valid input
   ├── Should reject invalid email
   ├── Should reject weak password
   ├── Should reject duplicate email
   └── Should handle DynamoDB errors
   
   $ npm test

4. Deploy to AWS (VS Code Terminal)
   $ sam build
   $ sam deploy --guided
   
   Prompts:
   ├── Stack name: milk-delivery-dev
   ├── Region: us-east-1
   ├── Confirm changes: Y
   ├── Allow SAM CLI IAM role creation: Y
   ├── Save arguments to config file: Y
   └── Deployment starts...
   
   Wait for: Successfully created/updated stack

5. Verify Deployment (AWS Console)
   ├── Lambda → Functions → createUserFunction
   │   ├── Check function exists
   │   ├── Check environment variables
   │   └── Check permissions
   ├── DynamoDB → Tables → milk-delivery-users
   │   ├── Check table exists
   │   ├── Check GSI: email-index
   │   └── Check capacity mode: On-demand
   └── CloudFormation → Stacks → milk-delivery-dev
       ├── Check stack status: CREATE_COMPLETE
       └── Review all resources created

6. Test Deployed Function (Console + VS Code)
   
   Option A: AWS Console
   ├── Lambda → createUserFunction → Test tab
   ├── Create test event: create-user-test
   ├── Execute test
   ├── Check response: 201 Created
   └── CloudWatch logs: Check execution logs
   
   Option B: VS Code (AWS Toolkit)
   ├── AWS Toolkit → Lambda → createUserFunction
   ├── Right-click → Invoke on AWS
   ├── Select test event
   ├── View results in VS Code
   └── Check logs in VS Code

7. Verify Data in DynamoDB (Console)
   ├── DynamoDB → Tables → milk-delivery-users
   ├── Items tab
   ├── Should see new user item
   └── Verify all fields are correct

Learning Outcome:
├── Full Lambda function deployed
├── Infrastructure as Code working
├── Understand deployment process
└── Can iterate quickly
```

---

## 5. FEATURE DEVELOPMENT FLOW (STEP-BY-STEP)

### 5.1 Complete Feature: Order Creation System

**Overview:**
```
Feature: Create Order
Complexity: High (multiple services involved)
Duration: 4-5 days
Services Used:
├── Lambda (createOrder, validateInventory)
├── DynamoDB (Orders, Products, Inventory tables)
├── Step Functions (Order processing workflow)
├── API Gateway (POST /orders endpoint)
├── SNS (Order notifications)
└── EventBridge (Order events)

Learning Goals:
├── Multi-table DynamoDB operations
├── Error handling and rollback strategies
├── Async workflows with Step Functions
├── Event-driven architecture
└── Transaction management
```

**Day 1: Planning & Design**

```
Morning Session (2 hours)

1. Requirement Analysis (docs/features/create-order.md)
   
   User Story:
   "As a customer, I want to create an order with multiple products
   from different vendors, so that I can get my dairy products delivered."
   
   Acceptance Criteria:
   ├── User must be authenticated
   ├── User must have complete profile (delivery address)
   ├── Order must have at least 1 item
   ├── All products must be in stock
   ├── Order total must be ≥ minimum order value (₹100)
   ├── Delivery date must be: today+1 to today+7
   ├── System must reserve inventory immediately
   ├── User receives order confirmation
   └── Vendors receive order notifications

2. Data Model Design
   
   Orders Table Schema:
   {
     "orderId": "uuid",
     "userId": "uuid",
     "items": [
       {
         "productId": "uuid",
         "vendorId": "uuid",
         "productName": "string",
         "quantity": number,
         "unitPrice": number,
         "totalPrice": number
       }
     ],
     "subtotal": number,
     "tax": number,
     "deliveryCharge": number,
     "discount": number,
     "totalAmount": number,
     "status": "Pending|Confirmed|Processing|Delivered|Cancelled",
     "deliveryDate": "ISO date",
     "deliveryAddress": {
       "line1": "string",
       "city": "string",
       "zipCode": "string"
     },
     "createdAt": "ISO timestamp",
     "updatedAt": "ISO timestamp"
   }

3. API Contract Design
   
   Request:
   POST /orders
   Headers:
     Authorization: Bearer <JWT_TOKEN>
     Content-Type: application/json
   
   Body:
   {
     "items": [
       {
         "productId": "prod-123",
         "vendorId": "vendor-456",
         "quantity": 2
       },
       {
         "productId": "prod-789",
         "vendorId": "vendor-456",
         "quantity": 1
       }
     ],
     "deliveryDate": "2025-10-15",
     "addressId": "addr-001"
   }
   
   Success Response (201 Created):
   {
     "orderId": "order-abc123",
     "userId": "user-xyz",
     "items": [...],
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 30,
     "totalAmount": 502.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-15T08:00:00Z",
     "message": "Order created successfully"
   }
   
   Error Responses:
   400 Bad Request:
   {
     "error": "ValidationError",
     "message": "Delivery date must be between tomorrow and 7 days from now",
     "field": "deliveryDate"
   }
   
   400 Bad Request:
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 1L' has only 5 units available",
     "availableQuantity": 5,
     "requestedQuantity": 10
   }
   
   400 Bad Request:
   {
     "error": "MinimumOrderValue",
     "message": "Order total must be at least ₹100",
     "currentTotal": 75,
     "minimumRequired": 100
   }
   
   401 Unauthorized:
   {
     "error": "Unauthorized",
     "message": "Invalid or expired token"
   }
   
   404 Not Found:
   {
     "error": "UserNotFound",
     "message": "User profile not found"
   }
   
   409 Conflict:
   {
     "error": "ProfileIncomplete",
     "message": "Please complete your profile before placing an order",
     "missingFields": ["deliveryAddress", "phone"]
   }

4. Workflow Design (Step Functions State Machine)
   
   Order Processing Workflow:
   Start
   ├── ValidateInput (Lambda)
   │   ├── Success → ValidateUser
   │   └── Fail → Return 400 Error
   ├── ValidateUser (Lambda)
   │   ├── Success → CheckInventory
   │   └── Fail → Return 404/409 Error
   ├── CheckInventory (Lambda)
   │   ├── AllAvailable → ReserveInventory
   │   └── Insufficient → Return 400 Error
   ├── ReserveInventory (Lambda)
   │   ├── Success → CalculatePricing
   │   └── Fail → Rollback
   ├── CalculatePricing (Lambda)
   │   ├── Success → CreateOrderRecord
   │   └── Fail → ReleaseInventory → Error
   ├── CreateOrderRecord (Lambda)
   │   ├── Success → NotifyUser
   │   └── Fail → ReleaseInventory → Error
   ├── NotifyUser (SNS)
   │   └── Send confirmation email
   ├── NotifyVendors (SNS)
   │   └── Send order details to each vendor
   └── End (Success)

5. Error Handling Strategy
   
   Scenario 1: Inventory Check Fails
   ├── Don't create order
   ├── Return 400 with specific product details
   └── No rollback needed (no state changed)
   
   Scenario 2: Inventory Reserved, but DynamoDB Fails
   ├── Critical: Inventory locked but order not created
   ├── Solution: Use DynamoDB transaction
   │   └── Atomic operation: Reserve inventory + Create order
   └── If transaction fails, nothing is committed
   
   Scenario 3: Order Created, but Notification Fails
   ├── Order exists, but user not notified
   ├── Solution: Make notification async (Step Functions)
   ├── Retry notification 3 times
   └── Use DLQ (Dead Letter Queue) for failures
   
   Scenario 4: Partial Vendor Availability
   ├── Some items available, some not
   ├── Option A: Reject entire order
   ├── Option B: Partial fulfillment (advanced)
   └── For MVP: Choose Option A (simpler)

Afternoon Session (1.5 hours)

6. Create Project Structure (VS Code)
   backend/
   ├── src/
   │   ├── lambdas/
   │   │   └── order/
   │   │       ├── createOrder.ts
   │   │       ├── validateInventory.ts
   │   │       ├── reserveInventory.ts
   │   │       ├── calculatePricing.ts
   │   │       └── types.ts
   │   ├── stepFunctions/
   │   │   └── orderProcessing.asl.json
   │   └── shared/
   │       ├── constants.ts
   │       └── pricing.ts
   └── tests/
       └── order/
           ├── createOrder.test.ts
           └── validateInventory.test.ts

7. Define Types (VS Code)
   File: src/lambdas/order/types.ts
   
   export interface OrderItem {
     productId: string;
     vendorId: string;
     quantity: number;
     unitPrice?: number;  // Calculated
     totalPrice?: number; // Calculated
   }
   
   export interface CreateOrderRequest {
     items: OrderItem[];
     deliveryDate: string;
     addressId: string;
   }
   
   export interface CreateOrderResponse {
     orderId: string;
     userId: string;
     items: OrderItem[];
     subtotal: number;
     tax: number;
     deliveryCharge: number;
     totalAmount: number;
     status: OrderStatus;
     estimatedDelivery: string;
     message: string;
   }
   
   export type OrderStatus = 
     | 'Pending'
     | 'Confirmed'
     | 'Processing'
     | 'OutForDelivery'
     | 'Delivered'
     | 'Cancelled'
     | 'Failed';
   
   export interface ValidationError {
     field: string;
     message: string;
     code: string;
   }

8. Create Test Events (VS Code)
   File: events/create-order-valid.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2},{\"productId\":\"prod-yogurt-200g\",\"vendorId\":\"vendor-001\",\"quantity\":3}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}",
     "headers": {
       "Authorization": "Bearer eyJhbGc...",
       "Content-Type": "application/json"
     },
     "requestContext": {
       "authorizer": {
         "claims": {
           "sub": "user-123"
         }
       }
     }
   }
   
   File: events/create-order-invalid-date.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2}],\"deliveryDate\":\"2025-10-01\",\"addressId\":\"addr-home\"}"
   }
   
   File: events/create-order-insufficient-stock.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":1000}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}"
   }

Learning Outcome:
├── Complete understanding of requirements
├── API contract defined
├── Error scenarios identified
├── Project structure ready
└── Ready to code
```

**Day 2: Core Implementation**

```
Morning Session (2.5 hours)

1. Implement Validation Logic
   File: src/lambdas/order/createOrder.ts
   
   Function: validateInput()
   ├── Check items array not empty
   ├── Check each item has required fields
   ├── Check quantities are positive integers
   ├── Check deliveryDate format (ISO 8601)
   ├── Check deliveryDate is in valid range
   └── Return ValidationError[] if any issues
   
   Function: validateUser()
   ├── Extract userId from JWT (event.requestContext.authorizer.claims.sub)
   ├── Query Users table
   ├── Check user exists
   ├── Check profile is complete
   │   ├── Has delivery address matching addressId
   │   ├── Has phone number
   │   └── Has email
   └── Return user object or error
   
   Function: validateDeliveryDate()
   ├── Parse date string
   ├── Check format is valid
   ├── Check date is not in past
   ├── Check date is not today (need 1 day preparation)
   ├── Check date is within 7 days
   └── Return boolean + error message

2. Implement Inventory Validation
   File: src/lambdas/order/validateInventory.ts
   
   Function: checkInventory()
   Input:
   {
     "items": [
       {"productId": "prod-1", "vendorId": "vendor-1", "quantity": 2}
     ]
   }
   
   Process:
   ├── Group items by vendorId
   ├── For each vendor:
   │   ├── BatchGetItem from Inventory table
   │   │   └── Keys: [{vendorId, productId}, ...]
   │   ├── For each product:
   │   │   ├── Get available = stock - reserved
   │   │   ├── Check available >= requested quantity
   │   │   └── If not: add to unavailableItems[]
   │   └── Continue
   └── Return {valid: boolean, unavailableItems: []}
   
   Output (Success):
   {
     "valid": true,
     "unavailableItems": []
   }
   
   Output (Failure):
   {
     "valid": false,
     "unavailableItems": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "requestedQty": 10,
         "availableQty": 5
       }
     ]
   }

3. Implement Pricing Calculation
   File: src/shared/pricing.ts
   
   Function: calculateOrderTotal()
   Input:
   {
     "items": [
       {
         "productId": "prod-1",
         "quantity": 2,
         "unitPrice": 50
       }
     ],
     "deliveryAddress": {
       "city": "Vadodara",
       "zipCode": "390001"
     }
   }
   
   Calculation Logic:
   ├── subtotal = sum(item.unitPrice * item.quantity)
   ├── tax = subtotal * TAX_RATE (5% GST)
   ├── deliveryCharge = calculateDeliveryCharge()
   │   ├── If subtotal >= 500: ₹0 (free delivery)
   │   ├── Else if subtotal >= 300: ₹20
   │   ├── Else: ₹40
   │   └── Add ₹10 per additional vendor (multi-vendor orders)
   ├── discount = calculateDiscount()
   │   ├── If first order: 10% off (max ₹50)
   │   ├── If loyalty points: redeem at 1 point = ₹1
   │   └── else: 0
   └── totalAmount = subtotal + tax + deliveryCharge - discount
   
   Output:
   {
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 20,
     "discount": 0,
     "totalAmount": 492.5,
     "breakdown": {
       "itemsTotal": 450,
       "taxBreakdown": {
         "cgst": 11.25,
         "sgst": 11.25
       },
       "deliveryDetails": {
         "baseCharge": 20,
         "multiVendorSurcharge": 0
       }
     }
   }

Afternoon Session (1.5 hours)

4. Implement Main Handler
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent)
   
   Flow:
   Step 1: Parse input
   ├── const body = JSON.parse(event.body || '{}');
   ├── const userId = event.requestContext.authorizer.claims.sub;
   └── Log input for debugging
   
   Step 2: Validate input
   ├── const validationErrors = validateInput(body);
   ├── if (validationErrors.length > 0):
   │   └── return 400 with errors
   └── Continue
   
   Step 3: Validate user
   ├── const user = await validateUser(userId);
   ├── if (!user):
   │   └── return 404 User Not Found
   ├── if (!user.isProfileComplete):
   │   └── return 409 Profile Incomplete
   └── Continue
   
   Step 4: Get delivery address
   ├── const address = user.addresses.find(a => a.addressId === body.addressId);
   ├── if (!address):
   │   └── return 404 Address Not Found
   └── Continue
   
   Step 5: Fetch product details
   ├── const productIds = body.items.map(i => i.productId);
   ├── const products = await batchGetProducts(productIds);
   ├── Merge product prices into items
   └── Calculate item totals
   
   Step 6: Check inventory
   ├── const inventoryCheck = await checkInventory(body.items);
   ├── if (!inventoryCheck.valid):
   │   └── return 400 Insufficient Stock with details
   └── Continue
   
   Step 7: Calculate pricing
   ├── const pricing = calculateOrderTotal(items, address, user);
   ├── if (pricing.totalAmount < MINIMUM_ORDER_VALUE):
   │   └── return 400 Minimum Order Value Not Met
   └── Continue
   
   Step 8: Create order record
   ├── const orderId = generateOrderId(); // uuid()
   ├── const order = {
   │     orderId,
   │     userId,
   │     items,
   │     ...pricing,
   │     status: 'Pending',
   │     deliveryDate: body.deliveryDate,
   │     deliveryAddress: address,
   │     createdAt: new Date().toISOString()
   │   };
   ├── await dynamodb.putItem(ORDERS_TABLE, order);
   └── Continue
   
   Step 9: Start Step Functions workflow
   ├── const executionArn = await stepFunctions.startExecution({
   │     stateMachineArn: ORDER_PROCESSING_STATE_MACHINE,
   │     input: JSON.stringify({ orderId, items })
   │   });
   └── Log execution ARN
   
   Step 10: Return response
   └── return {
         statusCode: 201,
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*'
         },
         body: JSON.stringify({
           orderId,
           userId,
           items,
           ...pricing,
           status: 'Pending',
           estimatedDelivery: calculateEstimatedDelivery(body.deliveryDate),
           message: 'Order created successfully. You will receive confirmation shortly.'
         })
       };

5. Error Handling Patterns
   
   Pattern 1: Validation Errors (400)
   try {
     const errors = validateInput(body);
     if (errors.length > 0) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'ValidationError',
           message: 'Invalid input data',
           errors: errors
         })
       };
     }
   } catch (error) {
     // Continue to Pattern 2
   }
   
   Pattern 2: Resource Not Found (404)
   const user = await getUser(userId);
   if (!user) {
     return {
       statusCode: 404,
       body: JSON.stringify({
         error: 'UserNotFound',
         message: `User with ID ${userId} not found`
       })
     };
   }
   
   Pattern 3: Business Logic Errors (400/409)
   if (pricing.totalAmount < MINIMUM_ORDER_VALUE) {
     return {
       statusCode: 400,
       body: JSON.stringify({
         error: 'MinimumOrderValue',
         message: `Order total must be at least ₹${MINIMUM_ORDER_VALUE}`,
         currentTotal: pricing.totalAmount,
         minimumRequired: MINIMUM_ORDER_VALUE
       })
     };
   }
   
   Pattern 4: Service Errors (500)
   try {
     await dynamodb.putItem(ORDERS_TABLE, order);
   } catch (error) {
     console.error('DynamoDB error:', error);
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: 'InternalServerError',
         message: 'Failed to create order. Please try again.',
         requestId: context.requestId
       })
     };
   }
   
   Pattern 5: Timeout Handling
   // Set timeout slightly less than Lambda timeout
   const timeoutMs = 9000; // Lambda timeout is 10s
   const timeoutPromise = new Promise((_, reject) => 
     setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
   );
   
   try {
     await Promise.race([
       createOrder(body),
       timeoutPromise
     ]);
   } catch (error) {
     if (error.message === 'Operation timeout') {
       return {
         statusCode: 504,
         body: JSON.stringify({
           error: 'GatewayTimeout',
           message: 'Request took too long. Please try again.'
         })
       };
     }
   }

Learning Outcome:
├── Complete Lambda implementation
├── Error handling patterns mastered
├── Ready for testing
└── Understanding of edge cases
```

**Day 3: Testing & Step Functions**

```
Morning Session (2 hours)

1. Unit Testing (VS Code)
   File: tests/unit/createOrder.test.ts
   
   Test Suite: Input Validation
   ├── Test: Should accept valid input
   ├── Test: Should reject empty items array
   ├── Test: Should reject negative quantities
   ├── Test: Should reject invalid date format
   ├── Test: Should reject past delivery dates
   └── Test: Should reject dates beyond 7 days
   
   Test Suite: User Validation
   ├── Test: Should accept valid user with complete profile
   ├── Test: Should reject non-existent user
   ├── Test: Should reject user with incomplete profile
   └── Test: Should reject invalid address ID
   
   Test Suite: Inventory Validation
   ├── Test: Should pass when all items in stock
   ├── Test: Should fail when any item out of stock
   ├── Test: Should handle partial stock correctly
   └── Test: Should handle multiple vendors
   
   Test Suite: Pricing Calculation
   ├── Test: Should calculate subtotal correctly
   ├── Test: Should apply 5% GST
   ├── Test: Should apply free delivery for orders > ₹500
   ├── Test: Should charge ₹40 for orders < ₹300
   ├── Test: Should apply first order discount
   └── Test: Should calculate multi-vendor surcharge
   
   Run Tests:
   $ npm test
   
   Expected Output:
   PASS  tests/unit/createOrder.test.ts
     Input Validation
       ✓ Should accept valid input (5ms)
       ✓ Should reject empty items array (3ms)
       ✓ Should reject negative quantities (2ms)
       ✓ Should reject invalid date format (3ms)
       ✓ Should reject past delivery dates (2ms)
       ✓ Should reject dates beyond 7 days (2ms)
     
     Test Suites: 4 passed, 4 total
     Tests:       24 passed, 24 total
     Time:        2.341s

2. Local Testing with SAM (VS Code Terminal)
   
   Build project:
   $ cd backend
   $ npm run build
   $ sam build
   
   Output:
   Building codeuri: dist/ runtime: nodejs20.x architecture: x86_64
   Running NodejsNpmBuilder:NpmPack
   Build Succeeded
   
   Test with valid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-valid.json \
     --env-vars env.json
   
   Expected Output:
   Invoking lambdas/order/createOrder.handler
   START RequestId: abc-123 Version: $LATEST
   [INFO] Order creation started for user: user-123
   [INFO] Inventory validation passed
   [INFO] Order created: order-xyz-789
   END RequestId: abc-123
   REPORT RequestId: abc-123 Duration: 1243.56 ms Memory: 512 MB
   
   {"statusCode":201,"body":"{\"orderId\":\"order-xyz-789\",...}"}
   
   Test with invalid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-invalid-date.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"ValidationError\",...}"}
   
   Test with insufficient stock:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-insufficient-stock.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"InsufficientStock\",...}"}

3. Create Step Functions State Machine
   File: stepFunctions/orderProcessing.asl.json
   
   {
     "Comment": "Order Processing Workflow",
     "StartAt": "ReserveInventory",
     "States": {
       "ReserveInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:reserveInventoryFunction",
         "InputPath": "$",
         "ResultPath": "$.reservationResult",
         "Next": "CheckReservation",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "ReservationFailed"
           }
         ]
       },
       
       "CheckReservation": {
         "Type": "Choice",
         "Choices": [
           {
             "Variable": "$.reservationResult.success",
             "BooleanEquals": true,
             "Next": "NotifyVendors"
           }
         ],
         "Default": "ReservationFailed"
       },
       
       "NotifyVendors": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:notifyVendorsFunction",
         "InputPath": "$",
         "ResultPath": "$.notificationResult",
         "Next": "UpdateOrderStatus",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "NotificationFailed"
           }
         ]
       },
       
       "UpdateOrderStatus": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:updateOrderStatusFunction",
         "InputPath": "$",
         "Parameters": {
           "orderId.$": "$.orderId",
           "status": "Confirmed"
         },
         "ResultPath": "$.updateResult",
         "Next": "NotifyCustomer"
       },
       
       "NotifyCustomer": {
         "Type": "Task",
         "Resource": "arn:aws:states:::sns:publish",
         "Parameters": {
           "TopicArn": "arn:aws:sns:region:account:order-notifications",
           "Message.$": "$.orderId",
           "Subject": "Order Confirmed"
         },
         "Next": "OrderProcessingComplete"
       },
       
       "OrderProcessingComplete": {
         "Type": "Succeed"
       },
       
       "ReservationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Inventory reservation failed"
         },
         "Next": "OrderFailed"
       },
       
       "NotificationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Vendor notification failed"
         },
         "Next": "ReleaseInventory"
       },
       
       "ReleaseInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:releaseInventoryFunction",
         "InputPath": "$",
         "Next": "OrderFailed"
       },
       
       "OrderFailed": {
         "Type": "Fail",
         "Error": "OrderProcessingFailed",
         "Cause": "Order processing workflow failed"
       }
     }
   }

Afternoon Session (1.5 hours)

4. Add Step Functions to SAM Template
   File: template.yaml
   
   Resources:
     OrderProcessingStateMachine:
       Type: AWS::Serverless::StateMachine
       Properties:
         Name: OrderProcessingWorkflow
         DefinitionUri: stepFunctions/orderProcessing.asl.json
         DefinitionSubstitutions:
           ReserveInventoryFunctionArn: !GetAtt ReserveInventoryFunction.Arn
           NotifyVendorsFunctionArn: !GetAtt NotifyVendorsFunction.Arn
           UpdateOrderStatusFunctionArn: !GetAtt UpdateOrderStatusFunction.Arn
           HandleOrderFailureFunctionArn: !GetAtt HandleOrderFailureFunction.Arn
           ReleaseInventoryFunctionArn: !GetAtt ReleaseInventoryFunction.Arn
           OrderNotificationsTopic: !Ref OrderNotificationsTopic
         Policies:
           - LambdaInvokePolicy:
               FunctionName: !Ref ReserveInventoryFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref NotifyVendorsFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref UpdateOrderStatusFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref HandleOrderFailureFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref ReleaseInventoryFunction
           - SNSPublishMessagePolicy:
               TopicName: !GetAtt OrderNotificationsTopic.TopicName
         Logging:
           Level: ALL
           IncludeExecutionData: true
           Destinations:
             - CloudWatchLogsLogGroup:
                 LogGroupArn: !GetAtt OrderProcessingLogGroup.Arn
     
     OrderNotificationsTopic:
       Type: AWS::SNS::Topic
       Properties:
         TopicName: order-notifications
         DisplayName: Order Notifications
         Subscription:
           - Endpoint: your-email@example.com
             Protocol: email
     
     OrderProcessingLogGroup:
       Type: AWS::Logs::LogGroup
       Properties:
         LogGroupName: /aws/vendedlogs/states/OrderProcessing
         RetentionInDays: 7

5. Deploy Complete Stack
   $ sam build
   $ sam deploy --guided
   
   Deployment Output:
   CloudFormation stack changeset
   ---------------------------------
   Operation                 LogicalResourceId         ResourceType
   ---------------------------------
   + Add                     CreateOrderFunction       AWS::Lambda::Function
   + Add                     ReserveInventoryFunc      AWS::Lambda::Function
   + Add                     NotifyVendorsFunction     AWS::Lambda::Function
   + Add                     OrderProcessingState      AWS::StepFunctions::StateMachine
   + Add                     OrdersTable               AWS::DynamoDB::Table
   + Add                     OrderNotificationsTopic   AWS::SNS::Topic
   ---------------------------------
   
   Deploy this changeset? [y/N]: y
   
   Deployment progress:
   CREATE_IN_PROGRESS  OrdersTable
   CREATE_IN_PROGRESS  CreateOrderFunction
   CREATE_COMPLETE     OrdersTable
   CREATE_COMPLETE     CreateOrderFunction
   ...
   CREATE_COMPLETE     OrderProcessingStateMachine
   
   Successfully created/updated stack - milk-delivery-dev

6. Test Deployed Stack (AWS Console)
   
   Console → Step Functions → State machines → OrderProcessingWorkflow
   ├── Click "Start execution"
   ├── Input JSON:
   │   {
   │     "orderId": "test-order-001",
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ]
   │   }
   ├── Click "Start execution"
   └── Watch execution graph
   
   Visual Execution:
   ReserveInventory (Running) ⏳
   ├── Lambda invoked
   └── Waiting for response...
   
   ReserveInventory (Succeeded) ✅
   ├── Duration: 1.2s
   └── Output: {"success": true, "reservationId": "res-123"}
   
   NotifyVendors (Running) ⏳
   ├── Lambda invoked
   └── Sending emails...
   
   NotifyVendors (Succeeded) ✅
   ├── Duration: 0.8s
   └── Output: {"notified": ["vendor-001"]}
   
   UpdateOrderStatus (Running) ⏳
   UpdateOrderStatus (Succeeded) ✅
   
   NotifyCustomer (Running) ⏳
   NotifyCustomer (Succeeded) ✅
   
   OrderProcessingComplete ✅
   Total Duration: 4.5s
   
   Check CloudWatch Logs:
   ├── Console → CloudWatch → Log groups
   ├── /aws/vendedlogs/states/OrderProcessing
   └── View execution logs

Learning Outcome:
├── Step Functions workflow working
├── Async processing implemented
├── Error handling and retries configured
├── Complete order flow functional
└── Ready for API Gateway integration
```

**Day 4: API Gateway Integration**

```
Morning Session (2 hours)

1. Add API Gateway to SAM Template
   File: template.yaml
   
   Resources:
     MilkDeliveryApi:
       Type: AWS::Serverless::Api
       Properties:
         Name: MilkDeliveryAPI
         StageName: dev
         Cors:
           AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
           AllowHeaders: "'Content-Type,Authorization'"
           AllowOrigin: "'*'"
         Auth:
           DefaultAuthorizer: CognitoAuthorizer
           Authorizers:
             CognitoAuthorizer:
               UserPoolArn: !GetAtt UserPool.Arn
         GatewayResponses:
           UNAUTHORIZED:
             StatusCode: 401
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
           BAD_REQUEST_BODY:
             StatusCode: 400
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
         DefinitionBody:
           openapi: 3.0.1
           info:
             title: Milk Delivery API
             version: 1.0.0
           paths:
             /orders:
               post:
                 summary: Create a new order
                 requestBody:
                   required: true
                   content:
                     application/json:
                       schema:
                         type: object
                         required:
                           - items
                           - deliveryDate
                           - addressId
                         properties:
                           items:
                             type: array
                             minItems: 1
                             maxItems: 50
                           deliveryDate:
                             type: string
                             format: date
                           addressId:
                             type: string
                 responses:
                   '201':
                     description: Order created successfully
                   '400':
                     description: Invalid input
                   '401':
                     description: Unauthorized
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${CreateOrderFunction.Arn}/invocations'
               get:
                 summary: List user orders
                 responses:
                   '200':
                     description: List of orders
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ListOrdersFunction.Arn}/invocations'
             
             /orders/{orderId}:
               get:
                 summary: Get order details
                 parameters:
                   - name: orderId
                     in: path
                     required: true
                     schema:
                       type: string
                 responses:
                   '200':
                     description: Order details
                   '404':
                     description: Order not found
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetOrderFunction.Arn}/invocations'
     
     CreateOrderFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/order/createOrder.handler
         Events:
           CreateOrder:
             Type: Api
             Properties:
               RestApiId: !Ref MilkDeliveryApi
               Path: /orders
               Method: POST
               Auth:
                 Authorizer: CognitoAuthorizer

2. Configure Request Validation
   File: template.yaml (add to API definition)
   
   RequestValidator:
     Type: AWS::ApiGateway::RequestValidator
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ValidateRequestBody: true
       ValidateRequestParameters: true
   
   Request Models:
   CreateOrderModel:
     Type: AWS::ApiGateway::Model
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ContentType: application/json
       Schema:
         type: object
         required:
           - items
           - deliveryDate
           - addressId
         properties:
           items:
             type: array
             minItems: 1
             items:
               type: object
               required:
                 - productId
                 - vendorId
                 - quantity
               properties:
                 productId:
                   type: string
                   pattern: '^prod-[a-zA-Z0-9-]+
                 vendorId:
                   type: string
                   pattern: '^vendor-[a-zA-Z0-9-]+
                 quantity:
                   type: integer
                   minimum: 1
                   maximum: 100
           deliveryDate:
             type: string
             format: date
           addressId:
             type: string

3. Deploy and Test API
   $ sam build
   $ sam deploy
   
   Output:
   Outputs:
   ├── MilkDeliveryApiUrl: https://abc123.execute-api.us-east-1.amazonaws.com/dev
   ├── CreateOrderFunctionArn: arn:aws:lambda:us-east-1:123456789:function:createOrder
   └── OrderProcessingStateMachine: arn:aws:states:us-east-1:123456789:stateMachine:OrderProcessing

Afternoon Session (1.5 hours)

4. Test API with Thunder Client (VS Code)
   
   Install Thunder Client extension
   ├── Extensions → Search "Thunder Client"
   ├── Install
   └── Restart VS Code
   
   Create Request Collection:
   Thunder Client → Collections → New Collection
   ├── Name: Milk Delivery API - Dev
   └── Create
   
   Request 1: Create Order (Success Case)
   ├── Method: POST
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders
   ├── Headers:
   │   ├── Content-Type: application/json
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   ├── Body (JSON):
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       },
   │       {
   │         "productId": "prod-yogurt-200g",
   │         "vendorId": "vendor-001",
   │         "quantity": 3
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (201 Created):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "quantity": 2,
         "unitPrice": 50,
         "totalPrice": 100
       },
       {
         "productId": "prod-yogurt-200g",
         "vendorId": "vendor-001",
         "productName": "Greek Yogurt 200g",
         "quantity": 3,
         "unitPrice": 30,
         "totalPrice": 90
       }
     ],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "discount": 0,
     "totalAmount": 239.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-12T08:00:00Z",
     "message": "Order created successfully. You will receive confirmation shortly."
   }
   
   Request 2: Create Order (Validation Error)
   ├── Body:
   │   {
   │     "items": [],  ← Empty array
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid input data",
     "errors": [
       {
         "field": "items",
         "message": "Items array cannot be empty",
         "code": "EMPTY_ITEMS"
       }
     ]
   }
   
   Request 3: Create Order (Insufficient Stock)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 1000  ← Too many
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 500ml' has only 50 units available",
     "productId": "prod-milk-500ml",
     "availableQuantity": 50,
     "requestedQuantity": 1000
   }
   
   Request 4: Create Order (Invalid Date)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ],
   │     "deliveryDate": "2025-10-01",  ← Past date
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid delivery date",
     "errors": [
       {
         "field": "deliveryDate",
         "message": "Delivery date cannot be in the past",
         "code": "INVALID_DATE"
       }
     ]
   }
   
   Request 5: Get Order Details
   ├── Method: GET
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders/order-abc-123-xyz
   ├── Headers:
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   └── Send
   
   Expected Response (200 OK):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [...],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "totalAmount": 239.5,
     "status": "Confirmed",
     "deliveryDate": "2025-10-12",
     "deliveryAddress": {
       "line1": "123 Main Street",
       "city": "Vadodara",
       "state": "Gujarat",
       "zipCode": "390001"
     },
     "createdAt": "2025-10-09T10:30:00Z",
     "updatedAt": "2025-10-09T10:30:15Z"
   }

5. Verify in AWS Console
   
   Console → API Gateway → MilkDeliveryAPI
   ├── Stages → dev
   ├── Invoke URL: Copy URL
   ├── Resources → /orders → POST
   ├── Test → Click "TEST" button
   ├── Request Body: Paste test JSON
   ├── Execute
   └── View Response
   
   Console → Lambda → CreateOrderFunction
   ├── Monitor tab
   ├── View logs → CloudWatch Logs
   ├── See execution logs
   └── Check for errors
   
   Console → DynamoDB → milk-delivery-orders
   ├── Items tab
   ├── See newly created order
   └── Verify all fields
   
   Console → Step Functions → OrderProcessingWorkflow
   ├── Executions tab
   ├── See execution for your order
   ├── Click execution ID
   └── View execution graph

Learning Outcome:
├── API Gateway fully integrated
├── End-to-end flow working
├── Multiple test scenarios validated
├── Ready for frontend integration
└── Understanding of full serverless stack
```

**Day 5: Edge Cases & Error Handling**

```
Morning Session (2 hours)

1. Edge Case Testing Matrix
   
   Test Case 1: Concurrent Orders (Race Condition)
   Scenario: Two users order the last item simultaneously
   
   Setup:
   ├── Set product stock to 1 unit
   ├── User A submits order for 1 unit
   ├── User B submits order for 1 unit (within milliseconds)
   └── Expected: Only one order succeeds
   
   Implementation Solution:
   ├── Use DynamoDB Conditional Expressions
   ├── UpdateItem with condition: stock > 0
   ├── If condition fails: Return insufficient stock
   └── Atomic operation prevents over-selling
   
   Code Pattern:
   await dynamodb.update({
     TableName: INVENTORY_TABLE,
     Key: { vendorId, productId },
     UpdateExpression: 'SET stock = stock - :qty, reserved = reserved + :qty',
     ConditionExpression: 'stock >= :qty',
     ExpressionAttributeValues: {
       ':qty': quantity
     }
   });
   // If condition fails, AWS throws ConditionalCheckFailedException
   
   Test Case 2: Multi-Vendor Order with Partial Failure
   Scenario: Order has items from 3 vendors, one vendor out of stock
   
   Expected Behavior:
   ├── Option A (Simple): Reject entire order
   ├── Option B (Advanced): Partial fulfillment
   └── For MVP: Choose Option A
   
   Implementation:
   ├── Validate all inventory BEFORE creating order
   ├── If any item fails: Return 400 with details
   ├── No partial orders
   └── Clear error message to user
   
   Test Case 3: Payment Gateway Timeout
   Scenario: Stripe API takes > 10 seconds to respond
   
   Implementation:
   ├── Set order status: "PaymentPending"
   ├── Use Stripe webhooks for async confirmation
   ├── Don't wait for payment in createOrder Lambda
   ├── Separate Lambda handles payment webhooks
   └── Update order status when webhook received
   
   Flow:
   createOrder → Return "PaymentPending"
       ↓
   User redirected to Stripe
       ↓
   Stripe processes payment
       ↓
   Stripe sends webhook → paymentWebhookHandler
       ↓
   Update order status → "Paid"
       ↓
   Trigger Step Functions workflow
   
   Test Case 4: Database Write Failure After Inventory Reserved
   Scenario: Inventory reserved, but DynamoDB fails to create order
   
   Problem:
   ├── Inventory locked
   ├── Order not created
   └── User sees error, but stock is reduced
   
   Solution: Use DynamoDB Transactions
   const params = {
     TransactItems: [
       {
         Update: {
           TableName: INVENTORY_TABLE,
           Key: { vendorId, productId },
           UpdateExpression: 'SET reserved = reserved + :qty',
           ConditionExpression: 'stock >= reserved + :qty',
           ExpressionAttributeValues: { ':qty': quantity }
         }
       },
       {
         Put: {
           TableName: ORDERS_TABLE,
           Item: orderObject,
           ConditionExpression: 'attribute_not_exists(orderId)'
         }
       }
     ]
   };
   await dynamodb.transactWrite(),
  "headers": {
    #foreach($header in $input.params().header.keySet())
    "$header": "$util.escapeJavaScript($input.params().header.get($header))"
    #if($foreach.hasNext),#end
    #end
  },
  "requestContext": {
    "requestId": "$context.requestId",
    "sourceIp": "$context.identity.sourceIp",
    "userAgent": "$context.identity.userAgent"
  }
}

SAM Template:
MilkDeliveryApi:
  Type: AWS::Serverless::Api
  Properties:
    DefinitionBody:
      paths:
        /orders:
          post:
            x-amazon-apigateway-integration:
              type: aws_proxy  # Passes request as-is (recommended)
              # OR
              type: aws  # Custom mapping (more complex)
              requestTemplates:
                application/json: |
                  {template above}
```

**Response Transformation:**
```
Use Case: Add custom headers, format response

Example: Add CORS headers to all responses
GatewayResponses:
  DEFAULT_4XX:
    ResponseParameters:
      gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
  DEFAULT_5XX:
    ResponseParameters:
      gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
```

### 8.3 CORS Configuration

**Problem: Browser blocks cross-origin requests**
```
Scenario:
├── Frontend: http://localhost:3000
├── API: https://api.milkdelivery.com
└── Browser blocks request (CORS policy)

Solution: Configure CORS in API Gateway
```

**SAM Template CORS Configuration:**
```yaml
MilkDeliveryApi:
  Type: AWS::Serverless::Api
  Properties:
    StageName: dev
    Cors:
      AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
      AllowHeaders: "'Content-Type,Authorization,X-Amz-Date,X-Api-Key'"
      AllowOrigin: "'*'"  # For development
      # Production: "'https://milkdelivery.com'"
      MaxAge: "'600'"  # Cache preflight response for 10 minutes
      AllowCredentials: false  # Set true if using cookies

# This automatically adds OPTIONS methods for preflight
```

**Manual OPTIONS Method (if needed):**
```yaml
paths:
  /orders:
    options:
      summary: CORS preflight
      responses:
        '200':
          description: CORS headers
          headers:
            Access-Control-Allow-Origin:
              schema:
                type: string
            Access-Control-Allow-Methods:
              schema:
                type: string
            Access-Control-Allow-Headers:
              schema:
                type: string
      x-amazon-apigateway-integration:
        type: mock
        requestTemplates:
          application/json: '{"statusCode": 200}'
        responses:
          default:
            statusCode: '200'
            responseParameters:
              method.response.header.Access-Control-Allow-Origin: "'*'"
              method.response.header.Access-Control-Allow-Methods: "'GET,POST,PUT,DELETE,OPTIONS'"
              method.response.header.Access-Control-Allow-Headers: "'Content-Type,Authorization'"
```

**Lambda Response (must include CORS headers):**
```typescript
export const handler = async (event: APIGatewayProxyEvent) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',  // Match API Gateway config
      'Access-Control-Allow-Credentials': 'false',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: 'Success' })
  };
};
```

### 8.4 Request Validation

**Schema Validation in API Gateway:**
```yaml
RequestValidator:
  Type: AWS::ApiGateway::RequestValidator
  Properties:
    RestApiId: !Ref MilkDeliveryApi
    ValidateRequestBody: true
    ValidateRequestParameters: true
    Name: request-validator

CreateOrderModel:
  Type: AWS::ApiGateway::Model
  Properties:
    RestApiId: !Ref MilkDeliveryApi
    ContentType: application/json
    Name: CreateOrderModel
    Schema:
      type: object
      required:
        - items
        - deliveryDate
        - addressId
      properties:
        items:
          type: array
          minItems: 1
          maxItems: 50
          items:
            type: object
            required:
              - productId
              - vendorId
              - quantity
            properties:
              productId:
                type: string
                minLength: 5
                pattern: '^prod-[a-zA-Z0-9-]+   await dynamodb.transactWrite(params);
   // Either both succeed or both fail (atomicity)
   
   Test Case 5: User Cancels Order During Processing
   Scenario: Order created, Step Functions running, user clicks "Cancel"
   
   Implementation:
   ├── Check current order status
   ├── If status = "Pending": Allow cancellation
   ├── If status = "Processing": Check Step Functions execution
   ├── Stop execution: stepFunctions.stopExecution()
   ├── Release inventory
   └── Update order status: "Cancelled"
   
   Test Case 6: Invalid JWT Token
   Scenario: User sends expired or tampered token
   
   API Gateway Authorizer handles:
   ├── Validates JWT signature
   ├── Checks expiration
   ├── Verifies issuer (Cognito User Pool)
   └── Returns 401 Unauthorized if invalid
   
   Lambda never receives request with invalid token
   
   Test Case 7: DynamoDB Throttling
   Scenario: Free tier limits exceeded (25 WCU/RCU)
   
   Symptoms:
   ├── ProvisionedThroughputExceededException
   ├── Lambda returns 500 error
   └── Operations fail
   
   Solution:
   ├── Use exponential backoff (built into AWS SDK)
   ├── Implement retry logic in Lambda
   ├── Monitor CloudWatch metrics
   └── Consider on-demand billing (scales automatically)
   
   Implementation:
   const dynamodbWithRetry = DynamoDBDocumentClient.from(client, {
     retryMode: 'adaptive',
     maxAttempts: 3
   });
   
   Test Case 8: Large Order (100+ items)
   Scenario: User tries to order 100 different products
   
   Considerations:
   ├── Lambda execution time: May exceed 10s timeout
   ├── DynamoDB batch size: Max 25 items per BatchGetItem
   ├── API Gateway payload: Max 10 MB
   └── Step Functions payload: Max 256 KB
   
   Solutions:
   ├── Set maximum items per order: 50
   ├── Validate in API Gateway request validator
   ├── Batch DynamoDB operations properly
   └── Use S3 for large payloads if needed (advanced)

Afternoon Session (1.5 hours)

2. Implement Idempotency
   
   Problem: User clicks "Place Order" twice
   ├── Network delay, no response
   ├── User clicks again
   └── Two orders created for same cart
   
   Solution: Idempotency Keys
   
   Request Header:
   Idempotency-Key: <unique-client-generated-uuid>
   
   Implementation:
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent) => {
     const idempotencyKey = event.headers['idempotency-key'] || 
                            event.headers['Idempotency-Key'];
     
     if (!idempotencyKey) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'MissingIdempotencyKey',
           message: 'Idempotency-Key header is required'
         })
       };
     }
     
     // Check if order with this key already exists
     const existingOrder = await dynamodb.query({
       TableName: ORDERS_TABLE,
       IndexName: 'idempotency-key-index',
       KeyConditionExpression: 'idempotencyKey = :key',
       ExpressionAttributeValues: {
         ':key': idempotencyKey
       }
     });
     
     if (existingOrder.Items && existingOrder.Items.length > 0) {
       // Order already created, return existing order
       return {
         statusCode: 200,
         body: JSON.stringify(existingOrder.Items[0])
       };
     }
     
     // Create new order with idempotency key
     const order = {
       ...orderData,
       idempotencyKey
     };
     
     await dynamodb.put({
       TableName: ORDERS_TABLE,
       Item: order,
       ConditionExpression: 'attribute_not_exists(idempotencyKey)'
     });
     
     return {
       statusCode: 201,
       body: JSON.stringify(order)
     };
   };
   
   DynamoDB Table Update (template.yaml):
   OrdersTable:
     GlobalSecondaryIndexes:
       - IndexName: idempotency-key-index
         KeySchema:
           - AttributeName: idempotencyKey
             KeyType: HASH
         Projection:
           ProjectionType: ALL

3. Implement Circuit Breaker Pattern
   
   Problem: Downstream service (payment gateway) is down
   ├── Every request times out
   ├── Lambda execution time wasted
   ├── Poor user experience
   └── Increased costs
   
   Solution: Circuit Breaker
   
   States:
   ├── CLOSED: Normal operation, requests pass through
   ├── OPEN: Too many failures, reject requests immediately
   └── HALF_OPEN: Test if service recovered
   
   Implementation:
   File: src/shared/circuitBreaker.ts
   
   class CircuitBreaker {
     private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
     private failureCount = 0;
     private failureThreshold = 5;
     private timeout = 60000; // 1 minute
     private lastFailureTime?: number;
     
     async execute<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'OPEN') {
         if (Date.now() - this.lastFailureTime! > this.timeout) {
           this.state = 'HALF_OPEN';
         } else {
           throw new Error('Circuit breaker is OPEN');
         }
       }
       
       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
     
     private onSuccess() {
       this.failureCount = 0;
       this.state = 'CLOSED';
     }
     
     private onFailure() {
       this.failureCount++;
       this.lastFailureTime = Date.now();
       
       if (this.failureCount >= this.failureThreshold) {
         this.state = 'OPEN';
       }
     }
   }
   
   Usage:
   const paymentCircuitBreaker = new CircuitBreaker();
   
   try {
     const paymentResult = await paymentCircuitBreaker.execute(async () => {
       return await stripeClient.charges.create({...});
     });
   } catch (error) {
     if (error.message === 'Circuit breaker is OPEN') {
       return {
         statusCode: 503,
         body: JSON.stringify({
           error: 'ServiceUnavailable',
           message: 'Payment service is temporarily unavailable. Please try again later.'
         })
       };
     }
   }

4. Comprehensive Error Response Structure
   
   Standardized Error Format:
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Human-readable message",
       "details": {
         "field": "specificField",
         "reason": "Detailed reason"
       },
       "requestId": "req-abc-123",
       "timestamp": "2025-10-09T10:30:00Z",
       "retryable": boolean,
       "documentation": "https://docs.milkdelivery.com/errors/ERROR_CODE"
     }
   }
   
   Error Codes Catalog:
   ├── VALIDATION_ERROR (400)
   ├── UNAUTHORIZED (401)
   ├── FORBIDDEN (403)
   ├── RESOURCE_NOT_FOUND (404)
   ├── CONFLICT (409)
   ├── RATE_LIMIT_EXCEEDED (429)
   ├── INTERNAL_SERVER_ERROR (500)
   ├── SERVICE_UNAVAILABLE (503)
   └── GATEWAY_TIMEOUT (504)
   
   Implementation:
   File: src/shared/errors.ts
   
   export class AppError extends Error {
     constructor(
       public code: string,
       public message: string,
       public statusCode: number,
       public details?: any,
       public retryable: boolean = false
     ) {
       super(message);
       this.name = 'AppError';
     }
     
     toJSON() {
       return {
         error: {
           code: this.code,
           message: this.message,
           details: this.details,
           requestId: 'Set by Lambda context',
           timestamp: new Date().toISOString(),
           retryable: this.retryable,
           documentation: `https://docs.milkdelivery.com/errors/${this.code}`
         }
       };
     }
   }
   
   export class ValidationError extends AppError {
     constructor(message: string, field?: string) {
       super('VALIDATION_ERROR', message, 400, { field });
     }
   }
   
   export class InsufficientStockError extends AppError {
     constructor(productId: string, available: number, requested: number) {
       super(
         'INSUFFICIENT_STOCK',
         `Product has only ${available} units available`,
         400,
         { productId, available, requested }
       );
     }
   }
   
   Usage in Lambda:
   try {
     // ... validation logic
     if (stock < requestedQty) {
       throw new InsufficientStockError(productId, stock, requestedQty);
     }
   } catch (error) {
     if (error instanceof AppError) {
       return {
         statusCode: error.statusCode,
         body: JSON.stringify(error.toJSON())
       };
     }
     
     // Unknown error
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: {
           code: 'INTERNAL_SERVER_ERROR',
           message: 'An unexpected error occurred',
           requestId: context.requestId,
           timestamp: new Date().toISOString()
         }
       })
     };
   }

5. Logging Best Practices
   
   Structured Logging Format:
   {
     "timestamp": "2025-10-09T10:30:00.123Z",
     "level": "INFO|WARN|ERROR",
     "requestId": "req-abc-123",
     "userId": "user-456",
     "action": "CREATE_ORDER",
     "message": "Order created successfully",
     "context": {
       "orderId": "order-xyz-789",
       "totalAmount": 239.5,
       "itemCount": 2
     },
     "duration": 1234,
     "memoryUsed": 128
   }
   
   Implementation:
   File: src/shared/logger.ts
   
   export class Logger {
     private context: Record<string, any> = {};
     
     setContext(key: string, value: any) {
       this.context[key] = value;
     }
     
     info(message: string, data?: Record<string, any>) {
       this.log('INFO', message, data);
     }
     
     warn(message: string, data?: Record<string, any>) {
       this.log('WARN', message, data);
     }
     
     error(message: string, error?: Error, data?: Record<string, any>) {
       this.log('ERROR', message, {
         ...data,
         error: error?.message,
         stack: error?.stack
       });
     }
     
     private log(level: string, message: string, data?: Record<string, any>) {
       const logEntry = {
         timestamp: new Date().toISOString(),
         level,
         message,
         ...this.context,
         ...data
       };
       
       console.log(JSON.stringify(logEntry));
     }
   }
   
   Usage in Lambda:
   export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
     const logger = new Logger();
     logger.setContext('requestId', context.requestId);
     logger.setContext('functionName', context.functionName);
     
     const startTime = Date.now();
     
     try {
       logger.info('Order creation started', {
         userId: extractUserId(event)
       });
       
       const order = await createOrder(body);
       
       logger.info('Order created successfully', {
         orderId: order.orderId,
         totalAmount: order.totalAmount,
         duration: Date.now() - startTime
       });
       
       return successResponse(order);
     } catch (error) {
       logger.error('Order creation failed', error as Error, {
         userId: extractUserId(event),
         duration: Date.now() - startTime
       });
       
       return errorResponse(error);
     }
   };

Learning Outcome:
├── Edge cases identified and handled
├── Idempotency implemented
├── Circuit breaker pattern understood
├── Error handling standardized
├── Logging best practices applied
└── Production-ready code quality
```

---

## 6. LAMBDA FUNCTIONS: DEEP DIVE

### 6.1 Lambda Execution Model

**Cold Start vs Warm Start:**
```
Cold Start (First Invocation or After Idle):
├── AWS provisions execution environment
├── Downloads function code from S3
├── Initializes runtime (Node.js)
├── Executes initialization code (outside handler)
├── Executes handler function
└── Duration: 1-3 seconds (varies)

Warm Start (Subsequent Invocations):
├── Reuses existing execution environment
├── Skips initialization
├── Executes handler function only
└── Duration: 10-100 milliseconds

Optimization Strategy:
├── Initialize clients outside handler
├── Reuse database connections
├── Cache static data
└── Keep functions "warm" (CloudWatch Events ping)
```

**Example: Optimized Lambda Structure**
```typescript
// ✅ GOOD: Initialize outside handler
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Cache configuration (loaded once)
const config = {
  ordersTable: process.env.ORDERS_TABLE,
  minOrderValue: 100,
  taxRate: 0.05
};

export const handler = async (event, context) => {
  // Handler executes quickly, reusing connections
  const result = await docClient.get({
    TableName: config.ordersTable,
    Key: { orderId: event.pathParameters.orderId }
  });
  
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};

// ❌ BAD: Initialize inside handler
export const handler = async (event, context) => {
  const client = new DynamoDBClient({});  // Created every time!
  const docClient = DynamoDBDocumentClient.from(client);
  
  const result = await docClient.get({...});
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};
```

### 6.2 Memory and Timeout Configuration

**Memory Size Impact:**
```
Memory Configuration Options: 128 MB to 10,240 MB (10 GB)

Cost Calculation:
├── Price: $0.0000166667 per GB-second
├── 128 MB = 0.125 GB
├── Example: 1 million requests, 1 second each
│   ├── 128 MB: 1M * 1s * 0.125 GB * $0.0000166667 = $2.08
│   ├── 256 MB: 1M * 1s * 0.25 GB * $0.0000166667 = $4.17
│   ├── 512 MB: 1M * 1s * 0.5 GB * $0.0000166667 = $8.33
│   └── 1024 MB: 1M * 1s * 1 GB * $0.0000166667 = $16.67

Important: CPU power scales with memory
├── 128 MB = Low CPU power (slow execution)
├── 1024 MB = Proportional CPU (4x faster)
└── Paradox: Higher memory can be cheaper (faster execution)

Example Scenario:
├── Function with 128 MB: 2 seconds execution
│   └── Cost: 2s * 0.125 GB * $0.0000166667 = $0.0000041667
├── Same function with 512 MB: 0.6 seconds execution
│   └── Cost: 0.6s * 0.5 GB * $0.0000166667 = $0.0000050000
└── Verdict: 128 MB is cheaper in this case

Optimization Process:
1. Start with 512 MB (good balance)
2. Monitor CloudWatch metrics:
   ├── Duration
   ├── Memory Used
   └── Throttles
3. Adjust based on actual usage:
   ├── If memory used < 50%: Reduce memory
   ├── If duration consistently high: Increase memory
   └── Run load tests to find optimal setting

Your Learning Project:
├── Simple queries (getUser): 256 MB, 5s timeout
├── Order creation: 512 MB, 10s timeout
├── Image processing: 1024 MB, 30s timeout
└── Batch operations: 1024 MB, 60s timeout
```

**Timeout Configuration:**
```
Default: 3 seconds
Maximum: 15 minutes (900 seconds)
Recommendation: Set slightly higher than expected duration

Examples:
├── Simple CRUD: 5-10 seconds
├── API calls to third-party: 15-30 seconds
├── Complex calculations: 30-60 seconds
└── Batch processing: 5-15 minutes

Warning: Long timeouts increase cost if function hangs
├── Always implement timeout handling in code
└── Don't rely solely on Lambda timeout
```

### 6.3 Environment Variables & Secrets

**Environment Variables (SAM Template):**
```yaml
CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Environment:
      Variables:
        ORDERS_TABLE: !Ref OrdersTable
        USERS_TABLE: !Ref UsersTable
        MIN_ORDER_VALUE: '100'
        TAX_RATE: '0.05'
        STAGE: dev
        LOG_LEVEL: INFO
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'  # Reuse HTTP connections
```

**Secrets Management:**
```
❌ NEVER store sensitive data in environment variables:
├── API keys
├── Database passwords
├── Private keys
└── OAuth tokens

✅ Use AWS Secrets Manager:

1. Store secret:
$ aws secretsmanager create-secret \
  --name milk-delivery/stripe-api-key \
  --secret-string '{"apiKey":"sk_test_..."}'

2. Grant Lambda permission (SAM template):
CreateOrderFunction:
  Policies:
    - AWSSecretsManagerGetSecretValuePolicy:
        SecretArn: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:milk-delivery/*'

3. Retrieve in Lambda:
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretName: string) {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString!);
}

// Cache secret (avoid fetching on every invocation)
let stripeKey: string;

export const handler = async (event) => {
  if (!stripeKey) {
    const secret = await getSecret('milk-delivery/stripe-api-key');
    stripeKey = secret.apiKey;
  }
  
  // Use stripeKey
};

Cost: $0.40 per secret per month + $0.05 per 10,000 API calls
For learning: ~$0.40/month (1 secret, minimal calls)
```

### 6.4 Lambda Layers (Code Reuse)

**When to Use Layers:**
```
Use Cases:
├── Shared dependencies (AWS SDK, lodash, axios)
├── Common utilities (logger, validation, db helpers)
├── Large libraries (reduce deployment package size)
└── Code reuse across multiple functions

Benefits:
├── Faster deployments (layer unchanged, only function code updates)
├── Smaller deployment packages
├── Easier dependency management
└── Version control for shared code

Limitations:
├── Max 5 layers per function
├── Max 250 MB unzipped (all layers + function)
├── Layers are immutable (create new version to update)
```

**Creating a Lambda Layer:**
```
Directory Structure:
backend/
└── layers/
    └── common/
        ├── nodejs/
        │   ├── node_modules/  ← Dependencies
        │   └── utils/         ← Your utilities
        │       ├── logger.ts
        │       ├── db.ts
        │       └── validation.ts
        └── package.json

package.json:
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.400.0",
    "@aws-sdk/lib-dynamodb": "^3.400.0",
    "uuid": "^9.0.0"
  }
}

Build Layer:
$ cd layers/common/nodejs
$ npm install
$ cd ../..
$ zip -r common-layer.zip nodejs/

SAM Template:
CommonLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: milk-delivery-common
    Description: Shared utilities and dependencies
    ContentUri: layers/common/
    CompatibleRuntimes:
      - nodejs20.x
    RetentionPolicy: Retain

CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref CommonLayer
    CodeUri: dist/

Usage in Lambda:
// Import from layer
import { logger } from '/opt/nodejs/utils/logger';
import { v4 as uuidv4 } from 'uuid';  // From layer dependencies

export const handler = async (event) => {
  logger.info('Function started');
  const id = uuidv4();
  // ...
};
```

### 6.5 Lambda Monitoring Metrics

**Key CloudWatch Metrics:**
```
1. Invocations
   ├── Count: Total number of invocations
   ├── Use: Track function usage
   └── Free Tier: 1M invocations/month

2. Duration
   ├── Measure: Execution time in milliseconds
   ├── Use: Identify slow functions
   └── Optimization target: Keep under 1 second

3. Errors
   ├── Count: Failed invocations
   ├── Types: Function errors, timeout errors
   └── Goal: < 1% error rate

4. Throttles
   ├── Count: Rejected due to concurrency limits
   ├── Causes: Too many concurrent executions
   └── Solution: Increase reserved concurrency or optimize

5. Memory Usage
   ├── Measure: Actual memory used
   ├── Use: Right-size memory configuration
   └── Example: If using 150 MB of 512 MB, reduce to 256 MB

6. Concurrent Executions
   ├── Measure: Number of instances running simultaneously
   ├── Default limit: 1000 per region
   └── Free tier limit: Usually sufficient for learning

CloudWatch Logs Insights Queries:

Query 1: Average duration by function
fields @timestamp, @duration
| stats avg(@duration) as avg_duration by @function
| sort avg_duration desc

Query 2: Error count
filter @type = "ERROR"
| stats count() as error_count by bin(5m)

Query 3: Memory usage
fields @timestamp, @memorySize / 1000 / 1000 as mem_mb, @maxMemoryUsed / 1000 / 1000 as used_mb
| stats avg(used_mb) as avg_used, max(used_mb) as max_used

Query 4: Cold starts
filter @type = "REPORT"
| fields @duration, @initDuration
| filter ispresent(@initDuration)
| stats count() as cold_starts, avg(@initDuration) as avg_cold_start_ms
```

### 6.6 Lambda Cost Optimization

**Free Tier Maximization:**
```
Lambda Free Tier (Always Free):
├── 1M requests per month
├── 400,000 GB-seconds compute time per month

Calculation Examples:

Scenario 1: 128 MB function, 200ms execution
├── Compute: 0.2s * 0.125 GB = 0.025 GB-seconds per request
├── Free tier allows: 400,000 / 0.025 = 16M requests
├── But request limit is 1M, so effective limit: 1M requests
└── Verdict: Request limit is constraint, not compute

Scenario 2: 1024 MB function, 1s execution
├── Compute: 1s * 1 GB = 1 GB-second per request
├── Free tier allows: 400,000 / 1 = 400,000 requests
├── But request limit is 1M
└── Verdict: Compute is constraint, only 400K requests free

Your Learning Project Estimate:
├── Average: 512 MB, 500ms execution
├── Compute per request: 0.5s * 0.5 GB = 0.25 GB-seconds
├── Free tier allows: 400,000 / 0.25 = 1.6M requests
├── Your usage: ~10,000 requests/month during development
└── Cost: $0 (well within free tier)

Cost After Free Tier:
├── Requests: $0.20 per 1M requests
├── Compute: $0.0000166667 per GB-second
└── Your 10K requests: ~$0.02/month

Optimization Tips:
1. Reduce memory if not fully utilized
2. Optimize code for faster execution
3. Use layers for shared dependencies
4. Implement caching where possible
5. Batch operations when feasible
6. Monitor and eliminate unnecessary invocations
```

---

## 7. DYNAMODB: QUERY PATTERNS & OPTIMIZATION

### 7.1 Key Concepts

**Partition Key (PK) vs Sort Key (SK):**
```
Partition Key (Required):
├── Determines which partition data is stored in
├── Must be unique for each item (if no sort key)
├── Used for direct lookups: GetItem, PutItem
└── Example: userId, orderId, productId

Sort Key (Optional):
├── Allows multiple items with same partition key
├── Items sorted by sort key value
├── Enables range queries
└── Example: timestamp, status, category

Table Design Pattern 1: Simple (PK only)
Users Table:
PK: userId
├── user-001
├── user-002
└── user-003

Query: Get user by ID
const result = await docClient.get({
  TableName: 'Users',
  Key: { userId: 'user-001' }
});

Table Design Pattern 2: Composite Key (PK + SK)
Orders Table:
PK: userId, SK: orderId
├── user-001, order-2025-001
├── user-001, order-2025-002
├── user-002, order-2025-003
└── user-002, order-2025-004

Query: Get all orders for a user
const result = await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-001'
  }
});

Result: Returns order-2025-001 and order-2025-002
```

**Global Secondary Index (GSI):**
```
Purpose: Query table using different keys

Example Problem:
Users Table: PK = userId
├── You can query by userId
└── But you cannot query by email

Solution: Create GSI on email

GSI: email-index
PK: email
├── Allows query by email
└── Returns userId

Query: Find user by email
const result = await docClient.query({
  TableName: 'Users',
  IndexName: 'email-index',
  KeyConditionExpression: 'email = :email',
  ExpressionAttributeValues: {
    ':email': 'user@example.com'
  }
});

GSI Considerations:
├── Cost: Consumes additional WCU/RCU
├── Eventual consistency: Slight delay (usually milliseconds)
├── Projection: Choose ALL, KEYS_ONLY, or INCLUDE
└── Free Tier: Included in 25 WCU/RCU limit

SAM Template:
UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    AttributeDefinitions:
      - AttributeName: userId
        AttributeType: S
      - AttributeName: email
        AttributeType: S
    KeySchema:
      - AttributeName: userId
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: email-index
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        Projection:
          ProjectionType: ALL
    BillingMode: PAY_PER_REQUEST
```

### 7.2 Query vs Scan

**Query (Efficient):**
```
Characteristics:
├── Uses partition key (required)
├── Optionally uses sort key for range
├── Returns only matching items
├── Fast and cost-effective
└── Use whenever possible

Example: Get all orders for a user
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-123'
  }
});

Cost: 1 RCU per 4 KB read (eventually consistent)
Example: 10 orders, 1 KB each = 10 KB = 3 RCUs
```

**Scan (Inefficient):**
```
Characteristics:
├── Reads entire table
├── Filters after reading (wasteful)
├── Slow and expensive
├── Consumes RCUs for all items scanned
└── Avoid in production

Example: Find all orders with status="Pending" (BAD!)
await docClient.scan({
  TableName: 'Orders',
  FilterExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Problem:
├── Scans all 10,000 orders
├── Filters to 100 pending orders
├── Consumes RCUs for all 10,000 items
└── Returns only 100 items

Cost: If 10,000 items * 1 KB = 10,000 KB = 2,500 RCUs
(Way over free tier 25 RCU limit!)

Solution: Use GSI
Create GSI: status-index (PK: status, SK: createdAt)

Query with GSI:
await docClient.query({
  TableName: 'Orders',
  IndexName: 'status-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Cost: Only reads 100 pending orders = 25 RCUs
Savings: 100x reduction!
```

### 7.3 Batch Operations

**BatchGetItem:**
```
Purpose: Retrieve multiple items in one request

Limitations:
├── Max 100 items per request
├── Max 16 MB total response# SOLO DEVELOPER GUIDE - AWS FREE TIER OPTIMIZED
## Milk & Milk Products Delivery Platform (Comprehensive Learning Project)

---

## TABLE OF CONTENTS
1. [Solo Developer Workflow & Mindset](#solo-developer-workflow-mindset)
2. [AWS Free Tier: Complete Strategy](#aws-free-tier-complete-strategy)
3. [Development Environment Setup](#development-environment-setup)
4. [Hybrid Development: Console + VS Code](#hybrid-development-console-vs-code)
5. [Feature Development Flow (Step-by-Step)](#feature-development-flow)
6. [Lambda Functions: Deep Dive](#lambda-functions-deep-dive)
7. [DynamoDB: Query Patterns & Optimization](#dynamodb-query-patterns-optimization)
8. [API Gateway: Configuration & Testing](#api-gateway-configuration-testing)
9. [Authentication & Authorization](#authentication-authorization)
10. [Error Handling & Edge Cases](#error-handling-edge-cases)
11. [Testing Strategies](#testing-strategies)
12. [Monitoring & Debugging](#monitoring-debugging)
13. [CI/CD Pipeline Setup](#cicd-pipeline-setup)
14. [Cost Optimization Techniques](#cost-optimization-techniques)
15. [Security Best Practices](#security-best-practices)
16. [Performance Optimization](#performance-optimization)
17. [Common Pitfalls & Solutions](#common-pitfalls-solutions)
18. [Learning Path & Milestones](#learning-path-milestones)

---

## 1. SOLO DEVELOPER WORKFLOW & MINDSET

### 1.1 Daily Development Routine

**Realistic Time Allocation (3-4 hours/day):**

```
Morning Session (1.5-2 hours)
├── 00:00-00:10 → Review AWS costs (console billing dashboard)
├── 00:10-00:20 → Check CloudWatch logs for overnight errors
├── 00:20-00:30 → Plan today's feature (write in docs/daily-log.md)
├── 00:30-01:45 → Development work (focus time, no distractions)
└── 01:45-02:00 → Commit code & push to GitHub

Evening Session (1.5-2 hours)
├── 00:00-01:00 → Continue feature development or bug fixes
├── 01:00-01:20 → Testing (local + deployed)
├── 01:20-01:40 → Documentation (update API docs, learning notes)
├── 01:40-01:50 → Deploy to AWS (if ready)
└── 01:50-02:00 → Plan tomorrow's task + update Kanban board
```

**Weekly Rhythm:**
```
Monday: Start new feature (backend)
Tuesday: Complete feature + unit tests
Wednesday: Integration + API Gateway setup
Thursday: Frontend integration
Friday: End-to-end testing + documentation
Saturday: Deployment + monitoring
Sunday: Review week, plan next week, learn new AWS concept
```

### 1.2 Solo Developer's Development Phases

**Phase 1: MVP Foundation (Week 1-3)**
```
Week 1: Infrastructure Setup
├── Day 1-2: AWS account setup, IAM users, billing alerts
├── Day 3-4: First Lambda function (Hello World → createUser)
├── Day 5-6: DynamoDB table creation + manual data entry
└── Day 7: First API endpoint working end-to-end

Week 2: User Management
├── Day 1-2: User registration with validation
├── Day 3-4: User login (Cognito integration)
├── Day 5-6: User profile management
└── Day 7: Testing + bug fixes

Week 3: Product Catalog
├── Day 1-3: Product listing + search
├── Day 4-5: Product details + images (S3)
├── Day 6: Vendor management basics
└── Day 7: Integration testing
```

**Phase 2: Core Business Logic (Week 4-8)**
```
Week 4: Order Creation Flow
├── Shopping cart logic (frontend state)
├── Order validation
├── Inventory checking
└── Order creation Lambda

Week 5: Payment Integration
├── Stripe/Razorpay SDK setup
├── Payment flow (test mode)
├── Payment webhooks
└── Order confirmation

Week 6: Step Functions
├── Order processing workflow
├── Inventory reservation
├── Vendor notifications
└── State machine testing

Week 7: Delivery Management
├── Delivery scheduling
├── Status updates
├── Notifications (SNS/SES)
└── Delivery tracking

Week 8: Integration & Bug Fixes
├── End-to-end testing
├── Edge case handling
├── Performance optimization
└── Documentation
```

**Phase 3: Frontend & Polish (Week 9-12)**
```
Week 9-10: React Frontend
├── Component development
├── State management (Redux/Zustand)
├── API integration
└── Responsive design

Week 11: Advanced Features
├── User dashboard
├── Order history
├── Admin panel basics
└── Analytics

Week 12: Deployment & Launch
├── Production deployment
├── Performance tuning
├── Security audit
└── Final testing
```

### 1.3 Task Management (Solo Approach)

**Simple Kanban Board (GitHub Projects or Trello):**
```
Backlog → Todo → In Progress → Testing → Done
```

**Sample Tasks Breakdown:**
```yaml
Epic: User Management
  Story: User Registration
    Task: Create DynamoDB Users table
    Task: Create createUser Lambda
    Task: Add validation logic
    Task: Set up API Gateway endpoint
    Task: Write unit tests
    Task: Test in console
    Task: Deploy with SAM
    Task: Integration test
    
  Story: User Login
    Task: Configure Cognito User Pool
    Task: Create login API
    Task: JWT token validation
    Task: Test authentication flow
```

### 1.4 Learning Mindset

**Document Everything:**
```
docs/
├── daily-log.md           # What you learned today
├── mistakes.md            # Errors and how you fixed them
├── aws-concepts.md        # AWS services explained in your words
├── design-decisions.md    # Why you chose X over Y
└── helpful-resources.md   # Useful articles, videos, docs
```

**Sample daily-log.md entry:**
```markdown
# Day 15 - October 10, 2025

## What I Built Today
- Completed createOrder Lambda function
- Added inventory validation
- Set up Step Functions for order processing

## What I Learned
- DynamoDB transactions prevent race conditions
- Lambda cold starts can be 1-2 seconds (need to optimize)
- Step Functions are billed per state transition ($0.025/1000)

## Problems I Faced
- Issue: Lambda timeout after 3 seconds
- Solution: Increased timeout to 10s, optimized DynamoDB query
- Learning: Always use indexes for queries, not scans!

## Tomorrow's Plan
- Add payment integration (Stripe test mode)
- Write unit tests for createOrder
- Deploy to dev environment
```

---

## 2. AWS FREE TIER: COMPLETE STRATEGY

### 2.1 Detailed Free Tier Limits

**Always Free (No Time Limit):**
```yaml
Lambda:
  Requests: 1,000,000 per month
  Compute: 400,000 GB-seconds per month
  Example: 
    - 1M invocations with 128MB = ~51 hours compute
    - Roughly 3,200 requests/day with 128MB, 1s execution
  Your Usage: Likely 100-500 requests/day during development
  Status: ✅ Safe

DynamoDB:
  Storage: 25 GB
  WCU: 25 (write capacity units)
  RCU: 25 (read capacity units)
  Example:
    - 25 WCU = 25 writes/sec or 2.1M writes/day
    - 25 RCU = 100 eventual reads/sec or 8.6M reads/day
  Your Usage: Maybe 50-100 operations/day in development
  Status: ✅ Very safe
  
  Important: Use on-demand billing mode
    - No upfront capacity planning
    - Pay only for actual reads/writes
    - First 25 WCU/RCU free, then $1.25/$0.25 per million

S3:
  Storage: 5 GB Standard storage
  GET: 20,000 requests
  PUT: 2,000 requests
  Data Transfer: 100 GB out per month (first 12 months)
  Your Usage: 10-50 MB for product images in development
  Status: ✅ Safe

CloudWatch:
  Logs: 5 GB ingestion, 5 GB storage
  Metrics: 10 custom metrics
  Alarms: 10 alarms
  Dashboard: 3 dashboards
  Your Usage: 100-500 MB logs/month during development
  Status: ✅ Safe

SNS:
  Email: 1,000 notifications/month (12 months free)
  SMS: 100 notifications/month (12 months free)
  HTTP: 100,000 notifications/month (12 months free)
  After 12 months: $0.50 per million emails
  Your Usage: 10-50 emails/month for testing
  Status: ⚠️ Be careful with SMS after year 1

SES (Simple Email Service):
  Emails: 62,000 per month (always free if sent from EC2)
  From Lambda: 3,000 per month free (12 months)
  After: $0.10 per 1,000 emails
  Your Usage: 10-100 emails/month
  Status: ✅ Safe, better than SNS for emails

Cognito:
  MAU: 50,000 monthly active users (always free)
  Your Usage: 1-10 test users
  Status: ✅ Very safe
```

**12 Months Free (After Sign-up):**
```yaml
API Gateway:
  REST API: 1,000,000 requests per month
  After: $3.50 per million requests
  Your Usage: 100-1,000 requests/day = 3,000-30,000/month
  Status: ✅ Safe during free tier
  Strategy: After 1 year, consider Lambda Function URLs (free)

CloudFront:
  Data Transfer: 1 TB out
  Requests: 10,000,000 HTTP/HTTPS
  After: $0.085 per GB + $0.0075 per 10,000 requests
  Your Usage: Don't use during development
  Status: ⚠️ Use only for production launch
```

**Services to AVOID (Cost Traps):**
```yaml
❌ NAT Gateway:
  Cost: $0.045/hour = $32.40/month + data transfer
  Why avoid: Expensive for learning
  Alternative: Lambda functions don't need NAT (direct internet)

❌ Application Load Balancer:
  Cost: $0.0225/hour = $16.20/month + LCU charges
  Why avoid: Unnecessary for serverless
  Alternative: API Gateway (free tier) or Lambda Function URLs

❌ RDS:
  Free tier: 750 hours/month for 12 months (db.t2.micro)
  After: Minimum $15-20/month
  Why avoid: Not needed, use DynamoDB
  Alternative: DynamoDB (always free up to limits)

❌ ECS/EKS:
  ECS: $0.10/hour per running task
  EKS: $0.10/hour for control plane = $73/month
  Why avoid: Overkill for learning serverless
  Alternative: Lambda functions

❌ ElastiCache:
  Free tier: None
  Cost: Minimum $13/month
  Why avoid: Not needed for MVP
  Alternative: In-memory caching in Lambda

❌ Elasticsearch:
  Free tier: None
  Cost: Minimum $23/month
  Why avoid: Expensive
  Alternative: DynamoDB queries + GSIs
```

### 2.2 Cost Monitoring Setup (Critical!)

**Step 1: Set Up Billing Alerts (Day 1 Task)**
```
AWS Console → Billing Dashboard → Billing Preferences
├── ✅ Receive PDF Invoice By Email
├── ✅ Receive Free Tier Usage Alerts (your email)
├── ✅ Receive Billing Alerts
└── Save preferences

AWS Console → CloudWatch → Alarms → Billing
├── Create Alarm: Estimated Charges > $5
├── Create Alarm: Estimated Charges > $10
├── Create Alarm: Estimated Charges > $20
└── SNS Topic: Email notification to yourself
```

**Step 2: Daily Cost Check Routine**
```
Every Morning (5 minutes):
├── AWS Console → Billing Dashboard
├── Check "Month-to-Date Spend"
├── Review "Free Tier Usage" (shows % consumed)
└── If over $5: Investigate "Cost Explorer"

Expected Daily Costs During Development:
├── Days 1-30: $0.00 - $0.50/day (within free tier)
├── Days 31-60: $0.50 - $1.00/day (learning curve)
├── Days 61-90: $0.20 - $0.50/day (optimized)
└── Goal: Stay under $10/month
```

**Step 3: AWS Cost Explorer Tags**
```
Tag all resources for tracking:
├── Environment: dev
├── Project: milk-delivery
├── Owner: your-name
└── Cost-Center: learning

Example in SAM template:
Tags:
  Environment: dev
  Project: milk-delivery
  Owner: solo-developer
```

### 2.3 Free Tier Budget Calculator

**Your Estimated Monthly Usage:**
```yaml
Service            | Free Tier    | Your Usage  | Cost Impact
-------------------|--------------|-------------|-------------
Lambda             | 1M requests  | 10,000      | $0.00
DynamoDB           | 25 WCU/RCU   | 1,000 ops   | $0.00
API Gateway        | 1M requests  | 10,000      | $0.00 (Year 1)
S3                 | 5 GB         | 100 MB      | $0.00
CloudWatch Logs    | 5 GB         | 500 MB      | $0.00
SES                | 62,000 emails| 50 emails   | $0.00
Cognito            | 50k MAU      | 5 users     | $0.00
Step Functions     | 4,000 states | 100 states  | $0.00
-------------------|--------------|-------------|-------------
TOTAL                                           | $0.00-$2.00

Potential Charges:
- API Gateway (after Year 1): ~$0.04/month
- Data Transfer Out: ~$0.50/month (minimal testing)
- CloudWatch (if over 5GB logs): ~$1.00/month

Expected Total: $0-5/month during development
```

---

## 3. DEVELOPMENT ENVIRONMENT SETUP

### 3.1 Machine Requirements

**Minimum Specifications:**
```yaml
Operating System: Windows 10/11, macOS, or Linux
Processor: Intel i3 or equivalent (dual-core)
RAM: 8 GB minimum, 16 GB recommended
Storage: 20 GB free space (for Node.js, Docker, projects)
Internet: Stable connection (AWS API calls)
```

**Recommended Setup:**
```yaml
OS: Windows 11 or macOS
RAM: 16 GB (Docker + VS Code + Browser = memory hungry)
Storage: SSD with 50 GB free (faster builds)
Internet: 10 Mbps+ (for video tutorials, AWS console)
```

### 3.2 Software Installation (Step-by-Step)

**Step 1: Install Node.js**
```
What: JavaScript runtime for Lambda development
Why: Lambda supports Node.js 20.x runtime
Where: https://nodejs.org/en/download

Installation:
├── Download Node.js 20.x LTS installer
├── Run installer (default options are fine)
├── Verify installation:
│   ├── Open terminal/command prompt
│   ├── Type: node --version (should show v20.x.x)
│   └── Type: npm --version (should show v10.x.x)
└── Done!

Post-Install Configuration:
├── Set npm global directory (avoid permission issues)
│   └── npm config set prefix ~/.npm-global (Mac/Linux)
│       or C:\Users\YourName\AppData\Roaming\npm (Windows)
└── Update npm: npm install -g npm@latest
```

**Step 2: Install AWS CLI**
```
What: Command-line tool to interact with AWS services
Why: Deploy resources, check logs, manage services
Where: https://aws.amazon.com/cli/

Windows:
├── Download MSI installer
├── Run installer
└── Verify: aws --version

macOS:
├── Option 1: Homebrew
│   └── brew install awscli
├── Option 2: Official installer
│   └── Download .pkg file
└── Verify: aws --version

Linux:
├── curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
├── unzip awscliv2.zip
├── sudo ./aws/install
└── Verify: aws --version

Configuration:
├── Run: aws configure
├── AWS Access Key ID: [Get from IAM console]
├── AWS Secret Access Key: [Get from IAM console]
├── Default region name: us-east-1
└── Default output format: json
```

**Step 3: Install AWS SAM CLI**
```
What: Framework for building serverless applications
Why: Local testing, easy deployment, IaC with templates
Where: https://aws.amazon.com/serverless/sam/

Windows:
├── Download MSI installer
├── Run installer (requires admin rights)
└── Verify: sam --version

macOS:
├── Homebrew: brew install aws-sam-cli
└── Verify: sam --version

Linux:
├── Download ZIP file
├── Unzip and install
└── Verify: sam --version

SAM Prerequisites:
├── Docker Desktop (for sam local commands)
│   └── Download from: https://www.docker.com/products/docker-desktop
└── Python 3.8+ (usually pre-installed on Mac/Linux)
```

**Step 4: Install Visual Studio Code**
```
What: Code editor with excellent AWS support
Why: Best IDE for serverless development
Where: https://code.visualstudio.com/

Installation:
├── Download installer for your OS
├── Run installer
├── Launch VS Code
└── Done!

Essential Extensions (Install via Extensions panel):
├── AWS Toolkit (amazonwebservices.aws-toolkit-vscode)
│   └── Integrates AWS services into VS Code
├── ESLint (dbaeumer.vscode-eslint)
│   └── JavaScript/TypeScript linting
├── Prettier (esbenp.prettier-vscode)
│   └── Code formatting
├── Thunder Client (rangav.vscode-thunder-client)
│   └── API testing (like Postman, but in VS Code)
├── GitLens (eamodio.gitlens)
│   └── Git history and blame annotations
├── Docker (ms-azuretools.vscode-docker)
│   └── Manage Docker containers
└── REST Client (humao.rest-client)
    └── Test HTTP requests from .http files
```

**Step 5: Install Git**
```
What: Version control system
Why: Code versioning, GitHub integration
Where: https://git-scm.com/downloads

Installation:
├── Download installer
├── Run with default options
└── Verify: git --version

Configuration:
├── git config --global user.name "Your Name"
├── git config --global user.email "your.email@example.com"
└── git config --global init.defaultBranch main
```

**Step 6: Optional but Recommended Tools**
```
Docker Desktop:
├── Required for: sam local invoke, sam local start-api
├── Download: https://www.docker.com/products/docker-desktop
└── Purpose: Run Lambda functions locally in containers

Postman (Alternative to Thunder Client):
├── Download: https://www.postman.com/downloads/
└── Purpose: API testing with collections

DynamoDB Local (Optional):
├── Download: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
└── Purpose: Test DynamoDB operations without AWS connection
```

### 3.3 AWS Account Setup

**Step 1: Create AWS Account**
```
Go to: https://aws.amazon.com/free

Sign Up Process:
├── 1. Email and password
├── 2. Account type: Personal
├── 3. Contact information
├── 4. Payment information (required, but won't charge if stay in free tier)
├── 5. Identity verification (phone call)
└── 6. Select Support Plan: Basic (Free)

⚠️ Important:
- Use a credit/debit card with at least $1 for verification
- Set up billing alerts immediately
- Enable MFA (Multi-Factor Authentication) for root account
```

**Step 2: Secure Root Account**
```
After Sign-up:
├── 1. Go to IAM → Dashboard
├── 2. Enable MFA for root account
│   ├── Use Google Authenticator, Authy, or hardware token
│   └── NEVER share MFA codes
├── 3. Create IAM user for daily use (don't use root)
└── 4. Delete root access keys if created
```

**Step 3: Create IAM User (For Development)**
```
IAM → Users → Add User

User Details:
├── Username: milk-delivery-dev
├── Access type: ✅ Programmatic access (for AWS CLI)
│              ✅ AWS Management Console access (for console)
└── Console password: Auto-generated or custom

Permissions:
├── Attach existing policies directly:
│   ├── ✅ AdministratorAccess (for learning only)
│   │   └── ⚠️ In production, use least-privilege policies
│   └── Or create custom policy (see below)
└── Tags:
    ├── Environment: dev
    └── Purpose: learning

Download Credentials:
├── Save Access Key ID
├── Save Secret Access Key
└── Store securely (password manager recommended)

Configure AWS CLI:
├── aws configure --profile milk-delivery-dev
├── Enter Access Key ID
├── Enter Secret Access Key
├── Region: us-east-1
└── Output: json
```

**Custom IAM Policy (Least Privilege for Learning):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "dynamodb:*",
        "apigateway:*",
        "s3:*",
        "cloudformation:*",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "logs:*",
        "events:*",
        "sns:*",
        "ses:*",
        "cognito-idp:*",
        "states:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3.4 VS Code Configuration

**Workspace Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true,
  "files.autoSave": "onFocusChange",
  "typescript.preferences.importModuleSpecifier": "relative",
  "aws.samcli.location": "/usr/local/bin/sam",
  "aws.profile": "milk-delivery-dev",
  "aws.region": "us-east-1",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

**Launch Configuration (.vscode/launch.json):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Lambda (SAM)",
      "type": "node",
      "request": "attach",
      "address": "localhost",
      "port": 5858,
      "localRoot": "${workspaceFolder}/backend/src",
      "remoteRoot": "/var/task",
      "protocol": "inspector",
      "stopOnEntry": false
    }
  ]
}
```

---

## 4. HYBRID DEVELOPMENT: CONSOLE + VS CODE

### 4.1 Philosophy: When to Use What

**AWS Console is BEST for:**
```
✅ Visual Learning & Exploration
   ├── Understanding service dashboards
   ├── Exploring service features and options
   ├── Reading integrated documentation
   └── Seeing visual representations (Step Functions graphs)

✅ One-Time Setup Tasks
   ├── Creating Cognito User Pool (complex configuration)
   ├── Setting up billing alerts
   ├── Creating IAM roles and policies (first time)
   ├── Configuring CloudWatch dashboards
   └── Setting up SNS/SES email verification

✅ Quick Testing & Debugging
   ├── Testing Lambda with sample events
   ├── Viewing DynamoDB table data
   ├── Checking CloudWatch logs in real-time
   ├── Testing API Gateway endpoints manually
   └── Viewing Step Functions execution history

✅ Monitoring & Operations
   ├── CloudWatch Logs Insights queries
   ├── Viewing metrics and graphs
   ├── Checking service quotas and limits
   ├── Cost analysis and billing reports
   └── Resource utilization dashboards
```

**VS Code is BEST for:**
```
✅ All Code Development
   ├── Writing Lambda functions
   ├── TypeScript/JavaScript development
   ├── Creating unit tests
   ├── Shared utilities and libraries
   └── Frontend React components

✅ Infrastructure as Code (IaC)
   ├── SAM templates (template.yaml)
   ├── CloudFormation templates
   ├── Environment configuration files
   └── Deployment scripts

✅ Version Control
   ├── Git commits and branching
   ├── Code reviews (self-review before commit)
   ├── Merge conflict resolution
   └── GitHub integration

✅ Local Development & Testing
   ├── sam local invoke (test Lambda locally)
   ├── sam local start-api (local API Gateway)
   ├── Unit tests with Jest
   ├── Integration tests
   └── Debugging with breakpoints

✅ Batch Operations
   ├── Creating multiple Lambda functions
   ├── Updating multiple files at once
   ├── Search and replace across project
   └── Refactoring code
```

### 4.2 Hybrid Workflow Patterns

**Pattern 1: Learning a New Service**
```
Example: Setting up DynamoDB for the first time

Step 1: AWS Console (30 minutes)
├── Navigate to DynamoDB service
├── Click "Create table"
├── Experiment with different settings:
│   ├── Partition key vs. Sort key
│   ├── Provisioned vs. On-demand
│   ├── Global Secondary Indexes (GSI)
│   └── Stream settings
├── Create a test table manually
├── Add sample items via console
├── Try different queries in console
└── Learn query vs. scan difference

Step 2: VS Code (30 minutes)
├── Create SAM template with DynamoDB resource
├── Define table schema in YAML
├── Add GSI definitions
├── Write Lambda function to interact with table
└── Test locally with DynamoDB Local or deployed table

Step 3: AWS Console (15 minutes)
├── Deploy via SAM from VS Code terminal
├── Verify table creation in console
├── Check table metrics
└── Validate data structure

Result: You understand DynamoDB AND have IaC code
```

**Pattern 2: Developing a New Lambda Function**
```
Example: Creating "createOrder" Lambda

Step 1: Console Prototype (15 minutes)
├── AWS Console → Lambda → Create function
├── Name: createOrderPrototype
├── Runtime: Node.js 20.x
├── Write basic handler code inline
├── Create test event with sample JSON:
│   {
│     "userId": "user-123",
│     "items": [{"productId": "prod-1", "quantity": 2}]
│   }
├── Test and see output
├── Fix any immediate errors
└── Verify basic logic works

Step 2: VS Code Development (2 hours)
├── Create file: backend/src/lambdas/order/createOrder.ts
├── Copy working logic from console
├── Add TypeScript types and interfaces
├── Implement proper error handling
├── Add input validation
├── Add logging
├── Add to SAM template
├── Write unit tests
└── Test locally: sam local invoke

Step 3: Console Debugging (20 minutes)
├── Deploy from VS Code: sam deploy
├── Go to AWS Console → Lambda → createOrder
├── Test with real event
├── Check CloudWatch logs
├── Identify any AWS-specific issues
└── Note execution time and memory usage

Step 4: VS Code Refinement (30 minutes)
├── Fix issues found in console testing
├── Optimize memory settings in SAM template
├── Adjust timeout if needed
├── Update documentation
└── Redeploy: sam deploy

Result: Production-ready Lambda with IaC
```

**Pattern 3: API Gateway Setup**
```
Example: Creating REST API with multiple endpoints

Step 1: Console Exploration (30 minutes)
├── AWS Console → API Gateway
├── Create REST API (not HTTP API)
├── Manually create one resource: /users
├── Add POST method
├── Link to Lambda function (console UI)
├── Configure CORS manually
├── Deploy to "dev" stage
├── Test with API Gateway test feature
└── Understand request/response transformation

Step 2: VS Code IaC (1 hour)
├── Add API Gateway to SAM template
├── Define all resources and methods in YAML
├── Configure Cognito authorizer
├── Set up request validators
├── Configure CORS in template
├── Add multiple endpoints
└── Deploy entire API: sam deploy

Step 3: Console Validation (15 minutes)
├── Check deployed API in console
├── Verify all endpoints exist
├── Test each endpoint
├── Check authorization works
└── Review API Gateway logs

Result: Complete API defined in code, easy to replicate
```

### 4.3 AWS Toolkit Extension (The Bridge)

**Installation & Setup:**
```
Step 1: Install Extension
├── Open VS Code
├── Go to Extensions (Ctrl+Shift+X)
├── Search: "AWS Toolkit"
├── Install "AWS Toolkit" by Amazon Web Services
└── Restart VS Code

Step 2: Connect to AWS
├── Click AWS icon in left sidebar
├── Click "Connect to AWS"
├── Select profile: milk-delivery-dev
└── Region: us-east-1

Step 3: Verify Connection
├── Expand "Lambda" in sidebar
├── You should see all deployed functions
├── Expand "DynamoDB"
├── You should see all tables
└── Success!
```

**Key Features You'll Use Daily:**

**1. Lambda Functions**
```
What you can do from VS Code:
├── View all deployed Lambda functions
├── Invoke function remotely (without console)
│   ├── Right-click function
│   ├── Select "Invoke on AWS"
│   ├── Choose test event
│   └── See results in VS Code
├── Download function code
│   ├── Right-click function
│   ├── Select "Download Lambda"
│   └── Code appears in VS Code
└── View CloudWatch logs
    ├── Right-click function
    ├── Select "View CloudWatch Logs"
    └── Logs stream in VS Code terminal

Example Workflow:
├── Deploy function from VS Code terminal: sam deploy
├── Test directly from VS Code using AWS Toolkit
├── View logs without switching to browser
└── Make changes and redeploy, all in one place
```

**2. DynamoDB Tables**
```
What you can do from VS Code:
├── Browse table data
│   ├── Expand DynamoDB in AWS Toolkit
│   ├── Right-click table
│   ├── Select "View Table"
│   └── See items in VS Code panel
├── Run queries
│   ├── Click "Query" button
│   ├── Enter partition key value
│   ├── Execute
│   └── Results appear in VS Code
├── Download items as JSON
│   ├── Right-click items
│   ├── Select "Download items"
│   └── Save to file
└── Insert test data
    ├── Right-click table
    ├── Select "Insert Item"
    └── Paste JSON

Example Workflow:
├── Check if user exists in database
├── Query directly from VS Code
├── No need to open AWS Console
└── Copy user data for test event
```

**3. CloudWatch Logs**
```
What you can do from VS Code:
├── View log groups
├── Stream logs in real-time
│   ├── Right-click Lambda function
│   ├── Select "View CloudWatch Logs"
│   ├── Logs appear in VS Code terminal
│   └── Auto-refreshes with new logs
├── Search logs
│   ├── Use Ctrl+F in log panel
│   └── Filter by text
└── Download logs for analysis

Example Workflow:
├── Deploy Lambda function
├── Invoke from VS Code
├── Instantly see logs in VS Code
├── Debug without opening console
└── Faster iteration cycle
```

**4. S3 Buckets**
```
What you can do from VS Code:
├── Browse bucket contents
├── Upload files
│   ├── Right-click bucket
│   ├── Select "Upload File"
│   └── Choose file from system
├── Download files
│   ├── Right-click file
│   ├── Select "Download"
│   └── Save to local folder
└── Delete files

Example Workflow:
├── Upload product images
├── Get S3 URL for DynamoDB
├── All without leaving VS Code
```

**5. Step Functions**
```
What you can do from VS Code:
├── View state machines
├── Start execution
│   ├── Right-click state machine
│   ├── Select "Start Execution"
│   ├── Provide input JSON
│   └── Execution starts
├── View execution history
└── Download execution results

Example Workflow:
├── Test order processing workflow
├── Start execution from VS Code
├── Check status in toolkit
├── View results inline
```

### 4.4 Detailed Workflow Examples

**Example 1: Building User Registration (Complete Flow)**

**Day 1 Morning: Console Exploration (1 hour)**
```
Task: Understand what you need to build

1. Research Phase (AWS Console)
   ├── Navigate to Cognito
   ├── Read "What is Amazon Cognito?"
   ├── Create a test User Pool
   │   ├── Pool name: milk-delivery-users-test
   │   ├── Standard attributes: email, name, phone
   │   ├── Password policy: default
   │   ├── MFA: Optional (for learning)
   │   └── Create pool
   ├── Create test user manually
   │   ├── Username: testuser@example.com
   │   ├── Temporary password: Test@1234
   │   └── Verify user can login
   └── Test user login in Cognito UI
   
2. DynamoDB Exploration (AWS Console)
   ├── Navigate to DynamoDB
   ├── Create table: Users
   │   ├── Partition key: userId (String)
   │   ├── Billing mode: On-demand
   │   └── Create table
   ├── Add sample user item manually:
   │   {
   │     "userId": "user-001",
   │     "email": "test@example.com",
   │     "name": "Test User",
   │     "phone": "+1234567890",
   │     "role": "Customer",
   │     "createdAt": "2025-10-09T10:00:00Z"
   │   }
   └── Verify item appears in table

3. Lambda Exploration (AWS Console)
   ├── Navigate to Lambda
   ├── Create function: createUserTest
   ├── Write minimal code inline:
   │   exports.handler = async (event) => {
   │     console.log('Received event:', event);
   │     return {
   │       statusCode: 200,
   │       body: JSON.stringify({ message: 'User created' })
   │     };
   │   };
   ├── Test with sample event:
   │   {
   │     "body": "{\"email\":\"new@example.com\",\"name\":\"New User\"}"
   │   }
   └── Verify it returns 200 OK

Learning Outcome:
├── Understand Cognito concepts
├── See DynamoDB table structure
├── Know Lambda basic structure
└── Ready to code properly in VS Code
```

**Day 1 Afternoon: VS Code Development (2-3 hours)**
```
Task: Build production-ready createUser Lambda

1. Project Setup (VS Code Terminal)
   $ cd ~/projects
   $ mkdir milk-delivery-platform
   $ cd milk-delivery-platform
   $ sam init
   ├── Choose: 1 - AWS Quick Start Templates
   ├── Choose: 1 - Hello World Example
   ├── Runtime: nodejs20.x
   ├── Name: milk-delivery
   └── Project created!

2. Project Structure Organization
   milk-delivery-platform/
   ├── backend/
   │   ├── src/
   │   │   ├── lambdas/
   │   │   │   └── user/
   │   │   │       ├── createUser.ts
   │   │   │       ├── getUser.ts
   │   │   │       └── types.ts
   │   │   └── shared/
   │   │       ├── db.ts
   │   │       ├── validation.ts
   │   │       └── logger.ts
   │   ├── template.yaml
   │   ├── package.json
   │   └── tsconfig.json
   └── docs/
       └── api/
           └── user-api.md

3. Install Dependencies
   $ cd backend
   $ npm init -y
   $ npm install --save @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   $ npm install --save-dev @types/node @types/aws-lambda typescript

4. Create TypeScript Configuration (tsconfig.json)
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "lib": ["ES2020"],
       "outDir": "./dist",
       "rootDir": "./src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }

5. Create Lambda Function (Skeleton)
   File: src/lambdas/user/createUser.ts
   
   // Define interfaces
   interface CreateUserRequest {
     email: string;
     name: string;
     phone: string;
     password: string;
   }
   
   interface CreateUserResponse {
     userId: string;
     email: string;
     message: string;
   }
   
   // TODO: Implement handler
   // TODO: Add validation
   // TODO: Add DynamoDB operations
   // TODO: Add error handling

6. Create SAM Template (template.yaml)
   AWSTemplateFormatVersion: '2010-09-09'
   Transform: AWS::Serverless-2016-10-31
   
   Globals:
     Function:
       Timeout: 10
       Runtime: nodejs20.x
       Environment:
         Variables:
           USERS_TABLE: !Ref UsersTable
   
   Resources:
     CreateUserFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/user/createUser.handler
         Policies:
           - DynamoDBCrudPolicy:
               TableName: !Ref UsersTable
     
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
           - IndexName: email-index
             KeySchema:
               - AttributeName: email
                 KeyType: HASH
             Projection:
               ProjectionType: ALL

7. Build & Test Locally
   $ npm run build
   $ sam build
   $ sam local invoke CreateUserFunction --event events/create-user.json
   
   events/create-user.json:
   {
     "body": "{\"email\":\"test@example.com\",\"name\":\"Test User\",\"phone\":\"+1234567890\",\"password\":\"Test@123\"}"
   }

Learning Outcome:
├── Project structure established
├── SAM template basics understood
├── Local testing working
└── Ready for implementation
```

**Day 2: Implementation & Deployment**
```
Task: Complete Lambda implementation and deploy

1. Implement Full Lambda Function (VS Code)
   File: src/lambdas/user/createUser.ts
   
   [Full TypeScript implementation with:]
   ├── Input validation (email format, password strength)
   ├── Check if email already exists (GSI query)
   ├── Generate userId (UUID)
   ├── Hash password (if not using Cognito)
   ├── Save to DynamoDB
   ├── Error handling (try-catch with proper status codes)
   └── Logging (console.log with context)

2. Create Shared Utilities (VS Code)
   File: src/shared/validation.ts
   ├── validateEmail(email: string): boolean
   ├── validatePhone(phone: string): boolean
   └── validatePassword(password: string): string | null
   
   File: src/shared/db.ts
   ├── DynamoDB client initialization
   ├── Helper functions for common operations
   └── Error handling wrappers

3. Write Unit Tests (VS Code)
   File: tests/unit/createUser.test.ts
   
   Test cases:
   ├── Should create user with valid input
   ├── Should reject invalid email
   ├── Should reject weak password
   ├── Should reject duplicate email
   └── Should handle DynamoDB errors
   
   $ npm test

4. Deploy to AWS (VS Code Terminal)
   $ sam build
   $ sam deploy --guided
   
   Prompts:
   ├── Stack name: milk-delivery-dev
   ├── Region: us-east-1
   ├── Confirm changes: Y
   ├── Allow SAM CLI IAM role creation: Y
   ├── Save arguments to config file: Y
   └── Deployment starts...
   
   Wait for: Successfully created/updated stack

5. Verify Deployment (AWS Console)
   ├── Lambda → Functions → createUserFunction
   │   ├── Check function exists
   │   ├── Check environment variables
   │   └── Check permissions
   ├── DynamoDB → Tables → milk-delivery-users
   │   ├── Check table exists
   │   ├── Check GSI: email-index
   │   └── Check capacity mode: On-demand
   └── CloudFormation → Stacks → milk-delivery-dev
       ├── Check stack status: CREATE_COMPLETE
       └── Review all resources created

6. Test Deployed Function (Console + VS Code)
   
   Option A: AWS Console
   ├── Lambda → createUserFunction → Test tab
   ├── Create test event: create-user-test
   ├── Execute test
   ├── Check response: 201 Created
   └── CloudWatch logs: Check execution logs
   
   Option B: VS Code (AWS Toolkit)
   ├── AWS Toolkit → Lambda → createUserFunction
   ├── Right-click → Invoke on AWS
   ├── Select test event
   ├── View results in VS Code
   └── Check logs in VS Code

7. Verify Data in DynamoDB (Console)
   ├── DynamoDB → Tables → milk-delivery-users
   ├── Items tab
   ├── Should see new user item
   └── Verify all fields are correct

Learning Outcome:
├── Full Lambda function deployed
├── Infrastructure as Code working
├── Understand deployment process
└── Can iterate quickly
```

---

## 5. FEATURE DEVELOPMENT FLOW (STEP-BY-STEP)

### 5.1 Complete Feature: Order Creation System

**Overview:**
```
Feature: Create Order
Complexity: High (multiple services involved)
Duration: 4-5 days
Services Used:
├── Lambda (createOrder, validateInventory)
├── DynamoDB (Orders, Products, Inventory tables)
├── Step Functions (Order processing workflow)
├── API Gateway (POST /orders endpoint)
├── SNS (Order notifications)
└── EventBridge (Order events)

Learning Goals:
├── Multi-table DynamoDB operations
├── Error handling and rollback strategies
├── Async workflows with Step Functions
├── Event-driven architecture
└── Transaction management
```

**Day 1: Planning & Design**

```
Morning Session (2 hours)

1. Requirement Analysis (docs/features/create-order.md)
   
   User Story:
   "As a customer, I want to create an order with multiple products
   from different vendors, so that I can get my dairy products delivered."
   
   Acceptance Criteria:
   ├── User must be authenticated
   ├── User must have complete profile (delivery address)
   ├── Order must have at least 1 item
   ├── All products must be in stock
   ├── Order total must be ≥ minimum order value (₹100)
   ├── Delivery date must be: today+1 to today+7
   ├── System must reserve inventory immediately
   ├── User receives order confirmation
   └── Vendors receive order notifications

2. Data Model Design
   
   Orders Table Schema:
   {
     "orderId": "uuid",
     "userId": "uuid",
     "items": [
       {
         "productId": "uuid",
         "vendorId": "uuid",
         "productName": "string",
         "quantity": number,
         "unitPrice": number,
         "totalPrice": number
       }
     ],
     "subtotal": number,
     "tax": number,
     "deliveryCharge": number,
     "discount": number,
     "totalAmount": number,
     "status": "Pending|Confirmed|Processing|Delivered|Cancelled",
     "deliveryDate": "ISO date",
     "deliveryAddress": {
       "line1": "string",
       "city": "string",
       "zipCode": "string"
     },
     "createdAt": "ISO timestamp",
     "updatedAt": "ISO timestamp"
   }

3. API Contract Design
   
   Request:
   POST /orders
   Headers:
     Authorization: Bearer <JWT_TOKEN>
     Content-Type: application/json
   
   Body:
   {
     "items": [
       {
         "productId": "prod-123",
         "vendorId": "vendor-456",
         "quantity": 2
       },
       {
         "productId": "prod-789",
         "vendorId": "vendor-456",
         "quantity": 1
       }
     ],
     "deliveryDate": "2025-10-15",
     "addressId": "addr-001"
   }
   
   Success Response (201 Created):
   {
     "orderId": "order-abc123",
     "userId": "user-xyz",
     "items": [...],
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 30,
     "totalAmount": 502.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-15T08:00:00Z",
     "message": "Order created successfully"
   }
   
   Error Responses:
   400 Bad Request:
   {
     "error": "ValidationError",
     "message": "Delivery date must be between tomorrow and 7 days from now",
     "field": "deliveryDate"
   }
   
   400 Bad Request:
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 1L' has only 5 units available",
     "availableQuantity": 5,
     "requestedQuantity": 10
   }
   
   400 Bad Request:
   {
     "error": "MinimumOrderValue",
     "message": "Order total must be at least ₹100",
     "currentTotal": 75,
     "minimumRequired": 100
   }
   
   401 Unauthorized:
   {
     "error": "Unauthorized",
     "message": "Invalid or expired token"
   }
   
   404 Not Found:
   {
     "error": "UserNotFound",
     "message": "User profile not found"
   }
   
   409 Conflict:
   {
     "error": "ProfileIncomplete",
     "message": "Please complete your profile before placing an order",
     "missingFields": ["deliveryAddress", "phone"]
   }

4. Workflow Design (Step Functions State Machine)
   
   Order Processing Workflow:
   Start
   ├── ValidateInput (Lambda)
   │   ├── Success → ValidateUser
   │   └── Fail → Return 400 Error
   ├── ValidateUser (Lambda)
   │   ├── Success → CheckInventory
   │   └── Fail → Return 404/409 Error
   ├── CheckInventory (Lambda)
   │   ├── AllAvailable → ReserveInventory
   │   └── Insufficient → Return 400 Error
   ├── ReserveInventory (Lambda)
   │   ├── Success → CalculatePricing
   │   └── Fail → Rollback
   ├── CalculatePricing (Lambda)
   │   ├── Success → CreateOrderRecord
   │   └── Fail → ReleaseInventory → Error
   ├── CreateOrderRecord (Lambda)
   │   ├── Success → NotifyUser
   │   └── Fail → ReleaseInventory → Error
   ├── NotifyUser (SNS)
   │   └── Send confirmation email
   ├── NotifyVendors (SNS)
   │   └── Send order details to each vendor
   └── End (Success)

5. Error Handling Strategy
   
   Scenario 1: Inventory Check Fails
   ├── Don't create order
   ├── Return 400 with specific product details
   └── No rollback needed (no state changed)
   
   Scenario 2: Inventory Reserved, but DynamoDB Fails
   ├── Critical: Inventory locked but order not created
   ├── Solution: Use DynamoDB transaction
   │   └── Atomic operation: Reserve inventory + Create order
   └── If transaction fails, nothing is committed
   
   Scenario 3: Order Created, but Notification Fails
   ├── Order exists, but user not notified
   ├── Solution: Make notification async (Step Functions)
   ├── Retry notification 3 times
   └── Use DLQ (Dead Letter Queue) for failures
   
   Scenario 4: Partial Vendor Availability
   ├── Some items available, some not
   ├── Option A: Reject entire order
   ├── Option B: Partial fulfillment (advanced)
   └── For MVP: Choose Option A (simpler)

Afternoon Session (1.5 hours)

6. Create Project Structure (VS Code)
   backend/
   ├── src/
   │   ├── lambdas/
   │   │   └── order/
   │   │       ├── createOrder.ts
   │   │       ├── validateInventory.ts
   │   │       ├── reserveInventory.ts
   │   │       ├── calculatePricing.ts
   │   │       └── types.ts
   │   ├── stepFunctions/
   │   │   └── orderProcessing.asl.json
   │   └── shared/
   │       ├── constants.ts
   │       └── pricing.ts
   └── tests/
       └── order/
           ├── createOrder.test.ts
           └── validateInventory.test.ts

7. Define Types (VS Code)
   File: src/lambdas/order/types.ts
   
   export interface OrderItem {
     productId: string;
     vendorId: string;
     quantity: number;
     unitPrice?: number;  // Calculated
     totalPrice?: number; // Calculated
   }
   
   export interface CreateOrderRequest {
     items: OrderItem[];
     deliveryDate: string;
     addressId: string;
   }
   
   export interface CreateOrderResponse {
     orderId: string;
     userId: string;
     items: OrderItem[];
     subtotal: number;
     tax: number;
     deliveryCharge: number;
     totalAmount: number;
     status: OrderStatus;
     estimatedDelivery: string;
     message: string;
   }
   
   export type OrderStatus = 
     | 'Pending'
     | 'Confirmed'
     | 'Processing'
     | 'OutForDelivery'
     | 'Delivered'
     | 'Cancelled'
     | 'Failed';
   
   export interface ValidationError {
     field: string;
     message: string;
     code: string;
   }

8. Create Test Events (VS Code)
   File: events/create-order-valid.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2},{\"productId\":\"prod-yogurt-200g\",\"vendorId\":\"vendor-001\",\"quantity\":3}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}",
     "headers": {
       "Authorization": "Bearer eyJhbGc...",
       "Content-Type": "application/json"
     },
     "requestContext": {
       "authorizer": {
         "claims": {
           "sub": "user-123"
         }
       }
     }
   }
   
   File: events/create-order-invalid-date.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2}],\"deliveryDate\":\"2025-10-01\",\"addressId\":\"addr-home\"}"
   }
   
   File: events/create-order-insufficient-stock.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":1000}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}"
   }

Learning Outcome:
├── Complete understanding of requirements
├── API contract defined
├── Error scenarios identified
├── Project structure ready
└── Ready to code
```

**Day 2: Core Implementation**

```
Morning Session (2.5 hours)

1. Implement Validation Logic
   File: src/lambdas/order/createOrder.ts
   
   Function: validateInput()
   ├── Check items array not empty
   ├── Check each item has required fields
   ├── Check quantities are positive integers
   ├── Check deliveryDate format (ISO 8601)
   ├── Check deliveryDate is in valid range
   └── Return ValidationError[] if any issues
   
   Function: validateUser()
   ├── Extract userId from JWT (event.requestContext.authorizer.claims.sub)
   ├── Query Users table
   ├── Check user exists
   ├── Check profile is complete
   │   ├── Has delivery address matching addressId
   │   ├── Has phone number
   │   └── Has email
   └── Return user object or error
   
   Function: validateDeliveryDate()
   ├── Parse date string
   ├── Check format is valid
   ├── Check date is not in past
   ├── Check date is not today (need 1 day preparation)
   ├── Check date is within 7 days
   └── Return boolean + error message

2. Implement Inventory Validation
   File: src/lambdas/order/validateInventory.ts
   
   Function: checkInventory()
   Input:
   {
     "items": [
       {"productId": "prod-1", "vendorId": "vendor-1", "quantity": 2}
     ]
   }
   
   Process:
   ├── Group items by vendorId
   ├── For each vendor:
   │   ├── BatchGetItem from Inventory table
   │   │   └── Keys: [{vendorId, productId}, ...]
   │   ├── For each product:
   │   │   ├── Get available = stock - reserved
   │   │   ├── Check available >= requested quantity
   │   │   └── If not: add to unavailableItems[]
   │   └── Continue
   └── Return {valid: boolean, unavailableItems: []}
   
   Output (Success):
   {
     "valid": true,
     "unavailableItems": []
   }
   
   Output (Failure):
   {
     "valid": false,
     "unavailableItems": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "requestedQty": 10,
         "availableQty": 5
       }
     ]
   }

3. Implement Pricing Calculation
   File: src/shared/pricing.ts
   
   Function: calculateOrderTotal()
   Input:
   {
     "items": [
       {
         "productId": "prod-1",
         "quantity": 2,
         "unitPrice": 50
       }
     ],
     "deliveryAddress": {
       "city": "Vadodara",
       "zipCode": "390001"
     }
   }
   
   Calculation Logic:
   ├── subtotal = sum(item.unitPrice * item.quantity)
   ├── tax = subtotal * TAX_RATE (5% GST)
   ├── deliveryCharge = calculateDeliveryCharge()
   │   ├── If subtotal >= 500: ₹0 (free delivery)
   │   ├── Else if subtotal >= 300: ₹20
   │   ├── Else: ₹40
   │   └── Add ₹10 per additional vendor (multi-vendor orders)
   ├── discount = calculateDiscount()
   │   ├── If first order: 10% off (max ₹50)
   │   ├── If loyalty points: redeem at 1 point = ₹1
   │   └── else: 0
   └── totalAmount = subtotal + tax + deliveryCharge - discount
   
   Output:
   {
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 20,
     "discount": 0,
     "totalAmount": 492.5,
     "breakdown": {
       "itemsTotal": 450,
       "taxBreakdown": {
         "cgst": 11.25,
         "sgst": 11.25
       },
       "deliveryDetails": {
         "baseCharge": 20,
         "multiVendorSurcharge": 0
       }
     }
   }

Afternoon Session (1.5 hours)

4. Implement Main Handler
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent)
   
   Flow:
   Step 1: Parse input
   ├── const body = JSON.parse(event.body || '{}');
   ├── const userId = event.requestContext.authorizer.claims.sub;
   └── Log input for debugging
   
   Step 2: Validate input
   ├── const validationErrors = validateInput(body);
   ├── if (validationErrors.length > 0):
   │   └── return 400 with errors
   └── Continue
   
   Step 3: Validate user
   ├── const user = await validateUser(userId);
   ├── if (!user):
   │   └── return 404 User Not Found
   ├── if (!user.isProfileComplete):
   │   └── return 409 Profile Incomplete
   └── Continue
   
   Step 4: Get delivery address
   ├── const address = user.addresses.find(a => a.addressId === body.addressId);
   ├── if (!address):
   │   └── return 404 Address Not Found
   └── Continue
   
   Step 5: Fetch product details
   ├── const productIds = body.items.map(i => i.productId);
   ├── const products = await batchGetProducts(productIds);
   ├── Merge product prices into items
   └── Calculate item totals
   
   Step 6: Check inventory
   ├── const inventoryCheck = await checkInventory(body.items);
   ├── if (!inventoryCheck.valid):
   │   └── return 400 Insufficient Stock with details
   └── Continue
   
   Step 7: Calculate pricing
   ├── const pricing = calculateOrderTotal(items, address, user);
   ├── if (pricing.totalAmount < MINIMUM_ORDER_VALUE):
   │   └── return 400 Minimum Order Value Not Met
   └── Continue
   
   Step 8: Create order record
   ├── const orderId = generateOrderId(); // uuid()
   ├── const order = {
   │     orderId,
   │     userId,
   │     items,
   │     ...pricing,
   │     status: 'Pending',
   │     deliveryDate: body.deliveryDate,
   │     deliveryAddress: address,
   │     createdAt: new Date().toISOString()
   │   };
   ├── await dynamodb.putItem(ORDERS_TABLE, order);
   └── Continue
   
   Step 9: Start Step Functions workflow
   ├── const executionArn = await stepFunctions.startExecution({
   │     stateMachineArn: ORDER_PROCESSING_STATE_MACHINE,
   │     input: JSON.stringify({ orderId, items })
   │   });
   └── Log execution ARN
   
   Step 10: Return response
   └── return {
         statusCode: 201,
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*'
         },
         body: JSON.stringify({
           orderId,
           userId,
           items,
           ...pricing,
           status: 'Pending',
           estimatedDelivery: calculateEstimatedDelivery(body.deliveryDate),
           message: 'Order created successfully. You will receive confirmation shortly.'
         })
       };

5. Error Handling Patterns
   
   Pattern 1: Validation Errors (400)
   try {
     const errors = validateInput(body);
     if (errors.length > 0) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'ValidationError',
           message: 'Invalid input data',
           errors: errors
         })
       };
     }
   } catch (error) {
     // Continue to Pattern 2
   }
   
   Pattern 2: Resource Not Found (404)
   const user = await getUser(userId);
   if (!user) {
     return {
       statusCode: 404,
       body: JSON.stringify({
         error: 'UserNotFound',
         message: `User with ID ${userId} not found`
       })
     };
   }
   
   Pattern 3: Business Logic Errors (400/409)
   if (pricing.totalAmount < MINIMUM_ORDER_VALUE) {
     return {
       statusCode: 400,
       body: JSON.stringify({
         error: 'MinimumOrderValue',
         message: `Order total must be at least ₹${MINIMUM_ORDER_VALUE}`,
         currentTotal: pricing.totalAmount,
         minimumRequired: MINIMUM_ORDER_VALUE
       })
     };
   }
   
   Pattern 4: Service Errors (500)
   try {
     await dynamodb.putItem(ORDERS_TABLE, order);
   } catch (error) {
     console.error('DynamoDB error:', error);
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: 'InternalServerError',
         message: 'Failed to create order. Please try again.',
         requestId: context.requestId
       })
     };
   }
   
   Pattern 5: Timeout Handling
   // Set timeout slightly less than Lambda timeout
   const timeoutMs = 9000; // Lambda timeout is 10s
   const timeoutPromise = new Promise((_, reject) => 
     setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
   );
   
   try {
     await Promise.race([
       createOrder(body),
       timeoutPromise
     ]);
   } catch (error) {
     if (error.message === 'Operation timeout') {
       return {
         statusCode: 504,
         body: JSON.stringify({
           error: 'GatewayTimeout',
           message: 'Request took too long. Please try again.'
         })
       };
     }
   }

Learning Outcome:
├── Complete Lambda implementation
├── Error handling patterns mastered
├── Ready for testing
└── Understanding of edge cases
```

**Day 3: Testing & Step Functions**

```
Morning Session (2 hours)

1. Unit Testing (VS Code)
   File: tests/unit/createOrder.test.ts
   
   Test Suite: Input Validation
   ├── Test: Should accept valid input
   ├── Test: Should reject empty items array
   ├── Test: Should reject negative quantities
   ├── Test: Should reject invalid date format
   ├── Test: Should reject past delivery dates
   └── Test: Should reject dates beyond 7 days
   
   Test Suite: User Validation
   ├── Test: Should accept valid user with complete profile
   ├── Test: Should reject non-existent user
   ├── Test: Should reject user with incomplete profile
   └── Test: Should reject invalid address ID
   
   Test Suite: Inventory Validation
   ├── Test: Should pass when all items in stock
   ├── Test: Should fail when any item out of stock
   ├── Test: Should handle partial stock correctly
   └── Test: Should handle multiple vendors
   
   Test Suite: Pricing Calculation
   ├── Test: Should calculate subtotal correctly
   ├── Test: Should apply 5% GST
   ├── Test: Should apply free delivery for orders > ₹500
   ├── Test: Should charge ₹40 for orders < ₹300
   ├── Test: Should apply first order discount
   └── Test: Should calculate multi-vendor surcharge
   
   Run Tests:
   $ npm test
   
   Expected Output:
   PASS  tests/unit/createOrder.test.ts
     Input Validation
       ✓ Should accept valid input (5ms)
       ✓ Should reject empty items array (3ms)
       ✓ Should reject negative quantities (2ms)
       ✓ Should reject invalid date format (3ms)
       ✓ Should reject past delivery dates (2ms)
       ✓ Should reject dates beyond 7 days (2ms)
     
     Test Suites: 4 passed, 4 total
     Tests:       24 passed, 24 total
     Time:        2.341s

2. Local Testing with SAM (VS Code Terminal)
   
   Build project:
   $ cd backend
   $ npm run build
   $ sam build
   
   Output:
   Building codeuri: dist/ runtime: nodejs20.x architecture: x86_64
   Running NodejsNpmBuilder:NpmPack
   Build Succeeded
   
   Test with valid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-valid.json \
     --env-vars env.json
   
   Expected Output:
   Invoking lambdas/order/createOrder.handler
   START RequestId: abc-123 Version: $LATEST
   [INFO] Order creation started for user: user-123
   [INFO] Inventory validation passed
   [INFO] Order created: order-xyz-789
   END RequestId: abc-123
   REPORT RequestId: abc-123 Duration: 1243.56 ms Memory: 512 MB
   
   {"statusCode":201,"body":"{\"orderId\":\"order-xyz-789\",...}"}
   
   Test with invalid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-invalid-date.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"ValidationError\",...}"}
   
   Test with insufficient stock:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-insufficient-stock.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"InsufficientStock\",...}"}

3. Create Step Functions State Machine
   File: stepFunctions/orderProcessing.asl.json
   
   {
     "Comment": "Order Processing Workflow",
     "StartAt": "ReserveInventory",
     "States": {
       "ReserveInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:reserveInventoryFunction",
         "InputPath": "$",
         "ResultPath": "$.reservationResult",
         "Next": "CheckReservation",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "ReservationFailed"
           }
         ]
       },
       
       "CheckReservation": {
         "Type": "Choice",
         "Choices": [
           {
             "Variable": "$.reservationResult.success",
             "BooleanEquals": true,
             "Next": "NotifyVendors"
           }
         ],
         "Default": "ReservationFailed"
       },
       
       "NotifyVendors": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:notifyVendorsFunction",
         "InputPath": "$",
         "ResultPath": "$.notificationResult",
         "Next": "UpdateOrderStatus",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "NotificationFailed"
           }
         ]
       },
       
       "UpdateOrderStatus": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:updateOrderStatusFunction",
         "InputPath": "$",
         "Parameters": {
           "orderId.$": "$.orderId",
           "status": "Confirmed"
         },
         "ResultPath": "$.updateResult",
         "Next": "NotifyCustomer"
       },
       
       "NotifyCustomer": {
         "Type": "Task",
         "Resource": "arn:aws:states:::sns:publish",
         "Parameters": {
           "TopicArn": "arn:aws:sns:region:account:order-notifications",
           "Message.$": "$.orderId",
           "Subject": "Order Confirmed"
         },
         "Next": "OrderProcessingComplete"
       },
       
       "OrderProcessingComplete": {
         "Type": "Succeed"
       },
       
       "ReservationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Inventory reservation failed"
         },
         "Next": "OrderFailed"
       },
       
       "NotificationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Vendor notification failed"
         },
         "Next": "ReleaseInventory"
       },
       
       "ReleaseInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:releaseInventoryFunction",
         "InputPath": "$",
         "Next": "OrderFailed"
       },
       
       "OrderFailed": {
         "Type": "Fail",
         "Error": "OrderProcessingFailed",
         "Cause": "Order processing workflow failed"
       }
     }
   }

Afternoon Session (1.5 hours)

4. Add Step Functions to SAM Template
   File: template.yaml
   
   Resources:
     OrderProcessingStateMachine:
       Type: AWS::Serverless::StateMachine
       Properties:
         Name: OrderProcessingWorkflow
         DefinitionUri: stepFunctions/orderProcessing.asl.json
         DefinitionSubstitutions:
           ReserveInventoryFunctionArn: !GetAtt ReserveInventoryFunction.Arn
           NotifyVendorsFunctionArn: !GetAtt NotifyVendorsFunction.Arn
           UpdateOrderStatusFunctionArn: !GetAtt UpdateOrderStatusFunction.Arn
           HandleOrderFailureFunctionArn: !GetAtt HandleOrderFailureFunction.Arn
           ReleaseInventoryFunctionArn: !GetAtt ReleaseInventoryFunction.Arn
           OrderNotificationsTopic: !Ref OrderNotificationsTopic
         Policies:
           - LambdaInvokePolicy:
               FunctionName: !Ref ReserveInventoryFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref NotifyVendorsFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref UpdateOrderStatusFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref HandleOrderFailureFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref ReleaseInventoryFunction
           - SNSPublishMessagePolicy:
               TopicName: !GetAtt OrderNotificationsTopic.TopicName
         Logging:
           Level: ALL
           IncludeExecutionData: true
           Destinations:
             - CloudWatchLogsLogGroup:
                 LogGroupArn: !GetAtt OrderProcessingLogGroup.Arn
     
     OrderNotificationsTopic:
       Type: AWS::SNS::Topic
       Properties:
         TopicName: order-notifications
         DisplayName: Order Notifications
         Subscription:
           - Endpoint: your-email@example.com
             Protocol: email
     
     OrderProcessingLogGroup:
       Type: AWS::Logs::LogGroup
       Properties:
         LogGroupName: /aws/vendedlogs/states/OrderProcessing
         RetentionInDays: 7

5. Deploy Complete Stack
   $ sam build
   $ sam deploy --guided
   
   Deployment Output:
   CloudFormation stack changeset
   ---------------------------------
   Operation                 LogicalResourceId         ResourceType
   ---------------------------------
   + Add                     CreateOrderFunction       AWS::Lambda::Function
   + Add                     ReserveInventoryFunc      AWS::Lambda::Function
   + Add                     NotifyVendorsFunction     AWS::Lambda::Function
   + Add                     OrderProcessingState      AWS::StepFunctions::StateMachine
   + Add                     OrdersTable               AWS::DynamoDB::Table
   + Add                     OrderNotificationsTopic   AWS::SNS::Topic
   ---------------------------------
   
   Deploy this changeset? [y/N]: y
   
   Deployment progress:
   CREATE_IN_PROGRESS  OrdersTable
   CREATE_IN_PROGRESS  CreateOrderFunction
   CREATE_COMPLETE     OrdersTable
   CREATE_COMPLETE     CreateOrderFunction
   ...
   CREATE_COMPLETE     OrderProcessingStateMachine
   
   Successfully created/updated stack - milk-delivery-dev

6. Test Deployed Stack (AWS Console)
   
   Console → Step Functions → State machines → OrderProcessingWorkflow
   ├── Click "Start execution"
   ├── Input JSON:
   │   {
   │     "orderId": "test-order-001",
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ]
   │   }
   ├── Click "Start execution"
   └── Watch execution graph
   
   Visual Execution:
   ReserveInventory (Running) ⏳
   ├── Lambda invoked
   └── Waiting for response...
   
   ReserveInventory (Succeeded) ✅
   ├── Duration: 1.2s
   └── Output: {"success": true, "reservationId": "res-123"}
   
   NotifyVendors (Running) ⏳
   ├── Lambda invoked
   └── Sending emails...
   
   NotifyVendors (Succeeded) ✅
   ├── Duration: 0.8s
   └── Output: {"notified": ["vendor-001"]}
   
   UpdateOrderStatus (Running) ⏳
   UpdateOrderStatus (Succeeded) ✅
   
   NotifyCustomer (Running) ⏳
   NotifyCustomer (Succeeded) ✅
   
   OrderProcessingComplete ✅
   Total Duration: 4.5s
   
   Check CloudWatch Logs:
   ├── Console → CloudWatch → Log groups
   ├── /aws/vendedlogs/states/OrderProcessing
   └── View execution logs

Learning Outcome:
├── Step Functions workflow working
├── Async processing implemented
├── Error handling and retries configured
├── Complete order flow functional
└── Ready for API Gateway integration
```

**Day 4: API Gateway Integration**

```
Morning Session (2 hours)

1. Add API Gateway to SAM Template
   File: template.yaml
   
   Resources:
     MilkDeliveryApi:
       Type: AWS::Serverless::Api
       Properties:
         Name: MilkDeliveryAPI
         StageName: dev
         Cors:
           AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
           AllowHeaders: "'Content-Type,Authorization'"
           AllowOrigin: "'*'"
         Auth:
           DefaultAuthorizer: CognitoAuthorizer
           Authorizers:
             CognitoAuthorizer:
               UserPoolArn: !GetAtt UserPool.Arn
         GatewayResponses:
           UNAUTHORIZED:
             StatusCode: 401
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
           BAD_REQUEST_BODY:
             StatusCode: 400
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
         DefinitionBody:
           openapi: 3.0.1
           info:
             title: Milk Delivery API
             version: 1.0.0
           paths:
             /orders:
               post:
                 summary: Create a new order
                 requestBody:
                   required: true
                   content:
                     application/json:
                       schema:
                         type: object
                         required:
                           - items
                           - deliveryDate
                           - addressId
                         properties:
                           items:
                             type: array
                             minItems: 1
                             maxItems: 50
                           deliveryDate:
                             type: string
                             format: date
                           addressId:
                             type: string
                 responses:
                   '201':
                     description: Order created successfully
                   '400':
                     description: Invalid input
                   '401':
                     description: Unauthorized
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${CreateOrderFunction.Arn}/invocations'
               get:
                 summary: List user orders
                 responses:
                   '200':
                     description: List of orders
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ListOrdersFunction.Arn}/invocations'
             
             /orders/{orderId}:
               get:
                 summary: Get order details
                 parameters:
                   - name: orderId
                     in: path
                     required: true
                     schema:
                       type: string
                 responses:
                   '200':
                     description: Order details
                   '404':
                     description: Order not found
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetOrderFunction.Arn}/invocations'
     
     CreateOrderFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/order/createOrder.handler
         Events:
           CreateOrder:
             Type: Api
             Properties:
               RestApiId: !Ref MilkDeliveryApi
               Path: /orders
               Method: POST
               Auth:
                 Authorizer: CognitoAuthorizer

2. Configure Request Validation
   File: template.yaml (add to API definition)
   
   RequestValidator:
     Type: AWS::ApiGateway::RequestValidator
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ValidateRequestBody: true
       ValidateRequestParameters: true
   
   Request Models:
   CreateOrderModel:
     Type: AWS::ApiGateway::Model
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ContentType: application/json
       Schema:
         type: object
         required:
           - items
           - deliveryDate
           - addressId
         properties:
           items:
             type: array
             minItems: 1
             items:
               type: object
               required:
                 - productId
                 - vendorId
                 - quantity
               properties:
                 productId:
                   type: string
                   pattern: '^prod-[a-zA-Z0-9-]+
                 vendorId:
                   type: string
                   pattern: '^vendor-[a-zA-Z0-9-]+
                 quantity:
                   type: integer
                   minimum: 1
                   maximum: 100
           deliveryDate:
             type: string
             format: date
           addressId:
             type: string

3. Deploy and Test API
   $ sam build
   $ sam deploy
   
   Output:
   Outputs:
   ├── MilkDeliveryApiUrl: https://abc123.execute-api.us-east-1.amazonaws.com/dev
   ├── CreateOrderFunctionArn: arn:aws:lambda:us-east-1:123456789:function:createOrder
   └── OrderProcessingStateMachine: arn:aws:states:us-east-1:123456789:stateMachine:OrderProcessing

Afternoon Session (1.5 hours)

4. Test API with Thunder Client (VS Code)
   
   Install Thunder Client extension
   ├── Extensions → Search "Thunder Client"
   ├── Install
   └── Restart VS Code
   
   Create Request Collection:
   Thunder Client → Collections → New Collection
   ├── Name: Milk Delivery API - Dev
   └── Create
   
   Request 1: Create Order (Success Case)
   ├── Method: POST
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders
   ├── Headers:
   │   ├── Content-Type: application/json
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   ├── Body (JSON):
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       },
   │       {
   │         "productId": "prod-yogurt-200g",
   │         "vendorId": "vendor-001",
   │         "quantity": 3
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (201 Created):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "quantity": 2,
         "unitPrice": 50,
         "totalPrice": 100
       },
       {
         "productId": "prod-yogurt-200g",
         "vendorId": "vendor-001",
         "productName": "Greek Yogurt 200g",
         "quantity": 3,
         "unitPrice": 30,
         "totalPrice": 90
       }
     ],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "discount": 0,
     "totalAmount": 239.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-12T08:00:00Z",
     "message": "Order created successfully. You will receive confirmation shortly."
   }
   
   Request 2: Create Order (Validation Error)
   ├── Body:
   │   {
   │     "items": [],  ← Empty array
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid input data",
     "errors": [
       {
         "field": "items",
         "message": "Items array cannot be empty",
         "code": "EMPTY_ITEMS"
       }
     ]
   }
   
   Request 3: Create Order (Insufficient Stock)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 1000  ← Too many
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 500ml' has only 50 units available",
     "productId": "prod-milk-500ml",
     "availableQuantity": 50,
     "requestedQuantity": 1000
   }
   
   Request 4: Create Order (Invalid Date)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ],
   │     "deliveryDate": "2025-10-01",  ← Past date
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid delivery date",
     "errors": [
       {
         "field": "deliveryDate",
         "message": "Delivery date cannot be in the past",
         "code": "INVALID_DATE"
       }
     ]
   }
   
   Request 5: Get Order Details
   ├── Method: GET
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders/order-abc-123-xyz
   ├── Headers:
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   └── Send
   
   Expected Response (200 OK):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [...],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "totalAmount": 239.5,
     "status": "Confirmed",
     "deliveryDate": "2025-10-12",
     "deliveryAddress": {
       "line1": "123 Main Street",
       "city": "Vadodara",
       "state": "Gujarat",
       "zipCode": "390001"
     },
     "createdAt": "2025-10-09T10:30:00Z",
     "updatedAt": "2025-10-09T10:30:15Z"
   }

5. Verify in AWS Console
   
   Console → API Gateway → MilkDeliveryAPI
   ├── Stages → dev
   ├── Invoke URL: Copy URL
   ├── Resources → /orders → POST
   ├── Test → Click "TEST" button
   ├── Request Body: Paste test JSON
   ├── Execute
   └── View Response
   
   Console → Lambda → CreateOrderFunction
   ├── Monitor tab
   ├── View logs → CloudWatch Logs
   ├── See execution logs
   └── Check for errors
   
   Console → DynamoDB → milk-delivery-orders
   ├── Items tab
   ├── See newly created order
   └── Verify all fields
   
   Console → Step Functions → OrderProcessingWorkflow
   ├── Executions tab
   ├── See execution for your order
   ├── Click execution ID
   └── View execution graph

Learning Outcome:
├── API Gateway fully integrated
├── End-to-end flow working
├── Multiple test scenarios validated
├── Ready for frontend integration
└── Understanding of full serverless stack
```

**Day 5: Edge Cases & Error Handling**

```
Morning Session (2 hours)

1. Edge Case Testing Matrix
   
   Test Case 1: Concurrent Orders (Race Condition)
   Scenario: Two users order the last item simultaneously
   
   Setup:
   ├── Set product stock to 1 unit
   ├── User A submits order for 1 unit
   ├── User B submits order for 1 unit (within milliseconds)
   └── Expected: Only one order succeeds
   
   Implementation Solution:
   ├── Use DynamoDB Conditional Expressions
   ├── UpdateItem with condition: stock > 0
   ├── If condition fails: Return insufficient stock
   └── Atomic operation prevents over-selling
   
   Code Pattern:
   await dynamodb.update({
     TableName: INVENTORY_TABLE,
     Key: { vendorId, productId },
     UpdateExpression: 'SET stock = stock - :qty, reserved = reserved + :qty',
     ConditionExpression: 'stock >= :qty',
     ExpressionAttributeValues: {
       ':qty': quantity
     }
   });
   // If condition fails, AWS throws ConditionalCheckFailedException
   
   Test Case 2: Multi-Vendor Order with Partial Failure
   Scenario: Order has items from 3 vendors, one vendor out of stock
   
   Expected Behavior:
   ├── Option A (Simple): Reject entire order
   ├── Option B (Advanced): Partial fulfillment
   └── For MVP: Choose Option A
   
   Implementation:
   ├── Validate all inventory BEFORE creating order
   ├── If any item fails: Return 400 with details
   ├── No partial orders
   └── Clear error message to user
   
   Test Case 3: Payment Gateway Timeout
   Scenario: Stripe API takes > 10 seconds to respond
   
   Implementation:
   ├── Set order status: "PaymentPending"
   ├── Use Stripe webhooks for async confirmation
   ├── Don't wait for payment in createOrder Lambda
   ├── Separate Lambda handles payment webhooks
   └── Update order status when webhook received
   
   Flow:
   createOrder → Return "PaymentPending"
       ↓
   User redirected to Stripe
       ↓
   Stripe processes payment
       ↓
   Stripe sends webhook → paymentWebhookHandler
       ↓
   Update order status → "Paid"
       ↓
   Trigger Step Functions workflow
   
   Test Case 4: Database Write Failure After Inventory Reserved
   Scenario: Inventory reserved, but DynamoDB fails to create order
   
   Problem:
   ├── Inventory locked
   ├── Order not created
   └── User sees error, but stock is reduced
   
   Solution: Use DynamoDB Transactions
   const params = {
     TransactItems: [
       {
         Update: {
           TableName: INVENTORY_TABLE,
           Key: { vendorId, productId },
           UpdateExpression: 'SET reserved = reserved + :qty',
           ConditionExpression: 'stock >= reserved + :qty',
           ExpressionAttributeValues: { ':qty': quantity }
         }
       },
       {
         Put: {
           TableName: ORDERS_TABLE,
           Item: orderObject,
           ConditionExpression: 'attribute_not_exists(orderId)'
         }
       }
     ]
   };
   await dynamodb.transactWrite(
              vendorId:
                type: string
                pattern: '^vendor-[a-zA-Z0-9-]+   await dynamodb.transactWrite(params);
   // Either both succeed or both fail (atomicity)
   
   Test Case 5: User Cancels Order During Processing
   Scenario: Order created, Step Functions running, user clicks "Cancel"
   
   Implementation:
   ├── Check current order status
   ├── If status = "Pending": Allow cancellation
   ├── If status = "Processing": Check Step Functions execution
   ├── Stop execution: stepFunctions.stopExecution()
   ├── Release inventory
   └── Update order status: "Cancelled"
   
   Test Case 6: Invalid JWT Token
   Scenario: User sends expired or tampered token
   
   API Gateway Authorizer handles:
   ├── Validates JWT signature
   ├── Checks expiration
   ├── Verifies issuer (Cognito User Pool)
   └── Returns 401 Unauthorized if invalid
   
   Lambda never receives request with invalid token
   
   Test Case 7: DynamoDB Throttling
   Scenario: Free tier limits exceeded (25 WCU/RCU)
   
   Symptoms:
   ├── ProvisionedThroughputExceededException
   ├── Lambda returns 500 error
   └── Operations fail
   
   Solution:
   ├── Use exponential backoff (built into AWS SDK)
   ├── Implement retry logic in Lambda
   ├── Monitor CloudWatch metrics
   └── Consider on-demand billing (scales automatically)
   
   Implementation:
   const dynamodbWithRetry = DynamoDBDocumentClient.from(client, {
     retryMode: 'adaptive',
     maxAttempts: 3
   });
   
   Test Case 8: Large Order (100+ items)
   Scenario: User tries to order 100 different products
   
   Considerations:
   ├── Lambda execution time: May exceed 10s timeout
   ├── DynamoDB batch size: Max 25 items per BatchGetItem
   ├── API Gateway payload: Max 10 MB
   └── Step Functions payload: Max 256 KB
   
   Solutions:
   ├── Set maximum items per order: 50
   ├── Validate in API Gateway request validator
   ├── Batch DynamoDB operations properly
   └── Use S3 for large payloads if needed (advanced)

Afternoon Session (1.5 hours)

2. Implement Idempotency
   
   Problem: User clicks "Place Order" twice
   ├── Network delay, no response
   ├── User clicks again
   └── Two orders created for same cart
   
   Solution: Idempotency Keys
   
   Request Header:
   Idempotency-Key: <unique-client-generated-uuid>
   
   Implementation:
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent) => {
     const idempotencyKey = event.headers['idempotency-key'] || 
                            event.headers['Idempotency-Key'];
     
     if (!idempotencyKey) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'MissingIdempotencyKey',
           message: 'Idempotency-Key header is required'
         })
       };
     }
     
     // Check if order with this key already exists
     const existingOrder = await dynamodb.query({
       TableName: ORDERS_TABLE,
       IndexName: 'idempotency-key-index',
       KeyConditionExpression: 'idempotencyKey = :key',
       ExpressionAttributeValues: {
         ':key': idempotencyKey
       }
     });
     
     if (existingOrder.Items && existingOrder.Items.length > 0) {
       // Order already created, return existing order
       return {
         statusCode: 200,
         body: JSON.stringify(existingOrder.Items[0])
       };
     }
     
     // Create new order with idempotency key
     const order = {
       ...orderData,
       idempotencyKey
     };
     
     await dynamodb.put({
       TableName: ORDERS_TABLE,
       Item: order,
       ConditionExpression: 'attribute_not_exists(idempotencyKey)'
     });
     
     return {
       statusCode: 201,
       body: JSON.stringify(order)
     };
   };
   
   DynamoDB Table Update (template.yaml):
   OrdersTable:
     GlobalSecondaryIndexes:
       - IndexName: idempotency-key-index
         KeySchema:
           - AttributeName: idempotencyKey
             KeyType: HASH
         Projection:
           ProjectionType: ALL

3. Implement Circuit Breaker Pattern
   
   Problem: Downstream service (payment gateway) is down
   ├── Every request times out
   ├── Lambda execution time wasted
   ├── Poor user experience
   └── Increased costs
   
   Solution: Circuit Breaker
   
   States:
   ├── CLOSED: Normal operation, requests pass through
   ├── OPEN: Too many failures, reject requests immediately
   └── HALF_OPEN: Test if service recovered
   
   Implementation:
   File: src/shared/circuitBreaker.ts
   
   class CircuitBreaker {
     private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
     private failureCount = 0;
     private failureThreshold = 5;
     private timeout = 60000; // 1 minute
     private lastFailureTime?: number;
     
     async execute<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'OPEN') {
         if (Date.now() - this.lastFailureTime! > this.timeout) {
           this.state = 'HALF_OPEN';
         } else {
           throw new Error('Circuit breaker is OPEN');
         }
       }
       
       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
     
     private onSuccess() {
       this.failureCount = 0;
       this.state = 'CLOSED';
     }
     
     private onFailure() {
       this.failureCount++;
       this.lastFailureTime = Date.now();
       
       if (this.failureCount >= this.failureThreshold) {
         this.state = 'OPEN';
       }
     }
   }
   
   Usage:
   const paymentCircuitBreaker = new CircuitBreaker();
   
   try {
     const paymentResult = await paymentCircuitBreaker.execute(async () => {
       return await stripeClient.charges.create({...});
     });
   } catch (error) {
     if (error.message === 'Circuit breaker is OPEN') {
       return {
         statusCode: 503,
         body: JSON.stringify({
           error: 'ServiceUnavailable',
           message: 'Payment service is temporarily unavailable. Please try again later.'
         })
       };
     }
   }

4. Comprehensive Error Response Structure
   
   Standardized Error Format:
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Human-readable message",
       "details": {
         "field": "specificField",
         "reason": "Detailed reason"
       },
       "requestId": "req-abc-123",
       "timestamp": "2025-10-09T10:30:00Z",
       "retryable": boolean,
       "documentation": "https://docs.milkdelivery.com/errors/ERROR_CODE"
     }
   }
   
   Error Codes Catalog:
   ├── VALIDATION_ERROR (400)
   ├── UNAUTHORIZED (401)
   ├── FORBIDDEN (403)
   ├── RESOURCE_NOT_FOUND (404)
   ├── CONFLICT (409)
   ├── RATE_LIMIT_EXCEEDED (429)
   ├── INTERNAL_SERVER_ERROR (500)
   ├── SERVICE_UNAVAILABLE (503)
   └── GATEWAY_TIMEOUT (504)
   
   Implementation:
   File: src/shared/errors.ts
   
   export class AppError extends Error {
     constructor(
       public code: string,
       public message: string,
       public statusCode: number,
       public details?: any,
       public retryable: boolean = false
     ) {
       super(message);
       this.name = 'AppError';
     }
     
     toJSON() {
       return {
         error: {
           code: this.code,
           message: this.message,
           details: this.details,
           requestId: 'Set by Lambda context',
           timestamp: new Date().toISOString(),
           retryable: this.retryable,
           documentation: `https://docs.milkdelivery.com/errors/${this.code}`
         }
       };
     }
   }
   
   export class ValidationError extends AppError {
     constructor(message: string, field?: string) {
       super('VALIDATION_ERROR', message, 400, { field });
     }
   }
   
   export class InsufficientStockError extends AppError {
     constructor(productId: string, available: number, requested: number) {
       super(
         'INSUFFICIENT_STOCK',
         `Product has only ${available} units available`,
         400,
         { productId, available, requested }
       );
     }
   }
   
   Usage in Lambda:
   try {
     // ... validation logic
     if (stock < requestedQty) {
       throw new InsufficientStockError(productId, stock, requestedQty);
     }
   } catch (error) {
     if (error instanceof AppError) {
       return {
         statusCode: error.statusCode,
         body: JSON.stringify(error.toJSON())
       };
     }
     
     // Unknown error
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: {
           code: 'INTERNAL_SERVER_ERROR',
           message: 'An unexpected error occurred',
           requestId: context.requestId,
           timestamp: new Date().toISOString()
         }
       })
     };
   }

5. Logging Best Practices
   
   Structured Logging Format:
   {
     "timestamp": "2025-10-09T10:30:00.123Z",
     "level": "INFO|WARN|ERROR",
     "requestId": "req-abc-123",
     "userId": "user-456",
     "action": "CREATE_ORDER",
     "message": "Order created successfully",
     "context": {
       "orderId": "order-xyz-789",
       "totalAmount": 239.5,
       "itemCount": 2
     },
     "duration": 1234,
     "memoryUsed": 128
   }
   
   Implementation:
   File: src/shared/logger.ts
   
   export class Logger {
     private context: Record<string, any> = {};
     
     setContext(key: string, value: any) {
       this.context[key] = value;
     }
     
     info(message: string, data?: Record<string, any>) {
       this.log('INFO', message, data);
     }
     
     warn(message: string, data?: Record<string, any>) {
       this.log('WARN', message, data);
     }
     
     error(message: string, error?: Error, data?: Record<string, any>) {
       this.log('ERROR', message, {
         ...data,
         error: error?.message,
         stack: error?.stack
       });
     }
     
     private log(level: string, message: string, data?: Record<string, any>) {
       const logEntry = {
         timestamp: new Date().toISOString(),
         level,
         message,
         ...this.context,
         ...data
       };
       
       console.log(JSON.stringify(logEntry));
     }
   }
   
   Usage in Lambda:
   export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
     const logger = new Logger();
     logger.setContext('requestId', context.requestId);
     logger.setContext('functionName', context.functionName);
     
     const startTime = Date.now();
     
     try {
       logger.info('Order creation started', {
         userId: extractUserId(event)
       });
       
       const order = await createOrder(body);
       
       logger.info('Order created successfully', {
         orderId: order.orderId,
         totalAmount: order.totalAmount,
         duration: Date.now() - startTime
       });
       
       return successResponse(order);
     } catch (error) {
       logger.error('Order creation failed', error as Error, {
         userId: extractUserId(event),
         duration: Date.now() - startTime
       });
       
       return errorResponse(error);
     }
   };

Learning Outcome:
├── Edge cases identified and handled
├── Idempotency implemented
├── Circuit breaker pattern understood
├── Error handling standardized
├── Logging best practices applied
└── Production-ready code quality
```

---

## 6. LAMBDA FUNCTIONS: DEEP DIVE

### 6.1 Lambda Execution Model

**Cold Start vs Warm Start:**
```
Cold Start (First Invocation or After Idle):
├── AWS provisions execution environment
├── Downloads function code from S3
├── Initializes runtime (Node.js)
├── Executes initialization code (outside handler)
├── Executes handler function
└── Duration: 1-3 seconds (varies)

Warm Start (Subsequent Invocations):
├── Reuses existing execution environment
├── Skips initialization
├── Executes handler function only
└── Duration: 10-100 milliseconds

Optimization Strategy:
├── Initialize clients outside handler
├── Reuse database connections
├── Cache static data
└── Keep functions "warm" (CloudWatch Events ping)
```

**Example: Optimized Lambda Structure**
```typescript
// ✅ GOOD: Initialize outside handler
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Cache configuration (loaded once)
const config = {
  ordersTable: process.env.ORDERS_TABLE,
  minOrderValue: 100,
  taxRate: 0.05
};

export const handler = async (event, context) => {
  // Handler executes quickly, reusing connections
  const result = await docClient.get({
    TableName: config.ordersTable,
    Key: { orderId: event.pathParameters.orderId }
  });
  
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};

// ❌ BAD: Initialize inside handler
export const handler = async (event, context) => {
  const client = new DynamoDBClient({});  // Created every time!
  const docClient = DynamoDBDocumentClient.from(client);
  
  const result = await docClient.get({...});
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};
```

### 6.2 Memory and Timeout Configuration

**Memory Size Impact:**
```
Memory Configuration Options: 128 MB to 10,240 MB (10 GB)

Cost Calculation:
├── Price: $0.0000166667 per GB-second
├── 128 MB = 0.125 GB
├── Example: 1 million requests, 1 second each
│   ├── 128 MB: 1M * 1s * 0.125 GB * $0.0000166667 = $2.08
│   ├── 256 MB: 1M * 1s * 0.25 GB * $0.0000166667 = $4.17
│   ├── 512 MB: 1M * 1s * 0.5 GB * $0.0000166667 = $8.33
│   └── 1024 MB: 1M * 1s * 1 GB * $0.0000166667 = $16.67

Important: CPU power scales with memory
├── 128 MB = Low CPU power (slow execution)
├── 1024 MB = Proportional CPU (4x faster)
└── Paradox: Higher memory can be cheaper (faster execution)

Example Scenario:
├── Function with 128 MB: 2 seconds execution
│   └── Cost: 2s * 0.125 GB * $0.0000166667 = $0.0000041667
├── Same function with 512 MB: 0.6 seconds execution
│   └── Cost: 0.6s * 0.5 GB * $0.0000166667 = $0.0000050000
└── Verdict: 128 MB is cheaper in this case

Optimization Process:
1. Start with 512 MB (good balance)
2. Monitor CloudWatch metrics:
   ├── Duration
   ├── Memory Used
   └── Throttles
3. Adjust based on actual usage:
   ├── If memory used < 50%: Reduce memory
   ├── If duration consistently high: Increase memory
   └── Run load tests to find optimal setting

Your Learning Project:
├── Simple queries (getUser): 256 MB, 5s timeout
├── Order creation: 512 MB, 10s timeout
├── Image processing: 1024 MB, 30s timeout
└── Batch operations: 1024 MB, 60s timeout
```

**Timeout Configuration:**
```
Default: 3 seconds
Maximum: 15 minutes (900 seconds)
Recommendation: Set slightly higher than expected duration

Examples:
├── Simple CRUD: 5-10 seconds
├── API calls to third-party: 15-30 seconds
├── Complex calculations: 30-60 seconds
└── Batch processing: 5-15 minutes

Warning: Long timeouts increase cost if function hangs
├── Always implement timeout handling in code
└── Don't rely solely on Lambda timeout
```

### 6.3 Environment Variables & Secrets

**Environment Variables (SAM Template):**
```yaml
CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Environment:
      Variables:
        ORDERS_TABLE: !Ref OrdersTable
        USERS_TABLE: !Ref UsersTable
        MIN_ORDER_VALUE: '100'
        TAX_RATE: '0.05'
        STAGE: dev
        LOG_LEVEL: INFO
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'  # Reuse HTTP connections
```

**Secrets Management:**
```
❌ NEVER store sensitive data in environment variables:
├── API keys
├── Database passwords
├── Private keys
└── OAuth tokens

✅ Use AWS Secrets Manager:

1. Store secret:
$ aws secretsmanager create-secret \
  --name milk-delivery/stripe-api-key \
  --secret-string '{"apiKey":"sk_test_..."}'

2. Grant Lambda permission (SAM template):
CreateOrderFunction:
  Policies:
    - AWSSecretsManagerGetSecretValuePolicy:
        SecretArn: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:milk-delivery/*'

3. Retrieve in Lambda:
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretName: string) {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString!);
}

// Cache secret (avoid fetching on every invocation)
let stripeKey: string;

export const handler = async (event) => {
  if (!stripeKey) {
    const secret = await getSecret('milk-delivery/stripe-api-key');
    stripeKey = secret.apiKey;
  }
  
  // Use stripeKey
};

Cost: $0.40 per secret per month + $0.05 per 10,000 API calls
For learning: ~$0.40/month (1 secret, minimal calls)
```

### 6.4 Lambda Layers (Code Reuse)

**When to Use Layers:**
```
Use Cases:
├── Shared dependencies (AWS SDK, lodash, axios)
├── Common utilities (logger, validation, db helpers)
├── Large libraries (reduce deployment package size)
└── Code reuse across multiple functions

Benefits:
├── Faster deployments (layer unchanged, only function code updates)
├── Smaller deployment packages
├── Easier dependency management
└── Version control for shared code

Limitations:
├── Max 5 layers per function
├── Max 250 MB unzipped (all layers + function)
├── Layers are immutable (create new version to update)
```

**Creating a Lambda Layer:**
```
Directory Structure:
backend/
└── layers/
    └── common/
        ├── nodejs/
        │   ├── node_modules/  ← Dependencies
        │   └── utils/         ← Your utilities
        │       ├── logger.ts
        │       ├── db.ts
        │       └── validation.ts
        └── package.json

package.json:
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.400.0",
    "@aws-sdk/lib-dynamodb": "^3.400.0",
    "uuid": "^9.0.0"
  }
}

Build Layer:
$ cd layers/common/nodejs
$ npm install
$ cd ../..
$ zip -r common-layer.zip nodejs/

SAM Template:
CommonLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: milk-delivery-common
    Description: Shared utilities and dependencies
    ContentUri: layers/common/
    CompatibleRuntimes:
      - nodejs20.x
    RetentionPolicy: Retain

CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref CommonLayer
    CodeUri: dist/

Usage in Lambda:
// Import from layer
import { logger } from '/opt/nodejs/utils/logger';
import { v4 as uuidv4 } from 'uuid';  // From layer dependencies

export const handler = async (event) => {
  logger.info('Function started');
  const id = uuidv4();
  // ...
};
```

### 6.5 Lambda Monitoring Metrics

**Key CloudWatch Metrics:**
```
1. Invocations
   ├── Count: Total number of invocations
   ├── Use: Track function usage
   └── Free Tier: 1M invocations/month

2. Duration
   ├── Measure: Execution time in milliseconds
   ├── Use: Identify slow functions
   └── Optimization target: Keep under 1 second

3. Errors
   ├── Count: Failed invocations
   ├── Types: Function errors, timeout errors
   └── Goal: < 1% error rate

4. Throttles
   ├── Count: Rejected due to concurrency limits
   ├── Causes: Too many concurrent executions
   └── Solution: Increase reserved concurrency or optimize

5. Memory Usage
   ├── Measure: Actual memory used
   ├── Use: Right-size memory configuration
   └── Example: If using 150 MB of 512 MB, reduce to 256 MB

6. Concurrent Executions
   ├── Measure: Number of instances running simultaneously
   ├── Default limit: 1000 per region
   └── Free tier limit: Usually sufficient for learning

CloudWatch Logs Insights Queries:

Query 1: Average duration by function
fields @timestamp, @duration
| stats avg(@duration) as avg_duration by @function
| sort avg_duration desc

Query 2: Error count
filter @type = "ERROR"
| stats count() as error_count by bin(5m)

Query 3: Memory usage
fields @timestamp, @memorySize / 1000 / 1000 as mem_mb, @maxMemoryUsed / 1000 / 1000 as used_mb
| stats avg(used_mb) as avg_used, max(used_mb) as max_used

Query 4: Cold starts
filter @type = "REPORT"
| fields @duration, @initDuration
| filter ispresent(@initDuration)
| stats count() as cold_starts, avg(@initDuration) as avg_cold_start_ms
```

### 6.6 Lambda Cost Optimization

**Free Tier Maximization:**
```
Lambda Free Tier (Always Free):
├── 1M requests per month
├── 400,000 GB-seconds compute time per month

Calculation Examples:

Scenario 1: 128 MB function, 200ms execution
├── Compute: 0.2s * 0.125 GB = 0.025 GB-seconds per request
├── Free tier allows: 400,000 / 0.025 = 16M requests
├── But request limit is 1M, so effective limit: 1M requests
└── Verdict: Request limit is constraint, not compute

Scenario 2: 1024 MB function, 1s execution
├── Compute: 1s * 1 GB = 1 GB-second per request
├── Free tier allows: 400,000 / 1 = 400,000 requests
├── But request limit is 1M
└── Verdict: Compute is constraint, only 400K requests free

Your Learning Project Estimate:
├── Average: 512 MB, 500ms execution
├── Compute per request: 0.5s * 0.5 GB = 0.25 GB-seconds
├── Free tier allows: 400,000 / 0.25 = 1.6M requests
├── Your usage: ~10,000 requests/month during development
└── Cost: $0 (well within free tier)

Cost After Free Tier:
├── Requests: $0.20 per 1M requests
├── Compute: $0.0000166667 per GB-second
└── Your 10K requests: ~$0.02/month

Optimization Tips:
1. Reduce memory if not fully utilized
2. Optimize code for faster execution
3. Use layers for shared dependencies
4. Implement caching where possible
5. Batch operations when feasible
6. Monitor and eliminate unnecessary invocations
```

---

## 7. DYNAMODB: QUERY PATTERNS & OPTIMIZATION

### 7.1 Key Concepts

**Partition Key (PK) vs Sort Key (SK):**
```
Partition Key (Required):
├── Determines which partition data is stored in
├── Must be unique for each item (if no sort key)
├── Used for direct lookups: GetItem, PutItem
└── Example: userId, orderId, productId

Sort Key (Optional):
├── Allows multiple items with same partition key
├── Items sorted by sort key value
├── Enables range queries
└── Example: timestamp, status, category

Table Design Pattern 1: Simple (PK only)
Users Table:
PK: userId
├── user-001
├── user-002
└── user-003

Query: Get user by ID
const result = await docClient.get({
  TableName: 'Users',
  Key: { userId: 'user-001' }
});

Table Design Pattern 2: Composite Key (PK + SK)
Orders Table:
PK: userId, SK: orderId
├── user-001, order-2025-001
├── user-001, order-2025-002
├── user-002, order-2025-003
└── user-002, order-2025-004

Query: Get all orders for a user
const result = await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-001'
  }
});

Result: Returns order-2025-001 and order-2025-002
```

**Global Secondary Index (GSI):**
```
Purpose: Query table using different keys

Example Problem:
Users Table: PK = userId
├── You can query by userId
└── But you cannot query by email

Solution: Create GSI on email

GSI: email-index
PK: email
├── Allows query by email
└── Returns userId

Query: Find user by email
const result = await docClient.query({
  TableName: 'Users',
  IndexName: 'email-index',
  KeyConditionExpression: 'email = :email',
  ExpressionAttributeValues: {
    ':email': 'user@example.com'
  }
});

GSI Considerations:
├── Cost: Consumes additional WCU/RCU
├── Eventual consistency: Slight delay (usually milliseconds)
├── Projection: Choose ALL, KEYS_ONLY, or INCLUDE
└── Free Tier: Included in 25 WCU/RCU limit

SAM Template:
UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    AttributeDefinitions:
      - AttributeName: userId
        AttributeType: S
      - AttributeName: email
        AttributeType: S
    KeySchema:
      - AttributeName: userId
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: email-index
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        Projection:
          ProjectionType: ALL
    BillingMode: PAY_PER_REQUEST
```

### 7.2 Query vs Scan

**Query (Efficient):**
```
Characteristics:
├── Uses partition key (required)
├── Optionally uses sort key for range
├── Returns only matching items
├── Fast and cost-effective
└── Use whenever possible

Example: Get all orders for a user
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-123'
  }
});

Cost: 1 RCU per 4 KB read (eventually consistent)
Example: 10 orders, 1 KB each = 10 KB = 3 RCUs
```

**Scan (Inefficient):**
```
Characteristics:
├── Reads entire table
├── Filters after reading (wasteful)
├── Slow and expensive
├── Consumes RCUs for all items scanned
└── Avoid in production

Example: Find all orders with status="Pending" (BAD!)
await docClient.scan({
  TableName: 'Orders',
  FilterExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Problem:
├── Scans all 10,000 orders
├── Filters to 100 pending orders
├── Consumes RCUs for all 10,000 items
└── Returns only 100 items

Cost: If 10,000 items * 1 KB = 10,000 KB = 2,500 RCUs
(Way over free tier 25 RCU limit!)

Solution: Use GSI
Create GSI: status-index (PK: status, SK: createdAt)

Query with GSI:
await docClient.query({
  TableName: 'Orders',
  IndexName: 'status-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Cost: Only reads 100 pending orders = 25 RCUs
Savings: 100x reduction!
```

### 7.3 Batch Operations

**BatchGetItem:**
```
Purpose: Retrieve multiple items in one request

Limitations:
├── Max 100 items per request
├── Max 16 MB total response# SOLO DEVELOPER GUIDE - AWS FREE TIER OPTIMIZED
## Milk & Milk Products Delivery Platform (Comprehensive Learning Project)

---

## TABLE OF CONTENTS
1. [Solo Developer Workflow & Mindset](#solo-developer-workflow-mindset)
2. [AWS Free Tier: Complete Strategy](#aws-free-tier-complete-strategy)
3. [Development Environment Setup](#development-environment-setup)
4. [Hybrid Development: Console + VS Code](#hybrid-development-console-vs-code)
5. [Feature Development Flow (Step-by-Step)](#feature-development-flow)
6. [Lambda Functions: Deep Dive](#lambda-functions-deep-dive)
7. [DynamoDB: Query Patterns & Optimization](#dynamodb-query-patterns-optimization)
8. [API Gateway: Configuration & Testing](#api-gateway-configuration-testing)
9. [Authentication & Authorization](#authentication-authorization)
10. [Error Handling & Edge Cases](#error-handling-edge-cases)
11. [Testing Strategies](#testing-strategies)
12. [Monitoring & Debugging](#monitoring-debugging)
13. [CI/CD Pipeline Setup](#cicd-pipeline-setup)
14. [Cost Optimization Techniques](#cost-optimization-techniques)
15. [Security Best Practices](#security-best-practices)
16. [Performance Optimization](#performance-optimization)
17. [Common Pitfalls & Solutions](#common-pitfalls-solutions)
18. [Learning Path & Milestones](#learning-path-milestones)

---

## 1. SOLO DEVELOPER WORKFLOW & MINDSET

### 1.1 Daily Development Routine

**Realistic Time Allocation (3-4 hours/day):**

```
Morning Session (1.5-2 hours)
├── 00:00-00:10 → Review AWS costs (console billing dashboard)
├── 00:10-00:20 → Check CloudWatch logs for overnight errors
├── 00:20-00:30 → Plan today's feature (write in docs/daily-log.md)
├── 00:30-01:45 → Development work (focus time, no distractions)
└── 01:45-02:00 → Commit code & push to GitHub

Evening Session (1.5-2 hours)
├── 00:00-01:00 → Continue feature development or bug fixes
├── 01:00-01:20 → Testing (local + deployed)
├── 01:20-01:40 → Documentation (update API docs, learning notes)
├── 01:40-01:50 → Deploy to AWS (if ready)
└── 01:50-02:00 → Plan tomorrow's task + update Kanban board
```

**Weekly Rhythm:**
```
Monday: Start new feature (backend)
Tuesday: Complete feature + unit tests
Wednesday: Integration + API Gateway setup
Thursday: Frontend integration
Friday: End-to-end testing + documentation
Saturday: Deployment + monitoring
Sunday: Review week, plan next week, learn new AWS concept
```

### 1.2 Solo Developer's Development Phases

**Phase 1: MVP Foundation (Week 1-3)**
```
Week 1: Infrastructure Setup
├── Day 1-2: AWS account setup, IAM users, billing alerts
├── Day 3-4: First Lambda function (Hello World → createUser)
├── Day 5-6: DynamoDB table creation + manual data entry
└── Day 7: First API endpoint working end-to-end

Week 2: User Management
├── Day 1-2: User registration with validation
├── Day 3-4: User login (Cognito integration)
├── Day 5-6: User profile management
└── Day 7: Testing + bug fixes

Week 3: Product Catalog
├── Day 1-3: Product listing + search
├── Day 4-5: Product details + images (S3)
├── Day 6: Vendor management basics
└── Day 7: Integration testing
```

**Phase 2: Core Business Logic (Week 4-8)**
```
Week 4: Order Creation Flow
├── Shopping cart logic (frontend state)
├── Order validation
├── Inventory checking
└── Order creation Lambda

Week 5: Payment Integration
├── Stripe/Razorpay SDK setup
├── Payment flow (test mode)
├── Payment webhooks
└── Order confirmation

Week 6: Step Functions
├── Order processing workflow
├── Inventory reservation
├── Vendor notifications
└── State machine testing

Week 7: Delivery Management
├── Delivery scheduling
├── Status updates
├── Notifications (SNS/SES)
└── Delivery tracking

Week 8: Integration & Bug Fixes
├── End-to-end testing
├── Edge case handling
├── Performance optimization
└── Documentation
```

**Phase 3: Frontend & Polish (Week 9-12)**
```
Week 9-10: React Frontend
├── Component development
├── State management (Redux/Zustand)
├── API integration
└── Responsive design

Week 11: Advanced Features
├── User dashboard
├── Order history
├── Admin panel basics
└── Analytics

Week 12: Deployment & Launch
├── Production deployment
├── Performance tuning
├── Security audit
└── Final testing
```

### 1.3 Task Management (Solo Approach)

**Simple Kanban Board (GitHub Projects or Trello):**
```
Backlog → Todo → In Progress → Testing → Done
```

**Sample Tasks Breakdown:**
```yaml
Epic: User Management
  Story: User Registration
    Task: Create DynamoDB Users table
    Task: Create createUser Lambda
    Task: Add validation logic
    Task: Set up API Gateway endpoint
    Task: Write unit tests
    Task: Test in console
    Task: Deploy with SAM
    Task: Integration test
    
  Story: User Login
    Task: Configure Cognito User Pool
    Task: Create login API
    Task: JWT token validation
    Task: Test authentication flow
```

### 1.4 Learning Mindset

**Document Everything:**
```
docs/
├── daily-log.md           # What you learned today
├── mistakes.md            # Errors and how you fixed them
├── aws-concepts.md        # AWS services explained in your words
├── design-decisions.md    # Why you chose X over Y
└── helpful-resources.md   # Useful articles, videos, docs
```

**Sample daily-log.md entry:**
```markdown
# Day 15 - October 10, 2025

## What I Built Today
- Completed createOrder Lambda function
- Added inventory validation
- Set up Step Functions for order processing

## What I Learned
- DynamoDB transactions prevent race conditions
- Lambda cold starts can be 1-2 seconds (need to optimize)
- Step Functions are billed per state transition ($0.025/1000)

## Problems I Faced
- Issue: Lambda timeout after 3 seconds
- Solution: Increased timeout to 10s, optimized DynamoDB query
- Learning: Always use indexes for queries, not scans!

## Tomorrow's Plan
- Add payment integration (Stripe test mode)
- Write unit tests for createOrder
- Deploy to dev environment
```

---

## 2. AWS FREE TIER: COMPLETE STRATEGY

### 2.1 Detailed Free Tier Limits

**Always Free (No Time Limit):**
```yaml
Lambda:
  Requests: 1,000,000 per month
  Compute: 400,000 GB-seconds per month
  Example: 
    - 1M invocations with 128MB = ~51 hours compute
    - Roughly 3,200 requests/day with 128MB, 1s execution
  Your Usage: Likely 100-500 requests/day during development
  Status: ✅ Safe

DynamoDB:
  Storage: 25 GB
  WCU: 25 (write capacity units)
  RCU: 25 (read capacity units)
  Example:
    - 25 WCU = 25 writes/sec or 2.1M writes/day
    - 25 RCU = 100 eventual reads/sec or 8.6M reads/day
  Your Usage: Maybe 50-100 operations/day in development
  Status: ✅ Very safe
  
  Important: Use on-demand billing mode
    - No upfront capacity planning
    - Pay only for actual reads/writes
    - First 25 WCU/RCU free, then $1.25/$0.25 per million

S3:
  Storage: 5 GB Standard storage
  GET: 20,000 requests
  PUT: 2,000 requests
  Data Transfer: 100 GB out per month (first 12 months)
  Your Usage: 10-50 MB for product images in development
  Status: ✅ Safe

CloudWatch:
  Logs: 5 GB ingestion, 5 GB storage
  Metrics: 10 custom metrics
  Alarms: 10 alarms
  Dashboard: 3 dashboards
  Your Usage: 100-500 MB logs/month during development
  Status: ✅ Safe

SNS:
  Email: 1,000 notifications/month (12 months free)
  SMS: 100 notifications/month (12 months free)
  HTTP: 100,000 notifications/month (12 months free)
  After 12 months: $0.50 per million emails
  Your Usage: 10-50 emails/month for testing
  Status: ⚠️ Be careful with SMS after year 1

SES (Simple Email Service):
  Emails: 62,000 per month (always free if sent from EC2)
  From Lambda: 3,000 per month free (12 months)
  After: $0.10 per 1,000 emails
  Your Usage: 10-100 emails/month
  Status: ✅ Safe, better than SNS for emails

Cognito:
  MAU: 50,000 monthly active users (always free)
  Your Usage: 1-10 test users
  Status: ✅ Very safe
```

**12 Months Free (After Sign-up):**
```yaml
API Gateway:
  REST API: 1,000,000 requests per month
  After: $3.50 per million requests
  Your Usage: 100-1,000 requests/day = 3,000-30,000/month
  Status: ✅ Safe during free tier
  Strategy: After 1 year, consider Lambda Function URLs (free)

CloudFront:
  Data Transfer: 1 TB out
  Requests: 10,000,000 HTTP/HTTPS
  After: $0.085 per GB + $0.0075 per 10,000 requests
  Your Usage: Don't use during development
  Status: ⚠️ Use only for production launch
```

**Services to AVOID (Cost Traps):**
```yaml
❌ NAT Gateway:
  Cost: $0.045/hour = $32.40/month + data transfer
  Why avoid: Expensive for learning
  Alternative: Lambda functions don't need NAT (direct internet)

❌ Application Load Balancer:
  Cost: $0.0225/hour = $16.20/month + LCU charges
  Why avoid: Unnecessary for serverless
  Alternative: API Gateway (free tier) or Lambda Function URLs

❌ RDS:
  Free tier: 750 hours/month for 12 months (db.t2.micro)
  After: Minimum $15-20/month
  Why avoid: Not needed, use DynamoDB
  Alternative: DynamoDB (always free up to limits)

❌ ECS/EKS:
  ECS: $0.10/hour per running task
  EKS: $0.10/hour for control plane = $73/month
  Why avoid: Overkill for learning serverless
  Alternative: Lambda functions

❌ ElastiCache:
  Free tier: None
  Cost: Minimum $13/month
  Why avoid: Not needed for MVP
  Alternative: In-memory caching in Lambda

❌ Elasticsearch:
  Free tier: None
  Cost: Minimum $23/month
  Why avoid: Expensive
  Alternative: DynamoDB queries + GSIs
```

### 2.2 Cost Monitoring Setup (Critical!)

**Step 1: Set Up Billing Alerts (Day 1 Task)**
```
AWS Console → Billing Dashboard → Billing Preferences
├── ✅ Receive PDF Invoice By Email
├── ✅ Receive Free Tier Usage Alerts (your email)
├── ✅ Receive Billing Alerts
└── Save preferences

AWS Console → CloudWatch → Alarms → Billing
├── Create Alarm: Estimated Charges > $5
├── Create Alarm: Estimated Charges > $10
├── Create Alarm: Estimated Charges > $20
└── SNS Topic: Email notification to yourself
```

**Step 2: Daily Cost Check Routine**
```
Every Morning (5 minutes):
├── AWS Console → Billing Dashboard
├── Check "Month-to-Date Spend"
├── Review "Free Tier Usage" (shows % consumed)
└── If over $5: Investigate "Cost Explorer"

Expected Daily Costs During Development:
├── Days 1-30: $0.00 - $0.50/day (within free tier)
├── Days 31-60: $0.50 - $1.00/day (learning curve)
├── Days 61-90: $0.20 - $0.50/day (optimized)
└── Goal: Stay under $10/month
```

**Step 3: AWS Cost Explorer Tags**
```
Tag all resources for tracking:
├── Environment: dev
├── Project: milk-delivery
├── Owner: your-name
└── Cost-Center: learning

Example in SAM template:
Tags:
  Environment: dev
  Project: milk-delivery
  Owner: solo-developer
```

### 2.3 Free Tier Budget Calculator

**Your Estimated Monthly Usage:**
```yaml
Service            | Free Tier    | Your Usage  | Cost Impact
-------------------|--------------|-------------|-------------
Lambda             | 1M requests  | 10,000      | $0.00
DynamoDB           | 25 WCU/RCU   | 1,000 ops   | $0.00
API Gateway        | 1M requests  | 10,000      | $0.00 (Year 1)
S3                 | 5 GB         | 100 MB      | $0.00
CloudWatch Logs    | 5 GB         | 500 MB      | $0.00
SES                | 62,000 emails| 50 emails   | $0.00
Cognito            | 50k MAU      | 5 users     | $0.00
Step Functions     | 4,000 states | 100 states  | $0.00
-------------------|--------------|-------------|-------------
TOTAL                                           | $0.00-$2.00

Potential Charges:
- API Gateway (after Year 1): ~$0.04/month
- Data Transfer Out: ~$0.50/month (minimal testing)
- CloudWatch (if over 5GB logs): ~$1.00/month

Expected Total: $0-5/month during development
```

---

## 3. DEVELOPMENT ENVIRONMENT SETUP

### 3.1 Machine Requirements

**Minimum Specifications:**
```yaml
Operating System: Windows 10/11, macOS, or Linux
Processor: Intel i3 or equivalent (dual-core)
RAM: 8 GB minimum, 16 GB recommended
Storage: 20 GB free space (for Node.js, Docker, projects)
Internet: Stable connection (AWS API calls)
```

**Recommended Setup:**
```yaml
OS: Windows 11 or macOS
RAM: 16 GB (Docker + VS Code + Browser = memory hungry)
Storage: SSD with 50 GB free (faster builds)
Internet: 10 Mbps+ (for video tutorials, AWS console)
```

### 3.2 Software Installation (Step-by-Step)

**Step 1: Install Node.js**
```
What: JavaScript runtime for Lambda development
Why: Lambda supports Node.js 20.x runtime
Where: https://nodejs.org/en/download

Installation:
├── Download Node.js 20.x LTS installer
├── Run installer (default options are fine)
├── Verify installation:
│   ├── Open terminal/command prompt
│   ├── Type: node --version (should show v20.x.x)
│   └── Type: npm --version (should show v10.x.x)
└── Done!

Post-Install Configuration:
├── Set npm global directory (avoid permission issues)
│   └── npm config set prefix ~/.npm-global (Mac/Linux)
│       or C:\Users\YourName\AppData\Roaming\npm (Windows)
└── Update npm: npm install -g npm@latest
```

**Step 2: Install AWS CLI**
```
What: Command-line tool to interact with AWS services
Why: Deploy resources, check logs, manage services
Where: https://aws.amazon.com/cli/

Windows:
├── Download MSI installer
├── Run installer
└── Verify: aws --version

macOS:
├── Option 1: Homebrew
│   └── brew install awscli
├── Option 2: Official installer
│   └── Download .pkg file
└── Verify: aws --version

Linux:
├── curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
├── unzip awscliv2.zip
├── sudo ./aws/install
└── Verify: aws --version

Configuration:
├── Run: aws configure
├── AWS Access Key ID: [Get from IAM console]
├── AWS Secret Access Key: [Get from IAM console]
├── Default region name: us-east-1
└── Default output format: json
```

**Step 3: Install AWS SAM CLI**
```
What: Framework for building serverless applications
Why: Local testing, easy deployment, IaC with templates
Where: https://aws.amazon.com/serverless/sam/

Windows:
├── Download MSI installer
├── Run installer (requires admin rights)
└── Verify: sam --version

macOS:
├── Homebrew: brew install aws-sam-cli
└── Verify: sam --version

Linux:
├── Download ZIP file
├── Unzip and install
└── Verify: sam --version

SAM Prerequisites:
├── Docker Desktop (for sam local commands)
│   └── Download from: https://www.docker.com/products/docker-desktop
└── Python 3.8+ (usually pre-installed on Mac/Linux)
```

**Step 4: Install Visual Studio Code**
```
What: Code editor with excellent AWS support
Why: Best IDE for serverless development
Where: https://code.visualstudio.com/

Installation:
├── Download installer for your OS
├── Run installer
├── Launch VS Code
└── Done!

Essential Extensions (Install via Extensions panel):
├── AWS Toolkit (amazonwebservices.aws-toolkit-vscode)
│   └── Integrates AWS services into VS Code
├── ESLint (dbaeumer.vscode-eslint)
│   └── JavaScript/TypeScript linting
├── Prettier (esbenp.prettier-vscode)
│   └── Code formatting
├── Thunder Client (rangav.vscode-thunder-client)
│   └── API testing (like Postman, but in VS Code)
├── GitLens (eamodio.gitlens)
│   └── Git history and blame annotations
├── Docker (ms-azuretools.vscode-docker)
│   └── Manage Docker containers
└── REST Client (humao.rest-client)
    └── Test HTTP requests from .http files
```

**Step 5: Install Git**
```
What: Version control system
Why: Code versioning, GitHub integration
Where: https://git-scm.com/downloads

Installation:
├── Download installer
├── Run with default options
└── Verify: git --version

Configuration:
├── git config --global user.name "Your Name"
├── git config --global user.email "your.email@example.com"
└── git config --global init.defaultBranch main
```

**Step 6: Optional but Recommended Tools**
```
Docker Desktop:
├── Required for: sam local invoke, sam local start-api
├── Download: https://www.docker.com/products/docker-desktop
└── Purpose: Run Lambda functions locally in containers

Postman (Alternative to Thunder Client):
├── Download: https://www.postman.com/downloads/
└── Purpose: API testing with collections

DynamoDB Local (Optional):
├── Download: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
└── Purpose: Test DynamoDB operations without AWS connection
```

### 3.3 AWS Account Setup

**Step 1: Create AWS Account**
```
Go to: https://aws.amazon.com/free

Sign Up Process:
├── 1. Email and password
├── 2. Account type: Personal
├── 3. Contact information
├── 4. Payment information (required, but won't charge if stay in free tier)
├── 5. Identity verification (phone call)
└── 6. Select Support Plan: Basic (Free)

⚠️ Important:
- Use a credit/debit card with at least $1 for verification
- Set up billing alerts immediately
- Enable MFA (Multi-Factor Authentication) for root account
```

**Step 2: Secure Root Account**
```
After Sign-up:
├── 1. Go to IAM → Dashboard
├── 2. Enable MFA for root account
│   ├── Use Google Authenticator, Authy, or hardware token
│   └── NEVER share MFA codes
├── 3. Create IAM user for daily use (don't use root)
└── 4. Delete root access keys if created
```

**Step 3: Create IAM User (For Development)**
```
IAM → Users → Add User

User Details:
├── Username: milk-delivery-dev
├── Access type: ✅ Programmatic access (for AWS CLI)
│              ✅ AWS Management Console access (for console)
└── Console password: Auto-generated or custom

Permissions:
├── Attach existing policies directly:
│   ├── ✅ AdministratorAccess (for learning only)
│   │   └── ⚠️ In production, use least-privilege policies
│   └── Or create custom policy (see below)
└── Tags:
    ├── Environment: dev
    └── Purpose: learning

Download Credentials:
├── Save Access Key ID
├── Save Secret Access Key
└── Store securely (password manager recommended)

Configure AWS CLI:
├── aws configure --profile milk-delivery-dev
├── Enter Access Key ID
├── Enter Secret Access Key
├── Region: us-east-1
└── Output: json
```

**Custom IAM Policy (Least Privilege for Learning):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "dynamodb:*",
        "apigateway:*",
        "s3:*",
        "cloudformation:*",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "logs:*",
        "events:*",
        "sns:*",
        "ses:*",
        "cognito-idp:*",
        "states:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3.4 VS Code Configuration

**Workspace Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true,
  "files.autoSave": "onFocusChange",
  "typescript.preferences.importModuleSpecifier": "relative",
  "aws.samcli.location": "/usr/local/bin/sam",
  "aws.profile": "milk-delivery-dev",
  "aws.region": "us-east-1",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

**Launch Configuration (.vscode/launch.json):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Lambda (SAM)",
      "type": "node",
      "request": "attach",
      "address": "localhost",
      "port": 5858,
      "localRoot": "${workspaceFolder}/backend/src",
      "remoteRoot": "/var/task",
      "protocol": "inspector",
      "stopOnEntry": false
    }
  ]
}
```

---

## 4. HYBRID DEVELOPMENT: CONSOLE + VS CODE

### 4.1 Philosophy: When to Use What

**AWS Console is BEST for:**
```
✅ Visual Learning & Exploration
   ├── Understanding service dashboards
   ├── Exploring service features and options
   ├── Reading integrated documentation
   └── Seeing visual representations (Step Functions graphs)

✅ One-Time Setup Tasks
   ├── Creating Cognito User Pool (complex configuration)
   ├── Setting up billing alerts
   ├── Creating IAM roles and policies (first time)
   ├── Configuring CloudWatch dashboards
   └── Setting up SNS/SES email verification

✅ Quick Testing & Debugging
   ├── Testing Lambda with sample events
   ├── Viewing DynamoDB table data
   ├── Checking CloudWatch logs in real-time
   ├── Testing API Gateway endpoints manually
   └── Viewing Step Functions execution history

✅ Monitoring & Operations
   ├── CloudWatch Logs Insights queries
   ├── Viewing metrics and graphs
   ├── Checking service quotas and limits
   ├── Cost analysis and billing reports
   └── Resource utilization dashboards
```

**VS Code is BEST for:**
```
✅ All Code Development
   ├── Writing Lambda functions
   ├── TypeScript/JavaScript development
   ├── Creating unit tests
   ├── Shared utilities and libraries
   └── Frontend React components

✅ Infrastructure as Code (IaC)
   ├── SAM templates (template.yaml)
   ├── CloudFormation templates
   ├── Environment configuration files
   └── Deployment scripts

✅ Version Control
   ├── Git commits and branching
   ├── Code reviews (self-review before commit)
   ├── Merge conflict resolution
   └── GitHub integration

✅ Local Development & Testing
   ├── sam local invoke (test Lambda locally)
   ├── sam local start-api (local API Gateway)
   ├── Unit tests with Jest
   ├── Integration tests
   └── Debugging with breakpoints

✅ Batch Operations
   ├── Creating multiple Lambda functions
   ├── Updating multiple files at once
   ├── Search and replace across project
   └── Refactoring code
```

### 4.2 Hybrid Workflow Patterns

**Pattern 1: Learning a New Service**
```
Example: Setting up DynamoDB for the first time

Step 1: AWS Console (30 minutes)
├── Navigate to DynamoDB service
├── Click "Create table"
├── Experiment with different settings:
│   ├── Partition key vs. Sort key
│   ├── Provisioned vs. On-demand
│   ├── Global Secondary Indexes (GSI)
│   └── Stream settings
├── Create a test table manually
├── Add sample items via console
├── Try different queries in console
└── Learn query vs. scan difference

Step 2: VS Code (30 minutes)
├── Create SAM template with DynamoDB resource
├── Define table schema in YAML
├── Add GSI definitions
├── Write Lambda function to interact with table
└── Test locally with DynamoDB Local or deployed table

Step 3: AWS Console (15 minutes)
├── Deploy via SAM from VS Code terminal
├── Verify table creation in console
├── Check table metrics
└── Validate data structure

Result: You understand DynamoDB AND have IaC code
```

**Pattern 2: Developing a New Lambda Function**
```
Example: Creating "createOrder" Lambda

Step 1: Console Prototype (15 minutes)
├── AWS Console → Lambda → Create function
├── Name: createOrderPrototype
├── Runtime: Node.js 20.x
├── Write basic handler code inline
├── Create test event with sample JSON:
│   {
│     "userId": "user-123",
│     "items": [{"productId": "prod-1", "quantity": 2}]
│   }
├── Test and see output
├── Fix any immediate errors
└── Verify basic logic works

Step 2: VS Code Development (2 hours)
├── Create file: backend/src/lambdas/order/createOrder.ts
├── Copy working logic from console
├── Add TypeScript types and interfaces
├── Implement proper error handling
├── Add input validation
├── Add logging
├── Add to SAM template
├── Write unit tests
└── Test locally: sam local invoke

Step 3: Console Debugging (20 minutes)
├── Deploy from VS Code: sam deploy
├── Go to AWS Console → Lambda → createOrder
├── Test with real event
├── Check CloudWatch logs
├── Identify any AWS-specific issues
└── Note execution time and memory usage

Step 4: VS Code Refinement (30 minutes)
├── Fix issues found in console testing
├── Optimize memory settings in SAM template
├── Adjust timeout if needed
├── Update documentation
└── Redeploy: sam deploy

Result: Production-ready Lambda with IaC
```

**Pattern 3: API Gateway Setup**
```
Example: Creating REST API with multiple endpoints

Step 1: Console Exploration (30 minutes)
├── AWS Console → API Gateway
├── Create REST API (not HTTP API)
├── Manually create one resource: /users
├── Add POST method
├── Link to Lambda function (console UI)
├── Configure CORS manually
├── Deploy to "dev" stage
├── Test with API Gateway test feature
└── Understand request/response transformation

Step 2: VS Code IaC (1 hour)
├── Add API Gateway to SAM template
├── Define all resources and methods in YAML
├── Configure Cognito authorizer
├── Set up request validators
├── Configure CORS in template
├── Add multiple endpoints
└── Deploy entire API: sam deploy

Step 3: Console Validation (15 minutes)
├── Check deployed API in console
├── Verify all endpoints exist
├── Test each endpoint
├── Check authorization works
└── Review API Gateway logs

Result: Complete API defined in code, easy to replicate
```

### 4.3 AWS Toolkit Extension (The Bridge)

**Installation & Setup:**
```
Step 1: Install Extension
├── Open VS Code
├── Go to Extensions (Ctrl+Shift+X)
├── Search: "AWS Toolkit"
├── Install "AWS Toolkit" by Amazon Web Services
└── Restart VS Code

Step 2: Connect to AWS
├── Click AWS icon in left sidebar
├── Click "Connect to AWS"
├── Select profile: milk-delivery-dev
└── Region: us-east-1

Step 3: Verify Connection
├── Expand "Lambda" in sidebar
├── You should see all deployed functions
├── Expand "DynamoDB"
├── You should see all tables
└── Success!
```

**Key Features You'll Use Daily:**

**1. Lambda Functions**
```
What you can do from VS Code:
├── View all deployed Lambda functions
├── Invoke function remotely (without console)
│   ├── Right-click function
│   ├── Select "Invoke on AWS"
│   ├── Choose test event
│   └── See results in VS Code
├── Download function code
│   ├── Right-click function
│   ├── Select "Download Lambda"
│   └── Code appears in VS Code
└── View CloudWatch logs
    ├── Right-click function
    ├── Select "View CloudWatch Logs"
    └── Logs stream in VS Code terminal

Example Workflow:
├── Deploy function from VS Code terminal: sam deploy
├── Test directly from VS Code using AWS Toolkit
├── View logs without switching to browser
└── Make changes and redeploy, all in one place
```

**2. DynamoDB Tables**
```
What you can do from VS Code:
├── Browse table data
│   ├── Expand DynamoDB in AWS Toolkit
│   ├── Right-click table
│   ├── Select "View Table"
│   └── See items in VS Code panel
├── Run queries
│   ├── Click "Query" button
│   ├── Enter partition key value
│   ├── Execute
│   └── Results appear in VS Code
├── Download items as JSON
│   ├── Right-click items
│   ├── Select "Download items"
│   └── Save to file
└── Insert test data
    ├── Right-click table
    ├── Select "Insert Item"
    └── Paste JSON

Example Workflow:
├── Check if user exists in database
├── Query directly from VS Code
├── No need to open AWS Console
└── Copy user data for test event
```

**3. CloudWatch Logs**
```
What you can do from VS Code:
├── View log groups
├── Stream logs in real-time
│   ├── Right-click Lambda function
│   ├── Select "View CloudWatch Logs"
│   ├── Logs appear in VS Code terminal
│   └── Auto-refreshes with new logs
├── Search logs
│   ├── Use Ctrl+F in log panel
│   └── Filter by text
└── Download logs for analysis

Example Workflow:
├── Deploy Lambda function
├── Invoke from VS Code
├── Instantly see logs in VS Code
├── Debug without opening console
└── Faster iteration cycle
```

**4. S3 Buckets**
```
What you can do from VS Code:
├── Browse bucket contents
├── Upload files
│   ├── Right-click bucket
│   ├── Select "Upload File"
│   └── Choose file from system
├── Download files
│   ├── Right-click file
│   ├── Select "Download"
│   └── Save to local folder
└── Delete files

Example Workflow:
├── Upload product images
├── Get S3 URL for DynamoDB
├── All without leaving VS Code
```

**5. Step Functions**
```
What you can do from VS Code:
├── View state machines
├── Start execution
│   ├── Right-click state machine
│   ├── Select "Start Execution"
│   ├── Provide input JSON
│   └── Execution starts
├── View execution history
└── Download execution results

Example Workflow:
├── Test order processing workflow
├── Start execution from VS Code
├── Check status in toolkit
├── View results inline
```

### 4.4 Detailed Workflow Examples

**Example 1: Building User Registration (Complete Flow)**

**Day 1 Morning: Console Exploration (1 hour)**
```
Task: Understand what you need to build

1. Research Phase (AWS Console)
   ├── Navigate to Cognito
   ├── Read "What is Amazon Cognito?"
   ├── Create a test User Pool
   │   ├── Pool name: milk-delivery-users-test
   │   ├── Standard attributes: email, name, phone
   │   ├── Password policy: default
   │   ├── MFA: Optional (for learning)
   │   └── Create pool
   ├── Create test user manually
   │   ├── Username: testuser@example.com
   │   ├── Temporary password: Test@1234
   │   └── Verify user can login
   └── Test user login in Cognito UI
   
2. DynamoDB Exploration (AWS Console)
   ├── Navigate to DynamoDB
   ├── Create table: Users
   │   ├── Partition key: userId (String)
   │   ├── Billing mode: On-demand
   │   └── Create table
   ├── Add sample user item manually:
   │   {
   │     "userId": "user-001",
   │     "email": "test@example.com",
   │     "name": "Test User",
   │     "phone": "+1234567890",
   │     "role": "Customer",
   │     "createdAt": "2025-10-09T10:00:00Z"
   │   }
   └── Verify item appears in table

3. Lambda Exploration (AWS Console)
   ├── Navigate to Lambda
   ├── Create function: createUserTest
   ├── Write minimal code inline:
   │   exports.handler = async (event) => {
   │     console.log('Received event:', event);
   │     return {
   │       statusCode: 200,
   │       body: JSON.stringify({ message: 'User created' })
   │     };
   │   };
   ├── Test with sample event:
   │   {
   │     "body": "{\"email\":\"new@example.com\",\"name\":\"New User\"}"
   │   }
   └── Verify it returns 200 OK

Learning Outcome:
├── Understand Cognito concepts
├── See DynamoDB table structure
├── Know Lambda basic structure
└── Ready to code properly in VS Code
```

**Day 1 Afternoon: VS Code Development (2-3 hours)**
```
Task: Build production-ready createUser Lambda

1. Project Setup (VS Code Terminal)
   $ cd ~/projects
   $ mkdir milk-delivery-platform
   $ cd milk-delivery-platform
   $ sam init
   ├── Choose: 1 - AWS Quick Start Templates
   ├── Choose: 1 - Hello World Example
   ├── Runtime: nodejs20.x
   ├── Name: milk-delivery
   └── Project created!

2. Project Structure Organization
   milk-delivery-platform/
   ├── backend/
   │   ├── src/
   │   │   ├── lambdas/
   │   │   │   └── user/
   │   │   │       ├── createUser.ts
   │   │   │       ├── getUser.ts
   │   │   │       └── types.ts
   │   │   └── shared/
   │   │       ├── db.ts
   │   │       ├── validation.ts
   │   │       └── logger.ts
   │   ├── template.yaml
   │   ├── package.json
   │   └── tsconfig.json
   └── docs/
       └── api/
           └── user-api.md

3. Install Dependencies
   $ cd backend
   $ npm init -y
   $ npm install --save @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   $ npm install --save-dev @types/node @types/aws-lambda typescript

4. Create TypeScript Configuration (tsconfig.json)
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "lib": ["ES2020"],
       "outDir": "./dist",
       "rootDir": "./src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }

5. Create Lambda Function (Skeleton)
   File: src/lambdas/user/createUser.ts
   
   // Define interfaces
   interface CreateUserRequest {
     email: string;
     name: string;
     phone: string;
     password: string;
   }
   
   interface CreateUserResponse {
     userId: string;
     email: string;
     message: string;
   }
   
   // TODO: Implement handler
   // TODO: Add validation
   // TODO: Add DynamoDB operations
   // TODO: Add error handling

6. Create SAM Template (template.yaml)
   AWSTemplateFormatVersion: '2010-09-09'
   Transform: AWS::Serverless-2016-10-31
   
   Globals:
     Function:
       Timeout: 10
       Runtime: nodejs20.x
       Environment:
         Variables:
           USERS_TABLE: !Ref UsersTable
   
   Resources:
     CreateUserFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/user/createUser.handler
         Policies:
           - DynamoDBCrudPolicy:
               TableName: !Ref UsersTable
     
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
           - IndexName: email-index
             KeySchema:
               - AttributeName: email
                 KeyType: HASH
             Projection:
               ProjectionType: ALL

7. Build & Test Locally
   $ npm run build
   $ sam build
   $ sam local invoke CreateUserFunction --event events/create-user.json
   
   events/create-user.json:
   {
     "body": "{\"email\":\"test@example.com\",\"name\":\"Test User\",\"phone\":\"+1234567890\",\"password\":\"Test@123\"}"
   }

Learning Outcome:
├── Project structure established
├── SAM template basics understood
├── Local testing working
└── Ready for implementation
```

**Day 2: Implementation & Deployment**
```
Task: Complete Lambda implementation and deploy

1. Implement Full Lambda Function (VS Code)
   File: src/lambdas/user/createUser.ts
   
   [Full TypeScript implementation with:]
   ├── Input validation (email format, password strength)
   ├── Check if email already exists (GSI query)
   ├── Generate userId (UUID)
   ├── Hash password (if not using Cognito)
   ├── Save to DynamoDB
   ├── Error handling (try-catch with proper status codes)
   └── Logging (console.log with context)

2. Create Shared Utilities (VS Code)
   File: src/shared/validation.ts
   ├── validateEmail(email: string): boolean
   ├── validatePhone(phone: string): boolean
   └── validatePassword(password: string): string | null
   
   File: src/shared/db.ts
   ├── DynamoDB client initialization
   ├── Helper functions for common operations
   └── Error handling wrappers

3. Write Unit Tests (VS Code)
   File: tests/unit/createUser.test.ts
   
   Test cases:
   ├── Should create user with valid input
   ├── Should reject invalid email
   ├── Should reject weak password
   ├── Should reject duplicate email
   └── Should handle DynamoDB errors
   
   $ npm test

4. Deploy to AWS (VS Code Terminal)
   $ sam build
   $ sam deploy --guided
   
   Prompts:
   ├── Stack name: milk-delivery-dev
   ├── Region: us-east-1
   ├── Confirm changes: Y
   ├── Allow SAM CLI IAM role creation: Y
   ├── Save arguments to config file: Y
   └── Deployment starts...
   
   Wait for: Successfully created/updated stack

5. Verify Deployment (AWS Console)
   ├── Lambda → Functions → createUserFunction
   │   ├── Check function exists
   │   ├── Check environment variables
   │   └── Check permissions
   ├── DynamoDB → Tables → milk-delivery-users
   │   ├── Check table exists
   │   ├── Check GSI: email-index
   │   └── Check capacity mode: On-demand
   └── CloudFormation → Stacks → milk-delivery-dev
       ├── Check stack status: CREATE_COMPLETE
       └── Review all resources created

6. Test Deployed Function (Console + VS Code)
   
   Option A: AWS Console
   ├── Lambda → createUserFunction → Test tab
   ├── Create test event: create-user-test
   ├── Execute test
   ├── Check response: 201 Created
   └── CloudWatch logs: Check execution logs
   
   Option B: VS Code (AWS Toolkit)
   ├── AWS Toolkit → Lambda → createUserFunction
   ├── Right-click → Invoke on AWS
   ├── Select test event
   ├── View results in VS Code
   └── Check logs in VS Code

7. Verify Data in DynamoDB (Console)
   ├── DynamoDB → Tables → milk-delivery-users
   ├── Items tab
   ├── Should see new user item
   └── Verify all fields are correct

Learning Outcome:
├── Full Lambda function deployed
├── Infrastructure as Code working
├── Understand deployment process
└── Can iterate quickly
```

---

## 5. FEATURE DEVELOPMENT FLOW (STEP-BY-STEP)

### 5.1 Complete Feature: Order Creation System

**Overview:**
```
Feature: Create Order
Complexity: High (multiple services involved)
Duration: 4-5 days
Services Used:
├── Lambda (createOrder, validateInventory)
├── DynamoDB (Orders, Products, Inventory tables)
├── Step Functions (Order processing workflow)
├── API Gateway (POST /orders endpoint)
├── SNS (Order notifications)
└── EventBridge (Order events)

Learning Goals:
├── Multi-table DynamoDB operations
├── Error handling and rollback strategies
├── Async workflows with Step Functions
├── Event-driven architecture
└── Transaction management
```

**Day 1: Planning & Design**

```
Morning Session (2 hours)

1. Requirement Analysis (docs/features/create-order.md)
   
   User Story:
   "As a customer, I want to create an order with multiple products
   from different vendors, so that I can get my dairy products delivered."
   
   Acceptance Criteria:
   ├── User must be authenticated
   ├── User must have complete profile (delivery address)
   ├── Order must have at least 1 item
   ├── All products must be in stock
   ├── Order total must be ≥ minimum order value (₹100)
   ├── Delivery date must be: today+1 to today+7
   ├── System must reserve inventory immediately
   ├── User receives order confirmation
   └── Vendors receive order notifications

2. Data Model Design
   
   Orders Table Schema:
   {
     "orderId": "uuid",
     "userId": "uuid",
     "items": [
       {
         "productId": "uuid",
         "vendorId": "uuid",
         "productName": "string",
         "quantity": number,
         "unitPrice": number,
         "totalPrice": number
       }
     ],
     "subtotal": number,
     "tax": number,
     "deliveryCharge": number,
     "discount": number,
     "totalAmount": number,
     "status": "Pending|Confirmed|Processing|Delivered|Cancelled",
     "deliveryDate": "ISO date",
     "deliveryAddress": {
       "line1": "string",
       "city": "string",
       "zipCode": "string"
     },
     "createdAt": "ISO timestamp",
     "updatedAt": "ISO timestamp"
   }

3. API Contract Design
   
   Request:
   POST /orders
   Headers:
     Authorization: Bearer <JWT_TOKEN>
     Content-Type: application/json
   
   Body:
   {
     "items": [
       {
         "productId": "prod-123",
         "vendorId": "vendor-456",
         "quantity": 2
       },
       {
         "productId": "prod-789",
         "vendorId": "vendor-456",
         "quantity": 1
       }
     ],
     "deliveryDate": "2025-10-15",
     "addressId": "addr-001"
   }
   
   Success Response (201 Created):
   {
     "orderId": "order-abc123",
     "userId": "user-xyz",
     "items": [...],
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 30,
     "totalAmount": 502.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-15T08:00:00Z",
     "message": "Order created successfully"
   }
   
   Error Responses:
   400 Bad Request:
   {
     "error": "ValidationError",
     "message": "Delivery date must be between tomorrow and 7 days from now",
     "field": "deliveryDate"
   }
   
   400 Bad Request:
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 1L' has only 5 units available",
     "availableQuantity": 5,
     "requestedQuantity": 10
   }
   
   400 Bad Request:
   {
     "error": "MinimumOrderValue",
     "message": "Order total must be at least ₹100",
     "currentTotal": 75,
     "minimumRequired": 100
   }
   
   401 Unauthorized:
   {
     "error": "Unauthorized",
     "message": "Invalid or expired token"
   }
   
   404 Not Found:
   {
     "error": "UserNotFound",
     "message": "User profile not found"
   }
   
   409 Conflict:
   {
     "error": "ProfileIncomplete",
     "message": "Please complete your profile before placing an order",
     "missingFields": ["deliveryAddress", "phone"]
   }

4. Workflow Design (Step Functions State Machine)
   
   Order Processing Workflow:
   Start
   ├── ValidateInput (Lambda)
   │   ├── Success → ValidateUser
   │   └── Fail → Return 400 Error
   ├── ValidateUser (Lambda)
   │   ├── Success → CheckInventory
   │   └── Fail → Return 404/409 Error
   ├── CheckInventory (Lambda)
   │   ├── AllAvailable → ReserveInventory
   │   └── Insufficient → Return 400 Error
   ├── ReserveInventory (Lambda)
   │   ├── Success → CalculatePricing
   │   └── Fail → Rollback
   ├── CalculatePricing (Lambda)
   │   ├── Success → CreateOrderRecord
   │   └── Fail → ReleaseInventory → Error
   ├── CreateOrderRecord (Lambda)
   │   ├── Success → NotifyUser
   │   └── Fail → ReleaseInventory → Error
   ├── NotifyUser (SNS)
   │   └── Send confirmation email
   ├── NotifyVendors (SNS)
   │   └── Send order details to each vendor
   └── End (Success)

5. Error Handling Strategy
   
   Scenario 1: Inventory Check Fails
   ├── Don't create order
   ├── Return 400 with specific product details
   └── No rollback needed (no state changed)
   
   Scenario 2: Inventory Reserved, but DynamoDB Fails
   ├── Critical: Inventory locked but order not created
   ├── Solution: Use DynamoDB transaction
   │   └── Atomic operation: Reserve inventory + Create order
   └── If transaction fails, nothing is committed
   
   Scenario 3: Order Created, but Notification Fails
   ├── Order exists, but user not notified
   ├── Solution: Make notification async (Step Functions)
   ├── Retry notification 3 times
   └── Use DLQ (Dead Letter Queue) for failures
   
   Scenario 4: Partial Vendor Availability
   ├── Some items available, some not
   ├── Option A: Reject entire order
   ├── Option B: Partial fulfillment (advanced)
   └── For MVP: Choose Option A (simpler)

Afternoon Session (1.5 hours)

6. Create Project Structure (VS Code)
   backend/
   ├── src/
   │   ├── lambdas/
   │   │   └── order/
   │   │       ├── createOrder.ts
   │   │       ├── validateInventory.ts
   │   │       ├── reserveInventory.ts
   │   │       ├── calculatePricing.ts
   │   │       └── types.ts
   │   ├── stepFunctions/
   │   │   └── orderProcessing.asl.json
   │   └── shared/
   │       ├── constants.ts
   │       └── pricing.ts
   └── tests/
       └── order/
           ├── createOrder.test.ts
           └── validateInventory.test.ts

7. Define Types (VS Code)
   File: src/lambdas/order/types.ts
   
   export interface OrderItem {
     productId: string;
     vendorId: string;
     quantity: number;
     unitPrice?: number;  // Calculated
     totalPrice?: number; // Calculated
   }
   
   export interface CreateOrderRequest {
     items: OrderItem[];
     deliveryDate: string;
     addressId: string;
   }
   
   export interface CreateOrderResponse {
     orderId: string;
     userId: string;
     items: OrderItem[];
     subtotal: number;
     tax: number;
     deliveryCharge: number;
     totalAmount: number;
     status: OrderStatus;
     estimatedDelivery: string;
     message: string;
   }
   
   export type OrderStatus = 
     | 'Pending'
     | 'Confirmed'
     | 'Processing'
     | 'OutForDelivery'
     | 'Delivered'
     | 'Cancelled'
     | 'Failed';
   
   export interface ValidationError {
     field: string;
     message: string;
     code: string;
   }

8. Create Test Events (VS Code)
   File: events/create-order-valid.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2},{\"productId\":\"prod-yogurt-200g\",\"vendorId\":\"vendor-001\",\"quantity\":3}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}",
     "headers": {
       "Authorization": "Bearer eyJhbGc...",
       "Content-Type": "application/json"
     },
     "requestContext": {
       "authorizer": {
         "claims": {
           "sub": "user-123"
         }
       }
     }
   }
   
   File: events/create-order-invalid-date.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2}],\"deliveryDate\":\"2025-10-01\",\"addressId\":\"addr-home\"}"
   }
   
   File: events/create-order-insufficient-stock.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":1000}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}"
   }

Learning Outcome:
├── Complete understanding of requirements
├── API contract defined
├── Error scenarios identified
├── Project structure ready
└── Ready to code
```

**Day 2: Core Implementation**

```
Morning Session (2.5 hours)

1. Implement Validation Logic
   File: src/lambdas/order/createOrder.ts
   
   Function: validateInput()
   ├── Check items array not empty
   ├── Check each item has required fields
   ├── Check quantities are positive integers
   ├── Check deliveryDate format (ISO 8601)
   ├── Check deliveryDate is in valid range
   └── Return ValidationError[] if any issues
   
   Function: validateUser()
   ├── Extract userId from JWT (event.requestContext.authorizer.claims.sub)
   ├── Query Users table
   ├── Check user exists
   ├── Check profile is complete
   │   ├── Has delivery address matching addressId
   │   ├── Has phone number
   │   └── Has email
   └── Return user object or error
   
   Function: validateDeliveryDate()
   ├── Parse date string
   ├── Check format is valid
   ├── Check date is not in past
   ├── Check date is not today (need 1 day preparation)
   ├── Check date is within 7 days
   └── Return boolean + error message

2. Implement Inventory Validation
   File: src/lambdas/order/validateInventory.ts
   
   Function: checkInventory()
   Input:
   {
     "items": [
       {"productId": "prod-1", "vendorId": "vendor-1", "quantity": 2}
     ]
   }
   
   Process:
   ├── Group items by vendorId
   ├── For each vendor:
   │   ├── BatchGetItem from Inventory table
   │   │   └── Keys: [{vendorId, productId}, ...]
   │   ├── For each product:
   │   │   ├── Get available = stock - reserved
   │   │   ├── Check available >= requested quantity
   │   │   └── If not: add to unavailableItems[]
   │   └── Continue
   └── Return {valid: boolean, unavailableItems: []}
   
   Output (Success):
   {
     "valid": true,
     "unavailableItems": []
   }
   
   Output (Failure):
   {
     "valid": false,
     "unavailableItems": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "requestedQty": 10,
         "availableQty": 5
       }
     ]
   }

3. Implement Pricing Calculation
   File: src/shared/pricing.ts
   
   Function: calculateOrderTotal()
   Input:
   {
     "items": [
       {
         "productId": "prod-1",
         "quantity": 2,
         "unitPrice": 50
       }
     ],
     "deliveryAddress": {
       "city": "Vadodara",
       "zipCode": "390001"
     }
   }
   
   Calculation Logic:
   ├── subtotal = sum(item.unitPrice * item.quantity)
   ├── tax = subtotal * TAX_RATE (5% GST)
   ├── deliveryCharge = calculateDeliveryCharge()
   │   ├── If subtotal >= 500: ₹0 (free delivery)
   │   ├── Else if subtotal >= 300: ₹20
   │   ├── Else: ₹40
   │   └── Add ₹10 per additional vendor (multi-vendor orders)
   ├── discount = calculateDiscount()
   │   ├── If first order: 10% off (max ₹50)
   │   ├── If loyalty points: redeem at 1 point = ₹1
   │   └── else: 0
   └── totalAmount = subtotal + tax + deliveryCharge - discount
   
   Output:
   {
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 20,
     "discount": 0,
     "totalAmount": 492.5,
     "breakdown": {
       "itemsTotal": 450,
       "taxBreakdown": {
         "cgst": 11.25,
         "sgst": 11.25
       },
       "deliveryDetails": {
         "baseCharge": 20,
         "multiVendorSurcharge": 0
       }
     }
   }

Afternoon Session (1.5 hours)

4. Implement Main Handler
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent)
   
   Flow:
   Step 1: Parse input
   ├── const body = JSON.parse(event.body || '{}');
   ├── const userId = event.requestContext.authorizer.claims.sub;
   └── Log input for debugging
   
   Step 2: Validate input
   ├── const validationErrors = validateInput(body);
   ├── if (validationErrors.length > 0):
   │   └── return 400 with errors
   └── Continue
   
   Step 3: Validate user
   ├── const user = await validateUser(userId);
   ├── if (!user):
   │   └── return 404 User Not Found
   ├── if (!user.isProfileComplete):
   │   └── return 409 Profile Incomplete
   └── Continue
   
   Step 4: Get delivery address
   ├── const address = user.addresses.find(a => a.addressId === body.addressId);
   ├── if (!address):
   │   └── return 404 Address Not Found
   └── Continue
   
   Step 5: Fetch product details
   ├── const productIds = body.items.map(i => i.productId);
   ├── const products = await batchGetProducts(productIds);
   ├── Merge product prices into items
   └── Calculate item totals
   
   Step 6: Check inventory
   ├── const inventoryCheck = await checkInventory(body.items);
   ├── if (!inventoryCheck.valid):
   │   └── return 400 Insufficient Stock with details
   └── Continue
   
   Step 7: Calculate pricing
   ├── const pricing = calculateOrderTotal(items, address, user);
   ├── if (pricing.totalAmount < MINIMUM_ORDER_VALUE):
   │   └── return 400 Minimum Order Value Not Met
   └── Continue
   
   Step 8: Create order record
   ├── const orderId = generateOrderId(); // uuid()
   ├── const order = {
   │     orderId,
   │     userId,
   │     items,
   │     ...pricing,
   │     status: 'Pending',
   │     deliveryDate: body.deliveryDate,
   │     deliveryAddress: address,
   │     createdAt: new Date().toISOString()
   │   };
   ├── await dynamodb.putItem(ORDERS_TABLE, order);
   └── Continue
   
   Step 9: Start Step Functions workflow
   ├── const executionArn = await stepFunctions.startExecution({
   │     stateMachineArn: ORDER_PROCESSING_STATE_MACHINE,
   │     input: JSON.stringify({ orderId, items })
   │   });
   └── Log execution ARN
   
   Step 10: Return response
   └── return {
         statusCode: 201,
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*'
         },
         body: JSON.stringify({
           orderId,
           userId,
           items,
           ...pricing,
           status: 'Pending',
           estimatedDelivery: calculateEstimatedDelivery(body.deliveryDate),
           message: 'Order created successfully. You will receive confirmation shortly.'
         })
       };

5. Error Handling Patterns
   
   Pattern 1: Validation Errors (400)
   try {
     const errors = validateInput(body);
     if (errors.length > 0) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'ValidationError',
           message: 'Invalid input data',
           errors: errors
         })
       };
     }
   } catch (error) {
     // Continue to Pattern 2
   }
   
   Pattern 2: Resource Not Found (404)
   const user = await getUser(userId);
   if (!user) {
     return {
       statusCode: 404,
       body: JSON.stringify({
         error: 'UserNotFound',
         message: `User with ID ${userId} not found`
       })
     };
   }
   
   Pattern 3: Business Logic Errors (400/409)
   if (pricing.totalAmount < MINIMUM_ORDER_VALUE) {
     return {
       statusCode: 400,
       body: JSON.stringify({
         error: 'MinimumOrderValue',
         message: `Order total must be at least ₹${MINIMUM_ORDER_VALUE}`,
         currentTotal: pricing.totalAmount,
         minimumRequired: MINIMUM_ORDER_VALUE
       })
     };
   }
   
   Pattern 4: Service Errors (500)
   try {
     await dynamodb.putItem(ORDERS_TABLE, order);
   } catch (error) {
     console.error('DynamoDB error:', error);
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: 'InternalServerError',
         message: 'Failed to create order. Please try again.',
         requestId: context.requestId
       })
     };
   }
   
   Pattern 5: Timeout Handling
   // Set timeout slightly less than Lambda timeout
   const timeoutMs = 9000; // Lambda timeout is 10s
   const timeoutPromise = new Promise((_, reject) => 
     setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
   );
   
   try {
     await Promise.race([
       createOrder(body),
       timeoutPromise
     ]);
   } catch (error) {
     if (error.message === 'Operation timeout') {
       return {
         statusCode: 504,
         body: JSON.stringify({
           error: 'GatewayTimeout',
           message: 'Request took too long. Please try again.'
         })
       };
     }
   }

Learning Outcome:
├── Complete Lambda implementation
├── Error handling patterns mastered
├── Ready for testing
└── Understanding of edge cases
```

**Day 3: Testing & Step Functions**

```
Morning Session (2 hours)

1. Unit Testing (VS Code)
   File: tests/unit/createOrder.test.ts
   
   Test Suite: Input Validation
   ├── Test: Should accept valid input
   ├── Test: Should reject empty items array
   ├── Test: Should reject negative quantities
   ├── Test: Should reject invalid date format
   ├── Test: Should reject past delivery dates
   └── Test: Should reject dates beyond 7 days
   
   Test Suite: User Validation
   ├── Test: Should accept valid user with complete profile
   ├── Test: Should reject non-existent user
   ├── Test: Should reject user with incomplete profile
   └── Test: Should reject invalid address ID
   
   Test Suite: Inventory Validation
   ├── Test: Should pass when all items in stock
   ├── Test: Should fail when any item out of stock
   ├── Test: Should handle partial stock correctly
   └── Test: Should handle multiple vendors
   
   Test Suite: Pricing Calculation
   ├── Test: Should calculate subtotal correctly
   ├── Test: Should apply 5% GST
   ├── Test: Should apply free delivery for orders > ₹500
   ├── Test: Should charge ₹40 for orders < ₹300
   ├── Test: Should apply first order discount
   └── Test: Should calculate multi-vendor surcharge
   
   Run Tests:
   $ npm test
   
   Expected Output:
   PASS  tests/unit/createOrder.test.ts
     Input Validation
       ✓ Should accept valid input (5ms)
       ✓ Should reject empty items array (3ms)
       ✓ Should reject negative quantities (2ms)
       ✓ Should reject invalid date format (3ms)
       ✓ Should reject past delivery dates (2ms)
       ✓ Should reject dates beyond 7 days (2ms)
     
     Test Suites: 4 passed, 4 total
     Tests:       24 passed, 24 total
     Time:        2.341s

2. Local Testing with SAM (VS Code Terminal)
   
   Build project:
   $ cd backend
   $ npm run build
   $ sam build
   
   Output:
   Building codeuri: dist/ runtime: nodejs20.x architecture: x86_64
   Running NodejsNpmBuilder:NpmPack
   Build Succeeded
   
   Test with valid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-valid.json \
     --env-vars env.json
   
   Expected Output:
   Invoking lambdas/order/createOrder.handler
   START RequestId: abc-123 Version: $LATEST
   [INFO] Order creation started for user: user-123
   [INFO] Inventory validation passed
   [INFO] Order created: order-xyz-789
   END RequestId: abc-123
   REPORT RequestId: abc-123 Duration: 1243.56 ms Memory: 512 MB
   
   {"statusCode":201,"body":"{\"orderId\":\"order-xyz-789\",...}"}
   
   Test with invalid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-invalid-date.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"ValidationError\",...}"}
   
   Test with insufficient stock:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-insufficient-stock.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"InsufficientStock\",...}"}

3. Create Step Functions State Machine
   File: stepFunctions/orderProcessing.asl.json
   
   {
     "Comment": "Order Processing Workflow",
     "StartAt": "ReserveInventory",
     "States": {
       "ReserveInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:reserveInventoryFunction",
         "InputPath": "$",
         "ResultPath": "$.reservationResult",
         "Next": "CheckReservation",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "ReservationFailed"
           }
         ]
       },
       
       "CheckReservation": {
         "Type": "Choice",
         "Choices": [
           {
             "Variable": "$.reservationResult.success",
             "BooleanEquals": true,
             "Next": "NotifyVendors"
           }
         ],
         "Default": "ReservationFailed"
       },
       
       "NotifyVendors": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:notifyVendorsFunction",
         "InputPath": "$",
         "ResultPath": "$.notificationResult",
         "Next": "UpdateOrderStatus",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "NotificationFailed"
           }
         ]
       },
       
       "UpdateOrderStatus": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:updateOrderStatusFunction",
         "InputPath": "$",
         "Parameters": {
           "orderId.$": "$.orderId",
           "status": "Confirmed"
         },
         "ResultPath": "$.updateResult",
         "Next": "NotifyCustomer"
       },
       
       "NotifyCustomer": {
         "Type": "Task",
         "Resource": "arn:aws:states:::sns:publish",
         "Parameters": {
           "TopicArn": "arn:aws:sns:region:account:order-notifications",
           "Message.$": "$.orderId",
           "Subject": "Order Confirmed"
         },
         "Next": "OrderProcessingComplete"
       },
       
       "OrderProcessingComplete": {
         "Type": "Succeed"
       },
       
       "ReservationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Inventory reservation failed"
         },
         "Next": "OrderFailed"
       },
       
       "NotificationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Vendor notification failed"
         },
         "Next": "ReleaseInventory"
       },
       
       "ReleaseInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:releaseInventoryFunction",
         "InputPath": "$",
         "Next": "OrderFailed"
       },
       
       "OrderFailed": {
         "Type": "Fail",
         "Error": "OrderProcessingFailed",
         "Cause": "Order processing workflow failed"
       }
     }
   }

Afternoon Session (1.5 hours)

4. Add Step Functions to SAM Template
   File: template.yaml
   
   Resources:
     OrderProcessingStateMachine:
       Type: AWS::Serverless::StateMachine
       Properties:
         Name: OrderProcessingWorkflow
         DefinitionUri: stepFunctions/orderProcessing.asl.json
         DefinitionSubstitutions:
           ReserveInventoryFunctionArn: !GetAtt ReserveInventoryFunction.Arn
           NotifyVendorsFunctionArn: !GetAtt NotifyVendorsFunction.Arn
           UpdateOrderStatusFunctionArn: !GetAtt UpdateOrderStatusFunction.Arn
           HandleOrderFailureFunctionArn: !GetAtt HandleOrderFailureFunction.Arn
           ReleaseInventoryFunctionArn: !GetAtt ReleaseInventoryFunction.Arn
           OrderNotificationsTopic: !Ref OrderNotificationsTopic
         Policies:
           - LambdaInvokePolicy:
               FunctionName: !Ref ReserveInventoryFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref NotifyVendorsFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref UpdateOrderStatusFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref HandleOrderFailureFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref ReleaseInventoryFunction
           - SNSPublishMessagePolicy:
               TopicName: !GetAtt OrderNotificationsTopic.TopicName
         Logging:
           Level: ALL
           IncludeExecutionData: true
           Destinations:
             - CloudWatchLogsLogGroup:
                 LogGroupArn: !GetAtt OrderProcessingLogGroup.Arn
     
     OrderNotificationsTopic:
       Type: AWS::SNS::Topic
       Properties:
         TopicName: order-notifications
         DisplayName: Order Notifications
         Subscription:
           - Endpoint: your-email@example.com
             Protocol: email
     
     OrderProcessingLogGroup:
       Type: AWS::Logs::LogGroup
       Properties:
         LogGroupName: /aws/vendedlogs/states/OrderProcessing
         RetentionInDays: 7

5. Deploy Complete Stack
   $ sam build
   $ sam deploy --guided
   
   Deployment Output:
   CloudFormation stack changeset
   ---------------------------------
   Operation                 LogicalResourceId         ResourceType
   ---------------------------------
   + Add                     CreateOrderFunction       AWS::Lambda::Function
   + Add                     ReserveInventoryFunc      AWS::Lambda::Function
   + Add                     NotifyVendorsFunction     AWS::Lambda::Function
   + Add                     OrderProcessingState      AWS::StepFunctions::StateMachine
   + Add                     OrdersTable               AWS::DynamoDB::Table
   + Add                     OrderNotificationsTopic   AWS::SNS::Topic
   ---------------------------------
   
   Deploy this changeset? [y/N]: y
   
   Deployment progress:
   CREATE_IN_PROGRESS  OrdersTable
   CREATE_IN_PROGRESS  CreateOrderFunction
   CREATE_COMPLETE     OrdersTable
   CREATE_COMPLETE     CreateOrderFunction
   ...
   CREATE_COMPLETE     OrderProcessingStateMachine
   
   Successfully created/updated stack - milk-delivery-dev

6. Test Deployed Stack (AWS Console)
   
   Console → Step Functions → State machines → OrderProcessingWorkflow
   ├── Click "Start execution"
   ├── Input JSON:
   │   {
   │     "orderId": "test-order-001",
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ]
   │   }
   ├── Click "Start execution"
   └── Watch execution graph
   
   Visual Execution:
   ReserveInventory (Running) ⏳
   ├── Lambda invoked
   └── Waiting for response...
   
   ReserveInventory (Succeeded) ✅
   ├── Duration: 1.2s
   └── Output: {"success": true, "reservationId": "res-123"}
   
   NotifyVendors (Running) ⏳
   ├── Lambda invoked
   └── Sending emails...
   
   NotifyVendors (Succeeded) ✅
   ├── Duration: 0.8s
   └── Output: {"notified": ["vendor-001"]}
   
   UpdateOrderStatus (Running) ⏳
   UpdateOrderStatus (Succeeded) ✅
   
   NotifyCustomer (Running) ⏳
   NotifyCustomer (Succeeded) ✅
   
   OrderProcessingComplete ✅
   Total Duration: 4.5s
   
   Check CloudWatch Logs:
   ├── Console → CloudWatch → Log groups
   ├── /aws/vendedlogs/states/OrderProcessing
   └── View execution logs

Learning Outcome:
├── Step Functions workflow working
├── Async processing implemented
├── Error handling and retries configured
├── Complete order flow functional
└── Ready for API Gateway integration
```

**Day 4: API Gateway Integration**

```
Morning Session (2 hours)

1. Add API Gateway to SAM Template
   File: template.yaml
   
   Resources:
     MilkDeliveryApi:
       Type: AWS::Serverless::Api
       Properties:
         Name: MilkDeliveryAPI
         StageName: dev
         Cors:
           AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
           AllowHeaders: "'Content-Type,Authorization'"
           AllowOrigin: "'*'"
         Auth:
           DefaultAuthorizer: CognitoAuthorizer
           Authorizers:
             CognitoAuthorizer:
               UserPoolArn: !GetAtt UserPool.Arn
         GatewayResponses:
           UNAUTHORIZED:
             StatusCode: 401
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
           BAD_REQUEST_BODY:
             StatusCode: 400
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
         DefinitionBody:
           openapi: 3.0.1
           info:
             title: Milk Delivery API
             version: 1.0.0
           paths:
             /orders:
               post:
                 summary: Create a new order
                 requestBody:
                   required: true
                   content:
                     application/json:
                       schema:
                         type: object
                         required:
                           - items
                           - deliveryDate
                           - addressId
                         properties:
                           items:
                             type: array
                             minItems: 1
                             maxItems: 50
                           deliveryDate:
                             type: string
                             format: date
                           addressId:
                             type: string
                 responses:
                   '201':
                     description: Order created successfully
                   '400':
                     description: Invalid input
                   '401':
                     description: Unauthorized
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${CreateOrderFunction.Arn}/invocations'
               get:
                 summary: List user orders
                 responses:
                   '200':
                     description: List of orders
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ListOrdersFunction.Arn}/invocations'
             
             /orders/{orderId}:
               get:
                 summary: Get order details
                 parameters:
                   - name: orderId
                     in: path
                     required: true
                     schema:
                       type: string
                 responses:
                   '200':
                     description: Order details
                   '404':
                     description: Order not found
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetOrderFunction.Arn}/invocations'
     
     CreateOrderFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/order/createOrder.handler
         Events:
           CreateOrder:
             Type: Api
             Properties:
               RestApiId: !Ref MilkDeliveryApi
               Path: /orders
               Method: POST
               Auth:
                 Authorizer: CognitoAuthorizer

2. Configure Request Validation
   File: template.yaml (add to API definition)
   
   RequestValidator:
     Type: AWS::ApiGateway::RequestValidator
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ValidateRequestBody: true
       ValidateRequestParameters: true
   
   Request Models:
   CreateOrderModel:
     Type: AWS::ApiGateway::Model
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ContentType: application/json
       Schema:
         type: object
         required:
           - items
           - deliveryDate
           - addressId
         properties:
           items:
             type: array
             minItems: 1
             items:
               type: object
               required:
                 - productId
                 - vendorId
                 - quantity
               properties:
                 productId:
                   type: string
                   pattern: '^prod-[a-zA-Z0-9-]+
                 vendorId:
                   type: string
                   pattern: '^vendor-[a-zA-Z0-9-]+
                 quantity:
                   type: integer
                   minimum: 1
                   maximum: 100
           deliveryDate:
             type: string
             format: date
           addressId:
             type: string

3. Deploy and Test API
   $ sam build
   $ sam deploy
   
   Output:
   Outputs:
   ├── MilkDeliveryApiUrl: https://abc123.execute-api.us-east-1.amazonaws.com/dev
   ├── CreateOrderFunctionArn: arn:aws:lambda:us-east-1:123456789:function:createOrder
   └── OrderProcessingStateMachine: arn:aws:states:us-east-1:123456789:stateMachine:OrderProcessing

Afternoon Session (1.5 hours)

4. Test API with Thunder Client (VS Code)
   
   Install Thunder Client extension
   ├── Extensions → Search "Thunder Client"
   ├── Install
   └── Restart VS Code
   
   Create Request Collection:
   Thunder Client → Collections → New Collection
   ├── Name: Milk Delivery API - Dev
   └── Create
   
   Request 1: Create Order (Success Case)
   ├── Method: POST
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders
   ├── Headers:
   │   ├── Content-Type: application/json
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   ├── Body (JSON):
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       },
   │       {
   │         "productId": "prod-yogurt-200g",
   │         "vendorId": "vendor-001",
   │         "quantity": 3
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (201 Created):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "quantity": 2,
         "unitPrice": 50,
         "totalPrice": 100
       },
       {
         "productId": "prod-yogurt-200g",
         "vendorId": "vendor-001",
         "productName": "Greek Yogurt 200g",
         "quantity": 3,
         "unitPrice": 30,
         "totalPrice": 90
       }
     ],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "discount": 0,
     "totalAmount": 239.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-12T08:00:00Z",
     "message": "Order created successfully. You will receive confirmation shortly."
   }
   
   Request 2: Create Order (Validation Error)
   ├── Body:
   │   {
   │     "items": [],  ← Empty array
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid input data",
     "errors": [
       {
         "field": "items",
         "message": "Items array cannot be empty",
         "code": "EMPTY_ITEMS"
       }
     ]
   }
   
   Request 3: Create Order (Insufficient Stock)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 1000  ← Too many
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 500ml' has only 50 units available",
     "productId": "prod-milk-500ml",
     "availableQuantity": 50,
     "requestedQuantity": 1000
   }
   
   Request 4: Create Order (Invalid Date)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ],
   │     "deliveryDate": "2025-10-01",  ← Past date
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid delivery date",
     "errors": [
       {
         "field": "deliveryDate",
         "message": "Delivery date cannot be in the past",
         "code": "INVALID_DATE"
       }
     ]
   }
   
   Request 5: Get Order Details
   ├── Method: GET
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders/order-abc-123-xyz
   ├── Headers:
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   └── Send
   
   Expected Response (200 OK):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [...],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "totalAmount": 239.5,
     "status": "Confirmed",
     "deliveryDate": "2025-10-12",
     "deliveryAddress": {
       "line1": "123 Main Street",
       "city": "Vadodara",
       "state": "Gujarat",
       "zipCode": "390001"
     },
     "createdAt": "2025-10-09T10:30:00Z",
     "updatedAt": "2025-10-09T10:30:15Z"
   }

5. Verify in AWS Console
   
   Console → API Gateway → MilkDeliveryAPI
   ├── Stages → dev
   ├── Invoke URL: Copy URL
   ├── Resources → /orders → POST
   ├── Test → Click "TEST" button
   ├── Request Body: Paste test JSON
   ├── Execute
   └── View Response
   
   Console → Lambda → CreateOrderFunction
   ├── Monitor tab
   ├── View logs → CloudWatch Logs
   ├── See execution logs
   └── Check for errors
   
   Console → DynamoDB → milk-delivery-orders
   ├── Items tab
   ├── See newly created order
   └── Verify all fields
   
   Console → Step Functions → OrderProcessingWorkflow
   ├── Executions tab
   ├── See execution for your order
   ├── Click execution ID
   └── View execution graph

Learning Outcome:
├── API Gateway fully integrated
├── End-to-end flow working
├── Multiple test scenarios validated
├── Ready for frontend integration
└── Understanding of full serverless stack
```

**Day 5: Edge Cases & Error Handling**

```
Morning Session (2 hours)

1. Edge Case Testing Matrix
   
   Test Case 1: Concurrent Orders (Race Condition)
   Scenario: Two users order the last item simultaneously
   
   Setup:
   ├── Set product stock to 1 unit
   ├── User A submits order for 1 unit
   ├── User B submits order for 1 unit (within milliseconds)
   └── Expected: Only one order succeeds
   
   Implementation Solution:
   ├── Use DynamoDB Conditional Expressions
   ├── UpdateItem with condition: stock > 0
   ├── If condition fails: Return insufficient stock
   └── Atomic operation prevents over-selling
   
   Code Pattern:
   await dynamodb.update({
     TableName: INVENTORY_TABLE,
     Key: { vendorId, productId },
     UpdateExpression: 'SET stock = stock - :qty, reserved = reserved + :qty',
     ConditionExpression: 'stock >= :qty',
     ExpressionAttributeValues: {
       ':qty': quantity
     }
   });
   // If condition fails, AWS throws ConditionalCheckFailedException
   
   Test Case 2: Multi-Vendor Order with Partial Failure
   Scenario: Order has items from 3 vendors, one vendor out of stock
   
   Expected Behavior:
   ├── Option A (Simple): Reject entire order
   ├── Option B (Advanced): Partial fulfillment
   └── For MVP: Choose Option A
   
   Implementation:
   ├── Validate all inventory BEFORE creating order
   ├── If any item fails: Return 400 with details
   ├── No partial orders
   └── Clear error message to user
   
   Test Case 3: Payment Gateway Timeout
   Scenario: Stripe API takes > 10 seconds to respond
   
   Implementation:
   ├── Set order status: "PaymentPending"
   ├── Use Stripe webhooks for async confirmation
   ├── Don't wait for payment in createOrder Lambda
   ├── Separate Lambda handles payment webhooks
   └── Update order status when webhook received
   
   Flow:
   createOrder → Return "PaymentPending"
       ↓
   User redirected to Stripe
       ↓
   Stripe processes payment
       ↓
   Stripe sends webhook → paymentWebhookHandler
       ↓
   Update order status → "Paid"
       ↓
   Trigger Step Functions workflow
   
   Test Case 4: Database Write Failure After Inventory Reserved
   Scenario: Inventory reserved, but DynamoDB fails to create order
   
   Problem:
   ├── Inventory locked
   ├── Order not created
   └── User sees error, but stock is reduced
   
   Solution: Use DynamoDB Transactions
   const params = {
     TransactItems: [
       {
         Update: {
           TableName: INVENTORY_TABLE,
           Key: { vendorId, productId },
           UpdateExpression: 'SET reserved = reserved + :qty',
           ConditionExpression: 'stock >= reserved + :qty',
           ExpressionAttributeValues: { ':qty': quantity }
         }
       },
       {
         Put: {
           TableName: ORDERS_TABLE,
           Item: orderObject,
           ConditionExpression: 'attribute_not_exists(orderId)'
         }
       }
     ]
   };
   await dynamodb.transactWrite(
              quantity:
                type: integer
                minimum: 1
                maximum: 100
        deliveryDate:
          type: string
          format: date  # YYYY-MM-DD
        addressId:
          type: string
          minLength: 1

paths:
  /orders:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateOrderModel'
      x-amazon-apigateway-request-validator: request-validator
```

**Benefits:**
```
├── Validation happens at API Gateway (before Lambda)
├── Reduces Lambda invocations (cost savings)
├── Faster error responses
├── Consistent error messages
└── Less code in Lambda function
```

### 8.5 API Gateway Stages & Deployment

**Stages Concept:**
```
API Lifecycle:
├── dev → Development/testing
├── staging → Pre-production testing
├── prod → Production

Each stage has:
├── Unique invoke URL
├── Separate configuration
├── Different variables
└── Independent logs
```

**SAM Multi-Stage Setup:**
```yaml
# template.yaml
Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues:
      - dev
      - staging
      - prod

Globals:
  Function:
    Environment:
      Variables:
        STAGE: !Ref Environment
        ORDERS_TABLE: !Sub '${Environment}-orders'
        LOG_LEVEL: !If [IsProd, 'ERROR', 'INFO']

Conditions:
  IsProd: !Equals [!Ref Environment, 'prod']

Resources:
  MilkDeliveryApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: !Ref Environment
      Variables:
        Environment: !Ref Environment

# Deploy to different stages
$ sam deploy --parameter-overrides Environment=dev
$ sam deploy --parameter-overrides Environment=staging
$ sam deploy --parameter-overrides Environment=prod
```

**Stage Variables Usage:**
```
Example: Different Lambda aliases per stage

API Gateway Stage Variable:
lambdaAlias = dev | staging | prod

Lambda Integration:
URI: arn:aws:lambda:region:account:function:createOrder:${stageVariables.lambdaAlias}

Benefits:
├── Same API configuration
├── Different Lambda versions
├── Easy rollback (change stage variable)
└── Blue-green deployments
```

### 8.6 API Gateway Monitoring

**CloudWatch Metrics:**
```
Key Metrics:
├── Count: Total requests
├── IntegrationLatency: Lambda execution time
├── Latency: Total request time (including API Gateway overhead)
├── 4XXError: Client errors
├── 5XXError: Server errors
└── CacheHitCount: Cache performance (if caching enabled)

Latency Breakdown:
Total Latency = API Gateway Overhead + Integration Latency
Example: 250ms = 50ms (API GW) + 200ms (Lambda)

Optimization Target:
├── Integration Latency < 1000ms (Lambda optimization)
├── API Gateway Overhead < 100ms (normal)
└── Total Latency < 1100ms
```

**Enable Logging:**
```yaml
MilkDeliveryApi:
  Type: AWS::Serverless::Api
  Properties:
    AccessLogSetting:
      DestinationArn: !GetAtt ApiGatewayLogGroup.Arn
      Format: '$context.requestId $context.error.message $context.error.messageString $context.integrationErrorMessage'
    MethodSettings:
      - ResourcePath: '/*'
        HttpMethod: '*'
        LoggingLevel: INFO
        DataTraceEnabled: true
        MetricsEnabled: true

ApiGatewayLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub '/aws/apigateway/${AWS::StackName}'
    RetentionInDays: 7  # Save costs
```

**Log Analysis:**
```
CloudWatch Logs Insights Query:

Query 1: Slowest endpoints
fields @timestamp, @message
| filter @message like /Latency/
| parse @message /Latency: (?<latency>\d+)/
| stats avg(latency) as avg_latency, max(latency) as max_latency by method, path
| sort avg_latency desc

Query 2: Error rate
fields @timestamp
| filter status >= 400
| stats count() as error_count by status, path
| sort error_count desc

Query 3: Request volume by hour
fields @timestamp
| stats count() as request_count by bin(1h)
```

---

## 9. AUTHENTICATION & AUTHORIZATION

### 9.1 Amazon Cognito Setup

**Cognito User Pool (Step-by-Step):**
```
AWS Console → Cognito → Create User Pool

Step 1: Authentication Providers
├── Provider: Cognito User Pool
├── Sign-in options: ✅ Email, ✅ Phone number
└── Username requirements: Case sensitive

Step 2: Security Requirements
├── Password policy:
│   ├── Minimum length: 8
│   ├── ✅ Require numbers
│   ├── ✅ Require special characters
│   ├── ✅ Require uppercase letters
│   └── ✅ Require lowercase letters
├── MFA: Optional (recommended for production)
└── User account recovery: Email only (free)

Step 3: Sign-up Experience
├── Self-registration: ✅ Enabled
├── Required attributes:
│   ├── ✅ email (required)
│   ├── ✅ name
│   └── ✅ phone_number
├── Email verification: ✅ Required
└── Verification code: Send by email

Step 4: Message Delivery
├── Email provider: ✅ Send email with Cognito
│   └── Free tier: 50 emails/day
├── From email: no-reply@verificationemail.com
└── SMS: Don't configure (costs money)

Step 5: App Integration
├── User pool name: milk-delivery-users
├── App client name: milk-delivery-web
├── Generate client secret: ❌ No (for public clients)
├── Authentication flows:
│   ├── ✅ ALLOW_USER_SRP_AUTH
│   ├── ✅ ALLOW_REFRESH_TOKEN_AUTH
│   └── ✅ ALLOW_USER_PASSWORD_AUTH
└── Token expiration:
    ├── Access token: 1 hour
    ├── ID token: 1 hour
    └── Refresh token: 30 days

Step 6: Review and Create
└── Click "Create user pool"

Result:
├── User Pool ID: us-east-1_aBcDeFgHi
├── App Client ID: 1a2b3c4d5e6f7g8h9i0j
└── User Pool ARN: arn:aws:cognito-idp:us-east-1:123456789:userpool/us-east-1_aBcDeFgHi
```

**SAM Template for Cognito:**
```yaml
UserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    UserPoolName: milk-delivery-users
    AutoVerifiedAttributes:
      - email
    UsernameAttributes:
      - email
    Schema:
      - Name: email
        Required: true
        Mutable: false
      - Name: name
        Required: true
        Mutable: true
      - Name: phone_number
        Required: false
        Mutable: true
    Policies:
      PasswordPolicy:
        MinimumLength: 8
        RequireUppercase: true
        RequireLowercase: true
        RequireNumbers: true
        RequireSymbols: true
    AccountRecoverySetting:
      RecoveryMechanisms:
        - Name: verified_email
          Priority: 1

UserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    UserPoolId: !Ref UserPool
    ClientName: milk-delivery-web
    GenerateSecret: false
    ExplicitAuthFlows:
      - ALLOW_USER_SRP_AUTH
      - ALLOW_REFRESH_TOKEN_AUTH
      - ALLOW_USER_PASSWORD_AUTH
    TokenValidityUnits:
      AccessToken: hours
      IdToken: hours
      RefreshToken: days
    AccessTokenValidity: 1
    IdTokenValidity: 1
    RefreshTokenValidity: 30

Outputs:
  UserPoolId:
    Value: !Ref UserPool
  UserPoolClientId:
    Value: !Ref UserPoolClient
  UserPoolArn:
    Value: !GetAtt UserPool.Arn
```

### 9.2 JWT Token Structure

**Understanding JWT:**
```
JWT Structure: header.payload.signature

Example Token:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidXNlckBleGFtcGxlLmNvbSIsImlhdCI6MTYzMzA0ODgwMCwiZXhwIjoxNjMzMDUyNDAwfQ.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

Decoded:

Header:   await dynamodb.transactWrite(params);
   // Either both succeed or both fail (atomicity)
   
   Test Case 5: User Cancels Order During Processing
   Scenario: Order created, Step Functions running, user clicks "Cancel"
   
   Implementation:
   ├── Check current order status
   ├── If status = "Pending": Allow cancellation
   ├── If status = "Processing": Check Step Functions execution
   ├── Stop execution: stepFunctions.stopExecution()
   ├── Release inventory
   └── Update order status: "Cancelled"
   
   Test Case 6: Invalid JWT Token
   Scenario: User sends expired or tampered token
   
   API Gateway Authorizer handles:
   ├── Validates JWT signature
   ├── Checks expiration
   ├── Verifies issuer (Cognito User Pool)
   └── Returns 401 Unauthorized if invalid
   
   Lambda never receives request with invalid token
   
   Test Case 7: DynamoDB Throttling
   Scenario: Free tier limits exceeded (25 WCU/RCU)
   
   Symptoms:
   ├── ProvisionedThroughputExceededException
   ├── Lambda returns 500 error
   └── Operations fail
   
   Solution:
   ├── Use exponential backoff (built into AWS SDK)
   ├── Implement retry logic in Lambda
   ├── Monitor CloudWatch metrics
   └── Consider on-demand billing (scales automatically)
   
   Implementation:
   const dynamodbWithRetry = DynamoDBDocumentClient.from(client, {
     retryMode: 'adaptive',
     maxAttempts: 3
   });
   
   Test Case 8: Large Order (100+ items)
   Scenario: User tries to order 100 different products
   
   Considerations:
   ├── Lambda execution time: May exceed 10s timeout
   ├── DynamoDB batch size: Max 25 items per BatchGetItem
   ├── API Gateway payload: Max 10 MB
   └── Step Functions payload: Max 256 KB
   
   Solutions:
   ├── Set maximum items per order: 50
   ├── Validate in API Gateway request validator
   ├── Batch DynamoDB operations properly
   └── Use S3 for large payloads if needed (advanced)

Afternoon Session (1.5 hours)

2. Implement Idempotency
   
   Problem: User clicks "Place Order" twice
   ├── Network delay, no response
   ├── User clicks again
   └── Two orders created for same cart
   
   Solution: Idempotency Keys
   
   Request Header:
   Idempotency-Key: <unique-client-generated-uuid>
   
   Implementation:
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent) => {
     const idempotencyKey = event.headers['idempotency-key'] || 
                            event.headers['Idempotency-Key'];
     
     if (!idempotencyKey) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'MissingIdempotencyKey',
           message: 'Idempotency-Key header is required'
         })
       };
     }
     
     // Check if order with this key already exists
     const existingOrder = await dynamodb.query({
       TableName: ORDERS_TABLE,
       IndexName: 'idempotency-key-index',
       KeyConditionExpression: 'idempotencyKey = :key',
       ExpressionAttributeValues: {
         ':key': idempotencyKey
       }
     });
     
     if (existingOrder.Items && existingOrder.Items.length > 0) {
       // Order already created, return existing order
       return {
         statusCode: 200,
         body: JSON.stringify(existingOrder.Items[0])
       };
     }
     
     // Create new order with idempotency key
     const order = {
       ...orderData,
       idempotencyKey
     };
     
     await dynamodb.put({
       TableName: ORDERS_TABLE,
       Item: order,
       ConditionExpression: 'attribute_not_exists(idempotencyKey)'
     });
     
     return {
       statusCode: 201,
       body: JSON.stringify(order)
     };
   };
   
   DynamoDB Table Update (template.yaml):
   OrdersTable:
     GlobalSecondaryIndexes:
       - IndexName: idempotency-key-index
         KeySchema:
           - AttributeName: idempotencyKey
             KeyType: HASH
         Projection:
           ProjectionType: ALL

3. Implement Circuit Breaker Pattern
   
   Problem: Downstream service (payment gateway) is down
   ├── Every request times out
   ├── Lambda execution time wasted
   ├── Poor user experience
   └── Increased costs
   
   Solution: Circuit Breaker
   
   States:
   ├── CLOSED: Normal operation, requests pass through
   ├── OPEN: Too many failures, reject requests immediately
   └── HALF_OPEN: Test if service recovered
   
   Implementation:
   File: src/shared/circuitBreaker.ts
   
   class CircuitBreaker {
     private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
     private failureCount = 0;
     private failureThreshold = 5;
     private timeout = 60000; // 1 minute
     private lastFailureTime?: number;
     
     async execute<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'OPEN') {
         if (Date.now() - this.lastFailureTime! > this.timeout) {
           this.state = 'HALF_OPEN';
         } else {
           throw new Error('Circuit breaker is OPEN');
         }
       }
       
       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
     
     private onSuccess() {
       this.failureCount = 0;
       this.state = 'CLOSED';
     }
     
     private onFailure() {
       this.failureCount++;
       this.lastFailureTime = Date.now();
       
       if (this.failureCount >= this.failureThreshold) {
         this.state = 'OPEN';
       }
     }
   }
   
   Usage:
   const paymentCircuitBreaker = new CircuitBreaker();
   
   try {
     const paymentResult = await paymentCircuitBreaker.execute(async () => {
       return await stripeClient.charges.create({...});
     });
   } catch (error) {
     if (error.message === 'Circuit breaker is OPEN') {
       return {
         statusCode: 503,
         body: JSON.stringify({
           error: 'ServiceUnavailable',
           message: 'Payment service is temporarily unavailable. Please try again later.'
         })
       };
     }
   }

4. Comprehensive Error Response Structure
   
   Standardized Error Format:
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Human-readable message",
       "details": {
         "field": "specificField",
         "reason": "Detailed reason"
       },
       "requestId": "req-abc-123",
       "timestamp": "2025-10-09T10:30:00Z",
       "retryable": boolean,
       "documentation": "https://docs.milkdelivery.com/errors/ERROR_CODE"
     }
   }
   
   Error Codes Catalog:
   ├── VALIDATION_ERROR (400)
   ├── UNAUTHORIZED (401)
   ├── FORBIDDEN (403)
   ├── RESOURCE_NOT_FOUND (404)
   ├── CONFLICT (409)
   ├── RATE_LIMIT_EXCEEDED (429)
   ├── INTERNAL_SERVER_ERROR (500)
   ├── SERVICE_UNAVAILABLE (503)
   └── GATEWAY_TIMEOUT (504)
   
   Implementation:
   File: src/shared/errors.ts
   
   export class AppError extends Error {
     constructor(
       public code: string,
       public message: string,
       public statusCode: number,
       public details?: any,
       public retryable: boolean = false
     ) {
       super(message);
       this.name = 'AppError';
     }
     
     toJSON() {
       return {
         error: {
           code: this.code,
           message: this.message,
           details: this.details,
           requestId: 'Set by Lambda context',
           timestamp: new Date().toISOString(),
           retryable: this.retryable,
           documentation: `https://docs.milkdelivery.com/errors/${this.code}`
         }
       };
     }
   }
   
   export class ValidationError extends AppError {
     constructor(message: string, field?: string) {
       super('VALIDATION_ERROR', message, 400, { field });
     }
   }
   
   export class InsufficientStockError extends AppError {
     constructor(productId: string, available: number, requested: number) {
       super(
         'INSUFFICIENT_STOCK',
         `Product has only ${available} units available`,
         400,
         { productId, available, requested }
       );
     }
   }
   
   Usage in Lambda:
   try {
     // ... validation logic
     if (stock < requestedQty) {
       throw new InsufficientStockError(productId, stock, requestedQty);
     }
   } catch (error) {
     if (error instanceof AppError) {
       return {
         statusCode: error.statusCode,
         body: JSON.stringify(error.toJSON())
       };
     }
     
     // Unknown error
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: {
           code: 'INTERNAL_SERVER_ERROR',
           message: 'An unexpected error occurred',
           requestId: context.requestId,
           timestamp: new Date().toISOString()
         }
       })
     };
   }

5. Logging Best Practices
   
   Structured Logging Format:
   {
     "timestamp": "2025-10-09T10:30:00.123Z",
     "level": "INFO|WARN|ERROR",
     "requestId": "req-abc-123",
     "userId": "user-456",
     "action": "CREATE_ORDER",
     "message": "Order created successfully",
     "context": {
       "orderId": "order-xyz-789",
       "totalAmount": 239.5,
       "itemCount": 2
     },
     "duration": 1234,
     "memoryUsed": 128
   }
   
   Implementation:
   File: src/shared/logger.ts
   
   export class Logger {
     private context: Record<string, any> = {};
     
     setContext(key: string, value: any) {
       this.context[key] = value;
     }
     
     info(message: string, data?: Record<string, any>) {
       this.log('INFO', message, data);
     }
     
     warn(message: string, data?: Record<string, any>) {
       this.log('WARN', message, data);
     }
     
     error(message: string, error?: Error, data?: Record<string, any>) {
       this.log('ERROR', message, {
         ...data,
         error: error?.message,
         stack: error?.stack
       });
     }
     
     private log(level: string, message: string, data?: Record<string, any>) {
       const logEntry = {
         timestamp: new Date().toISOString(),
         level,
         message,
         ...this.context,
         ...data
       };
       
       console.log(JSON.stringify(logEntry));
     }
   }
   
   Usage in Lambda:
   export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
     const logger = new Logger();
     logger.setContext('requestId', context.requestId);
     logger.setContext('functionName', context.functionName);
     
     const startTime = Date.now();
     
     try {
       logger.info('Order creation started', {
         userId: extractUserId(event)
       });
       
       const order = await createOrder(body);
       
       logger.info('Order created successfully', {
         orderId: order.orderId,
         totalAmount: order.totalAmount,
         duration: Date.now() - startTime
       });
       
       return successResponse(order);
     } catch (error) {
       logger.error('Order creation failed', error as Error, {
         userId: extractUserId(event),
         duration: Date.now() - startTime
       });
       
       return errorResponse(error);
     }
   };

Learning Outcome:
├── Edge cases identified and handled
├── Idempotency implemented
├── Circuit breaker pattern understood
├── Error handling standardized
├── Logging best practices applied
└── Production-ready code quality
```

---

## 6. LAMBDA FUNCTIONS: DEEP DIVE

### 6.1 Lambda Execution Model

**Cold Start vs Warm Start:**
```
Cold Start (First Invocation or After Idle):
├── AWS provisions execution environment
├── Downloads function code from S3
├── Initializes runtime (Node.js)
├── Executes initialization code (outside handler)
├── Executes handler function
└── Duration: 1-3 seconds (varies)

Warm Start (Subsequent Invocations):
├── Reuses existing execution environment
├── Skips initialization
├── Executes handler function only
└── Duration: 10-100 milliseconds

Optimization Strategy:
├── Initialize clients outside handler
├── Reuse database connections
├── Cache static data
└── Keep functions "warm" (CloudWatch Events ping)
```

**Example: Optimized Lambda Structure**
```typescript
// ✅ GOOD: Initialize outside handler
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Cache configuration (loaded once)
const config = {
  ordersTable: process.env.ORDERS_TABLE,
  minOrderValue: 100,
  taxRate: 0.05
};

export const handler = async (event, context) => {
  // Handler executes quickly, reusing connections
  const result = await docClient.get({
    TableName: config.ordersTable,
    Key: { orderId: event.pathParameters.orderId }
  });
  
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};

// ❌ BAD: Initialize inside handler
export const handler = async (event, context) => {
  const client = new DynamoDBClient({});  // Created every time!
  const docClient = DynamoDBDocumentClient.from(client);
  
  const result = await docClient.get({...});
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};
```

### 6.2 Memory and Timeout Configuration

**Memory Size Impact:**
```
Memory Configuration Options: 128 MB to 10,240 MB (10 GB)

Cost Calculation:
├── Price: $0.0000166667 per GB-second
├── 128 MB = 0.125 GB
├── Example: 1 million requests, 1 second each
│   ├── 128 MB: 1M * 1s * 0.125 GB * $0.0000166667 = $2.08
│   ├── 256 MB: 1M * 1s * 0.25 GB * $0.0000166667 = $4.17
│   ├── 512 MB: 1M * 1s * 0.5 GB * $0.0000166667 = $8.33
│   └── 1024 MB: 1M * 1s * 1 GB * $0.0000166667 = $16.67

Important: CPU power scales with memory
├── 128 MB = Low CPU power (slow execution)
├── 1024 MB = Proportional CPU (4x faster)
└── Paradox: Higher memory can be cheaper (faster execution)

Example Scenario:
├── Function with 128 MB: 2 seconds execution
│   └── Cost: 2s * 0.125 GB * $0.0000166667 = $0.0000041667
├── Same function with 512 MB: 0.6 seconds execution
│   └── Cost: 0.6s * 0.5 GB * $0.0000166667 = $0.0000050000
└── Verdict: 128 MB is cheaper in this case

Optimization Process:
1. Start with 512 MB (good balance)
2. Monitor CloudWatch metrics:
   ├── Duration
   ├── Memory Used
   └── Throttles
3. Adjust based on actual usage:
   ├── If memory used < 50%: Reduce memory
   ├── If duration consistently high: Increase memory
   └── Run load tests to find optimal setting

Your Learning Project:
├── Simple queries (getUser): 256 MB, 5s timeout
├── Order creation: 512 MB, 10s timeout
├── Image processing: 1024 MB, 30s timeout
└── Batch operations: 1024 MB, 60s timeout
```

**Timeout Configuration:**
```
Default: 3 seconds
Maximum: 15 minutes (900 seconds)
Recommendation: Set slightly higher than expected duration

Examples:
├── Simple CRUD: 5-10 seconds
├── API calls to third-party: 15-30 seconds
├── Complex calculations: 30-60 seconds
└── Batch processing: 5-15 minutes

Warning: Long timeouts increase cost if function hangs
├── Always implement timeout handling in code
└── Don't rely solely on Lambda timeout
```

### 6.3 Environment Variables & Secrets

**Environment Variables (SAM Template):**
```yaml
CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Environment:
      Variables:
        ORDERS_TABLE: !Ref OrdersTable
        USERS_TABLE: !Ref UsersTable
        MIN_ORDER_VALUE: '100'
        TAX_RATE: '0.05'
        STAGE: dev
        LOG_LEVEL: INFO
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'  # Reuse HTTP connections
```

**Secrets Management:**
```
❌ NEVER store sensitive data in environment variables:
├── API keys
├── Database passwords
├── Private keys
└── OAuth tokens

✅ Use AWS Secrets Manager:

1. Store secret:
$ aws secretsmanager create-secret \
  --name milk-delivery/stripe-api-key \
  --secret-string '{"apiKey":"sk_test_..."}'

2. Grant Lambda permission (SAM template):
CreateOrderFunction:
  Policies:
    - AWSSecretsManagerGetSecretValuePolicy:
        SecretArn: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:milk-delivery/*'

3. Retrieve in Lambda:
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretName: string) {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString!);
}

// Cache secret (avoid fetching on every invocation)
let stripeKey: string;

export const handler = async (event) => {
  if (!stripeKey) {
    const secret = await getSecret('milk-delivery/stripe-api-key');
    stripeKey = secret.apiKey;
  }
  
  // Use stripeKey
};

Cost: $0.40 per secret per month + $0.05 per 10,000 API calls
For learning: ~$0.40/month (1 secret, minimal calls)
```

### 6.4 Lambda Layers (Code Reuse)

**When to Use Layers:**
```
Use Cases:
├── Shared dependencies (AWS SDK, lodash, axios)
├── Common utilities (logger, validation, db helpers)
├── Large libraries (reduce deployment package size)
└── Code reuse across multiple functions

Benefits:
├── Faster deployments (layer unchanged, only function code updates)
├── Smaller deployment packages
├── Easier dependency management
└── Version control for shared code

Limitations:
├── Max 5 layers per function
├── Max 250 MB unzipped (all layers + function)
├── Layers are immutable (create new version to update)
```

**Creating a Lambda Layer:**
```
Directory Structure:
backend/
└── layers/
    └── common/
        ├── nodejs/
        │   ├── node_modules/  ← Dependencies
        │   └── utils/         ← Your utilities
        │       ├── logger.ts
        │       ├── db.ts
        │       └── validation.ts
        └── package.json

package.json:
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.400.0",
    "@aws-sdk/lib-dynamodb": "^3.400.0",
    "uuid": "^9.0.0"
  }
}

Build Layer:
$ cd layers/common/nodejs
$ npm install
$ cd ../..
$ zip -r common-layer.zip nodejs/

SAM Template:
CommonLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: milk-delivery-common
    Description: Shared utilities and dependencies
    ContentUri: layers/common/
    CompatibleRuntimes:
      - nodejs20.x
    RetentionPolicy: Retain

CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref CommonLayer
    CodeUri: dist/

Usage in Lambda:
// Import from layer
import { logger } from '/opt/nodejs/utils/logger';
import { v4 as uuidv4 } from 'uuid';  // From layer dependencies

export const handler = async (event) => {
  logger.info('Function started');
  const id = uuidv4();
  // ...
};
```

### 6.5 Lambda Monitoring Metrics

**Key CloudWatch Metrics:**
```
1. Invocations
   ├── Count: Total number of invocations
   ├── Use: Track function usage
   └── Free Tier: 1M invocations/month

2. Duration
   ├── Measure: Execution time in milliseconds
   ├── Use: Identify slow functions
   └── Optimization target: Keep under 1 second

3. Errors
   ├── Count: Failed invocations
   ├── Types: Function errors, timeout errors
   └── Goal: < 1% error rate

4. Throttles
   ├── Count: Rejected due to concurrency limits
   ├── Causes: Too many concurrent executions
   └── Solution: Increase reserved concurrency or optimize

5. Memory Usage
   ├── Measure: Actual memory used
   ├── Use: Right-size memory configuration
   └── Example: If using 150 MB of 512 MB, reduce to 256 MB

6. Concurrent Executions
   ├── Measure: Number of instances running simultaneously
   ├── Default limit: 1000 per region
   └── Free tier limit: Usually sufficient for learning

CloudWatch Logs Insights Queries:

Query 1: Average duration by function
fields @timestamp, @duration
| stats avg(@duration) as avg_duration by @function
| sort avg_duration desc

Query 2: Error count
filter @type = "ERROR"
| stats count() as error_count by bin(5m)

Query 3: Memory usage
fields @timestamp, @memorySize / 1000 / 1000 as mem_mb, @maxMemoryUsed / 1000 / 1000 as used_mb
| stats avg(used_mb) as avg_used, max(used_mb) as max_used

Query 4: Cold starts
filter @type = "REPORT"
| fields @duration, @initDuration
| filter ispresent(@initDuration)
| stats count() as cold_starts, avg(@initDuration) as avg_cold_start_ms
```

### 6.6 Lambda Cost Optimization

**Free Tier Maximization:**
```
Lambda Free Tier (Always Free):
├── 1M requests per month
├── 400,000 GB-seconds compute time per month

Calculation Examples:

Scenario 1: 128 MB function, 200ms execution
├── Compute: 0.2s * 0.125 GB = 0.025 GB-seconds per request
├── Free tier allows: 400,000 / 0.025 = 16M requests
├── But request limit is 1M, so effective limit: 1M requests
└── Verdict: Request limit is constraint, not compute

Scenario 2: 1024 MB function, 1s execution
├── Compute: 1s * 1 GB = 1 GB-second per request
├── Free tier allows: 400,000 / 1 = 400,000 requests
├── But request limit is 1M
└── Verdict: Compute is constraint, only 400K requests free

Your Learning Project Estimate:
├── Average: 512 MB, 500ms execution
├── Compute per request: 0.5s * 0.5 GB = 0.25 GB-seconds
├── Free tier allows: 400,000 / 0.25 = 1.6M requests
├── Your usage: ~10,000 requests/month during development
└── Cost: $0 (well within free tier)

Cost After Free Tier:
├── Requests: $0.20 per 1M requests
├── Compute: $0.0000166667 per GB-second
└── Your 10K requests: ~$0.02/month

Optimization Tips:
1. Reduce memory if not fully utilized
2. Optimize code for faster execution
3. Use layers for shared dependencies
4. Implement caching where possible
5. Batch operations when feasible
6. Monitor and eliminate unnecessary invocations
```

---

## 7. DYNAMODB: QUERY PATTERNS & OPTIMIZATION

### 7.1 Key Concepts

**Partition Key (PK) vs Sort Key (SK):**
```
Partition Key (Required):
├── Determines which partition data is stored in
├── Must be unique for each item (if no sort key)
├── Used for direct lookups: GetItem, PutItem
└── Example: userId, orderId, productId

Sort Key (Optional):
├── Allows multiple items with same partition key
├── Items sorted by sort key value
├── Enables range queries
└── Example: timestamp, status, category

Table Design Pattern 1: Simple (PK only)
Users Table:
PK: userId
├── user-001
├── user-002
└── user-003

Query: Get user by ID
const result = await docClient.get({
  TableName: 'Users',
  Key: { userId: 'user-001' }
});

Table Design Pattern 2: Composite Key (PK + SK)
Orders Table:
PK: userId, SK: orderId
├── user-001, order-2025-001
├── user-001, order-2025-002
├── user-002, order-2025-003
└── user-002, order-2025-004

Query: Get all orders for a user
const result = await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-001'
  }
});

Result: Returns order-2025-001 and order-2025-002
```

**Global Secondary Index (GSI):**
```
Purpose: Query table using different keys

Example Problem:
Users Table: PK = userId
├── You can query by userId
└── But you cannot query by email

Solution: Create GSI on email

GSI: email-index
PK: email
├── Allows query by email
└── Returns userId

Query: Find user by email
const result = await docClient.query({
  TableName: 'Users',
  IndexName: 'email-index',
  KeyConditionExpression: 'email = :email',
  ExpressionAttributeValues: {
    ':email': 'user@example.com'
  }
});

GSI Considerations:
├── Cost: Consumes additional WCU/RCU
├── Eventual consistency: Slight delay (usually milliseconds)
├── Projection: Choose ALL, KEYS_ONLY, or INCLUDE
└── Free Tier: Included in 25 WCU/RCU limit

SAM Template:
UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    AttributeDefinitions:
      - AttributeName: userId
        AttributeType: S
      - AttributeName: email
        AttributeType: S
    KeySchema:
      - AttributeName: userId
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: email-index
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        Projection:
          ProjectionType: ALL
    BillingMode: PAY_PER_REQUEST
```

### 7.2 Query vs Scan

**Query (Efficient):**
```
Characteristics:
├── Uses partition key (required)
├── Optionally uses sort key for range
├── Returns only matching items
├── Fast and cost-effective
└── Use whenever possible

Example: Get all orders for a user
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-123'
  }
});

Cost: 1 RCU per 4 KB read (eventually consistent)
Example: 10 orders, 1 KB each = 10 KB = 3 RCUs
```

**Scan (Inefficient):**
```
Characteristics:
├── Reads entire table
├── Filters after reading (wasteful)
├── Slow and expensive
├── Consumes RCUs for all items scanned
└── Avoid in production

Example: Find all orders with status="Pending" (BAD!)
await docClient.scan({
  TableName: 'Orders',
  FilterExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Problem:
├── Scans all 10,000 orders
├── Filters to 100 pending orders
├── Consumes RCUs for all 10,000 items
└── Returns only 100 items

Cost: If 10,000 items * 1 KB = 10,000 KB = 2,500 RCUs
(Way over free tier 25 RCU limit!)

Solution: Use GSI
Create GSI: status-index (PK: status, SK: createdAt)

Query with GSI:
await docClient.query({
  TableName: 'Orders',
  IndexName: 'status-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Cost: Only reads 100 pending orders = 25 RCUs
Savings: 100x reduction!
```

### 7.3 Batch Operations

**BatchGetItem:**
```
Purpose: Retrieve multiple items in one request

Limitations:
├── Max 100 items per request
├── Max 16 MB total response# SOLO DEVELOPER GUIDE - AWS FREE TIER OPTIMIZED
## Milk & Milk Products Delivery Platform (Comprehensive Learning Project)

---

## TABLE OF CONTENTS
1. [Solo Developer Workflow & Mindset](#solo-developer-workflow-mindset)
2. [AWS Free Tier: Complete Strategy](#aws-free-tier-complete-strategy)
3. [Development Environment Setup](#development-environment-setup)
4. [Hybrid Development: Console + VS Code](#hybrid-development-console-vs-code)
5. [Feature Development Flow (Step-by-Step)](#feature-development-flow)
6. [Lambda Functions: Deep Dive](#lambda-functions-deep-dive)
7. [DynamoDB: Query Patterns & Optimization](#dynamodb-query-patterns-optimization)
8. [API Gateway: Configuration & Testing](#api-gateway-configuration-testing)
9. [Authentication & Authorization](#authentication-authorization)
10. [Error Handling & Edge Cases](#error-handling-edge-cases)
11. [Testing Strategies](#testing-strategies)
12. [Monitoring & Debugging](#monitoring-debugging)
13. [CI/CD Pipeline Setup](#cicd-pipeline-setup)
14. [Cost Optimization Techniques](#cost-optimization-techniques)
15. [Security Best Practices](#security-best-practices)
16. [Performance Optimization](#performance-optimization)
17. [Common Pitfalls & Solutions](#common-pitfalls-solutions)
18. [Learning Path & Milestones](#learning-path-milestones)

---

## 1. SOLO DEVELOPER WORKFLOW & MINDSET

### 1.1 Daily Development Routine

**Realistic Time Allocation (3-4 hours/day):**

```
Morning Session (1.5-2 hours)
├── 00:00-00:10 → Review AWS costs (console billing dashboard)
├── 00:10-00:20 → Check CloudWatch logs for overnight errors
├── 00:20-00:30 → Plan today's feature (write in docs/daily-log.md)
├── 00:30-01:45 → Development work (focus time, no distractions)
└── 01:45-02:00 → Commit code & push to GitHub

Evening Session (1.5-2 hours)
├── 00:00-01:00 → Continue feature development or bug fixes
├── 01:00-01:20 → Testing (local + deployed)
├── 01:20-01:40 → Documentation (update API docs, learning notes)
├── 01:40-01:50 → Deploy to AWS (if ready)
└── 01:50-02:00 → Plan tomorrow's task + update Kanban board
```

**Weekly Rhythm:**
```
Monday: Start new feature (backend)
Tuesday: Complete feature + unit tests
Wednesday: Integration + API Gateway setup
Thursday: Frontend integration
Friday: End-to-end testing + documentation
Saturday: Deployment + monitoring
Sunday: Review week, plan next week, learn new AWS concept
```

### 1.2 Solo Developer's Development Phases

**Phase 1: MVP Foundation (Week 1-3)**
```
Week 1: Infrastructure Setup
├── Day 1-2: AWS account setup, IAM users, billing alerts
├── Day 3-4: First Lambda function (Hello World → createUser)
├── Day 5-6: DynamoDB table creation + manual data entry
└── Day 7: First API endpoint working end-to-end

Week 2: User Management
├── Day 1-2: User registration with validation
├── Day 3-4: User login (Cognito integration)
├── Day 5-6: User profile management
└── Day 7: Testing + bug fixes

Week 3: Product Catalog
├── Day 1-3: Product listing + search
├── Day 4-5: Product details + images (S3)
├── Day 6: Vendor management basics
└── Day 7: Integration testing
```

**Phase 2: Core Business Logic (Week 4-8)**
```
Week 4: Order Creation Flow
├── Shopping cart logic (frontend state)
├── Order validation
├── Inventory checking
└── Order creation Lambda

Week 5: Payment Integration
├── Stripe/Razorpay SDK setup
├── Payment flow (test mode)
├── Payment webhooks
└── Order confirmation

Week 6: Step Functions
├── Order processing workflow
├── Inventory reservation
├── Vendor notifications
└── State machine testing

Week 7: Delivery Management
├── Delivery scheduling
├── Status updates
├── Notifications (SNS/SES)
└── Delivery tracking

Week 8: Integration & Bug Fixes
├── End-to-end testing
├── Edge case handling
├── Performance optimization
└── Documentation
```

**Phase 3: Frontend & Polish (Week 9-12)**
```
Week 9-10: React Frontend
├── Component development
├── State management (Redux/Zustand)
├── API integration
└── Responsive design

Week 11: Advanced Features
├── User dashboard
├── Order history
├── Admin panel basics
└── Analytics

Week 12: Deployment & Launch
├── Production deployment
├── Performance tuning
├── Security audit
└── Final testing
```

### 1.3 Task Management (Solo Approach)

**Simple Kanban Board (GitHub Projects or Trello):**
```
Backlog → Todo → In Progress → Testing → Done
```

**Sample Tasks Breakdown:**
```yaml
Epic: User Management
  Story: User Registration
    Task: Create DynamoDB Users table
    Task: Create createUser Lambda
    Task: Add validation logic
    Task: Set up API Gateway endpoint
    Task: Write unit tests
    Task: Test in console
    Task: Deploy with SAM
    Task: Integration test
    
  Story: User Login
    Task: Configure Cognito User Pool
    Task: Create login API
    Task: JWT token validation
    Task: Test authentication flow
```

### 1.4 Learning Mindset

**Document Everything:**
```
docs/
├── daily-log.md           # What you learned today
├── mistakes.md            # Errors and how you fixed them
├── aws-concepts.md        # AWS services explained in your words
├── design-decisions.md    # Why you chose X over Y
└── helpful-resources.md   # Useful articles, videos, docs
```

**Sample daily-log.md entry:**
```markdown
# Day 15 - October 10, 2025

## What I Built Today
- Completed createOrder Lambda function
- Added inventory validation
- Set up Step Functions for order processing

## What I Learned
- DynamoDB transactions prevent race conditions
- Lambda cold starts can be 1-2 seconds (need to optimize)
- Step Functions are billed per state transition ($0.025/1000)

## Problems I Faced
- Issue: Lambda timeout after 3 seconds
- Solution: Increased timeout to 10s, optimized DynamoDB query
- Learning: Always use indexes for queries, not scans!

## Tomorrow's Plan
- Add payment integration (Stripe test mode)
- Write unit tests for createOrder
- Deploy to dev environment
```

---

## 2. AWS FREE TIER: COMPLETE STRATEGY

### 2.1 Detailed Free Tier Limits

**Always Free (No Time Limit):**
```yaml
Lambda:
  Requests: 1,000,000 per month
  Compute: 400,000 GB-seconds per month
  Example: 
    - 1M invocations with 128MB = ~51 hours compute
    - Roughly 3,200 requests/day with 128MB, 1s execution
  Your Usage: Likely 100-500 requests/day during development
  Status: ✅ Safe

DynamoDB:
  Storage: 25 GB
  WCU: 25 (write capacity units)
  RCU: 25 (read capacity units)
  Example:
    - 25 WCU = 25 writes/sec or 2.1M writes/day
    - 25 RCU = 100 eventual reads/sec or 8.6M reads/day
  Your Usage: Maybe 50-100 operations/day in development
  Status: ✅ Very safe
  
  Important: Use on-demand billing mode
    - No upfront capacity planning
    - Pay only for actual reads/writes
    - First 25 WCU/RCU free, then $1.25/$0.25 per million

S3:
  Storage: 5 GB Standard storage
  GET: 20,000 requests
  PUT: 2,000 requests
  Data Transfer: 100 GB out per month (first 12 months)
  Your Usage: 10-50 MB for product images in development
  Status: ✅ Safe

CloudWatch:
  Logs: 5 GB ingestion, 5 GB storage
  Metrics: 10 custom metrics
  Alarms: 10 alarms
  Dashboard: 3 dashboards
  Your Usage: 100-500 MB logs/month during development
  Status: ✅ Safe

SNS:
  Email: 1,000 notifications/month (12 months free)
  SMS: 100 notifications/month (12 months free)
  HTTP: 100,000 notifications/month (12 months free)
  After 12 months: $0.50 per million emails
  Your Usage: 10-50 emails/month for testing
  Status: ⚠️ Be careful with SMS after year 1

SES (Simple Email Service):
  Emails: 62,000 per month (always free if sent from EC2)
  From Lambda: 3,000 per month free (12 months)
  After: $0.10 per 1,000 emails
  Your Usage: 10-100 emails/month
  Status: ✅ Safe, better than SNS for emails

Cognito:
  MAU: 50,000 monthly active users (always free)
  Your Usage: 1-10 test users
  Status: ✅ Very safe
```

**12 Months Free (After Sign-up):**
```yaml
API Gateway:
  REST API: 1,000,000 requests per month
  After: $3.50 per million requests
  Your Usage: 100-1,000 requests/day = 3,000-30,000/month
  Status: ✅ Safe during free tier
  Strategy: After 1 year, consider Lambda Function URLs (free)

CloudFront:
  Data Transfer: 1 TB out
  Requests: 10,000,000 HTTP/HTTPS
  After: $0.085 per GB + $0.0075 per 10,000 requests
  Your Usage: Don't use during development
  Status: ⚠️ Use only for production launch
```

**Services to AVOID (Cost Traps):**
```yaml
❌ NAT Gateway:
  Cost: $0.045/hour = $32.40/month + data transfer
  Why avoid: Expensive for learning
  Alternative: Lambda functions don't need NAT (direct internet)

❌ Application Load Balancer:
  Cost: $0.0225/hour = $16.20/month + LCU charges
  Why avoid: Unnecessary for serverless
  Alternative: API Gateway (free tier) or Lambda Function URLs

❌ RDS:
  Free tier: 750 hours/month for 12 months (db.t2.micro)
  After: Minimum $15-20/month
  Why avoid: Not needed, use DynamoDB
  Alternative: DynamoDB (always free up to limits)

❌ ECS/EKS:
  ECS: $0.10/hour per running task
  EKS: $0.10/hour for control plane = $73/month
  Why avoid: Overkill for learning serverless
  Alternative: Lambda functions

❌ ElastiCache:
  Free tier: None
  Cost: Minimum $13/month
  Why avoid: Not needed for MVP
  Alternative: In-memory caching in Lambda

❌ Elasticsearch:
  Free tier: None
  Cost: Minimum $23/month
  Why avoid: Expensive
  Alternative: DynamoDB queries + GSIs
```

### 2.2 Cost Monitoring Setup (Critical!)

**Step 1: Set Up Billing Alerts (Day 1 Task)**
```
AWS Console → Billing Dashboard → Billing Preferences
├── ✅ Receive PDF Invoice By Email
├── ✅ Receive Free Tier Usage Alerts (your email)
├── ✅ Receive Billing Alerts
└── Save preferences

AWS Console → CloudWatch → Alarms → Billing
├── Create Alarm: Estimated Charges > $5
├── Create Alarm: Estimated Charges > $10
├── Create Alarm: Estimated Charges > $20
└── SNS Topic: Email notification to yourself
```

**Step 2: Daily Cost Check Routine**
```
Every Morning (5 minutes):
├── AWS Console → Billing Dashboard
├── Check "Month-to-Date Spend"
├── Review "Free Tier Usage" (shows % consumed)
└── If over $5: Investigate "Cost Explorer"

Expected Daily Costs During Development:
├── Days 1-30: $0.00 - $0.50/day (within free tier)
├── Days 31-60: $0.50 - $1.00/day (learning curve)
├── Days 61-90: $0.20 - $0.50/day (optimized)
└── Goal: Stay under $10/month
```

**Step 3: AWS Cost Explorer Tags**
```
Tag all resources for tracking:
├── Environment: dev
├── Project: milk-delivery
├── Owner: your-name
└── Cost-Center: learning

Example in SAM template:
Tags:
  Environment: dev
  Project: milk-delivery
  Owner: solo-developer
```

### 2.3 Free Tier Budget Calculator

**Your Estimated Monthly Usage:**
```yaml
Service            | Free Tier    | Your Usage  | Cost Impact
-------------------|--------------|-------------|-------------
Lambda             | 1M requests  | 10,000      | $0.00
DynamoDB           | 25 WCU/RCU   | 1,000 ops   | $0.00
API Gateway        | 1M requests  | 10,000      | $0.00 (Year 1)
S3                 | 5 GB         | 100 MB      | $0.00
CloudWatch Logs    | 5 GB         | 500 MB      | $0.00
SES                | 62,000 emails| 50 emails   | $0.00
Cognito            | 50k MAU      | 5 users     | $0.00
Step Functions     | 4,000 states | 100 states  | $0.00
-------------------|--------------|-------------|-------------
TOTAL                                           | $0.00-$2.00

Potential Charges:
- API Gateway (after Year 1): ~$0.04/month
- Data Transfer Out: ~$0.50/month (minimal testing)
- CloudWatch (if over 5GB logs): ~$1.00/month

Expected Total: $0-5/month during development
```

---

## 3. DEVELOPMENT ENVIRONMENT SETUP

### 3.1 Machine Requirements

**Minimum Specifications:**
```yaml
Operating System: Windows 10/11, macOS, or Linux
Processor: Intel i3 or equivalent (dual-core)
RAM: 8 GB minimum, 16 GB recommended
Storage: 20 GB free space (for Node.js, Docker, projects)
Internet: Stable connection (AWS API calls)
```

**Recommended Setup:**
```yaml
OS: Windows 11 or macOS
RAM: 16 GB (Docker + VS Code + Browser = memory hungry)
Storage: SSD with 50 GB free (faster builds)
Internet: 10 Mbps+ (for video tutorials, AWS console)
```

### 3.2 Software Installation (Step-by-Step)

**Step 1: Install Node.js**
```
What: JavaScript runtime for Lambda development
Why: Lambda supports Node.js 20.x runtime
Where: https://nodejs.org/en/download

Installation:
├── Download Node.js 20.x LTS installer
├── Run installer (default options are fine)
├── Verify installation:
│   ├── Open terminal/command prompt
│   ├── Type: node --version (should show v20.x.x)
│   └── Type: npm --version (should show v10.x.x)
└── Done!

Post-Install Configuration:
├── Set npm global directory (avoid permission issues)
│   └── npm config set prefix ~/.npm-global (Mac/Linux)
│       or C:\Users\YourName\AppData\Roaming\npm (Windows)
└── Update npm: npm install -g npm@latest
```

**Step 2: Install AWS CLI**
```
What: Command-line tool to interact with AWS services
Why: Deploy resources, check logs, manage services
Where: https://aws.amazon.com/cli/

Windows:
├── Download MSI installer
├── Run installer
└── Verify: aws --version

macOS:
├── Option 1: Homebrew
│   └── brew install awscli
├── Option 2: Official installer
│   └── Download .pkg file
└── Verify: aws --version

Linux:
├── curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
├── unzip awscliv2.zip
├── sudo ./aws/install
└── Verify: aws --version

Configuration:
├── Run: aws configure
├── AWS Access Key ID: [Get from IAM console]
├── AWS Secret Access Key: [Get from IAM console]
├── Default region name: us-east-1
└── Default output format: json
```

**Step 3: Install AWS SAM CLI**
```
What: Framework for building serverless applications
Why: Local testing, easy deployment, IaC with templates
Where: https://aws.amazon.com/serverless/sam/

Windows:
├── Download MSI installer
├── Run installer (requires admin rights)
└── Verify: sam --version

macOS:
├── Homebrew: brew install aws-sam-cli
└── Verify: sam --version

Linux:
├── Download ZIP file
├── Unzip and install
└── Verify: sam --version

SAM Prerequisites:
├── Docker Desktop (for sam local commands)
│   └── Download from: https://www.docker.com/products/docker-desktop
└── Python 3.8+ (usually pre-installed on Mac/Linux)
```

**Step 4: Install Visual Studio Code**
```
What: Code editor with excellent AWS support
Why: Best IDE for serverless development
Where: https://code.visualstudio.com/

Installation:
├── Download installer for your OS
├── Run installer
├── Launch VS Code
└── Done!

Essential Extensions (Install via Extensions panel):
├── AWS Toolkit (amazonwebservices.aws-toolkit-vscode)
│   └── Integrates AWS services into VS Code
├── ESLint (dbaeumer.vscode-eslint)
│   └── JavaScript/TypeScript linting
├── Prettier (esbenp.prettier-vscode)
│   └── Code formatting
├── Thunder Client (rangav.vscode-thunder-client)
│   └── API testing (like Postman, but in VS Code)
├── GitLens (eamodio.gitlens)
│   └── Git history and blame annotations
├── Docker (ms-azuretools.vscode-docker)
│   └── Manage Docker containers
└── REST Client (humao.rest-client)
    └── Test HTTP requests from .http files
```

**Step 5: Install Git**
```
What: Version control system
Why: Code versioning, GitHub integration
Where: https://git-scm.com/downloads

Installation:
├── Download installer
├── Run with default options
└── Verify: git --version

Configuration:
├── git config --global user.name "Your Name"
├── git config --global user.email "your.email@example.com"
└── git config --global init.defaultBranch main
```

**Step 6: Optional but Recommended Tools**
```
Docker Desktop:
├── Required for: sam local invoke, sam local start-api
├── Download: https://www.docker.com/products/docker-desktop
└── Purpose: Run Lambda functions locally in containers

Postman (Alternative to Thunder Client):
├── Download: https://www.postman.com/downloads/
└── Purpose: API testing with collections

DynamoDB Local (Optional):
├── Download: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
└── Purpose: Test DynamoDB operations without AWS connection
```

### 3.3 AWS Account Setup

**Step 1: Create AWS Account**
```
Go to: https://aws.amazon.com/free

Sign Up Process:
├── 1. Email and password
├── 2. Account type: Personal
├── 3. Contact information
├── 4. Payment information (required, but won't charge if stay in free tier)
├── 5. Identity verification (phone call)
└── 6. Select Support Plan: Basic (Free)

⚠️ Important:
- Use a credit/debit card with at least $1 for verification
- Set up billing alerts immediately
- Enable MFA (Multi-Factor Authentication) for root account
```

**Step 2: Secure Root Account**
```
After Sign-up:
├── 1. Go to IAM → Dashboard
├── 2. Enable MFA for root account
│   ├── Use Google Authenticator, Authy, or hardware token
│   └── NEVER share MFA codes
├── 3. Create IAM user for daily use (don't use root)
└── 4. Delete root access keys if created
```

**Step 3: Create IAM User (For Development)**
```
IAM → Users → Add User

User Details:
├── Username: milk-delivery-dev
├── Access type: ✅ Programmatic access (for AWS CLI)
│              ✅ AWS Management Console access (for console)
└── Console password: Auto-generated or custom

Permissions:
├── Attach existing policies directly:
│   ├── ✅ AdministratorAccess (for learning only)
│   │   └── ⚠️ In production, use least-privilege policies
│   └── Or create custom policy (see below)
└── Tags:
    ├── Environment: dev
    └── Purpose: learning

Download Credentials:
├── Save Access Key ID
├── Save Secret Access Key
└── Store securely (password manager recommended)

Configure AWS CLI:
├── aws configure --profile milk-delivery-dev
├── Enter Access Key ID
├── Enter Secret Access Key
├── Region: us-east-1
└── Output: json
```

**Custom IAM Policy (Least Privilege for Learning):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "dynamodb:*",
        "apigateway:*",
        "s3:*",
        "cloudformation:*",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "logs:*",
        "events:*",
        "sns:*",
        "ses:*",
        "cognito-idp:*",
        "states:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3.4 VS Code Configuration

**Workspace Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true,
  "files.autoSave": "onFocusChange",
  "typescript.preferences.importModuleSpecifier": "relative",
  "aws.samcli.location": "/usr/local/bin/sam",
  "aws.profile": "milk-delivery-dev",
  "aws.region": "us-east-1",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

**Launch Configuration (.vscode/launch.json):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Lambda (SAM)",
      "type": "node",
      "request": "attach",
      "address": "localhost",
      "port": 5858,
      "localRoot": "${workspaceFolder}/backend/src",
      "remoteRoot": "/var/task",
      "protocol": "inspector",
      "stopOnEntry": false
    }
  ]
}
```

---

## 4. HYBRID DEVELOPMENT: CONSOLE + VS CODE

### 4.1 Philosophy: When to Use What

**AWS Console is BEST for:**
```
✅ Visual Learning & Exploration
   ├── Understanding service dashboards
   ├── Exploring service features and options
   ├── Reading integrated documentation
   └── Seeing visual representations (Step Functions graphs)

✅ One-Time Setup Tasks
   ├── Creating Cognito User Pool (complex configuration)
   ├── Setting up billing alerts
   ├── Creating IAM roles and policies (first time)
   ├── Configuring CloudWatch dashboards
   └── Setting up SNS/SES email verification

✅ Quick Testing & Debugging
   ├── Testing Lambda with sample events
   ├── Viewing DynamoDB table data
   ├── Checking CloudWatch logs in real-time
   ├── Testing API Gateway endpoints manually
   └── Viewing Step Functions execution history

✅ Monitoring & Operations
   ├── CloudWatch Logs Insights queries
   ├── Viewing metrics and graphs
   ├── Checking service quotas and limits
   ├── Cost analysis and billing reports
   └── Resource utilization dashboards
```

**VS Code is BEST for:**
```
✅ All Code Development
   ├── Writing Lambda functions
   ├── TypeScript/JavaScript development
   ├── Creating unit tests
   ├── Shared utilities and libraries
   └── Frontend React components

✅ Infrastructure as Code (IaC)
   ├── SAM templates (template.yaml)
   ├── CloudFormation templates
   ├── Environment configuration files
   └── Deployment scripts

✅ Version Control
   ├── Git commits and branching
   ├── Code reviews (self-review before commit)
   ├── Merge conflict resolution
   └── GitHub integration

✅ Local Development & Testing
   ├── sam local invoke (test Lambda locally)
   ├── sam local start-api (local API Gateway)
   ├── Unit tests with Jest
   ├── Integration tests
   └── Debugging with breakpoints

✅ Batch Operations
   ├── Creating multiple Lambda functions
   ├── Updating multiple files at once
   ├── Search and replace across project
   └── Refactoring code
```

### 4.2 Hybrid Workflow Patterns

**Pattern 1: Learning a New Service**
```
Example: Setting up DynamoDB for the first time

Step 1: AWS Console (30 minutes)
├── Navigate to DynamoDB service
├── Click "Create table"
├── Experiment with different settings:
│   ├── Partition key vs. Sort key
│   ├── Provisioned vs. On-demand
│   ├── Global Secondary Indexes (GSI)
│   └── Stream settings
├── Create a test table manually
├── Add sample items via console
├── Try different queries in console
└── Learn query vs. scan difference

Step 2: VS Code (30 minutes)
├── Create SAM template with DynamoDB resource
├── Define table schema in YAML
├── Add GSI definitions
├── Write Lambda function to interact with table
└── Test locally with DynamoDB Local or deployed table

Step 3: AWS Console (15 minutes)
├── Deploy via SAM from VS Code terminal
├── Verify table creation in console
├── Check table metrics
└── Validate data structure

Result: You understand DynamoDB AND have IaC code
```

**Pattern 2: Developing a New Lambda Function**
```
Example: Creating "createOrder" Lambda

Step 1: Console Prototype (15 minutes)
├── AWS Console → Lambda → Create function
├── Name: createOrderPrototype
├── Runtime: Node.js 20.x
├── Write basic handler code inline
├── Create test event with sample JSON:
│   {
│     "userId": "user-123",
│     "items": [{"productId": "prod-1", "quantity": 2}]
│   }
├── Test and see output
├── Fix any immediate errors
└── Verify basic logic works

Step 2: VS Code Development (2 hours)
├── Create file: backend/src/lambdas/order/createOrder.ts
├── Copy working logic from console
├── Add TypeScript types and interfaces
├── Implement proper error handling
├── Add input validation
├── Add logging
├── Add to SAM template
├── Write unit tests
└── Test locally: sam local invoke

Step 3: Console Debugging (20 minutes)
├── Deploy from VS Code: sam deploy
├── Go to AWS Console → Lambda → createOrder
├── Test with real event
├── Check CloudWatch logs
├── Identify any AWS-specific issues
└── Note execution time and memory usage

Step 4: VS Code Refinement (30 minutes)
├── Fix issues found in console testing
├── Optimize memory settings in SAM template
├── Adjust timeout if needed
├── Update documentation
└── Redeploy: sam deploy

Result: Production-ready Lambda with IaC
```

**Pattern 3: API Gateway Setup**
```
Example: Creating REST API with multiple endpoints

Step 1: Console Exploration (30 minutes)
├── AWS Console → API Gateway
├── Create REST API (not HTTP API)
├── Manually create one resource: /users
├── Add POST method
├── Link to Lambda function (console UI)
├── Configure CORS manually
├── Deploy to "dev" stage
├── Test with API Gateway test feature
└── Understand request/response transformation

Step 2: VS Code IaC (1 hour)
├── Add API Gateway to SAM template
├── Define all resources and methods in YAML
├── Configure Cognito authorizer
├── Set up request validators
├── Configure CORS in template
├── Add multiple endpoints
└── Deploy entire API: sam deploy

Step 3: Console Validation (15 minutes)
├── Check deployed API in console
├── Verify all endpoints exist
├── Test each endpoint
├── Check authorization works
└── Review API Gateway logs

Result: Complete API defined in code, easy to replicate
```

### 4.3 AWS Toolkit Extension (The Bridge)

**Installation & Setup:**
```
Step 1: Install Extension
├── Open VS Code
├── Go to Extensions (Ctrl+Shift+X)
├── Search: "AWS Toolkit"
├── Install "AWS Toolkit" by Amazon Web Services
└── Restart VS Code

Step 2: Connect to AWS
├── Click AWS icon in left sidebar
├── Click "Connect to AWS"
├── Select profile: milk-delivery-dev
└── Region: us-east-1

Step 3: Verify Connection
├── Expand "Lambda" in sidebar
├── You should see all deployed functions
├── Expand "DynamoDB"
├── You should see all tables
└── Success!
```

**Key Features You'll Use Daily:**

**1. Lambda Functions**
```
What you can do from VS Code:
├── View all deployed Lambda functions
├── Invoke function remotely (without console)
│   ├── Right-click function
│   ├── Select "Invoke on AWS"
│   ├── Choose test event
│   └── See results in VS Code
├── Download function code
│   ├── Right-click function
│   ├── Select "Download Lambda"
│   └── Code appears in VS Code
└── View CloudWatch logs
    ├── Right-click function
    ├── Select "View CloudWatch Logs"
    └── Logs stream in VS Code terminal

Example Workflow:
├── Deploy function from VS Code terminal: sam deploy
├── Test directly from VS Code using AWS Toolkit
├── View logs without switching to browser
└── Make changes and redeploy, all in one place
```

**2. DynamoDB Tables**
```
What you can do from VS Code:
├── Browse table data
│   ├── Expand DynamoDB in AWS Toolkit
│   ├── Right-click table
│   ├── Select "View Table"
│   └── See items in VS Code panel
├── Run queries
│   ├── Click "Query" button
│   ├── Enter partition key value
│   ├── Execute
│   └── Results appear in VS Code
├── Download items as JSON
│   ├── Right-click items
│   ├── Select "Download items"
│   └── Save to file
└── Insert test data
    ├── Right-click table
    ├── Select "Insert Item"
    └── Paste JSON

Example Workflow:
├── Check if user exists in database
├── Query directly from VS Code
├── No need to open AWS Console
└── Copy user data for test event
```

**3. CloudWatch Logs**
```
What you can do from VS Code:
├── View log groups
├── Stream logs in real-time
│   ├── Right-click Lambda function
│   ├── Select "View CloudWatch Logs"
│   ├── Logs appear in VS Code terminal
│   └── Auto-refreshes with new logs
├── Search logs
│   ├── Use Ctrl+F in log panel
│   └── Filter by text
└── Download logs for analysis

Example Workflow:
├── Deploy Lambda function
├── Invoke from VS Code
├── Instantly see logs in VS Code
├── Debug without opening console
└── Faster iteration cycle
```

**4. S3 Buckets**
```
What you can do from VS Code:
├── Browse bucket contents
├── Upload files
│   ├── Right-click bucket
│   ├── Select "Upload File"
│   └── Choose file from system
├── Download files
│   ├── Right-click file
│   ├── Select "Download"
│   └── Save to local folder
└── Delete files

Example Workflow:
├── Upload product images
├── Get S3 URL for DynamoDB
├── All without leaving VS Code
```

**5. Step Functions**
```
What you can do from VS Code:
├── View state machines
├── Start execution
│   ├── Right-click state machine
│   ├── Select "Start Execution"
│   ├── Provide input JSON
│   └── Execution starts
├── View execution history
└── Download execution results

Example Workflow:
├── Test order processing workflow
├── Start execution from VS Code
├── Check status in toolkit
├── View results inline
```

### 4.4 Detailed Workflow Examples

**Example 1: Building User Registration (Complete Flow)**

**Day 1 Morning: Console Exploration (1 hour)**
```
Task: Understand what you need to build

1. Research Phase (AWS Console)
   ├── Navigate to Cognito
   ├── Read "What is Amazon Cognito?"
   ├── Create a test User Pool
   │   ├── Pool name: milk-delivery-users-test
   │   ├── Standard attributes: email, name, phone
   │   ├── Password policy: default
   │   ├── MFA: Optional (for learning)
   │   └── Create pool
   ├── Create test user manually
   │   ├── Username: testuser@example.com
   │   ├── Temporary password: Test@1234
   │   └── Verify user can login
   └── Test user login in Cognito UI
   
2. DynamoDB Exploration (AWS Console)
   ├── Navigate to DynamoDB
   ├── Create table: Users
   │   ├── Partition key: userId (String)
   │   ├── Billing mode: On-demand
   │   └── Create table
   ├── Add sample user item manually:
   │   {
   │     "userId": "user-001",
   │     "email": "test@example.com",
   │     "name": "Test User",
   │     "phone": "+1234567890",
   │     "role": "Customer",
   │     "createdAt": "2025-10-09T10:00:00Z"
   │   }
   └── Verify item appears in table

3. Lambda Exploration (AWS Console)
   ├── Navigate to Lambda
   ├── Create function: createUserTest
   ├── Write minimal code inline:
   │   exports.handler = async (event) => {
   │     console.log('Received event:', event);
   │     return {
   │       statusCode: 200,
   │       body: JSON.stringify({ message: 'User created' })
   │     };
   │   };
   ├── Test with sample event:
   │   {
   │     "body": "{\"email\":\"new@example.com\",\"name\":\"New User\"}"
   │   }
   └── Verify it returns 200 OK

Learning Outcome:
├── Understand Cognito concepts
├── See DynamoDB table structure
├── Know Lambda basic structure
└── Ready to code properly in VS Code
```

**Day 1 Afternoon: VS Code Development (2-3 hours)**
```
Task: Build production-ready createUser Lambda

1. Project Setup (VS Code Terminal)
   $ cd ~/projects
   $ mkdir milk-delivery-platform
   $ cd milk-delivery-platform
   $ sam init
   ├── Choose: 1 - AWS Quick Start Templates
   ├── Choose: 1 - Hello World Example
   ├── Runtime: nodejs20.x
   ├── Name: milk-delivery
   └── Project created!

2. Project Structure Organization
   milk-delivery-platform/
   ├── backend/
   │   ├── src/
   │   │   ├── lambdas/
   │   │   │   └── user/
   │   │   │       ├── createUser.ts
   │   │   │       ├── getUser.ts
   │   │   │       └── types.ts
   │   │   └── shared/
   │   │       ├── db.ts
   │   │       ├── validation.ts
   │   │       └── logger.ts
   │   ├── template.yaml
   │   ├── package.json
   │   └── tsconfig.json
   └── docs/
       └── api/
           └── user-api.md

3. Install Dependencies
   $ cd backend
   $ npm init -y
   $ npm install --save @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   $ npm install --save-dev @types/node @types/aws-lambda typescript

4. Create TypeScript Configuration (tsconfig.json)
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "lib": ["ES2020"],
       "outDir": "./dist",
       "rootDir": "./src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }

5. Create Lambda Function (Skeleton)
   File: src/lambdas/user/createUser.ts
   
   // Define interfaces
   interface CreateUserRequest {
     email: string;
     name: string;
     phone: string;
     password: string;
   }
   
   interface CreateUserResponse {
     userId: string;
     email: string;
     message: string;
   }
   
   // TODO: Implement handler
   // TODO: Add validation
   // TODO: Add DynamoDB operations
   // TODO: Add error handling

6. Create SAM Template (template.yaml)
   AWSTemplateFormatVersion: '2010-09-09'
   Transform: AWS::Serverless-2016-10-31
   
   Globals:
     Function:
       Timeout: 10
       Runtime: nodejs20.x
       Environment:
         Variables:
           USERS_TABLE: !Ref UsersTable
   
   Resources:
     CreateUserFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/user/createUser.handler
         Policies:
           - DynamoDBCrudPolicy:
               TableName: !Ref UsersTable
     
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
           - IndexName: email-index
             KeySchema:
               - AttributeName: email
                 KeyType: HASH
             Projection:
               ProjectionType: ALL

7. Build & Test Locally
   $ npm run build
   $ sam build
   $ sam local invoke CreateUserFunction --event events/create-user.json
   
   events/create-user.json:
   {
     "body": "{\"email\":\"test@example.com\",\"name\":\"Test User\",\"phone\":\"+1234567890\",\"password\":\"Test@123\"}"
   }

Learning Outcome:
├── Project structure established
├── SAM template basics understood
├── Local testing working
└── Ready for implementation
```

**Day 2: Implementation & Deployment**
```
Task: Complete Lambda implementation and deploy

1. Implement Full Lambda Function (VS Code)
   File: src/lambdas/user/createUser.ts
   
   [Full TypeScript implementation with:]
   ├── Input validation (email format, password strength)
   ├── Check if email already exists (GSI query)
   ├── Generate userId (UUID)
   ├── Hash password (if not using Cognito)
   ├── Save to DynamoDB
   ├── Error handling (try-catch with proper status codes)
   └── Logging (console.log with context)

2. Create Shared Utilities (VS Code)
   File: src/shared/validation.ts
   ├── validateEmail(email: string): boolean
   ├── validatePhone(phone: string): boolean
   └── validatePassword(password: string): string | null
   
   File: src/shared/db.ts
   ├── DynamoDB client initialization
   ├── Helper functions for common operations
   └── Error handling wrappers

3. Write Unit Tests (VS Code)
   File: tests/unit/createUser.test.ts
   
   Test cases:
   ├── Should create user with valid input
   ├── Should reject invalid email
   ├── Should reject weak password
   ├── Should reject duplicate email
   └── Should handle DynamoDB errors
   
   $ npm test

4. Deploy to AWS (VS Code Terminal)
   $ sam build
   $ sam deploy --guided
   
   Prompts:
   ├── Stack name: milk-delivery-dev
   ├── Region: us-east-1
   ├── Confirm changes: Y
   ├── Allow SAM CLI IAM role creation: Y
   ├── Save arguments to config file: Y
   └── Deployment starts...
   
   Wait for: Successfully created/updated stack

5. Verify Deployment (AWS Console)
   ├── Lambda → Functions → createUserFunction
   │   ├── Check function exists
   │   ├── Check environment variables
   │   └── Check permissions
   ├── DynamoDB → Tables → milk-delivery-users
   │   ├── Check table exists
   │   ├── Check GSI: email-index
   │   └── Check capacity mode: On-demand
   └── CloudFormation → Stacks → milk-delivery-dev
       ├── Check stack status: CREATE_COMPLETE
       └── Review all resources created

6. Test Deployed Function (Console + VS Code)
   
   Option A: AWS Console
   ├── Lambda → createUserFunction → Test tab
   ├── Create test event: create-user-test
   ├── Execute test
   ├── Check response: 201 Created
   └── CloudWatch logs: Check execution logs
   
   Option B: VS Code (AWS Toolkit)
   ├── AWS Toolkit → Lambda → createUserFunction
   ├── Right-click → Invoke on AWS
   ├── Select test event
   ├── View results in VS Code
   └── Check logs in VS Code

7. Verify Data in DynamoDB (Console)
   ├── DynamoDB → Tables → milk-delivery-users
   ├── Items tab
   ├── Should see new user item
   └── Verify all fields are correct

Learning Outcome:
├── Full Lambda function deployed
├── Infrastructure as Code working
├── Understand deployment process
└── Can iterate quickly
```

---

## 5. FEATURE DEVELOPMENT FLOW (STEP-BY-STEP)

### 5.1 Complete Feature: Order Creation System

**Overview:**
```
Feature: Create Order
Complexity: High (multiple services involved)
Duration: 4-5 days
Services Used:
├── Lambda (createOrder, validateInventory)
├── DynamoDB (Orders, Products, Inventory tables)
├── Step Functions (Order processing workflow)
├── API Gateway (POST /orders endpoint)
├── SNS (Order notifications)
└── EventBridge (Order events)

Learning Goals:
├── Multi-table DynamoDB operations
├── Error handling and rollback strategies
├── Async workflows with Step Functions
├── Event-driven architecture
└── Transaction management
```

**Day 1: Planning & Design**

```
Morning Session (2 hours)

1. Requirement Analysis (docs/features/create-order.md)
   
   User Story:
   "As a customer, I want to create an order with multiple products
   from different vendors, so that I can get my dairy products delivered."
   
   Acceptance Criteria:
   ├── User must be authenticated
   ├── User must have complete profile (delivery address)
   ├── Order must have at least 1 item
   ├── All products must be in stock
   ├── Order total must be ≥ minimum order value (₹100)
   ├── Delivery date must be: today+1 to today+7
   ├── System must reserve inventory immediately
   ├── User receives order confirmation
   └── Vendors receive order notifications

2. Data Model Design
   
   Orders Table Schema:
   {
     "orderId": "uuid",
     "userId": "uuid",
     "items": [
       {
         "productId": "uuid",
         "vendorId": "uuid",
         "productName": "string",
         "quantity": number,
         "unitPrice": number,
         "totalPrice": number
       }
     ],
     "subtotal": number,
     "tax": number,
     "deliveryCharge": number,
     "discount": number,
     "totalAmount": number,
     "status": "Pending|Confirmed|Processing|Delivered|Cancelled",
     "deliveryDate": "ISO date",
     "deliveryAddress": {
       "line1": "string",
       "city": "string",
       "zipCode": "string"
     },
     "createdAt": "ISO timestamp",
     "updatedAt": "ISO timestamp"
   }

3. API Contract Design
   
   Request:
   POST /orders
   Headers:
     Authorization: Bearer <JWT_TOKEN>
     Content-Type: application/json
   
   Body:
   {
     "items": [
       {
         "productId": "prod-123",
         "vendorId": "vendor-456",
         "quantity": 2
       },
       {
         "productId": "prod-789",
         "vendorId": "vendor-456",
         "quantity": 1
       }
     ],
     "deliveryDate": "2025-10-15",
     "addressId": "addr-001"
   }
   
   Success Response (201 Created):
   {
     "orderId": "order-abc123",
     "userId": "user-xyz",
     "items": [...],
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 30,
     "totalAmount": 502.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-15T08:00:00Z",
     "message": "Order created successfully"
   }
   
   Error Responses:
   400 Bad Request:
   {
     "error": "ValidationError",
     "message": "Delivery date must be between tomorrow and 7 days from now",
     "field": "deliveryDate"
   }
   
   400 Bad Request:
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 1L' has only 5 units available",
     "availableQuantity": 5,
     "requestedQuantity": 10
   }
   
   400 Bad Request:
   {
     "error": "MinimumOrderValue",
     "message": "Order total must be at least ₹100",
     "currentTotal": 75,
     "minimumRequired": 100
   }
   
   401 Unauthorized:
   {
     "error": "Unauthorized",
     "message": "Invalid or expired token"
   }
   
   404 Not Found:
   {
     "error": "UserNotFound",
     "message": "User profile not found"
   }
   
   409 Conflict:
   {
     "error": "ProfileIncomplete",
     "message": "Please complete your profile before placing an order",
     "missingFields": ["deliveryAddress", "phone"]
   }

4. Workflow Design (Step Functions State Machine)
   
   Order Processing Workflow:
   Start
   ├── ValidateInput (Lambda)
   │   ├── Success → ValidateUser
   │   └── Fail → Return 400 Error
   ├── ValidateUser (Lambda)
   │   ├── Success → CheckInventory
   │   └── Fail → Return 404/409 Error
   ├── CheckInventory (Lambda)
   │   ├── AllAvailable → ReserveInventory
   │   └── Insufficient → Return 400 Error
   ├── ReserveInventory (Lambda)
   │   ├── Success → CalculatePricing
   │   └── Fail → Rollback
   ├── CalculatePricing (Lambda)
   │   ├── Success → CreateOrderRecord
   │   └── Fail → ReleaseInventory → Error
   ├── CreateOrderRecord (Lambda)
   │   ├── Success → NotifyUser
   │   └── Fail → ReleaseInventory → Error
   ├── NotifyUser (SNS)
   │   └── Send confirmation email
   ├── NotifyVendors (SNS)
   │   └── Send order details to each vendor
   └── End (Success)

5. Error Handling Strategy
   
   Scenario 1: Inventory Check Fails
   ├── Don't create order
   ├── Return 400 with specific product details
   └── No rollback needed (no state changed)
   
   Scenario 2: Inventory Reserved, but DynamoDB Fails
   ├── Critical: Inventory locked but order not created
   ├── Solution: Use DynamoDB transaction
   │   └── Atomic operation: Reserve inventory + Create order
   └── If transaction fails, nothing is committed
   
   Scenario 3: Order Created, but Notification Fails
   ├── Order exists, but user not notified
   ├── Solution: Make notification async (Step Functions)
   ├── Retry notification 3 times
   └── Use DLQ (Dead Letter Queue) for failures
   
   Scenario 4: Partial Vendor Availability
   ├── Some items available, some not
   ├── Option A: Reject entire order
   ├── Option B: Partial fulfillment (advanced)
   └── For MVP: Choose Option A (simpler)

Afternoon Session (1.5 hours)

6. Create Project Structure (VS Code)
   backend/
   ├── src/
   │   ├── lambdas/
   │   │   └── order/
   │   │       ├── createOrder.ts
   │   │       ├── validateInventory.ts
   │   │       ├── reserveInventory.ts
   │   │       ├── calculatePricing.ts
   │   │       └── types.ts
   │   ├── stepFunctions/
   │   │   └── orderProcessing.asl.json
   │   └── shared/
   │       ├── constants.ts
   │       └── pricing.ts
   └── tests/
       └── order/
           ├── createOrder.test.ts
           └── validateInventory.test.ts

7. Define Types (VS Code)
   File: src/lambdas/order/types.ts
   
   export interface OrderItem {
     productId: string;
     vendorId: string;
     quantity: number;
     unitPrice?: number;  // Calculated
     totalPrice?: number; // Calculated
   }
   
   export interface CreateOrderRequest {
     items: OrderItem[];
     deliveryDate: string;
     addressId: string;
   }
   
   export interface CreateOrderResponse {
     orderId: string;
     userId: string;
     items: OrderItem[];
     subtotal: number;
     tax: number;
     deliveryCharge: number;
     totalAmount: number;
     status: OrderStatus;
     estimatedDelivery: string;
     message: string;
   }
   
   export type OrderStatus = 
     | 'Pending'
     | 'Confirmed'
     | 'Processing'
     | 'OutForDelivery'
     | 'Delivered'
     | 'Cancelled'
     | 'Failed';
   
   export interface ValidationError {
     field: string;
     message: string;
     code: string;
   }

8. Create Test Events (VS Code)
   File: events/create-order-valid.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2},{\"productId\":\"prod-yogurt-200g\",\"vendorId\":\"vendor-001\",\"quantity\":3}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}",
     "headers": {
       "Authorization": "Bearer eyJhbGc...",
       "Content-Type": "application/json"
     },
     "requestContext": {
       "authorizer": {
         "claims": {
           "sub": "user-123"
         }
       }
     }
   }
   
   File: events/create-order-invalid-date.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2}],\"deliveryDate\":\"2025-10-01\",\"addressId\":\"addr-home\"}"
   }
   
   File: events/create-order-insufficient-stock.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":1000}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}"
   }

Learning Outcome:
├── Complete understanding of requirements
├── API contract defined
├── Error scenarios identified
├── Project structure ready
└── Ready to code
```

**Day 2: Core Implementation**

```
Morning Session (2.5 hours)

1. Implement Validation Logic
   File: src/lambdas/order/createOrder.ts
   
   Function: validateInput()
   ├── Check items array not empty
   ├── Check each item has required fields
   ├── Check quantities are positive integers
   ├── Check deliveryDate format (ISO 8601)
   ├── Check deliveryDate is in valid range
   └── Return ValidationError[] if any issues
   
   Function: validateUser()
   ├── Extract userId from JWT (event.requestContext.authorizer.claims.sub)
   ├── Query Users table
   ├── Check user exists
   ├── Check profile is complete
   │   ├── Has delivery address matching addressId
   │   ├── Has phone number
   │   └── Has email
   └── Return user object or error
   
   Function: validateDeliveryDate()
   ├── Parse date string
   ├── Check format is valid
   ├── Check date is not in past
   ├── Check date is not today (need 1 day preparation)
   ├── Check date is within 7 days
   └── Return boolean + error message

2. Implement Inventory Validation
   File: src/lambdas/order/validateInventory.ts
   
   Function: checkInventory()
   Input:
   {
     "items": [
       {"productId": "prod-1", "vendorId": "vendor-1", "quantity": 2}
     ]
   }
   
   Process:
   ├── Group items by vendorId
   ├── For each vendor:
   │   ├── BatchGetItem from Inventory table
   │   │   └── Keys: [{vendorId, productId}, ...]
   │   ├── For each product:
   │   │   ├── Get available = stock - reserved
   │   │   ├── Check available >= requested quantity
   │   │   └── If not: add to unavailableItems[]
   │   └── Continue
   └── Return {valid: boolean, unavailableItems: []}
   
   Output (Success):
   {
     "valid": true,
     "unavailableItems": []
   }
   
   Output (Failure):
   {
     "valid": false,
     "unavailableItems": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "requestedQty": 10,
         "availableQty": 5
       }
     ]
   }

3. Implement Pricing Calculation
   File: src/shared/pricing.ts
   
   Function: calculateOrderTotal()
   Input:
   {
     "items": [
       {
         "productId": "prod-1",
         "quantity": 2,
         "unitPrice": 50
       }
     ],
     "deliveryAddress": {
       "city": "Vadodara",
       "zipCode": "390001"
     }
   }
   
   Calculation Logic:
   ├── subtotal = sum(item.unitPrice * item.quantity)
   ├── tax = subtotal * TAX_RATE (5% GST)
   ├── deliveryCharge = calculateDeliveryCharge()
   │   ├── If subtotal >= 500: ₹0 (free delivery)
   │   ├── Else if subtotal >= 300: ₹20
   │   ├── Else: ₹40
   │   └── Add ₹10 per additional vendor (multi-vendor orders)
   ├── discount = calculateDiscount()
   │   ├── If first order: 10% off (max ₹50)
   │   ├── If loyalty points: redeem at 1 point = ₹1
   │   └── else: 0
   └── totalAmount = subtotal + tax + deliveryCharge - discount
   
   Output:
   {
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 20,
     "discount": 0,
     "totalAmount": 492.5,
     "breakdown": {
       "itemsTotal": 450,
       "taxBreakdown": {
         "cgst": 11.25,
         "sgst": 11.25
       },
       "deliveryDetails": {
         "baseCharge": 20,
         "multiVendorSurcharge": 0
       }
     }
   }

Afternoon Session (1.5 hours)

4. Implement Main Handler
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent)
   
   Flow:
   Step 1: Parse input
   ├── const body = JSON.parse(event.body || '{}');
   ├── const userId = event.requestContext.authorizer.claims.sub;
   └── Log input for debugging
   
   Step 2: Validate input
   ├── const validationErrors = validateInput(body);
   ├── if (validationErrors.length > 0):
   │   └── return 400 with errors
   └── Continue
   
   Step 3: Validate user
   ├── const user = await validateUser(userId);
   ├── if (!user):
   │   └── return 404 User Not Found
   ├── if (!user.isProfileComplete):
   │   └── return 409 Profile Incomplete
   └── Continue
   
   Step 4: Get delivery address
   ├── const address = user.addresses.find(a => a.addressId === body.addressId);
   ├── if (!address):
   │   └── return 404 Address Not Found
   └── Continue
   
   Step 5: Fetch product details
   ├── const productIds = body.items.map(i => i.productId);
   ├── const products = await batchGetProducts(productIds);
   ├── Merge product prices into items
   └── Calculate item totals
   
   Step 6: Check inventory
   ├── const inventoryCheck = await checkInventory(body.items);
   ├── if (!inventoryCheck.valid):
   │   └── return 400 Insufficient Stock with details
   └── Continue
   
   Step 7: Calculate pricing
   ├── const pricing = calculateOrderTotal(items, address, user);
   ├── if (pricing.totalAmount < MINIMUM_ORDER_VALUE):
   │   └── return 400 Minimum Order Value Not Met
   └── Continue
   
   Step 8: Create order record
   ├── const orderId = generateOrderId(); // uuid()
   ├── const order = {
   │     orderId,
   │     userId,
   │     items,
   │     ...pricing,
   │     status: 'Pending',
   │     deliveryDate: body.deliveryDate,
   │     deliveryAddress: address,
   │     createdAt: new Date().toISOString()
   │   };
   ├── await dynamodb.putItem(ORDERS_TABLE, order);
   └── Continue
   
   Step 9: Start Step Functions workflow
   ├── const executionArn = await stepFunctions.startExecution({
   │     stateMachineArn: ORDER_PROCESSING_STATE_MACHINE,
   │     input: JSON.stringify({ orderId, items })
   │   });
   └── Log execution ARN
   
   Step 10: Return response
   └── return {
         statusCode: 201,
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*'
         },
         body: JSON.stringify({
           orderId,
           userId,
           items,
           ...pricing,
           status: 'Pending',
           estimatedDelivery: calculateEstimatedDelivery(body.deliveryDate),
           message: 'Order created successfully. You will receive confirmation shortly.'
         })
       };

5. Error Handling Patterns
   
   Pattern 1: Validation Errors (400)
   try {
     const errors = validateInput(body);
     if (errors.length > 0) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'ValidationError',
           message: 'Invalid input data',
           errors: errors
         })
       };
     }
   } catch (error) {
     // Continue to Pattern 2
   }
   
   Pattern 2: Resource Not Found (404)
   const user = await getUser(userId);
   if (!user) {
     return {
       statusCode: 404,
       body: JSON.stringify({
         error: 'UserNotFound',
         message: `User with ID ${userId} not found`
       })
     };
   }
   
   Pattern 3: Business Logic Errors (400/409)
   if (pricing.totalAmount < MINIMUM_ORDER_VALUE) {
     return {
       statusCode: 400,
       body: JSON.stringify({
         error: 'MinimumOrderValue',
         message: `Order total must be at least ₹${MINIMUM_ORDER_VALUE}`,
         currentTotal: pricing.totalAmount,
         minimumRequired: MINIMUM_ORDER_VALUE
       })
     };
   }
   
   Pattern 4: Service Errors (500)
   try {
     await dynamodb.putItem(ORDERS_TABLE, order);
   } catch (error) {
     console.error('DynamoDB error:', error);
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: 'InternalServerError',
         message: 'Failed to create order. Please try again.',
         requestId: context.requestId
       })
     };
   }
   
   Pattern 5: Timeout Handling
   // Set timeout slightly less than Lambda timeout
   const timeoutMs = 9000; // Lambda timeout is 10s
   const timeoutPromise = new Promise((_, reject) => 
     setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
   );
   
   try {
     await Promise.race([
       createOrder(body),
       timeoutPromise
     ]);
   } catch (error) {
     if (error.message === 'Operation timeout') {
       return {
         statusCode: 504,
         body: JSON.stringify({
           error: 'GatewayTimeout',
           message: 'Request took too long. Please try again.'
         })
       };
     }
   }

Learning Outcome:
├── Complete Lambda implementation
├── Error handling patterns mastered
├── Ready for testing
└── Understanding of edge cases
```

**Day 3: Testing & Step Functions**

```
Morning Session (2 hours)

1. Unit Testing (VS Code)
   File: tests/unit/createOrder.test.ts
   
   Test Suite: Input Validation
   ├── Test: Should accept valid input
   ├── Test: Should reject empty items array
   ├── Test: Should reject negative quantities
   ├── Test: Should reject invalid date format
   ├── Test: Should reject past delivery dates
   └── Test: Should reject dates beyond 7 days
   
   Test Suite: User Validation
   ├── Test: Should accept valid user with complete profile
   ├── Test: Should reject non-existent user
   ├── Test: Should reject user with incomplete profile
   └── Test: Should reject invalid address ID
   
   Test Suite: Inventory Validation
   ├── Test: Should pass when all items in stock
   ├── Test: Should fail when any item out of stock
   ├── Test: Should handle partial stock correctly
   └── Test: Should handle multiple vendors
   
   Test Suite: Pricing Calculation
   ├── Test: Should calculate subtotal correctly
   ├── Test: Should apply 5% GST
   ├── Test: Should apply free delivery for orders > ₹500
   ├── Test: Should charge ₹40 for orders < ₹300
   ├── Test: Should apply first order discount
   └── Test: Should calculate multi-vendor surcharge
   
   Run Tests:
   $ npm test
   
   Expected Output:
   PASS  tests/unit/createOrder.test.ts
     Input Validation
       ✓ Should accept valid input (5ms)
       ✓ Should reject empty items array (3ms)
       ✓ Should reject negative quantities (2ms)
       ✓ Should reject invalid date format (3ms)
       ✓ Should reject past delivery dates (2ms)
       ✓ Should reject dates beyond 7 days (2ms)
     
     Test Suites: 4 passed, 4 total
     Tests:       24 passed, 24 total
     Time:        2.341s

2. Local Testing with SAM (VS Code Terminal)
   
   Build project:
   $ cd backend
   $ npm run build
   $ sam build
   
   Output:
   Building codeuri: dist/ runtime: nodejs20.x architecture: x86_64
   Running NodejsNpmBuilder:NpmPack
   Build Succeeded
   
   Test with valid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-valid.json \
     --env-vars env.json
   
   Expected Output:
   Invoking lambdas/order/createOrder.handler
   START RequestId: abc-123 Version: $LATEST
   [INFO] Order creation started for user: user-123
   [INFO] Inventory validation passed
   [INFO] Order created: order-xyz-789
   END RequestId: abc-123
   REPORT RequestId: abc-123 Duration: 1243.56 ms Memory: 512 MB
   
   {"statusCode":201,"body":"{\"orderId\":\"order-xyz-789\",...}"}
   
   Test with invalid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-invalid-date.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"ValidationError\",...}"}
   
   Test with insufficient stock:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-insufficient-stock.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"InsufficientStock\",...}"}

3. Create Step Functions State Machine
   File: stepFunctions/orderProcessing.asl.json
   
   {
     "Comment": "Order Processing Workflow",
     "StartAt": "ReserveInventory",
     "States": {
       "ReserveInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:reserveInventoryFunction",
         "InputPath": "$",
         "ResultPath": "$.reservationResult",
         "Next": "CheckReservation",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "ReservationFailed"
           }
         ]
       },
       
       "CheckReservation": {
         "Type": "Choice",
         "Choices": [
           {
             "Variable": "$.reservationResult.success",
             "BooleanEquals": true,
             "Next": "NotifyVendors"
           }
         ],
         "Default": "ReservationFailed"
       },
       
       "NotifyVendors": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:notifyVendorsFunction",
         "InputPath": "$",
         "ResultPath": "$.notificationResult",
         "Next": "UpdateOrderStatus",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "NotificationFailed"
           }
         ]
       },
       
       "UpdateOrderStatus": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:updateOrderStatusFunction",
         "InputPath": "$",
         "Parameters": {
           "orderId.$": "$.orderId",
           "status": "Confirmed"
         },
         "ResultPath": "$.updateResult",
         "Next": "NotifyCustomer"
       },
       
       "NotifyCustomer": {
         "Type": "Task",
         "Resource": "arn:aws:states:::sns:publish",
         "Parameters": {
           "TopicArn": "arn:aws:sns:region:account:order-notifications",
           "Message.$": "$.orderId",
           "Subject": "Order Confirmed"
         },
         "Next": "OrderProcessingComplete"
       },
       
       "OrderProcessingComplete": {
         "Type": "Succeed"
       },
       
       "ReservationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Inventory reservation failed"
         },
         "Next": "OrderFailed"
       },
       
       "NotificationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Vendor notification failed"
         },
         "Next": "ReleaseInventory"
       },
       
       "ReleaseInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:releaseInventoryFunction",
         "InputPath": "$",
         "Next": "OrderFailed"
       },
       
       "OrderFailed": {
         "Type": "Fail",
         "Error": "OrderProcessingFailed",
         "Cause": "Order processing workflow failed"
       }
     }
   }

Afternoon Session (1.5 hours)

4. Add Step Functions to SAM Template
   File: template.yaml
   
   Resources:
     OrderProcessingStateMachine:
       Type: AWS::Serverless::StateMachine
       Properties:
         Name: OrderProcessingWorkflow
         DefinitionUri: stepFunctions/orderProcessing.asl.json
         DefinitionSubstitutions:
           ReserveInventoryFunctionArn: !GetAtt ReserveInventoryFunction.Arn
           NotifyVendorsFunctionArn: !GetAtt NotifyVendorsFunction.Arn
           UpdateOrderStatusFunctionArn: !GetAtt UpdateOrderStatusFunction.Arn
           HandleOrderFailureFunctionArn: !GetAtt HandleOrderFailureFunction.Arn
           ReleaseInventoryFunctionArn: !GetAtt ReleaseInventoryFunction.Arn
           OrderNotificationsTopic: !Ref OrderNotificationsTopic
         Policies:
           - LambdaInvokePolicy:
               FunctionName: !Ref ReserveInventoryFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref NotifyVendorsFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref UpdateOrderStatusFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref HandleOrderFailureFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref ReleaseInventoryFunction
           - SNSPublishMessagePolicy:
               TopicName: !GetAtt OrderNotificationsTopic.TopicName
         Logging:
           Level: ALL
           IncludeExecutionData: true
           Destinations:
             - CloudWatchLogsLogGroup:
                 LogGroupArn: !GetAtt OrderProcessingLogGroup.Arn
     
     OrderNotificationsTopic:
       Type: AWS::SNS::Topic
       Properties:
         TopicName: order-notifications
         DisplayName: Order Notifications
         Subscription:
           - Endpoint: your-email@example.com
             Protocol: email
     
     OrderProcessingLogGroup:
       Type: AWS::Logs::LogGroup
       Properties:
         LogGroupName: /aws/vendedlogs/states/OrderProcessing
         RetentionInDays: 7

5. Deploy Complete Stack
   $ sam build
   $ sam deploy --guided
   
   Deployment Output:
   CloudFormation stack changeset
   ---------------------------------
   Operation                 LogicalResourceId         ResourceType
   ---------------------------------
   + Add                     CreateOrderFunction       AWS::Lambda::Function
   + Add                     ReserveInventoryFunc      AWS::Lambda::Function
   + Add                     NotifyVendorsFunction     AWS::Lambda::Function
   + Add                     OrderProcessingState      AWS::StepFunctions::StateMachine
   + Add                     OrdersTable               AWS::DynamoDB::Table
   + Add                     OrderNotificationsTopic   AWS::SNS::Topic
   ---------------------------------
   
   Deploy this changeset? [y/N]: y
   
   Deployment progress:
   CREATE_IN_PROGRESS  OrdersTable
   CREATE_IN_PROGRESS  CreateOrderFunction
   CREATE_COMPLETE     OrdersTable
   CREATE_COMPLETE     CreateOrderFunction
   ...
   CREATE_COMPLETE     OrderProcessingStateMachine
   
   Successfully created/updated stack - milk-delivery-dev

6. Test Deployed Stack (AWS Console)
   
   Console → Step Functions → State machines → OrderProcessingWorkflow
   ├── Click "Start execution"
   ├── Input JSON:
   │   {
   │     "orderId": "test-order-001",
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ]
   │   }
   ├── Click "Start execution"
   └── Watch execution graph
   
   Visual Execution:
   ReserveInventory (Running) ⏳
   ├── Lambda invoked
   └── Waiting for response...
   
   ReserveInventory (Succeeded) ✅
   ├── Duration: 1.2s
   └── Output: {"success": true, "reservationId": "res-123"}
   
   NotifyVendors (Running) ⏳
   ├── Lambda invoked
   └── Sending emails...
   
   NotifyVendors (Succeeded) ✅
   ├── Duration: 0.8s
   └── Output: {"notified": ["vendor-001"]}
   
   UpdateOrderStatus (Running) ⏳
   UpdateOrderStatus (Succeeded) ✅
   
   NotifyCustomer (Running) ⏳
   NotifyCustomer (Succeeded) ✅
   
   OrderProcessingComplete ✅
   Total Duration: 4.5s
   
   Check CloudWatch Logs:
   ├── Console → CloudWatch → Log groups
   ├── /aws/vendedlogs/states/OrderProcessing
   └── View execution logs

Learning Outcome:
├── Step Functions workflow working
├── Async processing implemented
├── Error handling and retries configured
├── Complete order flow functional
└── Ready for API Gateway integration
```

**Day 4: API Gateway Integration**

```
Morning Session (2 hours)

1. Add API Gateway to SAM Template
   File: template.yaml
   
   Resources:
     MilkDeliveryApi:
       Type: AWS::Serverless::Api
       Properties:
         Name: MilkDeliveryAPI
         StageName: dev
         Cors:
           AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
           AllowHeaders: "'Content-Type,Authorization'"
           AllowOrigin: "'*'"
         Auth:
           DefaultAuthorizer: CognitoAuthorizer
           Authorizers:
             CognitoAuthorizer:
               UserPoolArn: !GetAtt UserPool.Arn
         GatewayResponses:
           UNAUTHORIZED:
             StatusCode: 401
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
           BAD_REQUEST_BODY:
             StatusCode: 400
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
         DefinitionBody:
           openapi: 3.0.1
           info:
             title: Milk Delivery API
             version: 1.0.0
           paths:
             /orders:
               post:
                 summary: Create a new order
                 requestBody:
                   required: true
                   content:
                     application/json:
                       schema:
                         type: object
                         required:
                           - items
                           - deliveryDate
                           - addressId
                         properties:
                           items:
                             type: array
                             minItems: 1
                             maxItems: 50
                           deliveryDate:
                             type: string
                             format: date
                           addressId:
                             type: string
                 responses:
                   '201':
                     description: Order created successfully
                   '400':
                     description: Invalid input
                   '401':
                     description: Unauthorized
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${CreateOrderFunction.Arn}/invocations'
               get:
                 summary: List user orders
                 responses:
                   '200':
                     description: List of orders
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ListOrdersFunction.Arn}/invocations'
             
             /orders/{orderId}:
               get:
                 summary: Get order details
                 parameters:
                   - name: orderId
                     in: path
                     required: true
                     schema:
                       type: string
                 responses:
                   '200':
                     description: Order details
                   '404':
                     description: Order not found
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetOrderFunction.Arn}/invocations'
     
     CreateOrderFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/order/createOrder.handler
         Events:
           CreateOrder:
             Type: Api
             Properties:
               RestApiId: !Ref MilkDeliveryApi
               Path: /orders
               Method: POST
               Auth:
                 Authorizer: CognitoAuthorizer

2. Configure Request Validation
   File: template.yaml (add to API definition)
   
   RequestValidator:
     Type: AWS::ApiGateway::RequestValidator
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ValidateRequestBody: true
       ValidateRequestParameters: true
   
   Request Models:
   CreateOrderModel:
     Type: AWS::ApiGateway::Model
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ContentType: application/json
       Schema:
         type: object
         required:
           - items
           - deliveryDate
           - addressId
         properties:
           items:
             type: array
             minItems: 1
             items:
               type: object
               required:
                 - productId
                 - vendorId
                 - quantity
               properties:
                 productId:
                   type: string
                   pattern: '^prod-[a-zA-Z0-9-]+
                 vendorId:
                   type: string
                   pattern: '^vendor-[a-zA-Z0-9-]+
                 quantity:
                   type: integer
                   minimum: 1
                   maximum: 100
           deliveryDate:
             type: string
             format: date
           addressId:
             type: string

3. Deploy and Test API
   $ sam build
   $ sam deploy
   
   Output:
   Outputs:
   ├── MilkDeliveryApiUrl: https://abc123.execute-api.us-east-1.amazonaws.com/dev
   ├── CreateOrderFunctionArn: arn:aws:lambda:us-east-1:123456789:function:createOrder
   └── OrderProcessingStateMachine: arn:aws:states:us-east-1:123456789:stateMachine:OrderProcessing

Afternoon Session (1.5 hours)

4. Test API with Thunder Client (VS Code)
   
   Install Thunder Client extension
   ├── Extensions → Search "Thunder Client"
   ├── Install
   └── Restart VS Code
   
   Create Request Collection:
   Thunder Client → Collections → New Collection
   ├── Name: Milk Delivery API - Dev
   └── Create
   
   Request 1: Create Order (Success Case)
   ├── Method: POST
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders
   ├── Headers:
   │   ├── Content-Type: application/json
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   ├── Body (JSON):
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       },
   │       {
   │         "productId": "prod-yogurt-200g",
   │         "vendorId": "vendor-001",
   │         "quantity": 3
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (201 Created):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "quantity": 2,
         "unitPrice": 50,
         "totalPrice": 100
       },
       {
         "productId": "prod-yogurt-200g",
         "vendorId": "vendor-001",
         "productName": "Greek Yogurt 200g",
         "quantity": 3,
         "unitPrice": 30,
         "totalPrice": 90
       }
     ],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "discount": 0,
     "totalAmount": 239.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-12T08:00:00Z",
     "message": "Order created successfully. You will receive confirmation shortly."
   }
   
   Request 2: Create Order (Validation Error)
   ├── Body:
   │   {
   │     "items": [],  ← Empty array
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid input data",
     "errors": [
       {
         "field": "items",
         "message": "Items array cannot be empty",
         "code": "EMPTY_ITEMS"
       }
     ]
   }
   
   Request 3: Create Order (Insufficient Stock)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 1000  ← Too many
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 500ml' has only 50 units available",
     "productId": "prod-milk-500ml",
     "availableQuantity": 50,
     "requestedQuantity": 1000
   }
   
   Request 4: Create Order (Invalid Date)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ],
   │     "deliveryDate": "2025-10-01",  ← Past date
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid delivery date",
     "errors": [
       {
         "field": "deliveryDate",
         "message": "Delivery date cannot be in the past",
         "code": "INVALID_DATE"
       }
     ]
   }
   
   Request 5: Get Order Details
   ├── Method: GET
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders/order-abc-123-xyz
   ├── Headers:
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   └── Send
   
   Expected Response (200 OK):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [...],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "totalAmount": 239.5,
     "status": "Confirmed",
     "deliveryDate": "2025-10-12",
     "deliveryAddress": {
       "line1": "123 Main Street",
       "city": "Vadodara",
       "state": "Gujarat",
       "zipCode": "390001"
     },
     "createdAt": "2025-10-09T10:30:00Z",
     "updatedAt": "2025-10-09T10:30:15Z"
   }

5. Verify in AWS Console
   
   Console → API Gateway → MilkDeliveryAPI
   ├── Stages → dev
   ├── Invoke URL: Copy URL
   ├── Resources → /orders → POST
   ├── Test → Click "TEST" button
   ├── Request Body: Paste test JSON
   ├── Execute
   └── View Response
   
   Console → Lambda → CreateOrderFunction
   ├── Monitor tab
   ├── View logs → CloudWatch Logs
   ├── See execution logs
   └── Check for errors
   
   Console → DynamoDB → milk-delivery-orders
   ├── Items tab
   ├── See newly created order
   └── Verify all fields
   
   Console → Step Functions → OrderProcessingWorkflow
   ├── Executions tab
   ├── See execution for your order
   ├── Click execution ID
   └── View execution graph

Learning Outcome:
├── API Gateway fully integrated
├── End-to-end flow working
├── Multiple test scenarios validated
├── Ready for frontend integration
└── Understanding of full serverless stack
```

**Day 5: Edge Cases & Error Handling**

```
Morning Session (2 hours)

1. Edge Case Testing Matrix
   
   Test Case 1: Concurrent Orders (Race Condition)
   Scenario: Two users order the last item simultaneously
   
   Setup:
   ├── Set product stock to 1 unit
   ├── User A submits order for 1 unit
   ├── User B submits order for 1 unit (within milliseconds)
   └── Expected: Only one order succeeds
   
   Implementation Solution:
   ├── Use DynamoDB Conditional Expressions
   ├── UpdateItem with condition: stock > 0
   ├── If condition fails: Return insufficient stock
   └── Atomic operation prevents over-selling
   
   Code Pattern:
   await dynamodb.update({
     TableName: INVENTORY_TABLE,
     Key: { vendorId, productId },
     UpdateExpression: 'SET stock = stock - :qty, reserved = reserved + :qty',
     ConditionExpression: 'stock >= :qty',
     ExpressionAttributeValues: {
       ':qty': quantity
     }
   });
   // If condition fails, AWS throws ConditionalCheckFailedException
   
   Test Case 2: Multi-Vendor Order with Partial Failure
   Scenario: Order has items from 3 vendors, one vendor out of stock
   
   Expected Behavior:
   ├── Option A (Simple): Reject entire order
   ├── Option B (Advanced): Partial fulfillment
   └── For MVP: Choose Option A
   
   Implementation:
   ├── Validate all inventory BEFORE creating order
   ├── If any item fails: Return 400 with details
   ├── No partial orders
   └── Clear error message to user
   
   Test Case 3: Payment Gateway Timeout
   Scenario: Stripe API takes > 10 seconds to respond
   
   Implementation:
   ├── Set order status: "PaymentPending"
   ├── Use Stripe webhooks for async confirmation
   ├── Don't wait for payment in createOrder Lambda
   ├── Separate Lambda handles payment webhooks
   └── Update order status when webhook received
   
   Flow:
   createOrder → Return "PaymentPending"
       ↓
   User redirected to Stripe
       ↓
   Stripe processes payment
       ↓
   Stripe sends webhook → paymentWebhookHandler
       ↓
   Update order status → "Paid"
       ↓
   Trigger Step Functions workflow
   
   Test Case 4: Database Write Failure After Inventory Reserved
   Scenario: Inventory reserved, but DynamoDB fails to create order
   
   Problem:
   ├── Inventory locked
   ├── Order not created
   └── User sees error, but stock is reduced
   
   Solution: Use DynamoDB Transactions
   const params = {
     TransactItems: [
       {
         Update: {
           TableName: INVENTORY_TABLE,
           Key: { vendorId, productId },
           UpdateExpression: 'SET reserved = reserved + :qty',
           ConditionExpression: 'stock >= reserved + :qty',
           ExpressionAttributeValues: { ':qty': quantity }
         }
       },
       {
         Put: {
           TableName: ORDERS_TABLE,
           Item: orderObject,
           ConditionExpression: 'attribute_not_exists(orderId)'
         }
       }
     ]
   };
   await dynamodb.transactWrite(
      AddDefaultAuthorizerToCorsPreflight: false  # OPTIONS doesn't need auth

CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Events:
      CreateOrder:
        Type: Api
        Properties:
          RestApiId: !Ref MilkDeliveryApi
          Path: /orders
          Method: POST
          Auth:
            Authorizer: CognitoAuthorizer  # Requires authentication

GetPublicProductsFunction:
  Type: AWS::Serverless::Function
  Properties:
    Events:
      GetProducts:
        Type: Api
        Properties:
          RestApiId: !Ref MilkDeliveryApi
          Path: /products
          Method: GET
          Auth:
            Authorizer: NONE  # Public endpoint, no auth required
```

**How Authorization Works:**
```
Request Flow:
1. Client sends request with Authorization header
   └── Authorization: Bearer eyJhbGc...

2. API Gateway intercepts request
   ├── Extracts JWT token
   ├── Validates token signature (using Cognito JWKS)
   ├── Checks token expiration
   └── Verifies issuer and audience

3. If valid:
   ├── API Gateway adds user info to request context
   ├── Lambda receives event.requestContext.authorizer.claims
   └── Request proceeds to Lambda

4. If invalid:
   ├── API Gateway returns 401 Unauthorized
   └── Lambda never invoked (saves cost!)

Token Validation Checks:
├── Signature valid (token not tampered)
├── Token not expired (exp claim)
├── Issuer matches User Pool
└── Audience matches App Client ID
```

**Accessing User Info in Lambda:**
```typescript
export const handler = async (event: APIGatewayProxyEvent) => {
  // Extract user ID from JWT token
  const userId = event.requestContext.authorizer?.claims.sub;
  const email = event.requestContext.authorizer?.claims.email;
  const name = event.requestContext.authorizer?.claims.name;
  
  console.log('Authenticated user:', {
    userId,
    email,
    name
  });
  
  // Use userId for business logic
  const orders = await getOrdersForUser(userId);
  
  return {
    statusCode: 200,
    body: JSON.stringify(orders)
  };
};
```

### 9.4 User Registration & Login Flow

**Registration API (Custom Lambda):**
```
Request: POST /auth/register
Body:
{
  "email": "newuser@example.com",
  "password": "SecurePass123!",
  "name": "New User",
  "phone": "+1234567890"
}

Lambda Process:
1. Validate input (email format, password strength)
2. Call Cognito SignUp API
3. Cognito sends verification email
4. Create user record in DynamoDB (with Cognito userId)
5. Return success response

Response (200 OK):
{
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "newuser@example.com",
  "message": "Registration successful. Please check your email to verify your account.",
  "emailVerificationRequired": true
}

Implementation:
import { CognitoIdentityProviderClient, SignUpCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

export const handler = async (event: APIGatewayProxyEvent) => {
  const { email, password, name, phone } = JSON.parse(event.body || '{}');
  
  // Validate input
  if (!email || !password || !name) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'ValidationError',
        message: 'Email, password, and name are required'
      })
    };
  }
  
  try {
    // Register user in Cognito
    const signUpResponse = await cognitoClient.send(new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID!,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name },
        { Name: 'phone_number', Value: phone }
      ]
    }));
    
    const userId = signUpResponse.UserSub!;
    
    // Create user record in DynamoDB
    await dynamodb.put({
      TableName: process.env.USERS_TABLE!,
      Item: {
        userId,
        email,
        name,
        phone,
        role: 'Customer',
        isProfileComplete: false,
        createdAt: new Date().toISOString()
      }
    });
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        userId,
        email,
        message: 'Registration successful. Please check your email to verify your account.',
        emailVerificationRequired: true
      })
    };
    
  } catch (error: any) {
    console.error('Registration error:', error);
    
    if (error.name === 'UsernameExistsException') {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: 'UserExists',
          message: 'User with this email already exists'
        })
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'RegistrationFailed',
        message: 'Failed to register user. Please try again.'
      })
    };
  }
};
```

**Email Verification:**
```
Request: POST /auth/verify
Body:
{
  "email": "newuser@example.com",
  "code": "123456"
}

Lambda Process:
1. Call Cognito ConfirmSignUp API
2. Cognito verifies code
3. Update user record in DynamoDB (emailVerified: true)
4. Return success

Implementation:
import { ConfirmSignUpCommand } from '@aws-sdk/client-cognito-identity-provider';

export const handler = async (event: APIGatewayProxyEvent) => {
  const { email, code } = JSON.parse(event.body || '{}');
  
  try {
    await cognitoClient.send(new ConfirmSignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID!,
      Username: email,
      ConfirmationCode: code
    }));
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Email verified successfully. You can now login.'
      })
    };
    
  } catch (error: any) {
    if (error.name === 'CodeMismatchException') {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'InvalidCode',
          message: 'Invalid verification code'
        })
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'VerificationFailed',
        message: 'Failed to verify email. Please try again.'
      })
    };
  }
};
```

**Login API:**
```
Request: POST /auth/login
Body:
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response (200 OK):
{
  "accessToken": "eyJhbGc...",
  "idToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 3600,
  "tokenType": "Bearer",
  "user": {
    "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "email": "user@example.com",
    "name": "John Doe"
  }
}

Implementation:
import { InitiateAuthCommand, AuthFlowType } from '@aws-sdk/client-cognito-identity-provider';

export const handler = async (event: APIGatewayProxyEvent) => {
  const { email, password } = JSON.parse(event.body || '{}');
  
  try {
    const authResponse = await cognitoClient.send(new InitiateAuthCommand({
      ClientId: process.env.COGNITO_CLIENT_ID!,
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    }));
    
    const tokens = authResponse.AuthenticationResult!;
    
    // Decode ID token to get user info
    const idTokenPayload = JSON.parse(
      Buffer.from(tokens.IdToken!.split('.')[1], 'base64').toString()
    );
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        accessToken: tokens.AccessToken,
        idToken: tokens.IdToken,
        refreshToken: tokens.RefreshToken,
        expiresIn: tokens.ExpiresIn,
        tokenType: tokens.TokenType,
        user: {
          userId: idTokenPayload.sub,
          email: idTokenPayload.email,
          name: idTokenPayload.name
        }
      })
    };
    
  } catch (error: any) {
    console.error('Login error:', error);
    
    if (error.name === 'NotAuthorizedException') {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'InvalidCredentials',
          message: 'Invalid email or password'
        })
      };
    }
    
    if (error.name === 'UserNotConfirmedException') {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'EmailNotVerified',
          message: 'Please verify your email before logging in'
        })
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'LoginFailed',
        message: 'Failed to login. Please try again.'
      })
    };
  }
};
```

**Refresh Token API:**
```
Request: POST /auth/refresh
Body:
{
  "refreshToken": "eyJhbGc..."
}

Response (200 OK):
{
  "accessToken": "eyJhbGc...",  // New access token
  "idToken": "eyJhbGc...",      // New ID token
  "expiresIn": 3600,
  "tokenType": "Bearer"
}

Implementation:
import { InitiateAuthCommand, AuthFlowType } from '@aws-sdk/client-cognito-identity-provider';

export const handler = async (event: APIGatewayProxyEvent) => {
  const { refreshToken } = JSON.parse(event.body || '{}');
  
  try {
    const authResponse = await cognitoClient.send(new InitiateAuthCommand({
      ClientId: process.env.COGNITO_CLIENT_ID!,
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    }));
    
    const tokens = authResponse.AuthenticationResult!;
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        accessToken: tokens.AccessToken,
        idToken: tokens.IdToken,
        expiresIn: tokens.ExpiresIn,
        tokenType: tokens.TokenType
      })
    };
    
  } catch (error: any) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: 'InvalidRefreshToken',
        message: 'Invalid or expired refresh token. Please login again.'
      })
    };
  }
};
```

### 9.5 Role-Based Access Control (RBAC)

**User Roles:**
```
Roles:
├── Customer (default)
│   ├── Can place orders
│   ├── Can view own orders
│   └── Can update own profile
├── Vendor
│   ├── Can manage products
│   ├── Can view assigned orders
│   └── Can update order status
├── Admin
│   ├── Can view all orders
│   ├── Can manage users
│   └── Can view analytics
└── Manager
    ├── Can view all orders
    ├── Can assign deliveries
    └── Can view reports
```

**Storing Roles:**
```
Option 1: DynamoDB Users Table
{
  "userId": "user-123",
  "email": "user@example.com",
  "role": "Customer",  // Store role here
  ...
}

Option 2: Cognito Custom Attributes
// During registration, set custom attribute
UserAttributes: [
  { Name: 'custom:role', Value: 'Customer' }
]

// JWT token will include: "custom:role": "Customer"

Recommendation: Use DynamoDB (more flexible)
```

**Authorization Middleware:**
```typescript
// src/shared/auth.ts

export enum UserRole {
  CUSTOMER = 'Customer',
  VENDOR = 'Vendor',
  ADMIN = 'Admin',
  MANAGER = 'Manager'
}

export function requireRole(...allowedRoles: UserRole[]) {
  return async (event: APIGatewayProxyEvent): Promise<boolean> => {
    const userId = event.requestContext.authorizer?.claims.sub;
    
    if (!userId) {
      return false;
    }
    
    // Get user from DynamoDB
    const user = await dynamodb.get({
      TableName: process.env.USERS_TABLE!,
      Key: { userId }
    });
    
    if (!user.Item) {
      return false;
    }
    
    const userRole = user.Item.role as UserRole;
    return allowedRoles.includes(userRole);
  };
}

// Usage in Lambda
export const handler = async (event: APIGatewayProxyEvent) => {
  // Check if user has required role
  const hasPermission = await requireRole(UserRole.ADMIN, UserRole.MANAGER)(event);
  
  if (!hasPermission) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource'
      })
    };
  }
  
  // Proceed with admin logic
  const allOrders = await getAllOrders();
  return {
    statusCode: 200,
    body: JSON.stringify(allOrders)
  };
};
```

**Resource-Level Authorization:**
```typescript
// Example: User can only view their own orders

export const handler = async (event: APIGatewayProxyEvent) => {
  const orderId = event.pathParameters?.orderId;
  const authenticatedUserId = event.requestContext.authorizer?.claims.sub;
  
  // Get order
  const order = await dynamodb.get({
    TableName: process.env.ORDERS_TABLE!,
    Key: { orderId }
  });
  
  if (!order.Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: 'NotFound',
        message: 'Order not found'
      })
    };
  }
  
  // Check if user owns this order
  if (order.Item.userId !== authenticatedUserId) {
    // Check if user is admin
    const user = await getUser(authenticatedUserId);
    if (user.role !== UserRole.ADMIN) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'Forbidden',
          message: 'You can only view your own orders'
        })
      };
    }
  }
  
  // User owns order or is admin, return order
  return {
    statusCode: 200,
    body: JSON.stringify(order.Item)
  };
};
```

---

## 10. ERROR HANDLING & EDGE CASES

### 10.1 Error Categories & HTTP Status Codes

**Standard Error Responses:**
```
4xx Client Errors (User's fault):
├── 400 Bad Request
│   ├── Invalid input data
│   ├── Missing required fields
│   ├── Invalid format (date, email, etc.)
│   └── Business rule violations
├── 401 Unauthorized
│   ├── Missing authentication token
│   ├── Invalid token
│   └── Expired token
├── 403 Forbidden
│   ├── Valid token but insufficient permissions
│   ├── User role doesn't allow action
│   └── Resource access denied
├── 404 Not Found
│   ├── Resource doesn't exist
│   └── Endpoint doesn't exist
├── 409 Conflict
│   ├── Resource already exists
│   ├── Duplicate entry
│   └── Concurrent modification
├── 422 Unprocessable Entity
│   ├── Semantic errors
│   └── Business logic failures
└── 429 Too Many Requests
    ├── Rate limit exceeded
    └── Retry after X seconds

5xx Server Errors (System's fault):
├── 500 Internal Server Error
│   ├── Unexpected errors
│   ├── Unhandled exceptions
│   └── Database errors
├── 502 Bad Gateway
│   ├── Lambda timeout
│   └── Integration failure
├── 503 Service Unavailable
│   ├── Downstream service down
│   ├── Circuit breaker open
│   └── Maintenance mode
└── 504 Gateway Timeout
    ├── Request exceeded time limit
    └── Lambda execution timeout
```

**Standardized Error Response:**
```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Product 'Organic Milk 500ml' has only 5 units available",
    "statusCode": 400,
    "timestamp": "2025-10-09T10:30:00Z",
    "requestId": "req-abc-123-xyz",
    "path": "/orders",
    "method": "POST",
    "details": {
      "productId": "prod-milk-500ml",
      "productName": "Organic Milk 500ml",
      "availableQuantity": 5,
      "requestedQuantity": 10,
      "vendorId": "vendor-001"
    },
    "retryable": false,
    "documentation": "https://docs.milkdelivery.com/errors/insufficient-stock"
  }
}
```

### 10.2 Input Validation Patterns

**Validation Layers:**
```
Layer 1: API Gateway (Schema Validation)
├── Validates request structure
├── Checks required fields
├── Validates data types
└── Rejects before Lambda invocation

Layer 2: Lambda (Business Validation)
├── Validates business rules
├── Cross-field validation
├── Database constraints
└── External service validation

Layer 3: DynamoDB (Conditional Expressions)
├── Atomicity guarantees
├── Constraint enforcement
└── Concurrency control
```

**Comprehensive Validation Example:**
```typescript
// src/shared/validation.ts

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export class OrderValidator {
  private errors: ValidationError[] = [];
  
  validate(orderRequest: CreateOrderRequest): ValidationResult {
    this.errors = [];
    
    this.validateItems(orderRequest.items);
    this.validateDeliveryDate(orderRequest.deliveryDate);
    this.validateAddressId(orderRequest.addressId);
    
    return {
      isValid: this.errors.length === 0,
      errors: this.errors
    };
  }
  
  private validateItems(items: OrderItem[]) {
    if (!items || items.length === 0) {
      this.addError('items', 'Items array cannot be empty', 'EMPTY_ITEMS');
      return;
    }
    
    if (items.length > 50) {
      this.addError('items', 'Maximum 50 items per order', 'TOO_MANY_ITEMS', items.length);
    }
    
    items.forEach((item, index) => {
      this.validateItem(item, index);
    });
  }
  
  private validateItem(item: OrderItem, index: number) {
    const fieldPrefix = `items[${index}]`;
    
    if (!item.productId) {
      this.addError(`${fieldPrefix}.productId`, 'Product ID is required', 'MISSING_PRODUCT_ID');
    } else if (!/^prod-[a-zA-Z0-9-]+$/.test(item.productId)) {
      this.addError(`${fieldPrefix}.productId`, 'Invalid product ID format', 'INVALID_PRODUCT_ID', item.productId);
    }
    
    if (!item.vendorId) {
      this.addError(`${fieldPrefix}.vendorId`, 'Vendor ID is required', 'MISSING_VENDOR_ID');
    } else if (!/^vendor-[a-zA-Z0-9-]+$/.test(item.vendorId)) {
      this.addError(`${fieldPrefix}.vendorId`, 'Invalid vendor ID format', 'INVALID_VENDOR_ID', item.vendorId);
    }
    
    if (!item.quantity || item.quantity < 1) {
      this.addError(`${fieldPrefix}.quantity`, 'Quantity must be at least 1', 'INVALID_QUANTITY', item.quantity);
    } else if (item.quantity > 100) {
      this.addError(`${fieldPrefix}.quantity`, 'Maximum quantity is 100 per item', 'QUANTITY_TOO_HIGH', item.quantity);
    } else if (!Number.isInteger(item.quantity)) {
      this.addError(`${fieldPrefix}.quantity`, 'Quantity must be a whole number', 'NON_INTEGER_QUANTITY', item.quantity);
    }
  }
  
  private validateDeliveryDate(deliveryDate: string) {
    if (!deliveryDate) {
      this.addError('deliveryDate', 'Delivery date is required', 'MISSING_DELIVERY_DATE');
      return;
    }
    
    // Check format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
      this.addError('deliveryDate', 'Invalid date format. Use YYYY-MM-DD', 'INVALID_DATE_FORMAT', deliveryDate);
      return;
    }
    
    const date = new Date(deliveryDate);
    
    if (isNaN(date.getTime())) {
      this.addError('deliveryDate', 'Invalid date', 'INVALID_DATE', deliveryDate);
      return;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 7);
    
    if (date < tomorrow) {
      this.addError('deliveryDate', 'Delivery date must be at least tomorrow', 'DATE_TOO_EARLY', deliveryDate);
    } else if (date > maxDate) {
      this.addError('deliveryDate', 'Delivery date cannot be more than 7 days in the future', 'DATE_TOO_FAR', deliveryDate);
    }
  }
  
  private validateAddressId(addressId: string) {
    if (!addressId) {
      this.addError('addressId', 'Address ID is required', 'MISSING_ADDRESS_ID');
    } else if (addressId.length < 1 || addressId.length > 100) {
      this.addError('addressId', 'Invalid address ID length', 'INVALID_ADDRESS_ID', addressId);
    }
  }
  
  private addError(field: string, message: string, code: string, value?: any) {
    this.errors.push({ field, message, code, value });
  }
}

// Usage in Lambda
export const handler = async (event: APIGatewayProxyEvent) => {
  const body = JSON.parse(event.body || '{}');
  
  const validator = new OrderValidator();
  const validation = validator.validate(body);
  
  if (!validation.isValid) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          statusCode: 400,
          details: {
            errors: validation.errors
          }
        }
      })
    };
  }
  
  // Proceed with order creation
};
```

### 10.3 Retry Logic & Exponential Backoff

**AWS SDK Built-in Retry:**
```typescript
// AWS SDK automatically retries on transient errors
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  maxAttempts: 3,  // Retry up to 3 times
  retryMode: 'adaptive'  // Adjusts retry strategy based on error type
});

// Retries automatically for:
// - Throttling errors (ProvisionedThroughputExceededException)
// - Network errors
// - 500/502/503/504 errors
```

**Custom Retry Logic:**
```typescript
// src/shared/retry.ts

interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ProvisionedThroughputExceededException',
    'ThrottlingException',
    'RequestLimitExceeded',
    'ServiceUnavailable',
    'InternalServerError'
  ]
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error;
  
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = opts.retryableErrors.some(
        errorName => error.name === errorName || error.code === errorName
      );
      
      if (!isRetryable || attempt === opts.maxAttempts - 1) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelayMs
      );
      
      // Add jitter (randomness) to prevent thundering herd
      const jitter = Math.random() * delay * 0.1;
      const actualDelay = delay + jitter;
      
      console.log(`Retry attempt ${attempt + 1}/${opts.maxAttempts} after ${actualDelay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, actualDelay));
    }
  }
  
  throw lastError!;
}

// Usage
const order = await retryWithBackoff(
  async () => {
    return await dynamodb.put({
      TableName: ORDERS_TABLE,
      Item: orderData
    });
  },
  {
    maxAttempts: 5,
    initialDelayMs: 200
  }
);
```

### 10.4 Timeout Handling

**Lambda Timeout Strategy:**
```typescript
// Set Lambda timeout to 10 seconds
// Implement application timeout at 9 seconds

export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
  const APPLICATION_TIMEOUT = 9000;  // 9 seconds
  const startTime = Date.now();
  
  // Create timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Operation timeout'));
    }, APPLICATION_TIMEOUT);
  });
  
  try {
    // Race between actual operation and timeout
    const result = await Promise.race([
      createOrder(event),
      timeoutPromise
    ]);
    
    const duration = Date.now() - startTime;
    console.log(`Operation completed in ${duration}ms`);
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    if (error.message === 'Operation timeout') {
      console.error(`Operation timed out after ${duration}ms`);
      
      return {
        statusCode: 504,
        body: JSON.stringify({
          error: {
            code: 'GATEWAY_TIMEOUT',
            message: 'Request took too long to process. Please try again.',
            statusCode: 504,
            duration
          }
        })
      };
    }
    
    throw error;  // Re-throw other errors
  }**BatchGetItem:**
```
Purpose: Retrieve multiple items in one request

Limitations:
├── Max 100 items per request
├── Max 16 MB total response size
├── Items can be from different tables
└── Returns in any order (not sorted)

Example: Get multiple products by ID
const productIds = ['prod-1', 'prod-2', 'prod-3'];

const result = await docClient.batchGet({
  RequestItems: {
    'Products': {
      Keys: productIds.map(id => ({ productId: id }))
    }
  }
});

// Result
{
  Responses: {
    Products: [
      { productId: 'prod-1', name: 'Milk', price: 50 },
      { productId: 'prod-2', name: 'Yogurt', price: 30 },
      { productId: 'prod-3', name: 'Cheese', price: 100 }
    ]
  },
  UnprocessedKeys: {}  // Empty if all items retrieved
}

Handling UnprocessedKeys:
// If some items couldn't be retrieved (throttling)
if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0) {
  // Retry with exponential backoff
  await new Promise(resolve => setTimeout(resolve, 1000));
  const retryResult = await docClient.batchGet({
    RequestItems: result.UnprocessedKeys
  });
}

Cost Comparison:
├── Individual GetItem: 3 requests * 1 RCU = 3 RCUs
├── BatchGetItem: 1 request * 3 RCUs = 3 RCUs
└── Performance: BatchGetItem is faster (single network call)
```

**BatchWriteItem:**
```
Purpose: Write/delete multiple items in one request

Limitations:
├── Max 25 items per request
├── Cannot update items (only put/delete)
├── No conditional expressions
└── Partial failures possible

Example: Create multiple order items
const items = [
  { orderId: 'order-1', userId: 'user-123', total: 100 },
  { orderId: 'order-2', userId: 'user-123', total: 200 },
  { orderId: 'order-3', userId: 'user-456', total: 150 }
];

await docClient.batchWrite({
  RequestItems: {
    'Orders': items.map(item => ({
      PutRequest: { Item: item }
    }))
  }
});

Delete multiple items:
const orderIdsToDelete = ['order-1', 'order-2'];

await docClient.batchWrite({
  RequestItems: {
    'Orders': orderIdsToDelete.map(id => ({
      DeleteRequest: {
        Key: { orderId: id }
      }
    }))
  }
});

Warning: BatchWriteItem is NOT atomic
├── Some items may succeed, others fail
├── Check UnprocessedItems in response
└── Implement retry logic for failures
```

### 7.4 Transactions (Atomic Operations)

**TransactWriteItems:**
```
Purpose: All-or-nothing writes across multiple items/tables

Use Cases:
├── Transfer funds between accounts
├── Reserve inventory + create order
├── Update multiple related records
└── Any operation requiring atomicity

Limitations:
├── Max 100 items per transaction (25 for DynamoDB standard)
├── Max 4 MB total transaction size
├── Higher cost: 2x WCU compared to regular writes
└── Cannot span across regions

Example: Create order + reserve inventory (atomic)
try {
  await docClient.transactWrite({
    TransactItems: [
      {
        Put: {
          TableName: 'Orders',
          Item: {
            orderId: 'order-123',
            userId: 'user-456',
            status: 'Pending',
            totalAmount: 250
          },
          ConditionExpression: 'attribute_not_exists(orderId)'
        }
      },
      {
        Update: {
          TableName: 'Inventory',
          Key: {
            vendorId: 'vendor-001',
            productId: 'prod-milk-500ml'
          },
          UpdateExpression: 'SET reserved = reserved + :qty, stock = stock - :qty',
          ConditionExpression: 'stock >= :qty',
          ExpressionAttributeValues: {
            ':qty': 5
          }
        }
      },
      {
        Update: {
          TableName: 'Users',
          Key: { userId: 'user-456' },
          UpdateExpression: 'SET orderCount = orderCount + :inc',
          ExpressionAttributeValues: {
            ':inc': 1
          }
        }
      }
    ]
  });
  
  console.log('Transaction succeeded - all items updated');
  
} catch (error) {
  if (error.name === 'TransactionCanceledException') {
    console.error('Transaction failed - no items were updated');
    
    // Check which condition failed
    error.CancellationReasons.forEach((reason, index) => {
      if (reason.Code === 'ConditionalCheckFailed') {
        console.error(`Item ${index} failed condition check`);
      }
    });
  }
}

Cost Example:
├── Regular write: 3 items * 1 WCU = 3 WCUs
├── Transaction: 3 items * 2 WCU = 6 WCUs
└── Trade-off: 2x cost for guaranteed atomicity
```

**TransactGetItems:**
```
Purpose: Read multiple items with snapshot isolation

Use Case: Ensure consistent view of related data

Example: Get order with current inventory status
const result = await docClient.transactGet({
  TransactItems: [
    {
      Get: {
        TableName: 'Orders',
        Key: { orderId: 'order-123' }
      }
    },
    {
      Get: {
        TableName: 'Inventory',
        Key: {
          vendorId: 'vendor-001',
          productId: 'prod-milk-500ml'
        }
      }
    }
  ]
});

// All items read at the same point in time
const order = result.Responses[0].Item;
const inventory = result.Responses[1].Item;

Cost: 2x RCU compared to regular reads
```

### 7.5 DynamoDB Best Practices for Your Project

**1. Table Design Strategy**
```
Single Table Design vs Multiple Tables:

For Learning Project: Use Multiple Tables (simpler)
├── Users table
├── Products table
├── Orders table
├── Inventory table
└── Vendors table

Advantages:
├── Easier to understand
├── Simpler queries
├── Better for learning
└── Good for MVP

Single Table Design (Advanced):
├── One table for all entities
├── Uses generic PK/SK (e.g., PK: ENTITY#ID, SK: METADATA)
├── Reduces number of tables
└── More complex, use after mastering basics

Your Recommendation: Start with multiple tables
```

**2. Naming Conventions**
```
Table Names:
├── Pattern: {project}-{entity}-{environment}
├── Example: milk-delivery-users-dev
└── SAM: Use !Sub for environment substitution

Attribute Names:
├── Use camelCase: userId, createdAt, totalAmount
├── Avoid reserved words: Use ExpressionAttributeNames
└── Be consistent across all tables

Index Names:
├── Pattern: {attribute}-index
├── Example: email-index, status-createdAt-index
└── Descriptive and clear purpose
```

**3. Data Modeling Patterns**

**Pattern 1: One-to-Many Relationship**
```
Example: User has many orders

Option A: Composite Key (Recommended)
Orders Table:
PK: userId, SK: orderId
├── user-123, order-2025-001
├── user-123, order-2025-002
└── user-123, order-2025-003

Query: Get all orders for user
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: { ':uid': 'user-123' }
});

Option B: GSI
Orders Table:
PK: orderId, GSI: userId-index
└── Query via GSI

Choose Option A for main access pattern
Choose Option B if orderId lookups are more common
```

**Pattern 2: Many-to-Many Relationship**
```
Example: Orders can have multiple products, products in multiple orders

Solution: Junction Table
OrderItems Table:
PK: orderId, SK: productId
├── order-001, prod-milk
├── order-001, prod-yogurt
├── order-002, prod-milk
└── order-002, prod-cheese

Query: Get all products in an order
await docClient.query({
  TableName: 'OrderItems',
  KeyConditionExpression: 'orderId = :oid',
  ExpressionAttributeValues: { ':oid': 'order-001' }
});

Query: Get all orders containing a product (use GSI)
GSI: productId-orderId-index
await docClient.query({
  TableName: 'OrderItems',
  IndexName: 'productId-orderId-index',
  KeyConditionExpression: 'productId = :pid',
  ExpressionAttributeValues: { ':pid': 'prod-milk' }
});
```

**Pattern 3: Time-Series Data**
```
Example: Order history, tracking updates

Orders Table:
PK: userId, SK: createdAt#orderId
├── user-123, 2025-10-01T10:00:00Z#order-001
├── user-123, 2025-10-05T14:30:00Z#order-002
└── user-123, 2025-10-09T09:15:00Z#order-003

Benefits:
├── Natural sort by date
├── Range queries (get orders between dates)
└── Easy pagination

Query: Get orders in date range
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid AND #sk BETWEEN :start AND :end',
  ExpressionAttributeNames: {
    '#sk': 'createdAt#orderId'  // Sort key
  },
  ExpressionAttributeValues: {
    ':uid': 'user-123',
    ':start': '2025-10-01',
    ':end': '2025-10-10'
  }
});
```

**4. Pagination**
```
Problem: Query returns many items, don't load all at once

Solution: Use ExclusiveStartKey

Implementation:
async function getPaginatedOrders(userId: string, limit = 20, nextToken?: string) {
  const params: any = {
    TableName: 'Orders',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: {
      ':uid': userId
    },
    Limit: limit,
    ScanIndexForward: false  // Sort descending (newest first)
  };
  
  if (nextToken) {
    params.ExclusiveStartKey = JSON.parse(
      Buffer.from(nextToken, 'base64').toString()
    );
  }
  
  const result = await docClient.query(params);
  
  const response: any = {
    items: result.Items,
    count: result.Count
  };
  
  if (result.LastEvaluatedKey) {
    response.nextToken = Buffer.from(
      JSON.stringify(result.LastEvaluatedKey)
    ).toString('base64');
  }
  
  return response;
}

API Response:
{
  "items": [...],
  "count": 20,
  "nextToken": "eyJvcmRlcklkIjoib3JkZXItMDIwIn0="
}

Next Request:
GET /orders?limit=20&nextToken=eyJvcmRlcklkIjoib3JkZXItMDIwIn0=
```

**5. Conditional Expressions**
```
Use Cases:
├── Prevent overwriting existing items
├── Optimistic locking (version control)
├── Business logic enforcement
└── Race condition prevention

Example 1: Create only if not exists
await docClient.put({
  TableName: 'Orders',
  Item: order,
  ConditionExpression: 'attribute_not_exists(orderId)'
});
// Throws ConditionalCheckFailedException if orderId exists

Example 2: Update only if version matches (optimistic locking)
await docClient.update({
  TableName: 'Orders',
  Key: { orderId: 'order-123' },
  UpdateExpression: 'SET #status = :newStatus, #version = :newVersion',
  ConditionExpression: '#version = :currentVersion',
  ExpressionAttributeNames: {
    '#status': 'status',
    '#version': 'version'
  },
  ExpressionAttributeValues: {
    ':newStatus': 'Delivered',
    ':newVersion': 2,
    ':currentVersion': 1
  }
});
// Fails if another process updated version to 2 already

Example 3: Decrement only if sufficient quantity
await docClient.update({
  TableName: 'Inventory',
  Key: { vendorId: 'vendor-001', productId: 'prod-milk' },
  UpdateExpression: 'SET stock = stock - :qty',
  ConditionExpression: 'stock >= :qty',
  ExpressionAttributeValues: {
    ':qty': 5
  }
});
// Prevents negative stock
```

### 7.6 Common DynamoDB Errors & Solutions

**1. ProvisionedThroughputExceededException**
```
Cause: Exceeded 25 WCU or 25 RCU limit

Solutions:
├── Use on-demand billing (auto-scales, recommended for learning)
├── Implement exponential backoff (AWS SDK does this automatically)
├── Optimize queries (reduce data scanned)
└── Check for hot partitions (one partition getting all requests)

SAM Template Fix:
UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    BillingMode: PAY_PER_REQUEST  # Auto-scales, no throttling
    # OR
    BillingMode: PROVISIONED
    ProvisionedThroughput:
      ReadCapacityUnits: 5
      WriteCapacityUnits: 5
```

**2. ValidationException: One or more parameter values were invalid**
```
Cause: Incorrect data types or missing required attributes

Common Mistakes:
├── Using Number type for String attribute
├── Missing partition key in PutItem
├── Invalid attribute names (reserved words)
└── Malformed key schema

Solution: Double-check attribute types
await docClient.put({
  TableName: 'Orders',
  Item: {
    orderId: 'order-123',  // String
    userId: 'user-456',    // String
    totalAmount: 250,      // Number (not "250")
    createdAt: new Date().toISOString()  // String (ISO format)
  }
});
```

**3. ConditionalCheckFailedException**
```
Cause: ConditionExpression evaluated to false

Example:
try {
  await docClient.put({
    TableName: 'Orders',
    Item: order,
    ConditionExpression: 'attribute_not_exists(orderId)'
  });
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    return {
      statusCode: 409,
      body: JSON.stringify({
        error: 'Conflict',
        message: 'Order already exists'
      })
    };
  }
}
```

**4. ResourceNotFoundException**
```
Cause: Table or index doesn't exist

Common Causes:
├── Table not created yet (deployment still in progress)
├── Wrong table name (typo or wrong environment variable)
├── GSI name misspelled
└── Cross-region access (table in different region)

Debugging:
console.log('Table name:', process.env.ORDERS_TABLE);  // Check env var
console.log('Region:', process.env.AWS_REGION);        // Check region

Solution: Verify in AWS Console
├── DynamoDB → Tables → Check table exists
└── Check table ARN matches expected region
```

**5. ItemCollectionSizeLimitExceededException**
```
Cause: Partition size exceeded 10 GB

Occurs when:
├── Too many items with same partition key
└── Using Local Secondary Index (LSI)

Solution:
├── Redesign partition key (add more granularity)
├── Use composite key differently
└── For your learning project: Unlikely to hit this limit
```

---

## 8. API GATEWAY: CONFIGURATION & TESTING

### 8.1 REST API vs HTTP API

**Comparison:**
```
REST API (Choose for learning):
├── More features: Request validation, caching, API keys
├── Better for learning AWS concepts
├── Integrates with AWS WAF (firewall)
├── Cost: $3.50 per million requests (after free tier)
└── Free Tier: 1M requests/month (12 months)

HTTP API (Simpler, newer):
├── Lower cost: $1.00 per million requests
├── Faster (lower latency)
├── Simpler configuration
├── Limited features
└── No free tier

Recommendation: Use REST API for your project
```

### 8.2 Request/Response Transformations

**Request Mapping Template:**
```
Use Case: Transform incoming request before Lambda receives it

Example: Add metadata to request
VTL Template (Velocity Template Language):
{
  "body": $input.json('   await dynamodb.transactWrite(params);
   // Either both succeed or both fail (atomicity)
   
   Test Case 5: User Cancels Order During Processing
   Scenario: Order created, Step Functions running, user clicks "Cancel"
   
   Implementation:
   ├── Check current order status
   ├── If status = "Pending": Allow cancellation
   ├── If status = "Processing": Check Step Functions execution
   ├── Stop execution: stepFunctions.stopExecution()
   ├── Release inventory
   └── Update order status: "Cancelled"
   
   Test Case 6: Invalid JWT Token
   Scenario: User sends expired or tampered token
   
   API Gateway Authorizer handles:
   ├── Validates JWT signature
   ├── Checks expiration
   ├── Verifies issuer (Cognito User Pool)
   └── Returns 401 Unauthorized if invalid
   
   Lambda never receives request with invalid token
   
   Test Case 7: DynamoDB Throttling
   Scenario: Free tier limits exceeded (25 WCU/RCU)
   
   Symptoms:
   ├── ProvisionedThroughputExceededException
   ├── Lambda returns 500 error
   └── Operations fail
   
   Solution:
   ├── Use exponential backoff (built into AWS SDK)
   ├── Implement retry logic in Lambda
   ├── Monitor CloudWatch metrics
   └── Consider on-demand billing (scales automatically)
   
   Implementation:
   const dynamodbWithRetry = DynamoDBDocumentClient.from(client, {
     retryMode: 'adaptive',
     maxAttempts: 3
   });
   
   Test Case 8: Large Order (100+ items)
   Scenario: User tries to order 100 different products
   
   Considerations:
   ├── Lambda execution time: May exceed 10s timeout
   ├── DynamoDB batch size: Max 25 items per BatchGetItem
   ├── API Gateway payload: Max 10 MB
   └── Step Functions payload: Max 256 KB
   
   Solutions:
   ├── Set maximum items per order: 50
   ├── Validate in API Gateway request validator
   ├── Batch DynamoDB operations properly
   └── Use S3 for large payloads if needed (advanced)

Afternoon Session (1.5 hours)

2. Implement Idempotency
   
   Problem: User clicks "Place Order" twice
   ├── Network delay, no response
   ├── User clicks again
   └── Two orders created for same cart
   
   Solution: Idempotency Keys
   
   Request Header:
   Idempotency-Key: <unique-client-generated-uuid>
   
   Implementation:
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent) => {
     const idempotencyKey = event.headers['idempotency-key'] || 
                            event.headers['Idempotency-Key'];
     
     if (!idempotencyKey) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'MissingIdempotencyKey',
           message: 'Idempotency-Key header is required'
         })
       };
     }
     
     // Check if order with this key already exists
     const existingOrder = await dynamodb.query({
       TableName: ORDERS_TABLE,
       IndexName: 'idempotency-key-index',
       KeyConditionExpression: 'idempotencyKey = :key',
       ExpressionAttributeValues: {
         ':key': idempotencyKey
       }
     });
     
     if (existingOrder.Items && existingOrder.Items.length > 0) {
       // Order already created, return existing order
       return {
         statusCode: 200,
         body: JSON.stringify(existingOrder.Items[0])
       };
     }
     
     // Create new order with idempotency key
     const order = {
       ...orderData,
       idempotencyKey
     };
     
     await dynamodb.put({
       TableName: ORDERS_TABLE,
       Item: order,
       ConditionExpression: 'attribute_not_exists(idempotencyKey)'
     });
     
     return {
       statusCode: 201,
       body: JSON.stringify(order)
     };
   };
   
   DynamoDB Table Update (template.yaml):
   OrdersTable:
     GlobalSecondaryIndexes:
       - IndexName: idempotency-key-index
         KeySchema:
           - AttributeName: idempotencyKey
             KeyType: HASH
         Projection:
           ProjectionType: ALL

3. Implement Circuit Breaker Pattern
   
   Problem: Downstream service (payment gateway) is down
   ├── Every request times out
   ├── Lambda execution time wasted
   ├── Poor user experience
   └── Increased costs
   
   Solution: Circuit Breaker
   
   States:
   ├── CLOSED: Normal operation, requests pass through
   ├── OPEN: Too many failures, reject requests immediately
   └── HALF_OPEN: Test if service recovered
   
   Implementation:
   File: src/shared/circuitBreaker.ts
   
   class CircuitBreaker {
     private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
     private failureCount = 0;
     private failureThreshold = 5;
     private timeout = 60000; // 1 minute
     private lastFailureTime?: number;
     
     async execute<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'OPEN') {
         if (Date.now() - this.lastFailureTime! > this.timeout) {
           this.state = 'HALF_OPEN';
         } else {
           throw new Error('Circuit breaker is OPEN');
         }
       }
       
       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
     
     private onSuccess() {
       this.failureCount = 0;
       this.state = 'CLOSED';
     }
     
     private onFailure() {
       this.failureCount++;
       this.lastFailureTime = Date.now();
       
       if (this.failureCount >= this.failureThreshold) {
         this.state = 'OPEN';
       }
     }
   }
   
   Usage:
   const paymentCircuitBreaker = new CircuitBreaker();
   
   try {
     const paymentResult = await paymentCircuitBreaker.execute(async () => {
       return await stripeClient.charges.create({...});
     });
   } catch (error) {
     if (error.message === 'Circuit breaker is OPEN') {
       return {
         statusCode: 503,
         body: JSON.stringify({
           error: 'ServiceUnavailable',
           message: 'Payment service is temporarily unavailable. Please try again later.'
         })
       };
     }
   }

4. Comprehensive Error Response Structure
   
   Standardized Error Format:
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Human-readable message",
       "details": {
         "field": "specificField",
         "reason": "Detailed reason"
       },
       "requestId": "req-abc-123",
       "timestamp": "2025-10-09T10:30:00Z",
       "retryable": boolean,
       "documentation": "https://docs.milkdelivery.com/errors/ERROR_CODE"
     }
   }
   
   Error Codes Catalog:
   ├── VALIDATION_ERROR (400)
   ├── UNAUTHORIZED (401)
   ├── FORBIDDEN (403)
   ├── RESOURCE_NOT_FOUND (404)
   ├── CONFLICT (409)
   ├── RATE_LIMIT_EXCEEDED (429)
   ├── INTERNAL_SERVER_ERROR (500)
   ├── SERVICE_UNAVAILABLE (503)
   └── GATEWAY_TIMEOUT (504)
   
   Implementation:
   File: src/shared/errors.ts
   
   export class AppError extends Error {
     constructor(
       public code: string,
       public message: string,
       public statusCode: number,
       public details?: any,
       public retryable: boolean = false
     ) {
       super(message);
       this.name = 'AppError';
     }
     
     toJSON() {
       return {
         error: {
           code: this.code,
           message: this.message,
           details: this.details,
           requestId: 'Set by Lambda context',
           timestamp: new Date().toISOString(),
           retryable: this.retryable,
           documentation: `https://docs.milkdelivery.com/errors/${this.code}`
         }
       };
     }
   }
   
   export class ValidationError extends AppError {
     constructor(message: string, field?: string) {
       super('VALIDATION_ERROR', message, 400, { field });
     }
   }
   
   export class InsufficientStockError extends AppError {
     constructor(productId: string, available: number, requested: number) {
       super(
         'INSUFFICIENT_STOCK',
         `Product has only ${available} units available`,
         400,
         { productId, available, requested }
       );
     }
   }
   
   Usage in Lambda:
   try {
     // ... validation logic
     if (stock < requestedQty) {
       throw new InsufficientStockError(productId, stock, requestedQty);
     }
   } catch (error) {
     if (error instanceof AppError) {
       return {
         statusCode: error.statusCode,
         body: JSON.stringify(error.toJSON())
       };
     }
     
     // Unknown error
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: {
           code: 'INTERNAL_SERVER_ERROR',
           message: 'An unexpected error occurred',
           requestId: context.requestId,
           timestamp: new Date().toISOString()
         }
       })
     };
   }

5. Logging Best Practices
   
   Structured Logging Format:
   {
     "timestamp": "2025-10-09T10:30:00.123Z",
     "level": "INFO|WARN|ERROR",
     "requestId": "req-abc-123",
     "userId": "user-456",
     "action": "CREATE_ORDER",
     "message": "Order created successfully",
     "context": {
       "orderId": "order-xyz-789",
       "totalAmount": 239.5,
       "itemCount": 2
     },
     "duration": 1234,
     "memoryUsed": 128
   }
   
   Implementation:
   File: src/shared/logger.ts
   
   export class Logger {
     private context: Record<string, any> = {};
     
     setContext(key: string, value: any) {
       this.context[key] = value;
     }
     
     info(message: string, data?: Record<string, any>) {
       this.log('INFO', message, data);
     }
     
     warn(message: string, data?: Record<string, any>) {
       this.log('WARN', message, data);
     }
     
     error(message: string, error?: Error, data?: Record<string, any>) {
       this.log('ERROR', message, {
         ...data,
         error: error?.message,
         stack: error?.stack
       });
     }
     
     private log(level: string, message: string, data?: Record<string, any>) {
       const logEntry = {
         timestamp: new Date().toISOString(),
         level,
         message,
         ...this.context,
         ...data
       };
       
       console.log(JSON.stringify(logEntry));
     }
   }
   
   Usage in Lambda:
   export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
     const logger = new Logger();
     logger.setContext('requestId', context.requestId);
     logger.setContext('functionName', context.functionName);
     
     const startTime = Date.now();
     
     try {
       logger.info('Order creation started', {
         userId: extractUserId(event)
       });
       
       const order = await createOrder(body);
       
       logger.info('Order created successfully', {
         orderId: order.orderId,
         totalAmount: order.totalAmount,
         duration: Date.now() - startTime
       });
       
       return successResponse(order);
     } catch (error) {
       logger.error('Order creation failed', error as Error, {
         userId: extractUserId(event),
         duration: Date.now() - startTime
       });
       
       return errorResponse(error);
     }
   };

Learning Outcome:
├── Edge cases identified and handled
├── Idempotency implemented
├── Circuit breaker pattern understood
├── Error handling standardized
├── Logging best practices applied
└── Production-ready code quality
```

---

## 6. LAMBDA FUNCTIONS: DEEP DIVE

### 6.1 Lambda Execution Model

**Cold Start vs Warm Start:**
```
Cold Start (First Invocation or After Idle):
├── AWS provisions execution environment
├── Downloads function code from S3
├── Initializes runtime (Node.js)
├── Executes initialization code (outside handler)
├── Executes handler function
└── Duration: 1-3 seconds (varies)

Warm Start (Subsequent Invocations):
├── Reuses existing execution environment
├── Skips initialization
├── Executes handler function only
└── Duration: 10-100 milliseconds

Optimization Strategy:
├── Initialize clients outside handler
├── Reuse database connections
├── Cache static data
└── Keep functions "warm" (CloudWatch Events ping)
```

**Example: Optimized Lambda Structure**
```typescript
// ✅ GOOD: Initialize outside handler
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Cache configuration (loaded once)
const config = {
  ordersTable: process.env.ORDERS_TABLE,
  minOrderValue: 100,
  taxRate: 0.05
};

export const handler = async (event, context) => {
  // Handler executes quickly, reusing connections
  const result = await docClient.get({
    TableName: config.ordersTable,
    Key: { orderId: event.pathParameters.orderId }
  });
  
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};

// ❌ BAD: Initialize inside handler
export const handler = async (event, context) => {
  const client = new DynamoDBClient({});  // Created every time!
  const docClient = DynamoDBDocumentClient.from(client);
  
  const result = await docClient.get({...});
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};
```

### 6.2 Memory and Timeout Configuration

**Memory Size Impact:**
```
Memory Configuration Options: 128 MB to 10,240 MB (10 GB)

Cost Calculation:
├── Price: $0.0000166667 per GB-second
├── 128 MB = 0.125 GB
├── Example: 1 million requests, 1 second each
│   ├── 128 MB: 1M * 1s * 0.125 GB * $0.0000166667 = $2.08
│   ├── 256 MB: 1M * 1s * 0.25 GB * $0.0000166667 = $4.17
│   ├── 512 MB: 1M * 1s * 0.5 GB * $0.0000166667 = $8.33
│   └── 1024 MB: 1M * 1s * 1 GB * $0.0000166667 = $16.67

Important: CPU power scales with memory
├── 128 MB = Low CPU power (slow execution)
├── 1024 MB = Proportional CPU (4x faster)
└── Paradox: Higher memory can be cheaper (faster execution)

Example Scenario:
├── Function with 128 MB: 2 seconds execution
│   └── Cost: 2s * 0.125 GB * $0.0000166667 = $0.0000041667
├── Same function with 512 MB: 0.6 seconds execution
│   └── Cost: 0.6s * 0.5 GB * $0.0000166667 = $0.0000050000
└── Verdict: 128 MB is cheaper in this case

Optimization Process:
1. Start with 512 MB (good balance)
2. Monitor CloudWatch metrics:
   ├── Duration
   ├── Memory Used
   └── Throttles
3. Adjust based on actual usage:
   ├── If memory used < 50%: Reduce memory
   ├── If duration consistently high: Increase memory
   └── Run load tests to find optimal setting

Your Learning Project:
├── Simple queries (getUser): 256 MB, 5s timeout
├── Order creation: 512 MB, 10s timeout
├── Image processing: 1024 MB, 30s timeout
└── Batch operations: 1024 MB, 60s timeout
```

**Timeout Configuration:**
```
Default: 3 seconds
Maximum: 15 minutes (900 seconds)
Recommendation: Set slightly higher than expected duration

Examples:
├── Simple CRUD: 5-10 seconds
├── API calls to third-party: 15-30 seconds
├── Complex calculations: 30-60 seconds
└── Batch processing: 5-15 minutes

Warning: Long timeouts increase cost if function hangs
├── Always implement timeout handling in code
└── Don't rely solely on Lambda timeout
```

### 6.3 Environment Variables & Secrets

**Environment Variables (SAM Template):**
```yaml
CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Environment:
      Variables:
        ORDERS_TABLE: !Ref OrdersTable
        USERS_TABLE: !Ref UsersTable
        MIN_ORDER_VALUE: '100'
        TAX_RATE: '0.05'
        STAGE: dev
        LOG_LEVEL: INFO
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'  # Reuse HTTP connections
```

**Secrets Management:**
```
❌ NEVER store sensitive data in environment variables:
├── API keys
├── Database passwords
├── Private keys
└── OAuth tokens

✅ Use AWS Secrets Manager:

1. Store secret:
$ aws secretsmanager create-secret \
  --name milk-delivery/stripe-api-key \
  --secret-string '{"apiKey":"sk_test_..."}'

2. Grant Lambda permission (SAM template):
CreateOrderFunction:
  Policies:
    - AWSSecretsManagerGetSecretValuePolicy:
        SecretArn: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:milk-delivery/*'

3. Retrieve in Lambda:
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretName: string) {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString!);
}

// Cache secret (avoid fetching on every invocation)
let stripeKey: string;

export const handler = async (event) => {
  if (!stripeKey) {
    const secret = await getSecret('milk-delivery/stripe-api-key');
    stripeKey = secret.apiKey;
  }
  
  // Use stripeKey
};

Cost: $0.40 per secret per month + $0.05 per 10,000 API calls
For learning: ~$0.40/month (1 secret, minimal calls)
```

### 6.4 Lambda Layers (Code Reuse)

**When to Use Layers:**
```
Use Cases:
├── Shared dependencies (AWS SDK, lodash, axios)
├── Common utilities (logger, validation, db helpers)
├── Large libraries (reduce deployment package size)
└── Code reuse across multiple functions

Benefits:
├── Faster deployments (layer unchanged, only function code updates)
├── Smaller deployment packages
├── Easier dependency management
└── Version control for shared code

Limitations:
├── Max 5 layers per function
├── Max 250 MB unzipped (all layers + function)
├── Layers are immutable (create new version to update)
```

**Creating a Lambda Layer:**
```
Directory Structure:
backend/
└── layers/
    └── common/
        ├── nodejs/
        │   ├── node_modules/  ← Dependencies
        │   └── utils/         ← Your utilities
        │       ├── logger.ts
        │       ├── db.ts
        │       └── validation.ts
        └── package.json

package.json:
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.400.0",
    "@aws-sdk/lib-dynamodb": "^3.400.0",
    "uuid": "^9.0.0"
  }
}

Build Layer:
$ cd layers/common/nodejs
$ npm install
$ cd ../..
$ zip -r common-layer.zip nodejs/

SAM Template:
CommonLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: milk-delivery-common
    Description: Shared utilities and dependencies
    ContentUri: layers/common/
    CompatibleRuntimes:
      - nodejs20.x
    RetentionPolicy: Retain

CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref CommonLayer
    CodeUri: dist/

Usage in Lambda:
// Import from layer
import { logger } from '/opt/nodejs/utils/logger';
import { v4 as uuidv4 } from 'uuid';  // From layer dependencies

export const handler = async (event) => {
  logger.info('Function started');
  const id = uuidv4();
  // ...
};
```

### 6.5 Lambda Monitoring Metrics

**Key CloudWatch Metrics:**
```
1. Invocations
   ├── Count: Total number of invocations
   ├── Use: Track function usage
   └── Free Tier: 1M invocations/month

2. Duration
   ├── Measure: Execution time in milliseconds
   ├── Use: Identify slow functions
   └── Optimization target: Keep under 1 second

3. Errors
   ├── Count: Failed invocations
   ├── Types: Function errors, timeout errors
   └── Goal: < 1% error rate

4. Throttles
   ├── Count: Rejected due to concurrency limits
   ├── Causes: Too many concurrent executions
   └── Solution: Increase reserved concurrency or optimize

5. Memory Usage
   ├── Measure: Actual memory used
   ├── Use: Right-size memory configuration
   └── Example: If using 150 MB of 512 MB, reduce to 256 MB

6. Concurrent Executions
   ├── Measure: Number of instances running simultaneously
   ├── Default limit: 1000 per region
   └── Free tier limit: Usually sufficient for learning

CloudWatch Logs Insights Queries:

Query 1: Average duration by function
fields @timestamp, @duration
| stats avg(@duration) as avg_duration by @function
| sort avg_duration desc

Query 2: Error count
filter @type = "ERROR"
| stats count() as error_count by bin(5m)

Query 3: Memory usage
fields @timestamp, @memorySize / 1000 / 1000 as mem_mb, @maxMemoryUsed / 1000 / 1000 as used_mb
| stats avg(used_mb) as avg_used, max(used_mb) as max_used

Query 4: Cold starts
filter @type = "REPORT"
| fields @duration, @initDuration
| filter ispresent(@initDuration)
| stats count() as cold_starts, avg(@initDuration) as avg_cold_start_ms
```

### 6.6 Lambda Cost Optimization

**Free Tier Maximization:**
```
Lambda Free Tier (Always Free):
├── 1M requests per month
├── 400,000 GB-seconds compute time per month

Calculation Examples:

Scenario 1: 128 MB function, 200ms execution
├── Compute: 0.2s * 0.125 GB = 0.025 GB-seconds per request
├── Free tier allows: 400,000 / 0.025 = 16M requests
├── But request limit is 1M, so effective limit: 1M requests
└── Verdict: Request limit is constraint, not compute

Scenario 2: 1024 MB function, 1s execution
├── Compute: 1s * 1 GB = 1 GB-second per request
├── Free tier allows: 400,000 / 1 = 400,000 requests
├── But request limit is 1M
└── Verdict: Compute is constraint, only 400K requests free

Your Learning Project Estimate:
├── Average: 512 MB, 500ms execution
├── Compute per request: 0.5s * 0.5 GB = 0.25 GB-seconds
├── Free tier allows: 400,000 / 0.25 = 1.6M requests
├── Your usage: ~10,000 requests/month during development
└── Cost: $0 (well within free tier)

Cost After Free Tier:
├── Requests: $0.20 per 1M requests
├── Compute: $0.0000166667 per GB-second
└── Your 10K requests: ~$0.02/month

Optimization Tips:
1. Reduce memory if not fully utilized
2. Optimize code for faster execution
3. Use layers for shared dependencies
4. Implement caching where possible
5. Batch operations when feasible
6. Monitor and eliminate unnecessary invocations
```

---

## 7. DYNAMODB: QUERY PATTERNS & OPTIMIZATION

### 7.1 Key Concepts

**Partition Key (PK) vs Sort Key (SK):**
```
Partition Key (Required):
├── Determines which partition data is stored in
├── Must be unique for each item (if no sort key)
├── Used for direct lookups: GetItem, PutItem
└── Example: userId, orderId, productId

Sort Key (Optional):
├── Allows multiple items with same partition key
├── Items sorted by sort key value
├── Enables range queries
└── Example: timestamp, status, category

Table Design Pattern 1: Simple (PK only)
Users Table:
PK: userId
├── user-001
├── user-002
└── user-003

Query: Get user by ID
const result = await docClient.get({
  TableName: 'Users',
  Key: { userId: 'user-001' }
});

Table Design Pattern 2: Composite Key (PK + SK)
Orders Table:
PK: userId, SK: orderId
├── user-001, order-2025-001
├── user-001, order-2025-002
├── user-002, order-2025-003
└── user-002, order-2025-004

Query: Get all orders for a user
const result = await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-001'
  }
});

Result: Returns order-2025-001 and order-2025-002
```

**Global Secondary Index (GSI):**
```
Purpose: Query table using different keys

Example Problem:
Users Table: PK = userId
├── You can query by userId
└── But you cannot query by email

Solution: Create GSI on email

GSI: email-index
PK: email
├── Allows query by email
└── Returns userId

Query: Find user by email
const result = await docClient.query({
  TableName: 'Users',
  IndexName: 'email-index',
  KeyConditionExpression: 'email = :email',
  ExpressionAttributeValues: {
    ':email': 'user@example.com'
  }
});

GSI Considerations:
├── Cost: Consumes additional WCU/RCU
├── Eventual consistency: Slight delay (usually milliseconds)
├── Projection: Choose ALL, KEYS_ONLY, or INCLUDE
└── Free Tier: Included in 25 WCU/RCU limit

SAM Template:
UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    AttributeDefinitions:
      - AttributeName: userId
        AttributeType: S
      - AttributeName: email
        AttributeType: S
    KeySchema:
      - AttributeName: userId
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: email-index
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        Projection:
          ProjectionType: ALL
    BillingMode: PAY_PER_REQUEST
```

### 7.2 Query vs Scan

**Query (Efficient):**
```
Characteristics:
├── Uses partition key (required)
├── Optionally uses sort key for range
├── Returns only matching items
├── Fast and cost-effective
└── Use whenever possible

Example: Get all orders for a user
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-123'
  }
});

Cost: 1 RCU per 4 KB read (eventually consistent)
Example: 10 orders, 1 KB each = 10 KB = 3 RCUs
```

**Scan (Inefficient):**
```
Characteristics:
├── Reads entire table
├── Filters after reading (wasteful)
├── Slow and expensive
├── Consumes RCUs for all items scanned
└── Avoid in production

Example: Find all orders with status="Pending" (BAD!)
await docClient.scan({
  TableName: 'Orders',
  FilterExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Problem:
├── Scans all 10,000 orders
├── Filters to 100 pending orders
├── Consumes RCUs for all 10,000 items
└── Returns only 100 items

Cost: If 10,000 items * 1 KB = 10,000 KB = 2,500 RCUs
(Way over free tier 25 RCU limit!)

Solution: Use GSI
Create GSI: status-index (PK: status, SK: createdAt)

Query with GSI:
await docClient.query({
  TableName: 'Orders',
  IndexName: 'status-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Cost: Only reads 100 pending orders = 25 RCUs
Savings: 100x reduction!
```

### 7.3 Batch Operations

**BatchGetItem:**
```
Purpose: Retrieve multiple items in one request

Limitations:
├── Max 100 items per request
├── Max 16 MB total response# SOLO DEVELOPER GUIDE - AWS FREE TIER OPTIMIZED
## Milk & Milk Products Delivery Platform (Comprehensive Learning Project)

---

## TABLE OF CONTENTS
1. [Solo Developer Workflow & Mindset](#solo-developer-workflow-mindset)
2. [AWS Free Tier: Complete Strategy](#aws-free-tier-complete-strategy)
3. [Development Environment Setup](#development-environment-setup)
4. [Hybrid Development: Console + VS Code](#hybrid-development-console-vs-code)
5. [Feature Development Flow (Step-by-Step)](#feature-development-flow)
6. [Lambda Functions: Deep Dive](#lambda-functions-deep-dive)
7. [DynamoDB: Query Patterns & Optimization](#dynamodb-query-patterns-optimization)
8. [API Gateway: Configuration & Testing](#api-gateway-configuration-testing)
9. [Authentication & Authorization](#authentication-authorization)
10. [Error Handling & Edge Cases](#error-handling-edge-cases)
11. [Testing Strategies](#testing-strategies)
12. [Monitoring & Debugging](#monitoring-debugging)
13. [CI/CD Pipeline Setup](#cicd-pipeline-setup)
14. [Cost Optimization Techniques](#cost-optimization-techniques)
15. [Security Best Practices](#security-best-practices)
16. [Performance Optimization](#performance-optimization)
17. [Common Pitfalls & Solutions](#common-pitfalls-solutions)
18. [Learning Path & Milestones](#learning-path-milestones)

---

## 1. SOLO DEVELOPER WORKFLOW & MINDSET

### 1.1 Daily Development Routine

**Realistic Time Allocation (3-4 hours/day):**

```
Morning Session (1.5-2 hours)
├── 00:00-00:10 → Review AWS costs (console billing dashboard)
├── 00:10-00:20 → Check CloudWatch logs for overnight errors
├── 00:20-00:30 → Plan today's feature (write in docs/daily-log.md)
├── 00:30-01:45 → Development work (focus time, no distractions)
└── 01:45-02:00 → Commit code & push to GitHub

Evening Session (1.5-2 hours)
├── 00:00-01:00 → Continue feature development or bug fixes
├── 01:00-01:20 → Testing (local + deployed)
├── 01:20-01:40 → Documentation (update API docs, learning notes)
├── 01:40-01:50 → Deploy to AWS (if ready)
└── 01:50-02:00 → Plan tomorrow's task + update Kanban board
```

**Weekly Rhythm:**
```
Monday: Start new feature (backend)
Tuesday: Complete feature + unit tests
Wednesday: Integration + API Gateway setup
Thursday: Frontend integration
Friday: End-to-end testing + documentation
Saturday: Deployment + monitoring
Sunday: Review week, plan next week, learn new AWS concept
```

### 1.2 Solo Developer's Development Phases

**Phase 1: MVP Foundation (Week 1-3)**
```
Week 1: Infrastructure Setup
├── Day 1-2: AWS account setup, IAM users, billing alerts
├── Day 3-4: First Lambda function (Hello World → createUser)
├── Day 5-6: DynamoDB table creation + manual data entry
└── Day 7: First API endpoint working end-to-end

Week 2: User Management
├── Day 1-2: User registration with validation
├── Day 3-4: User login (Cognito integration)
├── Day 5-6: User profile management
└── Day 7: Testing + bug fixes

Week 3: Product Catalog
├── Day 1-3: Product listing + search
├── Day 4-5: Product details + images (S3)
├── Day 6: Vendor management basics
└── Day 7: Integration testing
```

**Phase 2: Core Business Logic (Week 4-8)**
```
Week 4: Order Creation Flow
├── Shopping cart logic (frontend state)
├── Order validation
├── Inventory checking
└── Order creation Lambda

Week 5: Payment Integration
├── Stripe/Razorpay SDK setup
├── Payment flow (test mode)
├── Payment webhooks
└── Order confirmation

Week 6: Step Functions
├── Order processing workflow
├── Inventory reservation
├── Vendor notifications
└── State machine testing

Week 7: Delivery Management
├── Delivery scheduling
├── Status updates
├── Notifications (SNS/SES)
└── Delivery tracking

Week 8: Integration & Bug Fixes
├── End-to-end testing
├── Edge case handling
├── Performance optimization
└── Documentation
```

**Phase 3: Frontend & Polish (Week 9-12)**
```
Week 9-10: React Frontend
├── Component development
├── State management (Redux/Zustand)
├── API integration
└── Responsive design

Week 11: Advanced Features
├── User dashboard
├── Order history
├── Admin panel basics
└── Analytics

Week 12: Deployment & Launch
├── Production deployment
├── Performance tuning
├── Security audit
└── Final testing
```

### 1.3 Task Management (Solo Approach)

**Simple Kanban Board (GitHub Projects or Trello):**
```
Backlog → Todo → In Progress → Testing → Done
```

**Sample Tasks Breakdown:**
```yaml
Epic: User Management
  Story: User Registration
    Task: Create DynamoDB Users table
    Task: Create createUser Lambda
    Task: Add validation logic
    Task: Set up API Gateway endpoint
    Task: Write unit tests
    Task: Test in console
    Task: Deploy with SAM
    Task: Integration test
    
  Story: User Login
    Task: Configure Cognito User Pool
    Task: Create login API
    Task: JWT token validation
    Task: Test authentication flow
```

### 1.4 Learning Mindset

**Document Everything:**
```
docs/
├── daily-log.md           # What you learned today
├── mistakes.md            # Errors and how you fixed them
├── aws-concepts.md        # AWS services explained in your words
├── design-decisions.md    # Why you chose X over Y
└── helpful-resources.md   # Useful articles, videos, docs
```

**Sample daily-log.md entry:**
```markdown
# Day 15 - October 10, 2025

## What I Built Today
- Completed createOrder Lambda function
- Added inventory validation
- Set up Step Functions for order processing

## What I Learned
- DynamoDB transactions prevent race conditions
- Lambda cold starts can be 1-2 seconds (need to optimize)
- Step Functions are billed per state transition ($0.025/1000)

## Problems I Faced
- Issue: Lambda timeout after 3 seconds
- Solution: Increased timeout to 10s, optimized DynamoDB query
- Learning: Always use indexes for queries, not scans!

## Tomorrow's Plan
- Add payment integration (Stripe test mode)
- Write unit tests for createOrder
- Deploy to dev environment
```

---

## 2. AWS FREE TIER: COMPLETE STRATEGY

### 2.1 Detailed Free Tier Limits

**Always Free (No Time Limit):**
```yaml
Lambda:
  Requests: 1,000,000 per month
  Compute: 400,000 GB-seconds per month
  Example: 
    - 1M invocations with 128MB = ~51 hours compute
    - Roughly 3,200 requests/day with 128MB, 1s execution
  Your Usage: Likely 100-500 requests/day during development
  Status: ✅ Safe

DynamoDB:
  Storage: 25 GB
  WCU: 25 (write capacity units)
  RCU: 25 (read capacity units)
  Example:
    - 25 WCU = 25 writes/sec or 2.1M writes/day
    - 25 RCU = 100 eventual reads/sec or 8.6M reads/day
  Your Usage: Maybe 50-100 operations/day in development
  Status: ✅ Very safe
  
  Important: Use on-demand billing mode
    - No upfront capacity planning
    - Pay only for actual reads/writes
    - First 25 WCU/RCU free, then $1.25/$0.25 per million

S3:
  Storage: 5 GB Standard storage
  GET: 20,000 requests
  PUT: 2,000 requests
  Data Transfer: 100 GB out per month (first 12 months)
  Your Usage: 10-50 MB for product images in development
  Status: ✅ Safe

CloudWatch:
  Logs: 5 GB ingestion, 5 GB storage
  Metrics: 10 custom metrics
  Alarms: 10 alarms
  Dashboard: 3 dashboards
  Your Usage: 100-500 MB logs/month during development
  Status: ✅ Safe

SNS:
  Email: 1,000 notifications/month (12 months free)
  SMS: 100 notifications/month (12 months free)
  HTTP: 100,000 notifications/month (12 months free)
  After 12 months: $0.50 per million emails
  Your Usage: 10-50 emails/month for testing
  Status: ⚠️ Be careful with SMS after year 1

SES (Simple Email Service):
  Emails: 62,000 per month (always free if sent from EC2)
  From Lambda: 3,000 per month free (12 months)
  After: $0.10 per 1,000 emails
  Your Usage: 10-100 emails/month
  Status: ✅ Safe, better than SNS for emails

Cognito:
  MAU: 50,000 monthly active users (always free)
  Your Usage: 1-10 test users
  Status: ✅ Very safe
```

**12 Months Free (After Sign-up):**
```yaml
API Gateway:
  REST API: 1,000,000 requests per month
  After: $3.50 per million requests
  Your Usage: 100-1,000 requests/day = 3,000-30,000/month
  Status: ✅ Safe during free tier
  Strategy: After 1 year, consider Lambda Function URLs (free)

CloudFront:
  Data Transfer: 1 TB out
  Requests: 10,000,000 HTTP/HTTPS
  After: $0.085 per GB + $0.0075 per 10,000 requests
  Your Usage: Don't use during development
  Status: ⚠️ Use only for production launch
```

**Services to AVOID (Cost Traps):**
```yaml
❌ NAT Gateway:
  Cost: $0.045/hour = $32.40/month + data transfer
  Why avoid: Expensive for learning
  Alternative: Lambda functions don't need NAT (direct internet)

❌ Application Load Balancer:
  Cost: $0.0225/hour = $16.20/month + LCU charges
  Why avoid: Unnecessary for serverless
  Alternative: API Gateway (free tier) or Lambda Function URLs

❌ RDS:
  Free tier: 750 hours/month for 12 months (db.t2.micro)
  After: Minimum $15-20/month
  Why avoid: Not needed, use DynamoDB
  Alternative: DynamoDB (always free up to limits)

❌ ECS/EKS:
  ECS: $0.10/hour per running task
  EKS: $0.10/hour for control plane = $73/month
  Why avoid: Overkill for learning serverless
  Alternative: Lambda functions

❌ ElastiCache:
  Free tier: None
  Cost: Minimum $13/month
  Why avoid: Not needed for MVP
  Alternative: In-memory caching in Lambda

❌ Elasticsearch:
  Free tier: None
  Cost: Minimum $23/month
  Why avoid: Expensive
  Alternative: DynamoDB queries + GSIs
```

### 2.2 Cost Monitoring Setup (Critical!)

**Step 1: Set Up Billing Alerts (Day 1 Task)**
```
AWS Console → Billing Dashboard → Billing Preferences
├── ✅ Receive PDF Invoice By Email
├── ✅ Receive Free Tier Usage Alerts (your email)
├── ✅ Receive Billing Alerts
└── Save preferences

AWS Console → CloudWatch → Alarms → Billing
├── Create Alarm: Estimated Charges > $5
├── Create Alarm: Estimated Charges > $10
├── Create Alarm: Estimated Charges > $20
└── SNS Topic: Email notification to yourself
```

**Step 2: Daily Cost Check Routine**
```
Every Morning (5 minutes):
├── AWS Console → Billing Dashboard
├── Check "Month-to-Date Spend"
├── Review "Free Tier Usage" (shows % consumed)
└── If over $5: Investigate "Cost Explorer"

Expected Daily Costs During Development:
├── Days 1-30: $0.00 - $0.50/day (within free tier)
├── Days 31-60: $0.50 - $1.00/day (learning curve)
├── Days 61-90: $0.20 - $0.50/day (optimized)
└── Goal: Stay under $10/month
```

**Step 3: AWS Cost Explorer Tags**
```
Tag all resources for tracking:
├── Environment: dev
├── Project: milk-delivery
├── Owner: your-name
└── Cost-Center: learning

Example in SAM template:
Tags:
  Environment: dev
  Project: milk-delivery
  Owner: solo-developer
```

### 2.3 Free Tier Budget Calculator

**Your Estimated Monthly Usage:**
```yaml
Service            | Free Tier    | Your Usage  | Cost Impact
-------------------|--------------|-------------|-------------
Lambda             | 1M requests  | 10,000      | $0.00
DynamoDB           | 25 WCU/RCU   | 1,000 ops   | $0.00
API Gateway        | 1M requests  | 10,000      | $0.00 (Year 1)
S3                 | 5 GB         | 100 MB      | $0.00
CloudWatch Logs    | 5 GB         | 500 MB      | $0.00
SES                | 62,000 emails| 50 emails   | $0.00
Cognito            | 50k MAU      | 5 users     | $0.00
Step Functions     | 4,000 states | 100 states  | $0.00
-------------------|--------------|-------------|-------------
TOTAL                                           | $0.00-$2.00

Potential Charges:
- API Gateway (after Year 1): ~$0.04/month
- Data Transfer Out: ~$0.50/month (minimal testing)
- CloudWatch (if over 5GB logs): ~$1.00/month

Expected Total: $0-5/month during development
```

---

## 3. DEVELOPMENT ENVIRONMENT SETUP

### 3.1 Machine Requirements

**Minimum Specifications:**
```yaml
Operating System: Windows 10/11, macOS, or Linux
Processor: Intel i3 or equivalent (dual-core)
RAM: 8 GB minimum, 16 GB recommended
Storage: 20 GB free space (for Node.js, Docker, projects)
Internet: Stable connection (AWS API calls)
```

**Recommended Setup:**
```yaml
OS: Windows 11 or macOS
RAM: 16 GB (Docker + VS Code + Browser = memory hungry)
Storage: SSD with 50 GB free (faster builds)
Internet: 10 Mbps+ (for video tutorials, AWS console)
```

### 3.2 Software Installation (Step-by-Step)

**Step 1: Install Node.js**
```
What: JavaScript runtime for Lambda development
Why: Lambda supports Node.js 20.x runtime
Where: https://nodejs.org/en/download

Installation:
├── Download Node.js 20.x LTS installer
├── Run installer (default options are fine)
├── Verify installation:
│   ├── Open terminal/command prompt
│   ├── Type: node --version (should show v20.x.x)
│   └── Type: npm --version (should show v10.x.x)
└── Done!

Post-Install Configuration:
├── Set npm global directory (avoid permission issues)
│   └── npm config set prefix ~/.npm-global (Mac/Linux)
│       or C:\Users\YourName\AppData\Roaming\npm (Windows)
└── Update npm: npm install -g npm@latest
```

**Step 2: Install AWS CLI**
```
What: Command-line tool to interact with AWS services
Why: Deploy resources, check logs, manage services
Where: https://aws.amazon.com/cli/

Windows:
├── Download MSI installer
├── Run installer
└── Verify: aws --version

macOS:
├── Option 1: Homebrew
│   └── brew install awscli
├── Option 2: Official installer
│   └── Download .pkg file
└── Verify: aws --version

Linux:
├── curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
├── unzip awscliv2.zip
├── sudo ./aws/install
└── Verify: aws --version

Configuration:
├── Run: aws configure
├── AWS Access Key ID: [Get from IAM console]
├── AWS Secret Access Key: [Get from IAM console]
├── Default region name: us-east-1
└── Default output format: json
```

**Step 3: Install AWS SAM CLI**
```
What: Framework for building serverless applications
Why: Local testing, easy deployment, IaC with templates
Where: https://aws.amazon.com/serverless/sam/

Windows:
├── Download MSI installer
├── Run installer (requires admin rights)
└── Verify: sam --version

macOS:
├── Homebrew: brew install aws-sam-cli
└── Verify: sam --version

Linux:
├── Download ZIP file
├── Unzip and install
└── Verify: sam --version

SAM Prerequisites:
├── Docker Desktop (for sam local commands)
│   └── Download from: https://www.docker.com/products/docker-desktop
└── Python 3.8+ (usually pre-installed on Mac/Linux)
```

**Step 4: Install Visual Studio Code**
```
What: Code editor with excellent AWS support
Why: Best IDE for serverless development
Where: https://code.visualstudio.com/

Installation:
├── Download installer for your OS
├── Run installer
├── Launch VS Code
└── Done!

Essential Extensions (Install via Extensions panel):
├── AWS Toolkit (amazonwebservices.aws-toolkit-vscode)
│   └── Integrates AWS services into VS Code
├── ESLint (dbaeumer.vscode-eslint)
│   └── JavaScript/TypeScript linting
├── Prettier (esbenp.prettier-vscode)
│   └── Code formatting
├── Thunder Client (rangav.vscode-thunder-client)
│   └── API testing (like Postman, but in VS Code)
├── GitLens (eamodio.gitlens)
│   └── Git history and blame annotations
├── Docker (ms-azuretools.vscode-docker)
│   └── Manage Docker containers
└── REST Client (humao.rest-client)
    └── Test HTTP requests from .http files
```

**Step 5: Install Git**
```
What: Version control system
Why: Code versioning, GitHub integration
Where: https://git-scm.com/downloads

Installation:
├── Download installer
├── Run with default options
└── Verify: git --version

Configuration:
├── git config --global user.name "Your Name"
├── git config --global user.email "your.email@example.com"
└── git config --global init.defaultBranch main
```

**Step 6: Optional but Recommended Tools**
```
Docker Desktop:
├── Required for: sam local invoke, sam local start-api
├── Download: https://www.docker.com/products/docker-desktop
└── Purpose: Run Lambda functions locally in containers

Postman (Alternative to Thunder Client):
├── Download: https://www.postman.com/downloads/
└── Purpose: API testing with collections

DynamoDB Local (Optional):
├── Download: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
└── Purpose: Test DynamoDB operations without AWS connection
```

### 3.3 AWS Account Setup

**Step 1: Create AWS Account**
```
Go to: https://aws.amazon.com/free

Sign Up Process:
├── 1. Email and password
├── 2. Account type: Personal
├── 3. Contact information
├── 4. Payment information (required, but won't charge if stay in free tier)
├── 5. Identity verification (phone call)
└── 6. Select Support Plan: Basic (Free)

⚠️ Important:
- Use a credit/debit card with at least $1 for verification
- Set up billing alerts immediately
- Enable MFA (Multi-Factor Authentication) for root account
```

**Step 2: Secure Root Account**
```
After Sign-up:
├── 1. Go to IAM → Dashboard
├── 2. Enable MFA for root account
│   ├── Use Google Authenticator, Authy, or hardware token
│   └── NEVER share MFA codes
├── 3. Create IAM user for daily use (don't use root)
└── 4. Delete root access keys if created
```

**Step 3: Create IAM User (For Development)**
```
IAM → Users → Add User

User Details:
├── Username: milk-delivery-dev
├── Access type: ✅ Programmatic access (for AWS CLI)
│              ✅ AWS Management Console access (for console)
└── Console password: Auto-generated or custom

Permissions:
├── Attach existing policies directly:
│   ├── ✅ AdministratorAccess (for learning only)
│   │   └── ⚠️ In production, use least-privilege policies
│   └── Or create custom policy (see below)
└── Tags:
    ├── Environment: dev
    └── Purpose: learning

Download Credentials:
├── Save Access Key ID
├── Save Secret Access Key
└── Store securely (password manager recommended)

Configure AWS CLI:
├── aws configure --profile milk-delivery-dev
├── Enter Access Key ID
├── Enter Secret Access Key
├── Region: us-east-1
└── Output: json
```

**Custom IAM Policy (Least Privilege for Learning):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "dynamodb:*",
        "apigateway:*",
        "s3:*",
        "cloudformation:*",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "logs:*",
        "events:*",
        "sns:*",
        "ses:*",
        "cognito-idp:*",
        "states:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3.4 VS Code Configuration

**Workspace Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true,
  "files.autoSave": "onFocusChange",
  "typescript.preferences.importModuleSpecifier": "relative",
  "aws.samcli.location": "/usr/local/bin/sam",
  "aws.profile": "milk-delivery-dev",
  "aws.region": "us-east-1",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

**Launch Configuration (.vscode/launch.json):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Lambda (SAM)",
      "type": "node",
      "request": "attach",
      "address": "localhost",
      "port": 5858,
      "localRoot": "${workspaceFolder}/backend/src",
      "remoteRoot": "/var/task",
      "protocol": "inspector",
      "stopOnEntry": false
    }
  ]
}
```

---

## 4. HYBRID DEVELOPMENT: CONSOLE + VS CODE

### 4.1 Philosophy: When to Use What

**AWS Console is BEST for:**
```
✅ Visual Learning & Exploration
   ├── Understanding service dashboards
   ├── Exploring service features and options
   ├── Reading integrated documentation
   └── Seeing visual representations (Step Functions graphs)

✅ One-Time Setup Tasks
   ├── Creating Cognito User Pool (complex configuration)
   ├── Setting up billing alerts
   ├── Creating IAM roles and policies (first time)
   ├── Configuring CloudWatch dashboards
   └── Setting up SNS/SES email verification

✅ Quick Testing & Debugging
   ├── Testing Lambda with sample events
   ├── Viewing DynamoDB table data
   ├── Checking CloudWatch logs in real-time
   ├── Testing API Gateway endpoints manually
   └── Viewing Step Functions execution history

✅ Monitoring & Operations
   ├── CloudWatch Logs Insights queries
   ├── Viewing metrics and graphs
   ├── Checking service quotas and limits
   ├── Cost analysis and billing reports
   └── Resource utilization dashboards
```

**VS Code is BEST for:**
```
✅ All Code Development
   ├── Writing Lambda functions
   ├── TypeScript/JavaScript development
   ├── Creating unit tests
   ├── Shared utilities and libraries
   └── Frontend React components

✅ Infrastructure as Code (IaC)
   ├── SAM templates (template.yaml)
   ├── CloudFormation templates
   ├── Environment configuration files
   └── Deployment scripts

✅ Version Control
   ├── Git commits and branching
   ├── Code reviews (self-review before commit)
   ├── Merge conflict resolution
   └── GitHub integration

✅ Local Development & Testing
   ├── sam local invoke (test Lambda locally)
   ├── sam local start-api (local API Gateway)
   ├── Unit tests with Jest
   ├── Integration tests
   └── Debugging with breakpoints

✅ Batch Operations
   ├── Creating multiple Lambda functions
   ├── Updating multiple files at once
   ├── Search and replace across project
   └── Refactoring code
```

### 4.2 Hybrid Workflow Patterns

**Pattern 1: Learning a New Service**
```
Example: Setting up DynamoDB for the first time

Step 1: AWS Console (30 minutes)
├── Navigate to DynamoDB service
├── Click "Create table"
├── Experiment with different settings:
│   ├── Partition key vs. Sort key
│   ├── Provisioned vs. On-demand
│   ├── Global Secondary Indexes (GSI)
│   └── Stream settings
├── Create a test table manually
├── Add sample items via console
├── Try different queries in console
└── Learn query vs. scan difference

Step 2: VS Code (30 minutes)
├── Create SAM template with DynamoDB resource
├── Define table schema in YAML
├── Add GSI definitions
├── Write Lambda function to interact with table
└── Test locally with DynamoDB Local or deployed table

Step 3: AWS Console (15 minutes)
├── Deploy via SAM from VS Code terminal
├── Verify table creation in console
├── Check table metrics
└── Validate data structure

Result: You understand DynamoDB AND have IaC code
```

**Pattern 2: Developing a New Lambda Function**
```
Example: Creating "createOrder" Lambda

Step 1: Console Prototype (15 minutes)
├── AWS Console → Lambda → Create function
├── Name: createOrderPrototype
├── Runtime: Node.js 20.x
├── Write basic handler code inline
├── Create test event with sample JSON:
│   {
│     "userId": "user-123",
│     "items": [{"productId": "prod-1", "quantity": 2}]
│   }
├── Test and see output
├── Fix any immediate errors
└── Verify basic logic works

Step 2: VS Code Development (2 hours)
├── Create file: backend/src/lambdas/order/createOrder.ts
├── Copy working logic from console
├── Add TypeScript types and interfaces
├── Implement proper error handling
├── Add input validation
├── Add logging
├── Add to SAM template
├── Write unit tests
└── Test locally: sam local invoke

Step 3: Console Debugging (20 minutes)
├── Deploy from VS Code: sam deploy
├── Go to AWS Console → Lambda → createOrder
├── Test with real event
├── Check CloudWatch logs
├── Identify any AWS-specific issues
└── Note execution time and memory usage

Step 4: VS Code Refinement (30 minutes)
├── Fix issues found in console testing
├── Optimize memory settings in SAM template
├── Adjust timeout if needed
├── Update documentation
└── Redeploy: sam deploy

Result: Production-ready Lambda with IaC
```

**Pattern 3: API Gateway Setup**
```
Example: Creating REST API with multiple endpoints

Step 1: Console Exploration (30 minutes)
├── AWS Console → API Gateway
├── Create REST API (not HTTP API)
├── Manually create one resource: /users
├── Add POST method
├── Link to Lambda function (console UI)
├── Configure CORS manually
├── Deploy to "dev" stage
├── Test with API Gateway test feature
└── Understand request/response transformation

Step 2: VS Code IaC (1 hour)
├── Add API Gateway to SAM template
├── Define all resources and methods in YAML
├── Configure Cognito authorizer
├── Set up request validators
├── Configure CORS in template
├── Add multiple endpoints
└── Deploy entire API: sam deploy

Step 3: Console Validation (15 minutes)
├── Check deployed API in console
├── Verify all endpoints exist
├── Test each endpoint
├── Check authorization works
└── Review API Gateway logs

Result: Complete API defined in code, easy to replicate
```

### 4.3 AWS Toolkit Extension (The Bridge)

**Installation & Setup:**
```
Step 1: Install Extension
├── Open VS Code
├── Go to Extensions (Ctrl+Shift+X)
├── Search: "AWS Toolkit"
├── Install "AWS Toolkit" by Amazon Web Services
└── Restart VS Code

Step 2: Connect to AWS
├── Click AWS icon in left sidebar
├── Click "Connect to AWS"
├── Select profile: milk-delivery-dev
└── Region: us-east-1

Step 3: Verify Connection
├── Expand "Lambda" in sidebar
├── You should see all deployed functions
├── Expand "DynamoDB"
├── You should see all tables
└── Success!
```

**Key Features You'll Use Daily:**

**1. Lambda Functions**
```
What you can do from VS Code:
├── View all deployed Lambda functions
├── Invoke function remotely (without console)
│   ├── Right-click function
│   ├── Select "Invoke on AWS"
│   ├── Choose test event
│   └── See results in VS Code
├── Download function code
│   ├── Right-click function
│   ├── Select "Download Lambda"
│   └── Code appears in VS Code
└── View CloudWatch logs
    ├── Right-click function
    ├── Select "View CloudWatch Logs"
    └── Logs stream in VS Code terminal

Example Workflow:
├── Deploy function from VS Code terminal: sam deploy
├── Test directly from VS Code using AWS Toolkit
├── View logs without switching to browser
└── Make changes and redeploy, all in one place
```

**2. DynamoDB Tables**
```
What you can do from VS Code:
├── Browse table data
│   ├── Expand DynamoDB in AWS Toolkit
│   ├── Right-click table
│   ├── Select "View Table"
│   └── See items in VS Code panel
├── Run queries
│   ├── Click "Query" button
│   ├── Enter partition key value
│   ├── Execute
│   └── Results appear in VS Code
├── Download items as JSON
│   ├── Right-click items
│   ├── Select "Download items"
│   └── Save to file
└── Insert test data
    ├── Right-click table
    ├── Select "Insert Item"
    └── Paste JSON

Example Workflow:
├── Check if user exists in database
├── Query directly from VS Code
├── No need to open AWS Console
└── Copy user data for test event
```

**3. CloudWatch Logs**
```
What you can do from VS Code:
├── View log groups
├── Stream logs in real-time
│   ├── Right-click Lambda function
│   ├── Select "View CloudWatch Logs"
│   ├── Logs appear in VS Code terminal
│   └── Auto-refreshes with new logs
├── Search logs
│   ├── Use Ctrl+F in log panel
│   └── Filter by text
└── Download logs for analysis

Example Workflow:
├── Deploy Lambda function
├── Invoke from VS Code
├── Instantly see logs in VS Code
├── Debug without opening console
└── Faster iteration cycle
```

**4. S3 Buckets**
```
What you can do from VS Code:
├── Browse bucket contents
├── Upload files
│   ├── Right-click bucket
│   ├── Select "Upload File"
│   └── Choose file from system
├── Download files
│   ├── Right-click file
│   ├── Select "Download"
│   └── Save to local folder
└── Delete files

Example Workflow:
├── Upload product images
├── Get S3 URL for DynamoDB
├── All without leaving VS Code
```

**5. Step Functions**
```
What you can do from VS Code:
├── View state machines
├── Start execution
│   ├── Right-click state machine
│   ├── Select "Start Execution"
│   ├── Provide input JSON
│   └── Execution starts
├── View execution history
└── Download execution results

Example Workflow:
├── Test order processing workflow
├── Start execution from VS Code
├── Check status in toolkit
├── View results inline
```

### 4.4 Detailed Workflow Examples

**Example 1: Building User Registration (Complete Flow)**

**Day 1 Morning: Console Exploration (1 hour)**
```
Task: Understand what you need to build

1. Research Phase (AWS Console)
   ├── Navigate to Cognito
   ├── Read "What is Amazon Cognito?"
   ├── Create a test User Pool
   │   ├── Pool name: milk-delivery-users-test
   │   ├── Standard attributes: email, name, phone
   │   ├── Password policy: default
   │   ├── MFA: Optional (for learning)
   │   └── Create pool
   ├── Create test user manually
   │   ├── Username: testuser@example.com
   │   ├── Temporary password: Test@1234
   │   └── Verify user can login
   └── Test user login in Cognito UI
   
2. DynamoDB Exploration (AWS Console)
   ├── Navigate to DynamoDB
   ├── Create table: Users
   │   ├── Partition key: userId (String)
   │   ├── Billing mode: On-demand
   │   └── Create table
   ├── Add sample user item manually:
   │   {
   │     "userId": "user-001",
   │     "email": "test@example.com",
   │     "name": "Test User",
   │     "phone": "+1234567890",
   │     "role": "Customer",
   │     "createdAt": "2025-10-09T10:00:00Z"
   │   }
   └── Verify item appears in table

3. Lambda Exploration (AWS Console)
   ├── Navigate to Lambda
   ├── Create function: createUserTest
   ├── Write minimal code inline:
   │   exports.handler = async (event) => {
   │     console.log('Received event:', event);
   │     return {
   │       statusCode: 200,
   │       body: JSON.stringify({ message: 'User created' })
   │     };
   │   };
   ├── Test with sample event:
   │   {
   │     "body": "{\"email\":\"new@example.com\",\"name\":\"New User\"}"
   │   }
   └── Verify it returns 200 OK

Learning Outcome:
├── Understand Cognito concepts
├── See DynamoDB table structure
├── Know Lambda basic structure
└── Ready to code properly in VS Code
```

**Day 1 Afternoon: VS Code Development (2-3 hours)**
```
Task: Build production-ready createUser Lambda

1. Project Setup (VS Code Terminal)
   $ cd ~/projects
   $ mkdir milk-delivery-platform
   $ cd milk-delivery-platform
   $ sam init
   ├── Choose: 1 - AWS Quick Start Templates
   ├── Choose: 1 - Hello World Example
   ├── Runtime: nodejs20.x
   ├── Name: milk-delivery
   └── Project created!

2. Project Structure Organization
   milk-delivery-platform/
   ├── backend/
   │   ├── src/
   │   │   ├── lambdas/
   │   │   │   └── user/
   │   │   │       ├── createUser.ts
   │   │   │       ├── getUser.ts
   │   │   │       └── types.ts
   │   │   └── shared/
   │   │       ├── db.ts
   │   │       ├── validation.ts
   │   │       └── logger.ts
   │   ├── template.yaml
   │   ├── package.json
   │   └── tsconfig.json
   └── docs/
       └── api/
           └── user-api.md

3. Install Dependencies
   $ cd backend
   $ npm init -y
   $ npm install --save @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   $ npm install --save-dev @types/node @types/aws-lambda typescript

4. Create TypeScript Configuration (tsconfig.json)
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "lib": ["ES2020"],
       "outDir": "./dist",
       "rootDir": "./src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }

5. Create Lambda Function (Skeleton)
   File: src/lambdas/user/createUser.ts
   
   // Define interfaces
   interface CreateUserRequest {
     email: string;
     name: string;
     phone: string;
     password: string;
   }
   
   interface CreateUserResponse {
     userId: string;
     email: string;
     message: string;
   }
   
   // TODO: Implement handler
   // TODO: Add validation
   // TODO: Add DynamoDB operations
   // TODO: Add error handling

6. Create SAM Template (template.yaml)
   AWSTemplateFormatVersion: '2010-09-09'
   Transform: AWS::Serverless-2016-10-31
   
   Globals:
     Function:
       Timeout: 10
       Runtime: nodejs20.x
       Environment:
         Variables:
           USERS_TABLE: !Ref UsersTable
   
   Resources:
     CreateUserFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/user/createUser.handler
         Policies:
           - DynamoDBCrudPolicy:
               TableName: !Ref UsersTable
     
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
           - IndexName: email-index
             KeySchema:
               - AttributeName: email
                 KeyType: HASH
             Projection:
               ProjectionType: ALL

7. Build & Test Locally
   $ npm run build
   $ sam build
   $ sam local invoke CreateUserFunction --event events/create-user.json
   
   events/create-user.json:
   {
     "body": "{\"email\":\"test@example.com\",\"name\":\"Test User\",\"phone\":\"+1234567890\",\"password\":\"Test@123\"}"
   }

Learning Outcome:
├── Project structure established
├── SAM template basics understood
├── Local testing working
└── Ready for implementation
```

**Day 2: Implementation & Deployment**
```
Task: Complete Lambda implementation and deploy

1. Implement Full Lambda Function (VS Code)
   File: src/lambdas/user/createUser.ts
   
   [Full TypeScript implementation with:]
   ├── Input validation (email format, password strength)
   ├── Check if email already exists (GSI query)
   ├── Generate userId (UUID)
   ├── Hash password (if not using Cognito)
   ├── Save to DynamoDB
   ├── Error handling (try-catch with proper status codes)
   └── Logging (console.log with context)

2. Create Shared Utilities (VS Code)
   File: src/shared/validation.ts
   ├── validateEmail(email: string): boolean
   ├── validatePhone(phone: string): boolean
   └── validatePassword(password: string): string | null
   
   File: src/shared/db.ts
   ├── DynamoDB client initialization
   ├── Helper functions for common operations
   └── Error handling wrappers

3. Write Unit Tests (VS Code)
   File: tests/unit/createUser.test.ts
   
   Test cases:
   ├── Should create user with valid input
   ├── Should reject invalid email
   ├── Should reject weak password
   ├── Should reject duplicate email
   └── Should handle DynamoDB errors
   
   $ npm test

4. Deploy to AWS (VS Code Terminal)
   $ sam build
   $ sam deploy --guided
   
   Prompts:
   ├── Stack name: milk-delivery-dev
   ├── Region: us-east-1
   ├── Confirm changes: Y
   ├── Allow SAM CLI IAM role creation: Y
   ├── Save arguments to config file: Y
   └── Deployment starts...
   
   Wait for: Successfully created/updated stack

5. Verify Deployment (AWS Console)
   ├── Lambda → Functions → createUserFunction
   │   ├── Check function exists
   │   ├── Check environment variables
   │   └── Check permissions
   ├── DynamoDB → Tables → milk-delivery-users
   │   ├── Check table exists
   │   ├── Check GSI: email-index
   │   └── Check capacity mode: On-demand
   └── CloudFormation → Stacks → milk-delivery-dev
       ├── Check stack status: CREATE_COMPLETE
       └── Review all resources created

6. Test Deployed Function (Console + VS Code)
   
   Option A: AWS Console
   ├── Lambda → createUserFunction → Test tab
   ├── Create test event: create-user-test
   ├── Execute test
   ├── Check response: 201 Created
   └── CloudWatch logs: Check execution logs
   
   Option B: VS Code (AWS Toolkit)
   ├── AWS Toolkit → Lambda → createUserFunction
   ├── Right-click → Invoke on AWS
   ├── Select test event
   ├── View results in VS Code
   └── Check logs in VS Code

7. Verify Data in DynamoDB (Console)
   ├── DynamoDB → Tables → milk-delivery-users
   ├── Items tab
   ├── Should see new user item
   └── Verify all fields are correct

Learning Outcome:
├── Full Lambda function deployed
├── Infrastructure as Code working
├── Understand deployment process
└── Can iterate quickly
```

---

## 5. FEATURE DEVELOPMENT FLOW (STEP-BY-STEP)

### 5.1 Complete Feature: Order Creation System

**Overview:**
```
Feature: Create Order
Complexity: High (multiple services involved)
Duration: 4-5 days
Services Used:
├── Lambda (createOrder, validateInventory)
├── DynamoDB (Orders, Products, Inventory tables)
├── Step Functions (Order processing workflow)
├── API Gateway (POST /orders endpoint)
├── SNS (Order notifications)
└── EventBridge (Order events)

Learning Goals:
├── Multi-table DynamoDB operations
├── Error handling and rollback strategies
├── Async workflows with Step Functions
├── Event-driven architecture
└── Transaction management
```

**Day 1: Planning & Design**

```
Morning Session (2 hours)

1. Requirement Analysis (docs/features/create-order.md)
   
   User Story:
   "As a customer, I want to create an order with multiple products
   from different vendors, so that I can get my dairy products delivered."
   
   Acceptance Criteria:
   ├── User must be authenticated
   ├── User must have complete profile (delivery address)
   ├── Order must have at least 1 item
   ├── All products must be in stock
   ├── Order total must be ≥ minimum order value (₹100)
   ├── Delivery date must be: today+1 to today+7
   ├── System must reserve inventory immediately
   ├── User receives order confirmation
   └── Vendors receive order notifications

2. Data Model Design
   
   Orders Table Schema:
   {
     "orderId": "uuid",
     "userId": "uuid",
     "items": [
       {
         "productId": "uuid",
         "vendorId": "uuid",
         "productName": "string",
         "quantity": number,
         "unitPrice": number,
         "totalPrice": number
       }
     ],
     "subtotal": number,
     "tax": number,
     "deliveryCharge": number,
     "discount": number,
     "totalAmount": number,
     "status": "Pending|Confirmed|Processing|Delivered|Cancelled",
     "deliveryDate": "ISO date",
     "deliveryAddress": {
       "line1": "string",
       "city": "string",
       "zipCode": "string"
     },
     "createdAt": "ISO timestamp",
     "updatedAt": "ISO timestamp"
   }

3. API Contract Design
   
   Request:
   POST /orders
   Headers:
     Authorization: Bearer <JWT_TOKEN>
     Content-Type: application/json
   
   Body:
   {
     "items": [
       {
         "productId": "prod-123",
         "vendorId": "vendor-456",
         "quantity": 2
       },
       {
         "productId": "prod-789",
         "vendorId": "vendor-456",
         "quantity": 1
       }
     ],
     "deliveryDate": "2025-10-15",
     "addressId": "addr-001"
   }
   
   Success Response (201 Created):
   {
     "orderId": "order-abc123",
     "userId": "user-xyz",
     "items": [...],
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 30,
     "totalAmount": 502.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-15T08:00:00Z",
     "message": "Order created successfully"
   }
   
   Error Responses:
   400 Bad Request:
   {
     "error": "ValidationError",
     "message": "Delivery date must be between tomorrow and 7 days from now",
     "field": "deliveryDate"
   }
   
   400 Bad Request:
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 1L' has only 5 units available",
     "availableQuantity": 5,
     "requestedQuantity": 10
   }
   
   400 Bad Request:
   {
     "error": "MinimumOrderValue",
     "message": "Order total must be at least ₹100",
     "currentTotal": 75,
     "minimumRequired": 100
   }
   
   401 Unauthorized:
   {
     "error": "Unauthorized",
     "message": "Invalid or expired token"
   }
   
   404 Not Found:
   {
     "error": "UserNotFound",
     "message": "User profile not found"
   }
   
   409 Conflict:
   {
     "error": "ProfileIncomplete",
     "message": "Please complete your profile before placing an order",
     "missingFields": ["deliveryAddress", "phone"]
   }

4. Workflow Design (Step Functions State Machine)
   
   Order Processing Workflow:
   Start
   ├── ValidateInput (Lambda)
   │   ├── Success → ValidateUser
   │   └── Fail → Return 400 Error
   ├── ValidateUser (Lambda)
   │   ├── Success → CheckInventory
   │   └── Fail → Return 404/409 Error
   ├── CheckInventory (Lambda)
   │   ├── AllAvailable → ReserveInventory
   │   └── Insufficient → Return 400 Error
   ├── ReserveInventory (Lambda)
   │   ├── Success → CalculatePricing
   │   └── Fail → Rollback
   ├── CalculatePricing (Lambda)
   │   ├── Success → CreateOrderRecord
   │   └── Fail → ReleaseInventory → Error
   ├── CreateOrderRecord (Lambda)
   │   ├── Success → NotifyUser
   │   └── Fail → ReleaseInventory → Error
   ├── NotifyUser (SNS)
   │   └── Send confirmation email
   ├── NotifyVendors (SNS)
   │   └── Send order details to each vendor
   └── End (Success)

5. Error Handling Strategy
   
   Scenario 1: Inventory Check Fails
   ├── Don't create order
   ├── Return 400 with specific product details
   └── No rollback needed (no state changed)
   
   Scenario 2: Inventory Reserved, but DynamoDB Fails
   ├── Critical: Inventory locked but order not created
   ├── Solution: Use DynamoDB transaction
   │   └── Atomic operation: Reserve inventory + Create order
   └── If transaction fails, nothing is committed
   
   Scenario 3: Order Created, but Notification Fails
   ├── Order exists, but user not notified
   ├── Solution: Make notification async (Step Functions)
   ├── Retry notification 3 times
   └── Use DLQ (Dead Letter Queue) for failures
   
   Scenario 4: Partial Vendor Availability
   ├── Some items available, some not
   ├── Option A: Reject entire order
   ├── Option B: Partial fulfillment (advanced)
   └── For MVP: Choose Option A (simpler)

Afternoon Session (1.5 hours)

6. Create Project Structure (VS Code)
   backend/
   ├── src/
   │   ├── lambdas/
   │   │   └── order/
   │   │       ├── createOrder.ts
   │   │       ├── validateInventory.ts
   │   │       ├── reserveInventory.ts
   │   │       ├── calculatePricing.ts
   │   │       └── types.ts
   │   ├── stepFunctions/
   │   │   └── orderProcessing.asl.json
   │   └── shared/
   │       ├── constants.ts
   │       └── pricing.ts
   └── tests/
       └── order/
           ├── createOrder.test.ts
           └── validateInventory.test.ts

7. Define Types (VS Code)
   File: src/lambdas/order/types.ts
   
   export interface OrderItem {
     productId: string;
     vendorId: string;
     quantity: number;
     unitPrice?: number;  // Calculated
     totalPrice?: number; // Calculated
   }
   
   export interface CreateOrderRequest {
     items: OrderItem[];
     deliveryDate: string;
     addressId: string;
   }
   
   export interface CreateOrderResponse {
     orderId: string;
     userId: string;
     items: OrderItem[];
     subtotal: number;
     tax: number;
     deliveryCharge: number;
     totalAmount: number;
     status: OrderStatus;
     estimatedDelivery: string;
     message: string;
   }
   
   export type OrderStatus = 
     | 'Pending'
     | 'Confirmed'
     | 'Processing'
     | 'OutForDelivery'
     | 'Delivered'
     | 'Cancelled'
     | 'Failed';
   
   export interface ValidationError {
     field: string;
     message: string;
     code: string;
   }

8. Create Test Events (VS Code)
   File: events/create-order-valid.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2},{\"productId\":\"prod-yogurt-200g\",\"vendorId\":\"vendor-001\",\"quantity\":3}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}",
     "headers": {
       "Authorization": "Bearer eyJhbGc...",
       "Content-Type": "application/json"
     },
     "requestContext": {
       "authorizer": {
         "claims": {
           "sub": "user-123"
         }
       }
     }
   }
   
   File: events/create-order-invalid-date.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2}],\"deliveryDate\":\"2025-10-01\",\"addressId\":\"addr-home\"}"
   }
   
   File: events/create-order-insufficient-stock.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":1000}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}"
   }

Learning Outcome:
├── Complete understanding of requirements
├── API contract defined
├── Error scenarios identified
├── Project structure ready
└── Ready to code
```

**Day 2: Core Implementation**

```
Morning Session (2.5 hours)

1. Implement Validation Logic
   File: src/lambdas/order/createOrder.ts
   
   Function: validateInput()
   ├── Check items array not empty
   ├── Check each item has required fields
   ├── Check quantities are positive integers
   ├── Check deliveryDate format (ISO 8601)
   ├── Check deliveryDate is in valid range
   └── Return ValidationError[] if any issues
   
   Function: validateUser()
   ├── Extract userId from JWT (event.requestContext.authorizer.claims.sub)
   ├── Query Users table
   ├── Check user exists
   ├── Check profile is complete
   │   ├── Has delivery address matching addressId
   │   ├── Has phone number
   │   └── Has email
   └── Return user object or error
   
   Function: validateDeliveryDate()
   ├── Parse date string
   ├── Check format is valid
   ├── Check date is not in past
   ├── Check date is not today (need 1 day preparation)
   ├── Check date is within 7 days
   └── Return boolean + error message

2. Implement Inventory Validation
   File: src/lambdas/order/validateInventory.ts
   
   Function: checkInventory()
   Input:
   {
     "items": [
       {"productId": "prod-1", "vendorId": "vendor-1", "quantity": 2}
     ]
   }
   
   Process:
   ├── Group items by vendorId
   ├── For each vendor:
   │   ├── BatchGetItem from Inventory table
   │   │   └── Keys: [{vendorId, productId}, ...]
   │   ├── For each product:
   │   │   ├── Get available = stock - reserved
   │   │   ├── Check available >= requested quantity
   │   │   └── If not: add to unavailableItems[]
   │   └── Continue
   └── Return {valid: boolean, unavailableItems: []}
   
   Output (Success):
   {
     "valid": true,
     "unavailableItems": []
   }
   
   Output (Failure):
   {
     "valid": false,
     "unavailableItems": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "requestedQty": 10,
         "availableQty": 5
       }
     ]
   }

3. Implement Pricing Calculation
   File: src/shared/pricing.ts
   
   Function: calculateOrderTotal()
   Input:
   {
     "items": [
       {
         "productId": "prod-1",
         "quantity": 2,
         "unitPrice": 50
       }
     ],
     "deliveryAddress": {
       "city": "Vadodara",
       "zipCode": "390001"
     }
   }
   
   Calculation Logic:
   ├── subtotal = sum(item.unitPrice * item.quantity)
   ├── tax = subtotal * TAX_RATE (5% GST)
   ├── deliveryCharge = calculateDeliveryCharge()
   │   ├── If subtotal >= 500: ₹0 (free delivery)
   │   ├── Else if subtotal >= 300: ₹20
   │   ├── Else: ₹40
   │   └── Add ₹10 per additional vendor (multi-vendor orders)
   ├── discount = calculateDiscount()
   │   ├── If first order: 10% off (max ₹50)
   │   ├── If loyalty points: redeem at 1 point = ₹1
   │   └── else: 0
   └── totalAmount = subtotal + tax + deliveryCharge - discount
   
   Output:
   {
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 20,
     "discount": 0,
     "totalAmount": 492.5,
     "breakdown": {
       "itemsTotal": 450,
       "taxBreakdown": {
         "cgst": 11.25,
         "sgst": 11.25
       },
       "deliveryDetails": {
         "baseCharge": 20,
         "multiVendorSurcharge": 0
       }
     }
   }

Afternoon Session (1.5 hours)

4. Implement Main Handler
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent)
   
   Flow:
   Step 1: Parse input
   ├── const body = JSON.parse(event.body || '{}');
   ├── const userId = event.requestContext.authorizer.claims.sub;
   └── Log input for debugging
   
   Step 2: Validate input
   ├── const validationErrors = validateInput(body);
   ├── if (validationErrors.length > 0):
   │   └── return 400 with errors
   └── Continue
   
   Step 3: Validate user
   ├── const user = await validateUser(userId);
   ├── if (!user):
   │   └── return 404 User Not Found
   ├── if (!user.isProfileComplete):
   │   └── return 409 Profile Incomplete
   └── Continue
   
   Step 4: Get delivery address
   ├── const address = user.addresses.find(a => a.addressId === body.addressId);
   ├── if (!address):
   │   └── return 404 Address Not Found
   └── Continue
   
   Step 5: Fetch product details
   ├── const productIds = body.items.map(i => i.productId);
   ├── const products = await batchGetProducts(productIds);
   ├── Merge product prices into items
   └── Calculate item totals
   
   Step 6: Check inventory
   ├── const inventoryCheck = await checkInventory(body.items);
   ├── if (!inventoryCheck.valid):
   │   └── return 400 Insufficient Stock with details
   └── Continue
   
   Step 7: Calculate pricing
   ├── const pricing = calculateOrderTotal(items, address, user);
   ├── if (pricing.totalAmount < MINIMUM_ORDER_VALUE):
   │   └── return 400 Minimum Order Value Not Met
   └── Continue
   
   Step 8: Create order record
   ├── const orderId = generateOrderId(); // uuid()
   ├── const order = {
   │     orderId,
   │     userId,
   │     items,
   │     ...pricing,
   │     status: 'Pending',
   │     deliveryDate: body.deliveryDate,
   │     deliveryAddress: address,
   │     createdAt: new Date().toISOString()
   │   };
   ├── await dynamodb.putItem(ORDERS_TABLE, order);
   └── Continue
   
   Step 9: Start Step Functions workflow
   ├── const executionArn = await stepFunctions.startExecution({
   │     stateMachineArn: ORDER_PROCESSING_STATE_MACHINE,
   │     input: JSON.stringify({ orderId, items })
   │   });
   └── Log execution ARN
   
   Step 10: Return response
   └── return {
         statusCode: 201,
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*'
         },
         body: JSON.stringify({
           orderId,
           userId,
           items,
           ...pricing,
           status: 'Pending',
           estimatedDelivery: calculateEstimatedDelivery(body.deliveryDate),
           message: 'Order created successfully. You will receive confirmation shortly.'
         })
       };

5. Error Handling Patterns
   
   Pattern 1: Validation Errors (400)
   try {
     const errors = validateInput(body);
     if (errors.length > 0) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'ValidationError',
           message: 'Invalid input data',
           errors: errors
         })
       };
     }
   } catch (error) {
     // Continue to Pattern 2
   }
   
   Pattern 2: Resource Not Found (404)
   const user = await getUser(userId);
   if (!user) {
     return {
       statusCode: 404,
       body: JSON.stringify({
         error: 'UserNotFound',
         message: `User with ID ${userId} not found`
       })
     };
   }
   
   Pattern 3: Business Logic Errors (400/409)
   if (pricing.totalAmount < MINIMUM_ORDER_VALUE) {
     return {
       statusCode: 400,
       body: JSON.stringify({
         error: 'MinimumOrderValue',
         message: `Order total must be at least ₹${MINIMUM_ORDER_VALUE}`,
         currentTotal: pricing.totalAmount,
         minimumRequired: MINIMUM_ORDER_VALUE
       })
     };
   }
   
   Pattern 4: Service Errors (500)
   try {
     await dynamodb.putItem(ORDERS_TABLE, order);
   } catch (error) {
     console.error('DynamoDB error:', error);
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: 'InternalServerError',
         message: 'Failed to create order. Please try again.',
         requestId: context.requestId
       })
     };
   }
   
   Pattern 5: Timeout Handling
   // Set timeout slightly less than Lambda timeout
   const timeoutMs = 9000; // Lambda timeout is 10s
   const timeoutPromise = new Promise((_, reject) => 
     setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
   );
   
   try {
     await Promise.race([
       createOrder(body),
       timeoutPromise
     ]);
   } catch (error) {
     if (error.message === 'Operation timeout') {
       return {
         statusCode: 504,
         body: JSON.stringify({
           error: 'GatewayTimeout',
           message: 'Request took too long. Please try again.'
         })
       };
     }
   }

Learning Outcome:
├── Complete Lambda implementation
├── Error handling patterns mastered
├── Ready for testing
└── Understanding of edge cases
```

**Day 3: Testing & Step Functions**

```
Morning Session (2 hours)

1. Unit Testing (VS Code)
   File: tests/unit/createOrder.test.ts
   
   Test Suite: Input Validation
   ├── Test: Should accept valid input
   ├── Test: Should reject empty items array
   ├── Test: Should reject negative quantities
   ├── Test: Should reject invalid date format
   ├── Test: Should reject past delivery dates
   └── Test: Should reject dates beyond 7 days
   
   Test Suite: User Validation
   ├── Test: Should accept valid user with complete profile
   ├── Test: Should reject non-existent user
   ├── Test: Should reject user with incomplete profile
   └── Test: Should reject invalid address ID
   
   Test Suite: Inventory Validation
   ├── Test: Should pass when all items in stock
   ├── Test: Should fail when any item out of stock
   ├── Test: Should handle partial stock correctly
   └── Test: Should handle multiple vendors
   
   Test Suite: Pricing Calculation
   ├── Test: Should calculate subtotal correctly
   ├── Test: Should apply 5% GST
   ├── Test: Should apply free delivery for orders > ₹500
   ├── Test: Should charge ₹40 for orders < ₹300
   ├── Test: Should apply first order discount
   └── Test: Should calculate multi-vendor surcharge
   
   Run Tests:
   $ npm test
   
   Expected Output:
   PASS  tests/unit/createOrder.test.ts
     Input Validation
       ✓ Should accept valid input (5ms)
       ✓ Should reject empty items array (3ms)
       ✓ Should reject negative quantities (2ms)
       ✓ Should reject invalid date format (3ms)
       ✓ Should reject past delivery dates (2ms)
       ✓ Should reject dates beyond 7 days (2ms)
     
     Test Suites: 4 passed, 4 total
     Tests:       24 passed, 24 total
     Time:        2.341s

2. Local Testing with SAM (VS Code Terminal)
   
   Build project:
   $ cd backend
   $ npm run build
   $ sam build
   
   Output:
   Building codeuri: dist/ runtime: nodejs20.x architecture: x86_64
   Running NodejsNpmBuilder:NpmPack
   Build Succeeded
   
   Test with valid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-valid.json \
     --env-vars env.json
   
   Expected Output:
   Invoking lambdas/order/createOrder.handler
   START RequestId: abc-123 Version: $LATEST
   [INFO] Order creation started for user: user-123
   [INFO] Inventory validation passed
   [INFO] Order created: order-xyz-789
   END RequestId: abc-123
   REPORT RequestId: abc-123 Duration: 1243.56 ms Memory: 512 MB
   
   {"statusCode":201,"body":"{\"orderId\":\"order-xyz-789\",...}"}
   
   Test with invalid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-invalid-date.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"ValidationError\",...}"}
   
   Test with insufficient stock:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-insufficient-stock.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"InsufficientStock\",...}"}

3. Create Step Functions State Machine
   File: stepFunctions/orderProcessing.asl.json
   
   {
     "Comment": "Order Processing Workflow",
     "StartAt": "ReserveInventory",
     "States": {
       "ReserveInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:reserveInventoryFunction",
         "InputPath": "$",
         "ResultPath": "$.reservationResult",
         "Next": "CheckReservation",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "ReservationFailed"
           }
         ]
       },
       
       "CheckReservation": {
         "Type": "Choice",
         "Choices": [
           {
             "Variable": "$.reservationResult.success",
             "BooleanEquals": true,
             "Next": "NotifyVendors"
           }
         ],
         "Default": "ReservationFailed"
       },
       
       "NotifyVendors": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:notifyVendorsFunction",
         "InputPath": "$",
         "ResultPath": "$.notificationResult",
         "Next": "UpdateOrderStatus",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "NotificationFailed"
           }
         ]
       },
       
       "UpdateOrderStatus": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:updateOrderStatusFunction",
         "InputPath": "$",
         "Parameters": {
           "orderId.$": "$.orderId",
           "status": "Confirmed"
         },
         "ResultPath": "$.updateResult",
         "Next": "NotifyCustomer"
       },
       
       "NotifyCustomer": {
         "Type": "Task",
         "Resource": "arn:aws:states:::sns:publish",
         "Parameters": {
           "TopicArn": "arn:aws:sns:region:account:order-notifications",
           "Message.$": "$.orderId",
           "Subject": "Order Confirmed"
         },
         "Next": "OrderProcessingComplete"
       },
       
       "OrderProcessingComplete": {
         "Type": "Succeed"
       },
       
       "ReservationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Inventory reservation failed"
         },
         "Next": "OrderFailed"
       },
       
       "NotificationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Vendor notification failed"
         },
         "Next": "ReleaseInventory"
       },
       
       "ReleaseInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:releaseInventoryFunction",
         "InputPath": "$",
         "Next": "OrderFailed"
       },
       
       "OrderFailed": {
         "Type": "Fail",
         "Error": "OrderProcessingFailed",
         "Cause": "Order processing workflow failed"
       }
     }
   }

Afternoon Session (1.5 hours)

4. Add Step Functions to SAM Template
   File: template.yaml
   
   Resources:
     OrderProcessingStateMachine:
       Type: AWS::Serverless::StateMachine
       Properties:
         Name: OrderProcessingWorkflow
         DefinitionUri: stepFunctions/orderProcessing.asl.json
         DefinitionSubstitutions:
           ReserveInventoryFunctionArn: !GetAtt ReserveInventoryFunction.Arn
           NotifyVendorsFunctionArn: !GetAtt NotifyVendorsFunction.Arn
           UpdateOrderStatusFunctionArn: !GetAtt UpdateOrderStatusFunction.Arn
           HandleOrderFailureFunctionArn: !GetAtt HandleOrderFailureFunction.Arn
           ReleaseInventoryFunctionArn: !GetAtt ReleaseInventoryFunction.Arn
           OrderNotificationsTopic: !Ref OrderNotificationsTopic
         Policies:
           - LambdaInvokePolicy:
               FunctionName: !Ref ReserveInventoryFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref NotifyVendorsFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref UpdateOrderStatusFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref HandleOrderFailureFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref ReleaseInventoryFunction
           - SNSPublishMessagePolicy:
               TopicName: !GetAtt OrderNotificationsTopic.TopicName
         Logging:
           Level: ALL
           IncludeExecutionData: true
           Destinations:
             - CloudWatchLogsLogGroup:
                 LogGroupArn: !GetAtt OrderProcessingLogGroup.Arn
     
     OrderNotificationsTopic:
       Type: AWS::SNS::Topic
       Properties:
         TopicName: order-notifications
         DisplayName: Order Notifications
         Subscription:
           - Endpoint: your-email@example.com
             Protocol: email
     
     OrderProcessingLogGroup:
       Type: AWS::Logs::LogGroup
       Properties:
         LogGroupName: /aws/vendedlogs/states/OrderProcessing
         RetentionInDays: 7

5. Deploy Complete Stack
   $ sam build
   $ sam deploy --guided
   
   Deployment Output:
   CloudFormation stack changeset
   ---------------------------------
   Operation                 LogicalResourceId         ResourceType
   ---------------------------------
   + Add                     CreateOrderFunction       AWS::Lambda::Function
   + Add                     ReserveInventoryFunc      AWS::Lambda::Function
   + Add                     NotifyVendorsFunction     AWS::Lambda::Function
   + Add                     OrderProcessingState      AWS::StepFunctions::StateMachine
   + Add                     OrdersTable               AWS::DynamoDB::Table
   + Add                     OrderNotificationsTopic   AWS::SNS::Topic
   ---------------------------------
   
   Deploy this changeset? [y/N]: y
   
   Deployment progress:
   CREATE_IN_PROGRESS  OrdersTable
   CREATE_IN_PROGRESS  CreateOrderFunction
   CREATE_COMPLETE     OrdersTable
   CREATE_COMPLETE     CreateOrderFunction
   ...
   CREATE_COMPLETE     OrderProcessingStateMachine
   
   Successfully created/updated stack - milk-delivery-dev

6. Test Deployed Stack (AWS Console)
   
   Console → Step Functions → State machines → OrderProcessingWorkflow
   ├── Click "Start execution"
   ├── Input JSON:
   │   {
   │     "orderId": "test-order-001",
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ]
   │   }
   ├── Click "Start execution"
   └── Watch execution graph
   
   Visual Execution:
   ReserveInventory (Running) ⏳
   ├── Lambda invoked
   └── Waiting for response...
   
   ReserveInventory (Succeeded) ✅
   ├── Duration: 1.2s
   └── Output: {"success": true, "reservationId": "res-123"}
   
   NotifyVendors (Running) ⏳
   ├── Lambda invoked
   └── Sending emails...
   
   NotifyVendors (Succeeded) ✅
   ├── Duration: 0.8s
   └── Output: {"notified": ["vendor-001"]}
   
   UpdateOrderStatus (Running) ⏳
   UpdateOrderStatus (Succeeded) ✅
   
   NotifyCustomer (Running) ⏳
   NotifyCustomer (Succeeded) ✅
   
   OrderProcessingComplete ✅
   Total Duration: 4.5s
   
   Check CloudWatch Logs:
   ├── Console → CloudWatch → Log groups
   ├── /aws/vendedlogs/states/OrderProcessing
   └── View execution logs

Learning Outcome:
├── Step Functions workflow working
├── Async processing implemented
├── Error handling and retries configured
├── Complete order flow functional
└── Ready for API Gateway integration
```

**Day 4: API Gateway Integration**

```
Morning Session (2 hours)

1. Add API Gateway to SAM Template
   File: template.yaml
   
   Resources:
     MilkDeliveryApi:
       Type: AWS::Serverless::Api
       Properties:
         Name: MilkDeliveryAPI
         StageName: dev
         Cors:
           AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
           AllowHeaders: "'Content-Type,Authorization'"
           AllowOrigin: "'*'"
         Auth:
           DefaultAuthorizer: CognitoAuthorizer
           Authorizers:
             CognitoAuthorizer:
               UserPoolArn: !GetAtt UserPool.Arn
         GatewayResponses:
           UNAUTHORIZED:
             StatusCode: 401
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
           BAD_REQUEST_BODY:
             StatusCode: 400
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
         DefinitionBody:
           openapi: 3.0.1
           info:
             title: Milk Delivery API
             version: 1.0.0
           paths:
             /orders:
               post:
                 summary: Create a new order
                 requestBody:
                   required: true
                   content:
                     application/json:
                       schema:
                         type: object
                         required:
                           - items
                           - deliveryDate
                           - addressId
                         properties:
                           items:
                             type: array
                             minItems: 1
                             maxItems: 50
                           deliveryDate:
                             type: string
                             format: date
                           addressId:
                             type: string
                 responses:
                   '201':
                     description: Order created successfully
                   '400':
                     description: Invalid input
                   '401':
                     description: Unauthorized
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${CreateOrderFunction.Arn}/invocations'
               get:
                 summary: List user orders
                 responses:
                   '200':
                     description: List of orders
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ListOrdersFunction.Arn}/invocations'
             
             /orders/{orderId}:
               get:
                 summary: Get order details
                 parameters:
                   - name: orderId
                     in: path
                     required: true
                     schema:
                       type: string
                 responses:
                   '200':
                     description: Order details
                   '404':
                     description: Order not found
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetOrderFunction.Arn}/invocations'
     
     CreateOrderFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/order/createOrder.handler
         Events:
           CreateOrder:
             Type: Api
             Properties:
               RestApiId: !Ref MilkDeliveryApi
               Path: /orders
               Method: POST
               Auth:
                 Authorizer: CognitoAuthorizer

2. Configure Request Validation
   File: template.yaml (add to API definition)
   
   RequestValidator:
     Type: AWS::ApiGateway::RequestValidator
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ValidateRequestBody: true
       ValidateRequestParameters: true
   
   Request Models:
   CreateOrderModel:
     Type: AWS::ApiGateway::Model
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ContentType: application/json
       Schema:
         type: object
         required:
           - items
           - deliveryDate
           - addressId
         properties:
           items:
             type: array
             minItems: 1
             items:
               type: object
               required:
                 - productId
                 - vendorId
                 - quantity
               properties:
                 productId:
                   type: string
                   pattern: '^prod-[a-zA-Z0-9-]+
                 vendorId:
                   type: string
                   pattern: '^vendor-[a-zA-Z0-9-]+
                 quantity:
                   type: integer
                   minimum: 1
                   maximum: 100
           deliveryDate:
             type: string
             format: date
           addressId:
             type: string

3. Deploy and Test API
   $ sam build
   $ sam deploy
   
   Output:
   Outputs:
   ├── MilkDeliveryApiUrl: https://abc123.execute-api.us-east-1.amazonaws.com/dev
   ├── CreateOrderFunctionArn: arn:aws:lambda:us-east-1:123456789:function:createOrder
   └── OrderProcessingStateMachine: arn:aws:states:us-east-1:123456789:stateMachine:OrderProcessing

Afternoon Session (1.5 hours)

4. Test API with Thunder Client (VS Code)
   
   Install Thunder Client extension
   ├── Extensions → Search "Thunder Client"
   ├── Install
   └── Restart VS Code
   
   Create Request Collection:
   Thunder Client → Collections → New Collection
   ├── Name: Milk Delivery API - Dev
   └── Create
   
   Request 1: Create Order (Success Case)
   ├── Method: POST
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders
   ├── Headers:
   │   ├── Content-Type: application/json
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   ├── Body (JSON):
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       },
   │       {
   │         "productId": "prod-yogurt-200g",
   │         "vendorId": "vendor-001",
   │         "quantity": 3
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (201 Created):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "quantity": 2,
         "unitPrice": 50,
         "totalPrice": 100
       },
       {
         "productId": "prod-yogurt-200g",
         "vendorId": "vendor-001",
         "productName": "Greek Yogurt 200g",
         "quantity": 3,
         "unitPrice": 30,
         "totalPrice": 90
       }
     ],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "discount": 0,
     "totalAmount": 239.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-12T08:00:00Z",
     "message": "Order created successfully. You will receive confirmation shortly."
   }
   
   Request 2: Create Order (Validation Error)
   ├── Body:
   │   {
   │     "items": [],  ← Empty array
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid input data",
     "errors": [
       {
         "field": "items",
         "message": "Items array cannot be empty",
         "code": "EMPTY_ITEMS"
       }
     ]
   }
   
   Request 3: Create Order (Insufficient Stock)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 1000  ← Too many
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 500ml' has only 50 units available",
     "productId": "prod-milk-500ml",
     "availableQuantity": 50,
     "requestedQuantity": 1000
   }
   
   Request 4: Create Order (Invalid Date)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ],
   │     "deliveryDate": "2025-10-01",  ← Past date
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid delivery date",
     "errors": [
       {
         "field": "deliveryDate",
         "message": "Delivery date cannot be in the past",
         "code": "INVALID_DATE"
       }
     ]
   }
   
   Request 5: Get Order Details
   ├── Method: GET
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders/order-abc-123-xyz
   ├── Headers:
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   └── Send
   
   Expected Response (200 OK):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [...],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "totalAmount": 239.5,
     "status": "Confirmed",
     "deliveryDate": "2025-10-12",
     "deliveryAddress": {
       "line1": "123 Main Street",
       "city": "Vadodara",
       "state": "Gujarat",
       "zipCode": "390001"
     },
     "createdAt": "2025-10-09T10:30:00Z",
     "updatedAt": "2025-10-09T10:30:15Z"
   }

5. Verify in AWS Console
   
   Console → API Gateway → MilkDeliveryAPI
   ├── Stages → dev
   ├── Invoke URL: Copy URL
   ├── Resources → /orders → POST
   ├── Test → Click "TEST" button
   ├── Request Body: Paste test JSON
   ├── Execute
   └── View Response
   
   Console → Lambda → CreateOrderFunction
   ├── Monitor tab
   ├── View logs → CloudWatch Logs
   ├── See execution logs
   └── Check for errors
   
   Console → DynamoDB → milk-delivery-orders
   ├── Items tab
   ├── See newly created order
   └── Verify all fields
   
   Console → Step Functions → OrderProcessingWorkflow
   ├── Executions tab
   ├── See execution for your order
   ├── Click execution ID
   └── View execution graph

Learning Outcome:
├── API Gateway fully integrated
├── End-to-end flow working
├── Multiple test scenarios validated
├── Ready for frontend integration
└── Understanding of full serverless stack
```

**Day 5: Edge Cases & Error Handling**

```
Morning Session (2 hours)

1. Edge Case Testing Matrix
   
   Test Case 1: Concurrent Orders (Race Condition)
   Scenario: Two users order the last item simultaneously
   
   Setup:
   ├── Set product stock to 1 unit
   ├── User A submits order for 1 unit
   ├── User B submits order for 1 unit (within milliseconds)
   └── Expected: Only one order succeeds
   
   Implementation Solution:
   ├── Use DynamoDB Conditional Expressions
   ├── UpdateItem with condition: stock > 0
   ├── If condition fails: Return insufficient stock
   └── Atomic operation prevents over-selling
   
   Code Pattern:
   await dynamodb.update({
     TableName: INVENTORY_TABLE,
     Key: { vendorId, productId },
     UpdateExpression: 'SET stock = stock - :qty, reserved = reserved + :qty',
     ConditionExpression: 'stock >= :qty',
     ExpressionAttributeValues: {
       ':qty': quantity
     }
   });
   // If condition fails, AWS throws ConditionalCheckFailedException
   
   Test Case 2: Multi-Vendor Order with Partial Failure
   Scenario: Order has items from 3 vendors, one vendor out of stock
   
   Expected Behavior:
   ├── Option A (Simple): Reject entire order
   ├── Option B (Advanced): Partial fulfillment
   └── For MVP: Choose Option A
   
   Implementation:
   ├── Validate all inventory BEFORE creating order
   ├── If any item fails: Return 400 with details
   ├── No partial orders
   └── Clear error message to user
   
   Test Case 3: Payment Gateway Timeout
   Scenario: Stripe API takes > 10 seconds to respond
   
   Implementation:
   ├── Set order status: "PaymentPending"
   ├── Use Stripe webhooks for async confirmation
   ├── Don't wait for payment in createOrder Lambda
   ├── Separate Lambda handles payment webhooks
   └── Update order status when webhook received
   
   Flow:
   createOrder → Return "PaymentPending"
       ↓
   User redirected to Stripe
       ↓
   Stripe processes payment
       ↓
   Stripe sends webhook → paymentWebhookHandler
       ↓
   Update order status → "Paid"
       ↓
   Trigger Step Functions workflow
   
   Test Case 4: Database Write Failure After Inventory Reserved
   Scenario: Inventory reserved, but DynamoDB fails to create order
   
   Problem:
   ├── Inventory locked
   ├── Order not created
   └── User sees error, but stock is reduced
   
   Solution: Use DynamoDB Transactions
   const params = {
     TransactItems: [
       {
         Update: {
           TableName: INVENTORY_TABLE,
           Key: { vendorId, productId },
           UpdateExpression: 'SET reserved = reserved + :qty',
           ConditionExpression: 'stock >= reserved + :qty',
           ExpressionAttributeValues: { ':qty': quantity }
         }
       },
       {
         Put: {
           TableName: ORDERS_TABLE,
           Item: orderObject,
           ConditionExpression: 'attribute_not_exists(orderId)'
         }
       }
     ]
   };
   await dynamodb.transactWrite(),
  "headers": {
    #foreach($header in $input.params().header.keySet())
    "$header": "$util.escapeJavaScript($input.params().header.get($header))"
    #if($foreach.hasNext),#end
    #end
  },
  "requestContext": {
    "requestId": "$context.requestId",
    "sourceIp": "$context.identity.sourceIp",
    "userAgent": "$context.identity.userAgent"
  }
}

SAM Template:
MilkDeliveryApi:
  Type: AWS::Serverless::Api
  Properties:
    DefinitionBody:
      paths:
        /orders:
          post:
            x-amazon-apigateway-integration:
              type: aws_proxy  # Passes request as-is (recommended)
              # OR
              type: aws  # Custom mapping (more complex)
              requestTemplates:
                application/json: |
                  {template above}
```

**Response Transformation:**
```
Use Case: Add custom headers, format response

Example: Add CORS headers to all responses
GatewayResponses:
  DEFAULT_4XX:
    ResponseParameters:
      gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
  DEFAULT_5XX:
    ResponseParameters:
      gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
```

### 8.3 CORS Configuration

**Problem: Browser blocks cross-origin requests**
```
Scenario:
├── Frontend: http://localhost:3000
├── API: https://api.milkdelivery.com
└── Browser blocks request (CORS policy)

Solution: Configure CORS in API Gateway
```

**SAM Template CORS Configuration:**
```yaml
MilkDeliveryApi:
  Type: AWS::Serverless::Api
  Properties:
    StageName: dev
    Cors:
      AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
      AllowHeaders: "'Content-Type,Authorization,X-Amz-Date,X-Api-Key'"
      AllowOrigin: "'*'"  # For development
      # Production: "'https://milkdelivery.com'"
      MaxAge: "'600'"  # Cache preflight response for 10 minutes
      AllowCredentials: false  # Set true if using cookies

# This automatically adds OPTIONS methods for preflight
```

**Manual OPTIONS Method (if needed):**
```yaml
paths:
  /orders:
    options:
      summary: CORS preflight
      responses:
        '200':
          description: CORS headers
          headers:
            Access-Control-Allow-Origin:
              schema:
                type: string
            Access-Control-Allow-Methods:
              schema:
                type: string
            Access-Control-Allow-Headers:
              schema:
                type: string
      x-amazon-apigateway-integration:
        type: mock
        requestTemplates:
          application/json: '{"statusCode": 200}'
        responses:
          default:
            statusCode: '200'
            responseParameters:
              method.response.header.Access-Control-Allow-Origin: "'*'"
              method.response.header.Access-Control-Allow-Methods: "'GET,POST,PUT,DELETE,OPTIONS'"
              method.response.header.Access-Control-Allow-Headers: "'Content-Type,Authorization'"
```

**Lambda Response (must include CORS headers):**
```typescript
export const handler = async (event: APIGatewayProxyEvent) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',  // Match API Gateway config
      'Access-Control-Allow-Credentials': 'false',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: 'Success' })
  };
};
```

### 8.4 Request Validation

**Schema Validation in API Gateway:**
```yaml
RequestValidator:
  Type: AWS::ApiGateway::RequestValidator
  Properties:
    RestApiId: !Ref MilkDeliveryApi
    ValidateRequestBody: true
    ValidateRequestParameters: true
    Name: request-validator

CreateOrderModel:
  Type: AWS::ApiGateway::Model
  Properties:
    RestApiId: !Ref MilkDeliveryApi
    ContentType: application/json
    Name: CreateOrderModel
    Schema:
      type: object
      required:
        - items
        - deliveryDate
        - addressId
      properties:
        items:
          type: array
          minItems: 1
          maxItems: 50
          items:
            type: object
            required:
              - productId
              - vendorId
              - quantity
            properties:
              productId:
                type: string
                minLength: 5
                pattern: '^prod-[a-zA-Z0-9-]+   await dynamodb.transactWrite(params);
   // Either both succeed or both fail (atomicity)
   
   Test Case 5: User Cancels Order During Processing
   Scenario: Order created, Step Functions running, user clicks "Cancel"
   
   Implementation:
   ├── Check current order status
   ├── If status = "Pending": Allow cancellation
   ├── If status = "Processing": Check Step Functions execution
   ├── Stop execution: stepFunctions.stopExecution()
   ├── Release inventory
   └── Update order status: "Cancelled"
   
   Test Case 6: Invalid JWT Token
   Scenario: User sends expired or tampered token
   
   API Gateway Authorizer handles:
   ├── Validates JWT signature
   ├── Checks expiration
   ├── Verifies issuer (Cognito User Pool)
   └── Returns 401 Unauthorized if invalid
   
   Lambda never receives request with invalid token
   
   Test Case 7: DynamoDB Throttling
   Scenario: Free tier limits exceeded (25 WCU/RCU)
   
   Symptoms:
   ├── ProvisionedThroughputExceededException
   ├── Lambda returns 500 error
   └── Operations fail
   
   Solution:
   ├── Use exponential backoff (built into AWS SDK)
   ├── Implement retry logic in Lambda
   ├── Monitor CloudWatch metrics
   └── Consider on-demand billing (scales automatically)
   
   Implementation:
   const dynamodbWithRetry = DynamoDBDocumentClient.from(client, {
     retryMode: 'adaptive',
     maxAttempts: 3
   });
   
   Test Case 8: Large Order (100+ items)
   Scenario: User tries to order 100 different products
   
   Considerations:
   ├── Lambda execution time: May exceed 10s timeout
   ├── DynamoDB batch size: Max 25 items per BatchGetItem
   ├── API Gateway payload: Max 10 MB
   └── Step Functions payload: Max 256 KB
   
   Solutions:
   ├── Set maximum items per order: 50
   ├── Validate in API Gateway request validator
   ├── Batch DynamoDB operations properly
   └── Use S3 for large payloads if needed (advanced)

Afternoon Session (1.5 hours)

2. Implement Idempotency
   
   Problem: User clicks "Place Order" twice
   ├── Network delay, no response
   ├── User clicks again
   └── Two orders created for same cart
   
   Solution: Idempotency Keys
   
   Request Header:
   Idempotency-Key: <unique-client-generated-uuid>
   
   Implementation:
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent) => {
     const idempotencyKey = event.headers['idempotency-key'] || 
                            event.headers['Idempotency-Key'];
     
     if (!idempotencyKey) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'MissingIdempotencyKey',
           message: 'Idempotency-Key header is required'
         })
       };
     }
     
     // Check if order with this key already exists
     const existingOrder = await dynamodb.query({
       TableName: ORDERS_TABLE,
       IndexName: 'idempotency-key-index',
       KeyConditionExpression: 'idempotencyKey = :key',
       ExpressionAttributeValues: {
         ':key': idempotencyKey
       }
     });
     
     if (existingOrder.Items && existingOrder.Items.length > 0) {
       // Order already created, return existing order
       return {
         statusCode: 200,
         body: JSON.stringify(existingOrder.Items[0])
       };
     }
     
     // Create new order with idempotency key
     const order = {
       ...orderData,
       idempotencyKey
     };
     
     await dynamodb.put({
       TableName: ORDERS_TABLE,
       Item: order,
       ConditionExpression: 'attribute_not_exists(idempotencyKey)'
     });
     
     return {
       statusCode: 201,
       body: JSON.stringify(order)
     };
   };
   
   DynamoDB Table Update (template.yaml):
   OrdersTable:
     GlobalSecondaryIndexes:
       - IndexName: idempotency-key-index
         KeySchema:
           - AttributeName: idempotencyKey
             KeyType: HASH
         Projection:
           ProjectionType: ALL

3. Implement Circuit Breaker Pattern
   
   Problem: Downstream service (payment gateway) is down
   ├── Every request times out
   ├── Lambda execution time wasted
   ├── Poor user experience
   └── Increased costs
   
   Solution: Circuit Breaker
   
   States:
   ├── CLOSED: Normal operation, requests pass through
   ├── OPEN: Too many failures, reject requests immediately
   └── HALF_OPEN: Test if service recovered
   
   Implementation:
   File: src/shared/circuitBreaker.ts
   
   class CircuitBreaker {
     private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
     private failureCount = 0;
     private failureThreshold = 5;
     private timeout = 60000; // 1 minute
     private lastFailureTime?: number;
     
     async execute<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'OPEN') {
         if (Date.now() - this.lastFailureTime! > this.timeout) {
           this.state = 'HALF_OPEN';
         } else {
           throw new Error('Circuit breaker is OPEN');
         }
       }
       
       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
     
     private onSuccess() {
       this.failureCount = 0;
       this.state = 'CLOSED';
     }
     
     private onFailure() {
       this.failureCount++;
       this.lastFailureTime = Date.now();
       
       if (this.failureCount >= this.failureThreshold) {
         this.state = 'OPEN';
       }
     }
   }
   
   Usage:
   const paymentCircuitBreaker = new CircuitBreaker();
   
   try {
     const paymentResult = await paymentCircuitBreaker.execute(async () => {
       return await stripeClient.charges.create({...});
     });
   } catch (error) {
     if (error.message === 'Circuit breaker is OPEN') {
       return {
         statusCode: 503,
         body: JSON.stringify({
           error: 'ServiceUnavailable',
           message: 'Payment service is temporarily unavailable. Please try again later.'
         })
       };
     }
   }

4. Comprehensive Error Response Structure
   
   Standardized Error Format:
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Human-readable message",
       "details": {
         "field": "specificField",
         "reason": "Detailed reason"
       },
       "requestId": "req-abc-123",
       "timestamp": "2025-10-09T10:30:00Z",
       "retryable": boolean,
       "documentation": "https://docs.milkdelivery.com/errors/ERROR_CODE"
     }
   }
   
   Error Codes Catalog:
   ├── VALIDATION_ERROR (400)
   ├── UNAUTHORIZED (401)
   ├── FORBIDDEN (403)
   ├── RESOURCE_NOT_FOUND (404)
   ├── CONFLICT (409)
   ├── RATE_LIMIT_EXCEEDED (429)
   ├── INTERNAL_SERVER_ERROR (500)
   ├── SERVICE_UNAVAILABLE (503)
   └── GATEWAY_TIMEOUT (504)
   
   Implementation:
   File: src/shared/errors.ts
   
   export class AppError extends Error {
     constructor(
       public code: string,
       public message: string,
       public statusCode: number,
       public details?: any,
       public retryable: boolean = false
     ) {
       super(message);
       this.name = 'AppError';
     }
     
     toJSON() {
       return {
         error: {
           code: this.code,
           message: this.message,
           details: this.details,
           requestId: 'Set by Lambda context',
           timestamp: new Date().toISOString(),
           retryable: this.retryable,
           documentation: `https://docs.milkdelivery.com/errors/${this.code}`
         }
       };
     }
   }
   
   export class ValidationError extends AppError {
     constructor(message: string, field?: string) {
       super('VALIDATION_ERROR', message, 400, { field });
     }
   }
   
   export class InsufficientStockError extends AppError {
     constructor(productId: string, available: number, requested: number) {
       super(
         'INSUFFICIENT_STOCK',
         `Product has only ${available} units available`,
         400,
         { productId, available, requested }
       );
     }
   }
   
   Usage in Lambda:
   try {
     // ... validation logic
     if (stock < requestedQty) {
       throw new InsufficientStockError(productId, stock, requestedQty);
     }
   } catch (error) {
     if (error instanceof AppError) {
       return {
         statusCode: error.statusCode,
         body: JSON.stringify(error.toJSON())
       };
     }
     
     // Unknown error
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: {
           code: 'INTERNAL_SERVER_ERROR',
           message: 'An unexpected error occurred',
           requestId: context.requestId,
           timestamp: new Date().toISOString()
         }
       })
     };
   }

5. Logging Best Practices
   
   Structured Logging Format:
   {
     "timestamp": "2025-10-09T10:30:00.123Z",
     "level": "INFO|WARN|ERROR",
     "requestId": "req-abc-123",
     "userId": "user-456",
     "action": "CREATE_ORDER",
     "message": "Order created successfully",
     "context": {
       "orderId": "order-xyz-789",
       "totalAmount": 239.5,
       "itemCount": 2
     },
     "duration": 1234,
     "memoryUsed": 128
   }
   
   Implementation:
   File: src/shared/logger.ts
   
   export class Logger {
     private context: Record<string, any> = {};
     
     setContext(key: string, value: any) {
       this.context[key] = value;
     }
     
     info(message: string, data?: Record<string, any>) {
       this.log('INFO', message, data);
     }
     
     warn(message: string, data?: Record<string, any>) {
       this.log('WARN', message, data);
     }
     
     error(message: string, error?: Error, data?: Record<string, any>) {
       this.log('ERROR', message, {
         ...data,
         error: error?.message,
         stack: error?.stack
       });
     }
     
     private log(level: string, message: string, data?: Record<string, any>) {
       const logEntry = {
         timestamp: new Date().toISOString(),
         level,
         message,
         ...this.context,
         ...data
       };
       
       console.log(JSON.stringify(logEntry));
     }
   }
   
   Usage in Lambda:
   export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
     const logger = new Logger();
     logger.setContext('requestId', context.requestId);
     logger.setContext('functionName', context.functionName);
     
     const startTime = Date.now();
     
     try {
       logger.info('Order creation started', {
         userId: extractUserId(event)
       });
       
       const order = await createOrder(body);
       
       logger.info('Order created successfully', {
         orderId: order.orderId,
         totalAmount: order.totalAmount,
         duration: Date.now() - startTime
       });
       
       return successResponse(order);
     } catch (error) {
       logger.error('Order creation failed', error as Error, {
         userId: extractUserId(event),
         duration: Date.now() - startTime
       });
       
       return errorResponse(error);
     }
   };

Learning Outcome:
├── Edge cases identified and handled
├── Idempotency implemented
├── Circuit breaker pattern understood
├── Error handling standardized
├── Logging best practices applied
└── Production-ready code quality
```

---

## 6. LAMBDA FUNCTIONS: DEEP DIVE

### 6.1 Lambda Execution Model

**Cold Start vs Warm Start:**
```
Cold Start (First Invocation or After Idle):
├── AWS provisions execution environment
├── Downloads function code from S3
├── Initializes runtime (Node.js)
├── Executes initialization code (outside handler)
├── Executes handler function
└── Duration: 1-3 seconds (varies)

Warm Start (Subsequent Invocations):
├── Reuses existing execution environment
├── Skips initialization
├── Executes handler function only
└── Duration: 10-100 milliseconds

Optimization Strategy:
├── Initialize clients outside handler
├── Reuse database connections
├── Cache static data
└── Keep functions "warm" (CloudWatch Events ping)
```

**Example: Optimized Lambda Structure**
```typescript
// ✅ GOOD: Initialize outside handler
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Cache configuration (loaded once)
const config = {
  ordersTable: process.env.ORDERS_TABLE,
  minOrderValue: 100,
  taxRate: 0.05
};

export const handler = async (event, context) => {
  // Handler executes quickly, reusing connections
  const result = await docClient.get({
    TableName: config.ordersTable,
    Key: { orderId: event.pathParameters.orderId }
  });
  
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};

// ❌ BAD: Initialize inside handler
export const handler = async (event, context) => {
  const client = new DynamoDBClient({});  // Created every time!
  const docClient = DynamoDBDocumentClient.from(client);
  
  const result = await docClient.get({...});
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};
```

### 6.2 Memory and Timeout Configuration

**Memory Size Impact:**
```
Memory Configuration Options: 128 MB to 10,240 MB (10 GB)

Cost Calculation:
├── Price: $0.0000166667 per GB-second
├── 128 MB = 0.125 GB
├── Example: 1 million requests, 1 second each
│   ├── 128 MB: 1M * 1s * 0.125 GB * $0.0000166667 = $2.08
│   ├── 256 MB: 1M * 1s * 0.25 GB * $0.0000166667 = $4.17
│   ├── 512 MB: 1M * 1s * 0.5 GB * $0.0000166667 = $8.33
│   └── 1024 MB: 1M * 1s * 1 GB * $0.0000166667 = $16.67

Important: CPU power scales with memory
├── 128 MB = Low CPU power (slow execution)
├── 1024 MB = Proportional CPU (4x faster)
└── Paradox: Higher memory can be cheaper (faster execution)

Example Scenario:
├── Function with 128 MB: 2 seconds execution
│   └── Cost: 2s * 0.125 GB * $0.0000166667 = $0.0000041667
├── Same function with 512 MB: 0.6 seconds execution
│   └── Cost: 0.6s * 0.5 GB * $0.0000166667 = $0.0000050000
└── Verdict: 128 MB is cheaper in this case

Optimization Process:
1. Start with 512 MB (good balance)
2. Monitor CloudWatch metrics:
   ├── Duration
   ├── Memory Used
   └── Throttles
3. Adjust based on actual usage:
   ├── If memory used < 50%: Reduce memory
   ├── If duration consistently high: Increase memory
   └── Run load tests to find optimal setting

Your Learning Project:
├── Simple queries (getUser): 256 MB, 5s timeout
├── Order creation: 512 MB, 10s timeout
├── Image processing: 1024 MB, 30s timeout
└── Batch operations: 1024 MB, 60s timeout
```

**Timeout Configuration:**
```
Default: 3 seconds
Maximum: 15 minutes (900 seconds)
Recommendation: Set slightly higher than expected duration

Examples:
├── Simple CRUD: 5-10 seconds
├── API calls to third-party: 15-30 seconds
├── Complex calculations: 30-60 seconds
└── Batch processing: 5-15 minutes

Warning: Long timeouts increase cost if function hangs
├── Always implement timeout handling in code
└── Don't rely solely on Lambda timeout
```

### 6.3 Environment Variables & Secrets

**Environment Variables (SAM Template):**
```yaml
CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Environment:
      Variables:
        ORDERS_TABLE: !Ref OrdersTable
        USERS_TABLE: !Ref UsersTable
        MIN_ORDER_VALUE: '100'
        TAX_RATE: '0.05'
        STAGE: dev
        LOG_LEVEL: INFO
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'  # Reuse HTTP connections
```

**Secrets Management:**
```
❌ NEVER store sensitive data in environment variables:
├── API keys
├── Database passwords
├── Private keys
└── OAuth tokens

✅ Use AWS Secrets Manager:

1. Store secret:
$ aws secretsmanager create-secret \
  --name milk-delivery/stripe-api-key \
  --secret-string '{"apiKey":"sk_test_..."}'

2. Grant Lambda permission (SAM template):
CreateOrderFunction:
  Policies:
    - AWSSecretsManagerGetSecretValuePolicy:
        SecretArn: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:milk-delivery/*'

3. Retrieve in Lambda:
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretName: string) {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString!);
}

// Cache secret (avoid fetching on every invocation)
let stripeKey: string;

export const handler = async (event) => {
  if (!stripeKey) {
    const secret = await getSecret('milk-delivery/stripe-api-key');
    stripeKey = secret.apiKey;
  }
  
  // Use stripeKey
};

Cost: $0.40 per secret per month + $0.05 per 10,000 API calls
For learning: ~$0.40/month (1 secret, minimal calls)
```

### 6.4 Lambda Layers (Code Reuse)

**When to Use Layers:**
```
Use Cases:
├── Shared dependencies (AWS SDK, lodash, axios)
├── Common utilities (logger, validation, db helpers)
├── Large libraries (reduce deployment package size)
└── Code reuse across multiple functions

Benefits:
├── Faster deployments (layer unchanged, only function code updates)
├── Smaller deployment packages
├── Easier dependency management
└── Version control for shared code

Limitations:
├── Max 5 layers per function
├── Max 250 MB unzipped (all layers + function)
├── Layers are immutable (create new version to update)
```

**Creating a Lambda Layer:**
```
Directory Structure:
backend/
└── layers/
    └── common/
        ├── nodejs/
        │   ├── node_modules/  ← Dependencies
        │   └── utils/         ← Your utilities
        │       ├── logger.ts
        │       ├── db.ts
        │       └── validation.ts
        └── package.json

package.json:
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.400.0",
    "@aws-sdk/lib-dynamodb": "^3.400.0",
    "uuid": "^9.0.0"
  }
}

Build Layer:
$ cd layers/common/nodejs
$ npm install
$ cd ../..
$ zip -r common-layer.zip nodejs/

SAM Template:
CommonLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: milk-delivery-common
    Description: Shared utilities and dependencies
    ContentUri: layers/common/
    CompatibleRuntimes:
      - nodejs20.x
    RetentionPolicy: Retain

CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref CommonLayer
    CodeUri: dist/

Usage in Lambda:
// Import from layer
import { logger } from '/opt/nodejs/utils/logger';
import { v4 as uuidv4 } from 'uuid';  // From layer dependencies

export const handler = async (event) => {
  logger.info('Function started');
  const id = uuidv4();
  // ...
};
```

### 6.5 Lambda Monitoring Metrics

**Key CloudWatch Metrics:**
```
1. Invocations
   ├── Count: Total number of invocations
   ├── Use: Track function usage
   └── Free Tier: 1M invocations/month

2. Duration
   ├── Measure: Execution time in milliseconds
   ├── Use: Identify slow functions
   └── Optimization target: Keep under 1 second

3. Errors
   ├── Count: Failed invocations
   ├── Types: Function errors, timeout errors
   └── Goal: < 1% error rate

4. Throttles
   ├── Count: Rejected due to concurrency limits
   ├── Causes: Too many concurrent executions
   └── Solution: Increase reserved concurrency or optimize

5. Memory Usage
   ├── Measure: Actual memory used
   ├── Use: Right-size memory configuration
   └── Example: If using 150 MB of 512 MB, reduce to 256 MB

6. Concurrent Executions
   ├── Measure: Number of instances running simultaneously
   ├── Default limit: 1000 per region
   └── Free tier limit: Usually sufficient for learning

CloudWatch Logs Insights Queries:

Query 1: Average duration by function
fields @timestamp, @duration
| stats avg(@duration) as avg_duration by @function
| sort avg_duration desc

Query 2: Error count
filter @type = "ERROR"
| stats count() as error_count by bin(5m)

Query 3: Memory usage
fields @timestamp, @memorySize / 1000 / 1000 as mem_mb, @maxMemoryUsed / 1000 / 1000 as used_mb
| stats avg(used_mb) as avg_used, max(used_mb) as max_used

Query 4: Cold starts
filter @type = "REPORT"
| fields @duration, @initDuration
| filter ispresent(@initDuration)
| stats count() as cold_starts, avg(@initDuration) as avg_cold_start_ms
```

### 6.6 Lambda Cost Optimization

**Free Tier Maximization:**
```
Lambda Free Tier (Always Free):
├── 1M requests per month
├── 400,000 GB-seconds compute time per month

Calculation Examples:

Scenario 1: 128 MB function, 200ms execution
├── Compute: 0.2s * 0.125 GB = 0.025 GB-seconds per request
├── Free tier allows: 400,000 / 0.025 = 16M requests
├── But request limit is 1M, so effective limit: 1M requests
└── Verdict: Request limit is constraint, not compute

Scenario 2: 1024 MB function, 1s execution
├── Compute: 1s * 1 GB = 1 GB-second per request
├── Free tier allows: 400,000 / 1 = 400,000 requests
├── But request limit is 1M
└── Verdict: Compute is constraint, only 400K requests free

Your Learning Project Estimate:
├── Average: 512 MB, 500ms execution
├── Compute per request: 0.5s * 0.5 GB = 0.25 GB-seconds
├── Free tier allows: 400,000 / 0.25 = 1.6M requests
├── Your usage: ~10,000 requests/month during development
└── Cost: $0 (well within free tier)

Cost After Free Tier:
├── Requests: $0.20 per 1M requests
├── Compute: $0.0000166667 per GB-second
└── Your 10K requests: ~$0.02/month

Optimization Tips:
1. Reduce memory if not fully utilized
2. Optimize code for faster execution
3. Use layers for shared dependencies
4. Implement caching where possible
5. Batch operations when feasible
6. Monitor and eliminate unnecessary invocations
```

---

## 7. DYNAMODB: QUERY PATTERNS & OPTIMIZATION

### 7.1 Key Concepts

**Partition Key (PK) vs Sort Key (SK):**
```
Partition Key (Required):
├── Determines which partition data is stored in
├── Must be unique for each item (if no sort key)
├── Used for direct lookups: GetItem, PutItem
└── Example: userId, orderId, productId

Sort Key (Optional):
├── Allows multiple items with same partition key
├── Items sorted by sort key value
├── Enables range queries
└── Example: timestamp, status, category

Table Design Pattern 1: Simple (PK only)
Users Table:
PK: userId
├── user-001
├── user-002
└── user-003

Query: Get user by ID
const result = await docClient.get({
  TableName: 'Users',
  Key: { userId: 'user-001' }
});

Table Design Pattern 2: Composite Key (PK + SK)
Orders Table:
PK: userId, SK: orderId
├── user-001, order-2025-001
├── user-001, order-2025-002
├── user-002, order-2025-003
└── user-002, order-2025-004

Query: Get all orders for a user
const result = await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-001'
  }
});

Result: Returns order-2025-001 and order-2025-002
```

**Global Secondary Index (GSI):**
```
Purpose: Query table using different keys

Example Problem:
Users Table: PK = userId
├── You can query by userId
└── But you cannot query by email

Solution: Create GSI on email

GSI: email-index
PK: email
├── Allows query by email
└── Returns userId

Query: Find user by email
const result = await docClient.query({
  TableName: 'Users',
  IndexName: 'email-index',
  KeyConditionExpression: 'email = :email',
  ExpressionAttributeValues: {
    ':email': 'user@example.com'
  }
});

GSI Considerations:
├── Cost: Consumes additional WCU/RCU
├── Eventual consistency: Slight delay (usually milliseconds)
├── Projection: Choose ALL, KEYS_ONLY, or INCLUDE
└── Free Tier: Included in 25 WCU/RCU limit

SAM Template:
UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    AttributeDefinitions:
      - AttributeName: userId
        AttributeType: S
      - AttributeName: email
        AttributeType: S
    KeySchema:
      - AttributeName: userId
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: email-index
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        Projection:
          ProjectionType: ALL
    BillingMode: PAY_PER_REQUEST
```

### 7.2 Query vs Scan

**Query (Efficient):**
```
Characteristics:
├── Uses partition key (required)
├── Optionally uses sort key for range
├── Returns only matching items
├── Fast and cost-effective
└── Use whenever possible

Example: Get all orders for a user
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-123'
  }
});

Cost: 1 RCU per 4 KB read (eventually consistent)
Example: 10 orders, 1 KB each = 10 KB = 3 RCUs
```

**Scan (Inefficient):**
```
Characteristics:
├── Reads entire table
├── Filters after reading (wasteful)
├── Slow and expensive
├── Consumes RCUs for all items scanned
└── Avoid in production

Example: Find all orders with status="Pending" (BAD!)
await docClient.scan({
  TableName: 'Orders',
  FilterExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Problem:
├── Scans all 10,000 orders
├── Filters to 100 pending orders
├── Consumes RCUs for all 10,000 items
└── Returns only 100 items

Cost: If 10,000 items * 1 KB = 10,000 KB = 2,500 RCUs
(Way over free tier 25 RCU limit!)

Solution: Use GSI
Create GSI: status-index (PK: status, SK: createdAt)

Query with GSI:
await docClient.query({
  TableName: 'Orders',
  IndexName: 'status-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Cost: Only reads 100 pending orders = 25 RCUs
Savings: 100x reduction!
```

### 7.3 Batch Operations

**BatchGetItem:**
```
Purpose: Retrieve multiple items in one request

Limitations:
├── Max 100 items per request
├── Max 16 MB total response# SOLO DEVELOPER GUIDE - AWS FREE TIER OPTIMIZED
## Milk & Milk Products Delivery Platform (Comprehensive Learning Project)

---

## TABLE OF CONTENTS
1. [Solo Developer Workflow & Mindset](#solo-developer-workflow-mindset)
2. [AWS Free Tier: Complete Strategy](#aws-free-tier-complete-strategy)
3. [Development Environment Setup](#development-environment-setup)
4. [Hybrid Development: Console + VS Code](#hybrid-development-console-vs-code)
5. [Feature Development Flow (Step-by-Step)](#feature-development-flow)
6. [Lambda Functions: Deep Dive](#lambda-functions-deep-dive)
7. [DynamoDB: Query Patterns & Optimization](#dynamodb-query-patterns-optimization)
8. [API Gateway: Configuration & Testing](#api-gateway-configuration-testing)
9. [Authentication & Authorization](#authentication-authorization)
10. [Error Handling & Edge Cases](#error-handling-edge-cases)
11. [Testing Strategies](#testing-strategies)
12. [Monitoring & Debugging](#monitoring-debugging)
13. [CI/CD Pipeline Setup](#cicd-pipeline-setup)
14. [Cost Optimization Techniques](#cost-optimization-techniques)
15. [Security Best Practices](#security-best-practices)
16. [Performance Optimization](#performance-optimization)
17. [Common Pitfalls & Solutions](#common-pitfalls-solutions)
18. [Learning Path & Milestones](#learning-path-milestones)

---

## 1. SOLO DEVELOPER WORKFLOW & MINDSET

### 1.1 Daily Development Routine

**Realistic Time Allocation (3-4 hours/day):**

```
Morning Session (1.5-2 hours)
├── 00:00-00:10 → Review AWS costs (console billing dashboard)
├── 00:10-00:20 → Check CloudWatch logs for overnight errors
├── 00:20-00:30 → Plan today's feature (write in docs/daily-log.md)
├── 00:30-01:45 → Development work (focus time, no distractions)
└── 01:45-02:00 → Commit code & push to GitHub

Evening Session (1.5-2 hours)
├── 00:00-01:00 → Continue feature development or bug fixes
├── 01:00-01:20 → Testing (local + deployed)
├── 01:20-01:40 → Documentation (update API docs, learning notes)
├── 01:40-01:50 → Deploy to AWS (if ready)
└── 01:50-02:00 → Plan tomorrow's task + update Kanban board
```

**Weekly Rhythm:**
```
Monday: Start new feature (backend)
Tuesday: Complete feature + unit tests
Wednesday: Integration + API Gateway setup
Thursday: Frontend integration
Friday: End-to-end testing + documentation
Saturday: Deployment + monitoring
Sunday: Review week, plan next week, learn new AWS concept
```

### 1.2 Solo Developer's Development Phases

**Phase 1: MVP Foundation (Week 1-3)**
```
Week 1: Infrastructure Setup
├── Day 1-2: AWS account setup, IAM users, billing alerts
├── Day 3-4: First Lambda function (Hello World → createUser)
├── Day 5-6: DynamoDB table creation + manual data entry
└── Day 7: First API endpoint working end-to-end

Week 2: User Management
├── Day 1-2: User registration with validation
├── Day 3-4: User login (Cognito integration)
├── Day 5-6: User profile management
└── Day 7: Testing + bug fixes

Week 3: Product Catalog
├── Day 1-3: Product listing + search
├── Day 4-5: Product details + images (S3)
├── Day 6: Vendor management basics
└── Day 7: Integration testing
```

**Phase 2: Core Business Logic (Week 4-8)**
```
Week 4: Order Creation Flow
├── Shopping cart logic (frontend state)
├── Order validation
├── Inventory checking
└── Order creation Lambda

Week 5: Payment Integration
├── Stripe/Razorpay SDK setup
├── Payment flow (test mode)
├── Payment webhooks
└── Order confirmation

Week 6: Step Functions
├── Order processing workflow
├── Inventory reservation
├── Vendor notifications
└── State machine testing

Week 7: Delivery Management
├── Delivery scheduling
├── Status updates
├── Notifications (SNS/SES)
└── Delivery tracking

Week 8: Integration & Bug Fixes
├── End-to-end testing
├── Edge case handling
├── Performance optimization
└── Documentation
```

**Phase 3: Frontend & Polish (Week 9-12)**
```
Week 9-10: React Frontend
├── Component development
├── State management (Redux/Zustand)
├── API integration
└── Responsive design

Week 11: Advanced Features
├── User dashboard
├── Order history
├── Admin panel basics
└── Analytics

Week 12: Deployment & Launch
├── Production deployment
├── Performance tuning
├── Security audit
└── Final testing
```

### 1.3 Task Management (Solo Approach)

**Simple Kanban Board (GitHub Projects or Trello):**
```
Backlog → Todo → In Progress → Testing → Done
```

**Sample Tasks Breakdown:**
```yaml
Epic: User Management
  Story: User Registration
    Task: Create DynamoDB Users table
    Task: Create createUser Lambda
    Task: Add validation logic
    Task: Set up API Gateway endpoint
    Task: Write unit tests
    Task: Test in console
    Task: Deploy with SAM
    Task: Integration test
    
  Story: User Login
    Task: Configure Cognito User Pool
    Task: Create login API
    Task: JWT token validation
    Task: Test authentication flow
```

### 1.4 Learning Mindset

**Document Everything:**
```
docs/
├── daily-log.md           # What you learned today
├── mistakes.md            # Errors and how you fixed them
├── aws-concepts.md        # AWS services explained in your words
├── design-decisions.md    # Why you chose X over Y
└── helpful-resources.md   # Useful articles, videos, docs
```

**Sample daily-log.md entry:**
```markdown
# Day 15 - October 10, 2025

## What I Built Today
- Completed createOrder Lambda function
- Added inventory validation
- Set up Step Functions for order processing

## What I Learned
- DynamoDB transactions prevent race conditions
- Lambda cold starts can be 1-2 seconds (need to optimize)
- Step Functions are billed per state transition ($0.025/1000)

## Problems I Faced
- Issue: Lambda timeout after 3 seconds
- Solution: Increased timeout to 10s, optimized DynamoDB query
- Learning: Always use indexes for queries, not scans!

## Tomorrow's Plan
- Add payment integration (Stripe test mode)
- Write unit tests for createOrder
- Deploy to dev environment
```

---

## 2. AWS FREE TIER: COMPLETE STRATEGY

### 2.1 Detailed Free Tier Limits

**Always Free (No Time Limit):**
```yaml
Lambda:
  Requests: 1,000,000 per month
  Compute: 400,000 GB-seconds per month
  Example: 
    - 1M invocations with 128MB = ~51 hours compute
    - Roughly 3,200 requests/day with 128MB, 1s execution
  Your Usage: Likely 100-500 requests/day during development
  Status: ✅ Safe

DynamoDB:
  Storage: 25 GB
  WCU: 25 (write capacity units)
  RCU: 25 (read capacity units)
  Example:
    - 25 WCU = 25 writes/sec or 2.1M writes/day
    - 25 RCU = 100 eventual reads/sec or 8.6M reads/day
  Your Usage: Maybe 50-100 operations/day in development
  Status: ✅ Very safe
  
  Important: Use on-demand billing mode
    - No upfront capacity planning
    - Pay only for actual reads/writes
    - First 25 WCU/RCU free, then $1.25/$0.25 per million

S3:
  Storage: 5 GB Standard storage
  GET: 20,000 requests
  PUT: 2,000 requests
  Data Transfer: 100 GB out per month (first 12 months)
  Your Usage: 10-50 MB for product images in development
  Status: ✅ Safe

CloudWatch:
  Logs: 5 GB ingestion, 5 GB storage
  Metrics: 10 custom metrics
  Alarms: 10 alarms
  Dashboard: 3 dashboards
  Your Usage: 100-500 MB logs/month during development
  Status: ✅ Safe

SNS:
  Email: 1,000 notifications/month (12 months free)
  SMS: 100 notifications/month (12 months free)
  HTTP: 100,000 notifications/month (12 months free)
  After 12 months: $0.50 per million emails
  Your Usage: 10-50 emails/month for testing
  Status: ⚠️ Be careful with SMS after year 1

SES (Simple Email Service):
  Emails: 62,000 per month (always free if sent from EC2)
  From Lambda: 3,000 per month free (12 months)
  After: $0.10 per 1,000 emails
  Your Usage: 10-100 emails/month
  Status: ✅ Safe, better than SNS for emails

Cognito:
  MAU: 50,000 monthly active users (always free)
  Your Usage: 1-10 test users
  Status: ✅ Very safe
```

**12 Months Free (After Sign-up):**
```yaml
API Gateway:
  REST API: 1,000,000 requests per month
  After: $3.50 per million requests
  Your Usage: 100-1,000 requests/day = 3,000-30,000/month
  Status: ✅ Safe during free tier
  Strategy: After 1 year, consider Lambda Function URLs (free)

CloudFront:
  Data Transfer: 1 TB out
  Requests: 10,000,000 HTTP/HTTPS
  After: $0.085 per GB + $0.0075 per 10,000 requests
  Your Usage: Don't use during development
  Status: ⚠️ Use only for production launch
```

**Services to AVOID (Cost Traps):**
```yaml
❌ NAT Gateway:
  Cost: $0.045/hour = $32.40/month + data transfer
  Why avoid: Expensive for learning
  Alternative: Lambda functions don't need NAT (direct internet)

❌ Application Load Balancer:
  Cost: $0.0225/hour = $16.20/month + LCU charges
  Why avoid: Unnecessary for serverless
  Alternative: API Gateway (free tier) or Lambda Function URLs

❌ RDS:
  Free tier: 750 hours/month for 12 months (db.t2.micro)
  After: Minimum $15-20/month
  Why avoid: Not needed, use DynamoDB
  Alternative: DynamoDB (always free up to limits)

❌ ECS/EKS:
  ECS: $0.10/hour per running task
  EKS: $0.10/hour for control plane = $73/month
  Why avoid: Overkill for learning serverless
  Alternative: Lambda functions

❌ ElastiCache:
  Free tier: None
  Cost: Minimum $13/month
  Why avoid: Not needed for MVP
  Alternative: In-memory caching in Lambda

❌ Elasticsearch:
  Free tier: None
  Cost: Minimum $23/month
  Why avoid: Expensive
  Alternative: DynamoDB queries + GSIs
```

### 2.2 Cost Monitoring Setup (Critical!)

**Step 1: Set Up Billing Alerts (Day 1 Task)**
```
AWS Console → Billing Dashboard → Billing Preferences
├── ✅ Receive PDF Invoice By Email
├── ✅ Receive Free Tier Usage Alerts (your email)
├── ✅ Receive Billing Alerts
└── Save preferences

AWS Console → CloudWatch → Alarms → Billing
├── Create Alarm: Estimated Charges > $5
├── Create Alarm: Estimated Charges > $10
├── Create Alarm: Estimated Charges > $20
└── SNS Topic: Email notification to yourself
```

**Step 2: Daily Cost Check Routine**
```
Every Morning (5 minutes):
├── AWS Console → Billing Dashboard
├── Check "Month-to-Date Spend"
├── Review "Free Tier Usage" (shows % consumed)
└── If over $5: Investigate "Cost Explorer"

Expected Daily Costs During Development:
├── Days 1-30: $0.00 - $0.50/day (within free tier)
├── Days 31-60: $0.50 - $1.00/day (learning curve)
├── Days 61-90: $0.20 - $0.50/day (optimized)
└── Goal: Stay under $10/month
```

**Step 3: AWS Cost Explorer Tags**
```
Tag all resources for tracking:
├── Environment: dev
├── Project: milk-delivery
├── Owner: your-name
└── Cost-Center: learning

Example in SAM template:
Tags:
  Environment: dev
  Project: milk-delivery
  Owner: solo-developer
```

### 2.3 Free Tier Budget Calculator

**Your Estimated Monthly Usage:**
```yaml
Service            | Free Tier    | Your Usage  | Cost Impact
-------------------|--------------|-------------|-------------
Lambda             | 1M requests  | 10,000      | $0.00
DynamoDB           | 25 WCU/RCU   | 1,000 ops   | $0.00
API Gateway        | 1M requests  | 10,000      | $0.00 (Year 1)
S3                 | 5 GB         | 100 MB      | $0.00
CloudWatch Logs    | 5 GB         | 500 MB      | $0.00
SES                | 62,000 emails| 50 emails   | $0.00
Cognito            | 50k MAU      | 5 users     | $0.00
Step Functions     | 4,000 states | 100 states  | $0.00
-------------------|--------------|-------------|-------------
TOTAL                                           | $0.00-$2.00

Potential Charges:
- API Gateway (after Year 1): ~$0.04/month
- Data Transfer Out: ~$0.50/month (minimal testing)
- CloudWatch (if over 5GB logs): ~$1.00/month

Expected Total: $0-5/month during development
```

---

## 3. DEVELOPMENT ENVIRONMENT SETUP

### 3.1 Machine Requirements

**Minimum Specifications:**
```yaml
Operating System: Windows 10/11, macOS, or Linux
Processor: Intel i3 or equivalent (dual-core)
RAM: 8 GB minimum, 16 GB recommended
Storage: 20 GB free space (for Node.js, Docker, projects)
Internet: Stable connection (AWS API calls)
```

**Recommended Setup:**
```yaml
OS: Windows 11 or macOS
RAM: 16 GB (Docker + VS Code + Browser = memory hungry)
Storage: SSD with 50 GB free (faster builds)
Internet: 10 Mbps+ (for video tutorials, AWS console)
```

### 3.2 Software Installation (Step-by-Step)

**Step 1: Install Node.js**
```
What: JavaScript runtime for Lambda development
Why: Lambda supports Node.js 20.x runtime
Where: https://nodejs.org/en/download

Installation:
├── Download Node.js 20.x LTS installer
├── Run installer (default options are fine)
├── Verify installation:
│   ├── Open terminal/command prompt
│   ├── Type: node --version (should show v20.x.x)
│   └── Type: npm --version (should show v10.x.x)
└── Done!

Post-Install Configuration:
├── Set npm global directory (avoid permission issues)
│   └── npm config set prefix ~/.npm-global (Mac/Linux)
│       or C:\Users\YourName\AppData\Roaming\npm (Windows)
└── Update npm: npm install -g npm@latest
```

**Step 2: Install AWS CLI**
```
What: Command-line tool to interact with AWS services
Why: Deploy resources, check logs, manage services
Where: https://aws.amazon.com/cli/

Windows:
├── Download MSI installer
├── Run installer
└── Verify: aws --version

macOS:
├── Option 1: Homebrew
│   └── brew install awscli
├── Option 2: Official installer
│   └── Download .pkg file
└── Verify: aws --version

Linux:
├── curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
├── unzip awscliv2.zip
├── sudo ./aws/install
└── Verify: aws --version

Configuration:
├── Run: aws configure
├── AWS Access Key ID: [Get from IAM console]
├── AWS Secret Access Key: [Get from IAM console]
├── Default region name: us-east-1
└── Default output format: json
```

**Step 3: Install AWS SAM CLI**
```
What: Framework for building serverless applications
Why: Local testing, easy deployment, IaC with templates
Where: https://aws.amazon.com/serverless/sam/

Windows:
├── Download MSI installer
├── Run installer (requires admin rights)
└── Verify: sam --version

macOS:
├── Homebrew: brew install aws-sam-cli
└── Verify: sam --version

Linux:
├── Download ZIP file
├── Unzip and install
└── Verify: sam --version

SAM Prerequisites:
├── Docker Desktop (for sam local commands)
│   └── Download from: https://www.docker.com/products/docker-desktop
└── Python 3.8+ (usually pre-installed on Mac/Linux)
```

**Step 4: Install Visual Studio Code**
```
What: Code editor with excellent AWS support
Why: Best IDE for serverless development
Where: https://code.visualstudio.com/

Installation:
├── Download installer for your OS
├── Run installer
├── Launch VS Code
└── Done!

Essential Extensions (Install via Extensions panel):
├── AWS Toolkit (amazonwebservices.aws-toolkit-vscode)
│   └── Integrates AWS services into VS Code
├── ESLint (dbaeumer.vscode-eslint)
│   └── JavaScript/TypeScript linting
├── Prettier (esbenp.prettier-vscode)
│   └── Code formatting
├── Thunder Client (rangav.vscode-thunder-client)
│   └── API testing (like Postman, but in VS Code)
├── GitLens (eamodio.gitlens)
│   └── Git history and blame annotations
├── Docker (ms-azuretools.vscode-docker)
│   └── Manage Docker containers
└── REST Client (humao.rest-client)
    └── Test HTTP requests from .http files
```

**Step 5: Install Git**
```
What: Version control system
Why: Code versioning, GitHub integration
Where: https://git-scm.com/downloads

Installation:
├── Download installer
├── Run with default options
└── Verify: git --version

Configuration:
├── git config --global user.name "Your Name"
├── git config --global user.email "your.email@example.com"
└── git config --global init.defaultBranch main
```

**Step 6: Optional but Recommended Tools**
```
Docker Desktop:
├── Required for: sam local invoke, sam local start-api
├── Download: https://www.docker.com/products/docker-desktop
└── Purpose: Run Lambda functions locally in containers

Postman (Alternative to Thunder Client):
├── Download: https://www.postman.com/downloads/
└── Purpose: API testing with collections

DynamoDB Local (Optional):
├── Download: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
└── Purpose: Test DynamoDB operations without AWS connection
```

### 3.3 AWS Account Setup

**Step 1: Create AWS Account**
```
Go to: https://aws.amazon.com/free

Sign Up Process:
├── 1. Email and password
├── 2. Account type: Personal
├── 3. Contact information
├── 4. Payment information (required, but won't charge if stay in free tier)
├── 5. Identity verification (phone call)
└── 6. Select Support Plan: Basic (Free)

⚠️ Important:
- Use a credit/debit card with at least $1 for verification
- Set up billing alerts immediately
- Enable MFA (Multi-Factor Authentication) for root account
```

**Step 2: Secure Root Account**
```
After Sign-up:
├── 1. Go to IAM → Dashboard
├── 2. Enable MFA for root account
│   ├── Use Google Authenticator, Authy, or hardware token
│   └── NEVER share MFA codes
├── 3. Create IAM user for daily use (don't use root)
└── 4. Delete root access keys if created
```

**Step 3: Create IAM User (For Development)**
```
IAM → Users → Add User

User Details:
├── Username: milk-delivery-dev
├── Access type: ✅ Programmatic access (for AWS CLI)
│              ✅ AWS Management Console access (for console)
└── Console password: Auto-generated or custom

Permissions:
├── Attach existing policies directly:
│   ├── ✅ AdministratorAccess (for learning only)
│   │   └── ⚠️ In production, use least-privilege policies
│   └── Or create custom policy (see below)
└── Tags:
    ├── Environment: dev
    └── Purpose: learning

Download Credentials:
├── Save Access Key ID
├── Save Secret Access Key
└── Store securely (password manager recommended)

Configure AWS CLI:
├── aws configure --profile milk-delivery-dev
├── Enter Access Key ID
├── Enter Secret Access Key
├── Region: us-east-1
└── Output: json
```

**Custom IAM Policy (Least Privilege for Learning):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "dynamodb:*",
        "apigateway:*",
        "s3:*",
        "cloudformation:*",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "logs:*",
        "events:*",
        "sns:*",
        "ses:*",
        "cognito-idp:*",
        "states:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3.4 VS Code Configuration

**Workspace Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true,
  "files.autoSave": "onFocusChange",
  "typescript.preferences.importModuleSpecifier": "relative",
  "aws.samcli.location": "/usr/local/bin/sam",
  "aws.profile": "milk-delivery-dev",
  "aws.region": "us-east-1",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

**Launch Configuration (.vscode/launch.json):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Lambda (SAM)",
      "type": "node",
      "request": "attach",
      "address": "localhost",
      "port": 5858,
      "localRoot": "${workspaceFolder}/backend/src",
      "remoteRoot": "/var/task",
      "protocol": "inspector",
      "stopOnEntry": false
    }
  ]
}
```

---

## 4. HYBRID DEVELOPMENT: CONSOLE + VS CODE

### 4.1 Philosophy: When to Use What

**AWS Console is BEST for:**
```
✅ Visual Learning & Exploration
   ├── Understanding service dashboards
   ├── Exploring service features and options
   ├── Reading integrated documentation
   └── Seeing visual representations (Step Functions graphs)

✅ One-Time Setup Tasks
   ├── Creating Cognito User Pool (complex configuration)
   ├── Setting up billing alerts
   ├── Creating IAM roles and policies (first time)
   ├── Configuring CloudWatch dashboards
   └── Setting up SNS/SES email verification

✅ Quick Testing & Debugging
   ├── Testing Lambda with sample events
   ├── Viewing DynamoDB table data
   ├── Checking CloudWatch logs in real-time
   ├── Testing API Gateway endpoints manually
   └── Viewing Step Functions execution history

✅ Monitoring & Operations
   ├── CloudWatch Logs Insights queries
   ├── Viewing metrics and graphs
   ├── Checking service quotas and limits
   ├── Cost analysis and billing reports
   └── Resource utilization dashboards
```

**VS Code is BEST for:**
```
✅ All Code Development
   ├── Writing Lambda functions
   ├── TypeScript/JavaScript development
   ├── Creating unit tests
   ├── Shared utilities and libraries
   └── Frontend React components

✅ Infrastructure as Code (IaC)
   ├── SAM templates (template.yaml)
   ├── CloudFormation templates
   ├── Environment configuration files
   └── Deployment scripts

✅ Version Control
   ├── Git commits and branching
   ├── Code reviews (self-review before commit)
   ├── Merge conflict resolution
   └── GitHub integration

✅ Local Development & Testing
   ├── sam local invoke (test Lambda locally)
   ├── sam local start-api (local API Gateway)
   ├── Unit tests with Jest
   ├── Integration tests
   └── Debugging with breakpoints

✅ Batch Operations
   ├── Creating multiple Lambda functions
   ├── Updating multiple files at once
   ├── Search and replace across project
   └── Refactoring code
```

### 4.2 Hybrid Workflow Patterns

**Pattern 1: Learning a New Service**
```
Example: Setting up DynamoDB for the first time

Step 1: AWS Console (30 minutes)
├── Navigate to DynamoDB service
├── Click "Create table"
├── Experiment with different settings:
│   ├── Partition key vs. Sort key
│   ├── Provisioned vs. On-demand
│   ├── Global Secondary Indexes (GSI)
│   └── Stream settings
├── Create a test table manually
├── Add sample items via console
├── Try different queries in console
└── Learn query vs. scan difference

Step 2: VS Code (30 minutes)
├── Create SAM template with DynamoDB resource
├── Define table schema in YAML
├── Add GSI definitions
├── Write Lambda function to interact with table
└── Test locally with DynamoDB Local or deployed table

Step 3: AWS Console (15 minutes)
├── Deploy via SAM from VS Code terminal
├── Verify table creation in console
├── Check table metrics
└── Validate data structure

Result: You understand DynamoDB AND have IaC code
```

**Pattern 2: Developing a New Lambda Function**
```
Example: Creating "createOrder" Lambda

Step 1: Console Prototype (15 minutes)
├── AWS Console → Lambda → Create function
├── Name: createOrderPrototype
├── Runtime: Node.js 20.x
├── Write basic handler code inline
├── Create test event with sample JSON:
│   {
│     "userId": "user-123",
│     "items": [{"productId": "prod-1", "quantity": 2}]
│   }
├── Test and see output
├── Fix any immediate errors
└── Verify basic logic works

Step 2: VS Code Development (2 hours)
├── Create file: backend/src/lambdas/order/createOrder.ts
├── Copy working logic from console
├── Add TypeScript types and interfaces
├── Implement proper error handling
├── Add input validation
├── Add logging
├── Add to SAM template
├── Write unit tests
└── Test locally: sam local invoke

Step 3: Console Debugging (20 minutes)
├── Deploy from VS Code: sam deploy
├── Go to AWS Console → Lambda → createOrder
├── Test with real event
├── Check CloudWatch logs
├── Identify any AWS-specific issues
└── Note execution time and memory usage

Step 4: VS Code Refinement (30 minutes)
├── Fix issues found in console testing
├── Optimize memory settings in SAM template
├── Adjust timeout if needed
├── Update documentation
└── Redeploy: sam deploy

Result: Production-ready Lambda with IaC
```

**Pattern 3: API Gateway Setup**
```
Example: Creating REST API with multiple endpoints

Step 1: Console Exploration (30 minutes)
├── AWS Console → API Gateway
├── Create REST API (not HTTP API)
├── Manually create one resource: /users
├── Add POST method
├── Link to Lambda function (console UI)
├── Configure CORS manually
├── Deploy to "dev" stage
├── Test with API Gateway test feature
└── Understand request/response transformation

Step 2: VS Code IaC (1 hour)
├── Add API Gateway to SAM template
├── Define all resources and methods in YAML
├── Configure Cognito authorizer
├── Set up request validators
├── Configure CORS in template
├── Add multiple endpoints
└── Deploy entire API: sam deploy

Step 3: Console Validation (15 minutes)
├── Check deployed API in console
├── Verify all endpoints exist
├── Test each endpoint
├── Check authorization works
└── Review API Gateway logs

Result: Complete API defined in code, easy to replicate
```

### 4.3 AWS Toolkit Extension (The Bridge)

**Installation & Setup:**
```
Step 1: Install Extension
├── Open VS Code
├── Go to Extensions (Ctrl+Shift+X)
├── Search: "AWS Toolkit"
├── Install "AWS Toolkit" by Amazon Web Services
└── Restart VS Code

Step 2: Connect to AWS
├── Click AWS icon in left sidebar
├── Click "Connect to AWS"
├── Select profile: milk-delivery-dev
└── Region: us-east-1

Step 3: Verify Connection
├── Expand "Lambda" in sidebar
├── You should see all deployed functions
├── Expand "DynamoDB"
├── You should see all tables
└── Success!
```

**Key Features You'll Use Daily:**

**1. Lambda Functions**
```
What you can do from VS Code:
├── View all deployed Lambda functions
├── Invoke function remotely (without console)
│   ├── Right-click function
│   ├── Select "Invoke on AWS"
│   ├── Choose test event
│   └── See results in VS Code
├── Download function code
│   ├── Right-click function
│   ├── Select "Download Lambda"
│   └── Code appears in VS Code
└── View CloudWatch logs
    ├── Right-click function
    ├── Select "View CloudWatch Logs"
    └── Logs stream in VS Code terminal

Example Workflow:
├── Deploy function from VS Code terminal: sam deploy
├── Test directly from VS Code using AWS Toolkit
├── View logs without switching to browser
└── Make changes and redeploy, all in one place
```

**2. DynamoDB Tables**
```
What you can do from VS Code:
├── Browse table data
│   ├── Expand DynamoDB in AWS Toolkit
│   ├── Right-click table
│   ├── Select "View Table"
│   └── See items in VS Code panel
├── Run queries
│   ├── Click "Query" button
│   ├── Enter partition key value
│   ├── Execute
│   └── Results appear in VS Code
├── Download items as JSON
│   ├── Right-click items
│   ├── Select "Download items"
│   └── Save to file
└── Insert test data
    ├── Right-click table
    ├── Select "Insert Item"
    └── Paste JSON

Example Workflow:
├── Check if user exists in database
├── Query directly from VS Code
├── No need to open AWS Console
└── Copy user data for test event
```

**3. CloudWatch Logs**
```
What you can do from VS Code:
├── View log groups
├── Stream logs in real-time
│   ├── Right-click Lambda function
│   ├── Select "View CloudWatch Logs"
│   ├── Logs appear in VS Code terminal
│   └── Auto-refreshes with new logs
├── Search logs
│   ├── Use Ctrl+F in log panel
│   └── Filter by text
└── Download logs for analysis

Example Workflow:
├── Deploy Lambda function
├── Invoke from VS Code
├── Instantly see logs in VS Code
├── Debug without opening console
└── Faster iteration cycle
```

**4. S3 Buckets**
```
What you can do from VS Code:
├── Browse bucket contents
├── Upload files
│   ├── Right-click bucket
│   ├── Select "Upload File"
│   └── Choose file from system
├── Download files
│   ├── Right-click file
│   ├── Select "Download"
│   └── Save to local folder
└── Delete files

Example Workflow:
├── Upload product images
├── Get S3 URL for DynamoDB
├── All without leaving VS Code
```

**5. Step Functions**
```
What you can do from VS Code:
├── View state machines
├── Start execution
│   ├── Right-click state machine
│   ├── Select "Start Execution"
│   ├── Provide input JSON
│   └── Execution starts
├── View execution history
└── Download execution results

Example Workflow:
├── Test order processing workflow
├── Start execution from VS Code
├── Check status in toolkit
├── View results inline
```

### 4.4 Detailed Workflow Examples

**Example 1: Building User Registration (Complete Flow)**

**Day 1 Morning: Console Exploration (1 hour)**
```
Task: Understand what you need to build

1. Research Phase (AWS Console)
   ├── Navigate to Cognito
   ├── Read "What is Amazon Cognito?"
   ├── Create a test User Pool
   │   ├── Pool name: milk-delivery-users-test
   │   ├── Standard attributes: email, name, phone
   │   ├── Password policy: default
   │   ├── MFA: Optional (for learning)
   │   └── Create pool
   ├── Create test user manually
   │   ├── Username: testuser@example.com
   │   ├── Temporary password: Test@1234
   │   └── Verify user can login
   └── Test user login in Cognito UI
   
2. DynamoDB Exploration (AWS Console)
   ├── Navigate to DynamoDB
   ├── Create table: Users
   │   ├── Partition key: userId (String)
   │   ├── Billing mode: On-demand
   │   └── Create table
   ├── Add sample user item manually:
   │   {
   │     "userId": "user-001",
   │     "email": "test@example.com",
   │     "name": "Test User",
   │     "phone": "+1234567890",
   │     "role": "Customer",
   │     "createdAt": "2025-10-09T10:00:00Z"
   │   }
   └── Verify item appears in table

3. Lambda Exploration (AWS Console)
   ├── Navigate to Lambda
   ├── Create function: createUserTest
   ├── Write minimal code inline:
   │   exports.handler = async (event) => {
   │     console.log('Received event:', event);
   │     return {
   │       statusCode: 200,
   │       body: JSON.stringify({ message: 'User created' })
   │     };
   │   };
   ├── Test with sample event:
   │   {
   │     "body": "{\"email\":\"new@example.com\",\"name\":\"New User\"}"
   │   }
   └── Verify it returns 200 OK

Learning Outcome:
├── Understand Cognito concepts
├── See DynamoDB table structure
├── Know Lambda basic structure
└── Ready to code properly in VS Code
```

**Day 1 Afternoon: VS Code Development (2-3 hours)**
```
Task: Build production-ready createUser Lambda

1. Project Setup (VS Code Terminal)
   $ cd ~/projects
   $ mkdir milk-delivery-platform
   $ cd milk-delivery-platform
   $ sam init
   ├── Choose: 1 - AWS Quick Start Templates
   ├── Choose: 1 - Hello World Example
   ├── Runtime: nodejs20.x
   ├── Name: milk-delivery
   └── Project created!

2. Project Structure Organization
   milk-delivery-platform/
   ├── backend/
   │   ├── src/
   │   │   ├── lambdas/
   │   │   │   └── user/
   │   │   │       ├── createUser.ts
   │   │   │       ├── getUser.ts
   │   │   │       └── types.ts
   │   │   └── shared/
   │   │       ├── db.ts
   │   │       ├── validation.ts
   │   │       └── logger.ts
   │   ├── template.yaml
   │   ├── package.json
   │   └── tsconfig.json
   └── docs/
       └── api/
           └── user-api.md

3. Install Dependencies
   $ cd backend
   $ npm init -y
   $ npm install --save @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   $ npm install --save-dev @types/node @types/aws-lambda typescript

4. Create TypeScript Configuration (tsconfig.json)
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "lib": ["ES2020"],
       "outDir": "./dist",
       "rootDir": "./src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }

5. Create Lambda Function (Skeleton)
   File: src/lambdas/user/createUser.ts
   
   // Define interfaces
   interface CreateUserRequest {
     email: string;
     name: string;
     phone: string;
     password: string;
   }
   
   interface CreateUserResponse {
     userId: string;
     email: string;
     message: string;
   }
   
   // TODO: Implement handler
   // TODO: Add validation
   // TODO: Add DynamoDB operations
   // TODO: Add error handling

6. Create SAM Template (template.yaml)
   AWSTemplateFormatVersion: '2010-09-09'
   Transform: AWS::Serverless-2016-10-31
   
   Globals:
     Function:
       Timeout: 10
       Runtime: nodejs20.x
       Environment:
         Variables:
           USERS_TABLE: !Ref UsersTable
   
   Resources:
     CreateUserFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/user/createUser.handler
         Policies:
           - DynamoDBCrudPolicy:
               TableName: !Ref UsersTable
     
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
           - IndexName: email-index
             KeySchema:
               - AttributeName: email
                 KeyType: HASH
             Projection:
               ProjectionType: ALL

7. Build & Test Locally
   $ npm run build
   $ sam build
   $ sam local invoke CreateUserFunction --event events/create-user.json
   
   events/create-user.json:
   {
     "body": "{\"email\":\"test@example.com\",\"name\":\"Test User\",\"phone\":\"+1234567890\",\"password\":\"Test@123\"}"
   }

Learning Outcome:
├── Project structure established
├── SAM template basics understood
├── Local testing working
└── Ready for implementation
```

**Day 2: Implementation & Deployment**
```
Task: Complete Lambda implementation and deploy

1. Implement Full Lambda Function (VS Code)
   File: src/lambdas/user/createUser.ts
   
   [Full TypeScript implementation with:]
   ├── Input validation (email format, password strength)
   ├── Check if email already exists (GSI query)
   ├── Generate userId (UUID)
   ├── Hash password (if not using Cognito)
   ├── Save to DynamoDB
   ├── Error handling (try-catch with proper status codes)
   └── Logging (console.log with context)

2. Create Shared Utilities (VS Code)
   File: src/shared/validation.ts
   ├── validateEmail(email: string): boolean
   ├── validatePhone(phone: string): boolean
   └── validatePassword(password: string): string | null
   
   File: src/shared/db.ts
   ├── DynamoDB client initialization
   ├── Helper functions for common operations
   └── Error handling wrappers

3. Write Unit Tests (VS Code)
   File: tests/unit/createUser.test.ts
   
   Test cases:
   ├── Should create user with valid input
   ├── Should reject invalid email
   ├── Should reject weak password
   ├── Should reject duplicate email
   └── Should handle DynamoDB errors
   
   $ npm test

4. Deploy to AWS (VS Code Terminal)
   $ sam build
   $ sam deploy --guided
   
   Prompts:
   ├── Stack name: milk-delivery-dev
   ├── Region: us-east-1
   ├── Confirm changes: Y
   ├── Allow SAM CLI IAM role creation: Y
   ├── Save arguments to config file: Y
   └── Deployment starts...
   
   Wait for: Successfully created/updated stack

5. Verify Deployment (AWS Console)
   ├── Lambda → Functions → createUserFunction
   │   ├── Check function exists
   │   ├── Check environment variables
   │   └── Check permissions
   ├── DynamoDB → Tables → milk-delivery-users
   │   ├── Check table exists
   │   ├── Check GSI: email-index
   │   └── Check capacity mode: On-demand
   └── CloudFormation → Stacks → milk-delivery-dev
       ├── Check stack status: CREATE_COMPLETE
       └── Review all resources created

6. Test Deployed Function (Console + VS Code)
   
   Option A: AWS Console
   ├── Lambda → createUserFunction → Test tab
   ├── Create test event: create-user-test
   ├── Execute test
   ├── Check response: 201 Created
   └── CloudWatch logs: Check execution logs
   
   Option B: VS Code (AWS Toolkit)
   ├── AWS Toolkit → Lambda → createUserFunction
   ├── Right-click → Invoke on AWS
   ├── Select test event
   ├── View results in VS Code
   └── Check logs in VS Code

7. Verify Data in DynamoDB (Console)
   ├── DynamoDB → Tables → milk-delivery-users
   ├── Items tab
   ├── Should see new user item
   └── Verify all fields are correct

Learning Outcome:
├── Full Lambda function deployed
├── Infrastructure as Code working
├── Understand deployment process
└── Can iterate quickly
```

---

## 5. FEATURE DEVELOPMENT FLOW (STEP-BY-STEP)

### 5.1 Complete Feature: Order Creation System

**Overview:**
```
Feature: Create Order
Complexity: High (multiple services involved)
Duration: 4-5 days
Services Used:
├── Lambda (createOrder, validateInventory)
├── DynamoDB (Orders, Products, Inventory tables)
├── Step Functions (Order processing workflow)
├── API Gateway (POST /orders endpoint)
├── SNS (Order notifications)
└── EventBridge (Order events)

Learning Goals:
├── Multi-table DynamoDB operations
├── Error handling and rollback strategies
├── Async workflows with Step Functions
├── Event-driven architecture
└── Transaction management
```

**Day 1: Planning & Design**

```
Morning Session (2 hours)

1. Requirement Analysis (docs/features/create-order.md)
   
   User Story:
   "As a customer, I want to create an order with multiple products
   from different vendors, so that I can get my dairy products delivered."
   
   Acceptance Criteria:
   ├── User must be authenticated
   ├── User must have complete profile (delivery address)
   ├── Order must have at least 1 item
   ├── All products must be in stock
   ├── Order total must be ≥ minimum order value (₹100)
   ├── Delivery date must be: today+1 to today+7
   ├── System must reserve inventory immediately
   ├── User receives order confirmation
   └── Vendors receive order notifications

2. Data Model Design
   
   Orders Table Schema:
   {
     "orderId": "uuid",
     "userId": "uuid",
     "items": [
       {
         "productId": "uuid",
         "vendorId": "uuid",
         "productName": "string",
         "quantity": number,
         "unitPrice": number,
         "totalPrice": number
       }
     ],
     "subtotal": number,
     "tax": number,
     "deliveryCharge": number,
     "discount": number,
     "totalAmount": number,
     "status": "Pending|Confirmed|Processing|Delivered|Cancelled",
     "deliveryDate": "ISO date",
     "deliveryAddress": {
       "line1": "string",
       "city": "string",
       "zipCode": "string"
     },
     "createdAt": "ISO timestamp",
     "updatedAt": "ISO timestamp"
   }

3. API Contract Design
   
   Request:
   POST /orders
   Headers:
     Authorization: Bearer <JWT_TOKEN>
     Content-Type: application/json
   
   Body:
   {
     "items": [
       {
         "productId": "prod-123",
         "vendorId": "vendor-456",
         "quantity": 2
       },
       {
         "productId": "prod-789",
         "vendorId": "vendor-456",
         "quantity": 1
       }
     ],
     "deliveryDate": "2025-10-15",
     "addressId": "addr-001"
   }
   
   Success Response (201 Created):
   {
     "orderId": "order-abc123",
     "userId": "user-xyz",
     "items": [...],
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 30,
     "totalAmount": 502.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-15T08:00:00Z",
     "message": "Order created successfully"
   }
   
   Error Responses:
   400 Bad Request:
   {
     "error": "ValidationError",
     "message": "Delivery date must be between tomorrow and 7 days from now",
     "field": "deliveryDate"
   }
   
   400 Bad Request:
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 1L' has only 5 units available",
     "availableQuantity": 5,
     "requestedQuantity": 10
   }
   
   400 Bad Request:
   {
     "error": "MinimumOrderValue",
     "message": "Order total must be at least ₹100",
     "currentTotal": 75,
     "minimumRequired": 100
   }
   
   401 Unauthorized:
   {
     "error": "Unauthorized",
     "message": "Invalid or expired token"
   }
   
   404 Not Found:
   {
     "error": "UserNotFound",
     "message": "User profile not found"
   }
   
   409 Conflict:
   {
     "error": "ProfileIncomplete",
     "message": "Please complete your profile before placing an order",
     "missingFields": ["deliveryAddress", "phone"]
   }

4. Workflow Design (Step Functions State Machine)
   
   Order Processing Workflow:
   Start
   ├── ValidateInput (Lambda)
   │   ├── Success → ValidateUser
   │   └── Fail → Return 400 Error
   ├── ValidateUser (Lambda)
   │   ├── Success → CheckInventory
   │   └── Fail → Return 404/409 Error
   ├── CheckInventory (Lambda)
   │   ├── AllAvailable → ReserveInventory
   │   └── Insufficient → Return 400 Error
   ├── ReserveInventory (Lambda)
   │   ├── Success → CalculatePricing
   │   └── Fail → Rollback
   ├── CalculatePricing (Lambda)
   │   ├── Success → CreateOrderRecord
   │   └── Fail → ReleaseInventory → Error
   ├── CreateOrderRecord (Lambda)
   │   ├── Success → NotifyUser
   │   └── Fail → ReleaseInventory → Error
   ├── NotifyUser (SNS)
   │   └── Send confirmation email
   ├── NotifyVendors (SNS)
   │   └── Send order details to each vendor
   └── End (Success)

5. Error Handling Strategy
   
   Scenario 1: Inventory Check Fails
   ├── Don't create order
   ├── Return 400 with specific product details
   └── No rollback needed (no state changed)
   
   Scenario 2: Inventory Reserved, but DynamoDB Fails
   ├── Critical: Inventory locked but order not created
   ├── Solution: Use DynamoDB transaction
   │   └── Atomic operation: Reserve inventory + Create order
   └── If transaction fails, nothing is committed
   
   Scenario 3: Order Created, but Notification Fails
   ├── Order exists, but user not notified
   ├── Solution: Make notification async (Step Functions)
   ├── Retry notification 3 times
   └── Use DLQ (Dead Letter Queue) for failures
   
   Scenario 4: Partial Vendor Availability
   ├── Some items available, some not
   ├── Option A: Reject entire order
   ├── Option B: Partial fulfillment (advanced)
   └── For MVP: Choose Option A (simpler)

Afternoon Session (1.5 hours)

6. Create Project Structure (VS Code)
   backend/
   ├── src/
   │   ├── lambdas/
   │   │   └── order/
   │   │       ├── createOrder.ts
   │   │       ├── validateInventory.ts
   │   │       ├── reserveInventory.ts
   │   │       ├── calculatePricing.ts
   │   │       └── types.ts
   │   ├── stepFunctions/
   │   │   └── orderProcessing.asl.json
   │   └── shared/
   │       ├── constants.ts
   │       └── pricing.ts
   └── tests/
       └── order/
           ├── createOrder.test.ts
           └── validateInventory.test.ts

7. Define Types (VS Code)
   File: src/lambdas/order/types.ts
   
   export interface OrderItem {
     productId: string;
     vendorId: string;
     quantity: number;
     unitPrice?: number;  // Calculated
     totalPrice?: number; // Calculated
   }
   
   export interface CreateOrderRequest {
     items: OrderItem[];
     deliveryDate: string;
     addressId: string;
   }
   
   export interface CreateOrderResponse {
     orderId: string;
     userId: string;
     items: OrderItem[];
     subtotal: number;
     tax: number;
     deliveryCharge: number;
     totalAmount: number;
     status: OrderStatus;
     estimatedDelivery: string;
     message: string;
   }
   
   export type OrderStatus = 
     | 'Pending'
     | 'Confirmed'
     | 'Processing'
     | 'OutForDelivery'
     | 'Delivered'
     | 'Cancelled'
     | 'Failed';
   
   export interface ValidationError {
     field: string;
     message: string;
     code: string;
   }

8. Create Test Events (VS Code)
   File: events/create-order-valid.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2},{\"productId\":\"prod-yogurt-200g\",\"vendorId\":\"vendor-001\",\"quantity\":3}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}",
     "headers": {
       "Authorization": "Bearer eyJhbGc...",
       "Content-Type": "application/json"
     },
     "requestContext": {
       "authorizer": {
         "claims": {
           "sub": "user-123"
         }
       }
     }
   }
   
   File: events/create-order-invalid-date.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2}],\"deliveryDate\":\"2025-10-01\",\"addressId\":\"addr-home\"}"
   }
   
   File: events/create-order-insufficient-stock.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":1000}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}"
   }

Learning Outcome:
├── Complete understanding of requirements
├── API contract defined
├── Error scenarios identified
├── Project structure ready
└── Ready to code
```

**Day 2: Core Implementation**

```
Morning Session (2.5 hours)

1. Implement Validation Logic
   File: src/lambdas/order/createOrder.ts
   
   Function: validateInput()
   ├── Check items array not empty
   ├── Check each item has required fields
   ├── Check quantities are positive integers
   ├── Check deliveryDate format (ISO 8601)
   ├── Check deliveryDate is in valid range
   └── Return ValidationError[] if any issues
   
   Function: validateUser()
   ├── Extract userId from JWT (event.requestContext.authorizer.claims.sub)
   ├── Query Users table
   ├── Check user exists
   ├── Check profile is complete
   │   ├── Has delivery address matching addressId
   │   ├── Has phone number
   │   └── Has email
   └── Return user object or error
   
   Function: validateDeliveryDate()
   ├── Parse date string
   ├── Check format is valid
   ├── Check date is not in past
   ├── Check date is not today (need 1 day preparation)
   ├── Check date is within 7 days
   └── Return boolean + error message

2. Implement Inventory Validation
   File: src/lambdas/order/validateInventory.ts
   
   Function: checkInventory()
   Input:
   {
     "items": [
       {"productId": "prod-1", "vendorId": "vendor-1", "quantity": 2}
     ]
   }
   
   Process:
   ├── Group items by vendorId
   ├── For each vendor:
   │   ├── BatchGetItem from Inventory table
   │   │   └── Keys: [{vendorId, productId}, ...]
   │   ├── For each product:
   │   │   ├── Get available = stock - reserved
   │   │   ├── Check available >= requested quantity
   │   │   └── If not: add to unavailableItems[]
   │   └── Continue
   └── Return {valid: boolean, unavailableItems: []}
   
   Output (Success):
   {
     "valid": true,
     "unavailableItems": []
   }
   
   Output (Failure):
   {
     "valid": false,
     "unavailableItems": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "requestedQty": 10,
         "availableQty": 5
       }
     ]
   }

3. Implement Pricing Calculation
   File: src/shared/pricing.ts
   
   Function: calculateOrderTotal()
   Input:
   {
     "items": [
       {
         "productId": "prod-1",
         "quantity": 2,
         "unitPrice": 50
       }
     ],
     "deliveryAddress": {
       "city": "Vadodara",
       "zipCode": "390001"
     }
   }
   
   Calculation Logic:
   ├── subtotal = sum(item.unitPrice * item.quantity)
   ├── tax = subtotal * TAX_RATE (5% GST)
   ├── deliveryCharge = calculateDeliveryCharge()
   │   ├── If subtotal >= 500: ₹0 (free delivery)
   │   ├── Else if subtotal >= 300: ₹20
   │   ├── Else: ₹40
   │   └── Add ₹10 per additional vendor (multi-vendor orders)
   ├── discount = calculateDiscount()
   │   ├── If first order: 10% off (max ₹50)
   │   ├── If loyalty points: redeem at 1 point = ₹1
   │   └── else: 0
   └── totalAmount = subtotal + tax + deliveryCharge - discount
   
   Output:
   {
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 20,
     "discount": 0,
     "totalAmount": 492.5,
     "breakdown": {
       "itemsTotal": 450,
       "taxBreakdown": {
         "cgst": 11.25,
         "sgst": 11.25
       },
       "deliveryDetails": {
         "baseCharge": 20,
         "multiVendorSurcharge": 0
       }
     }
   }

Afternoon Session (1.5 hours)

4. Implement Main Handler
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent)
   
   Flow:
   Step 1: Parse input
   ├── const body = JSON.parse(event.body || '{}');
   ├── const userId = event.requestContext.authorizer.claims.sub;
   └── Log input for debugging
   
   Step 2: Validate input
   ├── const validationErrors = validateInput(body);
   ├── if (validationErrors.length > 0):
   │   └── return 400 with errors
   └── Continue
   
   Step 3: Validate user
   ├── const user = await validateUser(userId);
   ├── if (!user):
   │   └── return 404 User Not Found
   ├── if (!user.isProfileComplete):
   │   └── return 409 Profile Incomplete
   └── Continue
   
   Step 4: Get delivery address
   ├── const address = user.addresses.find(a => a.addressId === body.addressId);
   ├── if (!address):
   │   └── return 404 Address Not Found
   └── Continue
   
   Step 5: Fetch product details
   ├── const productIds = body.items.map(i => i.productId);
   ├── const products = await batchGetProducts(productIds);
   ├── Merge product prices into items
   └── Calculate item totals
   
   Step 6: Check inventory
   ├── const inventoryCheck = await checkInventory(body.items);
   ├── if (!inventoryCheck.valid):
   │   └── return 400 Insufficient Stock with details
   └── Continue
   
   Step 7: Calculate pricing
   ├── const pricing = calculateOrderTotal(items, address, user);
   ├── if (pricing.totalAmount < MINIMUM_ORDER_VALUE):
   │   └── return 400 Minimum Order Value Not Met
   └── Continue
   
   Step 8: Create order record
   ├── const orderId = generateOrderId(); // uuid()
   ├── const order = {
   │     orderId,
   │     userId,
   │     items,
   │     ...pricing,
   │     status: 'Pending',
   │     deliveryDate: body.deliveryDate,
   │     deliveryAddress: address,
   │     createdAt: new Date().toISOString()
   │   };
   ├── await dynamodb.putItem(ORDERS_TABLE, order);
   └── Continue
   
   Step 9: Start Step Functions workflow
   ├── const executionArn = await stepFunctions.startExecution({
   │     stateMachineArn: ORDER_PROCESSING_STATE_MACHINE,
   │     input: JSON.stringify({ orderId, items })
   │   });
   └── Log execution ARN
   
   Step 10: Return response
   └── return {
         statusCode: 201,
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*'
         },
         body: JSON.stringify({
           orderId,
           userId,
           items,
           ...pricing,
           status: 'Pending',
           estimatedDelivery: calculateEstimatedDelivery(body.deliveryDate),
           message: 'Order created successfully. You will receive confirmation shortly.'
         })
       };

5. Error Handling Patterns
   
   Pattern 1: Validation Errors (400)
   try {
     const errors = validateInput(body);
     if (errors.length > 0) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'ValidationError',
           message: 'Invalid input data',
           errors: errors
         })
       };
     }
   } catch (error) {
     // Continue to Pattern 2
   }
   
   Pattern 2: Resource Not Found (404)
   const user = await getUser(userId);
   if (!user) {
     return {
       statusCode: 404,
       body: JSON.stringify({
         error: 'UserNotFound',
         message: `User with ID ${userId} not found`
       })
     };
   }
   
   Pattern 3: Business Logic Errors (400/409)
   if (pricing.totalAmount < MINIMUM_ORDER_VALUE) {
     return {
       statusCode: 400,
       body: JSON.stringify({
         error: 'MinimumOrderValue',
         message: `Order total must be at least ₹${MINIMUM_ORDER_VALUE}`,
         currentTotal: pricing.totalAmount,
         minimumRequired: MINIMUM_ORDER_VALUE
       })
     };
   }
   
   Pattern 4: Service Errors (500)
   try {
     await dynamodb.putItem(ORDERS_TABLE, order);
   } catch (error) {
     console.error('DynamoDB error:', error);
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: 'InternalServerError',
         message: 'Failed to create order. Please try again.',
         requestId: context.requestId
       })
     };
   }
   
   Pattern 5: Timeout Handling
   // Set timeout slightly less than Lambda timeout
   const timeoutMs = 9000; // Lambda timeout is 10s
   const timeoutPromise = new Promise((_, reject) => 
     setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
   );
   
   try {
     await Promise.race([
       createOrder(body),
       timeoutPromise
     ]);
   } catch (error) {
     if (error.message === 'Operation timeout') {
       return {
         statusCode: 504,
         body: JSON.stringify({
           error: 'GatewayTimeout',
           message: 'Request took too long. Please try again.'
         })
       };
     }
   }

Learning Outcome:
├── Complete Lambda implementation
├── Error handling patterns mastered
├── Ready for testing
└── Understanding of edge cases
```

**Day 3: Testing & Step Functions**

```
Morning Session (2 hours)

1. Unit Testing (VS Code)
   File: tests/unit/createOrder.test.ts
   
   Test Suite: Input Validation
   ├── Test: Should accept valid input
   ├── Test: Should reject empty items array
   ├── Test: Should reject negative quantities
   ├── Test: Should reject invalid date format
   ├── Test: Should reject past delivery dates
   └── Test: Should reject dates beyond 7 days
   
   Test Suite: User Validation
   ├── Test: Should accept valid user with complete profile
   ├── Test: Should reject non-existent user
   ├── Test: Should reject user with incomplete profile
   └── Test: Should reject invalid address ID
   
   Test Suite: Inventory Validation
   ├── Test: Should pass when all items in stock
   ├── Test: Should fail when any item out of stock
   ├── Test: Should handle partial stock correctly
   └── Test: Should handle multiple vendors
   
   Test Suite: Pricing Calculation
   ├── Test: Should calculate subtotal correctly
   ├── Test: Should apply 5% GST
   ├── Test: Should apply free delivery for orders > ₹500
   ├── Test: Should charge ₹40 for orders < ₹300
   ├── Test: Should apply first order discount
   └── Test: Should calculate multi-vendor surcharge
   
   Run Tests:
   $ npm test
   
   Expected Output:
   PASS  tests/unit/createOrder.test.ts
     Input Validation
       ✓ Should accept valid input (5ms)
       ✓ Should reject empty items array (3ms)
       ✓ Should reject negative quantities (2ms)
       ✓ Should reject invalid date format (3ms)
       ✓ Should reject past delivery dates (2ms)
       ✓ Should reject dates beyond 7 days (2ms)
     
     Test Suites: 4 passed, 4 total
     Tests:       24 passed, 24 total
     Time:        2.341s

2. Local Testing with SAM (VS Code Terminal)
   
   Build project:
   $ cd backend
   $ npm run build
   $ sam build
   
   Output:
   Building codeuri: dist/ runtime: nodejs20.x architecture: x86_64
   Running NodejsNpmBuilder:NpmPack
   Build Succeeded
   
   Test with valid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-valid.json \
     --env-vars env.json
   
   Expected Output:
   Invoking lambdas/order/createOrder.handler
   START RequestId: abc-123 Version: $LATEST
   [INFO] Order creation started for user: user-123
   [INFO] Inventory validation passed
   [INFO] Order created: order-xyz-789
   END RequestId: abc-123
   REPORT RequestId: abc-123 Duration: 1243.56 ms Memory: 512 MB
   
   {"statusCode":201,"body":"{\"orderId\":\"order-xyz-789\",...}"}
   
   Test with invalid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-invalid-date.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"ValidationError\",...}"}
   
   Test with insufficient stock:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-insufficient-stock.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"InsufficientStock\",...}"}

3. Create Step Functions State Machine
   File: stepFunctions/orderProcessing.asl.json
   
   {
     "Comment": "Order Processing Workflow",
     "StartAt": "ReserveInventory",
     "States": {
       "ReserveInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:reserveInventoryFunction",
         "InputPath": "$",
         "ResultPath": "$.reservationResult",
         "Next": "CheckReservation",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "ReservationFailed"
           }
         ]
       },
       
       "CheckReservation": {
         "Type": "Choice",
         "Choices": [
           {
             "Variable": "$.reservationResult.success",
             "BooleanEquals": true,
             "Next": "NotifyVendors"
           }
         ],
         "Default": "ReservationFailed"
       },
       
       "NotifyVendors": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:notifyVendorsFunction",
         "InputPath": "$",
         "ResultPath": "$.notificationResult",
         "Next": "UpdateOrderStatus",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "NotificationFailed"
           }
         ]
       },
       
       "UpdateOrderStatus": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:updateOrderStatusFunction",
         "InputPath": "$",
         "Parameters": {
           "orderId.$": "$.orderId",
           "status": "Confirmed"
         },
         "ResultPath": "$.updateResult",
         "Next": "NotifyCustomer"
       },
       
       "NotifyCustomer": {
         "Type": "Task",
         "Resource": "arn:aws:states:::sns:publish",
         "Parameters": {
           "TopicArn": "arn:aws:sns:region:account:order-notifications",
           "Message.$": "$.orderId",
           "Subject": "Order Confirmed"
         },
         "Next": "OrderProcessingComplete"
       },
       
       "OrderProcessingComplete": {
         "Type": "Succeed"
       },
       
       "ReservationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Inventory reservation failed"
         },
         "Next": "OrderFailed"
       },
       
       "NotificationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Vendor notification failed"
         },
         "Next": "ReleaseInventory"
       },
       
       "ReleaseInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:releaseInventoryFunction",
         "InputPath": "$",
         "Next": "OrderFailed"
       },
       
       "OrderFailed": {
         "Type": "Fail",
         "Error": "OrderProcessingFailed",
         "Cause": "Order processing workflow failed"
       }
     }
   }

Afternoon Session (1.5 hours)

4. Add Step Functions to SAM Template
   File: template.yaml
   
   Resources:
     OrderProcessingStateMachine:
       Type: AWS::Serverless::StateMachine
       Properties:
         Name: OrderProcessingWorkflow
         DefinitionUri: stepFunctions/orderProcessing.asl.json
         DefinitionSubstitutions:
           ReserveInventoryFunctionArn: !GetAtt ReserveInventoryFunction.Arn
           NotifyVendorsFunctionArn: !GetAtt NotifyVendorsFunction.Arn
           UpdateOrderStatusFunctionArn: !GetAtt UpdateOrderStatusFunction.Arn
           HandleOrderFailureFunctionArn: !GetAtt HandleOrderFailureFunction.Arn
           ReleaseInventoryFunctionArn: !GetAtt ReleaseInventoryFunction.Arn
           OrderNotificationsTopic: !Ref OrderNotificationsTopic
         Policies:
           - LambdaInvokePolicy:
               FunctionName: !Ref ReserveInventoryFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref NotifyVendorsFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref UpdateOrderStatusFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref HandleOrderFailureFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref ReleaseInventoryFunction
           - SNSPublishMessagePolicy:
               TopicName: !GetAtt OrderNotificationsTopic.TopicName
         Logging:
           Level: ALL
           IncludeExecutionData: true
           Destinations:
             - CloudWatchLogsLogGroup:
                 LogGroupArn: !GetAtt OrderProcessingLogGroup.Arn
     
     OrderNotificationsTopic:
       Type: AWS::SNS::Topic
       Properties:
         TopicName: order-notifications
         DisplayName: Order Notifications
         Subscription:
           - Endpoint: your-email@example.com
             Protocol: email
     
     OrderProcessingLogGroup:
       Type: AWS::Logs::LogGroup
       Properties:
         LogGroupName: /aws/vendedlogs/states/OrderProcessing
         RetentionInDays: 7

5. Deploy Complete Stack
   $ sam build
   $ sam deploy --guided
   
   Deployment Output:
   CloudFormation stack changeset
   ---------------------------------
   Operation                 LogicalResourceId         ResourceType
   ---------------------------------
   + Add                     CreateOrderFunction       AWS::Lambda::Function
   + Add                     ReserveInventoryFunc      AWS::Lambda::Function
   + Add                     NotifyVendorsFunction     AWS::Lambda::Function
   + Add                     OrderProcessingState      AWS::StepFunctions::StateMachine
   + Add                     OrdersTable               AWS::DynamoDB::Table
   + Add                     OrderNotificationsTopic   AWS::SNS::Topic
   ---------------------------------
   
   Deploy this changeset? [y/N]: y
   
   Deployment progress:
   CREATE_IN_PROGRESS  OrdersTable
   CREATE_IN_PROGRESS  CreateOrderFunction
   CREATE_COMPLETE     OrdersTable
   CREATE_COMPLETE     CreateOrderFunction
   ...
   CREATE_COMPLETE     OrderProcessingStateMachine
   
   Successfully created/updated stack - milk-delivery-dev

6. Test Deployed Stack (AWS Console)
   
   Console → Step Functions → State machines → OrderProcessingWorkflow
   ├── Click "Start execution"
   ├── Input JSON:
   │   {
   │     "orderId": "test-order-001",
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ]
   │   }
   ├── Click "Start execution"
   └── Watch execution graph
   
   Visual Execution:
   ReserveInventory (Running) ⏳
   ├── Lambda invoked
   └── Waiting for response...
   
   ReserveInventory (Succeeded) ✅
   ├── Duration: 1.2s
   └── Output: {"success": true, "reservationId": "res-123"}
   
   NotifyVendors (Running) ⏳
   ├── Lambda invoked
   └── Sending emails...
   
   NotifyVendors (Succeeded) ✅
   ├── Duration: 0.8s
   └── Output: {"notified": ["vendor-001"]}
   
   UpdateOrderStatus (Running) ⏳
   UpdateOrderStatus (Succeeded) ✅
   
   NotifyCustomer (Running) ⏳
   NotifyCustomer (Succeeded) ✅
   
   OrderProcessingComplete ✅
   Total Duration: 4.5s
   
   Check CloudWatch Logs:
   ├── Console → CloudWatch → Log groups
   ├── /aws/vendedlogs/states/OrderProcessing
   └── View execution logs

Learning Outcome:
├── Step Functions workflow working
├── Async processing implemented
├── Error handling and retries configured
├── Complete order flow functional
└── Ready for API Gateway integration
```

**Day 4: API Gateway Integration**

```
Morning Session (2 hours)

1. Add API Gateway to SAM Template
   File: template.yaml
   
   Resources:
     MilkDeliveryApi:
       Type: AWS::Serverless::Api
       Properties:
         Name: MilkDeliveryAPI
         StageName: dev
         Cors:
           AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
           AllowHeaders: "'Content-Type,Authorization'"
           AllowOrigin: "'*'"
         Auth:
           DefaultAuthorizer: CognitoAuthorizer
           Authorizers:
             CognitoAuthorizer:
               UserPoolArn: !GetAtt UserPool.Arn
         GatewayResponses:
           UNAUTHORIZED:
             StatusCode: 401
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
           BAD_REQUEST_BODY:
             StatusCode: 400
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
         DefinitionBody:
           openapi: 3.0.1
           info:
             title: Milk Delivery API
             version: 1.0.0
           paths:
             /orders:
               post:
                 summary: Create a new order
                 requestBody:
                   required: true
                   content:
                     application/json:
                       schema:
                         type: object
                         required:
                           - items
                           - deliveryDate
                           - addressId
                         properties:
                           items:
                             type: array
                             minItems: 1
                             maxItems: 50
                           deliveryDate:
                             type: string
                             format: date
                           addressId:
                             type: string
                 responses:
                   '201':
                     description: Order created successfully
                   '400':
                     description: Invalid input
                   '401':
                     description: Unauthorized
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${CreateOrderFunction.Arn}/invocations'
               get:
                 summary: List user orders
                 responses:
                   '200':
                     description: List of orders
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ListOrdersFunction.Arn}/invocations'
             
             /orders/{orderId}:
               get:
                 summary: Get order details
                 parameters:
                   - name: orderId
                     in: path
                     required: true
                     schema:
                       type: string
                 responses:
                   '200':
                     description: Order details
                   '404':
                     description: Order not found
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetOrderFunction.Arn}/invocations'
     
     CreateOrderFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/order/createOrder.handler
         Events:
           CreateOrder:
             Type: Api
             Properties:
               RestApiId: !Ref MilkDeliveryApi
               Path: /orders
               Method: POST
               Auth:
                 Authorizer: CognitoAuthorizer

2. Configure Request Validation
   File: template.yaml (add to API definition)
   
   RequestValidator:
     Type: AWS::ApiGateway::RequestValidator
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ValidateRequestBody: true
       ValidateRequestParameters: true
   
   Request Models:
   CreateOrderModel:
     Type: AWS::ApiGateway::Model
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ContentType: application/json
       Schema:
         type: object
         required:
           - items
           - deliveryDate
           - addressId
         properties:
           items:
             type: array
             minItems: 1
             items:
               type: object
               required:
                 - productId
                 - vendorId
                 - quantity
               properties:
                 productId:
                   type: string
                   pattern: '^prod-[a-zA-Z0-9-]+
                 vendorId:
                   type: string
                   pattern: '^vendor-[a-zA-Z0-9-]+
                 quantity:
                   type: integer
                   minimum: 1
                   maximum: 100
           deliveryDate:
             type: string
             format: date
           addressId:
             type: string

3. Deploy and Test API
   $ sam build
   $ sam deploy
   
   Output:
   Outputs:
   ├── MilkDeliveryApiUrl: https://abc123.execute-api.us-east-1.amazonaws.com/dev
   ├── CreateOrderFunctionArn: arn:aws:lambda:us-east-1:123456789:function:createOrder
   └── OrderProcessingStateMachine: arn:aws:states:us-east-1:123456789:stateMachine:OrderProcessing

Afternoon Session (1.5 hours)

4. Test API with Thunder Client (VS Code)
   
   Install Thunder Client extension
   ├── Extensions → Search "Thunder Client"
   ├── Install
   └── Restart VS Code
   
   Create Request Collection:
   Thunder Client → Collections → New Collection
   ├── Name: Milk Delivery API - Dev
   └── Create
   
   Request 1: Create Order (Success Case)
   ├── Method: POST
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders
   ├── Headers:
   │   ├── Content-Type: application/json
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   ├── Body (JSON):
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       },
   │       {
   │         "productId": "prod-yogurt-200g",
   │         "vendorId": "vendor-001",
   │         "quantity": 3
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (201 Created):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "quantity": 2,
         "unitPrice": 50,
         "totalPrice": 100
       },
       {
         "productId": "prod-yogurt-200g",
         "vendorId": "vendor-001",
         "productName": "Greek Yogurt 200g",
         "quantity": 3,
         "unitPrice": 30,
         "totalPrice": 90
       }
     ],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "discount": 0,
     "totalAmount": 239.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-12T08:00:00Z",
     "message": "Order created successfully. You will receive confirmation shortly."
   }
   
   Request 2: Create Order (Validation Error)
   ├── Body:
   │   {
   │     "items": [],  ← Empty array
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid input data",
     "errors": [
       {
         "field": "items",
         "message": "Items array cannot be empty",
         "code": "EMPTY_ITEMS"
       }
     ]
   }
   
   Request 3: Create Order (Insufficient Stock)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 1000  ← Too many
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 500ml' has only 50 units available",
     "productId": "prod-milk-500ml",
     "availableQuantity": 50,
     "requestedQuantity": 1000
   }
   
   Request 4: Create Order (Invalid Date)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ],
   │     "deliveryDate": "2025-10-01",  ← Past date
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid delivery date",
     "errors": [
       {
         "field": "deliveryDate",
         "message": "Delivery date cannot be in the past",
         "code": "INVALID_DATE"
       }
     ]
   }
   
   Request 5: Get Order Details
   ├── Method: GET
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders/order-abc-123-xyz
   ├── Headers:
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   └── Send
   
   Expected Response (200 OK):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [...],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "totalAmount": 239.5,
     "status": "Confirmed",
     "deliveryDate": "2025-10-12",
     "deliveryAddress": {
       "line1": "123 Main Street",
       "city": "Vadodara",
       "state": "Gujarat",
       "zipCode": "390001"
     },
     "createdAt": "2025-10-09T10:30:00Z",
     "updatedAt": "2025-10-09T10:30:15Z"
   }

5. Verify in AWS Console
   
   Console → API Gateway → MilkDeliveryAPI
   ├── Stages → dev
   ├── Invoke URL: Copy URL
   ├── Resources → /orders → POST
   ├── Test → Click "TEST" button
   ├── Request Body: Paste test JSON
   ├── Execute
   └── View Response
   
   Console → Lambda → CreateOrderFunction
   ├── Monitor tab
   ├── View logs → CloudWatch Logs
   ├── See execution logs
   └── Check for errors
   
   Console → DynamoDB → milk-delivery-orders
   ├── Items tab
   ├── See newly created order
   └── Verify all fields
   
   Console → Step Functions → OrderProcessingWorkflow
   ├── Executions tab
   ├── See execution for your order
   ├── Click execution ID
   └── View execution graph

Learning Outcome:
├── API Gateway fully integrated
├── End-to-end flow working
├── Multiple test scenarios validated
├── Ready for frontend integration
└── Understanding of full serverless stack
```

**Day 5: Edge Cases & Error Handling**

```
Morning Session (2 hours)

1. Edge Case Testing Matrix
   
   Test Case 1: Concurrent Orders (Race Condition)
   Scenario: Two users order the last item simultaneously
   
   Setup:
   ├── Set product stock to 1 unit
   ├── User A submits order for 1 unit
   ├── User B submits order for 1 unit (within milliseconds)
   └── Expected: Only one order succeeds
   
   Implementation Solution:
   ├── Use DynamoDB Conditional Expressions
   ├── UpdateItem with condition: stock > 0
   ├── If condition fails: Return insufficient stock
   └── Atomic operation prevents over-selling
   
   Code Pattern:
   await dynamodb.update({
     TableName: INVENTORY_TABLE,
     Key: { vendorId, productId },
     UpdateExpression: 'SET stock = stock - :qty, reserved = reserved + :qty',
     ConditionExpression: 'stock >= :qty',
     ExpressionAttributeValues: {
       ':qty': quantity
     }
   });
   // If condition fails, AWS throws ConditionalCheckFailedException
   
   Test Case 2: Multi-Vendor Order with Partial Failure
   Scenario: Order has items from 3 vendors, one vendor out of stock
   
   Expected Behavior:
   ├── Option A (Simple): Reject entire order
   ├── Option B (Advanced): Partial fulfillment
   └── For MVP: Choose Option A
   
   Implementation:
   ├── Validate all inventory BEFORE creating order
   ├── If any item fails: Return 400 with details
   ├── No partial orders
   └── Clear error message to user
   
   Test Case 3: Payment Gateway Timeout
   Scenario: Stripe API takes > 10 seconds to respond
   
   Implementation:
   ├── Set order status: "PaymentPending"
   ├── Use Stripe webhooks for async confirmation
   ├── Don't wait for payment in createOrder Lambda
   ├── Separate Lambda handles payment webhooks
   └── Update order status when webhook received
   
   Flow:
   createOrder → Return "PaymentPending"
       ↓
   User redirected to Stripe
       ↓
   Stripe processes payment
       ↓
   Stripe sends webhook → paymentWebhookHandler
       ↓
   Update order status → "Paid"
       ↓
   Trigger Step Functions workflow
   
   Test Case 4: Database Write Failure After Inventory Reserved
   Scenario: Inventory reserved, but DynamoDB fails to create order
   
   Problem:
   ├── Inventory locked
   ├── Order not created
   └── User sees error, but stock is reduced
   
   Solution: Use DynamoDB Transactions
   const params = {
     TransactItems: [
       {
         Update: {
           TableName: INVENTORY_TABLE,
           Key: { vendorId, productId },
           UpdateExpression: 'SET reserved = reserved + :qty',
           ConditionExpression: 'stock >= reserved + :qty',
           ExpressionAttributeValues: { ':qty': quantity }
         }
       },
       {
         Put: {
           TableName: ORDERS_TABLE,
           Item: orderObject,
           ConditionExpression: 'attribute_not_exists(orderId)'
         }
       }
     ]
   };
   await dynamodb.transactWrite(
              vendorId:
                type: string
                pattern: '^vendor-[a-zA-Z0-9-]+   await dynamodb.transactWrite(params);
   // Either both succeed or both fail (atomicity)
   
   Test Case 5: User Cancels Order During Processing
   Scenario: Order created, Step Functions running, user clicks "Cancel"
   
   Implementation:
   ├── Check current order status
   ├── If status = "Pending": Allow cancellation
   ├── If status = "Processing": Check Step Functions execution
   ├── Stop execution: stepFunctions.stopExecution()
   ├── Release inventory
   └── Update order status: "Cancelled"
   
   Test Case 6: Invalid JWT Token
   Scenario: User sends expired or tampered token
   
   API Gateway Authorizer handles:
   ├── Validates JWT signature
   ├── Checks expiration
   ├── Verifies issuer (Cognito User Pool)
   └── Returns 401 Unauthorized if invalid
   
   Lambda never receives request with invalid token
   
   Test Case 7: DynamoDB Throttling
   Scenario: Free tier limits exceeded (25 WCU/RCU)
   
   Symptoms:
   ├── ProvisionedThroughputExceededException
   ├── Lambda returns 500 error
   └── Operations fail
   
   Solution:
   ├── Use exponential backoff (built into AWS SDK)
   ├── Implement retry logic in Lambda
   ├── Monitor CloudWatch metrics
   └── Consider on-demand billing (scales automatically)
   
   Implementation:
   const dynamodbWithRetry = DynamoDBDocumentClient.from(client, {
     retryMode: 'adaptive',
     maxAttempts: 3
   });
   
   Test Case 8: Large Order (100+ items)
   Scenario: User tries to order 100 different products
   
   Considerations:
   ├── Lambda execution time: May exceed 10s timeout
   ├── DynamoDB batch size: Max 25 items per BatchGetItem
   ├── API Gateway payload: Max 10 MB
   └── Step Functions payload: Max 256 KB
   
   Solutions:
   ├── Set maximum items per order: 50
   ├── Validate in API Gateway request validator
   ├── Batch DynamoDB operations properly
   └── Use S3 for large payloads if needed (advanced)

Afternoon Session (1.5 hours)

2. Implement Idempotency
   
   Problem: User clicks "Place Order" twice
   ├── Network delay, no response
   ├── User clicks again
   └── Two orders created for same cart
   
   Solution: Idempotency Keys
   
   Request Header:
   Idempotency-Key: <unique-client-generated-uuid>
   
   Implementation:
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent) => {
     const idempotencyKey = event.headers['idempotency-key'] || 
                            event.headers['Idempotency-Key'];
     
     if (!idempotencyKey) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'MissingIdempotencyKey',
           message: 'Idempotency-Key header is required'
         })
       };
     }
     
     // Check if order with this key already exists
     const existingOrder = await dynamodb.query({
       TableName: ORDERS_TABLE,
       IndexName: 'idempotency-key-index',
       KeyConditionExpression: 'idempotencyKey = :key',
       ExpressionAttributeValues: {
         ':key': idempotencyKey
       }
     });
     
     if (existingOrder.Items && existingOrder.Items.length > 0) {
       // Order already created, return existing order
       return {
         statusCode: 200,
         body: JSON.stringify(existingOrder.Items[0])
       };
     }
     
     // Create new order with idempotency key
     const order = {
       ...orderData,
       idempotencyKey
     };
     
     await dynamodb.put({
       TableName: ORDERS_TABLE,
       Item: order,
       ConditionExpression: 'attribute_not_exists(idempotencyKey)'
     });
     
     return {
       statusCode: 201,
       body: JSON.stringify(order)
     };
   };
   
   DynamoDB Table Update (template.yaml):
   OrdersTable:
     GlobalSecondaryIndexes:
       - IndexName: idempotency-key-index
         KeySchema:
           - AttributeName: idempotencyKey
             KeyType: HASH
         Projection:
           ProjectionType: ALL

3. Implement Circuit Breaker Pattern
   
   Problem: Downstream service (payment gateway) is down
   ├── Every request times out
   ├── Lambda execution time wasted
   ├── Poor user experience
   └── Increased costs
   
   Solution: Circuit Breaker
   
   States:
   ├── CLOSED: Normal operation, requests pass through
   ├── OPEN: Too many failures, reject requests immediately
   └── HALF_OPEN: Test if service recovered
   
   Implementation:
   File: src/shared/circuitBreaker.ts
   
   class CircuitBreaker {
     private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
     private failureCount = 0;
     private failureThreshold = 5;
     private timeout = 60000; // 1 minute
     private lastFailureTime?: number;
     
     async execute<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'OPEN') {
         if (Date.now() - this.lastFailureTime! > this.timeout) {
           this.state = 'HALF_OPEN';
         } else {
           throw new Error('Circuit breaker is OPEN');
         }
       }
       
       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
     
     private onSuccess() {
       this.failureCount = 0;
       this.state = 'CLOSED';
     }
     
     private onFailure() {
       this.failureCount++;
       this.lastFailureTime = Date.now();
       
       if (this.failureCount >= this.failureThreshold) {
         this.state = 'OPEN';
       }
     }
   }
   
   Usage:
   const paymentCircuitBreaker = new CircuitBreaker();
   
   try {
     const paymentResult = await paymentCircuitBreaker.execute(async () => {
       return await stripeClient.charges.create({...});
     });
   } catch (error) {
     if (error.message === 'Circuit breaker is OPEN') {
       return {
         statusCode: 503,
         body: JSON.stringify({
           error: 'ServiceUnavailable',
           message: 'Payment service is temporarily unavailable. Please try again later.'
         })
       };
     }
   }

4. Comprehensive Error Response Structure
   
   Standardized Error Format:
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Human-readable message",
       "details": {
         "field": "specificField",
         "reason": "Detailed reason"
       },
       "requestId": "req-abc-123",
       "timestamp": "2025-10-09T10:30:00Z",
       "retryable": boolean,
       "documentation": "https://docs.milkdelivery.com/errors/ERROR_CODE"
     }
   }
   
   Error Codes Catalog:
   ├── VALIDATION_ERROR (400)
   ├── UNAUTHORIZED (401)
   ├── FORBIDDEN (403)
   ├── RESOURCE_NOT_FOUND (404)
   ├── CONFLICT (409)
   ├── RATE_LIMIT_EXCEEDED (429)
   ├── INTERNAL_SERVER_ERROR (500)
   ├── SERVICE_UNAVAILABLE (503)
   └── GATEWAY_TIMEOUT (504)
   
   Implementation:
   File: src/shared/errors.ts
   
   export class AppError extends Error {
     constructor(
       public code: string,
       public message: string,
       public statusCode: number,
       public details?: any,
       public retryable: boolean = false
     ) {
       super(message);
       this.name = 'AppError';
     }
     
     toJSON() {
       return {
         error: {
           code: this.code,
           message: this.message,
           details: this.details,
           requestId: 'Set by Lambda context',
           timestamp: new Date().toISOString(),
           retryable: this.retryable,
           documentation: `https://docs.milkdelivery.com/errors/${this.code}`
         }
       };
     }
   }
   
   export class ValidationError extends AppError {
     constructor(message: string, field?: string) {
       super('VALIDATION_ERROR', message, 400, { field });
     }
   }
   
   export class InsufficientStockError extends AppError {
     constructor(productId: string, available: number, requested: number) {
       super(
         'INSUFFICIENT_STOCK',
         `Product has only ${available} units available`,
         400,
         { productId, available, requested }
       );
     }
   }
   
   Usage in Lambda:
   try {
     // ... validation logic
     if (stock < requestedQty) {
       throw new InsufficientStockError(productId, stock, requestedQty);
     }
   } catch (error) {
     if (error instanceof AppError) {
       return {
         statusCode: error.statusCode,
         body: JSON.stringify(error.toJSON())
       };
     }
     
     // Unknown error
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: {
           code: 'INTERNAL_SERVER_ERROR',
           message: 'An unexpected error occurred',
           requestId: context.requestId,
           timestamp: new Date().toISOString()
         }
       })
     };
   }

5. Logging Best Practices
   
   Structured Logging Format:
   {
     "timestamp": "2025-10-09T10:30:00.123Z",
     "level": "INFO|WARN|ERROR",
     "requestId": "req-abc-123",
     "userId": "user-456",
     "action": "CREATE_ORDER",
     "message": "Order created successfully",
     "context": {
       "orderId": "order-xyz-789",
       "totalAmount": 239.5,
       "itemCount": 2
     },
     "duration": 1234,
     "memoryUsed": 128
   }
   
   Implementation:
   File: src/shared/logger.ts
   
   export class Logger {
     private context: Record<string, any> = {};
     
     setContext(key: string, value: any) {
       this.context[key] = value;
     }
     
     info(message: string, data?: Record<string, any>) {
       this.log('INFO', message, data);
     }
     
     warn(message: string, data?: Record<string, any>) {
       this.log('WARN', message, data);
     }
     
     error(message: string, error?: Error, data?: Record<string, any>) {
       this.log('ERROR', message, {
         ...data,
         error: error?.message,
         stack: error?.stack
       });
     }
     
     private log(level: string, message: string, data?: Record<string, any>) {
       const logEntry = {
         timestamp: new Date().toISOString(),
         level,
         message,
         ...this.context,
         ...data
       };
       
       console.log(JSON.stringify(logEntry));
     }
   }
   
   Usage in Lambda:
   export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
     const logger = new Logger();
     logger.setContext('requestId', context.requestId);
     logger.setContext('functionName', context.functionName);
     
     const startTime = Date.now();
     
     try {
       logger.info('Order creation started', {
         userId: extractUserId(event)
       });
       
       const order = await createOrder(body);
       
       logger.info('Order created successfully', {
         orderId: order.orderId,
         totalAmount: order.totalAmount,
         duration: Date.now() - startTime
       });
       
       return successResponse(order);
     } catch (error) {
       logger.error('Order creation failed', error as Error, {
         userId: extractUserId(event),
         duration: Date.now() - startTime
       });
       
       return errorResponse(error);
     }
   };

Learning Outcome:
├── Edge cases identified and handled
├── Idempotency implemented
├── Circuit breaker pattern understood
├── Error handling standardized
├── Logging best practices applied
└── Production-ready code quality
```

---

## 6. LAMBDA FUNCTIONS: DEEP DIVE

### 6.1 Lambda Execution Model

**Cold Start vs Warm Start:**
```
Cold Start (First Invocation or After Idle):
├── AWS provisions execution environment
├── Downloads function code from S3
├── Initializes runtime (Node.js)
├── Executes initialization code (outside handler)
├── Executes handler function
└── Duration: 1-3 seconds (varies)

Warm Start (Subsequent Invocations):
├── Reuses existing execution environment
├── Skips initialization
├── Executes handler function only
└── Duration: 10-100 milliseconds

Optimization Strategy:
├── Initialize clients outside handler
├── Reuse database connections
├── Cache static data
└── Keep functions "warm" (CloudWatch Events ping)
```

**Example: Optimized Lambda Structure**
```typescript
// ✅ GOOD: Initialize outside handler
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Cache configuration (loaded once)
const config = {
  ordersTable: process.env.ORDERS_TABLE,
  minOrderValue: 100,
  taxRate: 0.05
};

export const handler = async (event, context) => {
  // Handler executes quickly, reusing connections
  const result = await docClient.get({
    TableName: config.ordersTable,
    Key: { orderId: event.pathParameters.orderId }
  });
  
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};

// ❌ BAD: Initialize inside handler
export const handler = async (event, context) => {
  const client = new DynamoDBClient({});  // Created every time!
  const docClient = DynamoDBDocumentClient.from(client);
  
  const result = await docClient.get({...});
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};
```

### 6.2 Memory and Timeout Configuration

**Memory Size Impact:**
```
Memory Configuration Options: 128 MB to 10,240 MB (10 GB)

Cost Calculation:
├── Price: $0.0000166667 per GB-second
├── 128 MB = 0.125 GB
├── Example: 1 million requests, 1 second each
│   ├── 128 MB: 1M * 1s * 0.125 GB * $0.0000166667 = $2.08
│   ├── 256 MB: 1M * 1s * 0.25 GB * $0.0000166667 = $4.17
│   ├── 512 MB: 1M * 1s * 0.5 GB * $0.0000166667 = $8.33
│   └── 1024 MB: 1M * 1s * 1 GB * $0.0000166667 = $16.67

Important: CPU power scales with memory
├── 128 MB = Low CPU power (slow execution)
├── 1024 MB = Proportional CPU (4x faster)
└── Paradox: Higher memory can be cheaper (faster execution)

Example Scenario:
├── Function with 128 MB: 2 seconds execution
│   └── Cost: 2s * 0.125 GB * $0.0000166667 = $0.0000041667
├── Same function with 512 MB: 0.6 seconds execution
│   └── Cost: 0.6s * 0.5 GB * $0.0000166667 = $0.0000050000
└── Verdict: 128 MB is cheaper in this case

Optimization Process:
1. Start with 512 MB (good balance)
2. Monitor CloudWatch metrics:
   ├── Duration
   ├── Memory Used
   └── Throttles
3. Adjust based on actual usage:
   ├── If memory used < 50%: Reduce memory
   ├── If duration consistently high: Increase memory
   └── Run load tests to find optimal setting

Your Learning Project:
├── Simple queries (getUser): 256 MB, 5s timeout
├── Order creation: 512 MB, 10s timeout
├── Image processing: 1024 MB, 30s timeout
└── Batch operations: 1024 MB, 60s timeout
```

**Timeout Configuration:**
```
Default: 3 seconds
Maximum: 15 minutes (900 seconds)
Recommendation: Set slightly higher than expected duration

Examples:
├── Simple CRUD: 5-10 seconds
├── API calls to third-party: 15-30 seconds
├── Complex calculations: 30-60 seconds
└── Batch processing: 5-15 minutes

Warning: Long timeouts increase cost if function hangs
├── Always implement timeout handling in code
└── Don't rely solely on Lambda timeout
```

### 6.3 Environment Variables & Secrets

**Environment Variables (SAM Template):**
```yaml
CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Environment:
      Variables:
        ORDERS_TABLE: !Ref OrdersTable
        USERS_TABLE: !Ref UsersTable
        MIN_ORDER_VALUE: '100'
        TAX_RATE: '0.05'
        STAGE: dev
        LOG_LEVEL: INFO
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'  # Reuse HTTP connections
```

**Secrets Management:**
```
❌ NEVER store sensitive data in environment variables:
├── API keys
├── Database passwords
├── Private keys
└── OAuth tokens

✅ Use AWS Secrets Manager:

1. Store secret:
$ aws secretsmanager create-secret \
  --name milk-delivery/stripe-api-key \
  --secret-string '{"apiKey":"sk_test_..."}'

2. Grant Lambda permission (SAM template):
CreateOrderFunction:
  Policies:
    - AWSSecretsManagerGetSecretValuePolicy:
        SecretArn: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:milk-delivery/*'

3. Retrieve in Lambda:
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretName: string) {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString!);
}

// Cache secret (avoid fetching on every invocation)
let stripeKey: string;

export const handler = async (event) => {
  if (!stripeKey) {
    const secret = await getSecret('milk-delivery/stripe-api-key');
    stripeKey = secret.apiKey;
  }
  
  // Use stripeKey
};

Cost: $0.40 per secret per month + $0.05 per 10,000 API calls
For learning: ~$0.40/month (1 secret, minimal calls)
```

### 6.4 Lambda Layers (Code Reuse)

**When to Use Layers:**
```
Use Cases:
├── Shared dependencies (AWS SDK, lodash, axios)
├── Common utilities (logger, validation, db helpers)
├── Large libraries (reduce deployment package size)
└── Code reuse across multiple functions

Benefits:
├── Faster deployments (layer unchanged, only function code updates)
├── Smaller deployment packages
├── Easier dependency management
└── Version control for shared code

Limitations:
├── Max 5 layers per function
├── Max 250 MB unzipped (all layers + function)
├── Layers are immutable (create new version to update)
```

**Creating a Lambda Layer:**
```
Directory Structure:
backend/
└── layers/
    └── common/
        ├── nodejs/
        │   ├── node_modules/  ← Dependencies
        │   └── utils/         ← Your utilities
        │       ├── logger.ts
        │       ├── db.ts
        │       └── validation.ts
        └── package.json

package.json:
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.400.0",
    "@aws-sdk/lib-dynamodb": "^3.400.0",
    "uuid": "^9.0.0"
  }
}

Build Layer:
$ cd layers/common/nodejs
$ npm install
$ cd ../..
$ zip -r common-layer.zip nodejs/

SAM Template:
CommonLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: milk-delivery-common
    Description: Shared utilities and dependencies
    ContentUri: layers/common/
    CompatibleRuntimes:
      - nodejs20.x
    RetentionPolicy: Retain

CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref CommonLayer
    CodeUri: dist/

Usage in Lambda:
// Import from layer
import { logger } from '/opt/nodejs/utils/logger';
import { v4 as uuidv4 } from 'uuid';  // From layer dependencies

export const handler = async (event) => {
  logger.info('Function started');
  const id = uuidv4();
  // ...
};
```

### 6.5 Lambda Monitoring Metrics

**Key CloudWatch Metrics:**
```
1. Invocations
   ├── Count: Total number of invocations
   ├── Use: Track function usage
   └── Free Tier: 1M invocations/month

2. Duration
   ├── Measure: Execution time in milliseconds
   ├── Use: Identify slow functions
   └── Optimization target: Keep under 1 second

3. Errors
   ├── Count: Failed invocations
   ├── Types: Function errors, timeout errors
   └── Goal: < 1% error rate

4. Throttles
   ├── Count: Rejected due to concurrency limits
   ├── Causes: Too many concurrent executions
   └── Solution: Increase reserved concurrency or optimize

5. Memory Usage
   ├── Measure: Actual memory used
   ├── Use: Right-size memory configuration
   └── Example: If using 150 MB of 512 MB, reduce to 256 MB

6. Concurrent Executions
   ├── Measure: Number of instances running simultaneously
   ├── Default limit: 1000 per region
   └── Free tier limit: Usually sufficient for learning

CloudWatch Logs Insights Queries:

Query 1: Average duration by function
fields @timestamp, @duration
| stats avg(@duration) as avg_duration by @function
| sort avg_duration desc

Query 2: Error count
filter @type = "ERROR"
| stats count() as error_count by bin(5m)

Query 3: Memory usage
fields @timestamp, @memorySize / 1000 / 1000 as mem_mb, @maxMemoryUsed / 1000 / 1000 as used_mb
| stats avg(used_mb) as avg_used, max(used_mb) as max_used

Query 4: Cold starts
filter @type = "REPORT"
| fields @duration, @initDuration
| filter ispresent(@initDuration)
| stats count() as cold_starts, avg(@initDuration) as avg_cold_start_ms
```

### 6.6 Lambda Cost Optimization

**Free Tier Maximization:**
```
Lambda Free Tier (Always Free):
├── 1M requests per month
├── 400,000 GB-seconds compute time per month

Calculation Examples:

Scenario 1: 128 MB function, 200ms execution
├── Compute: 0.2s * 0.125 GB = 0.025 GB-seconds per request
├── Free tier allows: 400,000 / 0.025 = 16M requests
├── But request limit is 1M, so effective limit: 1M requests
└── Verdict: Request limit is constraint, not compute

Scenario 2: 1024 MB function, 1s execution
├── Compute: 1s * 1 GB = 1 GB-second per request
├── Free tier allows: 400,000 / 1 = 400,000 requests
├── But request limit is 1M
└── Verdict: Compute is constraint, only 400K requests free

Your Learning Project Estimate:
├── Average: 512 MB, 500ms execution
├── Compute per request: 0.5s * 0.5 GB = 0.25 GB-seconds
├── Free tier allows: 400,000 / 0.25 = 1.6M requests
├── Your usage: ~10,000 requests/month during development
└── Cost: $0 (well within free tier)

Cost After Free Tier:
├── Requests: $0.20 per 1M requests
├── Compute: $0.0000166667 per GB-second
└── Your 10K requests: ~$0.02/month

Optimization Tips:
1. Reduce memory if not fully utilized
2. Optimize code for faster execution
3. Use layers for shared dependencies
4. Implement caching where possible
5. Batch operations when feasible
6. Monitor and eliminate unnecessary invocations
```

---

## 7. DYNAMODB: QUERY PATTERNS & OPTIMIZATION

### 7.1 Key Concepts

**Partition Key (PK) vs Sort Key (SK):**
```
Partition Key (Required):
├── Determines which partition data is stored in
├── Must be unique for each item (if no sort key)
├── Used for direct lookups: GetItem, PutItem
└── Example: userId, orderId, productId

Sort Key (Optional):
├── Allows multiple items with same partition key
├── Items sorted by sort key value
├── Enables range queries
└── Example: timestamp, status, category

Table Design Pattern 1: Simple (PK only)
Users Table:
PK: userId
├── user-001
├── user-002
└── user-003

Query: Get user by ID
const result = await docClient.get({
  TableName: 'Users',
  Key: { userId: 'user-001' }
});

Table Design Pattern 2: Composite Key (PK + SK)
Orders Table:
PK: userId, SK: orderId
├── user-001, order-2025-001
├── user-001, order-2025-002
├── user-002, order-2025-003
└── user-002, order-2025-004

Query: Get all orders for a user
const result = await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-001'
  }
});

Result: Returns order-2025-001 and order-2025-002
```

**Global Secondary Index (GSI):**
```
Purpose: Query table using different keys

Example Problem:
Users Table: PK = userId
├── You can query by userId
└── But you cannot query by email

Solution: Create GSI on email

GSI: email-index
PK: email
├── Allows query by email
└── Returns userId

Query: Find user by email
const result = await docClient.query({
  TableName: 'Users',
  IndexName: 'email-index',
  KeyConditionExpression: 'email = :email',
  ExpressionAttributeValues: {
    ':email': 'user@example.com'
  }
});

GSI Considerations:
├── Cost: Consumes additional WCU/RCU
├── Eventual consistency: Slight delay (usually milliseconds)
├── Projection: Choose ALL, KEYS_ONLY, or INCLUDE
└── Free Tier: Included in 25 WCU/RCU limit

SAM Template:
UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    AttributeDefinitions:
      - AttributeName: userId
        AttributeType: S
      - AttributeName: email
        AttributeType: S
    KeySchema:
      - AttributeName: userId
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: email-index
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        Projection:
          ProjectionType: ALL
    BillingMode: PAY_PER_REQUEST
```

### 7.2 Query vs Scan

**Query (Efficient):**
```
Characteristics:
├── Uses partition key (required)
├── Optionally uses sort key for range
├── Returns only matching items
├── Fast and cost-effective
└── Use whenever possible

Example: Get all orders for a user
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-123'
  }
});

Cost: 1 RCU per 4 KB read (eventually consistent)
Example: 10 orders, 1 KB each = 10 KB = 3 RCUs
```

**Scan (Inefficient):**
```
Characteristics:
├── Reads entire table
├── Filters after reading (wasteful)
├── Slow and expensive
├── Consumes RCUs for all items scanned
└── Avoid in production

Example: Find all orders with status="Pending" (BAD!)
await docClient.scan({
  TableName: 'Orders',
  FilterExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Problem:
├── Scans all 10,000 orders
├── Filters to 100 pending orders
├── Consumes RCUs for all 10,000 items
└── Returns only 100 items

Cost: If 10,000 items * 1 KB = 10,000 KB = 2,500 RCUs
(Way over free tier 25 RCU limit!)

Solution: Use GSI
Create GSI: status-index (PK: status, SK: createdAt)

Query with GSI:
await docClient.query({
  TableName: 'Orders',
  IndexName: 'status-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Cost: Only reads 100 pending orders = 25 RCUs
Savings: 100x reduction!
```

### 7.3 Batch Operations

**BatchGetItem:**
```
Purpose: Retrieve multiple items in one request

Limitations:
├── Max 100 items per request
├── Max 16 MB total response# SOLO DEVELOPER GUIDE - AWS FREE TIER OPTIMIZED
## Milk & Milk Products Delivery Platform (Comprehensive Learning Project)

---

## TABLE OF CONTENTS
1. [Solo Developer Workflow & Mindset](#solo-developer-workflow-mindset)
2. [AWS Free Tier: Complete Strategy](#aws-free-tier-complete-strategy)
3. [Development Environment Setup](#development-environment-setup)
4. [Hybrid Development: Console + VS Code](#hybrid-development-console-vs-code)
5. [Feature Development Flow (Step-by-Step)](#feature-development-flow)
6. [Lambda Functions: Deep Dive](#lambda-functions-deep-dive)
7. [DynamoDB: Query Patterns & Optimization](#dynamodb-query-patterns-optimization)
8. [API Gateway: Configuration & Testing](#api-gateway-configuration-testing)
9. [Authentication & Authorization](#authentication-authorization)
10. [Error Handling & Edge Cases](#error-handling-edge-cases)
11. [Testing Strategies](#testing-strategies)
12. [Monitoring & Debugging](#monitoring-debugging)
13. [CI/CD Pipeline Setup](#cicd-pipeline-setup)
14. [Cost Optimization Techniques](#cost-optimization-techniques)
15. [Security Best Practices](#security-best-practices)
16. [Performance Optimization](#performance-optimization)
17. [Common Pitfalls & Solutions](#common-pitfalls-solutions)
18. [Learning Path & Milestones](#learning-path-milestones)

---

## 1. SOLO DEVELOPER WORKFLOW & MINDSET

### 1.1 Daily Development Routine

**Realistic Time Allocation (3-4 hours/day):**

```
Morning Session (1.5-2 hours)
├── 00:00-00:10 → Review AWS costs (console billing dashboard)
├── 00:10-00:20 → Check CloudWatch logs for overnight errors
├── 00:20-00:30 → Plan today's feature (write in docs/daily-log.md)
├── 00:30-01:45 → Development work (focus time, no distractions)
└── 01:45-02:00 → Commit code & push to GitHub

Evening Session (1.5-2 hours)
├── 00:00-01:00 → Continue feature development or bug fixes
├── 01:00-01:20 → Testing (local + deployed)
├── 01:20-01:40 → Documentation (update API docs, learning notes)
├── 01:40-01:50 → Deploy to AWS (if ready)
└── 01:50-02:00 → Plan tomorrow's task + update Kanban board
```

**Weekly Rhythm:**
```
Monday: Start new feature (backend)
Tuesday: Complete feature + unit tests
Wednesday: Integration + API Gateway setup
Thursday: Frontend integration
Friday: End-to-end testing + documentation
Saturday: Deployment + monitoring
Sunday: Review week, plan next week, learn new AWS concept
```

### 1.2 Solo Developer's Development Phases

**Phase 1: MVP Foundation (Week 1-3)**
```
Week 1: Infrastructure Setup
├── Day 1-2: AWS account setup, IAM users, billing alerts
├── Day 3-4: First Lambda function (Hello World → createUser)
├── Day 5-6: DynamoDB table creation + manual data entry
└── Day 7: First API endpoint working end-to-end

Week 2: User Management
├── Day 1-2: User registration with validation
├── Day 3-4: User login (Cognito integration)
├── Day 5-6: User profile management
└── Day 7: Testing + bug fixes

Week 3: Product Catalog
├── Day 1-3: Product listing + search
├── Day 4-5: Product details + images (S3)
├── Day 6: Vendor management basics
└── Day 7: Integration testing
```

**Phase 2: Core Business Logic (Week 4-8)**
```
Week 4: Order Creation Flow
├── Shopping cart logic (frontend state)
├── Order validation
├── Inventory checking
└── Order creation Lambda

Week 5: Payment Integration
├── Stripe/Razorpay SDK setup
├── Payment flow (test mode)
├── Payment webhooks
└── Order confirmation

Week 6: Step Functions
├── Order processing workflow
├── Inventory reservation
├── Vendor notifications
└── State machine testing

Week 7: Delivery Management
├── Delivery scheduling
├── Status updates
├── Notifications (SNS/SES)
└── Delivery tracking

Week 8: Integration & Bug Fixes
├── End-to-end testing
├── Edge case handling
├── Performance optimization
└── Documentation
```

**Phase 3: Frontend & Polish (Week 9-12)**
```
Week 9-10: React Frontend
├── Component development
├── State management (Redux/Zustand)
├── API integration
└── Responsive design

Week 11: Advanced Features
├── User dashboard
├── Order history
├── Admin panel basics
└── Analytics

Week 12: Deployment & Launch
├── Production deployment
├── Performance tuning
├── Security audit
└── Final testing
```

### 1.3 Task Management (Solo Approach)

**Simple Kanban Board (GitHub Projects or Trello):**
```
Backlog → Todo → In Progress → Testing → Done
```

**Sample Tasks Breakdown:**
```yaml
Epic: User Management
  Story: User Registration
    Task: Create DynamoDB Users table
    Task: Create createUser Lambda
    Task: Add validation logic
    Task: Set up API Gateway endpoint
    Task: Write unit tests
    Task: Test in console
    Task: Deploy with SAM
    Task: Integration test
    
  Story: User Login
    Task: Configure Cognito User Pool
    Task: Create login API
    Task: JWT token validation
    Task: Test authentication flow
```

### 1.4 Learning Mindset

**Document Everything:**
```
docs/
├── daily-log.md           # What you learned today
├── mistakes.md            # Errors and how you fixed them
├── aws-concepts.md        # AWS services explained in your words
├── design-decisions.md    # Why you chose X over Y
└── helpful-resources.md   # Useful articles, videos, docs
```

**Sample daily-log.md entry:**
```markdown
# Day 15 - October 10, 2025

## What I Built Today
- Completed createOrder Lambda function
- Added inventory validation
- Set up Step Functions for order processing

## What I Learned
- DynamoDB transactions prevent race conditions
- Lambda cold starts can be 1-2 seconds (need to optimize)
- Step Functions are billed per state transition ($0.025/1000)

## Problems I Faced
- Issue: Lambda timeout after 3 seconds
- Solution: Increased timeout to 10s, optimized DynamoDB query
- Learning: Always use indexes for queries, not scans!

## Tomorrow's Plan
- Add payment integration (Stripe test mode)
- Write unit tests for createOrder
- Deploy to dev environment
```

---

## 2. AWS FREE TIER: COMPLETE STRATEGY

### 2.1 Detailed Free Tier Limits

**Always Free (No Time Limit):**
```yaml
Lambda:
  Requests: 1,000,000 per month
  Compute: 400,000 GB-seconds per month
  Example: 
    - 1M invocations with 128MB = ~51 hours compute
    - Roughly 3,200 requests/day with 128MB, 1s execution
  Your Usage: Likely 100-500 requests/day during development
  Status: ✅ Safe

DynamoDB:
  Storage: 25 GB
  WCU: 25 (write capacity units)
  RCU: 25 (read capacity units)
  Example:
    - 25 WCU = 25 writes/sec or 2.1M writes/day
    - 25 RCU = 100 eventual reads/sec or 8.6M reads/day
  Your Usage: Maybe 50-100 operations/day in development
  Status: ✅ Very safe
  
  Important: Use on-demand billing mode
    - No upfront capacity planning
    - Pay only for actual reads/writes
    - First 25 WCU/RCU free, then $1.25/$0.25 per million

S3:
  Storage: 5 GB Standard storage
  GET: 20,000 requests
  PUT: 2,000 requests
  Data Transfer: 100 GB out per month (first 12 months)
  Your Usage: 10-50 MB for product images in development
  Status: ✅ Safe

CloudWatch:
  Logs: 5 GB ingestion, 5 GB storage
  Metrics: 10 custom metrics
  Alarms: 10 alarms
  Dashboard: 3 dashboards
  Your Usage: 100-500 MB logs/month during development
  Status: ✅ Safe

SNS:
  Email: 1,000 notifications/month (12 months free)
  SMS: 100 notifications/month (12 months free)
  HTTP: 100,000 notifications/month (12 months free)
  After 12 months: $0.50 per million emails
  Your Usage: 10-50 emails/month for testing
  Status: ⚠️ Be careful with SMS after year 1

SES (Simple Email Service):
  Emails: 62,000 per month (always free if sent from EC2)
  From Lambda: 3,000 per month free (12 months)
  After: $0.10 per 1,000 emails
  Your Usage: 10-100 emails/month
  Status: ✅ Safe, better than SNS for emails

Cognito:
  MAU: 50,000 monthly active users (always free)
  Your Usage: 1-10 test users
  Status: ✅ Very safe
```

**12 Months Free (After Sign-up):**
```yaml
API Gateway:
  REST API: 1,000,000 requests per month
  After: $3.50 per million requests
  Your Usage: 100-1,000 requests/day = 3,000-30,000/month
  Status: ✅ Safe during free tier
  Strategy: After 1 year, consider Lambda Function URLs (free)

CloudFront:
  Data Transfer: 1 TB out
  Requests: 10,000,000 HTTP/HTTPS
  After: $0.085 per GB + $0.0075 per 10,000 requests
  Your Usage: Don't use during development
  Status: ⚠️ Use only for production launch
```

**Services to AVOID (Cost Traps):**
```yaml
❌ NAT Gateway:
  Cost: $0.045/hour = $32.40/month + data transfer
  Why avoid: Expensive for learning
  Alternative: Lambda functions don't need NAT (direct internet)

❌ Application Load Balancer:
  Cost: $0.0225/hour = $16.20/month + LCU charges
  Why avoid: Unnecessary for serverless
  Alternative: API Gateway (free tier) or Lambda Function URLs

❌ RDS:
  Free tier: 750 hours/month for 12 months (db.t2.micro)
  After: Minimum $15-20/month
  Why avoid: Not needed, use DynamoDB
  Alternative: DynamoDB (always free up to limits)

❌ ECS/EKS:
  ECS: $0.10/hour per running task
  EKS: $0.10/hour for control plane = $73/month
  Why avoid: Overkill for learning serverless
  Alternative: Lambda functions

❌ ElastiCache:
  Free tier: None
  Cost: Minimum $13/month
  Why avoid: Not needed for MVP
  Alternative: In-memory caching in Lambda

❌ Elasticsearch:
  Free tier: None
  Cost: Minimum $23/month
  Why avoid: Expensive
  Alternative: DynamoDB queries + GSIs
```

### 2.2 Cost Monitoring Setup (Critical!)

**Step 1: Set Up Billing Alerts (Day 1 Task)**
```
AWS Console → Billing Dashboard → Billing Preferences
├── ✅ Receive PDF Invoice By Email
├── ✅ Receive Free Tier Usage Alerts (your email)
├── ✅ Receive Billing Alerts
└── Save preferences

AWS Console → CloudWatch → Alarms → Billing
├── Create Alarm: Estimated Charges > $5
├── Create Alarm: Estimated Charges > $10
├── Create Alarm: Estimated Charges > $20
└── SNS Topic: Email notification to yourself
```

**Step 2: Daily Cost Check Routine**
```
Every Morning (5 minutes):
├── AWS Console → Billing Dashboard
├── Check "Month-to-Date Spend"
├── Review "Free Tier Usage" (shows % consumed)
└── If over $5: Investigate "Cost Explorer"

Expected Daily Costs During Development:
├── Days 1-30: $0.00 - $0.50/day (within free tier)
├── Days 31-60: $0.50 - $1.00/day (learning curve)
├── Days 61-90: $0.20 - $0.50/day (optimized)
└── Goal: Stay under $10/month
```

**Step 3: AWS Cost Explorer Tags**
```
Tag all resources for tracking:
├── Environment: dev
├── Project: milk-delivery
├── Owner: your-name
└── Cost-Center: learning

Example in SAM template:
Tags:
  Environment: dev
  Project: milk-delivery
  Owner: solo-developer
```

### 2.3 Free Tier Budget Calculator

**Your Estimated Monthly Usage:**
```yaml
Service            | Free Tier    | Your Usage  | Cost Impact
-------------------|--------------|-------------|-------------
Lambda             | 1M requests  | 10,000      | $0.00
DynamoDB           | 25 WCU/RCU   | 1,000 ops   | $0.00
API Gateway        | 1M requests  | 10,000      | $0.00 (Year 1)
S3                 | 5 GB         | 100 MB      | $0.00
CloudWatch Logs    | 5 GB         | 500 MB      | $0.00
SES                | 62,000 emails| 50 emails   | $0.00
Cognito            | 50k MAU      | 5 users     | $0.00
Step Functions     | 4,000 states | 100 states  | $0.00
-------------------|--------------|-------------|-------------
TOTAL                                           | $0.00-$2.00

Potential Charges:
- API Gateway (after Year 1): ~$0.04/month
- Data Transfer Out: ~$0.50/month (minimal testing)
- CloudWatch (if over 5GB logs): ~$1.00/month

Expected Total: $0-5/month during development
```

---

## 3. DEVELOPMENT ENVIRONMENT SETUP

### 3.1 Machine Requirements

**Minimum Specifications:**
```yaml
Operating System: Windows 10/11, macOS, or Linux
Processor: Intel i3 or equivalent (dual-core)
RAM: 8 GB minimum, 16 GB recommended
Storage: 20 GB free space (for Node.js, Docker, projects)
Internet: Stable connection (AWS API calls)
```

**Recommended Setup:**
```yaml
OS: Windows 11 or macOS
RAM: 16 GB (Docker + VS Code + Browser = memory hungry)
Storage: SSD with 50 GB free (faster builds)
Internet: 10 Mbps+ (for video tutorials, AWS console)
```

### 3.2 Software Installation (Step-by-Step)

**Step 1: Install Node.js**
```
What: JavaScript runtime for Lambda development
Why: Lambda supports Node.js 20.x runtime
Where: https://nodejs.org/en/download

Installation:
├── Download Node.js 20.x LTS installer
├── Run installer (default options are fine)
├── Verify installation:
│   ├── Open terminal/command prompt
│   ├── Type: node --version (should show v20.x.x)
│   └── Type: npm --version (should show v10.x.x)
└── Done!

Post-Install Configuration:
├── Set npm global directory (avoid permission issues)
│   └── npm config set prefix ~/.npm-global (Mac/Linux)
│       or C:\Users\YourName\AppData\Roaming\npm (Windows)
└── Update npm: npm install -g npm@latest
```

**Step 2: Install AWS CLI**
```
What: Command-line tool to interact with AWS services
Why: Deploy resources, check logs, manage services
Where: https://aws.amazon.com/cli/

Windows:
├── Download MSI installer
├── Run installer
└── Verify: aws --version

macOS:
├── Option 1: Homebrew
│   └── brew install awscli
├── Option 2: Official installer
│   └── Download .pkg file
└── Verify: aws --version

Linux:
├── curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
├── unzip awscliv2.zip
├── sudo ./aws/install
└── Verify: aws --version

Configuration:
├── Run: aws configure
├── AWS Access Key ID: [Get from IAM console]
├── AWS Secret Access Key: [Get from IAM console]
├── Default region name: us-east-1
└── Default output format: json
```

**Step 3: Install AWS SAM CLI**
```
What: Framework for building serverless applications
Why: Local testing, easy deployment, IaC with templates
Where: https://aws.amazon.com/serverless/sam/

Windows:
├── Download MSI installer
├── Run installer (requires admin rights)
└── Verify: sam --version

macOS:
├── Homebrew: brew install aws-sam-cli
└── Verify: sam --version

Linux:
├── Download ZIP file
├── Unzip and install
└── Verify: sam --version

SAM Prerequisites:
├── Docker Desktop (for sam local commands)
│   └── Download from: https://www.docker.com/products/docker-desktop
└── Python 3.8+ (usually pre-installed on Mac/Linux)
```

**Step 4: Install Visual Studio Code**
```
What: Code editor with excellent AWS support
Why: Best IDE for serverless development
Where: https://code.visualstudio.com/

Installation:
├── Download installer for your OS
├── Run installer
├── Launch VS Code
└── Done!

Essential Extensions (Install via Extensions panel):
├── AWS Toolkit (amazonwebservices.aws-toolkit-vscode)
│   └── Integrates AWS services into VS Code
├── ESLint (dbaeumer.vscode-eslint)
│   └── JavaScript/TypeScript linting
├── Prettier (esbenp.prettier-vscode)
│   └── Code formatting
├── Thunder Client (rangav.vscode-thunder-client)
│   └── API testing (like Postman, but in VS Code)
├── GitLens (eamodio.gitlens)
│   └── Git history and blame annotations
├── Docker (ms-azuretools.vscode-docker)
│   └── Manage Docker containers
└── REST Client (humao.rest-client)
    └── Test HTTP requests from .http files
```

**Step 5: Install Git**
```
What: Version control system
Why: Code versioning, GitHub integration
Where: https://git-scm.com/downloads

Installation:
├── Download installer
├── Run with default options
└── Verify: git --version

Configuration:
├── git config --global user.name "Your Name"
├── git config --global user.email "your.email@example.com"
└── git config --global init.defaultBranch main
```

**Step 6: Optional but Recommended Tools**
```
Docker Desktop:
├── Required for: sam local invoke, sam local start-api
├── Download: https://www.docker.com/products/docker-desktop
└── Purpose: Run Lambda functions locally in containers

Postman (Alternative to Thunder Client):
├── Download: https://www.postman.com/downloads/
└── Purpose: API testing with collections

DynamoDB Local (Optional):
├── Download: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
└── Purpose: Test DynamoDB operations without AWS connection
```

### 3.3 AWS Account Setup

**Step 1: Create AWS Account**
```
Go to: https://aws.amazon.com/free

Sign Up Process:
├── 1. Email and password
├── 2. Account type: Personal
├── 3. Contact information
├── 4. Payment information (required, but won't charge if stay in free tier)
├── 5. Identity verification (phone call)
└── 6. Select Support Plan: Basic (Free)

⚠️ Important:
- Use a credit/debit card with at least $1 for verification
- Set up billing alerts immediately
- Enable MFA (Multi-Factor Authentication) for root account
```

**Step 2: Secure Root Account**
```
After Sign-up:
├── 1. Go to IAM → Dashboard
├── 2. Enable MFA for root account
│   ├── Use Google Authenticator, Authy, or hardware token
│   └── NEVER share MFA codes
├── 3. Create IAM user for daily use (don't use root)
└── 4. Delete root access keys if created
```

**Step 3: Create IAM User (For Development)**
```
IAM → Users → Add User

User Details:
├── Username: milk-delivery-dev
├── Access type: ✅ Programmatic access (for AWS CLI)
│              ✅ AWS Management Console access (for console)
└── Console password: Auto-generated or custom

Permissions:
├── Attach existing policies directly:
│   ├── ✅ AdministratorAccess (for learning only)
│   │   └── ⚠️ In production, use least-privilege policies
│   └── Or create custom policy (see below)
└── Tags:
    ├── Environment: dev
    └── Purpose: learning

Download Credentials:
├── Save Access Key ID
├── Save Secret Access Key
└── Store securely (password manager recommended)

Configure AWS CLI:
├── aws configure --profile milk-delivery-dev
├── Enter Access Key ID
├── Enter Secret Access Key
├── Region: us-east-1
└── Output: json
```

**Custom IAM Policy (Least Privilege for Learning):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "dynamodb:*",
        "apigateway:*",
        "s3:*",
        "cloudformation:*",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "logs:*",
        "events:*",
        "sns:*",
        "ses:*",
        "cognito-idp:*",
        "states:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3.4 VS Code Configuration

**Workspace Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true,
  "files.autoSave": "onFocusChange",
  "typescript.preferences.importModuleSpecifier": "relative",
  "aws.samcli.location": "/usr/local/bin/sam",
  "aws.profile": "milk-delivery-dev",
  "aws.region": "us-east-1",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

**Launch Configuration (.vscode/launch.json):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Lambda (SAM)",
      "type": "node",
      "request": "attach",
      "address": "localhost",
      "port": 5858,
      "localRoot": "${workspaceFolder}/backend/src",
      "remoteRoot": "/var/task",
      "protocol": "inspector",
      "stopOnEntry": false
    }
  ]
}
```

---

## 4. HYBRID DEVELOPMENT: CONSOLE + VS CODE

### 4.1 Philosophy: When to Use What

**AWS Console is BEST for:**
```
✅ Visual Learning & Exploration
   ├── Understanding service dashboards
   ├── Exploring service features and options
   ├── Reading integrated documentation
   └── Seeing visual representations (Step Functions graphs)

✅ One-Time Setup Tasks
   ├── Creating Cognito User Pool (complex configuration)
   ├── Setting up billing alerts
   ├── Creating IAM roles and policies (first time)
   ├── Configuring CloudWatch dashboards
   └── Setting up SNS/SES email verification

✅ Quick Testing & Debugging
   ├── Testing Lambda with sample events
   ├── Viewing DynamoDB table data
   ├── Checking CloudWatch logs in real-time
   ├── Testing API Gateway endpoints manually
   └── Viewing Step Functions execution history

✅ Monitoring & Operations
   ├── CloudWatch Logs Insights queries
   ├── Viewing metrics and graphs
   ├── Checking service quotas and limits
   ├── Cost analysis and billing reports
   └── Resource utilization dashboards
```

**VS Code is BEST for:**
```
✅ All Code Development
   ├── Writing Lambda functions
   ├── TypeScript/JavaScript development
   ├── Creating unit tests
   ├── Shared utilities and libraries
   └── Frontend React components

✅ Infrastructure as Code (IaC)
   ├── SAM templates (template.yaml)
   ├── CloudFormation templates
   ├── Environment configuration files
   └── Deployment scripts

✅ Version Control
   ├── Git commits and branching
   ├── Code reviews (self-review before commit)
   ├── Merge conflict resolution
   └── GitHub integration

✅ Local Development & Testing
   ├── sam local invoke (test Lambda locally)
   ├── sam local start-api (local API Gateway)
   ├── Unit tests with Jest
   ├── Integration tests
   └── Debugging with breakpoints

✅ Batch Operations
   ├── Creating multiple Lambda functions
   ├── Updating multiple files at once
   ├── Search and replace across project
   └── Refactoring code
```

### 4.2 Hybrid Workflow Patterns

**Pattern 1: Learning a New Service**
```
Example: Setting up DynamoDB for the first time

Step 1: AWS Console (30 minutes)
├── Navigate to DynamoDB service
├── Click "Create table"
├── Experiment with different settings:
│   ├── Partition key vs. Sort key
│   ├── Provisioned vs. On-demand
│   ├── Global Secondary Indexes (GSI)
│   └── Stream settings
├── Create a test table manually
├── Add sample items via console
├── Try different queries in console
└── Learn query vs. scan difference

Step 2: VS Code (30 minutes)
├── Create SAM template with DynamoDB resource
├── Define table schema in YAML
├── Add GSI definitions
├── Write Lambda function to interact with table
└── Test locally with DynamoDB Local or deployed table

Step 3: AWS Console (15 minutes)
├── Deploy via SAM from VS Code terminal
├── Verify table creation in console
├── Check table metrics
└── Validate data structure

Result: You understand DynamoDB AND have IaC code
```

**Pattern 2: Developing a New Lambda Function**
```
Example: Creating "createOrder" Lambda

Step 1: Console Prototype (15 minutes)
├── AWS Console → Lambda → Create function
├── Name: createOrderPrototype
├── Runtime: Node.js 20.x
├── Write basic handler code inline
├── Create test event with sample JSON:
│   {
│     "userId": "user-123",
│     "items": [{"productId": "prod-1", "quantity": 2}]
│   }
├── Test and see output
├── Fix any immediate errors
└── Verify basic logic works

Step 2: VS Code Development (2 hours)
├── Create file: backend/src/lambdas/order/createOrder.ts
├── Copy working logic from console
├── Add TypeScript types and interfaces
├── Implement proper error handling
├── Add input validation
├── Add logging
├── Add to SAM template
├── Write unit tests
└── Test locally: sam local invoke

Step 3: Console Debugging (20 minutes)
├── Deploy from VS Code: sam deploy
├── Go to AWS Console → Lambda → createOrder
├── Test with real event
├── Check CloudWatch logs
├── Identify any AWS-specific issues
└── Note execution time and memory usage

Step 4: VS Code Refinement (30 minutes)
├── Fix issues found in console testing
├── Optimize memory settings in SAM template
├── Adjust timeout if needed
├── Update documentation
└── Redeploy: sam deploy

Result: Production-ready Lambda with IaC
```

**Pattern 3: API Gateway Setup**
```
Example: Creating REST API with multiple endpoints

Step 1: Console Exploration (30 minutes)
├── AWS Console → API Gateway
├── Create REST API (not HTTP API)
├── Manually create one resource: /users
├── Add POST method
├── Link to Lambda function (console UI)
├── Configure CORS manually
├── Deploy to "dev" stage
├── Test with API Gateway test feature
└── Understand request/response transformation

Step 2: VS Code IaC (1 hour)
├── Add API Gateway to SAM template
├── Define all resources and methods in YAML
├── Configure Cognito authorizer
├── Set up request validators
├── Configure CORS in template
├── Add multiple endpoints
└── Deploy entire API: sam deploy

Step 3: Console Validation (15 minutes)
├── Check deployed API in console
├── Verify all endpoints exist
├── Test each endpoint
├── Check authorization works
└── Review API Gateway logs

Result: Complete API defined in code, easy to replicate
```

### 4.3 AWS Toolkit Extension (The Bridge)

**Installation & Setup:**
```
Step 1: Install Extension
├── Open VS Code
├── Go to Extensions (Ctrl+Shift+X)
├── Search: "AWS Toolkit"
├── Install "AWS Toolkit" by Amazon Web Services
└── Restart VS Code

Step 2: Connect to AWS
├── Click AWS icon in left sidebar
├── Click "Connect to AWS"
├── Select profile: milk-delivery-dev
└── Region: us-east-1

Step 3: Verify Connection
├── Expand "Lambda" in sidebar
├── You should see all deployed functions
├── Expand "DynamoDB"
├── You should see all tables
└── Success!
```

**Key Features You'll Use Daily:**

**1. Lambda Functions**
```
What you can do from VS Code:
├── View all deployed Lambda functions
├── Invoke function remotely (without console)
│   ├── Right-click function
│   ├── Select "Invoke on AWS"
│   ├── Choose test event
│   └── See results in VS Code
├── Download function code
│   ├── Right-click function
│   ├── Select "Download Lambda"
│   └── Code appears in VS Code
└── View CloudWatch logs
    ├── Right-click function
    ├── Select "View CloudWatch Logs"
    └── Logs stream in VS Code terminal

Example Workflow:
├── Deploy function from VS Code terminal: sam deploy
├── Test directly from VS Code using AWS Toolkit
├── View logs without switching to browser
└── Make changes and redeploy, all in one place
```

**2. DynamoDB Tables**
```
What you can do from VS Code:
├── Browse table data
│   ├── Expand DynamoDB in AWS Toolkit
│   ├── Right-click table
│   ├── Select "View Table"
│   └── See items in VS Code panel
├── Run queries
│   ├── Click "Query" button
│   ├── Enter partition key value
│   ├── Execute
│   └── Results appear in VS Code
├── Download items as JSON
│   ├── Right-click items
│   ├── Select "Download items"
│   └── Save to file
└── Insert test data
    ├── Right-click table
    ├── Select "Insert Item"
    └── Paste JSON

Example Workflow:
├── Check if user exists in database
├── Query directly from VS Code
├── No need to open AWS Console
└── Copy user data for test event
```

**3. CloudWatch Logs**
```
What you can do from VS Code:
├── View log groups
├── Stream logs in real-time
│   ├── Right-click Lambda function
│   ├── Select "View CloudWatch Logs"
│   ├── Logs appear in VS Code terminal
│   └── Auto-refreshes with new logs
├── Search logs
│   ├── Use Ctrl+F in log panel
│   └── Filter by text
└── Download logs for analysis

Example Workflow:
├── Deploy Lambda function
├── Invoke from VS Code
├── Instantly see logs in VS Code
├── Debug without opening console
└── Faster iteration cycle
```

**4. S3 Buckets**
```
What you can do from VS Code:
├── Browse bucket contents
├── Upload files
│   ├── Right-click bucket
│   ├── Select "Upload File"
│   └── Choose file from system
├── Download files
│   ├── Right-click file
│   ├── Select "Download"
│   └── Save to local folder
└── Delete files

Example Workflow:
├── Upload product images
├── Get S3 URL for DynamoDB
├── All without leaving VS Code
```

**5. Step Functions**
```
What you can do from VS Code:
├── View state machines
├── Start execution
│   ├── Right-click state machine
│   ├── Select "Start Execution"
│   ├── Provide input JSON
│   └── Execution starts
├── View execution history
└── Download execution results

Example Workflow:
├── Test order processing workflow
├── Start execution from VS Code
├── Check status in toolkit
├── View results inline
```

### 4.4 Detailed Workflow Examples

**Example 1: Building User Registration (Complete Flow)**

**Day 1 Morning: Console Exploration (1 hour)**
```
Task: Understand what you need to build

1. Research Phase (AWS Console)
   ├── Navigate to Cognito
   ├── Read "What is Amazon Cognito?"
   ├── Create a test User Pool
   │   ├── Pool name: milk-delivery-users-test
   │   ├── Standard attributes: email, name, phone
   │   ├── Password policy: default
   │   ├── MFA: Optional (for learning)
   │   └── Create pool
   ├── Create test user manually
   │   ├── Username: testuser@example.com
   │   ├── Temporary password: Test@1234
   │   └── Verify user can login
   └── Test user login in Cognito UI
   
2. DynamoDB Exploration (AWS Console)
   ├── Navigate to DynamoDB
   ├── Create table: Users
   │   ├── Partition key: userId (String)
   │   ├── Billing mode: On-demand
   │   └── Create table
   ├── Add sample user item manually:
   │   {
   │     "userId": "user-001",
   │     "email": "test@example.com",
   │     "name": "Test User",
   │     "phone": "+1234567890",
   │     "role": "Customer",
   │     "createdAt": "2025-10-09T10:00:00Z"
   │   }
   └── Verify item appears in table

3. Lambda Exploration (AWS Console)
   ├── Navigate to Lambda
   ├── Create function: createUserTest
   ├── Write minimal code inline:
   │   exports.handler = async (event) => {
   │     console.log('Received event:', event);
   │     return {
   │       statusCode: 200,
   │       body: JSON.stringify({ message: 'User created' })
   │     };
   │   };
   ├── Test with sample event:
   │   {
   │     "body": "{\"email\":\"new@example.com\",\"name\":\"New User\"}"
   │   }
   └── Verify it returns 200 OK

Learning Outcome:
├── Understand Cognito concepts
├── See DynamoDB table structure
├── Know Lambda basic structure
└── Ready to code properly in VS Code
```

**Day 1 Afternoon: VS Code Development (2-3 hours)**
```
Task: Build production-ready createUser Lambda

1. Project Setup (VS Code Terminal)
   $ cd ~/projects
   $ mkdir milk-delivery-platform
   $ cd milk-delivery-platform
   $ sam init
   ├── Choose: 1 - AWS Quick Start Templates
   ├── Choose: 1 - Hello World Example
   ├── Runtime: nodejs20.x
   ├── Name: milk-delivery
   └── Project created!

2. Project Structure Organization
   milk-delivery-platform/
   ├── backend/
   │   ├── src/
   │   │   ├── lambdas/
   │   │   │   └── user/
   │   │   │       ├── createUser.ts
   │   │   │       ├── getUser.ts
   │   │   │       └── types.ts
   │   │   └── shared/
   │   │       ├── db.ts
   │   │       ├── validation.ts
   │   │       └── logger.ts
   │   ├── template.yaml
   │   ├── package.json
   │   └── tsconfig.json
   └── docs/
       └── api/
           └── user-api.md

3. Install Dependencies
   $ cd backend
   $ npm init -y
   $ npm install --save @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   $ npm install --save-dev @types/node @types/aws-lambda typescript

4. Create TypeScript Configuration (tsconfig.json)
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "lib": ["ES2020"],
       "outDir": "./dist",
       "rootDir": "./src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }

5. Create Lambda Function (Skeleton)
   File: src/lambdas/user/createUser.ts
   
   // Define interfaces
   interface CreateUserRequest {
     email: string;
     name: string;
     phone: string;
     password: string;
   }
   
   interface CreateUserResponse {
     userId: string;
     email: string;
     message: string;
   }
   
   // TODO: Implement handler
   // TODO: Add validation
   // TODO: Add DynamoDB operations
   // TODO: Add error handling

6. Create SAM Template (template.yaml)
   AWSTemplateFormatVersion: '2010-09-09'
   Transform: AWS::Serverless-2016-10-31
   
   Globals:
     Function:
       Timeout: 10
       Runtime: nodejs20.x
       Environment:
         Variables:
           USERS_TABLE: !Ref UsersTable
   
   Resources:
     CreateUserFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/user/createUser.handler
         Policies:
           - DynamoDBCrudPolicy:
               TableName: !Ref UsersTable
     
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
           - IndexName: email-index
             KeySchema:
               - AttributeName: email
                 KeyType: HASH
             Projection:
               ProjectionType: ALL

7. Build & Test Locally
   $ npm run build
   $ sam build
   $ sam local invoke CreateUserFunction --event events/create-user.json
   
   events/create-user.json:
   {
     "body": "{\"email\":\"test@example.com\",\"name\":\"Test User\",\"phone\":\"+1234567890\",\"password\":\"Test@123\"}"
   }

Learning Outcome:
├── Project structure established
├── SAM template basics understood
├── Local testing working
└── Ready for implementation
```

**Day 2: Implementation & Deployment**
```
Task: Complete Lambda implementation and deploy

1. Implement Full Lambda Function (VS Code)
   File: src/lambdas/user/createUser.ts
   
   [Full TypeScript implementation with:]
   ├── Input validation (email format, password strength)
   ├── Check if email already exists (GSI query)
   ├── Generate userId (UUID)
   ├── Hash password (if not using Cognito)
   ├── Save to DynamoDB
   ├── Error handling (try-catch with proper status codes)
   └── Logging (console.log with context)

2. Create Shared Utilities (VS Code)
   File: src/shared/validation.ts
   ├── validateEmail(email: string): boolean
   ├── validatePhone(phone: string): boolean
   └── validatePassword(password: string): string | null
   
   File: src/shared/db.ts
   ├── DynamoDB client initialization
   ├── Helper functions for common operations
   └── Error handling wrappers

3. Write Unit Tests (VS Code)
   File: tests/unit/createUser.test.ts
   
   Test cases:
   ├── Should create user with valid input
   ├── Should reject invalid email
   ├── Should reject weak password
   ├── Should reject duplicate email
   └── Should handle DynamoDB errors
   
   $ npm test

4. Deploy to AWS (VS Code Terminal)
   $ sam build
   $ sam deploy --guided
   
   Prompts:
   ├── Stack name: milk-delivery-dev
   ├── Region: us-east-1
   ├── Confirm changes: Y
   ├── Allow SAM CLI IAM role creation: Y
   ├── Save arguments to config file: Y
   └── Deployment starts...
   
   Wait for: Successfully created/updated stack

5. Verify Deployment (AWS Console)
   ├── Lambda → Functions → createUserFunction
   │   ├── Check function exists
   │   ├── Check environment variables
   │   └── Check permissions
   ├── DynamoDB → Tables → milk-delivery-users
   │   ├── Check table exists
   │   ├── Check GSI: email-index
   │   └── Check capacity mode: On-demand
   └── CloudFormation → Stacks → milk-delivery-dev
       ├── Check stack status: CREATE_COMPLETE
       └── Review all resources created

6. Test Deployed Function (Console + VS Code)
   
   Option A: AWS Console
   ├── Lambda → createUserFunction → Test tab
   ├── Create test event: create-user-test
   ├── Execute test
   ├── Check response: 201 Created
   └── CloudWatch logs: Check execution logs
   
   Option B: VS Code (AWS Toolkit)
   ├── AWS Toolkit → Lambda → createUserFunction
   ├── Right-click → Invoke on AWS
   ├── Select test event
   ├── View results in VS Code
   └── Check logs in VS Code

7. Verify Data in DynamoDB (Console)
   ├── DynamoDB → Tables → milk-delivery-users
   ├── Items tab
   ├── Should see new user item
   └── Verify all fields are correct

Learning Outcome:
├── Full Lambda function deployed
├── Infrastructure as Code working
├── Understand deployment process
└── Can iterate quickly
```

---

## 5. FEATURE DEVELOPMENT FLOW (STEP-BY-STEP)

### 5.1 Complete Feature: Order Creation System

**Overview:**
```
Feature: Create Order
Complexity: High (multiple services involved)
Duration: 4-5 days
Services Used:
├── Lambda (createOrder, validateInventory)
├── DynamoDB (Orders, Products, Inventory tables)
├── Step Functions (Order processing workflow)
├── API Gateway (POST /orders endpoint)
├── SNS (Order notifications)
└── EventBridge (Order events)

Learning Goals:
├── Multi-table DynamoDB operations
├── Error handling and rollback strategies
├── Async workflows with Step Functions
├── Event-driven architecture
└── Transaction management
```

**Day 1: Planning & Design**

```
Morning Session (2 hours)

1. Requirement Analysis (docs/features/create-order.md)
   
   User Story:
   "As a customer, I want to create an order with multiple products
   from different vendors, so that I can get my dairy products delivered."
   
   Acceptance Criteria:
   ├── User must be authenticated
   ├── User must have complete profile (delivery address)
   ├── Order must have at least 1 item
   ├── All products must be in stock
   ├── Order total must be ≥ minimum order value (₹100)
   ├── Delivery date must be: today+1 to today+7
   ├── System must reserve inventory immediately
   ├── User receives order confirmation
   └── Vendors receive order notifications

2. Data Model Design
   
   Orders Table Schema:
   {
     "orderId": "uuid",
     "userId": "uuid",
     "items": [
       {
         "productId": "uuid",
         "vendorId": "uuid",
         "productName": "string",
         "quantity": number,
         "unitPrice": number,
         "totalPrice": number
       }
     ],
     "subtotal": number,
     "tax": number,
     "deliveryCharge": number,
     "discount": number,
     "totalAmount": number,
     "status": "Pending|Confirmed|Processing|Delivered|Cancelled",
     "deliveryDate": "ISO date",
     "deliveryAddress": {
       "line1": "string",
       "city": "string",
       "zipCode": "string"
     },
     "createdAt": "ISO timestamp",
     "updatedAt": "ISO timestamp"
   }

3. API Contract Design
   
   Request:
   POST /orders
   Headers:
     Authorization: Bearer <JWT_TOKEN>
     Content-Type: application/json
   
   Body:
   {
     "items": [
       {
         "productId": "prod-123",
         "vendorId": "vendor-456",
         "quantity": 2
       },
       {
         "productId": "prod-789",
         "vendorId": "vendor-456",
         "quantity": 1
       }
     ],
     "deliveryDate": "2025-10-15",
     "addressId": "addr-001"
   }
   
   Success Response (201 Created):
   {
     "orderId": "order-abc123",
     "userId": "user-xyz",
     "items": [...],
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 30,
     "totalAmount": 502.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-15T08:00:00Z",
     "message": "Order created successfully"
   }
   
   Error Responses:
   400 Bad Request:
   {
     "error": "ValidationError",
     "message": "Delivery date must be between tomorrow and 7 days from now",
     "field": "deliveryDate"
   }
   
   400 Bad Request:
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 1L' has only 5 units available",
     "availableQuantity": 5,
     "requestedQuantity": 10
   }
   
   400 Bad Request:
   {
     "error": "MinimumOrderValue",
     "message": "Order total must be at least ₹100",
     "currentTotal": 75,
     "minimumRequired": 100
   }
   
   401 Unauthorized:
   {
     "error": "Unauthorized",
     "message": "Invalid or expired token"
   }
   
   404 Not Found:
   {
     "error": "UserNotFound",
     "message": "User profile not found"
   }
   
   409 Conflict:
   {
     "error": "ProfileIncomplete",
     "message": "Please complete your profile before placing an order",
     "missingFields": ["deliveryAddress", "phone"]
   }

4. Workflow Design (Step Functions State Machine)
   
   Order Processing Workflow:
   Start
   ├── ValidateInput (Lambda)
   │   ├── Success → ValidateUser
   │   └── Fail → Return 400 Error
   ├── ValidateUser (Lambda)
   │   ├── Success → CheckInventory
   │   └── Fail → Return 404/409 Error
   ├── CheckInventory (Lambda)
   │   ├── AllAvailable → ReserveInventory
   │   └── Insufficient → Return 400 Error
   ├── ReserveInventory (Lambda)
   │   ├── Success → CalculatePricing
   │   └── Fail → Rollback
   ├── CalculatePricing (Lambda)
   │   ├── Success → CreateOrderRecord
   │   └── Fail → ReleaseInventory → Error
   ├── CreateOrderRecord (Lambda)
   │   ├── Success → NotifyUser
   │   └── Fail → ReleaseInventory → Error
   ├── NotifyUser (SNS)
   │   └── Send confirmation email
   ├── NotifyVendors (SNS)
   │   └── Send order details to each vendor
   └── End (Success)

5. Error Handling Strategy
   
   Scenario 1: Inventory Check Fails
   ├── Don't create order
   ├── Return 400 with specific product details
   └── No rollback needed (no state changed)
   
   Scenario 2: Inventory Reserved, but DynamoDB Fails
   ├── Critical: Inventory locked but order not created
   ├── Solution: Use DynamoDB transaction
   │   └── Atomic operation: Reserve inventory + Create order
   └── If transaction fails, nothing is committed
   
   Scenario 3: Order Created, but Notification Fails
   ├── Order exists, but user not notified
   ├── Solution: Make notification async (Step Functions)
   ├── Retry notification 3 times
   └── Use DLQ (Dead Letter Queue) for failures
   
   Scenario 4: Partial Vendor Availability
   ├── Some items available, some not
   ├── Option A: Reject entire order
   ├── Option B: Partial fulfillment (advanced)
   └── For MVP: Choose Option A (simpler)

Afternoon Session (1.5 hours)

6. Create Project Structure (VS Code)
   backend/
   ├── src/
   │   ├── lambdas/
   │   │   └── order/
   │   │       ├── createOrder.ts
   │   │       ├── validateInventory.ts
   │   │       ├── reserveInventory.ts
   │   │       ├── calculatePricing.ts
   │   │       └── types.ts
   │   ├── stepFunctions/
   │   │   └── orderProcessing.asl.json
   │   └── shared/
   │       ├── constants.ts
   │       └── pricing.ts
   └── tests/
       └── order/
           ├── createOrder.test.ts
           └── validateInventory.test.ts

7. Define Types (VS Code)
   File: src/lambdas/order/types.ts
   
   export interface OrderItem {
     productId: string;
     vendorId: string;
     quantity: number;
     unitPrice?: number;  // Calculated
     totalPrice?: number; // Calculated
   }
   
   export interface CreateOrderRequest {
     items: OrderItem[];
     deliveryDate: string;
     addressId: string;
   }
   
   export interface CreateOrderResponse {
     orderId: string;
     userId: string;
     items: OrderItem[];
     subtotal: number;
     tax: number;
     deliveryCharge: number;
     totalAmount: number;
     status: OrderStatus;
     estimatedDelivery: string;
     message: string;
   }
   
   export type OrderStatus = 
     | 'Pending'
     | 'Confirmed'
     | 'Processing'
     | 'OutForDelivery'
     | 'Delivered'
     | 'Cancelled'
     | 'Failed';
   
   export interface ValidationError {
     field: string;
     message: string;
     code: string;
   }

8. Create Test Events (VS Code)
   File: events/create-order-valid.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2},{\"productId\":\"prod-yogurt-200g\",\"vendorId\":\"vendor-001\",\"quantity\":3}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}",
     "headers": {
       "Authorization": "Bearer eyJhbGc...",
       "Content-Type": "application/json"
     },
     "requestContext": {
       "authorizer": {
         "claims": {
           "sub": "user-123"
         }
       }
     }
   }
   
   File: events/create-order-invalid-date.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2}],\"deliveryDate\":\"2025-10-01\",\"addressId\":\"addr-home\"}"
   }
   
   File: events/create-order-insufficient-stock.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":1000}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}"
   }

Learning Outcome:
├── Complete understanding of requirements
├── API contract defined
├── Error scenarios identified
├── Project structure ready
└── Ready to code
```

**Day 2: Core Implementation**

```
Morning Session (2.5 hours)

1. Implement Validation Logic
   File: src/lambdas/order/createOrder.ts
   
   Function: validateInput()
   ├── Check items array not empty
   ├── Check each item has required fields
   ├── Check quantities are positive integers
   ├── Check deliveryDate format (ISO 8601)
   ├── Check deliveryDate is in valid range
   └── Return ValidationError[] if any issues
   
   Function: validateUser()
   ├── Extract userId from JWT (event.requestContext.authorizer.claims.sub)
   ├── Query Users table
   ├── Check user exists
   ├── Check profile is complete
   │   ├── Has delivery address matching addressId
   │   ├── Has phone number
   │   └── Has email
   └── Return user object or error
   
   Function: validateDeliveryDate()
   ├── Parse date string
   ├── Check format is valid
   ├── Check date is not in past
   ├── Check date is not today (need 1 day preparation)
   ├── Check date is within 7 days
   └── Return boolean + error message

2. Implement Inventory Validation
   File: src/lambdas/order/validateInventory.ts
   
   Function: checkInventory()
   Input:
   {
     "items": [
       {"productId": "prod-1", "vendorId": "vendor-1", "quantity": 2}
     ]
   }
   
   Process:
   ├── Group items by vendorId
   ├── For each vendor:
   │   ├── BatchGetItem from Inventory table
   │   │   └── Keys: [{vendorId, productId}, ...]
   │   ├── For each product:
   │   │   ├── Get available = stock - reserved
   │   │   ├── Check available >= requested quantity
   │   │   └── If not: add to unavailableItems[]
   │   └── Continue
   └── Return {valid: boolean, unavailableItems: []}
   
   Output (Success):
   {
     "valid": true,
     "unavailableItems": []
   }
   
   Output (Failure):
   {
     "valid": false,
     "unavailableItems": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "requestedQty": 10,
         "availableQty": 5
       }
     ]
   }

3. Implement Pricing Calculation
   File: src/shared/pricing.ts
   
   Function: calculateOrderTotal()
   Input:
   {
     "items": [
       {
         "productId": "prod-1",
         "quantity": 2,
         "unitPrice": 50
       }
     ],
     "deliveryAddress": {
       "city": "Vadodara",
       "zipCode": "390001"
     }
   }
   
   Calculation Logic:
   ├── subtotal = sum(item.unitPrice * item.quantity)
   ├── tax = subtotal * TAX_RATE (5% GST)
   ├── deliveryCharge = calculateDeliveryCharge()
   │   ├── If subtotal >= 500: ₹0 (free delivery)
   │   ├── Else if subtotal >= 300: ₹20
   │   ├── Else: ₹40
   │   └── Add ₹10 per additional vendor (multi-vendor orders)
   ├── discount = calculateDiscount()
   │   ├── If first order: 10% off (max ₹50)
   │   ├── If loyalty points: redeem at 1 point = ₹1
   │   └── else: 0
   └── totalAmount = subtotal + tax + deliveryCharge - discount
   
   Output:
   {
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 20,
     "discount": 0,
     "totalAmount": 492.5,
     "breakdown": {
       "itemsTotal": 450,
       "taxBreakdown": {
         "cgst": 11.25,
         "sgst": 11.25
       },
       "deliveryDetails": {
         "baseCharge": 20,
         "multiVendorSurcharge": 0
       }
     }
   }

Afternoon Session (1.5 hours)

4. Implement Main Handler
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent)
   
   Flow:
   Step 1: Parse input
   ├── const body = JSON.parse(event.body || '{}');
   ├── const userId = event.requestContext.authorizer.claims.sub;
   └── Log input for debugging
   
   Step 2: Validate input
   ├── const validationErrors = validateInput(body);
   ├── if (validationErrors.length > 0):
   │   └── return 400 with errors
   └── Continue
   
   Step 3: Validate user
   ├── const user = await validateUser(userId);
   ├── if (!user):
   │   └── return 404 User Not Found
   ├── if (!user.isProfileComplete):
   │   └── return 409 Profile Incomplete
   └── Continue
   
   Step 4: Get delivery address
   ├── const address = user.addresses.find(a => a.addressId === body.addressId);
   ├── if (!address):
   │   └── return 404 Address Not Found
   └── Continue
   
   Step 5: Fetch product details
   ├── const productIds = body.items.map(i => i.productId);
   ├── const products = await batchGetProducts(productIds);
   ├── Merge product prices into items
   └── Calculate item totals
   
   Step 6: Check inventory
   ├── const inventoryCheck = await checkInventory(body.items);
   ├── if (!inventoryCheck.valid):
   │   └── return 400 Insufficient Stock with details
   └── Continue
   
   Step 7: Calculate pricing
   ├── const pricing = calculateOrderTotal(items, address, user);
   ├── if (pricing.totalAmount < MINIMUM_ORDER_VALUE):
   │   └── return 400 Minimum Order Value Not Met
   └── Continue
   
   Step 8: Create order record
   ├── const orderId = generateOrderId(); // uuid()
   ├── const order = {
   │     orderId,
   │     userId,
   │     items,
   │     ...pricing,
   │     status: 'Pending',
   │     deliveryDate: body.deliveryDate,
   │     deliveryAddress: address,
   │     createdAt: new Date().toISOString()
   │   };
   ├── await dynamodb.putItem(ORDERS_TABLE, order);
   └── Continue
   
   Step 9: Start Step Functions workflow
   ├── const executionArn = await stepFunctions.startExecution({
   │     stateMachineArn: ORDER_PROCESSING_STATE_MACHINE,
   │     input: JSON.stringify({ orderId, items })
   │   });
   └── Log execution ARN
   
   Step 10: Return response
   └── return {
         statusCode: 201,
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*'
         },
         body: JSON.stringify({
           orderId,
           userId,
           items,
           ...pricing,
           status: 'Pending',
           estimatedDelivery: calculateEstimatedDelivery(body.deliveryDate),
           message: 'Order created successfully. You will receive confirmation shortly.'
         })
       };

5. Error Handling Patterns
   
   Pattern 1: Validation Errors (400)
   try {
     const errors = validateInput(body);
     if (errors.length > 0) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'ValidationError',
           message: 'Invalid input data',
           errors: errors
         })
       };
     }
   } catch (error) {
     // Continue to Pattern 2
   }
   
   Pattern 2: Resource Not Found (404)
   const user = await getUser(userId);
   if (!user) {
     return {
       statusCode: 404,
       body: JSON.stringify({
         error: 'UserNotFound',
         message: `User with ID ${userId} not found`
       })
     };
   }
   
   Pattern 3: Business Logic Errors (400/409)
   if (pricing.totalAmount < MINIMUM_ORDER_VALUE) {
     return {
       statusCode: 400,
       body: JSON.stringify({
         error: 'MinimumOrderValue',
         message: `Order total must be at least ₹${MINIMUM_ORDER_VALUE}`,
         currentTotal: pricing.totalAmount,
         minimumRequired: MINIMUM_ORDER_VALUE
       })
     };
   }
   
   Pattern 4: Service Errors (500)
   try {
     await dynamodb.putItem(ORDERS_TABLE, order);
   } catch (error) {
     console.error('DynamoDB error:', error);
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: 'InternalServerError',
         message: 'Failed to create order. Please try again.',
         requestId: context.requestId
       })
     };
   }
   
   Pattern 5: Timeout Handling
   // Set timeout slightly less than Lambda timeout
   const timeoutMs = 9000; // Lambda timeout is 10s
   const timeoutPromise = new Promise((_, reject) => 
     setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
   );
   
   try {
     await Promise.race([
       createOrder(body),
       timeoutPromise
     ]);
   } catch (error) {
     if (error.message === 'Operation timeout') {
       return {
         statusCode: 504,
         body: JSON.stringify({
           error: 'GatewayTimeout',
           message: 'Request took too long. Please try again.'
         })
       };
     }
   }

Learning Outcome:
├── Complete Lambda implementation
├── Error handling patterns mastered
├── Ready for testing
└── Understanding of edge cases
```

**Day 3: Testing & Step Functions**

```
Morning Session (2 hours)

1. Unit Testing (VS Code)
   File: tests/unit/createOrder.test.ts
   
   Test Suite: Input Validation
   ├── Test: Should accept valid input
   ├── Test: Should reject empty items array
   ├── Test: Should reject negative quantities
   ├── Test: Should reject invalid date format
   ├── Test: Should reject past delivery dates
   └── Test: Should reject dates beyond 7 days
   
   Test Suite: User Validation
   ├── Test: Should accept valid user with complete profile
   ├── Test: Should reject non-existent user
   ├── Test: Should reject user with incomplete profile
   └── Test: Should reject invalid address ID
   
   Test Suite: Inventory Validation
   ├── Test: Should pass when all items in stock
   ├── Test: Should fail when any item out of stock
   ├── Test: Should handle partial stock correctly
   └── Test: Should handle multiple vendors
   
   Test Suite: Pricing Calculation
   ├── Test: Should calculate subtotal correctly
   ├── Test: Should apply 5% GST
   ├── Test: Should apply free delivery for orders > ₹500
   ├── Test: Should charge ₹40 for orders < ₹300
   ├── Test: Should apply first order discount
   └── Test: Should calculate multi-vendor surcharge
   
   Run Tests:
   $ npm test
   
   Expected Output:
   PASS  tests/unit/createOrder.test.ts
     Input Validation
       ✓ Should accept valid input (5ms)
       ✓ Should reject empty items array (3ms)
       ✓ Should reject negative quantities (2ms)
       ✓ Should reject invalid date format (3ms)
       ✓ Should reject past delivery dates (2ms)
       ✓ Should reject dates beyond 7 days (2ms)
     
     Test Suites: 4 passed, 4 total
     Tests:       24 passed, 24 total
     Time:        2.341s

2. Local Testing with SAM (VS Code Terminal)
   
   Build project:
   $ cd backend
   $ npm run build
   $ sam build
   
   Output:
   Building codeuri: dist/ runtime: nodejs20.x architecture: x86_64
   Running NodejsNpmBuilder:NpmPack
   Build Succeeded
   
   Test with valid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-valid.json \
     --env-vars env.json
   
   Expected Output:
   Invoking lambdas/order/createOrder.handler
   START RequestId: abc-123 Version: $LATEST
   [INFO] Order creation started for user: user-123
   [INFO] Inventory validation passed
   [INFO] Order created: order-xyz-789
   END RequestId: abc-123
   REPORT RequestId: abc-123 Duration: 1243.56 ms Memory: 512 MB
   
   {"statusCode":201,"body":"{\"orderId\":\"order-xyz-789\",...}"}
   
   Test with invalid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-invalid-date.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"ValidationError\",...}"}
   
   Test with insufficient stock:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-insufficient-stock.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"InsufficientStock\",...}"}

3. Create Step Functions State Machine
   File: stepFunctions/orderProcessing.asl.json
   
   {
     "Comment": "Order Processing Workflow",
     "StartAt": "ReserveInventory",
     "States": {
       "ReserveInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:reserveInventoryFunction",
         "InputPath": "$",
         "ResultPath": "$.reservationResult",
         "Next": "CheckReservation",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "ReservationFailed"
           }
         ]
       },
       
       "CheckReservation": {
         "Type": "Choice",
         "Choices": [
           {
             "Variable": "$.reservationResult.success",
             "BooleanEquals": true,
             "Next": "NotifyVendors"
           }
         ],
         "Default": "ReservationFailed"
       },
       
       "NotifyVendors": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:notifyVendorsFunction",
         "InputPath": "$",
         "ResultPath": "$.notificationResult",
         "Next": "UpdateOrderStatus",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "NotificationFailed"
           }
         ]
       },
       
       "UpdateOrderStatus": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:updateOrderStatusFunction",
         "InputPath": "$",
         "Parameters": {
           "orderId.$": "$.orderId",
           "status": "Confirmed"
         },
         "ResultPath": "$.updateResult",
         "Next": "NotifyCustomer"
       },
       
       "NotifyCustomer": {
         "Type": "Task",
         "Resource": "arn:aws:states:::sns:publish",
         "Parameters": {
           "TopicArn": "arn:aws:sns:region:account:order-notifications",
           "Message.$": "$.orderId",
           "Subject": "Order Confirmed"
         },
         "Next": "OrderProcessingComplete"
       },
       
       "OrderProcessingComplete": {
         "Type": "Succeed"
       },
       
       "ReservationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Inventory reservation failed"
         },
         "Next": "OrderFailed"
       },
       
       "NotificationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Vendor notification failed"
         },
         "Next": "ReleaseInventory"
       },
       
       "ReleaseInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:releaseInventoryFunction",
         "InputPath": "$",
         "Next": "OrderFailed"
       },
       
       "OrderFailed": {
         "Type": "Fail",
         "Error": "OrderProcessingFailed",
         "Cause": "Order processing workflow failed"
       }
     }
   }

Afternoon Session (1.5 hours)

4. Add Step Functions to SAM Template
   File: template.yaml
   
   Resources:
     OrderProcessingStateMachine:
       Type: AWS::Serverless::StateMachine
       Properties:
         Name: OrderProcessingWorkflow
         DefinitionUri: stepFunctions/orderProcessing.asl.json
         DefinitionSubstitutions:
           ReserveInventoryFunctionArn: !GetAtt ReserveInventoryFunction.Arn
           NotifyVendorsFunctionArn: !GetAtt NotifyVendorsFunction.Arn
           UpdateOrderStatusFunctionArn: !GetAtt UpdateOrderStatusFunction.Arn
           HandleOrderFailureFunctionArn: !GetAtt HandleOrderFailureFunction.Arn
           ReleaseInventoryFunctionArn: !GetAtt ReleaseInventoryFunction.Arn
           OrderNotificationsTopic: !Ref OrderNotificationsTopic
         Policies:
           - LambdaInvokePolicy:
               FunctionName: !Ref ReserveInventoryFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref NotifyVendorsFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref UpdateOrderStatusFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref HandleOrderFailureFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref ReleaseInventoryFunction
           - SNSPublishMessagePolicy:
               TopicName: !GetAtt OrderNotificationsTopic.TopicName
         Logging:
           Level: ALL
           IncludeExecutionData: true
           Destinations:
             - CloudWatchLogsLogGroup:
                 LogGroupArn: !GetAtt OrderProcessingLogGroup.Arn
     
     OrderNotificationsTopic:
       Type: AWS::SNS::Topic
       Properties:
         TopicName: order-notifications
         DisplayName: Order Notifications
         Subscription:
           - Endpoint: your-email@example.com
             Protocol: email
     
     OrderProcessingLogGroup:
       Type: AWS::Logs::LogGroup
       Properties:
         LogGroupName: /aws/vendedlogs/states/OrderProcessing
         RetentionInDays: 7

5. Deploy Complete Stack
   $ sam build
   $ sam deploy --guided
   
   Deployment Output:
   CloudFormation stack changeset
   ---------------------------------
   Operation                 LogicalResourceId         ResourceType
   ---------------------------------
   + Add                     CreateOrderFunction       AWS::Lambda::Function
   + Add                     ReserveInventoryFunc      AWS::Lambda::Function
   + Add                     NotifyVendorsFunction     AWS::Lambda::Function
   + Add                     OrderProcessingState      AWS::StepFunctions::StateMachine
   + Add                     OrdersTable               AWS::DynamoDB::Table
   + Add                     OrderNotificationsTopic   AWS::SNS::Topic
   ---------------------------------
   
   Deploy this changeset? [y/N]: y
   
   Deployment progress:
   CREATE_IN_PROGRESS  OrdersTable
   CREATE_IN_PROGRESS  CreateOrderFunction
   CREATE_COMPLETE     OrdersTable
   CREATE_COMPLETE     CreateOrderFunction
   ...
   CREATE_COMPLETE     OrderProcessingStateMachine
   
   Successfully created/updated stack - milk-delivery-dev

6. Test Deployed Stack (AWS Console)
   
   Console → Step Functions → State machines → OrderProcessingWorkflow
   ├── Click "Start execution"
   ├── Input JSON:
   │   {
   │     "orderId": "test-order-001",
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ]
   │   }
   ├── Click "Start execution"
   └── Watch execution graph
   
   Visual Execution:
   ReserveInventory (Running) ⏳
   ├── Lambda invoked
   └── Waiting for response...
   
   ReserveInventory (Succeeded) ✅
   ├── Duration: 1.2s
   └── Output: {"success": true, "reservationId": "res-123"}
   
   NotifyVendors (Running) ⏳
   ├── Lambda invoked
   └── Sending emails...
   
   NotifyVendors (Succeeded) ✅
   ├── Duration: 0.8s
   └── Output: {"notified": ["vendor-001"]}
   
   UpdateOrderStatus (Running) ⏳
   UpdateOrderStatus (Succeeded) ✅
   
   NotifyCustomer (Running) ⏳
   NotifyCustomer (Succeeded) ✅
   
   OrderProcessingComplete ✅
   Total Duration: 4.5s
   
   Check CloudWatch Logs:
   ├── Console → CloudWatch → Log groups
   ├── /aws/vendedlogs/states/OrderProcessing
   └── View execution logs

Learning Outcome:
├── Step Functions workflow working
├── Async processing implemented
├── Error handling and retries configured
├── Complete order flow functional
└── Ready for API Gateway integration
```

**Day 4: API Gateway Integration**

```
Morning Session (2 hours)

1. Add API Gateway to SAM Template
   File: template.yaml
   
   Resources:
     MilkDeliveryApi:
       Type: AWS::Serverless::Api
       Properties:
         Name: MilkDeliveryAPI
         StageName: dev
         Cors:
           AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
           AllowHeaders: "'Content-Type,Authorization'"
           AllowOrigin: "'*'"
         Auth:
           DefaultAuthorizer: CognitoAuthorizer
           Authorizers:
             CognitoAuthorizer:
               UserPoolArn: !GetAtt UserPool.Arn
         GatewayResponses:
           UNAUTHORIZED:
             StatusCode: 401
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
           BAD_REQUEST_BODY:
             StatusCode: 400
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
         DefinitionBody:
           openapi: 3.0.1
           info:
             title: Milk Delivery API
             version: 1.0.0
           paths:
             /orders:
               post:
                 summary: Create a new order
                 requestBody:
                   required: true
                   content:
                     application/json:
                       schema:
                         type: object
                         required:
                           - items
                           - deliveryDate
                           - addressId
                         properties:
                           items:
                             type: array
                             minItems: 1
                             maxItems: 50
                           deliveryDate:
                             type: string
                             format: date
                           addressId:
                             type: string
                 responses:
                   '201':
                     description: Order created successfully
                   '400':
                     description: Invalid input
                   '401':
                     description: Unauthorized
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${CreateOrderFunction.Arn}/invocations'
               get:
                 summary: List user orders
                 responses:
                   '200':
                     description: List of orders
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ListOrdersFunction.Arn}/invocations'
             
             /orders/{orderId}:
               get:
                 summary: Get order details
                 parameters:
                   - name: orderId
                     in: path
                     required: true
                     schema:
                       type: string
                 responses:
                   '200':
                     description: Order details
                   '404':
                     description: Order not found
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetOrderFunction.Arn}/invocations'
     
     CreateOrderFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/order/createOrder.handler
         Events:
           CreateOrder:
             Type: Api
             Properties:
               RestApiId: !Ref MilkDeliveryApi
               Path: /orders
               Method: POST
               Auth:
                 Authorizer: CognitoAuthorizer

2. Configure Request Validation
   File: template.yaml (add to API definition)
   
   RequestValidator:
     Type: AWS::ApiGateway::RequestValidator
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ValidateRequestBody: true
       ValidateRequestParameters: true
   
   Request Models:
   CreateOrderModel:
     Type: AWS::ApiGateway::Model
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ContentType: application/json
       Schema:
         type: object
         required:
           - items
           - deliveryDate
           - addressId
         properties:
           items:
             type: array
             minItems: 1
             items:
               type: object
               required:
                 - productId
                 - vendorId
                 - quantity
               properties:
                 productId:
                   type: string
                   pattern: '^prod-[a-zA-Z0-9-]+
                 vendorId:
                   type: string
                   pattern: '^vendor-[a-zA-Z0-9-]+
                 quantity:
                   type: integer
                   minimum: 1
                   maximum: 100
           deliveryDate:
             type: string
             format: date
           addressId:
             type: string

3. Deploy and Test API
   $ sam build
   $ sam deploy
   
   Output:
   Outputs:
   ├── MilkDeliveryApiUrl: https://abc123.execute-api.us-east-1.amazonaws.com/dev
   ├── CreateOrderFunctionArn: arn:aws:lambda:us-east-1:123456789:function:createOrder
   └── OrderProcessingStateMachine: arn:aws:states:us-east-1:123456789:stateMachine:OrderProcessing

Afternoon Session (1.5 hours)

4. Test API with Thunder Client (VS Code)
   
   Install Thunder Client extension
   ├── Extensions → Search "Thunder Client"
   ├── Install
   └── Restart VS Code
   
   Create Request Collection:
   Thunder Client → Collections → New Collection
   ├── Name: Milk Delivery API - Dev
   └── Create
   
   Request 1: Create Order (Success Case)
   ├── Method: POST
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders
   ├── Headers:
   │   ├── Content-Type: application/json
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   ├── Body (JSON):
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       },
   │       {
   │         "productId": "prod-yogurt-200g",
   │         "vendorId": "vendor-001",
   │         "quantity": 3
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (201 Created):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "quantity": 2,
         "unitPrice": 50,
         "totalPrice": 100
       },
       {
         "productId": "prod-yogurt-200g",
         "vendorId": "vendor-001",
         "productName": "Greek Yogurt 200g",
         "quantity": 3,
         "unitPrice": 30,
         "totalPrice": 90
       }
     ],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "discount": 0,
     "totalAmount": 239.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-12T08:00:00Z",
     "message": "Order created successfully. You will receive confirmation shortly."
   }
   
   Request 2: Create Order (Validation Error)
   ├── Body:
   │   {
   │     "items": [],  ← Empty array
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid input data",
     "errors": [
       {
         "field": "items",
         "message": "Items array cannot be empty",
         "code": "EMPTY_ITEMS"
       }
     ]
   }
   
   Request 3: Create Order (Insufficient Stock)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 1000  ← Too many
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 500ml' has only 50 units available",
     "productId": "prod-milk-500ml",
     "availableQuantity": 50,
     "requestedQuantity": 1000
   }
   
   Request 4: Create Order (Invalid Date)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ],
   │     "deliveryDate": "2025-10-01",  ← Past date
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid delivery date",
     "errors": [
       {
         "field": "deliveryDate",
         "message": "Delivery date cannot be in the past",
         "code": "INVALID_DATE"
       }
     ]
   }
   
   Request 5: Get Order Details
   ├── Method: GET
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders/order-abc-123-xyz
   ├── Headers:
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   └── Send
   
   Expected Response (200 OK):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [...],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "totalAmount": 239.5,
     "status": "Confirmed",
     "deliveryDate": "2025-10-12",
     "deliveryAddress": {
       "line1": "123 Main Street",
       "city": "Vadodara",
       "state": "Gujarat",
       "zipCode": "390001"
     },
     "createdAt": "2025-10-09T10:30:00Z",
     "updatedAt": "2025-10-09T10:30:15Z"
   }

5. Verify in AWS Console
   
   Console → API Gateway → MilkDeliveryAPI
   ├── Stages → dev
   ├── Invoke URL: Copy URL
   ├── Resources → /orders → POST
   ├── Test → Click "TEST" button
   ├── Request Body: Paste test JSON
   ├── Execute
   └── View Response
   
   Console → Lambda → CreateOrderFunction
   ├── Monitor tab
   ├── View logs → CloudWatch Logs
   ├── See execution logs
   └── Check for errors
   
   Console → DynamoDB → milk-delivery-orders
   ├── Items tab
   ├── See newly created order
   └── Verify all fields
   
   Console → Step Functions → OrderProcessingWorkflow
   ├── Executions tab
   ├── See execution for your order
   ├── Click execution ID
   └── View execution graph

Learning Outcome:
├── API Gateway fully integrated
├── End-to-end flow working
├── Multiple test scenarios validated
├── Ready for frontend integration
└── Understanding of full serverless stack
```

**Day 5: Edge Cases & Error Handling**

```
Morning Session (2 hours)

1. Edge Case Testing Matrix
   
   Test Case 1: Concurrent Orders (Race Condition)
   Scenario: Two users order the last item simultaneously
   
   Setup:
   ├── Set product stock to 1 unit
   ├── User A submits order for 1 unit
   ├── User B submits order for 1 unit (within milliseconds)
   └── Expected: Only one order succeeds
   
   Implementation Solution:
   ├── Use DynamoDB Conditional Expressions
   ├── UpdateItem with condition: stock > 0
   ├── If condition fails: Return insufficient stock
   └── Atomic operation prevents over-selling
   
   Code Pattern:
   await dynamodb.update({
     TableName: INVENTORY_TABLE,
     Key: { vendorId, productId },
     UpdateExpression: 'SET stock = stock - :qty, reserved = reserved + :qty',
     ConditionExpression: 'stock >= :qty',
     ExpressionAttributeValues: {
       ':qty': quantity
     }
   });
   // If condition fails, AWS throws ConditionalCheckFailedException
   
   Test Case 2: Multi-Vendor Order with Partial Failure
   Scenario: Order has items from 3 vendors, one vendor out of stock
   
   Expected Behavior:
   ├── Option A (Simple): Reject entire order
   ├── Option B (Advanced): Partial fulfillment
   └── For MVP: Choose Option A
   
   Implementation:
   ├── Validate all inventory BEFORE creating order
   ├── If any item fails: Return 400 with details
   ├── No partial orders
   └── Clear error message to user
   
   Test Case 3: Payment Gateway Timeout
   Scenario: Stripe API takes > 10 seconds to respond
   
   Implementation:
   ├── Set order status: "PaymentPending"
   ├── Use Stripe webhooks for async confirmation
   ├── Don't wait for payment in createOrder Lambda
   ├── Separate Lambda handles payment webhooks
   └── Update order status when webhook received
   
   Flow:
   createOrder → Return "PaymentPending"
       ↓
   User redirected to Stripe
       ↓
   Stripe processes payment
       ↓
   Stripe sends webhook → paymentWebhookHandler
       ↓
   Update order status → "Paid"
       ↓
   Trigger Step Functions workflow
   
   Test Case 4: Database Write Failure After Inventory Reserved
   Scenario: Inventory reserved, but DynamoDB fails to create order
   
   Problem:
   ├── Inventory locked
   ├── Order not created
   └── User sees error, but stock is reduced
   
   Solution: Use DynamoDB Transactions
   const params = {
     TransactItems: [
       {
         Update: {
           TableName: INVENTORY_TABLE,
           Key: { vendorId, productId },
           UpdateExpression: 'SET reserved = reserved + :qty',
           ConditionExpression: 'stock >= reserved + :qty',
           ExpressionAttributeValues: { ':qty': quantity }
         }
       },
       {
         Put: {
           TableName: ORDERS_TABLE,
           Item: orderObject,
           ConditionExpression: 'attribute_not_exists(orderId)'
         }
       }
     ]
   };
   await dynamodb.transactWrite(
              quantity:
                type: integer
                minimum: 1
                maximum: 100
        deliveryDate:
          type: string
          format: date  # YYYY-MM-DD
        addressId:
          type: string
          minLength: 1

paths:
  /orders:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateOrderModel'
      x-amazon-apigateway-request-validator: request-validator
```

**Benefits:**
```
├── Validation happens at API Gateway (before Lambda)
├── Reduces Lambda invocations (cost savings)
├── Faster error responses
├── Consistent error messages
└── Less code in Lambda function
```

### 8.5 API Gateway Stages & Deployment

**Stages Concept:**
```
API Lifecycle:
├── dev → Development/testing
├── staging → Pre-production testing
├── prod → Production

Each stage has:
├── Unique invoke URL
├── Separate configuration
├── Different variables
└── Independent logs
```

**SAM Multi-Stage Setup:**
```yaml
# template.yaml
Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues:
      - dev
      - staging
      - prod

Globals:
  Function:
    Environment:
      Variables:
        STAGE: !Ref Environment
        ORDERS_TABLE: !Sub '${Environment}-orders'
        LOG_LEVEL: !If [IsProd, 'ERROR', 'INFO']

Conditions:
  IsProd: !Equals [!Ref Environment, 'prod']

Resources:
  MilkDeliveryApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: !Ref Environment
      Variables:
        Environment: !Ref Environment

# Deploy to different stages
$ sam deploy --parameter-overrides Environment=dev
$ sam deploy --parameter-overrides Environment=staging
$ sam deploy --parameter-overrides Environment=prod
```

**Stage Variables Usage:**
```
Example: Different Lambda aliases per stage

API Gateway Stage Variable:
lambdaAlias = dev | staging | prod

Lambda Integration:
URI: arn:aws:lambda:region:account:function:createOrder:${stageVariables.lambdaAlias}

Benefits:
├── Same API configuration
├── Different Lambda versions
├── Easy rollback (change stage variable)
└── Blue-green deployments
```

### 8.6 API Gateway Monitoring

**CloudWatch Metrics:**
```
Key Metrics:
├── Count: Total requests
├── IntegrationLatency: Lambda execution time
├── Latency: Total request time (including API Gateway overhead)
├── 4XXError: Client errors
├── 5XXError: Server errors
└── CacheHitCount: Cache performance (if caching enabled)

Latency Breakdown:
Total Latency = API Gateway Overhead + Integration Latency
Example: 250ms = 50ms (API GW) + 200ms (Lambda)

Optimization Target:
├── Integration Latency < 1000ms (Lambda optimization)
├── API Gateway Overhead < 100ms (normal)
└── Total Latency < 1100ms
```

**Enable Logging:**
```yaml
MilkDeliveryApi:
  Type: AWS::Serverless::Api
  Properties:
    AccessLogSetting:
      DestinationArn: !GetAtt ApiGatewayLogGroup.Arn
      Format: '$context.requestId $context.error.message $context.error.messageString $context.integrationErrorMessage'
    MethodSettings:
      - ResourcePath: '/*'
        HttpMethod: '*'
        LoggingLevel: INFO
        DataTraceEnabled: true
        MetricsEnabled: true

ApiGatewayLogGroup:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: !Sub '/aws/apigateway/${AWS::StackName}'
    RetentionInDays: 7  # Save costs
```

**Log Analysis:**
```
CloudWatch Logs Insights Query:

Query 1: Slowest endpoints
fields @timestamp, @message
| filter @message like /Latency/
| parse @message /Latency: (?<latency>\d+)/
| stats avg(latency) as avg_latency, max(latency) as max_latency by method, path
| sort avg_latency desc

Query 2: Error rate
fields @timestamp
| filter status >= 400
| stats count() as error_count by status, path
| sort error_count desc

Query 3: Request volume by hour
fields @timestamp
| stats count() as request_count by bin(1h)
```

---

## 9. AUTHENTICATION & AUTHORIZATION

### 9.1 Amazon Cognito Setup

**Cognito User Pool (Step-by-Step):**
```
AWS Console → Cognito → Create User Pool

Step 1: Authentication Providers
├── Provider: Cognito User Pool
├── Sign-in options: ✅ Email, ✅ Phone number
└── Username requirements: Case sensitive

Step 2: Security Requirements
├── Password policy:
│   ├── Minimum length: 8
│   ├── ✅ Require numbers
│   ├── ✅ Require special characters
│   ├── ✅ Require uppercase letters
│   └── ✅ Require lowercase letters
├── MFA: Optional (recommended for production)
└── User account recovery: Email only (free)

Step 3: Sign-up Experience
├── Self-registration: ✅ Enabled
├── Required attributes:
│   ├── ✅ email (required)
│   ├── ✅ name
│   └── ✅ phone_number
├── Email verification: ✅ Required
└── Verification code: Send by email

Step 4: Message Delivery
├── Email provider: ✅ Send email with Cognito
│   └── Free tier: 50 emails/day
├── From email: no-reply@verificationemail.com
└── SMS: Don't configure (costs money)

Step 5: App Integration
├── User pool name: milk-delivery-users
├── App client name: milk-delivery-web
├── Generate client secret: ❌ No (for public clients)
├── Authentication flows:
│   ├── ✅ ALLOW_USER_SRP_AUTH
│   ├── ✅ ALLOW_REFRESH_TOKEN_AUTH
│   └── ✅ ALLOW_USER_PASSWORD_AUTH
└── Token expiration:
    ├── Access token: 1 hour
    ├── ID token: 1 hour
    └── Refresh token: 30 days

Step 6: Review and Create
└── Click "Create user pool"

Result:
├── User Pool ID: us-east-1_aBcDeFgHi
├── App Client ID: 1a2b3c4d5e6f7g8h9i0j
└── User Pool ARN: arn:aws:cognito-idp:us-east-1:123456789:userpool/us-east-1_aBcDeFgHi
```

**SAM Template for Cognito:**
```yaml
UserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    UserPoolName: milk-delivery-users
    AutoVerifiedAttributes:
      - email
    UsernameAttributes:
      - email
    Schema:
      - Name: email
        Required: true
        Mutable: false
      - Name: name
        Required: true
        Mutable: true
      - Name: phone_number
        Required: false
        Mutable: true
    Policies:
      PasswordPolicy:
        MinimumLength: 8
        RequireUppercase: true
        RequireLowercase: true
        RequireNumbers: true
        RequireSymbols: true
    AccountRecoverySetting:
      RecoveryMechanisms:
        - Name: verified_email
          Priority: 1

UserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    UserPoolId: !Ref UserPool
    ClientName: milk-delivery-web
    GenerateSecret: false
    ExplicitAuthFlows:
      - ALLOW_USER_SRP_AUTH
      - ALLOW_REFRESH_TOKEN_AUTH
      - ALLOW_USER_PASSWORD_AUTH
    TokenValidityUnits:
      AccessToken: hours
      IdToken: hours
      RefreshToken: days
    AccessTokenValidity: 1
    IdTokenValidity: 1
    RefreshTokenValidity: 30

Outputs:
  UserPoolId:
    Value: !Ref UserPool
  UserPoolClientId:
    Value: !Ref UserPoolClient
  UserPoolArn:
    Value: !GetAtt UserPool.Arn
```

### 9.2 JWT Token Structure

**Understanding JWT:**
```
JWT Structure: header.payload.signature

Example Token:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidXNlckBleGFtcGxlLmNvbSIsImlhdCI6MTYzMzA0ODgwMCwiZXhwIjoxNjMzMDUyNDAwfQ.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c

Decoded:

Header:   await dynamodb.transactWrite(params);
   // Either both succeed or both fail (atomicity)
   
   Test Case 5: User Cancels Order During Processing
   Scenario: Order created, Step Functions running, user clicks "Cancel"
   
   Implementation:
   ├── Check current order status
   ├── If status = "Pending": Allow cancellation
   ├── If status = "Processing": Check Step Functions execution
   ├── Stop execution: stepFunctions.stopExecution()
   ├── Release inventory
   └── Update order status: "Cancelled"
   
   Test Case 6: Invalid JWT Token
   Scenario: User sends expired or tampered token
   
   API Gateway Authorizer handles:
   ├── Validates JWT signature
   ├── Checks expiration
   ├── Verifies issuer (Cognito User Pool)
   └── Returns 401 Unauthorized if invalid
   
   Lambda never receives request with invalid token
   
   Test Case 7: DynamoDB Throttling
   Scenario: Free tier limits exceeded (25 WCU/RCU)
   
   Symptoms:
   ├── ProvisionedThroughputExceededException
   ├── Lambda returns 500 error
   └── Operations fail
   
   Solution:
   ├── Use exponential backoff (built into AWS SDK)
   ├── Implement retry logic in Lambda
   ├── Monitor CloudWatch metrics
   └── Consider on-demand billing (scales automatically)
   
   Implementation:
   const dynamodbWithRetry = DynamoDBDocumentClient.from(client, {
     retryMode: 'adaptive',
     maxAttempts: 3
   });
   
   Test Case 8: Large Order (100+ items)
   Scenario: User tries to order 100 different products
   
   Considerations:
   ├── Lambda execution time: May exceed 10s timeout
   ├── DynamoDB batch size: Max 25 items per BatchGetItem
   ├── API Gateway payload: Max 10 MB
   └── Step Functions payload: Max 256 KB
   
   Solutions:
   ├── Set maximum items per order: 50
   ├── Validate in API Gateway request validator
   ├── Batch DynamoDB operations properly
   └── Use S3 for large payloads if needed (advanced)

Afternoon Session (1.5 hours)

2. Implement Idempotency
   
   Problem: User clicks "Place Order" twice
   ├── Network delay, no response
   ├── User clicks again
   └── Two orders created for same cart
   
   Solution: Idempotency Keys
   
   Request Header:
   Idempotency-Key: <unique-client-generated-uuid>
   
   Implementation:
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent) => {
     const idempotencyKey = event.headers['idempotency-key'] || 
                            event.headers['Idempotency-Key'];
     
     if (!idempotencyKey) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'MissingIdempotencyKey',
           message: 'Idempotency-Key header is required'
         })
       };
     }
     
     // Check if order with this key already exists
     const existingOrder = await dynamodb.query({
       TableName: ORDERS_TABLE,
       IndexName: 'idempotency-key-index',
       KeyConditionExpression: 'idempotencyKey = :key',
       ExpressionAttributeValues: {
         ':key': idempotencyKey
       }
     });
     
     if (existingOrder.Items && existingOrder.Items.length > 0) {
       // Order already created, return existing order
       return {
         statusCode: 200,
         body: JSON.stringify(existingOrder.Items[0])
       };
     }
     
     // Create new order with idempotency key
     const order = {
       ...orderData,
       idempotencyKey
     };
     
     await dynamodb.put({
       TableName: ORDERS_TABLE,
       Item: order,
       ConditionExpression: 'attribute_not_exists(idempotencyKey)'
     });
     
     return {
       statusCode: 201,
       body: JSON.stringify(order)
     };
   };
   
   DynamoDB Table Update (template.yaml):
   OrdersTable:
     GlobalSecondaryIndexes:
       - IndexName: idempotency-key-index
         KeySchema:
           - AttributeName: idempotencyKey
             KeyType: HASH
         Projection:
           ProjectionType: ALL

3. Implement Circuit Breaker Pattern
   
   Problem: Downstream service (payment gateway) is down
   ├── Every request times out
   ├── Lambda execution time wasted
   ├── Poor user experience
   └── Increased costs
   
   Solution: Circuit Breaker
   
   States:
   ├── CLOSED: Normal operation, requests pass through
   ├── OPEN: Too many failures, reject requests immediately
   └── HALF_OPEN: Test if service recovered
   
   Implementation:
   File: src/shared/circuitBreaker.ts
   
   class CircuitBreaker {
     private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
     private failureCount = 0;
     private failureThreshold = 5;
     private timeout = 60000; // 1 minute
     private lastFailureTime?: number;
     
     async execute<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'OPEN') {
         if (Date.now() - this.lastFailureTime! > this.timeout) {
           this.state = 'HALF_OPEN';
         } else {
           throw new Error('Circuit breaker is OPEN');
         }
       }
       
       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
     
     private onSuccess() {
       this.failureCount = 0;
       this.state = 'CLOSED';
     }
     
     private onFailure() {
       this.failureCount++;
       this.lastFailureTime = Date.now();
       
       if (this.failureCount >= this.failureThreshold) {
         this.state = 'OPEN';
       }
     }
   }
   
   Usage:
   const paymentCircuitBreaker = new CircuitBreaker();
   
   try {
     const paymentResult = await paymentCircuitBreaker.execute(async () => {
       return await stripeClient.charges.create({...});
     });
   } catch (error) {
     if (error.message === 'Circuit breaker is OPEN') {
       return {
         statusCode: 503,
         body: JSON.stringify({
           error: 'ServiceUnavailable',
           message: 'Payment service is temporarily unavailable. Please try again later.'
         })
       };
     }
   }

4. Comprehensive Error Response Structure
   
   Standardized Error Format:
   {
     "error": {
       "code": "ERROR_CODE",
       "message": "Human-readable message",
       "details": {
         "field": "specificField",
         "reason": "Detailed reason"
       },
       "requestId": "req-abc-123",
       "timestamp": "2025-10-09T10:30:00Z",
       "retryable": boolean,
       "documentation": "https://docs.milkdelivery.com/errors/ERROR_CODE"
     }
   }
   
   Error Codes Catalog:
   ├── VALIDATION_ERROR (400)
   ├── UNAUTHORIZED (401)
   ├── FORBIDDEN (403)
   ├── RESOURCE_NOT_FOUND (404)
   ├── CONFLICT (409)
   ├── RATE_LIMIT_EXCEEDED (429)
   ├── INTERNAL_SERVER_ERROR (500)
   ├── SERVICE_UNAVAILABLE (503)
   └── GATEWAY_TIMEOUT (504)
   
   Implementation:
   File: src/shared/errors.ts
   
   export class AppError extends Error {
     constructor(
       public code: string,
       public message: string,
       public statusCode: number,
       public details?: any,
       public retryable: boolean = false
     ) {
       super(message);
       this.name = 'AppError';
     }
     
     toJSON() {
       return {
         error: {
           code: this.code,
           message: this.message,
           details: this.details,
           requestId: 'Set by Lambda context',
           timestamp: new Date().toISOString(),
           retryable: this.retryable,
           documentation: `https://docs.milkdelivery.com/errors/${this.code}`
         }
       };
     }
   }
   
   export class ValidationError extends AppError {
     constructor(message: string, field?: string) {
       super('VALIDATION_ERROR', message, 400, { field });
     }
   }
   
   export class InsufficientStockError extends AppError {
     constructor(productId: string, available: number, requested: number) {
       super(
         'INSUFFICIENT_STOCK',
         `Product has only ${available} units available`,
         400,
         { productId, available, requested }
       );
     }
   }
   
   Usage in Lambda:
   try {
     // ... validation logic
     if (stock < requestedQty) {
       throw new InsufficientStockError(productId, stock, requestedQty);
     }
   } catch (error) {
     if (error instanceof AppError) {
       return {
         statusCode: error.statusCode,
         body: JSON.stringify(error.toJSON())
       };
     }
     
     // Unknown error
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: {
           code: 'INTERNAL_SERVER_ERROR',
           message: 'An unexpected error occurred',
           requestId: context.requestId,
           timestamp: new Date().toISOString()
         }
       })
     };
   }

5. Logging Best Practices
   
   Structured Logging Format:
   {
     "timestamp": "2025-10-09T10:30:00.123Z",
     "level": "INFO|WARN|ERROR",
     "requestId": "req-abc-123",
     "userId": "user-456",
     "action": "CREATE_ORDER",
     "message": "Order created successfully",
     "context": {
       "orderId": "order-xyz-789",
       "totalAmount": 239.5,
       "itemCount": 2
     },
     "duration": 1234,
     "memoryUsed": 128
   }
   
   Implementation:
   File: src/shared/logger.ts
   
   export class Logger {
     private context: Record<string, any> = {};
     
     setContext(key: string, value: any) {
       this.context[key] = value;
     }
     
     info(message: string, data?: Record<string, any>) {
       this.log('INFO', message, data);
     }
     
     warn(message: string, data?: Record<string, any>) {
       this.log('WARN', message, data);
     }
     
     error(message: string, error?: Error, data?: Record<string, any>) {
       this.log('ERROR', message, {
         ...data,
         error: error?.message,
         stack: error?.stack
       });
     }
     
     private log(level: string, message: string, data?: Record<string, any>) {
       const logEntry = {
         timestamp: new Date().toISOString(),
         level,
         message,
         ...this.context,
         ...data
       };
       
       console.log(JSON.stringify(logEntry));
     }
   }
   
   Usage in Lambda:
   export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
     const logger = new Logger();
     logger.setContext('requestId', context.requestId);
     logger.setContext('functionName', context.functionName);
     
     const startTime = Date.now();
     
     try {
       logger.info('Order creation started', {
         userId: extractUserId(event)
       });
       
       const order = await createOrder(body);
       
       logger.info('Order created successfully', {
         orderId: order.orderId,
         totalAmount: order.totalAmount,
         duration: Date.now() - startTime
       });
       
       return successResponse(order);
     } catch (error) {
       logger.error('Order creation failed', error as Error, {
         userId: extractUserId(event),
         duration: Date.now() - startTime
       });
       
       return errorResponse(error);
     }
   };

Learning Outcome:
├── Edge cases identified and handled
├── Idempotency implemented
├── Circuit breaker pattern understood
├── Error handling standardized
├── Logging best practices applied
└── Production-ready code quality
```

---

## 6. LAMBDA FUNCTIONS: DEEP DIVE

### 6.1 Lambda Execution Model

**Cold Start vs Warm Start:**
```
Cold Start (First Invocation or After Idle):
├── AWS provisions execution environment
├── Downloads function code from S3
├── Initializes runtime (Node.js)
├── Executes initialization code (outside handler)
├── Executes handler function
└── Duration: 1-3 seconds (varies)

Warm Start (Subsequent Invocations):
├── Reuses existing execution environment
├── Skips initialization
├── Executes handler function only
└── Duration: 10-100 milliseconds

Optimization Strategy:
├── Initialize clients outside handler
├── Reuse database connections
├── Cache static data
└── Keep functions "warm" (CloudWatch Events ping)
```

**Example: Optimized Lambda Structure**
```typescript
// ✅ GOOD: Initialize outside handler
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Cache configuration (loaded once)
const config = {
  ordersTable: process.env.ORDERS_TABLE,
  minOrderValue: 100,
  taxRate: 0.05
};

export const handler = async (event, context) => {
  // Handler executes quickly, reusing connections
  const result = await docClient.get({
    TableName: config.ordersTable,
    Key: { orderId: event.pathParameters.orderId }
  });
  
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};

// ❌ BAD: Initialize inside handler
export const handler = async (event, context) => {
  const client = new DynamoDBClient({});  // Created every time!
  const docClient = DynamoDBDocumentClient.from(client);
  
  const result = await docClient.get({...});
  return { statusCode: 200, body: JSON.stringify(result.Item) };
};
```

### 6.2 Memory and Timeout Configuration

**Memory Size Impact:**
```
Memory Configuration Options: 128 MB to 10,240 MB (10 GB)

Cost Calculation:
├── Price: $0.0000166667 per GB-second
├── 128 MB = 0.125 GB
├── Example: 1 million requests, 1 second each
│   ├── 128 MB: 1M * 1s * 0.125 GB * $0.0000166667 = $2.08
│   ├── 256 MB: 1M * 1s * 0.25 GB * $0.0000166667 = $4.17
│   ├── 512 MB: 1M * 1s * 0.5 GB * $0.0000166667 = $8.33
│   └── 1024 MB: 1M * 1s * 1 GB * $0.0000166667 = $16.67

Important: CPU power scales with memory
├── 128 MB = Low CPU power (slow execution)
├── 1024 MB = Proportional CPU (4x faster)
└── Paradox: Higher memory can be cheaper (faster execution)

Example Scenario:
├── Function with 128 MB: 2 seconds execution
│   └── Cost: 2s * 0.125 GB * $0.0000166667 = $0.0000041667
├── Same function with 512 MB: 0.6 seconds execution
│   └── Cost: 0.6s * 0.5 GB * $0.0000166667 = $0.0000050000
└── Verdict: 128 MB is cheaper in this case

Optimization Process:
1. Start with 512 MB (good balance)
2. Monitor CloudWatch metrics:
   ├── Duration
   ├── Memory Used
   └── Throttles
3. Adjust based on actual usage:
   ├── If memory used < 50%: Reduce memory
   ├── If duration consistently high: Increase memory
   └── Run load tests to find optimal setting

Your Learning Project:
├── Simple queries (getUser): 256 MB, 5s timeout
├── Order creation: 512 MB, 10s timeout
├── Image processing: 1024 MB, 30s timeout
└── Batch operations: 1024 MB, 60s timeout
```

**Timeout Configuration:**
```
Default: 3 seconds
Maximum: 15 minutes (900 seconds)
Recommendation: Set slightly higher than expected duration

Examples:
├── Simple CRUD: 5-10 seconds
├── API calls to third-party: 15-30 seconds
├── Complex calculations: 30-60 seconds
└── Batch processing: 5-15 minutes

Warning: Long timeouts increase cost if function hangs
├── Always implement timeout handling in code
└── Don't rely solely on Lambda timeout
```

### 6.3 Environment Variables & Secrets

**Environment Variables (SAM Template):**
```yaml
CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Environment:
      Variables:
        ORDERS_TABLE: !Ref OrdersTable
        USERS_TABLE: !Ref UsersTable
        MIN_ORDER_VALUE: '100'
        TAX_RATE: '0.05'
        STAGE: dev
        LOG_LEVEL: INFO
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'  # Reuse HTTP connections
```

**Secrets Management:**
```
❌ NEVER store sensitive data in environment variables:
├── API keys
├── Database passwords
├── Private keys
└── OAuth tokens

✅ Use AWS Secrets Manager:

1. Store secret:
$ aws secretsmanager create-secret \
  --name milk-delivery/stripe-api-key \
  --secret-string '{"apiKey":"sk_test_..."}'

2. Grant Lambda permission (SAM template):
CreateOrderFunction:
  Policies:
    - AWSSecretsManagerGetSecretValuePolicy:
        SecretArn: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:milk-delivery/*'

3. Retrieve in Lambda:
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretName: string) {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return JSON.parse(response.SecretString!);
}

// Cache secret (avoid fetching on every invocation)
let stripeKey: string;

export const handler = async (event) => {
  if (!stripeKey) {
    const secret = await getSecret('milk-delivery/stripe-api-key');
    stripeKey = secret.apiKey;
  }
  
  // Use stripeKey
};

Cost: $0.40 per secret per month + $0.05 per 10,000 API calls
For learning: ~$0.40/month (1 secret, minimal calls)
```

### 6.4 Lambda Layers (Code Reuse)

**When to Use Layers:**
```
Use Cases:
├── Shared dependencies (AWS SDK, lodash, axios)
├── Common utilities (logger, validation, db helpers)
├── Large libraries (reduce deployment package size)
└── Code reuse across multiple functions

Benefits:
├── Faster deployments (layer unchanged, only function code updates)
├── Smaller deployment packages
├── Easier dependency management
└── Version control for shared code

Limitations:
├── Max 5 layers per function
├── Max 250 MB unzipped (all layers + function)
├── Layers are immutable (create new version to update)
```

**Creating a Lambda Layer:**
```
Directory Structure:
backend/
└── layers/
    └── common/
        ├── nodejs/
        │   ├── node_modules/  ← Dependencies
        │   └── utils/         ← Your utilities
        │       ├── logger.ts
        │       ├── db.ts
        │       └── validation.ts
        └── package.json

package.json:
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.400.0",
    "@aws-sdk/lib-dynamodb": "^3.400.0",
    "uuid": "^9.0.0"
  }
}

Build Layer:
$ cd layers/common/nodejs
$ npm install
$ cd ../..
$ zip -r common-layer.zip nodejs/

SAM Template:
CommonLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: milk-delivery-common
    Description: Shared utilities and dependencies
    ContentUri: layers/common/
    CompatibleRuntimes:
      - nodejs20.x
    RetentionPolicy: Retain

CreateOrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Layers:
      - !Ref CommonLayer
    CodeUri: dist/

Usage in Lambda:
// Import from layer
import { logger } from '/opt/nodejs/utils/logger';
import { v4 as uuidv4 } from 'uuid';  // From layer dependencies

export const handler = async (event) => {
  logger.info('Function started');
  const id = uuidv4();
  // ...
};
```

### 6.5 Lambda Monitoring Metrics

**Key CloudWatch Metrics:**
```
1. Invocations
   ├── Count: Total number of invocations
   ├── Use: Track function usage
   └── Free Tier: 1M invocations/month

2. Duration
   ├── Measure: Execution time in milliseconds
   ├── Use: Identify slow functions
   └── Optimization target: Keep under 1 second

3. Errors
   ├── Count: Failed invocations
   ├── Types: Function errors, timeout errors
   └── Goal: < 1% error rate

4. Throttles
   ├── Count: Rejected due to concurrency limits
   ├── Causes: Too many concurrent executions
   └── Solution: Increase reserved concurrency or optimize

5. Memory Usage
   ├── Measure: Actual memory used
   ├── Use: Right-size memory configuration
   └── Example: If using 150 MB of 512 MB, reduce to 256 MB

6. Concurrent Executions
   ├── Measure: Number of instances running simultaneously
   ├── Default limit: 1000 per region
   └── Free tier limit: Usually sufficient for learning

CloudWatch Logs Insights Queries:

Query 1: Average duration by function
fields @timestamp, @duration
| stats avg(@duration) as avg_duration by @function
| sort avg_duration desc

Query 2: Error count
filter @type = "ERROR"
| stats count() as error_count by bin(5m)

Query 3: Memory usage
fields @timestamp, @memorySize / 1000 / 1000 as mem_mb, @maxMemoryUsed / 1000 / 1000 as used_mb
| stats avg(used_mb) as avg_used, max(used_mb) as max_used

Query 4: Cold starts
filter @type = "REPORT"
| fields @duration, @initDuration
| filter ispresent(@initDuration)
| stats count() as cold_starts, avg(@initDuration) as avg_cold_start_ms
```

### 6.6 Lambda Cost Optimization

**Free Tier Maximization:**
```
Lambda Free Tier (Always Free):
├── 1M requests per month
├── 400,000 GB-seconds compute time per month

Calculation Examples:

Scenario 1: 128 MB function, 200ms execution
├── Compute: 0.2s * 0.125 GB = 0.025 GB-seconds per request
├── Free tier allows: 400,000 / 0.025 = 16M requests
├── But request limit is 1M, so effective limit: 1M requests
└── Verdict: Request limit is constraint, not compute

Scenario 2: 1024 MB function, 1s execution
├── Compute: 1s * 1 GB = 1 GB-second per request
├── Free tier allows: 400,000 / 1 = 400,000 requests
├── But request limit is 1M
└── Verdict: Compute is constraint, only 400K requests free

Your Learning Project Estimate:
├── Average: 512 MB, 500ms execution
├── Compute per request: 0.5s * 0.5 GB = 0.25 GB-seconds
├── Free tier allows: 400,000 / 0.25 = 1.6M requests
├── Your usage: ~10,000 requests/month during development
└── Cost: $0 (well within free tier)

Cost After Free Tier:
├── Requests: $0.20 per 1M requests
├── Compute: $0.0000166667 per GB-second
└── Your 10K requests: ~$0.02/month

Optimization Tips:
1. Reduce memory if not fully utilized
2. Optimize code for faster execution
3. Use layers for shared dependencies
4. Implement caching where possible
5. Batch operations when feasible
6. Monitor and eliminate unnecessary invocations
```

---

## 7. DYNAMODB: QUERY PATTERNS & OPTIMIZATION

### 7.1 Key Concepts

**Partition Key (PK) vs Sort Key (SK):**
```
Partition Key (Required):
├── Determines which partition data is stored in
├── Must be unique for each item (if no sort key)
├── Used for direct lookups: GetItem, PutItem
└── Example: userId, orderId, productId

Sort Key (Optional):
├── Allows multiple items with same partition key
├── Items sorted by sort key value
├── Enables range queries
└── Example: timestamp, status, category

Table Design Pattern 1: Simple (PK only)
Users Table:
PK: userId
├── user-001
├── user-002
└── user-003

Query: Get user by ID
const result = await docClient.get({
  TableName: 'Users',
  Key: { userId: 'user-001' }
});

Table Design Pattern 2: Composite Key (PK + SK)
Orders Table:
PK: userId, SK: orderId
├── user-001, order-2025-001
├── user-001, order-2025-002
├── user-002, order-2025-003
└── user-002, order-2025-004

Query: Get all orders for a user
const result = await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-001'
  }
});

Result: Returns order-2025-001 and order-2025-002
```

**Global Secondary Index (GSI):**
```
Purpose: Query table using different keys

Example Problem:
Users Table: PK = userId
├── You can query by userId
└── But you cannot query by email

Solution: Create GSI on email

GSI: email-index
PK: email
├── Allows query by email
└── Returns userId

Query: Find user by email
const result = await docClient.query({
  TableName: 'Users',
  IndexName: 'email-index',
  KeyConditionExpression: 'email = :email',
  ExpressionAttributeValues: {
    ':email': 'user@example.com'
  }
});

GSI Considerations:
├── Cost: Consumes additional WCU/RCU
├── Eventual consistency: Slight delay (usually milliseconds)
├── Projection: Choose ALL, KEYS_ONLY, or INCLUDE
└── Free Tier: Included in 25 WCU/RCU limit

SAM Template:
UsersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    AttributeDefinitions:
      - AttributeName: userId
        AttributeType: S
      - AttributeName: email
        AttributeType: S
    KeySchema:
      - AttributeName: userId
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: email-index
        KeySchema:
          - AttributeName: email
            KeyType: HASH
        Projection:
          ProjectionType: ALL
    BillingMode: PAY_PER_REQUEST
```

### 7.2 Query vs Scan

**Query (Efficient):**
```
Characteristics:
├── Uses partition key (required)
├── Optionally uses sort key for range
├── Returns only matching items
├── Fast and cost-effective
└── Use whenever possible

Example: Get all orders for a user
await docClient.query({
  TableName: 'Orders',
  KeyConditionExpression: 'userId = :uid',
  ExpressionAttributeValues: {
    ':uid': 'user-123'
  }
});

Cost: 1 RCU per 4 KB read (eventually consistent)
Example: 10 orders, 1 KB each = 10 KB = 3 RCUs
```

**Scan (Inefficient):**
```
Characteristics:
├── Reads entire table
├── Filters after reading (wasteful)
├── Slow and expensive
├── Consumes RCUs for all items scanned
└── Avoid in production

Example: Find all orders with status="Pending" (BAD!)
await docClient.scan({
  TableName: 'Orders',
  FilterExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Problem:
├── Scans all 10,000 orders
├── Filters to 100 pending orders
├── Consumes RCUs for all 10,000 items
└── Returns only 100 items

Cost: If 10,000 items * 1 KB = 10,000 KB = 2,500 RCUs
(Way over free tier 25 RCU limit!)

Solution: Use GSI
Create GSI: status-index (PK: status, SK: createdAt)

Query with GSI:
await docClient.query({
  TableName: 'Orders',
  IndexName: 'status-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'Pending'
  }
});

Cost: Only reads 100 pending orders = 25 RCUs
Savings: 100x reduction!
```

### 7.3 Batch Operations

**BatchGetItem:**
```
Purpose: Retrieve multiple items in one request

Limitations:
├── Max 100 items per request
├── Max 16 MB total response# SOLO DEVELOPER GUIDE - AWS FREE TIER OPTIMIZED
## Milk & Milk Products Delivery Platform (Comprehensive Learning Project)

---

## TABLE OF CONTENTS
1. [Solo Developer Workflow & Mindset](#solo-developer-workflow-mindset)
2. [AWS Free Tier: Complete Strategy](#aws-free-tier-complete-strategy)
3. [Development Environment Setup](#development-environment-setup)
4. [Hybrid Development: Console + VS Code](#hybrid-development-console-vs-code)
5. [Feature Development Flow (Step-by-Step)](#feature-development-flow)
6. [Lambda Functions: Deep Dive](#lambda-functions-deep-dive)
7. [DynamoDB: Query Patterns & Optimization](#dynamodb-query-patterns-optimization)
8. [API Gateway: Configuration & Testing](#api-gateway-configuration-testing)
9. [Authentication & Authorization](#authentication-authorization)
10. [Error Handling & Edge Cases](#error-handling-edge-cases)
11. [Testing Strategies](#testing-strategies)
12. [Monitoring & Debugging](#monitoring-debugging)
13. [CI/CD Pipeline Setup](#cicd-pipeline-setup)
14. [Cost Optimization Techniques](#cost-optimization-techniques)
15. [Security Best Practices](#security-best-practices)
16. [Performance Optimization](#performance-optimization)
17. [Common Pitfalls & Solutions](#common-pitfalls-solutions)
18. [Learning Path & Milestones](#learning-path-milestones)

---

## 1. SOLO DEVELOPER WORKFLOW & MINDSET

### 1.1 Daily Development Routine

**Realistic Time Allocation (3-4 hours/day):**

```
Morning Session (1.5-2 hours)
├── 00:00-00:10 → Review AWS costs (console billing dashboard)
├── 00:10-00:20 → Check CloudWatch logs for overnight errors
├── 00:20-00:30 → Plan today's feature (write in docs/daily-log.md)
├── 00:30-01:45 → Development work (focus time, no distractions)
└── 01:45-02:00 → Commit code & push to GitHub

Evening Session (1.5-2 hours)
├── 00:00-01:00 → Continue feature development or bug fixes
├── 01:00-01:20 → Testing (local + deployed)
├── 01:20-01:40 → Documentation (update API docs, learning notes)
├── 01:40-01:50 → Deploy to AWS (if ready)
└── 01:50-02:00 → Plan tomorrow's task + update Kanban board
```

**Weekly Rhythm:**
```
Monday: Start new feature (backend)
Tuesday: Complete feature + unit tests
Wednesday: Integration + API Gateway setup
Thursday: Frontend integration
Friday: End-to-end testing + documentation
Saturday: Deployment + monitoring
Sunday: Review week, plan next week, learn new AWS concept
```

### 1.2 Solo Developer's Development Phases

**Phase 1: MVP Foundation (Week 1-3)**
```
Week 1: Infrastructure Setup
├── Day 1-2: AWS account setup, IAM users, billing alerts
├── Day 3-4: First Lambda function (Hello World → createUser)
├── Day 5-6: DynamoDB table creation + manual data entry
└── Day 7: First API endpoint working end-to-end

Week 2: User Management
├── Day 1-2: User registration with validation
├── Day 3-4: User login (Cognito integration)
├── Day 5-6: User profile management
└── Day 7: Testing + bug fixes

Week 3: Product Catalog
├── Day 1-3: Product listing + search
├── Day 4-5: Product details + images (S3)
├── Day 6: Vendor management basics
└── Day 7: Integration testing
```

**Phase 2: Core Business Logic (Week 4-8)**
```
Week 4: Order Creation Flow
├── Shopping cart logic (frontend state)
├── Order validation
├── Inventory checking
└── Order creation Lambda

Week 5: Payment Integration
├── Stripe/Razorpay SDK setup
├── Payment flow (test mode)
├── Payment webhooks
└── Order confirmation

Week 6: Step Functions
├── Order processing workflow
├── Inventory reservation
├── Vendor notifications
└── State machine testing

Week 7: Delivery Management
├── Delivery scheduling
├── Status updates
├── Notifications (SNS/SES)
└── Delivery tracking

Week 8: Integration & Bug Fixes
├── End-to-end testing
├── Edge case handling
├── Performance optimization
└── Documentation
```

**Phase 3: Frontend & Polish (Week 9-12)**
```
Week 9-10: React Frontend
├── Component development
├── State management (Redux/Zustand)
├── API integration
└── Responsive design

Week 11: Advanced Features
├── User dashboard
├── Order history
├── Admin panel basics
└── Analytics

Week 12: Deployment & Launch
├── Production deployment
├── Performance tuning
├── Security audit
└── Final testing
```

### 1.3 Task Management (Solo Approach)

**Simple Kanban Board (GitHub Projects or Trello):**
```
Backlog → Todo → In Progress → Testing → Done
```

**Sample Tasks Breakdown:**
```yaml
Epic: User Management
  Story: User Registration
    Task: Create DynamoDB Users table
    Task: Create createUser Lambda
    Task: Add validation logic
    Task: Set up API Gateway endpoint
    Task: Write unit tests
    Task: Test in console
    Task: Deploy with SAM
    Task: Integration test
    
  Story: User Login
    Task: Configure Cognito User Pool
    Task: Create login API
    Task: JWT token validation
    Task: Test authentication flow
```

### 1.4 Learning Mindset

**Document Everything:**
```
docs/
├── daily-log.md           # What you learned today
├── mistakes.md            # Errors and how you fixed them
├── aws-concepts.md        # AWS services explained in your words
├── design-decisions.md    # Why you chose X over Y
└── helpful-resources.md   # Useful articles, videos, docs
```

**Sample daily-log.md entry:**
```markdown
# Day 15 - October 10, 2025

## What I Built Today
- Completed createOrder Lambda function
- Added inventory validation
- Set up Step Functions for order processing

## What I Learned
- DynamoDB transactions prevent race conditions
- Lambda cold starts can be 1-2 seconds (need to optimize)
- Step Functions are billed per state transition ($0.025/1000)

## Problems I Faced
- Issue: Lambda timeout after 3 seconds
- Solution: Increased timeout to 10s, optimized DynamoDB query
- Learning: Always use indexes for queries, not scans!

## Tomorrow's Plan
- Add payment integration (Stripe test mode)
- Write unit tests for createOrder
- Deploy to dev environment
```

---

## 2. AWS FREE TIER: COMPLETE STRATEGY

### 2.1 Detailed Free Tier Limits

**Always Free (No Time Limit):**
```yaml
Lambda:
  Requests: 1,000,000 per month
  Compute: 400,000 GB-seconds per month
  Example: 
    - 1M invocations with 128MB = ~51 hours compute
    - Roughly 3,200 requests/day with 128MB, 1s execution
  Your Usage: Likely 100-500 requests/day during development
  Status: ✅ Safe

DynamoDB:
  Storage: 25 GB
  WCU: 25 (write capacity units)
  RCU: 25 (read capacity units)
  Example:
    - 25 WCU = 25 writes/sec or 2.1M writes/day
    - 25 RCU = 100 eventual reads/sec or 8.6M reads/day
  Your Usage: Maybe 50-100 operations/day in development
  Status: ✅ Very safe
  
  Important: Use on-demand billing mode
    - No upfront capacity planning
    - Pay only for actual reads/writes
    - First 25 WCU/RCU free, then $1.25/$0.25 per million

S3:
  Storage: 5 GB Standard storage
  GET: 20,000 requests
  PUT: 2,000 requests
  Data Transfer: 100 GB out per month (first 12 months)
  Your Usage: 10-50 MB for product images in development
  Status: ✅ Safe

CloudWatch:
  Logs: 5 GB ingestion, 5 GB storage
  Metrics: 10 custom metrics
  Alarms: 10 alarms
  Dashboard: 3 dashboards
  Your Usage: 100-500 MB logs/month during development
  Status: ✅ Safe

SNS:
  Email: 1,000 notifications/month (12 months free)
  SMS: 100 notifications/month (12 months free)
  HTTP: 100,000 notifications/month (12 months free)
  After 12 months: $0.50 per million emails
  Your Usage: 10-50 emails/month for testing
  Status: ⚠️ Be careful with SMS after year 1

SES (Simple Email Service):
  Emails: 62,000 per month (always free if sent from EC2)
  From Lambda: 3,000 per month free (12 months)
  After: $0.10 per 1,000 emails
  Your Usage: 10-100 emails/month
  Status: ✅ Safe, better than SNS for emails

Cognito:
  MAU: 50,000 monthly active users (always free)
  Your Usage: 1-10 test users
  Status: ✅ Very safe
```

**12 Months Free (After Sign-up):**
```yaml
API Gateway:
  REST API: 1,000,000 requests per month
  After: $3.50 per million requests
  Your Usage: 100-1,000 requests/day = 3,000-30,000/month
  Status: ✅ Safe during free tier
  Strategy: After 1 year, consider Lambda Function URLs (free)

CloudFront:
  Data Transfer: 1 TB out
  Requests: 10,000,000 HTTP/HTTPS
  After: $0.085 per GB + $0.0075 per 10,000 requests
  Your Usage: Don't use during development
  Status: ⚠️ Use only for production launch
```

**Services to AVOID (Cost Traps):**
```yaml
❌ NAT Gateway:
  Cost: $0.045/hour = $32.40/month + data transfer
  Why avoid: Expensive for learning
  Alternative: Lambda functions don't need NAT (direct internet)

❌ Application Load Balancer:
  Cost: $0.0225/hour = $16.20/month + LCU charges
  Why avoid: Unnecessary for serverless
  Alternative: API Gateway (free tier) or Lambda Function URLs

❌ RDS:
  Free tier: 750 hours/month for 12 months (db.t2.micro)
  After: Minimum $15-20/month
  Why avoid: Not needed, use DynamoDB
  Alternative: DynamoDB (always free up to limits)

❌ ECS/EKS:
  ECS: $0.10/hour per running task
  EKS: $0.10/hour for control plane = $73/month
  Why avoid: Overkill for learning serverless
  Alternative: Lambda functions

❌ ElastiCache:
  Free tier: None
  Cost: Minimum $13/month
  Why avoid: Not needed for MVP
  Alternative: In-memory caching in Lambda

❌ Elasticsearch:
  Free tier: None
  Cost: Minimum $23/month
  Why avoid: Expensive
  Alternative: DynamoDB queries + GSIs
```

### 2.2 Cost Monitoring Setup (Critical!)

**Step 1: Set Up Billing Alerts (Day 1 Task)**
```
AWS Console → Billing Dashboard → Billing Preferences
├── ✅ Receive PDF Invoice By Email
├── ✅ Receive Free Tier Usage Alerts (your email)
├── ✅ Receive Billing Alerts
└── Save preferences

AWS Console → CloudWatch → Alarms → Billing
├── Create Alarm: Estimated Charges > $5
├── Create Alarm: Estimated Charges > $10
├── Create Alarm: Estimated Charges > $20
└── SNS Topic: Email notification to yourself
```

**Step 2: Daily Cost Check Routine**
```
Every Morning (5 minutes):
├── AWS Console → Billing Dashboard
├── Check "Month-to-Date Spend"
├── Review "Free Tier Usage" (shows % consumed)
└── If over $5: Investigate "Cost Explorer"

Expected Daily Costs During Development:
├── Days 1-30: $0.00 - $0.50/day (within free tier)
├── Days 31-60: $0.50 - $1.00/day (learning curve)
├── Days 61-90: $0.20 - $0.50/day (optimized)
└── Goal: Stay under $10/month
```

**Step 3: AWS Cost Explorer Tags**
```
Tag all resources for tracking:
├── Environment: dev
├── Project: milk-delivery
├── Owner: your-name
└── Cost-Center: learning

Example in SAM template:
Tags:
  Environment: dev
  Project: milk-delivery
  Owner: solo-developer
```

### 2.3 Free Tier Budget Calculator

**Your Estimated Monthly Usage:**
```yaml
Service            | Free Tier    | Your Usage  | Cost Impact
-------------------|--------------|-------------|-------------
Lambda             | 1M requests  | 10,000      | $0.00
DynamoDB           | 25 WCU/RCU   | 1,000 ops   | $0.00
API Gateway        | 1M requests  | 10,000      | $0.00 (Year 1)
S3                 | 5 GB         | 100 MB      | $0.00
CloudWatch Logs    | 5 GB         | 500 MB      | $0.00
SES                | 62,000 emails| 50 emails   | $0.00
Cognito            | 50k MAU      | 5 users     | $0.00
Step Functions     | 4,000 states | 100 states  | $0.00
-------------------|--------------|-------------|-------------
TOTAL                                           | $0.00-$2.00

Potential Charges:
- API Gateway (after Year 1): ~$0.04/month
- Data Transfer Out: ~$0.50/month (minimal testing)
- CloudWatch (if over 5GB logs): ~$1.00/month

Expected Total: $0-5/month during development
```

---

## 3. DEVELOPMENT ENVIRONMENT SETUP

### 3.1 Machine Requirements

**Minimum Specifications:**
```yaml
Operating System: Windows 10/11, macOS, or Linux
Processor: Intel i3 or equivalent (dual-core)
RAM: 8 GB minimum, 16 GB recommended
Storage: 20 GB free space (for Node.js, Docker, projects)
Internet: Stable connection (AWS API calls)
```

**Recommended Setup:**
```yaml
OS: Windows 11 or macOS
RAM: 16 GB (Docker + VS Code + Browser = memory hungry)
Storage: SSD with 50 GB free (faster builds)
Internet: 10 Mbps+ (for video tutorials, AWS console)
```

### 3.2 Software Installation (Step-by-Step)

**Step 1: Install Node.js**
```
What: JavaScript runtime for Lambda development
Why: Lambda supports Node.js 20.x runtime
Where: https://nodejs.org/en/download

Installation:
├── Download Node.js 20.x LTS installer
├── Run installer (default options are fine)
├── Verify installation:
│   ├── Open terminal/command prompt
│   ├── Type: node --version (should show v20.x.x)
│   └── Type: npm --version (should show v10.x.x)
└── Done!

Post-Install Configuration:
├── Set npm global directory (avoid permission issues)
│   └── npm config set prefix ~/.npm-global (Mac/Linux)
│       or C:\Users\YourName\AppData\Roaming\npm (Windows)
└── Update npm: npm install -g npm@latest
```

**Step 2: Install AWS CLI**
```
What: Command-line tool to interact with AWS services
Why: Deploy resources, check logs, manage services
Where: https://aws.amazon.com/cli/

Windows:
├── Download MSI installer
├── Run installer
└── Verify: aws --version

macOS:
├── Option 1: Homebrew
│   └── brew install awscli
├── Option 2: Official installer
│   └── Download .pkg file
└── Verify: aws --version

Linux:
├── curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
├── unzip awscliv2.zip
├── sudo ./aws/install
└── Verify: aws --version

Configuration:
├── Run: aws configure
├── AWS Access Key ID: [Get from IAM console]
├── AWS Secret Access Key: [Get from IAM console]
├── Default region name: us-east-1
└── Default output format: json
```

**Step 3: Install AWS SAM CLI**
```
What: Framework for building serverless applications
Why: Local testing, easy deployment, IaC with templates
Where: https://aws.amazon.com/serverless/sam/

Windows:
├── Download MSI installer
├── Run installer (requires admin rights)
└── Verify: sam --version

macOS:
├── Homebrew: brew install aws-sam-cli
└── Verify: sam --version

Linux:
├── Download ZIP file
├── Unzip and install
└── Verify: sam --version

SAM Prerequisites:
├── Docker Desktop (for sam local commands)
│   └── Download from: https://www.docker.com/products/docker-desktop
└── Python 3.8+ (usually pre-installed on Mac/Linux)
```

**Step 4: Install Visual Studio Code**
```
What: Code editor with excellent AWS support
Why: Best IDE for serverless development
Where: https://code.visualstudio.com/

Installation:
├── Download installer for your OS
├── Run installer
├── Launch VS Code
└── Done!

Essential Extensions (Install via Extensions panel):
├── AWS Toolkit (amazonwebservices.aws-toolkit-vscode)
│   └── Integrates AWS services into VS Code
├── ESLint (dbaeumer.vscode-eslint)
│   └── JavaScript/TypeScript linting
├── Prettier (esbenp.prettier-vscode)
│   └── Code formatting
├── Thunder Client (rangav.vscode-thunder-client)
│   └── API testing (like Postman, but in VS Code)
├── GitLens (eamodio.gitlens)
│   └── Git history and blame annotations
├── Docker (ms-azuretools.vscode-docker)
│   └── Manage Docker containers
└── REST Client (humao.rest-client)
    └── Test HTTP requests from .http files
```

**Step 5: Install Git**
```
What: Version control system
Why: Code versioning, GitHub integration
Where: https://git-scm.com/downloads

Installation:
├── Download installer
├── Run with default options
└── Verify: git --version

Configuration:
├── git config --global user.name "Your Name"
├── git config --global user.email "your.email@example.com"
└── git config --global init.defaultBranch main
```

**Step 6: Optional but Recommended Tools**
```
Docker Desktop:
├── Required for: sam local invoke, sam local start-api
├── Download: https://www.docker.com/products/docker-desktop
└── Purpose: Run Lambda functions locally in containers

Postman (Alternative to Thunder Client):
├── Download: https://www.postman.com/downloads/
└── Purpose: API testing with collections

DynamoDB Local (Optional):
├── Download: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
└── Purpose: Test DynamoDB operations without AWS connection
```

### 3.3 AWS Account Setup

**Step 1: Create AWS Account**
```
Go to: https://aws.amazon.com/free

Sign Up Process:
├── 1. Email and password
├── 2. Account type: Personal
├── 3. Contact information
├── 4. Payment information (required, but won't charge if stay in free tier)
├── 5. Identity verification (phone call)
└── 6. Select Support Plan: Basic (Free)

⚠️ Important:
- Use a credit/debit card with at least $1 for verification
- Set up billing alerts immediately
- Enable MFA (Multi-Factor Authentication) for root account
```

**Step 2: Secure Root Account**
```
After Sign-up:
├── 1. Go to IAM → Dashboard
├── 2. Enable MFA for root account
│   ├── Use Google Authenticator, Authy, or hardware token
│   └── NEVER share MFA codes
├── 3. Create IAM user for daily use (don't use root)
└── 4. Delete root access keys if created
```

**Step 3: Create IAM User (For Development)**
```
IAM → Users → Add User

User Details:
├── Username: milk-delivery-dev
├── Access type: ✅ Programmatic access (for AWS CLI)
│              ✅ AWS Management Console access (for console)
└── Console password: Auto-generated or custom

Permissions:
├── Attach existing policies directly:
│   ├── ✅ AdministratorAccess (for learning only)
│   │   └── ⚠️ In production, use least-privilege policies
│   └── Or create custom policy (see below)
└── Tags:
    ├── Environment: dev
    └── Purpose: learning

Download Credentials:
├── Save Access Key ID
├── Save Secret Access Key
└── Store securely (password manager recommended)

Configure AWS CLI:
├── aws configure --profile milk-delivery-dev
├── Enter Access Key ID
├── Enter Secret Access Key
├── Region: us-east-1
└── Output: json
```

**Custom IAM Policy (Least Privilege for Learning):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "dynamodb:*",
        "apigateway:*",
        "s3:*",
        "cloudformation:*",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "logs:*",
        "events:*",
        "sns:*",
        "ses:*",
        "cognito-idp:*",
        "states:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3.4 VS Code Configuration

**Workspace Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true,
  "files.autoSave": "onFocusChange",
  "typescript.preferences.importModuleSpecifier": "relative",
  "aws.samcli.location": "/usr/local/bin/sam",
  "aws.profile": "milk-delivery-dev",
  "aws.region": "us-east-1",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

**Launch Configuration (.vscode/launch.json):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Lambda (SAM)",
      "type": "node",
      "request": "attach",
      "address": "localhost",
      "port": 5858,
      "localRoot": "${workspaceFolder}/backend/src",
      "remoteRoot": "/var/task",
      "protocol": "inspector",
      "stopOnEntry": false
    }
  ]
}
```

---

## 4. HYBRID DEVELOPMENT: CONSOLE + VS CODE

### 4.1 Philosophy: When to Use What

**AWS Console is BEST for:**
```
✅ Visual Learning & Exploration
   ├── Understanding service dashboards
   ├── Exploring service features and options
   ├── Reading integrated documentation
   └── Seeing visual representations (Step Functions graphs)

✅ One-Time Setup Tasks
   ├── Creating Cognito User Pool (complex configuration)
   ├── Setting up billing alerts
   ├── Creating IAM roles and policies (first time)
   ├── Configuring CloudWatch dashboards
   └── Setting up SNS/SES email verification

✅ Quick Testing & Debugging
   ├── Testing Lambda with sample events
   ├── Viewing DynamoDB table data
   ├── Checking CloudWatch logs in real-time
   ├── Testing API Gateway endpoints manually
   └── Viewing Step Functions execution history

✅ Monitoring & Operations
   ├── CloudWatch Logs Insights queries
   ├── Viewing metrics and graphs
   ├── Checking service quotas and limits
   ├── Cost analysis and billing reports
   └── Resource utilization dashboards
```

**VS Code is BEST for:**
```
✅ All Code Development
   ├── Writing Lambda functions
   ├── TypeScript/JavaScript development
   ├── Creating unit tests
   ├── Shared utilities and libraries
   └── Frontend React components

✅ Infrastructure as Code (IaC)
   ├── SAM templates (template.yaml)
   ├── CloudFormation templates
   ├── Environment configuration files
   └── Deployment scripts

✅ Version Control
   ├── Git commits and branching
   ├── Code reviews (self-review before commit)
   ├── Merge conflict resolution
   └── GitHub integration

✅ Local Development & Testing
   ├── sam local invoke (test Lambda locally)
   ├── sam local start-api (local API Gateway)
   ├── Unit tests with Jest
   ├── Integration tests
   └── Debugging with breakpoints

✅ Batch Operations
   ├── Creating multiple Lambda functions
   ├── Updating multiple files at once
   ├── Search and replace across project
   └── Refactoring code
```

### 4.2 Hybrid Workflow Patterns

**Pattern 1: Learning a New Service**
```
Example: Setting up DynamoDB for the first time

Step 1: AWS Console (30 minutes)
├── Navigate to DynamoDB service
├── Click "Create table"
├── Experiment with different settings:
│   ├── Partition key vs. Sort key
│   ├── Provisioned vs. On-demand
│   ├── Global Secondary Indexes (GSI)
│   └── Stream settings
├── Create a test table manually
├── Add sample items via console
├── Try different queries in console
└── Learn query vs. scan difference

Step 2: VS Code (30 minutes)
├── Create SAM template with DynamoDB resource
├── Define table schema in YAML
├── Add GSI definitions
├── Write Lambda function to interact with table
└── Test locally with DynamoDB Local or deployed table

Step 3: AWS Console (15 minutes)
├── Deploy via SAM from VS Code terminal
├── Verify table creation in console
├── Check table metrics
└── Validate data structure

Result: You understand DynamoDB AND have IaC code
```

**Pattern 2: Developing a New Lambda Function**
```
Example: Creating "createOrder" Lambda

Step 1: Console Prototype (15 minutes)
├── AWS Console → Lambda → Create function
├── Name: createOrderPrototype
├── Runtime: Node.js 20.x
├── Write basic handler code inline
├── Create test event with sample JSON:
│   {
│     "userId": "user-123",
│     "items": [{"productId": "prod-1", "quantity": 2}]
│   }
├── Test and see output
├── Fix any immediate errors
└── Verify basic logic works

Step 2: VS Code Development (2 hours)
├── Create file: backend/src/lambdas/order/createOrder.ts
├── Copy working logic from console
├── Add TypeScript types and interfaces
├── Implement proper error handling
├── Add input validation
├── Add logging
├── Add to SAM template
├── Write unit tests
└── Test locally: sam local invoke

Step 3: Console Debugging (20 minutes)
├── Deploy from VS Code: sam deploy
├── Go to AWS Console → Lambda → createOrder
├── Test with real event
├── Check CloudWatch logs
├── Identify any AWS-specific issues
└── Note execution time and memory usage

Step 4: VS Code Refinement (30 minutes)
├── Fix issues found in console testing
├── Optimize memory settings in SAM template
├── Adjust timeout if needed
├── Update documentation
└── Redeploy: sam deploy

Result: Production-ready Lambda with IaC
```

**Pattern 3: API Gateway Setup**
```
Example: Creating REST API with multiple endpoints

Step 1: Console Exploration (30 minutes)
├── AWS Console → API Gateway
├── Create REST API (not HTTP API)
├── Manually create one resource: /users
├── Add POST method
├── Link to Lambda function (console UI)
├── Configure CORS manually
├── Deploy to "dev" stage
├── Test with API Gateway test feature
└── Understand request/response transformation

Step 2: VS Code IaC (1 hour)
├── Add API Gateway to SAM template
├── Define all resources and methods in YAML
├── Configure Cognito authorizer
├── Set up request validators
├── Configure CORS in template
├── Add multiple endpoints
└── Deploy entire API: sam deploy

Step 3: Console Validation (15 minutes)
├── Check deployed API in console
├── Verify all endpoints exist
├── Test each endpoint
├── Check authorization works
└── Review API Gateway logs

Result: Complete API defined in code, easy to replicate
```

### 4.3 AWS Toolkit Extension (The Bridge)

**Installation & Setup:**
```
Step 1: Install Extension
├── Open VS Code
├── Go to Extensions (Ctrl+Shift+X)
├── Search: "AWS Toolkit"
├── Install "AWS Toolkit" by Amazon Web Services
└── Restart VS Code

Step 2: Connect to AWS
├── Click AWS icon in left sidebar
├── Click "Connect to AWS"
├── Select profile: milk-delivery-dev
└── Region: us-east-1

Step 3: Verify Connection
├── Expand "Lambda" in sidebar
├── You should see all deployed functions
├── Expand "DynamoDB"
├── You should see all tables
└── Success!
```

**Key Features You'll Use Daily:**

**1. Lambda Functions**
```
What you can do from VS Code:
├── View all deployed Lambda functions
├── Invoke function remotely (without console)
│   ├── Right-click function
│   ├── Select "Invoke on AWS"
│   ├── Choose test event
│   └── See results in VS Code
├── Download function code
│   ├── Right-click function
│   ├── Select "Download Lambda"
│   └── Code appears in VS Code
└── View CloudWatch logs
    ├── Right-click function
    ├── Select "View CloudWatch Logs"
    └── Logs stream in VS Code terminal

Example Workflow:
├── Deploy function from VS Code terminal: sam deploy
├── Test directly from VS Code using AWS Toolkit
├── View logs without switching to browser
└── Make changes and redeploy, all in one place
```

**2. DynamoDB Tables**
```
What you can do from VS Code:
├── Browse table data
│   ├── Expand DynamoDB in AWS Toolkit
│   ├── Right-click table
│   ├── Select "View Table"
│   └── See items in VS Code panel
├── Run queries
│   ├── Click "Query" button
│   ├── Enter partition key value
│   ├── Execute
│   └── Results appear in VS Code
├── Download items as JSON
│   ├── Right-click items
│   ├── Select "Download items"
│   └── Save to file
└── Insert test data
    ├── Right-click table
    ├── Select "Insert Item"
    └── Paste JSON

Example Workflow:
├── Check if user exists in database
├── Query directly from VS Code
├── No need to open AWS Console
└── Copy user data for test event
```

**3. CloudWatch Logs**
```
What you can do from VS Code:
├── View log groups
├── Stream logs in real-time
│   ├── Right-click Lambda function
│   ├── Select "View CloudWatch Logs"
│   ├── Logs appear in VS Code terminal
│   └── Auto-refreshes with new logs
├── Search logs
│   ├── Use Ctrl+F in log panel
│   └── Filter by text
└── Download logs for analysis

Example Workflow:
├── Deploy Lambda function
├── Invoke from VS Code
├── Instantly see logs in VS Code
├── Debug without opening console
└── Faster iteration cycle
```

**4. S3 Buckets**
```
What you can do from VS Code:
├── Browse bucket contents
├── Upload files
│   ├── Right-click bucket
│   ├── Select "Upload File"
│   └── Choose file from system
├── Download files
│   ├── Right-click file
│   ├── Select "Download"
│   └── Save to local folder
└── Delete files

Example Workflow:
├── Upload product images
├── Get S3 URL for DynamoDB
├── All without leaving VS Code
```

**5. Step Functions**
```
What you can do from VS Code:
├── View state machines
├── Start execution
│   ├── Right-click state machine
│   ├── Select "Start Execution"
│   ├── Provide input JSON
│   └── Execution starts
├── View execution history
└── Download execution results

Example Workflow:
├── Test order processing workflow
├── Start execution from VS Code
├── Check status in toolkit
├── View results inline
```

### 4.4 Detailed Workflow Examples

**Example 1: Building User Registration (Complete Flow)**

**Day 1 Morning: Console Exploration (1 hour)**
```
Task: Understand what you need to build

1. Research Phase (AWS Console)
   ├── Navigate to Cognito
   ├── Read "What is Amazon Cognito?"
   ├── Create a test User Pool
   │   ├── Pool name: milk-delivery-users-test
   │   ├── Standard attributes: email, name, phone
   │   ├── Password policy: default
   │   ├── MFA: Optional (for learning)
   │   └── Create pool
   ├── Create test user manually
   │   ├── Username: testuser@example.com
   │   ├── Temporary password: Test@1234
   │   └── Verify user can login
   └── Test user login in Cognito UI
   
2. DynamoDB Exploration (AWS Console)
   ├── Navigate to DynamoDB
   ├── Create table: Users
   │   ├── Partition key: userId (String)
   │   ├── Billing mode: On-demand
   │   └── Create table
   ├── Add sample user item manually:
   │   {
   │     "userId": "user-001",
   │     "email": "test@example.com",
   │     "name": "Test User",
   │     "phone": "+1234567890",
   │     "role": "Customer",
   │     "createdAt": "2025-10-09T10:00:00Z"
   │   }
   └── Verify item appears in table

3. Lambda Exploration (AWS Console)
   ├── Navigate to Lambda
   ├── Create function: createUserTest
   ├── Write minimal code inline:
   │   exports.handler = async (event) => {
   │     console.log('Received event:', event);
   │     return {
   │       statusCode: 200,
   │       body: JSON.stringify({ message: 'User created' })
   │     };
   │   };
   ├── Test with sample event:
   │   {
   │     "body": "{\"email\":\"new@example.com\",\"name\":\"New User\"}"
   │   }
   └── Verify it returns 200 OK

Learning Outcome:
├── Understand Cognito concepts
├── See DynamoDB table structure
├── Know Lambda basic structure
└── Ready to code properly in VS Code
```

**Day 1 Afternoon: VS Code Development (2-3 hours)**
```
Task: Build production-ready createUser Lambda

1. Project Setup (VS Code Terminal)
   $ cd ~/projects
   $ mkdir milk-delivery-platform
   $ cd milk-delivery-platform
   $ sam init
   ├── Choose: 1 - AWS Quick Start Templates
   ├── Choose: 1 - Hello World Example
   ├── Runtime: nodejs20.x
   ├── Name: milk-delivery
   └── Project created!

2. Project Structure Organization
   milk-delivery-platform/
   ├── backend/
   │   ├── src/
   │   │   ├── lambdas/
   │   │   │   └── user/
   │   │   │       ├── createUser.ts
   │   │   │       ├── getUser.ts
   │   │   │       └── types.ts
   │   │   └── shared/
   │   │       ├── db.ts
   │   │       ├── validation.ts
   │   │       └── logger.ts
   │   ├── template.yaml
   │   ├── package.json
   │   └── tsconfig.json
   └── docs/
       └── api/
           └── user-api.md

3. Install Dependencies
   $ cd backend
   $ npm init -y
   $ npm install --save @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   $ npm install --save-dev @types/node @types/aws-lambda typescript

4. Create TypeScript Configuration (tsconfig.json)
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "lib": ["ES2020"],
       "outDir": "./dist",
       "rootDir": "./src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }

5. Create Lambda Function (Skeleton)
   File: src/lambdas/user/createUser.ts
   
   // Define interfaces
   interface CreateUserRequest {
     email: string;
     name: string;
     phone: string;
     password: string;
   }
   
   interface CreateUserResponse {
     userId: string;
     email: string;
     message: string;
   }
   
   // TODO: Implement handler
   // TODO: Add validation
   // TODO: Add DynamoDB operations
   // TODO: Add error handling

6. Create SAM Template (template.yaml)
   AWSTemplateFormatVersion: '2010-09-09'
   Transform: AWS::Serverless-2016-10-31
   
   Globals:
     Function:
       Timeout: 10
       Runtime: nodejs20.x
       Environment:
         Variables:
           USERS_TABLE: !Ref UsersTable
   
   Resources:
     CreateUserFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/user/createUser.handler
         Policies:
           - DynamoDBCrudPolicy:
               TableName: !Ref UsersTable
     
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
           - IndexName: email-index
             KeySchema:
               - AttributeName: email
                 KeyType: HASH
             Projection:
               ProjectionType: ALL

7. Build & Test Locally
   $ npm run build
   $ sam build
   $ sam local invoke CreateUserFunction --event events/create-user.json
   
   events/create-user.json:
   {
     "body": "{\"email\":\"test@example.com\",\"name\":\"Test User\",\"phone\":\"+1234567890\",\"password\":\"Test@123\"}"
   }

Learning Outcome:
├── Project structure established
├── SAM template basics understood
├── Local testing working
└── Ready for implementation
```

**Day 2: Implementation & Deployment**
```
Task: Complete Lambda implementation and deploy

1. Implement Full Lambda Function (VS Code)
   File: src/lambdas/user/createUser.ts
   
   [Full TypeScript implementation with:]
   ├── Input validation (email format, password strength)
   ├── Check if email already exists (GSI query)
   ├── Generate userId (UUID)
   ├── Hash password (if not using Cognito)
   ├── Save to DynamoDB
   ├── Error handling (try-catch with proper status codes)
   └── Logging (console.log with context)

2. Create Shared Utilities (VS Code)
   File: src/shared/validation.ts
   ├── validateEmail(email: string): boolean
   ├── validatePhone(phone: string): boolean
   └── validatePassword(password: string): string | null
   
   File: src/shared/db.ts
   ├── DynamoDB client initialization
   ├── Helper functions for common operations
   └── Error handling wrappers

3. Write Unit Tests (VS Code)
   File: tests/unit/createUser.test.ts
   
   Test cases:
   ├── Should create user with valid input
   ├── Should reject invalid email
   ├── Should reject weak password
   ├── Should reject duplicate email
   └── Should handle DynamoDB errors
   
   $ npm test

4. Deploy to AWS (VS Code Terminal)
   $ sam build
   $ sam deploy --guided
   
   Prompts:
   ├── Stack name: milk-delivery-dev
   ├── Region: us-east-1
   ├── Confirm changes: Y
   ├── Allow SAM CLI IAM role creation: Y
   ├── Save arguments to config file: Y
   └── Deployment starts...
   
   Wait for: Successfully created/updated stack

5. Verify Deployment (AWS Console)
   ├── Lambda → Functions → createUserFunction
   │   ├── Check function exists
   │   ├── Check environment variables
   │   └── Check permissions
   ├── DynamoDB → Tables → milk-delivery-users
   │   ├── Check table exists
   │   ├── Check GSI: email-index
   │   └── Check capacity mode: On-demand
   └── CloudFormation → Stacks → milk-delivery-dev
       ├── Check stack status: CREATE_COMPLETE
       └── Review all resources created

6. Test Deployed Function (Console + VS Code)
   
   Option A: AWS Console
   ├── Lambda → createUserFunction → Test tab
   ├── Create test event: create-user-test
   ├── Execute test
   ├── Check response: 201 Created
   └── CloudWatch logs: Check execution logs
   
   Option B: VS Code (AWS Toolkit)
   ├── AWS Toolkit → Lambda → createUserFunction
   ├── Right-click → Invoke on AWS
   ├── Select test event
   ├── View results in VS Code
   └── Check logs in VS Code

7. Verify Data in DynamoDB (Console)
   ├── DynamoDB → Tables → milk-delivery-users
   ├── Items tab
   ├── Should see new user item
   └── Verify all fields are correct

Learning Outcome:
├── Full Lambda function deployed
├── Infrastructure as Code working
├── Understand deployment process
└── Can iterate quickly
```

---

## 5. FEATURE DEVELOPMENT FLOW (STEP-BY-STEP)

### 5.1 Complete Feature: Order Creation System

**Overview:**
```
Feature: Create Order
Complexity: High (multiple services involved)
Duration: 4-5 days
Services Used:
├── Lambda (createOrder, validateInventory)
├── DynamoDB (Orders, Products, Inventory tables)
├── Step Functions (Order processing workflow)
├── API Gateway (POST /orders endpoint)
├── SNS (Order notifications)
└── EventBridge (Order events)

Learning Goals:
├── Multi-table DynamoDB operations
├── Error handling and rollback strategies
├── Async workflows with Step Functions
├── Event-driven architecture
└── Transaction management
```

**Day 1: Planning & Design**

```
Morning Session (2 hours)

1. Requirement Analysis (docs/features/create-order.md)
   
   User Story:
   "As a customer, I want to create an order with multiple products
   from different vendors, so that I can get my dairy products delivered."
   
   Acceptance Criteria:
   ├── User must be authenticated
   ├── User must have complete profile (delivery address)
   ├── Order must have at least 1 item
   ├── All products must be in stock
   ├── Order total must be ≥ minimum order value (₹100)
   ├── Delivery date must be: today+1 to today+7
   ├── System must reserve inventory immediately
   ├── User receives order confirmation
   └── Vendors receive order notifications

2. Data Model Design
   
   Orders Table Schema:
   {
     "orderId": "uuid",
     "userId": "uuid",
     "items": [
       {
         "productId": "uuid",
         "vendorId": "uuid",
         "productName": "string",
         "quantity": number,
         "unitPrice": number,
         "totalPrice": number
       }
     ],
     "subtotal": number,
     "tax": number,
     "deliveryCharge": number,
     "discount": number,
     "totalAmount": number,
     "status": "Pending|Confirmed|Processing|Delivered|Cancelled",
     "deliveryDate": "ISO date",
     "deliveryAddress": {
       "line1": "string",
       "city": "string",
       "zipCode": "string"
     },
     "createdAt": "ISO timestamp",
     "updatedAt": "ISO timestamp"
   }

3. API Contract Design
   
   Request:
   POST /orders
   Headers:
     Authorization: Bearer <JWT_TOKEN>
     Content-Type: application/json
   
   Body:
   {
     "items": [
       {
         "productId": "prod-123",
         "vendorId": "vendor-456",
         "quantity": 2
       },
       {
         "productId": "prod-789",
         "vendorId": "vendor-456",
         "quantity": 1
       }
     ],
     "deliveryDate": "2025-10-15",
     "addressId": "addr-001"
   }
   
   Success Response (201 Created):
   {
     "orderId": "order-abc123",
     "userId": "user-xyz",
     "items": [...],
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 30,
     "totalAmount": 502.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-15T08:00:00Z",
     "message": "Order created successfully"
   }
   
   Error Responses:
   400 Bad Request:
   {
     "error": "ValidationError",
     "message": "Delivery date must be between tomorrow and 7 days from now",
     "field": "deliveryDate"
   }
   
   400 Bad Request:
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 1L' has only 5 units available",
     "availableQuantity": 5,
     "requestedQuantity": 10
   }
   
   400 Bad Request:
   {
     "error": "MinimumOrderValue",
     "message": "Order total must be at least ₹100",
     "currentTotal": 75,
     "minimumRequired": 100
   }
   
   401 Unauthorized:
   {
     "error": "Unauthorized",
     "message": "Invalid or expired token"
   }
   
   404 Not Found:
   {
     "error": "UserNotFound",
     "message": "User profile not found"
   }
   
   409 Conflict:
   {
     "error": "ProfileIncomplete",
     "message": "Please complete your profile before placing an order",
     "missingFields": ["deliveryAddress", "phone"]
   }

4. Workflow Design (Step Functions State Machine)
   
   Order Processing Workflow:
   Start
   ├── ValidateInput (Lambda)
   │   ├── Success → ValidateUser
   │   └── Fail → Return 400 Error
   ├── ValidateUser (Lambda)
   │   ├── Success → CheckInventory
   │   └── Fail → Return 404/409 Error
   ├── CheckInventory (Lambda)
   │   ├── AllAvailable → ReserveInventory
   │   └── Insufficient → Return 400 Error
   ├── ReserveInventory (Lambda)
   │   ├── Success → CalculatePricing
   │   └── Fail → Rollback
   ├── CalculatePricing (Lambda)
   │   ├── Success → CreateOrderRecord
   │   └── Fail → ReleaseInventory → Error
   ├── CreateOrderRecord (Lambda)
   │   ├── Success → NotifyUser
   │   └── Fail → ReleaseInventory → Error
   ├── NotifyUser (SNS)
   │   └── Send confirmation email
   ├── NotifyVendors (SNS)
   │   └── Send order details to each vendor
   └── End (Success)

5. Error Handling Strategy
   
   Scenario 1: Inventory Check Fails
   ├── Don't create order
   ├── Return 400 with specific product details
   └── No rollback needed (no state changed)
   
   Scenario 2: Inventory Reserved, but DynamoDB Fails
   ├── Critical: Inventory locked but order not created
   ├── Solution: Use DynamoDB transaction
   │   └── Atomic operation: Reserve inventory + Create order
   └── If transaction fails, nothing is committed
   
   Scenario 3: Order Created, but Notification Fails
   ├── Order exists, but user not notified
   ├── Solution: Make notification async (Step Functions)
   ├── Retry notification 3 times
   └── Use DLQ (Dead Letter Queue) for failures
   
   Scenario 4: Partial Vendor Availability
   ├── Some items available, some not
   ├── Option A: Reject entire order
   ├── Option B: Partial fulfillment (advanced)
   └── For MVP: Choose Option A (simpler)

Afternoon Session (1.5 hours)

6. Create Project Structure (VS Code)
   backend/
   ├── src/
   │   ├── lambdas/
   │   │   └── order/
   │   │       ├── createOrder.ts
   │   │       ├── validateInventory.ts
   │   │       ├── reserveInventory.ts
   │   │       ├── calculatePricing.ts
   │   │       └── types.ts
   │   ├── stepFunctions/
   │   │   └── orderProcessing.asl.json
   │   └── shared/
   │       ├── constants.ts
   │       └── pricing.ts
   └── tests/
       └── order/
           ├── createOrder.test.ts
           └── validateInventory.test.ts

7. Define Types (VS Code)
   File: src/lambdas/order/types.ts
   
   export interface OrderItem {
     productId: string;
     vendorId: string;
     quantity: number;
     unitPrice?: number;  // Calculated
     totalPrice?: number; // Calculated
   }
   
   export interface CreateOrderRequest {
     items: OrderItem[];
     deliveryDate: string;
     addressId: string;
   }
   
   export interface CreateOrderResponse {
     orderId: string;
     userId: string;
     items: OrderItem[];
     subtotal: number;
     tax: number;
     deliveryCharge: number;
     totalAmount: number;
     status: OrderStatus;
     estimatedDelivery: string;
     message: string;
   }
   
   export type OrderStatus = 
     | 'Pending'
     | 'Confirmed'
     | 'Processing'
     | 'OutForDelivery'
     | 'Delivered'
     | 'Cancelled'
     | 'Failed';
   
   export interface ValidationError {
     field: string;
     message: string;
     code: string;
   }

8. Create Test Events (VS Code)
   File: events/create-order-valid.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2},{\"productId\":\"prod-yogurt-200g\",\"vendorId\":\"vendor-001\",\"quantity\":3}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}",
     "headers": {
       "Authorization": "Bearer eyJhbGc...",
       "Content-Type": "application/json"
     },
     "requestContext": {
       "authorizer": {
         "claims": {
           "sub": "user-123"
         }
       }
     }
   }
   
   File: events/create-order-invalid-date.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":2}],\"deliveryDate\":\"2025-10-01\",\"addressId\":\"addr-home\"}"
   }
   
   File: events/create-order-insufficient-stock.json
   {
     "body": "{\"items\":[{\"productId\":\"prod-milk-500ml\",\"vendorId\":\"vendor-001\",\"quantity\":1000}],\"deliveryDate\":\"2025-10-12\",\"addressId\":\"addr-home\"}"
   }

Learning Outcome:
├── Complete understanding of requirements
├── API contract defined
├── Error scenarios identified
├── Project structure ready
└── Ready to code
```

**Day 2: Core Implementation**

```
Morning Session (2.5 hours)

1. Implement Validation Logic
   File: src/lambdas/order/createOrder.ts
   
   Function: validateInput()
   ├── Check items array not empty
   ├── Check each item has required fields
   ├── Check quantities are positive integers
   ├── Check deliveryDate format (ISO 8601)
   ├── Check deliveryDate is in valid range
   └── Return ValidationError[] if any issues
   
   Function: validateUser()
   ├── Extract userId from JWT (event.requestContext.authorizer.claims.sub)
   ├── Query Users table
   ├── Check user exists
   ├── Check profile is complete
   │   ├── Has delivery address matching addressId
   │   ├── Has phone number
   │   └── Has email
   └── Return user object or error
   
   Function: validateDeliveryDate()
   ├── Parse date string
   ├── Check format is valid
   ├── Check date is not in past
   ├── Check date is not today (need 1 day preparation)
   ├── Check date is within 7 days
   └── Return boolean + error message

2. Implement Inventory Validation
   File: src/lambdas/order/validateInventory.ts
   
   Function: checkInventory()
   Input:
   {
     "items": [
       {"productId": "prod-1", "vendorId": "vendor-1", "quantity": 2}
     ]
   }
   
   Process:
   ├── Group items by vendorId
   ├── For each vendor:
   │   ├── BatchGetItem from Inventory table
   │   │   └── Keys: [{vendorId, productId}, ...]
   │   ├── For each product:
   │   │   ├── Get available = stock - reserved
   │   │   ├── Check available >= requested quantity
   │   │   └── If not: add to unavailableItems[]
   │   └── Continue
   └── Return {valid: boolean, unavailableItems: []}
   
   Output (Success):
   {
     "valid": true,
     "unavailableItems": []
   }
   
   Output (Failure):
   {
     "valid": false,
     "unavailableItems": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "requestedQty": 10,
         "availableQty": 5
       }
     ]
   }

3. Implement Pricing Calculation
   File: src/shared/pricing.ts
   
   Function: calculateOrderTotal()
   Input:
   {
     "items": [
       {
         "productId": "prod-1",
         "quantity": 2,
         "unitPrice": 50
       }
     ],
     "deliveryAddress": {
       "city": "Vadodara",
       "zipCode": "390001"
     }
   }
   
   Calculation Logic:
   ├── subtotal = sum(item.unitPrice * item.quantity)
   ├── tax = subtotal * TAX_RATE (5% GST)
   ├── deliveryCharge = calculateDeliveryCharge()
   │   ├── If subtotal >= 500: ₹0 (free delivery)
   │   ├── Else if subtotal >= 300: ₹20
   │   ├── Else: ₹40
   │   └── Add ₹10 per additional vendor (multi-vendor orders)
   ├── discount = calculateDiscount()
   │   ├── If first order: 10% off (max ₹50)
   │   ├── If loyalty points: redeem at 1 point = ₹1
   │   └── else: 0
   └── totalAmount = subtotal + tax + deliveryCharge - discount
   
   Output:
   {
     "subtotal": 450,
     "tax": 22.5,
     "deliveryCharge": 20,
     "discount": 0,
     "totalAmount": 492.5,
     "breakdown": {
       "itemsTotal": 450,
       "taxBreakdown": {
         "cgst": 11.25,
         "sgst": 11.25
       },
       "deliveryDetails": {
         "baseCharge": 20,
         "multiVendorSurcharge": 0
       }
     }
   }

Afternoon Session (1.5 hours)

4. Implement Main Handler
   File: src/lambdas/order/createOrder.ts
   
   export const handler = async (event: APIGatewayProxyEvent)
   
   Flow:
   Step 1: Parse input
   ├── const body = JSON.parse(event.body || '{}');
   ├── const userId = event.requestContext.authorizer.claims.sub;
   └── Log input for debugging
   
   Step 2: Validate input
   ├── const validationErrors = validateInput(body);
   ├── if (validationErrors.length > 0):
   │   └── return 400 with errors
   └── Continue
   
   Step 3: Validate user
   ├── const user = await validateUser(userId);
   ├── if (!user):
   │   └── return 404 User Not Found
   ├── if (!user.isProfileComplete):
   │   └── return 409 Profile Incomplete
   └── Continue
   
   Step 4: Get delivery address
   ├── const address = user.addresses.find(a => a.addressId === body.addressId);
   ├── if (!address):
   │   └── return 404 Address Not Found
   └── Continue
   
   Step 5: Fetch product details
   ├── const productIds = body.items.map(i => i.productId);
   ├── const products = await batchGetProducts(productIds);
   ├── Merge product prices into items
   └── Calculate item totals
   
   Step 6: Check inventory
   ├── const inventoryCheck = await checkInventory(body.items);
   ├── if (!inventoryCheck.valid):
   │   └── return 400 Insufficient Stock with details
   └── Continue
   
   Step 7: Calculate pricing
   ├── const pricing = calculateOrderTotal(items, address, user);
   ├── if (pricing.totalAmount < MINIMUM_ORDER_VALUE):
   │   └── return 400 Minimum Order Value Not Met
   └── Continue
   
   Step 8: Create order record
   ├── const orderId = generateOrderId(); // uuid()
   ├── const order = {
   │     orderId,
   │     userId,
   │     items,
   │     ...pricing,
   │     status: 'Pending',
   │     deliveryDate: body.deliveryDate,
   │     deliveryAddress: address,
   │     createdAt: new Date().toISOString()
   │   };
   ├── await dynamodb.putItem(ORDERS_TABLE, order);
   └── Continue
   
   Step 9: Start Step Functions workflow
   ├── const executionArn = await stepFunctions.startExecution({
   │     stateMachineArn: ORDER_PROCESSING_STATE_MACHINE,
   │     input: JSON.stringify({ orderId, items })
   │   });
   └── Log execution ARN
   
   Step 10: Return response
   └── return {
         statusCode: 201,
         headers: {
           'Content-Type': 'application/json',
           'Access-Control-Allow-Origin': '*'
         },
         body: JSON.stringify({
           orderId,
           userId,
           items,
           ...pricing,
           status: 'Pending',
           estimatedDelivery: calculateEstimatedDelivery(body.deliveryDate),
           message: 'Order created successfully. You will receive confirmation shortly.'
         })
       };

5. Error Handling Patterns
   
   Pattern 1: Validation Errors (400)
   try {
     const errors = validateInput(body);
     if (errors.length > 0) {
       return {
         statusCode: 400,
         body: JSON.stringify({
           error: 'ValidationError',
           message: 'Invalid input data',
           errors: errors
         })
       };
     }
   } catch (error) {
     // Continue to Pattern 2
   }
   
   Pattern 2: Resource Not Found (404)
   const user = await getUser(userId);
   if (!user) {
     return {
       statusCode: 404,
       body: JSON.stringify({
         error: 'UserNotFound',
         message: `User with ID ${userId} not found`
       })
     };
   }
   
   Pattern 3: Business Logic Errors (400/409)
   if (pricing.totalAmount < MINIMUM_ORDER_VALUE) {
     return {
       statusCode: 400,
       body: JSON.stringify({
         error: 'MinimumOrderValue',
         message: `Order total must be at least ₹${MINIMUM_ORDER_VALUE}`,
         currentTotal: pricing.totalAmount,
         minimumRequired: MINIMUM_ORDER_VALUE
       })
     };
   }
   
   Pattern 4: Service Errors (500)
   try {
     await dynamodb.putItem(ORDERS_TABLE, order);
   } catch (error) {
     console.error('DynamoDB error:', error);
     return {
       statusCode: 500,
       body: JSON.stringify({
         error: 'InternalServerError',
         message: 'Failed to create order. Please try again.',
         requestId: context.requestId
       })
     };
   }
   
   Pattern 5: Timeout Handling
   // Set timeout slightly less than Lambda timeout
   const timeoutMs = 9000; // Lambda timeout is 10s
   const timeoutPromise = new Promise((_, reject) => 
     setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
   );
   
   try {
     await Promise.race([
       createOrder(body),
       timeoutPromise
     ]);
   } catch (error) {
     if (error.message === 'Operation timeout') {
       return {
         statusCode: 504,
         body: JSON.stringify({
           error: 'GatewayTimeout',
           message: 'Request took too long. Please try again.'
         })
       };
     }
   }

Learning Outcome:
├── Complete Lambda implementation
├── Error handling patterns mastered
├── Ready for testing
└── Understanding of edge cases
```

**Day 3: Testing & Step Functions**

```
Morning Session (2 hours)

1. Unit Testing (VS Code)
   File: tests/unit/createOrder.test.ts
   
   Test Suite: Input Validation
   ├── Test: Should accept valid input
   ├── Test: Should reject empty items array
   ├── Test: Should reject negative quantities
   ├── Test: Should reject invalid date format
   ├── Test: Should reject past delivery dates
   └── Test: Should reject dates beyond 7 days
   
   Test Suite: User Validation
   ├── Test: Should accept valid user with complete profile
   ├── Test: Should reject non-existent user
   ├── Test: Should reject user with incomplete profile
   └── Test: Should reject invalid address ID
   
   Test Suite: Inventory Validation
   ├── Test: Should pass when all items in stock
   ├── Test: Should fail when any item out of stock
   ├── Test: Should handle partial stock correctly
   └── Test: Should handle multiple vendors
   
   Test Suite: Pricing Calculation
   ├── Test: Should calculate subtotal correctly
   ├── Test: Should apply 5% GST
   ├── Test: Should apply free delivery for orders > ₹500
   ├── Test: Should charge ₹40 for orders < ₹300
   ├── Test: Should apply first order discount
   └── Test: Should calculate multi-vendor surcharge
   
   Run Tests:
   $ npm test
   
   Expected Output:
   PASS  tests/unit/createOrder.test.ts
     Input Validation
       ✓ Should accept valid input (5ms)
       ✓ Should reject empty items array (3ms)
       ✓ Should reject negative quantities (2ms)
       ✓ Should reject invalid date format (3ms)
       ✓ Should reject past delivery dates (2ms)
       ✓ Should reject dates beyond 7 days (2ms)
     
     Test Suites: 4 passed, 4 total
     Tests:       24 passed, 24 total
     Time:        2.341s

2. Local Testing with SAM (VS Code Terminal)
   
   Build project:
   $ cd backend
   $ npm run build
   $ sam build
   
   Output:
   Building codeuri: dist/ runtime: nodejs20.x architecture: x86_64
   Running NodejsNpmBuilder:NpmPack
   Build Succeeded
   
   Test with valid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-valid.json \
     --env-vars env.json
   
   Expected Output:
   Invoking lambdas/order/createOrder.handler
   START RequestId: abc-123 Version: $LATEST
   [INFO] Order creation started for user: user-123
   [INFO] Inventory validation passed
   [INFO] Order created: order-xyz-789
   END RequestId: abc-123
   REPORT RequestId: abc-123 Duration: 1243.56 ms Memory: 512 MB
   
   {"statusCode":201,"body":"{\"orderId\":\"order-xyz-789\",...}"}
   
   Test with invalid input:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-invalid-date.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"ValidationError\",...}"}
   
   Test with insufficient stock:
   $ sam local invoke CreateOrderFunction \
     --event events/create-order-insufficient-stock.json
   
   Expected Output:
   {"statusCode":400,"body":"{\"error\":\"InsufficientStock\",...}"}

3. Create Step Functions State Machine
   File: stepFunctions/orderProcessing.asl.json
   
   {
     "Comment": "Order Processing Workflow",
     "StartAt": "ReserveInventory",
     "States": {
       "ReserveInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:reserveInventoryFunction",
         "InputPath": "$",
         "ResultPath": "$.reservationResult",
         "Next": "CheckReservation",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "ReservationFailed"
           }
         ]
       },
       
       "CheckReservation": {
         "Type": "Choice",
         "Choices": [
           {
             "Variable": "$.reservationResult.success",
             "BooleanEquals": true,
             "Next": "NotifyVendors"
           }
         ],
         "Default": "ReservationFailed"
       },
       
       "NotifyVendors": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:notifyVendorsFunction",
         "InputPath": "$",
         "ResultPath": "$.notificationResult",
         "Next": "UpdateOrderStatus",
         "Retry": [
           {
             "ErrorEquals": ["States.TaskFailed"],
             "IntervalSeconds": 2,
             "MaxAttempts": 3,
             "BackoffRate": 2
           }
         ],
         "Catch": [
           {
             "ErrorEquals": ["States.ALL"],
             "ResultPath": "$.error",
             "Next": "NotificationFailed"
           }
         ]
       },
       
       "UpdateOrderStatus": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:updateOrderStatusFunction",
         "InputPath": "$",
         "Parameters": {
           "orderId.$": "$.orderId",
           "status": "Confirmed"
         },
         "ResultPath": "$.updateResult",
         "Next": "NotifyCustomer"
       },
       
       "NotifyCustomer": {
         "Type": "Task",
         "Resource": "arn:aws:states:::sns:publish",
         "Parameters": {
           "TopicArn": "arn:aws:sns:region:account:order-notifications",
           "Message.$": "$.orderId",
           "Subject": "Order Confirmed"
         },
         "Next": "OrderProcessingComplete"
       },
       
       "OrderProcessingComplete": {
         "Type": "Succeed"
       },
       
       "ReservationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Inventory reservation failed"
         },
         "Next": "OrderFailed"
       },
       
       "NotificationFailed": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:handleOrderFailureFunction",
         "Parameters": {
           "orderId.$": "$.orderId",
           "reason": "Vendor notification failed"
         },
         "Next": "ReleaseInventory"
       },
       
       "ReleaseInventory": {
         "Type": "Task",
         "Resource": "arn:aws:lambda:region:account:function:releaseInventoryFunction",
         "InputPath": "$",
         "Next": "OrderFailed"
       },
       
       "OrderFailed": {
         "Type": "Fail",
         "Error": "OrderProcessingFailed",
         "Cause": "Order processing workflow failed"
       }
     }
   }

Afternoon Session (1.5 hours)

4. Add Step Functions to SAM Template
   File: template.yaml
   
   Resources:
     OrderProcessingStateMachine:
       Type: AWS::Serverless::StateMachine
       Properties:
         Name: OrderProcessingWorkflow
         DefinitionUri: stepFunctions/orderProcessing.asl.json
         DefinitionSubstitutions:
           ReserveInventoryFunctionArn: !GetAtt ReserveInventoryFunction.Arn
           NotifyVendorsFunctionArn: !GetAtt NotifyVendorsFunction.Arn
           UpdateOrderStatusFunctionArn: !GetAtt UpdateOrderStatusFunction.Arn
           HandleOrderFailureFunctionArn: !GetAtt HandleOrderFailureFunction.Arn
           ReleaseInventoryFunctionArn: !GetAtt ReleaseInventoryFunction.Arn
           OrderNotificationsTopic: !Ref OrderNotificationsTopic
         Policies:
           - LambdaInvokePolicy:
               FunctionName: !Ref ReserveInventoryFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref NotifyVendorsFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref UpdateOrderStatusFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref HandleOrderFailureFunction
           - LambdaInvokePolicy:
               FunctionName: !Ref ReleaseInventoryFunction
           - SNSPublishMessagePolicy:
               TopicName: !GetAtt OrderNotificationsTopic.TopicName
         Logging:
           Level: ALL
           IncludeExecutionData: true
           Destinations:
             - CloudWatchLogsLogGroup:
                 LogGroupArn: !GetAtt OrderProcessingLogGroup.Arn
     
     OrderNotificationsTopic:
       Type: AWS::SNS::Topic
       Properties:
         TopicName: order-notifications
         DisplayName: Order Notifications
         Subscription:
           - Endpoint: your-email@example.com
             Protocol: email
     
     OrderProcessingLogGroup:
       Type: AWS::Logs::LogGroup
       Properties:
         LogGroupName: /aws/vendedlogs/states/OrderProcessing
         RetentionInDays: 7

5. Deploy Complete Stack
   $ sam build
   $ sam deploy --guided
   
   Deployment Output:
   CloudFormation stack changeset
   ---------------------------------
   Operation                 LogicalResourceId         ResourceType
   ---------------------------------
   + Add                     CreateOrderFunction       AWS::Lambda::Function
   + Add                     ReserveInventoryFunc      AWS::Lambda::Function
   + Add                     NotifyVendorsFunction     AWS::Lambda::Function
   + Add                     OrderProcessingState      AWS::StepFunctions::StateMachine
   + Add                     OrdersTable               AWS::DynamoDB::Table
   + Add                     OrderNotificationsTopic   AWS::SNS::Topic
   ---------------------------------
   
   Deploy this changeset? [y/N]: y
   
   Deployment progress:
   CREATE_IN_PROGRESS  OrdersTable
   CREATE_IN_PROGRESS  CreateOrderFunction
   CREATE_COMPLETE     OrdersTable
   CREATE_COMPLETE     CreateOrderFunction
   ...
   CREATE_COMPLETE     OrderProcessingStateMachine
   
   Successfully created/updated stack - milk-delivery-dev

6. Test Deployed Stack (AWS Console)
   
   Console → Step Functions → State machines → OrderProcessingWorkflow
   ├── Click "Start execution"
   ├── Input JSON:
   │   {
   │     "orderId": "test-order-001",
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ]
   │   }
   ├── Click "Start execution"
   └── Watch execution graph
   
   Visual Execution:
   ReserveInventory (Running) ⏳
   ├── Lambda invoked
   └── Waiting for response...
   
   ReserveInventory (Succeeded) ✅
   ├── Duration: 1.2s
   └── Output: {"success": true, "reservationId": "res-123"}
   
   NotifyVendors (Running) ⏳
   ├── Lambda invoked
   └── Sending emails...
   
   NotifyVendors (Succeeded) ✅
   ├── Duration: 0.8s
   └── Output: {"notified": ["vendor-001"]}
   
   UpdateOrderStatus (Running) ⏳
   UpdateOrderStatus (Succeeded) ✅
   
   NotifyCustomer (Running) ⏳
   NotifyCustomer (Succeeded) ✅
   
   OrderProcessingComplete ✅
   Total Duration: 4.5s
   
   Check CloudWatch Logs:
   ├── Console → CloudWatch → Log groups
   ├── /aws/vendedlogs/states/OrderProcessing
   └── View execution logs

Learning Outcome:
├── Step Functions workflow working
├── Async processing implemented
├── Error handling and retries configured
├── Complete order flow functional
└── Ready for API Gateway integration
```

**Day 4: API Gateway Integration**

```
Morning Session (2 hours)

1. Add API Gateway to SAM Template
   File: template.yaml
   
   Resources:
     MilkDeliveryApi:
       Type: AWS::Serverless::Api
       Properties:
         Name: MilkDeliveryAPI
         StageName: dev
         Cors:
           AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
           AllowHeaders: "'Content-Type,Authorization'"
           AllowOrigin: "'*'"
         Auth:
           DefaultAuthorizer: CognitoAuthorizer
           Authorizers:
             CognitoAuthorizer:
               UserPoolArn: !GetAtt UserPool.Arn
         GatewayResponses:
           UNAUTHORIZED:
             StatusCode: 401
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
           BAD_REQUEST_BODY:
             StatusCode: 400
             ResponseParameters:
               Headers:
                 Access-Control-Allow-Origin: "'*'"
         DefinitionBody:
           openapi: 3.0.1
           info:
             title: Milk Delivery API
             version: 1.0.0
           paths:
             /orders:
               post:
                 summary: Create a new order
                 requestBody:
                   required: true
                   content:
                     application/json:
                       schema:
                         type: object
                         required:
                           - items
                           - deliveryDate
                           - addressId
                         properties:
                           items:
                             type: array
                             minItems: 1
                             maxItems: 50
                           deliveryDate:
                             type: string
                             format: date
                           addressId:
                             type: string
                 responses:
                   '201':
                     description: Order created successfully
                   '400':
                     description: Invalid input
                   '401':
                     description: Unauthorized
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${CreateOrderFunction.Arn}/invocations'
               get:
                 summary: List user orders
                 responses:
                   '200':
                     description: List of orders
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ListOrdersFunction.Arn}/invocations'
             
             /orders/{orderId}:
               get:
                 summary: Get order details
                 parameters:
                   - name: orderId
                     in: path
                     required: true
                     schema:
                       type: string
                 responses:
                   '200':
                     description: Order details
                   '404':
                     description: Order not found
                 x-amazon-apigateway-integration:
                   type: aws_proxy
                   httpMethod: POST
                   uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetOrderFunction.Arn}/invocations'
     
     CreateOrderFunction:
       Type: AWS::Serverless::Function
       Properties:
         CodeUri: dist/
         Handler: lambdas/order/createOrder.handler
         Events:
           CreateOrder:
             Type: Api
             Properties:
               RestApiId: !Ref MilkDeliveryApi
               Path: /orders
               Method: POST
               Auth:
                 Authorizer: CognitoAuthorizer

2. Configure Request Validation
   File: template.yaml (add to API definition)
   
   RequestValidator:
     Type: AWS::ApiGateway::RequestValidator
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ValidateRequestBody: true
       ValidateRequestParameters: true
   
   Request Models:
   CreateOrderModel:
     Type: AWS::ApiGateway::Model
     Properties:
       RestApiId: !Ref MilkDeliveryApi
       ContentType: application/json
       Schema:
         type: object
         required:
           - items
           - deliveryDate
           - addressId
         properties:
           items:
             type: array
             minItems: 1
             items:
               type: object
               required:
                 - productId
                 - vendorId
                 - quantity
               properties:
                 productId:
                   type: string
                   pattern: '^prod-[a-zA-Z0-9-]+
                 vendorId:
                   type: string
                   pattern: '^vendor-[a-zA-Z0-9-]+
                 quantity:
                   type: integer
                   minimum: 1
                   maximum: 100
           deliveryDate:
             type: string
             format: date
           addressId:
             type: string

3. Deploy and Test API
   $ sam build
   $ sam deploy
   
   Output:
   Outputs:
   ├── MilkDeliveryApiUrl: https://abc123.execute-api.us-east-1.amazonaws.com/dev
   ├── CreateOrderFunctionArn: arn:aws:lambda:us-east-1:123456789:function:createOrder
   └── OrderProcessingStateMachine: arn:aws:states:us-east-1:123456789:stateMachine:OrderProcessing

Afternoon Session (1.5 hours)

4. Test API with Thunder Client (VS Code)
   
   Install Thunder Client extension
   ├── Extensions → Search "Thunder Client"
   ├── Install
   └── Restart VS Code
   
   Create Request Collection:
   Thunder Client → Collections → New Collection
   ├── Name: Milk Delivery API - Dev
   └── Create
   
   Request 1: Create Order (Success Case)
   ├── Method: POST
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders
   ├── Headers:
   │   ├── Content-Type: application/json
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   ├── Body (JSON):
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       },
   │       {
   │         "productId": "prod-yogurt-200g",
   │         "vendorId": "vendor-001",
   │         "quantity": 3
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (201 Created):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [
       {
         "productId": "prod-milk-500ml",
         "vendorId": "vendor-001",
         "productName": "Organic Milk 500ml",
         "quantity": 2,
         "unitPrice": 50,
         "totalPrice": 100
       },
       {
         "productId": "prod-yogurt-200g",
         "vendorId": "vendor-001",
         "productName": "Greek Yogurt 200g",
         "quantity": 3,
         "unitPrice": 30,
         "totalPrice": 90
       }
     ],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "discount": 0,
     "totalAmount": 239.5,
     "status": "Pending",
     "estimatedDelivery": "2025-10-12T08:00:00Z",
     "message": "Order created successfully. You will receive confirmation shortly."
   }
   
   Request 2: Create Order (Validation Error)
   ├── Body:
   │   {
   │     "items": [],  ← Empty array
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid input data",
     "errors": [
       {
         "field": "items",
         "message": "Items array cannot be empty",
         "code": "EMPTY_ITEMS"
       }
     ]
   }
   
   Request 3: Create Order (Insufficient Stock)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 1000  ← Too many
   │       }
   │     ],
   │     "deliveryDate": "2025-10-12",
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "InsufficientStock",
     "message": "Product 'Organic Milk 500ml' has only 50 units available",
     "productId": "prod-milk-500ml",
     "availableQuantity": 50,
     "requestedQuantity": 1000
   }
   
   Request 4: Create Order (Invalid Date)
   ├── Body:
   │   {
   │     "items": [
   │       {
   │         "productId": "prod-milk-500ml",
   │         "vendorId": "vendor-001",
   │         "quantity": 2
   │       }
   │     ],
   │     "deliveryDate": "2025-10-01",  ← Past date
   │     "addressId": "addr-home"
   │   }
   └── Send
   
   Expected Response (400 Bad Request):
   {
     "error": "ValidationError",
     "message": "Invalid delivery date",
     "errors": [
       {
         "field": "deliveryDate",
         "message": "Delivery date cannot be in the past",
         "code": "INVALID_DATE"
       }
     ]
   }
   
   Request 5: Get Order Details
   ├── Method: GET
   ├── URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev/orders/order-abc-123-xyz
   ├── Headers:
   │   └── Authorization: Bearer <COGNITO_JWT_TOKEN>
   └── Send
   
   Expected Response (200 OK):
   {
     "orderId": "order-abc-123-xyz",
     "userId": "user-456",
     "items": [...],
     "subtotal": 190,
     "tax": 9.5,
     "deliveryCharge": 40,
     "totalAmount": 239.5,
     "status": "Confirmed",
     "deliveryDate": "2025-10-12",
     "deliveryAddress": {
       "line1": "123 Main Street",
       "city": "Vadodara",
       "state": "Gujarat",
       "zipCode": "390001"
     },
     "createdAt": "2025-10-09T10:30:00Z",
     "updatedAt": "2025-10-09T10:30:15Z"
   }

5. Verify in AWS Console
   
   Console → API Gateway → MilkDeliveryAPI
   ├── Stages → dev
   ├── Invoke URL: Copy URL
   ├── Resources → /orders → POST
   ├── Test → Click "TEST" button
   ├── Request Body: Paste test JSON
   ├── Execute
   └── View Response
   
   Console → Lambda → CreateOrderFunction
   ├── Monitor tab
   ├── View logs → CloudWatch Logs
   ├── See execution logs
   └── Check for errors
   
   Console → DynamoDB → milk-delivery-orders
   ├── Items tab
   ├── See newly created order
   └── Verify all fields
   
   Console → Step Functions → OrderProcessingWorkflow
   ├── Executions tab
   ├── See execution for your order
   ├── Click execution ID
   └── View execution graph

Learning Outcome:
├── API Gateway fully integrated
├── End-to-end flow working
├── Multiple test scenarios validated
├── Ready for frontend integration
└── Understanding of full serverless stack
```

**Day 5: Edge Cases & Error Handling**

```
Morning Session (2 hours)

1. Edge Case Testing Matrix
   
   Test Case 1: Concurrent Orders (Race Condition)
   Scenario: Two users order the last item simultaneously
   
   Setup:
   ├── Set product stock to 1 unit
   ├── User A submits order for 1 unit
   ├── User B submits order for 1 unit (within milliseconds)
   └── Expected: Only one order succeeds
   
   Implementation Solution:
   ├── Use DynamoDB Conditional Expressions
   ├── UpdateItem with condition: stock > 0
   ├── If condition fails: Return insufficient stock
   └── Atomic operation prevents over-selling
   
   Code Pattern:
   await dynamodb.update({
     TableName: INVENTORY_TABLE,
     Key: { vendorId, productId },
     UpdateExpression: 'SET stock = stock - :qty, reserved = reserved + :qty',
     ConditionExpression: 'stock >= :qty',
     ExpressionAttributeValues: {
       ':qty': quantity
     }
   });
   // If condition fails, AWS throws ConditionalCheckFailedException
   
   Test Case 2: Multi-Vendor Order with Partial Failure
   Scenario: Order has items from 3 vendors, one vendor out of stock
   
   Expected Behavior:
   ├── Option A (Simple): Reject entire order
   ├── Option B (Advanced): Partial fulfillment
   └── For MVP: Choose Option A
   
   Implementation:
   ├── Validate all inventory BEFORE creating order
   ├── If any item fails: Return 400 with details
   ├── No partial orders
   └── Clear error message to user
   
   Test Case 3: Payment Gateway Timeout
   Scenario: Stripe API takes > 10 seconds to respond
   
   Implementation:
   ├── Set order status: "PaymentPending"
   ├── Use Stripe webhooks for async confirmation
   ├── Don't wait for payment in createOrder Lambda
   ├── Separate Lambda handles payment webhooks
   └── Update order status when webhook received
   
   Flow:
   createOrder → Return "PaymentPending"
       ↓
   User redirected to Stripe
       ↓
   Stripe processes payment
       ↓
   Stripe sends webhook → paymentWebhookHandler
       ↓
   Update order status → "Paid"
       ↓
   Trigger Step Functions workflow
   
   Test Case 4: Database Write Failure After Inventory Reserved
   Scenario: Inventory reserved, but DynamoDB fails to create order
   
   Problem:
   ├── Inventory locked
   ├── Order not created
   └── User sees error, but stock is reduced
   
   Solution: Use DynamoDB Transactions
   const params = {
     TransactItems: [
       {
         Update: {
           TableName: INVENTORY_TABLE,
           Key: { vendorId, productId },
           UpdateExpression: 'SET reserved = reserved + :qty',
           ConditionExpression: 'stock >= reserved + :qty',
           ExpressionAttributeValues: { ':qty': quantity }
         }
       },
       {
         Put: {
           TableName: ORDERS_TABLE,
           Item: orderObject,
           ConditionExpression: 'attribute_not_exists(orderId)'
         }
       }
     ]
   };
   await dynamodb.transactWrite()
```
