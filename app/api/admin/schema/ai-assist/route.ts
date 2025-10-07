import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';
import { createDataAdapter } from '@/lib/adapters/adapter-factory';

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

    // Load data for context - use correct adapter based on dataset type
    const dataAdapter = await createDataAdapter(config.dataSource as any, selectedDataset ? [selectedDataset] : undefined);
    const data = await dataAdapter.getData();

    // Load README if available
    let readmeContext = '';
    if (projectConfig.readme) {
      readmeContext = `\n\nDataset README (for additional context):\n${projectConfig.readme}`;
    }

    // Check if this is a keyword generation request
    const isKeywordRequest = prompt.toLowerCase().includes('keyword') || prompt.toLowerCase().includes('synonym');

    // Build AI prompt - use simpler format for keyword requests
    const systemPrompt = isKeywordRequest ?
      `You are a helpful assistant that generates keywords and synonyms for data fields.

Current fields:
${currentSchema.categoricalFields.map((f: any) => `- ${f.name}: ${f.displayName}`).join('\n')}
${currentSchema.numericFields.map((f: any) => `- ${f.name}: ${f.displayName}`).join('\n')}

Data sample (first 5 records):
${JSON.stringify(data.slice(0, 5), null, 2)}${readmeContext}

Generate comprehensive keywords for each field. Return ONLY a simple JSON object mapping field names to arrays of keywords.

Rules:
- Each keyword must be a simple string with NO apostrophes, quotes, or special punctuation
- Use only letters, numbers, spaces, hyphens, and underscores
- Include synonyms, variations, plural/singular forms
- Consider the dataset context and domain

Return format (EXACTLY like this, nothing else):
{
  "fieldKeywords": {
    "field_name": ["keyword1", "keyword2", "keyword3"],
    "other_field": ["keyword1", "keyword2"]
  }
}`
    :
      `You are a helpful assistant that helps users configure their data schema.

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

    // Parse AI response - strip markdown code fences
    const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let aiResult: any;
    try {
      aiResult = JSON.parse(cleanResponse);

      // If this was a keyword request and we got fieldKeywords, convert to updatedSchema format
      if (isKeywordRequest && aiResult.fieldKeywords) {
        // Build updatedSchema by updating keywords in current schema
        const updatedCategoricalFields = currentSchema.categoricalFields.map((field: any) => ({
          ...field,
          keywords: aiResult.fieldKeywords[field.name] || field.keywords,
        }));

        const updatedNumericFields = currentSchema.numericFields.map((field: any) => ({
          ...field,
          keywords: aiResult.fieldKeywords[field.name] || field.keywords,
        }));

        aiResult.updatedSchema = {
          project: currentSchema.project,
          categoricalFields: updatedCategoricalFields,
          numericFields: updatedNumericFields,
          dateFields: currentSchema.dateFields,
          primaryDateField: currentSchema.primaryDateField,
          exampleQuestions: currentSchema.exampleQuestions,
        };

        aiResult.suggestion = `Generated keywords for ${Object.keys(aiResult.fieldKeywords).length} fields`;
      }
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);

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
