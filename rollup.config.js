import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'client/src/index.js',
  output: {
    file: 'client/dist/bundle.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [nodeResolve()],
};
