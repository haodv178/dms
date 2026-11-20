import { PrismaClient } from '@prisma/client';
import { runSeed } from '../src/lib/seeder';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial DMS data...');
  const result = await runSeed(prisma, true);
  console.log(`Seeding completed successfully! Created 1 Store, ${result.users.length} Users, and ${result.ordersCount} Orders.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
