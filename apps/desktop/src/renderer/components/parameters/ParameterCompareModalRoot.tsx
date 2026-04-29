import { useCallback } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store.js';
import { useConnectionStore } from '../../stores/connection-store.js';
import { useNavigationStore } from '../../stores/navigation-store.js';

/**
 * Global parameter compare/apply modal. Mounted once at App root so it's
 * visible regardless of current view — critical because several flows drive
 * it (manual file load in Parameters view, Vehicle Profile apply in Settings,
 * assistant MCP `propose_parameters`, etc.) and the user would otherwise need
 * to manually navigate to Parameters view just to see the dialog.
 *
 * ParameterTable suppresses its own copy when this root instance exists,
 * except for the reboot-cycle flow which remains Parameters-view-only
 * (power feature, not needed for SITL).
 */
export function ParameterCompareModalRoot() {
  const currentView = useNavigationStore(s => s.currentView);
  // ParameterTable renders its own modal when on Parameters view so we don't
  // duplicate. This root instance covers every other view.
  if (currentView === 'parameters') return null;
  return <CompareModal />;
}

function CompareModal() {
  const showCompareModal = useParameterStore(s => s.showCompareModal);
  const fileParamDiffs = useParameterStore(s => s.fileParamDiffs);
  const fileApplyResult = useParameterStore(s => s.fileApplyResult);
  const fileSkippedCount = useParameterStore(s => s.fileSkippedCount);
  const fileTotalCount = useParameterStore(s => s.fileTotalCount);
  const fileVehicleType = useParameterStore(s => s.fileVehicleType);
  const isApplyingFileParams = useParameterStore(s => s.isApplyingFileParams);
  const applyProgress = useParameterStore(s => s.applyProgress);
  const closeCompareModal = useParameterStore(s => s.closeCompareModal);
  const toggleDiffSelection = useParameterStore(s => s.toggleDiffSelection);
  const selectAllDiffs = useParameterStore(s => s.selectAllDiffs);
  const deselectAllDiffs = useParameterStore(s => s.deselectAllDiffs);
  const applySelectedFileParams = useParameterStore(s => s.applySelectedFileParams);
  const clearFileApplyResult = useParameterStore(s => s.clearFileApplyResult);
  const connectionState = useConnectionStore(s => s.connectionState);

  const handleApply = useCallback(async () => {
    await applySelectedFileParams();
  }, [applySelectedFileParams]);

  const handleSummaryClose = useCallback(() => {
    clearFileApplyResult();
    closeCompareModal();
  }, [clearFileApplyResult, closeCompareModal]);

  const jumpToParameters = useCallback(() => {
    useNavigationStore.getState().setView('parameters');
  }, []);

  if (!showCompareModal) return null;

  return (
    <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-[120]">
      <div className="bg-surface border border-subtle rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {fileApplyResult ? (
          <SummaryView
            result={fileApplyResult}
            onClose={handleSummaryClose}
            onGoToParameters={jumpToParameters}
          />
        ) : (
          <CompareView
            diffs={fileParamDiffs}
            skippedCount={fileSkippedCount}
            totalCount={fileTotalCount}
            fileVehicleType={fileVehicleType}
            currentVehicleType={connectionState.vehicleType || connectionState.fcVariant}
            isApplying={isApplyingFileParams}
            progress={applyProgress}
            onToggle={toggleDiffSelection}
            onSelectAll={selectAllDiffs}
            onDeselectAll={deselectAllDiffs}
            onApply={handleApply}
            onCancel={closeCompareModal}
          />
        )}
      </div>
    </div>
  );
}

