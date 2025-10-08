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
    let filePath: string = '';

    // New multi-dataset structure with type folders
    if ('datasetsPath' in this.config && this.config.datasetsPath) {
      // Try to find dataset in type folders (csv, json, url, etc.)
      const datasetsPath = path.join(process.cwd(), this.config.datasetsPath);
      const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
      const typeFolders = typeEntries.filter(entry => entry.isDirectory());

      let found = false;
      for (const typeFolder of typeFolders) {
        const potentialPath = path.join(datasetsPath, typeFolder.name, datasetName, 'data.csv');
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
    return this.parseCSV(fileContent);
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
