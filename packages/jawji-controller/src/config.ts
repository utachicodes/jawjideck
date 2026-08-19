// config.ts
import path from 'path';
import os from 'os';

export const CONTROLLER_AGENT_VERSION = '0.1.0';

export interface ControllerConfig {
  port: number;
  tokenPath: string;
  fileRoot: string;
  terminalEnabled: boolean;
  terminalTimeoutMs: number;
  subnetOnly: boolean;
  protectedProcesses: string[];
}

export function loadConfig(): ControllerConfig {
  return {
    port: parseInt(process.env.JAWJI_CONTROLLER_PORT || '48400', 10),
    tokenPath: process.env.JAWJI_CONTROLLER_TOKEN_PATH
      || path.join(os.homedir(), '.jawji-controller', 'token'),
    fileRoot: process.env.JAWJI_CONTROLLER_FILE_ROOT || os.homedir(),
    terminalEnabled: process.env.JAWJI_CONTROLLER_TERMINAL !== 'false',
    terminalTimeoutMs: parseInt(
      process.env.JAWJI_CONTROLLER_TERMINAL_TIMEOUT || '1800000', 10
    ),
    subnetOnly: process.env.JAWJI_CONTROLLER_SUBNET_ONLY === 'true',
    protectedProcesses: (
      process.env.JAWJI_CONTROLLER_PROTECTED_PROCESSES
      || 'jawji-controller,mavlink-router,mavp2p,mavproxy'
    ).split(',').map(s => s.trim()),
  };
}
