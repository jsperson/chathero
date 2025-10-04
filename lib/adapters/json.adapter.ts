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

      // New multi-dataset structure with type folders
      if ('datasetsPath' in this.config && this.config.datasetsPath) {
        const datasetName = this.dataset || this.config.defaultDataset;

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
    } catch (error) {
      console.error('Error reading JSON file:', error);
      throw new Error('Failed to load data');
    }
  }
}
