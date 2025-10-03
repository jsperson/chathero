import { NextRequest, NextResponse } from 'next/server';
import yaml from 'js-yaml';

export async function POST(request: NextRequest) {
  try {
    const schemaConfig = await request.json();

    // Transform UI schema format to project.yaml format
    const projectConfig = {
      project: {
        name: schemaConfig.project.name,
        description: schemaConfig.project.description,
        domain: schemaConfig.project.domain,
      },
      dataSchema: {
        primaryDateField: schemaConfig.primaryDateField || 'date',
        categoricalFields: schemaConfig.categoricalFields.map((field: any) => ({
          name: field.name,
          displayName: field.displayName,
          description: field.description,
        })),
        numericFields: schemaConfig.numericFields.map((field: any) => ({
          name: field.name,
          displayName: field.displayName,
          unit: field.unit || '',
        })),
      },
      domainKnowledge: {
        fieldKeywords: {} as Record<string, string[]>,
      },
      exampleQuestions: schemaConfig.exampleQuestions || [],
      aiContext: {
        systemRole: `You are a helpful assistant that answers questions about ${schemaConfig.project.name} data.`,
        domainContext: `This dataset contains data in the ${schemaConfig.project.domain} domain. ${schemaConfig.project.description}`,
      },
    };

    // Build field keywords
    schemaConfig.categoricalFields.forEach((field: any) => {
      projectConfig.domainKnowledge.fieldKeywords[field.name] = field.keywords || [field.name];
    });

    // Convert to YAML
    const yamlContent = yaml.dump(projectConfig, {
      indent: 2,
      lineWidth: 100,
    });

    return new NextResponse(yamlContent, {
      headers: {
        'Content-Type': 'text/yaml',
        'Content-Disposition': 'attachment; filename="project.yaml"',
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Failed to generate YAML' },
      { status: 500 }
    );
  }
}
