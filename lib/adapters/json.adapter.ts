import { promises as fs } from 'fs';
import path from 'path';
import { DataAdapter, DataSourceConfig } from './data.adapter';

export class JSONAdapter implements DataAdapter {
  private filePath: string;

  constructor(config: DataSourceConfig) {
    this.filePath = path.join(process.cwd(), config.path);
  }

  async getData(): Promise<any> {
    try {
      const fileContent = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      console.error('Error reading JSON file:', error);
      throw new Error('Failed to load data');
    }
  }
}
