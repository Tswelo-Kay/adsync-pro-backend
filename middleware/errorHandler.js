const errorHandler = (err, req, res, next) => {
  console.error('ERROR:', err.message);

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: err.errors.map(e => e.message).join(', ')
    });
  }

  // Sequelize unique constraint (duplicate email)
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      success: false,
      message: 'That email is already registered.'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.'
    });
  }

  // File too large
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 50MB.'
    });
  }

  // Default error
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Something went wrong. Please try again.'
  });
};

module.exports = errorHandler;