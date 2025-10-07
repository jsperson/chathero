'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AIConfig {
  provider: string;
  model: string;
  queryAnalyzerModel?: string;
  apiKeySet: boolean;
}

export default function AISettingsAdmin() {
  const router = useRouter();
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form fields
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-4o-mini');
  const [queryAnalyzerModel, setQueryAnalyzerModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [confirmApiKey, setConfirmApiKey] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/admin/ai-settings');
      if (!response.ok) throw new Error('Failed to load config');

      const data = await response.json();
      setConfig(data);
      setProvider(data.provider || 'openai');
      setModel(data.model || 'gpt-4o-mini');
      setQueryAnalyzerModel(data.queryAnalyzerModel || '');
      setLoading(false);
    } catch (error) {
      console.error('Failed to load AI config:', error);
      setMessage({ type: 'error', text: 'Failed to load configuration' });
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validate API key if provided
    if (apiKey && apiKey !== confirmApiKey) {
      setMessage({ type: 'error', text: 'API keys do not match' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model,
          queryAnalyzerModel: queryAnalyzerModel || undefined,
          apiKey: apiKey || undefined, // Only send if changed
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save');
      }

      setMessage({ type: 'success', text: 'Configuration saved successfully! Restart the application for changes to take effect.' });

      // Clear API key fields after successful save
      setApiKey('');
      setConfirmApiKey('');

      // Reload to show updated status
      await loadConfig();
    } catch (error: any) {
      console.error('Failed to save:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">AI Settings</h1>
            <p className="text-gray-600 mt-2">Configure AI provider and model settings</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-gray-700 hover:text-gray-900"
          >
            ← Back to Chat
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Configuration Form */}
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              AI Provider
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic" disabled>Anthropic (Coming Soon)</option>
              <option value="azure" disabled>Azure OpenAI (Coming Soon)</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Currently only OpenAI is supported
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Model
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-500">
              Model used for Phase 3 (response generation). Examples: gpt-4o-mini, gpt-4o, gpt-4-turbo
            </p>
          </div>

          {/* Query Analyzer Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Query Analyzer Model (Optional)
            </label>
            <input
              type="text"
              value={queryAnalyzerModel}
              onChange={(e) => setQueryAnalyzerModel(e.target.value)}
              placeholder="gpt-4o (leave empty to use default model)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-500">
              Model used for Phase 1 (query analysis). Use a more capable model like gpt-4o for better code generation.
            </p>
          </div>

          {/* API Key Status */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">API Key</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Status: {config?.apiKeySet ? (
                    <span className="text-green-600 font-medium">✓ Set</span>
                  ) : (
                    <span className="text-red-600 font-medium">✗ Not Set</span>
                  )}
                </p>
              </div>
            </div>

            {/* API Key Input */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New API Key (leave empty to keep current)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
                <p className="mt-1 text-sm text-gray-500">
                  ⚠️ API key is stored in .env file (not committed to git). For security, the actual key is never displayed.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm API Key
                </label>
                <input
                  type="password"
                  value={confirmApiKey}
                  onChange={(e) => setConfirmApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="border-t pt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
            <p className="mt-2 text-sm text-gray-500 text-center">
              Changes require application restart to take effect
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-medium text-yellow-900 mb-2">🔒 Security Notice</h4>
          <ul className="text-sm text-yellow-800 space-y-1">
            <li>• API keys are stored in the <code className="bg-yellow-100 px-1 rounded">.env</code> file</li>
            <li>• The <code className="bg-yellow-100 px-1 rounded">.env</code> file is excluded from git via .gitignore</li>
            <li>• Keys are never displayed in the UI or logged</li>
            <li>• Model configuration is stored in <code className="bg-yellow-100 px-1 rounded">config/app.yaml</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
