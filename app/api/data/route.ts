import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { JSONAdapter } from '@/lib/adapters/json.adapter';

export async function GET(request: NextRequest) {
  try {
    // Get selected dataset from cookie or use default
    const cookies = request.cookies;
    const selectedDataset = cookies.get('selectedDataset')?.value;

    const config = await loadConfig();
    const dataAdapter = new JSONAdapter(config.dataSource, selectedDataset);
    const data = await dataAdapter.getData();

    return NextResponse.json(data);
  } catch (error) {
    console.error('Data API error:', error);
    return NextResponse.json(
      { error: 'Failed to load data' },
      { status: 500 }
    );
  }
}
