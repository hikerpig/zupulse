import bundledModelJson from "./harmony-paper-semi-crf-alternatives.json";
import { harmonyRankerModelSchema } from "./paper-semi-crf-alternative-ranker";

export const bundledPaperSemiCrfAlternativesModel = harmonyRankerModelSchema.parse(bundledModelJson);
