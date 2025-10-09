import { promises as fs } from 'fs';
import path from 'path';
import { DataAdapter, DataSourceConfig } from './data.adapter';

export class CSVAdapter implements DataAdapter {
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
      console.error('Error reading CSV file:', error);
      throw new Error('Failed to load data');
    }
  }

  private async loadSingleDataset(datasetName: string): Promise<any> {
    if (!('datasetsPath' in this.config) || !this.config.datasetsPath) {
      // Legacy single file structure
      if ('path' in this.config && this.config.path) {
        const filePath = path.join(process.cwd(), this.config.path);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return this.parseCSV(fileContent);
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
        const potentialPath = path.join(datasetsPath, typeFolder.name, datasetName, 'data.csv');
        try {
          await fs.access(potentialPath);
          const fileContent = await fs.readFile(potentialPath, 'utf-8');
          return this.parseCSV(fileContent);
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
      // Skip directories and non-CSV files
      if (!entry.endsWith('.csv')) continue;

      const filePath = path.join(tablePath, entry);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = this.parseCSV(fileContent);

      allData.push(...data);
    }

    return allData;
  }

  private parseCSV(content: string): any[] {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];

    // Parse header
    const headers = this.parseCSVLine(lines[0]);

    // Parse rows
    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index] || '';
        // Try to parse as number or boolean
        row[header] = this.parseValue(value);
      });
      data.push(row);
    }

    return data;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current);

    return result;
  }

  private parseValue(value: string): any {
    // Remove quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/""/g, '"');
    }

    // Trim whitespace
    value = value.trim();

    // Empty string
    if (value === '') return '';

    // Boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Percentage (e.g., "45.00%", "0.00%")
    if (value.endsWith('%')) {
      const numStr = value.slice(0, -1).trim();
      const num = Number(numStr);
      if (!isNaN(num)) {
        return num / 100; // Convert to decimal
      }
    }

    // Currency with possible negative in parentheses (e.g., "$408.30", "$(122.80)")
    const currencyMatch = value.match(/^\$?\(?([0-9,]+\.?\d*)\)?$/);
    if (currencyMatch) {
      const numStr = currencyMatch[1].replace(/,/g, '');
      const num = Number(numStr);
      if (!isNaN(num)) {
        // If wrapped in parentheses, it's negative
        return value.includes('(') ? -num : num;
      }
    }

    // Plain number (including negatives)
    if (!isNaN(Number(value)) && value !== '') {
      return Number(value);
    }

    // String
    return value;
  }
}
