// Data processor for intelligent query handling
import { ProjectConfig } from './config';

export interface QueryAnalysis {
  type: 'aggregate' | 'filter' | 'specific' | 'search' | 'full';
  fields?: string[];
  filters?: Record<string, any>;
  limit?: number;
}

export class DataProcessor {
  private data: any[];
  private projectConfig: ProjectConfig;

  constructor(data: any[], projectConfig: ProjectConfig) {
    this.data = data;
    this.projectConfig = projectConfig;
  }

  // Analyze what kind of query this is
  analyzeQuery(question: string): QueryAnalysis {
    const lowerQ = question.toLowerCase();

    // Aggregate queries
    if (lowerQ.match(/how many|count|total|summarize|breakdown|distribution|by (year|vehicle|outcome|site|customer)/)) {
      return {
        type: 'aggregate',
        fields: this.extractFields(lowerQ),
      };
    }

    // Filter queries
    if (lowerQ.match(/show|list|find|all|launches? (in|from|during|for)/)) {
      return {
        type: 'filter',
        filters: this.extractFilters(lowerQ),
        limit: 50, // Limit results
      };
    }

    // Specific queries
    if (lowerQ.match(/mission \d+|launch #?\d+|what was|which was/)) {
      return {
        type: 'specific',
      };
    }

    // Default: provide summary
    return {
      type: 'aggregate',
      fields: ['year', 'vehicle', 'outcome'],
    };
  }

  private extractFields(question: string): string[] {
    const fields: string[] = [];
    const fieldKeywords = this.projectConfig.domainKnowledge.fieldKeywords;

    // Check for year-based grouping
    if (question.match(/\b(by year|per year|each year|yearly|annually)\b/)) {
      fields.push('year');
    }

    // Check each configured field for keyword matches
    for (const [fieldName, keywords] of Object.entries(fieldKeywords)) {
      if (keywords.some(keyword => question.includes(keyword))) {
        fields.push(fieldName);
      }
    }

    // Default fields if none found
    const categoricalFields = this.projectConfig.dataSchema.categoricalFields;
    if (fields.length === 0) {
      // Include year if we have a date field, plus top categorical fields
      const defaultFields: string[] = [];
      if (this.projectConfig.dataSchema.primaryDateField) {
        defaultFields.push('year');
      }
      defaultFields.push(...categoricalFields.slice(0, 2).map(f => f.name));
      return defaultFields;
    }

    return fields;
  }

  private extractFilters(question: string): Record<string, any> {
    const filters: Record<string, any> = {};

    // Extract year
    const yearMatch = question.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      filters.year = yearMatch[1];
    }

    // Extract specific values from domain knowledge
    const domain = this.projectConfig.domainKnowledge;

    // Check for vehicle types
    if (domain.vehicleTypes) {
      for (const vehicleType of domain.vehicleTypes) {
        if (question.toLowerCase().includes(vehicleType.toLowerCase())) {
          filters.vehicle = vehicleType;
          break;
        }
      }
    }

    // Check for outcome types
    if (domain.outcomeTypes) {
      for (const outcomeType of domain.outcomeTypes) {
        if (question.toLowerCase().includes(outcomeType.toLowerCase())) {
          filters.outcome = outcomeType;
          break;
        }
      }
    }

    return filters;
  }

  // Get aggregated data
  aggregate(fields: string[]): any {
    const result: any = {
      total_records: this.data.length,
    };

    fields.forEach(field => {
      if (field === 'year') {
        result.by_year = this.groupByYear();
      } else {
        // Generic grouping for any field
        const displayName = this.projectConfig.dataSchema.categoricalFields
          .find(f => f.name === field)?.displayName || field;
        const key = `by_${field}`;
        result[key] = this.groupBy(field);
      }
    });

    // Add sample records
    result.sample_records = this.data.slice(0, 5);

    return result;
  }

  // Filter data
  filter(filters: Record<string, any>, limit: number = 50): any[] {
    let filtered = this.data;
    const dateField = this.projectConfig.dataSchema.primaryDateField;

    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'year') {
        filtered = filtered.filter(item =>
          item[dateField]?.startsWith(value)
        );
      } else {
        filtered = filtered.filter(item =>
          item[key]?.toString().toLowerCase().includes(value.toLowerCase())
        );
      }
    });

    return filtered.slice(0, limit);
  }

  // Get all data (for simple questions)
  getAll(): any[] {
    return this.data;
  }

  // Helper: Group by field
  private groupBy(field: string): Record<string, number> {
    const counts: Record<string, number> = {};

    this.data.forEach(item => {
      const value = item[field];
      if (value) {
        counts[value] = (counts[value] || 0) + 1;
      }
    });

    return counts;
  }

  // Helper: Group by year
  private groupByYear(): Record<string, number> {
    const counts: Record<string, number> = {};
    const dateField = this.projectConfig.dataSchema.primaryDateField;

    this.data.forEach(item => {
      const year = item[dateField]?.substring(0, 4);
      if (year) {
        counts[year] = (counts[year] || 0) + 1;
      }
    });

    return counts;
  }
}
