import { defineConfig } from 'vite';
import path from 'path';
import { transformJison } from './src/jison-transformer';


export default defineConfig({
  plugins: [createJisonPlugin()],
  resolve: {
    extensions: ['.js', '.json', '.jison'],
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/main.js'),
      name: 'vextab',
      fileName: 'vextab'
    },
    rollupOptions: {
      input: {
        test: 'tests/tests.js',
        playground: 'tests/playground.js',
      }
    }
  },
  server: {
    port: 9005,
    open: '/tests/tests.html',
  },
});

function createJisonPlugin() {
  return {
    name: 'jison-plugin',
    async transform(code, id) {
      if (id.endsWith('.jison')) {
        const transformedCode = transformJison(code);
        return {
          code: transformedCode,
          map: null, // if source map is available, provide it here
        };
      }
    },
  };
}