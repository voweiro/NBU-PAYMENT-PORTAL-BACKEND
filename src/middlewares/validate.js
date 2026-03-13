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
        const details = err.errors || err.issues || [];
        console.error('Validation Error Details:', JSON.stringify(details, null, 2));
        return res.status(400).json({ success: false, error: 'Validation error', details });
      }
      next(err);
    }
  };
}

module.exports = { validate };
