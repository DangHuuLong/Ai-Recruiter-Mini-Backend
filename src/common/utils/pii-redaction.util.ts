// Best-effort PII redaction for AI activity logs on the public/anonymous tier — regex-based,
// does not guarantee catching every form of PII (e.g. a home address, or a name that never
// made it into ParsedResumePersonalData), but removes the two most dangerous direct contact
// channels before persisting text/JSON that would otherwise sit in the database indefinitely.
import { ParsedResumePersonalData } from '../types/ai-service.types';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?\d[\s.-]?){8,15}/g;

const REDACTED_EMAIL = '[REDACTED_EMAIL]';
const REDACTED_PHONE = '[REDACTED_PHONE]';
const REDACTED_VALUE = '[REDACTED]';

// Called directly on free text (e.g. a resume's raw_text) — preserves document structure/layout
// so section-splitting and extraction quality can still be evaluated, only masks the 2 direct
// contact channels.
export function redactContactInfo(text: string): string {
  return text.replace(EMAIL_RE, REDACTED_EMAIL).replace(PHONE_RE, REDACTED_PHONE);
}

// Walks any JSON-shaped value (object/array/string/number/boolean/null, arbitrarily nested)
// and applies redactContactInfo to every string leaf — used on full AI request/response
// payloads instead of writing bespoke redaction rules per payload shape.
export function redactPiiDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return redactContactInfo(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactPiiDeep(item)) as unknown as T;
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactPiiDeep(val);
    }
    return result as T;
  }

  return value;
}

// Called after redactPiiDeep on a resume's parsed personal block — replaces non-null values
// with a fixed marker instead of null, so it's still possible to tell "extraction found a
// value here" from "extraction found nothing" without exposing the value itself.
export function redactPersonalBlock(
  personal: ParsedResumePersonalData,
): ParsedResumePersonalData {
  const redactField = (v: string | null): string | null => (v === null ? null : REDACTED_VALUE);

  return {
    full_name: redactField(personal.full_name),
    email: redactField(personal.email),
    phone: redactField(personal.phone),
    location: redactField(personal.location),
    linkedin_url: redactField(personal.linkedin_url),
    github_url: redactField(personal.github_url),
    portfolio_url: redactField(personal.portfolio_url),
  };
}
