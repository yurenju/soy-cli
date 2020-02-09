import { Command } from "commander";
import { Config } from "./Config";
import { CathayBankParser } from "./parsers/CathayBankParser";

const program = new Command();

// Cathay Bank
let cathayBankOption = program.command(CathayBankParser.command);
CathayBankParser.options.forEach(opt => {
  cathayBankOption = cathayBankOption.option(opt);
});
cathayBankOption.action(options => {
  const parser = new CathayBankParser(options);
  parser.parse();
});

program.parse(process.argv);
