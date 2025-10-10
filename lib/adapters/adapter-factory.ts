import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { DataAdapter, DataSourceConfig } from './data.adapter';
import { JSONAdapter } from './json.adapter';
import { CSVAdapter } from './csv.adapter';
import { SQLServerAdapter } from './database/sqlserver.adapter';

/**
 * Determines the type of a dataset by checking for connection.yaml or metadata
 */
async function getDatasetType(config: DataSourceConfig, datasetName: string): Promise<string> {
  if (!('datasetsPath' in config) || !config.datasetsPath) {
    // Legacy config - assume JSON
    return 'json';
  }

  const datasetsPath = path.join(process.cwd(), config.datasetsPath);
  const datasetPath = path.join(datasetsPath, datasetName);

  // Check if dataset exists
  try {
    await fs.access(datasetPath);
  } catch (e) {
    // Dataset doesn't exist, default to json
    return 'json';
  }

  // Check for connection.yaml (indicates database dataset)
  const connectionPath = path.join(datasetPath, 'connection.yaml');
  try {
    await fs.access(connectionPath);
    return 'database';
  } catch (e) {
    // Not a database dataset
  }

  // Check metadata.yaml for type field
  const metadataPath = path.join(datasetPath, 'metadata.yaml');
  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = yaml.load(metadataContent) as any;
    if (metadata?.type === 'database') {
      return 'database';
    }
  } catch (e) {
    // No metadata or couldn't read it
  }

  // Default to json for file-based datasets
  return 'json';
}

/**
 * Multi-dataset adapter that loads each dataset with the correct adapter type
 */
class MultiDatasetAdapter implements DataAdapter {
  private config: DataSourceConfig;
  private datasets: string[];

  constructor(config: DataSourceConfig, datasets: string[]) {
    this.config = config;
    this.datasets = datasets;
  }

  async getData(): Promise<any> {
    const allData: any[] = [];

    // Load each dataset with its own adapter
    for (const datasetName of this.datasets) {
      const type = await getDatasetType(this.config, datasetName);
      const adapter = await createAdapterForType(type, this.config, datasetName);

      console.log(`Loading dataset '${datasetName}' with ${type} adapter`);
      const data = await adapter.getData();

      // Add _dataset_source field to each record (for multi-dataset queries)
      const taggedData = Array.isArray(data)
        ? data.map(record => ({ ...record, _dataset_source: datasetName }))
        : [];

      console.log(`  Loaded ${taggedData.length} records from '${datasetName}'`);
      allData.push(...taggedData);
    }

    console.log(`Total records loaded: ${allData.length}`);
    return allData;
  }
}

/**
 * Creates the appropriate data adapter based on dataset types
 */
export async function createDataAdapter(
  config: DataSourceConfig,
  datasets?: string | string[]
): Promise<DataAdapter> {
  // Check if we're requesting the database specifically
  if (config.type === 'database' && config.database) {
    const databaseName = config.database.connection.database;
    const datasetsArray = typeof datasets === 'string' ? [datasets] : datasets;

    // Only use database adapter if requesting the database itself
    const isRequestingDatabase = datasetsArray &&
      datasetsArray.length === 1 &&
      datasetsArray[0] === databaseName;

    if (isRequestingDatabase) {
      // User selected the database itself, use configured tables
      const tables = config.database.tables;

      switch (config.database.type) {
        case 'sqlserver':
          return new SQLServerAdapter(config.database, tables);
        case 'postgresql':
          throw new Error('PostgreSQL adapter not yet implemented');
        case 'mysql':
          throw new Error('MySQL adapter not yet implemented');
        case 'sqlite':
          throw new Error('SQLite adapter not yet implemented');
        default:
          throw new Error(`Unknown database type: ${config.database.type}`);
      }
    }

    // Otherwise, fall through to file-based handling
  }

  // Handle file-based and database datasets
  // Normalize to array
  const datasetArray = typeof datasets === 'string' ? [datasets] : datasets;

  if (!datasetArray || datasetArray.length === 0) {
    throw new Error('No datasets specified. Please select at least one dataset.');
  }

  // Single dataset - use appropriate adapter directly
  if (datasetArray.length === 1) {
    const type = await getDatasetType(config, datasetArray[0]);
    return await createAdapterForType(type, config, datasetArray[0]);
  }

  // Multiple datasets - use MultiDatasetAdapter which handles each dataset individually
  return new MultiDatasetAdapter(config, datasetArray);
}

async function createAdapterForType(
  type: string,
  config: DataSourceConfig,
  datasetName: string
): Promise<DataAdapter> {
  switch (type.toLowerCase()) {
    case 'database': {
      // Load database config from data/{dataset}/connection.yaml
      if (!('datasetsPath' in config) || !config.datasetsPath) {
        throw new Error('datasetsPath not configured for database dataset');
      }

      const datasetsPath = path.join(process.cwd(), config.datasetsPath);
      const datasetPath = path.join(datasetsPath, datasetName);
      const connectionPath = path.join(datasetPath, 'connection.yaml');

      const connectionContent = await fs.readFile(connectionPath, 'utf-8');
      const dbConfig = yaml.load(connectionContent) as any;

      // Get configured tables
      const tables = dbConfig.tables || [];

      switch (dbConfig.type) {
        case 'sqlserver':
          return new SQLServerAdapter(dbConfig, tables);
        case 'postgresql':
          throw new Error('PostgreSQL adapter not yet implemented');
        case 'mysql':
          throw new Error('MySQL adapter not yet implemented');
        case 'sqlite':
          throw new Error('SQLite adapter not yet implemented');
        default:
          throw new Error(`Unknown database type: ${dbConfig.type}`);
      }
    }
    case 'csv':
      return new CSVAdapter(config, datasetName);
    case 'json':
    default:
      return new JSONAdapter(config, datasetName);
  }
}
