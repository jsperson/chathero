import { NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';

export async function GET() {
  try {
    const config = await loadConfig();
    const projectConfig = await loadProjectConfig();

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
