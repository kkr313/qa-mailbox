import PageFooter from './PageFooter.jsx';

export default function NotFound({ path }) {
  return (
    <main className="login-screen">
      <section className="login-card not-found" aria-labelledby="not-found-title">
        <div className="not-found-code" aria-hidden="true">404</div>
        <div>
          <h1 id="not-found-title">Page not found</h1>
          <p>
            <span className="not-found-path">{path}</span> is not a valid QA Mailbox page.
          </p>
        </div>
        <nav className="not-found-actions" aria-label="Valid pages">
          <a className="primary-link" href="/">Mailbox</a>
          <a className="ghost-link" href="/all">All mail</a>
        </nav>
      </section>
      <PageFooter />
    </main>
  );
}