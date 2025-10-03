import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';
import { JSONAdapter } from '@/lib/adapters/json.adapter';

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
    const data = await dataAdapter.getData();

    // Initialize AI adapter
    const aiAdapter = new OpenAIAdapter(config.ai);
    const response = await aiAdapter.chat(message, data);

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
