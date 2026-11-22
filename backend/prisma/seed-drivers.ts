import 'dotenv/config';
import { DriverStatus, PrismaClient, Role } from '@prisma/client';
import { DEFAULT_DEMO_PASSWORD, hashPassword } from '../src/lib/auth';

const prisma = new PrismaClient();

const DRIVERS_PER_DEPOT = 2;

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
  'Lý',
  'Trương',
];

const MIDDLE_NAMES = [
  'Văn',
  'Minh',
  'Hoàng',
  'Quốc',
  'Gia',
  'Thanh',
  'Hải',
  'Anh',
  'Đức',
  'Tuấn',
  'Tiến',
  'Thành',
  'Xuân',
  'Hữu',
];

const FIRST_NAMES = [
  'An',
  'Bình',
  'Cường',
  'Dũng',
  'Hùng',
  'Khánh',
  'Khoa',
  'Kiên',
  'Lâm',
  'Long',
  'Nam',
  'Nghĩa',
  'Nhân',
  'Phong',
  'Phúc',
  'Quân',
  'Quang',
  'Sơn',
  'Tài',
  'Tâm',
  'Thắng',
  'Thịnh',
  'Toàn',
  'Trung',
  'Tuấn',
  'Vinh',
];

const PHONE_PREFIXES = ['090', '091', '093', '094', '096', '097', '098', '032', '035', '070', '079'];

const VEHICLE_TYPES = ['Xe máy', 'Xe van', 'Xe tải nhỏ'] as const;

const MOTO_SERIES = [
  '59B1',
  '59C2',
  '59D1',
  '59E1',
  '59G1',
  '59H1',
  '59L1',
  '59M1',
  '59N1',
  '59P1',
  '59S1',
  '59T1',
  '59U1',
  '59V1',
  '59X3',
  '59Y1',
];

const NOTE_TEMPLATES = [
  (depot: string) => `Phụ trách tuyến giao nhanh khu vực ${depot}`,
  (depot: string) => `Ca sáng (07:00 - 15:00) tại kho ${depot}`,
  (depot: string) => `Ca chiều (13:00 - 21:00) tại kho ${depot}`,
  (depot: string) => `Chuyên giao đơn hàng tươi sống khu vực ${depot}`,
  (depot: string) => `Chuyên đơn hàng cồng kềnh xuất phát từ ${depot}`,
  (depot: string) => `Thông thạo tuyến đường nội thành quanh ${depot}`,
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}

function stripVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

function buildEmailBase(fullName: string): string {
  const parts = stripVietnamese(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'user';
  if (parts.length === 1) return parts[0];
  const firstName = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((part) => part[0])
    .join('');
  return `${firstName}${initials}`;
}

function generateLicensePlate(vehicleType: (typeof VEHICLE_TYPES)[number]): string {
  const part1 = randomDigits(3);
  const part2 = randomDigits(2);
  if (vehicleType === 'Xe van') {
    return `51D-${part1}.${part2}`;
  }
  if (vehicleType === 'Xe tải nhỏ') {
    return `51C-${part1}.${part2}`;
  }
  return `${pickRandom(MOTO_SERIES)}-${part1}.${part2}`;
}

function generatePhone(): string {
  return `${pickRandom(PHONE_PREFIXES)}${randomDigits(7)}`;
}

async function generateUniqueEmail(
  fullName: string,
  usedEmails: Set<string>
): Promise<string> {
  const base = buildEmailBase(fullName);

  for (let suffix = 1; suffix <= 999; suffix++) {
    const email = suffix === 1 ? `${base}@dms.vn` : `${base}${suffix}@dms.vn`;
    if (usedEmails.has(email)) continue;
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!existing) {
      usedEmails.add(email);
      return email;
    }
  }

  const fallback = `${base}${Date.now()}@dms.vn`;
  usedEmails.add(fallback);
  return fallback;
}

async function main() {
  const argCount = Number(process.argv[2]);
  const perDepot =
    Number.isInteger(argCount) && argCount > 0 ? argCount : DRIVERS_PER_DEPOT;

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });

  if (stores.length === 0) {
    console.log('No active depots found.');
    return;
  }

  const hashedPassword = await hashPassword(DEFAULT_DEMO_PASSWORD);
  const usedEmails = new Set<string>();
  const usedPhones = new Set<string>();
  const usedPlates = new Set<string>();

  const createdDrivers: Array<{
    id: number;
    depotCode: string;
    depotName: string;
    name: string;
    email: string;
    phone: string;
    vehicleType: string;
    licensePlate: string;
    status: DriverStatus;
    notes: string;
  }> = [];

  for (const store of stores) {
    const depotCode = store.code || `DEP-${String(store.id).padStart(3, '0')}`;

    for (let i = 0; i < perDepot; i++) {
      const lastName = pickRandom(LAST_NAMES);
      const middleName = pickRandom(MIDDLE_NAMES);
      const firstName = pickRandom(FIRST_NAMES);
      const fullName = `${lastName} ${middleName} ${firstName}`;

      const email = await generateUniqueEmail(fullName, usedEmails);

      let phone = generatePhone();
      while (usedPhones.has(phone)) {
        phone = generatePhone();
      }
      usedPhones.add(phone);

      const vehicleType = pickRandom(VEHICLE_TYPES);
      let licensePlate = generateLicensePlate(vehicleType);
      while (usedPlates.has(licensePlate)) {
        licensePlate = generateLicensePlate(vehicleType);
      }
      usedPlates.add(licensePlate);

      const notes = pickRandom(NOTE_TEMPLATES)(store.name);

      const user = await prisma.user.create({
        data: {
          name: fullName,
          email,
          password: hashedPassword,
          role: Role.DRIVER,
          isActive: true,
          driverProfile: {
            create: {
              storeId: store.id,
              phone,
              vehicleType,
              licensePlate,
              status: DriverStatus.AVAILABLE,
              isActive: true,
              notes,
            },
          },
        },
        include: {
          driverProfile: true,
        },
      });

      createdDrivers.push({
        id: user.id,
        depotCode,
        depotName: store.name,
        name: user.name,
        email: user.email,
        phone,
        vehicleType,
        licensePlate,
        status: DriverStatus.AVAILABLE,
        notes,
      });
    }
  }

  console.log(
    `Created ${createdDrivers.length} drivers (${perDepot} per depot across ${stores.length} depots). Default password: ${DEFAULT_DEMO_PASSWORD}`
  );
  console.log(JSON.stringify(createdDrivers, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
