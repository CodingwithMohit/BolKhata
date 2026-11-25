"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createEmptyLedger,
  LEDGER_STORAGE_KEY,
  ledgerSchema,
  parseLedger,
  type Ledger,
} from "./ledger";

const LEDGER_EVENT = "bolkhata-ledger-change";

export function useLedger() {
  const [ledger, setLedger] = useState<Ledger>(createEmptyLedger);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        setLedger(parseLedger(window.localStorage.getItem(LEDGER_STORAGE_KEY)));
      } catch {
        setLedger(createEmptyLedger());
        setStorageError("Browser storage is unavailable. Changes cannot be saved.");
      }
      setLoaded(true);
    });

    function syncLedger() {
      try {
        setLedger(parseLedger(window.localStorage.getItem(LEDGER_STORAGE_KEY)));
      } catch {
        setStorageError("Browser storage is unavailable. Changes cannot be loaded.");
      }
    }

    window.addEventListener("storage", syncLedger);
    window.addEventListener(LEDGER_EVENT, syncLedger);
    return () => {
      active = false;
      window.removeEventListener("storage", syncLedger);
      window.removeEventListener(LEDGER_EVENT, syncLedger);
    };
  }, []);

  const updateLedger = useCallback((update: (current: Ledger) => Ledger) => {
    try {
      const current = parseLedger(window.localStorage.getItem(LEDGER_STORAGE_KEY));
      const next = ledgerSchema.parse(update(current));
      window.localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(next));
      setLedger(next);
      setStorageError("");
      window.dispatchEvent(new Event(LEDGER_EVENT));
      return true;
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? `Could not save your ledger: ${error.message}`
          : "Could not save your ledger.",
      );
      return false;
    }
  }, []);

  return { ledger, loaded, storageError, updateLedger };
}
