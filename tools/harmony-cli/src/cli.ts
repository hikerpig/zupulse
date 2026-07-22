import { runHarmonyCommand } from "./command";

runHarmonyCommand(process.argv.slice(2))
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if ("command" in report && (report.command === "eval" || report.command === "compare") && report.summary.failed > 0)
      process.exitCode = 1;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
