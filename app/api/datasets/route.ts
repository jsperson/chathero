import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { loadConfig } from '@/lib/config';

export async function GET() {
  try {
    const config = await loadConfig();
    const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);

    // Read all directories in the datasets folder
    const entries = await fs.readdir(datasetsPath, { withFileTypes: true });
    const datasets = entries
      .filter(entry => entry.isDirectory())
      .map(dir => dir.name);

    // Get metadata for each dataset
    const datasetsWithMeta = await Promise.all(
      datasets.map(async (datasetName) => {
        const dataPath = path.join(datasetsPath, datasetName, 'data.json');
        const readmePath = path.join(datasetsPath, datasetName, 'README.md');
        const projectPath = path.join(datasetsPath, datasetName, 'project.yaml');

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

        return {
          name: datasetName,
          displayName: datasetName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          recordCount,
          description,
          hasProjectConfig: hasProject,
        };
      })
    );

    return NextResponse.json({
      datasets: datasetsWithMeta,
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
