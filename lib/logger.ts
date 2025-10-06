import { promises as fs } from 'fs';
import path from 'path';

class Logger {
  private logDir: string;
  private logFile: string;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
    this.ensureLogDir();
  }

  private async ensureLogDir() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private async writeLog(level: string, message: string, data?: any) {
    const timestamp = this.getTimestamp();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data }),
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      await fs.appendFile(this.logFile, logLine, 'utf-8');

      // Also console.log for immediate visibility
      console.log(`[${timestamp}] ${level}: ${message}`, data ? data : '');
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  async info(message: string, data?: any) {
    await this.writeLog('INFO', message, data);
  }

  async error(message: string, data?: any) {
    await this.writeLog('ERROR', message, data);
  }

  async debug(message: string, data?: any) {
    await this.writeLog('DEBUG', message, data);
  }

  async warn(message: string, data?: any) {
    await this.writeLog('WARN', message, data);
  }

  // Special method for chat queries
  async chatQuery(requestId: string, phase: string, data: any) {
    await this.writeLog('CHAT', `[${requestId}] ${phase}`, data);
  }
}

// Singleton instance
export const logger = new Logger();
