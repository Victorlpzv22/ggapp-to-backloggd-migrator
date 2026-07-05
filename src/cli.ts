import { Command } from 'commander';
import { extractCommand } from './commands/extract.js';

const program = new Command();

program
  .name('ggapp-to-backloggd')
  .description('Migrate game data from GGApp to Backloggd')
  .version('1.0.0');

program
  .command('extract')
  .description('Extract game data from GGApp to a JSON file')
  .option('--headless <bool>', 'Run browser without UI', 'true')
  .option('--throttle <speed>', 'slow|normal|fast', 'normal')
  .option('--session-dir <dir>', 'Session directory', 'sessions')
  .option('--data-file <path>', 'Output JSON file', 'data/ggapp-data.json')
  .option('--config <path>', 'Config file path')
  .action(async (opts) => {
    await extractCommand({
      throttle: opts.throttle,
      headless: opts.headless === 'true',
      sessionDir: opts.sessionDir,
      dataFile: opts.dataFile,
      config: opts.config,
    });
  });

program
  .command('import')
  .description('Import game data from JSON file to Backloggd')
  .option('--on-conflict <policy>', 'skip|merge|overwrite|ask', 'skip')
  .action(() => {
    console.log('import command - not implemented yet');
  });

program
  .command('migrate')
  .description('Extract and import in one go')
  .option('--direct', 'Skip writing intermediate JSON file')
  .option('--on-conflict <policy>', 'skip|merge|overwrite|ask', 'skip')
  .action(() => {
    console.log('migrate command - not implemented yet');
  });

program.parse(process.argv);
