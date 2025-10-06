import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';
import { JSONAdapter } from '@/lib/adapters/json.adapter';
import { DataProcessor } from '@/lib/data-processor';
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

    let selectedDatasets: string[] | undefined;
    if (selectedDatasetsStr) {
      selectedDatasets = selectedDatasetsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
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

    // PHASE 1: AI analyzes the query with a data sample
    console.log('Phase 1: Analyzing query with AI...');
    const queryAnalyzer = new QueryAnalyzer(aiAdapter, projectConfig);
    const queryAnalysis = await queryAnalyzer.analyze(message, rawData);
    console.log('Query analysis:', JSON.stringify(queryAnalysis, null, 2));

    // PHASE 2: Execute the analysis instructions to process data
    console.log('Phase 2: Executing data processing instructions...');
    const processor = new DataProcessor(rawData, projectConfig);
    const contextData = processor.executeAnalysis(queryAnalysis);

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
