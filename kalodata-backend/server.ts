import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './src/api/routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware de Logs Estruturados
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(JSON.stringify({
      type: 'REQUEST_LOG',
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      timestamp: new Date().toISOString()
    }));
  });
  next();
});

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health check detalhado para o Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Routes
app.use('/api', routes);

// Tratamento de erros global com log JSON
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(JSON.stringify({
    type: 'ERROR_LOG',
    message: err.message,
    stack: err.stack,
    url: req.url,
    timestamp: new Date().toISOString()
  }));
  res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR', message: err.message });
});

app.listen(PORT, () => {
  console.log(JSON.stringify({
    type: 'SERVER_START',
    message: `Server running on port ${PORT}`,
    timestamp: new Date().toISOString()
  }));
});
