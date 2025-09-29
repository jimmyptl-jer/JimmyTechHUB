# 🚀 Complete Task Management API Guide
**Build a Serverless REST API with AWS Lambda, API Gateway & DynamoDB**

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Architecture Design](#architecture-design)
3. [Data Model](#data-model)
4. [Lambda Function Code](#lambda-function-code)
5. [Step-by-Step Deployment](#deployment-steps)
6. [Testing Your API](#testing)
7. [Monitoring & Troubleshooting](#monitoring)
8. [Cost Estimates](#costs)
9. [Security Best Practices](#security)
10. [Next Steps](#next-steps)

---

## 🎯 Overview {#overview}

### What This API Does:
- ✅ Create tasks
- ✅ View all tasks
- ✅ View single task by ID
- ✅ Update task status (pending/completed)
- ✅ Delete tasks

### Technologies Used:
- **AWS Lambda** - Serverless compute
- **API Gateway** - REST API endpoints
- **DynamoDB** - NoSQL database
- **Node.js 18.x** - Runtime
- **IAM** - Security & permissions

---

## 🏗️ Architecture Design {#architecture-design}

```
User (Postman/Browser/Mobile App)
    ↓ HTTP Request
API Gateway (REST API)
    ↓ Routes to Lambda
┌─────────────────────────┐
│   Lambda Functions      │
├─────────────────────────┤
│ 1. create-task          │
│ 2. get-tasks            │
│ 3. update-task          │
│ 4. delete-task          │
└─────────────────────────┘
    ↓ Read/Write
DynamoDB Table (Tasks)
```

### Request Flow:
```
Client → API Gateway → Lambda Function → DynamoDB → Lambda → API Gateway → Client
```

---

## 📊 Data Model {#data-model}

### DynamoDB Table: `Tasks`

```json
{
  "taskId": "uuid-123",              // Primary Key (String)
  "title": "Buy groceries",          // String (Required)
  "description": "Milk, eggs, bread",// String (Optional)
  "status": "pending",               // String: "pending" | "completed"
  "createdAt": "2025-09-29T10:00:00Z", // ISO 8601 timestamp
  "updatedAt": "2025-09-29T10:00:00Z"  // ISO 8601 timestamp
}
```

### Table Schema:
- **Table Name**: Tasks
- **Partition Key**: taskId (String)
- **Billing Mode**: PAY_PER_REQUEST (on-demand)
- **No Sort Key needed**

---

## 💻 Lambda Function Code {#lambda-function-code}

### 1. Create Task Function

**File: `create-task/index.js`**

```javascript
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || 'Tasks';

exports.handler = async (event) => {
    try {
        // Parse request body
        const body = JSON.parse(event.body);
        
        // Validate required fields
        if (!body.title) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Title is required'
                })
            };
        }
        
        // Create task object
        const timestamp = new Date().toISOString();
        const task = {
            taskId: uuidv4(),
            title: body.title,
            description: body.description || '',
            status: 'pending',
            createdAt: timestamp,
            updatedAt: timestamp
        };
        
        // Save to DynamoDB
        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: task
        });
        
        await docClient.send(command);
        
        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                message: 'Task created successfully',
                task: task
            })
        };
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Could not create task',
                details: error.message
            })
        };
    }
};
```

### 2. Get Tasks Function

**File: `get-tasks/index.js`**

```javascript
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || 'Tasks';

exports.handler = async (event) => {
    try {
        // Check if taskId is provided in path parameters
        const taskId = event.pathParameters?.taskId;
        
        if (taskId) {
            // Get single task
            const command = new GetCommand({
                TableName: TABLE_NAME,
                Key: { taskId }
            });
            
            const response = await docClient.send(command);
            
            if (!response.Item) {
                return {
                    statusCode: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        error: 'Task not found'
                    })
                };
            }
            
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    task: response.Item
                })
            };
            
        } else {
            // Get all tasks
            const command = new ScanCommand({
                TableName: TABLE_NAME
            });
            
            const response = await docClient.send(command);
            
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    tasks: response.Items || [],
                    count: response.Count || 0
                })
            };
        }
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Could not retrieve tasks',
                details: error.message
            })
        };
    }
};
```

### 3. Update Task Function

**File: `update-task/index.js`**

```javascript
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || 'Tasks';

exports.handler = async (event) => {
    try {
        const taskId = event.pathParameters?.taskId;
        
        if (!taskId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'taskId is required'
                })
            };
        }
        
        // Check if task exists
        const getCommand = new GetCommand({
            TableName: TABLE_NAME,
            Key: { taskId }
        });
        
        const existingTask = await docClient.send(getCommand);
        
        if (!existingTask.Item) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Task not found'
                })
            };
        }
        
        // Parse request body
        const body = JSON.parse(event.body);
        
        // Build update expression
        let updateExpression = 'SET updatedAt = :updatedAt';
        const expressionAttributeValues = {
            ':updatedAt': new Date().toISOString()
        };
        
        if (body.title !== undefined) {
            updateExpression += ', title = :title';
            expressionAttributeValues[':title'] = body.title;
        }
        
        if (body.description !== undefined) {
            updateExpression += ', description = :description';
            expressionAttributeValues[':description'] = body.description;
        }
        
        if (body.status !== undefined) {
            if (body.status !== 'pending' && body.status !== 'completed') {
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        error: 'Status must be either "pending" or "completed"'
                    })
                };
            }
            updateExpression += ', #status = :status';
            expressionAttributeValues[':status'] = body.status;
        }
        
        // Update task
        const updateCommand = new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { taskId },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ExpressionAttributeNames: body.status !== undefined ? { '#status': 'status' } : undefined,
            ReturnValues: 'ALL_NEW'
        });
        
        const response = await docClient.send(updateCommand);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                message: 'Task updated successfully',
                task: response.Attributes
            })
        };
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Could not update task',
                details: error.message
            })
        };
    }
};
```

### 4. Delete Task Function

**File: `delete-task/index.js`**

```javascript
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || 'Tasks';

exports.handler = async (event) => {
    try {
        const taskId = event.pathParameters?.taskId;
        
        if (!taskId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'taskId is required'
                })
            };
        }
        
        // Check if task exists
        const getCommand = new GetCommand({
            TableName: TABLE_NAME,
            Key: { taskId }
        });
        
        const existingTask = await docClient.send(getCommand);
        
        if (!existingTask.Item) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Task not found'
                })
            };
        }
        
        // Delete task
        const deleteCommand = new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { taskId }
        });
        
        await docClient.send(deleteCommand);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                message: 'Task deleted successfully',
                taskId: taskId
            })
        };
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Could not delete task',
                details: error.message
            })
        };
    }
};
```

### Package.json for all Lambda functions

**File: `package.json`**

```json
{
  "name": "task-management-api",
  "version": "1.0.0",
  "description": "Task Management API Lambda Functions",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.400.0",
    "@aws-sdk/lib-dynamodb": "^3.400.0",
    "uuid": "^9.0.0"
  }
}
```

---

## 🚀 Step-by-Step Deployment {#deployment-steps}

### Step 1: Create DynamoDB Table

#### Using AWS Console:

1. Open AWS Console and go to **DynamoDB**
2. Click **Create table**
3. Configure:
   - **Table name**: `Tasks`
   - **Partition key**: `taskId` (Type: String)
   - **Table settings**: Default settings
   - **Table class**: DynamoDB Standard
   - **Capacity mode**: On-demand
4. Click **Create table**
5. Wait for table status to become **Active** (30-60 seconds)

#### Using AWS CLI:

```bash
aws dynamodb create-table \
    --table-name Tasks \
    --attribute-definitions AttributeName=taskId,AttributeType=S \
    --key-schema AttributeName=taskId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region us-east-1
```

✅ **Checkpoint**: Table should be visible in DynamoDB console with status "Active"

---

### Step 2: Create IAM Role for Lambda

#### Using AWS Console:

1. Go to **IAM** → **Roles** → Click **Create role**
2. Select **Trusted entity type**: AWS service
3. Select **Use case**: Lambda
4. Click **Next**
5. **Add permissions**: Search and select `AWSLambdaBasicExecutionRole`
6. Click **Next**
7. **Role name**: `TaskAPILambdaRole`
8. **Description**: Role for Task Management API Lambda functions
9. Click **Create role**

#### Add DynamoDB Permissions:

1. Find your newly created role `TaskAPILambdaRole`
2. Click on it → Go to **Permissions** tab
3. Click **Add permissions** → **Create inline policy**
4. Click **JSON** tab and paste:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Scan",
                "dynamodb:Query"
            ],
            "Resource": "arn:aws:dynamodb:us-east-1:*:table/Tasks"
        }
    ]
}
```

5. Click **Review policy**
6. **Name**: `TaskAPILambdaDynamoDBAccess`
7. Click **Create policy**

✅ **Checkpoint**: Role should have 2 policies attached

---

### Step 3: Create Lambda Functions

You'll create 4 Lambda functions. Repeat these steps for each:
- `create-task`
- `get-tasks`
- `update-task`
- `delete-task`

#### For Each Lambda Function:

1. Go to **Lambda** in AWS Console
2. Click **Create function**
3. Configure:
   - **Function name**: `create-task` (change for each function)
   - **Runtime**: Node.js 18.x
   - **Architecture**: x86_64
   - **Permissions**: 
     - Select **Use an existing role**
     - Choose `TaskAPILambdaRole`
4. Click **Create function**

#### Add Code to Lambda:

1. In the function page, scroll to **Code source**
2. Delete the default code in `index.js`
3. Copy the respective code from the [Lambda Function Code](#lambda-function-code) section
4. Click **Deploy**

#### Add Environment Variable:

1. Go to **Configuration** tab
2. Click **Environment variables** (left menu)
3. Click **Edit**
4. Click **Add environment variable**
   - **Key**: `TABLE_NAME`
   - **Value**: `Tasks`
5. Click **Save**

#### Configure Function Settings:

1. Go to **Configuration** tab
2. Click **General configuration**
3. Click **Edit**
   - **Memory**: 128 MB
   - **Timeout**: 10 seconds
4. Click **Save**

#### Install Dependencies (Important!):

For each function, you need to add the `uuid` package:

1. On your local machine, create a folder for the function:
```bash
mkdir create-task
cd create-task
```

2. Create `package.json`:
```bash
npm init -y
npm install uuid @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

3. Create `index.js` with the respective function code

4. Zip the folder:
```bash
zip -r function.zip .
```

5. Upload to Lambda:
   - In Lambda console → **Code** tab
   - Click **Upload from** → **.zip file**
   - Select your `function.zip`
   - Click **Save**

**Repeat for all 4 functions**

✅ **Checkpoint**: All 4 Lambda functions should be created and deployed

---

### Step 4: Create API Gateway

#### Create REST API:

1. Go to **API Gateway** in AWS Console
2. Click **Create API**
3. Find **REST API** (not private) → Click **Build**
4. Configure:
   - **Choose the protocol**: REST
   - **Create new API**: New API
   - **API name**: `TaskManagementAPI`
   - **Description**: Task Management REST API
   - **Endpoint Type**: Regional
5. Click **Create API**

✅ You now have an API with root resource `/`

---

#### Create `/tasks` Resource:

1. Click on `/` (root resource)
2. Click **Actions** → **Create Resource**
3. Configure:
   - **Resource Name**: `tasks`
   - **Resource Path**: `/tasks` (auto-filled)
   - ✅ Check **Enable API Gateway CORS**
4. Click **Create Resource**

---

#### Create POST Method (Create Task):

1. Click on `/tasks` resource
2. Click **Actions** → **Create Method**
3. Select **POST** from dropdown → Click ✓ checkmark
4. Configure:
   - **Integration type**: Lambda Function
   - ✅ Check **Use Lambda Proxy integration**
   - **Lambda Region**: us-east-1 (your region)
   - **Lambda Function**: `create-task`
5. Click **Save**
6. Popup appears → Click **OK** to grant permission

---

#### Create GET Method (Get All Tasks):

1. Click on `/tasks` resource
2. Click **Actions** → **Create Method**
3. Select **GET** → Click ✓
4. Configure:
   - **Integration type**: Lambda Function
   - ✅ Check **Use Lambda Proxy integration**
   - **Lambda Function**: `get-tasks`
5. Click **Save** → Click **OK**

---

#### Create `/tasks/{taskId}` Resource:

1. Click on `/tasks` resource
2. Click **Actions** → **Create Resource**
3. Configure:
   - **Resource Name**: `taskId`
   - **Resource Path**: `{taskId}` (with curly braces!)
   - ✅ Check **Enable API Gateway CORS**
4. Click **Create Resource**

---

#### Create GET Method for Single Task:

1. Click on `/tasks/{taskId}` resource
2. Click **Actions** → **Create Method**
3. Select **GET** → Click ✓
4. Configure:
   - **Integration type**: Lambda Function
   - ✅ Check **Use Lambda Proxy integration**
   - **Lambda Function**: `get-tasks`
5. Click **Save** → Click **OK**

---

#### Create PUT Method (Update Task):

1. Click on `/tasks/{taskId}` resource
2. Click **Actions** → **Create Method**
3. Select **PUT** → Click ✓
4. Configure:
   - **Integration type**: Lambda Function
   - ✅ Check **Use Lambda Proxy integration**
   - **Lambda Function**: `update-task`
5. Click **Save** → Click **OK**

---

#### Create DELETE Method (Delete Task):

1. Click on `/tasks/{taskId}` resource
2. Click **Actions** → **Create Method**
3. Select **DELETE** → Click ✓
4. Configure:
   - **Integration type**: Lambda Function
   - ✅ Check **Use Lambda Proxy integration**
   - **Lambda Function**: `delete-task`
5. Click **Save** → Click **OK**

---

#### Enable CORS:

1. Click on `/tasks` resource
2. Click **Actions** → **Enable CORS**
3. Keep defaults → Click **Enable CORS and replace existing CORS headers**
4. Click **Yes, replace existing values**

5. Repeat for `/tasks/{taskId}`:
   - Click on `/tasks/{taskId}`
   - Click **Actions** → **Enable CORS**
   - Click **Enable CORS and replace existing CORS headers**

---

#### Deploy API:

1. Click **Actions** → **Deploy API**
2. Configure:
   - **Deployment stage**: [New Stage]
   - **Stage name**: `dev`
   - **Stage description**: Development environment
3. Click **Deploy**

✅ **Your API is now live!**

#### Get Your Invoke URL:

After deployment, you'll see:

```
Invoke URL: https://abc123xyz.execute-api.us-east-1.amazonaws.com/dev
```

**Save this URL - you'll need it for testing!**

---

### API Structure Overview:

```
TaskManagementAPI
└── / (root)
    └── /tasks
        ├── POST    → create-task
        ├── GET     → get-tasks
        └── /{taskId}
            ├── GET    → get-tasks
            ├── PUT    → update-task
            └── DELETE → delete-task
```

---

## 🧪 Testing Your API {#testing}

### Replace `YOUR_API_URL` with your actual Invoke URL

### 1. Create a Task (POST)

**Using cURL:**

```bash
curl -X POST https://YOUR_API_URL/dev/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Buy groceries",
    "description": "Milk, eggs, bread"
  }'
```

**Expected Response (201 Created):**

```json
{
  "message": "Task created successfully",
  "task": {
    "taskId": "abc-123-def-456",
    "title": "Buy groceries",
    "description": "Milk, eggs, bread",
    "status": "pending",
    "createdAt": "2025-09-29T10:00:00.000Z",
    "updatedAt": "2025-09-29T10:00:00.000Z"
  }
}
```

---

### 2. Get All Tasks (GET)

**Using cURL:**

```bash
curl https://YOUR_API_URL/dev/tasks
```

**Expected Response (200 OK):**

```json
{
  "tasks": [
    {
      "taskId": "abc-123-def-456",
      "title": "Buy groceries",
      "description": "Milk, eggs, bread",
      "status": "pending",
      "createdAt": "2025-09-29T10:00:00.000Z",
      "updatedAt": "2025-09-29T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

### 3. Get Single Task (GET)

**Using cURL:**

```bash
curl https://YOUR_API_URL/dev/tasks/abc-123-def-456
```

**Expected Response (200 OK):**

```json
{
  "task": {
    "taskId": "abc-123-def-456",
    "title": "Buy groceries",
    "description": "Milk, eggs, bread",
    "status": "pending",
    "createdAt": "2025-09-29T10:00:00.000Z",
    "updatedAt": "2025-09-29T10:00:00.000Z"
  }
}
```

---

### 4. Update Task (PUT)

**Using cURL:**

```bash
curl -X PUT https://YOUR_API_URL/dev/tasks/abc-123-def-456 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed"
  }'
```

**Expected Response (200 OK):**

```json
{
  "message": "Task updated successfully",
  "task": {
    "taskId": "abc-123-def-456",
    "title": "Buy groceries",
    "description": "Milk, eggs, bread",
    "status": "completed",
    "createdAt": "2025-09-29T10:00:00.000Z",
    "updatedAt": "2025-09-29T15:30:00.000Z"
  }
}
```

---

### 5. Delete Task (DELETE)

**Using cURL:**

```bash
curl -X DELETE https://YOUR_API_URL/dev/tasks/abc-123-def-456
```

**Expected Response (200 OK):**

```json
{
  "message": "Task deleted successfully",
  "taskId": "abc-123-def-456"
}
```

---

### Testing with Postman:

1. **Install Postman** (https://www.postman.com/downloads/)
2. **Create new Collection**: "Task Management API"
3. **Set Collection Variable**:
   - Key: `base_url`
   - Value: `https://YOUR_API_URL/dev`

4. **Create Requests**:

   **Request 1: Create Task**
   - Method: POST
   - URL: `{{base_url}}/tasks`
   - Body → raw → JSON:
   ```json
   {
     "title": "Test Task",
     "description": "Testing from Postman"
   }
   ```

   **Request 2: Get All Tasks**
   - Method: GET
   - URL: `{{base_url}}/tasks`

   **Request 3: Get Single Task**
   - Method: GET
   - URL: `{{base_url}}/tasks/{{taskId}}`

   **Request 4: Update Task**
   - Method: PUT
   - URL: `{{base_url}}/tasks/{{taskId}}`
   - Body → raw → JSON:
   ```json
   {
     "status": "completed"
   }
   ```

   **Request 5: Delete Task**
   - Method: DELETE
   - URL: `{{base_url}}/tasks/{{taskId}}`

---

### Testing in API Gateway Console:

#### Test POST /tasks:

1. In API Gateway, click `/tasks` → **POST**
2. Click **Test** (lightning bolt)
3. Scroll to **Request Body**:
```json
{
  "title": "Console Test",
  "description": "Testing from console"
}
```
4. Click **Test**
5. Check response: Status 201, task object returned

#### Test GET /tasks:

1. Click `/tasks` → **GET**
2. Click **Test**
3. Click **Test** (no body needed)
4. Check response: Status 200, array of tasks

---

## 📊 Monitoring & Troubleshooting {#monitoring}

### CloudWatch Logs:

1. Go to **CloudWatch** → **Log groups**
2. Find logs for each Lambda:
   - `/aws/lambda/create-task`
   - `/aws/lambda/get-tasks`
   - `/aws/lambda/update-task`
   - `/aws/lambda/delete-task`
3. Click to view execution logs

### CloudWatch Metrics:

Check metrics for:
- **Invocations**: Number of times function was called
- **Duration**: Execution time
- **Errors**: Failed invocations
- **Throttles**: Rate-limited requests

---

### Common Issues & Solutions:

#### ❌ "Missing Authentication Token"

**Cause**: Wrong URL or endpoint not deployed

**Solution**:
- Verify API Gateway deployment
- Check exact Invoke URL
- Ensure method exists for the path

---

#### ❌ "Internal Server Error" (502)

**Cause**: Lambda function error

**Solution**:
1. Check CloudWatch logs for the Lambda
2. Look for error messages
3. Common issues:
   - Missing environment variable `TABLE_NAME`
   - IAM permission denied
   - Invalid JSON in request body

---

#### ❌ "Access Denied" (403)

**Cause**: IAM permissions issue

**Solution**:
1. Verify IAM role has DynamoDB permissions
2. Check Lambda execution role
3. Verify DynamoDB table name is correct

---

#### ❌ "Task not found" (404)

**Cause**: Invalid taskId or task doesn't exist

**Solution**:
- Verify taskId is correct UUID format
- Check if task exists in DynamoDB table
- Use correct taskId from create response

---

#### ❌ CORS Errors in Browser

**Cause**: CORS not enabled or not deployed

**Solution**:
1. Enable CORS on both `/tasks` and `/tasks/{taskId}`
2. Re-deploy API after enabling CORS
3. Check response headers include:
   - `Access-Control-Allow-Origin: *`

---

#### ❌ "ValidationException" from DynamoDB

**Cause**: Missing or invalid required fields

**Solution**:
- Ensure `taskId` is provided for operations requiring it
- Check data types match schema

---

### Debugging Steps:

1. **Check Lambda Logs First**
   - Go to CloudWatch Logs
   - Look for error stack traces
   - Check console.error() outputs

2. **Verify Environment Variables**
   - Lambda → Configuration → Environment variables
   - Ensure `TABLE_NAME = Tasks`

3. **Test Lambda Directly**
   - Use Lambda Test feature in console
   - Create test events with sample payloads
   - See exact error messages

4. **Check IAM Permissions**
   - Lambda → Configuration → Permissions
   - Verify role has DynamoDB policies
   - Check CloudWatch Logs policy

5. **Verify DynamoDB Table**
   - Check table exists and is Active
   - Verify table name matches `TABLE_NAME`
   - Check partition key is `taskId`

---

## 💰 Cost Estimates {#costs}

### For 1 Million Requests/Month:

**AWS Lambda:**
- 1M requests × $0.20 per 1M requests = **$0.20**
- Compute: 128 MB × 100ms avg × 1M requests = **$0.17**
- **Lambda Total: $0.37**

**DynamoDB:**
- On-demand pricing
- 1M reads (eventually consistent) = **$0.25**
- 1M writes = **$1.25**
- Storage (assuming 1 GB) = **$0.25**
- **DynamoDB Total: $1.75**

**API Gateway:**
- 1M requests × $3.50 per 1M requests = **$3.50**
- **API Gateway Total: $3.50**

**CloudWatch Logs:**
- Basic logging = **$0.50**

### **Total Monthly Cost: ~$6.12**

### Free Tier Benefits (First 12 months):
- Lambda: 1M requests/month free
- DynamoDB: 25 GB storage + 25 read/write units
- API Gateway: 1M API calls/month free (first 12 months)

**Estimated Free Tier Cost: ~$0.50/month**

---

## 🔐 Security Best Practices {#security}

### 1. Enable API Keys (Production)

**Setup API Key:**
1. In API Gateway → **API Keys** → **Actions** → **Create API Key**
2. Name: `TaskAPI-Production-Key`
3. Click **Save**

**Create Usage Plan:**
1. **Usage Plans** → **Create**
2. Name: `TaskAPI-Usage-Plan`
3. Rate: 1000 requests/second
4. Burst: 2000 requests
5. Quota: 1,000,000 requests/month
6. Click **Next**
7. Add API Stage: `dev`
8. Click **Next**
9. Add API Key
10. Click **Done**

**Require API Key:**
1. For each method → **Method Request**
2. **API Key Required**: true
3. Deploy API

**Use API Key:**
```bash
curl https://YOUR_API_URL/dev/tasks \
  -H "x-api-key: YOUR_API_KEY"
```

---

### 2. Add User Authentication (AWS Cognito)

**Create User Pool:**
1. Go to **Cognito** → **Create user pool**
2. Configure sign-in options
3. Configure security requirements
4. Configure message delivery
5. Integrate with app
6. Create pool

**Add Cognito Authorizer:**
1. In API Gateway → **Authorizers** → **Create**
2. Type: Cognito
3. Name: `TaskAPI-Authorizer`
4. Cognito User Pool: Select your pool
5. Token Source: `Authorization`
6. Create

**Apply to Methods:**
1. Each method → **Method Request**
2. Authorization: `TaskAPI-Authorizer`
3. Deploy API

---

### 3. Input Validation

**Add Request Validator:**
1. In API Gateway → **Settings**
2. Create Request Validator
3. Validate body, query string parameters

**Define Models:**
```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "description": {
      "type": "string",
      "maxLength": 1000
    }
  },
  "required": ["title"]
}
```

---

### 4. Enable Request Throttling

**Per API Level:**
1. API Gateway → **Stages** → `dev`
2. **Settings** tab
3. Default Method Throttling:
   - Rate: 1000 requests/second
   - Burst: 2000 requests

**Per Method Level:**
1. Select specific method
2. Configure custom throttling

---

### 5. Secure DynamoDB Access

**Principle of Least Privilege:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:PutItem"
            ],
            "Resource": "arn:aws:dynamodb:us-east-1:*:table/Tasks",
            "Condition": {
                "ForAllValues:StringEquals": {
                    "dynamodb:Attributes": [
                        "taskId",
                        "title",
                        "description",
                        "status",
                        "createdAt",
                        "updatedAt"
                    ]
                }
            }
        }
    ]
}
```

---

### 6. Enable CloudTrail

**Track API Activity:**
1. Go to **CloudTrail**
2. Create trail
3. Enable for API Gateway, Lambda, DynamoDB
4. Store logs in S3

---

### 7. Encrypt Data

**DynamoDB Encryption:**
1. Table → **Additional settings**
2. **Encryption at rest**: AWS managed key
3. Already enabled by default

**API Gateway SSL/TLS:**
- Enabled by default on AWS endpoints
- Use custom domain with ACM certificate for production

---

### 8. Environment-Specific Stages

**Create Multiple Stages:**
- `dev` - Development
- `staging` - Testing
- `prod` - Production

**Different configurations per stage:**
- Different DynamoDB tables
- Different throttling limits
- Different API keys

---

## 🚀 Next Steps {#next-steps}

### Immediate Improvements:

#### 1. Add Pagination
**Modify get-tasks Lambda:**
```javascript
// Add query parameters
const limit = event.queryStringParameters?.limit || 10;
const lastKey = event.queryStringParameters?.lastKey;

