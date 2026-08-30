/**
 * Backend entry for: npx nodemon app.js
 * Boots the NestJS app from TypeScript source with live reload.
 */
require('ts-node').register({
  transpileOnly: true,
  // Avoid merging project tsconfig (nodenext + resolvePackageJsonExports)
  // which conflicts with CommonJS runtime used by nodemon.
  skipProject: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    esModuleInterop: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    target: 'ES2021',
    sourceMap: true,
    strictNullChecks: true,
    skipLibCheck: true,
  },
});

require('./src/main.ts');
