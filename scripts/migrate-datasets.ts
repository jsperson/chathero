/**
 * Migration script to restructure datasets to new format
 *
 * Old structure:
 *   data/csv/dataset-name/data.csv, project.yaml, README.md
 *   data/json/dataset-name/data.json, project.yaml, README.md
 *
 * New structure:
 *   data/dataset_name/
 *     metadata.yaml
 *     queries.yaml
 *     README.md
 *     dataset_name/  (table)
 *       config/
 *         schema.yaml
 *       data.json or data.csv
 */

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const SOURCE_PATH = '/opt/chathero/data';
const TARGET_PATH = path.join(process.cwd(), 'data');

interface OldProjectConfig {
  project?: {
    name: string;
    description: string;
    domain: string;
  };
  dataSchema?: any;
  domainKnowledge?: any;
  exampleQuestions?: string[];
  queryExamples?: any[];
  aiContext?: any;
}

async function migrateDatasets() {
  console.log('🔄 Starting dataset migration...\n');

  // Ensure target directory exists
  await fs.mkdir(TARGET_PATH, { recursive: true });

  // Process both csv and json type folders
  const typeFolders = ['csv', 'json'];

  for (const typeFolder of typeFolders) {
    const typePath = path.join(SOURCE_PATH, typeFolder);

    try {
      const datasets = await fs.readdir(typePath, { withFileTypes: true });

      for (const dataset of datasets) {
        if (!dataset.isDirectory()) continue;

        const datasetName = dataset.name;
        const sourcePath = path.join(typePath, datasetName);

        console.log(`📦 Migrating ${typeFolder}/${datasetName}...`);

        try {
          await migrateDataset(sourcePath, datasetName, typeFolder as 'csv' | 'json');
          console.log(`✅ Successfully migrated ${datasetName}\n`);
        } catch (error: any) {
          console.error(`❌ Failed to migrate ${datasetName}:`, error.message);
        }
      }
    } catch (error: any) {
      console.log(`⚠️  Type folder ${typeFolder} not found, skipping...`);
    }
  }

  console.log('✨ Migration complete!');
}

async function migrateDataset(sourcePath: string, datasetName: string, type: 'csv' | 'json') {
  // Convert dataset name to lowercase with underscores
  const normalizedName = datasetName.toLowerCase().replace(/-/g, '_');
  const targetDatasetPath = path.join(TARGET_PATH, normalizedName);
  const targetTablePath = path.join(targetDatasetPath, normalizedName);
  const targetConfigPath = path.join(targetTablePath, 'config');

  // Create directory structure
  await fs.mkdir(targetDatasetPath, { recursive: true });
  await fs.mkdir(targetTablePath, { recursive: true });
  await fs.mkdir(targetConfigPath, { recursive: true });

  // Read old config files
  const projectYamlPath = path.join(sourcePath, 'project.yaml');
  const metadataYamlPath = path.join(sourcePath, 'metadata.yaml');
  const schemaYamlPath = path.join(sourcePath, 'schema.yaml');
  const queriesYamlPath = path.join(sourcePath, 'queries.yaml');

  let projectConfig: OldProjectConfig | null = null;
  let hasNewStructure = false;

  // Check if new structure (metadata.yaml + schema.yaml) exists
  try {
    await fs.access(metadataYamlPath);
    await fs.access(schemaYamlPath);
    hasNewStructure = true;
  } catch (e) {
    // Try legacy project.yaml
    try {
      const content = await fs.readFile(projectYamlPath, 'utf-8');
      projectConfig = yaml.load(content) as OldProjectConfig;
    } catch (error) {
      console.log(`  ⚠️  No configuration found, will create minimal config`);
    }
  }

  // Migrate configuration files
  if (hasNewStructure) {
    // Copy metadata.yaml to dataset root
    await fs.copyFile(
      metadataYamlPath,
      path.join(targetDatasetPath, 'metadata.yaml')
    );

    // Copy schema.yaml to table config
    await fs.copyFile(
      schemaYamlPath,
      path.join(targetConfigPath, 'schema.yaml')
    );

    // Copy queries.yaml if exists
    try {
      await fs.copyFile(
        queriesYamlPath,
        path.join(targetDatasetPath, 'queries.yaml')
      );
    } catch (e) {
      // queries.yaml optional
    }
  } else if (projectConfig) {
    // Split legacy project.yaml into metadata.yaml and schema.yaml
    const metadata = {
      project: projectConfig.project,
      aiContext: projectConfig.aiContext,
    };

    const schema = {
      dataSchema: projectConfig.dataSchema,
      domainKnowledge: projectConfig.domainKnowledge,
    };

    const queries = {
      exampleQuestions: projectConfig.exampleQuestions || [],
      queryExamples: projectConfig.queryExamples || [],
    };

    // Write new config files
    await fs.writeFile(
      path.join(targetDatasetPath, 'metadata.yaml'),
      yaml.dump(metadata)
    );

    await fs.writeFile(
      path.join(targetConfigPath, 'schema.yaml'),
      yaml.dump(schema)
    );

    await fs.writeFile(
      path.join(targetDatasetPath, 'queries.yaml'),
      yaml.dump(queries)
    );
  } else {
    // Create minimal config
    const displayName = normalizedName
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const metadata = {
      project: {
        name: displayName,
        description: `${displayName} dataset`,
        domain: 'general',
      },
    };

    await fs.writeFile(
      path.join(targetDatasetPath, 'metadata.yaml'),
      yaml.dump(metadata)
    );
  }

  // Copy README.md if exists
  try {
    await fs.copyFile(
      path.join(sourcePath, 'README.md'),
      path.join(targetDatasetPath, 'README.md')
    );
  } catch (e) {
    // README optional
  }

  // Copy data file(s)
  const dataFileName = type === 'json' ? 'data.json' : 'data.csv';
  const sourceDataPath = path.join(sourcePath, dataFileName);
  const targetDataPath = path.join(targetTablePath, dataFileName);

  try {
    await fs.copyFile(sourceDataPath, targetDataPath);
    console.log(`  ✓ Copied ${dataFileName}`);
  } catch (error) {
    console.log(`  ⚠️  Data file ${dataFileName} not found`);
  }

  // Check for additional data files
  const files = await fs.readdir(sourcePath);
  for (const file of files) {
    if (file.startsWith('data') && (file.endsWith('.json') || file.endsWith('.csv'))) {
      if (file !== dataFileName) {
        await fs.copyFile(
          path.join(sourcePath, file),
          path.join(targetTablePath, file)
        );
        console.log(`  ✓ Copied additional file: ${file}`);
      }
    }
  }
}

// Run migration
migrateDatasets().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
