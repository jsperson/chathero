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

export async function GET() {
  try {
    const config = await loadConfig();
    const allDatasets: any[] = [];

    // Add database if configured
    if (config.dataSource.type === 'database' && config.dataSource.database) {
      const dbConfig = config.dataSource.database;
      const databaseName = dbConfig.connection.database || 'Database';

      allDatasets.push({
        name: databaseName,
        type: 'database',
        displayName: databaseName,
        recordCount: 0,
        description: `${dbConfig.type.toUpperCase()} database at ${dbConfig.connection.host}`,
        hasProjectConfig: false,
        hasReadme: false,
      });
    }

    // Add file-based datasets if datasetsPath is configured
    if (config.dataSource.datasetsPath) {
      const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);

      // Scan for dataset directories
      const datasetEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
      const datasets = datasetEntries.filter(entry => entry.isDirectory());

      for (const dataset of datasets) {
        const datasetName = dataset.name;
        const datasetPath = path.join(datasetsPath, datasetName);

        const metadataPath = path.join(datasetPath, 'metadata.yaml');
        const readmePath = path.join(datasetPath, 'README.md');

        let sourceType = 'file';
        let domain = 'unknown';
        let recordCount = 0;
        let description = '';
        let hasMetadata = false;
        let hasReadme = false;
        let displayName = datasetName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        // Read metadata.yaml
        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf-8');
          const metadataConfig = yaml.load(metadataContent) as any;
          hasMetadata = true;

          // Skip deleted datasets
          if (metadataConfig?.deleted) {
            continue;
          }

          if (metadataConfig?.project?.name) {
            displayName = metadataConfig.project.name;
          }

          if (metadataConfig?.project?.description) {
            description = metadataConfig.project.description;
          }

          if (metadataConfig?.project?.domain) {
            domain = metadataConfig.project.domain;
          }

          // Check source type from metadata
          if (metadataConfig?.type) {
            sourceType = metadataConfig.type;
          }
        } catch (e) {
          // No metadata.yaml, skip this dataset
          continue;
        }

        // Read README if available
        try {
          await fs.access(readmePath);
          hasReadme = true;
        } catch (e) {
          // No README
        }

        // Count records for file-based datasets only
        if (sourceType === 'file') {
          try {
            const tables = await getDatasetTables(datasetPath);
            for (const tableName of tables) {
              const tableRecordCount = await countTableRecords(datasetPath, tableName);
              recordCount += tableRecordCount;
            }
          } catch (e) {
            // Couldn't count records
          }
        }

        allDatasets.push({
          name: datasetName,
          type: sourceType,
          displayName: displayName,
          recordCount,
          description: sourceType === 'database'
            ? `${domain} database`
            : description,
          hasProjectConfig: hasMetadata,
          hasReadme: hasReadme,
        });
      }
    }

    // Return all datasets (database + file-based)
    return NextResponse.json({
      datasets: allDatasets,
    });
  } catch (error) {
    console.error('Datasets API error:', error);
    return NextResponse.json(
      { error: 'Failed to list datasets' },
      { status: 500 }
    );
  }
}
