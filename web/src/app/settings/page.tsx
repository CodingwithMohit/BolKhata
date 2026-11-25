"use client";

import Link from "next/link";
import { useState } from "react";
import { createLedgerCsv } from "@/lib/csv";
import {
  translate,
  useDocumentLanguage,
  type TranslationKey,
} from "@/lib/i18n";
import { createEmptyLedger } from "@/lib/ledger";
import { useLedger } from "@/lib/useLedger";

export default function SettingsPage() {
  const { ledger, loaded, storageError, updateLedger } = useLedger();
  const [message, setMessage] = useState("");
  const language = ledger.settings.language;
  const t = (key: TranslationKey) => translate(language, key);
  useDocumentLanguage(language);

  if (!loaded) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl animate-pulse px-4 py-10 sm:px-8">
        <div className="h-8 w-40 rounded bg-[#e6ebe2]" />
        <div className="mt-8 h-64 rounded-3xl bg-[#e6ebe2]" />
      </main>
    );
  }

  function setSetting(patch: Partial<typeof ledger.settings>) {
    updateLedger((current) => ({
      ...current,
      settings: { ...current.settings, ...patch },
    }));
  }

  function exportCsv() {
    try {
      const csv = createLedgerCsv(ledger.customers, ledger.entries);
      const url = URL.createObjectURL(
        new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "bolkhata-ledger.csv";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(language === "hi" ? "CSV डाउनलोड हो गई।" : "CSV downloaded.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not export CSV: ${error.message}`
          : "Could not export CSV.",
      );
    }
  }

  function deleteAllData() {
    if (!window.confirm(t("settings.deleteConfirm"))) return;
    if (updateLedger(() => createEmptyLedger())) {
      setMessage(language === "hi" ? "सारा डेटा हटा दिया गया।" : "All ledger data was deleted.");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-14 pt-7 sm:px-8 sm:pt-10">
      <Link href="/" className="inline-flex min-h-10 items-center text-sm font-semibold text-[#315d40] hover:underline">
        {t("customer.back")}
      </Link>
      <header className="mt-5">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#68766b]">BolKhata</p>
        <h1 className="mt-1 text-3xl font-bold text-[#183d2b]">{t("settings.title")}</h1>
      </header>

      <section className="mt-6 grid gap-5 rounded-3xl border border-[#dce5dc] bg-white p-5 sm:p-7">
        <label className="text-sm font-semibold text-[#405447]">
          {t("settings.shopName")}
          <input
            value={ledger.settings.shopName}
            maxLength={100}
            onChange={(event) => setSetting({ shopName: event.target.value })}
            className="mt-2 min-h-12 w-full rounded-xl border border-[#cbd8cc] px-3 text-base"
          />
        </label>

        <label className="text-sm font-semibold text-[#405447]">
          {t("settings.language")}
          <select
            value={language}
            onChange={(event) => setSetting({ language: event.target.value as "en" | "hi" })}
            className="mt-2 min-h-12 w-full rounded-xl border border-[#cbd8cc] bg-white px-3 text-base"
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
        </label>

        <div className="rounded-2xl bg-[#f5f6ef] p-4">
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[#405447]">
            <input
              type="checkbox"
              checked={ledger.settings.aiEnabled}
              onChange={(event) => setSetting({ aiEnabled: event.target.checked })}
              className="h-5 w-5 accent-[#1f6840]"
            />
            {translate(language, "home.useAi")}
          </label>
          <p className="mt-1 text-sm leading-6 text-[#66756a]">{t("settings.aiPrivacy")}</p>
        </div>

        <div className="rounded-2xl border border-[#e4e9e2] p-4">
          <h2 className="font-semibold text-[#294a34]">{t("customer.voicePrivacyTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-[#66756a]">{t("settings.voicePrivacy")}</p>
        </div>

        <button
          type="button"
          onClick={exportCsv}
          className="min-h-12 rounded-xl border border-[#1f6840] px-5 py-3 text-left font-semibold text-[#1f6840] hover:bg-[#edf5ed]"
        >
          {t("settings.export")}
        </button>

        <div className="border-t border-[#e4e9e2] pt-5">
          <button
            type="button"
            onClick={deleteAllData}
            className="min-h-12 rounded-xl border border-[#9b3030] px-5 py-3 font-semibold text-[#9b3030] hover:bg-[#fff5f2]"
          >
            {t("settings.delete")}
          </button>
        </div>
        {(message || storageError) && (
          <p role={storageError ? "alert" : "status"} className="text-sm text-[#315d40]">
            {storageError || message}
          </p>
        )}
      </section>
    </main>
  );
}
