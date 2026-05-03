import rateLimit from 'express-rate-limit';

export const scraperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 15, // limite de 15 requisições por hora
  message: {
    error: 'RATE_LIMIT',
    message: 'Limite de 15 consultas por hora atingido.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});
