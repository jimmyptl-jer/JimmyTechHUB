```text
============================================================
              SQL REVISION SHEET (TERMINAL EDITION)
============================================================

CONTENTS
--------
1. SQL Categories (DDL, DML, DCL, TCL)
2. Basic Commands (SELECT, INSERT, UPDATE, DELETE)
3. Filtering & Comparison Operators
4. Logical Operators (AND, OR, NOT)
5. Sorting, Limiting, Aliases
6. Aggregate Functions & GROUP BY / HAVING
7. Joins (INNER, LEFT, RIGHT, FULL, SELF)
8. Subqueries & EXISTS
9. CREATE / ALTER / DROP (Tables & Constraints)
10. Data Types (Common)
11. Views
12. Indexes
13. Transactions (BEGIN/COMMIT/ROLLBACK)
14. Null Handling
15. Typical Real-World Query Patterns

============================================================
1. SQL CATEGORIES
============================================================

DDL – Data Definition Language
  - CREATE     : create table/db/index/view
  - ALTER      : modify structure
  - DROP       : delete structure
  - TRUNCATE   : remove all rows (structure kept)

DML – Data Manipulation Language
  - SELECT     : read data
  - INSERT     : insert new rows
  - UPDATE     : modify rows
  - DELETE     : delete rows

DCL – Data Control Language
  - GRANT      : give permissions
  - REVOKE     : remove permissions

TCL – Transaction Control Language
  - COMMIT     : save changes
  - ROLLBACK   : undo changes
  - SAVEPOINT  : partial rollback point

============================================================
2. BASIC COMMANDS
============================================================

SELECT  – read data
INSERT  – add data
UPDATE  – modify data
DELETE  – remove data

----------------------------------------
SELECT
----------------------------------------
Get all columns:
  SELECT * FROM customers;

Get specific columns:
  SELECT id, name, city
  FROM customers;

With filter:
  SELECT id, name
  FROM customers
  WHERE city = 'Mumbai';

----------------------------------------
INSERT
----------------------------------------
Insert one row:
  INSERT INTO customers (name, email, city)
  VALUES ('Jimmy', 'jimmy@example.com', 'Erlangen');

Insert multiple rows:
  INSERT INTO products (sku, name, price)
  VALUES
    ('P100', 'Mouse', 499),
    ('P101', 'Keyboard', 899);

----------------------------------------
UPDATE
----------------------------------------
Update specific row(s):
  UPDATE customers
  SET city = 'Berlin'
  WHERE id = 5;

Increase price by 10%:
  UPDATE products
  SET price = price * 1.10
  WHERE category = 'Electronics';

WARNING:
  UPDATE table SET col = ...;   -- without WHERE updates ALL rows

----------------------------------------
DELETE
----------------------------------------
Delete specific rows:
  DELETE FROM customers
  WHERE id = 10;

Delete ALL rows:
  DELETE FROM customers;        -- dangerous in production

TRUNCATE TABLE customers;       -- faster, resets identity (depends on DB)

============================================================
3. FILTERING & COMPARISON OPERATORS
============================================================

Used in WHERE and HAVING clauses.

Comparison operators:
  =     equal
  <> or !=   not equal
  >     greater than
  <     less than
  >=    greater or equal
  <=    less or equal
  BETWEEN   between two values (inclusive)
  IN        in a list of values
  LIKE      pattern with % and _
  IS NULL   value is NULL
  IS NOT NULL value is not NULL

Examples:
  WHERE amount > 1000;
  WHERE age >= 18;
  WHERE status <> 'Cancelled';

Range:
  WHERE amount BETWEEN 1000 AND 5000;

Multiple values:
  WHERE city IN ('Mumbai', 'Delhi', 'Bangalore');

Patterns:
  WHERE name LIKE 'J%';        -- starts with J
  WHERE name LIKE '%son';      -- ends with 'son'
  WHERE name LIKE '%mit%';     -- contains 'mit'

Null:
  WHERE phone IS NULL;
  WHERE email IS NOT NULL;

============================================================
4. LOGICAL OPERATORS (AND / OR / NOT)
============================================================

Combine conditions:

AND – all conditions must be TRUE
OR  – at least one condition must be TRUE
NOT – negates a condition

Examples:
  WHERE city = 'Mumbai'
    AND age > 18;

  WHERE city = 'Mumbai'
     OR city = 'Delhi';

  WHERE NOT (status = 'Cancelled');

Mixing AND & OR – use parentheses:
  WHERE country = 'India'
    AND (city = 'Mumbai' OR city = 'Delhi');

============================================================
5. SORTING, LIMITING, ALIASES
============================================================

ORDER BY – sort results
  ORDER BY column ASC;   -- ascending (default)
  ORDER BY column DESC;  -- descending

Examples:
  SELECT * FROM customers
  ORDER BY name ASC;

  SELECT * FROM orders
  ORDER BY order_date DESC, amount DESC;

LIMIT / TOP – get only some rows
  MySQL / Postgres:
    SELECT * FROM orders
    ORDER BY order_date DESC
    LIMIT 10;

  SQL Server:
    SELECT TOP 10 * FROM orders
    ORDER BY order_date DESC;

Aliases – rename columns or tables for readability:
  SELECT
    c.name AS customer_name,
    o.amount AS order_amount
  FROM customers AS c
  JOIN orders AS o ON o.customer_id = c.id;

Short form:
  FROM customers c
  JOIN orders o ON ...

============================================================
6. AGGREGATE FUNCTIONS & GROUPING
============================================================

Aggregate functions:
  COUNT(*)   count rows
  SUM(col)   total
  AVG(col)   average
  MIN(col)   minimum
  MAX(col)   maximum

GROUP BY – group rows with same values
HAVING   – filter groups (after grouping)

Example: count orders per customer
  SELECT customer_id, COUNT(*) AS total_orders
  FROM orders
  GROUP BY customer_id;

Example: total sales per city (only cities with > 1 lakh)
  SELECT city, SUM(amount) AS total_sales
  FROM orders
  GROUP BY city
  HAVING SUM(amount) > 100000;

Difference:
  WHERE  – filters BEFORE GROUP BY
  HAVING – filters AFTER GROUP BY

============================================================
7. JOINS
============================================================

Joins combine rows from multiple tables via relationships.

Assume:
  customers(id, name, city)
  orders(id, customer_id, amount)

----------------------------------------
INNER JOIN – only matching rows
----------------------------------------
  SELECT c.name, o.id AS order_id, o.amount
  FROM customers c
  INNER JOIN orders o ON o.customer_id = c.id;

Returns: customers that HAVE orders.

----------------------------------------
LEFT JOIN – all rows from left + matches from right
----------------------------------------
  SELECT c.name, o.id AS order_id, o.amount
  FROM customers c
  LEFT JOIN orders o ON o.customer_id = c.id;

Returns:
  - all customers
  - NULL for order columns if no orders

----------------------------------------
RIGHT JOIN – all rows from right + matches from left
----------------------------------------
  SELECT c.name, o.id AS order_id, o.amount
  FROM customers c
  RIGHT JOIN orders o ON o.customer_id = c.id;

(Used less often than LEFT JOIN.)

----------------------------------------
FULL OUTER JOIN
----------------------------------------
Not available in MySQL (but in Postgres/SQL Server).

Returns all rows from both sides, matching where possible.

----------------------------------------
SELF JOIN
----------------------------------------
Table joined with itself (e.g. employees + managers).

  SELECT e.name AS employee, m.name AS manager
  FROM employees e
  LEFT JOIN employees m ON e.manager_id = m.id;

============================================================
8. SUBQUERIES & EXISTS
============================================================

Subquery – query inside another query.

Types:
  - In SELECT
  - In WHERE
  - In FROM (derived table)

----------------------------------------
Subquery in WHERE with IN
----------------------------------------
Customers with at least one order:

  SELECT *
  FROM customers
  WHERE id IN (
    SELECT DISTINCT customer_id
    FROM orders
  );

----------------------------------------
EXISTS – checks if subquery has rows
----------------------------------------
  SELECT *
  FROM customers c
  WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.customer_id = c.id
  );

NOT EXISTS – no related rows
  SELECT *
  FROM customers c
  WHERE NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.customer_id = c.id
  );

============================================================
9. CREATE / ALTER / DROP
============================================================

----------------------------------------
CREATE TABLE
----------------------------------------
  CREATE TABLE customers (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    email        VARCHAR(100) UNIQUE,
    city         VARCHAR(100),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

----------------------------------------
ALTER TABLE
----------------------------------------
Add a column:
  ALTER TABLE customers
  ADD COLUMN phone VARCHAR(20);

Modify column type:
  ALTER TABLE customers
  MODIFY COLUMN name VARCHAR(150);

Drop column:
  ALTER TABLE customers
  DROP COLUMN phone;

Add a constraint (MySQL style):
  ALTER TABLE customers
  ADD CONSTRAINT uq_customers_email UNIQUE (email);

----------------------------------------
DROP TABLE
----------------------------------------
  DROP TABLE customers;

Removes structure + data.

TRUNCATE TABLE customers;
  - keeps structure
  - deletes all rows
  - faster, often resets AUTO_INCREMENT

============================================================
10. DATA TYPES (COMMON)
============================================================

Numeric:
  INT, BIGINT
  DECIMAL(p,s) → money, accurate
  FLOAT, DOUBLE → approximate

String:
  VARCHAR(n)   → variable length
  CHAR(n)      → fixed length
  TEXT         → large text

Date & Time:
  DATE
  TIME
  DATETIME / TIMESTAMP

Boolean (MySQL):
  TINYINT(1)

Example:
  price DECIMAL(10,2)   -- up to 99999999.99

============================================================
11. VIEWS
============================================================

View – saved SELECT query (virtual table).

Create view:
  CREATE VIEW active_customers AS
  SELECT id, name, email
  FROM customers
  WHERE is_active = 1;

Use view:
  SELECT * FROM active_customers
  WHERE city = 'Mumbai';

Drop view:
  DROP VIEW active_customers;

============================================================
12. INDEXES
============================================================

Index – helps speed up read operations (SELECT), but can slow down inserts/updates.

Create index:
  CREATE INDEX idx_customers_city
  ON customers(city);

Composite index:
  CREATE INDEX idx_orders_customer_date
  ON orders(customer_id, order_date);

Use EXPLAIN (MySQL/Postgres) to see if an index is used:
  EXPLAIN
  SELECT * FROM customers
  WHERE city = 'Mumbai';

============================================================
13. TRANSACTIONS
============================================================

Transaction – group of statements executed as a single unit.

Properties: ACID
  A – Atomicity
  C – Consistency
  I – Isolation
  D – Durability

Example:
  START TRANSACTION;      -- or BEGIN;

  UPDATE accounts
  SET balance = balance - 1000
  WHERE id = 1;

  UPDATE accounts
  SET balance = balance + 1000
  WHERE id = 2;

  COMMIT;   -- save both updates

If something goes wrong:
  ROLLBACK; -- undo all changes since START TRANSACTION

SAVEPOINT (some DBs):
  SAVEPOINT sp1;
  -- do some work
  ROLLBACK TO sp1;

============================================================
14. NULL HANDLING
============================================================

NULL = unknown / no value

Important rules:
  - NULL is not 0, not empty string, not 'NULL'
  - Comparisons with NULL result in NULL (treated as false in WHERE)

Wrong:
  WHERE email = NULL;

Correct:
  WHERE email IS NULL;

Examples:
  WHERE phone IS NOT NULL;
  WHERE discount IS NULL OR discount = 0;

Aggregates & NULL:
  - COUNT(*) counts all rows
  - COUNT(column) counts only non-NULL values

============================================================
15. TYPICAL REAL-WORLD QUERY PATTERNS
============================================================

1) Top N recent rows:
   SELECT *
   FROM orders
   ORDER BY order_date DESC
   LIMIT 10;

2) Count per group (e.g., orders per status):
   SELECT status, COUNT(*) AS total
   FROM orders
   GROUP BY status;

3) Filtered group (customers with more than 5 orders):
   SELECT customer_id, COUNT(*) AS total_orders
   FROM orders
   GROUP BY customer_id
   HAVING COUNT(*) > 5;

4) Join with filter:
   SELECT c.name, o.id AS order_id, o.amount
   FROM customers c
   JOIN orders o ON o.customer_id = c.id
   WHERE o.status = 'PAID';

5) Find duplicates by email:
   SELECT email, COUNT(*) AS cnt
   FROM customers
   GROUP BY email
   HAVING COUNT(*) > 1;

6) Pagination (MySQL/Postgres):
   -- Page 2, 10 rows per page
   SELECT *
   FROM customers
   ORDER BY id
   LIMIT 10 OFFSET 10;

7) Search by partial text:
   SELECT *
   FROM products
   WHERE name LIKE '%laptop%';

8) Get rows with missing foreign key data:
   SELECT o.*
   FROM orders o
   LEFT JOIN customers c ON c.id = o.customer_id
   WHERE c.id IS NULL;

9) Conditional logic (CASE):
   SELECT
     id,
     amount,
     CASE
       WHEN amount < 1000 THEN 'SMALL'
       WHEN amount < 10000 THEN 'MEDIUM'
       ELSE 'LARGE'
     END AS order_size
   FROM orders;

10) Date range (last 7 days, MySQL-style):
   SELECT *
   FROM orders
   WHERE order_date >= CURDATE() - INTERVAL 7 DAY;

============================================================
END OF SQL REVISION SHEET
============================================================

TIP:
- Save this as: sql_revision.txt
- Open in terminal with:
    less sql_revision.txt
    or
    vim sql_revision.txt
```

---

## 1. Primary Key & Foreign Key (the basics)

### Primary Key (PK)

- A **column or set of columns** that **uniquely identifies** a row.
- Cannot be `NULL`.
- One primary key per table.

Example – `customers` table:

