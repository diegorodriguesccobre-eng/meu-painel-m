import { createHash } from 'node:crypto';
import {
  salesError,
  isNonNegative,
  toCents,
  readProductValue,
  applyItemDiscounts,
  classifyPayment
} from './ml-sales-rules.mjs';

export const SALES_FIELDS = [
  'revenue', 'paidRevenue', 'cancelledRevenue', 'refundedRevenue',
  'discountRevenue', 'cashbackRevenue', 'orders', 'units', 'cancelledOrders',
  'refundedOrders', 'refundReview', 'discountReview', 'financialReview',
  'logisticsReview', 'notDeliveredPaidOrders', 'notDeliveredPaidRevenue'
];
export const SALES_SOURCE = 'mercado-livre-orders-v2';
export const SALES_BASIS = 'paid-item-sales-net-of-confirmed-refunds';
export const SALES_PAGE_SIZE = 10;

const CANCELLED_STATUSES = ['cancelled', 'pending_cancel'];
const PAID_STATUSES = ['paid', 'partially_refunded', 'confirmed'];
const SEARCH_STATUSES = 'paid,partially_refunded,cancelled,pending_cancel,confirmed';
const MAX_PAGE_OFFSET = 100000;
const MAX_PAGES = 1000;

const isNumericId = value => /^\d{1,20}$/.test(String(value));
const isMoneyField = key => key === 'revenue' || key.endsWith('Revenue');
const hasReview = totals => totals.refundReview + totals.discountReview + totals.financialReview > 0;
const safeTotals = totals => SALES_FIELDS.every(key => Number.isSafeInteger(totals[key]) && totals[key] >= 0);

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function salesContext({ itemId, sellerId, range }) {
  if (!/^MLB\d{5,15}$/.test(itemId) || !Number.isSafeInteger(sellerId) || sellerId <= 0) {
    throw salesError('Identificação inválida para consultar o faturamento.');
  }
  if (!isDate(range?.dateFrom) || !isDate(range?.dateTo)) {
    throw salesError('Período inválido para consultar as vendas.');
  }

  const from = range.dateFrom + 'T00:00:00.000-03:00';
  const to = range.dateTo + 'T23:59:59.999-03:00';
  if (Date.parse(to) < Date.parse(from) || Date.parse(to) - Date.parse(from) >= 90 * 86400000) {
    throw salesError('Consulte até 90 dias de vendas por vez.');
  }

  return { from, to, itemId, sellerId, dateFrom: range.dateFrom, dateTo: range.dateTo };
}

function validateOrder(order, context) {
  if (!isNumericId(order?.id) || Number(order.seller?.id) !== context.sellerId ||
      order.currency_id !== 'BRL' || !Array.isArray(order.order_items)) {
    throw salesError('A consulta retornou pedido de outra conta ou moeda inválida.');
  }

  const created = Date.parse(order.date_created);
  if (!Number.isFinite(created) || created < Date.parse(context.from) || created > Date.parse(context.to)) {
    throw salesError('As vendas não correspondem ao período solicitado.');
  }

  for (const line of order.order_items) {
    if (!/^MLB\d{5,15}$/.test(line.item?.id) || !Number.isSafeInteger(line.quantity) ||
        line.quantity <= 0 || (line.currency_id !== undefined && line.currency_id !== 'BRL') ||
        !isNonNegative(line.unit_price)) {
      throw salesError('Os itens da venda estão incompletos.');
    }
  }
}

function validatePagination(page, rows, offset, expectedTotal) {
  if (!page || !Number.isSafeInteger(page.total) || page.total < 0 ||
      !Number.isSafeInteger(page.limit) || page.limit <= 0 || page.limit > SALES_PAGE_SIZE ||
      page.offset !== offset || !Array.isArray(rows) || rows.length > page.limit ||
      offset + rows.length > page.total ||
      (expectedTotal !== null && page.total !== expectedTotal) ||
      (offset + rows.length < page.total && rows.length !== page.limit)) {
    throw salesError('A paginação de vendas está incompleta ou mudou durante a consulta.');
  }
}

function salesSnapshot(context, totals, complete) {
  return {
    source: SALES_SOURCE,
    basis: SALES_BASIS,
    itemId: context.itemId,
    sellerId: context.sellerId,
    currency: 'BRL',
    dateFrom: context.dateFrom,
    dateTo: context.dateTo,
    ...Object.fromEntries(SALES_FIELDS.map(key => [key, isMoneyField(key) ? totals[key] / 100 : totals[key]])),
    complete,
    status: hasReview(totals) ? 'review' : 'ready'
  };
}

async function isUndelivered(order, api, totals) {
  let undelivered = Array.isArray(order.tags) && order.tags.includes('not_delivered');
  const shippingId = order.shipping?.id;
  if (shippingId === undefined || shippingId === null) return undelivered;

  if (!isNumericId(shippingId)) {
    totals.logisticsReview++;
    return undelivered;
  }

  try {
    const shipment = await api('/shipments/' + shippingId);
    if (String(shipment.id) !== String(shippingId) || typeof shipment.status !== 'string') {
      throw salesError('Envio inválido.');
    }
    undelivered = ['not_delivered', 'cancelled', 'returned'].includes(shipment.status);
  } catch {
    totals.logisticsReview++;
  }

  return undelivered;
}

