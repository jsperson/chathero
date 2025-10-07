import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'app.yaml');
const ENV_PATH = path.join(process.cwd(), '.env');

// GET - Read current AI configuration
export async function GET() {
  try {
    // Read config/app.yaml
    const configFile = await fs.readFile(CONFIG_PATH, 'utf-8');
    const config: any = yaml.load(configFile);

    // Check if API key is set in environment
    const apiKeySet = !!process.env.OPENAI_API_KEY;

    return NextResponse.json({
      provider: config.ai?.provider || 'openai',
      model: config.ai?.model || 'gpt-4o-mini',
      queryAnalyzerModel: config.ai?.queryAnalyzerModel || '',
      apiKeySet,
    });
  } catch (error) {
    console.error('Failed to read AI config:', error);
    return NextResponse.json(
      { error: 'Failed to read configuration' },
      { status: 500 }
    );
  }
}

// POST - Update AI configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, model, queryAnalyzerModel, apiKey } = body;

    // Validate required fields
    if (!provider || !model) {
      return NextResponse.json(
        { error: 'Provider and model are required' },
        { status: 400 }
      );
    }

    // Read existing config
    const configFile = await fs.readFile(CONFIG_PATH, 'utf-8');
    const config: any = yaml.load(configFile);

    // Update AI section
    config.ai = {
      ...config.ai,
      provider,
      model,
    };

    // Add queryAnalyzerModel if provided
    if (queryAnalyzerModel) {
      config.ai.queryAnalyzerModel = queryAnalyzerModel;
    } else {
      // Remove it if empty
      delete config.ai.queryAnalyzerModel;
    }

    // Write updated config back to app.yaml
    const updatedYaml = yaml.dump(config, {
      indent: 2,
      lineWidth: -1, // Don't wrap lines
    });
    await fs.writeFile(CONFIG_PATH, updatedYaml, 'utf-8');

    // Update .env file if API key provided
    if (apiKey) {
      await updateEnvFile(apiKey);
    }

    return NextResponse.json({
      success: true,
      message: 'Configuration updated successfully',
    });
  } catch (error) {
    console.error('Failed to update AI config:', error);
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    );
  }
}

// Helper function to update .env file safely
async function updateEnvFile(apiKey: string) {
  try {
    let envContent = '';

    // Read existing .env if it exists
    try {
      envContent = await fs.readFile(ENV_PATH, 'utf-8');
    } catch (error) {
      // File doesn't exist, will create new one
    }

    // Parse existing env vars
    const envLines = envContent.split('\n');
    let apiKeyUpdated = false;

    // Update or add OPENAI_API_KEY
    const updatedLines = envLines.map(line => {
      if (line.startsWith('OPENAI_API_KEY=')) {
        apiKeyUpdated = true;
        return `OPENAI_API_KEY=${apiKey}`;
      }
      return line;
    });

    // If key wasn't found, add it
    if (!apiKeyUpdated) {
      updatedLines.push(`OPENAI_API_KEY=${apiKey}`);
    }

    // Write back to .env
    await fs.writeFile(ENV_PATH, updatedLines.join('\n'), 'utf-8');
  } catch (error) {
    console.error('Failed to update .env file:', error);
    throw new Error('Failed to update API key');
  }
}
