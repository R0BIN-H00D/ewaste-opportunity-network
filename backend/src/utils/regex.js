'use strict';
/** Makes user text safe to put inside a RegExp (search boxes must never be treated as patterns). */
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegex };
