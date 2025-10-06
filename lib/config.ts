import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { SchemaDiscovery } from './schema-discovery';

export interface AppConfig {
  app: {
    name: string;
  };
  theme: {
    logo: string;
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
  };
  ai: {
    provider: string;
    model: string;
    apiKey: string;
  };
  dataSource: {
    type: string;
    datasetsPath: string;
    defaultDataset: string;
    path?: string; // Deprecated - for backward compatibility
  };
}

export interface ProjectConfig {
  project: {
    name: string;
    description: string;
    domain: string;
  };
  dataSchema: {
    primaryDateField: string;
    categoricalFields: Array<{
      name: string;
      displayName: string;
      description: string;
    }>;
    numericFields?: Array<{
      name: string;
      displayName: string;
      unit: string;
    }>;
  };
  domainKnowledge: {
    vehicleTypes?: string[];
    outcomeTypes?: string[];
    fieldKeywords: Record<string, string[]>;
  };
  exampleQuestions: string[];
  queryExamples?: Array<{
    question: string;
    filters?: Array<{
      field: string;
      operator: string;
      value: any;
    }>;
    limit?: number;
    explanation: string;
  }>;
  aiContext: {
    systemRole: string;
    domainContext: string;
  };
  readme?: string; // README content if available
}

let cachedConfig: AppConfig | null = null;
let cachedProjectConfig: ProjectConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configPath = path.join(process.cwd(), 'config', 'app.yaml');
    const fileContent = await fs.readFile(configPath, 'utf-8');

    // Replace environment variables
    const processedContent = fileContent.replace(
      /\$\{(\w+)\}/g,
      (_, varName) => process.env[varName] || ''
    );

    cachedConfig = yaml.load(processedContent) as AppConfig;
    return cachedConfig;
  } catch (error) {
    console.error('Error loading config:', error);
    throw new Error('Failed to load configuration');
  }
}

export async function loadProjectConfig(dataset?: string): Promise<ProjectConfig> {
  // Clear cache if switching datasets
  if (dataset && cachedProjectConfig) {
    cachedProjectConfig = null;
  }

  if (cachedProjectConfig) {
    return cachedProjectConfig;
  }

  try {
    const appConfig = await loadConfig();
    const datasetName = dataset || appConfig.dataSource.defaultDataset;
    const datasetsPath = path.join(process.cwd(), appConfig.dataSource.datasetsPath);

    // Find dataset in type folders
    const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
    const typeFolders = typeEntries.filter(entry => entry.isDirectory());

    let configPath: string | null = null;
    let dataPath: string | null = null;

    for (const typeFolder of typeFolders) {
      const potentialConfigPath = path.join(datasetsPath, typeFolder.name, datasetName, 'project.yaml');
      const potentialDataPath = path.join(datasetsPath, typeFolder.name, datasetName, 'data.json');
      try {
        await fs.access(potentialDataPath);
        configPath = potentialConfigPath;
        dataPath = potentialDataPath;
        break;
      } catch (e) {
        // Try next type folder
      }
    }

    if (!dataPath) {
      throw new Error(`Dataset '${datasetName}' not found in any type folder`);
    }

    try {
      const fileContent = await fs.readFile(configPath!, 'utf-8');
      cachedProjectConfig = yaml.load(fileContent) as ProjectConfig;
    } catch (readError) {
      // If project.yaml doesn't exist, auto-discover schema from data
      console.log('project.yaml not found, auto-discovering schema from data...');

      const dataContent = await fs.readFile(dataPath, 'utf-8');
      const data = JSON.parse(dataContent);

      // Extract project name from dataset folder name
      const fileName = datasetName;
      const projectName = fileName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      cachedProjectConfig = SchemaDiscovery.generateProjectConfig(data, projectName);

      console.log(`Auto-discovered schema with ${cachedProjectConfig.dataSchema.categoricalFields.length} categorical fields and ${cachedProjectConfig.dataSchema.numericFields?.length || 0} numeric fields`);
    }

    // Try to load README if it exists
    const readmePath = path.join(path.dirname(dataPath), 'README.md');
    try {
      const readmeContent = await fs.readFile(readmePath, 'utf-8');
      cachedProjectConfig!.readme = readmeContent;
    } catch (readmeError) {
      // README is optional, continue without it
    }

    return cachedProjectConfig!;
  } catch (error) {
    console.error('Error loading project config:', error);
    throw new Error('Failed to load project configuration');
  }
}

export function getCachedConfig(): AppConfig | null {
  return cachedConfig;
}

export function getCachedProjectConfig(): ProjectConfig | null {
  return cachedProjectConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
  cachedProjectConfig = null;
}
