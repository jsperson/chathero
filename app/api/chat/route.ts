import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';
import { JSONAdapter } from '@/lib/adapters/json.adapter';
import { DataProcessor } from '@/lib/data-processor';

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Load configuration
    const config = await loadConfig();

    // Initialize data adapter
    const dataAdapter = new JSONAdapter(config.dataSource);
    const rawData = await dataAdapter.getData();

    // Analyze the query to determine what data to send
    const queryAnalysis = DataProcessor.analyzeQuery(message);
    const processor = new DataProcessor(rawData);

    let contextData: any;

    // Process data based on query type
    if (queryAnalysis.type === 'aggregate') {
      contextData = processor.aggregate(queryAnalysis.fields || ['year', 'vehicle', 'outcome']);
    } else if (queryAnalysis.type === 'filter') {
      const filtered = processor.filter(queryAnalysis.filters || {}, queryAnalysis.limit || 50);
      contextData = {
        total_matching: filtered.length,
        results: filtered,
      };
    } else if (queryAnalysis.type === 'specific') {
      // For specific queries, send a small subset
      contextData = {
        total_records: rawData.length,
        recent_launches: rawData.slice(-10), // Last 10 launches
        first_launches: rawData.slice(0, 10), // First 10 launches
      };
    } else {
      // Default: send aggregated summary
      contextData = processor.aggregate(['year', 'vehicle', 'outcome']);
    }

    // Add metadata
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const metadata = {
      current_date: currentDate,
      query_type: queryAnalysis.type,
    };

    // Initialize AI adapter and get response
    const aiAdapter = new OpenAIAdapter(config.ai);
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
