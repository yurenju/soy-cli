import { Command } from "commander";

const program = new Command();

program
  .command("cathay-bank")
  .option("-c, --config <config-file>")
  .option("-i, --input-file <input-file>")
  .option("-o, --output-file <output-file>")
  .option("--output-csv <output-csv-file>")
  .action(options => {
    console.log(options);
  });

program.parse(process.argv);
