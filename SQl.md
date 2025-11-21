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

# Complete SQL Reference for Data Analysts

## Essential SQL Commands & Queries

### 1. SELECT - Data Retrieval
```sql
-- Basic select
SELECT * FROM table_name;
SELECT column1, column2 FROM table_name;

-- Select with aliases
SELECT column1 AS col1, column2 AS col2 FROM table_name;

-- Select distinct values
SELECT DISTINCT column_name FROM table_name;

-- Select with calculations
SELECT price, quantity, price * quantity AS total FROM orders;
```

### 2. WHERE - Filtering Data
```sql
-- Comparison operators
SELECT * FROM products WHERE price > 100;
SELECT * FROM products WHERE price = 100;
SELECT * FROM products WHERE price != 100;
SELECT * FROM products WHERE price >= 100;
SELECT * FROM products WHERE price <= 100;

-- Logical operators
SELECT * FROM products WHERE price > 100 AND category = 'Electronics';
SELECT * FROM products WHERE price < 50 OR stock = 0;
SELECT * FROM products WHERE NOT category = 'Books';

-- IN operator
SELECT * FROM products WHERE category IN ('Books', 'Electronics', 'Clothing');

-- BETWEEN operator
SELECT * FROM products WHERE price BETWEEN 50 AND 200;
SELECT * FROM orders WHERE order_date BETWEEN '2024-01-01' AND '2024-12-31';

-- LIKE operator (pattern matching)
SELECT * FROM customers WHERE name LIKE 'John%';  -- Starts with John
SELECT * FROM customers WHERE email LIKE '%@gmail.com';  -- Ends with @gmail.com
SELECT * FROM customers WHERE name LIKE '%son%';  -- Contains 'son'
SELECT * FROM customers WHERE name LIKE '_ohn';  -- Single character wildcard

-- NULL checks
SELECT * FROM customers WHERE phone IS NULL;
SELECT * FROM customers WHERE phone IS NOT NULL;
```

### 3. ORDER BY - Sorting Results
```sql
-- Ascending order (default)
SELECT * FROM products ORDER BY price;
SELECT * FROM products ORDER BY price ASC;

-- Descending order
SELECT * FROM products ORDER BY price DESC;

-- Multiple columns
SELECT * FROM products ORDER BY category ASC, price DESC;

-- Order by column position
SELECT name, price, stock FROM products ORDER BY 2 DESC;
```

### 4. LIMIT & OFFSET - Result Pagination
```sql
-- Limit results
SELECT * FROM products LIMIT 10;

-- Skip and limit (pagination)
SELECT * FROM products LIMIT 10 OFFSET 20;

-- MySQL/PostgreSQL alternative syntax
SELECT * FROM products LIMIT 20, 10;  -- MySQL only
```

### 5. Aggregate Functions
```sql
-- COUNT - Count rows
SELECT COUNT(*) FROM customers;
SELECT COUNT(customer_id) FROM customers;
SELECT COUNT(DISTINCT city) FROM customers;

-- SUM - Total of values
SELECT SUM(amount) FROM orders;
SELECT SUM(price * quantity) FROM order_items;

-- AVG - Average value
SELECT AVG(price) FROM products;
SELECT AVG(age) FROM customers;

-- MIN/MAX - Minimum and maximum
SELECT MIN(price) FROM products;
SELECT MAX(order_date) FROM orders;

-- Multiple aggregates
SELECT 
  COUNT(*) AS total_orders,
  SUM(amount) AS total_revenue,
  AVG(amount) AS avg_order_value,
  MIN(amount) AS min_order,
  MAX(amount) AS max_order
FROM orders;
```

### 6. GROUP BY - Grouping Data
```sql
-- Basic grouping
SELECT category, COUNT(*) FROM products GROUP BY category;

-- Multiple columns grouping
SELECT category, brand, COUNT(*) 
FROM products 
GROUP BY category, brand;

-- Grouping with aggregates
SELECT 
  customer_id,
  COUNT(*) AS order_count,
  SUM(amount) AS total_spent,
  AVG(amount) AS avg_order_value
FROM orders
GROUP BY customer_id;

-- Group by date parts
SELECT 
  YEAR(order_date) AS year,
  MONTH(order_date) AS month,
  SUM(amount) AS monthly_revenue
FROM orders
GROUP BY YEAR(order_date), MONTH(order_date);
```

### 7. HAVING - Filter Grouped Results
```sql
-- Filter after grouping
SELECT category, COUNT(*) 
FROM products 
GROUP BY category
HAVING COUNT(*) > 10;

-- Multiple conditions
SELECT customer_id, SUM(amount) AS total_spent
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > 1000 AND COUNT(*) > 5;

-- HAVING with WHERE
SELECT category, AVG(price) AS avg_price
FROM products
WHERE stock > 0
GROUP BY category
HAVING AVG(price) > 100;
```

### 8. JOINS - Combining Tables

#### INNER JOIN
```sql
-- Basic inner join
SELECT customers.name, orders.order_id, orders.amount
FROM customers
INNER JOIN orders ON customers.customer_id = orders.customer_id;

-- Join with aliases
SELECT c.name, o.order_id, o.amount
FROM customers c
INNER JOIN orders o ON c.customer_id = o.customer_id;

-- Multiple joins
SELECT 
  c.name,
  o.order_id,
  p.product_name,
  oi.quantity,
  oi.price
FROM customers c
INNER JOIN orders o ON c.customer_id = o.customer_id
INNER JOIN order_items oi ON o.order_id = oi.order_id
INNER JOIN products p ON oi.product_id = p.product_id;
```

#### LEFT JOIN (LEFT OUTER JOIN)
```sql
-- All customers with their orders (including customers with no orders)
SELECT c.name, o.order_id, o.amount
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id;

-- Find customers with no orders
SELECT c.name
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
WHERE o.order_id IS NULL;
```

#### RIGHT JOIN (RIGHT OUTER JOIN)
```sql
-- All orders with customer info
SELECT c.name, o.order_id, o.amount
FROM customers c
RIGHT JOIN orders o ON c.customer_id = o.customer_id;
```

#### FULL OUTER JOIN
```sql
-- All customers and orders
SELECT c.name, o.order_id, o.amount
FROM customers c
FULL OUTER JOIN orders o ON c.customer_id = o.customer_id;
```

