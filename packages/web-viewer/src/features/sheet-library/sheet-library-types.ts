import type { ImportItemResult, LibraryScoreSummary, ScoreImportSource } from "@zupulse/web-core";
import type { ViewerApplication } from "../../app/ViewerApplication";
import type { BundledSampleScore } from "../../sample-scores";

export type ImportSummaryState = {
  total: number;
  results: readonly ImportItemResult[];
  cancelled: number;
  running: boolean;
};

export type SheetLibraryProps = {
  application: ViewerApplication;
  scores: readonly LibraryScoreSummary[];
  loading: boolean;
  error?: string;
  importing?: boolean;
  importSummary?: ImportSummaryState;
  onSelectImportFiles(): Promise<readonly ScoreImportSource[]>;
  onDropImportFiles?(files: readonly File[]): readonly ScoreImportSource[];
  sampleScores?: readonly BundledSampleScore[];
  onSelectSample?(id: BundledSampleScore["id"]): ScoreImportSource | undefined;
  onImportSources(sources: readonly ScoreImportSource[]): Promise<void>;
  onOpen(id: string): void;
};
