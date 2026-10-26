const path = require("node:path");

const root = __dirname;
const runtime = process.env.CRM_BUN_BIN || "bun";
const common = {
	instances: 1,
	exec_mode: "fork",
	autorestart: true,
	restart_delay: 3000,
	max_memory_restart: "700M",
	kill_timeout: 30000,
	time: true,
	env: { NODE_ENV: "production" },
};

module.exports = {
	apps: [
		{
			...common,
			name: "crm-web",
			cwd: path.join(root, "apps/app"),
			script: require.resolve("next/dist/bin/next", {
				paths: [path.join(root, "apps/app")],
			}),
			args: `start -p ${process.env.CRM_WEB_PORT || "3000"}`,
			interpreter: "node",
		},
		{
			...common,
			name: "crm-api",
			cwd: path.join(root, "apps/api"),
			script: runtime,
			args: ["dist/main.js"],
			interpreter: "none",
		},
		{
			...common,
			name: "crm-care-worker",
			cwd: path.join(root, "tools/customer-care"),
			script: runtime,
			args: ["dist/worker.js"],
			interpreter: "none",
		},
	],
};
