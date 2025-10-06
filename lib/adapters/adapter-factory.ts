import { promises as fs } from 'fs';
import path from 'path';
import { DataAdapter, DataSourceConfig } from './data.adapter';
import { JSONAdapter } from './json.adapter';
import { CSVAdapter } from './csv.adapter';

/**
 * Determines the type of a dataset by checking which type folder it's in
 */
async function getDatasetType(config: DataSourceConfig, datasetName: string): Promise<string> {
  if (!('datasetsPath' in config) || !config.datasetsPath) {
    // Legacy config - assume JSON
    return 'json';
  }

  const datasetsPath = path.join(process.cwd(), config.datasetsPath);
  const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
  const typeFolders = typeEntries.filter(entry => entry.isDirectory());

  for (const typeFolder of typeFolders) {
    const datasetPath = path.join(datasetsPath, typeFolder.name, datasetName);
    try {
      await fs.access(datasetPath);
      return typeFolder.name;
    } catch (e) {
      // Try next type folder
    }
  }

  // Default to json if not found
  return 'json';
}

/**
 * Creates the appropriate data adapter based on dataset types
 */
export async function createDataAdapter(
  config: DataSourceConfig,
  datasets?: string | string[]
): Promise<DataAdapter> {
  // Normalize to array
  const datasetArray = typeof datasets === 'string' ? [datasets] : datasets;

  if (!datasetArray || datasetArray.length === 0) {
    // Use default dataset
    const defaultDataset = config.defaultDataset;
    const type = await getDatasetType(config, defaultDataset);
    return createAdapterForType(type, config, defaultDataset);
  }

  // Check if all datasets are the same type
  const types = await Promise.all(
    datasetArray.map(ds => getDatasetType(config, ds))
  );

  const uniqueTypes = [...new Set(types)];

  if (uniqueTypes.length === 1) {
    // All same type - use single adapter
    return createAdapterForType(uniqueTypes[0], config, datasetArray);
  }

  // Mixed types - for now, we'll use JSON adapter as default
  // In the future, we could create a CompositeAdapter that handles multiple types
  console.warn('Mixed dataset types detected, using JSON adapter as fallback');
  return new JSONAdapter(config, datasetArray);
}

function createAdapterForType(
  type: string,
  config: DataSourceConfig,
  datasets: string | string[]
): DataAdapter {
  switch (type.toLowerCase()) {
    case 'csv':
      return new CSVAdapter(config, datasets);
    case 'json':
    default:
      return new JSONAdapter(config, datasets);
  }
}
