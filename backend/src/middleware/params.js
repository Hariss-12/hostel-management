const HttpError = require('../utils/httpError');

// Use with router.param('id', idParam) to reject non-numeric ids
const idParam = (req, res, next, value) =>
  /^\d+$/.test(value) ? next() : next(new HttpError(400, 'Invalid id'));

module.exports = { idParam };
