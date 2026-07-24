export type I18nViolation = {
  file: string;
  line: number;
  text: string;
  kind: string;
};

export function checkI18nSource(source: string, fileName?: string): I18nViolation[];
export function checkRepositoryI18n(): I18nViolation[];
