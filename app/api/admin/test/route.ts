import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { createDataAdapter } from '@/lib/adapters/adapter-factory';
import { CodeExecutor } from '@/lib/code-executor';

export const dynamic = 'force-dynamic';

interface TestResult {
  name: string;
  status: 'success' | 'failure' | 'skipped';
  message: string;
  duration: number;
  error?: string;
  result?: any;
}

interface TestSuite {
  category: string;
  tests: TestResult[];
}

async function runTest(name: string, testFn: () => Promise<any>): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await testFn();
    return {
      name,
      status: 'success',
      message: 'Test passed',
      duration: Date.now() - start,
      result: result
    };
  } catch (error: any) {
    return {
      name,
      status: 'failure',
      message: error.message || 'Test failed',
      duration: Date.now() - start,
      error: error.stack,
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const results: TestSuite[] = [];

    // Discover available datasets first
    const datasetsResponse = await fetch(`${request.nextUrl.origin}/api/datasets`);
    const datasetsData = await datasetsResponse.json();
    const availableDatasets = datasetsData.datasets || [];

    // Find first dataset of each type
    const csvDataset = availableDatasets.find((d: any) => d.type === 'csv');
    const jsonDataset = availableDatasets.find((d: any) => d.type === 'json');

    // Configuration Tests
    const configTests: TestResult[] = [];

    configTests.push(await runTest('Load app config', async () => {
      const config = await loadConfig();
      if (!config.app.name) throw new Error('App config missing name');
      return {
        appName: config.app.name,
        aiModel: config.ai.model,
        dataSourceType: config.dataSource.type
      };
    }));

    configTests.push(await runTest('Load default project config', async () => {
      const config = await loadProjectConfig();
      if (!config.dataSchema) throw new Error('Project config missing dataSchema');
      return {
        projectName: config.project.name,
        categoricalFields: config.dataSchema.categoricalFields?.length || 0,
        numericFields: config.dataSchema.numericFields?.length || 0,
        dateFields: config.dataSchema.dateFields?.length || 0
      };
    }));

    results.push({ category: 'Configuration', tests: configTests });

    // Data Adapter Tests
    const adapterTests: TestResult[] = [];

    if (csvDataset) {
      adapterTests.push(await runTest(`CSV Adapter - Load data (${csvDataset.name})`, async () => {
        const config = await loadConfig();
        const adapter = await createDataAdapter(config.dataSource, csvDataset.name);
        const data = await adapter.getData();
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('CSV adapter returned no data');
        }
        return {
          datasetName: csvDataset.name,
          recordCount: data.length,
          fields: Object.keys(data[0] || {}),
          sampleRecord: data[0]
        };
      }));
    } else {
      adapterTests.push({
        name: 'CSV Adapter - Load data',
        status: 'skipped',
        message: 'No CSV datasets available',
        duration: 0
      });
    }

    if (jsonDataset) {
      adapterTests.push(await runTest(`JSON Adapter - Load data (${jsonDataset.name})`, async () => {
        const config = await loadConfig();
        const adapter = await createDataAdapter(config.dataSource, jsonDataset.name);
        const data = await adapter.getData();
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('JSON adapter returned no data');
        }
        return {
          datasetName: jsonDataset.name,
          recordCount: data.length,
          fields: Object.keys(data[0] || {}),
          sampleRecord: data[0]
        };
      }));
    } else {
      adapterTests.push({
        name: 'JSON Adapter - Load data',
        status: 'skipped',
        message: 'No JSON datasets available',
        duration: 0
      });
    }

    results.push({ category: 'Data Adapters', tests: adapterTests });

    // Schema Discovery Tests
    const schemaTests: TestResult[] = [];

    if (csvDataset) {
      schemaTests.push(await runTest(`Auto-discover schema from CSV (${csvDataset.name})`, async () => {
        const config = await loadProjectConfig(csvDataset.name);
        if (!config.dataSchema.categoricalFields || config.dataSchema.categoricalFields.length === 0) {
          throw new Error('Schema discovery failed to find categorical fields');
        }
        if (!config.dataSchema.numericFields || config.dataSchema.numericFields.length === 0) {
          throw new Error('Schema discovery failed to find numeric fields');
        }
        return {
          datasetName: csvDataset.name,
          categoricalFields: config.dataSchema.categoricalFields,
          numericFields: config.dataSchema.numericFields,
          dateFields: config.dataSchema.dateFields || []
        };
      }));
    } else {
      schemaTests.push({
        name: 'Auto-discover schema from CSV',
        status: 'skipped',
        message: 'No CSV datasets available',
        duration: 0
      });
    }

    if (jsonDataset) {
      schemaTests.push(await runTest(`Auto-discover schema from JSON (${jsonDataset.name})`, async () => {
        const config = await loadProjectConfig(jsonDataset.name);
        if (!config.dataSchema.categoricalFields) {
          throw new Error('Schema discovery failed for JSON');
        }
        return {
          datasetName: jsonDataset.name,
          categoricalFields: config.dataSchema.categoricalFields,
          numericFields: config.dataSchema.numericFields || [],
          dateFields: config.dataSchema.dateFields || []
        };
      }));
    } else {
      schemaTests.push({
        name: 'Auto-discover schema from JSON',
        status: 'skipped',
        message: 'No JSON datasets available',
        duration: 0
      });
    }

    results.push({ category: 'Schema Discovery', tests: schemaTests });

    // Code Execution Tests
    const codeTests: TestResult[] = [];

    codeTests.push(await runTest('Python code execution - Simple calculation', async () => {
      const code = `
import pandas as pd
df = pd.DataFrame([{'value': 1}, {'value': 2}, {'value': 3}])
result = [{'sum': int(df['value'].sum())}]
`;
      const executor = new CodeExecutor();
      const execResult = await executor.execute(code, []);
      if (!execResult.success) {
        throw new Error(`Code execution failed: ${execResult.error}`);
      }
      if (!execResult.result || execResult.result[0].sum !== 6) {
        throw new Error('Code execution returned incorrect result');
      }
      return {
        result: execResult.result,
        expectedSum: 6,
        actualSum: execResult.result[0].sum
      };
    }));

    codeTests.push(await runTest('Python code execution - Data filtering', async () => {
      const code = `
import pandas as pd
df = pd.DataFrame([
  {'name': 'Alice', 'age': 30},
  {'name': 'Bob', 'age': 25},
  {'name': 'Charlie', 'age': 35}
])
result = df[df['age'] > 25].to_dict('records')
`;
      const executor = new CodeExecutor();
      const execResult = await executor.execute(code, []);
      if (!execResult.success) {
        throw new Error(`Code execution failed: ${execResult.error}`);
      }
      if (!execResult.result || execResult.result.length !== 2) {
        throw new Error('Code execution filtering failed');
      }
      return {
        filteredRecords: execResult.result,
        recordCount: execResult.result.length,
        names: execResult.result.map((r: any) => r.name)
      };
    }));

    results.push({ category: 'Code Execution', tests: codeTests });

    // API Integration Tests
    const apiTests: TestResult[] = [];

    apiTests.push(await runTest('API - /api/datasets endpoint', async () => {
      const response = await fetch(`${request.nextUrl.origin}/api/datasets`);
      if (!response.ok) throw new Error('Datasets API failed');
      const data = await response.json();
      if (!data.datasets || !Array.isArray(data.datasets)) {
        throw new Error('Datasets API returned invalid data');
      }
      return {
        datasetCount: data.datasets.length,
        datasets: data.datasets.map((d: any) => ({
          name: d.name,
          displayName: d.displayName,
          recordCount: d.recordCount
        }))
      };
    }));

    // Use any available dataset for config/data API tests
    const testDataset = jsonDataset || csvDataset;

    if (testDataset) {
      apiTests.push(await runTest(`API - /api/config endpoint (${testDataset.name})`, async () => {
        const response = await fetch(`${request.nextUrl.origin}/api/config`, {
          headers: { 'Cookie': `selectedDataset=${testDataset.name}` }
        });
        if (!response.ok) throw new Error('Config API failed');
        const data = await response.json();
        if (!data.project || !data.project.name) {
          throw new Error('Config API returned invalid data');
        }
        return {
          datasetName: testDataset.name,
          projectName: data.project.name,
          appName: data.app.name,
          themeColor: data.theme.primaryColor
        };
      }));

      apiTests.push(await runTest(`API - /api/data endpoint (${testDataset.name})`, async () => {
        const response = await fetch(`${request.nextUrl.origin}/api/data?dataset=${testDataset.name}&limit=5`);
        if (!response.ok) throw new Error('Data API failed');
        const result = await response.json();
        if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
          throw new Error('Data API returned no data');
        }
        return {
          datasetName: testDataset.name,
          recordCount: result.data.length,
          totalRecords: result.total,
          fields: Object.keys(result.data[0] || {}),
          sampleRecord: result.data[0]
        };
      }));

      apiTests.push(await runTest(`API - /api/chat endpoint (${testDataset.name})`, async () => {
        const response = await fetch(`${request.nextUrl.origin}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `selectedDatasets=${testDataset.name}`
          },
          body: JSON.stringify({
            message: 'How many records are in the dataset?',
            conversationHistory: []
          })
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Chat API failed: ${response.status} - ${errorText}`);
        }
        const result = await response.json();
        if (!result.response) {
          throw new Error('Chat API returned no response');
        }
        if (!result.conversationHistory || !Array.isArray(result.conversationHistory)) {
          throw new Error('Chat API returned invalid conversation history');
        }
        if (!result.phaseDetails) {
          throw new Error('Chat API returned no phase details');
        }
        // Check that we got a meaningful response (at least 10 characters)
        if (result.response.length < 10) {
          throw new Error('Chat API response too short');
        }
        return {
          datasetName: testDataset.name,
          response: result.response,
          responseLength: result.response.length,
          conversationLength: result.conversationHistory.length,
          phase1: {
            filtersApplied: result.phaseDetails.phase1.filters?.length || 0,
            fieldsSelected: result.phaseDetails.phase1.fieldsToInclude?.length || 0,
            codeGenerated: !!result.phaseDetails.phase1.generatedCode
          },
          phase2: {
            inputRecords: result.phaseDetails.phase2.inputRecords,
            outputRecords: result.phaseDetails.phase2.outputRecords,
            codeExecuted: result.phaseDetails.phase2.codeExecuted
          }
        };
      }));
    } else {
      apiTests.push({
        name: 'API - /api/config endpoint',
        status: 'skipped',
        message: 'No datasets available',
        duration: 0
      });
      apiTests.push({
        name: 'API - /api/data endpoint',
        status: 'skipped',
        message: 'No datasets available',
        duration: 0
      });
      apiTests.push({
        name: 'API - /api/chat endpoint',
        status: 'skipped',
        message: 'No datasets available',
        duration: 0
      });
    }

    results.push({ category: 'API Integration', tests: apiTests });

    // Calculate summary
    const summary = {
      total: results.reduce((acc, suite) => acc + suite.tests.length, 0),
      passed: results.reduce((acc, suite) =>
        acc + suite.tests.filter(t => t.status === 'success').length, 0),
      failed: results.reduce((acc, suite) =>
        acc + suite.tests.filter(t => t.status === 'failure').length, 0),
      duration: results.reduce((acc, suite) =>
        acc + suite.tests.reduce((sum, t) => sum + t.duration, 0), 0),
    };

    const response = NextResponse.json({
      success: summary.failed === 0,
      summary,
      results,
      timestamp: new Date().toISOString(),
    });

    // Prevent caching at all levels
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;

  } catch (error: any) {
    console.error('Test suite error:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to run test suite', message: error.message },
      { status: 500 }
    );

    // Prevent caching of errors too
    errorResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    errorResponse.headers.set('Pragma', 'no-cache');
    errorResponse.headers.set('Expires', '0');

    return errorResponse;
  }
}
