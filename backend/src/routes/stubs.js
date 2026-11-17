'use strict';
// Visible route map for modules that land in later phases. Every stub returns 501 so nothing silently "works".
// REMOVE each entry as its real router is mounted in routes/index.js (no 501s may remain at release — tasklist P10).
const router = require('express').Router();

const PLANNED = {
  P8: ['geo'],
  P9: ['ai', 'education'],
};

for (const [phase, prefixes] of Object.entries(PLANNED)) {
  for (const prefix of prefixes) {
    router.use(`/${prefix}`, (req, res) =>
      res.status(501).json({ success: false, message: `/${prefix} is planned for ${phase} and is not implemented yet`, code: 'NOT_IMPLEMENTED' }),
    );
  }
}

module.exports = router;
