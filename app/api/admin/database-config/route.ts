import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const dynamic = 'force-dynamic';

/**
 * Read credentials from .env.local
 */
async function readCredentials(): Promise<{ username: string; password: string }> {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    const envContent = await fs.readFile(envPath, 'utf-8');

    const lines = envContent.split('\n');
    let username = '';
    let password = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DB_USERNAME=')) {
        username = trimmed.substring('DB_USERNAME='.length).trim();
      } else if (trimmed.startsWith('DB_PASSWORD=')) {
        password = trimmed.substring('DB_PASSWORD='.length).trim();
      }
    }

    return { username, password };
  } catch (error) {
    // .env.local doesn't exist or can't be read
    return { username: '', password: '' };
  }
}

/**
 * GET - Load current database configuration
 */
export async function GET() {
  try {
    const configPath = path.join(process.cwd(), 'config', 'app.yaml');
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(fileContent) as any;

    // Read actual credentials from .env.local
    const credentials = await readCredentials();

    // Merge credentials with config
    const database = config.dataSource?.database || null;
    if (database && database.connection) {
      database.connection.username = credentials.username;
      database.connection.password = credentials.password;
    }

    return NextResponse.json({
      dataSourceType: config.dataSource?.type || 'file',
      database,
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
 * Write credentials to .env.local
 */
async function writeCredentials(username: string, password: string): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local');

  let envContent = '';
  let hasUsername = false;
  let hasPassword = false;

  // Read existing .env.local if it exists
  try {
    envContent = await fs.readFile(envPath, 'utf-8');
    const lines = envContent.split('\n');
    const updatedLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DB_USERNAME=')) {
        updatedLines.push(`DB_USERNAME=${username}`);
        hasUsername = true;
      } else if (trimmed.startsWith('DB_PASSWORD=')) {
        updatedLines.push(`DB_PASSWORD=${password}`);
        hasPassword = true;
      } else {
        updatedLines.push(line);
      }
    }

    envContent = updatedLines.join('\n');
  } catch (error) {
    // .env.local doesn't exist, will create new
  }

  // Add credentials if they weren't already in the file
  if (!hasUsername) {
    envContent += `\nDB_USERNAME=${username}`;
  }
  if (!hasPassword) {
    envContent += `\nDB_PASSWORD=${password}`;
  }

  // Write to .env.local
  await fs.writeFile(envPath, envContent.trim() + '\n', 'utf-8');
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
      // Save credentials to .env.local
      const username = database.connection.username || '';
      const password = database.connection.password || '';
      await writeCredentials(username, password);

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
