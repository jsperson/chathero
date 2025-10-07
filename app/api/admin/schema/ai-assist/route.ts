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

    // Load README if available
    let readmeContext = '';
    if (projectConfig.readme) {
      readmeContext = `\n\nDataset README (for additional context):\n${projectConfig.readme}`;
    }

    // Build AI prompt
    const systemPrompt = `You are a helpful assistant that helps users configure their data schema.

Current schema configuration:
${JSON.stringify(currentSchema, null, 2)}

Data sample (first 5 records):
${JSON.stringify(data.slice(0, 5), null, 2)}${readmeContext}

The user is asking for help with their schema configuration. Based on their request:
1. Provide a helpful text response explaining your suggestions
2. If applicable, return an updated schema object

Guidelines:
- For field descriptions: be concise but informative (single line, no newlines)
- For keywords: include synonyms, plural/singular forms, common variations, abbreviations, related terms
  * Consider the dataset domain and README context when generating keywords
  * Think about how users might naturally refer to these fields in questions
  * Include both formal and informal terms (but NO apostrophes or quotes)
  * For date fields: include variations like "when", "date", temporal keywords
  * For categorical fields: include category-specific terms from the README
  * Each keyword must be a simple string - no punctuation except hyphens and underscores
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
- Escape special characters: \\\\ for backslash, \\" for quotes
- Do NOT include literal newlines within string values - use spaces instead
- Do NOT use line breaks in descriptions or keywords
- Keywords must be simple strings without quotes or special characters
- Keep all string values on a single line
- Test that your JSON is valid before returning

Example of CORRECT keyword format:
"keywords": ["name", "president name", "full name", "person"]

Example of INCORRECT (do not do this):
"keywords": ["name", "president's name", "full-name", "person\\nindividual"]

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

    // Use a more lenient model for schema generation (less strict JSON formatting)
    const response = await aiAdapter.chat(prompt, {
      system_instruction: systemPrompt,
      require_json: true,
      temperature: 0.3, // Slightly higher for more creative keywords but still consistent
    });

    // Parse AI response
    let cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Additional cleaning to fix common JSON issues
    // Remove trailing commas before closing braces/brackets
    cleanResponse = cleanResponse.replace(/,(\s*[}\]])/g, '$1');
    // Fix unescaped quotes in strings (naive approach - only handles simple cases)
    // This is risky but might help with the apostrophe issue

    let aiResult;
    try {
      aiResult = JSON.parse(cleanResponse);
      console.log('AI assist - Parsed result:', JSON.stringify(aiResult, null, 2));

      // Log what fields are in updatedSchema if present
      if (aiResult.updatedSchema) {
        console.log('AI assist - updatedSchema has categoricalFields:', !!aiResult.updatedSchema.categoricalFields);
        console.log('AI assist - updatedSchema has numericFields:', !!aiResult.updatedSchema.numericFields);
        if (aiResult.updatedSchema.categoricalFields && aiResult.updatedSchema.categoricalFields.length > 0) {
          console.log('AI assist - First categorical field:', JSON.stringify(aiResult.updatedSchema.categoricalFields[0], null, 2));
        }
      }
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('AI response length:', cleanResponse.length);

      // Show context around the error position
      if (parseError instanceof Error) {
        const match = parseError.message.match(/position (\d+)/);
        if (match) {
          const pos = parseInt(match[1]);
          const start = Math.max(0, pos - 100);
          const end = Math.min(cleanResponse.length, pos + 100);
          console.error('Context around error position:', cleanResponse.substring(start, end));
        }
      }

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
