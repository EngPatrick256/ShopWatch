// Central configuration (all values come from environment variables)
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  ADMIN_KEY: process.env.ADMIN_KEY || '',        // enables /admin.html
  SIGNUP_CODE: process.env.SIGNUP_CODE || '',    // if set, new shops need this code
  DEFAULT_TZ: Number(process.env.TZ_OFFSET_HOURS ?? 3), // 3 = East Africa
};
