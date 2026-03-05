/**
 * In-app confirmation dialog — replaces native Electron confirm().
 */
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-gray-800 rounded-xl border border-gray-700/50 w-full max-w-sm mx-4 shadow-2xl">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700/40">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
