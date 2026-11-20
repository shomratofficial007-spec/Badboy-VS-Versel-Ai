const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CARD_NUMBER_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;
const PHONE_OR_ACCOUNT_PATTERN = /\+?\d(?:[\s().-]*\d){9,}/g;
const OTP_PATTERN = /\b(OTP|one[- ]time code|verification code|security code|2FA code)(?:\s*[:=]\s*|\s+)\d{4,8}\b/gi;
const CVV_PATTERN = /\b(cvv|cvc|card security code)\s*[:=]\s*\d{3,4}\b/gi;
const ACCOUNT_PATTERN = /\b(account number|bank account|routing number|national id|ssn)\s*[:=]\s*[A-Z0-9 -]{6,34}\b/gi;
const IBAN_PATTERN = /\b(IBAN)(?:\s*[:=]\s*|\s+)[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi;
const PASSWORD_PATTERN = /\b(password|passcode|pin|cvv|cvc|security answer|secret)\s*[:=]\s*[^\r\n]+/gi;
const API_CREDENTIAL_PATTERN = /\b(api[-_ ]?key|access token|refresh token|client secret|secret key)\s*[:=]\s*[^\r\n]+/gi;
const AUTHORIZATION_PATTERN = /\b(authorization\s*[:=]\s*(?:bearer|basic))\s+\S+/gi;
const COOKIE_PATTERN = /\b(cookie\s*[:=]\s*)[^\r\n]+/gi;
const URL_SECRET_PATTERN = /([?&](?:access_token|api_key|token|key|secret|password|auth|code|session)=)[^&#\s]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const SECRET_TOKEN_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|cf_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9_-]{20,}|\d{8,10}:[A-Za-z0-9_-]{30,})\b/g;
const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?\b/g;

export function redactSensitiveScreenText(value: string): string {
  if (typeof value !== 'string') return '';
  const preservedDates: string[] = [];
  const protectedValue = value.replace(
    ISO_DATE_PATTERN,
    (date) => '__BADBOY_DATE_' + (preservedDates.push(date) - 1) + '__',
  );
  const redacted = protectedValue
    .replace(EMAIL_PATTERN, '[email]')
    .replace(OTP_PATTERN, '$1: [code]')
    .replace(CVV_PATTERN, '$1: [redacted]')
    .replace(ACCOUNT_PATTERN, '$1: [redacted]')
    .replace(IBAN_PATTERN, '$1: [redacted]')
    .replace(PASSWORD_PATTERN, '$1: [redacted]')
    .replace(API_CREDENTIAL_PATTERN, '$1: [redacted]')
    .replace(AUTHORIZATION_PATTERN, '$1 [redacted]')
    .replace(COOKIE_PATTERN, '$1[redacted]')
    .replace(URL_SECRET_PATTERN, '$1[redacted]')
    .replace(JWT_PATTERN, '[token]')
    .replace(SECRET_TOKEN_PATTERN, '[secret token]')
    .replace(CARD_NUMBER_PATTERN, '[card number]')
    .replace(PHONE_OR_ACCOUNT_PATTERN, '[phone/account number]');
  return redacted.replace(/__BADBOY_DATE_(\d+)__/g, (_placeholder, index: string) => preservedDates[Number(index)] ?? '');
}

export function normalizeVisibleScreenText(value: string): string {
  if (typeof value !== 'string') return '';
  const safeValue = Array.from(value).filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return !(code <= 0x08 || code === 0x0B || code === 0x0C || (code >= 0x0E && code <= 0x1F) || code === 0x7F);
  }).join('');
  const redacted = redactSensitiveScreenText(safeValue);
  const lines = redacted
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const unique = [...new Set(lines)];
  return unique.join('\n').slice(0, 4_500).trim();
}
