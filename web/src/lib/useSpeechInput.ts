"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechAlternativeLike {
  transcript: string;
}

interface SpeechResultLike {
  isFinal: boolean;
  [index: number]: SpeechAlternativeLike;
}

interface SpeechResultListLike {
  length: number;
  [index: number]: SpeechResultLike;
}

interface SpeechRecognitionResultEventLike extends Event {
  results: SpeechResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type SpeechLanguage = "hi-IN" | "en-IN";
type Availability = "checking" | "available" | "unsupported" | "insecure";

function comparisonToken(token: string): string {
  return token.toLocaleLowerCase("en-IN").replace(/^[^\p{L}\p{N}₹]+|[^\p{L}\p{N}₹]+$/gu, "");
}

export function appendSpeechSegment(previous: string, next: string): string {
  const left = previous.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;

  const leftTokens = left.split(/\s+/u);
  const rightTokens = right.split(/\s+/u);
  const leftComparable = leftTokens.map(comparisonToken);
  const rightComparable = rightTokens.map(comparisonToken);

  if (
    rightComparable.length >= leftComparable.length &&
    leftComparable.every((token, index) => token === rightComparable[index])
  ) {
    return right;
  }
  if (
    leftComparable.length >= rightComparable.length &&
    rightComparable.every((token, index) => token === leftComparable[index])
  ) {
    return left;
  }

  let overlap = Math.min(leftTokens.length, rightTokens.length);
  while (overlap > 0) {
    const matches = leftComparable
      .slice(-overlap)
      .every((token, index) => token === rightComparable[index]);
    if (matches) break;
    overlap -= 1;
  }

  return [...leftTokens, ...rightTokens.slice(overlap)].join(" ");
}

export function readSpeechResults(results: SpeechResultListLike): string {
  let combined = "";
  for (let index = 0; index < results.length; index += 1) {
    const segment = results[index][0]?.transcript.trim();
    if (segment) combined = appendSpeechSegment(combined, segment);
  }
  return combined;
}

export function useSpeechInput() {
  const [availability, setAvailability] = useState<Availability>("checking");
  const [language, setLanguage] = useState<SpeechLanguage>("hi-IN");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const heldRef = useRef(false);
  const sessionTranscriptRef = useRef("");
  const currentTranscriptRef = useRef("");
  const transcriptCallbackRef = useRef<((value: string) => void) | null>(null);
  const languageRef = useRef(language);
  const generationRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginRecognitionRef = useRef<() => void>(() => {});

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    queueMicrotask(() => {
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        setAvailability("insecure");
        return;
      }
      setAvailability(
        window.SpeechRecognition || window.webkitSpeechRecognition
          ? "available"
          : "unsupported",
      );
    });

    return () => {
      heldRef.current = false;
      generationRef.current += 1;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const finishRecognition = useCallback(() => {
    const finishedTranscript = currentTranscriptRef.current;
    if (finishedTranscript) {
      sessionTranscriptRef.current = appendSpeechSegment(
        sessionTranscriptRef.current,
        finishedTranscript,
      );
      currentTranscriptRef.current = "";
    }
    const fullTranscript = sessionTranscriptRef.current;
    setTranscript(fullTranscript);
    transcriptCallbackRef.current?.(fullTranscript);
  }, []);

  const beginRecognition = useCallback(() => {
    if (!heldRef.current || recognitionRef.current) return;

    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      heldRef.current = false;
      setListening(false);
      setAvailability("unsupported");
      setMessage("Voice input is not supported in this browser. You can type instead.");
      return;
    }

    const generation = generationRef.current;
    const recognition = new Recognition();
    recognition.lang = languageRef.current;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (!heldRef.current || generation !== generationRef.current) return;
      currentTranscriptRef.current = readSpeechResults(event.results);
      const fullTranscript = appendSpeechSegment(
        sessionTranscriptRef.current,
        currentTranscriptRef.current,
      );
      setTranscript(fullTranscript);
      transcriptCallbackRef.current?.(fullTranscript);
    };
    recognition.onerror = (event) => {
      const errorMessages: Record<string, string> = {
        "not-allowed": "Microphone permission was denied. You can type instead.",
        "service-not-allowed": "Microphone permission was denied. You can type instead.",
        "no-speech": "No speech was heard. Keep holding the button and try again.",
        network: "Speech recognition is unavailable right now. You can type instead.",
        "audio-capture": "No microphone was found. You can type instead.",
      };
      setMessage(errorMessages[event.error] ?? "Voice input stopped. You can type instead.");
      if (event.error !== "no-speech") {
        heldRef.current = false;
        generationRef.current += 1;
        recognitionRef.current = null;
        finishRecognition();
        setListening(false);
      }
    };
    recognition.onend = () => {
      if (generation !== generationRef.current) return;
      recognitionRef.current = null;
      finishRecognition();
      if (!heldRef.current) {
        setListening(false);
        return;
      }
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (heldRef.current) beginRecognitionRef.current();
      }, 200);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      heldRef.current = false;
      generationRef.current += 1;
      setListening(false);
      setMessage("Could not start voice input. Check microphone permission or type instead.");
    }
  }, [finishRecognition]);

  useEffect(() => {
    beginRecognitionRef.current = beginRecognition;
  }, [beginRecognition]);

  const start = useCallback(
    (onTranscript: (value: string) => void) => {
      if (heldRef.current) return;
      if (availability !== "available") {
        setMessage(
          availability === "insecure"
            ? "Voice input needs HTTPS or localhost. You can type instead."
            : "Voice input is not supported in this browser. You can type instead.",
        );
        return;
      }

      heldRef.current = true;
      generationRef.current += 1;
      sessionTranscriptRef.current = "";
      currentTranscriptRef.current = "";
      transcriptCallbackRef.current = onTranscript;
      setMessage("");
      setTranscript("");
      setListening(true);
      beginRecognition();
    },
    [availability, beginRecognition],
  );

  const stop = useCallback(() => {
    if (!heldRef.current) return;
    heldRef.current = false;
    generationRef.current += 1;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    finishRecognition();
    try {
      recognition?.stop();
    } catch {
      setMessage("Voice input stopped. You can continue by typing.");
    }
    setListening(false);
  }, [finishRecognition]);

  return {
    availability,
    language,
    setLanguage,
    listening,
    transcript,
    message,
    start,
    stop,
  };
}
