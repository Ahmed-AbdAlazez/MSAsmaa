const { PrismaClient } = require('@prisma/client');

/**
 * Instantiate Prisma Client singleton
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Connect to PostgreSQL database via Prisma
 */
const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('[Database] PostgreSQL Connected successfully via Prisma');
  } catch (error) {
    console.error(`[Database Error] Connection failed: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Disconnect from database gracefully
 */
const disconnectDB = async () => {
  try {
    await prisma.$disconnect();
    console.log('[Database] PostgreSQL Disconnected');
  } catch (error) {
    console.error(`[Database Error] Disconnection error: ${error.message}`);
  }
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
module.exports.prisma = prisma;

