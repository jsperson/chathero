# Database Setup Guide

ChatHero can connect to relational databases and use database tables as data sources for AI-powered chat queries.

## Supported Databases

- ✅ **SQL Server** - Fully supported
- ⏳ **PostgreSQL** - Coming soon
- ⏳ **MySQL** - Coming soon
- ⏳ **SQLite** - Coming soon

## Configuration

### Using the Admin UI (Recommended)

The easiest way to configure database connections is through the admin interface:

1. Navigate to **Admin > Database Settings**
2. Select "Database" as the data source type
3. Choose your database type (e.g., SQL Server)
4. Enter connection details and credentials
5. Click "Test Connection" to verify
6. Click "Save Configuration"

Your credentials will be automatically saved to `.env.local` (which is excluded from git), and connection settings will be saved to `config/app.yaml`.

### Manual Configuration (Alternative)

You can also manually configure the database connection:

#### 1. Set Environment Variables

Add your database credentials to `.env.local`:

```bash
DB_USERNAME=your_username
DB_PASSWORD=your_password
```

#### 2. Configure Database Connection

You have two options for configuring the database connection:

#### Option A: Use app.yaml

Edit `config/app.yaml` and replace the `dataSource` section:

```yaml
dataSource:
  type: "database"
  database:
    type: "sqlserver"
    connection:
      host: "your-server.database.windows.net"
      port: 1433
      database: "YourDatabaseName"
      username: "${DB_USERNAME}"
      password: "${DB_PASSWORD}"
      # Optional pool settings
      poolMin: 0
      poolMax: 10
      connectionTimeout: 30000
    # Optional: Limit which tables are available
    tables:
      - "dbo.Users"
      - "dbo.Orders"
```

#### Option B: Use a separate connection.yaml

Copy the example configuration:

```bash
cp config/connection.yaml.example config/connection.yaml
```

Edit `config/connection.yaml` with your database details.

## SQL Server Configuration

### Azure SQL Database

```yaml
dataSource:
  type: "database"
  database:
    type: "sqlserver"
    connection:
      host: "myserver.database.windows.net"
      port: 1433
      database: "MyDatabase"
      username: "${DB_USERNAME}"
      password: "${DB_PASSWORD}"
```

### On-Premises SQL Server

```yaml
dataSource:
  type: "database"
  database:
    type: "sqlserver"
    connection:
      host: "localhost"
      port: 1433
      database: "MyDatabase"
      username: "${DB_USERNAME}"
      password: "${DB_PASSWORD}"
```

### Windows Authentication (Not Supported Yet)

Currently, only SQL Server authentication is supported. Windows authentication support is planned for a future release.

## Connection Options

### Connection Pooling

Configure connection pool settings for better performance:

```yaml
connection:
  poolMin: 0          # Minimum connections in pool
  poolMax: 10         # Maximum connections in pool
  connectionTimeout: 30000  # Timeout in milliseconds
```

### Encryption

By default, connections use encryption. For local development with self-signed certificates:

- `encrypt: true` - Enabled by default
- `trustServerCertificate: true` - Enabled by default for development

For production, ensure you have valid SSL certificates installed on your SQL Server.

## Table Selection

When you start ChatHero with a database connection:

1. Navigate to **Admin > Dataset Selection**
2. You'll see a list of all tables in your database
3. Select the table(s) you want to query
4. Start chatting!

Tables work just like file-based datasets - you can:
- Select a single table
- Select multiple tables for cross-table queries
- Switch between tables dynamically

## Schema Discovery

ChatHero automatically discovers the schema of your database tables:

- Column names and types
- Nullable fields
- Primary keys (coming soon)
- Foreign key relationships (coming soon)

## Limitations

- **Read-only**: ChatHero only executes SELECT queries. No INSERT, UPDATE, or DELETE operations.
- **No stored procedures**: Direct table queries only.
- **No views**: Only base tables are currently supported (views support coming soon).
- **Schema required**: All tables must have a defined schema in INFORMATION_SCHEMA.

## Security

### Best Practices

1. **Read-only user**: Create a dedicated read-only database user for ChatHero
2. **Environment variables**: Never commit credentials to version control
3. **Network security**: Use firewall rules to restrict database access
4. **Encryption**: Always use encrypted connections in production

### Creating a Read-Only User (SQL Server)

```sql
-- Create login
CREATE LOGIN chathero_readonly WITH PASSWORD = 'your_secure_password';

-- Create user in your database
USE YourDatabase;
CREATE USER chathero_readonly FOR LOGIN chathero_readonly;

-- Grant read-only access
ALTER ROLE db_datareader ADD MEMBER chathero_readonly;

-- Optional: Restrict to specific tables
GRANT SELECT ON dbo.Users TO chathero_readonly;
GRANT SELECT ON dbo.Orders TO chathero_readonly;
```

## Troubleshooting

### Connection Timeout

If you see connection timeout errors:

1. Check your firewall rules
2. Verify the server hostname and port
3. Increase `connectionTimeout` in configuration
4. For Azure SQL, add your IP to the firewall allowlist

### Authentication Failed

1. Verify username and password in `.env.local`
2. Check that the user has access to the specified database
3. For Azure SQL, ensure you're using the full username (e.g., `user@servername`)

### No Tables Visible

1. Verify the user has SELECT permissions on tables
2. Check that you're connecting to the correct database
3. Only base tables are shown (not views or system tables)

### SSL/TLS Errors

For development with self-signed certificates, the default settings should work. For production:

1. Ensure your SQL Server has a valid SSL certificate
2. Set `trustServerCertificate: false` for production
3. Verify the certificate is trusted by your operating system

## Testing the Connection

To test your database connection:

1. Start the development server: `npm run dev`
2. Navigate to **Admin > Test**
3. Look for database-related tests in the test results
4. Check the console for connection logs

You can also test manually:

```bash
# Set environment variables
export DB_USERNAME=your_username
export DB_PASSWORD=your_password

# Start the server
npm run dev

# Navigate to http://localhost:3000/api/datasets
# You should see a list of database tables
```

## Next Steps

- See [README.md](../README.md) for general ChatHero documentation
- Check out [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines
- Report issues at [GitHub Issues](https://github.com/your-repo/issues)
