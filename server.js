const express = require("express");
const { chromium } = require("playwright");
const TurndownService = require("turndown");

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send(
    "Welcome! Please use /api/scrape?url=<your_url>&json=[1|0]&formatTables=[1|0] to convert a webpage."
  );
});

app.get("/api/scrape", async (req, res) => {
  const urlToScrape = req.query.url;

  if (!urlToScrape) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }

  const useJson = req.query.json === "1" || req.query.json === "true";

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const response = await page.goto(urlToScrape, { waitUntil: "networkidle" });

    if (!response.ok()) {
      return res
        .status(response.status())
        .json({ error: `Failed to load URL: ${response.status()}` });
    }

    const publishedTime = await page.evaluate(() => {
      const dateElement =
        document.querySelector('meta[property="article:published_time"]') ||
        document.querySelector('meta[name="dcterms.created"]');
      return dateElement ? dateElement.getAttribute("content") : null;
    });

    const title = await page.evaluate(() => document.title);

    if (req.query.waitForTimeoutSeconds) {
      const waitForTimeoutSeconds = Number(req.query.waitForTimeoutSeconds);
      if (
        !isNaN(waitForTimeoutSeconds) &&
        waitForTimeoutSeconds > 0 &&
        Number.isInteger(waitForTimeoutSeconds)
      ) {
        await page.waitForTimeout(waitForTimeoutSeconds * 1000);
      }
    }

    // Fetch only from the main content section
    const formatTables = req.query.formatTables !== "0";
    await page.evaluate(
      ([formatTables]) => {
        const mainContent =
          document.querySelector("main") ||
          document.querySelector("#main-content") ||
          document.body; // Adapt this selector
        if (mainContent) {
          document.body.innerHTML = ""; // Clear the entire body
          document.body.appendChild(mainContent); // Append the main content
          document
            .querySelectorAll("script, style, noscript, nav, header, footer")
            .forEach((el) => el.remove());
        } else {
          document
            .querySelectorAll("script, style, noscript, nav, header, footer")
            .forEach((el) => el.remove());
        }

        // Format <dl> elements
        const dlElements = document.querySelectorAll("dl");
        dlElements.forEach((dl) => {
          const dtElements = dl.querySelectorAll("dt");
          const ddElements = dl.querySelectorAll("dd");

          if (
            dtElements.length !== ddElements.length ||
            dtElements.length === 0
          ) {
            return;
          }

          if (formatTables) {
            let maxHeaderLength = 0;
            let maxValueLength = 0;

            // Calculate max lengths for proper alignment
            for (let i = 0; i < dtElements.length; i++) {
              maxHeaderLength = Math.max(
                maxHeaderLength,
                dtElements[i].textContent.trim().length
              );
              maxValueLength = Math.max(
                maxValueLength,
                ddElements[i].textContent.trim().length
              );
            }

            // Convert NodeList to Array before using map
            const tableRows = Array.from(dtElements).map((dt, i) => {
              const header = dt.textContent.trim().padEnd(maxHeaderLength, " ");
              const value = ddElements[i].textContent
                .trim()
                .padEnd(maxValueLength, " ");
              return `| ${header} | ${value} |`;
            });

            const headerSeparator = `| ${"-".repeat(
              maxHeaderLength
            )} | ${"-".repeat(maxValueLength)} |`;
            const tableHeader = `| Header${" ".repeat(
              maxHeaderLength - 6
            )} | Value${" ".repeat(maxValueLength - 5)} |`;
            const markdownTable = `${tableHeader}\n${headerSeparator}\n${tableRows.join(
              "\n"
            )}`;

            const newElement = document.createElement("pre");
            newElement.textContent = markdownTable;
            dl.replaceWith(newElement);
          } else {
            // Convert NodeList to Array here as well
            const newText = Array.from(dtElements)
              .map(
                (dt, i) =>
                  `${dt.textContent.trim()}: ${ddElements[
                    i
                  ].textContent.trim()}`
              )
              .join("; ");

            const newElement = document.createElement("p");
            newElement.textContent = newText;
            dl.replaceWith(newElement);
          }
        });
      },
      [formatTables]
    );

    const htmlContent = await page.content();

    const turndownService = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced"
    });

    turndownService.addRule("images", {
      filter: "img",
      replacement: (_content, node) => {
        const src = node.getAttribute("src") || "";
        const alt = node.getAttribute("alt") || "";
        if (alt) {
          // Only include images with alt text
          return `![${alt}](${src})`;
        } else {
          return ""; // or null, if you prefer not to include the image at all
        }
      }
    });

    let markdown = turndownService.turndown(htmlContent)?.trim();

    if (useJson) {
      return res.json({
        title: title.trim(),
        urlSource: urlToScrape,
        publishedTime: publishedTime,
        markdownContent: markdown
      });
    } else {
      res.setHeader("Content-Type", "text/plain");
      const textOutput = `# Title: ${title.trim()}\n\n# URL Source: ${urlToScrape}\n\n# Published Time: ${
        publishedTime || "N/A"
      }\n\n# Markdown Content:\n\n${markdown}`;
      return res.send(textOutput);
    }
  } catch (error) {
    console.error("Scraping error:", error);
    return res.status(500).json({ error: "Failed to convert URL" });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
