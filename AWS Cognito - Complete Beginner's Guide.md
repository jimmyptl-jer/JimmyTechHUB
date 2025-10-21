# AWS Cognito - Complete Beginner's Guide

## What is AWS Cognito? (Simple Explanation)

Imagine you're building a milk delivery app. You need to:
- Let users create accounts (sign up)
- Let users log in
- Remember who's logged in
- Prevent unauthorized people from accessing user data
- Know which user placed which order

**AWS Cognito does all of this for you automatically!**

Instead of building your own login system (which is complex and risky), AWS Cognito is a ready-made service that handles user authentication and authorization.

---

## Real-World Analogy

Think of AWS Cognito like a **security guard at a building**:

1. **First Visit (Sign Up)**: You register at the front desk, get an ID card
2. **Daily Entry (Login)**: You show your ID card to enter
3. **Access Control (Authorization)**: Your card only opens certain doors based on your role
4. **ID Verification**: Security checks your card at each door
5. **Temporary Pass (Token)**: You get a visitor badge that expires after a few hours

---

## The Two Main Parts of Cognito

### 1. User Pool (Authentication - "Who are you?")
**Purpose**: Manages user accounts and login

**What it does**:
- Stores usernames, passwords, emails
- Handles sign up and sign in
- Sends verification emails/SMS
- Manages password resets
- Issues JWT tokens after successful login

**Real example**: 
```
User enters: email@example.com + password123
Cognito checks: ✅ Credentials match
Cognito returns: JWT Token (like a temporary ID badge)
```

### 2. Identity Pool (Authorization - "What can you access?")
**Purpose**: Gives temporary AWS credentials

**What it does**:
- Converts your User Pool token into AWS credentials
- Allows direct access to AWS services (S3, DynamoDB)
- Controls what each user can do

**Real example**:
```
User wants to upload profile picture to S3
Identity Pool gives: Temporary AWS credentials
User can now: Upload to S3 for 1 hour
```

---

## When Do You Need Cognito?

### ✅ You NEED Cognito When:

1. **User Accounts Required**
   - Users need to create accounts
   - Users need to log in
   - Example: Your milk delivery app where customers create accounts

2. **Protecting Private Data**
   - Each user has their own cart, orders, profile
   - One user shouldn't see another user's data
   - Example: Customer A shouldn't see Customer B's orders

3. **Role-Based Access**
   - Different users have different permissions
   - Example: 
     - Customers can place orders
     - Delivery staff can update delivery status
     - Admins can view all orders

4. **Social Login**
   - Allow login with Google, Facebook, Apple
   - Example: "Sign in with Google" button

5. **Mobile Apps**
   - Need secure authentication for iOS/Android apps
   - Example: Your mobile milk delivery app

6. **Web Applications**
   - Need user sessions that persist across devices
   - Example: User logs in on phone, can also access on web

### ❌ You DON'T Need Cognito When:

1. **Public APIs Only**
   - No user accounts needed
   - Everyone sees same data
   - Example: Weather API, public news feed

2. **Internal Tools**
   - Only your company uses it
   - Can use AWS IAM users instead
   - Example: Admin dashboard only for your team

3. **Simple Static Website**
   - No user interaction
   - Just displaying information
   - Example: Company landing page

---

## How Cognito Works: Step-by-Step Flow

### Scenario: User Orders Milk

#### Step 1: User Signs Up
```
User fills form → Email: john@example.com, Password: Milk@123
                ↓
        Cognito User Pool
                ↓
    1. Checks if email already exists
    2. Encrypts password
    3. Saves user in database
    4. Sends verification email
                ↓
        User verifies email
                ↓
        Account is active ✅
```

#### Step 2: User Logs In
```
User enters credentials → Email + Password
                        ↓
                Cognito User Pool
                        ↓
            Validates credentials
                        ↓
    Returns 3 tokens:
    - ID Token (contains user info)
    - Access Token (for API calls)
    - Refresh Token (to get new tokens)
                        ↓
    Frontend stores tokens
```

