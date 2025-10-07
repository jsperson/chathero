import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Get selected datasets from cookie (comma-separated) or use default
    const cookies = request.cookies;
    const selectedDatasetsStr = cookies.get('selectedDatasets')?.value;

    let selectedDatasets: string[] | undefined;
    if (selectedDatasetsStr) {
      selectedDatasets = selectedDatasetsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    const config = await loadConfig();
    const primaryDataset = selectedDatasets && selectedDatasets.length > 0
      ? selectedDatasets[0]
      : undefined;

    const projectConfig = await loadProjectConfig(primaryDataset);

    // Collect example questions from all selected datasets
    const allExampleQuestions: string[] = [];

    if (selectedDatasets && selectedDatasets.length > 0) {
      for (const datasetName of selectedDatasets) {
        try {
          const datasetConfig = await loadProjectConfig(datasetName);
          if (datasetConfig.exampleQuestions) {
            allExampleQuestions.push(...datasetConfig.exampleQuestions);
          }
        } catch (error) {
          // Skip if dataset config not found
        }
      }
    } else {
      // Fallback to primary dataset questions
      if (projectConfig.exampleQuestions) {
        allExampleQuestions.push(...projectConfig.exampleQuestions);
      }
    }

    // Add multi-dataset example questions if multiple datasets selected
    if (selectedDatasets && selectedDatasets.length > 1) {
      allExampleQuestions.push(
        `How do the ${selectedDatasets[0]} and ${selectedDatasets[1]} datasets relate?`,
        `Show me combined insights from all selected datasets`
      );
    }

    // Return only public config (exclude API keys)
    return NextResponse.json({
      app: config.app,
      theme: config.theme,
      project: {
        name: projectConfig.project.name,
        description: projectConfig.project.description,
        exampleQuestions: allExampleQuestions,
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
