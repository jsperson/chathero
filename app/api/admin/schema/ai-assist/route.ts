import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';
import { JSONAdapter } from '@/lib/adapters/json.adapter';

export async function POST(request: NextRequest) {
  try {
    const { prompt, currentSchema } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Get selected dataset from cookie or use default
    const cookies = request.cookies;
    const selectedDataset = cookies.get('selectedDataset')?.value;

    const config = await loadConfig();
    const projectConfig = await loadProjectConfig(selectedDataset);

    // Load data for context
    const dataAdapter = new JSONAdapter(config.dataSource as any, selectedDataset ? [selectedDataset] : undefined);
    const data = await dataAdapter.getData();

    // Build AI prompt
    const systemPrompt = `You are a helpful assistant that helps users configure their data schema.

Current schema configuration:
${JSON.stringify(currentSchema, null, 2)}

Data sample (first 5 records):
${JSON.stringify(data.slice(0, 5), null, 2)}

The user is asking for help with their schema configuration. Based on their request:
1. Provide a helpful text response explaining your suggestions
2. If applicable, return an updated schema object

Guidelines:
- For field descriptions: be concise but informative
- For keywords: include synonyms, plural/singular forms, common variations
- For domain: identify the business/data domain (e.g., "space launches", "e-commerce sales", "user analytics")
- For example questions: create 3-5 natural language questions users might ask about this data
- For display names: use proper Title Case and expand abbreviations

If you're making changes to the schema, return JSON in this format:
{
  "suggestion": "text explanation of what you did",
  "updatedSchema": { ... the modified schema object ... }
}

If you're just providing advice without modifying the schema, return:
{
  "suggestion": "your advice here"
}`;

    const aiAdapter = new OpenAIAdapter(config.ai, projectConfig);
    const response = await aiAdapter.chat(prompt, {
      system_instruction: systemPrompt,
      require_json: true,
    });

    // Parse AI response
    const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const aiResult = JSON.parse(cleanResponse);

    return NextResponse.json(aiResult);
  } catch (error) {
    console.error('AI assist error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI assistance' },
      { status: 500 }
    );
  }
}