#### CROSS JOIN
```sql
-- Cartesian product (all combinations)
SELECT c.name, p.product_name
FROM customers c
CROSS JOIN products p;
```

#### SELF JOIN
```sql
-- Find employees and their managers
SELECT 
  e1.name AS employee,
  e2.name AS manager
FROM employees e1
LEFT JOIN employees e2 ON e1.manager_id = e2.employee_id;
```

### 9. Subqueries

#### Scalar Subqueries
```sql
-- Single value comparison
SELECT * FROM products
WHERE price > (SELECT AVG(price) FROM products);

-- Subquery in SELECT
SELECT 
  product_name,
  price,
  (SELECT AVG(price) FROM products) AS avg_price,
  price - (SELECT AVG(price) FROM products) AS price_difference
FROM products;
```

#### Row Subqueries
```sql
-- IN subquery
SELECT * FROM customers
WHERE customer_id IN (
  SELECT DISTINCT customer_id FROM orders WHERE amount > 500
);

-- NOT IN subquery
SELECT * FROM products
WHERE product_id NOT IN (
  SELECT product_id FROM order_items
);

-- EXISTS subquery
SELECT * FROM customers c
WHERE EXISTS (
  SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id
);

-- NOT EXISTS
SELECT * FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id
);
```

#### Table Subqueries (FROM clause)
```sql
-- Derived table
SELECT category, avg_price
FROM (
  SELECT category, AVG(price) AS avg_price
  FROM products
  GROUP BY category
) AS category_avg
WHERE avg_price > 100;
```

#### Correlated Subqueries
```sql
-- Subquery references outer query
SELECT p1.product_name, p1.price
FROM products p1
WHERE p1.price > (
  SELECT AVG(p2.price)
  FROM products p2
  WHERE p2.category = p1.category
);
```

### 10. UNION - Combining Result Sets
```sql
-- Combine results (removes duplicates)
SELECT name, email FROM customers
UNION
SELECT name, email FROM suppliers;

-- Keep duplicates
SELECT name FROM customers
UNION ALL
SELECT name FROM suppliers;

-- With ORDER BY
SELECT name, 'Customer' AS type FROM customers
UNION
SELECT name, 'Supplier' AS type FROM suppliers
ORDER BY name;
```

### 11. CASE - Conditional Logic
```sql
-- Simple CASE
SELECT 
  product_name,
  price,
  CASE
    WHEN price < 20 THEN 'Cheap'
    WHEN price BETWEEN 20 AND 100 THEN 'Moderate'
    WHEN price > 100 THEN 'Expensive'
    ELSE 'Unknown'
  END AS price_category
FROM products;

-- CASE in aggregate
SELECT 
  category,
  SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) AS in_stock_count,
  SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS out_of_stock_count
FROM products
GROUP BY category;

-- CASE with ORDER BY
SELECT * FROM products
ORDER BY 
  CASE 
    WHEN category = 'Electronics' THEN 1
    WHEN category = 'Books' THEN 2
    ELSE 3
  END;
```

### 12. String Functions
```sql
-- CONCAT - Combine strings
SELECT CONCAT(first_name, ' ', last_name) AS full_name FROM customers;

-- CONCAT_WS - Concat with separator
SELECT CONCAT_WS(', ', last_name, first_name) AS full_name FROM customers;

-- UPPER/LOWER - Change case
SELECT UPPER(name) FROM customers;
SELECT LOWER(email) FROM customers;

-- LENGTH/CHAR_LENGTH - String length
SELECT name, LENGTH(name) AS name_length FROM customers;

-- SUBSTRING - Extract substring
SELECT SUBSTRING(email, 1, 5) FROM customers;
SELECT SUBSTRING(email FROM 1 FOR 5) FROM customers;  -- PostgreSQL syntax

-- LEFT/RIGHT - Extract from start/end
SELECT LEFT(name, 3) FROM customers;
SELECT RIGHT(name, 3) FROM customers;

-- TRIM - Remove spaces
SELECT TRIM(name) FROM customers;
SELECT LTRIM(name) FROM customers;  -- Left trim
SELECT RTRIM(name) FROM customers;  -- Right trim

-- REPLACE - Replace substring
SELECT REPLACE(email, '@gmail.com', '@company.com') FROM customers;

-- POSITION/LOCATE - Find substring position
SELECT POSITION('@' IN email) FROM customers;  -- PostgreSQL
SELECT LOCATE('@', email) FROM customers;  -- MySQL

-- SPLIT_PART - Split string (PostgreSQL)
SELECT SPLIT_PART(email, '@', 1) AS username FROM customers;
```

### 13. Date & Time Functions
```sql
-- Current date/time
SELECT NOW();  -- Current date and time
SELECT CURDATE();  -- Current date
SELECT CURRENT_DATE;
SELECT CURTIME();  -- Current time
SELECT CURRENT_TIMESTAMP;

-- Extract parts
SELECT 
  YEAR(order_date) AS year,
  MONTH(order_date) AS month,
  DAY(order_date) AS day,
  HOUR(order_time) AS hour,
  MINUTE(order_time) AS minute
FROM orders;

-- EXTRACT (ANSI SQL)
SELECT EXTRACT(YEAR FROM order_date) AS year FROM orders;
SELECT EXTRACT(MONTH FROM order_date) AS month FROM orders;

-- Date arithmetic
SELECT DATE_ADD(order_date, INTERVAL 30 DAY) FROM orders;  -- MySQL
SELECT DATE_SUB(order_date, INTERVAL 1 MONTH) FROM orders;
SELECT order_date + INTERVAL '30 days' FROM orders;  -- PostgreSQL

-- DATEDIFF - Difference between dates
SELECT DATEDIFF(NOW(), order_date) AS days_ago FROM orders;  -- MySQL
SELECT order_date - CURRENT_DATE AS days_ago FROM orders;  -- PostgreSQL

-- Format dates
SELECT DATE_FORMAT(order_date, '%Y-%m-%d') FROM orders;  -- MySQL
SELECT TO_CHAR(order_date, 'YYYY-MM-DD') FROM orders;  -- PostgreSQL

-- Week/Quarter
SELECT WEEK(order_date) AS week_number FROM orders;
SELECT QUARTER(order_date) AS quarter FROM orders;

-- Day of week
SELECT DAYOFWEEK(order_date) FROM orders;  -- MySQL (1=Sunday)
SELECT DAYNAME(order_date) FROM orders;  -- MySQL
SELECT EXTRACT(DOW FROM order_date) FROM orders;  -- PostgreSQL (0=Sunday)

-- Truncate dates
SELECT DATE_TRUNC('month', order_date) FROM orders;  -- PostgreSQL
SELECT DATE_FORMAT(order_date, '%Y-%m-01') FROM orders;  -- MySQL (first of month)
```

