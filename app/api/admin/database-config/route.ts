import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const dynamic = 'force-dynamic';

/**
 * GET - Load current database configuration
 */
export async function GET() {
  try {
    const configPath = path.join(process.cwd(), 'config', 'app.yaml');
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(fileContent) as any;

    return NextResponse.json({
      dataSourceType: config.dataSource?.type || 'file',
      database: config.dataSource?.database || null,
    });
  } catch (error: any) {
    console.error('Failed to load database config:', error);
    return NextResponse.json(
      { error: 'Failed to load configuration', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Save database configuration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataSourceType, database } = body;

    if (!dataSourceType) {
      return NextResponse.json(
        { error: 'dataSourceType is required' },
        { status: 400 }
      );
    }

    if (dataSourceType === 'database' && !database) {
      return NextResponse.json(
        { error: 'database configuration is required for database type' },
        { status: 400 }
      );
    }

    // Load current config
    const configPath = path.join(process.cwd(), 'config', 'app.yaml');
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(fileContent) as any;

    // Update dataSource section
    if (dataSourceType === 'database') {
      config.dataSource = {
        type: 'database',
        database: {
          type: database.type,
          connection: {
            host: database.connection.host,
            port: database.connection.port,
            database: database.connection.database,
            username: '${DB_USERNAME}',
            password: '${DB_PASSWORD}',
          },
        },
      };
    } else {
      // Switch back to file mode
      config.dataSource = {
        type: 'json',
        datasetsPath: './data',
      };
    }

    // Write back to file
    const newContent = yaml.dump(config, {
      lineWidth: -1, // Don't wrap lines
      quotingType: '"',
      forceQuotes: false,
    });

    await fs.writeFile(configPath, newContent, 'utf-8');

    return NextResponse.json({
      success: true,
      message: 'Configuration saved successfully',
    });
  } catch (error: any) {
    console.error('Failed to save database config:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration', message: error.message },
      { status: 500 }
    );
  }
}
