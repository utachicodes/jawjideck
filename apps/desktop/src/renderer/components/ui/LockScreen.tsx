import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { useAppLockStore } from '../../stores/app-lock-store';

/**
 * Full-screen overlay shown when App Lock is enabled and the app has just
 * launched (or "Lock now" was used). Blocks the entire app behind it -
 * nothing underneath renders until the correct PIN is entered.
 */
export function LockScreen() {
  const username = useAppLockStore((s) => s.username);
  const verify = useAppLockStore((s) => s.verify);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    setChecking(true);
    setError(null);
    const ok = await verify(pin);
    setChecking(false);
    if (!ok) {
      setError('Incorrect PIN');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-[100]">
      <form onSubmit={handleSubmit} className="w-full max-w-xs text-center px-6">
        <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-6 h-6 text-blue-400" />
        </div>
        <div className="text-lg font-semibold text-content mb-1">
          {username ? `Welcome back, ${username}` : 'Jawji is locked'}
        </div>
        <p className="text-xs text-content-secondary mb-6">Enter your PIN to continue</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ''));
            setError(null);
          }}
          className="w-full text-center text-2xl tracking-[0.5em] bg-surface-input border border-subtle rounded-lg px-3 py-3 text-content focus:outline-none focus:border-blue-500/50"
          placeholder="----"
        />
        {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
        <button
          type="submit"
          disabled={!pin || checking}
          className="w-full mt-4 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {checking ? 'Checking...' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
