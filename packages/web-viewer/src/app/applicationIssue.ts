export type ApplicationIssueCode =
  | "library-unavailable"
  | "viewer-library-failed"
  | "viewer-session-failed"
  | "viewer-render-failed"
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
  | "studio-audio-unavailable"
  | "telemetry-preference-write-failed";

export type ApplicationIssue = {
  code: ApplicationIssueCode;
  recoverable: boolean;
};

export function applicationIssue(code: ApplicationIssueCode, recoverable = true): ApplicationIssue {
  return { code, recoverable };
}

export class ApplicationFailure extends Error {
  constructor(
    public readonly issue: ApplicationIssue,
    options?: ErrorOptions,
  ) {
    super(issue.code, options);
    this.name = "ApplicationFailure";
  }
}
