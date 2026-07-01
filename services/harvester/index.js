import { Command } from 'commander';
import { fetchArks } from './sitemap.js';
import { harvestItem } from './crawler.js';
import { downloadAll, downloadItemImages } from './downloader.js';
import config from '../../config/index.js';

const program = new Command();
program.name('harvester').description('Crawl the wine catalog collection and store metadata in Postgres');

program
  .command('crawl')
  .description('Fetch sitemap, harvest item metadata and page lists into DB')
  .option('--limit <n>', 'Max items to process', parseInt)
  .option('--ark <ark>', 'Harvest a single item (short id or full ARK)')
  .option('--force', 'Re-harvest items already in DB', false)
  .action(async (opts) => {
    try {
      if (opts.ark) {
        const ark = opts.ark.startsWith('ark:') ? opts.ark : `ark:/87287/${opts.ark}`;
        console.log(`Harvesting ${ark}`);
        const r = await harvestItem(ark, { force: opts.force });
        console.log(`pages_inserted=${r.pagesInserted} skipped=${r.skipped}`);
        return;
      }

      console.log('Fetching sitemap...');
      let arks = await fetchArks();
      console.log(`${arks.length} items in collection`);
      if (opts.limit) arks = arks.slice(0, opts.limit);

      const { crawl: concurrency } = config.concurrency;
      let done = 0;
      for (let i = 0; i < arks.length; i += concurrency) {
        await Promise.all(
          arks.slice(i, i + concurrency).map(async (ark) => {
            try {
              const r = await harvestItem(ark, { force: opts.force });
              done++;
              if (!r.skipped) console.log(`[${done}/${arks.length}] ${ark}  pages=${r.pagesInserted}`);
            } catch (err) {
              done++;
              console.error(`[${done}/${arks.length}] FAILED ${ark}: ${err.message}`);
            }
          })
        );
      }
      console.log('Crawl complete.');
    } catch (err) {
      console.error('Fatal:', err.message);
      process.exit(1);
    }
  });

program
  .command('download')
  .description('Download page images to local storage')
  .option('--ark <ark>', 'Download for a single item')
  .option('--concurrency <n>', 'Parallel downloads', parseInt)
  .action(async (opts) => {
    try {
      if (opts.ark) {
        const ark = opts.ark.startsWith('ark:') ? opts.ark : `ark:/87287/${opts.ark}`;
        console.log(`Downloading images for ${ark}`);
        const r = await downloadItemImages(ark, { concurrency: opts.concurrency });
        console.log(`downloaded=${r.downloaded} skipped=${r.skipped} failed=${r.failed}`);
      } else {
        await downloadAll({ concurrency: opts.concurrency });
        console.log('Download complete.');
      }
    } catch (err) {
      console.error('Fatal:', err.message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
