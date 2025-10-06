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
      const multiDatasetWarning = context.datasets_queried && context.datasets_queried.length > 1
        ? `\n\n⚠️ CRITICAL: You are analyzing data from ${context.datasets_queried.length} DIFFERENT datasets combined together: ${context.datasets_queried.join(', ')}.
Each record in the data has a '_dataset_source' field that identifies which dataset it came from.
You MUST check the '_dataset_source' field to distinguish between datasets.
When counting or aggregating, always separate results by dataset or explicitly state you're counting across all datasets combined.`
        : '';

      const systemPrompt = `${systemRole}

Current date: ${currentDate}${domainContext}${multiDatasetWarning}

Data context:
${JSON.stringify(context, null, 2)}

Answer the user's question based on this data. Be concise and accurate. If the data doesn't contain relevant information, say so. When discussing dates, remember that today is ${currentDate}.`;

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
