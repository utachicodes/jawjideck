import type { ComponentType } from 'react';
import type { RendererHostApi } from '@ardudeck/module-sdk';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useConnectionStore } from '../stores/connection-store';
import { useNavigationStore } from '../stores/navigation-store';
import { useParameterStore } from '../stores/parameter-store';

type RegisterFn = (slug: string, name: 'floatingOverlay', component: ComponentType) => void;

export function createRendererHostApi(
  slug: string,
  register: RegisterFn,
): RendererHostApi {
  return {
    moduleSlug: slug,

    telemetry: {
      getSnapshot: () => useTelemetryStore.getState() as unknown,
      subscribe: (listener) => useTelemetryStore.subscribe(listener as (s: unknown) => void),
    },

    connection: {
      getState: () => useConnectionStore.getState() as unknown,
      subscribe: (listener) => useConnectionStore.subscribe(listener as (s: unknown) => void),
    },

    view: {
      getCurrent: () => useNavigationStore.getState().currentView as string,
      subscribe: (listener) =>
        useNavigationStore.subscribe((s) => listener(s.currentView as string)),
    },

    params: {
      getAll: async () => {
        const state = useParameterStore.getState() as unknown as {
          parameters?: Map<string, unknown> | Record<string, unknown>;
        };
        const p = state.parameters;
        if (!p) return [];
        if (p instanceof Map) return Array.from(p.values());
        return Object.values(p);
      },
      get: async (name) => {
        const state = useParameterStore.getState() as unknown as {
          parameters?: Map<string, unknown> | Record<string, unknown>;
        };
        const p = state.parameters;
        if (!p) return undefined;
        if (p instanceof Map) return p.get(name);
        return (p as Record<string, unknown>)[name];
      },
      set: async (name, value) => {
        // Type 9 = MAV_PARAM_TYPE_REAL32 (float). Module callers must know this.
        await window.electronAPI.setParameter(name, value, 9);
      },
    },

    pty: {
      create: (opts) => window.electronAPI.moduleHostPtyCreate(slug, opts),
      write: (id, data) => window.electronAPI.moduleHostPtyWrite(id, data),
      resize: (id, cols, rows) => window.electronAPI.moduleHostPtyResize(id, cols, rows),
      kill: (id) => window.electronAPI.moduleHostPtyKill(id),
      onData: (id, cb) => window.electronAPI.moduleHostOnPtyData(id, cb),
      onExit: (id, cb) => window.electronAPI.moduleHostOnPtyExit(id, cb),
    },

    invoke: (channel, data) => window.electronAPI.moduleHostInvoke(slug, channel, data),

    log: (level, ...args) => {
      const tag = `[module:${slug}]`;
      if (level === 'error') console.error(tag, ...args);
      else if (level === 'warn') console.warn(tag, ...args);
      else console.log(tag, ...args);
    },

    registerMountPoint: (name, component) => register(slug, name, component),
  };
}
