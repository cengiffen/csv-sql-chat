import duckdb from "duckdb";
import { z } from "zod";
import Papa from "papaparse";

const llmOutputSchema = z.object({
  sql: z.string().min(1),
  explanation: z.string().min(1),
});

async function callOpenAIChat(question: string, columns: string[], previousError?: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
  const baseInstructions = [
    {
      role: "system",
      content:
        "You are a SQL assistant. Translate user questions into a safe, read-only DuckDB SQL query against a single table named data. Use only the supplied column names and return exactly one JSON object with two fields: sql and explanation.",
    },
    {
      role: "system",
      content:
        "If the query requires aggregation, group by every non-aggregated column. Do not return ANY_VALUE() unless the question explicitly allows unspecified values. Do not use any SQL statements other than SELECT.",
    },
    {
      role: "user",
      content: `The table columns are: ${columns.join(", ")}. Example output format:\n{\n  \"sql\": \"SELECT product, SUM(sales) AS total_sales FROM data WHERE product = 'widget a'\",\n  \"explanation\": \"This SQL aggregates sales for widget a and returns the total sales value.\"\n}`,
    },
    {
      role: "user",
      content: `Question: ${question}. Respond with JSON only and do not include any surrounding markdown or commentary.`,
    },
  ];

  if (previousError) {
    baseInstructions.push({
      role: "user",
      content: `The previous SQL execution failed with the DuckDB error: ${previousError}. Please correct the SQL and respond with JSON only.`,
    });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: baseInstructions,
      temperature: 0,
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("OpenAI returned no text.");
  }

  return text;
}

function extractJsonObject(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("OpenAI response did not contain valid JSON.");
  }

  try {
    return JSON.parse(match[0]);
  } catch (error) {
    throw new Error("Failed to parse JSON from OpenAI response.");
  }
}

function ensureSelectOnly(sql: string) {
  const normalized = sql.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized.includes(";") && normalized.replace(/;+/g, "").trim() !== normalized) {
    throw new Error("Only a single SQL statement is allowed.");
  }
  if (!/^(with\s+[\s\S]+select\b|select\b)/.test(normalized)) {
    throw new Error("Only read-only SELECT queries are allowed.");
  }
  if (/(\b(create|drop|insert|update|delete|alter|replace|truncate|attach|detach|pragma|merge|call)\b)/.test(normalized)) {
    throw new Error("Only read-only SELECT queries are allowed.");
  }
  return sql;
}

function isNumericString(value: unknown) {
  return typeof value === "string" && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim());
}

function isIntegerString(value: unknown) {
  return typeof value === "string" && /^[-+]?\d+$/.test(value.trim());
}

function inferDuckDBType(values: unknown[]) {
  const nonNull = values.filter((value) => value !== null && value !== undefined && value !== "");
  if (nonNull.length === 0) return "TEXT";
  if (
    nonNull.every(
      (value) =>
        typeof value === "boolean" ||
        (typeof value === "string" && /^(true|false)$/i.test(value.trim()))
    )
  ) {
    return "BOOLEAN";
  }
  if (
    nonNull.every(
      (value) =>
        typeof value === "number" && Number.isInteger(value) ||
        isIntegerString(value)
    )
  ) {
    return "INTEGER";
  }
  if (
    nonNull.every(
      (value) =>
        typeof value === "number" ||
        isNumericString(value)
    )
  ) {
    return "DOUBLE";
  }
  return "TEXT";
}

function normalizeValueForType(value: unknown, type: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (type === "BOOLEAN") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
    }
    return null;
  }

  if (type === "INTEGER") {
    if (typeof value === "number") return Number.isInteger(value) ? value : Math.trunc(value);
    if (typeof value === "string" && isIntegerString(value)) return Number(value.trim());
    return null;
  }

  if (type === "DOUBLE") {
    if (typeof value === "number") return value;
    if (typeof value === "string" && isNumericString(value)) return Number(value.trim());
    return null;
  }

  return value;
}

function normalizeCsvText(csvText: string) {
  const lines = csvText.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return csvText;

  const allLinesQuoted = lines.every((line) => {
    const trimmed = line.trim();
    return trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"");
  });

  if (!allLinesQuoted) {
    return csvText;
  }

  return lines
    .map((line) => {
      const trimmed = line.trim();
      return trimmed.slice(1, -1);
    })
    .join("\n");
}