### 14. Numeric Functions
```sql
-- ROUND - Round to decimals
SELECT ROUND(price, 2) FROM products;

-- CEILING/FLOOR - Round up/down
SELECT CEILING(price) FROM products;
SELECT FLOOR(price) FROM products;

-- ABS - Absolute value
SELECT ABS(profit) FROM transactions;

-- MOD - Modulo (remainder)
SELECT MOD(quantity, 10) FROM products;
SELECT quantity % 10 FROM products;  -- Alternative syntax

-- POWER/POW - Exponentiation
SELECT POWER(price, 2) FROM products;

-- SQRT - Square root
SELECT SQRT(area) FROM properties;

-- RANDOM - Random number
SELECT RANDOM() FROM generate_series(1, 10);  -- PostgreSQL
SELECT RAND() FROM products LIMIT 10;  -- MySQL
```

### 15. NULL Handling Functions
```sql
-- COALESCE - Return first non-null value
SELECT COALESCE(phone, email, 'No contact') FROM customers;

-- NULLIF - Return null if equal
SELECT NULLIF(discount, 0) FROM products;

-- IFNULL / NVL - Replace null (MySQL / Oracle)
SELECT IFNULL(phone, 'N/A') FROM customers;  -- MySQL
SELECT NVL(phone, 'N/A') FROM customers;  -- Oracle

-- CASE for NULL handling
SELECT 
  CASE 
    WHEN phone IS NULL THEN 'No phone'
    ELSE phone
  END AS contact_phone
FROM customers;
```

### 16. Window Functions (Analytical Functions)

#### ROW_NUMBER, RANK, DENSE_RANK
```sql
-- ROW_NUMBER - Sequential number
SELECT 
  product_name,
  price,
  ROW_NUMBER() OVER (ORDER BY price DESC) AS row_num
FROM products;

-- RANK - Rank with gaps
SELECT 
  product_name,
  price,
  RANK() OVER (ORDER BY price DESC) AS rank
FROM products;

-- DENSE_RANK - Rank without gaps
SELECT 
  product_name,
  price,
  DENSE_RANK() OVER (ORDER BY price DESC) AS dense_rank
FROM products;

-- Partition by category
SELECT 
  category,
  product_name,
  price,
  RANK() OVER (PARTITION BY category ORDER BY price DESC) AS category_rank
FROM products;
```

#### Aggregate Window Functions
```sql
-- Running total
SELECT 
  order_date,
  amount,
  SUM(amount) OVER (ORDER BY order_date) AS running_total
FROM orders;

-- Moving average
SELECT 
  order_date,
  amount,
  AVG(amount) OVER (ORDER BY order_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS moving_avg_7days
FROM orders;

-- Cumulative count
SELECT 
  order_date,
  COUNT(*) OVER (ORDER BY order_date) AS cumulative_orders
FROM orders;
```

#### LAG and LEAD
```sql
-- LAG - Previous row value
SELECT 
  order_date,
  amount,
  LAG(amount, 1) OVER (ORDER BY order_date) AS previous_amount,
  amount - LAG(amount, 1) OVER (ORDER BY order_date) AS difference
FROM orders;

-- LEAD - Next row value
SELECT 
  order_date,
  amount,
  LEAD(amount, 1) OVER (ORDER BY order_date) AS next_amount
FROM orders;
```

#### FIRST_VALUE and LAST_VALUE
```sql
-- First and last values in window
SELECT 
  order_date,
  amount,
  FIRST_VALUE(amount) OVER (ORDER BY order_date) AS first_order_amount,
  LAST_VALUE(amount) OVER (ORDER BY order_date ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_order_amount
FROM orders;
```

#### NTILE - Divide into buckets
```sql
-- Divide into quartiles
SELECT 
  product_name,
  price,
  NTILE(4) OVER (ORDER BY price) AS price_quartile
FROM products;
```

### 17. Common Table Expressions (CTEs)
```sql
-- Basic CTE
WITH high_value_customers AS (
  SELECT 
    customer_id,
    SUM(amount) AS total_spent
  FROM orders
  GROUP BY customer_id
  HAVING SUM(amount) > 1000
)
SELECT c.name, hvc.total_spent
FROM customers c
INNER JOIN high_value_customers hvc ON c.customer_id = hvc.customer_id;

-- Multiple CTEs
WITH 
  monthly_sales AS (
    SELECT 
      DATE_TRUNC('month', order_date) AS month,
      SUM(amount) AS total_sales
    FROM orders
    GROUP BY DATE_TRUNC('month', order_date)
  ),
  avg_monthly AS (
    SELECT AVG(total_sales) AS avg_sales
    FROM monthly_sales
  )
SELECT ms.month, ms.total_sales, am.avg_sales
FROM monthly_sales ms
CROSS JOIN avg_monthly am
WHERE ms.total_sales > am.avg_sales;

-- Recursive CTE (hierarchical data)
WITH RECURSIVE employee_hierarchy AS (
  -- Base case
  SELECT employee_id, name, manager_id, 1 AS level
  FROM employees
  WHERE manager_id IS NULL
  
  UNION ALL
  
  -- Recursive case
  SELECT e.employee_id, e.name, e.manager_id, eh.level + 1
  FROM employees e
  INNER JOIN employee_hierarchy eh ON e.manager_id = eh.employee_id
)
SELECT * FROM employee_hierarchy;
```

