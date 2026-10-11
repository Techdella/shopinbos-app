// Pure analytics helpers for the seller insights page. Kept free of DB/server imports so they can be unit tested.

export const PAID_ORDER_STATUSES = ["paid", "processing", "packed", "shipped", "delivered"] as const;

export interface InsightOrder {
  total: number;
  status: string;
  createdAt: Date;
  buyerEmail: string;
  deliveryAddress: unknown;
  items: unknown;
}

export interface SellerInsights {
  revenue: number;
  paidOrders: number;
  totalOrders: number;
  aov: number;
  repeatRate: number | null;
  daily: { data: number[]; labels: string[] };
  cities: { city: string; revenue: number; share: number }[];
  cityCount: number;
  hours: number[];
  peakHour: number | null;
  cohorts: { month: string; retention: number[] }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
}

const TIME_ZONE = "Africa/Lagos";

function lagosParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

function dayKey(date: Date) {
  const { year, month, day } = lagosParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthIndex(date: Date) {
  const { year, month } = lagosParts(date);
  return year * 12 + (month - 1);
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function cityOf(address: unknown) {
  if (!address || typeof address !== "object" || Array.isArray(address)) return null;
  const city = (address as Record<string, unknown>).city;
  if (typeof city !== "string" || !city.trim()) return null;
  const trimmed = city.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function computeSellerInsights(orders: InsightOrder[], now = new Date(), days = 30, cohortMonths = 5): SellerInsights {
  const paidStatuses = new Set<string>(PAID_ORDER_STATUSES);
  const paid = orders.filter((o) => paidStatuses.has(o.status));
  const revenue = paid.reduce((sum, o) => sum + Number(o.total || 0), 0);

  // Repeat rate: share of paying buyers with more than one paid order.
  const ordersByBuyer = new Map<string, InsightOrder[]>();
  for (const order of paid) {
    const email = order.buyerEmail.trim().toLowerCase();
    if (!email) continue;
    ordersByBuyer.set(email, [...(ordersByBuyer.get(email) ?? []), order]);
  }
  const buyers = ordersByBuyer.size;
  const repeatBuyers = Array.from(ordersByBuyer.values()).filter((list) => list.length > 1).length;

  // Daily revenue for the trailing window, oldest first.
  const dayKeys: string[] = [];
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86_400_000);
    dayKeys.push(dayKey(date));
    const { month, day } = lagosParts(date);
    labels.push((days - 1 - i) % 7 === 0 ? `${MONTH_NAMES[month - 1]} ${day}` : "");
  }
  const dailyMap = new Map(dayKeys.map((key) => [key, 0]));
  for (const order of paid) {
    const key = dayKey(order.createdAt);
    if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(order.total || 0));
  }

  const cityTotals = new Map<string, number>();
  for (const order of paid) {
    const city = cityOf(order.deliveryAddress);
    if (city) cityTotals.set(city, (cityTotals.get(city) ?? 0) + Number(order.total || 0));
  }
  const cities = Array.from(cityTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([city, value]) => ({ city, revenue: value, share: revenue > 0 ? value / revenue : 0 }));

  const hours = Array.from({ length: 24 }, () => 0);
  for (const order of paid) hours[lagosParts(order.createdAt).hour] += 1;
  const peakCount = Math.max(...hours);
  const peakHour = peakCount > 0 ? hours.indexOf(peakCount) : null;

  // Cohorts: buyers grouped by first paid-order month; retention = share who ordered again k months later.
  const currentMonth = monthIndex(now);
  const firstMonthByBuyer = new Map<string, number>();
  const activeMonthsByBuyer = new Map<string, Set<number>>();
  for (const [email, list] of ordersByBuyer) {
    const months = new Set(list.map((o) => monthIndex(o.createdAt)));
    activeMonthsByBuyer.set(email, months);
    firstMonthByBuyer.set(email, Math.min(...months));
  }
  const cohorts: SellerInsights["cohorts"] = [];
  for (let m = currentMonth - (cohortMonths - 1); m <= currentMonth; m++) {
    const members = Array.from(firstMonthByBuyer.entries()).filter(([, first]) => first === m).map(([email]) => email);
    if (members.length === 0) continue;
    const retention: number[] = [];
    for (let k = 0; m + k <= currentMonth && k < cohortMonths; k++) {
      const active = members.filter((email) => activeMonthsByBuyer.get(email)?.has(m + k)).length;
      retention.push(Math.round((active / members.length) * 100));
    }
    cohorts.push({ month: MONTH_NAMES[((m % 12) + 12) % 12], retention });
  }

  const productStats = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const order of paid) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const name = String(item.name ?? item.title ?? "Product");
      const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;
      const price = Number(item.price ?? item.unitPrice ?? 0) || 0;
      const current = productStats.get(name) ?? { name, quantity: 0, revenue: 0 };
      current.quantity += quantity;
      current.revenue += price * quantity;
      productStats.set(name, current);
    }
  }

  return {
    revenue,
    paidOrders: paid.length,
    totalOrders: orders.length,
    aov: paid.length > 0 ? revenue / paid.length : 0,
    repeatRate: buyers > 0 ? repeatBuyers / buyers : null,
    daily: { data: dayKeys.map((key) => dailyMap.get(key) ?? 0), labels },
    cities,
    cityCount: cityTotals.size,
    hours,
    peakHour,
    cohorts,
    topProducts: Array.from(productStats.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 4),
  };
}
