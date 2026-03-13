import { useState, useEffect, useRef } from 'react';
import { useConsoleStore } from '../../stores/console-store';
import { useMessagesStore } from '../../stores/messages-store';
import { useConnectionStore } from '../../stores/connection-store';

const LOG_COLORS = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-gray-400',
  packet: 'text-emerald-400',
};

const LOG_ICONS = {
  info: 'i',
  warn: '!',
  error: 'x',
  debug: '#',
  packet: '>',
};

/** Severity → Tailwind color class */
function severityColor(severity: number): string {
  switch (severity) {
    case 0: case 1: case 2: case 3:
      return 'text-red-400';
    case 4:
      return 'text-yellow-400';
    case 5:
      return 'text-blue-400';
    case 6:
      return 'text-gray-300';
    case 7:
      return 'text-gray-500';
    default:
      return 'text-gray-400';
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
}

function formatTimeShort(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

type Tab = 'console' | 'messages';

export function DebugConsole() {
  const { logs, isExpanded, filter, toggleExpanded, clearLogs, setFilter } = useConsoleStore();
  const messages = useMessagesStore((s) => s.messages);
  const clearMessages = useMessagesStore((s) => s.clear);
  const protocol = useConnectionStore((s) => s.connectionState.protocol);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('console');

  const isMavlink = protocol === 'mavlink';

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded && activeTab === 'console') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded, activeTab]);

  // Auto-scroll messages to top when new messages arrive (they're prepended)
  useEffect(() => {
    if (messagesScrollRef.current && isExpanded && activeTab === 'messages') {
      messagesScrollRef.current.scrollTop = 0;
    }
  }, [messages.length, isExpanded, activeTab]);

  // Listen for console logs from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onConsoleLog((entry) => {
      useConsoleStore.getState().addLog(entry);
    });
    return () => { unsubscribe?.(); };
  }, []);

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(log => log.level === filter || (filter === 'error' && log.level === 'warn'));

  const lastLog = logs[logs.length - 1];

  return (
    <div className="border-t border-gray-800/50 bg-gray-900/80 backdrop-blur-sm flex flex-col">
      {/* Collapsed bar - always visible */}
      <button
        onClick={toggleExpanded}
        className="h-8 px-4 flex items-center gap-3 hover:bg-gray-800/50 transition-colors cursor-pointer w-full text-left"
      >
        {/* Expand/collapse icon */}
        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>

        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Console</span>

        {/* Last log preview when collapsed */}
        {!isExpanded && lastLog && (
          <span className={`text-xs truncate flex-1 ${LOG_COLORS[lastLog.level]}`}>
            <span className="text-gray-600 mr-2">{formatTime(lastLog.timestamp)}</span>
            {lastLog.message}
          </span>
        )}

        {/* Log count badge */}
        <span className="text-xs text-gray-600">
          {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
        </span>

        {/* Messages count badge - show when connected via MAVLink and have messages */}
        {isMavlink && messages.length > 0 && (
          <span className="text-xs text-yellow-500/70">
            {messages.length} msg{messages.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="flex flex-col" style={{ height: '35vh' }}>
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800/50 bg-gray-900/50">
            {/* Tab buttons */}
            <div className="flex gap-1 mr-2">
              <button
                onClick={() => setActiveTab('console')}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  activeTab === 'console'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
              >
                Console
              </button>
              {isMavlink && (
                <button
                  onClick={() => setActiveTab('messages')}
                  className={`px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                    activeTab === 'messages'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  Messages
                  {messages.length > 0 && (
                    <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1 rounded-full">
                      {messages.length}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Separator */}
            {activeTab === 'console' && (
              <div className="w-px h-4 bg-gray-700/50" />
            )}

            {/* Console filter buttons - only show on console tab */}
            {activeTab === 'console' && (
              <div className="flex gap-1">
                {(['all', 'info', 'error', 'packet'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      filter === f
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1" />

            {/* Clear button */}
            <button
              onClick={activeTab === 'console' ? clearLogs : clearMessages}
              className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 rounded transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Console tab content */}
          {activeTab === 'console' && (
            <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5">
              {filteredLogs.length === 0 ? (
                <div className="text-gray-600 text-center py-4">No log entries</div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="flex gap-2 hover:bg-gray-800/30 px-1 py-0.5 rounded">
                    {/* Time */}
                    <span className="text-gray-600 shrink-0">{formatTime(log.timestamp)}</span>

                    {/* Level icon */}
                    <span className={`shrink-0 w-4 text-center ${LOG_COLORS[log.level]}`}>
                      {LOG_ICONS[log.level]}
                    </span>

                    {/* Message */}
                    <span className={LOG_COLORS[log.level]}>{log.message}</span>

                    {/* Details */}
                    {log.details && (
                      <span className="text-gray-600">{log.details}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Messages tab content */}
          {activeTab === 'messages' && (
            <div ref={messagesScrollRef} className="flex-1 overflow-y-auto font-mono text-xs">
              {messages.length === 0 ? (
                <div className="text-gray-600 text-center py-4">No messages from autopilot</div>
              ) : (
                <div className="divide-y divide-gray-800/50">
                  {messages.map((msg, i) => (
                    <div
                      key={`${msg.text}-${msg.severity}-${i}`}
                      className="flex items-start gap-2 px-3 py-1.5 hover:bg-gray-800/30 transition-colors"
                    >
                      {/* Severity badge */}
                      <span className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded mt-0.5 ${
                        msg.severity <= 3 ? 'bg-red-500/20 text-red-400'
                          : msg.severity === 4 ? 'bg-yellow-500/20 text-yellow-400'
                          : msg.severity === 5 ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {msg.severityLabel.slice(0, 4)}
                      </span>

                      {/* Message text */}
                      <span className={`flex-1 leading-relaxed ${severityColor(msg.severity)}`}>
                        {msg.text}
                      </span>

                      {/* Count badge */}
                      {msg.count > 1 && (
                        <span className="shrink-0 text-[9px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full mt-0.5">
                          x{msg.count}
                        </span>
                      )}

                      {/* Timestamp */}
                      <span className="shrink-0 text-[10px] text-gray-600 mt-0.5">
                        {formatTimeShort(msg.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
