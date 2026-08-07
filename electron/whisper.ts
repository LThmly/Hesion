import { requireKey } from "./providers/types";
import type { ApiKeys } from "../shared/types";

export async function transcribeAudio(
  apiKeys: ApiKeys,
  audioBase64: string,
  mimeType: string,
): Promise<string> {
  const key = requireKey(apiKeys, "openai");
  const binary = Buffer.from(audioBase64, "base64");
  const bytes = new Uint8Array(binary);
  const ext = mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("mp4")
        ? "mp4"
        : "wav";

  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: mimeType }),
    `audio.${ext}`,
  );
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Whisper error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as { text?: string };
  return (json.text || "").trim();
}
