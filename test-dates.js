const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function testDateExtraction() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.goto('https://www.seattletimes.com/sports/mariners/', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  
  const html = await page.content();
  const $ = cheerio.load(html);
  
  console.log('Testing date extraction from Seattle Times...\n');
  
  console.log(`Found ${$('.results-story').length} .results-story elements`);
  
  // Try different selectors if results-story doesn't work
  if ($('.results-story').length === 0) {
    console.log('No .results-story elements found, trying alternative selectors...\n');
    
    // Try alternative selectors
    $('article, [class*="story"], [class*="article"]').slice(0, 5).each((index, element) => {
      const $elem = $(element);
      const classes = $elem.attr('class') || '';
      const $timeElem = $elem.find('time').first();
      const datetime = $timeElem.attr('datetime');
      const dateText = $elem.find('[class*="date"], time').first().text().trim();
      
      console.log(`Element ${index + 1} (class: ${classes.substring(0, 50)}...)`);
      console.log(`  Has time element: ${$timeElem.length > 0}`);
      console.log(`  DateTime attribute: ${datetime || 'NOT FOUND'}`);
      console.log(`  Date text: ${dateText || 'NOT FOUND'}`);
      console.log('');
    });
  }
  
  let count = 0;
  $('.results-story').each((index, element) => {
    if (count >= 5) return false;
    count++;
    
    const $story = $(element);
    const title = $story.find('.results-story-title a').text().trim();
    
    // Check for time element with datetime
    const $timeElem = $story.find('.results-story-date time');
    const datetime = $timeElem.attr('datetime');
    const dateText = $story.find('.results-story-date').text().trim();
    
    console.log(`Article ${count}: ${title.substring(0, 50)}...`);
    console.log(`  DateTime attribute: ${datetime || 'NOT FOUND'}`);
    console.log(`  Date text: ${dateText || 'NOT FOUND'}`);
    console.log(`  Time element exists: ${$timeElem.length > 0}`);
    console.log('');
  });
  
  await browser.close();
}

testDateExtraction().catch(console.error);