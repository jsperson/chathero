import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadConfig } from '@/lib/config';

async function getDatasetTables(datasetPath: string): Promise<string[]> {
  const entries = await fs.readdir(datasetPath, { withFileTypes: true });
  const tables: string[] = [];

  for (const entry of entries) {
    // Skip non-directories and config files
    if (!entry.isDirectory()) continue;
    if (['config', '.git'].includes(entry.name)) continue;

    tables.push(entry.name);
  }

  return tables;
}

async function countTableRecords(datasetPath: string, tableName: string): Promise<number> {
  const tablePath = path.join(datasetPath, tableName);
  const entries = await fs.readdir(tablePath);
  let recordCount = 0;

  for (const entry of entries) {
    // Skip directories and config
    if (!entry.endsWith('.json') && !entry.endsWith('.csv')) continue;

    const filePath = path.join(tablePath, entry);

    if (entry.endsWith('.json')) {
      try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        recordCount += Array.isArray(data) ? data.length : 0;
      } catch (e) {
        // Couldn't read JSON file
      }
    } else if (entry.endsWith('.csv')) {
      try {
        const csvContent = await fs.readFile(filePath, 'utf-8');
        const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
        recordCount += Math.max(0, lines.length - 1); // Subtract header row
      } catch (e) {
        // Couldn't read CSV file
      }
    }
  }

  return recordCount;
}

export async function GET(
  request: Request,
  { params }: { params: { dataset: string } }
) {
  try {
    const config = await loadConfig();
    const datasetName = params.dataset;

    // Check if this is a database source
    if (config.dataSource.type === 'database' && config.dataSource.database) {
      const dbConfig = config.dataSource.database;
      const databaseName = dbConfig.connection.database || 'Database';

      if (datasetName === databaseName) {
        // This is a database dataset - get tables from database
        const { SQLServerAdapter } = await import('@/lib/adapters/database/sqlserver.adapter');

        let tables: string[] = [];
        if (dbConfig.type === 'sqlserver') {
          const adapter = new SQLServerAdapter(dbConfig, []);
          tables = await adapter.getTables();
        }

        const configuredTables = dbConfig.tables || [];

        return NextResponse.json({
          name: datasetName,
          displayName: databaseName,
          description: `${dbConfig.type.toUpperCase()} database at ${dbConfig.connection.host}`,
          type: 'database',
          tables: tables.map(tableName => ({
            name: tableName,
            recordCount: 0, // Database tables don't have record counts in this view
            hasSchema: false, // Database tables don't have file-based schemas
          })),
          selectedTables: configuredTables,
        });
      }
    }

    // File-based dataset
    if (!config.dataSource.datasetsPath) {
      return NextResponse.json(
        { error: 'Datasets path not configured' },
        { status: 400 }
      );
    }

    const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);
    const datasetPath = path.join(datasetsPath, datasetName);

    // Check if dataset exists
    try {
      await fs.access(datasetPath);
    } catch (e) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    // Read metadata
    const metadataPath = path.join(datasetPath, 'metadata.yaml');
    let displayName = datasetName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    let description = '';
    let type = 'file';
    let selectedTables: string[] | undefined;

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadataConfig = yaml.load(metadataContent) as any;

      if (metadataConfig?.project?.name) {
        displayName = metadataConfig.project.name;
      }

      if (metadataConfig?.project?.description) {
        description = metadataConfig.project.description;
      }

      if (metadataConfig?.project?.domain) {
        type = metadataConfig.project.domain;
      }

      if (metadataConfig?.selectedTables) {
        selectedTables = metadataConfig.selectedTables;
      }
    } catch (e) {
      // No metadata, use defaults
    }

    // Get tables and their record counts
    const tableNames = await getDatasetTables(datasetPath);
    const tables = await Promise.all(
      tableNames.map(async (tableName) => {
        const schemaPath = path.join(datasetPath, tableName, 'config', 'schema.yaml');
        let hasSchema = false;

        try {
          await fs.access(schemaPath);
          hasSchema = true;
        } catch (e) {
          // No schema file
        }

        return {
          name: tableName,
          recordCount: await countTableRecords(datasetPath, tableName),
          hasSchema,
        };
      })
    );

    return NextResponse.json({
      name: datasetName,
      displayName,
      description,
      type,
      tables,
      selectedTables,
    });
  } catch (error) {
    console.error('Dataset API error:', error);
    return NextResponse.json(
      { error: 'Failed to load dataset' },
      { status: 500 }
    );
  }
}
