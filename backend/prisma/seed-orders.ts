import { OrderStatus, PrismaClient } from '@prisma/client';
import { checkDeliveryRadius, MAX_DELIVERY_DISTANCE_KM } from '../src/lib/geo';
import { seedProducts } from '../src/lib/seeder';

const prisma = new PrismaClient();

const DEFAULT_ORDER_COUNT = 20;

const LAST_NAMES = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Võ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Hồ',
  'Ngô',
  'Dương',
];

const MIDDLE_NAMES = [
  'Văn',
  'Thị',
  'Minh',
  'Hoàng',
  'Quốc',
  'Gia',
  'Thanh',
  'Thu',
  'Hải',
  'Ngọc',
  'Anh',
  'Đức',
];

const FIRST_NAMES = [
  'An',
  'Bình',
  'Cường',
  'Dũng',
  'Hà',
  'Hùng',
  'Khánh',
  'Lan',
  'Linh',
  'Long',
  'Mai',
  'Nam',
  'Ngân',
  'Phúc',
  'Quân',
  'Thảo',
  'Trang',
  'Tuấn',
  'Uyên',
  'Vy',
];

const PHONE_PREFIXES = ['090', '091', '093', '094', '096', '097', '098', '032', '035', '070', '079'];

const STREETS = [
  'Lê Thánh Tôn',
  'Nguyễn Huệ',
  'Hai Bà Trưng',
  'Nguyễn Thị Minh Khai',
  'Võ Văn Tần',
  'Nam Kỳ Khởi Nghĩa',
  'Trần Hưng Đạo',
  'Nguyễn Trãi',
  'Lê Lai',
  'Pasteur',
  'Cách Mạng Tháng 8',
  'Nguyễn Thị Thập',
  'Nguyễn Hữu Thọ',
  'Hoàng Diệu',
  'Nguyễn Khoái',
  'Điện Biên Phủ',
];

const LANDMARKS = [
  'Chung cư Vinhomes',
  'Chung cư Sunrise City',
  'Khu dân cư Him Lam',
  'Chung cư Galaxy 9',
  'Tòa nhà Bitexco',
  'Chung cư Masteri',
  'Khu căn hộ RiverGate',
  'Chung cư Eco Green',
  'Số nhà',
  'Hẻm',
];

const DISTRICTS = [
  'Quận 1, TP.HCM',
  'Quận 3, TP.HCM',
  'Quận 4, TP.HCM',
  'Quận 5, TP.HCM',
  'Quận 7, TP.HCM',
  'Quận 10, TP.HCM',
  'Quận Bình Thạnh, TP.HCM',
  'Quận Phú Nhuận, TP.HCM',
];

function parseOrderCount(argv: string[]): number {
  let rawCount: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(
        `Usage: npm run seed:orders -- [count]\n` +
          `       npm run seed:orders -- --count <number>\n\n` +
          `Options:\n` +
          `  count, -n, --count   Number of sample orders to seed (default: ${DEFAULT_ORDER_COUNT})`
      );
      process.exit(0);
    } else if (arg === '--count' || arg === '-n') {
      rawCount = argv[++i];
    } else if (arg.startsWith('--count=')) {
      rawCount = arg.slice('--count='.length);
    } else if (arg.startsWith('-n=')) {
      rawCount = arg.slice('-n='.length);
    } else if (!arg.startsWith('-') && rawCount === undefined) {
      rawCount = arg;
    }
  }

  if (rawCount === undefined) {
    return DEFAULT_ORDER_COUNT;
  }

  const parsed = Number(rawCount);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(
      `Invalid order count: "${rawCount}". Please provide a positive integer (default: ${DEFAULT_ORDER_COUNT}).`
    );
    process.exit(1);
  }

  return parsed;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCoordinatesNearStore(
  storeLat: number,
  storeLng: number
): { latitude: number; longitude: number } {
  const maxKm = Math.max(1, MAX_DELIVERY_DISTANCE_KM - 0.5);
  const minKm = 0.4;

  for (let attempt = 0; attempt < 10; attempt++) {
    const distanceKm = minKm + Math.sqrt(Math.random()) * (maxKm - minKm);
    const angle = Math.random() * 2 * Math.PI;
    const dLat = (distanceKm * Math.cos(angle)) / 111.32;
    const cosLat = Math.cos((storeLat * Math.PI) / 180);
    const dLng = (distanceKm * Math.sin(angle)) / (111.32 * Math.max(0.1, cosLat));

    const latitude = Number((storeLat + dLat).toFixed(6));
    const longitude = Number((storeLng + dLng).toFixed(6));

    if (checkDeliveryRadius(storeLat, storeLng, latitude, longitude).ok) {
      return { latitude, longitude };
    }
  }

  return {
    latitude: Number((storeLat + 0.005).toFixed(6)),
    longitude: Number((storeLng + 0.005).toFixed(6)),
  };
}

