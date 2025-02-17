# HTML to Markdown API

This API takes a URL as a query parameter and returns a Markdown version of the parsed HTML content of the website.

## Introduction

This project provides a simple API to convert web pages to Markdown. It's useful for tasks like archiving web content, creating documentation, or building tools that need a plain text representation of a website. This is also very useful for scraping main websites content as inputs for LLM summarization tasks.

It leverages Playwright for browser automation and Turndown for HTML to Markdown conversion.

## API Endpoint

- GET method at `/api/scrape`
- GET method at `/:url` will be redirected to `/api/scrape`

## Request Parameters

| Parameter               | Type           | Default | Description                                                                                                                                                         | Required |
| ----------------------- | -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `url`                   | string         | -       | The URL of the website to convert                                                                                                                                   | Yes      |
| `json`                  | boolean [1\|0] | false   | If true, the response will be in JSON format                                                                                                                        | No       |
| `formatTables`          | boolean [1\|0] | true    | If true, parse tables in markdown syntax. Otherwise, return as strings                                                                                              | No       |
| `stripTables`           | boolean [1\|0] | false   | If true, tables will be removed from the response                                                                                                                   | No       |
| `stripImages`           | boolean [1\|0] | false   | If true, images will be removed from the response                                                                                                                   | No       |
| `stripLinks`            | boolean [1\|0] | false   | If true, links will be removed from the response                                                                                                                    | No       |
| `waitForTimeoutSeconds` | int            | 3       | If specified, the API will wait for the specified number of seconds before parsing the website content. This is useful for waiting for lazy loaded content to load. | No       |

## Response

By default, the API will return a plain text response containing the Markdown version of the website's content. The `Content-Type` header will be set to `text/plain`.

If `json` is set to `1`, the API will return a JSON response containing the following fields:

- `title`: The title of the website.
- `urlSource`: The URL of the website.
- `publishedTime`: The date and time the website was published.
- `markdownContent`: The Markdown version of the website's content.

## Error Handling

The API will return appropriate HTTP status codes for errors. Possible errors include:

- `500 Internal Server Error`: If there is an error during the conversion process (e.g., website not found, Playwright error, Turndown error). More detailed error messages may be logged on the server.

## Dependencies

- [Playwright](https://playwright.dev/): For browser automation.
- [Turndown](https://github.com/mixmark-io/turndown): For HTML to Markdown conversion.
- [Express](https://expressjs.com/): For creating the API server.
- ... other dependencies listed in `package.json`

## Contributing

Contributions are welcome\! Please open an issue or submit a pull request.
