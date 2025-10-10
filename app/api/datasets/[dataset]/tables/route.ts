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

    // Check if this is a database dataset by looking for connection.yaml
    const connectionPath = path.join(datasetPath, 'connection.yaml');
    let isDatabase = false;
    try {
      await fs.access(connectionPath);
      isDatabase = true;
    } catch (e) {
      // Not a database dataset
    }

    if (isDatabase) {
      // Load and update connection.yaml
      try {
        const connectionContent = await fs.readFile(connectionPath, 'utf-8');
        const connectionConfig = yaml.load(connectionContent) as any;

        // Update tables
        connectionConfig.tables = selectedTables;

        // Write back to connection.yaml
        await fs.writeFile(connectionPath, yaml.dump(connectionConfig), 'utf-8');

        return NextResponse.json({
          success: true,
          selectedTables,
        });
      } catch (e) {
        return NextResponse.json(
          { error: 'Failed to update connection.yaml' },
          { status: 500 }
        );
      }
    }

    // File-based dataset

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
