/**
 * SMS classifier — categorizes SMS into Bank / UPI / Shopping / OTP /
 * Travel / Investment / Offers / Alerts buckets with weighted keyword
 * scoring, plus amount extraction for finance messages.
 */

export type SmsCategory =
  | "BANK"
  | "UPI"
  | "SHOPPING"
  | "OTP"
  | "TRAVEL"
  | "INVESTMENT"
  | "OFFERS"
  | "ALERTS"
  | "OTHER";

export const CATEGORY_META: Record<
  SmsCategory,
  { label: string; emoji: string }
> = {
  BANK: { label: "Bank", emoji: "🏦" },
  UPI: { label: "UPI/Pay", emoji: "⚡" },
  SHOPPING: { label: "Shopping", emoji: "🛒" },
  OTP: { label: "OTP", emoji: "🔑" },
  TRAVEL: { label: "Travel", emoji: "✈️" },
  INVESTMENT: { label: "Invest", emoji: "📈" },
  OFFERS: { label: "Offers", emoji: "🎁" },
  ALERTS: { label: "Alerts", emoji: "⚠️" },
  OTHER: { label: "Other", emoji: "💬" },
};

const RULES: Array<{ cat: SmsCategory; weight: number; kws: string[] }> = [
  // ── OTP / verification (highest weight — most specific) ─────────────
  {
    cat: "OTP",
    weight: 90,
    kws: [
      "otp",
      "one time password",
      "verification code",
      "verification otp",
      "login code",
      "valid for 10 min",
      "valid for 5 min",
      "is your code",
      "do not share",
      "dont share",
      "never share",
    ],
  },
  // ── Bank (account activity, statements, bank-branded) ───────────────
  {
    cat: "BANK",
    weight: 70,
    kws: [
      "sbi",
      "state bank of india",
      "hdfc",
      "icici",
      "axis bank",
      "kotak",
      "pnb",
      "punjab national",
      "bob",
      "bank of baroda",
      "canara",
      "union bank",
      "yes bank",
      "indusind",
      "idfc",
      "idbi",
      "federal bank",
      "rbl",
      "atm withdrawal",
      "atm",
      "balance enquiry",
      "mini statement",
      "credited",
      "debited",
      "withdrawal",
      "deposited",
      "insufficient balance",
      "account statement",
      "available balance",
      "savings account",
      "current account",
      "a/c ",
      "ac no",
      "cheque",
      "emi",
      "loan",
      "branch",
      "netbanking",
      "net banking",
      "passbook",
      "card blocked",
      "card limit",
      "upipin",
      "billdesk",
      "neft",
      "imps",
      "rtgs",
    ],
  },
  // ── UPI / digital payments ───────────────────────────────────────────
  {
    cat: "UPI",
    weight: 60,
    kws: [
      "upi",
      "gpay",
      "google pay",
      "phonepe",
      "paytm",
      "bhim",
      "amazon pay",
      "paid",
      "received",
      "payment successful",
      "payment of",
      "refund",
      "money transferred",
      "transferred",
      "transaction",
      "txn",
      "debited for",
      "credited by",
      "collect request",
      "mandate",
      "autopay",
      "succeeded",
      "failed",
      "you sent",
      "you received",
      "cashback received",
    ],
  },
  // ── Shopping / e-commerce / food ─────────────────────────────────────
  {
    cat: "SHOPPING",
    weight: 55,
    kws: [
      "amazon",
      "flipkart",
      "myntra",
      "ajio",
      "meesho",
      "snapdeal",
      "nykaa",
      "swiggy",
      "zomato",
      "blinkit",
      "zepto",
      "bigbasket",
      "dmart",
      "order placed",
      "order confirmed",
      "order delivered",
      "order shipped",
      "delivery",
      "shipped",
      "dispatched",
      "out for delivery",
      "invoice",
      "receipt",
      "purchase",
      "checkout",
      "cart",
      "cod",
      "retailer",
      "your order",
      "delivered successfully",
      "payment for order",
      "refund for order",
      "ecommerce",
      "store",
      "store bill",
    ],
  },
  // ── Travel ───────────────────────────────────────────────────────────
  {
    cat: "TRAVEL",
    weight: 50,
    kws: [
      "irctc",
      "train",
      "pnr",
      "boarding",
      "flight",
      "airline",
      "air india",
      "indigo",
      "spicejet",
      "vistara",
      "goair",
      "akasa",
      "booking confirmed",
      "ticket booked",
      "uber",
      "ola",
      "cab",
      "hotel",
      "check-in",
      "checkin",
      "railway",
      "terminal",
    ],
  },
  // ── Investment / trading / crypto ────────────────────────────────────
  {
    cat: "INVESTMENT",
    weight: 45,
    kws: [
      "demat",
      "mutual fund",
      "sip",
      "nse",
      "bse",
      "stock",
      "shares",
      "trading",
      "trade",
      "zerodha",
      "groww",
      "upstox",
      "angel one",
      "coin",
      "bitcoin",
      "crypto",
      "usdt",
      "investment",
      "dividend",
      "portfolio",
      "kite",
      "holding",
    ],
  },
  // ── Offers / promos / rewards ────────────────────────────────────────
  {
    cat: "OFFERS",
    weight: 35,
    kws: [
      "offer",
      "offers",
      "promo",
      "promotion",
      "cashback",
      "discount",
      "coupon",
      "sale",
      "rewards",
      "reward points",
      "loyalty",
      "win",
      "lucky draw",
      "contest",
      "free trial",
      "gift voucher",
      "exclusive",
      "flat ",
      "% off",
      "festive",
      "diwali sale",
    ],
  },
  // ── Security / alerts / warnings ─────────────────────────────────────
  {
    cat: "ALERTS",
    weight: 40,
    kws: [
      "suspicious",
      "blocked",
      "fraud",
      "fraudulent",
      "warning",
      "alert",
      "security",
      "unauthorized",
      "unauthorised",
      "breach",
      "compromised",
      "immediately",
      "action required",
      "suspended",
    ],
  },
];