async function addPaidOrder({ order, value, itemId, api, totals }) {
  try {
    value = applyItemDiscounts(order, itemId, await api('/orders/' + order.id + '/discounts'));
    totals.discountRevenue += value.discount;
    totals.cashbackRevenue += value.cashback;
  } catch {
    totals.discountReview++;
  }

  const payment = classifyPayment(order, value.net);
  if (order.status === 'confirmed' && payment.kind === 'review') return;

  totals.orders++;
  totals.units += value.quantity;
  totals.paidRevenue += value.net;

  let refund = 0;
  if (payment.kind === 'full') {
    refund = value.net;
    totals.refundedOrders++;
  } else if (payment.kind === 'partial') {
    refund = payment.amount;
    totals.refundedOrders++;
  } else if (payment.kind === 'partial-review') {
    totals.refundReview++;
  } else if (payment.kind === 'review' || order.status === 'confirmed') {
    totals.financialReview++;
  }

  totals.refundedRevenue += refund;
  totals.revenue += value.net - refund;

  if (await isUndelivered(order, api, totals) && ['paid', 'partial'].includes(payment.kind)) {
    totals.notDeliveredPaidOrders++;
    totals.notDeliveredPaidRevenue += value.net - refund;
  }
}

export function sumItemSales(parts) {
  if (!parts.length) return undefined;
  const first = parts[0];
  if (!parts.every(part => part.source === SALES_SOURCE && part.basis === SALES_BASIS &&
      part.itemId === first.itemId && part.sellerId === first.sellerId && part.currency === 'BRL')) {
    throw salesError('Não é possível misturar bases de faturamento.');
  }

  const totals = Object.fromEntries(SALES_FIELDS.map(key => [
    key, parts.reduce((sum, part) => sum + (isMoneyField(key) ? toCents(part[key]) : part[key]), 0)
  ]));
  if (!safeTotals(totals)) throw salesError('O total de faturamento excedeu o limite seguro.');

  return salesSnapshot({ ...first, dateTo: parts.at(-1).dateTo }, totals, true);
}

export async function itemSalesPage({ itemId, sellerId, range, api, offset = 0, expectedTotal = null }) {
  const context = salesContext({ itemId, sellerId, range });
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_PAGE_OFFSET ||
      (expectedTotal !== null && (!Number.isSafeInteger(expectedTotal) || expectedTotal < 0))) {
    throw salesError('Página de vendas inválida.');
  }

  const query = new URLSearchParams({
    seller: String(sellerId),
    q: itemId,
    'order.date_created.from': context.from,
    'order.date_created.to': context.to,
    'order.status': SEARCH_STATUSES,
    sort: 'date_asc',
    limit: String(SALES_PAGE_SIZE),
    offset: String(offset)
  });
  const data = await api('/orders/search?' + query);
  const page = data?.paging;
  const rows = data?.results;
  validatePagination(page, rows, offset, expectedTotal);

  const totals = Object.fromEntries(SALES_FIELDS.map(key => [key, 0]));
  const keys = [];
  const seen = new Set();

  for (const row of rows) {
    validateOrder(row, context);
    const key = String(row.id);
    if (seen.has(key)) throw salesError('Pedido duplicado na consulta.');
    seen.add(key);
    keys.push(createHash('sha256').update(sellerId + ':' + key).digest('hex'));

    let value = readProductValue(row, itemId);
    if (!value.lines.length) continue;
    if (CANCELLED_STATUSES.includes(row.status)) {
      totals.cancelledRevenue += value.net;
      totals.cancelledOrders++;
      continue;
    }

    const order = await api('/orders/' + key);
    validateOrder(order, context);
    if (String(order.id) !== key || !readProductValue(order, itemId).lines.length) {
      throw salesError('O detalhe não corresponde ao pedido consultado.');
    }

    value = readProductValue(order, itemId);
    if (CANCELLED_STATUSES.includes(order.status)) {
      totals.cancelledRevenue += value.net;
      totals.cancelledOrders++;
      continue;
    }
    if (!PAID_STATUSES.includes(order.status)) throw salesError('Status de venda não reconhecido.');

    await addPaidOrder({ order, value, itemId, api, totals });
  }

  if (!safeTotals(totals)) throw salesError('O faturamento excedeu o limite seguro.');
  const nextOffset = offset + rows.length < page.total ? offset + rows.length : null;
  return {
    sales: salesSnapshot(context, totals, offset === 0 && nextOffset === null),
    page: { offset, count: rows.length, total: page.total, nextOffset, keys }
  };
}

export async function itemSales(options) {
  const parts = [];
  const seen = new Set();
  let offset = 0;
  let expectedTotal = null;

  for (let index = 0; index < MAX_PAGES; index++) {
    const result = await itemSalesPage({ ...options, offset, expectedTotal });
    for (const key of result.page.keys) {
      if (seen.has(key)) throw salesError('Pedido duplicado entre páginas.');
      seen.add(key);
    }

    parts.push(result.sales);
    expectedTotal = result.page.total;
    if (result.page.nextOffset === null) return sumItemSales(parts);
    offset = result.page.nextOffset;
  }

  throw salesError('A consulta de vendas atingiu o limite. Nenhuma soma parcial foi utilizada.');
}