function generateCustomerName(): string {
  return `${pickRandom(LAST_NAMES)} ${pickRandom(MIDDLE_NAMES)} ${pickRandom(FIRST_NAMES)}`;
}

function generatePhoneNumber(): string {
  const prefix = pickRandom(PHONE_PREFIXES);
  const suffix = String(randomInt(0, 9999999)).padStart(7, '0');
  return `${prefix}${suffix}`;
}

function generateAddress(): string {
  const houseNo = randomInt(1, 450);
  const landmark = pickRandom(LANDMARKS);
  const street = pickRandom(STREETS);
  const district = pickRandom(DISTRICTS);

  if (landmark === 'Số nhà') {
    return `${houseNo} ${street}, ${district}`;
  }
  if (landmark === 'Hẻm') {
    return `${houseNo}/${randomInt(1, 60)} ${street}, ${district}`;
  }
  return `${landmark}, ${houseNo} ${street}, ${district}`;
}

async function main() {
  const count = parseOrderCount(process.argv.slice(2));

  let stores = await prisma.store.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
  });
  if (stores.length === 0) {
    stores = await prisma.store.findMany({
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
  }
  if (stores.length === 0) {
    console.error('No stores (depots) found in database. Please run "npm run seed" first.');
    process.exit(1);
  }

  let products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, price: true },
  });
  if (products.length === 0) {
    products = await prisma.product.findMany({
      select: { id: true, sku: true, name: true, price: true },
    });
  }
  if (products.length === 0) {
    console.log('No products found. Seeding default sample products...');
    const seeded = await seedProducts(prisma);
    products = seeded.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      price: p.price,
    }));
  }

  const batchSuffix = Date.now().toString().slice(-6);
  const chunkSize = 20;
  let createdCount = 0;

  for (let offset = 0; offset < count; offset += chunkSize) {
    const batchEnd = Math.min(offset + chunkSize, count);
    const operations = [];

    for (let i = offset; i < batchEnd; i++) {
      const seq = i + 1;
      const store = stores[i % stores.length];
      const { latitude, longitude } = generateCoordinatesNearStore(
        store.latitude,
        store.longitude
      );

      const itemCount = randomInt(1, Math.min(4, products.length));
      const pickedIndices = new Set<number>();
      while (pickedIndices.size < itemCount) {
        pickedIndices.add(Math.floor(Math.random() * products.length));
      }

      const orderItems = Array.from(pickedIndices).map((idx) => {
        const prod = products[idx];
        return {
          productId: prod.id,
          sku: prod.sku,
          productName: prod.name,
          quantity: randomInt(1, 4),
          price: Number(prod.price),
        };
      });

      const totalAmount = orderItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const orderCode = `ORD-${batchSuffix}-${String(seq).padStart(4, '0')}`;

      operations.push(
        prisma.order.create({
          data: {
            orderCode,
            storeId: store.id,
            customerName: generateCustomerName(),
            customerPhone: generatePhoneNumber(),
            customerAddress: generateAddress(),
            latitude,
            longitude,
            totalAmount,
            status: OrderStatus.NEW,
            items: {
              create: orderItems,
            },
          },
        })
      );
    }

    const created = await prisma.$transaction(operations);
    createdCount += created.length;
  }

  const totalOrders = await prisma.order.count();
  console.log(
    `Seeded ${createdCount} order(s) across ${stores.length} store(s). Total orders in database: ${totalOrders}`
  );
}

main()
  .catch((err) => {
    console.error('Failed to seed orders:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