```sql
CREATE TABLE customers (
    id           INT PRIMARY KEY,       -- PK
    name         VARCHAR(100),
    email        VARCHAR(100) UNIQUE
);
```

- `id` is the **primary key**.
- Each customer has a unique `id`.

---

### Foreign Key (FK)

- A column that **refers to the primary key** of another table.
- Creates a **relationship** between two tables.
- The FK value must either:

  - match an existing PK value in the parent table, or
  - be `NULL` (if allowed).

Example – `orders` table:

```sql
CREATE TABLE orders (
    id           INT PRIMARY KEY,
    customer_id  INT,
    order_date   DATE,
    amount       DECIMAL(10,2),
    CONSTRAINT fk_orders_customer
      FOREIGN KEY (customer_id) REFERENCES customers(id)
);
```

- `orders.customer_id` is a **foreign key**.
- It points to `customers.id`.
- You **cannot** insert `customer_id = 999` if there is no customer with `id = 999`.

---

### In plain English

- **Primary Key** → “Who are you?”
- **Foreign Key** → “Who do you belong to / refer to?”

---

## 2. Types of Relationships

### 2.1 One-to-One (1 : 1)

> One row in Table A ↔ one row in Table B

Example:

- One employee has **one** HR profile.
- `employees` table + `employee_profiles` table.

#### Tables

```sql
CREATE TABLE employees (
    id          INT PRIMARY KEY,
    name        VARCHAR(100),
    email       VARCHAR(100) UNIQUE
);

CREATE TABLE employee_profiles (
    id          INT PRIMARY KEY,
    employee_id INT UNIQUE,   -- UNIQUE makes it truly 1:1
    address     VARCHAR(255),
    dob         DATE,
    CONSTRAINT fk_profile_employee
      FOREIGN KEY (employee_id) REFERENCES employees(id)
);
```

#### Why `UNIQUE` on `employee_id`?

- Without `UNIQUE`, multiple profiles could point to one employee → that becomes 1–many.
- With `UNIQUE`:

  - 1 employee → at most 1 profile
  - 1 profile → belongs to exactly 1 employee

#### ASCII picture

```text
employees (1) ───── (1) employee_profiles
  PK id                  PK id
                          FK employee_id → employees.id (UNIQUE)
```

**Use cases:**

- Splitting sensitive/optional data into a separate table.
- Performance/normalization reasons (e.g., big JSON configs or large text).

---

### 2.2 One-to-Many (1 : N) – the most common

> One row in Table A ↔ many rows in Table B

Example:

- One **customer** can have **many orders**.
- But each **order** belongs to exactly **one customer**.

#### Tables

```sql
CREATE TABLE customers (
    id      INT PRIMARY KEY,
    name    VARCHAR(100)
);

CREATE TABLE orders (
    id           INT PRIMARY KEY,
    customer_id  INT,
    order_date   DATE,
    amount       DECIMAL(10,2),
    CONSTRAINT fk_orders_customer
      FOREIGN KEY (customer_id) REFERENCES customers(id)
);
```

#### ASCII picture

```text
customers (1) ───────< orders (many)
   PK id                PK id
                        FK customer_id → customers.id
```

- “crow’s foot” (`<`) on the “many” side.

#### Example queries

All orders of a particular customer:

```sql
SELECT o.*
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE c.id = 10;
```

Customer + their order amount:

```sql
SELECT c.name, o.id AS order_id, o.amount
FROM customers c
JOIN orders o ON o.customer_id = c.id;
```

**Use cases:**

- Customer → Orders
- Order → Order Items
- Blog User → Posts
- Department → Employees

Basically: object → many related child objects.

---

### 2.3 Many-to-Many (M : N)

> Many rows in A ↔ many rows in B

Relational databases **don’t support this directly**.
We implement it using a **junction (bridge) table**.

Example:

- One **student** can join many **courses**.
- One **course** can have many **students**.

#### Step 1: main tables

```sql
CREATE TABLE students (
    id    INT PRIMARY KEY,
    name  VARCHAR(100)
);

CREATE TABLE courses (
    id    INT PRIMARY KEY,
    name  VARCHAR(100)
);
```

#### Step 2: junction table

```sql
CREATE TABLE student_courses (
    student_id INT,
    course_id  INT,
    enrollment_date DATE,
    PRIMARY KEY (student_id, course_id),  -- composite PK
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id)  REFERENCES courses(id)
);
```

#### ASCII picture

```text
students                     courses
   PK id                        PK id
     ^                            ^
     |                            |
     |                            |
     +-------- student_courses ----+
               PK (student_id, course_id)
               FK student_id → students.id
               FK course_id  → courses.id
```

Now relationships:

- 1 student → many rows in `student_courses`
- 1 course → many rows in `student_courses`
- Together this represents Many-to-Many.

#### Example query: all courses of a student

```sql
SELECT s.name AS student, c.name AS course
FROM students s
JOIN student_courses sc ON sc.student_id = s.id
JOIN courses c          ON sc.course_id = c.id
WHERE s.id = 5;
```

#### Example query: all students in a course

```sql
SELECT c.name AS course, s.name AS student
FROM courses c
JOIN student_courses sc ON sc.course_id = c.id
JOIN students s         ON sc.student_id = s.id
WHERE c.id = 3;
```

**Use cases:**

- Students ↔ Courses
- Products ↔ Tags
- Users ↔ Roles
- Doctors ↔ Patients (via Appointments)

---

## 3. How Relationships + Joins Work Together

Think like this:

- PK/FK = how data is **stored & constrained**
- JOIN = how data is **read across tables**

Example (One-to-Many: Customer → Orders):

```sql
SELECT c.id, c.name, o.id AS order_id, o.amount
FROM customers c
JOIN orders o
  ON o.customer_id = c.id;
```

Example (Many-to-Many: Students ↔ Courses):

```sql
SELECT s.name AS student, c.name AS course
FROM students s
JOIN student_courses sc ON sc.student_id = s.id
JOIN courses c          ON sc.course_id = c.id;
```

---

## 4. Tiny Terminal Cheatsheet

You can literally paste this into your notes:

```text
DATABASE RELATIONSHIPS (SQL) – QUICK REFERENCE
----------------------------------------------

1) PRIMARY KEY (PK)
   - Uniquely identifies a row
   - Not NULL
   - Example: customers.id

2) FOREIGN KEY (FK)
   - Column that points to another table’s PK
   - Enforces relationship & data integrity
   - Example: orders.customer_id → customers.id

3) ONE-TO-ONE (1:1)
   - One row in A ↔ one row in B
   - Implement: FK in child with UNIQUE
   - Example: employees.id ↔ employee_profiles.employee_id (UNIQUE FK)

4) ONE-TO-MANY (1:N)
   - One row in A ↔ many rows in B
   - Implement: FK in child table
   - Example: customers.id → orders.customer_id

5) MANY-TO-MANY (M:N)
   - Many rows in A ↔ many rows in B
   - Implement: junction table with two FKs
   - Example:
       students.id → student_courses.student_id
       courses.id  → student_courses.course_id
```

