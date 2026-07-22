import { runHarmonyBoundaryCommand } from "./harmonyBoundaryCommand";

runHarmonyBoundaryCommand(process.argv.slice(2))
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
