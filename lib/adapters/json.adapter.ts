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
    if (!('datasetsPath' in this.config) || !this.config.datasetsPath) {
      // Legacy single file structure
      if ('path' in this.config && this.config.path) {
        const filePath = path.join(process.cwd(), this.config.path);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
      }
      throw new Error('No data path configured');
    }

    const datasetsPath = path.join(process.cwd(), this.config.datasetsPath);
    const datasetPath = path.join(datasetsPath, datasetName);

    // Read metadata to check for selected tables
    let selectedTables: string[] | undefined;
    try {
      const yaml = await import('js-yaml');
      const metadataPath = path.join(datasetPath, 'metadata.yaml');
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadataConfig = yaml.load(metadataContent) as any;
      if (metadataConfig?.selectedTables) {
        selectedTables = metadataConfig.selectedTables;
      }
    } catch (e) {
      // No metadata or selectedTables, load all tables
    }

    // Check if dataset exists
    try {
      await fs.access(datasetPath);
    } catch (e) {
      // Try old structure (type folders)
      const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
      const typeFolders = typeEntries.filter(entry => entry.isDirectory());

      for (const typeFolder of typeFolders) {
        const potentialPath = path.join(datasetsPath, typeFolder.name, datasetName, 'data.json');
        try {
          await fs.access(potentialPath);
          const fileContent = await fs.readFile(potentialPath, 'utf-8');
          return JSON.parse(fileContent);
        } catch (e) {
          // Try next type folder
        }
      }

      throw new Error(`Dataset '${datasetName}' not found`);
    }

    // New structure: load all tables from dataset
    const allTables = await this.getDatasetTables(datasetPath);

    // Filter by selected tables if specified
    const tables = selectedTables && selectedTables.length > 0
      ? allTables.filter(t => selectedTables.includes(t))
      : allTables;

    if (tables.length === 0) {
      throw new Error(`No tables found in dataset '${datasetName}'`);
    }

    // Load data from all tables
    const allData: any[] = [];

    for (const tableName of tables) {
      const tableData = await this.loadTableData(datasetPath, tableName);

      // Add table identifier if multiple tables
      if (tables.length > 1) {
        const taggedData = tableData.map(record => ({
          ...record,
          _table_source: tableName
        }));
        allData.push(...taggedData);
      } else {
        allData.push(...tableData);
      }
    }

    return allData;
  }

  private async getDatasetTables(datasetPath: string): Promise<string[]> {
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

  private async loadTableData(datasetPath: string, tableName: string): Promise<any[]> {
    const tablePath = path.join(datasetPath, tableName);
    const entries = await fs.readdir(tablePath);
    const allData: any[] = [];

    for (const entry of entries) {
      // Skip directories and non-JSON files
      if (!entry.endsWith('.json')) continue;

      const filePath = path.join(tablePath, entry);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      if (Array.isArray(data)) {
        allData.push(...data);
      } else {
        allData.push(data);
      }
    }

    return allData;
  }
}
