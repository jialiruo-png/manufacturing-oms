import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import dashboardRouter from './routes/dashboard';
import customersRouter from './routes/customers';
import ordersRouter from './routes/orders';
import materialsRouter from './routes/materials';
import productsRouter from './routes/products';
import excelRouter from './routes/excel';
import inventoryRouter from './routes/inventory';
import usersRouter from './routes/users';
import notificationsRouter from './routes/notifications';
import { authenticate } from './middleware/authenticate';
import { httpError } from './lib/httpError';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  ...(process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',').map((origin) => origin.trim()) : []),
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
}));
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());

app.use('/api/users', usersRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api', authenticate);
app.use('/api', (req, res, next) => {
  if (!req.user?.mustChangePassword) return next();
  return next(httpError(403, '请先修改初始密码', 'PASSWORD_CHANGE_REQUIRED'));
});
app.use('/api/dashboard', dashboardRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/products', productsRouter);
app.use('/api/excel', excelRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/notifications', notificationsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
