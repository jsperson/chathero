import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { createDataAdapter } from '@/lib/adapters/adapter-factory';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';
import { SchemaDiscovery } from '@/lib/schema-discovery';

export async function POST(request: NextRequest) {
  try {
    const { dataset } = await request.json();

    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset parameter required' },
        { status: 400 }
      );
    }

    const appConfig = await loadConfig();

    // Load the dataset
    const dataAdapter = await createDataAdapter(appConfig.dataSource, [dataset]);
    const data = await dataAdapter.getData();

    // Discover schema
    const schema = SchemaDiscovery.discover(data);

    // Initialize AI adapter with minimal project config
    const minimalProjectConfig = {
      project: {
        name: dataset,
        description: `Dataset with ${data.length} records`,
        domain: 'general data'
      },
      dataSchema: {
        primaryDateField: schema.dateFields[0] || '',
        categoricalFields: schema.categoricalFields.map(f => ({
          name: f,
          displayName: f,
          description: ''
        })),
        numericFields: schema.numericFields.map(f => ({
          name: f,
          displayName: f,
          unit: ''
        }))
      },
      domainKnowledge: {
        fieldKeywords: {}
      },
      exampleQuestions: [],
      aiContext: {
        systemRole: 'You are a data analysis assistant.',
        domainContext: ''
      }
    };

    const aiAdapter = new OpenAIAdapter(appConfig.ai, minimalProjectConfig as any);

    // Generate README
    const readmePrompt = `Based on this dataset schema, generate a concise README.md file (2-3 paragraphs):

Dataset: ${dataset}
Total Records: ${data.length}
Fields: ${schema.fields.map(f => `${f.name} (${f.type})`).join(', ')}

Sample data:
${JSON.stringify(data.slice(0, 3), null, 2)}

Write a README that:
1. Describes what this dataset contains
2. Lists the key fields and what they represent
3. Suggests potential use cases

Format as markdown.`;

    const readme = await aiAdapter.chat(readmePrompt, {
      data: [],
      total_records: 0,
      requestId: 'readme-gen'
    });

    // Generate query examples with filters
    const examplesPrompt = `Based on this dataset schema, suggest 5 interesting query examples with appropriate filters:

Dataset: ${dataset}
Total Records: ${data.length}
Categorical Fields: ${schema.categoricalFields.join(', ')}
Numeric Fields: ${schema.numericFields.join(', ')}
Date Fields: ${schema.dateFields.join(', ')}

Sample data:
${JSON.stringify(data.slice(0, 5), null, 2)}

For each question, provide:
1. A natural language question
2. Appropriate filters (if needed) with field name, operator (equals/contains/greater_than/less_than), and value
3. A brief explanation of what the query does

Return ONLY a JSON array of objects with this structure:
[
  {
    "question": "How many records in 2024?",
    "filters": [{"field": "date_field", "operator": "contains", "value": "2024"}],
    "explanation": "Filter to records from 2024 and count them"
  }
]

Include a mix of:
- Questions with filters (by category, date range, specific values)
- Questions without filters (totals, counts, aggregations)
- At least one question filtering by a categorical field
- At least one question filtering by date (if date fields exist)`;

    const examplesResponse = await aiAdapter.chat(examplesPrompt, {
      data: [],
      total_records: 0,
      requestId: 'examples-gen'
    });

    // Parse the query examples
    let queryExamples: any[] = [];
    try {
      // Extract JSON array from response
      const jsonMatch = examplesResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        queryExamples = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse query examples:', e);
      // Fallback: create simple examples without filters
      queryExamples = [
        { question: "How many records are there?", filters: [], explanation: "Count all records" },
        { question: "What are the main categories?", filters: [], explanation: "List unique values" }
      ];
    }

    // Extract just the questions for exampleQuestions field
    const exampleQuestions = queryExamples.map(ex => ex.question);

    // Generate full project config using auto-discovery
    const projectName = dataset
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const fullProjectConfig = SchemaDiscovery.generateProjectConfig(data, projectName);

    // Override the auto-generated example questions with AI-generated ones
    fullProjectConfig.exampleQuestions = exampleQuestions.slice(0, 5);
    fullProjectConfig.queryExamples = queryExamples;

    return NextResponse.json({
      readme,
      projectConfig: fullProjectConfig,
      queryExamples,
    });
  } catch (error) {
    console.error('Error generating config:', error);
    return NextResponse.json(
      { error: 'Failed to generate configuration' },
      { status: 500 }
    );
  }
}
