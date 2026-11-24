// Regras financeiras puras: sem consultas, estado do navegador ou efeitos externos.
export function salesError(message) {
  return Object.assign(new Error(message), { ads: true, status: 422 });
}

export function isNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function toCents(value) {
  if (!isNonNegative(value) || !Number.isSafeInteger(Math.round(value * 100))) {
    throw salesError('Valor de venda inválido.');
  }
  return Math.round(value * 100);
}

export function readProductValue(order, itemId) {
  const lines = order.order_items.filter(line => line.item.id === itemId);
  return {
    lines,
    net: lines.reduce((sum, line) => sum + toCents(line.unit_price * line.quantity), 0),
    quantity: lines.reduce((sum, line) => sum + line.quantity, 0)
  };
}

function collectDiscounts(details, itemId, quantity) {
  let price = 0;
  let coupon = 0;
  let cashback = 0;
  const couponIds = new Set();

  for (const detail of details) {
    if (!['discount', 'coupon', 'cashback'].includes(detail.type) || !Array.isArray(detail.items)) {
      throw salesError('Tipo de desconto não reconhecido.');
    }

    const entries = detail.items.filter(line => line.id === itemId);
    if (!entries.length) continue;

    if (detail.type === 'coupon' && detail.coupon?.id !== undefined) {
      const key = String(detail.coupon.id);
      if (couponIds.has(key)) throw salesError('Cupom duplicado.');
      couponIds.add(key);
    }

    for (const entry of entries) {
      if (!Number.isSafeInteger(entry.quantity) || entry.quantity <= 0 || entry.quantity > quantity) {
        throw salesError('Quantidade de desconto inválida.');
      }

      // O endpoint informa o total do item, e não um valor por unidade.
      const amount = toCents(entry.amounts?.total);
      if (detail.type === 'discount') price += amount;
      else if (detail.type === 'coupon') coupon += amount;
      else cashback += amount;
    }
  }

  return { price, coupon, cashback };
}

export function applyItemDiscounts(order, itemId, data) {
  const value = readProductValue(order, itemId);
  if (!Array.isArray(data?.details)) {
    throw salesError('Detalhamento de descontos incompleto.');
  }

  const { price, coupon, cashback } = collectDiscounts(data.details, itemId, value.quantity);
  const hasGross = value.lines.every(line => isNonNegative(line.gross_price));
  // gross_price já representa todas as unidades; unit_price pode incluir o cupom.
  const embedded = hasGross
    ? value.lines.reduce((sum, line) => sum + toCents(line.gross_price), 0) - value.net
    : price;

  if (embedded < 0) throw salesError('Preço bruto menor que o preço pago.');

  let additional = 0;
  if (coupon) {
    if (!hasGross) {
      throw salesError('Cupom sem base para confirmar se já está incluído no preço.');
    }
    additional = price + coupon - embedded;
    if (additional < 0 || additional > coupon) {
      throw salesError('O desconto não concilia com o preço do item.');
    }
  }

  if (additional > value.net) {
    throw salesError('Desconto maior que o valor do produto.');
  }

  return {
    ...value,
    net: value.net - additional,
    discount: embedded + additional,
    cashback
  };
}

function hasForeignPayment(payments, order) {
  return payments.some(payment =>
    (payment.currency_id !== undefined && payment.currency_id !== 'BRL') ||
    (payment.order_id !== undefined && String(payment.order_id) !== String(order.id)) ||
    (payment.collector?.id !== undefined && Number(payment.collector.id) !== Number(order.seller.id))
  );
}

function canAllocatePartialRefund(order, payments, net) {
  const oneProduct = order.order_items.every(line => line.item.id === order.order_items[0].item.id);
  if (!oneProduct) return false;
  const exactPayments = payments.every(payment =>
    payment.status === 'approved' &&
    isNonNegative(payment.transaction_amount) &&
    isNonNegative(payment.transaction_amount_refunded) &&
    payment.shipping_cost === 0 &&
    isNonNegative(payment.total_paid_amount) &&
    toCents(payment.total_paid_amount) === toCents(payment.transaction_amount)
  );
  if (!exactPayments) return false;
  const noOrderShipping = !isNonNegative(order.shipping_cost) || order.shipping_cost === 0;

  return noOrderShipping &&
    payments.reduce((sum, payment) => sum + toCents(payment.transaction_amount), 0) === net;
}

export function classifyPayment(order, net) {
  if (!Array.isArray(order.payments) || !order.payments.length) {
    return { kind: 'review' };
  }

  const payments = order.payments.filter(payment =>
    ['approved', 'refunded', 'partially_refunded', 'charged_back'].includes(payment.status)
  );
  if (hasForeignPayment(payments, order)) return { kind: 'review' };
  if (payments.length && payments.every(payment => payment.status === 'refunded')) {
    return { kind: 'full' };
  }
  if (payments.some(payment => payment.status === 'charged_back') || !payments.length) {
    return { kind: 'review' };
  }

  const partial = order.status === 'partially_refunded' || payments.some(payment =>
    payment.status !== 'approved' ||
    (isNonNegative(payment.transaction_amount_refunded) && payment.transaction_amount_refunded > 0)
  );
  if (!partial) return { kind: 'paid' };

  // Só deduzir o parcial quando o pagamento corresponde ao próprio produto,
  // sem frete, parcelamento ou outros itens. Não há rateio de reembolso.
  if (canAllocatePartialRefund(order, payments, net)) {
    const amount = payments.reduce((sum, payment) => sum + toCents(payment.transaction_amount_refunded), 0);
    if (amount > 0 && amount <= net) return { kind: 'partial', amount };
  }

  return { kind: 'partial-review' };
}
