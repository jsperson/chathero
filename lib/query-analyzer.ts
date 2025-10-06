// AI-powered query analyzer that determines how to process data
import { AIAdapter } from './adapters/ai.adapter';
import { ProjectConfig } from './config';
import { JoinStrategy } from './join-analyzer';

export interface QueryAnalysisResult {
  operation: 'aggregate' | 'filter' | 'calculate' | 'raw' | 'join';
  groupBy?: Array<{
    field: string;
    transform?: 'extract_year' | 'extract_month' | 'extract_day_of_week' | 'extract_quarter' | 'none';
  }>;
  filters?: Array<{
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between';
    value: any;
  }>;
  calculations?: Array<{
    type: 'count' | 'sum' | 'average' | 'min' | 'max' | 'time_between';
    field?: string;
  }>;
  limit?: number;
  explanation: string;
  joinStrategy?: JoinStrategy;
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
  async analyze(question: string, dataSample: any[]): Promise<QueryAnalysisResult> {
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
You can filter by dataset using the '_dataset_source' field.`
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

    const systemPrompt = `You are a data query analyzer. Your job is to analyze user questions and determine how to process the data to answer them.
${datasetInfo}

Dataset schema:
${JSON.stringify(this.projectConfig.dataSchema, null, 2)}

Available fields:
${this.projectConfig.dataSchema.categoricalFields.map(f => `- ${f.name}: ${f.description}`).join('\n')}
${this.projectConfig.dataSchema.numericFields?.map(f => `- ${f.name} (numeric): ${f.displayName}`).join('\n') || ''}
Primary date field: ${this.projectConfig.dataSchema.primaryDateField}
${hasMultipleDatasets ? '- _dataset_source (categorical): Source dataset name' : ''}

Sample data (first 3 records):
${JSON.stringify(dataSample.slice(0, 3), null, 2)}

Available transformations for date fields:
- extract_year: Extract year from date (e.g., "2024-03-15" → "2024")
- extract_month: Extract month from date (e.g., "2024-03-15" → "March" or "03")
- extract_day_of_week: Extract day name from date (e.g., "2024-03-15" → "Friday")
- extract_quarter: Extract quarter from date (e.g., "2024-03-15" → "Q1")

Return a JSON object with this structure:
{
  "operation": "aggregate|filter|calculate|raw",
  "groupBy": [{"field": "field_name", "transform": "extract_year"}],
  "filters": [{"field": "field_name", "operator": "equals", "value": "value"}],
  "calculations": [{"type": "count|sum|average|min|max", "field": "field_name"}],
  "limit": 50,
  "explanation": "Brief explanation of analysis approach"
}

General examples:
- "records by year" → {"operation": "aggregate", "groupBy": [{"field": "date_field", "transform": "extract_year"}], "calculations": [{"type": "count"}], "explanation": "Group by year"}
- "records by day of week" → {"operation": "aggregate", "groupBy": [{"field": "date_field", "transform": "extract_day_of_week"}], "calculations": [{"type": "count"}], "explanation": "Group by day of week"}
- "show recent records" → {"operation": "filter", "limit": 50, "explanation": "Show recent records"}
- "average per year" → {"operation": "calculate", "calculations": [{"type": "average"}], "groupBy": [{"field": "date_field", "transform": "extract_year"}], "explanation": "Calculate average per year"}
${multiDatasetExamples}

Important: Return ONLY valid JSON, no other text.`;

    try {
      const response = await this.aiAdapter.chat(question, {
        system_instruction: systemPrompt,
        require_json: true,
      });

      // Parse JSON response
      const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const analysis: QueryAnalysisResult = JSON.parse(cleanResponse);

      return analysis;
    } catch (error) {
      console.error('Query analysis error:', error);
      // Fallback to basic analysis
      return {
        operation: 'aggregate',
        groupBy: [
          { field: this.projectConfig.dataSchema.categoricalFields[0]?.name || 'vehicle', transform: 'none' }
        ],
        calculations: [{ type: 'count' }],
        explanation: 'Fallback: basic aggregation',
      };
    }
  }
}