### 18. INSERT - Adding Data
```sql
-- Insert single row
INSERT INTO customers (name, email, city)
VALUES ('John Doe', 'john@example.com', 'New York');

-- Insert multiple rows
INSERT INTO customers (name, email, city)
VALUES 
  ('Jane Smith', 'jane@example.com', 'Los Angeles'),
  ('Bob Johnson', 'bob@example.com', 'Chicago'),
  ('Alice Brown', 'alice@example.com', 'Houston');

-- Insert from SELECT
INSERT INTO archived_orders (order_id, customer_id, amount)
SELECT order_id, customer_id, amount
FROM orders
WHERE order_date < '2020-01-01';

-- Insert with default values
INSERT INTO products (name, category)
VALUES ('New Product', 'Electronics');  -- Other columns use defaults
```

### 19. UPDATE - Modifying Data
```sql
-- Basic update
UPDATE customers
SET email = 'newemail@example.com'
WHERE customer_id = 1;

-- Update multiple columns
UPDATE products
SET price = 99.99, stock = 50, updated_at = NOW()
WHERE product_id = 10;

-- Update with calculation
UPDATE products
SET price = price * 1.1  -- 10% increase
WHERE category = 'Electronics';

-- Update from another table (using JOIN)
UPDATE products p
INNER JOIN categories c ON p.category_id = c.category_id
SET p.discount = c.standard_discount
WHERE c.name = 'Clearance';

-- Conditional update with CASE
UPDATE products
SET status = CASE
  WHEN stock = 0 THEN 'Out of Stock'
  WHEN stock < 10 THEN 'Low Stock'
  ELSE 'Available'
END;
```

### 20. DELETE - Removing Data
```sql
-- Delete specific rows
DELETE FROM customers WHERE customer_id = 5;

-- Delete with condition
DELETE FROM orders WHERE order_date < '2020-01-01';

-- Delete using subquery
DELETE FROM products
WHERE product_id IN (
  SELECT product_id FROM discontinued_products
);

-- Delete all rows (keep structure)
DELETE FROM temp_table;

-- TRUNCATE (faster, resets auto-increment)
TRUNCATE TABLE temp_table;
```

### 21. CREATE TABLE - Table Creation
```sql
-- Basic table creation
CREATE TABLE customers (
  customer_id INT PRIMARY KEY AUTO_INCREMENT,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) UNIQUE,
  phone VARCHAR(20),
  city VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table with foreign key
CREATE TABLE orders (
  order_id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  order_date DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) DEFAULT 'Pending',
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

-- Table with check constraint
CREATE TABLE products (
  product_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL CHECK (price > 0),
  stock INT DEFAULT 0 CHECK (stock >= 0),
  category VARCHAR(50)
);

-- Create table from query
CREATE TABLE high_value_customers AS
SELECT customer_id, name, total_spent
FROM (
  SELECT c.customer_id, c.name, SUM(o.amount) AS total_spent
  FROM customers c
  INNER JOIN orders o ON c.customer_id = o.customer_id
  GROUP BY c.customer_id, c.name
  HAVING SUM(o.amount) > 1000
) AS subquery;
```

### 22. ALTER TABLE - Modifying Tables
```sql
-- Add column
ALTER TABLE customers ADD COLUMN age INT;

-- Drop column
ALTER TABLE customers DROP COLUMN age;

-- Modify column datatype
ALTER TABLE customers MODIFY COLUMN email VARCHAR(150);

-- Rename column
ALTER TABLE customers RENAME COLUMN phone TO phone_number;

-- Add constraint
ALTER TABLE customers ADD CONSTRAINT unique_email UNIQUE (email);

-- Drop constraint
ALTER TABLE customers DROP CONSTRAINT unique_email;

-- Add foreign key
ALTER TABLE orders 
ADD CONSTRAINT fk_customer 
FOREIGN KEY (customer_id) REFERENCES customers(customer_id);

-- Rename table
ALTER TABLE customers RENAME TO clients;
```

### 23. DROP & TRUNCATE
```sql
-- Drop table (delete completely)
DROP TABLE IF EXISTS temp_table;

-- Truncate table (delete all data, keep structure)
TRUNCATE TABLE temp_table;

-- Drop database
DROP DATABASE IF EXISTS test_db;
```

### 24. INDEXES - Performance Optimization
```sql
-- Create index
CREATE INDEX idx_email ON customers(email);

-- Create composite index
CREATE INDEX idx_name ON customers(last_name, first_name);

-- Create unique index
CREATE UNIQUE INDEX idx_unique_email ON customers(email);

-- Drop index
DROP INDEX idx_email ON customers;

-- Show indexes
SHOW INDEX FROM customers;  -- MySQL
SELECT * FROM pg_indexes WHERE tablename = 'customers';  -- PostgreSQL
```

### 25. VIEWS - Virtual Tables
```sql
-- Create view
CREATE VIEW customer_orders AS
SELECT 
  c.customer_id,
  c.name,
  c.email,
  o.order_id,
  o.order_date,
  o.amount
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id;

-- Use view
SELECT * FROM customer_orders WHERE amount > 100;

-- Create or replace view
CREATE OR REPLACE VIEW customer_orders AS
SELECT 
  c.customer_id,
  c.name,
  o.order_id,
  o.amount
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id;

-- Drop view
DROP VIEW customer_orders;

-- Materialized view (PostgreSQL)
CREATE MATERIALIZED VIEW monthly_sales AS
SELECT 
  DATE_TRUNC('month', order_date) AS month,
  SUM(amount) AS total_sales
FROM orders
GROUP BY DATE_TRUNC('month', order_date);

-- Refresh materialized view
REFRESH MATERIALIZED VIEW monthly_sales;
```

### 26. TRANSACTIONS - Data Integrity
```sql
-- Start transaction
START TRANSACTION;  -- or BEGIN;

-- Execute queries
UPDATE accounts SET balance = balance - 100 WHERE account_id = 1;
UPDATE accounts SET balance = balance + 100 WHERE account_id = 2;

-- Commit if successful
COMMIT;

-- Rollback if error
ROLLBACK;

-- Transaction with savepoint
START TRANSACTION;
UPDATE products SET price = price * 1.1;
SAVEPOINT price_increase;
UPDATE products SET stock = 0 WHERE stock < 5;
ROLLBACK TO SAVEPOINT price_increase;  -- Undo stock update only
COMMIT;
```

### 27. Data Analysis Patterns

#### Cohort Analysis
```sql
WITH user_cohorts AS (
  SELECT 
    user_id,
    DATE_TRUNC('month', MIN(signup_date)) AS cohort_month
  FROM users
  GROUP BY user_id
),
user_activities AS (
  SELECT 
    uc.cohort_month,
    DATE_TRUNC('month', a.activity_date) AS activity_month,
    COUNT(DISTINCT a.user_id) AS active_users
  FROM user_cohorts uc
  INNER JOIN activities a ON uc.user_id = a.user_id
  GROUP BY uc.cohort_month, DATE_TRUNC('month', a.activity_date)
)
SELECT 
  cohort_month,
  activity_month,
  active_users,
  ROUND(100.0 * active_users / FIRST_VALUE(active_users) OVER (PARTITION BY cohort_month ORDER BY activity_month), 2) AS retention_rate
FROM user_activities
ORDER BY cohort_month, activity_month;
```

#### RFM Analysis (Recency, Frequency, Monetary)
```sql
WITH rfm_calc AS (
  SELECT 
    customer_id,
    DATEDIFF(CURRENT_DATE, MAX(order_date)) AS recency,
    COUNT(*) AS frequency,
    SUM(amount) AS monetary
  FROM orders
  WHERE order_date >= DATE_SUB(CURRENT_DATE, INTERVAL 1 YEAR)
  GROUP BY customer_id
),
rfm_scores AS (
  SELECT 
    customer_id,
    recency,
    frequency,
    monetary,
    NTILE(5) OVER (ORDER BY recency DESC) AS r_score,
    NTILE(5) OVER (ORDER BY frequency ASC) AS f_score,
    NTILE(5) OVER (ORDER BY monetary ASC) AS m_score
  FROM rfm_calc
)
SELECT 
  customer_id,
  CONCAT(r_score, f_score, m_score) AS rfm_score,
  CASE
    WHEN r_score >= 4 AND f_score >= 4 THEN 'Champions'
    WHEN r_score >= 3 AND f_score >= 3 THEN 'Loyal Customers'
    WHEN r_score >= 4 AND f_score <= 2 THEN 'Promising'
    WHEN r_score <= 2 AND f_score >= 3 THEN 'At Risk'
    ELSE 'Other'
  END AS customer_segment
FROM rfm_scores;
```

#### Time Series Analysis
```sql
-- Daily sales with moving average
SELECT 
  order_date,
  SUM(amount) AS daily_sales,
  AVG(SUM(amount)) OVER (
    ORDER BY order_date 
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS moving_avg_7days,
  SUM(SUM(amount)) OVER (
    PARTITION BY YEAR(order_date), MONTH(order_date)
    ORDER BY order_date
  ) AS month_to_date
FROM orders
GROUP BY order_date
ORDER BY order_date;
```

#### Funnel Analysis
```sql
WITH funnel_steps AS (
  SELECT 
    user_id,
    MAX(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS viewed,
    MAX(CASE WHEN event_type = 'add_to_cart' THEN 1 ELSE 0 END) AS added_to_cart,
    MAX(CASE WHEN event_type = 'checkout' THEN 1 ELSE 0 END) AS checked_out,
    MAX(CASE WHEN event_type = 'purchase' THEN 1 ELSE 0 END) AS purchased
  FROM events
  GROUP BY user_id
)
SELECT 
  SUM(viewed) AS total_views,
  SUM(added_to_cart) AS total_add_to_cart,
  SUM(checked_out) AS total_checkout,
  SUM(purchased) AS total_purchase,
  ROUND(100.0 * SUM(added_to_cart) / SUM(viewed), 2) AS cart_conversion,
  ROUND(100.0 * SUM(checked_out) / SUM(added_to_cart), 2) AS checkout_conversion,
  ROUND(100.0 * SUM(purchased) / SUM(checked_out), 2) AS purchase_conversion
FROM funnel_steps;
```

#### Pivot Tables (Manual)
```sql
-- Sales by category and quarter
SELECT 
  category,
  SUM(CASE WHEN QUARTER(order_date) = 1 THEN amount ELSE 0 END) AS Q1,
  SUM(CASE WHEN QUARTER(order_date) = 2 THEN amount ELSE 0 END) AS Q2,
  SUM(CASE WHEN QUARTER(order_date) = 3 THEN amount ELSE 0 END) AS Q3,
  SUM(CASE WHEN QUARTER(order_date) = 4 THEN amount ELSE 0 END) AS Q4,
  SUM(amount) AS total
FROM orders o
INNER JOIN order_items oi ON o.order_id = oi.order_id
INNER JOIN products p ON oi.product_id = p.product_id
WHERE YEAR(order_date) = 2024
GROUP BY category;
```

### 28. Performance Optimization Queries

#### EXPLAIN - Query Analysis
```sql
-- Analyze query execution plan
EXPLAIN SELECT * FROM orders WHERE customer_id = 100;

-- Detailed analysis
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 100;
```

#### Index Usage Check
```sql
-- Show indexes
SHOW INDEX FROM orders;

-- Find unused indexes (MySQL)
SELECT * FROM sys.schema_unused_indexes;

-- Find duplicate indexes (MySQL)
SELECT * FROM sys.schema_redundant_indexes;
```

## Essential Data Types

### Numeric Types
- **INT / INTEGER**: Whole numbers (-2,147,483,648 to 2,147,483,647)
- **BIGINT**: Large integers (-9,223,372,036,854,775,808 to 9,223,372,036,854,775,807)
- **SMALLINT**: Small integers (-32,768 to 32,767)
- **TINYINT**: Very small integers (0 to 255 or -128 to 127)
- **DECIMAL(p,s) / NUMERIC(p,s)**: Fixed-point numbers (p=precision, s=scale)
- **FLOAT / REAL**: Approximate floating-point numbers
- **DOUBLE**: Double-precision floating-point numbers

### String Types
- **VARCHAR(n)**: Variable-length string (max n characters)
- **CHAR(n)**: Fixed-length string (exactly n characters)
- **TEXT**: Long text (up to 65,535 characters)
- **MEDIUMTEXT**: Medium text (up to 16,777,215 characters)
- **LONGTEXT**: Very long text (up to 4,294,967,295 characters)

