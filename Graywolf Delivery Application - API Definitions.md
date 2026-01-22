# OpenAPI Specification Guide

## Overview

OpenAPI Specification (OAS) is a standard, language-agnostic interface description for HTTP APIs. It allows both humans and computers to discover and understand the capabilities of a service without requiring access to source code or additional documentation.

**Current Version:** 3.1.0 (compatible with 3.0.x)

## Basic Structure

An OpenAPI document is written in YAML or JSON format and follows this basic structure:

```yaml
openapi: 3.0.0
info:
  title: API Title
  version: 1.0.0
servers:
  - url: https://api.example.com/v1
paths:
  /resource:
    get:
      summary: Get resource
      responses:
        '200':
          description: Success
```

---

## Document Structure

### 1. OpenAPI Object (Root)

The root document object contains metadata and configuration.

```yaml
openapi: 3.0.0
info: {...}
servers: [...]
paths: {...}
components: {...}
security: [...]
tags: [...]
externalDocs: {...}
```

**Required Fields:**
- `openapi` - OpenAPI version (e.g., "3.0.0")
- `info` - API metadata
- `paths` - Available paths and operations

---

### 2. Info Object

Provides metadata about the API.

```yaml
info:
  title: My API
  description: |
    This is a multi-line description
    using YAML literal block scalar
  version: 1.0.0
  termsOfService: https://example.com/terms
  contact:
    name: API Support
    url: https://example.com/support
    email: support@example.com
  license:
    name: Apache 2.0
    url: https://www.apache.org/licenses/LICENSE-2.0.html
```

**Required Fields:**
- `title` - API name
- `version` - API version

---

### 3. Servers Object

Specifies API server URLs and variables.

```yaml
servers:
  - url: https://{environment}.example.com/v1
    description: Main server
    variables:
      environment:
        default: api
        enum:
          - api
          - api-staging
          - api-dev
  - url: http://localhost:3000
    description: Local development server
```

---

### 4. Paths Object

Defines available endpoints and their operations.

```yaml
paths:
  /users:
    get:
      summary: List all users
      operationId: listUsers
      tags:
        - Users
      parameters:
        - name: limit
          in: query
          description: Maximum number of results
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
        '400':
          description: Bad request
        '500':
          description: Internal server error
    
    post:
      summary: Create a user
      operationId: createUser
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserInput'
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '400':
          description: Invalid input

  /users/{userId}:
    parameters:
      - name: userId
        in: path
        required: true
        description: User ID
        schema:
          type: string
    
    get:
      summary: Get user by ID
      operationId: getUserById
      tags:
        - Users
      responses:
        '200':
          description: User found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          description: User not found
    
    put:
      summary: Update user
      operationId: updateUser
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserInput'
      responses:
        '200':
          description: User updated
        '404':
          description: User not found
    
    delete:
      summary: Delete user
      operationId: deleteUser
      tags:
        - Users
      responses:
        '204':
          description: User deleted
        '404':
          description: User not found
```

---

### 5. Parameters

Parameters can be defined in different locations.

#### Path Parameters

```yaml
parameters:
  - name: userId
    in: path
    required: true
    description: Unique user identifier
    schema:
      type: string
      format: uuid
```

#### Query Parameters

```yaml
parameters:
  - name: filter
    in: query
    required: false
    description: Filter criteria
    schema:
      type: string
  - name: page
    in: query
    required: false
    schema:
      type: integer
      default: 1
  - name: sort
    in: query
    required: false
    schema:
      type: string
      enum:
        - asc
        - desc
```

#### Header Parameters

```yaml
parameters:
  - name: X-API-Key
    in: header
    required: true
    description: API authentication key
    schema:
      type: string
```

#### Cookie Parameters

```yaml
parameters:
  - name: sessionId
    in: cookie
    required: true
    schema:
      type: string
```

---

### 6. Request Body

Describes the request body for operations like POST, PUT, PATCH.

```yaml
requestBody:
  description: User object to be created
  required: true
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/UserInput'
      examples:
        user1:
          summary: Example user
          value:
            name: John Doe
            email: john@example.com
            age: 30
    application/xml:
      schema:
        $ref: '#/components/schemas/UserInput'
    multipart/form-data:
      schema:
        type: object
        properties:
          file:
            type: string
            format: binary
          metadata:
            type: string
```

