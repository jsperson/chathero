// Automatic schema discovery from JSON data

export interface DiscoveredField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  sampleValues: any[];
  uniqueCount: number;
  nullCount: number;
}

export interface DiscoveredSchema {
  totalRecords: number;
  fields: DiscoveredField[];
  categoricalFields: string[];  // Fields with limited unique values
  numericFields: string[];
  dateFields: string[];
}

export class SchemaDiscovery {

  /**
   * Discover schema from JSON data array
   */
  static discover(data: any[]): DiscoveredSchema {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        totalRecords: 0,
        fields: [],
        categoricalFields: [],
        numericFields: [],
        dateFields: [],
      };
    }

    // Get all unique field names from all records
    const allFieldNames = new Set<string>();
    data.forEach(record => {
      if (typeof record === 'object' && record !== null) {
        Object.keys(record).forEach(key => allFieldNames.add(key));
      }
    });

    // Analyze each field
    const fields: DiscoveredField[] = [];
    const categoricalFields: string[] = [];
    const numericFields: string[] = [];
    const dateFields: string[] = [];

    allFieldNames.forEach(fieldName => {
      const fieldAnalysis = this.analyzeField(data, fieldName);
      fields.push(fieldAnalysis);

      // Categorize fields
      if (fieldAnalysis.type === 'number') {
        numericFields.push(fieldName);
      } else if (fieldAnalysis.type === 'date') {
        dateFields.push(fieldName);
      } else if (fieldAnalysis.type === 'string') {
        // If field has limited unique values, it's categorical
        // Criteria: < 20 unique values OR < 10% of records (whichever is larger)
        const percentageThreshold = data.length * 0.1;
        const absoluteThreshold = 20;
        const threshold = Math.max(absoluteThreshold, percentageThreshold);

        if (fieldAnalysis.uniqueCount < threshold) {
          categoricalFields.push(fieldName);
        }
      }
    });

    return {
      totalRecords: data.length,
      fields,
      categoricalFields,
      numericFields,
      dateFields,
    };
  }

  /**
   * Analyze a single field across all records
   */
  private static analyzeField(data: any[], fieldName: string): DiscoveredField {
    const values: any[] = [];
    const uniqueValues = new Set();
    let nullCount = 0;

    data.forEach(record => {
      const value = record[fieldName];

      if (value === null || value === undefined) {
        nullCount++;
      } else {
        values.push(value);
        uniqueValues.add(value);
      }
    });

    // Determine field type
    const type = this.inferType(values);

    // Get sample values (up to 5)
    const sampleValues = [...new Set(values)].slice(0, 5);

    return {
      name: fieldName,
      type,
      sampleValues,
      uniqueCount: uniqueValues.size,
      nullCount,
    };
  }

  /**
   * Infer the type of a field from its values
   */
  private static inferType(values: any[]): 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' {
    if (values.length === 0) return 'string';

    // Sample first non-null value
    const sampleValue = values.find(v => v !== null && v !== undefined);
    if (!sampleValue) return 'string';

    // Check primitive types
    if (typeof sampleValue === 'number') return 'number';
    if (typeof sampleValue === 'boolean') return 'boolean';
    if (Array.isArray(sampleValue)) return 'array';
    if (typeof sampleValue === 'object') return 'object';

    // Check if it's a date string
    if (typeof sampleValue === 'string') {
      // Common date patterns
      const datePatterns = [
        /^\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
        /^\d{2}\/\d{2}\/\d{4}/, // MM/DD/YYYY
        /^\d{4}\/\d{2}\/\d{2}/, // YYYY/MM/DD
      ];

      for (const pattern of datePatterns) {
        if (pattern.test(sampleValue)) {
          return 'date';
        }
      }
    }

    return 'string';
  }

  /**
   * Generate a suggested project config based on discovered schema
   */
  static generateProjectConfig(data: any[], projectName: string = "My Project"): any {
    const schema = this.discover(data);

    // Find primary date field (first date field, or field with 'date' in name)
    let primaryDateField = schema.dateFields[0] || '';
    if (!primaryDateField) {
      const dateNameField = schema.fields.find(f =>
        f.name.toLowerCase().includes('date') ||
        f.name.toLowerCase().includes('time')
      );
      if (dateNameField) {
        primaryDateField = dateNameField.name;
      }
    }

    // Build categorical fields config
    const categoricalFields = schema.categoricalFields.map(fieldName => {
      const field = schema.fields.find(f => f.name === fieldName);
      return {
        name: fieldName,
        displayName: this.formatDisplayName(fieldName),
        description: `${field?.uniqueCount || 0} unique values`,
      };
    });

    // Build numeric fields config
    const numericFields = schema.numericFields.map(fieldName => ({
      name: fieldName,
      displayName: this.formatDisplayName(fieldName),
      unit: this.guessUnit(fieldName),
    }));

    // Build field keywords from categorical fields
    const fieldKeywords: Record<string, string[]> = {};
    schema.categoricalFields.forEach(fieldName => {
      const keywords = [fieldName, ...this.generateKeywords(fieldName)];
      fieldKeywords[fieldName] = keywords;
    });

    return {
      project: {
        name: projectName,
        description: `Dataset with ${schema.totalRecords} records`,
        domain: "general data",
      },
      dataSchema: {
        primaryDateField: primaryDateField || 'date',
        categoricalFields: categoricalFields.slice(0, 5), // Limit to top 5
        numericFields: numericFields.slice(0, 3), // Limit to top 3
      },
      domainKnowledge: {
        fieldKeywords,
      },
      exampleQuestions: this.generateExampleQuestions(schema),
      aiContext: {
        systemRole: `You are a helpful assistant that answers questions about ${projectName} data.`,
        domainContext: `This dataset contains ${schema.totalRecords} records with ${schema.fields.length} fields.`,
      },
    };
  }

  /**
   * Format field name for display (snake_case -> Title Case)
   */
  private static formatDisplayName(fieldName: string): string {
    return fieldName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  }

  /**
   * Generate keyword variations for a field name
   */
  private static generateKeywords(fieldName: string): string[] {
    const keywords: string[] = [];
    const lower = fieldName.toLowerCase();

    // Add singular/plural variations
    if (lower.endsWith('s')) {
      keywords.push(lower.slice(0, -1)); // Remove 's'
    } else {
      keywords.push(lower + 's'); // Add 's'
    }

    // Add with spaces and underscores
    keywords.push(lower.replace(/_/g, ' '));
    keywords.push(lower.replace(/ /g, '_'));

    return keywords;
  }

  /**
   * Guess unit for numeric field based on name
   */
  private static guessUnit(fieldName: string): string {
    const lower = fieldName.toLowerCase();

    if (lower.includes('kg') || lower.includes('kilogram')) return 'kg';
    if (lower.includes('mass') || lower.includes('weight')) return 'kg';
    if (lower.includes('price') || lower.includes('cost')) return 'USD';
    if (lower.includes('percent') || lower.includes('rate')) return '%';
    if (lower.includes('count') || lower.includes('number')) return '';
    if (lower.includes('distance') || lower.includes('length')) return 'm';
    if (lower.includes('time') || lower.includes('duration')) return 's';

    return '';
  }

  /**
   * Generate example questions based on schema
   */
  private static generateExampleQuestions(schema: DiscoveredSchema): string[] {
    const questions: string[] = [];

    // Total count question
    questions.push(`How many records are there?`);

    // Categorical field questions
    if (schema.categoricalFields.length > 0) {
      const firstCat = schema.categoricalFields[0];
      questions.push(`Show me breakdown by ${this.formatDisplayName(firstCat).toLowerCase()}`);
    }

    // Date field questions
    if (schema.dateFields.length > 0) {
      questions.push(`Show me by year`);
    }

    // Numeric field questions
    if (schema.numericFields.length > 0) {
      const firstNum = schema.numericFields[0];
      questions.push(`What is the average ${this.formatDisplayName(firstNum).toLowerCase()}?`);
    }

    // Filter question
    if (schema.categoricalFields.length > 0) {
      const firstCat = schema.categoricalFields[0];
      questions.push(`Show me all records`);
    }

    return questions;
  }
}
