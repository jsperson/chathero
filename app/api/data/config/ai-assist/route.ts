import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';

export async function POST(request: NextRequest) {
  try {
    const { dataset, prompt, currentExamples } = await request.json();

    if (!dataset || !prompt) {
      return NextResponse.json(
        { error: 'Dataset and prompt required' },
        { status: 400 }
      );
    }

    const config = await loadConfig();
    const projectConfig = await loadProjectConfig(dataset);
    const aiAdapter = new OpenAIAdapter(config.ai, projectConfig);

    const systemPrompt = `You are an assistant helping to generate query examples for a dataset configuration.

Dataset: ${dataset}
Dataset schema:
${JSON.stringify(projectConfig.dataSchema, null, 2)}

Current examples:
${JSON.stringify(currentExamples, null, 2)}

Generate query examples in this format:
[
  {
    "question": "User's question",
    "filters": [{"field": "field_name", "operator": "equals|contains", "value": "value"}],
    "limit": 100,
    "explanation": "What data is needed"
  }
]

Guidelines:
- Always include a filter for "_dataset_source" with value "${dataset}" when the dataset is part of a multi-dataset setup
- Use "contains" operator for partial text matching
- Use "equals" operator for exact matching
- Keep explanations concise
- Examples should teach the AI how to filter data for common queries

Return ONLY valid JSON array, no other text.`;

    const response = await aiAdapter.chat(prompt, {
      system_instruction: systemPrompt,
      require_json: true,
    });

    const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let examples;

    console.log('AI assist raw response:', cleanResponse.substring(0, 500));

    try {
      examples = JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response:', cleanResponse);
      return NextResponse.json(
        { error: 'AI returned invalid JSON' },
        { status: 500 }
      );
    }

    console.log('AI assist parsed response type:', typeof examples, Array.isArray(examples) ? 'array' : 'not array');

    // Handle both array and object with examples property (from JSON mode)
    if (Array.isArray(examples)) {
      return NextResponse.json({ examples });
    } else if (examples && Array.isArray(examples.examples)) {
      // JSON mode sometimes wraps the array in an object
      return NextResponse.json({ examples: examples.examples });
    } else if (examples && typeof examples === 'object') {
      // Try to extract array from any property
      const keys = Object.keys(examples);
      for (const key of keys) {
        if (Array.isArray(examples[key])) {
          console.log(`Found array in property: ${key}`);
          return NextResponse.json({ examples: examples[key] });
        }
      }
    }

    console.error('AI returned non-array and no array found in object:', JSON.stringify(examples));
    return NextResponse.json(
      { error: 'AI returned invalid format (not an array)' },
      { status: 500 }
    );
  } catch (error) {
    console.error('AI assist error:', error);
    return NextResponse.json(
      { error: 'Failed to generate examples' },
      { status: 500 }
    );
  }
}
