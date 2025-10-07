'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

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

interface Dataset {
  name: string;
  displayName: string;
  recordCount: number;
  description: string;
  hasProjectConfig: boolean;
}

export default function SchemaAdmin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [schema, setSchema] = useState<SchemaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [datasetName, setDatasetName] = useState<string>('');
  const [availableDatasets, setAvailableDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');

  // Track the dataset URL parameter
  const datasetParam = searchParams.get('dataset');

  console.log('RENDER - datasetParam:', datasetParam);

  useEffect(() => {
    console.log('EFFECT - dataset from URL:', datasetParam);
    loadDatasets(datasetParam);
  }, [datasetParam]);

  useEffect(() => {
    console.log('EFFECT - selectedDataset changed to:', selectedDataset);
    if (selectedDataset) {
      loadSchema();
    }
  }, [selectedDataset]);

  const loadDatasets = async (urlParam: string | null) => {
    try {
      const response = await fetch('/api/datasets');
      const data = await response.json();

      const sorted = (data.datasets || []).sort((a: Dataset, b: Dataset) =>
        a.displayName.localeCompare(b.displayName)
      );

      setAvailableDatasets(sorted);

      // Check if dataset is specified in URL using the passed parameter
      console.log('loadDatasets - URL param:', urlParam);
      console.log('loadDatasets - available datasets:', sorted.map(d => d.name));

      if (urlParam) {
        // URL parameter takes priority - use it even if not found in list
        console.log('loadDatasets - setting dataset from URL:', urlParam);
        const exists = sorted.some((d: Dataset) => d.name === urlParam);
        console.log('loadDatasets - dataset exists in list:', exists);
        setSelectedDataset(urlParam);
        // Also set cookie so API calls use the right dataset
        document.cookie = `selectedDataset=${urlParam}; path=/; max-age=31536000`;
      } else if (sorted.length > 0) {
        // Load first dataset alphabetically only if no URL parameter
        console.log('loadDatasets - no URL param, setting first dataset:', sorted[0].name);
        setSelectedDataset(sorted[0].name);
        document.cookie = `selectedDataset=${sorted[0].name}; path=/; max-age=31536000`;
      }
    } catch (error) {
      console.error('Failed to load datasets:', error);
    }
  };

  const handleDatasetChange = (datasetName: string) => {
    // Set cookie so the API knows which dataset to load
    document.cookie = `selectedDataset=${datasetName}; path=/; max-age=31536000`;
    setSelectedDataset(datasetName);
    // Update URL to reflect the selected dataset
    router.push(`/admin/schema?dataset=${datasetName}`);
  };

  const loadSchema = async () => {
    try {
      setLoading(true);
      console.log('loadSchema - selected dataset:', selectedDataset);

      // Check the cookie to see what the API will receive
      const cookies = document.cookie.split(';');
      const datasetCookie = cookies.find(c => c.trim().startsWith('selectedDataset='));
      console.log('loadSchema - current cookie:', datasetCookie);

      console.log('loadSchema - fetching /api/admin/schema?dataset=' + selectedDataset);
      const response = await fetch(`/api/admin/schema?dataset=${selectedDataset}`);
      const data = await response.json();
      console.log('loadSchema - response:', data);

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

        // Set display name from project config
        if (config.project?.name) {
          setDatasetName(config.project.name);
        }
      } else {
        // No existing config, use discovered schema
        // Show ALL fields, not just automatically categorized ones
        const categoricalFields = data.discovered.fields
          .filter((field: any) => field.type === 'string')
          .map((field: any) => {
            return {
              name: field.name,
              displayName: formatDisplayName(field.name),
              description: `${field.uniqueCount || 0} unique values`,
              keywords: [field.name],
              sampleValues: field.sampleValues || [],
              uniqueCount: field.uniqueCount || 0,
              type: field.type || 'string',
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

        // Get dataset name from selectedDataset state for display
        const defaultName = selectedDataset
          ? selectedDataset.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          : 'My Project';

        console.log('loadSchema - Using auto-discovered schema for:', selectedDataset);
        console.log('loadSchema - Display name:', defaultName);

        setSchema({
          project: {
            name: defaultName,
            description: `Dataset with ${data.discovered.totalRecords} records`,
            domain: 'general data',
          },
          categoricalFields,
          numericFields,
          dateFields: data.discovered.dateFields || [],
          primaryDateField: data.discovered.dateFields?.[0] || '',
          exampleQuestions: [],
        });

        // Set display name
        setDatasetName(defaultName);
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

      console.log('AI assist response:', data);

      if (data.error) {
        setAiResponse(`Error: ${data.error}`);
        return;
      }

      if (data.suggestion) {
        setAiResponse(data.suggestion);

        // If AI returned updated schema, apply it
        if (data.updatedSchema) {
          console.log('Applying updated schema:', data.updatedSchema);

          // Merge with current schema to preserve sampleValues, uniqueCount, type
          const mergedCategoricalFields = data.updatedSchema.categoricalFields?.map((updatedField: any) => {
            const currentField = schema.categoricalFields.find((f: any) => f.name === updatedField.name);
            return {
              name: updatedField.name,
              displayName: updatedField.displayName || currentField?.displayName || updatedField.name,
              description: updatedField.description || currentField?.description || '',
              keywords: updatedField.keywords || currentField?.keywords || [updatedField.name],
              sampleValues: currentField?.sampleValues || [],
              uniqueCount: currentField?.uniqueCount || 0,
              type: currentField?.type || 'string',
            };
          }) || schema.categoricalFields;

          const mergedNumericFields = data.updatedSchema.numericFields?.map((updatedField: any) => {
            const currentField = schema.numericFields.find((f: any) => f.name === updatedField.name);
            return {
              name: updatedField.name,
              displayName: updatedField.displayName || currentField?.displayName || updatedField.name,
              description: updatedField.description || updatedField.unit || currentField?.description || '',
              keywords: updatedField.keywords || currentField?.keywords || [updatedField.name],
              sampleValues: currentField?.sampleValues || [],
              uniqueCount: currentField?.uniqueCount || 0,
              type: 'number',
            };
          }) || schema.numericFields;

          setSchema({
            project: data.updatedSchema.project || schema.project,
            categoricalFields: mergedCategoricalFields,
            numericFields: mergedNumericFields,
            dateFields: data.updatedSchema.dateFields || schema.dateFields,
            primaryDateField: data.updatedSchema.primaryDateField || schema.primaryDateField,
            exampleQuestions: data.updatedSchema.exampleQuestions || schema.exampleQuestions,
          });
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

  const clearSchema = async () => {
    try {
      const response = await fetch('/api/admin/schema/clear', {
        method: 'POST',
      });

      if (response.ok) {
        setShowClearConfirm(false);
        alert('Configuration cleared successfully! Reloading...');
        window.location.reload();
      } else {
        alert('Failed to clear configuration');
      }
    } catch (error) {
      console.error('Clear error:', error);
      alert('Failed to clear configuration');
    }
  };

  const rediscoverSchema = async () => {
    if (!schema) return;

    setAiPrompt('Rediscover schema from data, preserving existing display names and descriptions where applicable');
    await handleAiAssist();
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
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => window.location.href = '/admin/datasets'}
            className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
          >
            ← Back to Datasets
          </button>
        </div>
        <h1 className="text-3xl font-bold mb-4">
          Schema Configuration
          {datasetName && <span className="text-lg text-gray-600 ml-3">— {availableDatasets.find(d => d.name === selectedDataset)?.displayName || datasetName}</span>}
        </h1>

        {datasetName && (
          <div className="text-lg text-gray-600">
            Configuring: <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
              {datasetName}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button
          onClick={saveConfiguration}
          disabled={saving}
          className="px-4 py-2 text-white rounded-lg font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        <button
          onClick={downloadYaml}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Download YAML
        </button>

        <button
          onClick={() => setShowClearConfirm(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Clear Configuration
        </button>
      </div>

      {/* AI Assistant */}
      <div className="mb-4 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold mb-2">🤖 AI Assistance</h3>
        <p className="text-sm text-gray-600 mb-2">
          Ask AI to help improve your schema configuration
        </p>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g., 'Generate better descriptions for all fields' or 'Rediscover schema from data'"
            className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': 'var(--color-primary)' } as any}
            disabled={aiLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAiAssist();
              }
            }}
          />
          <button
            onClick={handleAiAssist}
            disabled={aiLoading || !aiPrompt.trim()}
            className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {aiLoading ? 'Generating...' : 'Generate'}
          </button>
        </div>

        {/* Quick action buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              setAiPrompt('Generate comprehensive keywords and synonyms for all fields based on the dataset context');
              setTimeout(() => handleAiAssist(), 100);
            }}
            disabled={aiLoading}
            className="text-xs px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Generate Keywords
          </button>
          <button
            onClick={() => {
              setAiPrompt('Rediscover schema from data, preserving existing display names and descriptions');
              setTimeout(() => handleAiAssist(), 100);
            }}
            disabled={aiLoading}
            className="text-xs px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Rediscover Schema
          </button>
          <button
            onClick={() => {
              setAiPrompt('Generate better descriptions for all fields');
              setTimeout(() => handleAiAssist(), 100);
            }}
            disabled={aiLoading}
            className="text-xs px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Improve Descriptions
          </button>
        </div>

        {aiResponse && (
          <div className="mt-4 p-4 bg-white rounded border">
            <div className="font-medium mb-2">AI Response:</div>
            <div className="whitespace-pre-wrap">{aiResponse}</div>
          </div>
        )}
      </div>

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

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-xl font-bold mb-4">Clear Configuration?</h3>
            <p className="mb-6 text-gray-600">
              This will delete all configuration files (<code className="bg-gray-100 px-2 py-1 rounded">metadata.yaml</code>, <code className="bg-gray-100 px-2 py-1 rounded">schema.yaml</code>, <code className="bg-gray-100 px-2 py-1 rounded">queries.yaml</code>) and reset to auto-discovered schema.
              This action cannot be undone.
            </p>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={clearSchema}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Yes, Clear Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
