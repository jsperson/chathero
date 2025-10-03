// Data processor for intelligent query handling
import { ProjectConfig } from './config';
import { QueryAnalysisResult } from './query-analyzer';

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

    // Check each configured field for keyword matches
    for (const [fieldName, keywords] of Object.entries(fieldKeywords)) {
      if (keywords.some(keyword => question.includes(keyword))) {
        fields.push(fieldName);
      }
    }

    // Default fields if none found
    const categoricalFields = this.projectConfig.dataSchema.categoricalFields;
    if (fields.length === 0) {
      return categoricalFields.slice(0, 3).map(f => f.name);
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
      } else if (field === 'vehicle') {
        result.by_vehicle = this.groupBy('vehicle');
      } else if (field === 'outcome') {
        result.by_outcome = this.groupBy('outcome');
      } else if (field === 'site') {
        result.by_site = this.groupBy('site');
      } else if (field === 'customer') {
        result.by_customer = this.groupBy('customer');
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

  /**
   * Execute AI-generated query analysis instructions
   */
  executeAnalysis(analysis: QueryAnalysisResult): any {
    const result: any = {
      total_records: this.data.length,
      analysis_explanation: analysis.explanation,
    };

    // Apply filters first if specified
    let workingData = this.data;
    if (analysis.filters && analysis.filters.length > 0) {
      workingData = this.applyFilters(workingData, analysis.filters);
      result.filtered_count = workingData.length;
    }

    // Process based on operation type
    switch (analysis.operation) {
      case 'aggregate':
        if (analysis.groupBy && analysis.groupBy.length > 0) {
          analysis.groupBy.forEach(group => {
            const key = `by_${group.field}_${group.transform || 'raw'}`;
            result[key] = this.groupByWithTransform(workingData, group.field, group.transform);
          });
        }
        break;

      case 'filter':
        result.results = workingData.slice(0, analysis.limit || 50);
        break;

      case 'calculate':
        if (analysis.calculations) {
          analysis.calculations.forEach(calc => {
            result[`${calc.type}_${calc.field || 'records'}`] = this.calculate(workingData, calc);
          });
        }
        break;

      case 'raw':
        result.results = workingData.slice(0, analysis.limit || 100);
        break;
    }

    // Add small sample for context
    result.sample_records = workingData.slice(0, 3);

    return result;
  }

  /**
   * Group data by field with optional transform
   */
  private groupByWithTransform(
    data: any[],
    field: string,
    transform?: 'extract_year' | 'extract_month' | 'extract_day_of_week' | 'extract_quarter' | 'none'
  ): Record<string, number> {
    const counts: Record<string, number> = {};

    data.forEach(item => {
      let value = item[field];

      if (value && transform && transform !== 'none') {
        value = this.applyTransform(value, transform);
      }

      if (value) {
        const key = value.toString();
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    return counts;
  }

  /**
   * Apply date transformation
   */
  private applyTransform(
    value: string,
    transform: 'extract_year' | 'extract_month' | 'extract_day_of_week' | 'extract_quarter'
  ): string {
    try {
      const date = new Date(value);

      switch (transform) {
        case 'extract_year':
          return date.getFullYear().toString();

        case 'extract_month':
          return date.toLocaleString('en-US', { month: 'long' });

        case 'extract_day_of_week':
          return date.toLocaleString('en-US', { weekday: 'long' });

        case 'extract_quarter':
          const month = date.getMonth();
          const quarter = Math.floor(month / 3) + 1;
          return `Q${quarter}`;

        default:
          return value;
      }
    } catch (error) {
      return value;
    }
  }

  /**
   * Apply filters from AI analysis
   */
  private applyFilters(data: any[], filters: Array<{
    field: string;
    operator: string;
    value: any;
  }>): any[] {
    let filtered = data;

    filters.forEach(filter => {
      filtered = filtered.filter(item => {
        const itemValue = item[filter.field];

        switch (filter.operator) {
          case 'equals':
            return itemValue === filter.value;

          case 'contains':
            return itemValue?.toString().toLowerCase().includes(filter.value.toLowerCase());

          case 'greater_than':
            return itemValue > filter.value;

          case 'less_than':
            return itemValue < filter.value;

          case 'between':
            return itemValue >= filter.value[0] && itemValue <= filter.value[1];

          default:
            return true;
        }
      });
    });

    return filtered;
  }

  /**
   * Perform calculation on data
   */
  private calculate(data: any[], calc: { type: string; field?: string }): any {
    switch (calc.type) {
      case 'count':
        return data.length;

      case 'sum':
        if (!calc.field) return 0;
        return data.reduce((sum, item) => sum + (parseFloat(item[calc.field!]) || 0), 0);

      case 'average':
        if (!calc.field) return 0;
        const sum = data.reduce((s, item) => s + (parseFloat(item[calc.field!]) || 0), 0);
        return sum / data.length;

      case 'min':
        if (!calc.field) return null;
        return Math.min(...data.map(item => parseFloat(item[calc.field!]) || Infinity));

      case 'max':
        if (!calc.field) return null;
        return Math.max(...data.map(item => parseFloat(item[calc.field!]) || -Infinity));

      default:
        return null;
    }
  }
}
