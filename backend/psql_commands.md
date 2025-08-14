Common PostgreSQL commands `psql`:


- **psql Help**:
  ```sql
  \?
  ```

- **List all databases**:
  ```sql
  \l
  ```

- **Connect (or switch) to a database**:
  ```sql
  \c database_name
  ```

- **List all relations** (tables, views, etc.):
  ```sql
  \d
  ```

- **List all tables** in the current database:
  ```sql
  \dt

  # show system tables
  \dtS+
  ```

- **List all schemas** (containers) in the current database:
- [pg docs on Schemas](https://www.postgresql.org/docs/9.1/ddl-schemas.html)
  ```sql
  \dn
  ```

- **Describe a table** (show structure: columns, data types, and constraints):
  ```sql
  \d table_name
  ```

- **View table content**:
  ```sql
  SELECT * FROM table_name;
  ```

- **View specific columns**:
  ```sql
  SELECT column1, column2 FROM table_name;
  ```

- **Limit rows**:
  ```sql
  SELECT * FROM table_name LIMIT 10;
  ```

- **Exit psql**:
  ```sql
  \q
  ```
