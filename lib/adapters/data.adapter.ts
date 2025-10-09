// Data Source Adapter Interface
export interface DataAdapter {
  getData(): Promise<any>;
}

export interface DataSourceConfig {
  type: string;
  path?: string;
  datasetsPath?: string;
  database?: DatabaseConfig;
}

export interface DatabaseConfig {
  type: 'sqlserver' | 'postgresql' | 'mysql' | 'sqlite';
  connection: DatabaseConnectionConfig;
  tables?: string[];  // Optional: specific tables to expose as datasets
}

export interface DatabaseConnectionConfig {
  // SQL Server, PostgreSQL, MySQL
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;

  // SQLite
  file?: string;

  // Optional connection pool settings
  poolMin?: number;
  poolMax?: number;
  connectionTimeout?: number;
}
