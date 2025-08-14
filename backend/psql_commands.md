Common PostgreSQL commands `psql`:

- **List all databases**:
  ```sql
  \l
  ```
  Displays all available databases.

- **Connect to a database**:
  ```sql
  \c database_name
  ```
  Switches to the specified database.

- **List all tables** in the current database:
  ```sql
  \dt

  # show system tables
  \dtS+
  ```
  Shows all tables in the current schema.

- **List all schemas**:
  ```sql
  \dn
  ```
  Displays all schemas in the current database.

- **Describe a table** (show structure):
  ```sql
  \d table_name
  ```
  Shows the table’s columns, data types, and constraints.

- **View table content**:
  ```sql
  SELECT * FROM table_name;
  ```
  Retrieves all rows and columns from the specified table.

- **View specific columns**:
  ```sql
  SELECT column1, column2 FROM table_name;
  ```
  Fetches only the specified columns.

- **Limit rows**:
  ```sql
  SELECT * FROM table_name LIMIT 10;
  ```
  Returns up to 10 rows from the table.

- **List all relations** (tables, views, etc.):
  ```sql
  \d
  ```
  Shows all relations in the current schema.

- **Exit psql**:
  ```sql
  \q
  ```
  Quits the `psql` terminal.

These commands cover basic navigation and data inspection in a `psql` session. For more details, use `\?` in `psql` to list all available commands.
