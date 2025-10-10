import OpenAI from 'openai';
import { AIAdapter, AIConfig } from './ai.adapter';
import { ProjectConfig } from '../config';

export class OpenAIAdapter implements AIAdapter {
  private client: OpenAI;
  private model: string;
  private projectConfig?: ProjectConfig;
  private logger?: any;

  constructor(config: AIConfig, projectConfig?: ProjectConfig, logger?: any) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model;
    this.projectConfig = projectConfig;
    this.logger = logger;
  }

  private async chatWithRetry(params: any, maxRetries = 3): Promise<any> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.client.chat.completions.create(params);
      } catch (error: any) {
        lastError = error;

        // Check if it's a rate limit error
        const isRateLimitError = error?.status === 429 ||
                                 error?.message?.toLowerCase().includes('rate limit') ||
                                 error?.message?.toLowerCase().includes('tokens per min');

        if (!isRateLimitError || attempt === maxRetries - 1) {
          // Not a rate limit error, or we're out of retries
          throw error;
        }

        // Exponential backoff: 2^attempt seconds (2s, 4s, 8s)
        const delaySeconds = Math.pow(2, attempt + 1);
        console.log(`Rate limit hit. Retrying in ${delaySeconds}s (attempt ${attempt + 1}/${maxRetries})...`);

        if (this.logger) {
          await this.logger.info('OpenAI rate limit - retrying', {
            attempt: attempt + 1,
            maxRetries,
            delaySeconds,
            error: error?.message
          });
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      }
    }

    throw lastError;
  }

  async chat(message: string, context: any): Promise<string> {
    try {
      const currentDate = context.current_date || new Date().toISOString();

      // Check if this is a JSON analysis request
      const isJsonMode = context.system_instruction && context.require_json;

      if (isJsonMode) {
        // Query analysis mode - return structured JSON
        // Use the model specified in context, or fall back to default
        const modelToUse = context.model || this.model;

        const completion = await this.chatWithRetry({
          model: modelToUse,
          messages: [
            { role: 'system', content: context.system_instruction },
            { role: 'user', content: message }
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 1000,
        });

        const response = completion.choices[0]?.message?.content;
        return response || '{}';
      }

      // Normal chat mode
      // Use project-specific system role or default
      const systemRole = this.projectConfig?.aiContext.systemRole ||
        'You are a helpful assistant that answers questions about the provided data.';

      const domainContext = this.projectConfig?.aiContext.domainContext ?
        `\n\n${this.projectConfig.aiContext.domainContext}` : '';

      // Check if multiple datasets are being queried
      const multiDatasetInstructions = context.datasets_queried && context.datasets_queried.length > 1
        ? `\n\n📊 MULTI-DATASET ANALYSIS:
You are analyzing data from ${context.datasets_queried.length} different datasets: ${context.datasets_queried.join(', ')}.
Each record has a '_dataset_source' field showing which dataset it came from.

For cross-dataset queries:
- You can correlate records by comparing field values (e.g., dates, names, IDs)
- When counting, grouping, or aggregating, consider which dataset each record belongs to
- For temporal correlations, compare date fields across datasets
- Present results clearly showing which dataset each statistic refers to

⚠️ ANSWER FORMAT - CRITICAL:
For counting/aggregation queries, present ONLY the summary statistics:
- DO NOT list individual records unless specifically asked
- DO NOT show example records or dates unless they're in the processed data
- BE CONCISE: Show only the final answer (counts, totals, summaries)

Example: "How many launches within 1 month of inaugurations?"
✅ CORRECT: "3 presidents had launches within 1 month of their inaugurations: Biden (10), Trump (2), Obama (1). Total: 13 launches."
❌ WRONG: Listing individual launch dates, mission names, or details not requested

For verification, you MAY include context IF it's in the data:
✅ OK: "Biden (inaugurated Jan 20, 2021, window Dec 20, 2020 - Feb 20, 2021): 10 launches"
❌ WRONG: Making up example dates like "including the March 2022 Starlink mission"

CRITICAL: You are working with a LARGE dataset (${context.total_records} records). Your response MUST be extremely concise.

IMPORTANT FILTERING AND CONCISENESS RULES:
- ALWAYS honor user's filtering requests (e.g., "leave off zeros", "exclude X", "only show Y")
- By default, when aggregating or counting, ONLY show non-zero results unless explicitly asked to show all
- Be EXTREMELY concise - for lists, ONLY show relevant items (skip zeros/empty results)
- Use compact table format with NO explanatory text for large result sets
- DO NOT list items with zero counts - this wastes your limited output space`
        : '';

      const systemPrompt = `${systemRole}

Current date: ${currentDate}${domainContext}${multiDatasetInstructions}

Data:
${JSON.stringify(context.data, null, 2)}

Total records: ${context.total_records}
${context.data_explanation ? `Data context: ${context.data_explanation}` : ''}

⚠️ DATA VERIFICATION - CRITICAL:
The data you receive has been processed by Python code. ONLY present information that is DIRECTLY in the data.
- DO NOT add, infer, or extrapolate dates, counts, or values not present in the data
- DO NOT include examples or hypotheticals that aren't in the actual data
- If showing dates, ONLY show dates that appear in the data records
- If showing counts, ONLY show counts from the data
- If data seems incomplete or suspicious (e.g., dates outside expected range), mention this concern

Example: If data shows {'name': 'Biden', 'inauguration_date': '2021-01-20', 'mission_count': 10}
✅ CORRECT: "Biden (inaugurated 2021-01-20): 10 missions"
❌ WRONG: Adding "including a 2022 mission to..." (2022 not in the data!)

Answer the user's question based on this data. Perform any necessary counting, grouping, filtering, or correlation yourself. Be concise and accurate. When discussing dates, remember that today is ${currentDate}.`;

      // Build messages array with conversation history
      const messages: any[] = [{ role: 'system', content: systemPrompt }];

      // Add conversation history (limit to last 10 messages to avoid token overflow)
      const conversationHistory = context.conversationHistory || [];
      const recentHistory = conversationHistory.slice(-10);
      messages.push(...recentHistory);

      // Add current message
      messages.push({ role: 'user', content: message });

      const completion = await this.chatWithRetry({
        model: this.model,
        messages,
        max_tokens: 16384, // Maximum for gpt-4o-mini
      });

      const response = completion.choices[0]?.message?.content;
      const finishReason = completion.choices[0]?.finish_reason;

      const completionDetails = {
        finishReason,
        responseLength: response?.length,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens
      };

      console.log('OpenAI completion details:', completionDetails);

      if (this.logger && context.requestId) {
        await this.logger.info(`OpenAI completion [${context.requestId}]`, completionDetails);
      }

      return response || 'No response generated';
    } catch (error) {
      console.error('OpenAI API error:', error);

      // Log detailed error information
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }

      // Re-throw the original error with more context
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get AI response: ${errorMessage}`);
    }
  }
}
