import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { HealthCheckResult } from '@ardudeck/dataflash-parser';

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LogListEntry {
  id: number;
  numLogs: number;
  lastLogNum: number;
  timeUtc: number;
  size: number;
}

/** Serialized DataFlashLog from the worker (Maps serialized to plain objects) */
export interface ParsedLog {
  formats: Record<number, { id: number; name: string; length: number; format: string; fields: string[] }>;
  messages: Record<string, { type: string; timeUs: number; fields: Record<string, number | string> }[]>;
  metadata: { vehicleType: string; firmwareVersion: string; firmwareString: string; boardType: string; gitHash: string };
  timeRange: { startUs: number; endUs: number };
  messageTypes: string[];
}

interface LogStore {
  // Log list from FC
  availableLogs: LogListEntry[];
  isListLoading: boolean;

  // Current log
  currentLog: ParsedLog | null;
  currentLogPath: string | null;
  isParsingLog: boolean;
  parseProgress: number;

  // Download state
  downloadingLogId: number | null;
  downloadProgress: number;

  // Health report
  healthResults: HealthCheckResult[] | null;

  // AI analysis chat
  aiMessages: AiChatMessage[];
  isAiAnalyzing: boolean;
  aiAnalysisError: string | null;

  // AI insight cards (generated on Health Report)
  aiInsightCards: HealthCheckResult[];
  isAiInsightLoading: boolean;
  aiInsightError: string | null;

  // Explorer state — multiple chart panels for side-by-side comparison.
  // Each chart has its own selected types/fields keyed by chartId, and the
  // field picker mutates whichever chart is currently `activeChartId`. The
  // ChartPanel components read from their own chartId so they update
  // independently as the user clicks between tabs.
  chartIds: string[];
  activeChartId: string;
  selectedTypesByChart: Record<string, string[]>;
  selectedFieldsByChart: Record<string, Map<string, string[]>>;

  // Tab
  activeTab: 'list' | 'report' | 'explorer' | 'ai';

  // Actions
  setAvailableLogs: (logs: LogListEntry[]) => void;
  setIsListLoading: (loading: boolean) => void;
  setCurrentLog: (log: ParsedLog | null, path: string | null) => void;
  setIsParsingLog: (parsing: boolean) => void;
  setParseProgress: (progress: number) => void;
  setDownloadingLogId: (id: number | null) => void;
  setDownloadProgress: (progress: number) => void;
  setHealthResults: (results: HealthCheckResult[] | null) => void;
  addAiMessage: (msg: AiChatMessage) => void;
  clearAiMessages: () => void;
  setIsAiAnalyzing: (analyzing: boolean) => void;
  setAiAnalysisError: (error: string | null) => void;
  setAiInsightCards: (cards: HealthCheckResult[]) => void;
  setIsAiInsightLoading: (loading: boolean) => void;
  setAiInsightError: (error: string | null) => void;
  setSelectedTypes: (types: string[]) => void;
  setSelectedFields: (type: string, fields: string[]) => void;
  setActiveChartId: (id: string) => void;
  addChart: () => string;
  removeChart: (id: string) => void;
  setActiveTab: (tab: 'list' | 'report' | 'explorer' | 'ai') => void;
  reset: () => void;
}

let chatLoadInProgress = false;

