// AI-powered code safety validator for Phase 1.5

import { AIAdapter } from './adapters/ai.adapter';

export interface CodeValidationResult {
  approved: boolean;
  reason: string;
  risks: string[];
}

export class CodeValidator {
  private aiAdapter: AIAdapter;

  constructor(aiAdapter: AIAdapter) {
    this.aiAdapter = aiAdapter;
  }

  /**
   * Validate generated code for safety before execution
   */
  async validate(code: string, description: string): Promise<CodeValidationResult> {
    const systemPrompt = `You are a code security validator. Your job is to review Python code for safety issues before execution.

CODE TO VALIDATE:
\`\`\`python
${code}
\`\`\`

CODE DESCRIPTION: ${description}

SAFETY REQUIREMENTS:
The code will be executed in a sandboxed Python environment with the following constraints:
- Input: "df" pandas DataFrame (read-only)
- Must create "result" variable containing a list of dictionaries
- Timeout: 10 seconds max execution
- No network access, no file I/O

ALLOWED OPERATIONS:
✅ pandas operations: df.filter(), df[condition], df.groupby(), df.merge(), etc.
✅ numpy operations: np.sum(), np.mean(), np.max(), etc.
✅ Date operations: pd.to_datetime(), pd.Timestamp()
✅ Basic Python: for loops, if/else, list comprehensions, dict operations
✅ Math operations: +, -, *, /, //, %, **
✅ Pandas methods: .iterrows(), .loc[], .iloc[], .copy(), .notna(), .isna()
✅ Imports: pandas (as pd), numpy (as np) ONLY

FORBIDDEN OPERATIONS (auto-reject if found):
❌ File I/O: open(), read(), write(), os.path, Path, etc.
❌ Network: requests, urllib, socket, http, etc.
❌ Process operations: os.system(), subprocess, exec(), eval()
❌ Dynamic code execution: eval(), exec(), compile(), __import__()
❌ Module loading beyond pandas/numpy: any other imports
❌ System access: os, sys (beyond basic operations), ctypes, etc.

Return JSON:
{
  "approved": true/false,
  "reason": "Brief explanation of approval/rejection",
  "risks": ["list", "of", "any", "security", "concerns"]
}

IMPORTANT: Be strict. If you're unsure about safety, reject it.`;

    try {
      const response = await this.aiAdapter.chat('Validate this code for safety', {
        system_instruction: systemPrompt,
        require_json: true,
      });

      const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const validation: CodeValidationResult = JSON.parse(cleanResponse);

      return validation;
    } catch (error) {
      console.error('Code validation error:', error);
      // Fail safe: reject if validation fails
      return {
        approved: false,
        reason: 'Validation process failed - rejecting for safety',
        risks: ['Validation error occurred'],
      };
    }
  }
}
