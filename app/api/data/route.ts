import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { createDataAdapter } from '@/lib/adapters/adapter-factory';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const specificDataset = searchParams.get('dataset');

    // If a specific dataset is requested, fetch only that one
    if (specificDataset) {
      const config = await loadConfig();
      const dataAdapter = await createDataAdapter(config.dataSource, [specificDataset]);
      const data = await dataAdapter.getData();
      return NextResponse.json(data);
    }

    // Otherwise, get selected datasets from cookie (comma-separated) or use default
    const cookies = request.cookies;
    const selectedDatasetsStr = cookies.get('selectedDatasets')?.value;

    let selectedDatasets: string[] | undefined;
    if (selectedDatasetsStr) {
      selectedDatasets = selectedDatasetsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    const config = await loadConfig();
    const dataAdapter = await createDataAdapter(config.dataSource, selectedDatasets);
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
