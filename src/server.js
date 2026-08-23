const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');

const PORT = process.env.PORT || 5001;

// Connect to PostgreSQL database and start server
const startServer = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`[Server] Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });

    // Handle graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDB();
        console.log("connecting succes with postgresql")
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      console.error(`[Server Error] Unhandled Rejection: ${err.message}`);
      server.close(async () => {
        await disconnectDB();
        process.exit(1);
      });
    });
  } catch (error) {
    console.error('[Database] Database connection error:', error);
    process.exit(1);
  }
};

startServer();