---

### 7. Responses

Defines possible responses from an operation.

```yaml
responses:
  '200':
    description: Successful operation
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/User'
        examples:
          user:
            summary: A user example
            value:
              id: 12345
              name: John Doe
              email: john@example.com
    headers:
      X-Rate-Limit:
        description: Requests per hour allowed
        schema:
          type: integer
      X-Expires-After:
        description: Date/time when token expires
        schema:
          type: string
          format: date-time
  
  '400':
    description: Bad request
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Error'
  
  '404':
    description: Resource not found
  
  'default':
    description: Unexpected error
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Error'
```

---

### 8. Components Object

Reusable components for schemas, parameters, responses, etc.

```yaml
components:
  schemas:
    User:
      type: object
      required:
        - id
        - name
        - email
      properties:
        id:
          type: string
          format: uuid
          readOnly: true
        name:
          type: string
          minLength: 1
          maxLength: 100
        email:
          type: string
          format: email
        age:
          type: integer
          minimum: 0
          maximum: 150
        role:
          type: string
          enum:
            - admin
            - user
            - guest
          default: user
        createdAt:
          type: string
          format: date-time
          readOnly: true
        metadata:
          type: object
          additionalProperties: true
      example:
        id: 550e8400-e29b-41d4-a716-446655440000
        name: John Doe
        email: john@example.com
        age: 30
        role: user
    
    UserInput:
      type: object
      required:
        - name
        - email
      properties:
        name:
          type: string
        email:
          type: string
          format: email
        age:
          type: integer
    
    Error:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: integer
        message:
          type: string
        details:
          type: array
          items:
            type: string
  
  parameters:
    PageParam:
      name: page
      in: query
      description: Page number
      schema:
        type: integer
        minimum: 1
        default: 1
    
    LimitParam:
      name: limit
      in: query
      description: Items per page
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
  
  responses:
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    
    Unauthorized:
      description: Unauthorized access
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
  
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
    
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://example.com/oauth/authorize
          tokenUrl: https://example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
            admin: Admin access
```

---

## Schema Data Types

### Primitive Types

```yaml
# String
type: string
minLength: 1
maxLength: 100
pattern: '^[A-Za-z]+$'

# String with format
type: string
format: date           # YYYY-MM-DD
format: date-time      # RFC 3339
format: email
format: uuid
format: uri
format: hostname
format: ipv4
format: ipv6

# Integer
type: integer
minimum: 0
maximum: 100
multipleOf: 5

# Number
type: number
minimum: 0.0
maximum: 100.0
exclusiveMinimum: true

# Boolean
type: boolean

# Null
type: 'null'
nullable: true  # OpenAPI 3.0.x
```

### Arrays

```yaml
type: array
items:
  type: string
minItems: 1
maxItems: 10
uniqueItems: true

# Array of objects
type: array
items:
  $ref: '#/components/schemas/User'

# Array with multiple types (OpenAPI 3.1)
type: array
items:
  oneOf:
    - type: string
    - type: integer
```

### Objects

```yaml
type: object
required:
  - name
  - email
properties:
  name:
    type: string
  email:
    type: string
  age:
    type: integer
additionalProperties: false  # No extra properties allowed

# Free-form object
type: object
additionalProperties: true

# Map/Dictionary
type: object
additionalProperties:
  type: string
```

### Enums

```yaml
type: string
enum:
  - pending
  - approved
  - rejected
default: pending
```

### Composition

```yaml
# allOf - Combines schemas (inheritance)
allOf:
  - $ref: '#/components/schemas/BaseUser'
  - type: object
    properties:
      adminLevel:
        type: integer

# oneOf - Exactly one schema must match
oneOf:
  - $ref: '#/components/schemas/Cat'
  - $ref: '#/components/schemas/Dog'
discriminator:
  propertyName: petType

# anyOf - One or more schemas must match
anyOf:
  - type: string
  - type: integer

# not - Schema must not match
not:
  type: string
```

