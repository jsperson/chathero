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
    queryAnalyzerModel?: string; // Optional: Use different model for Phase 1 query analysis
  };
  dataSource: {
    type: string;
    datasetsPath?: string;
    path?: string; // Deprecated - for backward compatibility
    database?: {
      type: 'sqlserver' | 'postgresql' | 'mysql' | 'sqlite';
      connection: {
        host?: string;
        port?: number;
        database?: string;
        username?: string;
        password?: string;
        file?: string; // For SQLite
        poolMin?: number;
        poolMax?: number;
        connectionTimeout?: number;
      };
      tables?: string[];
    };
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
    fieldsToInclude?: string[];
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

export async function loadProjectConfig(dataset: string): Promise<ProjectConfig> {
  if (!dataset) {
    throw new Error('Dataset parameter is required');
  }

  // Clear cache if switching datasets
  if (dataset && cachedProjectConfig) {
    cachedProjectConfig = null;
  }

  if (cachedProjectConfig) {
    return cachedProjectConfig;
  }

  try {
    const appConfig = await loadConfig();
    const datasetName = dataset;
    const datasetsPath = path.join(process.cwd(), appConfig.dataSource.datasetsPath);

    console.log('loadProjectConfig - dataset:', datasetName);
    console.log('loadProjectConfig - cwd:', process.cwd());
    console.log('loadProjectConfig - datasetsPath:', datasetsPath);

    // Find dataset in type folders
    const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
    const typeFolders = typeEntries.filter(entry => entry.isDirectory());

    let configPath: string | null = null;
    let dataPath: string | null = null;

    for (const typeFolder of typeFolders) {
      const potentialConfigPath = path.join(datasetsPath, typeFolder.name, datasetName, 'project.yaml');
      const potentialJsonPath = path.join(datasetsPath, typeFolder.name, datasetName, 'data.json');
      const potentialCsvPath = path.join(datasetsPath, typeFolder.name, datasetName, 'data.csv');

      // Try JSON first, then CSV
      try {
        await fs.access(potentialJsonPath);
        configPath = potentialConfigPath;
        dataPath = potentialJsonPath;
        break;
      } catch (e) {
        // Try CSV
        try {
          await fs.access(potentialCsvPath);
          configPath = potentialConfigPath;
          dataPath = potentialCsvPath;
          break;
        } catch (csvError) {
          // Try next type folder
        }
      }
    }

    if (!dataPath) {
      throw new Error(`Dataset '${datasetName}' not found in any type folder`);
    }

    // Load configuration from multiple files (new structure) or fallback to single file (legacy)
    const datasetDir = path.dirname(dataPath);
    const metadataPath = path.join(datasetDir, 'metadata.yaml');
    const schemaPath = path.join(datasetDir, 'schema.yaml');
    const queriesPath = path.join(datasetDir, 'queries.yaml');

    let metadata: any = null;
    let schema: any = null;
    let queries: any = null;

    // Try new multi-file structure
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      metadata = yaml.load(metadataContent);
    } catch (e) {
      // metadata.yaml doesn't exist - will try legacy or auto-discover
    }

    try {
      const schemaContent = await fs.readFile(schemaPath, 'utf-8');
      schema = yaml.load(schemaContent);
    } catch (e) {
      // schema.yaml doesn't exist
    }

    try {
      const queriesContent = await fs.readFile(queriesPath, 'utf-8');
      queries = yaml.load(queriesContent);
    } catch (e) {
      // queries.yaml doesn't exist
    }

    // If we have the new structure, merge them
    if (metadata && schema) {
      cachedProjectConfig = {
        ...metadata,
        dataSchema: schema.dataSchema,
        domainKnowledge: schema.domainKnowledge || { fieldKeywords: {} },
        exampleQuestions: queries?.exampleQuestions || [],
        queryExamples: queries?.queryExamples || [],
      };
    } else {
      // Auto-discover schema from data
      console.log('Config files not found, auto-discovering schema from data...');

      // Use the appropriate adapter to load the data
      const { createDataAdapter } = await import('./adapters/adapter-factory');
      const adapter = await createDataAdapter(appConfig.dataSource, datasetName);
      const data = await adapter.getData();

      // Extract project name from dataset folder name
      const fileName = datasetName;
      const projectName = fileName
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      cachedProjectConfig = SchemaDiscovery.generateProjectConfig(data, projectName);

      console.log(`Auto-discovered schema with ${cachedProjectConfig!.dataSchema.categoricalFields.length} categorical fields and ${cachedProjectConfig!.dataSchema.numericFields?.length || 0} numeric fields`);
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
