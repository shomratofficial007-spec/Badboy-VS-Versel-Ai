/** Convert a selected locale (for example, bn-BD or hi-IN) to the ISO-639-1 language code expected by the transcription API. */
export function getTranscriptionLanguageCode(language: string): string {
  const languageCode = language.trim().toLowerCase().split(/[-_]/, 1)[0] ?? '';
  return /^[a-z]{2}$/.test(languageCode) ? languageCode : 'en';
}
