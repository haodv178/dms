export const DELIVERY_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;

export type DeliveryHour = (typeof DELIVERY_HOURS)[number];

export const MIN_DELIVERY_HOUR = 9;
export const MAX_DELIVERY_HOUR = 19;

const DELIVERY_HOUR_SET = new Set<number>(DELIVERY_HOURS);
const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function getVietnamNowParts(now: Date = new Date()): {
  deliveryDate: string;
  hour: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '9');
  const hour = Number.isFinite(rawHour) ? rawHour % 24 : 9;

  return {
    deliveryDate: `${year}-${month}-${day}`,
    hour,
  };
}

export function clampDeliveryHour(hour: number): DeliveryHour {
  if (!Number.isFinite(hour)) return MIN_DELIVERY_HOUR;
  const rounded = Math.floor(hour);
  if (rounded < MIN_DELIVERY_HOUR) return MIN_DELIVERY_HOUR;
  if (rounded > MAX_DELIVERY_HOUR) return MAX_DELIVERY_HOUR;
  return rounded as DeliveryHour;
}

export function getDefaultDeliverySlot(now: Date = new Date()): {
  deliveryDate: string;
  hourDelivery: DeliveryHour;
} {
  const { deliveryDate, hour } = getVietnamNowParts(now);
  return {
    deliveryDate,
    hourDelivery: clampDeliveryHour(hour),
  };
}

export function parseDeliveryDate(raw: unknown): { value?: string; error?: string } {
  if (raw === undefined || raw === null || raw === '') {
    return { value: undefined };
  }
  const trimmed = String(raw).trim();
  const match = DATE_REGEX.exec(trimmed);
  if (!match) {
    return {
      error: `Ngày giao hàng không hợp lệ: "${raw}". Định dạng yêu cầu: YYYY-MM-DD.`,
    };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return {
      error: `Ngày giao hàng không tồn tại: "${trimmed}".`,
    };
  }
  return { value: trimmed };
}

export function parseHourDelivery(raw: unknown): { value?: DeliveryHour; error?: string } {
  if (raw === undefined || raw === null || raw === '') {
    return { value: undefined };
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || !DELIVERY_HOUR_SET.has(parsed)) {
    return {
      error: `Khung giờ giao hàng không hợp lệ: "${raw}". Chỉ hỗ trợ các khung giờ từ ${MIN_DELIVERY_HOUR} đến ${MAX_DELIVERY_HOUR} (${DELIVERY_HOURS.join(', ')}).`,
    };
  }
  return { value: parsed as DeliveryHour };
}

export function formatTimeslotLabel(hour: number): string {
  const start = String(hour).padStart(2, '0');
  const end = String(hour + 1).padStart(2, '0');
  return `${start}:00 - ${end}:00`;
}
