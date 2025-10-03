import { NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { JSONAdapter } from '@/lib/adapters/json.adapter';
import { SchemaDiscovery } from '@/lib/schema-discovery';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const config = await loadConfig();
    const dataAdapter = new JSONAdapter(config.dataSource);
    const data = await dataAdapter.getData();

    const discoveredSchema = SchemaDiscovery.discover(data);

    // Check if project.yaml exists
    let existingConfig = null;
    try {
      const configPath = path.join(process.cwd(), 'config', 'project.yaml');
      await fs.access(configPath);
      // File exists, load it
      const projectConfig = await loadProjectConfig();
      existingConfig = projectConfig;
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
