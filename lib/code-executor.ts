// Safe code execution sandbox using isolated-vm

import ivm from 'isolated-vm';

export interface CodeExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

export class CodeExecutor {
  /**
   * Execute validated code in a sandboxed environment
   */
  async execute(code: string, data: any[]): Promise<CodeExecutionResult> {
    try {
      // Create isolated VM instance with memory and timeout limits
      const isolate = new ivm.Isolate({ memoryLimit: 128 }); // 128MB limit
      const context = await isolate.createContext();

      // Transfer data into the isolated context
      const jail = context.global;
      await jail.set('data', new ivm.ExternalCopy(data).copyInto());

      // Wrap the code to capture return value
      const wrappedCode = `
        (function() {
          ${code}
        })();
      `;

      // Compile and run the code with timeout
      const script = await isolate.compileScript(wrappedCode);
      const result = await script.run(context, { timeout: 5000 }); // 5 second timeout

      // Copy result out of isolated context
      const output = result?.copy ? result.copy() : result;

      return {
        success: true,
        result: output,
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
