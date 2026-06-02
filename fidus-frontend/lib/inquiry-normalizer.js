function splitList(value) {
  if (!value) return [];

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseQuantity(value) {
  if (!value) return null;

  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractEmail(sender) {
  if (!sender) return null;

  const match = String(sender).match(/<([^>]+)>/);
  if (match) return match[1].trim();

  const emailMatch = String(sender).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch ? emailMatch[0] : null;
}

export function extractSenderName(sender, fallbackName) {
  if (!sender) return fallbackName || null;

  return String(sender)
    .replace(/<[^>]+>/g, "")
    .replace(/^["']|["']$/g, "")
    .trim() || fallbackName || null;
}

export function buildInquiryItems(rawItem) {
  const brands = splitList(rawItem.brands);
  const partNumbers = splitList(rawItem.part_numbers);
  const quantities = splitList(rawItem.quantities);
  const maxLength = Math.max(brands.length, partNumbers.length, quantities.length, 1);

  return Array.from({ length: maxLength }, (_, index) => ({
    brand: brands[index] || null,
    partNumber: partNumbers[index] || null,
    quantity: parseQuantity(quantities[index]),
    itemNotes: index === 0 ? rawItem.notes || null : null,
  }));
}

export function normalizeParserPayload(payload) {
  return {
    parser_row_id: payload.id ? String(payload.id) : payload.parser_row_id || null,
    message_id: payload.message_id || null,
    source_user_id: payload.user_id || payload.source_user_id || null,
    username: payload.username || null,
    location: payload.location || null,
    brands: payload.brands || null,
    part_numbers: payload.part_numbers || payload.partNumbers || null,
    quantities: payload.quantities || null,
    notes: payload.notes || null,
    sender: payload.sender || null,
    subject: payload.subject || null,
    email_date: payload.email_date || payload.emailDate || null,
    parser_created_at: payload.created_at || payload.parser_created_at || null,
  };
}
