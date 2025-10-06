// Safe code execution using Node's vm module with strict sandboxing

import vm from 'vm';

export interface CodeExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

export class CodeExecutor {
  /**
   * Execute validated code in a sandboxed environment
   * Note: This uses Node's vm module. While not perfectly secure, combined with
   * AI validation in Phase 1.5, it provides reasonable protection for our use case.
   */
  async execute(code: string, data: any[]): Promise<CodeExecutionResult> {
    try {
      // Create restricted sandbox context
      const sandbox = {
        data: JSON.parse(JSON.stringify(data)), // Deep clone to prevent mutation
        result: undefined as any,
        Math: Math,
        Date: Date,
        // No access to: require, process, global, etc.
      };

      // Wrap code to capture return value
      const wrappedCode = `
        result = (function() {
          ${code}
        })();
      `;

      // Execute with timeout
      const script = new vm.Script(wrappedCode);
      const context = vm.createContext(sandbox);

      // Run with 5 second timeout
      script.runInContext(context, {
        timeout: 5000,
        displayErrors: true,
      });

      return {
        success: true,
        result: sandbox.result,
      };
    } catch (error: any) {
      console.error('Code execution error:', error);
      return {
        success: false,
        error: error.message || 'Code execution failed',
      };
    }
  }
}
