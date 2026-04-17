"use client";

import { useState } from "react";

type QueryResult = {
  sql: string;
  explanation: string;
  rows: Array<Record<string, unknown>>;
};

export default function Home() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    if (!csvFile) {
      setError("Please upload a CSV file.");
      return;
    }
    if (!question.trim()) {
      setError("Please enter a question.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("csvFile", csvFile);
      formData.append("question", question);

      const response = await fetch("/api/query", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Server error while processing the query.");
        return;
      }

      setResult(data as QueryResult);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10 sm:px-10">
        <header className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
                CSV SQL Chat
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Ask a question about your CSV data
              </h1>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Upload a CSV, ask a question in plain English, and receive a safe SQL query,
              results, and an explanation.
            </p>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
            <label className="space-y-2">
              <span className="block text-sm font-medium text-slate-700">CSV File</span>
              <input
                type="file"
                accept=".csv"
                onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900"
              />
            </label>

            <label className="space-y-2">
              <span className="block text-sm font-medium text-slate-700">Question</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                placeholder="Example: Show total sales by region"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <div className="text-sm text-slate-500">
              {csvFile ? `Selected file: ${csvFile.name}` : "No file selected."}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "Running query…" : "Run query"}
            </button>
          </div>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        </form>

        {result ? (
          <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Generated SQL</h2>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-100">
                {result.sql}
              </pre>

              <h2 className="mt-6 text-lg font-semibold text-slate-900">Explanation</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">{result.explanation}</p>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Result preview</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                  {result.rows.length} rows
                </span>
              </div>
              {result.rows.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">No rows returned.</p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-slate-100 text-left text-slate-700">
                      <tr>
                        {Object.keys(result.rows[0]).map((column) => (
                          <th key={column} className="px-3 py-3 font-medium">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 10).map((row, rowIndex) => (
                        <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          {Object.values(row).map((value, cellIndex) => (
                            <td key={cellIndex} className="px-3 py-3 align-top text-slate-700">
                              {value === null || value === undefined ? "—" : String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.rows.length > 10 ? (
                <p className="mt-4 text-xs text-slate-500">Showing first 10 rows.</p>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