function parseCsvContent(csvText: string) {
  const normalizedText = normalizeCsvText(csvText);
  const parsed = Papa.parse<Record<string, unknown>>(normalizedText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    delimiter: ",",
  });

  const fatalErrors = parsed.errors.filter(
    (error) =>
      error.message &&
      !error.message.includes("Unable to auto-detect delimiting character") &&
      !error.message.includes("defaulted to ', '")
  );

  if (fatalErrors.length > 0) {
    throw new Error(fatalErrors[0].message || "Failed to parse CSV file.");
  }

  const rows = parsed.data as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    throw new Error("CSV file parsed no rows. Please check the header row and delimiter.");
  }

  const columns = Object.keys(rows[0]);
  const columnTypes = columns.map((column) => {
    const values = rows.map((row) => row[column]);
    return {
      name: column,
      type: inferDuckDBType(values),
    };
  });

  const normalizedRows = rows.map((row) => {
    const normalizedRow: Record<string, unknown> = {};
    for (const column of columnTypes) {
      normalizedRow[column.name] = normalizeValueForType(row[column.name], column.type);
    }
    return normalizedRow;
  });

  return { rows: normalizedRows, columnTypes };
}

function runQuery<T>(conn: duckdb.Connection, sql: string, params: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    const callback = (error: duckdb.DuckDbError | null, result: duckdb.TableData) => {
      if (error) return reject(error);
      resolve(result as T[]);
    };
    conn.all(sql, ...params, callback);
  });
}

function runStatement(conn: duckdb.Connection, sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => {
    const callback = (error: duckdb.DuckDbError | null) => {
      if (error) return reject(error);
      resolve();
    };
    conn.run(sql, ...params, callback);
  });
}

function prepareStatement(conn: duckdb.Connection, sql: string) {
  return new Promise<duckdb.Statement>((resolve, reject) => {
    conn.prepare(sql, (error: duckdb.DuckDbError | null, stmt: duckdb.Statement) => {
      if (error) return reject(error);
      resolve(stmt);
    });
  });
}

function runPrepared(stmt: duckdb.Statement, params: unknown[]) {
  return new Promise<void>((resolve, reject) => {
    stmt.run(...params, (error: duckdb.DuckDbError | null) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function finalizeStatement(stmt: duckdb.Statement) {
  return new Promise<void>((resolve, reject) => {
    stmt.finalize((error: duckdb.DuckDbError | null) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function normalizeJsonValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeJsonValue(item)])
    );
  }

  return value;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const csvFile = formData.get("csvFile");
    const question = String(formData.get("question") ?? "").trim();

    if (!csvFile || !(csvFile instanceof File)) {
      return new Response(JSON.stringify({ error: "Please upload a CSV file." }), { status: 400 });
    }
    if (!question) {
      return new Response(JSON.stringify({ error: "Please enter a question." }), { status: 400 });
    }

    const csvText = await csvFile.text();
    const { rows, columnTypes } = parseCsvContent(csvText);

    const db = new duckdb.Database(":memory:");
    const conn = db.connect();

    const createSql = `CREATE TABLE data (${columnTypes
      .map((column) => `"${column.name.replace(/"/g, '""')}" ${column.type}`)
      .join(", ")})`;
    await runStatement(conn, createSql);

    if (rows.length > 0) {
      const placeholders = columnTypes.map(() => "?").join(", ");
      const insertSql = `INSERT INTO data VALUES (${placeholders})`;
      const stmt = await prepareStatement(conn, insertSql);
      try {
        for (const row of rows) {
          const values = columnTypes.map((column) => row[column.name] ?? null);
          await runPrepared(stmt, values);
        }
      } finally {
        await finalizeStatement(stmt);
      }
    }

    const columns = columnTypes.map((column) => column.name);
    let responseText = await callOpenAIChat(question, columns);
    let parsedResponse = extractJsonObject(responseText);
    let validated = llmOutputSchema.parse(parsedResponse);
    let safeSql = ensureSelectOnly(validated.sql);
    let resultRows: Array<Record<string, unknown>>;
    let finalExplanation = validated.explanation;

    try {
      resultRows = await runQuery<Record<string, unknown>>(conn, safeSql);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      responseText = await callOpenAIChat(question, columns, errorMessage);
      parsedResponse = extractJsonObject(responseText);
      validated = llmOutputSchema.parse(parsedResponse);
      safeSql = ensureSelectOnly(validated.sql);
      finalExplanation = validated.explanation;
      resultRows = await runQuery<Record<string, unknown>>(conn, safeSql);
    }

    const normalizedRows = resultRows.map((row) => normalizeJsonValue(row) as Record<string, unknown>);

    return new Response(
      JSON.stringify({ sql: safeSql, explanation: finalExplanation, rows: normalizedRows }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