const command = new ScanCommand({
    TableName: TABLE_NAME,
    Limit: parseInt(limit),
    ExclusiveStartKey: lastKey ? JSON.parse(lastKey) : undefined
});
```

---

#### 2. Add Search/Filter
**Add Query by Status:**
```javascript
// Create GSI (Global Secondary Index) on status
// Then query by status
const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'status-index',
    KeyConditionExpression: '#status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': 'pending' }
});
```

---

#### 3. Add Task Categories/Tags
**Update Data Model:**
```json
{
  "taskId": "uuid-123",
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "status": "pending",
  "category": "shopping",
  "tags": ["urgent", "personal"],
  "createdAt": "2025-09-29T10:00:00Z",
  "updatedAt": "2025-09-29T10:00:00Z"
}
```

---

#### 4. Add Due Dates & Reminders
**Enhanced Task:**
```json
{
  "taskId": "uuid-123",
  "title": "Buy groceries",
  "dueDate": "2025-10-01T18:00:00Z",
  "priority": "high",
  "reminderEnabled": true
}
```

---

### Advanced Features:

#### 5. Add User Management
- Integrate AWS Cognito
- Multi-user support
- User-specific tasks
- Shared tasks/collaboration

---

#### 6. Add Real-time Updates
- Use AWS AppSync (GraphQL)
- WebSocket connections
- Real-time notifications

---

#### 7. Implement CI/CD Pipeline

**Using AWS SAM:**
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  CreateTaskFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: create-task
      Handler: index.handler
      Runtime: nodejs18.x
      Environment:
        Variables:
          TABLE_NAME: Tasks
      Events:
        CreateTask:
          Type: Api
          Properties:
            Path: /tasks
            Method: post
```