```text
════════════════════════════════════════════════════════════════════════════════════════════════════════════
                                    MEGA ERP - COMPREHENSIVE ENTITY RELATIONSHIP DIAGRAM
════════════════════════════════════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         CORE SYSTEM TABLES                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────┐
│              users               │
├──────────────────────────────────┤
│ PK  id                 INTEGER   │
│     username           VARCHAR   │
│     email              VARCHAR   │
│     password_hash      VARCHAR   │
│     role               VARCHAR   │   -- e.g. 'admin','sales','accounts'
│     is_active          BOOLEAN   │
│     created_at         TIMESTAMP │
│     updated_at         TIMESTAMP │
└──────────────────────────────────┘
         │
         │ (created_by / approved_by relationships to multiple tables)
         │
         ├─────────────────────────────────────────────────────────────────────────────────────────────┐
         │                                                                                             │
         ▼                                                                                             ▼
  (sales_orders, invoices, payments, purchase_orders, goods_receipts, stock_movements, journal_entries, ...)


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      REFERENCE & MASTER DATA                                            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────┐       ┌──────────────────────────────────┐       ┌───────────────────┐
│           countries              │       │           currencies             │       │     tax_rates     │
├──────────────────────────────────┤       ├──────────────────────────────────┤       ├───────────────────┤
│ PK  country_code      CHAR(2)    │       │ PK  currency_code    CHAR(3)     │       │ PK  id    INTEGER │
│     name              VARCHAR    │       │     name             VARCHAR     │       │     name  VARCHAR │
│     iso_numeric       CHAR(3)    │       │     symbol           VARCHAR     │       │     rate  DEC(5,2)│
│     phone_code        VARCHAR    │       │     decimal_places   INTEGER     │       │ FK  country_code  │
│     is_active         BOOLEAN    │       │     is_active        BOOLEAN     │       │     effective_from│
└──────────────────────────────────┘       └──────────────────────────────────┘       │     effective_to  │
         ▲                                          ▲                                 │     is_active     │
         │                                          │                                 └───────────────────┘
         │                                          │                                          ▲
         │                                          │                                          │
         │                                          │                                          │
         │                                          │                                    (used by products,
         │                                          │                                     sales_order_items,
         │                                          │                                     invoice_items,
         │                                          │                                     purchase_order_items)


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         ADDRESS MANAGEMENT                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│                  addresses                       │
├──────────────────────────────────────────────────┤
│ PK  id                    INTEGER                │
│     address_line1         VARCHAR                │
│     address_line2         VARCHAR                │
│     city                  VARCHAR                │
│     state                 VARCHAR                │
│     postal_code           VARCHAR                │
│ FK  country_code  ──────> countries.country_code │
│     latitude              DECIMAL                │
│     longitude             DECIMAL                │
│     is_active             BOOLEAN                │
│     created_at            TIMESTAMP              │
└──────────────────────────────────────────────────┘
                    │
                    │ (referenced by multiple entities)
                    │
     ┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
     ▼                               ▼                               ▼                               ▼
(customers.billing_address)  (customers.shipping_address)   (suppliers.address)             (warehouses.address)


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     CUSTOMER MANAGEMENT MODULE                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│                              customers                                │
├───────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                               │
│ UQ  customer_code               VARCHAR                               │
│     name                        VARCHAR                               │
│     email                       VARCHAR                               │
│     phone                       VARCHAR                               │
│     mobile                      VARCHAR                               │
│     tax_id                      VARCHAR                               │
│ FK  billing_address_id   ─────> addresses.id                          │
│ FK  shipping_address_id  ─────> addresses.id                          │
│ FK  currency_code        ─────> currencies.currency_code              │
│     credit_limit                DECIMAL                               │
│     payment_terms_days          INTEGER                               │
│     is_active                   BOOLEAN                               │
│     created_at                  TIMESTAMP                             │
│     updated_at                  TIMESTAMP                             │
└───────────────────────────────────────────────────────────────────────┘
                    │
                    │ (customer has many related records)
                    │
          ┌──────────┴──────────────┬───────────────┬─────────────────────────┐
          ▼                         ▼               ▼                         ▼
┌───────────────────┐     ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│   sales_orders    │     │     invoices      │  │     payments      │  │ customer_contacts │
└───────────────────┘     └───────────────────┘  └───────────────────┘  └───────────────────┘


┌────────────────────────────────────────────────────┐
│             customer_contacts                      │
├────────────────────────────────────────────────────┤
│ PK  id                     INTEGER                 │
│ FK  customer_id     ─────> customers.id            │
│     name                   VARCHAR                 │
│     email                  VARCHAR                 │
│     phone                  VARCHAR                 │
│     position               VARCHAR                 │
│     is_primary             BOOLEAN                 │
│     notes                  TEXT                    │
└────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     SUPPLIER MANAGEMENT MODULE                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│                              suppliers                                │
├───────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                               │
│ UQ  supplier_code               VARCHAR                               │
│     name                        VARCHAR                               │
│     email                       VARCHAR                               │
│     phone                       VARCHAR                               │
│     mobile                      VARCHAR                               │
│     tax_id                      VARCHAR                               │
│ FK  address_id           ─────> addresses.id                          │
│ FK  currency_code        ─────> currencies.currency_code              │
│     payment_terms_days          INTEGER                               │
│     is_active                   BOOLEAN                               │
│     created_at                  TIMESTAMP                             │
│     updated_at                  TIMESTAMP                             │
└───────────────────────────────────────────────────────────────────────┘
                    │
                    │ (supplier has many purchase_orders, supplier_invoices, supplier_payments)
                    │
          ┌──────────┴──────────────┬─────────────────────┬─────────────────────┐
          ▼                         ▼                     ▼                     ▼
┌───────────────────┐     ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│  purchase_orders  │     │ supplier_invoices │  │ supplier_payments │  │  supplier_contacts│
└───────────────────┘     └───────────────────┘  └───────────────────┘  └───────────────────┘

(You can model supplier_invoices & supplier_payments similar to customer invoices/payments if needed)


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    PRODUCT CATALOG MODULE                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│          product_categories                      │
├──────────────────────────────────────────────────┤
│ PK  id                    INTEGER                │
│     name                  VARCHAR                │
│     description           TEXT                   │
│ FK  parent_id      ─────> product_categories.id  │  ◄── SELF REFERENCE (category tree)
│     level                 INTEGER                │
│     path                  VARCHAR                │
│     is_active             BOOLEAN                │
│     created_at            TIMESTAMP              │
└──────────────────────────────────────────────────┘
                    │
                    │ (category has many products)
                    │
                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                                products                                      │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│ UQ  sku                         VARCHAR                                       │
│     name                        VARCHAR                                       │
│     description                 TEXT                                          │
│     unit_of_measure             VARCHAR                                       │
│     sales_price                 DECIMAL                                       │
│     purchase_price              DECIMAL                                       │
│     standard_cost               DECIMAL                                       │
│ FK  category_id          ─────> product_categories.id                         │
│ FK  tax_rate_id          ─────> tax_rates.id                                  │
│     reorder_level               INTEGER                                       │
│     reorder_quantity            INTEGER                                       │
│     min_stock_level             INTEGER                                       │
│     max_stock_level             INTEGER                                       │
│     is_active                   BOOLEAN                                       │
│     is_sellable                 BOOLEAN                                       │
│     is_purchasable              BOOLEAN                                       │
│     created_at                  TIMESTAMP                                     │
│     updated_at                  TIMESTAMP                                     │
└───────────────────────────────────────────────────────────────────────────────┘
                    │
                    │ (product used across modules)
                    │
      ┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
      ▼              ▼              ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ sales_order │ │ invoice_    │ │ purchase_   │ │ goods_      │ │ stock_      │ │ bom_        │
│ items       │ │ items       │ │ order_items │ │ receipt_items│ │ movements   │ │ components  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘


┌────────────────────────────────────────────┐
│             bom_components                 │
├────────────────────────────────────────────┤
│ PK  id                       INTEGER       │
│ FK  parent_product_id ────> products.id    │ -- finished good
│ FK  component_product_id -> products.id    │ -- raw/child item
│     quantity_per_parent      DECIMAL       │
│     scrap_factor             DECIMAL       │
│     is_active                BOOLEAN       │
└────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  WAREHOUSE & INVENTORY MODULE                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│                warehouses                        │
├──────────────────────────────────────────────────┤
│ PK  id                    INTEGER                │
│ UQ  code                  VARCHAR                │
│     name                  VARCHAR                │
│ FK  address_id     ─────> addresses.id           │
│     manager_name          VARCHAR                │
│     capacity              DECIMAL                │
│     is_active             BOOLEAN                │
│     created_at            TIMESTAMP              │
└──────────────────────────────────────────────────┘
                    │
                    │ (warehouse has many stock_movements, goods_receipts, locations)
                    │
          ┌──────────┴──────────────┬─────────────────────┐
          ▼                         ▼                     ▼
┌───────────────────┐     ┌───────────────────┐   ┌───────────────────┐
│  stock_movements  │     │  goods_receipts   │   │ warehouse_locations│
└───────────────────┘     └───────────────────┘   └───────────────────┘

┌────────────────────────────────────────────────────┐
│           warehouse_locations                      │
├────────────────────────────────────────────────────┤
│ PK  id                     INTEGER                 │
│ FK  warehouse_id    ─────> warehouses.id           │
│     code                   VARCHAR                 │ -- e.g. RACK-A1
│     description            VARCHAR                 │
│     is_active              BOOLEAN                 │
└────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────────┐
│                          stock_movements                                      │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│ FK  product_id           ─────> products.id                                   │
│ FK  warehouse_id         ─────> warehouses.id                                 │
│ FK  location_id          ─────> warehouse_locations.id (optional)             │
│     movement_type               VARCHAR   -- ('IN','OUT','ADJUST','TRANSFER') │
│     quantity                    DECIMAL                                       │
│     unit_cost                   DECIMAL                                       │
│     movement_date               TIMESTAMP                                     │
│     reference_type              VARCHAR   -- ('SO','PO','GRN','INV','ADJ',..) │
│     reference_id                INTEGER                                       │
│     reference_number            VARCHAR                                       │
│     notes                       TEXT                                          │
│ FK  created_by           ─────> users.id                                      │
│     created_at                  TIMESTAMP                                     │
└───────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       SALES ORDER MODULE                                                │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────┐
│                              sales_orders                                     │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│ UQ  order_number                VARCHAR                                       │
│ FK  customer_id          ─────> customers.id                                  │
│     order_date                  DATE                                          │
│     required_date               DATE                                          │
│     shipped_date                DATE                                          │
│     status                      VARCHAR  -- ('DRAFT','CONFIRMED','SHIPPED',   │
│                                              'INVOICED','CANCELLED')          │
│ FK  shipping_address_id  ─────> addresses.id                                  │
│ FK  billing_address_id   ─────> addresses.id                                  │
│     subtotal                    DECIMAL                                       │
│     discount_amount             DECIMAL                                       │
│     tax_amount                  DECIMAL                                       │
│     shipping_amount             DECIMAL                                       │
│     total_amount                DECIMAL                                       │
│ FK  currency_code        ─────> currencies.currency_code                      │
│     exchange_rate               DECIMAL                                       │
│     payment_terms               VARCHAR                                       │
│     notes                       TEXT                                          │
│ FK  created_by           ─────> users.id                                      │
│     created_at                  TIMESTAMP                                     │
│     updated_at                  TIMESTAMP                                     │
└───────────────────────────────────────────────────────────────────────────────┘
                    │
                    │ (sales_order has many items)
                    │
                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          sales_order_items                                    │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│ FK  sales_order_id       ─────> sales_orders.id                               │
│     line_no                     INTEGER                                       │
│ FK  product_id           ─────> products.id                                   │
│     description                 TEXT                                          │
│     quantity                    DECIMAL                                       │
│     unit_price                  DECIMAL                                       │
│     discount_percent            DECIMAL                                       │
│     discount_amount             DECIMAL                                       │
│ FK  tax_rate_id          ─────> tax_rates.id                                  │
│     tax_amount                  DECIMAL                                       │
│     line_total                  DECIMAL                                       │
│     shipped_quantity            DECIMAL                                       │
│     invoiced_quantity           DECIMAL                                       │
│     notes                       TEXT                                          │
└───────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       INVOICING MODULE                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────┐
│                              invoices                                         │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│ UQ  invoice_number              VARCHAR                                       │
│ FK  sales_order_id       ─────> sales_orders.id  (NULLABLE)                   │
│ FK  customer_id          ─────> customers.id                                  │
│     invoice_date                DATE                                          │
│     due_date                    DATE                                          │
│     status                      VARCHAR  -- ('DRAFT','SENT','PARTIAL',        │
│                                              'PAID','OVERDUE','CANCELLED')    │
│ FK  billing_address_id   ─────> addresses.id                                  │
│     subtotal                    DECIMAL                                       │
│     discount_amount             DECIMAL                                       │
│     tax_amount                  DECIMAL                                       │
│     total_amount                DECIMAL                                       │
│     paid_amount                 DECIMAL                                       │
│     balance_due                 DECIMAL                                       │
│ FK  currency_code        ─────> currencies.currency_code                      │
│     exchange_rate               DECIMAL                                       │
│     payment_terms               VARCHAR                                       │
│     notes                       TEXT                                          │
│ FK  created_by           ─────> users.id                                      │
│     created_at                  TIMESTAMP                                     │
│     updated_at                  TIMESTAMP                                     │
└───────────────────────────────────────────────────────────────────────────────┘
                    │
                    │ (invoice has many items, payments, credit_notes)
                    │
     ┌───────────────┬───────────────────────────┬───────────────────────────┐
     ▼               ▼                           ▼                           ▼
┌──────────────┐ ┌────────────────┐      ┌────────────────┐           ┌────────────────┐
│invoice_items │ │   payments     │      │  credit_notes  │           │  journal_links │
└──────────────┘ └────────────────┘      └────────────────┘           └────────────────┘


┌───────────────────────────────────────────────────────────────────────────────┐
│                          invoice_items                                        │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│ FK  invoice_id           ─────> invoices.id                                   │
│     line_no                     INTEGER                                       │
│ FK  product_id           ─────> products.id                                   │
│ FK  sales_order_item_id  ─────> sales_order_items.id  (NULLABLE)              │
│     description                 TEXT                                          │
│     quantity                    DECIMAL                                       │
│     unit_price                  DECIMAL                                       │
│     discount_percent            DECIMAL                                       │
│     discount_amount             DECIMAL                                       │
│ FK  tax_rate_id          ─────> tax_rates.id                                  │
│     tax_amount                  DECIMAL                                       │
│     line_total                  DECIMAL                                       │
│     notes                       TEXT                                          │
└───────────────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────────┐
│                              payments                                         │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│     payment_number              VARCHAR                                       │
│ FK  invoice_id           ─────> invoices.id                                   │
│ FK  customer_id          ─────> customers.id                                  │
│     payment_date                DATE                                          │
│     amount                      DECIMAL                                       │
│     payment_method              VARCHAR  -- ('CASH','CHEQUE','CARD',          │
│                                              'BANK_TRANSFER','OTHER')         │
│     reference_number            VARCHAR                                       │
│     bank_account                VARCHAR                                       │
│     cheque_number               VARCHAR                                       │
│     cheque_date                 DATE                                          │
│ FK  currency_code        ─────> currencies.currency_code                      │
│     exchange_rate               DECIMAL                                       │
│     notes                       TEXT                                          │
│ FK  created_by           ─────> users.id                                      │
│     created_at                  TIMESTAMP                                     │
└───────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PURCHASE ORDER MODULE                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────┐
│                          purchase_orders                                      │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│ UQ  po_number                   VARCHAR                                       │
│ FK  supplier_id          ─────> suppliers.id                                  │
│     order_date                  DATE                                          │
│     expected_delivery_date      DATE                                          │
│     actual_delivery_date        DATE                                          │
│     status                      VARCHAR  -- ('DRAFT','SENT','CONFIRMED',      │
│                                              'PARTIAL_RECEIVED','RECEIVED',   │
│                                              'CLOSED','CANCELLED')            │
│ FK  delivery_address_id  ─────> addresses.id                                  │
│     subtotal                    DECIMAL                                       │
│     discount_amount             DECIMAL                                       │
│     tax_amount                  DECIMAL                                       │
│     shipping_amount             DECIMAL                                       │
│     total_amount                DECIMAL                                       │
│ FK  currency_code        ─────> currencies.currency_code                      │
│     exchange_rate               DECIMAL                                       │
│     payment_terms               VARCHAR                                       │
│     notes                       TEXT                                          │
│ FK  created_by           ─────> users.id                                      │
│ FK  approved_by          ─────> users.id (nullable)                           │
│     approved_at                 TIMESTAMP                                     │
│     created_at                  TIMESTAMP                                     │
│     updated_at                  TIMESTAMP                                     │
└───────────────────────────────────────────────────────────────────────────────┘
                    │
                    │ (purchase_order has many items)
                    │
                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          purchase_order_items                                 │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│ FK  purchase_order_id    ─────> purchase_orders.id                            │
│     line_no                     INTEGER                                       │
│ FK  product_id           ─────> products.id                                   │
│     description                 TEXT                                          │
│     quantity                    DECIMAL                                       │
│     unit_price                  DECIMAL                                       │
│     discount_percent            DECIMAL                                       │
│     discount_amount             DECIMAL                                       │
│ FK  tax_rate_id          ─────> tax_rates.id                                  │
│     tax_amount                  DECIMAL                                       │
│     line_total                  DECIMAL                                       │
│     received_quantity           DECIMAL                                       │
│     expected_delivery_date      DATE                                          │
│     notes                       TEXT                                          │
└───────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   GOODS RECEIPT MODULE                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────┐
│                          goods_receipts                                       │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│ UQ  grn_number                  VARCHAR                                       │
│ FK  purchase_order_id    ─────> purchase_orders.id                            │
│ FK  supplier_id          ─────> suppliers.id                                  │
│ FK  warehouse_id         ─────> warehouses.id                                 │
│     receipt_date                DATE                                          │
│     status                      VARCHAR  -- ('DRAFT','RECEIVED','INSPECTED',  │
│                                              'APPROVED','POSTED')             │
│     supplier_invoice_no         VARCHAR                                       │
│     supplier_invoice_date       DATE                                          │
│     delivery_note_no            VARCHAR                                       │
│     vehicle_number              VARCHAR                                       │
│     received_by                 VARCHAR                                       │
│     inspection_status           VARCHAR                                       │
│     notes                       TEXT                                          │
│ FK  created_by           ─────> users.id                                      │
│ FK  approved_by          ─────> users.id (nullable)                           │
│     approved_at                 TIMESTAMP                                     │
│     created_at                  TIMESTAMP                                     │
│     updated_at                  TIMESTAMP                                     │
└───────────────────────────────────────────────────────────────────────────────┘
                    │
                    │ (goods_receipt has many items → also drives stock_movements IN)
                    │
                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          goods_receipt_items                                  │
├───────────────────────────────────────────────────────────────────────────────┤
│ PK  id                          INTEGER                                       │
│ FK  goods_receipt_id     ─────> goods_receipts.id                             │
│     line_no                     INTEGER                                       │
│ FK  product_id           ─────> products.id                                   │
│ FK  purchase_order_item_id ──> purchase_order_items.id                        │
│     ordered_quantity            DECIMAL                                       │
│     received_quantity           DECIMAL                                       │
│     accepted_quantity           DECIMAL                                       │
│     rejected_quantity           DECIMAL                                       │
│     unit_cost                   DECIMAL                                       │
│     batch_number                VARCHAR                                       │
│     serial_number               VARCHAR                                       │
│     expiry_date                 DATE                                          │
│     quality_status              VARCHAR  -- ('PASSED','FAILED','PENDING')     │
│     notes                       TEXT                                          │
└───────────────────────────────────────────────────────────────────────────────┘
         ▲              ▲              ▲
         │              │              │
         │              │              ├───────────> purchase_order_items.id
         │              └──────────────────────────> products.id
         └─────────────────────────────────────────> goods_receipts.id

(Each accepted item typically generates an 'IN' row in stock_movements)


┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ACCOUNTING / GENERAL LEDGER                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│               gl_accounts                  │
├────────────────────────────────────────────┤
│ PK  id                       INTEGER       │
│     code                     VARCHAR       │ -- e.g. '1000-CASH'
│     name                     VARCHAR       │
│     account_type             VARCHAR       │ -- 'ASSET','LIABILITY','INCOME',...
│     parent_id                INTEGER (FK→gl_accounts.id, optional)           │
│     is_active                BOOLEAN       │
└────────────────────────────────────────────┘


┌────────────────────────────────────────────┐
│             journal_entries                │
├────────────────────────────────────────────┤
│ PK  id                       INTEGER       │
│     journal_number           VARCHAR (UQ)  │
│     entry_date               DATE          │
│     description              VARCHAR       │
│     source_module            VARCHAR       │ -- 'AR','AP','INV','GL', etc.
│     source_reference_type    VARCHAR       │ -- 'INVOICE','PAYMENT','GRN',...
│     source_reference_id      INTEGER       │
│     posted                   BOOLEAN       │
│ FK  created_by        ─────> users.id      │
│     created_at               TIMESTAMP     │
└────────────────────────────────────────────┘
                    │
                    │ (one journal_entry has many journal_lines)
                    ▼
┌────────────────────────────────────────────┐
│              journal_lines                 │
├────────────────────────────────────────────┤
│ PK  id                       INTEGER       │
│ FK  journal_entry_id  ─────> journal_entries.id │
│     line_no                  INTEGER       │
│ FK  gl_account_id     ─────> gl_accounts.id│
│     debit                    DECIMAL       │
│     credit                   DECIMAL       │
│     description              VARCHAR       │
└────────────────────────────────────────────┘


════════════════════════════════════════════════════════════════════════════════════════════════════════════
                                      END OF MEGA ERP ASCII ERD
════════════════════════════════════════════════════════════════════════════════════════════════════════════

# 🖥️ SQL DATATYPES — TERMINAL CHEATSHEET

## 2.11 `CREATE TABLE ... FOREIGN KEY` – Linking ERP tables

Your example:

```sql
CREATE TABLE orders (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    customer_id  INT,
    order_date   DATE,
    amount       DECIMAL(10,2),
    CONSTRAINT fk_orders_customer
      FOREIGN KEY (customer_id) REFERENCES customers(id)
);
```

In ERP:
- `orders.customer_id` → `customers.id`
- This means:
  - You cannot create an order for a non-existing customer
  - You cannot (by default) delete a customer who still has orders (unless `ON DELETE CASCADE` or you drop FK)

More ERP FK examples:

```sql
CREATE TABLE order_items (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    order_id   INT NOT NULL,
    product_id INT NOT NULL,
    quantity   INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_order_items_order
      FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_order_items_product
      FOREIGN KEY (product_id) REFERENCES products(id)
);
```

```sql
CREATE TABLE payments (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    order_id   INT NOT NULL,
    amount     DECIMAL(10,2) NOT NULL,
    paid_on    DATE NOT NULL,
    method     VARCHAR(20),
    CONSTRAINT fk_payments_order
      FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

### With cascading (important in ERP):

```sql
FOREIGN KEY (order_id) REFERENCES orders(id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
```

- `ON DELETE CASCADE` → delete order → its items & payments also deleted
  - Useful for test data or when you allow deleting whole orders

- `ON DELETE RESTRICT` (default) → you cannot delete order if it has items/payments

> **Design decision in ERP:**
> - Usually **master data** (customers, products) use `RESTRICT` (don't allow deleting if used)
> - Child tables like `order_items`, `payments` often use `CASCADE` from their parent `orders`

---

## 2.12 `ALTER TABLE ... DROP FOREIGN KEY` – Breaking a relationship

Before dropping an FK, first **find its name:**

```sql
SHOW CREATE TABLE orders\G
```

Look for something like:

```text
CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
```

Then:

```sql
ALTER TABLE orders
DROP FOREIGN KEY fk_orders_customer;
```

ERP use cases:
- You want to **change** the FK to add `ON DELETE CASCADE` or `SET NULL`
- You are going to **drop the parent table** (e.g. redesigning schema)
- During a **data migration**, you temporarily remove constraints

Example – changing FK behavior:

```sql
ALTER TABLE orders
DROP FOREIGN KEY fk_orders_customer;

ALTER TABLE orders
ADD CONSTRAINT fk_orders_customer
FOREIGN KEY (customer_id) REFERENCES customers(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;
```

**⚠️ Once you drop FK:**
- DB no longer protects referential integrity
- You could insert `orders.customer_id = 9999` even if that customer doesn't exist

---

## 2.13 `RENAME TABLE` – Renaming ERP modules safely

```sql
RENAME TABLE customers TO clients;
```

In ERP, you might:
- Change `orders` → `sales_orders`
- `suppliers` → `vendors`
- `payments` → `customer_payments`

Example:

```sql
RENAME TABLE orders TO sales_orders;
```

**Important:**
- Foreign keys stay connected automatically (they reference table ID, not just name)
- But **all code** (backend, reports, procedures) must be updated to use new name

---

## 2.14 `TRUNCATE TABLE` – Clear ERP transactional data

```sql
TRUNCATE TABLE orders;
```

This:
- Deletes **all rows** from `orders`
- Resets `AUTO_INCREMENT` counter
- Faster than `DELETE FROM orders;`

ERP real-life uses:
- In **development/testing**, reset `orders`, `order_items`, `payments` but keep table structure
- End-to-end test runs where you want a fresh DB

**⚠️ In production ERP:**
- Be **extremely careful**
- You usually _never_ truncate core tables like `orders`, `invoices`, `payments` in a live system

Also: if `order_items` has FK to `orders` with `ON DELETE CASCADE`, truncating `orders` may fail (MySQL treats TRUNCATE like DROP+CREATE; FKs can block it). You might need to:

1. `TRUNCATE TABLE order_items;`
2. `TRUNCATE TABLE orders;`

---

## 2.15 `DROP TABLE` – Remove an ERP table completely

```sql
DROP TABLE orders;
```

This:
- Deletes the table **structure + all data + indexes + constraints**

Safer version:

```sql
DROP TABLE IF EXISTS orders;
```

ERP context:
- Dropping test tables (`temp_import`, `staging_orders`)
- Redesigning part of schema (e.g., replacing `old_payments` with new structure)

**⚠️ Before dropping a table with relations:**
- You must **drop foreign keys** in other tables that reference it (or drop those child tables first)

Example:

```sql
DROP TABLE order_items;   -- child
DROP TABLE orders;        -- parent
```

Or:

```sql
ALTER TABLE order_items DROP FOREIGN KEY fk_order_items_order;
DROP TABLE orders;
```

---

# 3. BASIC DATA COMMANDS (DML)

## 📌 What is DML?

DML = **Data Manipulation Language**  
Used to **write, read, modify, and delete actual data** stored inside tables.

DML does NOT change table structure — that's DDL's job.

### DML includes:
- **INSERT** — Add new records
- **SELECT** — Retrieve data
- **UPDATE** — Modify data
- **DELETE** — Remove data

### In ERP systems:

DML is used **every second** by:
- Sales Module
- Purchasing Module
- Inventory Module
- Accounting Module
- HR/Payroll Module
- CRM Module
- Warehouse Module

---

# 🔶 3.1 INSERT — Add New Rows Into ERP Tables (Deep)

## ✔ Purpose of INSERT in ERP

INSERT is used whenever the business creates something new:
- New **customer**
- New **supplier/vendor**
- New **product**
- New **sales order**
- New **purchase order**
- New **invoice**
- New **payment**
- New **stock movement**

INSERT is the **foundation** of ERP transactions.

---

## ✔ Basic INSERT (Single Row)

```sql
INSERT INTO customers (name, email, city)
VALUES ('Jimmy Patel', 'jimmy@example.com', 'Erlangen');
```

### 🔍 What happens internally:

1. A new row is created in `customers`
2. `id` (AUTO_INCREMENT PK) is generated
3. `created_at` timestamp is automatically filled
4. Constraints checked:
   - UNIQUE email?
   - NOT NULL fields?
   - Data types valid?

### 🔥 ERP Example:

Creating a new customer before making a sales order.

---

## ✔ INSERT Multiple Rows (Bulk Import)

```sql
INSERT INTO customers (name, email, city)
VALUES
 ('Alice', 'alice@example.com', 'Mumbai'),
 ('Bob',   'bob@example.com',   'Delhi');
```

### 🔍 Real ERP Use Case:

- Importing **thousands of customers** from Excel
- Bulk uploading **products** from a supplier
- Initial stock setup
- Migrating data from old ERP to new ERP

### ✔ Performance Tip:

Use multi-value INSERT for performance — fewer round trips to DB.

---

## ✔ INSERT with NULLS

```sql
INSERT INTO customers (name)
VALUES ('Unknown Customer');
```

✓ Allowed if columns allow NULL

❌ Not allowed if columns have NOT NULL or UNIQUE constraints.

---

## ✔ INSERT Violations Explained (ERP Context)

### 1️⃣ UNIQUE Violation

Trying to insert a customer with an email already in DB:

```
ERROR 1062 (23000): Duplicate entry 'alice@example.com' for key 'email'
```

**Solution:**
- Correct data
- Remove duplicates
- Allow NULL emails if business rules allow

---

### 2️⃣ FOREIGN KEY Violation

**Bad:**

```sql
INSERT INTO orders (customer_id, order_date)
VALUES (9999, '2025-02-01');   -- Customer does NOT exist
```

**Error:**

```
Cannot add or update a child row: a foreign key fails
```

This prevents corrupted ERP data.

---

## ✔ INSERT…SELECT (copy data)

```sql
INSERT INTO new_products (name, price)
SELECT name, price FROM products
WHERE price > 1000;
```

Used for:
- Data backup
- Archiving
- Migration
- Splitting big ERP tables

---

# 🔶 3.2 SELECT — Read ERP Data (Very Deep Level)

SELECT is the **most important** SQL command in all ERP systems.

Every screen you see in SAP, Oracle, NetSuite, Odoo, Dynamics is built from SELECT queries.

---

## ✔ Basic SELECT

```sql
SELECT * FROM customers;
```

Shows all customers.

**⚠ Never use SELECT \* in production**

- Fetches unnecessary data
- Slower
- Breaks API code if columns change

---

## ✔ SELECT Specific Columns

```sql
SELECT id, name, city
FROM customers
WHERE city = 'Mumbai';
```

### 🔍 ERP Use Case:

Used for:
- Delivery routing
- City-wise sales
- Customer segmentation
- Assigned sales reps

---

## ✔ JOINs in ERP (MOST IMPORTANT PART!)

ERP = **massive interlinked tables**

### Example: All Orders With Customer Names

```sql
SELECT o.id, c.name, o.order_date, o.total_amount
FROM orders o
JOIN customers c ON c.id = o.customer_id;
```

### Why JOINs matter in ERP:

- Orders → Customer
- Order Items → Product
- Purchase Orders → Supplier
- Invoices → Currency
- Goods Receipt → Warehouse
- Payments → Orders
- Ledger → Accounts

ERP relies on **hundreds of JOIN queries** per second.

---

## ✔ Filtering (WHERE)

```sql
SELECT * FROM products
WHERE stock_quantity < reorder_level;
```

Used in inventory management:
- Trigger auto purchase orders
- Identify shortages
- Generate warehouse alerts

---

## ✔ Sorting

```sql
SELECT name, total_amount
FROM customers
ORDER BY total_amount DESC;
```

Used for:
- Top customers report
- ABC analysis
- Sales leaderboards

---

## ✔ Grouping & Aggregation (ERP Analytics)

```sql
SELECT customer_id, COUNT(*) AS total_orders
FROM orders
GROUP BY customer_id;
```

ERP use:
- Count orders per customer
- Total spend
- Profit per product
- Inventory movement summary

---

# 🔶 3.3 UPDATE — Modify Existing ERP Data (Deep Detail)

UPDATE is powerful but dangerous.

---

## ✔ Basic Update

```sql
UPDATE customers
SET city = 'Berlin'
WHERE id = 1;
```

### ERP use cases:

- Customer moved
- Correcting wrong phone/email
- Updating tax information
- Changing customer category

---

## ✔ Updating Many Rows at Once (Bulk Updates)

```sql
UPDATE customers
SET credit_limit = credit_limit * 1.10
WHERE city = 'Mumbai';
```

### ERP use case:

- Increase credit limit region-wise
- Update product price after inflation
- Correct wrong tax code
- Set inactive customers

---

## ✔ UPDATE with Joins (MOST USED IN ERP)

```sql
UPDATE products p
JOIN product_categories c ON p.category_id = c.id
SET p.price = p.price * 1.05
WHERE c.name = 'Electronics';
```

Used for:
- Mass price updates
- Mass category updates
- Changing warehouses for entire product groups

---

## ✔ Updating Order Totals

```sql
UPDATE orders o
JOIN (
  SELECT order_id, SUM(line_total) AS total
  FROM order_items
  GROUP BY order_id
) t ON o.id = t.order_id
SET o.total_amount = t.total;
```

ERP systems constantly recalculate totals.

---

# 🔶 3.4 DELETE — Remove Rows (ERP Best Practices)

DELETE is **dangerous** because ERP data is critical.

---

## ✔ Delete Specific Row

```sql
DELETE FROM customers
WHERE id = 3;
```

### BUT in ERP:

Deleting master data is **not allowed** if related records exist.

**Why?**

Because:
- A customer used in orders cannot be deleted
- A product used in invoices cannot be deleted
- A supplier used in purchase orders cannot be deleted

ERP maintains **data integrity forever**.

---

## ✔ Delete With Relationships (May Fail)

If orders table has:

```sql
FOREIGN KEY (customer_id) REFERENCES customers(id)
```

Then:

```sql
DELETE FROM customers WHERE id = 1;
```

= ❌ **Error**  
Because orders still reference that customer.

**ERP solution:**

- Use `is_active` flag instead of hard delete

```sql
UPDATE customers SET is_active = 0 WHERE id = 1;
```

---

## ✔ Delete ALL rows

```sql
DELETE FROM customers;
```

### NEVER in production

Safe only in:
- Development
- Unit tests
- Resetting demo environment

---

## ✔ TRUNCATE (Faster but more dangerous)

```sql
TRUNCATE TABLE customers;
```

### Behavior:

- Auto-increment resets
- Cannot be rolled back
- FKs may block it

ERP systems **never truncate core tables**.

---

# ⭐ DML in ERP — Real-Life Workflows

Here are real DML sequences used in a functioning ERP:

---

## ✔ Sales Workflow

1️⃣ Insert customer  
2️⃣ Insert sales order  
3️⃣ Insert order items  
4️⃣ Update stock (inventory OUT)  
5️⃣ Insert invoice  
6️⃣ Insert payment  
7️⃣ Update order status  

---

## ✔ Purchase Workflow

1️⃣ Insert supplier  
2️⃣ Insert purchase order  
3️⃣ Insert purchase order items  
4️⃣ Insert goods receipt  
5️⃣ Update product stock (inventory IN)  
6️⃣ Insert supplier invoice  
7️⃣ Insert supplier payment  

---

## ✔ Inventory Adjustment

1️⃣ Insert stock movement  
2️⃣ Update product quantity  
3️⃣ Log audit trail  

---

# ⭐ Final DML Cheat Sheet (ERP Version)

```
--------------------- INSERT ---------------------
Adds new customers, orders, products, payments, items

--------------------- SELECT ---------------------
Reads data across ERP modules using JOIN, WHERE, GROUP BY

--------------------- UPDATE ---------------------
Modifies existing master & transactional data
Used for price changes, status updates, corrections

--------------------- DELETE ---------------------
Removes data (rare in ERP)
Usually replaced by soft deletion (is_active=0)

--------------------------------------------------
```

---

# 4. QUERYING WITH FILTERS, SORTING, LIMIT

This section teaches how to **extract data intelligently** using:
- Conditions
- Comparisons
- Sorting
- Pagination

These are used **thousands of times per second** inside ERP systems.

---

# 🔶 4.1 WHERE — Filtering Data Using Conditions

The `WHERE` clause helps you select only the rows that meet a condition.

ERP systems need `WHERE` for:
- Customer search
- Order search
- Product search
- Inventory filtering
- Supplier filtering
- Payment tracking
- Reports and dashboards

---

## ⭐ 4.1.1 Equality

```sql
SELECT * FROM customers
WHERE city = 'Mumbai';
```

### ERP Use Case:

- List all customers in a region
- Assign orders based on location
- Tax/GST applied based on customer location
- Filtering for targeted marketing

---

## ⭐ 4.1.2 Greater Than / Less Than

```sql
SELECT * FROM orders
WHERE amount > 1000;
```

### ERP Use Case:

- Get all large orders
- Fraud detection (sudden high-value orders)
- Apply extra checks for expensive items
- Analyze high-value sales

---

## ⭐ 4.1.3 BETWEEN (range filter)

```sql
SELECT * FROM orders
WHERE amount BETWEEN 1000 AND 5000;
```

### ERP Use Case:

- Monthly sales report
- Mid-value order analysis
- Data segmentation
- Revenue analytics

---

## ⭐ 4.1.4 IN (multiple matches)

```sql
SELECT * FROM customers
WHERE city IN ('Mumbai', 'Delhi', 'Bangalore');
```

### ERP Use Case:

- Show customers from metro areas
- Filter customers for logistics
- Filter suppliers from selected states
- Filter orders from certain sales channels

---

## ⭐ 4.1.5 LIKE (pattern matching)

```sql
SELECT * FROM customers
WHERE name LIKE 'J%';   -- starts with J
```

### ERP Use Case:

- Search customer by initials
- Quick search in CRM module
- Auto-complete suggestions
- Product search ("Samsung", "SanDisk")

More patterns:

```sql
LIKE '%son'   -- ends with 'son'
LIKE '%an%'   -- contains 'an'
LIKE '_a%'    -- 2nd letter is 'a'
```

---

## ⭐ 4.1.6 Multiple Conditions (AND / OR)

```sql
SELECT * FROM orders
WHERE status = 'PAID'
AND amount > 5000;
```

### ERP Use Case:

- High-value paid orders
- Shipment priority
- Customer credit analysis

```sql
SELECT * FROM customers
WHERE city = 'Mumbai'
OR city = 'Delhi';
```

### Combine:

```sql
SELECT * FROM products
WHERE is_active = 1
AND stock_quantity > 0;
```

Used for:
- Only active, in-stock products
- Sales ordering screens

---

# 🔶 4.2 ORDER BY — Sorting Results

Sorting is crucial in dashboards, reports, transaction histories, and lists.

---

## ⭐ Sort alphabetically

```sql
SELECT * FROM customers
ORDER BY name ASC;
```

### Use Cases in ERP:

- Alphabetical customer list
- Supplier directory sorting
- Warehouse item listing

---

## ⭐ Sort in descending (latest first)

```sql
SELECT * FROM orders
ORDER BY order_date DESC, amount DESC;
```

### Why two fields?

1. Show **latest orders first**
2. If two orders have the same date → higher amount shown first

### ERP Use Case:

- Sales dashboard
- Manager reports
- Order dispatch planning

---

## ⭐ Sort by multiple columns

```sql
ORDER BY status ASC, order_date DESC;
```

ERP Use Case:

- "Group orders by status, show newest within each status group"

E.g.:

```
DRAFT
CONFIRMED
SHIPPED
INVOICED
```

Each status bucket sorted by latest date.

---

# 🔶 4.3 LIMIT — Limiting Rows (Performance + Pagination)

LIMIT controls how many rows to return.

This is used in:
- Web pages
- Mobile ERP apps
- Dashboards
- API results
- Infinite scrolls

---

## ⭐ Get first N rows

```sql
SELECT * FROM customers
ORDER BY id
LIMIT 10;
```

### ERP Use Case:

- Show first 10 customers
- Show top 10 selling products
- Show most recent 10 orders

---

## ⭐ Pagination (page 1, 10 rows)

```sql
SELECT * FROM customers
ORDER BY id
LIMIT 10 OFFSET 0;
```

## ⭐ Pagination (page 2, 10 rows)

```sql
SELECT * FROM customers
ORDER BY id
LIMIT 10 OFFSET 10;
```

## ⭐ Pagination (page 3, 10 rows)

```sql
SELECT * FROM customers
ORDER BY id
LIMIT 10 OFFSET 20;
```

### Why OFFSET?

OFFSET = number of rows to skip

| Page | Rows per page | OFFSET |
|------|---------------|--------|
| 1    | 10            | 0      |
| 2    | 10            | 10     |
| 3    | 10            | 20     |
| 4    | 10            | 30     |

ERP systems use this for:
- Sales order list
- Invoice list
- Transaction history
- Inventory movement logs
- Warehouse stock search

---

## ⭐ LIMIT without ORDER BY is unsafe

```sql
SELECT * FROM customers LIMIT 10;
```

This returns **random rows** depending on engine/internal ordering.

ERP systems ALWAYS use:

```sql
ORDER BY id
LIMIT 10;
```

---

# 🔶 REAL ERP FILTERING EXAMPLES

## ✔ 1. Get all overdue invoices

```sql
SELECT * FROM invoices
WHERE due_date < CURRENT_DATE
AND status != 'PAID';
```

---

## ✔ 2. Get low-stock products

```sql
SELECT * FROM products
WHERE stock_quantity < min_stock_level;
```

---

## ✔ 3. Get customers with high outstanding balance

```sql
SELECT c.*, SUM(i.balance_due) AS total_due
FROM customers c
JOIN invoices i ON i.customer_id = c.id
WHERE i.balance_due > 0
GROUP BY c.id
ORDER BY total_due DESC
LIMIT 20;
```

---

## ✔ 4. Get all supplier purchase orders pending approval

```sql
SELECT *
FROM purchase_orders
WHERE status = 'PENDING_APPROVAL'
ORDER BY order_date ASC;
```

---

## ✔ 5. Get top 10 selling products

```sql
SELECT p.name, SUM(oi.quantity) AS qty_sold
FROM order_items oi
JOIN products p ON p.id = oi.product_id
GROUP BY p.id
ORDER BY qty_sold DESC
LIMIT 10;
```

---

# 🔶 FULL SECTION SUMMARY (Save This)

```
WHERE → filters rows using conditions
  =   <>   <   >   <=   >=   BETWEEN   IN   LIKE   AND   OR

ORDER BY → sorts data
  ASC   DESC   multi-column sorting

LIMIT → restricts number of rows
  LIMIT N
  LIMIT N OFFSET X   (Pagination)

Used in:
- Search screens
- Dashboards
- Reports
- API pagination
- Sorting by dates/amounts
- Filtering by status/region/category
```

---

# 5. JOINS (RELATIONSHIPS BETWEEN TABLES)

## TABLE STRUCTURE:

```
customers(id, name, city)
orders(id, customer_id, amount, order_date)
```

## RELATIONSHIP:

```
customers.id <--- orders.customer_id
(One customer can have MANY orders)
```

---

## 5.1 INNER JOIN (ONLY MATCHING ROWS)

### QUERY:

```sql
SELECT
  c.id AS customer_id,
  c.name AS customer_name,
  o.id AS order_id,
  o.amount
FROM customers c
INNER JOIN orders o
  ON o.customer_id = c.id;
```

### BEHAVIOR:

- Returns ONLY rows where `customers.id = orders.customer_id`
- Customers WITHOUT orders are EXCLUDED
- Orders WITHOUT valid customer (FK issues) are EXCLUDED

### RESULT PATTERN:

```
customer_id | customer_name | order_id | amount
------------|---------------|----------|-------
1           | Jimmy         | 1        | 4500
1           | Jimmy         | 2        | 2300
2           | Alice         | 3        | 2200
(Bob is removed because no orders)
```

### USE CASES (ERP):

✓ Show orders WITH customer details  
✓ Sales order reports  
✓ Invoice → Order → Customer report  
✓ Payments linked to invoices  
✓ Inventory linked to products  
✓ Only CLEAN connected data  

### INNER JOIN SUMMARY:

- STRICT matching
- NO NULLS
- Smaller result set
- Used for transactional accuracy

---

## 5.2 LEFT JOIN (ALL LEFT ROWS + MATCHING RIGHT ROWS)

### QUERY:

```sql
SELECT
  c.id,
  c.name,
  o.id AS order_id,
  o.amount
FROM customers c
LEFT JOIN orders o
  ON o.customer_id = c.id;
```

### BEHAVIOR:

- Returns ALL customers
- Orders appear IF they exist
- If no matching orders → order fields = NULL

### RESULT PATTERN:

```
id | name  | order_id | amount
---|-------|----------|-------
1  | Jimmy | 1        | 4500
1  | Jimmy | 2        | 2300
2  | Alice | 3        | 2200
3  | Bob   | NULL     | NULL
(Bob included with NULLs because no orders)
```

### USE CASES (ERP):

✓ Show ALL customers, even without orders  
✓ Identify customers who never ordered  
✓ Products with zero sales  
✓ Suppliers with no POs  
✓ Warehouses with no stock  
✓ Employees with no attendance today  

### LEFT JOIN SUMMARY:

- COMPLETE data from left table
- NULLs on right for missing records
- Used for master lists and missing-data reports

---

## INNER JOIN VS LEFT JOIN (DEEP COMPARISON)

### INNER JOIN:

- Shows ONLY matched rows
- Removes unmatched customers
- No NULLs
- More performance-friendly

### LEFT JOIN:

- Shows ALL customers
- Includes NULLs for missing orders
- Used for FULL DATA VISIBILITY

---

## VISUAL DIAGRAMS

### INNER JOIN VISUAL

```
customers          orders
---------          ------
1 Jimmy      -->   (match)
2 Alice      -->   (match)
3 Bob        -->   (no match, dropped)

Result:
Jimmy rows, Alice rows
```

### LEFT JOIN VISUAL

```
customers          orders
---------          ------
1 Jimmy      -->   (match)
2 Alice      -->   (match)
3 Bob        -->   (no match, NULL)

Result:
Jimmy rows, Alice rows, Bob(NULL)
```

---

## ADVANCED ERRORS & NOTES

### IMPORTANT NOTE:

WHERE conditions can turn LEFT JOIN into INNER JOIN.

### BAD:

```sql
SELECT ...
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.amount > 1000;

-- Removes NULL rows → becomes INNER JOIN accidentally
```

### CORRECT:

```sql
WHERE o.amount > 1000 OR o.id IS NULL;
```

---

## ERP JOIN PATTERNS (REAL WORLD)

### 1. CUSTOMERS WITH NO ORDERS:

```sql
SELECT c.*
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;
```

### 2. ORDERS WITH CUSTOMER INFO:

```sql
SELECT o.*, c.name
FROM orders o
INNER JOIN customers c ON c.id = o.customer_id;
```

### 3. ORDER COUNT PER CUSTOMER:

```sql
SELECT c.name, COUNT(o.id) AS order_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id;
```

### 4. PRODUCT SALES SUMMARY:

JOIN products → order_items → orders

---

## JOIN SUMMARY (FINAL)

### INNER JOIN:

✔ Matching records only  
✔ No NULLs  
✔ Used for transactional relationships  

### LEFT JOIN:

✔ All left records (even without matches)  
✔ Produces NULLs  
✔ Used for master data completeness  

---

# 6. AGGREGATION & GROUPING

## AGGREGATE FUNCTIONS:

- `COUNT()` → count rows
- `SUM()` → add numeric values
- `AVG()` → average
- `MIN()` → smallest value
- `MAX()` → largest value

## GROUP BY:

Used to combine rows into groups (customer-level totals, product-level totals)

## HAVING:

Filter AFTER GROUPING (cannot use WHERE after a group)

---

## 6.1 COUNT() — COUNT ROWS

### QUERY:

```sql
SELECT COUNT(*) AS total_customers
FROM customers;
```

### MEANING:

- Count ALL rows in customers table
- `COUNT(*)` counts null and non-null rows
- Useful for total records

### ERP USE CASES:

✓ Total number of customers  
✓ Total number of products  
✓ Total active users  
✓ Total employees  
✓ Total transactions in a day  

### RESULT EXAMPLE:

```
total_customers
---------------
15324
```

---

## 6.2 SUM() — ADD VALUES

### QUERY:

```sql
SELECT SUM(amount) AS total_revenue
FROM orders;
```

### MEANING:

- Adds up all order amounts
- Returns a single total value

### ERP USE CASES:

✓ Total sales revenue  
✓ Total payments received  
✓ Total purchase expenses  
✓ Total tax collected  
✓ Total inventory value  

### RESULT EXAMPLE:

```
total_revenue
-------------
985000.50
```

---

## 6.3 GROUP BY — GROUP ROWS BY A FIELD

### QUERY:

```sql
SELECT customer_id, COUNT(*) AS total_orders
FROM orders
GROUP BY customer_id;
```

### MEANING:

- Combine rows BY customer_id
- For each customer: count orders

### BEHAVIOR:

GROUP BY customer_id produces 1 row per customer:

```
customer_id | total_orders
------------|-------------
```

### ERP USE CASES:

✓ Number of orders per customer  
✓ Total items sold per product  
✓ Sales per region  
✓ Payments grouped by method  
✓ Stock movements per warehouse  

### RESULT EXAMPLE:

```
customer_id | total_orders
------------|-------------
1           | 12
2           | 5
3           | 0
```

### IMPORTANT:

GROUP BY changes the shape of the table:
- Before GROUP BY: many rows
- After GROUP BY: one row per group

---

## 6.4 HAVING — FILTER AFTER GROUPING

### QUERY:

```sql
SELECT customer_id, COUNT(*) AS total_orders
FROM orders
GROUP BY customer_id
HAVING COUNT(*) > 5;
```

### MEANING:

- HAVING filters grouped results
- WHERE cannot be used here because WHERE happens BEFORE GROUPING
- HAVING happens AFTER GROUPING

### ERP USE CASES:

✓ Customers with more than 5 orders  
✓ Products with sales > 100 units  
✓ Regions with revenue > 10 lakh  
✓ Suppliers with more than 50 purchase orders  
✓ Employees with > 20 attendance records  

### RESULT EXAMPLE:

```
customer_id | total_orders
------------|-------------
1           | 12
4           | 9
```

---

## WHERE VS HAVING (CRITICAL DIFFERENCE)

### WHERE:

- Filters BEFORE grouping
- Cannot use aggregate functions
- Example: `WHERE amount > 1000`

### HAVING:

- Filters AFTER grouping
- Used WITH aggregate functions
- Example: `HAVING SUM(amount) > 10000`

### SUMMARY:

- WHERE → row-level filter
- HAVING → group-level filter

---

## ERP-REAL AGGREGATION EXAMPLES

### 1. TOTAL SALES BY MONTH:

```sql
SELECT
  MONTH(order_date) AS month,
  SUM(amount) AS total_sales
FROM orders
GROUP BY MONTH(order_date);
```

### 2. TOTAL ORDERS PER CITY:

```sql
SELECT c.city, COUNT(o.id) AS order_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.city;
```

### 3. LOW STOCK ALERT:

```sql
SELECT product_id, SUM(quantity) AS total_stock
FROM stock_movements
GROUP BY product_id
HAVING SUM(quantity) < 10;
```

### 4. TOP 5 CUSTOMERS BY REVENUE:

```sql
SELECT c.name, SUM(o.amount) AS revenue
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.id
ORDER BY revenue DESC
LIMIT 5;
```

---

## AGGREGATION SUMMARY

```
COUNT() → how many rows
SUM()   → total amount
AVG()   → average
MIN()   → smallest
MAX()   → largest

GROUP BY → group rows into buckets
HAVING   → filter buckets after grouping
```

---

# 7. USERS & PERMISSIONS (BASIC MySQL ADMIN)

### 7.1 Create a new SQL user

```sql
CREATE USER 'app_user'@'%' IDENTIFIED BY 'StrongPassword123';
```

### 7.2 Grant privileges on a database

```sql
GRANT ALL PRIVILEGES
ON erp_db.*
TO 'app_user'@'%';
```

Or more restrictive:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
ON erp_db.*
TO 'app_user'@'%';
```

### 7.3 Apply changes

```sql
FLUSH PRIVILEGES;
```

### 7.4 Revoke privileges

```sql
REVOKE INSERT, UPDATE
ON erp_db.*
FROM 'app_user'@'%';
```

### 7.5 Drop user

```sql
DROP USER 'app_user'@'%';
```

---

# 8. END-TO-END EXAMPLE: CREATE A SMALL DB & USE IT

### Step 1: Create DB and switch to it

```sql
CREATE DATABASE shop_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE shop_db;
```

### Step 2: Create tables

```sql
CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE,
  city VARCHAR(100)
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  order_date DATE,
  amount DECIMAL(10,2),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);
```

### Step 3: Insert sample data

```sql
INSERT INTO customers (name, email, city)
VALUES
  ('Jimmy', 'jimmy@example.com', 'Erlangen'),
  ('Alice', 'alice@example.com', 'Mumbai');

INSERT INTO orders (customer_id, order_date, amount)
VALUES
  (1, '2025-01-01', 2500.00),
  (1, '2025-01-10', 1200.00),
  (2, '2025-01-05', 5000.00);
```

### Step 4: Query joined data

```sql
SELECT
  c.name AS customer,
  o.id AS order_id,
  o.order_date,
  o.amount
FROM customers c
JOIN orders o ON o.customer_id = c.id
ORDER BY c.name, o.order_date;
```

### Step 5: Simple report – total amount per customer

```sql
SELECT
  c.name AS customer,
  COUNT(o.id) AS total_orders,
  SUM(o.amount) AS total_spent
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.name
ORDER BY total_spent DESC;
```

---

# END OF DATABASE CREATION & CORE COMMANDS CHEATSHEET

---

## 📋 QUICK REFERENCE SUMMARY

### Server & Database Commands

```sql
-- Connect to MySQL
mysql -u root -p

-- Show databases
SHOW DATABASES;

-- Create database
CREATE DATABASE erp_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Use database
USE erp_db;

-- Show database definition
SHOW CREATE DATABASE erp_db;

-- Alter database
ALTER DATABASE erp_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Drop database
DROP DATABASE IF EXISTS erp_db;
```

### Table Commands

```sql
-- Create table
CREATE TABLE table_name (...);

-- Show tables
SHOW TABLES;

-- Describe table
DESCRIBE table_name;

-- Show table definition
SHOW CREATE TABLE table_name\G

-- Alter table (add column)
ALTER TABLE table_name ADD COLUMN column_name datatype;

-- Alter table (modify column)
ALTER TABLE table_name MODIFY COLUMN column_name new_datatype;

-- Alter table (rename column)
ALTER TABLE table_name RENAME COLUMN old_name TO new_name;

-- Alter table (drop column)
ALTER TABLE table_name DROP COLUMN column_name;

-- Rename table
RENAME TABLE old_name TO new_name;

-- Truncate table
TRUNCATE TABLE table_name;

-- Drop table
DROP TABLE IF EXISTS table_name;
```

### Data Manipulation Commands

```sql
-- Insert single row
INSERT INTO table_name (col1, col2) VALUES (val1, val2);

-- Insert multiple rows
INSERT INTO table_name (col1, col2) VALUES (val1, val2), (val3, val4);

-- Select data
SELECT col1, col2 FROM table_name WHERE condition;

-- Update data
UPDATE table_name SET col1 = val1 WHERE condition;

-- Delete data
DELETE FROM table_name WHERE condition;
```

### Join Commands

```sql
-- Inner join
SELECT * FROM table1 t1
INNER JOIN table2 t2 ON t1.id = t2.foreign_id;

-- Left join
SELECT * FROM table1 t1
LEFT JOIN table2 t2 ON t1.id = t2.foreign_id;
```

### Aggregation & Grouping

```sql
-- Count
SELECT COUNT(*) FROM table_name;

-- Sum
SELECT SUM(amount) FROM table_name;

-- Group by
SELECT column, COUNT(*) FROM table_name GROUP BY column;

-- Having
SELECT column, COUNT(*) FROM table_name 
GROUP BY column 
HAVING COUNT(*) > 5;
```

### Filtering & Sorting

```sql
-- Where clause
WHERE column = value
WHERE column > value
WHERE column BETWEEN val1 AND val2
WHERE column IN (val1, val2, val3)
WHERE column LIKE 'pattern%'
WHERE condition1 AND condition2
WHERE condition1 OR condition2

-- Order by
ORDER BY column ASC
ORDER BY column DESC
ORDER BY col1 ASC, col2 DESC

-- Limit
LIMIT 10
LIMIT 10 OFFSET 20
```

### User & Permission Commands

```sql
-- Create user
CREATE USER 'username'@'%' IDENTIFIED BY 'password';

-- Grant privileges
GRANT ALL PRIVILEGES ON database.* TO 'username'@'%';
GRANT SELECT, INSERT, UPDATE ON database.* TO 'username'@'%';

-- Flush privileges
FLUSH PRIVILEGES;

-- Revoke privileges
REVOKE INSERT, UPDATE ON database.* FROM 'username'@'%';

-- Drop user
DROP USER 'username'@'%';
```

### Transaction Commands

```sql
-- Start transaction
START TRANSACTION;

-- Commit
COMMIT;

-- Rollback
ROLLBACK;

-- Savepoint
SAVEPOINT savepoint_name;
ROLLBACK TO savepoint_name;

-- Set transaction isolation level
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

---

## 🎯 ERP BEST PRACTICES CHECKLIST

✅ Always use `DECIMAL` for money fields  
✅ Always define primary keys on tables  
✅ Use foreign keys to enforce referential integrity  
✅ Use `TIMESTAMP` for created_at/updated_at fields  
✅ Use `utf8mb4` character set for full Unicode support  
✅ Never use `SELECT *` in production code  
✅ Always use `WHERE` with UPDATE and DELETE  
✅ Prefer soft deletes (is_active flag) over hard deletes  
✅ Use indexes on frequently searched columns  
✅ Use transactions for multi-step operations  
✅ Always backup before running DDL in production  
✅ Test queries on staging before production  
✅ Use meaningful constraint names  
✅ Document complex queries  
✅ Use JOIN instead of subqueries when possible for performance  

---

## 🔥 COMMON ERP PATTERNS

### Pattern 1: Master-Detail Relationship

```sql
-- Master table (customers)
CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(100) UNIQUE
);

-- Detail table (orders)
CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  order_date DATE NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
```

### Pattern 2: Soft Delete

```sql
ALTER TABLE customers ADD COLUMN is_active TINYINT(1) DEFAULT 1;

-- Instead of DELETE
UPDATE customers SET is_active = 0 WHERE id = 123;

-- Select only active
SELECT * FROM customers WHERE is_active = 1;
```

### Pattern 3: Audit Trail

```sql
CREATE TABLE audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(50),
  record_id INT,
  action VARCHAR(20),
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(100),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Pattern 4: Running Totals

```sql
-- Update order total from items
UPDATE orders o
SET total_amount = (
  SELECT SUM(quantity * unit_price)
  FROM order_items
  WHERE order_id = o.id
);
```

### Pattern 5: Finding Missing Records

```sql
-- Customers without orders
SELECT c.*
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;
```

---

## ⚡ PERFORMANCE TIPS

1. **Use EXPLAIN to analyze queries**
   ```sql
   EXPLAIN SELECT * FROM orders WHERE customer_id = 123;
   ```

2. **Create indexes on foreign keys**
   ```sql
   CREATE INDEX idx_orders_customer_id ON orders(customer_id);
   ```

3. **Use LIMIT for large result sets**
   ```sql
   SELECT * FROM orders ORDER BY order_date DESC LIMIT 100;
   ```

4. **Avoid SELECT * in production**
   ```sql
   -- Bad
   SELECT * FROM orders;
   
   -- Good
   SELECT id, customer_id, amount FROM orders;
   ```

5. **Use JOIN instead of subqueries when possible**
   ```sql
   -- Less efficient
   SELECT * FROM orders WHERE customer_id IN (
     SELECT id FROM customers WHERE city = 'Mumbai'
   );
   
   -- More efficient
   SELECT o.* FROM orders o
   JOIN customers c ON c.id = o.customer_id
   WHERE c.city = 'Mumbai';
   ```

---

## 🚨 DANGER ZONE - COMMANDS TO BE EXTRA CAREFUL WITH

```sql
-- These commands can cause data loss!

DROP DATABASE database_name;        -- Deletes entire database
DROP TABLE table_name;              -- Deletes entire table
TRUNCATE TABLE table_name;          -- Deletes all rows
DELETE FROM table_name;             -- Deletes all rows (without WHERE!)
UPDATE table_name SET column=value; -- Updates all rows (without WHERE!)
```

**Always:**
- Double-check the database/environment (dev/staging/prod)
- Use WHERE clauses with UPDATE and DELETE
- Test on staging first
- Have backups ready
- Use transactions for critical operations

---

## 📚 ADDITIONAL RESOURCES

- MySQL Official Documentation: https://dev.mysql.com/doc/
- SQL Style Guide: https://www.sqlstyle.guide/
- Database Design Best Practices
- ACID Properties Understanding
- Normalization (1NF, 2NF, 3NF, BCNF)
- Index Optimization Strategies

---

# 🏁 END OF COMPLETE SQL CHEATSHEET

## SQL DATATYPE REFERENCE (ERP EDITION)

### 1. NUMERIC DATATYPES

#### `TINYINT(1)`
- **Range:** -128 to 127
- **Use:** Boolean flags, status, is_active, yes/no fields

#### `SMALLINT`
- **Range:** -32k to 32k
- **Use:** Small counters, small status codes

#### `INT`
- **Range:** -2B to 2B
- **Use:** Primary keys, foreign keys, customer_id, order_id

#### `BIGINT`
- **Range:** Very large numbers
- **Use:** Large-scale ERP systems, logs, event IDs

#### `DECIMAL(p,s)` ⭐ **MOST IMPORTANT FOR ERP**
- **Description:** Exact precision decimal numbers
- **Use:** price, amount, tax, totals, cost, salary
- **Example:** `DECIMAL(10,2)` → 99999999.99

#### `FLOAT / DOUBLE`
- **Description:** Approximate decimal numbers
- **Use:** Scientific values, percentages
- **⚠️ NOT for money**

---

### 2. STRING & TEXT DATATYPES

#### `CHAR(n)`
- **Description:** Fixed-length string
- **Use:** ISO codes, country code, currency code
- **Example:** `CHAR(2)` → 'IN', 'US'

#### `VARCHAR(n)`
- **Description:** Variable-length string (most used)
- **Use:** Names, emails, phone, address, SKU, city
- **Example:** `VARCHAR(150)`

#### `TEXT`
- **Size:** Up to 65K characters
- **Use:** Descriptions, notes, long comments

#### `MEDIUMTEXT`
- **Size:** Up to 16MB of text
- **Use:** Documents, long logs

#### `LONGTEXT`
- **Size:** Up to 4GB
- **Use:** Very large content (rare)

---

### 3. DATE & TIME DATATYPES

#### `DATE`
- **Format:** YYYY-MM-DD
- **Use:** order_date, invoice_date, birthdate

#### `TIME`
- **Format:** HH:MM:SS
- **Use:** Shift timings, clock-in/out

#### `DATETIME`
- **Description:** Date + time (no timezone)
- **Use:** Event logs, transaction timestamps

#### `TIMESTAMP`
- **Description:** UTC-based datetime
- **Features:** Auto-fill and auto-update supported
- **Use:** created_at, updated_at

---

### 4. BOOLEAN DATATYPE

#### `BOOLEAN / TINYINT(1)`
- **Values:** 1 = TRUE, 0 = FALSE
- **Use:** is_active, is_paid, is_verified

---

### 5. BINARY DATATYPES

#### `BLOB / MEDIUMBLOB / LONGBLOB`
- **Description:** Binary data
- **Use:** Files, signatures, images, PDFs (not recommended inside DB)

---

### 6. JSON & SPECIAL TYPES

#### `JSON`
- **Description:** Structured JSON storage
- **Use:** Metadata, settings, custom_fields

#### `ENUM`
- **Description:** Limited allowed values
- **Example:** `ENUM('NEW','CONFIRMED','SHIPPED')`
- **Use:** Statuses in ERP

#### `SET`
- **Description:** Multiple values from a list (rarely used)

---

## ERP-SPECIFIC DATATYPE RECOMMENDATIONS

### CUSTOMERS TABLE
```sql
id              INT
name            VARCHAR(150)
email           VARCHAR(100)
phone           VARCHAR(20)
city            VARCHAR(100)
created_at      TIMESTAMP
```

### PRODUCTS TABLE
```sql
id              INT
sku             VARCHAR(50)
name            VARCHAR(150)
price           DECIMAL(10,2)
stock_quantity  INT
is_active       TINYINT(1)
description     TEXT
```

### ORDERS TABLE
```sql
id              INT
customer_id     INT
order_date      DATE
status          VARCHAR(20)
total_amount    DECIMAL(10,2)
```

### ORDER_ITEMS TABLE
```sql
id              INT
order_id        INT
product_id      INT
quantity        INT
unit_price      DECIMAL(10,2)
line_total      DECIMAL(10,2)
```

### PAYMENTS TABLE
```sql
id              INT
order_id        INT
amount          DECIMAL(10,2)
payment_date    DATE
method          VARCHAR(20)
```

---

## DATATYPE BEST PRACTICES (CRITICAL)

✓ Use `INT` for primary keys  
✓ Use `DECIMAL` for money (never FLOAT/DOUBLE)  
✓ Use `VARCHAR` for names/emails/text  
✓ Use `TEXT` for large descriptions  
✓ Use `TIMESTAMP` for created_at / updated_at  
✓ Use `TINYINT(1)` for booleans  
✓ Use `CHAR(2)` and `CHAR(3)` for country/currency codes  
✓ Use `JSON` for flexible, schema-less data  

---

# SQL COMMAND GROUPS

- **DDL** (Data Definition Language)
- **DML** (Data Manipulation Language)
- **DCL** (Data Control Language)
- **TCL** (Transaction Control Language)

---

# 🔶 1. DDL – Data Definition Language

DDL commands define or change the **structure** of the database — meaning:
**creating, modifying, or deleting tables, indexes, schemas, databases, etc.**

DDL commands are auto-committed by default (in most SQL systems), meaning:

> Once a DDL command executes, it is permanent and cannot be rolled back (in MySQL).

### DDL Commands:
- `CREATE`
- `ALTER`
- `DROP`
- `TRUNCATE`

---

## 1.1 `CREATE`

Used to **create**:
- Databases
- Tables
- Views
- Indexes
- Functions (in some DBs)
- Triggers

### Example: Create database
```sql
CREATE DATABASE shop_db;
```

### Example: Create table
```sql
CREATE TABLE customers (
    id INT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100)
);
```

### Example: Create index
```sql
CREATE INDEX idx_customer_email
ON customers(email);
```

---

## 1.2 `ALTER`

Used to **modify an existing object**.

You can:
- Add/remove columns
- Rename columns
- Change data types
- Add/remove constraints
- Rename tables

### Example: Add a column
```sql
ALTER TABLE customers
ADD phone VARCHAR(20);
```

### Example: Modify a column type
```sql
ALTER TABLE customers
MODIFY name VARCHAR(150);
```

### Example: Drop a column
```sql
ALTER TABLE customers
DROP COLUMN phone;
```

---

## 1.3 `DROP`

Used to **delete** database objects permanently.

You can drop:
- Tables
- Databases
- Views
- Indexes
- Triggers

**⚠️ DANGER:** `DROP` deletes the object **and all its data permanently**.

### Example: Drop table
```sql
DROP TABLE customers;
```

### Example: Drop database
```sql
DROP DATABASE shop_db;
```

---

## 1.4 `TRUNCATE`

Deletes **all rows** in a table but keeps the structure.

- Much faster than `DELETE`
- Cannot be rolled back (in MySQL)
- Resets auto-increment counter

### Example:
```sql
TRUNCATE TABLE orders;
```

### Difference with DELETE:
- `DELETE FROM orders` → row-by-row deletion, can be rolled back
- `TRUNCATE TABLE orders` → instant, no rollback, resets IDs

---

# 🔷 2. DML – Data Manipulation Language

DML deals with **manipulating the data** inside tables (not structure).

DML commands **can be rolled back** until committed.

### DML Commands:
- `SELECT`
- `INSERT`
- `UPDATE`
- `DELETE`

---

## 2.1 `SELECT` — Fetch/read data

The most used SQL command.

### Example:
```sql
SELECT name, email FROM customers;
```

### With conditions:
```sql
SELECT * FROM customers
WHERE city = 'Mumbai';
```

### With sorting:
```sql
SELECT * FROM customers
ORDER BY name ASC;
```

---

## 2.2 `INSERT` — Add records

### Example:
```sql
INSERT INTO customers (name, email)
VALUES ('Jimmy Patel', 'jimmy@example.com');
```

### Multiple inserts:
```sql
INSERT INTO customers (name, email)
VALUES
  ('Alice', 'alice@example.com'),
  ('Bob', 'bob@example.com');
