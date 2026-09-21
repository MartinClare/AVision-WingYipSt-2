import { spawn, type ChildProcess } from "child_process";
import { join } from "path";

const MAX_CONCURRENT = Math.max(1, parseInt(process.env.CMP_EDGE_JOB_CONCURRENCY ?? "2", 10) || 2);

const queue: string[] = [];
const running = new Set<ChildProcess>();

function workerArgs(edgeReportId: string): { cmd: string; args: string[] } {
  const cwd = process.cwd();
  const tsx = join(cwd, "node_modules/tsx/dist/cli.mjs");
  const script = join(cwd, "scripts/process-edge-report-job.ts");
  return {
    cmd: process.execPath,
    args: ["--env-file=.env", tsx, script, edgeReportId],
  };
}

function pump() {
  while (running.size < MAX_CONCURRENT && queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    start(id);
  }
}

function start(edgeReportId: string) {
  const { cmd, args } = workerArgs(edgeReportId);
  const child = spawn(cmd, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.add(child);
  console.log(`[job] spawn pid=${child.pid} report=${edgeReportId} running=${running.size} queued=${queue.length}`);
  child.stdout?.on("data", (buf: Buffer) => process.stdout.write(buf));
  child.stderr?.on("data", (buf: Buffer) => process.stderr.write(buf));
  const done = (code: number | null, signal: NodeJS.Signals | null) => {
    running.delete(child);
    console.log(
      `[job] exit pid=${child.pid} report=${edgeReportId} code=${code} signal=${signal} running=${running.size} queued=${queue.length}`
    );
    pump();
  };
  child.on("exit", done);
  child.on("error", (err) => {
    console.error("[job] spawn failed", edgeReportId, err);
    running.delete(child);
    pump();
  });
}

/** Queue LLM/vision work in a child process that exits when the job finishes (RAM returns to the OS). */
export function enqueueEdgeReportJob(edgeReportId: string) {
  queue.push(edgeReportId);
  pump();
}
