// AI-powered query analyzer that determines how to process data
import { AIAdapter } from './adapters/ai.adapter';
import { ProjectConfig } from './config';
import { JoinStrategy } from './join-analyzer';

export interface QueryAnalysisResult {
  filters?: Array<{
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between';
    value: any;
  }>;
  limit?: number;
  fieldsToInclude?: string[];
  generatedCode?: string;
  codeDescription?: string;
  explanation: string;
}

export class QueryAnalyzer {
  private aiAdapter: AIAdapter;
  private projectConfig: ProjectConfig;

  constructor(aiAdapter: AIAdapter, projectConfig: ProjectConfig) {
    this.aiAdapter = aiAdapter;
    this.projectConfig = projectConfig;
  }

  /**
   * Analyze a user question using AI to determine how to process the data
   */
  async analyze(question: string, dataSample: any[], datasetReadmes?: Record<string, string>, modelOverride?: string): Promise<QueryAnalysisResult> {
    // Check if multiple datasets are present
    const hasMultipleDatasets = dataSample.length > 0 && dataSample.some(record => record._dataset_source);
    const uniqueDatasets = [...new Set(dataSample.map(r => r._dataset_source).filter(Boolean))];

    console.log('Query Analyzer - Multi-dataset detection:');
    console.log('  Has multiple datasets:', hasMultipleDatasets);
    console.log('  Sample data count:', dataSample.length);
    console.log('  Unique datasets:', uniqueDatasets);
    console.log('  First record has _dataset_source:', dataSample[0]?._dataset_source);

    const datasetInfo = hasMultipleDatasets
      ? `\nIMPORTANT: This data contains records from MULTIPLE datasets combined together.
Each record has a '_dataset_source' field indicating which dataset it came from.
Available datasets: ${uniqueDatasets.join(', ')}
You can filter by dataset using the '_dataset_source' field.

⚠️ MULTI-DATASET OPTIMIZATION:
With ${dataSample.length} total records from ${uniqueDatasets.length} datasets, Phase 3 will receive a LARGE amount of data.
If the user's question only needs data from ONE dataset, add a filter for _dataset_source to reduce data size.
If the user's question needs correlation between datasets (e.g., "launches by president"), return NO filters - Phase 3 needs all data.`
      : '';

    // Add README documentation for datasets if available
    const readmeInfo = datasetReadmes && Object.keys(datasetReadmes).length > 0
      ? `\n\nDataset Documentation:\n` + Object.entries(datasetReadmes)
          .map(([datasetName, readme]) => `\n### ${datasetName}\n${readme}`)
          .join('\n')
      : '';

    // Generate dynamic multi-dataset examples
    const multiDatasetExamples = hasMultipleDatasets && uniqueDatasets.length >= 1
      ? `
Multi-dataset examples (available datasets: ${uniqueDatasets.join(', ')}):
- "how many ${uniqueDatasets[0]}" → {"operation": "aggregate", "filters": [{"field": "_dataset_source", "operator": "equals", "value": "${uniqueDatasets[0]}"}], "calculations": [{"type": "count"}], "explanation": "Count records from ${uniqueDatasets[0]} dataset only"}
${uniqueDatasets.length >= 2 ? `- "show ${uniqueDatasets[1]}" → {"operation": "filter", "filters": [{"field": "_dataset_source", "operator": "equals", "value": "${uniqueDatasets[1]}"}], "limit": 50, "explanation": "Show records from ${uniqueDatasets[1]} dataset only"}` : ''}
- "compare datasets" → {"operation": "aggregate", "groupBy": [{"field": "_dataset_source"}], "calculations": [{"type": "count"}], "explanation": "Group by dataset to compare record counts"}

IMPORTANT: When the user mentions a specific dataset name (${uniqueDatasets.map(d => `"${d}"`).join(', ')}), you MUST add a filter for _dataset_source to isolate that dataset!`
      : '';

    const systemPrompt = `You are a data request analyzer. Your job is to determine what data filters are needed to answer the user's question.
${datasetInfo}${readmeInfo}

Dataset schema:
${JSON.stringify(this.projectConfig.dataSchema, null, 2)}

Available fields:
${this.projectConfig.dataSchema.categoricalFields.map(f => `- ${f.name}: ${f.description}`).join('\n')}
${this.projectConfig.dataSchema.numericFields?.map(f => `- ${f.name} (numeric): ${f.displayName}`).join('\n') || ''}
Primary date field: ${this.projectConfig.dataSchema.primaryDateField}
${hasMultipleDatasets ? '- _dataset_source (categorical): Source dataset name' : ''}

Sample data (first 3 records):
${JSON.stringify(dataSample.slice(0, 3), null, 2)}

Your task: Determine what filters (if any) should be applied to get the relevant data for answering the question.
You MUST also specify which fields are needed - this significantly reduces data size sent to Phase 3.

Return a JSON object:
{
  "filters": [{"field": "field_name", "operator": "equals|contains|greater_than|less_than", "value": "value"}],
  "limit": 100,
  "fieldsToInclude": ["field1", "field2"],
  "generatedCode": "optional JavaScript code for deterministic operations",
  "codeDescription": "optional description of what the code does",
  "explanation": "What data is needed and why"
}

CRITICAL: The "fieldsToInclude" field is REQUIRED in every response.

⚠️ TOKEN LIMIT WARNING: Each field increases token usage significantly!
- With 500 records × 21 fields = ~78K tokens (EXCEEDS 30K TPM LIMIT)
- With 500 records × 6 fields = ~20K tokens (safe)
- BE EXTREMELY SELECTIVE: Include ONLY the absolute minimum fields needed

FIELD SELECTION RULES - Include fields needed for BOTH processing AND displaying results:

1. **Fields needed to answer the question** (correlation/filtering):
   - Date fields for temporal correlation
   - Category fields for grouping/counting
   - Any fields used in WHERE conditions

2. **Fields needed to display the answer** (output):
   - Identifier fields that appear in the result (name, title, id)
   - Any fields the user specifically asks to see
   - Fields needed to label/describe the results

3. **Always include**:
   - "_dataset_source" if present (required for multi-dataset queries)
   - Key identifier fields (name, title, id) unless the query is a pure count

4. **Always exclude**:
   - Verbose text fields not needed (descriptions, long text, URLs)
   - Fields not mentioned and not needed for processing or output

5. **For conversational/explanatory questions** (e.g., "how did you figure this out?", "explain"):
   - Return ONLY 2-3 key identifier fields (id, name, _dataset_source)
   - These questions don't need actual data - just context for explanation
   - Maximum 3 fields for conversational queries

Example: "List launch count by president"
- Need for processing: presidential_start, presidential_end, launch_date, _dataset_source
- Need for output: name (to label each president in the result)
- Final: ["_dataset_source", "launch_date", "presidential_start", "presidential_end", "name"]

CODE GENERATION (Optional but recommended for complex operations):
When a query requires DETERMINISTIC operations that AIs struggle with, generate JavaScript code to perform the operation.

⚠️ CRITICAL: When generating code, you MUST include ALL fields referenced in the code in the "fieldsToInclude" array.
If your code accesses fields like "presidential_start", "presidential_end", "launch_date", etc., ALL of those fields must be in fieldsToInclude.
Otherwise Phase 2 will strip out those fields and your code will fail.

⚠️ WHEN YOU MUST GENERATE CODE (NOT OPTIONAL):

ALWAYS generate code for ANY of these operations:
- **Counting** - count, how many, number of, total records, etc.
- **Aggregation** - sum, average, min, max, total, etc.
- **Grouping** - by category, by year, by field, per X, etc.
- **Temporal correlation** - comparing dates across datasets
- **Cross-dataset operations** - joining, correlating, or combining data from multiple sources
- **Mathematical calculations** - any arithmetic beyond simple filtering

❌ NEVER rely on Phase 3 AI to perform counting, aggregation, or calculations
✅ ALWAYS generate deterministic code for these operations

Why: Phase 3 may receive only a sample of data (not full dataset), so it cannot
accurately count or calculate. Only generated code in Phase 2 has access to the
complete dataset for precise operations.

The ONLY queries that don't need code:
- Pure filtering/browsing: "show me records where X"
- Explaining/conversational: "how did you figure this out"

CODE REQUIREMENTS:
- Must be pure JavaScript (ES6+) with explicit RETURN statement
- Input: "data" array containing filtered records
- Output: Must RETURN an array of result objects
- Code will be auto-wrapped in function, so just write the logic with return
- Only use: filter(), map(), reduce(), basic comparisons, date operations
- NO external libraries, NO async operations, NO side effects, NO function declarations
- Keep code concise and readable

Format examples:
✅ CORRECT: const presidents = data.filter(...); return presidents.map(...);
✅ CORRECT: return data.filter(...).map(...).reduce(...);
❌ WRONG: const func = (data) => {...}  (function declaration)
❌ WRONG: (function() { return ...; })()  (IIFE - will be double-wrapped)

DATE HANDLING AND COMPARISON RULES:

⚠️ CRITICAL: Different datasets may use different date formats!
- Some use YYYY-MM-DD (e.g., "2021-01-20")
- Some use MM/DD/YYYY (e.g., "01/20/2021")
- Some use DD/MM/YYYY or other formats

ALWAYS normalize ALL dates to YYYY-MM-DD format before any comparisons:

Define this helper function at the start of your generated code:
  const normalizeDate = (dateStr) => {
    if (!dateStr) return null;
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(dateStr)) return dateStr;
    if (/^\\d{1,2}\\/\\d{1,2}\\/\\d{4}$/.test(dateStr)) {
      const [m, d, y] = dateStr.split('/');
      return \`\${y}-\${m.padStart(2,'0')}-\${d.padStart(2,'0')}\`;
    }
    return new Date(dateStr).toISOString().split('T')[0];
  };

Then use it on ALL date fields before comparison:
  const orderDate = normalizeDate(shipment['Order Date']);
  const startDate = normalizeDate(president.presidential_start);
  if (orderDate >= startDate && orderDate < endDate) { ... }

DATE RANGE COMPARISON RULES:
- ALWAYS use inclusive start (>=) and exclusive end (<) to avoid double-counting boundary dates
- Format: date >= start_date && date < end_date
- For current/open-ended ranges: date >= start_date && date < (end_date || '9999-12-31')
- NEVER use <= for end date comparisons - this causes overlaps at boundaries
- Example: If a term ends "2021-01-20", the next term starts "2021-01-20" - use < to prevent counting the same date twice

CODE EXAMPLE for temporal correlation:
{
  "generatedCode": "const normalizeDate = (d) => { if (!d) return null; if (/^\\\\d{4}-\\\\d{2}-\\\\d{2}$/.test(d)) return d; if (/^\\\\d{1,2}\\\\/\\\\d{1,2}\\\\/\\\\d{4}$/.test(d)) { const [m, day, y] = d.split('/'); return \\\`\\\${y}-\\\${m.padStart(2,'0')}-\\\${day.padStart(2,'0')}\\\`; } return new Date(d).toISOString().split('T')[0]; }; const presidents = data.filter(r => r._dataset_source === 'us-presidents'); const launches = data.filter(r => r._dataset_source === 'spacex-launches'); return presidents.map(p => ({ name: p.name, launch_count: launches.filter(l => normalizeDate(l.launch_date) >= normalizeDate(p.presidential_start) && normalizeDate(l.launch_date) < normalizeDate(p.presidential_end || '9999-12-31')).length })).filter(p => p.launch_count > 0);",
  "codeDescription": "Normalizes all dates to YYYY-MM-DD format, then correlates launches with presidential terms by comparing launch_date against presidential_start/end ranges (inclusive start, exclusive end), returns array of {name, launch_count} for presidents with >0 launches",
  "fieldsToInclude": ["_dataset_source", "name", "launch_date", "presidential_start", "presidential_end"]
}

IMPORTANT RULES:
- Do NOT add a limit for counting, aggregation, or "how many" queries - these need ALL records to count accurately
- Only use limit for browsing/listing queries like "show me", "list", "display"
- For questions like "how many X", "count of X", "total X", "X by year/category" - omit the limit field or set it very high

Examples:
- "How many records?" → {"filters": [], "fieldsToInclude": ["id", "_dataset_source"], "explanation": "Need all records for counting, only ID field needed"}
- "Show recent records" → {"filters": [], "limit": 100, "fieldsToInclude": ["id", "name", "date", "status"], "explanation": "Show recent records with display fields"}
- "Count by category" → {"filters": [], "fieldsToInclude": ["category", "_dataset_source"], "explanation": "Need category field for grouping"}
${this.projectConfig.queryExamples && this.projectConfig.queryExamples.length > 0
  ? '\n' + this.projectConfig.queryExamples.map(ex =>
      `- "${ex.question}" → ${JSON.stringify({filters: ex.filters || [], limit: ex.limit, fieldsToInclude: ex.fieldsToInclude || ["id"], explanation: ex.explanation})}`
    ).join('\n')
  : ''}
${multiDatasetExamples ? '\n' + multiDatasetExamples : ''}

Important:
- Only filter to reduce data size or isolate specific records
- For cross-dataset analysis, return empty filters array to get all data
- Return ONLY valid JSON, no other text.`;

    try {
      const response = await this.aiAdapter.chat(question, {
        system_instruction: systemPrompt,
        require_json: true,
        model: modelOverride, // Use more capable model if provided
      });

      // Parse JSON response
      const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const analysis: QueryAnalysisResult = JSON.parse(cleanResponse);

      // Ensure fieldsToInclude is always present - if missing, extract all field names from sample
      if (!analysis.fieldsToInclude || analysis.fieldsToInclude.length === 0) {
        console.warn('Phase 1 did not specify fieldsToInclude - using all fields as fallback');
        const allFields = dataSample.length > 0 ? Object.keys(dataSample[0]) : [];
        analysis.fieldsToInclude = allFields;
      }

      // CRITICAL FIX: Ensure all fields used in filters are also in fieldsToInclude
      // Otherwise Phase 2 will filter data but then strip out the filter field, causing Phase 3 to fail
      if (analysis.filters && analysis.filters.length > 0) {
        const filterFields = analysis.filters.map(f => f.field);
        const missingFields = filterFields.filter(f => !analysis.fieldsToInclude.includes(f));

        if (missingFields.length > 0) {
          console.warn(`Phase 1 used filters on fields not in fieldsToInclude: ${missingFields.join(', ')}. Auto-adding them.`);
          analysis.fieldsToInclude.push(...missingFields);
        }
      }

      // Also ensure fields used in generated code are included
      if (analysis.generatedCode && analysis.fieldsToInclude) {
        // Extract field names from code (basic heuristic: look for r.fieldname or record.fieldname patterns)
        const codeFieldMatches = analysis.generatedCode.match(/[rp]\.\w+/g) || [];
        const codeFields = codeFieldMatches.map(m => m.split('.')[1]).filter(f => f && f !== 'length' && f !== 'filter' && f !== 'map');
        const uniqueCodeFields = [...new Set(codeFields)];
        const missingCodeFields = uniqueCodeFields.filter(f => !analysis.fieldsToInclude.includes(f));

        if (missingCodeFields.length > 0) {
          console.warn(`Phase 1 generated code uses fields not in fieldsToInclude: ${missingCodeFields.join(', ')}. Auto-adding them.`);
          analysis.fieldsToInclude.push(...missingCodeFields);
        }
      }

      return analysis;
    } catch (error) {
      console.error('Query analysis error:', error);
      // Fallback: return all data
      return {
        filters: [],
        explanation: 'Fallback: returning all available data',
      };
    }
  }
}
