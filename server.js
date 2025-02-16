const express = require("express");
const { chromium } = require("playwright");
const TurndownService = require("turndown");

// Create an Express app
const app = express();

// For Cloud Run, listen on port 8080 by default
const PORT = process.env.PORT || 8080;

// Define the /api/scrape route
app.get("/api/scrape", async (req, res) => {
  const urlToScrape = req.query.url;

  // Check if the query parameter is provided
  if (!urlToScrape) {
    return res.status(400).json({
      error: "Missing 'url' query parameter",
    });
  }

  let browser;
  try {
    // Launch headless Chromium
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Navigate and wait for network to be idle
    await page.goto(urlToScrape, { waitUntil: "networkidle" });

    // Remove script, style, noscript tags from the DOM
    await page.evaluate(() => {
      document.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
    });

    // Grab the rendered HTML
    const htmlContent = await page.content();

    // Create Turndown service
    const turndownService = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });

    // Custom rule for images
    turndownService.addRule("images", {
      filter: "img",
      replacement: (_content, node) => {
        const src = node.getAttribute("src") || "";
        const alt = node.getAttribute("alt") || "";
        return `![${alt}](${src})`;
      },
    });

    // Convert HTML to Markdown
    const markdown = turndownService.turndown(htmlContent);

    // Return JSON
    return res.json({ markdown });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Failed to convert URL to Markdown",
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});