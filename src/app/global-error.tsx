"use client";

/**
 * The last resort, for a failure in the root layout itself. It replaces the
 * whole page, so it brings its own document and plain styles.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f7f9", color: "#1f2933" }}>
        <main style={{ maxWidth: 480, margin: "15vh auto 0", padding: "0 16px" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>byTeam could not start</h1>
          <p style={{ color: "#52606d", lineHeight: 1.5 }}>
            Something went wrong while loading the page. Nothing you entered was lost. Try again in a moment, and if it keeps
            happening, tell whoever looks after byTeam.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ background: "#1E6B52", color: "#fff", border: 0, borderRadius: 6, padding: "10px 16px", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