#### Step 3: User Makes API Call (e.g., View Cart)
```
Frontend → GET /cart (includes Access Token in header)
              ↓
        API Gateway
              ↓
    Cognito Authorizer checks:
    - Is token valid?
    - Is token expired?
    - Is token from correct User Pool?
              ↓
    ✅ Valid → Forward to Lambda
    ❌ Invalid → Return 401 Unauthorized
              ↓
    Lambda extracts user ID from token
              ↓
    Fetches cart for this specific user from DynamoDB
              ↓
    Returns cart data
```

---

## Understanding JWT Tokens (The ID Badge)

### What is a JWT Token?

A JWT (JSON Web Token) is like a **tamper-proof ID badge** that contains:
- Who you are (user ID, email, name)
- When it was issued
- When it expires
- What you can do (groups/roles)

### Example JWT Token Structure:

```
Header (Algorithm info)
{
  "alg": "RS256",
  "typ": "JWT"
}

Payload (User info)
{
  "sub": "abc-123-def",  ← User ID
  "email": "john@example.com",
  "name": "John Doe",
  "cognito:groups": ["Customers"],
  "exp": 1634567890  ← Expiration time
}

Signature (Verification)
[Encrypted signature that proves token is genuine]
```

### Why Tokens Instead of Sessions?

**Old Way (Session-based)**:
```
User logs in → Server stores session in database
Every request → Server checks database for session
Problem: Slow, requires database lookup every time
```

**New Way (Token-based with Cognito)**:
```
User logs in → Cognito issues token
Every request → API Gateway verifies token (no database!)
Advantage: Fast, stateless, scalable
```

---

## Common Use Cases in Your Milk Delivery System

### Use Case 1: Customer Registration

**Without Cognito** (You build everything):
```javascript
- Write code to hash passwords ❌
- Store passwords securely ❌
- Handle email verification ❌
- Manage password resets ❌
- Protect against SQL injection ❌
- Comply with security standards ❌
= 100+ hours of work + security risks
```

**With Cognito**:
```javascript
// Just call Cognito API
await cognito.signUp({
  username: email,
  password: password,
  attributes: { email, name, phone }
});
// Done! ✅ Everything handled automatically
```

### Use Case 2: Protecting Customer Cart

**Problem**: How to ensure User A can't access User B's cart?

**Solution with Cognito**:
```javascript
// API Gateway automatically validates token
// Lambda receives verified user information

exports.handler = async (event) => {
  // This user ID is 100% verified by Cognito
  const userId = event.requestContext.authorizer.claims.sub;
  
  // Fetch ONLY this user's cart
  const cart = await getCartForUser(userId);
  
  // User A can never see User B's cart!
  return cart;
};
```

### Use Case 3: Role-Based Access

**Scenario**: Only delivery staff can update delivery status

**Solution**:
```javascript
// Create groups in Cognito: Customers, DeliveryStaff, Admins

// In Lambda
const userGroups = event.requestContext.authorizer.claims['cognito:groups'];

if (!userGroups.includes('DeliveryStaff')) {
  return { statusCode: 403, body: 'Not authorized' };
}

// Only delivery staff reach here
await updateDeliveryStatus(orderId, status);
```

### Use Case 4: Multi-Device Login

**Scenario**: User logs in on phone, then opens website

**How Cognito Handles It**:
```
1. Phone login → Get tokens → Store locally
2. Website login → Get NEW tokens → Store locally
3. Both work independently
4. User can logout from one device, other stays logged in
5. Refresh tokens allow staying logged in for 30 days
```

---

## Important Cognito Concepts Explained

### 1. User Pool vs Identity Pool

| Feature | User Pool | Identity Pool |
|---------|-----------|---------------|
| Purpose | Login/Signup | AWS Access |
| What it does | Manages users | Gives AWS credentials |
| When to use | Always (for user accounts) | Only if accessing S3, DynamoDB directly |
| Example | Login to your app | Upload photo to S3 from browser |

**For your milk delivery app**: You mainly need **User Pool** only!

### 2. App Client

**What is it?** 
An app client is like a key that your frontend/mobile app uses to talk to Cognito.

