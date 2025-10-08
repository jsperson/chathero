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

    adapterTests.push(await runTest('CSV Adapter - Load data', async () => {
      const config = await loadConfig();
      const adapter = await createDataAdapter(config.dataSource, 'global_connect');
      const data = await adapter.getData();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('CSV adapter returned no data');
      }
      return {
        recordCount: data.length,
        fields: Object.keys(data[0] || {}),
        sampleRecord: data[0]
      };
    }));

    adapterTests.push(await runTest('JSON Adapter - Load data', async () => {
      const config = await loadConfig();
      const adapter = await createDataAdapter(config.dataSource, 'spacex-launches');
      const data = await adapter.getData();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('JSON adapter returned no data');
      }
      return {
        recordCount: data.length,
        fields: Object.keys(data[0] || {}),
        sampleRecord: data[0]
      };
    }));

    results.push({ category: 'Data Adapters', tests: adapterTests });

    // Schema Discovery Tests
    const schemaTests: TestResult[] = [];

    schemaTests.push(await runTest('Auto-discover schema from CSV', async () => {
      const config = await loadProjectConfig('global_connect');
      if (!config.dataSchema.categoricalFields || config.dataSchema.categoricalFields.length === 0) {
        throw new Error('Schema discovery failed to find categorical fields');
      }
      if (!config.dataSchema.numericFields || config.dataSchema.numericFields.length === 0) {
        throw new Error('Schema discovery failed to find numeric fields');
      }
      return {
        categoricalFields: config.dataSchema.categoricalFields,
        numericFields: config.dataSchema.numericFields,
        dateFields: config.dataSchema.dateFields || []
      };
    }));

    schemaTests.push(await runTest('Auto-discover schema from JSON', async () => {
      const config = await loadProjectConfig('spacex-launches');
      if (!config.dataSchema.categoricalFields) {
        throw new Error('Schema discovery failed for JSON');
      }
      return {
        categoricalFields: config.dataSchema.categoricalFields,
        numericFields: config.dataSchema.numericFields || [],
        dateFields: config.dataSchema.dateFields || []
      };
    }));

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

    apiTests.push(await runTest('API - /api/config endpoint', async () => {
      const response = await fetch(`${request.nextUrl.origin}/api/config`, {
        headers: { 'Cookie': 'selectedDataset=spacex-launches' }
      });
      if (!response.ok) throw new Error('Config API failed');
      const data = await response.json();
      if (!data.project || !data.project.name) {
        throw new Error('Config API returned invalid data');
      }
      return {
        projectName: data.project.name,
        appName: data.app.name,
        themeColor: data.theme.primaryColor
      };
    }));

    apiTests.push(await runTest('API - /api/data endpoint', async () => {
      const response = await fetch(`${request.nextUrl.origin}/api/data?dataset=spacex-launches&limit=5`);
      if (!response.ok) throw new Error('Data API failed');
      const result = await response.json();
      if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
        throw new Error('Data API returned no data');
      }
      return {
        recordCount: result.data.length,
        totalRecords: result.total,
        fields: Object.keys(result.data[0] || {}),
        sampleRecord: result.data[0]
      };
    }));

    apiTests.push(await runTest('API - /api/chat endpoint (simple query)', async () => {
      const response = await fetch(`${request.nextUrl.origin}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'selectedDatasets=spacex-launches'
        },
        body: JSON.stringify({
          message: 'How many launches are in the dataset?',
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

    return NextResponse.json({
      success: summary.failed === 0,
      summary,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Test suite error:', error);
    return NextResponse.json(
      { error: 'Failed to run test suite', message: error.message },
      { status: 500 }
    );
  }
}
