import chalk from 'chalk';

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
