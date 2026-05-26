require('dotenv').config({ silent: true });

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'dim-realty-jwt-secret-2024-ua',
  PORT: process.env.PORT || 3000,
};