```

---

## 2.3 `UPDATE` — Modify records

```sql
UPDATE customers
SET city = 'Berlin'
WHERE id = 1;
```

**⚠️ Without WHERE = DANGEROUS**

```sql
UPDATE customers SET city='Berlin';
-- Updates ALL rows
```

---

## 2.4 `DELETE` — Delete records

```sql
DELETE FROM customers
WHERE id = 3;
```

**⚠️ Without WHERE:**

```sql
DELETE FROM customers;  -- deletes ALL rows!!
```

---

# 🔷 3. DCL – Data Control Language

DCL controls **access/permissions** to the database.

Used by DB administrators or DevOps.

### DCL Commands:
- `GRANT`
- `REVOKE`

---

## 3.1 `GRANT` — Give privileges to users

### Example: Give full privileges on DB
```sql
GRANT ALL PRIVILEGES ON shop_db.*
TO 'app_user'@'%' IDENTIFIED BY 'Password123!';
```

### Grant only read permissions:
```sql
GRANT SELECT ON shop_db.* TO 'report_user'@'%';
```

### Grant specific permissions:
```sql
GRANT SELECT, INSERT, UPDATE ON shop_db.customers
TO 'sales_user'@'%';
```

---

## 3.2 `REVOKE` — Remove user permissions

### Example:
```sql
REVOKE INSERT, UPDATE ON shop_db.customers
FROM 'sales_user'@'%';
```

### Remove all permissions:
```sql
REVOKE ALL PRIVILEGES, GRANT OPTION
FROM 'app_user'@'%';
```

---

# 🔷 4. TCL – Transaction Control Language

TCL controls **transactions** in SQL.

A transaction = a group of SQL statements that must succeed **together** or **fail together**.

Transactions guarantee **atomicity** (A in ACID).

### TCL Commands:
- `COMMIT`
- `ROLLBACK`
- `SAVEPOINT`
- `SET TRANSACTION`

---

## 4.1 `COMMIT` — Save all changes permanently

### Example:
```sql
START TRANSACTION;

