import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';
import { JSONAdapter } from '@/lib/adapters/json.adapter';
import { QueryAnalyzer } from '@/lib/query-analyzer';

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get selected datasets from cookie (comma-separated) or use default
    const cookies = request.cookies;
    const selectedDatasetsStr = cookies.get('selectedDatasets')?.value;

    console.log('Chat API - Cookie parsing:');
    console.log('  Raw cookie value:', selectedDatasetsStr);

    let selectedDatasets: string[] | undefined;
    if (selectedDatasetsStr) {
      selectedDatasets = selectedDatasetsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
      console.log('  Parsed datasets:', selectedDatasets);
    } else {
      console.log('  No selectedDatasets cookie found');
    }

    // Load configurations (use first dataset for project config)
    const config = await loadConfig();
    const primaryDataset = selectedDatasets && selectedDatasets.length > 0
      ? selectedDatasets[0]
      : undefined;
    const projectConfig = await loadProjectConfig(primaryDataset);

    // Initialize data adapter with all selected datasets
    const dataAdapter = new JSONAdapter(config.dataSource, selectedDatasets);
    const rawData = await dataAdapter.getData();

    // Initialize AI adapter
    const aiAdapter = new OpenAIAdapter(config.ai, projectConfig);

    // PHASE 1: AI determines what data is needed
    console.log('Phase 1: Determining data requirements...');
    const queryAnalyzer = new QueryAnalyzer(aiAdapter, projectConfig);
    const queryAnalysis = await queryAnalyzer.analyze(message, rawData);
    console.log('Data request:', JSON.stringify(queryAnalysis, null, 2));

    // PHASE 2: Apply basic filters to get the requested data
    console.log('Phase 2: Filtering data...');
    let filteredData = rawData;

    if (queryAnalysis.filters && queryAnalysis.filters.length > 0) {
      queryAnalysis.filters.forEach(filter => {
        filteredData = filteredData.filter(record => {
          const value = record[filter.field];

          switch (filter.operator) {
            case 'equals':
              return value === filter.value;
            case 'contains':
              return value?.toString().toLowerCase().includes(filter.value.toLowerCase());
            case 'greater_than':
              return value > filter.value;
            case 'less_than':
              return value < filter.value;
            default:
              return true;
          }
        });
      });
    }

    // Apply limit if specified
    if (queryAnalysis.limit) {
      filteredData = filteredData.slice(0, queryAnalysis.limit);
    }

    console.log(`Filtered to ${filteredData.length} records`);

    const contextData = {
      data: filteredData,
      total_records: filteredData.length,
      data_explanation: queryAnalysis.explanation,
    };

    // Add metadata
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const metadata: any = {
      current_date: currentDate,
      query_analysis: queryAnalysis.explanation,
    };

    // Add dataset info if multiple datasets are selected
    if (selectedDatasets && selectedDatasets.length > 1) {
      metadata.datasets_queried = selectedDatasets;
      metadata.note = 'Data from multiple datasets combined. Use _dataset_source field to identify record origin.';
    }

    // PHASE 3: AI generates final response with processed data
    console.log('Phase 3: Generating final response...');
    const response = await aiAdapter.chat(message, { ...contextData, ...metadata });

    return NextResponse.json({
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}
