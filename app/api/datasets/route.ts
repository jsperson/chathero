import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
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

        const dataPath = path.join(datasetPath, 'data.json');
        const readmePath = path.join(datasetPath, 'README.md');
        const projectPath = path.join(datasetPath, 'project.yaml');

        let recordCount = 0;
        let description = '';
        let hasProject = false;

        try {
          const data = JSON.parse(await fs.readFile(dataPath, 'utf-8'));
          recordCount = Array.isArray(data) ? data.length : 0;
        } catch (e) {
          // Couldn't read data file
        }

        try {
          const readme = await fs.readFile(readmePath, 'utf-8');
          // Extract first line as description
          description = readme.split('\n').find(line => line.trim() && !line.startsWith('#'))?.trim() || '';
        } catch (e) {
          // No README
        }

        try {
          await fs.access(projectPath);
          hasProject = true;
        } catch (e) {
          // No project.yaml
        }

        allDatasets.push({
          name: datasetName,
          type: type,
          displayName: datasetName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          recordCount,
          description,
          hasProjectConfig: hasProject,
        });
      }
    }

    return NextResponse.json({
      datasets: allDatasets,
      default: config.dataSource.defaultDataset,
    });
  } catch (error) {
    console.error('Datasets API error:', error);
    return NextResponse.json(
      { error: 'Failed to list datasets' },
      { status: 500 }
    );
  }
}
