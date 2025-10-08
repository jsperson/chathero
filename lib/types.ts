// Shared TypeScript type definitions

export interface DataRecord {
  [key: string]: any;
  _dataset_source?: string;
}

export interface Dataset {
  name: string;
  displayName: string;
  recordCount: number;
  description: string;
  hasProjectConfig: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface PythonExecutionResult {
  success: boolean;
  result?: any[];
  error?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export interface CodeValidationResult {
  approved: boolean;
  reason: string;
  risks: string[];
}

export interface QueryFilter {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between';
  value: any;
}

export interface RetryContext {
  previousCode: string;
  error: string;
  attempt: number;
}