UPDATE accounts SET balance = balance - 500 WHERE id = 1;
UPDATE accounts SET balance = balance + 500 WHERE id = 2;

COMMIT;  -- money transferred permanently
```

---

## 4.2 `ROLLBACK` — Undo changes since last COMMIT

### Example:
```sql
START TRANSACTION;

DELETE FROM orders WHERE id = 10;

ROLLBACK;  -- the deletion is undone
```

Used when:
- Something goes wrong
- You want to undo partial operations

---

## 4.3 `SAVEPOINT` — Create a checkpoint inside a transaction

Allows **partial rollback**.

### Example:
```sql
START TRANSACTION;

UPDATE products SET price = price + 100;

SAVEPOINT adjust_prices;

UPDATE products SET stock_quantity = stock_quantity - 10;

ROLLBACK TO adjust_prices;  -- undo only last update

COMMIT;
```

---

## 4.4 `SET TRANSACTION` — Control isolation levels

Example:
```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

---

# ⭐ SQL Command Groups Summary

```text
============================================================
SQL COMMAND GROUPS SUMMARY
============================================================

DDL – Structure
---------------
CREATE     → create db/table/index/view
ALTER      → change table structure
DROP       → delete table/db
TRUNCATE   → remove all rows, keep structure

DML – Data
----------
SELECT     → read
INSERT     → add rows
UPDATE     → modify rows
DELETE     → remove rows

DCL – Permissions
-----------------
GRANT      → give rights
REVOKE     → remove rights

TCL – Transactions
------------------
COMMIT     → save changes
ROLLBACK   → undo changes
SAVEPOINT  → define partial rollback point
SET TRANSACTION → set isolation levels
```

