import * as sql from 'mssql';
import { BaseDatabaseAdapter } from './base-database.adapter';
import { DatabaseConfig } from '../data.adapter';

/**
 * SQL Server database adapter
 * Uses mssql library to connect to SQL Server databases
 */
export class SQLServerAdapter extends BaseDatabaseAdapter {
  private pool?: sql.ConnectionPool;
  private connectionConfig: sql.config;

  constructor(config: DatabaseConfig, tables?: string | string[]) {
    super(config, tables);

    // Build SQL Server connection config
    this.connectionConfig = {
      server: config.connection.host || 'localhost',
      port: config.connection.port || 1433,
      database: config.connection.database || '',
      user: config.connection.username || '',
      password: config.connection.password || '',
      options: {
        encrypt: true, // Use encryption
        trustServerCertificate: true, // For local dev/self-signed certs
        enableArithAbort: true,
        connectionTimeout: config.connection.connectionTimeout || 30000,
      },
      pool: {
        min: config.connection.poolMin || 0,
        max: config.connection.poolMax || 10,
      },
    };
  }

  /**
   * Connect to SQL Server
   */
  protected async connect(): Promise<void> {
    if (this.pool && this.pool.connected) {
      return; // Already connected
    }

    try {
      this.pool = await new sql.ConnectionPool(this.connectionConfig).connect();
      console.log('Connected to SQL Server database:', this.connectionConfig.database);
    } catch (error: any) {
      console.error('SQL Server connection error:', error);
      throw new Error(`Failed to connect to SQL Server: ${error.message}`);
    }
  }

  /**
   * Disconnect from SQL Server
   */
  protected async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = undefined;
      console.log('Disconnected from SQL Server');
    }
  }

  /**
   * Execute a SQL query
   */
  protected async executeQuery(sqlQuery: string): Promise<any[]> {
    await this.connect();

    try {
      const result = await this.pool!.request().query(sqlQuery);
      return result.recordset || [];
    } catch (error: any) {
      console.error('SQL query error:', error);
      throw new Error(`SQL query failed: ${error.message}`);
    }
  }

  /**
   * Get data from SQL Server tables
   * Requires tables to be specified
   */
  async getData(): Promise<any> {
    try {
      // For getData(), we require tables to be specified
      if (!this.tables || this.tables.length === 0) {
        if (!this.config.tables || this.config.tables.length === 0) {
          throw new Error('No tables specified. Please select at least one table.');
        }
      }

      const tablesToQuery = await this.getTablesToQuery();

      // If only one table, return data without source field
      if (tablesToQuery.length === 1) {
        const data = await this.getTableData(tablesToQuery[0]);
        await this.disconnect();
        return data;
      }

      // Multiple tables: load all and combine with _dataset_source field
      const allData: any[] = [];

      for (const tableName of tablesToQuery) {
        const data = await this.getTableData(tableName);

        // Add _dataset_source field to each record
        const taggedData = data.map(record => ({
          ...record,
          _dataset_source: tableName,
        }));

        allData.push(...taggedData);
      }

      await this.disconnect();
      return allData;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  /**
   * Get data from a single table
   */
  private async getTableData(tableName: string): Promise<any[]> {
    // Sanitize table name to prevent SQL injection
    const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_.\[\]]/g, '');

    const query = `SELECT * FROM ${sanitizedTableName}`;
    return await this.executeQuery(query);
  }

  /**
   * Get list of all tables in the database
   */
  async getTables(): Promise<string[]> {
    await this.connect();

    try {
      const query = `
        SELECT TABLE_SCHEMA + '.' + TABLE_NAME as TableName
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `;

      const result = await this.executeQuery(query);
      const tables = result.map(row => row.TableName);

      await this.disconnect();
      return tables;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  /**
   * Get schema information for a table
   */
  async getTableSchema(tableName: string): Promise<{
    name: string;
    type: string;
    nullable: boolean;
  }[]> {
    await this.connect();

    try {
      // Split schema.table if provided
      const parts = tableName.split('.');
      const schema = parts.length > 1 ? parts[0] : 'dbo';
      const table = parts.length > 1 ? parts[1] : parts[0];

      const query = `
        SELECT
          COLUMN_NAME as name,
          DATA_TYPE as type,
          CASE WHEN IS_NULLABLE = 'YES' THEN 1 ELSE 0 END as nullable
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'
          AND TABLE_NAME = '${table.replace(/'/g, "''")}'
        ORDER BY ORDINAL_POSITION
      `;

      const result = await this.executeQuery(query);
      const schema_info = result.map(row => ({
        name: row.name,
        type: row.type,
        nullable: row.nullable === 1,
      }));

      await this.disconnect();
      return schema_info;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  /**
   * Get extended schema information including keys and relationships
   */
  async getExtendedTableSchema(tableName: string): Promise<{
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      isPrimaryKey: boolean;
    }>;
    primaryKeys: string[];
    foreignKeys: Array<{
      column: string;
      referencedTable: string;
      referencedColumn: string;
    }>;
  }> {
    await this.connect();

    try {
      // Split schema.table if provided
      const parts = tableName.split('.');
      const schema = parts.length > 1 ? parts[0] : 'dbo';
      const table = parts.length > 1 ? parts[1] : parts[0];

      // Get columns with primary key info
      const columnQuery = `
        SELECT
          c.COLUMN_NAME as name,
          c.DATA_TYPE as type,
          CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END as nullable,
          CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as isPrimaryKey
        FROM INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
          SELECT ku.COLUMN_NAME
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
            ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
            AND tc.TABLE_NAME = ku.TABLE_NAME
          WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            AND tc.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'
            AND tc.TABLE_NAME = '${table.replace(/'/g, "''")}'
        ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
        WHERE c.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'
          AND c.TABLE_NAME = '${table.replace(/'/g, "''")}'
        ORDER BY c.ORDINAL_POSITION
      `;

      // Get foreign keys
      const fkQuery = `
        SELECT
          kcu.COLUMN_NAME as column_name,
          ccu.TABLE_SCHEMA + '.' + ccu.TABLE_NAME as referenced_table,
          ccu.COLUMN_NAME as referenced_column
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
          ON rc.UNIQUE_CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
          AND rc.UNIQUE_CONSTRAINT_SCHEMA = ccu.CONSTRAINT_SCHEMA
        WHERE kcu.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'
          AND kcu.TABLE_NAME = '${table.replace(/'/g, "''")}'
      `;

      const [columns, foreignKeys] = await Promise.all([
        this.executeQuery(columnQuery),
        this.executeQuery(fkQuery)
      ]);

      const result = {
        columns: columns.map(row => ({
          name: row.name,
          type: row.type,
          nullable: row.nullable === 1,
          isPrimaryKey: row.isPrimaryKey === 1,
        })),
        primaryKeys: columns.filter(row => row.isPrimaryKey === 1).map(row => row.name),
        foreignKeys: foreignKeys.map(row => ({
          column: row.column_name,
          referencedTable: row.referenced_table,
          referencedColumn: row.referenced_column,
        }))
      };

      await this.disconnect();
      return result;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }
}
