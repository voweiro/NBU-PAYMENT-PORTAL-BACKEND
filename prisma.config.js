require('dotenv').config();

module.exports = {
  migrations: {
    seed: 'node prisma/seed.js',
  },
};