**Deploy with:**
```bash
sam build
sam deploy --guided
```

---

#### 8. Add Monitoring Dashboard

**CloudWatch Dashboard:**
1. Go to CloudWatch → **Dashboards**
2. Create dashboard
3. Add widgets:
   - Lambda invocations
   - API Gateway latency
   - DynamoDB throttles
   - Error rates

---

#### 9. Implement Automated Testing

**Unit Tests (Jest):**
```javascript
const { handler } = require('./index');

test('creates task successfully', async () => {
    const event = {
        body: JSON.stringify({
            title: 'Test Task',
            description: 'Test Description'
        })
    };
    
    const response = await handler(event);
    expect(response.statusCode).toBe(201);
});
```

---

#### 10. Add Email Notifications

**Using AWS SES:**
```javascript
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// Send email when task is created
const params = {
    Destination: {
        ToAddresses: [userEmail]
    },
    Message: {
        Body: {
            Text: { Data: `Task created: ${task.title}` }
        },
        Subject: { Data: 'New Task Created' }
    },
    Source: 'noreply@yourdomain.com'
};
```

---

## 📁 Project Structure

```
task-management-api/
├── README.md
├── functions/
│   ├── create-task/
│   │   ├── index.js
│   │   ├── package.json
│   │   └── tests/
│   │       └── index.test.js
│   ├── get-tasks/
│   │   ├── index.js
│   │   ├── package.json
│   │   └── tests/
│   │       └── index.test.js
│   ├── update-task/
│   │   ├── index.js
│   │   ├── package.json
│   │   └── tests/
│   │       └── index.test.js
│   └── delete-task/
│       ├── index.js
│       ├── package.json
│       └── tests/
│           └── index.test.js
├── infrastructure/
│   ├── cloudformation.yaml
│   ├── sam-template.yaml
│   └── terraform/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── scripts/
│   ├── deploy.sh
│   ├── test.sh
│   └── cleanup.sh
└── postman/
    └── Task-Management-API.postman_collection.json
```