---

# 1. SERVER & DATABASE LEVEL COMMANDS (MySQL)

---

## 1.1 Connect to MySQL server from terminal

```bash
mysql -u root -p
```

- `mysql` → the MySQL **client program** (CLI) that talks to the MySQL server
- `-u root` → login as user **root** (default admin user)
- `-p` → tell MySQL: "ask me for a password"

After running it, you'll see:

```text
Enter password:
```

You type the password (nothing will be shown as you type) and press Enter.

If successful, you'll get something like:

```text
Welcome to the MySQL monitor...
mysql>
```

Now you're **inside** the MySQL shell and can run SQL and admin commands.

### Variants you'll often use

Specify host (e.g., remote server):

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p
```

- `-h` → host
- `-P` → port (default is 3306)

Login with another user:

```bash
mysql -u app_user -p
```

Exit the MySQL shell:

```sql
EXIT;
-- or
QUIT;
-- or Ctrl + D
```

---

## 1.2 Show all databases

```sql
SHOW DATABASES;
```

Run this **inside** the MySQL shell (`mysql>` prompt).

**What it does:**
- Lists all databases **you are allowed to see** (based on your privileges)
- Typical system DBs you'll see:
  - `information_schema`
  - `mysql`
  - `performance_schema`
  - `sys`
- And your own: e.g. `erp_db`, `shop_db`, etc.

Example output:

```text
+--------------------+
| Database           |
+--------------------+
| information_schema |
| erp_db             |
| mysql              |
| performance_schema |
| sys                |
+--------------------+
```

Use this to:
- Check whether your database was created
- See naming (typos, wrong env, etc.)

---

## 1.3 Create a new database (simple)

```sql
CREATE DATABASE erp_db;
```

This:
- Creates a new **empty database** called `erp_db`
- Inside this DB you'll later create tables, views, etc.
- No tables yet. Just the container.

If `erp_db` already exists, you'll get an error:

```text
ERROR 1007 (HY000): Can't create database 'erp_db'; database exists
```

You can avoid that using:

```sql
CREATE DATABASE IF NOT EXISTS erp_db;
```

---

## 1.3 (b) Create database with charset & collation (good practice)

```sql
CREATE DATABASE erp_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

