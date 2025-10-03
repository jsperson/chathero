import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
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

    // Write to config/project.yaml
    const configPath = path.join(process.cwd(), 'config', 'project.yaml');
    const yamlContent = yaml.dump(projectConfig, {
      indent: 2,
      lineWidth: 100,
    });

    await fs.writeFile(configPath, yamlContent, 'utf-8');

    return NextResponse.json({
      success: true,
      message: 'Configuration saved to config/project.yaml',
    });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}
