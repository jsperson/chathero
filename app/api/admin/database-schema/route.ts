import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { createDataAdapter } from '@/lib/adapters/adapter-factory';

export const dynamic = 'force-dynamic';

/**
 * GET - Get database tables and current schema configuration
 */
export async function GET() {
  try {
    const config = await loadConfig();

    if (config.dataSource.type !== 'database') {
      return NextResponse.json(
        { error: 'Not in database mode' },
        { status: 400 }
      );
    }

    if (!config.dataSource.database) {
      return NextResponse.json(
        { error: 'Database configuration is required' },
        { status: 500 }
      );
    }

    // Create adapter to get table list
    const adapter = await createDataAdapter(config.dataSource, []);

    // Get tables using getTables() method
    let tables: string[] = [];
    if ('getTables' in adapter && typeof adapter.getTables === 'function') {
      tables = await adapter.getTables();
    } else {
      throw new Error('Database adapter does not support getTables()');
    }

    // Get currently configured tables
    const configuredTables = config.dataSource.database.tables || [];

    return NextResponse.json({
      tables,
      configuredTables,
      databaseName: config.dataSource.database.connection.database,
      databaseType: config.dataSource.database.type,
    });
  } catch (error: any) {
    console.error('Database schema API error:', error);
    return NextResponse.json(
      { error: 'Failed to load database schema', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Save database schema configuration (selected tables)
 */
export async function POST(request: Request) {
  try {
    const { tables } = await request.json();

    if (!Array.isArray(tables)) {
      return NextResponse.json(
        { error: 'tables must be an array' },
        { status: 400 }
      );
    }

    // Load and update app.yaml with selected tables
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const yaml = await import('js-yaml');

    const configPath = path.join(process.cwd(), 'config', 'app.yaml');
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(fileContent) as any;

    // Update the tables array in database config
    if (config.dataSource?.database) {
      config.dataSource.database.tables = tables;

      // Write back to file
      const newContent = yaml.dump(config, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      });

      await fs.writeFile(configPath, newContent, 'utf-8');
    } else {
      return NextResponse.json(
        { error: 'Database configuration not found' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Schema configuration saved',
      tables,
    });
  } catch (error: any) {
    console.error('Failed to save database schema:', error);
    return NextResponse.json(
      { error: 'Failed to save schema configuration', message: error.message },
      { status: 500 }
    );
  }
}
