import { promises as fs } from 'fs';
import path from 'path';
import { DataAdapter, DataSourceConfig } from './data.adapter';

export class JSONAdapter implements DataAdapter {
  private config: DataSourceConfig;
  private datasets?: string[];

  constructor(config: DataSourceConfig, datasets?: string | string[]) {
    this.config = config;
    // Normalize to array
    if (typeof datasets === 'string') {
      this.datasets = [datasets];
    } else {
      this.datasets = datasets;
    }
  }

  async getData(): Promise<any> {
    try {
      // Determine which datasets to load
      const datasetsToLoad = this.datasets && this.datasets.length > 0
        ? this.datasets
        : [];

      if (datasetsToLoad.length === 0) {
        throw new Error('No datasets specified. Please select at least one dataset.');
      }

      // If only one dataset, return data without source field (backward compatibility)
      if (datasetsToLoad.length === 1) {
        const data = await this.loadSingleDataset(datasetsToLoad[0] || '');
        return data;
      }

      // Multiple datasets: load all and combine with _dataset_source field
      const allData: any[] = [];

      for (const datasetName of datasetsToLoad as string[]) {
        const data = await this.loadSingleDataset(datasetName);

        // Add _dataset_source field to each record
        const taggedData = Array.isArray(data)
          ? data.map(record => ({ ...record, _dataset_source: datasetName }))
          : [];

        allData.push(...taggedData);
      }

      return allData;
    } catch (error) {
      console.error('Error reading JSON file:', error);
      throw new Error('Failed to load data');
    }
  }

  private async loadSingleDataset(datasetName: string): Promise<any> {
    let filePath: string = '';

    // New multi-dataset structure with type folders
    if ('datasetsPath' in this.config && this.config.datasetsPath) {
      // Try to find dataset in type folders (json, url, etc.)
      const datasetsPath = path.join(process.cwd(), this.config.datasetsPath);
      const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
      const typeFolders = typeEntries.filter(entry => entry.isDirectory());

      let found = false;
      for (const typeFolder of typeFolders) {
        const potentialPath = path.join(datasetsPath, typeFolder.name, datasetName, 'data.json');
        try {
          await fs.access(potentialPath);
          filePath = potentialPath;
          found = true;
          break;
        } catch (e) {
          // Try next type folder
        }
      }

      if (!found) {
        throw new Error(`Dataset '${datasetName}' not found in any type folder`);
      }
    }
    // Legacy single file structure (backward compatibility)
    else if ('path' in this.config && this.config.path) {
      filePath = path.join(process.cwd(), this.config.path);
    }
    else {
      throw new Error('No data path configured');
    }

    const fileContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  }
}
