'use strict';
// Parse ?page&limit with sane bounds; returns { page, limit, skip }.
function parsePagination(query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}
const buildMeta = ({ page, limit }, total) => ({ page, limit, total, pages: Math.ceil(total / limit) || 1 });

module.exports = { parsePagination, buildMeta };
