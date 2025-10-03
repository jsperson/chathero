import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get selected dataset from cookie or use default
    const cookies = request.cookies;
    const selectedDataset = cookies.get('selectedDataset')?.value;

    const config = await loadConfig();
    const projectConfig = await loadProjectConfig(selectedDataset);

    // Return only public config (exclude API keys)
    return NextResponse.json({
      app: config.app,
      theme: config.theme,
      project: {
        name: projectConfig.project.name,
        description: projectConfig.project.description,
        exampleQuestions: projectConfig.exampleQuestions,
      },
    });
  } catch (error) {
    console.error('Config API error:', error);
    return NextResponse.json(
      { error: 'Failed to load configuration' },
      { status: 500 }
    );
  }
}
