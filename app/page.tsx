'use client';

import { useState, useEffect } from 'react';
import DatasetSelector from '@/components/DatasetSelector';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);

  useEffect(() => {
    // Load example questions from config
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.project?.exampleQuestions) {
          setExampleQuestions(data.project.exampleQuestions);
        }
      })
      .catch(err => console.error('Failed to load example questions:', err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-4">
        <DatasetSelector />
      </div>
      <div className="bg-white rounded-lg shadow-lg p-6 h-[calc(100vh-16rem)] flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-lg">Welcome! Ask me anything about the data.</p>
              {exampleQuestions.length > 0 && (
                <div className="text-sm mt-4">
                  <p className="font-semibold mb-2">Try asking:</p>
                  <div className="space-y-1">
                    {exampleQuestions.slice(0, 3).map((q, i) => (
                      <p key={i} className="text-gray-600">&quot;{q}&quot;</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === 'user'
                      ? 'text-white'
                      : 'bg-gray-100'
                  }`}
                  style={msg.role === 'user' ? { backgroundColor: 'var(--color-primary)' } : {}}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-4 py-2">
                <p className="text-gray-500">Thinking...</p>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': 'var(--color-primary)' } as any}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-6 py-2 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
