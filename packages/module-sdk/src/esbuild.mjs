/**
 * esbuild plugin that redirects host-provided globals (React, ReactDOM) to
 * `window.__jawjiHost` instead of bundling them into the module — keeps
 * modules small and avoids shipping a second React copy into the renderer.
 *
 * Plain JS, not TypeScript: this file is loaded directly by `node` from
 * consumers' `esbuild.config.mjs` build scripts, which run outside of any
 * bundler/TS-loader, so it can't rely on TypeScript syntax stripping.
 *
 * @returns {import('esbuild').Plugin}
 */

const HOST_GLOBAL_MAP = {
  'react': 'window.__jawjiHost.react',
  'react-dom': 'window.__jawjiHost.reactDom',
  'react-dom/client': 'window.__jawjiHost.reactDom',
};

export function JawjiModulePlugin() {
  return {
    name: 'jawji-module-host-externals',
    setup(build) {
      const escaped = Object.keys(HOST_GLOBAL_MAP)
        .map((s) => s.replace(/\//g, '\\/'))
        .join('|');
      const filter = new RegExp(`^(${escaped})$`);
      build.onResolve({ filter }, (args) => ({
        path: args.path,
        namespace: 'jawji-host-ext',
      }));
      build.onLoad({ filter: /.*/, namespace: 'jawji-host-ext' }, (args) => {
        const target = HOST_GLOBAL_MAP[args.path];
        if (!target) return { contents: '', loader: 'js' };
        return {
          contents: `module.exports = ${target};`,
          loader: 'js',
        };
      });
    },
  };
}
