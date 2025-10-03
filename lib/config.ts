import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

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
    path: string;
  };
}

let cachedConfig: AppConfig | null = null;

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

export function getCachedConfig(): AppConfig | null {
  return cachedConfig;
}
