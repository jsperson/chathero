import { DataAdapter, DatabaseConfig } from '../data.adapter';

/**
 * Base class for database adapters
 * Provides common functionality for all database types
 */
export abstract class BaseDatabaseAdapter implements DataAdapter {
  protected config: DatabaseConfig;
  protected tables?: string[];

  constructor(config: DatabaseConfig, tables?: string | string[]) {
    this.config = config;
    // Normalize to array
    if (typeof tables === 'string') {
      this.tables = [tables];
    } else {
      this.tables = tables;
    }
  }

  /**
   * Get data from the database
   * Implementation varies by database type
   */
  abstract getData(): Promise<any>;

  /**
   * Connect to the database
   * Implementation varies by database type
   */
  protected abstract connect(): Promise<void>;

  /**
   * Disconnect from the database
   * Implementation varies by database type
   */
  protected abstract disconnect(): Promise<void>;

  /**
   * Execute a SQL query
   * Implementation varies by database type
   */
  protected abstract executeQuery(sql: string): Promise<any[]>;

  /**
   * Get list of all tables in the database
   * Implementation varies by database type
   */
  abstract getTables(): Promise<string[]>;

  /**
   * Get schema information for a table
   * Returns column names and types
   * Implementation varies by database type
   */
  abstract getTableSchema(tableName: string): Promise<{
    name: string;
    type: string;
    nullable: boolean;
  }[]>;

  /**
   * Helper to determine which tables to query
   */
  protected async getTablesToQuery(): Promise<string[]> {
    // If specific tables requested, use those
    if (this.tables && this.tables.length > 0) {
      return this.tables;
    }

    // If tables configured in database config, use those
    if (this.config.tables && this.config.tables.length > 0) {
      return this.config.tables;
    }

    // Otherwise, error - user must select tables
    throw new Error('No tables specified. Please select at least one table.');
  }
}