// Pure finance signal (for the Finance tab) — bank / upi / investment
const FINANCE_CATS: SmsCategory[] = ["BANK", "UPI", "INVESTMENT"];

const OTP_YEAR_GUARD = /\b20\d{2}\b/; // avoid year as OTP
const AMOUNT_RE =
  /(?:rs\.?|inr|₹)\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:rs\.?|inr|₹)/gi;

export interface SmsClassification {
  category: SmsCategory;
  isFinance: boolean;
  amount: string | null;
  /** total classifier score — for diagnostics/sorting */
  score: number;
}

export function classifySms(text: string): SmsClassification {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) {
    return { category: "OTHER", isFinance: false, amount: null, score: 0 };
  }

  let best: SmsCategory = "OTHER";
  let bestScore = 0;

  for (const rule of RULES) {
    let hits = 0;
    for (const kw of rule.kws) {
      if (lower.includes(kw)) hits++;
    }
    if (hits === 0) continue;
    const score = rule.weight * (1 + Math.min(hits, 5) / 5);
    if (score > bestScore) {
      bestScore = score;
      best = rule.cat;
    }
  }

  // Extract amount — pick the largest match (usually the actual amount)
  let amount: string | null = null;
  let maxVal = 0;
  for (const m of lower.matchAll(AMOUNT_RE)) {
    const raw = m[1] || m[2];
    if (!raw) continue;
    const val = parseFloat(raw.replace(/,/g, ""));
    if (!isNaN(val) && val > maxVal) {
      maxVal = val;
      amount = raw;
    }
  }

  const isFinance = FINANCE_CATS.includes(best) || amount !== null;

  return { category: best, isFinance, amount, score: bestScore };
}

