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

    // Load project.yaml for queryExamples
    let queryExamples: any[] = [];
    try {
      const projectPath = path.join(datasetPath, 'project.yaml');
      const projectContent = await fs.readFile(projectPath, 'utf-8');
      const projectConfig: any = yaml.load(projectContent);
      queryExamples = projectConfig.queryExamples || [];
    } catch (e) {
      // project.yaml might not exist
    }

    return NextResponse.json({
      readme,
      queryExamples,
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
    const { dataset, readme, queryExamples, projectConfig, backup } = await request.json();

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

    // Update project.yaml with full config or just queryExamples
    if (projectConfig || queryExamples !== undefined) {
      const projectPath = path.join(datasetPath, 'project.yaml');

      // Create backup if requested and file exists
      if (backup) {
        try {
          const existingContent = await fs.readFile(projectPath, 'utf-8');

          // Generate timestamp: YYYYMMDD_HHMMSS
          const now = new Date();
          const timestamp = now.getFullYear().toString() +
                          (now.getMonth() + 1).toString().padStart(2, '0') +
                          now.getDate().toString().padStart(2, '0') +
                          '_' +
                          now.getHours().toString().padStart(2, '0') +
                          now.getMinutes().toString().padStart(2, '0') +
                          now.getSeconds().toString().padStart(2, '0');

          const backupPath = path.join(datasetPath, `project.yaml.${timestamp}`);
          await fs.writeFile(backupPath, existingContent, 'utf-8');
          console.log(`Backed up existing project.yaml to project.yaml.${timestamp} for dataset: ${dataset}`);
        } catch (e) {
          // No existing file to backup, that's OK
        }
      }

      let configToSave: any = {};

      if (projectConfig) {
        // Full project config provided (from AI generation)
        configToSave = projectConfig;
      } else {
        // Only queryExamples provided (manual edit)
        try {
          const existingContent = await fs.readFile(projectPath, 'utf-8');
          configToSave = yaml.load(existingContent) || {};
        } catch (e) {
          // project.yaml doesn't exist, will create new one
        }
        configToSave.queryExamples = queryExamples;
      }

      // Write back
      const yamlContent = yaml.dump(configToSave, {
        indent: 2,
        lineWidth: -1, // Don't wrap lines
      });
      await fs.writeFile(projectPath, yamlContent, 'utf-8');
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
