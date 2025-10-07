'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface QueryExample {
  question: string;
  filters?: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
  limit?: number;
  explanation: string;
}

export default function DatasetConfigPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [datasetName, setDatasetName] = useState('');
  const [readme, setReadme] = useState('');
  const [queryExamples, setQueryExamples] = useState<QueryExample[]>([]);
  const [aiAssisting, setAiAssisting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    // Check URL parameter first, then fall back to cookie
    const datasetFromUrl = searchParams.get('dataset');

    let dataset = datasetFromUrl;
    if (!dataset) {
      // Get selected dataset from cookie
      const cookies = document.cookie.split(';');
      const selectedDatasetCookie = cookies.find(c => c.trim().startsWith('selectedDatasets='));
      const selectedDatasets = selectedDatasetCookie
        ? selectedDatasetCookie.split('=')[1].split(',').map(s => s.trim())
        : [];
      dataset = selectedDatasets[0] || 'spacex-launches';
    }

    setDatasetName(dataset);

    // Load current config
    fetch(`/api/data/config?dataset=${dataset}`)
      .then(res => res.json())
      .then(data => {
        setReadme(data.readme || '');
        setQueryExamples(data.queryExamples || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load config:', err);
        setLoading(false);
      });
  }, [searchParams]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/data/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: datasetName,
          readme,
          queryExamples,
        }),
      });

      if (response.ok) {
        alert('Configuration saved successfully!');
        router.push('/data');
      } else {
        alert('Failed to save configuration');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save configuration');
    }
    setSaving(false);
  };

  const handleAiAssist = async () => {
    if (!aiPrompt.trim()) return;

    setAiAssisting(true);
    try {
      const response = await fetch('/api/data/config/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: datasetName,
          prompt: aiPrompt,
          currentExamples: queryExamples,
        }),
      });

      const data = await response.json();
      if (data.examples) {
        setQueryExamples(data.examples);
        setAiPrompt('');
      }
    } catch (error) {
      console.error('AI assist error:', error);
      alert('Failed to get AI assistance');
    }
    setAiAssisting(false);
  };

  const addExample = () => {
    setQueryExamples([
      ...queryExamples,
      {
        question: '',
        filters: [],
        explanation: '',
      },
    ]);
  };

  const removeExample = (index: number) => {
    setQueryExamples(queryExamples.filter((_, i) => i !== index));
  };

  const updateExample = (index: number, field: keyof QueryExample, value: any) => {
    const updated = [...queryExamples];
    updated[index] = { ...updated[index], [field]: value };
    setQueryExamples(updated);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/data/config/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset: datasetName }),
      });

      const data = await response.json();

      if (data.readme) {
        setReadme(data.readme);
      }
      if (data.queryExamples) {
        setQueryExamples(data.queryExamples);
      }

      alert('Configuration generated! Review and save when ready.');
    } catch (error) {
      console.error('Generate error:', error);
      alert('Failed to generate configuration');
    }
    setGenerating(false);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-4">
          <button
            onClick={() => router.push('/admin/datasets')}
            className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
          >
            ← Back to Datasets
          </button>
        </div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
            Configure Dataset: {datasetName}
          </h1>
          <div className="flex gap-2">
            {(!readme || queryExamples.length === 0) && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {generating ? '✨ Generating...' : '✨ Generate with AI'}
              </button>
            )}
            <button
              onClick={() => router.push('/data')}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* README Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2">README</h2>
          <p className="text-sm text-gray-600 mb-2">
            Markdown documentation for this dataset. This is shown to the AI during query analysis.
          </p>
          <textarea
            value={readme}
            onChange={(e) => setReadme(e.target.value)}
            className="w-full h-40 border rounded-lg px-4 py-2 font-mono text-sm focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': 'var(--color-primary)' } as any}
            placeholder="# Dataset Name\n\nDescription of the dataset..."
          />
        </div>

        {/* Query Examples Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold">Query Examples</h2>
              <p className="text-sm text-gray-600">
                Example queries that teach the AI how to filter data for this dataset.
              </p>
            </div>
            <button
              onClick={addExample}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              + Add Example
            </button>
          </div>

          {/* AI Assistance */}
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold mb-2">🤖 AI Assistance</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g., 'Generate examples for filtering by year and vehicle type'"
                className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'var(--color-primary)' } as any}
              />
              <button
                onClick={handleAiAssist}
                disabled={aiAssisting || !aiPrompt.trim()}
                className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {aiAssisting ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          {queryExamples.map((example, index) => (
            <div key={index} className="mb-4 p-4 border rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold">Example {index + 1}</h3>
                <button
                  onClick={() => removeExample(index)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Remove
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Question</label>
                  <input
                    type="text"
                    value={example.question}
                    onChange={(e) => updateExample(index, 'question', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': 'var(--color-primary)' } as any}
                    placeholder="e.g., How many launches in 2024?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Explanation</label>
                  <input
                    type="text"
                    value={example.explanation}
                    onChange={(e) => updateExample(index, 'explanation', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': 'var(--color-primary)' } as any}
                    placeholder="e.g., Filter for 2024 launches"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Filters (JSON)
                  </label>
                  <textarea
                    value={JSON.stringify(example.filters || [], null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        updateExample(index, 'filters', parsed);
                      } catch (err) {
                        // Invalid JSON, ignore
                      }
                    }}
                    className="w-full h-32 border rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': 'var(--color-primary)' } as any}
                    placeholder='[{"field": "_dataset_source", "operator": "equals", "value": "dataset-name"}]'
                  />
                </div>
              </div>
            </div>
          ))}

          {queryExamples.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              No examples yet. Click &quot;Add Example&quot; or use AI assistance to generate them.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
