'use strict';
// Loads every model so Mongoose registers all schemas/indexes. `require('./models')` anywhere is safe.
const fs = require('fs');
const path = require('path');

const models = {};
for (const file of fs.readdirSync(__dirname)) {
  if (file === 'index.js' || file.startsWith('_') || !file.endsWith('.js')) continue;
  const name = path.basename(file, '.js');
  models[name] = require(path.join(__dirname, file));
}
module.exports = models;
