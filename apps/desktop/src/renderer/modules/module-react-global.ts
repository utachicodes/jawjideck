import * as React from 'react';
import * as ReactDomClient from 'react-dom/client';

declare global {
  interface Window {
    __jawjiHost?: {
      react: typeof React;
      reactDom: typeof ReactDomClient;
    };
  }
}

export function installReactGlobal(): void {
  window.__jawjiHost = { react: React, reactDom: ReactDomClient };
}
