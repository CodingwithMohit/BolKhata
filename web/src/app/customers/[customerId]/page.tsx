"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  calculateBalance,
  formatRupees,
  type Entry,
} from "@/lib/ledger";
import {
  translate,
  useDocumentLanguage,
  type TranslationKey,
} from "@/lib/i18n";
import {
  createWhatsAppReminderUrl,
  type ReminderTone,
} from "@/lib/reminders";
import { useLedger } from "@/lib/useLedger";

interface EntryForm {
  amount: string;
  type: Entry["type"];
  note: string;
}

interface UndoState {
  entry: Entry;
  message: string;
}

const emptyForm: EntryForm = {
  amount: "",
  type: "gave_credit",
  note: "",
};

function Skeleton() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl animate-pulse px-4 py-10 sm:px-8">
      <div className="h-8 w-40 rounded bg-[#e6ebe2]" />
      <div className="mt-8 h-40 rounded-3xl bg-[#e6ebe2]" />
      <p className="mt-4 text-sm text-[#66756a]">Loading customer ledger…</p>
    </main>
  );
}

export default function CustomerPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId;
  const { ledger, loaded, storageError, updateLedger } = useLedger();
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneMessage, setPhoneMessage] = useState("");
  const [reminderTone, setReminderTone] = useState<ReminderTone>("polite");
  const [form, setForm] = useState<EntryForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const customer = ledger.customers.find((item) => item.id === customerId);
  const entries = useMemo(
    () =>
      ledger.entries
        .filter((entry) => entry.customerId === customerId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [ledger.entries, customerId],
  );
  const balance = calculateBalance(customerId, ledger.entries);
  const language = ledger.settings.language;
  const t = (key: TranslationKey) => translate(language, key);
  useDocumentLanguage(language);
  const reminderUrl = customer
    ? createWhatsAppReminderUrl(
        customer.phone ?? "",
        customer.name,
        balance,
        ledger.settings.shopName,
        reminderTone,
      )
    : undefined;

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  if (!loaded) return <Skeleton />;

  if (!customer) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10 sm:px-8">
        <Link href="/" className="text-sm font-semibold text-[#315d40]">{t("customer.back")}</Link>
        <h1 className="mt-8 text-2xl font-bold text-[#183d2b]">{t("customer.notFound")}</h1>
      </main>
    );
  }

  function savePhone() {
    const savedPhone = phone ?? (customer?.phone ?? "");
    if (updateLedger((current) => ({
      ...current,
      customers: current.customers.map((item) =>
        item.id === customerId
          ? { ...item, phone: savedPhone.trim() || undefined }
          : item,
      ),
    }))) {
      setPhoneMessage(t("customer.savePhoneSuccess"));
    }
  }

  function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setFormError(t("customer.validAmount"));
      return;
    }
    if (form.note.trim().length > 200) {
      setFormError(t("customer.noteLength"));
      return;
    }

    if (editingId) {
      const saved = updateLedger((current) => ({
        ...current,
        entries: current.entries.map((entry) =>
          entry.id === editingId
            ? {
                ...entry,
                amount,
                type: form.type,
                ...(form.note.trim() ? { note: form.note.trim() } : { note: undefined }),
              }
            : entry,
        ),
      }));
      if (saved) {
        setEditingId(null);
        setForm(emptyForm);
        setFormError("");
      }
      return;
    }

    const createdAt = new Date().toISOString();
    const entry: Entry = {
      id: crypto.randomUUID(),
      customerId,
      amount,
      type: form.type,
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      createdAt,
      source: "manual",
    };
    if (updateLedger((current) => ({ ...current, entries: [...current.entries, entry] }))) {
      setForm(emptyForm);
      setFormError("");
    }
  }

  function startEditing(entry: Entry) {
    setEditingId(entry.id);
    setForm({
      amount: String(entry.amount),
      type: entry.type,
      note: entry.note ?? "",
    });
    setFormError("");
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  }

  function deleteEntry(entry: Entry) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (!updateLedger((current) => ({
      ...current,
      entries: current.entries.filter((item) => item.id !== entry.id),
    }))) {
      return;
    }
    setUndo({ entry, message: `${formatRupees(entry.amount)} ${t("customer.entryDeleted")}` });
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  }

  function undoDelete() {
    if (!undo) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (updateLedger((current) => ({
      ...current,
      entries: current.entries.some((item) => item.id === undo.entry.id)
        ? current.entries
        : [...current.entries, undo.entry],
    }))) {
      setUndo(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-14 pt-7 sm:px-8 sm:pt-10">
      <Link href="/" className="inline-flex min-h-10 items-center text-sm font-semibold text-[#315d40] hover:underline">
      {t("customer.back")}
      </Link>
      <header className="mt-5 rounded-3xl bg-[#1f6840] p-6 text-white sm:p-8">
        <p className="text-sm text-white/75">{t("customer.ledger")}</p>
        <h1 className="mt-2 text-3xl font-bold">{customer.name}</h1>
        <p className="mt-5 text-sm text-white/80">{t("customer.balance")}</p>
        <p className="mt-1 text-4xl font-extrabold tabular-nums">{formatRupees(balance)}</p>
      </header>

      <section className="mt-6 rounded-3xl border border-[#dce5dc] bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold text-[#183d2b]">{t("customer.phone")}</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Customer phone number</span>
            <input
              type="tel"
              inputMode="tel"
              value={phone ?? customer.phone ?? ""}
              onChange={(event) => {
                setPhone(event.target.value);
                setPhoneMessage("");
              }}
              placeholder={t("customer.phoneHint")}
              className="min-h-12 w-full rounded-xl border border-[#cbd8cc] px-3 text-base"
            />
          </label>
          <button type="button" onClick={savePhone} className="min-h-12 rounded-xl border border-[#1f6840] px-5 font-semibold text-[#1f6840] hover:bg-[#edf5ed]">
            {t("customer.savePhone")}
          </button>
        </div>
        {phoneMessage && <p role="status" className="mt-2 text-sm text-[#315d40]">{phoneMessage}</p>}
      </section>

      <section className="mt-6 rounded-3xl border border-[#dce5dc] bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold text-[#183d2b]">{t("customer.reminder")}</h2>
        <label className="mt-3 block text-sm font-medium text-[#405447]">
          {t("customer.tone")}
          <select
            value={reminderTone}
            onChange={(event) => setReminderTone(event.target.value as ReminderTone)}
            className="mt-1 min-h-12 w-full rounded-xl border border-[#cbd8cc] bg-white px-3 text-base"
          >
            <option value="polite">{t("customer.polite")}</option>
            <option value="friendly">{t("customer.friendly")}</option>
            <option value="firm">{t("customer.firm")}</option>
          </select>
        </label>
        {reminderUrl ? (
          <a
            href={reminderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-12 items-center rounded-xl bg-[#1f6840] px-5 font-semibold text-white hover:bg-[#185633]"
          >
            {t("customer.reminder")}
          </a>
        ) : (
          <>
            <button type="button" disabled className="mt-3 min-h-12 cursor-not-allowed rounded-xl bg-[#aab8ad] px-5 font-semibold text-white">
              {t("customer.reminder")}
            </button>
            <p className="mt-2 text-sm text-[#66756a]">{t("customer.reminderHint")}</p>
          </>
        )}
      </section>

      <section className="mt-6 rounded-3xl border border-[#dce5dc] bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold text-[#183d2b]">
          {editingId ? t("customer.editEntry") : t("customer.addEntry")}
        </h2>
        <form onSubmit={saveEntry} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-[#405447]">
            {t("customer.amount")}
            <input
              type="number"
              min="1"
              step="1"
              required
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              className="mt-1 min-h-12 w-full rounded-xl border border-[#cbd8cc] px-3 text-base"
            />
          </label>
          <label className="text-sm font-medium text-[#405447]">
            {t("customer.type")}
            <select
              value={form.type}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as Entry["type"] }))}
              className="mt-1 min-h-12 w-full rounded-xl border border-[#cbd8cc] bg-white px-3 text-base"
            >
              <option value="gave_credit">Credit given</option>
              <option value="received_payment">Payment received</option>
            </select>
          </label>
          <label className="text-sm font-medium text-[#405447] sm:col-span-2">
            {t("customer.note")}
            <input
              maxLength={200}
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              className="mt-1 min-h-12 w-full rounded-xl border border-[#cbd8cc] px-3 text-base"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="min-h-12 rounded-xl bg-[#1f6840] px-5 font-semibold text-white hover:bg-[#185633]">
              {editingId ? t("customer.saveChanges") : t("customer.add")}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEditing} className="min-h-12 rounded-xl border border-[#cbd8cc] px-5 font-semibold text-[#405447]">
                {t("customer.cancel")}
              </button>
            )}
          </div>
        </form>
        {formError && <p role="alert" className="mt-3 text-sm text-[#9b3030]">{formError}</p>}
        {storageError && <p role="alert" className="mt-3 text-sm text-[#9b3030]">{storageError}</p>}
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#68766b]">Ledger</p>
            <h2 className="mt-1 text-2xl font-bold text-[#183d2b]">{t("customer.history")}</h2>
          </div>
          <span className="text-sm text-[#66756a]">{entries.length} {t("customer.entries")}</span>
        </div>
        {entries.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-[#cbd8cc] bg-white p-5 text-sm text-[#66756a]">
            {t("customer.noEntries")}
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-2xl border border-[#dce5dc] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#183d2b]">
                              {entry.type === "gave_credit" ? t("common.creditGiven") : t("common.paymentReceived")}
                    </p>
                    <p className="mt-1 text-xs text-[#66756a]">
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(entry.createdAt))}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </p>
                  </div>
                  <p className={`text-xl font-bold tabular-nums ${entry.type === "gave_credit" ? "text-[#a96312]" : "text-[#315d40]"}`}>
                    {entry.type === "gave_credit" ? "+" : "−"}{formatRupees(entry.amount)}
                  </p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => startEditing(entry)} className="min-h-10 rounded-lg border border-[#cbd8cc] px-4 text-sm font-semibold text-[#315d40] hover:bg-[#f3f7f1]">
                    {t("customer.edit")}
                  </button>
                  <button type="button" onClick={() => deleteEntry(entry)} className="min-h-10 rounded-lg border border-[#e4c9c4] px-4 text-sm font-semibold text-[#8c3d32] hover:bg-[#fff5f2]">
                    {t("customer.delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {undo && (
        <div role="status" className="fixed inset-x-3 bottom-4 z-10 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-[#183d2b] px-4 py-3 text-sm text-white shadow-xl">
          <span>{undo.message}</span>
          <button type="button" onClick={undoDelete} className="min-h-10 shrink-0 rounded-lg bg-white px-4 font-bold text-[#183d2b]">
            Undo
          </button>
        </div>
      )}
    </main>
  );
}
