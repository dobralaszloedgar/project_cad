"use client";
import { useEffect, useRef, useState } from "react";
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: {
        results: { isFinal: boolean; 0: { transcript: string } }[];
        resultIndex: number;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function useDictation(
  onText: (text: string) => void,
  onError: (message: string) => void,
  active: boolean,
  chatKey: string,
) {
  const [supported, setSupported] = useState(false),
    [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => {
    const voice = window as VoiceWindow;
    queueMicrotask(() =>
      setSupported(
        !!(voice.SpeechRecognition || voice.webkitSpeechRecognition),
      ),
    );
    return () => {
      recognition.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!active) recognition.current?.stop();
  }, [active]);
  useEffect(
    () => () => {
      recognition.current?.stop();
    },
    [chatKey],
  );
  function toggle() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const voice = window as VoiceWindow,
      Constructor = voice.SpeechRecognition || voice.webkitSpeechRecognition;
    if (!Constructor) return;
    const instance = new Constructor();
    instance.lang = navigator.language;
    instance.interimResults = false;
    instance.continuous = true;
    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++)
        if (event.results[i].isFinal) onText(event.results[i][0].transcript);
    };
    instance.onerror = (event) => {
      if (event.error !== "aborted")
        onError(
          event.error === "not-allowed"
            ? "Microphone access was not granted. You can still type."
            : "Dictation stopped. Try again or type your message.",
        );
      setListening(false);
    };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    try {
      instance.start();
      setListening(true);
    } catch {
      onError("Could not start dictation. Try again.");
    }
  }
  return { supported, listening, toggle };
}
