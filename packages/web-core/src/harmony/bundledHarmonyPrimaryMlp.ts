import bundledModelJson from "./harmony-primary-mlp-model.json";
import { mlpHarmonyRerankerModelSchema } from "./mlpReranker";

export const bundledHarmonyPrimaryMlp = mlpHarmonyRerankerModelSchema.parse(bundledModelJson);
