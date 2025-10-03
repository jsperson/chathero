'use client';

import { useState, useEffect } from 'react';

interface FieldConfig {
  name: string;
  displayName: string;
  description: string;
  keywords: string[];
  sampleValues: any[];
  uniqueCount: number;
  type: string;
}

interface SchemaConfig {
  project: {
    name: string;
    description: string;
    domain: string;
  };
  categoricalFields: FieldConfig[];
  numericFields: FieldConfig[];
  dateFields: string[];
  primaryDateField: string;
  exampleQuestions: string[];
}

export default function SchemaAdmin() {
  const [schema, setSchema] = useState<SchemaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');

  useEffect(() => {
    loadSchema();
  }, []);

  const loadSchema = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/schema');
      const data = await response.json();

      // If existing config exists, use it
      if (data.existingConfig) {
        const config = data.existingConfig;

        // Transform existing config into editable format
        const categoricalFields = config.dataSchema.categoricalFields.map((field: any) => {
          const discoveredField = data.discovered.fields.find((f: any) => f.name === field.name);
          return {
            name: field.name,
            displayName: field.displayName,
            description: field.description,
            keywords: config.domainKnowledge.fieldKeywords[field.name] || [field.name],
            sampleValues: discoveredField?.sampleValues || [],
            uniqueCount: discoveredField?.uniqueCount || 0,
            type: discoveredField?.type || 'string',
          };
        });

        const numericFields = (config.dataSchema.numericFields || []).map((field: any) => {
          const discoveredField = data.discovered.fields.find((f: any) => f.name === field.name);
          return {
            name: field.name,
            displayName: field.displayName,
            description: field.unit || 'Numeric field',
            keywords: [field.name],
            sampleValues: discoveredField?.sampleValues || [],
            uniqueCount: discoveredField?.uniqueCount || 0,
            type: 'number',
          };
        });

        setSchema({
          project: config.project,
          categoricalFields,
          numericFields,
          dateFields: data.discovered.dateFields || [],
          primaryDateField: config.dataSchema.primaryDateField,
          exampleQuestions: config.exampleQuestions || [],
        });
      } else {
        // No existing config, use discovered schema
        const categoricalFields = data.discovered.categoricalFields.map((fieldName: string) => {
          const field = data.discovered.fields.find((f: any) => f.name === fieldName);
          return {
            name: fieldName,
            displayName: formatDisplayName(fieldName),
            description: `${field?.uniqueCount || 0} unique values`,
            keywords: [fieldName],
            sampleValues: field?.sampleValues || [],
            uniqueCount: field?.uniqueCount || 0,
            type: field?.type || 'string',
          };
        });

        const numericFields = data.discovered.numericFields.map((fieldName: string) => {
          const field = data.discovered.fields.find((f: any) => f.name === fieldName);
          return {
            name: fieldName,
            displayName: formatDisplayName(fieldName),
            description: 'Numeric field',
            keywords: [fieldName],
            sampleValues: field?.sampleValues || [],
            uniqueCount: field?.uniqueCount || 0,
            type: 'number',
          };
        });

        setSchema({
          project: {
            name: 'My Project',
            description: `Dataset with ${data.discovered.totalRecords} records`,
            domain: 'general data',
          },
          categoricalFields,
          numericFields,
          dateFields: data.discovered.dateFields || [],
          primaryDateField: data.discovered.dateFields?.[0] || '',
          exampleQuestions: [],
        });
      }
    } catch (error) {
      console.error('Failed to load schema:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDisplayName = (fieldName: string): string => {
    return fieldName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  };

  const updateField = (type: 'categorical' | 'numeric', index: number, key: string, value: any) => {
    if (!schema) return;

    const fields = type === 'categorical' ? [...schema.categoricalFields] : [...schema.numericFields];
    fields[index] = { ...fields[index], [key]: value };

    setSchema({
      ...schema,
      [type === 'categorical' ? 'categoricalFields' : 'numericFields']: fields,
    });
  };

  const updateProject = (key: string, value: string) => {
    if (!schema) return;
    setSchema({
      ...schema,
      project: { ...schema.project, [key]: value },
    });
  };

  const handleAiAssist = async () => {
    if (!aiPrompt.trim() || !schema) return;

    try {
      setAiLoading(true);
      setAiResponse('');

      const response = await fetch('/api/admin/schema/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          currentSchema: schema,
        }),
      });

      const data = await response.json();

      if (data.suggestion) {
        setAiResponse(data.suggestion);

        // If AI returned updated schema, apply it
        if (data.updatedSchema) {
          setSchema(data.updatedSchema);
        }
      }
    } catch (error) {
      console.error('AI assist error:', error);
      setAiResponse('Failed to get AI assistance');
    } finally {
      setAiLoading(false);
    }
  };

  const saveConfiguration = async () => {
    try {
      setSaving(true);
      const response = await fetch('/api/admin/schema/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schema),
      });

      if (response.ok) {
        alert('Configuration saved successfully!');
      } else {
        alert('Failed to save configuration');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const downloadYaml = async () => {
    try {
      const response = await fetch('/api/admin/schema/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schema),
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.yaml';
      a.click();
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading schema...</div>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-red-600">Failed to load schema</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Schema Configuration</h1>

      {/* Project Information */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Project Information</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Project Name</label>
            <input
              type="text"
              value={schema.project.name}
              onChange={(e) => updateProject('name', e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={schema.project.description}
              onChange={(e) => updateProject('description', e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Domain</label>
            <input
              type="text"
              value={schema.project.domain}
              onChange={(e) => updateProject('domain', e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="e.g., space launches, sales data, user analytics"
            />
          </div>
        </div>
      </div>

      {/* Categorical Fields */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Categorical Fields</h2>

        {schema.categoricalFields.map((field, index) => (
          <div key={field.name} className="border-b pb-4 mb-4 last:border-b-0">
            <div className="font-medium text-lg mb-2">{field.name}</div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  value={field.displayName}
                  onChange={(e) => updateField('categorical', index, 'displayName', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={field.description}
                  onChange={(e) => updateField('categorical', index, 'description', e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>

            <div className="mt-2">
              <label className="block text-sm font-medium mb-1">Keywords (comma-separated)</label>
              <input
                type="text"
                value={field.keywords.join(', ')}
                onChange={(e) => updateField('categorical', index, 'keywords', e.target.value.split(',').map(k => k.trim()))}
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div className="mt-2 text-sm text-gray-600">
              <span className="font-medium">Sample values:</span> {field.sampleValues.slice(0, 5).join(', ')}
              <span className="ml-4 font-medium">Unique count:</span> {field.uniqueCount}
            </div>
          </div>
        ))}
      </div>

      {/* Numeric Fields */}
      {schema.numericFields.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Numeric Fields</h2>

          {schema.numericFields.map((field, index) => (
            <div key={field.name} className="border-b pb-4 mb-4 last:border-b-0">
              <div className="font-medium text-lg mb-2">{field.name}</div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Display Name</label>
                  <input
                    type="text"
                    value={field.displayName}
                    onChange={(e) => updateField('numeric', index, 'displayName', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <input
                    type="text"
                    value={field.description}
                    onChange={(e) => updateField('numeric', index, 'description', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Assistant */}
      <div className="bg-blue-50 rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">🤖 AI Assistant</h2>

        <div className="mb-4">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="What would you like me to help with?"
            className="w-full border rounded px-3 py-2 h-24"
            disabled={aiLoading}
          />
        </div>

        <button
          onClick={handleAiAssist}
          disabled={aiLoading || !aiPrompt.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {aiLoading ? 'Thinking...' : 'Ask AI'}
        </button>

        {aiResponse && (
          <div className="mt-4 p-4 bg-white rounded border">
            <div className="font-medium mb-2">AI Response:</div>
            <div className="whitespace-pre-wrap">{aiResponse}</div>
          </div>
        )}

        <div className="mt-4 text-sm text-gray-600">
          <div className="font-medium mb-2">Try asking:</div>
          <ul className="list-disc list-inside space-y-1">
            <li>Generate better descriptions for all fields</li>
            <li>Suggest keywords for the {schema.categoricalFields[0]?.name} field</li>
            <li>Create 5 example questions for this dataset</li>
            <li>What's a good domain name for this data?</li>
          </ul>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={saveConfiguration}
          disabled={saving}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>

        <button
          onClick={downloadYaml}
          className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Download YAML
        </button>
      </div>
    </div>
  );
}
