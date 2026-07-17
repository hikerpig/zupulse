import { runHarmonyCommand } from "./command";

runHarmonyCommand(process.argv.slice(2))
  .then((report) => console.log(JSON.stringify(report, null, 2)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
