#!/usr/bin/env node
const { register } = require('ts-node');
const { resolve } = require('path');

// Registra ts-node per caricare file .ts al volo
register({
  project: resolve(__dirname, '../tsconfig.json'),
  transpileOnly: true
});

// Carica il file principale
require(resolve(__dirname, '../index.ts'));
