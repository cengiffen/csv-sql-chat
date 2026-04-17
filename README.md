# CSV SQL Chat

A simple Next.js App Router application that lets users upload a CSV file, ask plain-English questions about the data, and receive:

- a generated SQL query
- a natural language explanation
- query results from DuckDB

The app uses OpenAI to translate questions into safe, read-only SQL and DuckDB to execute the query in memory.

## Features

- Upload a CSV file from your computer
- Ask questions like “total sales for X” or “which product sold the most?”
- Generate a safe `SELECT` query only
- Execute the SQL on the uploaded CSV with DuckDB
- Return results and explanation in the browser

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the project root with your OpenAI API key:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

3. Start the development server:

```bash
npm run dev
```

4. Open the app in your browser:

```text
http://localhost:3000
```

## Usage

- Select a CSV file using the file input
- Enter a question about the CSV data
- Click **Run query**
- Review the generated SQL, explanation, and query results

## Notes

- The app uses only read-only SQL queries (`SELECT`) to keep the execution safe.
- The CSV data is loaded into an in-memory DuckDB table on each request.
- OpenAI is used only for SQL generation, not for data storage.

## Environment variables

- `OPENAI_API_KEY` — required for OpenAI requests
- `OPENAI_MODEL` — optional, defaults to `gpt-3.5-turbo`

## Build

To create a production build:

```bash
npm run build
```

To start the production server after building:

```bash
npm start
```
