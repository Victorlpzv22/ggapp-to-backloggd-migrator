import { Command } from 'commander';
import { extractCommand } from './commands/extract.js';
import { importCommand } from './commands/import.js';
import { migrateCommand } from './commands/migrate.js';

const program = new Command();

program
  .name('ggapp-to-backloggd')
  .description('Migrate game data from GGApp to Backloggd')
  .version('1.0.0');

program
  .command('extract')
  .description('Extract game data from GGApp to a JSON file')
  .argument('<username>', 'GGApp username')
  .option('--data-file <path>', 'Output JSON file', 'data/ggapp-data.json')
  .action(async (username, opts) => {
    await extractCommand({
      username,
      dataFile: opts.dataFile,
    });
  });

program
  .command('import')
  .description('Import game data from JSON file to Backloggd')
  .option('--headless <bool>', 'Run browser without UI', 'true')
  .option('--throttle <speed>', 'slow|normal|fast', 'normal')
  .option('--session-dir <dir>', 'Session directory', 'sessions')
  .option('--data-file <path>', 'Input JSON file', 'data/ggapp-data.json')
  .option('--config <path>', 'Config file path')
  .option('--on-conflict <policy>', 'skip|merge|overwrite|ask', 'skip')
  .action(async (opts) => {
    await importCommand({
      throttle: opts.throttle,
      headless: opts.headless === 'true',
      sessionDir: opts.sessionDir,
      dataFile: opts.dataFile,
      config: opts.config,
      onConflict: opts.onConflict,
    });
  });

program
  .command('migrate')
  .description('Extract and import in one go')
  .argument('<username>', 'GGApp username')
  .option('--headless <bool>', 'Run browser without UI', 'true')
  .option('--throttle <speed>', 'slow|normal|fast', 'normal')
  .option('--session-dir <dir>', 'Session directory', 'sessions')
  .option('--data-file <path>', 'Output/Input JSON file', 'data/ggapp-data.json')
  .option('--config <path>', 'Config file path')
  .option('--on-conflict <policy>', 'skip|merge|overwrite|ask', 'skip')
  .option('--direct', 'Skip writing intermediate JSON file')
  .action(async (username, opts) => {
    await migrateCommand({
      username,
      throttle: opts.throttle,
      headless: opts.headless === 'true',
      sessionDir: opts.sessionDir,
      dataFile: opts.dataFile,
      config: opts.config,
      onConflict: opts.onConflict,
      direct: opts.direct,
    });
  });

program.parse(process.argv);
