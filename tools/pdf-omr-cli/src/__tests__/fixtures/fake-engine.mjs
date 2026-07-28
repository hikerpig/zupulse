const mode = process.argv[2];

if (mode === "success") {
  process.stdout.write("recognized\n");
  process.stderr.write("diagnostic\n");
} else if (mode === "fail") {
  process.stderr.write("sensitive stderr\n");
  process.exitCode = 7;
} else if (mode === "large-output") {
  process.stdout.write("x".repeat(4096));
} else if (mode === "hang") {
  setInterval(() => {}, 1000);
} else if (mode === "ignore-term") {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1000);
} else {
  process.exitCode = 2;
}
