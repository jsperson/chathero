import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { JSONAdapter } from '@/lib/adapters/json.adapter';
import { SchemaDiscovery } from '@/lib/schema-discovery';

export async function GET() {
  try {
    const config = await loadConfig();
    const dataAdapter = new JSONAdapter(config.dataSource);
    const data = await dataAdapter.getData();

    const discoveredSchema = SchemaDiscovery.discover(data);

    return NextResponse.json({
      discovered: discoveredSchema,
    });
  } catch (error) {
    console.error('Schema API error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze schema' },
      { status: 500 }
    );
  }
}
