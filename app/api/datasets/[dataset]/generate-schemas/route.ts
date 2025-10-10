import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadConfig, AppConfig } from '@/lib/config';
import { SchemaDiscovery } from '@/lib/schema-discovery';
import OpenAI from 'openai';

async function generateDatabaseSchemas(dbConfig: any, tables: string[]) {
  try {
    const { SQLServerAdapter } = await import('@/lib/adapters/database/sqlserver.adapter');
    const adapter = new SQLServerAdapter(dbConfig, []);

    const config = await loadConfig();
    const openai = new OpenAI({ apiKey: config.ai.apiKey });

    const results: { table: string; success: boolean; error?: string }[] = [];
    const schemaDescriptions: any = {};

    for (const tableName of tables) {
      try {
        // Get table schema from database
        const columns = await adapter.getTableSchema(tableName);

        // Format schema for AI
        const schemaInfo = columns.map(col =>
          `${col.name} (${col.type}${col.nullable ? ', nullable' : ', required'})`
        ).join('\n');

        // Use AI to generate semantic description
        const prompt = `Analyze this database table schema and provide a semantic layer description.

Table: ${tableName}
Columns:
${schemaInfo}

Generate a JSON response with:
1. description: A brief description of what this table represents
2. fieldDescriptions: An object mapping each column name to a human-readable description
3. businessContext: Any business logic or domain knowledge inferred from the schema

Format as valid JSON only, no markdown.`;

        const completion = await openai.chat.completions.create({
          model: config.ai.model,
          messages: [
            { role: 'system', content: 'You are a data analyst helping to document database schemas. Provide clear, concise descriptions.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
        });

        const responseText = completion.choices[0]?.message?.content || '{}';
        const semanticLayer = JSON.parse(responseText);

        schemaDescriptions[tableName] = {
          columns: columns.map(col => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable,
            description: semanticLayer.fieldDescriptions?.[col.name] || ''
          })),
          description: semanticLayer.description || '',
          businessContext: semanticLayer.businessContext || ''
        };

        results.push({ table: tableName, success: true });
      } catch (error) {
        console.error(`Failed to generate schema for ${tableName}:`, error);
        results.push({
          table: tableName,
          success: false,
          error: String(error)
        });
      }
    }

    // Save schemas to config directory
    const schemasDir = path.join(process.cwd(), 'config', 'database-schemas');
    await fs.mkdir(schemasDir, { recursive: true });

    const schemasFile = path.join(schemasDir, `${dbConfig.connection.database}.yaml`);
    await fs.writeFile(schemasFile, yaml.dump(schemaDescriptions), 'utf-8');

    return NextResponse.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Database schema generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate database schemas: ' + String(error) },
      { status: 500 }
    );
  }
}

async function loadTableData(datasetPath: string, tableName: string): Promise<any[]> {
  const tablePath = path.join(datasetPath, tableName);
  const entries = await fs.readdir(tablePath);
  const allData: any[] = [];

  for (const entry of entries) {
    // Skip directories and config
    if (!entry.endsWith('.json') && !entry.endsWith('.csv')) continue;

    const filePath = path.join(tablePath, entry);

    if (entry.endsWith('.json')) {
      try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        if (Array.isArray(data)) {
          allData.push(...data);
        } else {
          allData.push(data);
        }
      } catch (e) {
        // Couldn't read JSON file
      }
    } else if (entry.endsWith('.csv')) {
      try {
        // Simple CSV parsing - just for schema discovery
        const csvContent = await fs.readFile(filePath, 'utf-8');
        const lines = csvContent.split('\n').filter(line => line.trim().length > 0);

        if (lines.length > 1) {
          const headers = lines[0].split(',').map(h => h.trim());

          for (let i = 1; i < Math.min(lines.length, 100); i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const row: any = {};

            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });

            allData.push(row);
          }
        }
      } catch (e) {
        // Couldn't read CSV file
      }
    }
  }

  return allData;
}

export async function POST(
  request: Request,
  { params }: { params: { dataset: string } }
) {
  try {
    const config = await loadConfig();
    const datasetName = params.dataset;
    const body = await request.json();
    const tables = body.tables || [];

    // Check if this is a database source
    if (config.dataSource.type === 'database' && config.dataSource.database) {
      const dbConfig = config.dataSource.database;
      const databaseName = dbConfig.connection.database || 'Database';

      if (datasetName === databaseName) {
        // Handle database schema generation
        return await generateDatabaseSchemas(dbConfig, tables);
      }
    }

    // File-based dataset handling
    if (!config.dataSource.datasetsPath) {
      return NextResponse.json(
        { error: 'Datasets path not configured' },
        { status: 400 }
      );
    }

    const datasetsPath = path.join(process.cwd(), config.dataSource.datasetsPath);
    const datasetPath = path.join(datasetsPath, datasetName);

    // Check if dataset exists
    try {
      await fs.access(datasetPath);
    } catch (e) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    const results: { table: string; success: boolean; error?: string }[] = [];

    // Generate schema for each table
    for (const tableName of tables) {
      try {
        // Load table data
        const tableData = await loadTableData(datasetPath, tableName);

        if (tableData.length === 0) {
          results.push({
            table: tableName,
            success: false,
            error: 'No data found in table'
          });
          continue;
        }

        // Generate schema using SchemaDiscovery
        const projectConfig = SchemaDiscovery.generateProjectConfig(tableData, tableName);

        // Extract just the schema parts we need
        const schema = {
          dataSchema: projectConfig.dataSchema,
          domainKnowledge: projectConfig.domainKnowledge || { fieldKeywords: {} }
        };

        // Ensure config directory exists
        const configPath = path.join(datasetPath, tableName, 'config');
        await fs.mkdir(configPath, { recursive: true });

        // Write schema.yaml
        const schemaPath = path.join(configPath, 'schema.yaml');
        await fs.writeFile(schemaPath, yaml.dump(schema), 'utf-8');

        results.push({
          table: tableName,
          success: true
        });
      } catch (error) {
        console.error(`Failed to generate schema for ${tableName}:`, error);
        results.push({
          table: tableName,
          success: false,
          error: String(error)
        });
      }
    }

    return NextResponse.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Generate schemas API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate schemas' },
      { status: 500 }
    );
  }
}
