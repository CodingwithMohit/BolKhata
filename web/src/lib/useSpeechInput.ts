"use client";

import { useEffect, useRef, useState } from "react";

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

export function useSpeechInput() {
  const [availability, setAvailability] = useState<Availability>("checking");
  const [language, setLanguage] = useState<SpeechLanguage>("hi-IN");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

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
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  function start(onTranscript: (value: string) => void) {
    if (availability !== "available") {
      setMessage(
        availability === "insecure"
          ? "Voice input needs HTTPS or localhost. You can type instead."
          : "Voice input is not supported in this browser. You can type instead.",
      );
      return;
    }

    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setAvailability("unsupported");
      setMessage("Voice input is not supported in this browser. You can type instead.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const currentTranscript = Array.from({ length: event.results.length }, (_, index) =>
        event.results[index][0].transcript,
      ).join(" ").trim();
      setTranscript(currentTranscript);
      onTranscript(currentTranscript);
    };
    recognition.onerror = (event) => {
      const errorMessages: Record<string, string> = {
        "not-allowed": "Microphone permission was denied. You can type instead.",
        "service-not-allowed": "Microphone permission was denied. You can type instead.",
        "no-speech": "No speech was heard. Hold the button and try again.",
        network: "Speech recognition is unavailable right now. You can type instead.",
        "audio-capture": "No microphone was found. You can type instead.",
      };
      setMessage(errorMessages[event.error] ?? "Voice input stopped. You can type instead.");
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    setMessage("");
    setTranscript("");
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setMessage("Could not start voice input. Check microphone permission or type instead.");
    }
  }

  function stop() {
    try {
      recognitionRef.current?.stop();
    } catch {
      setMessage("Voice input stopped. You can continue by typing.");
    }
    setListening(false);
  }

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
