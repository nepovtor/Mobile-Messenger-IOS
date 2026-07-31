import { spawnSync } from "node:child_process";

const allowedAdvisory = "https://github.com/advisories/GHSA-qwww-vcr4-c8h2";
const reviewDeadline = new Date("2026-08-08T00:00:00Z");
const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  cwd: new URL("../web/", import.meta.url),
  encoding: "utf8",
});

if (result.error || !result.stdout) {
  console.error("Unable to run the web dependency audit.");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("npm audit did not return valid JSON.");
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const routerFinding = vulnerabilities["react-router"];
const routerExceptionMatches =
  Array.isArray(routerFinding?.via) &&
  routerFinding.via.length > 0 &&
  routerFinding.via.every(
    (item) => typeof item !== "string" && item.url === allowedAdvisory,
  );
const unapproved = Object.entries(vulnerabilities).filter(([name, finding]) => {
  if (name === "react-router" && routerExceptionMatches) {
    return false;
  }
  if (
    name === "react-router-dom" &&
    routerExceptionMatches &&
    Array.isArray(finding.via) &&
    finding.via.every((item) => item === "react-router")
  ) {
    return false;
  }
  return true;
});

if (unapproved.length > 0) {
  console.error(
    `Unapproved web dependency findings: ${unapproved
      .map(([name, finding]) => `${name} (${finding.severity})`)
      .join(", ")}`,
  );
  process.exit(1);
}

if (Object.keys(vulnerabilities).length > 0) {
  if (Date.now() >= reviewDeadline.getTime()) {
    console.error(
      `The temporary React Router RSC-only audit exception expired on ${reviewDeadline.toISOString()}.`,
    );
    process.exit(1);
  }
  console.warn(
    "Accepted temporary GHSA-qwww-vcr4-c8h2 exception: this static SPA does not use React Server Components or server actions.",
  );
}

console.log("Web production dependency audit passed.");
