// AI Adapter Interface
export interface AIAdapter {
  chat(message: string, context: any): Promise<string>;
}

export interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
}
