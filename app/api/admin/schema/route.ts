import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { createDataAdapter } from '@/lib/adapters/adapter-factory';
import { SchemaDiscovery } from '@/lib/schema-discovery';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    // Get selected dataset and table from URL parameters first, then cookie
    const { searchParams } = new URL(request.url);
    const datasetFromUrl = searchParams.get('dataset');
    const tableFromUrl = searchParams.get('table');

    const cookies = request.cookies;
    const datasetFromCookie = cookies.get('selectedDataset')?.value;

    const selectedDataset = datasetFromUrl || datasetFromCookie;

    console.log('Schema API - URL param:', datasetFromUrl);
    console.log('Schema API - Table param:', tableFromUrl);
    console.log('Schema API - Cookie:', datasetFromCookie);
    console.log('Schema API - Selected dataset:', selectedDataset);

    if (!selectedDataset) {
      return NextResponse.json(
        { error: 'No dataset selected. Please select a dataset first.' },
        { status: 400 }
      );
    }

    const config = await loadConfig();
    const dataAdapter = await createDataAdapter(config.dataSource as any, [selectedDataset]);
    const data = await dataAdapter.getData();

    console.log('Schema API - Data loaded, records:', data.length);
    console.log('Schema API - First record _dataset_source:', data[0]?._dataset_source);

    const discoveredSchema = SchemaDiscovery.discover(data);

    // Check if schema configuration exists for this dataset/table
    let existingConfig = null;
    try {
      const datasetName = selectedDataset;
      const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);

      console.log('Schema API - Looking for config files for dataset:', datasetName, 'table:', tableFromUrl);

      // Try new flat structure first
      const datasetPath = path.join(datasetsPath, datasetName);

      try {
        await fs.access(datasetPath);

        // If table is specified, look for table-specific schema
        if (tableFromUrl) {
          const tableSchemaPath = path.join(datasetPath, tableFromUrl, 'config', 'schema.yaml');

          try {
            await fs.access(tableSchemaPath);
            console.log('Schema API - Found table-specific schema at:', tableSchemaPath);

            // Load table schema
            const yaml = await import('js-yaml');
            const schemaContent = await fs.readFile(tableSchemaPath, 'utf-8');
            const tableSchema = yaml.load(schemaContent) as any;

            // Load dataset metadata for project info
            const metadataPath = path.join(datasetPath, 'metadata.yaml');
            let metadata: any = {};

            try {
              const metadataContent = await fs.readFile(metadataPath, 'utf-8');
              metadata = yaml.load(metadataContent);
            } catch (e) {
              // No metadata
            }

            existingConfig = {
              project: metadata.project || {
                name: tableFromUrl,
                description: '',
                domain: 'general data'
              },
              dataSchema: tableSchema.dataSchema,
              domainKnowledge: tableSchema.domainKnowledge || { fieldKeywords: {} },
              exampleQuestions: [],
              queryExamples: []
            };
          } catch (e) {
            console.log('Schema API - No table-specific schema found');
          }
        } else {
          // Dataset-level schema
          const projectConfig = await loadProjectConfig(selectedDataset);
          existingConfig = projectConfig;
        }
      } catch (e) {
        // Try old structure (type folders)
        const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
        const typeFolders = typeEntries.filter(entry => entry.isDirectory());

        for (const typeFolder of typeFolders) {
          const datasetDir = path.join(datasetsPath, typeFolder.name, datasetName);
          const metadataPath = path.join(datasetDir, 'metadata.yaml');
          const schemaPath = path.join(datasetDir, 'schema.yaml');

          try {
            // Check for new structure (metadata.yaml + schema.yaml)
            await fs.access(metadataPath);
            await fs.access(schemaPath);

            console.log('Schema API - Found new structure at:', datasetDir);
            const projectConfig = await loadProjectConfig(selectedDataset);
            console.log('Schema API - Loaded project config:', projectConfig.project.name);
            existingConfig = projectConfig;
            break;
          } catch (e) {
            // Try legacy project.yaml
            try {
              const projectPath = path.join(datasetDir, 'project.yaml');
              await fs.access(projectPath);
              console.log('Schema API - Found legacy project.yaml at:', projectPath);
              const projectConfig = await loadProjectConfig(selectedDataset);
              console.log('Schema API - Loaded project config:', projectConfig.project.name);
              existingConfig = projectConfig;
              break;
            } catch (legacyError) {
              // Try next type folder
            }
          }
        }
      }
    } catch (error) {
      // File doesn't exist, that's ok
      console.log('Schema API - No config files found, will use auto-discovered schema');
    }

    console.log('Schema API - Returning response with existingConfig:', existingConfig?.project?.name || 'null');

    return NextResponse.json({
      discovered: discoveredSchema,
      existingConfig,
    });
  } catch (error) {
    console.error('Schema API error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze schema' },
      { status: 500 }
    );
  }
}
