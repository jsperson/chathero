import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { createDataAdapter } from '@/lib/adapters/adapter-factory';
import { SchemaDiscovery } from '@/lib/schema-discovery';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    // Get selected dataset from cookie or use default
    const cookies = request.cookies;
    const selectedDataset = cookies.get('selectedDataset')?.value;

    const config = await loadConfig();
    const dataAdapter = await createDataAdapter(config.dataSource as any, selectedDataset ? [selectedDataset] : undefined);
    const data = await dataAdapter.getData();

    const discoveredSchema = SchemaDiscovery.discover(data);

    // Check if project.yaml exists for this dataset
    let existingConfig = null;
    try {
      const datasetName = selectedDataset || config.dataSource.defaultDataset;
      const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);

      // Find dataset in type folders
      const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
      const typeFolders = typeEntries.filter(entry => entry.isDirectory());

      for (const typeFolder of typeFolders) {
        const configPath = path.join(datasetsPath, typeFolder.name, datasetName, 'project.yaml');
        try {
          await fs.access(configPath);
          // File exists, load it
          const projectConfig = await loadProjectConfig(selectedDataset);
          existingConfig = projectConfig;
          break;
        } catch (e) {
          // Try next type folder
        }
      }
    } catch (error) {
      // File doesn't exist, that's ok
    }

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
