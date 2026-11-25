import { parsedEntriesSchema, type ParsedEntry } from "./schema";

const numberWords: Record<string, number> = {
  ek: 1,
  एक: 1,
  do: 2,
  दो: 2,
  teen: 3,
  तीन: 3,
  char: 4,
  chaar: 4,
  चार: 4,
  paanch: 5,
  panch: 5,
  पांच: 5,
  पाँच: 5,
  das: 10,
  दस: 10,
  bees: 20,
  बीस: 20,
  pandra: 15,
  pandrah: 15,
  पंद्रह: 15,
  पन्द्रह: 15,
  pachas: 50,
  pachaas: 50,
  पचास: 50,
  sau: 100,
  सौ: 100,
  hazaar: 1000,
  hazar: 1000,
  hajar: 1000,
  हजार: 1000,
  हज़ार: 1000,
  dedh: 1.5,
  डेढ़: 1.5,
  dhai: 2.5,
  ढाई: 2.5,
};

const honorifics = new Set([
  "ji",
  "bhai",
  "didi",
  "bhaiya",
  "sir",
  "madam",
]);
const nonNameWords = new Set([
  ...honorifics,
  "ne",
  "ko",
  "ka",
  "ke",
  "ki",
  "se",
  "rupay",
  "rupaye",
  "rupee",
  "rupees",
  "rs",
  "udhaar",
  "liya",
  "liye",
  "le",
  "gaya",
  "gayi",
  "wapas",
  "diya",
  "diye",
  "jama",
  "chukaye",
  "paid",
  "उधार",
  "लिया",
  "लिए",
  "गया",
  "गई",
  "वापस",
  "दिया",
  "दिए",
  "जमा",
  "चुकाए",
]);
const removableNoteWords = new Set([
  ...nonNameWords,
  "aur",
  "phir",
  "and",
  "nahi",
  "kuch",
  "में",
  "ने",
  "को",
  "का",
  "के",
  "की",
  "से",
  "रुपये",
  "रुपया",
  "रुपय",
  "है",
]);
const scales = new Set([
  "sau",
  "सौ",
  "hazaar",
  "hazar",
  "hajar",
  "हजार",
  "हज़ार",
]);

interface Token {
  value: string;
  start: number;
  end: number;
}

function normalizeDigits(value: string): string {
  return value.replace(/[०-९]/g, (digit) =>
    String("०१२३४५६७८९".indexOf(digit)),
  );
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const expression = /₹?[\p{L}\p{M}\p{N}]+/gu;
  for (const match of text.matchAll(expression)) {
    const value = match[0];
    const start = match.index;
    tokens.push({ value, start, end: start + value.length });
  }
  return tokens;
}

function readAmount(
  tokens: Token[],
  index: number,
): { amount: number; endIndex: number } | undefined {
  let cursor = index;
  let total = 0;
  let current = 0;
  let consumed = false;

  while (cursor < tokens.length) {
    const word = normalizeDigits(tokens[cursor].value.replace("₹", ""))
      .toLocaleLowerCase("en-IN");

    if (/^\d+$/.test(word)) {
      const numericValue = Number(word);
      if (!Number.isSafeInteger(numericValue)) break;
      current += numericValue;
      consumed = true;
      cursor += 1;
      continue;
    }

    const wordValue = numberWords[word];
    if (wordValue === undefined) break;

    consumed = true;
    cursor += 1;
    if (scales.has(word)) {
      const scale = word === "sau" || word === "सौ" ? 100 : 1000;
      total += (current || 1) * scale;
      current = 0;
    } else {
      current += wordValue;
    }
  }

  const amount = total + current;
  if (!consumed || !Number.isSafeInteger(amount) || amount <= 0) {
    return undefined;
  }
  return { amount, endIndex: cursor - 1 };
}

function isNonName(value: string): boolean {
  const word = value.toLocaleLowerCase("en-IN");
  return (
    nonNameWords.has(word) ||
    removableNoteWords.has(word) ||
    numberWords[word] !== undefined ||
    scales.has(word) ||
    /^\d+$/.test(normalizeDigits(word.replace("₹", ""))) ||
    /^(?:rs|₹)$/iu.test(word)
  );
}

function cleanName(tokens: Token[]): string {
  return tokens
    .filter((token) => !isNonName(token.value))
    .map((token) => token.value)
    .join(" ")
    .trim();
}

function getType(text: string): ParsedEntry["type"] {
  const normalized = text.toLocaleLowerCase("en-IN");
  const hasKo = /(?:^|\s)(?:ko|को)(?:\s|$)/u.test(normalized);
  const hasNe = /(?:^|\s)(?:ne|ने)(?:\s|$)/u.test(normalized);
  const gaveVerbs = /\b(?:liya|liye|le\s+gaya|le\s+gayi)\b/u.test(normalized);
  const gaveHindi = /(?:लिया|लिए|ले गया|ले गई)/u.test(normalized);
  const paymentMarkers =
    /\b(?:wapas|jama|chukaye|paid|diya|diye)\b/u.test(normalized) ||
    /(?:वापस|जमा|चुकाए|दिया|दिए)/u.test(normalized);
  const creditWord = /\budhaar\b/u.test(normalized) || /उधार/u.test(normalized);

  if (hasKo && (creditWord || /\b(?:diya|diye)\b/u.test(normalized) || /दिया|दिए/u.test(normalized))) {
    return "gave_credit";
  }
  if (hasNe && paymentMarkers) {
    return "received_payment";
  }
  if (gaveVerbs || gaveHindi) {
    return "gave_credit";
  }
  if (hasKo && creditWord) {
    return "gave_credit";
  }
  return null;
}

function parseSegment(segment: string): ParsedEntry | undefined {
  const tokens = tokenize(segment);
  let amountIndex = -1;
  let amountResult: ReturnType<typeof readAmount>;

  for (let index = 0; index < tokens.length; index += 1) {
    const result = readAmount(tokens, index);
    if (result) {
      amountIndex = index;
      amountResult = result;
      break;
    }
  }

  if (amountIndex < 0 || !amountResult) {
    return undefined;
  }

  const prefixName = cleanName(tokens.slice(0, amountIndex));
  const suffixName =
    prefixName.length === 0
      ? cleanName(tokens.slice(amountResult.endIndex + 1))
      : "";
  const name = prefixName || suffixName;
  if (!name) {
    return undefined;
  }

  const nameWords = new Set(
    name
      .toLocaleLowerCase("en-IN")
      .split(/\s+/u)
      .filter(Boolean),
  );
  const note = tokens
    .filter((token) => {
      const word = token.value.toLocaleLowerCase("en-IN");
      return !isNonName(word) && !nameWords.has(word);
    })
    .map((token) => token.value)
    .join(" ")
    .trim();
  const type = getType(segment);

  return {
    name,
    amount: amountResult.amount,
    type,
    ...(note ? { note } : {}),
    confidence: type === null ? 0.35 : 0.95,
  };
}

export function parseEntries(text: string): ParsedEntry[] {
  if (!text.trim()) {
    return [];
  }

  const entries = text
    .split(/(?:\s+(?:aur|phir|and)\s+|[,।]+)/iu)
    .map((segment) => parseSegment(segment.trim()))
    .filter((entry): entry is ParsedEntry => entry !== undefined);

  return parsedEntriesSchema.parse(entries);
}
