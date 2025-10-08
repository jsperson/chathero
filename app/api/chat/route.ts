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
    const { message, conversationHistory = [] } = await request.json();

    await logger.chatQuery(requestId, 'REQUEST', {
      question: message,
      historyLength: conversationHistory.length
    });

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

    let projectConfig;
    try {
      projectConfig = await loadProjectConfig(primaryDataset);
    } catch (error) {
      console.error('Failed to load project config:', error);
      await logger.error(`Failed to load project config for ${primaryDataset}`, { error: String(error) });
      return NextResponse.json(
        { error: 'Dataset configuration not found. Please configure this dataset first.' },
        { status: 500 }
      );
    }

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

    // Retry loop for code generation and execution
    const MAX_RETRIES = 2;
    let attempt = 0;
    let queryAnalysis: any;
    let codeValidation: any = null;
    let processedData: any;
    let executionError: string | null = null;
    let retryContext: { previousCode: string; error: string; attempt: number } | undefined;

    while (attempt < MAX_RETRIES) {
      attempt++;
      const isRetry = attempt > 1;

      // PHASE 1: AI determines what data is needed
      await logger.chatQuery(requestId, isRetry ? 'PHASE_1_RETRY' : 'PHASE_1_START', {
        totalRecords: rawData.length,
        model: config.ai.queryAnalyzerModel || config.ai.model,
        attempt,
        retrying: isRetry
      });

      const queryAnalyzer = new QueryAnalyzer(aiAdapter, projectConfig);
      queryAnalysis = await queryAnalyzer.analyze(message, rawData, datasetReadmes, config.ai.queryAnalyzerModel, retryContext, conversationHistory);
      await logger.chatQuery(requestId, 'PHASE_1_RESULT', { ...queryAnalysis, attempt });

      // PHASE 1.5: Validate generated code if present
      if (queryAnalysis.generatedCode) {
        await logger.chatQuery(requestId, 'PHASE_1.5_START', {
          codeLength: queryAnalysis.generatedCode.length,
          description: queryAnalysis.codeDescription,
          attempt
        });

        const codeValidator = new CodeValidator(aiAdapter);
        codeValidation = await codeValidator.validate(
          queryAnalysis.generatedCode,
          queryAnalysis.codeDescription || 'No description provided'
        );

        await logger.chatQuery(requestId, 'PHASE_1.5_RESULT', { ...codeValidation, attempt });

        if (!codeValidation.approved) {
          await logger.chatQuery(requestId, 'PHASE_1.5_REJECTED', {
            reason: codeValidation.reason,
            risks: codeValidation.risks,
            attempt
          });

          // If we have retries left, retry with validation error feedback
          if (attempt < MAX_RETRIES) {
            const validationError = `Code validation failed: ${codeValidation.reason}\nRisks identified: ${codeValidation.risks?.join(', ') || 'None'}`;
            retryContext = {
              previousCode: queryAnalysis.generatedCode,
              error: validationError,
              attempt: attempt + 1
            };
            await logger.chatQuery(requestId, 'PHASE_1.5_RETRY_TRIGGERED', {
              attempt: attempt + 1,
              maxRetries: MAX_RETRIES
            });
            // Continue to next iteration of retry loop
            continue;
          } else {
            // No more retries, continue without code execution
            await logger.chatQuery(requestId, 'PHASE_1.5_NO_MORE_RETRIES', {
              attempt
            });
            queryAnalysis.generatedCode = undefined;
          }
        }
      }

      // PHASE 2: Apply basic filters to get the requested data
      await logger.chatQuery(requestId, 'PHASE_2_START', { filtersToApply: queryAnalysis.filters?.length || 0, attempt });
      let filteredData = rawData;

      if (queryAnalysis.filters && queryAnalysis.filters.length > 0) {
        queryAnalysis.filters.forEach((filter: any) => {
          filteredData = filteredData.filter((record: any) => {
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
        let fieldsToKeep = queryAnalysis.fieldsToInclude;

        // Safety backstop: Enforce maximum field count to prevent token overflow
        // With 500 records, ~10 fields max = 50K tokens total (safe buffer under 30K TPM limit)
        const MAX_FIELDS = 10;
        let fieldLimitApplied = false;

        if (fieldsToKeep.length > MAX_FIELDS) {
          fieldLimitApplied = true;

          // Prioritize fields: _dataset_source, filter fields, then first fields in list
          const priorityFields: string[] = [];

          // 1. Always include _dataset_source if present
          if (fieldsToKeep.includes('_dataset_source')) {
            priorityFields.push('_dataset_source');
          }

          // 2. Include fields used in filters
          const filterFields = queryAnalysis.filters?.map((f: any) => f.field) || [];
          filterFields.forEach((field: string) => {
            if (fieldsToKeep.includes(field) && !priorityFields.includes(field)) {
              priorityFields.push(field);
            }
          });

          // 3. Fill remaining slots with fields from Phase 1 selection
          fieldsToKeep.forEach((field: string) => {
            if (priorityFields.length < MAX_FIELDS && !priorityFields.includes(field)) {
              priorityFields.push(field);
            }
          });

          await logger.chatQuery(requestId, 'PHASE_2_FIELD_LIMIT_APPLIED', {
            requestedFields: fieldsToKeep.length,
            maxAllowed: MAX_FIELDS,
            selectedFields: priorityFields
          });

          fieldsToKeep = priorityFields;
        }

        filteredData = filteredData.map((record: any) => {
          const reduced: any = {};
          fieldsToKeep.forEach((field: string) => {
            if (field in record) {
              reduced[field] = record[field];
            }
          });
          return reduced;
        });

        await logger.chatQuery(requestId, 'PHASE_2_FIELD_SELECTION', {
          originalFields: Object.keys(rawData[0] || {}).length,
          selectedFields: fieldsToKeep.length,
          fields: fieldsToKeep,
          fieldLimitApplied
        });
      }

      // Execute approved code if present
      processedData = filteredData;
      executionError = null;
      if (queryAnalysis.generatedCode && codeValidation?.approved) {
        await logger.chatQuery(requestId, 'PHASE_2_CODE_EXECUTION_START', {
          dataRecords: filteredData.length,
          attempt
        });

        const executor = new CodeExecutor(logger);
        const executionResult = await executor.execute(queryAnalysis.generatedCode, filteredData, requestId);

        if (executionResult.success) {
          processedData = executionResult.result;
          await logger.chatQuery(requestId, 'PHASE_2_CODE_EXECUTION_SUCCESS', {
            inputRecords: filteredData.length,
            outputRecords: Array.isArray(processedData) ? processedData.length : 1,
            attempt
          });
          // Success! Break out of retry loop
          break;
        } else {
          executionError = executionResult.error || 'Unknown error';
          await logger.chatQuery(requestId, 'PHASE_2_CODE_EXECUTION_FAILED', {
            error: executionError,
            attempt
          });

          // If we have retries left, set up retry context
          if (attempt < MAX_RETRIES) {
            retryContext = {
              previousCode: queryAnalysis.generatedCode,
              error: executionError,
              attempt: attempt + 1
            };
            // Continue to next iteration of retry loop
            continue;
          } else {
            // No more retries, fall back to unprocessed data
            processedData = filteredData;
            break;
          }
        }
      } else {
        // No code to execute, break out
        processedData = filteredData;
        break;
      }
    }

    await logger.chatQuery(requestId, 'PHASE_2_RESULT', {
      filteredRecords: Array.isArray(processedData) ? processedData.length : 1,
      originalRecords: rawData.length
    });

    // PHASE 2.5: Apply hard limit on records sent to Phase 3 to avoid token overflow
    // OpenAI has a 30,000 TPM limit. With ~8 tokens per record, we can safely send ~500 records max.
    const PHASE_3_MAX_RECORDS = 500;
    let dataForPhase3 = processedData;
    let samplingApplied = false;

    if (Array.isArray(processedData) && processedData.length > PHASE_3_MAX_RECORDS) {
      // For aggregate/count operations, take a representative sample
      dataForPhase3 = processedData.slice(0, PHASE_3_MAX_RECORDS);
      samplingApplied = true;

      await logger.chatQuery(requestId, 'PHASE_2.5_SAMPLING', {
        originalRecords: processedData.length,
        sampledRecords: dataForPhase3.length,
        reason: 'Token limit protection'
      });
    }

    const contextData = {
      data: dataForPhase3,
      total_records: Array.isArray(processedData) ? processedData.length : 1,
      data_explanation: queryAnalysis.codeDescription || queryAnalysis.explanation,
    };

    // Add sampling notice if applied
    if (samplingApplied && Array.isArray(processedData)) {
      contextData.data_explanation = `${contextData.data_explanation}\n\nNote: Showing first ${PHASE_3_MAX_RECORDS} of ${processedData.length} total records to avoid token limits. Use this sample to answer the question, but report the total count accurately.`;
    }

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
    // Add a small delay to help avoid rate limit issues when Phase 1 used many tokens
    if (rawData.length > 1000) {
      await logger.chatQuery(requestId, 'PHASE_3_RATE_LIMIT_DELAY', {
        delayMs: 1000,
        reason: 'Large dataset - avoiding TPM burst'
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await logger.chatQuery(requestId, 'PHASE_3_START', {
      dataRecords: dataForPhase3.length,
      totalRecords: processedData.length,
      samplingApplied,
      datasets: metadata.datasets_queried
    });
    const response = await aiAdapter.chat(message, { ...contextData, ...metadata, requestId, conversationHistory });

    await logger.chatQuery(requestId, 'PHASE_3_RESULT', {
      responseLength: response.length,
      response: response.substring(0, 500) // Log first 500 chars
    });

    await logger.chatQuery(requestId, 'COMPLETE', { success: true });

    // Return response with updated conversation history
    const updatedHistory = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    ];

    // Build phase details for UI
    const phaseDetails = {
      phase1: {
        filters: queryAnalysis.filters || [],
        fieldsToInclude: queryAnalysis.fieldsToInclude || [],
        generatedCode: queryAnalysis.generatedCode,
        codeDescription: queryAnalysis.codeDescription,
        explanation: queryAnalysis.explanation,
        limit: queryAnalysis.limit,
        attempts: attempt
      },
      phase1_5: codeValidation ? {
        approved: codeValidation.approved,
        reason: codeValidation.reason,
        risks: codeValidation.risks || [],
        attempts: attempt
      } : null,
      phase2: {
        inputRecords: rawData.length,
        outputRecords: Array.isArray(processedData) ? processedData.length : 1,
        filtersApplied: queryAnalysis.filters?.length || 0,
        codeExecuted: !!queryAnalysis.generatedCode && codeValidation?.approved,
        executionError: executionError,
        attempts: attempt
      },
      phase2_5: {
        recordsToPhase3: Array.isArray(dataForPhase3) ? dataForPhase3.length : 1,
        totalRecords: Array.isArray(processedData) ? processedData.length : 1,
        samplingApplied
      },
      phase3: {
        responseLength: response.length,
        datasets: selectedDatasets || [config.dataSource.defaultDataset]
      }
    };

    return NextResponse.json({
      response,
      conversationHistory: updatedHistory,
      timestamp: new Date().toISOString(),
      phaseDetails
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
