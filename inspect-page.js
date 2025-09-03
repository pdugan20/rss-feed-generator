const puppeteer = require('puppeteer');
const fs = require('fs');

async function inspectPage() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.goto('https://www.seattletimes.com/sports/mariners/', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  
  // Wait a bit for dynamic content
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const html = await page.content();
  
  // Save full HTML for inspection
  fs.writeFileSync('page-content.html', html);
  console.log('Page HTML saved to page-content.html');
  
  // Look for articles and date elements
  const analysis = await page.evaluate(() => {
    const results = {
      totalArticles: document.querySelectorAll('article').length,
      timeElements: document.querySelectorAll('time').length,
      dateClasses: [],
      sampleTimeElements: []
    };
    
    // Find all elements with 'date' in class name
    document.querySelectorAll('[class*="date"]').forEach(el => {
      if (!results.dateClasses.includes(el.className)) {
        results.dateClasses.push(el.className);
      }
    });
    
    // Get first 3 time elements with their context
    document.querySelectorAll('time').forEach((el, i) => {
      if (i < 3) {
        results.sampleTimeElements.push({
          datetime: el.getAttribute('datetime'),
          text: el.textContent.trim(),
          parentClass: el.parentElement?.className || '',
          closestArticle: el.closest('article')?.className || 'No article parent'
        });
      }
    });
    
    return results;
  });
  
  console.log('\nPage Analysis:');
  console.log('Total articles found:', analysis.totalArticles);
  console.log('Total time elements found:', analysis.timeElements);
  console.log('\nClasses containing "date":', analysis.dateClasses);
  console.log('\nSample time elements:', JSON.stringify(analysis.sampleTimeElements, null, 2));
  
  await browser.close();
}

inspectPage().catch(console.error);