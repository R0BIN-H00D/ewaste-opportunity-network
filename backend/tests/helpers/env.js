'use strict';
// Must be required BEFORE any src/ module (src/config/env.js reads process.env once).
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-123';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-123';
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `ewaste-test-uploads-${process.pid}`);
process.env.RATE_LIMIT_MAX = '100000';
process.env.BCRYPT_COST = '4';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
process.env.CONTACT_RATE_LIMIT_MAX = '100000';
process.env.REFRESH_TTL_DAYS = '14';
