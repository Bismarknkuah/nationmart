import { Router } from 'express';
import { SUPPORTED_CURRENCIES, convert, CurrencyCode } from '../services/currencyService';

const router = Router();

router.get('/supported', (_req, res) => {
  res.json({ currencies: SUPPORTED_CURRENCIES });
});

router.post('/convert', (req, res) => {
  const { amount, from, to } = req.body;
  if (typeof amount !== 'number' || !from || !to) {
    res.status(400).json({ error: 'amount, from and to are required.' });
    return;
  }
  res.json({ amount, from, to, result: convert(amount, from as CurrencyCode, to as CurrencyCode) });
});

export default router;
