const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');

const app = express();

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// Body parser middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount API routes
app.use('/api/v1', apiRoutes);

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

module.exports = app;
