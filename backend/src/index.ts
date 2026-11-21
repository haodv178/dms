import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import driverRoutes from './routes/driver.routes';
import orderRoutes from './routes/order.routes';
import productRoutes from './routes/product.routes';
import storeRoutes from './routes/store.routes';
import tripRoutes from './routes/trip.routes';
import prisma from './lib/prisma';
import { runSeed, seedDrivers, seedProducts } from './lib/seeder';
import { ensureStoreDefaults } from './controllers/store.controller';
import { ensureHashedUserPasswords } from './lib/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (
  process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:4173,http://localhost:8080'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (e.g., curl, mobile apps, same-origin)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'DMS Core Backend is running!',
    timestamp: new Date(),
  });
});

app.use('/api', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/trips', tripRoutes);

async function bootstrap() {
  try {
    const storeCount = await prisma.store.count();
    if (storeCount === 0) {
      console.log('Empty database detected. Running initial DMS seed...');
      await runSeed(prisma, false);
      console.log('Initial DMS seed completed!');
    } else {
      await ensureStoreDefaults(prisma);
      const productCount = await prisma.product.count();
      if (productCount === 0) {
        console.log('Empty product catalog detected. Seeding sample products...');
        await seedProducts(prisma);
      }
      const driverProfileCount = await prisma.driverProfile.count();
      if (driverProfileCount === 0) {
        console.log('Empty driver profiles detected. Seeding sample drivers...');
        await seedDrivers(prisma);
      }
    }

    const hashedCount = await ensureHashedUserPasswords(prisma);
    if (hashedCount > 0) {
      console.log(`Hashed ${hashedCount} legacy plaintext user password(s) with bcrypt.`);
    }
  } catch (err) {
    console.warn('Database seed check warning:', err);
  }

  app.listen(PORT, () => {
    console.log(`DMS Backend listening on http://localhost:${PORT}`);
  });
}

bootstrap();
