export const SCORE_ZOOM_COMMIT_EVENT = "zupulse:score-zoom-commit";
export const SCORE_LAYOUT_COMMIT_EVENT = "zupulse:score-layout-commit";

export type ScoreZoomCommitDetail = {
  zoom: number;
};

export type ScoreLayoutCommitDetail = {
  reason: "width";
};
