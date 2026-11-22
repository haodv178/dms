import 'dotenv/config';
import { DriverStatus, OrderStatus, Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VALID_STATUSES = new Set<string>(Object.values(OrderStatus));

interface CliOptions {
  all: boolean;
  dryRun: boolean;
  help: boolean;
  statuses: OrderStatus[];
  storeId?: number;
  depotCode?: string;
  orderCodes: string[];
  ids: number[];
}

function printUsage() {
  console.log(`
Usage: npm --prefix backend run delete:orders -- [options]

Options:
  --all                   Delete all orders
  --status=<S1,S2>        Delete orders with status (NEW, PICKING, PACKED, DELIVERING, COMPLETED, FAILED)
  --store=<id>            Delete orders belonging to a depot/store ID (e.g. --store=1)
  --depot=<code>          Delete orders belonging to a depot code (e.g. --depot=DEP-001)
  --code=<C1,C2>          Delete specific orders by orderCode (comma-separated)
  --id=<1,2>              Delete specific orders by numeric ID (comma-separated)
  --dry-run               Preview matching orders without deleting anything
  -h, --help              Show this help message

Examples:
  npm --prefix backend run delete:orders -- --all
  npm --prefix backend run delete:orders -- --all --dry-run
  npm --prefix backend run delete:orders -- --status=NEW,FAILED
  npm --prefix backend run delete:orders -- --depot=DEP-001 --status=NEW
  npm --prefix backend run delete:orders -- --code=ORD-1001,ORD-1002
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    all: false,
    dryRun: false,
    help: false,
    statuses: [],
    orderCodes: [],
    ids: [],
  };

  for (const arg of argv) {
    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--status=')) {
      const raw = arg.slice('--status='.length).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      for (const s of raw) {
        if (!VALID_STATUSES.has(s)) {
          throw new Error(`Invalid status "${s}". Valid values: ${Object.values(OrderStatus).join(', ')}`);
        }
        options.statuses.push(s as OrderStatus);
      }
    } else if (arg.startsWith('--store=')) {
      const parsed = Number(arg.slice('--store='.length).trim());
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --store value: "${arg}"`);
      }
      options.storeId = parsed;
    } else if (arg.startsWith('--depot=')) {
      const code = arg.slice('--depot='.length).trim().toUpperCase();
      if (!code) {
        throw new Error(`Invalid --depot value: "${arg}"`);
      }
      options.depotCode = code;
    } else if (arg.startsWith('--code=')) {
      const codes = arg.slice('--code='.length).split(',').map((s) => s.trim()).filter(Boolean);
      options.orderCodes.push(...codes);
    } else if (arg.startsWith('--id=')) {
      const rawIds = arg.slice('--id='.length).split(',').map((s) => s.trim()).filter(Boolean);
      for (const idStr of rawIds) {
        const parsed = Number(idStr);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`Invalid order ID: "${idStr}"`);
        }
        options.ids.push(parsed);
      }
    } else {
      throw new Error(`Unknown argument: "${arg}". Run with --help for usage.`);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const hasFilter =
    options.all ||
    options.statuses.length > 0 ||
    options.storeId !== undefined ||
    options.depotCode !== undefined ||
    options.orderCodes.length > 0 ||
    options.ids.length > 0;

  if (!hasFilter) {
    console.error('Error: Please specify --all or at least one filter (--status, --store, --depot, --code, --id).');
    printUsage();
    process.exit(1);
  }

  const where: Prisma.OrderWhereInput = {};

  if (!options.all) {
    if (options.statuses.length > 0) {
      where.status = { in: options.statuses };
    }
    if (options.storeId !== undefined) {
      where.storeId = options.storeId;
    }
    if (options.depotCode !== undefined) {
      const store = await prisma.store.findUnique({
        where: { code: options.depotCode },
        select: { id: true, name: true },
      });
      if (!store) {
        throw new Error(`Depot with code "${options.depotCode}" not found.`);
      }
      where.storeId = store.id;
    }
    if (options.orderCodes.length > 0) {
      where.orderCode = { in: options.orderCodes };
    }
    if (options.ids.length > 0) {
      where.id = { in: options.ids };
    }
  }

  const matchingOrders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      orderCode: true,
      status: true,
      tripId: true,
      storeId: true,
    },
    orderBy: { id: 'asc' },
  });

  if (matchingOrders.length === 0) {
    console.log('No matching orders found.');
    return;
  }

  const orderIds = matchingOrders.map((o) => o.id);
  const affectedTripIds = Array.from(
    new Set(matchingOrders.map((o) => o.tripId).filter((id): id is number => id !== null))
  );

  if (options.dryRun) {
    console.log(`[DRY RUN] Would delete ${matchingOrders.length} order(s) (affecting ${affectedTripIds.length} trip(s)):`);
    for (const o of matchingOrders.slice(0, 20)) {
      console.log(`  - #${o.id} ${o.orderCode} (${o.status}, storeId=${o.storeId}, tripId=${o.tripId ?? 'none'})`);
    }
    if (matchingOrders.length > 20) {
      console.log(`  ... and ${matchingOrders.length - 20} more.`);
    }
    return;
  }

  const summary = await prisma.$transaction(async (tx) => {
    const deletedOrders = await tx.order.deleteMany({
      where: { id: { in: orderIds } },
    });

    let deletedTripsCount = 0;
    let updatedTripsCount = 0;
    const affectedDriverIds = new Set<number>();

    for (const tripId of affectedTripIds) {
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: { id: true, driverId: true },
      });
      if (!trip) continue;

      if (trip.driverId) {
        affectedDriverIds.add(trip.driverId);
      }

      const remainingOrders = await tx.order.findMany({
        where: { tripId },
        orderBy: [{ deliverySequence: 'asc' }, { id: 'asc' }],
        select: { id: true, status: true },
      });

      if (remainingOrders.length === 0) {
        await tx.trip.delete({ where: { id: tripId } });
        deletedTripsCount++;
      } else {
        for (let idx = 0; idx < remainingOrders.length; idx++) {
          await tx.order.update({
            where: { id: remainingOrders[idx].id },
            data: { deliverySequence: idx + 1 },
          });
        }
        const hasDelivering = remainingOrders.some((o) => o.status === OrderStatus.DELIVERING);
        await tx.trip.update({
          where: { id: tripId },
          data: {
            totalDistance: null,
            ...(hasDelivering ? {} : { status: 'COMPLETED' }),
          },
        });
        updatedTripsCount++;
      }
    }

    let releasedDriversCount = 0;
    for (const driverId of affectedDriverIds) {
      const otherActiveTrips = await tx.trip.count({
        where: {
          driverId,
          status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        },
      });
      if (otherActiveTrips === 0) {
        const res = await tx.driverProfile.updateMany({
          where: {
            userId: driverId,
            isActive: true,
            status: DriverStatus.ON_DELIVERY,
          },
          data: { status: DriverStatus.AVAILABLE },
        });
        releasedDriversCount += res.count;
      }
    }

    return {
      deletedOrdersCount: deletedOrders.count,
      deletedTripsCount,
      updatedTripsCount,
      releasedDriversCount,
    };
  });

  console.log(
    `Deleted ${summary.deletedOrdersCount} order(s), removed ${summary.deletedTripsCount} empty trip(s), updated ${summary.updatedTripsCount} trip(s), and reset ${summary.releasedDriversCount} driver(s) to AVAILABLE.`
  );
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
