import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { JSONAdapter } from '@/lib/adapters/json.adapter';
import { SchemaDiscovery } from '@/lib/schema-discovery';

export async function POST(request: NextRequest) {
  try {
    const { existingSchema } = await request.json();

    // Get selected dataset from cookie or use default
    const cookies = request.cookies;
    const selectedDataset = cookies.get('selectedDataset')?.value;

    // Load current data and discover schema
    const config = await loadConfig();
    const dataAdapter = new JSONAdapter(config.dataSource as any, selectedDataset ? [selectedDataset] : undefined);
    const data = await dataAdapter.getData();
    const discoveredSchema = SchemaDiscovery.discover(data);

    // Create maps of existing fields for quick lookup
    const existingCategoricalMap = new Map(
      existingSchema.categoricalFields.map((f: any) => [f.name, f])
    );
    const existingNumericMap = new Map(
      existingSchema.numericFields.map((f: any) => [f.name, f])
    );

    // Merge discovered schema with existing metadata
    const stats = {
      added: 0,
      removed: 0,
      preserved: 0,
    };

    // Process categorical fields
    const updatedCategoricalFields = discoveredSchema.categoricalFields.map((fieldName: string) => {
      const discoveredField = discoveredSchema.fields.find((f: any) => f.name === fieldName);
      const existingField = existingCategoricalMap.get(fieldName);

      if (existingField) {
        // Preserve existing metadata, update sample data
        stats.preserved++;
        return {
          ...existingField,
          sampleValues: discoveredField?.sampleValues || [],
          uniqueCount: discoveredField?.uniqueCount || 0,
        };
      } else {
        // New field - use auto-generated metadata
        stats.added++;
        return {
          name: fieldName,
          displayName: formatDisplayName(fieldName),
          description: `${discoveredField?.uniqueCount || 0} unique values`,
          keywords: [fieldName],
          sampleValues: discoveredField?.sampleValues || [],
          uniqueCount: discoveredField?.uniqueCount || 0,
          type: discoveredField?.type || 'string',
        };
      }
    });

    // Process numeric fields
    const updatedNumericFields = discoveredSchema.numericFields.map((fieldName: string) => {
      const discoveredField = discoveredSchema.fields.find((f: any) => f.name === fieldName);
      const existingField = existingNumericMap.get(fieldName);

      if (existingField) {
        // Preserve existing metadata
        stats.preserved++;
        return {
          ...existingField,
          sampleValues: discoveredField?.sampleValues || [],
          uniqueCount: discoveredField?.uniqueCount || 0,
        };
      } else {
        // New field - use auto-generated metadata
        stats.added++;
        return {
          name: fieldName,
          displayName: formatDisplayName(fieldName),
          description: guessUnit(fieldName) ? `Numeric field (${guessUnit(fieldName)})` : 'Numeric field',
          keywords: [fieldName],
          sampleValues: discoveredField?.sampleValues || [],
          uniqueCount: discoveredField?.uniqueCount || 0,
          type: 'number',
        };
      }
    });

    // Calculate removed fields
    const currentFieldNames = new Set([
      ...discoveredSchema.categoricalFields,
      ...discoveredSchema.numericFields,
    ]);

    existingSchema.categoricalFields.forEach((f: any) => {
      if (!currentFieldNames.has(f.name)) {
        stats.removed++;
      }
    });

    existingSchema.numericFields.forEach((f: any) => {
      if (!currentFieldNames.has(f.name)) {
        stats.removed++;
      }
    });

    // Build updated schema
    const updatedSchema = {
      project: existingSchema.project, // Preserve project metadata
      categoricalFields: updatedCategoricalFields,
      numericFields: updatedNumericFields,
      dateFields: discoveredSchema.dateFields,
      primaryDateField: existingSchema.primaryDateField || discoveredSchema.dateFields[0] || '',
      exampleQuestions: existingSchema.exampleQuestions, // Preserve example questions
    };

    return NextResponse.json({
      updatedSchema,
      stats,
    });
  } catch (error) {
    console.error('Rediscover error:', error);
    return NextResponse.json(
      { error: 'Failed to rediscover schema' },
      { status: 500 }
    );
  }
}

function formatDisplayName(fieldName: string): string {
  return fieldName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

function guessUnit(fieldName: string): string {
  const lower = fieldName.toLowerCase();

  if (lower.includes('kg') || lower.includes('kilogram')) return 'kg';
  if (lower.includes('mass') || lower.includes('weight')) return 'kg';
  if (lower.includes('price') || lower.includes('cost') || lower.includes('usd')) return 'USD';
  if (lower.includes('million')) return 'millions';
  if (lower.includes('percent') || lower.includes('rate')) return '%';
  if (lower.includes('count') || lower.includes('number')) return '';
  if (lower.includes('distance') || lower.includes('length')) return 'm';
  if (lower.includes('time') || lower.includes('duration')) return 's';

  return '';
}
