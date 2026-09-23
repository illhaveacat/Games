import { useCallback, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { DialogueResponse } from "@games/shared";
import { getSpeechRecognitionConstructor, isSpeechRecognitionSupported } from "../voice/speechRecognitionSupport";
import { fetchDialogueReply } from "../api/dialogueClient";
import "../i18n";
import "./VoiceDialogueInput.css";

type Status = "idle" | "listening" | "sending" | "error";

interface VoiceDialogueInputProps {
  npcId: string;
  onReply: (reply: DialogueResponse) => void;
}

export function VoiceDialogueInput({ npcId, onReply }: VoiceDialogueInputProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("idle");
  const [textValue, setTextValue] = useState("");
  const supported = isSpeechRecognitionSupported();

  const sendToDialogue = useCallback(
    async (playerText: string) => {
      const trimmed = playerText.trim();
      if (!trimmed) return;
      setStatus("sending");
      try {
        const reply = await fetchDialogueReply(npcId, trimmed);
        onReply(reply);
        setStatus("idle");
      } catch {
        setStatus("error");
      }
    },
    [npcId, onReply],
  );

  const handleMicClick = () => {
    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) return;

    const recognition = new RecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      void sendToDialogue(transcript);
    };
    recognition.onerror = () => setStatus("error");
    recognition.onend = () => {
      setStatus((current) => (current === "listening" ? "idle" : current));
    };

    setStatus("listening");
    recognition.start();
  };

  const handleFallbackSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendToDialogue(textValue);
    setTextValue("");
  };

  if (!supported) {
    return (
      <form className="voice-input voice-input--fallback" onSubmit={handleFallbackSubmit} data-testid="voice-input-fallback">
        <label htmlFor="voice-fallback-text">{t("voice.fallbackLabel")}</label>
        <input
          id="voice-fallback-text"
          type="text"
          value={textValue}
          onChange={(event) => setTextValue(event.target.value)}
          placeholder={t("voice.fallbackPlaceholder")}
        />
        <button type="submit" disabled={status === "sending"}>
          {t("voice.send")}
        </button>
      </form>
    );
  }

  return (
    <div className="voice-input" data-testid="voice-input-mic">
      <button
        type="button"
        onClick={handleMicClick}
        disabled={status === "listening" || status === "sending"}
      >
        {status === "listening" ? t("voice.listening") : t("voice.speak")}
      </button>
    </div>
  );
}
