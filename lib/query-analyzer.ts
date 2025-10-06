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
  async analyze(question: string, dataSample: any[], datasetReadmes?: Record<string, string>): Promise<QueryAnalysisResult> {
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
The AI will receive the filtered data and perform the analysis itself.

Return a JSON object:
{
  "filters": [{"field": "field_name", "operator": "equals|contains|greater_than|less_than", "value": "value"}],
  "limit": 100,
  "explanation": "What data is needed and why"
}

IMPORTANT RULES:
- Do NOT add a limit for counting, aggregation, or "how many" queries - these need ALL records to count accurately
- Only use limit for browsing/listing queries like "show me", "list", "display"
- For questions like "how many X", "count of X", "total X", "X by year/category" - omit the limit field or set it very high

Examples:
${this.projectConfig.queryExamples && this.projectConfig.queryExamples.length > 0
  ? this.projectConfig.queryExamples.map(ex =>
      `- "${ex.question}" → ${JSON.stringify({filters: ex.filters || [], limit: ex.limit, explanation: ex.explanation})}`
    ).join('\n')
  : `- "How many records?" → {"filters": [], "explanation": "Need all records"}
- "Show recent records" → {"filters": [], "limit": 100, "explanation": "Show recent records"}`}
${multiDatasetExamples ? '\n' + multiDatasetExamples : ''}

Important:
- Only filter to reduce data size or isolate specific records
- For cross-dataset analysis, return empty filters array to get all data
- Return ONLY valid JSON, no other text.`;

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
      // Fallback: return all data
      return {
        filters: [],
        explanation: 'Fallback: returning all available data',
      };
    }
  }
}
