import { Prisma } from '@prisma/client';

export const LOW_STOCK_THRESHOLD = 10;

export interface InventoryItemInput {
  productId: number | null | undefined;
  productName?: string;
  quantity: number;
}

export class InsufficientStockError extends Error {
  statusCode = 400;
  details: Array<{
    productId: number;
    productName: string;
    requested: number;
    available: number;
  }>;

  constructor(
    message: string,
    details: Array<{
      productId: number;
      productName: string;
      requested: number;
      available: number;
    }>
  ) {
    super(message);
    this.name = 'InsufficientStockError';
    this.details = details;
  }
}

export function aggregateItemQuantities(
  items: InventoryItemInput[]
): Array<{ productId: number; productName: string; quantity: number }> {
  const byProduct = new Map<number, { productName: string; quantity: number }>();

  for (const item of items) {
    const productId = Number(item.productId);
    const qty = Number(item.quantity);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(qty) || qty <= 0) {
      continue;
    }

    const existing = byProduct.get(productId);
    if (existing) {
      existing.quantity += qty;
    } else {
      byProduct.set(productId, {
        productName: item.productName?.trim() || `Sản phẩm #${productId}`,
        quantity: qty,
      });
    }
  }

  return Array.from(byProduct.entries())
    .map(([productId, info]) => ({
      productId,
      productName: info.productName,
      quantity: info.quantity,
    }))
    .sort((a, b) => a.productId - b.productId);
}

/**
 * Atomically validates and deducts stock at a specific depot inside a Prisma transaction.
 * Throws InsufficientStockError if any product does not have enough stock at the depot.
 */
export async function deductDepotStock(
  tx: Prisma.TransactionClient,
  storeId: number,
  storeName: string,
  items: InventoryItemInput[]
): Promise<void> {
  const aggregated = aggregateItemQuantities(items);
  if (aggregated.length === 0) return;

  const insufficient: Array<{
    productId: number;
    productName: string;
    requested: number;
    available: number;
  }> = [];

  for (const entry of aggregated) {
    const updated = await tx.depotStock.updateMany({
      where: {
        storeId,
        productId: entry.productId,
        quantity: { gte: entry.quantity },
      },
      data: {
        quantity: { decrement: entry.quantity },
      },
    });

    if (updated.count === 0) {
      const current = await tx.depotStock.findUnique({
        where: {
          storeId_productId: {
            storeId,
            productId: entry.productId,
          },
        },
        select: { quantity: true },
      });
      insufficient.push({
        productId: entry.productId,
        productName: entry.productName,
        requested: entry.quantity,
        available: current?.quantity ?? 0,
      });
    }
  }

  if (insufficient.length > 0) {
    const summary = insufficient
      .map(
        (item) =>
          `"${item.productName}" (cần ${item.requested}, còn ${item.available})`
      )
      .join(', ');
    throw new InsufficientStockError(
      `Không đủ tồn kho tại "${storeName}" cho: ${summary}.`,
      insufficient
    );
  }
}

/**
 * Restores (increments) stock at a specific depot inside a Prisma transaction.
 */
export async function restoreDepotStock(
  tx: Prisma.TransactionClient,
  storeId: number,
  items: InventoryItemInput[]
): Promise<void> {
  const aggregated = aggregateItemQuantities(items);
  if (aggregated.length === 0) return;

  for (const entry of aggregated) {
    await tx.depotStock.upsert({
      where: {
        storeId_productId: {
          storeId,
          productId: entry.productId,
        },
      },
      update: {
        quantity: { increment: entry.quantity },
      },
      create: {
        storeId,
        productId: entry.productId,
        quantity: entry.quantity,
      },
    });
  }
}
