// discovery.ts
import { Bonjour } from 'bonjour-service';
import { CONTROLLER_DEFAULT_PORT } from '@jawji/companion-types';

let instance: Bonjour | null = null;

export function startDiscovery(port: number = CONTROLLER_DEFAULT_PORT, hostname: string): void {
  if (instance) return;
  instance = new Bonjour();
  instance.publish({
    name: `jawji-controller-${hostname}`,
    type: 'jawji-controller',
    port,
    txt: { version: '1' },
  });
  console.log(`[discovery] mDNS broadcasting on _jawji-controller._tcp port ${port}`);
}

export function stopDiscovery(): void {
  if (instance) {
    instance.unpublishAll();
    instance.destroy();
    instance = null;
  }
}
