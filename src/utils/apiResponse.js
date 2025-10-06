class ApiResponse {
  static ok(res, data, status = 200) {
    res.status(status).json({ success: true, data });
  }

  static error(res, message = 'Internal Server Error', status = 500) {
    const normalized =
      typeof message === 'string'
        ? message
        : message?.response?.data?.message ||
          message?.response?.data?.error ||
          message?.message ||
          (typeof message?.toString === 'function' ? message.toString() : 'Internal Server Error');
    res.status(status).json({ success: false, error: normalized });
  }
}

module.exports = ApiResponse;