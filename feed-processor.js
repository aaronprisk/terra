const fs = require('fs/promises');
const Parser = require('rss-parser');

const FEEDS_FILE = './feeds.json';
const OUTPUT_FILE = './feed-data.json'; 

const parser = new Parser({
    // Only fetch the newest blog post from each feed to save on bandwidth
    maxRedirects: 10,
    headers: {
        'User-Agent': 'Static-RSS-Aggregator-GitHub-Action/1.0',
    }
});

async function processFeeds() {
    console.log('Starting feed processing...');
    
    // Pull member feeds from the json
    const feedsJson = await fs.readFile(FEEDS_FILE, 'utf-8');
    const feedsList = JSON.parse(feedsJson);

    const processedData = [];

    for (const feedConfig of feedsList) {
        try {
            // Fetch the feeds and parse
            const feed = await parser.parseURL(feedConfig.url);

            // Grab the latest entry from each member feed
            const latestItem = feed.items[0];

            if (latestItem) {
                processedData.push({
                    sourceName: feedConfig.name,
                    sourceUrl: feedConfig.url,
                    title: latestItem.title || 'No Title Available',
                    link: latestItem.link,
                    date: latestItem.pubDate ? new Date(latestItem.pubDate).toISOString() : new Date().toISOString(),
                });
            }
        } catch (error) {
            // Ignore dead blogs
            console.error(`Skipping failed feed: ${feedConfig.name}`, error.message);
        }
    }

    // Sort posts by date
    processedData.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Write the blog post JSON data to a file for the site to render
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(processedData, null, 2));

    console.log(`Successfully processed ${processedData.length} entries and saved to ${OUTPUT_FILE}`);
    process.exit(0);
}

processFeeds().catch(e => {
    // For when it dies a horrible death 
    console.error('FATAL ERROR in feed processor:', e);
    process.exit(1);
});
