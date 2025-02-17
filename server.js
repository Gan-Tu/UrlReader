const express = require("express");
const { chromium } = require("playwright");
const TurndownService = require("turndown");

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send(
    "Welcome! Please use /api/scrape?url=<your_url>&json=[1|0]&formatTables=[1|0]&stripTables=[1|0]&stripImages=[1|0]&stripLinks=[1|0] to convert a webpage."
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
    let timeoutMiliSeconds = 3000;
    if (req.query.waitForTimeoutSeconds) {
      const waitForTimeoutSeconds = Number(req.query.waitForTimeoutSeconds);
      if (
        !isNaN(waitForTimeoutSeconds) &&
        waitForTimeoutSeconds > 0 &&
        Number.isInteger(waitForTimeoutSeconds)
      ) {
        timeoutMiliSeconds = waitForTimeoutSeconds * 1000;
      }
    }
    const response = await page.goto(urlToScrape, {
      timeout: timeoutMiliSeconds,
      waitUntil: "domcontentloaded"
    });

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
    const stripTables =
      req.query.stripTables === "1" || req.query.stripTables === "true";
    const stripImages =
      req.query.stripImages === "1" || req.query.stripImages === "true";
    const stripLinks =
      req.query.stripLinks === "1" || req.query.stripLinks === "true";

    await page.evaluate(
      ([formatTables, stripTables, stripImages, stripLinks]) => {
        const mainContent =
          document.querySelector("main") ||
          document.querySelector("#main-content") ||
          document.querySelector("#main-container") ||
          document.querySelector("article") ||
          document.querySelector("#article") ||
          document.querySelector(".article") ||
          document.querySelector(".content") ||
          document.querySelector("#content") ||
          document.body; // Adapt this selector

        // Create a clone of the main content to avoid hierarchy issues
        const mainContentClone = mainContent.cloneNode(true);

        // Clear the body and append the clone
        document.body.innerHTML = "";
        document.body.appendChild(mainContentClone);

        // Remove unwanted elements
        document
          .querySelectorAll(
            "script, style, noscript, nav, header, footer, form"
          )
          .forEach((el) => el.remove());

        // Remove unwanted elements
        const elementsToRemove = [
          "breadcrumbs",
          "cookies",
          "popup",
          "sidebar",
          "modal",
          "menu-container",
          "dropdown-menu",
          "header-dropdown"
        ];
        Array.from(document.getElementsByTagName("*")).forEach((element) => {
          const id = element.id?.toLowerCase() || "";
          const classes = (
            typeof element.className === "string" ? element.className : ""
          ).toLowerCase();
          const tagName = element.tagName.toLowerCase();
          if (
            elementsToRemove.some(
              (term) =>
                id.includes(term) ||
                classes.includes(term) ||
                tagName.includes(term)
            )
          ) {
            element.remove();
          }
        });

        if (stripImages) {
          document.querySelectorAll("img").forEach((img) => img.remove());
          document
            .querySelectorAll("figure")
            .forEach((figure) => figure.remove());
        }

        if (stripLinks) {
          document.querySelectorAll("a").forEach((a) => a.remove());
        }

        // Format <dl> elements
        const dlElements = document.querySelectorAll("dl");
        dlElements.forEach((dl) => {
          if (stripTables) {
            dl.remove();
            return;
          }

          const dtElements = dl.querySelectorAll("dt");
          const ddElements = dl.querySelectorAll("dd");

          // Convert any anchor links to text in dt and dd elements
          dtElements.forEach((dt) => {
            const anchors = dt.querySelectorAll("a");
            anchors.forEach((a) => {
              a.replaceWith(a.textContent);
            });
          });
          ddElements.forEach((dd) => {
            const anchors = dd.querySelectorAll("a");
            anchors.forEach((a) => {
              a.replaceWith(a.textContent);
            });
          });

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

        // Format HTML tables
        const tableElements = document.querySelectorAll("table");
        tableElements.forEach((table) => {
          if (stripTables) {
            table.remove();
            return;
          }

          const rows = table.querySelectorAll("tr");
          if (rows.length === 0) return;

          // Convert any anchor links to text in table cells
          table.querySelectorAll("td, th").forEach((cell) => {
            const anchors = cell.querySelectorAll("a");
            anchors.forEach((a) => {
              a.replaceWith(a.textContent);
            });
          });

          // Find header cells - first look for th elements, if none found use first row
          const thCells = table.querySelectorAll("th");
          const headerCells =
            thCells.length > 0 ? thCells : rows[0].querySelectorAll("td");

          // Determine which rows are data rows based on whether we used th elements
          const dataRows =
            thCells.length > 0 ? Array.from(rows) : Array.from(rows).slice(1);

          if (formatTables) {
            // Calculate max lengths for each column
            const columnLengths = Array(headerCells.length).fill(0);

            // Get header lengths
            headerCells.forEach((cell, i) => {
              columnLengths[i] = Math.max(
                columnLengths[i],
                cell.textContent.trim().length
              );
            });

            // Get data lengths
            dataRows.forEach((row) => {
              const cells = row.querySelectorAll("td, th");
              cells.forEach((cell, i) => {
                columnLengths[i] = Math.max(
                  columnLengths[i],
                  cell.textContent.trim().length
                );
              });
            });

            // Create markdown table
            const formattedHeaderCells = Array.from(headerCells).map(
              (cell, i) => cell.textContent.trim().padEnd(columnLengths[i], " ")
            );
            const markdownHeader = `| ${formattedHeaderCells.join(" | ")} |`;
            const separator = `| ${columnLengths
              .map((len) => "-".repeat(len))
              .join(" | ")} |`;

            const markdownRows = dataRows.map((row) => {
              const cells = Array.from(row.querySelectorAll("td, th"));
              const paddedCells = cells.map((cell, i) =>
                cell.textContent.trim().padEnd(columnLengths[i], " ")
              );
              return `| ${paddedCells.join(" | ")} |`;
            });

            const markdownTable = `${markdownHeader}\n${separator}\n${markdownRows.join(
              "\n"
            )}`;

            const newElement = document.createElement("pre");
            newElement.textContent = markdownTable;
            table.replaceWith(newElement);
          } else {
            // Convert to paragraph format
            const headers = Array.from(headerCells).map((cell) =>
              cell.textContent.trim()
            );
            const paragraphs = dataRows.map((row) => {
              const cells = Array.from(row.querySelectorAll("td, th"));
              return headers
                .map(
                  (header, i) =>
                    `${header}: ${cells[i]?.textContent.trim() || "N/A"}`
                )
                .join("; ");
            });

            const newElement = document.createElement("div");
            paragraphs.forEach((text) => {
              const p = document.createElement("p");
              p.textContent = text;
              newElement.appendChild(p);
            });
            table.replaceWith(newElement);
          }
        });
      },
      [formatTables, stripTables, stripImages, stripLinks]
    );

    const htmlContent = await page.content();

    const turndownService = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced"
    });

    turndownService.addRule("images", {
      filter: ["img", "a"],
      replacement: (_content, node) => {
        if (node.nodeName === "A") {
          const href = node.getAttribute("href") || "";
          const text = node.textContent.trim().replace(/\s+/g, " ");
          return text ? `[${text}](${href})` : "";
        } else {
          // img node
          const src = node.getAttribute("src") || "";
          const alt = node.getAttribute("alt") || "";
          if (stripImages) {
            return "";
          } else if (alt) {
            const cleanAlt = alt.trim().replace(/\s+/g, " ");
            return `![${cleanAlt}](${src})`;
          } else {
            return "";
          }
        }
      }
    });

    let markdown = turndownService
      .turndown(htmlContent)
      ?.trim()
      .replace(/\\\[|\\\]/g, "")
      .replace(/\n{3,}/g, "\n\n");

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
    return res.status(500).json({ error: `Internal error: ${error}` });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
