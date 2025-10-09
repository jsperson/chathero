import { NextRequest, NextResponse } from 'next/server';
import { SQLServerAdapter } from '@/lib/adapters/database/sqlserver.adapter';

export const dynamic = 'force-dynamic';

/**
 * POST - Test database connection
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { database } = body;

    if (!database || !database.type) {
      return NextResponse.json(
        { error: 'Database configuration is required' },
        { status: 400 }
      );
    }

    // Validate required fields based on database type
    if (database.type !== 'sqlite') {
      if (!database.connection.host || !database.connection.database) {
        return NextResponse.json(
          { error: 'Host and database name are required' },
          { status: 400 }
        );
      }
    }

    // Create appropriate adapter and test connection
    let adapter: any;

    switch (database.type) {
      case 'sqlserver':
        adapter = new SQLServerAdapter(database, []);
        break;
      case 'postgresql':
        return NextResponse.json(
          { error: 'PostgreSQL adapter not yet implemented' },
          { status: 400 }
        );
      case 'mysql':
        return NextResponse.json(
          { error: 'MySQL adapter not yet implemented' },
          { status: 400 }
        );
      case 'sqlite':
        return NextResponse.json(
          { error: 'SQLite adapter not yet implemented' },
          { status: 400 }
        );
      default:
        return NextResponse.json(
          { error: `Unknown database type: ${database.type}` },
          { status: 400 }
        );
    }

    // Test connection by listing tables
    const tables = await adapter.getTables();

    return NextResponse.json({
      success: true,
      message: 'Connection successful',
      tables,
      tableCount: tables.length,
    });
  } catch (error: any) {
    console.error('Database connection test failed:', error);

    // Provide helpful error messages based on error type
    let errorMessage = error.message;
    let troubleshooting: string[] = [];

    if (error.code === 'ELOGIN') {
      troubleshooting.push('Check your username and password');
      troubleshooting.push('Verify the user has access to the database');
      troubleshooting.push('For Azure SQL, use full username: user@servername');
    } else if (error.code === 'ETIMEOUT' || error.code === 'ESOCKET') {
      troubleshooting.push('Check your firewall settings');
      troubleshooting.push('Verify the host and port are correct');
      troubleshooting.push('For Azure SQL, add your IP to the allowlist');
    } else if (error.code === 'ENOTFOUND') {
      troubleshooting.push('Check that the host name is correct');
      troubleshooting.push('Verify you have network connectivity');
    }

    return NextResponse.json(
      {
        error: 'Connection failed',
        message: errorMessage,
        troubleshooting,
        errorCode: error.code,
      },
      { status: 500 }
    );
  }
}
