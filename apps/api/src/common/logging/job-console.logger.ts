import { ConsoleLogger, Injectable } from '@nestjs/common';

export type JobLogSink = (level: string, message: string, context?: string) => void;

// Bootstrap/framework contexts — không capture vào job console (chỉ nhiễu)
const EXCLUDED_CONTEXTS = new Set([
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
  'NestFactory',
  'NestApplication',
  'WebSocketsController',
]);

/**
 * Custom logger: giữ nguyên output ra stdout như ConsoleLogger, đồng thời khi có job đang
 * chạy (worker gọi startCapture) thì FORWARD mọi dòng log của mọi service vào job.logs —
 * để trang Show Job hiển thị đầy đủ console thật (AI generate, SSH, per-site...) chứ không
 * chỉ vài dòng addLog thủ công. Worker xử lý 1 job/lần nên không lo tranh chấp sink.
 */
@Injectable()
export class JobConsoleLogger extends ConsoleLogger {
  private sink: JobLogSink | null = null;

  startCapture(sink: JobLogSink): void {
    this.sink = sink;
  }

  stopCapture(): void {
    this.sink = null;
  }

  private forward(level: string, message: unknown, context?: string): void {
    if (!this.sink) return;
    if (context && EXCLUDED_CONTEXTS.has(context)) return;
    try {
      const text =
        typeof message === 'string'
          ? message
          : message instanceof Error
            ? message.message
            : JSON.stringify(message);
      this.sink(level, text, context);
    } catch {
      // Không để lỗi logging làm hỏng job
    }
  }

  // Context là tham số cuối (string) khi log được gọi từ instance logger `new Logger(ctx)`
  private ctxOf(args: unknown[]): string | undefined {
    const last = args[args.length - 1];
    return typeof last === 'string' ? last : undefined;
  }

  log(message: unknown, ...rest: unknown[]): void {
    super.log(message as any, ...(rest as any[]));
    this.forward('info', message, this.ctxOf(rest));
  }

  warn(message: unknown, ...rest: unknown[]): void {
    super.warn(message as any, ...(rest as any[]));
    this.forward('warn', message, this.ctxOf(rest));
  }

  error(message: unknown, ...rest: unknown[]): void {
    super.error(message as any, ...(rest as any[]));
    this.forward('error', message, this.ctxOf(rest));
  }

  debug(message: unknown, ...rest: unknown[]): void {
    super.debug(message as any, ...(rest as any[]));
    this.forward('info', message, this.ctxOf(rest));
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(message as any, ...(rest as any[]));
    this.forward('info', message, this.ctxOf(rest));
  }
}
