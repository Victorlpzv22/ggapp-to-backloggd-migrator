import { Command } from 'commander';

const program = new Command();

program
  .name('ggapp-to-backloggd')
  .description('Migrate game data from GGApp to Backloggd')
  .version('1.0.0');

program
  .command('extract')
  .description('Extract game data from GGApp to a JSON file')
  .action(() => {
    console.log('extract command - not implemented yet');
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
