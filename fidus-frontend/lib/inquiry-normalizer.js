function splitList(value) {
  if (!value) return [];

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLineItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function parseQuantity(value) {
  if (!value) return null;

  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUom(value) {
  if (!value) return null;

  const normalized = String(value).trim().toUpperCase().replace(/\./g, "");
  const aliases = {
    NO: "NOS",
    NOS: "NOS",
    NUMBER: "NOS",
    NUMBERS: "NOS",
    PIECE: "PCS",
    PIECES: "PCS",
    PC: "PCS",
    PCS: "PCS",
    LITER: "LTR",
    LITRE: "LTR",
    LITERS: "LTR",
    LITRES: "LTR",
    LTR: "LTR",
  };

  return aliases[normalized] || normalized || null;
}

export function extractEmail(sender) {
  if (!sender) return null;

  const match = String(sender).match(/<([^>]+)>/);
  if (match) return match[1].trim();

  const emailMatch = String(sender).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch ? emailMatch[0] : null;
}

export function isInternalEmail(email) {
  if (!email) return false;

  const normalized = String(email).trim().toLowerCase();
  return (
    /^fidusindia\d*@gmail\.com$/.test(normalized) ||
    normalized.endsWith("@fidusindia.com")
  );
}

export function extractSenderName(sender, fallbackName) {
  if (!sender) return fallbackName || null;

  return String(sender)
    .replace(/<[^>]+>/g, "")
    .replace(/^["']|["']$/g, "")
    .trim() || fallbackName || null;
}

export function buildInquiryItems(rawItem) {
  const lineItems = parseLineItems(rawItem.line_items);

  if (lineItems.length > 0) {
    return lineItems
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        brand: item.brand || null,
        partNumber: item.part_number || item.partNumber || null,
        quantity: parseQuantity(item.quantity),
        uom: normalizeUom(item.uom || item.UOM),
        itemNotes: item.notes || item.item_notes || item.itemNotes || null,
      }))
      .filter((item) => item.brand || item.partNumber || item.quantity || item.uom || item.itemNotes);
  }

  const brands = splitList(rawItem.brands);
  const partNumbers = splitList(rawItem.part_numbers);
  const quantities = splitList(rawItem.quantities);
  const maxLength = Math.max(brands.length, partNumbers.length, quantities.length, 1);

  return Array.from({ length: maxLength }, (_, index) => ({
    brand: brands[index] || null,
    partNumber: partNumbers[index] || null,
    quantity: parseQuantity(quantities[index]),
    uom: null,
    itemNotes: index === 0 ? rawItem.notes || null : null,
  }));
}

export function normalizeParserPayload(payload) {
  return {
    parser_row_id: payload.id ? String(payload.id) : payload.parser_row_id || null,
    message_id: payload.message_id || null,
    thread_id: payload.thread_id || payload.threadId || null,
    source_user_id: payload.user_id || payload.source_user_id || null,
    client_name: payload.client_name || payload.clientName || null,
    username: payload.username || null,
    sender_email: payload.sender_email || payload.senderEmail || null,
    location: payload.location || null,
    brands: payload.brands || null,
    part_numbers: payload.part_numbers || payload.partNumbers || null,
    quantities: payload.quantities || null,
    notes: payload.notes || null,
    line_items: payload.line_items || payload.lineItems || null,
    sender: payload.sender || null,
    subject: payload.subject || null,
    email_date: payload.email_date || payload.emailDate || null,
    parser_created_at: payload.created_at || payload.parser_created_at || null,
  };
}
