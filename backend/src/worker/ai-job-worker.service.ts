import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcess } from 'node:child_process';
import { constants as fsConstants, accessSync, statSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Prisma } from '../generated/prisma/client';
import { AiResultImportService } from '../ai-results/ai-result-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';

interface ClaimedJob { id: string; videoId: string }
interface WorkerSettings {
  pythonBin: string;
  serviceRoot: string;
  configPath?: string;
  timeoutMs: number;
  pollIntervalMs: number;
  concurrency: number;
  keepFailedWorkdir: boolean;
}
interface RunningChild { child?: ChildProcess; cancel: () => Promise<void> }
interface PythonExit { code: number | null; signal: NodeJS.Signals | null; stderr: string; timedOut: boolean; cancelled: boolean }

const KILL_GRACE_MS = 1_000;
const RECOVERY_GRACE_MS = KILL_GRACE_MS + 5_000;

@Injectable()
export class AiJobWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(AiJobWorkerService.name);
  private readonly settings: WorkerSettings;
  private readonly active = new Set<Promise<void>>();
  private readonly runningChildren = new Set<RunningChild>();
  private stopping = false;
  private loopPromise?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly importer: AiResultImportService,
    private readonly storage: LocalStorageService,
    config: ConfigService,
  ) {
    this.settings = this.readSettings(config);
  }

  async recoverStaleJobs(): Promise<number> {
    const staleAfterMs = this.settings.timeoutMs + RECOVERY_GRACE_MS;
    const staleBefore = new Date(Date.now() - staleAfterMs);
    const result = await this.prisma.processingJob.updateMany({
      where: { status: 'PROCESSING', startedAt: { lt: staleBefore } },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: `Worker recovery: job quá hạn sau ${staleAfterMs} ms`,
      },
    });
    return result.count;
  }

  start(): Promise<void> {
    if (this.loopPromise) return this.loopPromise;
    this.stopping = false;
    this.loopPromise = this.runLoop();
    return this.loopPromise;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await Promise.all([...this.runningChildren].map((running) => running.cancel()));
    await this.loopPromise;
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async claimAndRunOne(): Promise<boolean> {
    if (this.stopping) return false;
    const claimed = await this.prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
      UPDATE "ProcessingJob"
      SET "status" = 'PROCESSING'::"ProcessingJobStatus",
          "startedAt" = now(),
          "updatedAt" = now()
      WHERE "id" = (
        SELECT "id"
        FROM "ProcessingJob"
        WHERE "status" = 'PENDING'::"ProcessingJobStatus"
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "videoId"
    `);
    const job = claimed[0];
    if (!job) return false;

    await this.processClaimed(job);
    return true;
  }

  private async runLoop(): Promise<void> {
    const recovered = await this.recoverStaleJobs();
    if (recovered > 0) this.logger.warn(`Marked ${recovered} stale processing job(s) as FAILED`);
    let nextRecoveryAt = Date.now() + Math.max(this.settings.pollIntervalMs, 30_000);
    while (!this.stopping) {
      if (Date.now() >= nextRecoveryAt) {
        try {
          const recoveredCount = await this.recoverStaleJobs();
          if (recoveredCount > 0) this.logger.warn(`Marked ${recoveredCount} stale processing job(s) as FAILED`);
        } catch (error) {
          this.logger.error(`Stale job recovery failed: ${this.safeError(error)}`);
        }
        nextRecoveryAt = Date.now() + Math.max(this.settings.pollIntervalMs, 30_000);
      }
      while (!this.stopping && this.active.size < this.settings.concurrency) {
        const task = this.claimAndRunOne()
          .catch((error: unknown) => this.logger.error(`Worker iteration failed: ${this.safeError(error)}`))
          .then(() => undefined);
        this.active.add(task);
        void task.finally(() => this.active.delete(task));
      }
      if (!this.stopping) await new Promise((done) => setTimeout(done, this.settings.pollIntervalMs));
    }
    await Promise.allSettled([...this.active]);
  }

  private async processClaimed(job: ClaimedJob): Promise<void> {
    let workdir: string | undefined;
    let succeeded = false;
    try {
      if (this.stopping) throw new Error('Worker shutdown sau khi claim job');
      const video = await this.prisma.video.findUnique({ where: { id: job.videoId }, select: { storageKey: true } });
      if (!video) throw new Error('Không tìm thấy video của processing job');
      const inputPath = await this.resolveVideoPath(video.storageKey);
      workdir = await mkdtemp(join(tmpdir(), `ai-job-${job.id}-`));
      if (this.stopping) throw new Error('Worker shutdown trước khi chạy Python');
      const result = await this.runPython(job, inputPath, workdir);
      if (result.cancelled) throw new Error('Worker shutdown khi Python đang chạy');
      if (result.timedOut) throw new Error(`Python timeout sau ${this.settings.timeoutMs} ms. ${result.stderr}`);

      let payload: unknown;
      try {
        payload = JSON.parse(await readFile(join(workdir, 'results.json'), 'utf8')) as unknown;
      } catch (error) {
        throw new Error(`Python không tạo results.json hợp lệ (exit ${result.code ?? result.signal ?? 'unknown'}). ${result.stderr} ${this.safeError(error)}`, { cause: error });
      }
      const summary = (payload as { summary?: { status?: unknown } } | null)?.summary;
      if (result.code !== 0 && !(result.code === 1 && summary?.status === 'FAILED')) {
        throw new Error(`Python kết thúc với exit code ${result.code ?? result.signal ?? 'unknown'}. ${result.stderr}`);
      }
      const imported = await this.importer.import(job.id, payload, workdir);
      succeeded = imported.status === 'COMPLETED';
      if (!succeeded) this.logger.warn(`AI job ${job.id} completed with FAILED result`);
    } catch (error) {
      await this.markFailed(job.id, this.safeError(error));
      this.logger.error(`AI job ${job.id} failed: ${this.safeError(error)}`);
    } finally {
      if (workdir && (succeeded || !this.settings.keepFailedWorkdir)) {
        await rm(workdir, { recursive: true, force: true }).catch((error: unknown) => {
          this.logger.warn(`Could not remove worker temp directory: ${this.safeError(error)}`);
        });
      }
    }
  }

  private async runPython(job: ClaimedJob, inputPath: string, outputDir: string): Promise<PythonExit> {
    const args = ['-m', 'traffic_ai'];
    if (this.settings.configPath) args.push('--config', this.settings.configPath);
    args.push('--input', inputPath, '--output', outputDir, '--job-id', job.id);

    let running: RunningChild | undefined;
    const exitPromise = new Promise<PythonExit>((resolveExit, rejectExit) => {
      const child = spawn(this.settings.pythonBin, args, {
        cwd: this.settings.serviceRoot,
        shell: false,
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env },
      });
      let stderr = '';
      let timedOut = false;
      let cancelled = false;
      let settled = false;
      let closeProcess!: () => void;
      const closed = new Promise<void>((done) => { closeProcess = done; });
      const terminate = async (isCancel: boolean): Promise<void> => {
        if (isCancel) cancelled = true;
        if (child.pid && !settled) {
          try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
          await Promise.race([closed, new Promise<void>((done) => {
            const timer = setTimeout(done, KILL_GRACE_MS);
            timer.unref();
          })]);
          if (!settled && child.pid) {
            try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
          }
        }
      };
      running = { child, cancel: () => terminate(true) };
      this.runningChildren.add(running);
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr = (stderr + chunk.toString()).slice(-8_000);
      });
      child.once('error', (error) => {
        settled = true;
        closeProcess();
        rejectExit(error);
      });
      child.once('close', (code, signal) => {
        settled = true;
        closeProcess();
        resolveExit({ code, signal, stderr, timedOut, cancelled });
      });
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        void terminate(false);
      }, this.settings.timeoutMs);
      timeoutTimer.unref();
      child.once('close', () => clearTimeout(timeoutTimer));
    });
    try {
      return await exitPromise;
    } finally {
      if (running) this.runningChildren.delete(running);
    }
  }

  private async resolveVideoPath(storageKey: string): Promise<string> {
    if (!storageKey || storageKey.includes('\0') || isAbsolute(storageKey)) {
      throw new Error('Video storageKey không an toàn');
    }
    const root = await realpath(this.storage.root);
    const candidate = resolve(root, storageKey);
    const candidateRelation = relative(root, candidate);
    if (candidateRelation === '..' || candidateRelation.startsWith(`..${sep}`) || isAbsolute(candidateRelation)) {
      throw new Error('Video storageKey nằm ngoài STORAGE_ROOT');
    }
    const actual = await realpath(candidate);
    const actualRelation = relative(root, actual);
    if (actualRelation === '..' || actualRelation.startsWith(`..${sep}`) || isAbsolute(actualRelation)) {
      throw new Error('Video symlink nằm ngoài STORAGE_ROOT');
    }
    if (!(await stat(actual)).isFile()) throw new Error('Video storageKey không phải file');
    return actual;
  }

  private async markFailed(jobId: string, message: string): Promise<void> {
    await this.prisma.processingJob.updateMany({
      where: { id: jobId, status: 'PROCESSING' },
      data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
    });
  }

  private safeError(error: unknown): string {
    let message = error instanceof Error ? error.message : String(error);
    for (const path of [this.storage.root, this.settings.serviceRoot, process.cwd(), tmpdir()]) {
      if (path) message = message.replaceAll(resolve(path), '[path]');
    }
    message = message.replace(/(?:[A-Za-z]:\\|\/)(?:[^\s:'"<>|]+[\\/])*[^\s:'"<>|]*/g, '[path]');
    return message.slice(0, 1_000);
  }

  private readSettings(config: ConfigService): WorkerSettings {
    const pythonBin = config.get<string>('AI_PYTHON_BIN')?.trim();
    const serviceRoot = config.get<string>('AI_SERVICE_ROOT')?.trim();
    const timeoutMs = this.positiveInteger(config.get<string>('AI_JOB_TIMEOUT_MS'), 'AI_JOB_TIMEOUT_MS');
    const pollIntervalMs = this.positiveInteger(config.get<string>('AI_WORKER_POLL_INTERVAL_MS'), 'AI_WORKER_POLL_INTERVAL_MS');
    const concurrency = this.positiveInteger(config.get<string>('AI_WORKER_CONCURRENCY') ?? '1', 'AI_WORKER_CONCURRENCY');
    if (!pythonBin || !isAbsolute(pythonBin)) throw new Error('AI_PYTHON_BIN phải là đường dẫn tuyệt đối');
    if (!serviceRoot || !isAbsolute(serviceRoot)) throw new Error('AI_SERVICE_ROOT phải là đường dẫn tuyệt đối');
    const configPath = config.get<string>('AI_CONFIG_PATH')?.trim();
    if (configPath && !isAbsolute(configPath)) throw new Error('AI_CONFIG_PATH phải là đường dẫn tuyệt đối');
    accessSync(pythonBin, fsConstants.X_OK);
    if (!statSync(serviceRoot).isDirectory()) throw new Error('AI_SERVICE_ROOT phải là thư mục');
    if (configPath) accessSync(configPath, fsConstants.R_OK);
    const keepFailed = config.get<string>('AI_KEEP_FAILED_WORKDIR') ?? 'false';
    if (!['true', 'false'].includes(keepFailed)) throw new Error('AI_KEEP_FAILED_WORKDIR phải là true hoặc false');
    return { pythonBin, serviceRoot, configPath, timeoutMs, pollIntervalMs, concurrency, keepFailedWorkdir: keepFailed === 'true' };
  }

  private positiveInteger(value: string | undefined, name: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} phải là số nguyên dương`);
    return parsed;
  }
}
