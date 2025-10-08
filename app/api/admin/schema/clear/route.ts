import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { clearConfigCache, loadConfig } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    // Get selected dataset from cookie
    const cookies = request.cookies;
    const selectedDataset = cookies.get('selectedDataset')?.value;

    if (!selectedDataset) {
      return NextResponse.json(
        { error: 'No dataset selected. Please select a dataset first.' },
        { status: 400 }
      );
    }

    const config = await loadConfig();
    const datasetName = selectedDataset;
    const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);

    // Find dataset in type folders
    const typeEntries = await fs.readdir(datasetsPath, { withFileTypes: true });
    const typeFolders = typeEntries.filter(entry => entry.isDirectory());

    let datasetDir: string | null = null;
    for (const typeFolder of typeFolders) {
      const potentialDir = path.join(datasetsPath, typeFolder.name, datasetName);
      try {
        await fs.access(potentialDir);
        datasetDir = potentialDir;
        break;
      } catch (e) {
        // Try next type folder
      }
    }

    if (!datasetDir) {
      return NextResponse.json({
        success: true,
        message: 'Dataset not found',
      });
    }

    // Delete schema configuration files (both new and legacy structure)
    // Note: Does NOT delete README.md or queries.yaml (managed by config screen)
    const filesToDelete = [
      path.join(datasetDir, 'metadata.yaml'),
      path.join(datasetDir, 'schema.yaml'),
      path.join(datasetDir, 'project.yaml'), // Legacy file
    ];

    let deletedCount = 0;
    for (const filePath of filesToDelete) {
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        deletedCount++;
        console.log(`Deleted: ${filePath}`);
      } catch (e) {
        // File doesn't exist, skip
      }
    }

    // Clear the config cache so auto-discovery takes over
    clearConfigCache();

    return NextResponse.json({
      success: true,
      message: deletedCount > 0
        ? `Configuration cleared successfully (${deletedCount} files deleted)`
        : 'No configuration files to clear',
    });
  } catch (error) {
    console.error('Clear error:', error);
    return NextResponse.json(
      { error: 'Failed to clear configuration' },
      { status: 500 }
    );
  }
}
