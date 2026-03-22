import { useEffect, useRef, useState, useCallback } from 'react';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer, StatRow, SectionTitle } from '../../panels/panel-utils';
import { formatDbVersion, ESP32_MODE_LABELS } from '../../../../shared/dronebridge-types';
import type { DroneBridgeStation } from '../../../../shared/dronebridge-types';

/** Map chip model ID to human-readable name */
function chipModelName(id: number): string {
  const models: Record<number, string> = {
    1: 'ESP32',
    2: 'ESP32-S2',
    5: 'ESP32-C3',
    6: 'ESP32-S3',
    12: 'ESP32-C2',
    13: 'ESP32-C6',
    16: 'ESP32-H2',
  };
  return models[id] ?? `Unknown (${id})`;
}

function formatBytesPerSec(bps: number): string {
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function SignalBars({ rssi }: { rssi: number }) {
  // rssi is in dBm, typically -30 (excellent) to -90 (weak)
  const quality = rssi > -50 ? 4 : rssi > -60 ? 3 : rssi > -70 ? 2 : 1;
  const color = quality >= 3 ? 'bg-emerald-400' : quality >= 2 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map((level) => (
        <div
          key={level}
          className={`w-1 rounded-sm ${level <= quality ? color : 'bg-gray-700'}`}
          style={{ height: `${level * 25}%` }}
        />
      ))}
      <span className="text-[10px] text-gray-500 ml-1">{rssi} dBm</span>
    </div>
  );
}

function StationRow({ station }: { station: DroneBridgeStation }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-300 font-mono">{station.sta_mac}</span>
      <SignalBars rssi={station.sta_rssi} />
    </div>
  );
}