---

## Security

### Applying Security

```yaml
# Global security
security:
  - ApiKeyAuth: []

# Operation-level security
paths:
  /users:
    get:
      security:
        - BearerAuth: []
        - OAuth2:
            - read
            - write
```

### Security Scheme Types

```yaml
components:
  securitySchemes:
    # API Key
    ApiKey:
      type: apiKey
      in: header  # or query, cookie
      name: X-API-Key
    
    # HTTP Basic
    BasicAuth:
      type: http
      scheme: basic
    
    # Bearer Token
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    
    # OAuth2
    OAuth2:
      type: oauth2
      flows:
        implicit:
          authorizationUrl: https://example.com/oauth/authorize
          scopes:
            read: Read access
            write: Write access
        password:
          tokenUrl: https://example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
        clientCredentials:
          tokenUrl: https://example.com/oauth/token
          scopes:
            read: Read access
        authorizationCode:
          authorizationUrl: https://example.com/oauth/authorize
          tokenUrl: https://example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
    
    # OpenID Connect
    OpenID:
      type: openIdConnect
      openIdConnectUrl: https://example.com/.well-known/openid-configuration
```

---

## Tags

Organize operations into logical groups.

```yaml
tags:
  - name: Users
    description: User management operations
    externalDocs:
      description: Find more info
      url: https://example.com/docs/users
  - name: Products
    description: Product catalog operations

paths:
  /users:
    get:
      tags:
        - Users
      summary: List users
```

---

## External Documentation

```yaml
externalDocs:
  description: Find more information here
  url: https://example.com/docs
```

---

## Examples

### Complete API Example

```yaml
openapi: 3.0.0
info:
  title: E-Commerce API
  version: 1.0.0
  description: API for managing an e-commerce platform
  contact:
    name: API Support
    email: support@example.com

servers:
  - url: https://api.example.com/v1
    description: Production server
  - url: https://staging-api.example.com/v1
    description: Staging server

tags:
  - name: Products
    description: Product operations
  - name: Orders
    description: Order operations

paths:
  /products:
    get:
      tags:
        - Products
      summary: List products
      parameters:
        - $ref: '#/components/parameters/PageParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Product'
    
    post:
      tags:
        - Products
      summary: Create product
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ProductInput'
      responses:
        '201':
          description: Product created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Product'

components:
  schemas:
    Product:
      type: object
      required:
        - id
        - name
        - price
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        description:
          type: string
        price:
          type: number
          minimum: 0
        currency:
          type: string
          default: USD
        inStock:
          type: boolean
    
    ProductInput:
      type: object
      required:
        - name
        - price
      properties:
        name:
          type: string
        description:
          type: string
        price:
          type: number
        currency:
          type: string
  
  parameters:
    PageParam:
      name: page
      in: query
      schema:
        type: integer
        default: 1
    
    LimitParam:
      name: limit
      in: query
      schema:
        type: integer
        default: 20
  
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer

security:
  - BearerAuth: []
```

---

## Best Practices

1. **Use meaningful operation IDs** - Makes code generation easier
2. **Reference reusable components** - Use `$ref` for schemas, parameters, responses
3. **Add descriptions** - Document all fields, parameters, and operations
4. **Include examples** - Help users understand expected data
5. **Version your API** - Use semantic versioning
6. **Use tags** - Organize operations logically
7. **Define error responses** - Document all possible error codes
8. **Specify required fields** - Make it clear what's mandatory
9. **Use enums** - Constrain values where appropriate
10. **Validate your spec** - Use tools like Swagger Editor

---

## Tools

- **Swagger Editor** - Online editor with validation
- **Swagger UI** - Interactive API documentation
- **Redoc** - Alternative documentation renderer
- **Postman** - Import OpenAPI specs for testing
- **OpenAPI Generator** - Generate client/server code
- **Spectral** - Linting tool for OpenAPI specs

---

## Resources

- **OpenAPI Specification:** https://spec.openapis.org/oas/latest.html
- **Swagger Tools:** https://swagger.io/tools/
- **OpenAPI Initiative:** https://www.openapis.org/