---

## ✅ Deployment Checklist

### Pre-Deployment:
- [ ] AWS account created
- [ ] AWS CLI installed and configured
- [ ] Node.js 18.x installed locally
- [ ] Postman installed for testing

### DynamoDB:
- [ ] Tasks table created
- [ ] Table status is Active
- [ ] Partition key is `taskId`

### IAM:
- [ ] Lambda execution role created
- [ ] DynamoDB permissions attached
- [ ] CloudWatch Logs permissions attached

### Lambda Functions:
- [ ] `create-task` function deployed
- [ ] `get-tasks` function deployed
- [ ] `update-task` function deployed
- [ ] `delete-task` function deployed
- [ ] Environment variable `TABLE_NAME` set for all
- [ ] Dependencies (uuid, aws-sdk) installed

### API Gateway:
- [ ] REST API created
- [ ] `/tasks` resource created
- [ ] `/tasks/{taskId}` resource created
- [ ] POST /tasks method configured
- [ ] GET /tasks method configured
- [ ] GET /tasks/{taskId} method configured
- [ ] PUT /tasks/{taskId} method configured
- [ ] DELETE /tasks/{taskId} method configured
- [ ] CORS enabled on all resources
- [ ] API deployed to `dev` stage
- [ ] Invoke URL noted

### Testing:
- [ ] Create task tested successfully
- [ ] Get all tasks tested successfully
- [ ] Get single task tested successfully
- [ ] Update task tested successfully
- [ ] Delete task tested successfully
- [ ] Error cases tested (404, 400, 500)

### Monitoring:
- [ ] CloudWatch Logs verified
- [ ] Metrics dashboard created
- [ ] Alarms configured (optional)

### Security:
- [ ] API throttling configured
- [ ] Input validation added
- [ ] API keys created (production)
- [ ] Authentication added (optional)

---

## 🆘 Support & Resources

### AWS Documentation:
- **Lambda**: https://docs.aws.amazon.com/lambda/
- **API Gateway**: https://docs.aws.amazon.com/apigateway/
- **DynamoDB**: https://docs.aws.amazon.com/dynamodb/
- **IAM**: https://docs.aws.amazon.com/iam/

### Community:
- AWS Forums: https://forums.aws.amazon.com/
- Stack Overflow: Tag `aws-lambda`, `amazon-dynamodb`
- Reddit: r/aws

### Learning Resources:
- AWS Free Tier: https://aws.amazon.com/free/
- AWS Training: https://aws.amazon.com/training/
- AWS Samples: https://github.com/aws-samples

---

## 📝 License & Disclaimer

This is a tutorial/educational project. For production use:
- Implement proper authentication
- Add comprehensive error handling
- Enable detailed monitoring
- Follow AWS Well-Architected Framework
- Implement proper security measures
- Add automated backups

---

## 🎉 Congratulations!

You've successfully built a complete serverless REST API using:
✅ AWS Lambda for compute  
✅ API Gateway for HTTP endpoints  
✅ DynamoDB for data storage  
✅ IAM for security  
✅ CloudWatch for monitoring

Your API can now:
- Create tasks
- Retrieve all tasks
- Get individual tasks
- Update task status
- Delete tasks

**All without managing any servers!** 🚀

---

## 📞 Need Help?

If you encounter issues:

1. **Check CloudWatch Logs** - Most errors are logged here
2. **Verify IAM Permissions** - Common cause of 403 errors
3. **Test Lambda Directly** - Isolate API Gateway issues
4. **Check DynamoDB** - Verify data is being saved
5. **Review this guide** - Follow steps carefully
