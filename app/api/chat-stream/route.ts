import { NextRequest } from 'next/server';
import { loadConfig, loadProjectConfig } from '@/lib/config';
import { OpenAIAdapter } from '@/lib/adapters/openai.adapter';
import { createDataAdapter } from '@/lib/adapters/adapter-factory';
import { QueryAnalyzer } from '@/lib/query-analyzer';
import { CodeValidator } from '@/lib/code-validator';
import { CodeExecutor } from '@/lib/code-executor';
import { logger } from '@/lib/logger';

// Helper to send SSE events
function sendEvent(controller: ReadableStreamDefaultController, event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(message));
}

export async function POST(request: NextRequest) {
  const requestId = `chat-${Date.now()}`;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const { message, conversationHistory = [] } = await request.json();

        await logger.chatQuery(requestId, 'REQUEST', {
          question: message,
          historyLength: conversationHistory.length
        });

        if (!message) {
          sendEvent(controller, 'error', { error: 'Message is required' });
          controller.close();
          return;
        }

        // Get selected datasets from cookie
        const cookies = request.cookies;
        const selectedDatasetsStr = cookies.get('selectedDatasets')?.value;
        let selectedDatasets: string[] | undefined;
        if (selectedDatasetsStr) {
          selectedDatasets = selectedDatasetsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }

        await logger.chatQuery(requestId, 'DATASETS', { selectedDatasets });

        // Load configurations
        const config = await loadConfig();
        const primaryDataset = selectedDatasets && selectedDatasets.length > 0 ? selectedDatasets[0] : undefined;

        let projectConfig;
        try {
          projectConfig = await loadProjectConfig(primaryDataset);
        } catch (error) {
          console.error('Failed to load project config:', error);
          await logger.error(`Failed to load project config for ${primaryDataset}`, { error: String(error) });
          sendEvent(controller, 'error', { error: 'Dataset configuration not found' });
          controller.close();
          return;
        }

        // Initialize adapters
        const dataAdapter = await createDataAdapter(config.dataSource, selectedDatasets);
        const rawData = await dataAdapter.getData();
        const aiAdapter = new OpenAIAdapter(config.ai, projectConfig, logger);

        // Load READMEs
        const datasetReadmes: Record<string, string> = {};
        if (selectedDatasets && selectedDatasets.length > 0) {
          for (const datasetName of selectedDatasets) {
            try {
              const datasetConfig = await loadProjectConfig(datasetName);
              if (datasetConfig.readme) {
                datasetReadmes[datasetName] = datasetConfig.readme;
              }
            } catch (error) {
              // README is optional
            }
          }
        }

        // Retry loop
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
          sendEvent(controller, 'phase', { id: 'phase1', status: 'active', attempt });

          await logger.chatQuery(requestId, isRetry ? 'PHASE_1_RETRY' : 'PHASE_1_START', {
            totalRecords: rawData.length,
            model: config.ai.queryAnalyzerModel || config.ai.model,
            attempt,
            retrying: isRetry
          });

          const queryAnalyzer = new QueryAnalyzer(aiAdapter, projectConfig);
          queryAnalysis = await queryAnalyzer.analyze(message, rawData, datasetReadmes, config.ai.queryAnalyzerModel, retryContext, conversationHistory);
          await logger.chatQuery(requestId, 'PHASE_1_RESULT', { ...queryAnalysis, attempt });

          sendEvent(controller, 'phase', { id: 'phase1', status: 'completed', attempt, data: queryAnalysis });

          // PHASE 1.5: Validate generated code if present
          if (queryAnalysis.generatedCode) {
            sendEvent(controller, 'phase', { id: 'phase1.5', status: 'active', attempt });

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
              queryAnalysis.generatedCode = undefined;
              sendEvent(controller, 'phase', { id: 'phase1.5', status: 'warning', attempt, data: codeValidation });
            } else {
              sendEvent(controller, 'phase', { id: 'phase1.5', status: 'completed', attempt, data: codeValidation });
            }
          } else {
            sendEvent(controller, 'phase', { id: 'phase1.5', status: 'completed', attempt, data: null });
          }

          // PHASE 2: Apply filters and execute code
          sendEvent(controller, 'phase', { id: 'phase2', status: 'active', attempt });

          await logger.chatQuery(requestId, 'PHASE_2_START', { filtersToApply: queryAnalysis.filters?.length || 0, attempt });
          let filteredData = rawData;

          if (queryAnalysis.filters && queryAnalysis.filters.length > 0) {
            queryAnalysis.filters.forEach((filter: any) => {
              filteredData = filteredData.filter((record: any) => {
                const value = record[filter.field];
                switch (filter.operator) {
                  case 'equals': return value === filter.value;
                  case 'contains': return value?.toString().toLowerCase().includes(filter.value.toLowerCase());
                  case 'greater_than': return value > filter.value;
                  case 'less_than': return value < filter.value;
                  default: return true;
                }
              });
            });
          }

          if (queryAnalysis.limit) {
            filteredData = filteredData.slice(0, queryAnalysis.limit);
          }

          // Field selection (same logic as original)
          if (queryAnalysis.fieldsToInclude && queryAnalysis.fieldsToInclude.length > 0) {
            let fieldsToKeep = queryAnalysis.fieldsToInclude;
            const MAX_FIELDS = 10;

            if (fieldsToKeep.length > MAX_FIELDS) {
              const priorityFields: string[] = [];
              if (fieldsToKeep.includes('_dataset_source')) {
                priorityFields.push('_dataset_source');
              }
              const filterFields = queryAnalysis.filters?.map((f: any) => f.field) || [];
              filterFields.forEach((field: string) => {
                if (fieldsToKeep.includes(field) && !priorityFields.includes(field)) {
                  priorityFields.push(field);
                }
              });
              fieldsToKeep.forEach(field => {
                if (priorityFields.length < MAX_FIELDS && !priorityFields.includes(field)) {
                  priorityFields.push(field);
                }
              });
              fieldsToKeep = priorityFields;
            }

            filteredData = filteredData.map(record => {
              const reduced: any = {};
              fieldsToKeep.forEach(field => {
                if (field in record) {
                  reduced[field] = record[field];
                }
              });
              return reduced;
            });
          }

          // Execute code if approved
          processedData = filteredData;
          executionError = null;

          if (queryAnalysis.generatedCode && codeValidation?.approved) {
            const executor = new CodeExecutor();
            const executionResult = await executor.execute(queryAnalysis.generatedCode, filteredData);

            if (executionResult.success) {
              processedData = executionResult.result;
              sendEvent(controller, 'phase', { id: 'phase2', status: 'completed', attempt });
              break;
            } else {
              executionError = executionResult.error || 'Unknown error';

              if (attempt < MAX_RETRIES) {
                retryContext = {
                  previousCode: queryAnalysis.generatedCode,
                  error: executionError,
                  attempt: attempt + 1
                };
                sendEvent(controller, 'phase', { id: 'phase2', status: 'warning', attempt, error: executionError });
                continue;
              } else {
                processedData = filteredData;
                sendEvent(controller, 'phase', { id: 'phase2', status: 'warning', attempt, error: executionError });
                break;
              }
            }
          } else {
            processedData = filteredData;
            sendEvent(controller, 'phase', { id: 'phase2', status: 'completed', attempt });
            break;
          }
        }

        // PHASE 2.5: Sampling
        sendEvent(controller, 'phase', { id: 'phase2.5', status: 'active' });

        const PHASE_3_MAX_RECORDS = 500;
        let dataForPhase3 = processedData;
        let samplingApplied = false;

        if (Array.isArray(processedData) && processedData.length > PHASE_3_MAX_RECORDS) {
          dataForPhase3 = processedData.slice(0, PHASE_3_MAX_RECORDS);
          samplingApplied = true;
        }

        sendEvent(controller, 'phase', { id: 'phase2.5', status: 'completed', samplingApplied });

        // PHASE 3: Generate response
        sendEvent(controller, 'phase', { id: 'phase3', status: 'active' });

        const contextData = {
          data: dataForPhase3,
          total_records: Array.isArray(processedData) ? processedData.length : 1,
          data_explanation: queryAnalysis.codeDescription || queryAnalysis.explanation,
        };

        if (samplingApplied && Array.isArray(processedData)) {
          contextData.data_explanation = `${contextData.data_explanation}\n\nNote: Showing first ${PHASE_3_MAX_RECORDS} of ${processedData.length} total records to avoid token limits.`;
        }

        const currentDate = new Date().toISOString().split('T')[0];
        const metadata: any = {
          current_date: currentDate,
          query_analysis: queryAnalysis.explanation,
        };

        if (selectedDatasets && selectedDatasets.length > 1) {
          metadata.datasets_queried = selectedDatasets;
          metadata.note = 'Data from multiple datasets combined. Use _dataset_source field to identify record origin.';
        }

        if (rawData.length > 1000) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const response = await aiAdapter.chat(message, { ...contextData, ...metadata, requestId, conversationHistory });

        sendEvent(controller, 'phase', { id: 'phase3', status: 'completed' });

        // Send final response
        const updatedHistory = [
          ...conversationHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: response }
        ];

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

        sendEvent(controller, 'complete', {
          response,
          conversationHistory: updatedHistory,
          timestamp: new Date().toISOString(),
          phaseDetails
        });

        controller.close();
      } catch (error) {
        console.error('Stream error:', error);
        const errorDetails = error instanceof Error ? { message: error.message } : { error: String(error) };
        sendEvent(controller, 'error', errorDetails);
        controller.close();
      }
    }
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
