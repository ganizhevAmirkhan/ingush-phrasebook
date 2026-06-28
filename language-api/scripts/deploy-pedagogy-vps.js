/**
 * Залить pedagogy-deploy.zip на VPS и установить.
 *   node scripts/deploy-pedagogy-vps.js --host=root@YOUR_IP
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const ZIP = path.join(ROOT, "pedagogy-deploy.zip");
const REMOTE = process.env.VPS_REMOTE_ROOT || "/opt/ingush/ingush-phrasebook-main/language-api";

function sh(cmd) {
  console.log(">", cmd);
  execSync(cmd, { stdio: "inherit" });
}

const hostArg = process.argv.find((a) => a.startsWith("--host="));
const host = hostArg?.slice(7) || process.env.VPS_HOST || "";
if (!host) {
  console.error("VPS_HOST или --host=root@IP");
  process.exit(1);
}

if (!fs.existsSync(ZIP)) {
  sh(`node "${path.join(__dirname, "package-pedagogy-deploy.js")}"`);
}

sh(`scp "${ZIP}" ${host}:${REMOTE}/pedagogy-deploy.zip`);
sh(`ssh ${host} "cd ${REMOTE} && bash scripts/install-pedagogy-on-vps.sh pedagogy-deploy.zip"`);

console.log("\nПроверка публичного API...");
try {
  sh('node scripts/check-vps.js https://api.inghub.ru');
} catch {
  console.log("(check-vps опционален)");
}