export function DroneBridgeStatusPanel() {
  const droneBridgeIp = useCompanionStore((s) => s.droneBridgeIp);
  const droneBridgeInfo = useCompanionStore((s) => s.droneBridgeInfo);
  const droneBridgeStats = useCompanionStore((s) => s.droneBridgeStats);
  const setDroneBridgeIp = useCompanionStore((s) => s.setDroneBridgeIp);
  const setDroneBridgeInfo = useCompanionStore((s) => s.setDroneBridgeInfo);
  const setDroneBridgeStats = useCompanionStore((s) => s.setDroneBridgeStats);

  const [probeIp, setProbeIp] = useState('192.168.2.1');
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [mode, setMode] = useState<number | null>(null);
  const [reachable, setReachable] = useState(false);

  const prevBytesRef = useRef<number | null>(null);
  const prevTimeRef = useRef<number | null>(null);
  const [throughput, setThroughput] = useState(0);

  // Auto-detect on mount
  useEffect(() => {
    if (droneBridgeIp) return;
    const detect = async () => {
      try {
        const result = await window.electronAPI.dronebridgeDetect();
        if (result) {
          setDroneBridgeIp(result.ip);
          setDroneBridgeInfo(result.info);
          setReachable(true);
        }
      } catch {
        // Not found
      }
    };
    detect();
  }, [droneBridgeIp, setDroneBridgeIp, setDroneBridgeInfo]);

  // Fetch info once when IP becomes available
  useEffect(() => {
    if (!droneBridgeIp) return;
    const fetchInfo = async () => {
      try {
        const info = await window.electronAPI.dronebridgeGetInfo(droneBridgeIp);
        setDroneBridgeInfo(info);
        setReachable(true);
      } catch {
        setReachable(false);
      }
    };
    fetchInfo();
  }, [droneBridgeIp, setDroneBridgeInfo]);

  // Fetch settings once to get mode
  useEffect(() => {
    if (!droneBridgeIp) return;
    const fetchSettings = async () => {
      try {
        const settings = await window.electronAPI.dronebridgeGetSettings(droneBridgeIp);
        setMode(settings.esp32_mode);
      } catch {
        // ignore
      }
    };
    fetchSettings();
  }, [droneBridgeIp]);

  // Poll stats every 2 seconds
  useEffect(() => {
    if (!droneBridgeIp) return;

    const fetchStats = async () => {
      try {
        const stats = await window.electronAPI.dronebridgeGetStats(droneBridgeIp);
        setDroneBridgeStats(stats);
        setReachable(true);

        // Compute throughput
        const now = Date.now();
        if (prevBytesRef.current !== null && prevTimeRef.current !== null) {
          const dt = (now - prevTimeRef.current) / 1000;
          if (dt > 0) {
            const bytesDiff = stats.read_bytes - prevBytesRef.current;
            setThroughput(bytesDiff / dt);
          }
        }
        prevBytesRef.current = stats.read_bytes;
        prevTimeRef.current = now;
      } catch {
        setReachable(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [droneBridgeIp, setDroneBridgeStats]);

  const handleProbe = useCallback(async () => {
    setProbing(true);
    setProbeError(null);
    try {
      const info = await window.electronAPI.dronebridgeGetInfo(probeIp);
      setDroneBridgeIp(probeIp);
      setDroneBridgeInfo(info);
      setReachable(true);
    } catch {
      setProbeError('Could not reach DroneBridge at this address');
    } finally {
      setProbing(false);
    }
  }, [probeIp, setDroneBridgeIp, setDroneBridgeInfo]);

  // Not detected — show probe UI
  if (!droneBridgeIp) {
    return (
      <PanelContainer>
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <div className="text-center">
            <div className="text-sm text-gray-400 mb-1">No DroneBridge detected</div>
            <div className="text-xs text-gray-600">
              Enter the IP address of your DroneBridge ESP32
            </div>
          </div>

          <div className="flex items-center gap-2 w-full max-w-xs">
            <input
              type="text"
              value={probeIp}
              onChange={(e) => setProbeIp(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleProbe(); }}
              placeholder="192.168.2.1"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleProbe}
              disabled={probing}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded transition-colors"
            >
              {probing ? 'Probing...' : 'Probe'}
            </button>
          </div>

          {probeError && (
            <div className="text-xs text-red-400">{probeError}</div>
          )}
        </div>
      </PanelContainer>
    );
  }

  const totalClients = (droneBridgeStats?.tcp_connected ?? 0) + (droneBridgeStats?.udp_connected ?? 0);

  return (
    <PanelContainer>
      <div className="space-y-4">
        {/* Connection indicator */}
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full shrink-0 ${reachable ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <div>
            <div className={`text-sm font-medium ${reachable ? 'text-emerald-400' : 'text-red-400'}`}>
              {reachable ? 'Connected' : 'Unreachable'}
            </div>
            <div className="text-xs text-gray-500 font-mono">{droneBridgeIp}</div>
          </div>
        </div>

        {/* Firmware info */}
        {droneBridgeInfo && (
          <div className="space-y-1">
            <SectionTitle>Firmware</SectionTitle>
            <StatRow label="Version" value={formatDbVersion(droneBridgeInfo)} />
            <StatRow label="Chip" value={chipModelName(droneBridgeInfo.esp_chip_model)} />
            <StatRow label="MAC" value={droneBridgeInfo.esp_mac} />
            <StatRow label="IDF" value={droneBridgeInfo.idf_version} />
            {mode !== null && (
              <StatRow label="Mode" value={ESP32_MODE_LABELS[mode] ?? `Unknown (${mode})`} />
            )}
          </div>
        )}

        {/* WiFi signal */}
        {droneBridgeStats && droneBridgeStats.esp_rssi !== 0 && (
          <div className="space-y-1">
            <SectionTitle>WiFi Signal</SectionTitle>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">RSSI</span>
              <SignalBars rssi={droneBridgeStats.esp_rssi} />
            </div>
          </div>
        )}

        {/* Throughput */}
        {droneBridgeStats && (
          <div className="space-y-1">
            <SectionTitle>Throughput</SectionTitle>
            <StatRow label="Serial RX" value={formatBytesPerSec(throughput)} />
            <StatRow label="MAVLink msgs" value={droneBridgeStats.serial_dec_mav_msgs} />
            <StatRow label="Total bytes read" value={droneBridgeStats.read_bytes.toLocaleString()} />
          </div>
        )}

        {/* Connected clients */}
        {droneBridgeStats && (
          <div className="space-y-1">
            <SectionTitle>Clients ({totalClients})</SectionTitle>
            <StatRow label="TCP" value={droneBridgeStats.tcp_connected} />
            <StatRow label="UDP" value={droneBridgeStats.udp_connected} />

            {droneBridgeStats.udp_clients.length > 0 && (
              <div className="mt-1.5 p-2 bg-gray-800/50 rounded-lg">
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">UDP Clients</div>
                {droneBridgeStats.udp_clients.map((client) => (
                  <div key={client} className="text-xs text-gray-400 font-mono py-0.5">{client}</div>
                ))}
              </div>
            )}

            {droneBridgeStats.connected_sta.length > 0 && (
              <div className="mt-1.5 p-2 bg-gray-800/50 rounded-lg">
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Connected Stations</div>
                {droneBridgeStats.connected_sta.map((sta) => (
                  <StationRow key={sta.sta_mac} station={sta} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
