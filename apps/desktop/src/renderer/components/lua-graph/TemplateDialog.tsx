/**
 * Template selection dialog — lets users pick a pre-built graph template.
 * Rich visual design with category colors, per-template icons, and stat badges.
 */
import { useCallback, useState } from 'react';
import {
  X,
  Layers,
  BatteryWarning,
  MapPin,
  Radio,
  PlaneLanding,
  Camera,
  Mountain,
  ArrowRight,
  GitFork,
  Timer,
  Anchor,
  Home,
  Package,
  Gauge,
  FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react';
import { GRAPH_TEMPLATES } from './graph-templates';
import { useLuaGraphStore } from '../../stores/lua-graph-store';
import { ConfirmDialog } from './ConfirmDialog';

// ── Category styling ────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { accent: string; bg: string; text: string; badge: string }> = {
  Safety: {
    accent: 'border-t-red-500/70',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    badge: 'bg-red-500/15 text-red-400 border-red-500/20',
  },
  Utility: {
    accent: 'border-t-blue-500/70',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  },
  Automation: {
    accent: 'border-t-emerald-500/70',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  },
  Navigation: {
    accent: 'border-t-amber-500/70',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  },
  'Data Logging': {
    accent: 'border-t-cyan-500/70',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  },
};

const FALLBACK_STYLE = {
  accent: 'border-t-gray-500/70',
  bg: 'bg-gray-500/10',
  text: 'text-gray-400',
  badge: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

// ── Per-template icons ──────────────────────────────────────────

const TEMPLATE_ICON: Record<string, LucideIcon> = {
  'low-battery-warning': BatteryWarning,
  'geofence-alert': MapPin,
  'mode-announcement': Radio,
  'landing-gear': PlaneLanding,
  'camera-trigger': Camera,
  'terrain-follow': Mountain,
  'depth-logger': Anchor,
  'auto-rtl-battery': Home,
  'payload-drop': Package,
  'speed-limit-warning': Gauge,
  'flight-data-logger': FileSpreadsheet,
};

// ── Format interval ─────────────────────────────────────────────

function fmtInterval(ms: number): string {
  if (ms >= 1000) return `${ms / 1000}s`;
  return `${ms}ms`;
}

// ── Component ───────────────────────────────────────────────────

interface TemplateDialogProps {
  onClose: () => void;
}

export function TemplateDialog({ onClose }: TemplateDialogProps) {
  const { loadGraph, isDirty } = useLuaGraphStore();
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);

  const applyTemplate = useCallback(
    (templateId: string) => {
      const template = GRAPH_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;
      loadGraph(template.graph);
      useLuaGraphStore.setState({ filePath: null });
      onClose();
    },
    [loadGraph, onClose],
  );

  const handleSelect = useCallback(
    (templateId: string) => {
      if (isDirty) {
        setPendingTemplateId(templateId);
      } else {
        applyTemplate(templateId);
      }
    },
    [isDirty, applyTemplate],
  );

  // Group templates by category
  const categories = [...new Set(GRAPH_TEMPLATES.map((t) => t.category))];

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-900 rounded-2xl border border-gray-700/50 w-full max-w-2xl mx-4 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Layers className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Graph Templates</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Pre-built scripts to get you started quickly
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 max-h-[65vh] overflow-y-auto space-y-6">
            {categories.map((cat) => {
              const style = CATEGORY_STYLE[cat] ?? FALLBACK_STYLE;
              return (
                <div key={cat}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded border ${style.badge}`}
                    >
                      {cat}
                    </span>
                    <div className="flex-1 h-px bg-gray-800" />
                  </div>

                  {/* Template cards */}
                  <div className="grid grid-cols-2 gap-3">
                    {GRAPH_TEMPLATES.filter((t) => t.category === cat).map((template) => {
                      const Icon = TEMPLATE_ICON[template.id] ?? Layers;
                      const nodeCount = template.graph.nodes.filter(
                        (n) => n.type !== 'flow-comment',
                      ).length;
                      const edgeCount = template.graph.edges.length;

                      return (
                        <button
                          key={template.id}
                          onClick={() => handleSelect(template.id)}
                          className={`
                            group text-left rounded-xl border-t-2 border border-gray-700/30
                            bg-gray-800/50 hover:bg-gray-800 transition-all duration-200
                            hover:border-gray-600/50 hover:shadow-lg hover:shadow-black/20
                            ${style.accent}
                          `}
                        >
                          {/* Card content */}
                          <div className="p-4">
                            {/* Icon + Title row */}
                            <div className="flex items-start gap-3 mb-2.5">
                              <div
                                className={`w-9 h-9 rounded-lg ${style.bg} flex items-center justify-center shrink-0`}
                              >
                                <Icon className={`w-4.5 h-4.5 ${style.text}`} />
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium text-gray-200 group-hover:text-white transition-colors leading-tight">
                                  {template.name}
                                </div>
                                <div className="text-[11px] text-gray-500 leading-relaxed mt-1">
                                  {template.description}
                                </div>
                              </div>
                            </div>

                            {/* Stats row */}
                            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-700/20">
                              <div className="flex items-center gap-1 text-[10px] text-gray-600">
                                <GitFork className="w-3 h-3" />
                                <span>
                                  {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-gray-600">
                                <ArrowRight className="w-3 h-3" />
                                <span>
                                  {edgeCount} connection{edgeCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-gray-600">
                                <Timer className="w-3 h-3" />
                                <span>{fmtInterval(template.graph.runIntervalMs)}</span>
                              </div>
                              <div className="flex-1" />
                              <ArrowRight
                                className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-400 transition-colors"
                              />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {pendingTemplateId && (
        <ConfirmDialog
          title="Unsaved changes"
          message="Your current graph has unsaved changes. Loading a template will discard them."
          confirmLabel="Load template"
          cancelLabel="Go back"
          onConfirm={() => {
            applyTemplate(pendingTemplateId);
            setPendingTemplateId(null);
          }}
          onCancel={() => setPendingTemplateId(null)}
        />
      )}
    </>
  );
}
