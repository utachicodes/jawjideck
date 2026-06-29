import { useState, useEffect } from 'react';

export function OpenAipKeyInput() {
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.electronAPI?.getApiKey('openaip').then((result: { hasKey: boolean; key: string }) => {
      if (result?.hasKey) { setHasKey(true); setKey(result.key); }
    });
  }, []);

  const handleSave = async () => {
    await window.electronAPI?.setApiKey('openaip', key.trim());
    setHasKey(!!key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <label className="block text-xs text-content-secondary mb-1.5">
        OpenAIP API Key
        <span className="text-content-tertiary ml-1">— free at</span>{' '}
        <a href="https://www.openaip.net" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">openaip.net</a>
      </label>
      <div className="flex gap-2">
        <input type="password" value={key} onChange={(e) => { setKey(e.target.value); setSaved(false); }} placeholder={hasKey ? '••••••••••••••••' : 'Paste your API key'} className="flex-1 px-3 py-1.5 bg-surface-input border border-border rounded-lg text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500" />
        <button onClick={handleSave} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">{saved ? 'Saved' : 'Save'}</button>
      </div>
      {hasKey && !saved && <p className="text-xs text-emerald-400 mt-1">Key configured</p>}
    </div>
  );
}
