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
   * Pre-validation check to catch obvious false positives before AI validation
   */
  private preValidate(code: string): CodeValidationResult | null {
    // Check for forbidden operations
    const forbiddenPatterns = [
      /\bopen\s*\(/,
      /\bwrite\s*\(/,
      /\bread\s*\(/,
      /\bos\s*\.\s*system/,
      /\bsubprocess/,
      /\beval\s*\(/,
      /\bexec\s*\(/,
      /\b__import__\s*\(/,
      /\brequests\./,
      /\burllib\./,
      /\bsocket\./,
      /\bhttp\./,
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(code)) {
        return {
          approved: false,
          reason: `Forbidden operation detected: ${pattern.source}`,
          risks: ['Code contains potentially dangerous operations'],
        };
      }
    }

    // Check for imports beyond pandas/numpy
    const importPattern = /^import\s+(?!pandas|numpy)(\w+)/gm;
    const fromImportPattern = /^from\s+(?!pandas|numpy)(\w+)/gm;

    const illegalImport = importPattern.exec(code) || fromImportPattern.exec(code);
    if (illegalImport && illegalImport[1] !== 'pd' && illegalImport[1] !== 'np') {
      return {
        approved: false,
        reason: `Illegal import detected: ${illegalImport[1]}`,
        risks: ['Code imports modules beyond pandas/numpy'],
      };
    }

    // Code looks safe at first glance, continue to AI validation
    return null;
  }

  /**
   * Validate generated code for safety before execution
   */
  async validate(code: string, description: string): Promise<CodeValidationResult> {
    // Run pre-validation first
    const preValidationResult = this.preValidate(code);
    if (preValidationResult) {
      return preValidationResult;
    }

    const systemPrompt = `You are a code security validator. Your job is to review Python code for safety issues before execution.

CODE TO VALIDATE:
\`\`\`python
${code}
\`\`\`

CODE DESCRIPTION: ${description}

🔴 CRITICAL - READ CAREFULLY:
The code will be executed in a sandboxed Python environment with these PREDEFINED variables already initialized:
- **df**: pandas DataFrame (ALREADY DEFINED - contains the input data)
- **pd**: pandas module (ALREADY IMPORTED - available as 'pd')
- **np**: numpy module (ALREADY IMPORTED - available as 'np')
- **json**: json module (ALREADY IMPORTED)

⚠️ IMPORTANT: The code can use df, pd, np, and json directly without defining them. This is NORMAL and SAFE.
⚠️ DO NOT REJECT code just because it uses df, pd, np, or json without defining them first!

VALID CODE EXAMPLES (these should be APPROVED):
✅ Example 1: filtered = df[df['status'] == 'active'].copy()
✅ Example 2: result = df.groupby('category').size().to_dict()
✅ Example 3: df['date'] = pd.to_datetime(df['date'])
✅ Example 4: import pandas as pd\nresult = df.head().to_dict('records')

Note: Code may re-import pandas/numpy (e.g., "import pandas as pd") even though they're pre-imported. This is SAFE and should be APPROVED.

CONSTRAINTS:
- Timeout: 10 seconds max execution
- No network access, no file I/O

ALLOWED OPERATIONS:
✅ pandas operations: df.filter(), df[condition], df.groupby(), df.merge(), etc.
✅ numpy operations: np.sum(), np.mean(), np.max(), etc.
✅ Date operations: pd.to_datetime(), pd.Timestamp(), pd.DateOffset()
✅ Basic Python: for loops, if/else, list comprehensions, dict operations
✅ Math operations: +, -, *, /, //, %, **
✅ Pandas methods: .iterrows(), .loc[], .iloc[], .copy(), .notna(), .isna(), .mode(), .isoformat()
✅ Re-importing pandas/numpy (redundant but safe)

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

IMPORTANT: Only reject code that contains ACTUAL security risks from the forbidden list. Do NOT reject code just for using df, pd, np, or json.`;

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
