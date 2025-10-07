import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { createDataAdapter } from '@/lib/adapters/adapter-factory';
import { SchemaDiscovery } from '@/lib/schema-discovery';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    // Get selected dataset from URL parameter first, then cookie, then default
    const { searchParams } = new URL(request.url);
    const datasetFromUrl = searchParams.get('dataset');

    const cookies = request.cookies;
    const datasetFromCookie = cookies.get('selectedDataset')?.value;

    const selectedDataset = datasetFromUrl || datasetFromCookie;

    console.log('Schema API - URL param:', datasetFromUrl);
    console.log('Schema API - Cookie:', datasetFromCookie);
    console.log('Schema API - Selected dataset:', selectedDataset);

    const config = await loadConfig();
    const dataAdapter = await createDataAdapter(config.dataSource as any, selectedDataset ? [selectedDataset] : undefined);
    const data = await dataAdapter.getData();

    console.log('Schema API - Data loaded, records:', data.length);
    console.log('Schema API - First record _dataset_source:', data[0]?._dataset_source);

    const discoveredSchema = SchemaDiscovery.discover(data);

    // Check if schema configuration exists for this dataset (metadata.yaml/schema.yaml or legacy project.yaml)
    let existingConfig = null;
    try {
      const datasetName = selectedDataset || config.dataSource.defaultDataset;
      const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);

      console.log('Schema API - Looking for config files for dataset:', datasetName);

      // Find dataset in type folders
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
