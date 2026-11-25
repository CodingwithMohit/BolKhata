"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseEntries } from "@/lib/parser";
import type { ParsedEntry } from "@/lib/schema";
import { parseWithFallback } from "@/lib/parseWithFallback";
import {
  translate,
  useDocumentLanguage,
  type TranslationKey,
} from "@/lib/i18n";
import {
  calculateBalance,
  calculateTotalOutstanding,
  formatRupees,
  matchCustomerName,
  summarizeToday,
  type Customer,
  type Entry,
} from "@/lib/ledger";
import { useLedger } from "@/lib/useLedger";
import { useSpeechInput } from "@/lib/useSpeechInput";

interface EntryDraft extends ParsedEntry {
  customerId: string;
}

type InputSource = "typed" | "voice";
type ParseSource = "rules" | "ai";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/u, "") ?? "";

const examplePhrases = [
  "Ramesh ne 200 ka saman udhaar liya",
  "Sunita ne 500 wapas diye",
  "Mohan ko do sau rupay udhaar",
  "Amit ne ₹75 chai ka udhaar liya",
];

const sampleCustomers = [
  { name: "Ramesh Kumar", amount: 2400, type: "gave_credit" },
  { name: "Sunita Devi", amount: 850, type: "gave_credit" },
  { name: "Mohan Lal", amount: 1300, type: "gave_credit" },
  { name: "Geeta Sharma", amount: 450, type: "gave_credit" },
  { name: "Imran Khan", amount: 1750, type: "gave_credit" },
  { name: "Kavita Joshi", amount: 1200, type: "received_payment" },
] as const;

function makeId(): string {
  return crypto.randomUUID();
}

function Skeleton() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl animate-pulse px-4 py-10 sm:px-8">
      <div className="h-8 w-40 rounded bg-[#e6ebe2]" />
      <div className="mt-8 h-44 rounded-3xl bg-[#e6ebe2]" />
      <div className="mt-8 h-32 rounded-3xl bg-[#e6ebe2]" />
      <p className="mt-4 text-sm text-[#66756a]">Loading your local ledger…</p>
    </main>
  );
}

function createDrafts(entries: ParsedEntry[], customers: Customer[]): EntryDraft[] {
  return entries.map((entry) => {
    const match = matchCustomerName(entry.name, customers);
    return { ...entry, customerId: match.exact?.id ?? "" };
  });
}

function todaySummary(entries: Entry[]) {
  return summarizeToday(entries);
}

