import { promises as fs } from 'fs';
import path from 'path';
import { DataAdapter, DataSourceConfig } from './data.adapter';

export class JSONAdapter implements DataAdapter {
  private config: DataSourceConfig;
  private dataset?: string;

  constructor(config: DataSourceConfig, dataset?: string) {
    this.config = config;
    this.dataset = dataset;
  }

  async getData(): Promise<any> {
    try {
      let filePath: string;

      // New multi-dataset structure
      if ('datasetsPath' in this.config && this.config.datasetsPath) {
        const datasetName = this.dataset || this.config.defaultDataset;
        filePath = path.join(process.cwd(), this.config.datasetsPath, datasetName, 'data.json');
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
    } catch (error) {
      console.error('Error reading JSON file:', error);
      throw new Error('Failed to load data');
    }
  }
}
