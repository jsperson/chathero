import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';
import { createDataAdapter } from '@/lib/adapters/adapter-factory';
import { QueryAnalyzer } from '@/lib/query-analyzer';
import { CodeValidator } from '@/lib/code-validator';
import { CodeExecutor } from '@/lib/code-executor';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const requestId = `chat-${Date.now()}`;

  try {
    const { message } = await request.json();

    await logger.chatQuery(requestId, 'REQUEST', { question: message });

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get selected datasets from cookie (comma-separated) or use default
    const cookies = request.cookies;
    const selectedDatasetsStr = cookies.get('selectedDatasets')?.value;

    let selectedDatasets: string[] | undefined;
    if (selectedDatasetsStr) {
      selectedDatasets = selectedDatasetsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    await logger.chatQuery(requestId, 'DATASETS', { selectedDatasets });

    // Load configurations (use first dataset for project config)
    const config = await loadConfig();
    const primaryDataset = selectedDatasets && selectedDatasets.length > 0
      ? selectedDatasets[0]
      : undefined;
    const projectConfig = await loadProjectConfig(primaryDataset);

    // Initialize data adapter with all selected datasets
    const dataAdapter = await createDataAdapter(config.dataSource, selectedDatasets);
    const rawData = await dataAdapter.getData();

    // Initialize AI adapter
    const aiAdapter = new OpenAIAdapter(config.ai, projectConfig, logger);

    // Load READMEs for all selected datasets
    const datasetReadmes: Record<string, string> = {};
    if (selectedDatasets && selectedDatasets.length > 0) {
      for (const datasetName of selectedDatasets) {
        try {
          const datasetConfig = await loadProjectConfig(datasetName);
          if (datasetConfig.readme) {
            datasetReadmes[datasetName] = datasetConfig.readme;
          }
        } catch (error) {
          // README is optional, continue without it
        }
      }
    }

    // PHASE 1: AI determines what data is needed
    await logger.chatQuery(requestId, 'PHASE_1_START', {
      totalRecords: rawData.length,
      model: config.ai.queryAnalyzerModel || config.ai.model
    });
    const queryAnalyzer = new QueryAnalyzer(aiAdapter, projectConfig);
    const queryAnalysis = await queryAnalyzer.analyze(message, rawData, datasetReadmes, config.ai.queryAnalyzerModel);
    await logger.chatQuery(requestId, 'PHASE_1_RESULT', queryAnalysis);

    // PHASE 1.5: Validate generated code if present
    let codeValidation = null;
    if (queryAnalysis.generatedCode) {
      await logger.chatQuery(requestId, 'PHASE_1.5_START', {
        codeLength: queryAnalysis.generatedCode.length,
        description: queryAnalysis.codeDescription
      });

      const codeValidator = new CodeValidator(aiAdapter);
      codeValidation = await codeValidator.validate(
        queryAnalysis.generatedCode,
        queryAnalysis.codeDescription || 'No description provided'
      );

      await logger.chatQuery(requestId, 'PHASE_1.5_RESULT', codeValidation);

      if (!codeValidation.approved) {
        await logger.chatQuery(requestId, 'PHASE_1.5_REJECTED', {
          reason: codeValidation.reason,
          risks: codeValidation.risks
        });
        // Continue without code execution
        queryAnalysis.generatedCode = undefined;
      }
    }

    // PHASE 2: Apply basic filters to get the requested data
    await logger.chatQuery(requestId, 'PHASE_2_START', { filtersToApply: queryAnalysis.filters?.length || 0 });
    let filteredData = rawData;

    if (queryAnalysis.filters && queryAnalysis.filters.length > 0) {
      queryAnalysis.filters.forEach(filter => {
        filteredData = filteredData.filter(record => {
          const value = record[filter.field];

          switch (filter.operator) {
            case 'equals':
              return value === filter.value;
            case 'contains':
              return value?.toString().toLowerCase().includes(filter.value.toLowerCase());
            case 'greater_than':
              return value > filter.value;
            case 'less_than':
              return value < filter.value;
            default:
              return true;
          }
        });
      });
    }

    // Apply limit if specified
    if (queryAnalysis.limit) {
      filteredData = filteredData.slice(0, queryAnalysis.limit);
    }

    // Apply field selection if specified (reduces token usage for Phase 3)
    if (queryAnalysis.fieldsToInclude && queryAnalysis.fieldsToInclude.length > 0) {
      const fieldsToKeep = queryAnalysis.fieldsToInclude;
      filteredData = filteredData.map(record => {
        const reduced: any = {};
        fieldsToKeep.forEach(field => {
          if (field in record) {
            reduced[field] = record[field];
          }
        });
        return reduced;
      });

      await logger.chatQuery(requestId, 'PHASE_2_FIELD_SELECTION', {
        originalFields: Object.keys(rawData[0] || {}).length,
        selectedFields: fieldsToKeep.length,
        fields: fieldsToKeep
      });
    }

    // Execute approved code if present
    let processedData = filteredData;
    if (queryAnalysis.generatedCode && codeValidation?.approved) {
      await logger.chatQuery(requestId, 'PHASE_2_CODE_EXECUTION_START', {
        dataRecords: filteredData.length
      });

      const executor = new CodeExecutor();
      const executionResult = await executor.execute(queryAnalysis.generatedCode, filteredData);

      if (executionResult.success) {
        processedData = executionResult.result;
        await logger.chatQuery(requestId, 'PHASE_2_CODE_EXECUTION_SUCCESS', {
          inputRecords: filteredData.length,
          outputRecords: Array.isArray(processedData) ? processedData.length : 1
        });
      } else {
        await logger.chatQuery(requestId, 'PHASE_2_CODE_EXECUTION_FAILED', {
          error: executionResult.error
        });
        // Fall back to unprocessed data
      }
    }

    await logger.chatQuery(requestId, 'PHASE_2_RESULT', {
      filteredRecords: processedData.length,
      originalRecords: rawData.length
    });

    const contextData = {
      data: processedData,
      total_records: Array.isArray(processedData) ? processedData.length : 1,
      data_explanation: queryAnalysis.codeDescription || queryAnalysis.explanation,
    };

    // Add metadata
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const metadata: any = {
      current_date: currentDate,
      query_analysis: queryAnalysis.explanation,
    };

    // Add dataset info if multiple datasets are selected
    if (selectedDatasets && selectedDatasets.length > 1) {
      metadata.datasets_queried = selectedDatasets;
      metadata.note = 'Data from multiple datasets combined. Use _dataset_source field to identify record origin.';
    }

    // PHASE 3: AI generates final response with processed data
    await logger.chatQuery(requestId, 'PHASE_3_START', {
      dataRecords: filteredData.length,
      datasets: metadata.datasets_queried
    });
    const response = await aiAdapter.chat(message, { ...contextData, ...metadata, requestId });

    await logger.chatQuery(requestId, 'PHASE_3_RESULT', {
      responseLength: response.length,
      response: response.substring(0, 500) // Log first 500 chars
    });

    await logger.chatQuery(requestId, 'COMPLETE', { success: true });

    return NextResponse.json({
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorDetails = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { error: String(error) };
    await logger.error(`Chat API error [${requestId}]`, errorDetails);
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}