export default function Home() {
  const { ledger, loaded, storageError, updateLedger } = useLedger();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<EntryDraft[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [inputSource, setInputSource] = useState<InputSource>("typed");
  const [parseSource, setParseSource] = useState<ParseSource>("rules");
  const [aiMessage, setAiMessage] = useState("");
  const [apiStatus, setApiStatus] = useState("");
  const parseRequestId = useRef(0);
  const speech = useSpeechInput();

  const customers = useMemo(
    () =>
      ledger.customers
        .map((customer) => ({
          customer,
          balance: calculateBalance(customer.id, ledger.entries),
        }))
        .sort((left, right) => right.balance - left.balance),
    [ledger.customers, ledger.entries],
  );
  const visibleCustomers = customers.filter(({ customer }) =>
    customer.name.toLocaleLowerCase("en-IN").includes(search.toLocaleLowerCase("en-IN")),
  );
  const summary = todaySummary(ledger.entries);
  const totalOutstanding = calculateTotalOutstanding(ledger.entries);
  const language = ledger.settings.language;
  const aiEnabled = ledger.settings.aiEnabled;
  const t = (key: TranslationKey) => translate(language, key);
  useDocumentLanguage(language);

  useEffect(() => {
    let active = true;
    let answered = false;

    if (!API_BASE_URL) {
      queueMicrotask(() => {
        if (active) setApiStatus("AI service is not configured; rules parsing works meanwhile.");
      });
      return () => {
        active = false;
      };
    }

    const wakeTimer = setTimeout(() => {
      if (active && !answered) {
        setApiStatus("AI is waking up, rules parsing works meanwhile.");
      }
    }, 3000);

    void fetch(`${API_BASE_URL}/health`)
      .then((response) => {
        if (!response.ok) throw new Error("Health check failed");
        answered = true;
        if (wakeTimer) clearTimeout(wakeTimer);
        if (active) setApiStatus("");
      })
      .catch(() => {
        answered = true;
        if (wakeTimer) clearTimeout(wakeTimer);
        if (active) setApiStatus("AI service is unavailable; rules parsing works meanwhile.");
      });

    return () => {
      active = false;
      if (wakeTimer) clearTimeout(wakeTimer);
    };
  }, []);

  if (!loaded) {
    return <Skeleton />;
  }

  async function parse(
    textToParse = text,
    source: InputSource = inputSource,
  ) {
    const requestId = parseRequestId.current + 1;
    parseRequestId.current = requestId;
    setText(textToParse);
    setInputSource(source);
    const rulesEntries = parseEntries(textToParse);
    setDrafts(createDrafts(rulesEntries, ledger.customers));
    setHasParsed(true);
    setMessage("");
    setAiMessage("");
    setParseSource("rules");

    const result = await parseWithFallback(textToParse, rulesEntries, {
      enabled: aiEnabled,
      apiBaseUrl: API_BASE_URL,
    });
    if (parseRequestId.current === requestId) {
      setDrafts(createDrafts(result.entries, ledger.customers));
      setParseSource(result.source);
      setAiMessage(result.message ?? "");
    }
  }

  function updateDraft(index: number, patch: Partial<EntryDraft>) {
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  function saveDrafts() {
    if (
      drafts.length === 0 ||
      drafts.some(
        (draft) =>
          !draft.name.trim() ||
          !Number.isInteger(draft.amount) ||
          draft.amount <= 0 ||
          draft.type === null,
      )
    ) {
      setMessage("Add a name, a positive whole-rupee amount, and a type for every entry.");
      return;
    }

    const saved = updateLedger((current) => {
      const newCustomers: Customer[] = [];
      const entries: Entry[] = drafts.map((draft) => {
        let customerId = draft.customerId;
        if (!customerId) {
          const customer: Customer = {
            id: makeId(),
            name: draft.name.trim(),
            createdAt: new Date().toISOString(),
          };
          newCustomers.push(customer);
          customerId = customer.id;
        }
        return {
          id: makeId(),
          customerId,
          type: draft.type as "gave_credit" | "received_payment",
          amount: draft.amount,
          ...(draft.note?.trim() ? { note: draft.note.trim() } : {}),
          createdAt: new Date().toISOString(),
          source: inputSource,
        };
      });
      return {
        ...current,
        customers: [...current.customers, ...newCustomers],
        entries: [...current.entries, ...entries],
      };
    });

    if (saved) {
      setDrafts([]);
      setHasParsed(false);
      setText("");
      setMessage("Entries saved to this browser.");
    }
  }

  function loadSampleData() {
    if (ledger.customers.length > 0 || ledger.entries.length > 0) {
      setMessage("Sample data can only be loaded into an empty ledger.");
      return;
    }
    const createdAt = new Date().toISOString();
    const newCustomers: Customer[] = sampleCustomers.map((sample) => ({
      id: makeId(),
      name: sample.name,
      createdAt,
    }));
    const entries: Entry[] = sampleCustomers.map((sample, index) => ({
      id: makeId(),
      customerId: newCustomers[index].id,
      type: sample.type,
      amount: sample.amount,
      note: sample.type === "gave_credit" ? "Sample balance" : "Sample payment",
      createdAt,
      source: "manual",
    }));
    if (updateLedger((current) => ({ ...current, customers: newCustomers, entries }))) {
      setMessage("Six fictional customers added. You can try the parser above.");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-14 pt-7 sm:px-8 sm:pt-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#315d40]">
          BolKhata
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-medium text-[#68766b] sm:inline">{t("shop.device")}</span>
          <Link href="/settings" className="inline-flex min-h-11 items-center rounded-xl border border-[#cbd8cc] px-4 text-sm font-semibold text-[#315d40] hover:bg-[#f3f7f1]">
            {t("settings.title")}
          </Link>
        </div>
      </header>

      <section className="mt-7 rounded-3xl bg-[#1f6840] p-6 text-white shadow-[0_14px_38px_rgba(27,65,43,0.12)] sm:p-8">
        <p className="text-sm font-medium text-white/80">{t("home.outstanding")}</p>
        <p className="mt-2 text-4xl font-extrabold tabular-nums sm:text-5xl">
          {formatRupees(totalOutstanding)}
        </p>
        <p className="mt-3 text-sm text-white/80">
          {t("home.outstandingHint")}
        </p>
      </section>

      <section className="mt-7 rounded-3xl border border-[#dce5dc] bg-white p-5 shadow-[0_12px_36px_rgba(27,65,43,0.06)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#68766b]">
              {t("home.entry")}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-[#183d2b]">
              {t("home.todayQuestion")}
            </h1>
          </div>
          <button
            type="button"
            onClick={loadSampleData}
            className="min-h-11 rounded-xl border border-[#cbd8cc] px-4 py-2 text-sm font-semibold text-[#315d40] hover:bg-[#f3f7f1]"
          >
            {t("home.sample")}
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {speech.availability === "available" ? (
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                if (!event.isPrimary || event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                speech.start((transcript) => {
                  setText(transcript);
                  setInputSource("voice");
                });
              }}
              onPointerUp={speech.stop}
              onPointerCancel={speech.stop}
              onContextMenu={(event) => event.preventDefault()}
              onDragStart={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                  event.preventDefault();
                  speech.start((transcript) => {
                    setText(transcript);
                    setInputSource("voice");
                  });
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") speech.stop();
              }}
              aria-pressed={speech.listening}
              className={`min-h-12 touch-none select-none rounded-xl px-5 py-3 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6840] ${
                speech.listening ? "bg-[#9a4e12]" : "bg-[#1f6840] hover:bg-[#185633]"
              }`}
              style={{ touchAction: "none", WebkitTouchCallout: "none" }}
            >
              {speech.listening ? t("home.listening") : t("home.holdToSpeak")}
            </button>
          ) : (
            <p className="text-sm text-[#66756a]">
              {speech.availability === "checking"
                ? "Checking voice input…"
                : speech.availability === "insecure"
                  ? "Voice input needs HTTPS or localhost. Type your entry below."
                  : "Voice input is not supported here. Type your entry below."}
            </p>
          )}
          {speech.availability === "available" && (
            <label className="text-sm font-medium text-[#405447]">
              {t("home.speechLanguage")}
              <select
                value={speech.language}
                onChange={(event) =>
                  speech.setLanguage(event.target.value as "hi-IN" | "en-IN")
                }
                disabled={speech.listening}
                className="ml-2 min-h-11 rounded-xl border border-[#cbd8cc] bg-white px-3 text-base"
              >
                <option value="hi-IN">{t("home.hindi")}</option>
                <option value="en-IN">{t("home.englishIndia")}</option>
              </select>
            </label>
          )}
        </div>
        {speech.message && (
          <p role="status" className="mt-2 text-sm text-[#8a581e]">
            {speech.message}
          </p>
        )}
        <label className="sr-only" htmlFor="phrase">
          Transaction phrase
        </label>
        <textarea
          id="phrase"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setInputSource("typed");
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              void parse();
            }
          }}
          placeholder="Ramesh ne 200 ka saman udhaar liya"
          rows={2}
          className="mt-5 min-h-24 w-full resize-y rounded-2xl border border-[#cbd8cc] bg-[#fffefa] px-4 py-3 text-base leading-7 text-[#1f3326] outline-none focus:border-[#1f6840] focus:ring-4 focus:ring-[#1f6840]/10"
        />
        <button
          type="button"
          onClick={() => void parse()}
          className="mt-3 min-h-12 rounded-xl bg-[#1f6840] px-6 py-3 text-base font-semibold text-white hover:bg-[#185633]"
        >
          {t("home.reviewEntry")}
        </button>
        <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-[#405447]">
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={(event) =>
              updateLedger((current) => ({
                ...current,
                settings: { ...current.settings, aiEnabled: event.target.checked },
              }))
            }
            className="h-5 w-5 accent-[#1f6840]"
          />
          {t("home.useAi")}
        </label>
        <p className="mt-1 text-xs leading-5 text-[#66756a]">
          {t("home.aiSent")}
        </p>
        {apiStatus && (
          <p role="status" className="mt-3 text-xs text-[#66756a]">
            {apiStatus}
          </p>
        )}
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#68766b]">
            {t("home.tryPhrase")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {examplePhrases.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => void parse(phrase, "typed")}
                className="min-h-10 rounded-full border border-[#d5dfd4] px-3 py-2 text-left text-xs text-[#315d40] hover:bg-[#edf5ed] sm:text-sm"
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>

        {hasParsed && (
          <div className="mt-7 border-t border-[#e5ebe3] pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#183d2b]">{t("home.confirmEntries")}</h2>
              <span className="rounded-full bg-[#edf5ed] px-3 py-1 text-xs font-semibold text-[#245b38]">
                {parseSource === "ai" ? "Parsed by AI" : "Parsed by rules"}
              </span>
            </div>
            {drafts.length === 0 ? (
              <p className="mt-3 rounded-xl bg-[#f7f7f2] p-4 text-sm text-[#66756a]">
                {t("home.noTransaction")}
              </p>
            ) : (
              <div className="mt-4 grid gap-4">
                {drafts.map((draft, index) => {
                  const match = matchCustomerName(draft.name, ledger.customers);
                  return (
                    <article
                      key={`draft-${index}`}
                      className="rounded-2xl border border-[#dce5dc] bg-[#fffefa] p-4 sm:p-5"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium text-[#405447]">
                          {t("home.customerName")}
                          <input
                            value={draft.name}
                            onChange={(event) => {
                              const name = event.target.value;
                              const exactCustomer = matchCustomerName(name, ledger.customers).exact;
                              updateDraft(index, { name, customerId: exactCustomer?.id ?? "" });
                            }}
                            className="mt-1 min-h-11 w-full rounded-xl border border-[#cbd8cc] bg-white px-3 text-base text-[#1f3326]"
                          />
                        </label>
                        <label className="text-sm font-medium text-[#405447]">
                          {t("home.amount")}
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={draft.amount}
                            onChange={(event) => updateDraft(index, { amount: Number(event.target.value) })}
                            className="mt-1 min-h-11 w-full rounded-xl border border-[#cbd8cc] bg-white px-3 text-base text-[#1f3326]"
                          />
                        </label>
                        <label className="text-sm font-medium text-[#405447]">
                          {t("home.note")}
                          <input
                            value={draft.note ?? ""}
                            onChange={(event) => updateDraft(index, { note: event.target.value })}
                            className="mt-1 min-h-11 w-full rounded-xl border border-[#cbd8cc] bg-white px-3 text-base text-[#1f3326]"
                          />
                        </label>
                        <label className="text-sm font-medium text-[#405447]">
                          {t("home.type")}
                          <select
                            value={draft.type ?? ""}
                            onChange={(event) => updateDraft(index, { type: event.target.value ? event.target.value as "gave_credit" | "received_payment" : null })}
                            className="mt-1 min-h-11 w-full rounded-xl border border-[#cbd8cc] bg-white px-3 text-base text-[#1f3326]"
                          >
                            <option value="">{t("home.chooseType")}</option>
                            <option value="gave_credit">{t("home.creditType")}</option>
                            <option value="received_payment">{t("home.paymentType")}</option>
                          </select>
                        </label>
                      </div>
                      <label className="mt-3 block text-sm font-medium text-[#405447]">
                        {t("home.saveToCustomer")}
                        <select
                          value={draft.customerId}
                          onChange={(event) => updateDraft(index, { customerId: event.target.value })}
                          className="mt-1 min-h-11 w-full rounded-xl border border-[#cbd8cc] bg-white px-3 text-base text-[#1f3326]"
                        >
                          <option value="">{t("home.createNew")}: {draft.name || "Enter a name"}</option>
                          {ledger.customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>{customer.name}</option>
                          ))}
                        </select>
                      </label>
                      {match.exact && (
                        <p className="mt-2 text-sm text-[#315d40]">
                          {t("home.exactMatch")} {match.exact.name}? {t("home.exactMatchHint")}
                        </p>
                      )}
                      {match.suggestion && (
                        <p className="mt-2 text-sm text-[#8a581e]">
                          {t("home.fuzzyMatch")} {match.suggestion.name}? {t("home.fuzzyHint")}
                        </p>
                      )}
                    </article>
                  );
                })}
                <button
                  type="button"
                  onClick={saveDrafts}
                  className="min-h-12 w-full rounded-xl bg-[#1f6840] px-6 py-3 text-base font-semibold text-white hover:bg-[#185633] sm:w-auto sm:justify-self-start"
                >
                  {t("home.saveEntries")}
                </button>
              </div>
            )}
          </div>
        )}
        {message && <p role="status" className="mt-4 text-sm text-[#315d40]">{message}</p>}
        {aiMessage && <p role="status" className="mt-2 text-xs text-[#66756a]">{aiMessage}</p>}
        {storageError && <p role="alert" className="mt-3 text-sm font-medium text-[#9b3030]">{storageError}</p>}
      </section>

      <section className="mt-8 rounded-3xl border border-[#dce5dc] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#68766b]">
              Today
            </p>
            <h2 className="mt-1 text-xl font-bold text-[#183d2b]">{t("home.dailySummary")}</h2>
          </div>
          <p className="text-sm text-[#66756a]">{summary.entryCount} entries</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Summary label={t("home.creditGiven")} amount={summary.creditGiven} />
          <Summary label={t("home.paymentsReceived")} amount={summary.paymentsReceived} />
          <Summary label={t("home.netToday")} amount={summary.net} />
        </div>
      </section>

      <section className="mt-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#68766b]">
              Your ledger
            </p>
            <h2 className="mt-1 text-2xl font-bold text-[#183d2b]">{t("home.customers")}</h2>
          </div>
          <label className="w-full text-sm text-[#53645a] sm:w-64">
            <span className="sr-only">Search customers</span>
            <input
              type="search"
              placeholder={t("home.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-[#cbd8cc] bg-white px-3 text-base"
            />
          </label>
        </div>
        {visibleCustomers.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[#cbd8cc] bg-white px-5 py-7 text-center">
            <p className="font-semibold text-[#315d40]">
              {ledger.customers.length ? t("home.noSearchResults") : t("home.noCustomers")}
            </p>
            <p className="mt-1 text-sm text-[#66756a]">
              {t("home.startHint")}
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {visibleCustomers.map(({ customer, balance }) => (
              <li key={customer.id}>
                <Link
                  href={`/customers/${customer.id}`}
                  className="flex min-h-20 items-center justify-between gap-3 rounded-2xl border border-[#dce5dc] bg-white p-4 transition hover:border-[#93b29b] hover:bg-[#fffefa] focus-visible:outline-2 focus-visible:outline-[#1f6840]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[#183d2b]">{customer.name}</span>
                    <span className="mt-1 block text-xs text-[#66756a]">{ledger.entries.filter((entry) => entry.customerId === customer.id).length} {t("home.todayEntries")}</span>
                  </span>
                  <span className={`shrink-0 text-lg font-bold tabular-nums ${balance > 0 ? "text-[#a96312]" : "text-[#45664e]"}`}>
                    {formatRupees(balance)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Summary({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-2xl bg-[#f5f6ef] p-4">
      <p className="text-xs font-medium text-[#66756a]">{label}</p>
      <p className="mt-2 text-lg font-bold tabular-nums text-[#294a34]">{formatRupees(amount)}</p>
    </div>
  );
}
