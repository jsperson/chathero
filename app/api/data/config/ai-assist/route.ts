import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const requestId = `ai-assist-${Date.now()}`;

  try {
    const { dataset, prompt, currentExamples } = await request.json();

    await logger.info(`[${requestId}] AI Assist request`, { dataset, prompt, existingCount: currentExamples?.length || 0 });

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

Current examples (do NOT duplicate these):
${JSON.stringify(currentExamples, null, 2)}

IMPORTANT: Generate NEW examples based on the user's request below. Do not duplicate existing examples.

Your task: ${prompt}

Return examples in this exact JSON format:
[
  {
    "question": "Natural language question",
    "filters": [{"field": "exact_field_name", "operator": "equals|contains|greater_than|less_than", "value": "realistic_value"}],
    "explanation": "Brief explanation of what filters accomplish"
  }
]

CRITICAL RULES:
1. Use EXACT field names from the schema above (case-sensitive!)
2. Use realistic values that would exist in the data
3. Filter operators:
   - "equals" for exact matches (categories, IDs)
   - "contains" for partial text/date matches (e.g., "2024" in date field)
   - "greater_than" / "less_than" for numeric/date comparisons
4. For date ranges, use TWO filters (greater_than for start, less_than for end)
5. Keep questions practical and useful
6. Do NOT include "limit" unless the question is about "show me" or "list"
7. Explanations should be concise (one sentence)

Example of a GOOD query example:
{
  "question": "How many orders in Q1 2024?",
  "filters": [
    {"field": "Order Date", "operator": "greater_than", "value": "2024-01-01"},
    {"field": "Order Date", "operator": "less_than", "value": "2024-04-01"}
  ],
  "explanation": "Filter orders between Jan 1 and Apr 1, 2024, then count them"
}

Return ONLY the JSON array, no other text.`;

    const response = await aiAdapter.chat(prompt, {
      system_instruction: systemPrompt,
      require_json: true,
    });

    const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let examples;

    await logger.info(`[${requestId}] AI raw response`, { response: cleanResponse.substring(0, 500) });

    try {
      examples = JSON.parse(cleanResponse);
    } catch (parseError) {
      await logger.error(`[${requestId}] Failed to parse AI response`, { response: cleanResponse });
      return NextResponse.json(
        { error: 'AI returned invalid JSON' },
        { status: 500 }
      );
    }

    await logger.info(`[${requestId}] Parsed response type`, {
      type: typeof examples,
      isArray: Array.isArray(examples),
      keys: examples && typeof examples === 'object' ? Object.keys(examples) : []
    });

    // Handle both array and object with examples property (from JSON mode)
    if (Array.isArray(examples)) {
      await logger.info(`[${requestId}] Success - returning ${examples.length} examples`);
      return NextResponse.json({ examples });
    } else if (examples && Array.isArray(examples.examples)) {
      // JSON mode sometimes wraps the array in an object
      await logger.info(`[${requestId}] Success - found examples in .examples property (${examples.examples.length})`);
      return NextResponse.json({ examples: examples.examples });
    } else if (examples && typeof examples === 'object') {
      // Try to extract array from any property
      const keys = Object.keys(examples);
      for (const key of keys) {
        if (Array.isArray(examples[key])) {
          await logger.info(`[${requestId}] Success - found array in .${key} property (${examples[key].length})`);
          return NextResponse.json({ examples: examples[key] });
        }
      }
    }

    await logger.error(`[${requestId}] AI returned non-array`, { data: JSON.stringify(examples) });
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
