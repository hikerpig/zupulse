import { runHarmonyCli } from "./harmonyCli";

runHarmonyCli(process.argv.slice(2))
  .then((output) => console.log(JSON.stringify(output, null, 2)))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
