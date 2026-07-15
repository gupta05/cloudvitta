/**
 * Parse pagination params from query string.
 * Returns { skip, take, page, perPage }
 */
export function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(query.perPage) || 20));
  return {
    page,
    perPage,
    skip: (page - 1) * perPage,
    take: perPage,
  };
}

/**
 * Build a paginated response object.
 */
export function paginatedResponse(data, totalCount, { page, perPage }) {
  return {
    data,
    pagination: {
      page,
      perPage,
      totalCount,
      totalPages: Math.ceil(totalCount / perPage),
    },
  };
}
