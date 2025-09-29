## 🎯 **Application: Task Management API**

### **What it does:**
- Users can create tasks
- View all tasks
- Update task status (pending/completed)
- Delete tasks

---

## 📋 **Step 1: Architecture Design**

```
User (Postman/Browser)
    ↓ HTTP Request
API Gateway
    ↓ Routes
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

---

## 📊 **Step 2: Data Model**

**DynamoDB Table: Tasks**
```
{
  taskId: "uuid-123",           (Primary Key)
  title: "Buy groceries",
  description: "Milk, eggs, bread",
  status: "pending",            (pending/completed)
  createdAt: "2025-09-29T10:00:00Z",
  updatedAt: "2025-09-29T10:00:00Z"
}
```

---

## 🛠️ **Step 3: Let's Build It!**

I'll create the complete code for all 4 Lambda functions:

Now let me create the deployment guide and infrastructure setup:

Perfect! Now let me create a visual architecture diagram for this application:
