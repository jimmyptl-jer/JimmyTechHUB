
* `PK` = primary key
* `-->` = foreign key (child → parent)
* `<>` = many-to-many or associative
* `[...]` = group of related tables collapsed under a box
* Arrows point from FK (child) → referenced table (parent)

```
                                          +----------------+
                                          |  price_lists   |
                                          |  (id PK)       |
                                          +----------------+
                                                 ^
                                                 |
                                          +------+-------+
                                          | price_list_items
                                          | (price_list_id) --> +----------------+
                                          +----------------+      |  products     |
                                                  ^               | (id PK, sku)  |
                                                  |               +----------------+
                                                  |                       ^
                                                  |                       |
                                 +----------------+-------+       +-------+---------------+
                                 |      product_variants   |       | product_images        |
                                 | (product_id) ---------->+       | (product_id) -------->+
                                 +-------------------------+       +-----------------------+
                                                  ^
                                                  |
                                                  |
+-------------+     +----------------+     +------+-------+      +----------------+
| customers   |<----| customer_      |     | sales_orders |      | sales_invoices |
| (id PK)     |     | addresses      |     | (id PK)      |      | (id PK)        |
+-------------+     +----------------+     +------+-------+      +--------+-------+
    ^  ^  ^             ^    ^   ^               ^   ^                 ^   ^
    |  |  |             |    |   |               |   |                 |   |
    |  |  |  +----------+    |   +---------------+   +--------------+  |   |
    |  |  |  |               |                       | sales_order_items |   |
    |  |  |  |               |                       | (sales_order_id)  |   |
    |  |  |  |               |                       +-------------------+   |
    |  |  |  |               |                                               |
    |  |  |  |               |                                               |
    |  |  |  |               +--> customer_contacts                           |
    |  |  |  |                                                               |
    |  |  |  +--> customer_bank_accounts                                     |
    |  |  |                                                               +--+----------------+
    |  |  +---------------------------------------------------------------->| delivery_notes     |
    |  |                                                                       +------------------+
    |  |
    |  +---------------------------------------------------------------------> support_tickets
    |
    +--> customer_payments  (customer_id) --> sales_invoices  (for allocations)
          (allocations -> sales_invoices)


                                                +--------------------+
                                                |   suppliers        |
                                                |   (id PK)          |
                                                +--------------------+
                                                   ^    ^     ^
                                                   |    |     |
                                +------------------+    |     +--------------+
                                |                       |                    |
                        +-------+------+       +--------+--------+  +--------+---------+
                        | supplier_addresses |   | product_suppliers |  | purchase_orders |
                        | (supplier_id) ---->+   | (supplier_id) ---->+  | (supplier_id)  |
                        +--------------------+   +-------------------+  +----------------+
                                                                ^               |
                                                                |               |
                                                        +-------+------+        |
                                                        | purchase_order_items |<+
                                                        | (purchase_order_id)  |
                                                        +----------------------+
                                                                ^
                                                                |
                                                      +---------+----------+
                                                      | goods_receipt_items |
                                                      | (goods_receipt_id)  |
                                                      +---------------------+

   +----------------+        +----------------+         +------------------+
   | warehouses     |        | warehouse_     |         | stock_levels     |
   | (id PK)        |<-------| locations      |         | (product_id,     |
   +----------------+        +----------------+         |  warehouse_id)   |
         ^  ^                       ^                    +------------------+
         |  |                       |                             ^
         |  +-- goods_receipts -----+                             |
         |            (warehouse_id)                              |
         +-- stock_movements (warehouse_id) ----------------------+ 
                (and stock_transfers.items reference warehouses)

   +----------------+     +----------------+      +----------------+
   | products       |<----| product_brands |      | bill_of_materials
   | (id PK)        |     +----------------+      | (product_id)    |
   +----------------+                            +----------------+
         ^   ^   ^                                   ^
         |   |   |                                   |
         |   |   +-----------------------------------+--> bom_items (component_product_id -> products)
         |   |
         |   +--> price_list_items (product_id)
         |
         +--> purchase_order_items, sales_order_items, stock_movements, stock_levels, product_variants,...

   +----------------+
   | employees      |
   | (id PK)        |
   +----------------+
       ^   ^   ^
       |   |   +-- work_order_operations.operator_id --> employees
       |   +-- departments.manager_id --> employees
       +-- users.employee_id --> users

   +----------------+       +----------------+        +----------------+
   | users          |       | roles          |        | role_permissions
   | (id PK)        |       | (id PK)        |        | (role_id, perm) |
   +----------------+       +----------------+        +----------------+
        ^   ^                      ^
        |   +-- created_by for many tables (orders, invoices, adjustments, journal_entries,...)
        |
        +--> created_by, approved_by, requested_by in purchase/sales flows

   +----------------+
   | chart_of_accounts
   | (id PK)
   +----------------+
          ^
          |
   +------+-------+
   | journal_entry_items (account_id) --> chart_of_accounts
   |
   +--> journal_entries (reference_type -> e.g., SALES_INVOICE, PURCHASE_INVOICE, PAYMENT, etc.)

   +------------------------+
   | document_attachments   |
   | (reference_type,       |
   |  reference_id,         |
   |  uploaded_by)          |
   +------------------------+
           ^   ^      ^
           |   |      |
           |   |      +-----> users (uploaded_by)
           |   +-------------> any referenced table (sales_invoice, purchase_order, product, customer, supplier, etc.)
           +-----------------> generic parent by (reference_type, reference_id)


-------------------------
EXAMPLE KEY CHAINS (sample FK flows)
-------------------------
Sales Flow:
customers -> sales_orders -> sales_order_items -> delivery_notes -> sales_invoices -> customer_payments -> payment_allocations -> bank_accounts/journal_entries

Purchase Flow:
suppliers -> purchase_orders -> purchase_order_items -> goods_receipts -> goods_receipt_items -> purchase_invoices -> supplier_payments -> supplier_payment_allocations -> journal_entries

Inventory Flow:
purchase_order_items/goods_receipt_items -> stock_movements -> stock_levels -> stock_transfers -> stock_transfer_items

Manufacturing Flow (if used):
bill_of_materials -> bom_items -> work_orders -> work_order_operations -> stock_consumption/stock_movements

Security & Audit:
users -> roles -> role_permissions
audit_logs capture changes across tables

```

