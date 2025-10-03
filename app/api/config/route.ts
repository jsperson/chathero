import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';

export async function GET() {
  try {
    const config = await loadConfig();

    // Return only public config (exclude API keys)
    return NextResponse.json({
      app: config.app,
      theme: config.theme,
    });
  } catch (error) {
    console.error('Config API error:', error);
    return NextResponse.json(
      { error: 'Failed to load configuration' },
      { status: 500 }
    );
  }
}
