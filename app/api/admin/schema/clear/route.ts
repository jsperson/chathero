import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { clearConfigCache, loadConfig } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    // Get selected dataset from cookie or use default
    const cookies = request.cookies;
    const selectedDataset = cookies.get('selectedDataset')?.value;

    const config = await loadConfig();
    const datasetName = selectedDataset || config.dataSource.defaultDataset;
    const configPath = path.join(process.cwd(), config.dataSource.datasetsPath, datasetName, 'project.yaml');

    // Check if file exists
    try {
      await fs.access(configPath);
      // File exists, delete it
      await fs.unlink(configPath);

      // Clear the config cache so auto-discovery takes over
      clearConfigCache();

      return NextResponse.json({
        success: true,
        message: 'Configuration cleared successfully',
      });
    } catch (error) {
      // File doesn't exist, nothing to clear
      return NextResponse.json({
        success: true,
        message: 'No configuration file to clear',
      });
    }
  } catch (error) {
    console.error('Clear error:', error);
    return NextResponse.json(
      { error: 'Failed to clear configuration' },
      { status: 500 }
    );
  }
}
