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
      const systemPrompt = `You are a helpful assistant that answers questions about the provided data.

Data context:
${JSON.stringify(context, null, 2)}

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
}
