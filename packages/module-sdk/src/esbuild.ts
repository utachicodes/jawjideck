import type { Plugin } from 'esbuild';

const HOST_GLOBAL_MAP: Record<string, string> = {
  'react': 'window.__jawjiHost.react',
  'react-dom': 'window.__jawjiHost.reactDom',
  'react-dom/client': 'window.__jawjiHost.reactDom',
};

export function JawjiModulePlugin(): Plugin {
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
