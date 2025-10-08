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
  async analyze(question: string, dataSample: any[], datasetReadmes?: Record<string, string>, modelOverride?: string, retryContext?: { previousCode: string; error: string; attempt: number }, conversationHistory?: Array<{role: string; content: string}>): Promise<QueryAnalysisResult> {
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

    const retryInstructions = retryContext ? `
⚠️ RETRY ATTEMPT ${retryContext.attempt}/2

Your previous code FAILED with this error:
${retryContext.error}

Previous code that failed:
\`\`\`python
${retryContext.previousCode}
\`\`\`

Please generate CORRECTED code that fixes this error. Common fixes:
- Add pd.to_numeric() for numeric fields before math operations
- Add error handling for edge cases
- Check for null/NaN values before processing
- Ensure correct data types

IMPORTANT: Generate NEW, CORRECTED code. Do not repeat the same mistake!
` : '';

    const conversationContext = conversationHistory && conversationHistory.length > 0
      ? `\n\n⚠️ CONVERSATION HISTORY - CRITICAL FOR CONTEXT:\n${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n\n🔴 IMPORTANT: The current user question MUST be interpreted in the context of the conversation above.\n- The current question often modifies or builds upon the previous query\n- If previous messages discussed a specific metric or entity, the current question likely continues that topic\n- Phrases like "by X instead of Y" or "what about Z" are modifications to the previous query, not new queries\n- Always preserve the core intent (e.g., if asking about orders, keep it about orders even if changing grouping)\n\nExample patterns:\n  Previous: "How many X by Y?"\n  Current: "By Z instead of Y" → Same metric (X), different grouping (Z instead of Y)\n  \n  Previous: "Show me category A"\n  Current: "What about B?" → Switch from category A to category B, same type of query`
      : '';

    const systemPrompt = `You are a data request analyzer. Your job is to determine what data filters are needed to answer the user's question.
${retryInstructions}
${conversationContext}
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

Example: "List event count by person"
- Need for processing: person_start_date, person_end_date, event_date, _dataset_source
- Need for output: name (to label each person in the result)
- Final: ["_dataset_source", "event_date", "person_start_date", "person_end_date", "name"]

CODE GENERATION (Optional but recommended for complex operations):
When a query requires DETERMINISTIC operations that AIs struggle with, generate Python code to perform the operation.

⚠️ CRITICAL: When generating code, you MUST include ALL fields referenced in the code in the "fieldsToInclude" array.
If your code accesses fields like "start_date", "end_date", "event_date", etc., ALL of those fields must be in fieldsToInclude.
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
- Must be Python 3 code using pandas
- Input: "df" is a pandas DataFrame containing the filtered records
- Output: Must create "result" variable containing a list of dictionaries
- NEVER convert result to CSV, JSON strings, or other formats - always return list of dicts
- If user asks for CSV/JSON/etc format, ignore the format request in code - Phase 3 will handle formatting
- Available imports: pandas (as pd), numpy (as np)
- NO file I/O, NO network access, NO subprocess, NO imports beyond pandas/numpy
- Keep code concise and readable
- pandas automatically handles date parsing with pd.to_datetime()

Format example:
✅ CORRECT:
import pandas as pd
# Separate datasets
people = df[df['_dataset_source'] == 'dataset_a'].copy()
transactions = df[df['_dataset_source'] == 'dataset_b'].copy()

# Parse dates automatically
people['start_date'] = pd.to_datetime(people['start_date'])
people['end_date'] = pd.to_datetime(people['end_date'])
transactions['transaction_date'] = pd.to_datetime(transactions['transaction_date'])

# Count transactions per person
result = []
for _, p in people.iterrows():
    start = p['start_date']
    end = p['end_date'] if pd.notna(p['end_date']) else pd.Timestamp('2099-12-31')
    count = len(transactions[(transactions['transaction_date'] >= start) & (transactions['transaction_date'] < end)])
    if count > 0:
        result.append({'name': p['name'], 'transaction_count': count})

DATE HANDLING:
- Use pd.to_datetime() to parse dates - handles multiple formats automatically
- Dates become pandas Timestamp objects - easy to compare
- Use pd.notna() or pd.isna() to check for null dates
- Date comparisons: >= for inclusive start, < for exclusive end

DATE RANGE LOGIC - CRITICAL:
When correlating records across datasets using date ranges, be EXTREMELY careful with your logic:

Common pitfall: Filtering one dataset but applying it to the wrong variable
❌ WRONG:
people_filtered = df[df['_dataset_source'] == 'people']
events = df[df['_dataset_source'] == 'events']
df['event_date'] = pd.to_datetime(df['event_date'])  # Parsing on wrong DataFrame!
# Later using events will fail because events still has string dates

✅ CORRECT - Use .copy() and consistent naming:
people = df[df['_dataset_source'] == 'people'].copy()
events = df[df['_dataset_source'] == 'events'].copy()
events['event_date'] = pd.to_datetime(events['event_date'], errors='coerce')  # Parse on correct DF
people['start_date'] = pd.to_datetime(people['start_date'], errors='coerce')
# Now you can use these DataFrames safely

VERIFY YOUR LOGIC:
- Double-check that filtered DataFrames match the variable names you use later
- Ensure date parsing happens on the correct DataFrame (the one you'll actually use)
- When comparing dates, verify both sides are Timestamps (use pd.to_datetime)

⚠️ CRITICAL - JSON SERIALIZATION:
- Pandas Timestamp objects CANNOT be directly serialized to JSON
- ALWAYS convert Timestamps to strings before adding to result
- Use .isoformat() or str() to convert: date.isoformat() or str(date)
- For lists of dates: [d.isoformat() for d in date_list]
- Example: {'date': timestamp.isoformat(), 'name': 'John'}
- ❌ WRONG: {'date': timestamp} - will fail with "Object of type Timestamp is not JSON serializable"
- ✅ CORRECT: {'date': timestamp.isoformat()}

⚠️ RESULT COMPLETENESS:
When generating code that filters or correlates data, ensure the result includes ALL fields needed to verify correctness:
- If correlating by dates, include relevant date fields in the result (converted to strings with .isoformat())
- If filtering by criteria, include the filter field values in the result
- If grouping, include group identifier fields

Example for "events within X of person's tenure":
❌ WRONG: result.append({'name': p['name'], 'event_count': count})
✅ CORRECT: result.append({
    'name': p['name'],
    'tenure_start': p['start_date'].isoformat(),
    'event_count': count,
    'window_start': window_start.isoformat(),
    'window_end': window_end.isoformat()
})

This allows Phase 3 to show complete, verifiable answers with context instead of just counts.

NUMERIC FIELD HANDLING:
⚠️ CRITICAL: Numeric fields may contain mixed types (strings, floats, etc.) due to data quality issues!
- ALWAYS convert numeric fields to numeric type before math operations
- Use pd.to_numeric(df['field'], errors='coerce') to convert safely
- errors='coerce' converts invalid values to NaN instead of failing
- Example: df['Profit'] = pd.to_numeric(df['Profit'], errors='coerce')
- Do this BEFORE any sum(), mean(), groupby() operations on numeric fields

CODE EXAMPLE for temporal correlation:
{
  "generatedCode": "import pandas as pd\\ndf_copy = df.copy()\\npeople = df_copy[df_copy['_dataset_source'] == 'dataset_a']\\ntransactions = df_copy[df_copy['_dataset_source'] == 'dataset_b']\\npeople['start_date'] = pd.to_datetime(people['start_date'])\\npeople['end_date'] = pd.to_datetime(people['end_date'])\\ntransactions['transaction_date'] = pd.to_datetime(transactions['transaction_date'])\\nresult = []\\nfor _, p in people.iterrows():\\n    start = p['start_date']\\n    end = p['end_date'] if pd.notna(p['end_date']) else pd.Timestamp('2099-12-31')\\n    count = len(transactions[(transactions['transaction_date'] >= start) & (transactions['transaction_date'] < end)])\\n    if count > 0:\\n        result.append({'name': p['name'], 'transaction_count': count})",
  "codeDescription": "Uses pandas to parse dates and correlate transactions with person tenures by comparing transaction_date against start_date/end_date ranges (inclusive start, exclusive end), returns list of {name, transaction_count} for people with >0 transactions",
  "fieldsToInclude": ["_dataset_source", "name", "transaction_date", "start_date", "end_date"]
}

🔍 SELF-VERIFICATION CHECKLIST (review before submitting):
Before returning your analysis, verify:
1. ✅ All fields in "generatedCode" are included in "fieldsToInclude"
2. ✅ Date parsing uses pd.to_datetime() on the correct DataFrames (the ones you'll actually use)
3. ✅ All Timestamp objects in result are converted to strings (.isoformat())
4. ✅ Variable names match between filtering and usage (e.g., if you filter to 'launches', use 'launches' not 'df')
5. ✅ Numeric fields use pd.to_numeric(errors='coerce') before math operations
6. ✅ Result includes verification fields (dates, identifiers) not just counts
7. ✅ For aggregation/counting queries, no limit is set (need all records)

If ANY of these checks fail, fix the issue before responding.

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
