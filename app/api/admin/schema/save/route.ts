import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { clearConfigCache, loadConfig } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    // Get selected dataset from cookie or use default
    const cookies = request.cookies;
    const selectedDataset = cookies.get('selectedDataset')?.value;

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

    // Write to dataset-specific project.yaml
    const config = await loadConfig();
    const datasetName = selectedDataset || config.dataSource.defaultDataset;
    const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);

    // Find dataset in type folders
    const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
    const typeFolders = typeEntries.filter(entry => entry.isDirectory());

    let configPath: string | null = null;
    for (const typeFolder of typeFolders) {
      const potentialPath = path.join(datasetsPath, typeFolder.name, datasetName, 'data.json');
      try {
        await fs.access(potentialPath);
        configPath = path.join(datasetsPath, typeFolder.name, datasetName, 'project.yaml');
        break;
      } catch (e) {
        // Try next type folder
      }
    }

    if (!configPath) {
      throw new Error(`Dataset '${datasetName}' not found`);
    }

    const yamlContent = yaml.dump(projectConfig, {
      indent: 2,
      lineWidth: 100,
    });

    await fs.writeFile(configPath, yamlContent, 'utf-8');

    // Clear the config cache so the new config is loaded on next request
    clearConfigCache();

    return NextResponse.json({
      success: true,
      message: `Configuration saved to ${datasetName}/project.yaml`,
    });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}
