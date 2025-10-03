import { NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { JSONAdapter } from '@/lib/adapters/json.adapter';
import { SchemaDiscovery } from '@/lib/schema-discovery';
import * as yaml from 'js-yaml';

export async function GET() {
  try {
    const config = await loadConfig();
    const projectConfig = await loadProjectConfig();

    // Load the actual data to show discovered schema
    const dataAdapter = new JSONAdapter(config.dataSource);
    const data = await dataAdapter.getData();

    const discoveredSchema = SchemaDiscovery.discover(data);

    return NextResponse.json({
      discovered: discoveredSchema,
      currentConfig: projectConfig,
      isAutoDiscovered: !projectConfig._isManual,
    });
  } catch (error) {
    console.error('Schema API error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze schema' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const config = await loadConfig();
    const dataAdapter = new JSONAdapter(config.dataSource);
    const data = await dataAdapter.getData();

    // Generate project config from data
    const projectConfig = SchemaDiscovery.generateProjectConfig(data, config.app.name);

    // Return as YAML for easy copy/paste to project.yaml
    const yamlContent = yaml.dump(projectConfig, {
      indent: 2,
      lineWidth: 100,
    });

    return new NextResponse(yamlContent, {
      headers: {
        'Content-Type': 'text/yaml',
        'Content-Disposition': 'attachment; filename="project.yaml"',
      },
    });
  } catch (error) {
    console.error('Schema generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate schema' },
      { status: 500 }
    );
  }
}
