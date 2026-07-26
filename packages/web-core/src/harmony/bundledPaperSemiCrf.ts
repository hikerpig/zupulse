import bundledModelJson from "./harmony-paper-semi-crf-model.json";
import { parsePaperSemiCrfLinearModel } from "./paper-semi-crf-model";

export const BUNDLED_PAPER_SEMI_CRF_MODEL_SHA256 =
  "6fb18d1245aea9d89f5568a9b384b405c5326cb37015cc2caa5ade8dad5f7515" as const;

export const bundledPaperSemiCrfModel = parsePaperSemiCrfLinearModel(bundledModelJson);
