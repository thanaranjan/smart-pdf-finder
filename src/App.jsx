import { useEffect, useState } from "react";
import { openDB } from "idb";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

const DB_NAME = "SmartPDFDatabase";
const STORE_NAME = "pdfs";

async function getDatabase() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });
      }
    },
  });
}

async function savePDF(pdf) {
  const db = await getDatabase();

  await db.put(STORE_NAME, pdf);
}

async function getAllPDFs() {
  const db = await getDatabase();

  return db.getAll(STORE_NAME);
}

async function removePDF(id) {
  const db = await getDatabase();

  await db.delete(STORE_NAME, id);
}

function App() {
  async function scanQuestion(event) {
  const file = event.target.files[0];

  if (!file) return;

  setLoading(true);

  try {
    const worker = await createWorker("eng");

    const result = await worker.recognize(file);

    const scannedText = result.data.text.trim();

    await worker.terminate();

    if (!scannedText) {
      alert("Could not read the question. Please take a clearer photo.");
      return;
    }

    setQuestion(scannedText);

    alert("Question scanned successfully!");

  } catch (error) {
    console.error("OCR error:", error);
    alert("OCR failed. Please try again.");
  } finally {
    setLoading(false);
    event.target.value = "";
  }
}
  const [pdfs, setPdfs] = useState([]);
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load saved PDFs when website starts
  useEffect(() => {
    async function loadPDFs() {
      try {
        const saved = await getAllPDFs();
        setPdfs(saved);
      } catch (error) {
        console.error(error);
      }
    }

    loadPDFs();
  }, []);

  // Extract PDF text page by page
  async function extractPDFText(file) {
    const arrayBuffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
    }).promise;

    const pages = [];

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      const page = await pdf.getPage(pageNumber);

      const content = await page.getTextContent();

      const text = content.items
        .map((item) => item.str)
        .join(" ");

      pages.push({
        pageNumber,
        text,
      });
    }

    return pages;
  }

  // Upload PDF
  async function uploadPDF(event) {
    const files = Array.from(event.target.files);

    if (files.length === 0) return;

    setLoading(true);

    for (const file of files) {
      try {
        const pages = await extractPDFText(file);

        const arrayBuffer = await file.arrayBuffer();

        const pdfData = {
          id: Date.now() + Math.random(),
          name: file.name,
          data: arrayBuffer,
          pages,
        };

        await savePDF(pdfData);

        setPdfs((old) => [
          ...old,
          pdfData,
        ]);
      } catch (error) {
        console.error(
          "PDF processing error:",
          error
        );
      }
    }

    setLoading(false);

    event.target.value = "";
  }

  // Search
  function searchPDFs() {
    if (!question.trim()) {
      alert("Please type a question.");
      return;
    }

    if (pdfs.length === 0) {
      alert("Please upload a PDF first.");
      return;
    }

    const words = question
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2);

    const matches = [];

    pdfs.forEach((pdf) => {
      pdf.pages.forEach((page) => {
        const text = page.text.toLowerCase();

        let score = 0;

        words.forEach((word) => {
          if (text.includes(word)) {
            score++;
          }
        });

        if (score > 0) {
          matches.push({
            pdf,
            pageNumber: page.pageNumber,
            text: page.text,
            score,
          });
        }
      });
    });

    matches.sort(
      (a, b) => b.score - a.score
    );

    setResults(
      matches.slice(0, 10)
    );

    if (matches.length === 0) {
      alert(
        "No related content found."
      );
    }
  }

  // Open PDF page
  function openPage(pdf, pageNumber) {
    const blob = new Blob(
      [pdf.data],
      {
        type: "application/pdf",
      }
    );

    const url =
      URL.createObjectURL(blob);

    window.open(
      `${url}#page=${pageNumber}`,
      "_blank"
    );
  }

  // Delete PDF
  async function deletePDF(id) {
    const confirmDelete =
      window.confirm(
        "Delete this PDF?"
      );

    if (!confirmDelete) return;

    await removePDF(id);

    setPdfs((old) =>
      old.filter(
        (pdf) => pdf.id !== id
      )
    );

    setResults((old) =>
      old.filter(
        (result) =>
          result.pdf.id !== id
      )
    );
  }

  return (
    <div className="app">

      <header className="header">
        <h1>
          📚 Smart PDF Finder
        </h1>

        <p>
          Search questions inside
          your PDF library
        </p>
      </header>

      <main>

        <section className="search-box">

          <input
            type="text"
            placeholder="🔍 Type your question..."
            value={question}
            onChange={(e) =>
              setQuestion(
                e.target.value
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                searchPDFs();
              }
            }}
          />

          <button
            className="search-button"
            onClick={searchPDFs}
          >
            🔎 Search
          </button>

          <label className="scan-button">
  📷 Scan Question

  <input
    type="file"
    accept="image/*"
    capture="environment"
    onChange={scanQuestion}
    hidden
  />
</label>

        </section>

        <section className="actions">

          <label className="upload-button">

            📁 Upload PDF

            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={uploadPDF}
              hidden
            />

          </label>

          {loading && (
            <span className="loading">
              Processing PDF...
            </span>
          )}

        </section>

        {results.length > 0 && (

          <section className="results">

            <h2>
              🔎 Search Results
            </h2>

            {results.map(
              (result, index) => (

                <div
                  className="result-card"
                  key={index}
                >

                  <div className="result-icon">
                    📄
                  </div>

                  <div className="result-info">

                    <h3>
                      {result.pdf.name}
                    </h3>

                    <p>
                      Page{" "}
                      {result.pageNumber}
                    </p>

                    <p className="preview">
                      {result.text.substring(
                        0,
                        300
                      )}
                      {result.text.length >
                      300
                        ? "..."
                        : ""}
                    </p>

                  </div>

                  <button
                    className="open-button"
                    onClick={() =>
                      openPage(
                        result.pdf,
                        result.pageNumber
                      )
                    }
                  >
                    Open Page
                  </button>

                </div>

              )
            )}

          </section>

        )}

        <section className="library">

          <div className="library-title">

            <h2>
              📚 My PDF Library
            </h2>

            <span>
              {pdfs.length} PDFs
            </span>

          </div>

          {pdfs.length === 0 ? (

            <div className="empty">

              <div className="empty-icon">
                📄
              </div>

              <h3>
                No PDFs yet
              </h3>

              <p>
                Upload your PDFs
                to get started.
              </p>

            </div>

          ) : (

            <div>

              {pdfs.map((pdf) => (

                <div
                  className="pdf-card"
                  key={pdf.id}
                >

                  <div className="pdf-icon">
                    📕
                  </div>

                  <div className="pdf-info">

                    <h3>
                      {pdf.name}
                    </h3>

                    <p>
                      {pdf.pages.length}
                      {" "}pages indexed
                    </p>

                  </div>

                  <button
                    className="open-button"
                    onClick={() =>
                      openPage(pdf, 1)
                    }
                  >
                    Open
                  </button>

                  <button
                    className="delete-button"
                    onClick={() =>
                      deletePDF(pdf.id)
                    }
                  >
                    🗑️
                  </button>

                </div>

              ))}

            </div>

          )}

        </section>

      </main>

    </div>
  );
}

export default App;