### Date and Time Types
- **DATE**: Date (YYYY-MM-DD)
- **TIME**: Time (HH:MM:SS)
- **DATETIME**: Date and time (YYYY-MM-DD HH:MM:SS)
- **TIMESTAMP**: Unix timestamp
- **YEAR**: Year (YYYY)

### Other Types
- **BOOLEAN / BOOL**: True/False (stored as TINYINT(1))
- **BLOB**: Binary large object
- **JSON**: JSON data (MySQL 5.7+, PostgreSQL 9.2+)
- **ENUM**: Enumerated values
- **SET**: Set of values

## Common Data Analysis Queries

### 1. Descriptive Statistics
```sql
SELECT 
  COUNT(*) AS total_records,
  COUNT(DISTINCT customer_id) AS unique_customers,
  MIN(order_date) AS first_order,
  MAX(order_date) AS last_order,
  SUM(amount) AS total_revenue,
  AVG(amount) AS avg_order_value,
  STDDEV(amount) AS std_deviation,
  VARIANCE(amount) AS variance,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) AS median  -- PostgreSQL
FROM orders;
```

### 2. Growth Metrics (YoY, MoM)
```sql
WITH monthly_revenue AS (
  SELECT 
    DATE_TRUNC('month', order_date) AS month,
    SUM(amount) AS revenue
  FROM orders
  GROUP BY DATE_TRUNC('month', order_date)
)
SELECT 
  month,
  revenue,
  LAG(revenue, 1) OVER (ORDER BY month) AS prev_month_revenue,
  LAG(revenue, 12) OVER (ORDER BY month) AS prev_year_revenue,
  ROUND(100.0 * (revenue - LAG(revenue, 1) OVER (ORDER BY month)) / LAG(revenue, 1) OVER (ORDER BY month), 2) AS mom_growth,
  ROUND(100.0 * (revenue - LAG(revenue, 12) OVER (ORDER BY month)) / LAG(revenue, 12) OVER (ORDER BY month), 2) AS yoy_growth
FROM monthly_revenue
ORDER BY month;
```

### 3. Customer Lifetime Value (CLV)
```sql
SELECT 
  customer_id,
  COUNT(*) AS total_orders,
  SUM(amount) AS total_spent,
  AVG(amount) AS avg_order_value,
  MIN(order_date) AS first_order_date,
  MAX(order_date) AS last_order_date,
  DATEDIFF(MAX(order_date), MIN(order_date)) AS customer_lifespan_days,
  CASE 
    WHEN COUNT(*) > 1 
    THEN DATEDIFF(MAX(order_date), MIN(order_date)) / (COUNT(*) - 1)
    ELSE NULL 
  END AS avg_days_between_orders
FROM orders
GROUP BY customer_id
HAVING COUNT(*) >= 2;
```

### 4. Churn Analysis
```sql
WITH customer_activity AS (
  SELECT 
    customer_id,
    MAX(order_date) AS last_order_date,
    COUNT(*) AS total_orders,
    DATEDIFF(CURRENT_DATE, MAX(order_date)) AS days_since_last_order
  FROM orders
  GROUP BY customer_id
)
SELECT 
  CASE 
    WHEN days_since_last_order <= 30 THEN 'Active'
    WHEN days_since_last_order <= 90 THEN 'At Risk'
    WHEN days_since_last_order <= 180 THEN 'Dormant'
    ELSE 'Churned'
  END AS customer_status,
  COUNT(*) AS customer_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM customer_activity
GROUP BY 
  CASE 
    WHEN days_since_last_order <= 30 THEN 'Active'
    WHEN days_since_last_order <= 90 THEN 'At Risk'
    WHEN days_since_last_order <= 180 THEN 'Dormant'
    ELSE 'Churned'
  END;
```

### 5. Product Performance Analysis
```sql
SELECT 
  p.product_id,
  p.product_name,
  p.category,
  COUNT(DISTINCT o.order_id) AS times_ordered,
  SUM(oi.quantity) AS total_quantity_sold,
  SUM(oi.quantity * oi.price) AS total_revenue,
  AVG(oi.price) AS avg_selling_price,
  RANK() OVER (ORDER BY SUM(oi.quantity * oi.price) DESC) AS revenue_rank,
  RANK() OVER (PARTITION BY p.category ORDER BY SUM(oi.quantity * oi.price) DESC) AS category_rank
FROM products p
LEFT JOIN order_items oi ON p.product_id = oi.product_id
LEFT JOIN orders o ON oi.order_id = o.order_id
GROUP BY p.product_id, p.product_name, p.category
ORDER BY total_revenue DESC;
```

### 6. ABC Analysis (Pareto Principle)
```sql
WITH product_revenue AS (
  SELECT 
    product_id,
    SUM(quantity * price) AS revenue
  FROM order_items
  GROUP BY product_id
),
revenue_cumulative AS (
  SELECT 
    product_id,
    revenue,
    SUM(revenue) OVER (ORDER BY revenue DESC) AS cumulative_revenue,
    SUM(revenue) OVER () AS total_revenue
  FROM product_revenue
)
SELECT 
  product_id,
  revenue,
  ROUND(100.0 * cumulative_revenue / total_revenue, 2) AS cumulative_percentage,
  CASE 
    WHEN 100.0 * cumulative_revenue / total_revenue <= 80 THEN 'A'
    WHEN 100.0 * cumulative_revenue / total_revenue <= 95 THEN 'B'
    ELSE 'C'
  END AS abc_category
FROM revenue_cumulative
ORDER BY revenue DESC;
```

### 7. Market Basket Analysis
```sql
-- Find frequently bought together products
SELECT 
  oi1.product_id AS product_a,
  oi2.product_id AS product_b,
  COUNT(DISTINCT oi1.order_id) AS times_bought_together,
  ROUND(100.0 * COUNT(DISTINCT oi1.order_id) / (SELECT COUNT(DISTINCT order_id) FROM order_items), 2) AS support_percentage
FROM order_items oi1
INNER JOIN order_items oi2 
  ON oi1.order_id = oi2.order_id 
  AND oi1.product_id < oi2.product_id
GROUP BY oi1.product_id, oi2.product_id
HAVING COUNT(DISTINCT oi1.order_id) >= 10
ORDER BY times_bought_together DESC
LIMIT 20;
```

