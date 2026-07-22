import bundledCalibrationJson from "./harmony-primary-mlp-calibration.json";
import { mlpHarmonyCalibrationAssetSchema } from "./confidenceCalibration";

export const BUNDLED_HARMONY_DECISION_THRESHOLD = 0.46;
export const bundledHarmonyPrimaryCalibration = mlpHarmonyCalibrationAssetSchema.parse(bundledCalibrationJson);
