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

// Pull snippet from latest feed entry
function sanitizeSnippet(html) {
    if (!html) return '';
    
    // Remove all HTML tags
    let text = html.replace(/<[^>]*>/g, '');
    
    // Decode common HTML entities
    text = text.replace(/&amp;/g, '&')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'")
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>');

    // Trim whitespace
    return text.trim();
}

async function processFeeds() {
    console.log('Starting feed processing...');
    
    // 1. Read the list of feeds
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
                // Determine the raw content to use for the snippet
                const rawSnippet = latestItem.content || latestItem.summary || latestItem.description || '';
                
                // Clean up the HTML from the raw content
                const cleanSnippet = sanitizeSnippet(rawSnippet);
                
                // Trim the snippet to 250 characters
                const finalSnippet = cleanSnippet.substring(0, 250) + (cleanSnippet.length > 250 ? '...' : '');

                processedData.push({
                    sourceName: feedConfig.name,
                    sourceUrl: feedConfig.url,
                    title: latestItem.title || 'No Title Available',
                    link: latestItem.link,
                    date: latestItem.pubDate ? new Date(latestItem.pubDate).toISOString() : new Date().toISOString(),
                    snippet: finalSnippet,
                });
            }
        } catch (error) {
            console.error(`Skipping failed feed: ${feedConfig.name}. Error: ${error.message}`);
        }
    }

    // Sort feed posts by date
    processedData.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Write the feed post JSON data to a file for the site to render
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(processedData, null, 2));

    console.log(`Successfully processed ${processedData.length} entries and saved to ${OUTPUT_FILE}`);
    process.exit(0); 
}

processFeeds().catch(e => {
    console.error('FATAL ERROR in feed processor:', e);
    // For when it dies a horrible death 
    process.exit(1); 
});
