import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadConfig } from '@/lib/config';

export async function POST(
  request: Request,
  { params }: { params: { dataset: string } }
) {
  try {
    const config = await loadConfig();
    const datasetName = params.dataset;
    const body = await request.json();
    const selectedTables = body.tables || [];

    if (!config.dataSource.datasetsPath) {
      return NextResponse.json(
        { error: 'Datasets path not configured' },
        { status: 400 }
      );
    }

    const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);
    const datasetPath = path.join(datasetsPath, datasetName);

    // Check if dataset exists
    try {
      await fs.access(datasetPath);
    } catch (e) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    // Save table selection to metadata.yaml
    const metadataPath = path.join(datasetPath, 'metadata.yaml');
    let metadata: any = {
      project: {
        name: datasetName,
        description: '',
        domain: 'general data'
      }
    };

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      metadata = yaml.load(metadataContent) as any;
    } catch (e) {
      // File doesn't exist, use defaults
    }

    // Add selected tables to metadata
    metadata.selectedTables = selectedTables;

    // Write back to file
    await fs.writeFile(metadataPath, yaml.dump(metadata), 'utf-8');

    return NextResponse.json({
      success: true,
      selectedTables,
    });
  } catch (error) {
    console.error('Table selection API error:', error);
    return NextResponse.json(
      { error: 'Failed to save table selection' },
      { status: 500 }
    );
  }
}
