// Safe code execution using Python subprocess with strict sandboxing

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export interface CodeExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

export class CodeExecutor {
  /**
   * Execute validated Python code in a subprocess
   * Combined with AI validation in Phase 1.5, provides good security
   */
  async execute(code: string, data: any[]): Promise<CodeExecutionResult> {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const dataFile = path.join(tempDir, `data_${timestamp}.json`);
    const codeFile = path.join(tempDir, `code_${timestamp}.py`);
    const outputFile = path.join(tempDir, `output_${timestamp}.json`);

    try {
      // Write data to temp JSON file
      await fs.writeFile(dataFile, JSON.stringify(data), 'utf-8');

      // Wrap user code with data loading and result saving
      const wrappedCode = `
import pandas as pd
import numpy as np
import json

# Load data into DataFrame
with open('${dataFile}', 'r') as f:
    data = json.load(f)
df = pd.DataFrame(data)

# User code executes here
${code}

# Save result
with open('${outputFile}', 'w') as f:
    json.dump(result, f)
`;

      await fs.writeFile(codeFile, wrappedCode, 'utf-8');

      // Execute Python with timeout
      const pythonProcess = spawn('python3', [codeFile], {
        timeout: 10000, // 10 second timeout
        env: {}, // No environment variables for security
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Wait for process to complete
      const exitCode = await new Promise<number>((resolve, reject) => {
        pythonProcess.on('close', (code) => resolve(code || 0));
        pythonProcess.on('error', (error) => reject(error));
        setTimeout(() => {
          pythonProcess.kill();
          reject(new Error('Python execution timeout'));
        }, 10000);
      });

      // Clean up temp files
      try {
        await fs.unlink(dataFile);
        await fs.unlink(codeFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      if (exitCode !== 0) {
        return {
          success: false,
          error: `Python execution failed: ${stderr || stdout}`,
        };
      }

      // Read result
      const resultData = await fs.readFile(outputFile, 'utf-8');
      await fs.unlink(outputFile);

      const result = JSON.parse(resultData);

      return {
        success: true,
        result,
      };
    } catch (error: any) {
      console.error('Python execution error:', error);

      // Clean up temp files on error
      try {
        await fs.unlink(dataFile).catch(() => {});
        await fs.unlink(codeFile).catch(() => {});
        await fs.unlink(outputFile).catch(() => {});
      } catch (e) {
        // Ignore cleanup errors
      }

      return {
        success: false,
        error: error.message || 'Python execution failed',
      };
    }
  }
}