export const useLogStore = create<LogStore>()(subscribeWithSelector((set) => ({
  availableLogs: [],
  isListLoading: false,
  currentLog: null,
  currentLogPath: null,
  isParsingLog: false,
  parseProgress: 0,
  downloadingLogId: null,
  downloadProgress: 0,
  healthResults: null,
  aiMessages: [],
  isAiAnalyzing: false,
  aiAnalysisError: null,
  aiInsightCards: [],
  isAiInsightLoading: false,
  aiInsightError: null,
  chartIds: ['chart'],
  activeChartId: 'chart',
  selectedTypesByChart: { chart: [] },
  selectedFieldsByChart: { chart: new Map() },
  activeTab: 'list',

  setAvailableLogs: (logs) => set({ availableLogs: logs }),
  setIsListLoading: (loading) => set({ isListLoading: loading }),
  setCurrentLog: (log, path) => {
    chatLoadInProgress = true;
    set({ currentLog: log, currentLogPath: path, aiMessages: [], aiInsightCards: [] });
    // Load saved conversation for this log
    if (path) {
      window.electronAPI?.logChatLoad(path).then((saved) => {
        if (saved) {
          set({
            aiMessages: saved.messages as AiChatMessage[],
            aiInsightCards: saved.insightCards as HealthCheckResult[],
          });
        }
        chatLoadInProgress = false;
      });
    } else {
      chatLoadInProgress = false;
    }
  },
  setIsParsingLog: (parsing) => set({ isParsingLog: parsing }),
  setParseProgress: (progress) => set({ parseProgress: progress }),
  setDownloadingLogId: (id) => set({ downloadingLogId: id }),
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),
  setHealthResults: (results) => set({ healthResults: results }),
  addAiMessage: (msg) => set((s) => ({ aiMessages: [...s.aiMessages, msg] })),
  clearAiMessages: () => set({ aiMessages: [], aiAnalysisError: null }),
  setIsAiAnalyzing: (analyzing) => set({ isAiAnalyzing: analyzing }),
  setAiAnalysisError: (error) => set({ aiAnalysisError: error }),
  setAiInsightCards: (cards) => set({ aiInsightCards: cards }),
  setIsAiInsightLoading: (loading) => set({ isAiInsightLoading: loading }),
  setAiInsightError: (error) => set({ aiInsightError: error }),
  setSelectedTypes: (types) => set((state) => ({
    selectedTypesByChart: { ...state.selectedTypesByChart, [state.activeChartId]: types },
  })),
  setSelectedFields: (type, fields) => set((state) => {
    const current = state.selectedFieldsByChart[state.activeChartId] ?? new Map();
    const next = new Map(current);
    next.set(type, fields);
    return {
      selectedFieldsByChart: { ...state.selectedFieldsByChart, [state.activeChartId]: next },
    };
  }),
  setActiveChartId: (id) => set({ activeChartId: id }),
  addChart: () => {
    // Generate a unique id; we keep them sortable/short so dockview ids are
    // friendly for debugging.
    const newId = `chart-${Date.now().toString(36)}`;
    set((state) => ({
      chartIds: [...state.chartIds, newId],
      activeChartId: newId,
      selectedTypesByChart: { ...state.selectedTypesByChart, [newId]: [] },
      selectedFieldsByChart: { ...state.selectedFieldsByChart, [newId]: new Map() },
    }));
    return newId;
  },
  removeChart: (id) => set((state) => {
    // Refuse to remove the last chart - the picker has nowhere to write to
    // and the explorer would render an empty pane forever.
    if (state.chartIds.length <= 1) return state;
    const remaining = state.chartIds.filter((c) => c !== id);
    const nextTypes = { ...state.selectedTypesByChart }; delete nextTypes[id];
    const nextFields = { ...state.selectedFieldsByChart }; delete nextFields[id];
    return {
      chartIds: remaining,
      activeChartId: state.activeChartId === id ? remaining[0]! : state.activeChartId,
      selectedTypesByChart: nextTypes,
      selectedFieldsByChart: nextFields,
    };
  }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  reset: () => set({
    availableLogs: [],
    isListLoading: false,
    currentLog: null,
    currentLogPath: null,
    isParsingLog: false,
    parseProgress: 0,
    downloadingLogId: null,
    downloadProgress: 0,
    healthResults: null,
    aiMessages: [],
    isAiAnalyzing: false,
    aiAnalysisError: null,
    aiInsightCards: [],
    isAiInsightLoading: false,
    aiInsightError: null,
    chartIds: ['chart'],
    activeChartId: 'chart',
    selectedTypesByChart: { chart: [] },
    selectedFieldsByChart: { chart: new Map() },
    activeTab: 'list',
  }),
})));

// Auto-save chat when messages or insight cards change
let chatSaveTimeout: ReturnType<typeof setTimeout> | null = null;

useLogStore.subscribe(
  (state) => ({ messages: state.aiMessages, cards: state.aiInsightCards, path: state.currentLogPath }),
  (curr) => {
    if (!curr.path || chatLoadInProgress) return;
    if (chatSaveTimeout) clearTimeout(chatSaveTimeout);
    chatSaveTimeout = setTimeout(() => {
      window.electronAPI?.logChatSave({
        logPath: curr.path!,
        messages: curr.messages,
        insightCards: curr.cards,
      });
    }, 1000);
  },
);
