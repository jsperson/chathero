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

Special instructions for "rediscover" requests:
- Analyze ALL fields in the data sample
- Include ALL string/date fields as categorical fields (not just low-cardinality ones)
- Include ALL numeric fields
- Preserve existing display names and descriptions from current schema where they exist
- For new fields, generate appropriate display names and descriptions
- Update the project description to reflect actual record count and field count

IMPORTANT: Return ONLY valid JSON. Ensure all strings are properly escaped:
- Use double quotes for strings
- Escape special characters: \\\\ for backslash, \\" for quotes, \\\\n for newlines
- Do not include newlines within string values
- Test that your JSON is valid before returning

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

    let aiResult;
    try {
      aiResult = JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('AI response:', cleanResponse);

      // Return a helpful error message
      return NextResponse.json({
        error: 'AI generated invalid JSON response. Please try rephrasing your request.',
        details: parseError instanceof Error ? parseError.message : 'Unknown parse error'
      }, { status: 500 });
    }

    return NextResponse.json(aiResult);
  } catch (error) {
    console.error('AI assist error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI assistance' },
      { status: 500 }
    );
  }
}
