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

    // Load configurations
    const config = await loadConfig();
    const projectConfig = await loadProjectConfig();

    // Initialize data adapter
    const dataAdapter = new JSONAdapter(config.dataSource);
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
    const metadata = {
      current_date: currentDate,
      query_analysis: queryAnalysis.explanation,
    };

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
