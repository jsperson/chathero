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
    const { displayName, description, domain } = body;

    if (!displayName) {
      return NextResponse.json(
        { error: 'Display name is required' },
        { status: 400 }
      );
    }

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
    let metadata: any = {
      project: {
        name: displayName,
        description: description || '',
        domain: domain || 'general data'
      }
    };

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      metadata = yaml.load(metadataContent) as any;
    } catch (e) {
      // File doesn't exist, use defaults
    }

    // Update metadata
    metadata.project = {
      ...metadata.project,
      name: displayName,
      description: description || '',
      domain: domain || 'general data'
    };

    // Update aiContext if it exists
    if (metadata.aiContext) {
      metadata.aiContext.systemRole = `You are a helpful assistant that answers questions about ${displayName} data.`;
      metadata.aiContext.domainContext = `This dataset contains data in the ${domain || 'general data'} domain. ${description || ''}`;
    }

    // Write back to file
    await fs.writeFile(metadataPath, yaml.dump(metadata), 'utf-8');

    return NextResponse.json({
      success: true,
      name: datasetName,
      displayName,
    });
  } catch (error) {
    console.error('Update dataset API error:', error);
    return NextResponse.json(
      { error: 'Failed to update dataset' },
      { status: 500 }
    );
  }
}