/** Human-friendly time from a numeric sort key (ms timestamp or seq id). */
export function formatSmsDate(sortKey: number): string {
  if (!sortKey) return "—";
  // Old format: unix ms timestamp. New format: numeric id — use as-is.
  const isTimestamp = sortKey > 1000000000000;
  if (!isTimestamp) return `#${sortKey}`;
  try {
    return new Date(sortKey).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// ── Structured info extraction ─────────────────────────────────────────

const BANK_NAMES: Array<{ name: string; kws: string[] }> = [
  { name: "SBI", kws: ["sbi", "state bank of india"] },
  { name: "HDFC", kws: ["hdfc"] },
  { name: "ICICI", kws: ["icici"] },
  { name: "Axis", kws: ["axis bank", "axis"] },
  { name: "Kotak", kws: ["kotak"] },
  { name: "PNB", kws: ["pnb", "punjab national"] },
  { name: "Bank of Baroda", kws: ["bank of baroda", " bob "] },
  { name: "Canara", kws: ["canara"] },
  { name: "Union Bank", kws: ["union bank"] },
  { name: "Yes Bank", kws: ["yes bank"] },
  { name: "IndusInd", kws: ["indusind"] },
  { name: "IDFC", kws: ["idfc"] },
  { name: "Paytm", kws: ["paytm"] },
  { name: "PhonePe", kws: ["phonepe"] },
  { name: "GPay", kws: ["gpay", "google pay"] },
];

const TXN_TYPES: Array<{ type: string; kws: string[] }> = [
  {
    type: "Credit",
    kws: [
      "credited",
      "received",
      "deposited",
      "you received",
      "money received",
    ],
  },
  {
    type: "Debit",
    kws: ["debited", "paid", "withdrawal", "you sent", "withdrawn", "spent"],
  },
  { type: "Refund", kws: ["refund"] },
  { type: "OTP", kws: ["otp", "verification code", "one time password"] },
  { type: "Failed", kws: ["failed", "declined", "insufficient"] },
];

export interface SmsInfo {
  bank: string | null;
  txnType: string | null;
  cardLast4: string | null;
  refId: string | null;
  /** All phone numbers found in the SMS body (deduped, formatted) */
  numbers: string[];
}

export function extractInfo(text: string): SmsInfo {
  const lower = (text || "").toLowerCase();
  const info: SmsInfo = {
    bank: null,
    txnType: null,
    cardLast4: null,
    refId: null,
    numbers: [],
  };

  for (const b of BANK_NAMES) {
    if (b.kws.some((k) => lower.includes(k))) {
      info.bank = b.name;
      break;
    }
  }

  for (const t of TXN_TYPES) {
    if (t.kws.some((k) => lower.includes(k))) {
      info.txnType = t.type;
      break;
    }
  }

  // Card last 4: "card 1234", "xxxx 1234", "card ending 1234"
  const card = lower.match(/(?:card|xxxx|xx)\s*[\s:]*(\d{4})\b/);
  if (card) info.cardLast4 = card[1];

  // Reference / transaction id
  const ref = lower.match(
    /(?:ref(?:erence)?|txn(?: id)?|utr|bank ref)[\s:.#]*([a-z0-9]{6,20})/i
  );
  if (ref) info.refId = ref[1];

  info.numbers = extractNumbers(text);
  return info;
}

// ── Phone-number extraction from SMS bodies ────────────────────────────

const NUM_RE =
  /(\+?91[\s-]?)?(?:0[\s-]?)?(?:[6-9]\d{4}[\s-]?\d{5}|1800[\s-]?\d{3}[\s-]?\d{3,4}|1860[\s-]?\d{3}[\s-]?\d{3,4}|[1-9]\d{3,5})/g;

/** Extract, normalize and dedupe every phone/short-code in an SMS body. */
export function extractNumbers(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const matches = text.match(NUM_RE) || [];
  for (const m of matches) {
    const digits = m.replace(/[\s-]/g, "");
    // Normalize: +91 98765 43210 → 9876543210; toll-free stays as-is
    let norm = digits.replace(/^\+?91(?=[6-9]\d{9}$)/, "");
    norm = norm.replace(/^0(?=[6-9]\d{9}$)/, "");
    if (/^\d{10}$/.test(norm) || /^1[89]\d{5,7}$/.test(norm)) {
      found.add(norm);
    }
  }
  return [...found];
}