### 8. Customer Segmentation
```sql
WITH customer_metrics AS (
  SELECT 
    customer_id,
    COUNT(*) AS order_count,
    SUM(amount) AS total_spent,
    AVG(amount) AS avg_order_value,
    DATEDIFF(CURRENT_DATE, MAX(order_date)) AS days_since_last_order
  FROM orders
  GROUP BY customer_id
)
SELECT 
  CASE 
    WHEN total_spent >= 5000 AND order_count >= 10 THEN 'VIP'
    WHEN total_spent >= 2000 AND order_count >= 5 THEN 'High Value'
    WHEN total_spent >= 500 AND order_count >= 2 THEN 'Medium Value'
    WHEN order_count = 1 THEN 'One-time'
    ELSE 'Low Value'
  END AS customer_segment,
  COUNT(*) AS customer_count,
  ROUND(AVG(total_spent), 2) AS avg_total_spent,
  ROUND(AVG(order_count), 2) AS avg_order_count
FROM customer_metrics
GROUP BY 
  CASE 
    WHEN total_spent >= 5000 AND order_count >= 10 THEN 'VIP'
    WHEN total_spent >= 2000 AND order_count >= 5 THEN 'High Value'
    WHEN total_spent >= 500 AND order_count >= 2 THEN 'Medium Value'
    WHEN order_count = 1 THEN 'One-time'
    ELSE 'Low Value'
  END
ORDER BY avg_total_spent DESC;
```

### 9. Conversion Rate Analysis
```sql
WITH user_funnel AS (
  SELECT 
    user_id,
    MAX(CASE WHEN event_type = 'visit' THEN 1 ELSE 0 END) AS visited,
    MAX(CASE WHEN event_type = 'signup' THEN 1 ELSE 0 END) AS signed_up,
    MAX(CASE WHEN event_type = 'first_purchase' THEN 1 ELSE 0 END) AS purchased
  FROM user_events
  GROUP BY user_id
)
SELECT 
  COUNT(*) AS total_visitors,
  SUM(signed_up) AS total_signups,
  SUM(purchased) AS total_purchases,
  ROUND(100.0 * SUM(signed_up) / COUNT(*), 2) AS signup_rate,
  ROUND(100.0 * SUM(purchased) / SUM(signed_up), 2) AS purchase_rate,
  ROUND(100.0 * SUM(purchased) / COUNT(*), 2) AS overall_conversion_rate
FROM user_funnel;
```

### 10. Seasonality Analysis
```sql
SELECT 
  YEAR(order_date) AS year,
  MONTH(order_date) AS month,
  DAYNAME(order_date) AS day_of_week,
  COUNT(*) AS order_count,
  SUM(amount) AS total_revenue,
  AVG(amount) AS avg_order_value
FROM orders
GROUP BY 
  YEAR(order_date),
  MONTH(order_date),
  DAYNAME(order_date)
ORDER BY year, month, 
  CASE DAYNAME(order_date)
    WHEN 'Monday' THEN 1
    WHEN 'Tuesday' THEN 2
    WHEN 'Wednesday' THEN 3
    WHEN 'Thursday' THEN 4
    WHEN 'Friday' THEN 5
    WHEN 'Saturday' THEN 6
    WHEN 'Sunday' THEN 7
  END;
```

## Advanced SQL Techniques for Data Analysts

### 1. Handling Duplicates
```sql
-- Find duplicates
SELECT email, COUNT(*)
FROM customers
GROUP BY email
HAVING COUNT(*) > 1;

-- Remove duplicates (keep first occurrence)
DELETE c1 FROM customers c1
INNER JOIN customers c2 
WHERE c1.customer_id > c2.customer_id 
AND c1.email = c2.email;

-- Using ROW_NUMBER to identify duplicates
WITH ranked_customers AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY email ORDER BY customer_id) AS rn
  FROM customers
)
DELETE FROM customers
WHERE customer_id IN (
  SELECT customer_id FROM ranked_customers WHERE rn > 1
);
```

### 2. Data Quality Checks
```sql
-- Check for NULL values
SELECT 
  COUNT(*) AS total_rows,
  COUNT(email) AS email_count,
  COUNT(*) - COUNT(email) AS email_nulls,
  COUNT(phone) AS phone_count,
  COUNT(*) - COUNT(phone) AS phone_nulls
FROM customers;

-- Check for outliers
SELECT *
FROM orders
WHERE amount > (SELECT AVG(amount) + 3 * STDDEV(amount) FROM orders)
   OR amount < (SELECT AVG(amount) - 3 * STDDEV(amount) FROM orders);

-- Check data ranges
SELECT 
  MIN(order_date) AS earliest_date,
  MAX(order_date) AS latest_date,
  MIN(amount) AS min_amount,
  MAX(amount) AS max_amount
FROM orders
WHERE order_date < '1900-01-01' OR order_date > CURRENT_DATE;
```

### 3. Text Analysis
```sql
-- Word frequency analysis
SELECT 
  SUBSTRING_INDEX(SUBSTRING_INDEX(description, ' ', n.n), ' ', -1) AS word,
  COUNT(*) AS frequency
FROM products
CROSS JOIN (
  SELECT 1 AS n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
) n
WHERE CHAR_LENGTH(description) - CHAR_LENGTH(REPLACE(description, ' ', '')) >= n.n - 1
GROUP BY word
ORDER BY frequency DESC
LIMIT 20;

-- Extract domain from email
SELECT 
  SUBSTRING(email, POSITION('@' IN email) + 1) AS domain,
  COUNT(*) AS customer_count
FROM customers
GROUP BY SUBSTRING(email, POSITION('@' IN email) + 1)
ORDER BY customer_count DESC;
```

### 4. Running Calculations
```sql
-- Running total by category
SELECT 
  order_date,
  category,
  amount,
  SUM(amount) OVER (
    PARTITION BY category 
    ORDER BY order_date
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_total
FROM orders o
INNER JOIN order_items oi ON o.order_id = oi.order_id
INNER JOIN products p ON oi.product_id = p.product_id;

-- Percent of total
SELECT 
  category,
  SUM(amount) AS category_revenue,
  ROUND(100.0 * SUM(amount) / SUM(SUM(amount)) OVER (), 2) AS percent_of_total
FROM orders o
INNER JOIN order_items oi ON o.order_id = oi.order_id
INNER JOIN products p ON oi.product_id = p.product_id
GROUP BY category;
```

