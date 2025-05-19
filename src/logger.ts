/**
 * 日志记录模块
 * 提供统一的日志记录功能
 */

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
}

export class Logger {
    private static instance: Logger;
    private logLevel: LogLevel = LogLevel.INFO;

    private constructor() {}

    /**
     * 获取Logger实例
     */
    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * 设置日志级别
     */
    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    /**
     * 获取当前时间戳
     */
    private getTimestamp(): string {
        return new Date().toISOString();
    }

    /**
     * 记录调试日志
     */
    public debug(context: string, message: string): void {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.debug(`[${this.getTimestamp()}] [${LogLevel.DEBUG}] [${context}] ${message}`);
        }
    }

    /**
     * 记录信息日志
     */
    public info(context: string, message: string): void {
        if (this.shouldLog(LogLevel.INFO)) {
            console.info(`[${this.getTimestamp()}] [${LogLevel.INFO}] [${context}] ${message}`);
        }
    }

    /**
     * 记录警告日志
     */
    public warn(context: string, message: string): void {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(`[${this.getTimestamp()}] [${LogLevel.WARN}] [${context}] ${message}`);
        }
    }

    /**
     * 记录错误日志
     */
    public error(context: string, error: any): void {
        if (this.shouldLog(LogLevel.ERROR)) {
            const errorMessage = error?.message || String(error);
            const stack = error?.stack || "No stack trace";
            console.error(`[${this.getTimestamp()}] [${LogLevel.ERROR}] [${context}] ${errorMessage}\n${stack}`);
        }
    }

    /**
     * 判断是否应该记录指定级别的日志
     */
    private shouldLog(level: LogLevel): boolean {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const targetLevelIndex = levels.indexOf(level);
        return targetLevelIndex >= currentLevelIndex;
    }
}