**Why needed?**
- Cognito needs to know which application is making requests
- Each app (web, iOS, Android) should have its own client
- Provides Client ID (like an app's ID card)

**Example**:
```
Web App Client ID: abc123
Mobile App Client ID: def456

Both apps can use same User Pool but different clients
```

### 3. Token Types

#### ID Token
- **Contains**: User information (email, name, groups)
- **Use**: To know who the user is
- **Expires**: 1 hour (default)

#### Access Token
- **Contains**: Authentication proof
- **Use**: To call APIs
- **Expires**: 1 hour (default)

#### Refresh Token
- **Contains**: Long-lived credential
- **Use**: Get new ID/Access tokens without re-login
- **Expires**: 30 days (default)

**Flow**:
```
Login → Get all 3 tokens
After 1 hour → Access token expires
Use Refresh token → Get new Access + ID tokens
After 30 days → Must login again
```

### 4. User Attributes

**What are they?**
Extra information about users stored in Cognito

**Standard attributes**:
- email (verified or not)
- phone_number
- name
- birthdate
- address
- etc.

**Custom attributes**:
- customer_tier (gold, silver, bronze)
- subscription_id
- delivery_address_id

**Example**:
```javascript
await cognito.signUp({
  username: 'john@example.com',
  password: 'Pass@123',
  attributes: {
    email: 'john@example.com',
    name: 'John Doe',
    phone_number: '+1234567890',
    'custom:customer_tier': 'gold'
  }
});
```

---

## Edge Cases and When Cognito is Required

### Edge Case 1: User Forgot Password

**Without Cognito**: You build entire flow
- Generate reset token
- Send email with link
- Verify token
- Update password securely
- Handle expired tokens

**With Cognito**: Already built-in
```javascript
// Request password reset
await cognito.forgotPassword({ Username: email });
// Cognito sends email automatically

// User enters code + new password
await cognito.confirmForgotPassword({
  Username: email,
  ConfirmationCode: code,
  Password: newPassword
});
```

### Edge Case 2: Account Verification

**Scenario**: Prevent fake email signups

**Cognito Solution**:
- Automatically sends verification email
- User must click link to activate account
- Unverified users can't fully use app

```javascript
// Check if email is verified
const user = await cognito.getUser({ AccessToken: token });
const emailVerified = user.UserAttributes.find(
  attr => attr.Name === 'email_verified'
).Value;

if (emailVerified !== 'true') {
  return 'Please verify your email first';
}
```

### Edge Case 3: Suspicious Login Detection

**Scenario**: Someone tries to hack an account

**Cognito Features**:
- Rate limiting (blocks after 5 failed attempts)
- Risk-based authentication (suspicious IP → require MFA)
- Account takeover protection
- Logs all login attempts

### Edge Case 4: Multi-Factor Authentication (MFA)

**When required**: Banking apps, sensitive data

**Cognito Solution**:
```
User logs in → Cognito sends SMS code → User enters code → Access granted

Can make MFA:
- Optional (user choice)
- Required (for all users)
- Adaptive (required for risky logins only)
```

### Edge Case 5: Token Expiration During Transaction

**Scenario**: User adding items to cart, token expires mid-session

**Solution**:
```javascript
// Frontend automatically refreshes token
try {
  await addToCart(productId);
} catch (error) {
  if (error.statusCode === 401) {
    // Token expired, refresh it
    const newToken = await refreshAuthToken();
    // Retry request with new token
    await addToCart(productId, newToken);
  }
}
```

### Edge Case 6: User Logs In on Multiple Devices

**Scenario**: User on phone and laptop simultaneously

**Cognito Behavior**:
- Each device gets its own tokens
- Both can be used independently
- Logout from one doesn't affect other
- Can revoke all devices if needed

### Edge Case 7: Social Login Integration

**Scenario**: "Sign in with Google" button

**Cognito Solution**:
- Configure Google as identity provider
- User clicks button → Redirected to Google
- Google authenticates → Returns to your app
- Cognito creates/links account automatically
- User gets token to use your app

### Edge Case 8: Data Privacy Compliance (GDPR)

**Requirements**: 
- Users must be able to delete their accounts
- Export their data
- Know what data you store

**Cognito Solution**:
```javascript
// Delete user account
await cognito.deleteUser({ AccessToken: token });
// Cognito removes all authentication data

// You handle deleting related data (orders, carts)
await deleteUserOrders(userId);
await deleteUserCart(userId);
```

---

## When Cognito is ABSOLUTELY Required

### 1. Multi-Tenant Applications
**What**: Multiple organizations using your app (e.g., multiple dairy farms)
**Why Cognito**: Isolates users per organization using User Pool Groups

### 2. Compliance Requirements
**What**: HIPAA, PCI-DSS, SOC 2 compliance
**Why Cognito**: AWS handles security certifications, you inherit compliance

### 3. Global Scale
**What**: Users from different countries
**Why Cognito**: Automatically handles millions of users, geographic redundancy

### 4. Mobile + Web + API
**What**: Multiple client types
**Why Cognito**: Single user pool for all platforms, consistent authentication

### 5. Enterprise SSO
**What**: Company employees need to login with corporate credentials
**Why Cognito**: Supports SAML, Active Directory integration

---

## Architecture: Where Cognito Fits

```
┌─────────────┐
│   User      │
│  (Browser/  │
│   Mobile)   │
└──────┬──────┘
       │
       │ 1. Login Request
       ↓
┌─────────────────┐
│  AWS Cognito    │
│   User Pool     │
│                 │
│  ✓ Validates    │
│  ✓ Returns JWT  │
└────────┬────────┘
         │
         │ 2. JWT Token
         ↓
    ┌────────────┐
    │   User     │
    │ (stores    │
    │  token)    │
    └─────┬──────┘
          │
          │ 3. API Call + Token
          ↓
    ┌──────────────┐
    │ API Gateway  │
    │              │
    │ ✓ Validates  │← Cognito Authorizer
    │   token      │
    └──────┬───────┘
           │
           │ 4. Verified Request
           ↓
    ┌─────────────┐
    │   Lambda    │
    │             │
    │ Gets userId │
    │ from token  │
    └──────┬──────┘
           │
           │ 5. Query Data
           ↓
    ┌──────────────┐
    │  DynamoDB    │
    │              │
    │ User's data  │
    └──────────────┘
```

---

## Cost Considerations

### Free Tier
- First 50,000 monthly active users: **FREE**
- After that: $0.0055 per monthly active user

### What counts as "active user"?
- User who logs in that month
- Not counted: Users who don't login

**For your milk delivery app**:
- 1,000 active users/month: FREE
- 10,000 active users/month: FREE
- 60,000 active users/month: ~$55/month
- 100,000 active users/month: ~$275/month

### Other costs:
- SMS for phone verification: $0.00006 per SMS
- Email verification: FREE (using Cognito's email)
- MFA: FREE (using SMS you pay per message)

---

## Quick Decision Tree: Do I Need Cognito?

```
Do you need user accounts?
│
├─ NO → Don't use Cognito
│       Use AWS IAM for service-to-service
│
└─ YES → Continue
    │
    Do users need to login?
    │
    ├─ NO → Don't use Cognito
    │        (But then why user accounts?)
    │
    └─ YES → Continue
        │
        Does each user have private data?
        │
        ├─ YES → USE COGNITO ✅
        │
        └─ NO → Continue
            │
            Do you need social login?
            │
            ├─ YES → USE COGNITO ✅
            │
            └─ NO → Maybe use simple auth
                     (But Cognito is still better!)
```

---

## Summary: Cognito in Simple Terms

**What it is**: A service that manages user accounts and login for you

**Why use it**: 
- Saves 100+ hours of development
- Handles security automatically
- Scales to millions of users
- Free for most apps

**When to use**:
- Any app with user accounts
- Any app requiring login
- Any app with private user data

**Your milk delivery app**: **YES, you need Cognito!**
- Customers need accounts
- Each customer has private carts/orders
- Need role-based access (customer vs delivery staff)
- Mobile + web apps need authentication

---

## Next Steps

Now that you understand Cognito, you can:

1. **Start simple**: Create User Pool, add users manually
2. **Add login**: Integrate with your frontend
3. **Protect APIs**: Add Cognito Authorizer to API Gateway
4. **Add roles**: Create groups for different user types
5. **Scale up**: Add MFA, social login, custom domains

**Remember**: Cognito handles the hard parts (security, scaling, compliance). You just configure it and use it!

---

**Want me to create**:
1. A step-by-step tutorial for setting up your first Cognito User Pool?
2. Visual diagrams showing the authentication flow?
3. Code examples for your specific milk delivery use cases?

# AWS Cognito - Basic Terminologies Explained

## Core Concepts

### 1. **User Pool** 🏊
**Simple Definition**: A container that stores all your users

**Real-world analogy**: Like a membership database for a gym
- Stores usernames, emails, passwords
- Manages sign up and sign in
- Handles verification and password resets

**Example**:
```
User Pool: "milk-delivery-users"
├── User 1: john@example.com
├── User 2: jane@example.com
└── User 3: bob@example.com
```

**When to use**: Every time you need user accounts

---

### 2. **Identity Pool** 🎫
**Simple Definition**: Converts your login into AWS access credentials

**Real-world analogy**: Like getting a visitor badge that lets you access specific rooms
- Gives temporary AWS credentials
- Allows direct access to S3, DynamoDB, etc.
- Controls what each user can do in AWS

**Example**:
```
User logs in → Gets token → Identity Pool converts it
                         → Temporary AWS credentials
                         → Can upload to S3 for 1 hour
```

**When to use**: Only if users need direct AWS service access (rare)

**Most apps only need User Pool!**

---

### 3. **App Client** 📱
**Simple Definition**: A key/ID that identifies which application is connecting to Cognito

**Real-world analogy**: Like different keys for your house - front door key, back door key
- Each app (web, mobile, backend) gets its own client
- Has a unique Client ID
- Can optionally have a Client Secret (for backend only)

**Example**:
```
App Client 1: "milk-delivery-web" (ID: abc123)
App Client 2: "milk-delivery-mobile" (ID: def456)
App Client 3: "milk-delivery-backend" (ID: ghi789)

All use same User Pool but different client IDs
```

**Why needed**: Security and tracking - Cognito knows which app made the request

---

### 4. **Authentication** 🔐
**Simple Definition**: Proving who you are (verifying identity)

**Real-world analogy**: Showing your ID card at airport security

**In Cognito**:
```
User says: "I am john@example.com, password is Pass@123"
Cognito checks: ✅ Credentials match
Result: "Yes, you are John" → Authentication successful
```

**Examples**:
- Login with email + password
- Login with Google account
- Login with fingerprint (biometric)

---

### 5. **Authorization** ✅
**Simple Definition**: Determining what you can access (permissions)

**Real-world analogy**: Your ID card opens certain doors but not others

**In Cognito**:
```
User is authenticated as: John (Customer)
John tries to: Delete another user's order ❌
Result: "You don't have permission" → Authorization failed

John tries to: View his own orders ✅
Result: "Allowed" → Authorization successful
```

**Key difference**:
- **Authentication** = Who are you?
- **Authorization** = What can you do?

---

### 6. **JWT (JSON Web Token)** 🎟️
**Simple Definition**: A secure, self-contained token that proves who you are

**Real-world analogy**: A concert ticket with your name, seat number, and expiry time

**Structure**:
```
Header.Payload.Signature

Example decoded:
{
  "sub": "user-id-123",           ← User ID
  "email": "john@example.com",    ← Email
  "exp": 1634567890,              ← Expiration time
  "cognito:groups": ["Customers"] ← User role
}
```

**Why JWT?**:
- Self-contained (has all info needed)
- Can't be tampered with (signature verification)
- No database lookup needed (fast!)

**Types in Cognito**:
1. **ID Token** - Contains user information
2. **Access Token** - Proves authentication
3. **Refresh Token** - Gets new tokens

---

### 7. **Token Types Explained**

#### **ID Token** 🪪
**Purpose**: Contains information about the user

**Analogy**: Your driver's license with photo and details

**Contains**:
- User ID (sub)
- Email
- Name
- Phone number
- Groups/roles
- Custom attributes

**Use it to**: Display user info in UI, personalize experience

**Expires**: 1 hour (default)

---

#### **Access Token** 🔑
**Purpose**: Proves the user is authenticated

**Analogy**: Hotel room key card

**Contains**:
- User ID
- Scopes (what the user can access)
- Client ID
- Expiration time

**Use it to**: Call protected APIs, access resources

**Expires**: 1 hour (default)

**Where to send**: In the `Authorization` header
```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

#### **Refresh Token** 🔄
**Purpose**: Get new Access and ID tokens without logging in again

**Analogy**: Your permanent resident card that you can use to renew temporary visas

**Contains**:
- Encrypted credential
- Long-lived validity

**Use it when**: Access token expires, instead of asking user to login again

**Expires**: 30 days (default, configurable up to 10 years!)

**Flow**:
```
Day 1: Login → Get all 3 tokens
Hour 2: Access token expires
       Use Refresh token → Get new Access + ID tokens
Day 31: Refresh token expires → Must login again
```

---

### 8. **User Attributes** 📋
**Simple Definition**: Information stored about each user

**Real-world analogy**: Fields on a registration form

**Standard Attributes** (Built-in):
```
- email
- phone_number
- name
- given_name (first name)
- family_name (last name)
- birthdate
- address
- gender
- locale (language preference)
```

**Custom Attributes** (You define):
```
- custom:customer_tier (gold, silver, bronze)
- custom:subscription_id
- custom:delivery_preferences
- custom:loyalty_points
```

**Example**:
```javascript
User: john@example.com
├── email: "john@example.com" ✅ verified
├── name: "John Doe"
├── phone_number: "+1234567890"
└── custom:customer_tier: "gold"
```

**Note**: Custom attributes must start with `custom:`

---

### 9. **User Groups** 👥
**Simple Definition**: Categories/roles to organize users

**Real-world analogy**: Job titles in a company (Manager, Employee, Intern)

**Purpose**: Authorization and access control

**Example for Milk Delivery**:
```
Group: Admins
├── Can view all orders
├── Can manage products
└── Can view analytics

Group: Customers
├── Can place orders
├── Can view own orders
└── Can manage cart

Group: DeliveryStaff
├── Can view assigned deliveries
├── Can update delivery status
└── Cannot view payment info
```

**How to use**:
```javascript
// In Lambda, check user's group
const groups = event.requestContext.authorizer.claims['cognito:groups'];

if (groups.includes('Admins')) {
  // Allow admin action
} else {
  // Deny access
}
```

---

### 10. **Cognito Authorizer** 🚪
**Simple Definition**: A guard at API Gateway that checks tokens

**Real-world analogy**: Bouncer at a club checking IDs

**What it does**:
1. Receives API request with token
2. Validates token with Cognito
3. If valid → forwards request to Lambda
4. If invalid → returns 401 Unauthorized

**Flow**:
```
User → API Gateway → Cognito Authorizer
                            ↓
                     Check token valid?
                            ↓
                    ✅ Yes → Lambda
                    ❌ No → 401 Error
```

**Configuration**:
```
API Endpoint: GET /cart
Authorizer: CognitoAuthorizer
Token Source: Authorization header
```

**Benefit**: You don't write authentication code in Lambda!

---

### 11. **MFA (Multi-Factor Authentication)** 🔐📱
**Simple Definition**: Requiring two proofs of identity instead of one

**Real-world analogy**: ATM requires card (something you have) + PIN (something you know)

**Types in Cognito**:

**SMS MFA**:
```
Step 1: Enter password ✅
Step 2: Enter SMS code sent to phone ✅
Result: Login successful
```

**TOTP MFA** (Time-based One-Time Password):
```
Step 1: Enter password ✅
Step 2: Enter code from authenticator app (Google Authenticator) ✅
Result: Login successful
```

**When to use**:
- Banking/financial apps (required)
- Sensitive data apps (recommended)
- Admin accounts (highly recommended)

**Settings**:
- **OFF** - No MFA
- **Optional** - Users choose to enable
- **Required** - All users must use MFA

---

### 12. **OAuth 2.0 & OpenID Connect (OIDC)** 🔗
**Simple Definition**: Standard protocols for authentication

**Real-world analogy**: Universal passport accepted worldwide

**OAuth 2.0**: Authorization framework
**OIDC**: Identity layer on top of OAuth

**Why it matters**: Industry standard, works with Google, Facebook, etc.

**OAuth Flows in Cognito**:

**Authorization Code Flow** (Most secure):
```
User clicks "Login" 
→ Redirected to Cognito Hosted UI
→ Enters credentials
→ Redirected back with code
→ Exchange code for tokens
```

**Implicit Flow** (Simple, less secure):
```
User clicks "Login"
→ Redirected to Cognito Hosted UI
→ Enters credentials
→ Redirected back with tokens directly
```

---

### 13. **Hosted UI** 🖥️
**Simple Definition**: Pre-built login page provided by Cognito

**Real-world analogy**: Using a template website instead of coding from scratch

**Features**:
- Ready-made login form
- Sign up form
- Forgot password flow
- Social login buttons
- Customizable logo and CSS

**When to use**:
- Quick setup (5 minutes)
- Don't want to build login UI
- Need social login

**URL format**:
```
https://your-domain.auth.us-east-1.amazoncognito.com/login
```

**Alternative**: Build custom UI and call Cognito APIs directly

---

### 14. **Federated Identity** 🌐
**Simple Definition**: Login with external providers (Google, Facebook, SAML)

**Real-world analogy**: Using your Gmail to sign into other websites

**Supported Providers**:
- **Social**: Google, Facebook, Apple, Amazon
- **Enterprise**: SAML 2.0, Active Directory
- **Custom**: Any OpenID Connect provider

**Flow**:
```
User clicks "Sign in with Google"
→ Redirected to Google
→ Google authenticates user
→ Google sends token to Cognito
→ Cognito creates/links user account
→ Returns Cognito tokens to app
```

**Benefit**: Users don't need to remember another password

---

### 15. **User Pool Domain** 🌍
**Simple Definition**: A URL where your Cognito Hosted UI lives

**Types**:

**Cognito Domain** (Free):
```
https://milk-delivery.auth.us-east-1.amazoncognito.com
```

**Custom Domain** (Professional):
```
https://auth.yourdomain.com
```

**Why needed**: For Hosted UI and OAuth redirects

---

### 16. **Callback URL / Redirect URI** 🔄
**Simple Definition**: Where to send user after successful login

**Example**:
```
User logs in at: https://auth.yourdomain.com/login
After success, redirect to: https://yourdomain.com/dashboard

Callback URL: https://yourdomain.com/dashboard
```

**Must match exactly** - Cognito rejects if different

---

### 17. **Sign-up / Sign-in** ✍️
**Sign-up**: Creating a new account
```
POST /signup
{
  "username": "john@example.com",
  "password": "Pass@123",
  "attributes": { "name": "John" }
}
```

**Sign-in**: Logging into existing account
```
POST /signin
{
  "username": "john@example.com",
  "password": "Pass@123"
}
```

---

### 18. **Email/Phone Verification** ✉️
**Simple Definition**: Confirming the email/phone belongs to the user

**Flow**:
```
1. User signs up with email
2. Cognito sends verification code
3. User enters code
4. Email marked as verified ✅
```

**Why needed**: 
- Prevent fake accounts
- Ensure communication reaches user
- Required for password reset

---

### 19. **Password Policy** 🔒
**Simple Definition**: Rules for creating passwords

**Example settings**:
```
✅ Minimum length: 8 characters
✅ Require uppercase letter
✅ Require lowercase letter
✅ Require number
✅ Require special character (!@#$%)
❌ Require symbol (optional)
```

**Custom policy example**:
```
Minimum 12 characters
At least 1 uppercase, 1 lowercase, 1 number, 1 symbol
Cannot contain username
Cannot be same as last 5 passwords
```

---

### 20. **Session** 🕐
**Simple Definition**: The period during which a user stays logged in

**Types**:

**Access Token Session**: 1 hour (default)
```
Login → Get access token → Valid for 1 hour → Expires
```

**Refresh Token Session**: 30 days (default)
```
Login → Get refresh token → Valid for 30 days
Every hour: Use refresh token to get new access token
After 30 days: Must login again
```

**Configurable**: Can set from 5 minutes to 10 years

---

### 21. **Claims** 📄
**Simple Definition**: Pieces of information inside a JWT token

**Example token claims**:
```json
{
  "sub": "abc-123",              ← Subject (User ID)
  "email": "john@example.com",   ← Email claim
  "cognito:groups": ["Customers"],← Groups claim
  "exp": 1634567890,             ← Expiration claim
  "iat": 1634564290,             ← Issued at claim
  "iss": "https://cognito..."    ← Issuer claim
}
```

**Standard claims**:
- `sub` - User ID
- `email` - Email address
- `exp` - Expiration time
- `iat` - Issued at time

**Custom claims**:
- `cognito:groups` - User groups
- `custom:customer_tier` - Custom attributes

---

### 22. **Scopes** 🎯
**Simple Definition**: Permissions that define what a token can access

**OAuth scopes in Cognito**:
```
openid     - Basic authentication
email      - Access to email address
profile    - Access to profile info
phone      - Access to phone number
aws.cognito.signin.user.admin - Full user API access
```

**Example**:
```
Access token with scopes: [openid, email, profile]
Can access: User ID, email, name
Cannot access: Phone number (scope not included)
```

---

### 23. **Pre-authentication / Post-authentication Triggers** ⚡
**Simple Definition**: Lambda functions that run before/after authentication

**Real-world analogy**: Security checks at different points of entry

**Use cases**:

**Pre-authentication**:
- Block login from specific IPs
- Require additional verification
- Check if account is suspended

**Post-authentication**:
- Log login events
- Send welcome email
- Update last login timestamp

**Example**:
```javascript
// Pre-authentication Lambda
exports.handler = async (event) => {
  const userIP = event.request.userContextData.ipAddress;
  
  if (isBlacklistedIP(userIP)) {
    throw new Error("Login blocked from this location");
  }
  
  return event;
};
```

---

### 24. **User Status** 📊
**Simple Definition**: Current state of a user account

**Possible statuses**:

```
UNCONFIRMED    - Signed up, email not verified yet
CONFIRMED      - Active, verified account ✅
ARCHIVED       - Soft deleted
COMPROMISED    - Detected suspicious activity
UNKNOWN        - Error state
RESET_REQUIRED - Must reset password
FORCE_CHANGE_PASSWORD - Must change password at next login
```

**Example flow**:
```
Sign up → UNCONFIRMED
Verify email → CONFIRMED
Admin detects fraud → COMPROMISED
```

---

### 25. **Adaptive Authentication** 🧠
**Simple Definition**: Cognito automatically detects risky logins

**How it works**:
```
Login from:
- Usual device + location → Allow ✅
- New device + different country → Require MFA 🔐
- Known malicious IP → Block ❌
```

**Risk levels**:
- **Low** - Normal login
- **Medium** - Unusual but possible
- **High** - Very suspicious

**Actions based on risk**:
- Allow
- Require MFA
- Block completely

---

## Quick Reference Cheat Sheet

| Term | Simple Meaning | Example |
|------|---------------|---------|
| User Pool | User database | Stores all your users |
| Identity Pool | AWS credential provider | Direct S3 access |
| App Client | App identifier | Web app ID: abc123 |
| Authentication | Prove who you are | Login with password |
| Authorization | What you can access | Admin vs Customer |
| JWT | Secure token | Proof of login |
| ID Token | User information | Name, email, role |
| Access Token | API access proof | Call protected APIs |
| Refresh Token | Token renewer | Get new tokens |
| User Attributes | User details | Email, name, phone |
| User Groups | User roles | Admin, Customer |
| MFA | Two-factor auth | Password + SMS code |
| Hosted UI | Pre-built login page | Cognito's login form |
| OAuth | Auth standard | Industry protocol |
| Claims | Token data | Info inside JWT |

---

## Common Confusion Cleared

### 1. User Pool vs Identity Pool
```
User Pool = Login system (ALWAYS NEED)
Identity Pool = AWS access (RARELY NEED)

99% of apps only need User Pool!
```

### 2. ID Token vs Access Token
```
ID Token = Information about user (show on profile)
Access Token = Permission to call APIs (send to backend)

Both needed, used for different purposes
```

### 3. Authentication vs Authorization
```
Authentication = Login (who you are)
Authorization = Permissions (what you can do)

First authenticate, then authorize
```

### 4. App Client vs App Client Secret
```
App Client ID = Public (can be in frontend code)
App Client Secret = Private (ONLY in backend)

Web/mobile apps = No secret
Backend services = Use secret
```

---

## Next Steps

Now that you know the terminology:

1. **Review the terms** - Read through them again
2. **Relate to your app** - Think how each applies to milk delivery
3. **Start implementing** - Begin with User Pool creation
4. **Test terminology** - Use correct terms when asking questions

---

**Want me to create**:
1. A **glossary quiz** to test your understanding?
2. **Visual diagrams** showing how terms relate to each other?
3. **Code examples** using these terms in practice?
