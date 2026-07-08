import chalk from 'chalk';

// Lower numeric value = more verbose. INFO(0) prints info/success/warn/error;
// WARN(1) suppresses info/success; ERROR(2) prints only errors. The enum
// ordering is intentionally inverted from the literal "severity" so that
// `currentLevel <= LogLevel.LEVEL` reads as a "is this enabled?" check.
export enum LogLevel {
  INFO = 0,
  WARN = 1,
  ERROR = 2,
}

let currentLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

export function info(msg: string) {
  if (currentLevel <= LogLevel.INFO) {
    console.log(chalk.blue('ℹ'), msg);
  }
}

export function success(msg: string) {
  if (currentLevel <= LogLevel.INFO) {
    console.log(chalk.green('✔'), msg);
  }
}

export function warn(msg: string) {
  if (currentLevel <= LogLevel.WARN) {
    console.log(chalk.yellow('⚠'), msg);
  }
}

export function error(msg: string) {
  if (currentLevel <= LogLevel.ERROR) {
    console.log(chalk.red('✖'), msg);
  }
}
