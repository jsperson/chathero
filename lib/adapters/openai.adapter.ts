import OpenAI from 'openai';
import { AIAdapter, AIConfig } from './ai.adapter';

export class OpenAIAdapter implements AIAdapter {
  private client: OpenAI;
  private model: string;

  constructor(config: AIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model;
  }

  async chat(message: string, context: any): Promise<string> {
    try {
      // Summarize context if it's too large (array with many items)
      let contextSummary = context;

      if (Array.isArray(context)) {
        const dataSize = JSON.stringify(context).length;

        // If data is too large (>800KB ~= 200K tokens), create a summary
        // gpt-5-mini has 272K token input limit, leaving room for prompt + response
        if (dataSize > 800000) {
          contextSummary = this.summarizeData(context);
        }
      }

      const systemPrompt = `You are a helpful assistant that answers questions about the provided data.

Data context:
${JSON.stringify(contextSummary, null, 2)}

Answer the user's question based on this data. Be concise and accurate. If the data doesn't contain relevant information, say so.`;

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_completion_tokens: 500,
      });

      return completion.choices[0]?.message?.content || 'No response generated';
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to get AI response');
    }
  }

  private summarizeData(data: any[]): any {
    // Create statistical summary for large datasets
    const summary: any = {
      total_records: data.length,
      sample_records: data.slice(0, 5), // First 5 records as examples
    };

    // Try to create useful aggregations
    if (data.length > 0) {
      const firstRecord = data[0];

      // Group by common fields
      const groupings: any = {};

      for (const key of Object.keys(firstRecord)) {
        const values = data.map(item => item[key]).filter(v => v != null);
        const uniqueValues = [...new Set(values)];

        // If field has categorical data (not too many unique values)
        if (uniqueValues.length < 100) {
          const counts: any = {};
          values.forEach(v => {
            counts[v] = (counts[v] || 0) + 1;
          });
          groupings[`${key}_distribution`] = counts;
        }

        // If field is numeric, calculate stats
        if (typeof values[0] === 'number') {
          const nums = values.filter(v => typeof v === 'number');
          if (nums.length > 0) {
            groupings[`${key}_stats`] = {
              min: Math.min(...nums),
              max: Math.max(...nums),
              avg: nums.reduce((a, b) => a + b, 0) / nums.length
            };
          }
        }
      }

      summary.aggregations = groupings;
    }

    return summary;
  }
}
