const FORBIDDEN_MARKUP = /!\[[^\]]*\]\s*\(|<(?:img|picture|video|audio|source|svg|canvas|iframe)\b|data:image\//iu;
const FORBIDDEN_KEYS = /^(?:image|images|photo|photos|chart|charts|widget|widgets|card|cards|media|attachment|attachments|document|video|animation|audio)$/iu;

export function assertPlainTextTelegramMessage(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
    throw new Error("TELEGRAM_PLAIN_TEXT_INVALID_LENGTH");
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new Error("TELEGRAM_PLAIN_TEXT_CONTROL_CHARACTER");
  }
  if (FORBIDDEN_MARKUP.test(value)) {
    throw new Error("TELEGRAM_VISUAL_MARKUP_PROHIBITED");
  }
  return value;
}

export function assertPlainTextTelegramPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("TELEGRAM_PAYLOAD_NOT_OBJECT");
  }
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== "text" || keys.some(key => FORBIDDEN_KEYS.test(key))) {
    throw new Error("TELEGRAM_PAYLOAD_TEXT_ONLY_REQUIRED");
  }
  assertPlainTextTelegramMessage(payload.text);
  return payload;
}

export function buildPlainTextTelegramPayload(value) {
  const payload = Object.freeze({ text: assertPlainTextTelegramMessage(value) });
  return assertPlainTextTelegramPayload(payload);
}
