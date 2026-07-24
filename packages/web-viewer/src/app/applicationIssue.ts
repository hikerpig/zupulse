export type ApplicationIssueCode =
  | "library-unavailable"
  | "score-not-found"
  | "studio-storage-unavailable"
  | "studio-format-unsupported"
  | "studio-runtime-unavailable"
  | "studio-analyzer-unavailable"
  | "studio-no-analyzable-tracks"
  | "studio-analysis-failed"
  | "studio-save-failed"
  | "studio-version-conflict"
  | "studio-preview-unavailable"
  | "studio-preview-failed"
  | "studio-audio-unavailable";

export type ApplicationIssue = {
  code: ApplicationIssueCode;
  recoverable: boolean;
};

export function applicationIssue(code: ApplicationIssueCode, recoverable = true): ApplicationIssue {
  return { code, recoverable };
}

export class ApplicationFailure extends Error {
  constructor(public readonly issue: ApplicationIssue) {
    super(issue.code);
    this.name = "ApplicationFailure";
  }
}