interface CompareViewProps {
  diffs: ReturnType<typeof useParameterStore.getState>['fileParamDiffs'];
  skippedCount: number;
  totalCount: number;
  fileVehicleType: string | null;
  currentVehicleType: string | undefined;
  isApplying: boolean;
  progress: { applied: number; total: number } | null;
  onToggle: (paramId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onApply: () => void;
  onCancel: () => void;
}

function CompareView({
  diffs, skippedCount, totalCount, fileVehicleType, currentVehicleType,
  isApplying, progress, onToggle, onSelectAll, onDeselectAll, onApply, onCancel,
}: CompareViewProps) {
  const selectedCount = diffs.filter(d => d.selected).length;
  return (
    <>
      <div className="px-6 py-4 border-b border-subtle">
        <h3 className="text-lg font-semibold text-content">Review parameter changes</h3>
        <p className="text-sm text-content-secondary mt-1">
          {diffs.length === 0
            ? 'No differences found — all parameters already match the vehicle.'
            : `${diffs.length} parameter${diffs.length !== 1 ? 's' : ''} will change. Pick which to apply.`}
        </p>
        {fileVehicleType && currentVehicleType && fileVehicleType !== currentVehicleType && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs text-amber-300">
              Source vehicle <span className="font-semibold">{fileVehicleType}</span> differs from connected vehicle <span className="font-semibold">{currentVehicleType}</span>
            </span>
          </div>
        )}
        {skippedCount > 0 && (
          <p className="text-xs text-content-secondary mt-2">
            {totalCount} total: {totalCount - skippedCount} matched the vehicle, {skippedCount} skipped (not on this firmware)
          </p>
        )}
      </div>

      {diffs.length > 0 && (
        <>
          <div className="px-6 py-2 border-b border-subtle flex items-center gap-3">
            <button onClick={onSelectAll} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Select all</button>
            <span className="text-content-tertiary">|</span>
            <button onClick={onDeselectAll} className="text-xs text-content-secondary hover:text-content transition-colors">Deselect all</button>
            <span className="ml-auto text-xs text-content-secondary">
              {selectedCount} of {diffs.length} selected
            </span>
          </div>

          <div className="flex-1 overflow-auto px-6 py-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-content-secondary uppercase">
                  <th className="pb-2 w-8"></th>
                  <th className="pb-2">Parameter</th>
                  <th className="pb-2 text-right">Current</th>
                  <th className="pb-2 text-center w-8"></th>
                  <th className="pb-2">Target</th>
                  <th className="pb-2 pl-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {diffs.map(diff => (
                  <tr
                    key={diff.paramId}
                    onClick={() => onToggle(diff.paramId)}
                    className={`cursor-pointer transition-colors ${diff.selected ? 'hover:bg-surface-overlay-subtle' : 'opacity-50 hover:opacity-75'}`}
                  >
                    <td className="py-2 pr-2">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        diff.selected ? 'bg-blue-500/30 border-blue-500/50' : 'border-subtle bg-surface'
                      }`}>
                        {diff.selected && (
                          <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </td>
                    <td className="py-2 font-mono text-content">{diff.paramId}</td>
                    <td className="py-2 text-right font-mono text-content-secondary">{formatParamValue(diff.currentValue)}</td>
                    <td className="py-2 text-center text-content-tertiary">
                      <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </td>
                    <td className="py-2 font-mono text-amber-400">{formatParamValue(diff.fileValue)}</td>
                    <td className="py-2 pl-3 text-xs text-content-secondary truncate max-w-[200px]" title={diff.note}>
                      {diff.note ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {isApplying && progress && (
        <div className="px-6 py-2 border-t border-subtle">
          <div className="flex items-center justify-between text-xs text-content-secondary mb-1">
            <span>Writing parameters…</span>
            <span>{progress.applied} / {progress.total}</span>
          </div>
          <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-150"
              style={{ width: `${(progress.applied / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={isApplying}
          className="px-4 py-2 text-sm text-content-secondary hover:text-content disabled:text-content-tertiary transition-colors"
        >
          {diffs.length === 0 ? 'Close' : 'Cancel'}
        </button>
        {diffs.length > 0 && (
          <button
            onClick={onApply}
            disabled={isApplying || selectedCount === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-surface-raised text-white disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors"
          >
            {isApplying ? 'Writing…' : `Apply ${selectedCount} param${selectedCount !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </>
  );
}

interface SummaryViewProps {
  result: NonNullable<ReturnType<typeof useParameterStore.getState>['fileApplyResult']>;
  onClose: () => void;
  onGoToParameters: () => void;
}

function SummaryView({ result, onClose, onGoToParameters }: SummaryViewProps) {
  return (
    <>
      <div className="px-6 py-4 border-b border-subtle">
        <h3 className="text-lg font-semibold text-content">Apply results</h3>
      </div>
      <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-300">
            {result.applied} parameter{result.applied !== 1 ? 's' : ''} applied
          </span>
        </div>
        {result.failed > 0 && (
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="text-sm text-red-300">
              {result.failed} parameter{result.failed !== 1 ? 's' : ''} failed
            </span>
          </div>
        )}
        {result.rebootRequired.length > 0 && (
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-sm text-amber-300">
                {result.rebootRequired.length} require reboot to take effect:
              </span>
              <p className="font-mono text-xs text-amber-400/70 mt-1">
                {result.rebootRequired.join(', ')}
              </p>
              <button
                onClick={onGoToParameters}
                className="mt-2 text-xs text-amber-300 underline hover:text-amber-200"
              >
                Go to Parameters tab to flash + reboot
              </button>
            </div>
          </div>
        )}
        {result.skippedParams.length > 0 && (
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-sm text-blue-300">
                {result.skippedParams.length} not found on this firmware:
              </span>
              <p className="font-mono text-xs text-blue-400/70 mt-1">
                {result.skippedParams.map(p => p.id).join(', ')}
              </p>
              <p className="text-xs text-content-secondary mt-1">
                These may become available after reboot
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Done
        </button>
      </div>
    </>
  );
}

function formatParamValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(parseFloat(value.toPrecision(7)));
}
