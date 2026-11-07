import {
  MessageChannel,
  type MessagePort,
  receiveMessageOnPort,
  Worker,
} from "node:worker_threads";

import type {
  NativeCompiler,
  NativeHoverAnswer,
  NativeHoverDocument,
  NativeHoverReply,
  NativeHoverRequest,
  NativeHoverWorkerInput,
  NativeMappedFile,
} from "./native-hover-worker.js";

/** The first request waits for both processes to start and the project to load. */
const REPLY_TIMEOUT_MS = 120_000;

/**
 * Synchronous handle on TypeScript 7.1 or tsrs. Their API and language server are
 * separate processes with asynchronous JavaScript clients (under Bun); they run in a
 * worker, and each call here blocks until the worker replies.
 */
export class NativeHoverClient {
  private readonly worker: Worker;
  private readonly port: MessagePort;
  private readonly signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

  constructor(
    rootDirectory: string,
    compiler: NativeCompiler,
    internalIdentifier: RegExp,
    documents: readonly NativeHoverDocument[],
  ) {
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    const workerData: NativeHoverWorkerInput = {
      port: port2,
      signal: this.signal,
      rootDirectory,
      compiler,
      internalIdentifier: internalIdentifier.source,
    };
    this.worker = new Worker(new URL("./native-hover-worker.ts", import.meta.url), {
      workerData,
      transferList: [port2],
    });
    // The worker only ends on dispose; it must not keep the process alive.
    this.worker.unref();
    this.call({ kind: "open", documents });
  }

  analyze(fileName: string, document: NativeHoverDocument): NativeHoverAnswer {
    const { answer } = this.call({ kind: "analyze", fileName, document });
    if (!answer) throw new Error("TypeScript 7.1 worker returned no hover answer");
    return answer;
  }

  /** Hovers of a Vue or Svelte file, through the content mappers its project names. */
  analyzeMapped(file: NativeMappedFile): NativeHoverAnswer {
    const { answer } = this.call({ kind: "analyzeMapped", file });
    if (!answer) throw new Error("TypeScript 7.1 worker returned no hover answer");
    return answer;
  }

  close(uris: readonly string[]): void {
    this.call({ kind: "close", uris });
  }

  dispose(): void {
    this.call({ kind: "dispose" });
    void this.worker.terminate();
  }

  private call(request: NativeHoverRequest): Extract<NativeHoverReply, { ok: true }> {
    Atomics.store(this.signal, 0, 0);
    this.port.postMessage(request);
    if (Atomics.wait(this.signal, 0, 0, REPLY_TIMEOUT_MS) === "timed-out") {
      throw new Error(`TypeScript 7.1 worker did not answer ${request.kind} in time`);
    }
    const received = receiveMessageOnPort(this.port);
    if (!received) throw new Error(`TypeScript 7.1 worker sent no reply to ${request.kind}`);
    const reply = received.message as NativeHoverReply;
    if (!reply.ok) throw new Error(`TypeScript 7.1 worker ${request.kind}: ${reply.error}`);
    return reply;
  }
}
