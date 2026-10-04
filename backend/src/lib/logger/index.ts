/**
 * Unified logger for the backend
 * Usage:
 *   const log = createLogger('campaigns');
 *   log.info('Fetched campaigns from Twenty');
 *   log.error('Failed to fetch', err);
 *   log.debug('Response:', data);
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

const levelPrefixes: Record<LogLevel, string> = {
  debug: '[DEBUG]',
  info: '[INFO]',
  warn: '[WARN]',
  error: '[ERROR]',
};

function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

export function createLogger(module: string): Logger {
  const prefix = `[${module}]`;

  return {
    debug: (...args: any[]) => console.debug(`${getTimestamp()} ${prefix} ${levelPrefixes.debug}`, ...args),
    info: (...args: any[]) => console.info(`${getTimestamp()} ${prefix} ${levelPrefixes.info}`, ...args),
    warn: (...args: any[]) => console.warn(`${getTimestamp()} ${prefix} ${levelPrefixes.warn}`, ...args),
    error: (...args: any[]) => console.error(`${getTimestamp()} ${prefix} ${levelPrefixes.error}`, ...args),
  };
}
