import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadConfig } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dataset = searchParams.get('dataset');

    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset parameter required' },
        { status: 400 }
      );
    }

    const appConfig = await loadConfig();
    const datasetsPath = path.join(process.cwd(), appConfig.dataSource.datasetsPath);

    // Find dataset directory
    const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
    const typeFolders = typeEntries.filter(entry => entry.isDirectory());

    let datasetPath: string | null = null;

    for (const typeFolder of typeFolders) {
      const potentialPath = path.join(datasetsPath, typeFolder.name, dataset);
      try {
        await fs.access(potentialPath);
        datasetPath = potentialPath;
        break;
      } catch (e) {
        // Try next type folder
      }
    }

    if (!datasetPath) {
      return NextResponse.json(
        { error: `Dataset '${dataset}' not found` },
        { status: 404 }
      );
    }

    // Load README
    let readme = '';
    try {
      const readmePath = path.join(datasetPath, 'README.md');
      readme = await fs.readFile(readmePath, 'utf-8');
    } catch (e) {
      // README is optional
    }

    // Load queries.yaml for queryExamples and exampleQuestions
    let queryExamples: any[] = [];
    let exampleQuestions: string[] = [];
    try {
      const queriesPath = path.join(datasetPath, 'queries.yaml');
      const queriesContent = await fs.readFile(queriesPath, 'utf-8');
      const queriesConfig: any = yaml.load(queriesContent);
      queryExamples = queriesConfig.queryExamples || [];
      exampleQuestions = queriesConfig.exampleQuestions || [];
    } catch (e) {
      // queries.yaml might not exist
    }

    return NextResponse.json({
      readme,
      queryExamples,
      exampleQuestions,
    });
  } catch (error) {
    console.error('Error loading dataset config:', error);
    return NextResponse.json(
      { error: 'Failed to load dataset configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { dataset, readme, queryExamples, exampleQuestions, projectConfig, backup } = await request.json();

    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset parameter required' },
        { status: 400 }
      );
    }

    const appConfig = await loadConfig();
    const datasetsPath = path.join(process.cwd(), appConfig.dataSource.datasetsPath);

    // Find dataset directory
    const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
    const typeFolders = typeEntries.filter(entry => entry.isDirectory());

    let datasetPath: string | null = null;

    for (const typeFolder of typeFolders) {
      const potentialPath = path.join(datasetsPath, typeFolder.name, dataset);
      try {
        await fs.access(potentialPath);
        datasetPath = potentialPath;
        break;
      } catch (e) {
        // Try next type folder
      }
    }

    if (!datasetPath) {
      return NextResponse.json(
        { error: `Dataset '${dataset}' not found` },
        { status: 404 }
      );
    }

    // Save README
    if (readme !== undefined) {
      const readmePath = path.join(datasetPath, 'README.md');
      await fs.writeFile(readmePath, readme, 'utf-8');
    }

    // Save queries.yaml
    if (queryExamples !== undefined || exampleQuestions !== undefined) {
      const queriesPath = path.join(datasetPath, 'queries.yaml');

      // Create backup if requested and file exists
      if (backup) {
        try {
          const existingContent = await fs.readFile(queriesPath, 'utf-8');

          // Generate timestamp: YYYYMMDD_HHMMSS
          const now = new Date();
          const timestamp = now.getFullYear().toString() +
                          (now.getMonth() + 1).toString().padStart(2, '0') +
                          now.getDate().toString().padStart(2, '0') +
                          '_' +
                          now.getHours().toString().padStart(2, '0') +
                          now.getMinutes().toString().padStart(2, '0') +
                          now.getSeconds().toString().padStart(2, '0');

          const backupPath = path.join(datasetPath, `queries.yaml.${timestamp}`);
          await fs.writeFile(backupPath, existingContent, 'utf-8');
          console.log(`Backed up existing queries.yaml to queries.yaml.${timestamp} for dataset: ${dataset}`);
        } catch (e) {
          // No existing file to backup, that's OK
        }
      }

      let configToSave: any = {};

      // Load existing queries.yaml to preserve fields
      try {
        const existingContent = await fs.readFile(queriesPath, 'utf-8');
        configToSave = yaml.load(existingContent) || {};
      } catch (e) {
        // queries.yaml doesn't exist, will create new one
      }

      // Update with new values
      if (exampleQuestions !== undefined) {
        configToSave.exampleQuestions = exampleQuestions;
      }
      if (queryExamples !== undefined) {
        configToSave.queryExamples = queryExamples;
      }

      // Write back
      const yamlContent = yaml.dump(configToSave, {
        indent: 2,
        lineWidth: -1, // Don't wrap lines
      });
      await fs.writeFile(queriesPath, yamlContent, 'utf-8');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving dataset config:', error);
    return NextResponse.json(
      { error: 'Failed to save dataset configuration' },
      { status: 500 }
    );
  }
}
