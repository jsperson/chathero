'use client';

import { useState, useEffect, useRef } from 'react';
import ProgressStepper, { Phase } from '@/components/ProgressStepper';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [exampleQuestions, setExampleQuestions] = useState<string[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load chat history from localStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('chatHistory');
    const savedPhases = localStorage.getItem('chatPhases');

    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (err) {
        console.error('Failed to parse saved messages:', err);
      }
    }

    if (savedPhases) {
      try {
        setPhases(JSON.parse(savedPhases));
      } catch (err) {
        console.error('Failed to parse saved phases:', err);
      }
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatHistory', JSON.stringify(messages));
    }
  }, [messages]);

  // Save phases to localStorage whenever they change
  useEffect(() => {
    if (phases.length > 0) {
      localStorage.setItem('chatPhases', JSON.stringify(phases));
    }
  }, [phases]);

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

  useEffect(() => {
    // Scroll to bottom whenever messages change
    scrollToBottom();
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    // Initialize phases - just show loading state
    setPhases([
      { id: 'phase1', name: 'Plan', status: 'active', details: 'Analyzing...' },
      { id: 'phase1.5', name: 'Validate', status: 'pending' },
      { id: 'phase2', name: 'Wrangle', status: 'pending' },
      { id: 'phase2.5', name: 'Optimize', status: 'pending' },
      { id: 'phase3', name: 'Answer', status: 'pending' },
    ]);

    // Use fetch with streaming for SSE
    try {
      const response = await fetch('/api/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            if (!event.trim()) continue;

            const lines = event.split('\n');
            let eventType = '';
            let eventData = null;

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.substring(7).trim();
              } else if (line.startsWith('data: ')) {
                try {
                  eventData = JSON.parse(line.substring(6));
                } catch (e) {
                  console.error('Failed to parse SSE data:', line);
                }
              }
            }

            if (eventType && eventData) {
              if (eventType === 'phase') {
                setPhases((prev: any) => prev.map((p: any) => {
                  if (p.id === eventData.id) {
                    return { ...p, status: eventData.status, details: eventData.status === 'active' ? 'Processing...' : undefined };
                  }
                  return p;
                }));
              } else if (eventType === 'complete') {
                const data = eventData;
                // Update phases with final backend data
        if (data.phaseDetails) {
        const pd = data.phaseDetails;

        setPhases((prev: any) => prev.map((p: any) => {
          if (p.id === 'phase1') {
            const details = [];
            if (pd.phase1.attempts && pd.phase1.attempts > 1) {
              details.push({ label: 'Attempts', value: `${pd.phase1.attempts} (retried ${pd.phase1.attempts - 1} time${pd.phase1.attempts > 2 ? 's' : ''})`, type: 'text' });
            }
            details.push({ label: 'Explanation', value: pd.phase1.explanation || 'N/A', type: 'text' });
            if (pd.phase1.filters && pd.phase1.filters.length > 0) {
              details.push({ label: 'Filters', value: pd.phase1.filters, type: 'json' });
            } else {
              details.push({ label: 'Filters', value: 'None', type: 'text' });
            }
            if (pd.phase1.fieldsToInclude && pd.phase1.fieldsToInclude.length > 0) {
              details.push({ label: 'Fields Selected', value: pd.phase1.fieldsToInclude.join(', '), type: 'text' });
            }
            if (pd.phase1.limit) {
              details.push({ label: 'Limit', value: pd.phase1.limit, type: 'number' });
            }
            if (pd.phase1.generatedCode) {
              details.push({ label: 'Generated Code', value: pd.phase1.generatedCode, type: 'code' });
              details.push({ label: 'Code Description', value: pd.phase1.codeDescription || 'N/A', type: 'text' });
            }
            return { ...p, status: 'completed', expandedDetails: details };
          }

          if (p.id === 'phase1.5') {
            if (!pd.phase1_5) {
              // No code generated, so no validation needed
              return {
                ...p,
                status: 'completed',
                expandedDetails: [
                  { label: 'Status', value: 'No code generated - validation skipped', type: 'text' }
                ]
              };
            }

            const details = [];
            if (pd.phase1_5.attempts && pd.phase1_5.attempts > 1) {
              details.push({ label: 'Attempts', value: `${pd.phase1_5.attempts} (retried ${pd.phase1_5.attempts - 1} time${pd.phase1_5.attempts > 2 ? 's' : ''})`, type: 'text' });
            }
            details.push({ label: 'Approved', value: pd.phase1_5.approved ? '✅ Yes' : '❌ No', type: 'text' });
            details.push({ label: 'Reason', value: pd.phase1_5.reason || 'N/A', type: 'text' });
            if (pd.phase1_5.risks && pd.phase1_5.risks.length > 0) {
              details.push({ label: 'Security Risks', value: pd.phase1_5.risks, type: 'json' });
            }
            return {
              ...p,
              status: pd.phase1_5.approved ? 'completed' : 'warning',
              expandedDetails: details
            };
          }

          if (p.id === 'phase2') {
            const details = [];
            if (pd.phase2.attempts && pd.phase2.attempts > 1) {
              details.push({ label: 'Attempts', value: `${pd.phase2.attempts} (retried ${pd.phase2.attempts - 1} time${pd.phase2.attempts > 2 ? 's' : ''})`, type: 'text' });
            }
            details.push({ label: 'Input Records', value: pd.phase2.inputRecords.toLocaleString(), type: 'text' });
            details.push({ label: 'Output Records', value: pd.phase2.outputRecords.toLocaleString(), type: 'text' });
            details.push({ label: 'Filters Applied', value: pd.phase2.filtersApplied, type: 'number' });
            details.push({ label: 'Code Executed', value: pd.phase2.codeExecuted ? '✅ Yes' : 'No', type: 'text' });
            if (pd.phase2.executionError) {
              details.push({ label: '❌ Execution Error', value: pd.phase2.executionError, type: 'text' });
            }
            return {
              ...p,
              status: pd.phase2.executionError ? 'warning' : 'completed',
              expandedDetails: details
            };
          }

          if (p.id === 'phase2.5') {
            return {
              ...p,
              status: 'completed',
              expandedDetails: [
                { label: 'Records to Phase 3', value: pd.phase2_5.recordsToPhase3.toLocaleString(), type: 'text' },
                { label: 'Total Records', value: pd.phase2_5.totalRecords.toLocaleString(), type: 'text' },
                { label: 'Sampling Applied', value: pd.phase2_5.samplingApplied ? 'Yes' : 'No', type: 'text' }
              ]
            };
          }

          if (p.id === 'phase3') {
            return {
              ...p,
              status: 'completed',
              expandedDetails: [
                { label: 'Response Length', value: pd.phase3.responseLength, type: 'number' },
                { label: 'Datasets', value: pd.phase3.datasets.join(', '), type: 'text' }
              ]
            };
          }

          return { ...p, status: 'completed', details: undefined };
        }));
      } else {
        // Fallback if no phase details returned
        setPhases((prev: any) => prev.map((p: any) => ({ ...p, status: 'completed', details: undefined })));
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
              } else if (eventType === 'error') {
                throw new Error(eventData.error || 'Unknown error');
              }
            }
          }
        }
      }
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

  const clearConversation = () => {
    setMessages([]);
    setPhases([]);
    localStorage.removeItem('chatHistory');
    localStorage.removeItem('chatPhases');
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="bg-white rounded-lg shadow-lg p-6 h-[calc(100vh-12rem)] flex flex-col">
        {/* Header with Clear button */}
        {messages.length > 0 && (
          <div className="flex justify-end mb-2">
            <button
              onClick={clearConversation}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-300 hover:border-gray-400"
            >
              Clear Conversation
            </button>
          </div>
        )}

        {/* Progress Stepper */}
        {phases.length > 0 && (
          <div className="mb-4 border-b pb-4">
            <ProgressStepper phases={phases} />
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-lg mb-2">Welcome! Ask me anything about the data.</p>
              <p className="text-sm text-gray-400 mb-4">💡 You can combine multiple datasets in complex questions</p>
              {exampleQuestions.length > 0 && (
                <div className="text-sm mt-4">
                  <p className="font-semibold mb-2">Try asking:</p>
                  <div className="space-y-1">
                    {exampleQuestions.slice(0, 5).map((q, i) => (
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
          <div ref={messagesEndRef} />
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
