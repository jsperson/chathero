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

    // Generate query examples
    const examplesPrompt = `Based on this dataset schema, suggest 5 interesting questions that can be answered with this data:

Dataset: ${dataset}
Total Records: ${data.length}
Categorical Fields: ${schema.categoricalFields.join(', ')}
Numeric Fields: ${schema.numericFields.join(', ')}
Date Fields: ${schema.dateFields.join(', ')}

Sample data:
${JSON.stringify(data.slice(0, 5), null, 2)}

Return ONLY a JSON array of question strings, nothing else. Example format:
["Question 1?", "Question 2?", "Question 3?", "Question 4?", "Question 5?"]`;

    const examplesResponse = await aiAdapter.chat(examplesPrompt, {
      data: [],
      total_records: 0,
      requestId: 'examples-gen'
    });

    // Parse the questions
    let exampleQuestions: string[] = [];
    try {
      // Extract JSON array from response
      const jsonMatch = examplesResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        exampleQuestions = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse example questions:', e);
      // Fallback: split by newlines and filter
      exampleQuestions = examplesResponse
        .split('\n')
        .filter(line => line.trim().length > 0 && line.includes('?'))
        .slice(0, 5);
    }

    // Create query examples with simple structure
    const queryExamples = exampleQuestions.map(question => ({
      question,
      explanation: 'Auto-generated example query'
    }));

    return NextResponse.json({
      readme,
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
