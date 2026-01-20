# OpenAPI Spec – Developer Deep Dive

**Graywolf Dev API**

> This document explains the OpenAPI Specification from a **backend developer's perspective** — focusing on **why each section exists**, **how it maps to code**, and **how to evolve it safely**.
> The OpenAPI file is intentionally written **only up to `paths: {}`**.

---

## 1. Why Backend Developers Should Care About OpenAPI

From a developer's POV, OpenAPI is **not documentation first** — it is:

* A **contract** between backend and frontend
* A **compile-time safety net** for APIs
* A way to avoid breaking consumers accidentally
* A tool for **automation** (SDKs, mocks, tests)

Think of it as:

> **`interface.ts` for your API surface**

---

## 2. OpenAPI Version (Why `3.0.1`)

```yaml
openapi: 3.0.1
```

### Why this matters to developers:

* Determines **tool compatibility**
* Affects validation behavior
* Impacts AWS API Gateway imports

### Why not `3.1.x` (yet)?

* Some tools still partially support 3.1
* AWS API Gateway is more stable with 3.0.x
* 3.0.1 avoids unexpected tooling issues

**Rule of thumb:**

> Upgrade OpenAPI version **only when tooling requires it**

---

## 3. `info` – Ownership, Versioning, and Accountability

```yaml
info:
  title: Graywolf Dev API
  description: >
    Graywolf Dev API is a backend service developed by Jimmy Patel,
    designed for cloud-native and serverless applications.
    The API supports automation workflows, internal tools,
    and scalable backend integrations using AWS and modern
    backend technologies.
  version: 0.0.1
```

### Why developers need this:

* Shows **who owns the API**
* Helps when multiple services exist
* Critical for internal discovery
* Required for publishing & tooling

### Versioning (developer rules)

* Use **semantic versioning**
* Increment:

  * `PATCH` → bug fix, no contract change
  * `MINOR` → backward-compatible change
  * `MAJOR` → breaking change

---

## 4. Contact & License (Not Optional in Real Teams)

```yaml
contact:
  name: Jimmy Patel
  url: https://www.jimmypatel.tech
  email: contact@jimmypatel.tech
license:
  name: MIT
  url: https://opensource.org/licenses/MIT
```

### Why devs care:

* When something breaks → **who to ping**
* Needed for:

  * Open-source compliance
  * Internal governance
  * Enterprise audits

---

## 5. `servers` – Mapping Spec to Runtime Environments

```yaml
servers:
  - url: http://localhost:3000
    description: Local development server
  - url: https://dev.api.graywolf.io
    description: Development environment
  - url: https://api.graywolf.io
    description: Production environment
```

### Developer insights:

* This does **not deploy anything**
* It tells tools:

  * Where to send requests
  * Which environment is active

### Best practice:

* Never hardcode environment URLs in clients
* Let tooling read them from OpenAPI

---

## 6. Why `paths` Is Empty (And That's Intentional)

```yaml
paths: {}
```

### From a developer POV:

This means:

* API surface is **not finalized**
* You are working **spec-first**
* You are preventing accidental endpoint sprawl

### When to add paths:

Add endpoints only when:

* Contract is agreed
* Input/output shape is known
* Auth strategy is decided

> Empty `paths` = controlled API evolution

---

## 7. Final OpenAPI File (Developer-Approved)

```yaml
openapi: 3.0.1

info:
  title: Graywolf Dev API
  description: >
    Graywolf Dev API is a backend service developed by Jimmy Patel,
    designed for cloud-native and serverless applications.
    The API supports automation workflows, internal tools,
    and scalable backend integrations using AWS and modern
    backend technologies.
  version: 0.0.1
  termsOfService: https://www.jimmypatel.tech
  contact:
    name: Jimmy Patel
    url: https://www.jimmypatel.tech
    email: contact@jimmypatel.tech
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: http://localhost:3000
    description: Local development server
  - url: https://dev.api.graywolf.io
    description: Development environment
  - url: https://api.graywolf.io
    description: Production environment

paths: {}
```

---

## 8. How This Maps to Your Actual Backend Code

| OpenAPI           | Code Equivalent                  |
| ----------------- | -------------------------------- |
| `paths`           | Express routes / Lambda handlers |
| `schemas`         | DTOs / TypeScript interfaces     |
| `securitySchemes` | Auth middleware                  |
| `servers`         | Deployment targets               |
| `version`         | Release tags                     |

---

## 9. Recommended Next Steps (Dev Workflow)

1. Lock down **auth strategy**
2. Define **core schemas**
3. Add `/health` endpoint
4. Validate OpenAPI in CI
5. Generate client types
