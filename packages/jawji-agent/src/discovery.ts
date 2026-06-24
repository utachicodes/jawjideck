// discovery.ts
import { Bonjour } from 'bonjour-service';
import { AGENT_DEFAULT_PORT } from '@jawji/companion-types';

let instance: Bonjour | null = null;

export function startDiscovery(port: number = AGENT_DEFAULT_PORT, hostname: string): void {
  if (instance) return;
  instance = new Bonjour();
  instance.publish({
    name: `jawji-agent-${hostname}`,
    type: 'Jawji-agent',
    port,
    txt: { version: '1' },
  });
  console.log(`[discovery] mDNS broadcasting on _jawji-agent._tcp port ${port}`);
}

export function stopDiscovery(): void {
  if (instance) {
    instance.unpublishAll();
    instance.destroy();
    instance = null;
  }
}
