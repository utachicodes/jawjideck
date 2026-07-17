import { useState, useRef, useEffect } from 'react';
import { PanelContainer } from './panel-utils';
import { auth } from '../../lib/firebase';
import { buildTelemetryContext, captureCameraFrame } from '../../lib/assistant-helpers';
import { Send, Loader2, Camera, Trash2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  hasImage?: boolean;
}

/** Simple markdown-ish rendering: **bold**, *italic*, `code` */
function renderContent(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-surface-raised px-1 rounded text-[11px]">$1</code>');
}

export function AssistantPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [includeImage, setIncludeImage] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    const userToken = auth.currentUser;
    if (!userToken) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sign in to use Jawji Assistant.',
        timestamp: Date.now(),
      }]);
      return;
    }

    setInput('');
    const imageBase64 = includeImage ? captureCameraFrame() ?? undefined : undefined;

    setMessages((prev) => [...prev, {
      role: 'user',
      content: question,
      timestamp: Date.now(),
      hasImage: !!imageBase64,
    }]);

    setLoading(true);
    try {
      const idToken = await userToken.getIdToken();
      const telemetry = buildTelemetryContext();
      const result = await window.electronAPI.assistAsk({
        idToken,
        question,
        telemetry,
        imageBase64,
      });
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: result.answer,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <PanelContainer className="flex flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-auto space-y-3 mb-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-content font-medium">Jawji Assistant</p>
              <p className="text-xs text-content-secondary mt-1">
                Ask about your drone's position, heading,<br />
                altitude, speed, or surroundings.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center mt-1">
              {['Where am I?', 'How far from home?', 'What heading?'].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="px-2.5 py-1 rounded-lg bg-surface-raised hover:bg-surface text-[11px] text-content-secondary transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-blue-600/80 text-white'
                : 'bg-surface-raised text-content'
            }`}>
              {msg.role === 'assistant' ? (
                <div dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
              ) : (
                <div>
                  {msg.content}
                  {msg.hasImage && (
                    <span className="inline-flex items-center gap-1 ml-1.5 text-[10px] opacity-60">
                      <Camera size={10} /> with frame
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-raised rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-content-secondary">
              <Loader2 size={12} className="animate-spin" />
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setIncludeImage(!includeImage)}
          className={`shrink-0 p-1.5 rounded-lg transition-colors ${
            includeImage ? 'bg-blue-600/20 text-blue-400' : 'text-content-tertiary hover:text-content-secondary'
          }`}
          title={includeImage ? 'Camera frame will be sent' : 'Camera frame disabled'}
        >
          <Camera size={14} />
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your drone..."
          disabled={loading}
          className="flex-1 px-3 py-1.5 rounded-lg bg-surface-input border border-subtle text-content text-xs placeholder:text-content-tertiary disabled:opacity-50"
        />
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || loading}
          className="shrink-0 p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white transition-colors"
        >
          <Send size={14} />
        </button>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="shrink-0 p-1.5 rounded-lg text-content-tertiary hover:text-content-secondary transition-colors"
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </PanelContainer>
  );
}
