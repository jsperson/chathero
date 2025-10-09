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

    // Read existing metadata
    const metadataPath = path.join(datasetPath, 'metadata.yaml');
    let metadata: any = {};

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      metadata = yaml.load(metadataContent) as any;
    } catch (e) {
      // No metadata file
    }

    // Mark as deleted (soft delete - doesn't remove files)
    metadata.deleted = true;
    metadata.deletedAt = new Date().toISOString();

    // Write back to file
    await fs.writeFile(metadataPath, yaml.dump(metadata), 'utf-8');

    return NextResponse.json({
      success: true,
      name: datasetName,
      message: 'Dataset marked as deleted. Files have not been removed.',
    });
  } catch (error) {
    console.error('Delete dataset API error:', error);
    return NextResponse.json(
      { error: 'Failed to delete dataset' },
      { status: 500 }
    );
  }
}
