// Data processor for intelligent query handling

export interface QueryAnalysis {
  type: 'aggregate' | 'filter' | 'specific' | 'search' | 'full';
  fields?: string[];
  filters?: Record<string, any>;
  limit?: number;
}

export class DataProcessor {
  private data: any[];

  constructor(data: any[]) {
    this.data = data;
  }

  // Analyze what kind of query this is
  static analyzeQuery(question: string): QueryAnalysis {
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

  private static extractFields(question: string): string[] {
    const fields: string[] = [];

    if (question.includes('year')) fields.push('year');
    if (question.includes('vehicle')) fields.push('vehicle');
    if (question.includes('outcome') || question.includes('success') || question.includes('failure')) fields.push('outcome');
    if (question.includes('site') || question.includes('location')) fields.push('site');
    if (question.includes('customer')) fields.push('customer');

    return fields.length > 0 ? fields : ['year', 'vehicle', 'outcome'];
  }

  private static extractFilters(question: string): Record<string, any> {
    const filters: Record<string, any> = {};

    // Extract year
    const yearMatch = question.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      filters.year = yearMatch[1];
    }

    // Extract vehicle
    if (question.includes('falcon 1')) filters.vehicle = 'Falcon 1';
    if (question.includes('falcon 9')) filters.vehicle = 'Falcon 9';
    if (question.includes('falcon heavy')) filters.vehicle = 'Falcon Heavy';
    if (question.includes('starship')) filters.vehicle = 'Starship';

    // Extract outcome
    if (question.includes('successful') || question.includes('success')) filters.outcome = 'Success';
    if (question.includes('failed') || question.includes('failure')) filters.outcome = 'Failure';

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

    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'year') {
        filtered = filtered.filter(item =>
          item.launch_date?.startsWith(value)
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

    this.data.forEach(item => {
      const year = item.launch_date?.substring(0, 4);
      if (year) {
        counts[year] = (counts[year] || 0) + 1;
      }
    });

    return counts;
  }
}