### What these mean:

**CHARACTER SET utf8mb4**
- This defines how text is stored (encoding)
- `utf8mb4` is **full UTF-8**, supports:
  - All languages
  - Emojis
  - Special symbols
- You should basically _always_ use `utf8mb4` for modern apps

**COLLATE utf8mb4_unicode_ci**
- Collation = **rules for comparing/sorting text**
- `unicode_ci`:
  - `ci` = case-insensitive (`A` = `a` when comparing)
  - A good general choice for most languages

This command:
- Creates DB `erp_db`
- Sets default charset/collation for:
  - Newly created tables (if they don't override it)
  - String columns inside those tables

You can still override at table/column level later if needed.

---

## 1.4 See how a database is defined

```sql
SHOW CREATE DATABASE erp_db;
```

This shows the **exact SQL** MySQL would use to recreate that database.

Example output:

```text
+----------+--------------------------------------------------------------+
| Database | Create Database                                              |
+----------+--------------------------------------------------------------+
| erp_db   | CREATE DATABASE `erp_db` /*!40100 DEFAULT CHARACTER SET utf8mb4
             COLLATE utf8mb4_unicode_ci */                                |
+----------+--------------------------------------------------------------+
```

Use this to:
- Confirm charset/collation
- Copy definition to another environment
- Debug when something is wrong in staging/prod

---

## 1.5 Change default database

```sql
USE erp_db;
```

This sets `erp_db` as your **current database**.

After this:
- `CREATE TABLE ...` will create tables inside `erp_db`
- `SELECT * FROM customers;` will refer to `erp_db.customers` (unless you specify another schema)

You can confirm the current database with:

```sql
SELECT DATABASE();
```

Example result:

```text
+------------+
| DATABASE() |
+------------+
| erp_db     |
+------------+
```

If you **forget** to run `USE erp_db;` and create tables, they may accidentally end up in `test` or another DB — classic bug in real projects.

You can also explicitly qualify objects:

```sql
SELECT * FROM erp_db.customers;
```

But most people just set `USE` once, then work.

---

## 1.6 Rename database (MySQL limitation)

> There is **no** simple `RENAME DATABASE old_name TO new_name;` in MySQL.

The comment:

```sql
-- 1.6 Rename database (MySQL has no direct RENAME DATABASE; use dump/restore or tools)
-- (Just remember: no simple RENAME DATABASE in MySQL!)
```

Means:
- You **cannot** rename a DB with one SQL command
- Workarounds (dev/ops level, not pure SQL):

### Option A – Logical migrate (safe way)

1. **Create new DB:**
   ```sql
   CREATE DATABASE new_name
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci;
   ```

2. **Export old DB:**
   ```bash
   mysqldump -u root -p old_name > old_name.sql
   ```

3. **Import into new DB:**
   ```bash
   mysql -u root -p new_name < old_name.sql
   ```

4. Optionally **drop old DB:**
   ```sql
   DROP DATABASE old_name;
   ```

5. Update app config to use `new_name`

### Option B – Rename data directory (not recommended unless you know what you're doing)

- Hacky, filesystem-level, depends on OS, MySQL version, and permissions
- You have to stop MySQL, rename folder, edit metadata. Not beginner-friendly

So: just remember: **no native RENAME DATABASE statement** in MySQL.

---

## 1.7 Modify database default charset / collation

```sql
ALTER DATABASE erp_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

This changes the **defaults** for that DB.

**Important details:**

- **Affects:**
  - New tables created **after** this
  - New columns without explicit charset/collation

- **Does NOT automatically convert existing tables/columns:**
  - If tables already exist with a different charset, they stay as they are
  - To change them you must run `ALTER TABLE ... CONVERT TO CHARACTER SET ...` per table

**Use cases:**
- You created DB earlier with wrong charset (e.g., `latin1`) and now want to fix defaults **before** adding tables
- You want to standardize all new objects on `utf8mb4_unicode_ci`

Check again with:

```sql
SHOW CREATE DATABASE erp_db;
```

To ensure it's applied.

---

## 1.8 Drop (delete) a database

```sql
DROP DATABASE erp_db;
```

This:
- Permanently deletes:
  - The database object
  - All tables
  - All data inside those tables
  - Views, triggers, etc.

**Requirements:**
- You must have `DROP` privilege on that database
- You **cannot** drop some system DBs (e.g. `mysql`, `information_schema`)

### Very important cautions:

- This is **irreversible**. Once dropped, data is gone unless you have backup
- Always **double-check:**
  - Current hostname (are you on PROD?)
  - Current environment (dev/test/prod)
  - Name of database

You can also **not** drop a DB that is currently used by an active connection (in some setups), but usually, MySQL lets you drop it even if you're `USE erp_db;` — it just switches you to `NULL` database.

---

### Safer version

```sql
DROP DATABASE IF EXISTS erp_db;
```

**What's different?**

- If `erp_db` does **not** exist:
  - `DROP DATABASE erp_db;` → error
  - `DROP DATABASE IF EXISTS erp_db;` → no error, just a warning

Use `IF EXISTS` in automation scripts (migrations, CI, local dev installs), so scripts don't fail if DB is already gone.

Example behavior:

```sql
DROP DATABASE IF EXISTS erp_db;
CREATE DATABASE erp_db;
USE erp_db;
```

This pattern gives you a **clean database** every time for testing.

---

## Mini "flow" of these commands in practice

Here's how you'd usually use them together in real life:

```bash
# 1. connect to MySQL
mysql -u root -p
```

Then inside MySQL:

```sql
-- 2. See what already exists
SHOW DATABASES;

-- 3. Create a fresh database for your app
CREATE DATABASE IF NOT EXISTS erp_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 4. Check its definition
SHOW CREATE DATABASE erp_db\G

-- 5. Switch to it
USE erp_db;

-- 6. (Optionally later) change defaults if needed
ALTER DATABASE erp_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 7. (Dangerous – only if you really want to destroy it)
DROP DATABASE IF EXISTS erp_db;
```

---

# 2. TABLE LEVEL COMMANDS (DDL)

---

## 2.1 `CREATE TABLE` – Building ERP tables from scratch

Example you had:

```sql
CREATE TABLE customers (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    email        VARCHAR(100) UNIQUE,
    city         VARCHAR(100),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### In ERP context:

This defines the **master customer table**.

- `id INT AUTO_INCREMENT PRIMARY KEY`
  - Each customer gets a unique `id`
  - This `id` will be used as a **foreign key** in other ERP tables, e.g. `orders.customer_id`, `invoices.customer_id`, `payments.customer_id`

- `name` is required (`NOT NULL`) → you can't have a customer with no name
- `email UNIQUE` → ensures no two customers share the same email → good for login/communication
- `created_at DEFAULT CURRENT_TIMESTAMP` → automatically tracks when the customer was added

### ERP-style tables you'd also create:

**Suppliers:**

```sql
CREATE TABLE suppliers (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    supplier_code VARCHAR(50) UNIQUE,
    name         VARCHAR(150) NOT NULL,
    email        VARCHAR(100),
    phone        VARCHAR(20),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Products:**

```sql
CREATE TABLE products (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    sku            VARCHAR(50) UNIQUE,
    name           VARCHAR(150) NOT NULL,
    price          DECIMAL(10,2) NOT NULL,
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Orders (with relation to customers):**

```sql
CREATE TABLE orders (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    customer_id  INT NOT NULL,
    order_date   DATE NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'NEW',
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    CONSTRAINT fk_orders_customer
      FOREIGN KEY (customer_id) REFERENCES customers(id)
);
```

> **Key ERP point:** `CREATE TABLE` is where you define **relationships**:
> - Primary keys (PK) – your "identity" fields (`id`)
> - Foreign keys (FK) – your links (`customer_id`, `product_id`, `supplier_id`…)

---

## 2.2 `SHOW TABLES` – See all ERP tables in the current DB

```sql
SHOW TABLES;
```

In your ERP database (`USE erp_db;`), this might show:

```text
+-------------------+
| Tables_in_erp_db  |
+-------------------+
| customers         |
| suppliers         |
| products          |
| orders            |
| order_items       |
| payments          |
| goods_receipts    |
| purchase_orders   |
+-------------------+
```

Use this to:
- Confirm which ERP modules are created
- Quickly check after migrations

---

## 2.3 `DESCRIBE` / `SHOW COLUMNS` – Inspect ERP table structure

```sql
DESCRIBE customers;

-- or
SHOW COLUMNS FROM customers;
```

Output:

```text
+------------+--------------+------+-----+-------------------+----------------+
| Field      | Type         | Null | Key | Default           | Extra          |
+------------+--------------+------+-----+-------------------+----------------+
| id         | int          | NO   | PRI | NULL              | auto_increment |
| name       | varchar(100) | NO   |     | NULL              |                |
| email      | varchar(100) | YES  | UNI | NULL              |                |
| city       | varchar(100) | YES  |     | NULL              |                |
| created_at | timestamp    | YES  |     | CURRENT_TIMESTAMP |                |
+------------+--------------+------+-----+-------------------+----------------+
```

- `Key` column shows:
  - `PRI` → primary key
  - `UNI` → unique index
  - `MUL` → indexed, can be non-unique (e.g. FK)

Use this in ERP when:
- You forgot what columns exist (e.g. in `order_items`)
- You want to confirm if a field is nullable or not (e.g. `status`)

---

## 2.4 `SHOW CREATE TABLE` – See full DDL (with constraints / FKs)

```sql
SHOW CREATE TABLE customers\G
```

You'll see something like:

```text
Create Table: CREATE TABLE `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB ...
```

This is **super important** for ERP:
- Shows all **constraints**: PK, FK, UNIQUE, indexes
- When debugging why an `INSERT` fails (e.g. FK constraint fails)
- When you want to copy structure to another environment

Example for `orders`:

```sql
SHOW CREATE TABLE orders\G
```

Will show `CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)` → confirms the relationship.

---

## 2.5 `ALTER TABLE ... ADD COLUMN` – Evolving your ERP schema

```sql
ALTER TABLE customers
ADD COLUMN phone VARCHAR(20);
```

ERP scenario:
- Business now wants to store **GST number** for customers or **credit_limit**

Example:

```sql
ALTER TABLE customers
ADD COLUMN gst_number VARCHAR(20);

ALTER TABLE customers
ADD COLUMN credit_limit DECIMAL(10,2) DEFAULT 0;
```

This is **very common in ERP:**
- Requirements change → new columns needed
- `ALTER TABLE` lets you evolve without dropping data

**⚠️** On large ERP tables (millions of rows), `ALTER TABLE` can be heavy and lock tables → in production, this must be planned.

---

## 2.6 `ALTER TABLE ... MODIFY COLUMN` – Change type, size, nullability

```sql
ALTER TABLE customers
MODIFY COLUMN name VARCHAR(150) NOT NULL;
```

ERP use cases:
- `name` too short? Increase from 100 to 200
- `phone` was nullable, now you want to make it `NOT NULL`
- `price` from `INT` to `DECIMAL(10,2)` because you now support paise/cents

Example:

```sql
ALTER TABLE products
MODIFY COLUMN price DECIMAL(12,2) NOT NULL;
```

**⚠️ Be careful:**
- Changing type may fail if existing data doesn't fit (e.g. shrinking size)
- Changing nullable → NOT NULL requires no existing NULLs

---

## 2.7 `ALTER TABLE ... RENAME COLUMN` – Rename with clarity

```sql
ALTER TABLE customers
RENAME COLUMN city TO town;
```

In ERP context, you might do:
- `name` → `full_name`
- `amount` → `total_amount`
- `status` → `order_status`

Example:

```sql
ALTER TABLE orders
RENAME COLUMN amount TO total_amount;
```

**Why rename?**
- To make meaning clearer as ERP grows
- To align with business terminology (`gross_total`, `net_total`, etc.)

**⚠️ After renaming:**
- Update all **queries, views, stored procedures, API code** that reference old name

---

## 2.8 `ALTER TABLE ... DROP COLUMN` – Remove unused ERP fields

```sql
ALTER TABLE customers
DROP COLUMN phone;
```

ERP scenarios:
- You stored `fax_number` earlier, but it's no longer used
- Old column `legacy_code` is now replaced by `customer_code`

Example:

```sql
ALTER TABLE products
DROP COLUMN legacy_code;
```

**⚠️ Be careful:**
- Data is **lost permanently**
- Check if any code, reports, or integrations still use that column

---

## 2.9 `ALTER TABLE ... ADD PRIMARY KEY` – Define identity in ERP tables

```sql
ALTER TABLE customers
ADD CONSTRAINT pk_customers_id
PRIMARY KEY (id);
```

You use this if:
- You created table without PK (bad, but happens in quick POCs)
- Now you want proper relationships: e.g. `orders.customer_id` needs a PK to reference

ERP example: You had a `suppliers` table without PK:

```sql
CREATE TABLE suppliers (
    supplier_code VARCHAR(50),
    name          VARCHAR(150)
);
```

Now fix it:

```sql
ALTER TABLE suppliers
ADD COLUMN id INT AUTO_INCREMENT PRIMARY KEY;
```

Or if `supplier_code` is unique and should be PK:

```sql
ALTER TABLE suppliers
ADD CONSTRAINT pk_suppliers_code
PRIMARY KEY (supplier_code);
```

> **Best practice in ERP:**  
> Every table (especially master & transactional) should have a **primary key**.

---

## 2.10 `ALTER TABLE ... ADD UNIQUE` – Business rules in ERP

```sql
ALTER TABLE customers
ADD CONSTRAINT uq_customers_email
UNIQUE (email);
```

ERP-style common unique constraints:
- `customers.customer_code`
- `suppliers.supplier_code`
- `products.sku`
- `warehouses.code`
- `invoices.invoice_number`
- `purchase_orders.po_number`

Example:

```sql
ALTER TABLE products
ADD CONSTRAINT uq_products_sku
UNIQUE (sku);

ALTER TABLE invoices
ADD CONSTRAINT uq_invoices_invoice_number
UNIQUE (invoice_number);
```

**Why?**
- Enforces **business uniqueness rules** at DB level (not just in code)
- Prevents duplicates that break reporting & integrations

---