### 5. Date Range Queries
```sql
-- Last 7 days
SELECT * FROM orders 
WHERE order_date >= CURRENT_DATE - INTERVAL 7 DAY;

-- Last 30 days
SELECT * FROM orders 
WHERE order_date >= CURRENT_DATE - INTERVAL 30 DAY;

-- Current month
SELECT * FROM orders 
WHERE YEAR(order_date) = YEAR(CURRENT_DATE)
  AND MONTH(order_date) = MONTH(CURRENT_DATE);

-- Previous month
SELECT * FROM orders 
WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL 1 MONTH
  AND order_date < DATE_TRUNC('month', CURRENT_DATE);

-- Year to date
SELECT * FROM orders 
WHERE YEAR(order_date) = YEAR(CURRENT_DATE);

-- Same period last year
SELECT * FROM orders 
WHERE order_date BETWEEN 
  DATE_SUB(CURRENT_DATE, INTERVAL 1 YEAR) 
  AND DATE_SUB(CURRENT_DATE, INTERVAL 1 YEAR) + INTERVAL 30 DAY;
```

## SQL Best Practices for Data Analysts

### 1. Query Optimization
- Use indexes on frequently queried columns
- Avoid SELECT *, specify only needed columns
- Use WHERE before JOIN when possible
- Limit result sets with WHERE, LIMIT
- Use EXPLAIN to analyze query performance
- Avoid functions on indexed columns in WHERE clause
- Use UNION ALL instead of UNION when duplicates don't matter

### 2. Code Readability
- Use meaningful aliases
- Indent SQL for readability
- Use uppercase for SQL keywords
- Comment complex queries
- Break long queries into CTEs
- Use consistent naming conventions

### 3. Data Integrity
- Always use WHERE clause with UPDATE/DELETE
- Test queries with SELECT before UPDATE/DELETE
- Use transactions for multiple related operations
- Backup data before major operations
- Validate data after imports

### 4. Common Pitfalls to Avoid
- Forgetting WHERE clause in UPDATE/DELETE
- Not handling NULL values properly
- Using != instead of IS NOT NULL
- Cartesian products from missing JOIN conditions
- Not considering data types in comparisons
- Forgetting time zones in date comparisons

## Database-Specific Syntax Differences

### MySQL vs PostgreSQL vs SQL Server

```sql
-- LIMIT (Pagination)
-- MySQL/PostgreSQL:
SELECT * FROM orders LIMIT 10 OFFSET 20;
-- SQL Server:
SELECT * FROM orders ORDER BY order_id OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;

-- String concatenation
-- MySQL:
SELECT CONCAT(first_name, ' ', last_name) FROM customers;
-- PostgreSQL:
SELECT first_name || ' ' || last_name FROM customers;
-- SQL Server:
SELECT first_name + ' ' + last_name FROM customers;

-- Date functions
-- MySQL:
SELECT NOW(), CURDATE(), DATE_ADD(order_date, INTERVAL 30 DAY);
-- PostgreSQL:
SELECT NOW(), CURRENT_DATE, order_date + INTERVAL '30 days';
-- SQL Server:
SELECT GETDATE(), CAST(GETDATE() AS DATE), DATEADD(day, 30, order_date);

-- Auto-increment
-- MySQL:
CREATE TABLE customers (id INT AUTO_INCREMENT PRIMARY KEY);
-- PostgreSQL:
CREATE TABLE customers (id SERIAL PRIMARY KEY);
-- SQL Server:
CREATE TABLE customers (id INT IDENTITY(1,1) PRIMARY KEY);

-- Top N records
-- MySQL/PostgreSQL:
SELECT * FROM orders ORDER BY amount DESC LIMIT 10;
-- SQL Server:
SELECT TOP 10 * FROM orders ORDER BY amount DESC;
```

## Essential Tools & Resources for Data Analysts

### Database Clients
- **DBeaver** - Universal database tool (free)
- **DataGrip** - JetBrains SQL IDE (paid)
- **MySQL Workbench** - MySQL GUI (free)
- **pgAdmin** - PostgreSQL GUI (free)
- **Azure Data Studio** - Microsoft SQL Server (free)
- **TablePlus** - Modern database GUI (freemium)

### Online Practice Platforms
- **SQLZoo** - Interactive tutorials
- **LeetCode** - SQL problems (easy to hard)
- **HackerRank** - SQL challenges
- **Mode Analytics** - Real datasets
- **DataLemur** - SQL interview questions
- **Stratascratch** - Data science SQL questions

### Learning Resources
- **PostgreSQL Documentation** - Most comprehensive
- **MySQL Documentation** - Official reference
- **SQLBolt** - Interactive lessons
- **W3Schools SQL** - Quick reference
- **SQL Tutorial by Mode** - Analytics focus

### Books for Data Analysts
- "SQL for Data Analysis" by Cathy Tanimura
- "Practical SQL" by Anthony DeBarros
- "SQL Queries for Mere Mortals" by John Viescas
- "The Art of SQL" by Stéphane Faroult

### Practice Datasets
- **Kaggle Datasets** - Real-world data
- **Maven Analytics** - Sample databases
- **SQL Murder Mystery** - Fun learning game
- **AdventureWorks** - Microsoft sample database
- **Northwind** - Classic sample database

## Quick Reference Cheat Sheet

### Query Order of Execution
```
FROM → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT
```

### Common Keyboard Shortcuts (most SQL clients)
- **Ctrl/Cmd + Enter** - Execute query
- **Ctrl/Cmd + /** - Comment/uncomment
- **Ctrl/Cmd + Shift + F** - Format SQL
- **F5** - Refresh
- **Ctrl/Cmd + Space** - Auto-complete

### Performance Tips
1. Index columns used in WHERE, JOIN, ORDER BY
2. Avoid SELECT * in production
3. Use EXPLAIN to analyze queries
4. Limit result sets
5. Avoid correlated subqueries when possible
6. Use appropriate data types
7. Regularly update statistics
8. Monitor slow query logs

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
```

