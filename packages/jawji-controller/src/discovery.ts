// discovery.ts
import { Bonjour } from 'bonjour-service';
import { CONTROLLER_DEFAULT_PORT } from '@jawji/companion-types';
import { log } from './logs.js';

export const MDNS_SERVICE_TYPE = 'jawji-controller';

export function getMdnsServiceName(hostname: string): string {
  return `jawji-controller-${hostname}`;
}

let instance: Bonjour | null = null;

export function startDiscovery(port: number = CONTROLLER_DEFAULT_PORT, hostname: string): void {
  if (instance) return;
  instance = new Bonjour();
  const name = getMdnsServiceName(hostname);
  instance.publish({
    name,
    type: MDNS_SERVICE_TYPE,
    port,
    txt: { version: '1' },
  });
  log.info(`mDNS advertising "${name}" on _${MDNS_SERVICE_TYPE}._tcp port ${port}`);
}

export function stopDiscovery(): void {
  if (instance) {
    instance.unpublishAll();
    instance.destroy();
    instance = null;
    log.info('mDNS advertising stopped');
  }
}
