import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import orderRoutes from './routes/order.routes';
import tripRoutes from './routes/trip.routes';
import prisma from './lib/prisma';
import { runSeed } from './lib/seeder';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'DMS Core Backend is running!',
    timestamp: new Date(),
  });
});

app.use('/api', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/trips', tripRoutes);

async function bootstrap() {
  try {
    const storeCount = await prisma.store.count();
    if (storeCount === 0) {
      console.log('Empty database detected. Running initial DMS seed...');
      await runSeed(prisma, false);
      console.log('Initial DMS seed completed!');
    }
  } catch (err) {
    console.warn('Database seed check warning:', err);
  }

  app.listen(PORT, () => {
    console.log(`DMS Backend listening on http://localhost:${PORT}`);
  });
}

bootstrap();
