import OpenAI from 'openai';
import { AIAdapter, AIConfig } from './ai.adapter';
import { ProjectConfig } from '../config';

export class OpenAIAdapter implements AIAdapter {
  private client: OpenAI;
  private model: string;
  private projectConfig?: ProjectConfig;

  constructor(config: AIConfig, projectConfig?: ProjectConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model;
    this.projectConfig = projectConfig;
  }

  async chat(message: string, context: any): Promise<string> {
    try {
      const currentDate = context.current_date || new Date().toISOString().split('T')[0];

      // Check if this is a JSON analysis request
      const isJsonMode = context.system_instruction && context.require_json;

      if (isJsonMode) {
        // Query analysis mode - return structured JSON
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: context.system_instruction },
            { role: 'user', content: message }
          ],
          response_format: { type: 'json_object' },
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

Example: "How many launches by president?"
1. Identify presidents (where _dataset_source = "presidents")
2. Identify launches (where _dataset_source = "launches")
3. For each president, count launches where launch_date falls between presidential_start and presidential_end
4. Present: "President X: N launches, President Y: M launches..."`
        : '';

      const systemPrompt = `${systemRole}

Current date: ${currentDate}${domainContext}${multiDatasetInstructions}

Data:
${JSON.stringify(context.data, null, 2)}

Total records: ${context.total_records}
${context.data_explanation ? `Data context: ${context.data_explanation}` : ''}

Answer the user's question based on this data. Perform any necessary counting, grouping, filtering, or correlation yourself. Be concise and accurate. When discussing dates, remember that today is ${currentDate}.`;

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content;

      return response || 'No response generated';
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to get AI response');
    }
  }
}
