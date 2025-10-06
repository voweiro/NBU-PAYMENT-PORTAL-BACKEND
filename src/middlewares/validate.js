const { ZodError } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    try {
      const data = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      req.validated = data;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      next(err);
    }
  };
}

module.exports = { validate };