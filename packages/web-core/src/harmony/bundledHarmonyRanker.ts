import bundledModelJson from "./harmony-ranker-model.json";
import { harmonyRankerModelSchema } from "./learnedRanker";

export const bundledHarmonyRankerModel = harmonyRankerModelSchema.parse(bundledModelJson);
