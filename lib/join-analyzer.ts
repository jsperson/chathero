// AI-powered join analyzer for cross-dataset queries
import { AIAdapter } from './adapters/ai.adapter';
import { ProjectConfig } from './config';

export type JoinType = 'temporal' | 'key_match' | 'nested_aggregation' | 'none';

export interface JoinStrategy {
  needsJoin: boolean;
  joinType: JoinType;
  leftDataset?: string;
  rightDataset?: string;
  joinCondition?: {
    type: 'date_overlap' | 'date_range' | 'field_match' | 'nested';
    leftFields?: string[];
    rightFields?: string[];
    matchField?: string;
  };
  explanation: string;
}

export class JoinAnalyzer {
  private aiAdapter: AIAdapter;
  private projectConfig: ProjectConfig;

  constructor(aiAdapter: AIAdapter, projectConfig: ProjectConfig) {
    this.aiAdapter = aiAdapter;
    this.projectConfig = projectConfig;
  }

  /**
   * Analyze if a query requires joining data from multiple datasets
   */
  async analyzeJoin(question: string, dataSample: any[], availableDatasets: string[]): Promise<JoinStrategy> {
    // Check if multiple datasets are present
    const hasMultipleDatasets = availableDatasets.length > 1;

    if (!hasMultipleDatasets) {
      return {
        needsJoin: false,
        joinType: 'none',
        explanation: 'Only one dataset available, no join needed',
      };
    }

    console.log('Join Analyzer - Analyzing for cross-dataset relationships:');
    console.log('  Available datasets:', availableDatasets);
    console.log('  Question:', question);

    const systemPrompt = `You are a join strategy analyzer. Your job is to determine if a user question requires combining or relating data from multiple datasets.

Available datasets: ${availableDatasets.join(', ')}

Sample data from each dataset (first 2 records per dataset):
${this.getSamplesByDataset(dataSample, availableDatasets)}

Dataset schema:
${JSON.stringify(this.projectConfig.dataSchema, null, 2)}

Analyze the question and determine:
1. Does it need to JOIN/relate data between datasets?
2. What type of join is needed?

Join types:
- "temporal": Relate records by overlapping or comparing dates (e.g., "presidents during launches", "events in same year")
- "key_match": Join records by matching field values (e.g., "launches by customer name", "people with matching locations")
- "nested_aggregation": Compute separate stats per dataset then compare (e.g., "compare average age of presidents vs astronauts")
- "none": No join needed - either filtering one dataset or simple comparison without relating individual records

Return a JSON object:
{
  "needsJoin": true|false,
  "joinType": "temporal|key_match|nested_aggregation|none",
  "leftDataset": "dataset_name",
  "rightDataset": "dataset_name",
  "joinCondition": {
    "type": "date_overlap|date_range|field_match|nested",
    "leftFields": ["field1", "field2"],
    "rightFields": ["field1"],
    "matchField": "field_name"
  },
  "explanation": "Brief explanation of join strategy"
}

Examples:
- "Which presidents were alive during Apollo launches?" → {"needsJoin": true, "joinType": "temporal", "leftDataset": "presidents", "rightDataset": "launches", "joinCondition": {"type": "date_overlap", "leftFields": ["birth_date", "death_date"], "rightFields": ["launch_date"]}, "explanation": "Need temporal join to find presidents whose lifespan overlaps with launch dates"}
- "How many launches per president?" or "launches by president" → {"needsJoin": true, "joinType": "temporal", "leftDataset": "presidents", "rightDataset": "launches", "joinCondition": {"type": "date_range", "leftFields": ["presidential_start", "presidential_end"], "rightFields": ["launch_date"]}, "explanation": "Count launches that occurred during each president's term"}
- "Compare average of dataset A vs dataset B" → {"needsJoin": true, "joinType": "nested_aggregation", "leftDataset": "datasetA", "rightDataset": "datasetB", "joinCondition": {"type": "nested"}, "explanation": "Calculate separate aggregations then compare"}
- "How many launches?" → {"needsJoin": false, "joinType": "none", "explanation": "Single dataset query, no join needed"}

IMPORTANT: When joining by presidential term, use "presidential_start" and "presidential_end" fields, NOT "term_start" and "term_end".

Important: Return ONLY valid JSON, no other text.`;

    try {
      const response = await this.aiAdapter.chat(question, {
        system_instruction: systemPrompt,
        require_json: true,
      });

      const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const strategy: JoinStrategy = JSON.parse(cleanResponse);

      console.log('Join strategy:', JSON.stringify(strategy, null, 2));
      return strategy;
    } catch (error) {
      console.error('Join analysis error:', error);
      // Fallback: assume no join needed
      return {
        needsJoin: false,
        joinType: 'none',
        explanation: 'Fallback: treating as single dataset query',
      };
    }
  }

  /**
   * Get sample records organized by dataset
   */
  private getSamplesByDataset(dataSample: any[], datasets: string[]): string {
    const samples: string[] = [];

    datasets.forEach(dataset => {
      const datasetRecords = dataSample
        .filter(r => r._dataset_source === dataset)
        .slice(0, 2);

      if (datasetRecords.length > 0) {
        samples.push(`\n${dataset}:\n${JSON.stringify(datasetRecords, null, 2)}`);
      }
    });

    return samples.join('\n');
  }
}
