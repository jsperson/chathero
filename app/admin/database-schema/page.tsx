'use client';

import { useState, useEffect } from 'react';

interface SchemaData {
  tables: string[];
  configuredTables: string[];
  databaseName: string;
  databaseType: string;
}

export default function DatabaseSchema() {
  const [loading, setLoading] = useState(true);
  const [schemaData, setSchemaData] = useState<SchemaData | null>(null);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadSchema();
  }, []);

  const loadSchema = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/database-schema');
      if (response.ok) {
        const data = await response.json();
        setSchemaData(data);
        setSelectedTables(new Set(data.configuredTables));
      } else {
        const error = await response.json();
        console.error('Failed to load schema:', error);
      }
    } catch (error) {
      console.error('Failed to load schema:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTable = (tableName: string) => {
    const newSelected = new Set(selectedTables);
    if (newSelected.has(tableName)) {
      newSelected.delete(tableName);
    } else {
      newSelected.add(tableName);
    }
    setSelectedTables(newSelected);
  };

  const handleSelectAll = () => {
    if (!schemaData) return;
    const filtered = getFilteredTables();
    setSelectedTables(new Set(filtered));
  };

  const handleSelectNone = () => {
    setSelectedTables(new Set());
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    setSaveMessage('');

    try {
      const response = await fetch('/api/admin/database-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: Array.from(selectedTables),
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSaveStatus('success');
        setSaveMessage('✅ Schema configuration saved successfully!');
      } else {
        setSaveStatus('error');
        setSaveMessage(`❌ ${result.error}`);
      }
    } catch (error: any) {
      setSaveStatus('error');
      setSaveMessage(`❌ Save failed: ${error.message}`);
    }
  };

  const getFilteredTables = () => {
    if (!schemaData) return [];
    if (!searchTerm) return schemaData.tables;
    return schemaData.tables.filter(table =>
      table.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading database schema...</div>
      </div>
    );
  }

  if (!schemaData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-8">
          <div className="bg-white rounded-lg shadow-md p-8">
            <h1 className="text-3xl font-bold mb-4">Database Schema</h1>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <p className="text-yellow-800">
                No database configured. Please configure a database connection in Database Settings first.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filteredTables = getFilteredTables();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-8">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold mb-2">Database Schema & Semantic Layer</h1>
          <p className="text-gray-600 mb-6">
            {schemaData.databaseName} ({schemaData.databaseType.toUpperCase()})
          </p>

          {/* Search and Selection Controls */}
          <div className="mb-6 flex flex-wrap gap-4 items-center">
            <input
              type="text"
              placeholder="Search tables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-64 p-2 border rounded"
            />
            <button
              onClick={handleSelectAll}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              Select All ({filteredTables.length})
            </button>
            <button
              onClick={handleSelectNone}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Select None
            </button>
          </div>

          {/* Selected Count */}
          <div className="mb-4 text-sm text-gray-600">
            {selectedTables.size} of {schemaData.tables.length} tables selected
          </div>

          {/* Table List */}
          <div className="border rounded-lg max-h-96 overflow-y-auto mb-6">
            {filteredTables.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No tables found matching &quot;{searchTerm}&quot;
              </div>
            ) : (
              <div className="divide-y">
                {filteredTables.map((table) => (
                  <label
                    key={table}
                    className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTables.has(table)}
                      onChange={() => handleToggleTable(table)}
                      className="w-4 h-4 mr-3 flex-shrink-0"
                    />
                    <span className="flex-1 font-mono text-sm">{table}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Future: Semantic Layer Configuration */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">Coming Soon: Semantic Layer</h3>
            <p className="text-sm text-blue-700">
              Future features will include:
            </p>
            <ul className="text-sm text-blue-600 mt-2 space-y-1 list-disc list-inside">
              <li>Define table relationships and joins</li>
              <li>Create calculated fields and measures</li>
              <li>Set up business-friendly field names and descriptions</li>
              <li>Configure data types and formatting</li>
              <li>Define business metrics and KPIs</li>
            </ul>
          </div>

          {/* Save Button */}
          <div className="border-t pt-6">
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving' || selectedTables.size === 0}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saveStatus === 'saving' ? 'Saving...' : 'Save Selected Tables'}
            </button>

            {saveMessage && (
              <div className={`mt-4 p-4 rounded ${
                saveStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                {saveMessage}
              </div>
            )}

            {selectedTables.size === 0 && (
              <p className="mt-4 text-sm text-gray-600">
                Please select at least one table to continue.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
