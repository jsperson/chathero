'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

interface Table {
  name: string;
  recordCount: number;
  hasSchema: boolean;
}

interface DatasetInfo {
  name: string;
  displayName: string;
  description: string;
  type: string;
  tables: Table[];
}

export default function DatasetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const datasetName = params.dataset as string;

  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingSchema, setGeneratingSchema] = useState(false);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetName) return;

    // Load dataset info and tables
    fetch(`/api/datasets/${datasetName}`)
      .then(res => res.json())
      .then(data => {
        setDatasetInfo(data);
        // Use saved selection, or default to all tables
        if (data.selectedTables && data.selectedTables.length > 0) {
          setSelectedTables(data.selectedTables);
        } else {
          setSelectedTables(data.tables?.map((t: Table) => t.name) || []);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load dataset:', err);
        setLoading(false);
      });
  }, [datasetName]);

  const handleToggleTable = (tableName: string) => {
    setSelectedTables(prev => {
      if (prev.includes(tableName)) {
        return prev.filter(t => t !== tableName);
      } else {
        return [...prev, tableName];
      }
    });
  };

  const handleSelectAll = () => {
    if (datasetInfo?.tables) {
      setSelectedTables(datasetInfo.tables.map(t => t.name));
    }
  };

  const handleDeselectAll = () => {
    setSelectedTables([]);
  };

  const handleSave = async () => {
    setSaving(true);

    // Save selected tables for this dataset
    try {
      await fetch(`/api/datasets/${datasetName}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: selectedTables }),
      });

      setTimeout(() => {
        setSaving(false);
        router.push('/admin/datasets');
      }, 500);
    } catch (error) {
      console.error('Failed to save table selection:', error);
      setSaving(false);
    }
  };

  const handleGenerateSchemas = async () => {
    if (!datasetInfo) return;

    setGeneratingSchema(true);

    try {
      const tablesToGenerate = selectedTables.filter(tableName => {
        const table = datasetInfo.tables?.find(t => t.name === tableName);
        return table && !table.hasSchema;
      });

      if (tablesToGenerate.length === 0) {
        alert('All selected tables already have schemas configured.');
        setGeneratingSchema(false);
        return;
      }

      const response = await fetch(`/api/datasets/${datasetName}/generate-schemas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: tablesToGenerate }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate schemas');
      }

      // Reload dataset info to show updated schema status
      const refreshResponse = await fetch(`/api/datasets/${datasetName}`);
      const refreshData = await refreshResponse.json();
      setDatasetInfo(refreshData);

      setGeneratingSchema(false);
    } catch (error) {
      console.error('Failed to generate schemas:', error);
      alert('Failed to generate schemas. Please try again.');
      setGeneratingSchema(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Loading dataset...</p>
      </div>
    );
  }

  if (!datasetInfo) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
          <p className="text-center text-red-500">Dataset not found</p>
          <div className="flex justify-center mt-4">
            <button
              onClick={() => router.push('/admin/datasets')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back to Datasets
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalRecords = datasetInfo.tables?.reduce((sum, t) => sum + t.recordCount, 0) || 0;
  const selectedRecords = datasetInfo.tables
    ?.filter(t => selectedTables.includes(t.name))
    .reduce((sum, t) => sum + t.recordCount, 0) || 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/admin/datasets')}
            className="text-gray-600 hover:text-gray-800 mb-4 flex items-center gap-1"
          >
            ← Back to Datasets
          </button>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-primary)' }}>
            {datasetInfo.displayName}
          </h1>
          {datasetInfo.description && (
            <p className="text-gray-600">{datasetInfo.description}</p>
          )}
          <div className="flex gap-4 text-sm text-gray-500 mt-2">
            <span>📁 Type: {datasetInfo.type}</span>
            <span>📊 Total Records: {totalRecords.toLocaleString()}</span>
            <span>📋 Tables: {datasetInfo.tables?.length || 0}</span>
          </div>
        </div>

        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Table Selection</h2>
            <div className="flex gap-2">
              <button
                onClick={handleGenerateSchemas}
                disabled={generatingSchema || selectedTables.length === 0}
                className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                style={{
                  backgroundColor: generatingSchema ? 'transparent' : 'var(--color-primary)',
                  color: generatingSchema ? 'inherit' : 'white',
                  borderColor: generatingSchema ? undefined : 'var(--color-primary)'
                }}
              >
                {generatingSchema ? '🔄 Generating...' : '✨ AI Populate Schemas'}
              </button>
              <button
                onClick={handleSelectAll}
                className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
              >
                Select All
              </button>
              <button
                onClick={handleDeselectAll}
                className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
              >
                Deselect All
              </button>
            </div>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Choose which tables from this dataset to include in your queries. Click "AI Populate Schemas" to automatically generate schema configurations for selected unconfigured tables.
          </p>

          <div className="space-y-2 mb-6">
            {datasetInfo.tables?.map(table => (
              <div
                key={table.name}
                className={`border rounded-lg transition-all ${
                  selectedTables.includes(table.name)
                    ? 'border-2 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                style={selectedTables.includes(table.name) ? { borderColor: 'var(--color-primary)' } : {}}
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => handleToggleTable(table.name)}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedTables.includes(table.name)}
                        onChange={() => handleToggleTable(table.name)}
                        className="w-5 h-5"
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{table.name}</h3>
                        {!table.hasSchema && (
                          <span className="text-yellow-500 text-sm">⚠️ Not configured</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        {table.recordCount.toLocaleString()} records
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedTable(expandedTable === table.name ? null : table.name);
                      }}
                      className="text-gray-500 hover:text-gray-700 px-2"
                    >
                      {expandedTable === table.name ? '▼' : '▶'}
                    </button>
                  </div>
                </div>

                {expandedTable === table.name && (
                  <div className="border-t bg-gray-50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">Schema Configuration</h4>
                      {table.hasSchema ? (
                        <span className="text-green-600 text-sm">✓ Configured</span>
                      ) : (
                        <span className="text-yellow-600 text-sm">Not configured</span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/schema?dataset=${datasetName}&table=${table.name}`);
                      }}
                      className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-white"
                    >
                      {table.hasSchema ? 'Edit Schema' : 'Configure Schema'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-gray-600">
              {selectedTables.length === 0 && 'No tables selected'}
              {selectedTables.length === 1 && `1 table selected (${selectedRecords.toLocaleString()} records)`}
              {selectedTables.length > 1 && `${selectedTables.length} tables selected (${selectedRecords.toLocaleString()} records)`}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/admin/datasets')}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || selectedTables.length === 0}
                className="px-6 py-2 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {saving ? 'Saving...' : 'Save Selection'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
