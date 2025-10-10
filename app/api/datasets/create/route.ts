import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadConfig } from '@/lib/config';

export async function POST(request: Request) {
  try {
    const config = await loadConfig();
    const body = await request.json();
    const { name, displayName, description, domain, sourceType, dataType, database } = body;

    if (!name || !displayName) {
      return NextResponse.json(
        { error: 'Name and display name are required' },
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
    const datasetPath = path.join(datasetsPath, name);

    // Check if dataset already exists
    try {
      await fs.access(datasetPath);
      return NextResponse.json(
        { error: 'Dataset already exists' },
        { status: 400 }
      );
    } catch (e) {
      // Dataset doesn't exist, which is what we want
    }

    // Create dataset directory
    await fs.mkdir(datasetPath, { recursive: true });

    // Create metadata.yaml
    const metadata = {
      project: {
        name: displayName,
        description: description || '',
        domain: domain || 'general data'
      },
      type: sourceType || 'file',
      aiContext: {
        systemRole: `You are a helpful assistant that answers questions about ${displayName} data.`,
        domainContext: `This dataset contains data in the ${domain || 'general data'} domain. ${description || ''}`
      }
    };

    await fs.writeFile(
      path.join(datasetPath, 'metadata.yaml'),
      yaml.dump(metadata),
      'utf-8'
    );

    if (sourceType === 'database' && database) {
      // Create connection.yaml for database sources
      const connection = {
        type: database.type,
        connection: {
          host: database.host,
          port: database.port,
          database: database.database,
          username: database.username,
          ...(database.password ? { password: database.password } : {})
        },
        tables: [] // Will be populated later
      };

      await fs.writeFile(
        path.join(datasetPath, 'connection.yaml'),
        yaml.dump(connection),
        'utf-8'
      );

      // Create schemas directory for AI-generated schemas
      await fs.mkdir(path.join(datasetPath, 'schemas'), { recursive: true });
    }

    // Create queries.yaml
    const queries = {
      exampleQuestions: [],
      queryExamples: []
    };

    await fs.writeFile(
      path.join(datasetPath, 'queries.yaml'),
      yaml.dump(queries),
      'utf-8'
    );

    // Create README.md
    const readme = `# ${displayName}

## Overview

${description || 'Dataset description goes here.'}

## ${sourceType === 'database' ? 'Tables' : 'Key Fields'}

${sourceType === 'database' ? '(Tables will be listed here)' : '(Add field descriptions here)'}

## Potential Use Cases

(Add use case descriptions here)
`;

    await fs.writeFile(
      path.join(datasetPath, 'README.md'),
      readme,
      'utf-8'
    );

    return NextResponse.json({
      success: true,
      name,
      displayName,
    });
  } catch (error) {
    console.error('Create dataset API error:', error);
    return NextResponse.json(
      { error: 'Failed to create dataset' },
      { status: 500 }
    );
  }
}
