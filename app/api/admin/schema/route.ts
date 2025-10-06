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

    // Check if project.yaml exists for this dataset
    let existingConfig = null;
    try {
      const datasetName = selectedDataset || config.dataSource.defaultDataset;
      const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);

      console.log('Schema API - Looking for project.yaml for dataset:', datasetName);

      // Find dataset in type folders
      const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
      const typeFolders = typeEntries.filter(entry => entry.isDirectory());

      for (const typeFolder of typeFolders) {
        const configPath = path.join(datasetsPath, typeFolder.name, datasetName, 'project.yaml');
        try {
          await fs.access(configPath);
          // File exists, load it
          console.log('Schema API - Found project.yaml at:', configPath);
          const projectConfig = await loadProjectConfig(selectedDataset);
          console.log('Schema API - Loaded project config:', projectConfig.project.name);
          existingConfig = projectConfig;
          break;
        } catch (e) {
          // Try next type folder
        }
      }
    } catch (error) {
      // File doesn't exist, that's ok
      console.log('Schema API - No project.yaml found, will use auto-discovered schema');
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
