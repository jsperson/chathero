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

    // Split into metadata and schema
    const metadata = {
      project: {
        name: schemaConfig.project.name,
        description: schemaConfig.project.description,
        domain: schemaConfig.project.domain,
      },
      aiContext: {
        systemRole: `You are a helpful assistant that answers questions about ${schemaConfig.project.name} data.`,
        domainContext: `This dataset contains data in the ${schemaConfig.project.domain} domain. ${schemaConfig.project.description}`,
      },
    };

    const fieldKeywords: Record<string, string[]> = {};
    schemaConfig.categoricalFields.forEach((field: any) => {
      fieldKeywords[field.name] = field.keywords || [field.name];
    });

    const schema = {
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
        fieldKeywords,
      },
    };

    // Write to dataset-specific schema.yaml and metadata.yaml
    const config = await loadConfig();
    const datasetName = selectedDataset || config.dataSource.defaultDataset;
    const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);

    // Find dataset in type folders
    const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
    const typeFolders = typeEntries.filter(entry => entry.isDirectory());

    let datasetDir: string | null = null;
    for (const typeFolder of typeFolders) {
      const potentialJsonPath = path.join(datasetsPath, typeFolder.name, datasetName, 'data.json');
      const potentialCsvPath = path.join(datasetsPath, typeFolder.name, datasetName, 'data.csv');

      try {
        await fs.access(potentialJsonPath);
        datasetDir = path.join(datasetsPath, typeFolder.name, datasetName);
        break;
      } catch (e) {
        try {
          await fs.access(potentialCsvPath);
          datasetDir = path.join(datasetsPath, typeFolder.name, datasetName);
          break;
        } catch (csvError) {
          // Try next type folder
        }
      }
    }

    if (!datasetDir) {
      throw new Error(`Dataset '${datasetName}' not found`);
    }

    // Write metadata.yaml
    const metadataPath = path.join(datasetDir, 'metadata.yaml');
    const metadataContent = yaml.dump(metadata, {
      indent: 2,
      lineWidth: 100,
    });
    await fs.writeFile(metadataPath, metadataContent, 'utf-8');

    // Write schema.yaml
    const schemaPath = path.join(datasetDir, 'schema.yaml');
    const schemaContent = yaml.dump(schema, {
      indent: 2,
      lineWidth: 100,
    });
    await fs.writeFile(schemaPath, schemaContent, 'utf-8');

    // Clear the config cache so the new config is loaded on next request
    clearConfigCache();

    return NextResponse.json({
      success: true,
      message: `Configuration saved to ${datasetName}/schema.yaml and metadata.yaml`,
    });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}
