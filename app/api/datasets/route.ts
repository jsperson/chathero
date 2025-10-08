import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadConfig } from '@/lib/config';

export async function GET() {
  try {
    const config = await loadConfig();
    const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);

    // Scan all type folders (json, url, postgres, etc.)
    const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
    const typeFolders = typeEntries.filter(entry => entry.isDirectory());

    const allDatasets: any[] = [];

    // For each type folder, scan for datasets
    for (const typeFolder of typeFolders) {
      const type = typeFolder.name;
      const typePath = path.join(datasetsPath, type);

      const datasetEntries = await fs.readdir(typePath, { withFileTypes: true });
      const datasets = datasetEntries.filter(entry => entry.isDirectory());

      for (const dataset of datasets) {
        const datasetName = dataset.name;
        const datasetPath = path.join(typePath, datasetName);

        const jsonPath = path.join(datasetPath, 'data.json');
        const csvPath = path.join(datasetPath, 'data.csv');
        const readmePath = path.join(datasetPath, 'README.md');
        const metadataPath = path.join(datasetPath, 'metadata.yaml');
        const schemaPath = path.join(datasetPath, 'schema.yaml');
        const legacyProjectPath = path.join(datasetPath, 'project.yaml');

        let recordCount = 0;
        let description = '';
        let hasProject = false;
        let hasReadme = false;
        let displayName = datasetName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        // Try JSON first, then CSV
        try {
          const data = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
          recordCount = Array.isArray(data) ? data.length : 0;
        } catch (e) {
          // Try CSV
          try {
            const csvContent = await fs.readFile(csvPath, 'utf-8');
            const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
            recordCount = Math.max(0, lines.length - 1); // Subtract header row
          } catch (csvError) {
            // Couldn't read data file
          }
        }

        try {
          const readme = await fs.readFile(readmePath, 'utf-8');
          hasReadme = true;
          // Extract first line as description
          description = readme.split('\n').find(line => line.trim() && !line.startsWith('#'))?.trim() || '';
        } catch (e) {
          // No README
        }

        // Check for new structure (metadata.yaml + schema.yaml) or legacy project.yaml
        try {
          await fs.access(metadataPath);
          await fs.access(schemaPath);
          hasProject = true;
          // Try to load project name from metadata.yaml
          try {
            const metadataContent = await fs.readFile(metadataPath, 'utf-8');
            const metadataConfig = yaml.load(metadataContent) as any;
            if (metadataConfig?.project?.name) {
              displayName = metadataConfig.project.name;
            }
          } catch (e) {
            // Couldn't parse metadata.yaml, use default display name
          }
        } catch (e) {
          // Try legacy project.yaml
          try {
            await fs.access(legacyProjectPath);
            hasProject = true;
            // Try to load project name from project.yaml
            try {
              const projectContent = await fs.readFile(legacyProjectPath, 'utf-8');
              const projectConfig = yaml.load(projectContent) as any;
              if (projectConfig?.project?.name) {
                displayName = projectConfig.project.name;
              }
            } catch (e) {
              // Couldn't parse project.yaml, use default display name
            }
          } catch (legacyError) {
            // No config files
          }
        }

        allDatasets.push({
          name: datasetName,
          type: type,
          displayName: displayName,
          recordCount,
          description,
          hasProjectConfig: hasProject,
          hasReadme: hasReadme,
        });
      }
    }

    return NextResponse.json({
      datasets: allDatasets,
    });
  } catch (error) {
    console.error('Datasets API error:', error);
    return NextResponse.json(
      { error: 'Failed to list datasets' },
      { status: 500 }
    );
  }
}
