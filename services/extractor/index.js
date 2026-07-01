import { Command } from 'commander';
import { runExtractor, processPage } from './processor.js';
import * as pagesModel from '../../lib/db/models/pages.js';

const program = new Command();
program.name('extractor').description('Extract wine pricing data from catalog pages using Qwen3.6');

program
  .command('run', { isDefault: true })
  .description('Process all unprocessed pages')
  .option('--item-id <id>', 'Restrict to pages for this item DB id', parseInt)
  .option('--page-id <id>', 'Process a single page by DB id', parseInt)
  .option('--model <model>', 'Override the LLM model for this run')
  .option('--reprocess', 'Reset processed status before running', false)
  .option('--concurrency <n>', 'Parallel LLM calls', parseInt)
  .action(async (opts) => {
    try {
      if (opts.reprocess) {
        console.log('Resetting processed status...');
        await pagesModel.resetProcessed({ itemId: opts.itemId, pageId: opts.pageId });
      }

      if (opts.pageId) {
        const page = await pagesModel.getById(opts.pageId);
        if (!page) { console.error(`Page ${opts.pageId} not found`); process.exit(1); }
        console.log(`Processing page ${page.id} — ${page.filename}`);
        const result = await processPage(page, { model: opts.model });
        console.log(`Done. entries_found=${result.entriesFound}`);
        return;
      }

      console.log('Running extractor...');
      const result = await runExtractor({
        itemId: opts.itemId,
        model: opts.model,
        concurrency: opts.concurrency,
      });
      console.log(`Done. pages=${result.totalPages} wine_entries=${result.totalEntries}`);
    } catch (err) {
      console.error('Fatal:', err.message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
