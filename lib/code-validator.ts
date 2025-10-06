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
    const systemPrompt = `You are a code security validator. Your job is to review JavaScript code for safety issues before execution.

CODE TO VALIDATE:
\`\`\`javascript
${code}
\`\`\`

CODE DESCRIPTION: ${description}

SAFETY REQUIREMENTS:
The code will be executed in a sandboxed environment with the following constraints:
- Input: "data" array (read-only)
- Must return an array or primitive value
- Timeout: 5 seconds max execution

ALLOWED OPERATIONS:
✅ Array methods: filter(), map(), reduce(), forEach(), find(), some(), every(), sort()
✅ Basic comparisons: ===, !==, <, >, <=, >=, &&, ||
✅ Date operations: new Date(), string comparisons with ISO dates
✅ Math operations: +, -, *, /, Math.*
✅ Ternary operators: condition ? a : b
✅ Object property access: obj.property, obj['property']
✅ Variable declarations: const, let

FORBIDDEN OPERATIONS (auto-reject if found):
❌ File system access: fs, require('fs'), readFile, writeFile, etc.
❌ Network access: fetch, XMLHttpRequest, http, https, net, etc.
❌ Process operations: process.exit, child_process, exec, spawn, etc.
❌ Dynamic code execution: eval(), Function(), setTimeout, setInterval
❌ Prototype manipulation: __proto__, Object.setPrototypeOf
❌ Global scope access: global, window, document, globalThis
❌ Module loading: require(), import(), module.exports
❌ Async operations: async, await, Promise (unless returning synchronously)

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
